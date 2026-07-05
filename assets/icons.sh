#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${1:-$root/assets/logo.png}"
out="$root/icons"
sizes=(16 32 48 128)

mkdir -p "$out"

for size in "${sizes[@]}"; do
  magick "$src" -resize "${size}x${size}" "$out/icon${size}.png"
done

echo "icons: ${sizes[*]}"
