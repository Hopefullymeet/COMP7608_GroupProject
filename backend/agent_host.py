"""Private stdio transport to the embedded research agent. One process per run."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
from queue import Empty, Queue
import subprocess
from threading import Thread


@contextmanager
def research_host(prompt, model, tools, planning, check_active):
    # The desktop worker supplies the absolute path to the packaged Node binary.
    # Source checkouts use the project's ordinary Node development dependency.
    script = Path(__file__).with_name("engine") / "core.mjs"
    process = subprocess.Popen([os.environ.get("PAPERTRACE_NODE", "node"), str(script)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               env={k: v for k, v in os.environ.items() if k.upper() in
                                    ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR")},
                               encoding="utf-8", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    packets = Queue()

    def receive():
        try:
            for line in process.stdout:
                packets.put(json.loads(line))
        finally:
            packets.put(None)

    def send(packet):
        process.stdin.write(json.dumps(packet, ensure_ascii=False) + "\n")
        process.stdin.flush()

    def events():
        while True:
            check_active()
            try:
                packet = packets.get(timeout=.1)
            except Empty:
                continue
            if packet is None or packet["kind"] == "error":
                raise OSError("Research engine stopped")
            yield packet
            if packet["kind"] == "end":
                return

    reader = Thread(target=receive, daemon=True)
    reader.start()
    try:
        send({"prompt": prompt, "model": model, "tools": tools, "plan": planning})
        yield events(), send
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdin.close()
        reader.join()
        process.stdout.close()
