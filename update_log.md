# Update log

## 2026-05-29 · v2 PR#1 — iOS PWA 完整化 + 搜索強化

**主公 brief**：upload 一批真實卡片後提出三方向優化：搜索順手啲、數據自動補 tag、UU 整個 UI/UX refresh、打包做 iOS 主畫面 app。Plan 拆做 3 個 PR：

- **PR#1（本次）**：C iOS PWA + A 搜索
- **PR#2**：D UU UI/UX 全面 refresh
- **PR#3**：B Auto-tag enrichment（OCR SCHEMA + text-only enrich endpoint + batch 補舊）

**PR#1 改動**：

| 主線 | 改動 |
|---|---|
| **C iOS PWA** | `index.html` head 補 4 個 Apple meta tag（`apple-mobile-web-app-capable` / `status-bar-style` / `title` / `format-detection`）；apple-touch-icon 由單 SVG 換多尺寸 PNG（180/192/512）；`manifest.webmanifest` 加 `launch_handler: navigate-existing` + `orientation: portrait` + `categories` + icons 多尺寸 PNG（含 maskable）；`sw.js` VERSION bump v3、precache 加 3 個 PNG icon；JS 尾段加 iOS install hint banner（5 秒後 slide-down「撳分享 → 加到主畫面」，dismiss 後 7 日唔再出）。 |
| **A 搜索** | utils block 加 `normPhone` / `normText` / `tokenize` / `emailLocal`；新 `buildSearchIndex()` 喺 Firestore snapshot 時一次預算；新 `scoreMatch(idx, q)` rubric：name prefix 1000、company prefix 700、phone digit substring 500、token prefix 450、any field substring 400、email local prefix 350、無 match 0；`render()` 由純 substring filter 改成 score-based filter + sort by `score, updatedAt`；`#q` input 加 120ms debounce 避免每 keystroke 重 render。 |

**生 PNG icons**：`magick -background "#0e1117" icon.svg -resize NxN icons/icon-N.png` × 4（180/192/512/1024）。Commit binary asset 入 repo、唔靠 deploy 時 build。

**未做**（押後 PR）：
- iOS splash images per device class（5 個 device size）— PR#2 連 visual refresh 一齊
- Apple-touch-icon SVG fallback for older iOS — 暫且只行 PNG

**Verify**：
- iPhone Safari 開 https://contacts.wicalyu.com → 5 秒後 banner 提示
- 加到主畫面 → icon 銳利 PNG
- search「9286」應撞中「+852 9286 6805」（phone normalize）
- search「Mil」應將「Millennium」公司排第一（company prefix > 其他 substring）
- 100 contacts × 連打 5 字 latency < 300ms（debounce + index reuse）

---

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
