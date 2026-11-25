"""Rebuild [Group 52] PaperTrace.zip from the curated submission folder."""
from pathlib import Path
import stat
import subprocess
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "PaperTrace"
ZIP = HERE / "[Group 52] PaperTrace.zip"
REPORT = HERE / "[Group 52] PaperTrace Report.pdf"
REVISION = "f84aee37d85428f79a55146f000284a73c6d4d27"
LIMIT = 90_000_000


def files():
    # Select the submitted source snapshot even if someone has since built the app here.
    paths = subprocess.check_output([
        "git", "-C", str(HERE.parent), "ls-tree", "-r", "--name-only", "-z", REVISION, "--",
        "backend", "frontend", "data-preparation", "tests/baseline", "docs/contracts",
        "docs/examples/CV-Citation-Check.pdf", "docs/test-baseline.md", "docs/third-party",
    ]).decode("utf-8").split("\0")
    names = {p for p in paths if p and Path(p).name not in {".gitignore", "AGENTS.md"}
             and not p.endswith("_副本.md") and p != "tests/baseline/run.sh"}
    names.update(("README.md", "AI-use.md", "Build-Windows.cmd", "Prepare-Windows.ps1", "Build-macOS.command", "build.py",
                  "evaluation/run.py", "evaluation/cases.json", "evaluation/results.json",
                  "evaluation/live_traces.json"))
    names.discard("backend/evaluate_synthesis.py")
    names.add("backend/worker_rpc.py")
    experiments = SOURCE / "evaluation/experiments"
    for pattern in ("*.py", "README.md", "warm-wiki/*.py", "warm-wiki/design.json",
                    "recorded/*.jsonl", "recorded/*.csv", "recorded/*.json", "recorded/wiki/*.jsonl"):
        names.update(p.relative_to(SOURCE).as_posix() for p in experiments.glob(pattern))
    names.update(("USER_GUIDE.pdf", "docs/user-guide/USER_GUIDE.tex"))
    names.update(p.relative_to(SOURCE).as_posix() for p in (SOURCE / "docs/user-guide/figures").glob("*.png"))
    names.update(p.relative_to(SOURCE).as_posix() for p in (SOURCE / "prompts").rglob("*")
                 if p.is_file() and p.suffix.lower() in {".md", ".txt"})
    return sorted(names)


def main():
    entries = {f"PaperTrace/{name}": SOURCE / name for name in files()}
    entries[f"PaperTrace/{REPORT.name}"] = REPORT
    entries[REPORT.name] = REPORT
    size = sum(path.stat().st_size for path in entries.values())
    if size > LIMIT:
        raise ValueError(f"Source files exceed the 90 MB limit: {size:,} bytes")
    with NamedTemporaryFile(dir=HERE, suffix=".zip.tmp", delete=False) as temp:
        candidate = Path(temp.name)
    try:
        with ZipFile(candidate, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            for name, path in entries.items():
                data = path.read_bytes()
                info = ZipInfo(name)
                info.create_system = 3
                mode = 0o755 if name.endswith((".command", ".sh")) else 0o644
                info.external_attr = (stat.S_IFREG | mode) << 16
                if name.endswith((".command", ".sh")):
                    data = data.replace(b"\r\n", b"\n")
                archive.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)
        with ZipFile(candidate) as archive:
            if archive.testzip() or candidate.stat().st_size > LIMIT:
                raise ValueError("ZIP integrity or size check failed")
        candidate.replace(ZIP)
    finally:
        candidate.unlink(missing_ok=True)
    print(f"{ZIP.name} | {len(entries)} files | {ZIP.stat().st_size:,} bytes | uncompressed {size:,} bytes")


if __name__ == "__main__":
    main()
