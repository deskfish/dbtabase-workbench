#!/usr/bin/env bash
set -euo pipefail

workspace="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
destination="${2:-$workspace/database-workbench/.migration-snapshots/$(date +%Y%m%d-%H%M%S)}"
staging=""

cleanup() {
  case "$staging" in
    "$workspace"/.migration-snapshot-staging.*)
      test ! -d "$staging" || rm -rf -- "$staging"
      ;;
  esac
}

if test -e "$destination" || test -L "$destination"; then
  printf 'destination already exists: %s\n' "$destination" >&2
  exit 1
fi

staging="$(mktemp -d "$workspace/.migration-snapshot-staging.XXXXXX")"
trap cleanup EXIT

capture_repo() {
  local name="$1"
  local repo="$workspace/$name"
  local out="$staging/$name"
  test -d "$repo/.git"
  mkdir -p "$out"
  git -C "$repo" rev-parse HEAD > "$out/head.txt"
  git -C "$repo" branch --show-current > "$out/branch.txt"
  git -C "$repo" status --porcelain=v2 --branch > "$out/status.txt"
  git -C "$repo" diff --binary HEAD > "$out/working-tree.patch"
  git -C "$repo" ls-files --others --exclude-standard --exclude='.migration-snapshots/' > "$out/untracked.list"
  tar -C "$repo" -czf "$out/untracked-files.tgz" -T "$out/untracked.list"
}

capture_repo database-workbench
capture_repo log-lens
mkdir -p "$(dirname "$destination")"
if test -e "$destination" || test -L "$destination"; then
  printf 'destination already exists: %s\n' "$destination" >&2
  exit 1
fi
mv "$staging" "$destination"
staging=""
trap - EXIT
printf '%s\n' "$destination"
