/**
 * contacts — Gemini-powered OCR + enrich endpoints
 *
 * Endpoints:
 *  - POST /ocr     { image: <base64>, mime: "image/jpeg" }
 *                  → Vision call: 抽 name/title/company/phones/emails/addresses/websites/notes
 *                    + 4 個 controlled-vocab enum tag arrays
 *  - POST /enrich  { name, title, company, notes }
 *                  → Text-only call: 只派 4 個 enum tag arrays（為舊資料補 tag、唔重 OCR）
 *
 * 共通 gate：Firebase ID token bearer + email in OWNER_EMAILS。
 * Secret：GEMINI_API_KEY 由 Firebase Functions secret 注入。
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

/* ---------- Controlled vocabulary（4 個 tag 維度） ---------- */
const VOCAB = {
  industries: [
    "finance", "legal", "tech", "healthcare", "education",
    "manufacturing", "retail", "hospitality", "media", "government",
    "consulting", "realestate", "logistics", "marketing", "ngo"
  ],
  regions:    ["hk", "cn", "tw", "asia", "global"],
  seniority:  ["c-level", "director", "manager", "specialist", "junior"],
  channels:   ["wechat", "telegram", "whatsapp", "line", "linkedin"]
};

/* ---------- Gemini 結構化輸出 schema ---------- */
const OCR_SCHEMA = {
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
          value: { type: "string", description: "Keep original formatting incl. country code" }
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
    notes:     { type: "string", description: "Other printed info e.g. WeChat ID, slogan, motto" },
    industries: { type: "array", items: { type: "string", enum: VOCAB.industries } },
    regions:    { type: "array", items: { type: "string", enum: VOCAB.regions } },
    seniority:  { type: "array", items: { type: "string", enum: VOCAB.seniority } },
    channels:   { type: "array", items: { type: "string", enum: VOCAB.channels } }
  }
};

// Text-only enrich schema — 同 OCR 嘅 enum 4 個 array
const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    industries: { type: "array", items: { type: "string", enum: VOCAB.industries } },
    regions:    { type: "array", items: { type: "string", enum: VOCAB.regions } },
    seniority:  { type: "array", items: { type: "string", enum: VOCAB.seniority } },
    channels:   { type: "array", items: { type: "string", enum: VOCAB.channels } }
  }
};

const TAG_GUIDE = `
Tag rules (return empty array if unsure — wrong tag is worse than no tag):
- industries: 從 company + title 推；e.g. 律師事務所 → legal、SaaS company → tech、銀行/保險 → finance、醫院/診所 → healthcare、大學/學校 → education、工廠 → manufacturing、零售品牌 → retail、酒店/餐飲 → hospitality、傳媒/廣告 → media、政府部門 → government、顧問公司 → consulting、地產 → realestate、物流/航運 → logistics、market 推廣公司 → marketing、慈善/NGO → ngo
- regions: hk = 香港地址或 +852 電話；cn = 中國大陸或 +86；tw = 台灣或 +886；asia = 其他亞洲地區；global = 跨國
- seniority: c-level = CEO/CFO/COO/CTO/Founder/Managing Partner/總裁/董事總經理；director = Director/總監/Head of/VP；manager = Manager/經理/主管；specialist = Senior Engineer/Lead/資深/專員；junior = Analyst/Associate/Junior/助理
- channels: 只有 notes 文字明確抽到 ID（e.g. "WeChat: abc123" / "WhatsApp: ..." / "Line: ..."）先派；純電話號碼唔算 WhatsApp；LinkedIn URL 喺 websites 入面唔算 channel
寧可留空、唔好亂派；conservative > aggressive。
`;

const OCR_PROMPT = `You are extracting structured contact info from a business card photo.
Return ONLY the JSON object matching the schema. Do not invent data.
If a field is not visible / unreadable, omit it (empty string or empty array).
Preserve original phone formatting incl. country code if shown.
Multilingual cards: prefer the script the cardholder's name is printed in.

${TAG_GUIDE}`;

const ENRICH_PROMPT = `You are categorizing an existing business contact for indexing.
Given the contact's name / title / company / notes, return ONLY the 4 enum arrays.
Be conservative — empty array if not clearly inferable.

${TAG_GUIDE}`;

