# Update log

## 2026-05-29 · v2 PR#2 — UI/UX 全面 refresh（UU 主導）

**改動範圍**：整個視覺與交互語言由 GitHub-blue dark minimal 升級到接近 iOS Contacts.app 質感。

| 範疇 | 改動 |
|---|---|
| **設計 tokens** | 引入 `:root` CSS 變量：`--accent: #0a84ff`（iOS system blue）+ bg / border / text 全套；`.card` border-radius 14 → 18；`.modal-sheet` 18 → 24；`.field` focus 用新 accent + soft shadow |
| **Header 摺疊** | 三個 icon 按鈕（🔍 / 🏷️ / ⋯）+ 標題；搜尋輸入由預設可見 → 撳 🔍 slide-down 展開、auto focus；狀態存 sessionStorage；收起時自動清 query |
| **FAB speed-dial** | 由「上下兩個 button」變單個 60×60 圓 `＋` FAB；撳開展兩個 sub（📷 影名片／➕ 手動加）；撳屏幕其他位即收合；旋轉 45° 表示 expanded |
| **左手模式** | 設定入面 toggle、寫 localStorage；FAB 位置由 right-18 → left-18 對換 |
| **Contact 列表** | 「睇」按鈕換成 `›` chevron；avatar bg 用 `hashColor(name)` 決定性 HSL（每人獨特色）；avatar 角落小 badge = industry emoji（⚖️ 法律／💻 科技／💰 金融 等 15 個 mapping）；padding `p-3` → `p-3.5` |
| **Tag bar 分組** | 按 namespace 拆組（行業／地區／職位／渠道／自由）+ 每組 group label + 每組獨立顏色（藍／綠／紫／橙／灰）；chip 加 `scroll-snap-align: start` 補返 snap |
| **長按 quick-action** | 列表 row 長按 500ms → 震動 + floating menu（📞 打／✉️ Email／📥 加入手機通訊錄／👁️ 睇詳情）；touchmove 即取消、唔同 scroll 衝突；desktop `contextmenu` 都 cover |
| **Modal sticky 修** | 編輯／詳情 modal 頂部 bar 由 inline `sticky top-0` + 重複 bg 改成統一 `.modal-bar` class（border-bottom + sticky 對 modal-sheet 個 scroll context）；冇再雙影 |
| **編輯 quick-jump** | 左側豎條 6 個 anchor（A／📞／✉／📍／📝／🏷）撳即 smooth scroll 到 section；長 form 易迷失問題解決 |
| **空 state 重畫** | inline SVG 線稿名片插圖 + 大型「📷 影第一張」primary button（直接 trigger camera input） |
| **詳情 modal 頭** | 加埋小 avatar + industry badge、提升身份識別 |

**SW VERSION bump** `v3` → `v4-2026-05-29-ui-refresh`，確保用戶拎到新 client code。

**Verify**：
- iPhone Safari 開 → 應見新 accent blue / 大圓角 / 摺起頭部
- 撳 🔍 → search input slide-down、auto focus；再撳 → 收起並清 query
- 撳 `＋` FAB → 兩個 sub 彈出、旋轉變 ×
- list row 長按 → 震動 + quick-menu
- 撳 📞 → 直接 dial、撳 ✉️ → mailto、撳 📥 → 落 vcf
- 編輯 modal scroll 落底 → header 仍 visible、唔再重影
- 設定 → toggle 左手模式 → FAB 跳左下角

**未做**（押後）：splash images per device class、virtual scroll（1000+ contacts 先需要）。

---

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
