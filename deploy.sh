#!/usr/bin/env bash
# contacts deploy helper — 填 placeholder → firebase deploy → output OCR URL
# Usage: OWNER_EMAIL=... FIREBASE_PROJECT=... ./deploy.sh
set -euo pipefail

: "${OWNER_EMAIL:?need OWNER_EMAIL=you@gmail.com}"
: "${FIREBASE_PROJECT:?need FIREBASE_PROJECT=wicalyu-contacts (or your id)}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[1/5] sed placeholders → OWNER=$OWNER_EMAIL PROJECT=$FIREBASE_PROJECT"
# rules / function — server-side authz, must match exactly
for f in firestore.rules storage.rules functions/index.js .firebaserc; do
  sed -i.bak "s|__OWNER_EMAIL__|$OWNER_EMAIL|g; s|__FIREBASE_PROJECT__|$FIREBASE_PROJECT|g" "$f"
  rm -f "$f.bak"
done

echo "[2/5] firebase use $FIREBASE_PROJECT"
firebase use "$FIREBASE_PROJECT"

echo "[3/5] deploy rules + storage + function"
firebase deploy --only firestore:rules,storage,functions --non-interactive

echo "[4/5] resolve OCR Function URL"
OCR_URL=$(firebase functions:list 2>/dev/null | grep -oE 'https://[^ ]+/ocr' | head -1 || true)
if [ -z "$OCR_URL" ]; then
  # v2 onRequest format: https://<region>-<project>.cloudfunctions.net/<fn>
  OCR_URL="https://asia-east1-${FIREBASE_PROJECT}.cloudfunctions.net/ocr"
  echo "  (defaulted to convention: $OCR_URL — verify in Firebase Console)"
fi

echo "[5/5] write OCR URL into index.html"
sed -i.bak "s|__OCR_URL__|$OCR_URL|g" index.html
rm -f index.html.bak

echo "✓ done. Now: git add . && git commit && git push  (Pages serves the file)"
echo "  OCR endpoint: $OCR_URL"
