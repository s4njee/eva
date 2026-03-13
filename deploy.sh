#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "▸ Building..."
npx vite build

echo "▸ Syncing site files..."
aws s3 sync dist/ s3://s8njee.com/ --delete --exclude ".DS_Store"

echo "▸ Invalidating CloudFront..."
aws cloudfront create-invalidation --distribution-id E1AQDGH3QM4XK1 --paths "/*"

echo "✓ Deployed to s8njee.com"
