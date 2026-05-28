# Update log

## 2026-05-28 · v1 scaffold

**任務**：主公私人商用聯絡本 — 影名片 → OCR → Firestore sync。

**Stack**：vanilla HTML + Tailwind CDN + Firebase v9 compat + GitHub Pages + Cloudflare DNS。Pattern 同 fukuoka / money 一致。

**Gap audit 決定**：

1. Subdomain → `contacts.wicalyu.com`（`cards` 已被 taiwan-card-shops 佔）
2. Storage → Firebase Firestore + Storage（跨機 sync）
3. OCR proxy → Firebase Function（key 唔出 browser）
4. Gemini key → 主公 paste 新 key，deploy 時用 `firebase functions:secrets:set` 直入 Secret Manager
5. Authz → 單一 owner email allowlist；rules 雙閘 `email_verified` + email match + `auth.uid == path uid`

**Shipped scaffold**：
- `index.html` — full app (auth gate / list / search / tag / camera capture / OCR call / editor / vCard export / settings)
- `firebase.json` + `firestore.rules` + `storage.rules` — rules 對齊 OWNER_EMAILS
- `functions/index.js` — `ocr` HTTPS endpoint，Gemini 2.5 Flash w/ responseSchema + ID-token verify + email gate
- `functions/package.json` — node 20, firebase-functions v6, firebase-admin v12
- PWA: `manifest.webmanifest` + `sw.js` + `icon.svg`
- `CNAME` (contacts.wicalyu.com)
- `.firebaserc` 等 deploy script 填 project ID

**Placeholder 仲未填**（deploy 前要 sed 替換）：
- `__OWNER_EMAIL__` — 主公個 Gmail (在 firestore.rules / storage.rules / functions/index.js)
- `__FIREBASE_PROJECT__` / `__FIREBASE_API_KEY__` / `__FIREBASE_APP_ID__` — 在 index.html
- `__OCR_URL__` — 在 index.html，deploy Function 後出

**Pending**：
- Firebase project create (`wicalyu-contacts` 或 reuse)
- Gemini key 落 Secret Manager
- Deploy rules + Storage + Function
- GitHub repo create + push + Pages enable
- Cloudflare DNS CNAME add (主公手動 in dashboard，or Cloudflare API token)
- wicalyu-home PROJECTS array add line
- 真機 verify (browser camera + sample card)
