#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
if [[ -z ${PAPERTRACE_CLIENT_ROOT:-} && ! -d "$repo/frontend" ]]; then
  revision=4f472c75dcf5c2f4155b11d48fdeab215f8f9f48
  if ! git cat-file -e "$revision^{commit}" 2>/dev/null; then
    git fetch --no-tags https://github.com/Hopefullymeet/COMP7608_GroupProject.git "$revision"
  fi
  client_dir=$(mktemp -d)
  trap 'rm -rf -- "$client_dir"' EXIT
  git -C "$repo" archive "$revision" frontend/src | tar -x -C "$client_dir"
  export PAPERTRACE_CLIENT_ROOT="$client_dir"
  echo "Using baseline client at $revision"
fi

export PAPERTRACE_CLIENT_ROOT=${PAPERTRACE_CLIENT_ROOT:-$repo}
if [[ ! -f "$PAPERTRACE_CLIENT_ROOT/frontend/src/api/mock.ts" ]]; then
  echo "Missing client entry: $PAPERTRACE_CLIENT_ROOT/frontend/src/api/mock.ts" >&2
  exit 1
fi
tsx --test ./*.test.mjs
