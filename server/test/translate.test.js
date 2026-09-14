import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  splitTranslateChunks,
  translateEnglishToArabic,
} from "../src/services/translate.js";

describe("English to Arabic translation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("splits long descriptions on line boundaries", () => {
    const line = "✓ Fast Activation and reliable streaming service details";
    const text = Array.from({ length: 12 }, () => line).join("\n");
    const chunks = splitTranslateChunks(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 450));
    assert.equal(chunks.join("\n"), text);
  });

  it("uses the next free provider when MyMemory returns a quota warning", async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("mymemory")) {
        return {
          ok: true,
          json: async () => ({
            responseData: {
              translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY",
            },
          }),
        };
      }
      if (String(url).includes("lingva.ml")) {
        return {
          ok: true,
          json: async () => ({ translation: "شاشة مشتركة مميزة" }),
        };
      }
      return { ok: false, status: 429, json: async () => ({}) };
    };

    const text = await translateEnglishToArabic("Premium Shared Screen");
    assert.equal(text, "شاشة مشتركة مميزة");
    assert.ok(calls.some((url) => url.includes("translate.googleapis.com")));
    assert.ok(calls.some((url) => url.includes("lingva.ml")));
  });

  it("parses Google gtx segments for a service description", async () => {
    globalThis.fetch = async (url) => {
      if (!String(url).includes("translate.googleapis.com")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => [
          [
            ["وصول بشاشة مشتركة", "Shared Screen Access"],
            ["\nملف شخصي مخصص", "Dedicated Profile"],
          ],
        ],
      };
    };

    const text = await translateEnglishToArabic(
      "Shared Screen Access\nDedicated Profile",
    );
    assert.match(text, /وصول/);
    assert.match(text, /ملف/);
  });

  it("fails only after every free provider is unavailable", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await assert.rejects(
      () => translateEnglishToArabic("Streaming Bundle"),
      /Translate HTTP 503|unavailable/i,
    );
  });
});
