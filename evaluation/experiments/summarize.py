"""Summarize report trial timing and provider usage."""
from collections import Counter

from statistics import mean, median
import json




def read(path):
    return [json.loads(line) for line in path.read_text(encoding="utf8").splitlines()] if path.exists() else []


def summarize(rows):
    counts = Counter()
    for row in rows:
        counts[row.get("snapshot",{}).get("status","runner_error")] += 1
    eligible = []
    observed = Counter()
    for row in rows:
        totals = Counter()
        complete = "runner_error" not in row
        for request in row["requests"]:
            usage = request["usage"] or {}
            fields = ["prompt_tokens","completion_tokens","prompt_cache_hit_tokens","prompt_cache_miss_tokens"]
            if not all(k in usage for k in fields) or request["model"] != "deepseek-flash":
                complete = False
            totals.update({k:usage.get(k,0) for k in fields})
        observed.update(totals)
        if complete:
            eligible.append(totals)
    calc = lambda u: (.003*u["prompt_cache_hit_tokens"]+.15*u["prompt_cache_miss_tokens"]+.6*u["completion_tokens"])/1e6
    cost = mean(calc(u) for u in eligible) if eligible else None
    return dict(attempts=len(rows), statuses=dict(counts), requests=sum(len(r["requests"]) for r in rows),
        requests_missing_usage=sum(not q["usage"] for r in rows for q in r["requests"]), observed_tokens=dict(observed),
        fully_metered_attempts=len(eligible), mean_input_tokens=mean(u["prompt_tokens"] for u in eligible) if eligible else None,
        mean_output_tokens=mean(u["completion_tokens"] for u in eligible) if eligible else None,
        estimated_mean_usd_offpeak=cost,estimated_mean_usd_peak=cost*2 if cost is not None else None,
        median_task_seconds=median(r["seconds"] for r in rows if "seconds" in r) if any("seconds" in r for r in rows) else None)
