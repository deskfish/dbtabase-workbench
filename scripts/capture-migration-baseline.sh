#!/usr/bin/env bash
set -euo pipefail

workspace="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
destination="${2:-$workspace/database-workbench/.migration-snapshots/$(date +%Y%m%d-%H%M%S)}"

capture_repo() {
  local name="$1"
  local repo="$workspace/$name"
  local out="$destination/$name"
  test -d "$repo/.git"
  mkdir -p "$out"
  git -C "$repo" rev-parse HEAD > "$out/head.txt"
  git -C "$repo" branch --show-current > "$out/branch.txt"
  git -C "$repo" status --porcelain=v2 --branch > "$out/status.txt"
  git -C "$repo" diff --binary HEAD > "$out/working-tree.patch"
  git -C "$repo" ls-files --others --exclude-standard > "$out/untracked.list"
  tar -C "$repo" -czf "$out/untracked-files.tgz" -T "$out/untracked.list"
}

mkdir -p "$destination"
capture_repo database-workbench
capture_repo log-lens
printf '%s\n' "$destination"
