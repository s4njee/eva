#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

: "${CLOUDFLARE_PAGES_PROJECT_NAME:?Set CLOUDFLARE_PAGES_PROJECT_NAME to your Pages project name}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID before deploying}"
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN before deploying}"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "▸ Building..."
npm run build:root

echo "▸ Removing .DS_Store from build output..."
find dist -name '.DS_Store' -delete

echo "▸ Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name "$CLOUDFLARE_PAGES_PROJECT_NAME" --branch "$BRANCH"

echo "✓ Deployed to Cloudflare Pages project $CLOUDFLARE_PAGES_PROJECT_NAME"