/* ---------- Helpers ---------- */
async function verifyOwner(req) {
  const authHeader = req.get("authorization") || "";
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) return { err: { status: 401, body: { error: "missing bearer token" } } };
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1]); }
  catch { return { err: { status: 401, body: { error: "invalid token" } } }; }
  if (!decoded.email || !OWNER_EMAILS.includes(decoded.email)) {
    return { err: { status: 403, body: { error: "not in owner allowlist" } } };
  }
  return { decoded };
}

// 嚴格 enum allow-list filter（防 model hallucinate）
function filterEnum(arr, allowed) {
  if (!Array.isArray(arr)) return [];
  const set = new Set(allowed);
  return [...new Set(arr.filter(v => typeof v === "string" && set.has(v)))];
}
function sanitizeTags(d) {
  return {
    industries: filterEnum(d?.industries, VOCAB.industries),
    regions:    filterEnum(d?.regions,    VOCAB.regions),
    seniority:  filterEnum(d?.seniority,  VOCAB.seniority),
    channels:   filterEnum(d?.channels,   VOCAB.channels)
  };
}

async function callGemini(apiKey, parts, schema) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
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
    throw Object.assign(new Error("gemini call failed"), { status: 502, gemini: r.status });
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw Object.assign(new Error("empty gemini response"), { status: 502 });
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("non-JSON gemini response"), { status: 502, raw: text.slice(0,400) }); }
}

/* ---------- /ocr endpoint ---------- */
exports.ocr = onRequest(
  { secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") return res.status(204).end();
      if (req.method !== "POST")    return res.status(405).json({ error: "POST only" });

      const auth = await verifyOwner(req);
      if (auth.err) return res.status(auth.err.status).json(auth.err.body);

      const { image, mime } = req.body || {};
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "image (base64) required" });
      }
      if (image.length > 8 * 1024 * 1024) {
        return res.status(413).json({ error: "image too large (max ~6MB decoded)" });
      }
      const contentType = (mime && /^image\//.test(mime)) ? mime : "image/jpeg";

      const parsed = await callGemini(
        GEMINI_API_KEY.value(),
        [
          { text: OCR_PROMPT },
          { inlineData: { mimeType: contentType, data: image } }
        ],
        OCR_SCHEMA
      );

      // 4 個 enum array 做 allow-list filter；其他 field 原 pass
      const tags = sanitizeTags(parsed);
      return res.json({
        name:    typeof parsed.name === "string" ? parsed.name : "",
        title:   typeof parsed.title === "string" ? parsed.title : "",
        company: typeof parsed.company === "string" ? parsed.company : "",
        phones:    Array.isArray(parsed.phones) ? parsed.phones : [],
        emails:    Array.isArray(parsed.emails) ? parsed.emails : [],
        addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
        websites:  Array.isArray(parsed.websites) ? parsed.websites : [],
        notes:   typeof parsed.notes === "string" ? parsed.notes : "",
        ...tags
      });
    } catch (e) {
      console.error("ocr handler", e);
      return res.status(e.status || 500).json({ error: e.message || "internal" });
    }
  }
);

/* ---------- /enrich endpoint （text-only、為舊資料補 tag） ---------- */
exports.enrich = onRequest(
  { secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") return res.status(204).end();
      if (req.method !== "POST")    return res.status(405).json({ error: "POST only" });

      const auth = await verifyOwner(req);
      if (auth.err) return res.status(auth.err.status).json(auth.err.body);

      const { name = "", title = "", company = "", notes = "" } = req.body || {};
      // 完全 empty 即跳過、慳 quota
      if (!name && !title && !company && !notes) {
        return res.json({ industries:[], regions:[], seniority:[], channels:[] });
      }

      const ctxText = [
        `Name: ${name}`,
        `Title: ${title}`,
        `Company: ${company}`,
        `Notes: ${notes}`
      ].join("\n");

      const parsed = await callGemini(
        GEMINI_API_KEY.value(),
        [{ text: ENRICH_PROMPT + "\n\nContact:\n" + ctxText }],
        ENRICH_SCHEMA
      );

      return res.json(sanitizeTags(parsed));
    } catch (e) {
      console.error("enrich handler", e);
      return res.status(e.status || 500).json({ error: e.message || "internal" });
    }
  }
);
