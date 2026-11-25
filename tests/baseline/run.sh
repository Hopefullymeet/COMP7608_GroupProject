#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
repo=$(cd ../.. && pwd)
export PAPERTRACE_CLIENT_ROOT="$repo" PAPERTRACE_UI_ROOT="$repo"
tsx --test mainline.test.mjs
node --test language.test.mjs
(cd "$repo/frontend" && node --test tests/workspace.test.mjs)
python3 -B backend_cases.py "$repo/backend"
python3 -B "$repo/data-preparation/validate_data.py"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
python3 -B paper_eval.py --output "$scratch/offline.jsonl"
python3 -B score_papers.py "$scratch/offline.jsonl"
