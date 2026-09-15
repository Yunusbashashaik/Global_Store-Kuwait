import fs from "fs/promises";
import path from "path";
import { getDb, getUploadsDir } from "../db/connection.js";
import { getSetting } from "../models/Settings.js";
import { sendComplaintEmail } from "../services/mail.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";

export async function createComplaint(req, res) {
  try {
    const { fullName, phone, subject, details } = req.body;
    const missing = [
      ["fullName", "Full Name", fullName],
      ["phone", "Phone Number", phone],
      ["subject", "Subject", subject],
      ["details", "Complaint Details", details],
    ].find(([, , value]) => !String(value || "").trim());

    if (missing) {
      res.status(400).json({ error: `${missing[1]} is missing.` });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Screenshot is missing." });
      return;
    }

    const ticket = {
      id: `GS-${Date.now()}`,
      fullName: fullName.trim(),
      phone: phone.trim(),
      subject: subject.trim(),
      details: details.trim(),
      screenshotPath: req.file.path,
      originalFilename: req.file.originalname,
      createdAt: new Date().toISOString(),
    };

    getDb()
      .prepare(
        `INSERT INTO complaints (
          id, full_name, phone, subject, details,
          screenshot_path, original_filename, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.id,
        ticket.fullName,
        ticket.phone,
        ticket.subject,
        ticket.details,
        ticket.screenshotPath,
        ticket.originalFilename,
        ticket.createdAt,
      );

    // Keep a JSONL audit trail for operators inspecting the data folder.
    const logPath = path.join(path.dirname(getUploadsDir()), "complaints.jsonl");
    await fs.appendFile(logPath, `${JSON.stringify(ticket)}\n`);

    const complaintEmail = getSetting(
      "complaintEmail",
      DEFAULT_SETTINGS.complaintEmail,
    );
    await sendComplaintEmail(ticket, req.file.path, complaintEmail);

    res.json({ success: true, ticketId: ticket.id });
  } catch (err) {
    console.error("Complaint submission failed:", err);
    res.status(500).json({ error: err.message || "Submission failed" });
  }
}
