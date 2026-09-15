import { listPublicServices } from "../models/Service.js";

export function getPublicServices(_req, res) {
  try {
    res.json({ services: listPublicServices() });
  } catch (err) {
    console.error("Failed to load services:", err);
    res.status(500).json({ error: "Failed to load services" });
  }
}
