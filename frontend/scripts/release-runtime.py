"""Pack native managed CPython, Node and the deployed PaperTrace agent."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tarfile

repo = Path(__file__).resolve().parents[2]
engine, scratch = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
out = repo / "frontend/src-tauri/release-resources"
out.mkdir(parents=True, exist_ok=True)
scratch.mkdir(parents=True, exist_ok=True)
node = Path(subprocess.check_output(["node", "-p", "process.execPath"], text=True).strip())
python = Path(subprocess.check_output(
    ["uv", "python", "find", "--managed-python", "3.12.13"], text=True
).strip()).resolve()
python_root = python.parent if os.name == "nt" else python.parent.parent
site = scratch / "site"
subprocess.run(["uv", "pip", "install", "--python", str(python), "--target", str(site),
                "pypdf==6.4.0", "pybtex==0.26.1", "certifi==2025.11.12", "latexcodec==3.0.1", "PyYAML==6.0.4"], check=True)
if not (engine / "node_modules/@deepseek-ai/dsh/lib/bin.js").is_file():
    raise RuntimeError("Missing bundled agent CLI")

def include(info):
    parts = Path(info.name).parts
    if "__pycache__" in parts or info.name.endswith((".tsbuildinfo", ".d.ts.map", ".js.map")):
        return None
    if parts[:2] == ("python", "bin") and len(parts) == 3 and parts[-1] != "python3.12":
        return None
    if info.name.endswith(".a") and parts[0] == "python":
        return None
    return info

archive = out / "runtime.tar.gz"
with tarfile.open(archive, "w:gz", dereference=True, compresslevel=5) as tar:
    tar.add(python_root, "python", filter=include)
    tar.add(node, "node.exe" if os.name == "nt" else "node")
    tar.add(site, "site", filter=include)
    tar.add(engine / "node_modules", "engine/node_modules", filter=include)
    for name in ["LICENSE", "THIRD_PARTY_NOTICES.md"]:
        tar.add(repo / "backend/engine" / name, "engine/" + name)
    node_license = next((p for p in [node.parent / "LICENSE", node.parent.parent / "LICENSE",
                         scratch / "NODE-LICENSE"] if p.is_file()), None)
    if not node_license:
        raise RuntimeError("Provide Node's license as NODE-LICENSE in the scratch directory")
    tar.add(node_license, "NODE-LICENSE")
with archive.open("rb") as handle:
    digest = hashlib.file_digest(handle, "sha256").hexdigest()
(out / "runtime.sha256").write_text(digest + "\n", encoding="ascii")
print(archive, archive.stat().st_size, digest)
