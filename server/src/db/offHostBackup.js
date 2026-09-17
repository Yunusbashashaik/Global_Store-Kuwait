import { catalogMatchesDefaults, snapshotHasCustomCatalog } from "./adminSnapshot.js";

const DEFAULT_OWNER = "Yunusbashashaik";
const DEFAULT_REPO = "Global_Store-Kuwait";
const DEFAULT_PATH = "catalog-backup/admin-state.json";
const DEFAULT_BACKUP_PATH = "catalog-backup/admin-state.backup.json";
const DEFAULT_BRANCH = "main";
const FETCH_MS = 15_000;

export function defaultRawBackupUrl(owner = DEFAULT_OWNER, repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, pathName = DEFAULT_PATH) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathName}`;
}

let testHook = null;
let lastStatus = {
  configured: false,
  restoredThisBoot: false,
  savedAt: null,
  restoredSavedAt: null,
  lastError: null,
  source: null,
  pushed: false,
};

export function setOffHostBackupTestHook(hook) {
  testHook = hook || null;
}

export function resetOffHostBackupStatus() {
  lastStatus = {
    configured: false,
    restoredThisBoot: false,
    savedAt: null,
    restoredSavedAt: null,
    lastError: null,
    source: null,
    pushed: false,
  };
}

export function getOffHostBackupStatus() {
  return {
    ...lastStatus,
    configured: getOffHostBackupConfig().configured,
  };
}

function isTestProcess() {
  if (process.env.NODE_ENV === "test") return true;
  return process.argv.some((arg) => /(^|[\\/])test[\\/]|\.test\.js$/.test(String(arg)));
}

export function getOffHostBackupConfig() {
  const token =
    process.env.CATALOG_BACKUP_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    "";
  const url = process.env.CATALOG_BACKUP_URL || "";
  const repoSpec =
    process.env.CATALOG_BACKUP_REPO || process.env.GITHUB_REPOSITORY || "";
  let owner = process.env.CATALOG_BACKUP_OWNER || DEFAULT_OWNER;
  let repo = DEFAULT_REPO;
  if (repoSpec.includes("/")) {
    const [parsedOwner, parsedRepo] = repoSpec.split("/");
    if (parsedOwner) owner = parsedOwner;
    if (parsedRepo) repo = parsedRepo;
  } else if (repoSpec) {
    repo = repoSpec;
  }
  const pathName = process.env.CATALOG_BACKUP_PATH || DEFAULT_PATH;
  const backupPath = process.env.CATALOG_BACKUP_BACKUP_PATH || DEFAULT_BACKUP_PATH;
  const branch = process.env.CATALOG_BACKUP_BRANCH || DEFAULT_BRANCH;
  const disabled = process.env.CATALOG_BACKUP_DISABLE === "1";
  const defaultUrl = defaultRawBackupUrl(owner, repo, branch, pathName);
  const defaultBackupUrl = defaultRawBackupUrl(owner, repo, branch, backupPath);
  const readUrl = url || (disabled ? "" : defaultUrl);
  const usingDefaultRaw = Boolean(!url && readUrl);
  const githubOk =
    Boolean(token) &&
    !disabled &&
    (!isTestProcess() || process.env.CATALOG_BACKUP_ALLOW_NETWORK === "1");
  const rawReadEnabled =
    Boolean(readUrl) &&
    !disabled &&
    (!isTestProcess() || Boolean(url) || process.env.CATALOG_BACKUP_ALLOW_NETWORK === "1");
  return {
    token: token || "",
    owner,
    repo,
    path: pathName,
    backupPath,
    branch,
    url: readUrl,
    defaultUrl,
    defaultBackupUrl,
    usingDefaultRaw,
    configured: Boolean(testHook || githubOk || (!disabled && readUrl)),
    pushConfigured: Boolean(testHook?.save || githubOk),
    githubEnabled: githubOk,
    rawReadEnabled,
  };
}

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GlobalStore-Kuwait-CatalogBackup",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function encodeContentPath(filePath) {
  return String(filePath)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function parseSnapshotPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const services = Array.isArray(parsed.services) ? parsed.services : null;
  if (!services) return null;
  return {
    version: parsed.version || 1,
    savedAt: parsed.savedAt || parsed.exportedAt || null,
    services,
    settings:
      parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
  };
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function githubGetFile(config, filePath) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeContentPath(filePath)}?ref=${encodeURIComponent(config.branch)}`;
  const res = await timedFetch(url, { headers: githubHeaders(config.token) });
  if (res.status === 404) return { missing: true, sha: null, parsed: null };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub GET ${res.status} ${text.slice(0, 180)}`);
  }
  const body = await res.json();
  const raw = Buffer.from(String(body.content || "").replace(/\n/g, ""), "base64").toString(
    "utf8",
  );
  return {
    missing: false,
    sha: body.sha || null,
    parsed: parseSnapshotPayload(JSON.parse(raw)),
  };
}

async function githubPutFile(config, filePath, payload, sha) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeContentPath(filePath)}`;
  const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8").toString(
    "base64",
  );
  const body = {
    message: `chore: update ${filePath} catalog backup`,
    content,
    branch: config.branch,
  };
  if (sha) body.sha = sha;
  const res = await timedFetch(url, {
    method: "PUT",
    headers: {
      ...githubHeaders(config.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub PUT ${res.status} ${text.slice(0, 180)}`);
  }
  const json = await res.json().catch(() => ({}));
  return json.content?.sha || sha || null;
}

async function loadFromUrl(url) {
  const res = await timedFetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GlobalStore-Kuwait-CatalogBackup" },
  });
  if (!res.ok) throw new Error(`CATALOG_BACKUP_URL HTTP ${res.status}`);
  return parseSnapshotPayload(await res.json());
}

export async function loadOffHostBackup() {
  const config = getOffHostBackupConfig();
  lastStatus.configured = config.configured;
  try {
    if (testHook?.load) {
      const parsed = parseSnapshotPayload(await testHook.load());
      lastStatus.source = "test-hook";
      lastStatus.savedAt = parsed?.savedAt || null;
      lastStatus.lastError = null;
      return parsed;
    }
    if (config.githubEnabled) {
      const primary = await githubGetFile(config, config.path);
      if (primary.parsed?.services?.length) {
        lastStatus.source = "github";
        lastStatus.savedAt = primary.parsed.savedAt || null;
        lastStatus.lastError = null;
        return primary.parsed;
      }
      const backup = await githubGetFile(config, config.backupPath);
      if (backup.parsed?.services?.length) {
        lastStatus.source = "github-backup";
        lastStatus.savedAt = backup.parsed.savedAt || null;
        lastStatus.lastError = null;
        return backup.parsed;
      }
    }
    if (config.rawReadEnabled && config.url) {
      const parsed = await loadFromUrl(config.url);
      if (parsed?.services?.length) {
        lastStatus.source = config.usingDefaultRaw ? "github-raw" : "url";
        lastStatus.savedAt = parsed.savedAt || null;
        lastStatus.lastError = null;
        return parsed;
      }
      if (config.usingDefaultRaw && config.defaultBackupUrl) {
        const backup = await loadFromUrl(config.defaultBackupUrl);
        if (backup?.services?.length) {
          lastStatus.source = "github-raw-backup";
          lastStatus.savedAt = backup.savedAt || null;
          lastStatus.lastError = null;
          return backup;
        }
      }
    }
    lastStatus.source = null;
    lastStatus.lastError = config.configured ? "offhost-empty" : "not-configured";
    return null;
  } catch (err) {
    lastStatus.lastError = err?.message || String(err);
    lastStatus.source = null;
    console.error("Off-host catalog backup load failed:", lastStatus.lastError);
    return null;
  }
}

export async function saveOffHostBackup(state) {
  const services = Array.isArray(state?.services) ? state.services : [];
  if (!services.length || catalogMatchesDefaults(services)) {
    return { pushed: false, reason: services.length ? "skip-factory" : "skip-empty" };
  }
  const payload = {
    version: 1,
    savedAt: state.savedAt || new Date().toISOString(),
    services,
    settings: state.settings && typeof state.settings === "object" ? state.settings : {},
  };
  const config = getOffHostBackupConfig();
  lastStatus.configured = config.configured;
  try {
    if (testHook?.save) {
      await testHook.save(payload);
      lastStatus.pushed = true;
      lastStatus.lastError = null;
      lastStatus.source = "test-hook";
      if (!lastStatus.restoredThisBoot) lastStatus.savedAt = payload.savedAt;
      return { pushed: true, reason: "test-hook" };
    }
    if (!config.githubEnabled) {
      return { pushed: false, reason: "no-token" };
    }
    const existing = await githubGetFile(config, config.path).catch(() => ({
      missing: true,
      parsed: null,
      sha: null,
    }));
    if (existing.parsed && snapshotHasCustomCatalog(existing.parsed) && catalogMatchesDefaults(services)) {
      return { pushed: false, reason: "keep-remote-custom" };
    }
    const sha = existing.missing ? null : existing.sha;
    await githubPutFile(config, config.path, payload, sha);
    const backupExisting = await githubGetFile(config, config.backupPath).catch(() => ({
      missing: true,
      sha: null,
    }));
    await githubPutFile(
      config,
      config.backupPath,
      payload,
      backupExisting.missing ? null : backupExisting.sha,
    );
    lastStatus.pushed = true;
    if (!lastStatus.restoredThisBoot) lastStatus.savedAt = payload.savedAt;
    lastStatus.lastError = null;
    lastStatus.source = "github";
    return { pushed: true, reason: "github" };
  } catch (err) {
    lastStatus.lastError = err?.message || String(err);
    lastStatus.pushed = false;
    console.error("Off-host catalog backup save failed:", lastStatus.lastError);
    return { pushed: false, reason: lastStatus.lastError };
  }
}

export function markOffHostRestored(savedAt) {
  lastStatus.restoredThisBoot = true;
  lastStatus.restoredSavedAt = savedAt || lastStatus.savedAt;
  lastStatus.savedAt = lastStatus.restoredSavedAt;
}

let pendingPush = Promise.resolve();

export function queueOffHostBackup(state) {
  pendingPush = pendingPush
    .then(() => saveOffHostBackup(state))
    .catch((err) => {
      console.error("Off-host catalog backup queue failed:", err?.message || err);
      return { pushed: false, reason: err?.message || "queue-failed" };
    });
  return pendingPush;
}

export function waitForOffHostBackup() {
  return pendingPush;
}
