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

**Shipped 完整 stack（同日 EOD）**：

| | |
|---|---|
| Firebase project | `wicalyu-contacts` — owner `wical.yu@masterconcept.ai`, billing `wicalmox` linked through `yuwaiho112@gmail.com` (cross-account: `roles/billing.projectManager` grant 解 `ORG_MUST_INVITE_EXTERNAL_OWNERS` 阻擋) |
| Firestore + Storage | `asia-east1`, default DB, default bucket via Firebase REST `defaultBucket` (gcloud storage 直開會 503 — domain ownership 問題) |
| Functions | `ocr(asia-east1)` Gen 2, 512MiB, 60s timeout, `GEMINI_API_KEY` Secret Manager |
| Auth | Google Sign-In (Firebase Console 一 click 啟動 — OAuth client 仍然係 Firebase auto-provisioned 唯一 manual step) |
| Authorized domains | localhost · contacts.wicalyu.com · wical112.github.io · wicalyu-contacts.{firebaseapp,web}.app |
| Repo | github.com/wical112/contacts (public, noindex / no-referrer) |
| DNS | Cloudflare CNAME `contacts → wical112.github.io` (DNS-only / grey cloud) |
| HTTPS | Pages cert ⏳ pending（GitHub 慢 issue；HTTP 已通，Firebase popup 用 firebaseapp.com 自己 HTTPS） |
| 真機 verify | 主公 sign in + OCR 抽 Tech Data 卡片 (mobile/fax/email/addr/notes/tag) — 全部正確；rule fix v2 後 Save 應通 |

**生產時揾出 2 個 bug fix（已 patch）**：

1. **Rules `email_verified` claim 唔一致** — Admin SDK `verifyIdToken` decode 出 `email_verified=true`（所以 Function gate 通過），但 Firestore/Storage Rules engine 對 Google Sign-In 嘅 ID token 讀 `request.auth.token.email_verified` 唔一定 surface 做 true → Storage upload `storage/unauthorized`。**Fix**：drop `email_verified` gate（Google OAuth email 本身已驗、再加 email allowlist 安全等價）。Firestore / Storage / Function 三邊一齊 patch + redeploy。
2. **`firebase deploy --only functions` 第一次撞 transient `secretmanager.googleapis.com` 503** — retry 即 work。Secret Manager API 剛啟用後嘅 propagation race。

**仲待**：
- HTTPS cert issue（被動等 GitHub，已 bounce 一次 Pages config）
- 主公 Revoke 嗰個 Cloudflare API token（已用完）
