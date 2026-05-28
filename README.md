# 聯絡簿 · Contacts (private)

私人商用聯絡本 — 影名片 → Gemini Vision OCR → Firestore sync → 加返手機通訊錄。

- **Live**: https://contacts.wicalyu.com
- **Visibility**: noindex / referrer no-referrer / single-owner allowlist
- **Owner**: 主公 only (email-based Firestore + Storage rules)

## Stack

| | |
|---|---|
| Hosting | GitHub Pages (`wical112/contacts` repo) + Cloudflare DNS (CNAME, grey cloud) |
| UI | Vanilla HTML + Tailwind CDN + Firebase v9 compat CDN, no build step |
| Auth | Firebase Google Sign-In, email allowlist |
| DB | Firestore — `/users/{uid}/contacts/{cid}` |
| Storage | Firebase Storage — `/users/{uid}/cards/{cid}.jpg` |
| OCR | Firebase Function (`asia-east1`) proxy → Gemini 2.5 Flash w/ responseSchema |
| Secret | `GEMINI_API_KEY` 喺 Functions Secret Manager (never in repo) |

## 安全姿態

- Firebase web config 係 public-by-design — **真 authz 喺 rules + Function**
- Firestore rule: `email_verified == true` + `email in OWNER_EMAILS` + `auth.uid == path uid`
- Storage rule: 同 firestore + image-only + 4MB cap
- Function: verify Firebase ID token + email allowlist before calling Gemini
- Gemini key: Google Secret Manager via `firebase functions:secrets:set GEMINI_API_KEY`

## Deploy

```sh
# 1. Firebase project + services
firebase projects:create wicalyu-contacts   # 或 reuse
firebase use wicalyu-contacts
firebase deploy --only firestore:rules,storage,functions

# 2. Gemini secret (stdin, never echoed)
firebase functions:secrets:set GEMINI_API_KEY

# 3. GitHub Pages
git push origin main
# enable Pages on default branch root
```

DNS：`contacts` CNAME → `wical112.github.io` (Cloudflare grey cloud — DNS only)。

## 日常用法

| 動作 | 點做 |
|---|---|
| 影名片 | 開 https://contacts.wicalyu.com → 影名片掣 → AI 自動填 → 確認儲存 |
| 搵人 | 頂部 search bar — 名 / 公司 / 電話 / email / tag 都 match |
| 篩 tag | 頂部 🏷️ — 揀一個或多個 tag 收窄 |
| 加入手機通訊錄 | 開個 contact → 「加入手機通訊錄 (.vcf)」→ iOS/Android native 加 |
| 匯出全部 | ⋯ menu → 匯出 JSON / vCard |
| 跨機 sync | 第二部機 sign in 同個 Google 即同步 |

## 加 owner

改 `firestore.rules` / `storage.rules` / `functions/index.js` 嘅 `OWNER_EMAILS` array，redeploy 三條：

```sh
firebase deploy --only firestore:rules,storage,functions
```
