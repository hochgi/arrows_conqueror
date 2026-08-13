#!/usr/bin/env bash
# Refuse to push the local test-kit overlay, or any commit that would publish it.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${branch}" == "local-main" ]]; then
  echo "error: refusing to push branch 'local-main'." >&2
  echo "That branch is the local test-kit overlay. Product work branches from main." >&2
  echo "Rebase local-main onto main after main moves; never push it." >&2
  exit 1
fi

tracked_kit="$(git ls-files | grep -E '\.kit\.test\.ts$' || true)"
if [[ -n "${tracked_kit}" ]]; then
  echo "error: tracked *.kit.test.ts files are not allowed on a pushable branch:" >&2
  echo "${tracked_kit}" >&2
  echo "Keep kit tests on local-main only." >&2
  exit 1
fi

# Docs and skills may name the package. Manifests and the lockfile may not.
hits="$(git grep -n '@vnatures/test-kit' -- 'package.json' '**/package.json' 'pnpm-lock.yaml' 'pnpm-workspace.yaml' 2>/dev/null || true)"
if [[ -n "${hits}" ]]; then
  echo "error: @vnatures/test-kit must not appear in package manifests or the lockfile:" >&2
  echo "${hits}" >&2
  exit 1
fi
