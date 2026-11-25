"""Run all 57 scored cases twice with four independent sequential workers."""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from run_product import HERE, DATA

def batch(idx, ids):
    path = HERE/"results"/f"product-{idx}.jsonl"
    command = [sys.executable,"-B","-X","utf8",str(HERE/"run_product.py"),"--output",str(path)]
    for cid in ids:
        command.extend(["--case",cid])
    subprocess.run(command,check=True)

if __name__ == "__main__":
    rows = map(json.loads,(DATA/"review/task_inputs.jsonl").read_text(encoding="utf8").splitlines())
    ids = [c["case_id"] for c in rows if c["task_type"] in ("reading_qa","citation_check") and "fixture" not in c["input"]]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(batch,range(4),[ids[i::4] for i in range(4)]))
