#!/usr/bin/env bash
set -euo pipefail

workspace="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
destination="${2:-$workspace/database-workbench/.migration-snapshots/$(date +%Y%m%d-%H%M%S)}"
staging=""
lock_root="$workspace/.migration-snapshot-locks"
lock_dir=""
lock_held=0

cleanup() {
  case "$staging" in
    "$workspace"/.migration-snapshot-staging.*)
      test ! -d "$staging" || rm -rf -- "$staging"
      ;;
  esac
  if test "$lock_held" -eq 1; then
    case "$lock_dir" in
      "$lock_root"/*)
        rmdir "$lock_dir" 2>/dev/null || true
        ;;
    esac
  fi
}

if test -e "$destination" || test -L "$destination"; then
  printf 'destination already exists: %s\n' "$destination" >&2
  exit 1
fi

mkdir -p "$lock_root"
lock_key="$(printf '%s' "$destination" | cksum | awk '{print $1 "-" $2}')"
lock_dir="$lock_root/$lock_key"
if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'capture already in progress for destination: %s\n' "$destination" >&2
  exit 1
fi
lock_held=1
trap cleanup EXIT

if test -e "$destination" || test -L "$destination"; then
  printf 'destination already exists: %s\n' "$destination" >&2
  exit 1
fi

staging="$(mktemp -d "$workspace/.migration-snapshot-staging.XXXXXX")"

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

test "$(find "$destination" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d '[:space:]')" -eq 2
for repo in database-workbench log-lens; do
  test -d "$destination/$repo"
  test -s "$destination/$repo/head.txt"
  test -e "$destination/$repo/branch.txt"
  test -s "$destination/$repo/status.txt"
  test -e "$destination/$repo/working-tree.patch"
  test -e "$destination/$repo/untracked.list"
  test -s "$destination/$repo/untracked-files.tgz"
done
test -z "$(find "$destination" -mindepth 1 -type d -name '.migration-snapshot-staging.*' -print -quit)"

staging=""
rmdir "$lock_dir"
lock_held=0
trap - EXIT
printf '%s\n' "$destination"
