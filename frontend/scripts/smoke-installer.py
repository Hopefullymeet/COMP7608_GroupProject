"""Exercise the runtime delivered by the installed native application."""
import hashlib
import os
import plistlib
from pathlib import Path
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parents[2]
resources = Path(os.environ["PACKAGE_RESOURCES"])
windows = os.name == "nt"
if windows:
    app = resources / "PaperTrace.exe"
else:
    info = plistlib.loads((resources.parent / "Info.plist").read_bytes())
    app = resources.parent / "MacOS" / info["CFBundleExecutable"]
if windows and not app.is_file():
    app = resources / "papertrace.exe"
digest = (resources / "runtime.sha256").read_text().strip()
with (resources / "runtime.tar.gz").open("rb") as handle:
    assert hashlib.file_digest(handle, "sha256").hexdigest() == digest

with tempfile.TemporaryDirectory() as directory:
    workspace = Path(directory)
    root = workspace / "desktop-runtime" / digest
    env = {**os.environ, "PAPERTRACE_WORKSPACE": directory}
    for key in ("PAPERTRACE_PYTHON", "PYTHONPATH"):
        env.pop(key, None)
    app_process = subprocess.Popen([str(app)], env=env)
    try:
        deadline = time.monotonic() + 240
        while not root.is_dir():
            if app_process.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError("Installed application did not initialize the bundled runtime")
            time.sleep(1)
        python = root / ("python/python.exe" if windows else "python/bin/python3.12")
        env.update(PYTHONNOUSERSITE="1", PYTHONPATH=str(root / "site"))
        subprocess.run([str(python), "-B", "-m", "unittest",
                        "test_model_research.ModelResearchTest.test_search_read_and_reviewed_wiki"],
                       cwd=repo / "backend", env=env, check=True, timeout=240)
    finally:
        # The app's Python worker also loads DLLs from the temporary runtime.
        if app_process.poll() is None:
            if windows:
                subprocess.run(["taskkill", "/PID", str(app_process.pid), "/T", "/F"], check=True, timeout=30)
            else:
                app_process.terminate()
        app_process.wait(timeout=30)
