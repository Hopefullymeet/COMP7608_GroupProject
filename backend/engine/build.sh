#!/bin/sh
# NODE_PATH must point at the compiled node_modules from the pinned harness snapshot.
set -eu
cd "$(dirname "$0")"
"${ESBUILD:-esbuild}" host.mjs --bundle --platform=node --format=esm --target=node22 \
  --banner:js="import {createRequire as ptRequire} from 'node:module';const require=ptRequire(import.meta.url);" \
  --legal-comments=eof --outfile=core.mjs
python3 - <<'PY'
from pathlib import Path
import json, os, re
bundle = Path("core.mjs")
text = bundle.read_text()
version = json.loads((Path(os.environ["NODE_PATH"]) / "@deepseek-ai/dsh-llm/package.json").read_text())["version"]
assert version == "0.2.2-rc.5"
lookup = 'createRequire(import.meta.url)("../package.json")'
assert text.count(lookup) == 1
bundle.write_text(re.sub(r'^// .*?/node_modules/', '// node_modules/', text.replace(lookup, json.dumps({"version":version})), flags=re.M))
PY
