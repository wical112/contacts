/**
 * contacts — OCR proxy
 *
 * Browser POST { image: <base64>, mime: "image/jpeg" } + Bearer ID token →
 *   verify Firebase ID token → email 喺 OWNER_EMAILS → call Gemini 2.5 Flash
 *   with responseSchema → return structured JSON.
 *
 * GEMINI_API_KEY 由 Firebase Functions secret 注入（never echoed, never logged）。
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-east1", maxInstances: 5 });

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// 同 firestore.rules / storage.rules 對齊 — deploy 腳本會替換
const OWNER_EMAILS = ["yuwaiho112@gmail.com"];

const SCHEMA = {
  type: "object",
  properties: {
    name:    { type: "string", description: "Person's full name" },
    title:   { type: "string", description: "Job title / position" },
    company: { type: "string", description: "Company / organization" },
    phones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "e.g. mobile / office / fax" },
          value: { type: "string", description: "Digits + plus, keep original formatting" }
        }
      }
    },
    emails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" }
        }
      }
    },
    addresses: { type: "array", items: { type: "string" } },
    websites:  { type: "array", items: { type: "string" } },
    notes:     { type: "string", description: "Anything else printed on card e.g. WeChat ID, slogan" },
    tags:      { type: "array", items: { type: "string" }, description: "Empty unless industry obviously inferable" }
  }
};

const PROMPT = [
  "You are extracting structured contact info from a business card photo.",
  "Return ONLY the JSON object matching the schema. Do not invent data.",
  "If a field is not visible / unreadable, omit it (empty string or empty array).",
  "Preserve original phone formatting incl. country code if shown.",
  "Multilingual cards: prefer the script the cardholder's name is printed in.",
  "Do NOT auto-tag — leave `tags` empty unless industry is unambiguous."
].join("\n");

exports.ocr = onRequest(
  { secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") return res.status(204).end();
      if (req.method !== "POST")    return res.status(405).json({ error: "POST only" });

      // ----- Auth -----
      const authHeader = req.get("authorization") || "";
      const m = authHeader.match(/^Bearer (.+)$/);
      if (!m) return res.status(401).json({ error: "missing bearer token" });
      let decoded;
      try { decoded = await admin.auth().verifyIdToken(m[1]); }
      catch (e) { return res.status(401).json({ error: "invalid token" }); }

      // Google Sign-In 嘅 email 本身已由 Google 驗過 → 唔再 gate email_verified
      if (!decoded.email || !OWNER_EMAILS.includes(decoded.email)) {
        return res.status(403).json({ error: "not in owner allowlist" });
      }

      // ----- Body -----
      const { image, mime } = req.body || {};
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "image (base64) required" });
      }
      if (image.length > 8 * 1024 * 1024) { // ~6MB after base64 decode
        return res.status(413).json({ error: "image too large (max ~6MB decoded)" });
      }
      const contentType = (mime && /^image\//.test(mime)) ? mime : "image/jpeg";

      // ----- Gemini call -----
      const apiKey = GEMINI_API_KEY.value();
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
      const body = {
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: contentType, data: image } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.1
        }
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const txt = await r.text().catch(()=>"");
        console.error("gemini error", r.status, txt.slice(0,400));
        return res.status(502).json({ error: "gemini call failed", status: r.status });
      }
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(502).json({ error: "empty gemini response" });
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { return res.status(502).json({ error: "gemini returned non-JSON", raw: text.slice(0,400) }); }

      return res.json(parsed);
    } catch (e) {
      console.error("ocr handler", e);
      return res.status(500).json({ error: "internal" });
    }
  }
);
