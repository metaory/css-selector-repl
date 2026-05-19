#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() {
  echo "Usage: $(basename "$0") <path-to.svg>" >&2
  exit 1
}

[[ $# -le 1 ]] || usage

src="${1:-$root/assets/logo.svg}"
[[ "$src" = /* ]] || src="$root/$src"
[[ -f "$src" ]] || { echo "SVG not found: $src" >&2; exit 1; }

out="$root/icons"
sizes=(16 32 48 128)
mkdir -p "$out"

render() {
  local size="$1"
  local file="$out/icon${size}.png"
  command -v inkscape >/dev/null && inkscape "$src" -w "$size" -h "$size" -o "$file" >/dev/null 2>&1 && return
  command -v rsvg-convert >/dev/null && rsvg-convert -w "$size" -h "$size" "$src" -o "$file" && return
  echo "Need inkscape or rsvg-convert installed." >&2
  exit 1
}

for size in "${sizes[@]}"; do
  render "$size"
done

echo "Generated ${#sizes[@]} MV3 icons from $src into $out/"
