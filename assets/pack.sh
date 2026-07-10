#!/usr/bin/env bash
# Chrome Web Store package — runtime files only.
# Not packaged: screenshots, promo tiles, social.jpg, logo.png, icons.sh (store/README assets).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${root}/.dev/live-css-queries-${1:-$(jq -r .version "$root/manifest.json")}.zip"
cd "$root"
rm -f "$out"

files=(
  manifest.json
  background.js
  shared.js
  content.js
  content.css
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
  assets/copy.svg
  assets/fonts/baloo-2-latin-600-normal.woff2
  assets/fonts/baloo-2-latin-800-normal.woff2
)

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

zip -q "$out" "${files[@]}"
echo "wrote $out (${#files[@]} files)"
