"""Recompute the final report's live-evaluation tables from recorded trials and judgments."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from statistics import mean, median

from run_engine_audit import DATA, audit_cases, read_rows, score
from summarize import summarize

HERE = Path(__file__).resolve().parent


def indexed(rows, fields):
    result = {tuple(row[f] for f in fields): row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f"Duplicate trial or judgment for {fields}")
    return result


def usage(rows):
    stats = summarize(rows)
    if stats["fully_metered_attempts"] != len(rows):
        raise ValueError("Incomplete usage records")
    return {key: stats[key] for key in ("attempts", "median_task_seconds", "mean_input_tokens",
            "mean_output_tokens", "estimated_mean_usd_peak")}


def desktop(folder, gold):
    rows = [row for file in sorted(folder.glob("product-*.jsonl")) for row in read_rows(file)]
    trials = indexed(rows, ("case_id", "repeat"))
    expected = {(case_id, rnd) for case_id, case in gold.items()
                if case["task_type"] in ("reading_qa", "citation_check") and "fixture" not in case["input"]
                for rnd in (1, 2)}
    if trials.keys() != expected:
        raise ValueError("Desktop case coverage differs from the report design")
    marks = indexed(json.loads((folder/"qa-assessment.json").read_text(encoding="utf8"))["rows"],
                    ("case_id", "repeat"))
    reading = [r for r in rows if r["task"] == "reading_qa"]
    audits = [r for r in rows if r["task"] == "citation_check"]
    if marks.keys() != indexed(reading, ("case_id","repeat")).keys():
        raise ValueError("Missing or stale reading judgments")
    counts = {i: Counter() for i in (1, 2)}
    for key, row in trials.items():
        metrics = counts[row["repeat"]]
        if row["task"] == "reading_qa":
            mark = marks[key]
            if mark["task_id"] != row["snapshot"]["task_id"]:
                raise ValueError("Reading judgment belongs to a different answer")
            metrics["core_correct"] += mark["core_reference_covered"]
            supported = mark.get("full_sentence_supported")
            if supported is not None:
                metrics["sampled"] += 1
                metrics["fully_supported"] += supported
            for item in row["items"]:
                metrics["sentences"] += 1
                hits = [row["evidence"][a] for a in item["anchor_ids"]]
                if hits:
                    metrics["cited"] += 1
                    metrics["verified"] += all(h["correct_version"] and h["quote"] and
                        any(h["quote"] in p["text"] for p in h["passages"]) for h in hits)
        else:
            label, = {c["semantic_label"] for c in gold[key[0]]["reference"]["atomic_claims"]}
            statuses = {item["status"] for item in row["items"]}
            verdict = next(iter(statuses)) if len(statuses) == 1 else "no_single_verdict"
            correct = verdict == {"supported":"supported", "contradicted":"conflict",
                                  "not_established":"evidence_not_established"}[label]
            metrics["exact_label"] += correct
            metrics[label + "_correct"] += correct
            metrics["blocked"] += verdict == "blocked"
            metrics["false_supported"] += verdict == "supported" and label != "supported"
    missing = read_rows(folder/"missing.jsonl")
    expected_missing = {k for k,c in gold.items() if "fixture" in c["input"]}
    if indexed(missing, ("case_id",)).keys() != {(k,) for k in expected_missing}:
        raise ValueError("Incomplete withheld-source coverage")
    return dict(rounds=counts, reading=usage(reading), citation=usage(audits),
                withheld_blocked_without_request=sum(bool(r["items"]) and all(i["status"]=="blocked"
                    for i in r["items"]) and not r["requests"] for r in missing))


def comparison(folder, gold):
    rows = read_rows(folder/"app-comparison.jsonl")
    expected = {(k,n) for k,c in gold.items() if c["task_type"]=="paper_comparison" for n in (1,2)}
    if indexed(rows, ("case_id","repeat")).keys() != expected:
        raise ValueError("Incomplete comparison runs")
    with (folder/"app-comparison-review.csv").open(encoding="utf-8-sig",newline="") as f:
        marks = indexed(list(csv.DictReader(f)), ("case_id","repeat","paper","dimension"))
    verified = Counter()
    content, support = Counter(), Counter()
    for row in rows:
        cells = {(c["source_version_id"],c["dimension"]):c for table in row["records"] for c in table["cells"]}
        for version,paper in row["papers"].items():
            for dimension in row["input"]["dimensions"]:
                cell = cells[version,dimension]
                mark = marks.pop((row["case_id"],str(row["repeat"]),paper,dimension))
                hits = [row["evidence"][a] for a in cell["anchor_ids"]]
                valid = bool(hits) and all(h["paper"]==paper and h["quote"] and
                    any(h["quote"] in p["text"] for p in h["passages"]) for h in hits)
                if mark["text"] != cell["text"] or valid != (mark["verified_location"]=="True"):
                    raise ValueError("Comparison review and saved answer differ")
                verified[row["repeat"]] += valid
                content[mark["core_content"]] += 1
                support[mark["core_quote_support"]] += 1
    if marks:
        raise ValueError("Unmatched comparison reviews")
    return dict(verified=verified, content=content, support=support, usage=usage(rows),
                statuses=Counter(r["snapshot"]["status"] for r in rows))


def wiki(folder):
    trials = [r for p in sorted(folder.glob("*-trials.jsonl")) for r in read_rows(p)]
    papers = json.loads((HERE/"warm-wiki/design.json").read_text())["cases"]
    expected = {(p,t,c,n) for p in papers for t in ("followup","independent")
                for c in ("on","off") for n in (1,2)}
    if indexed(trials, ("paper","task","condition","repeat")).keys() != expected:
        raise ValueError("Incomplete Wiki trials")
    marks = indexed(read_rows(folder/"judgments.jsonl"), ("id",))
    groups = {}
    for task in ("followup","independent"):
        for state in ("on","off"):
            batch = [r for r in trials if r["task"]==task and r["condition"]==state]
            outcomes = Counter()
            for row in batch:
                blind_id = hashlib.sha256(row["snapshot"]["task_id"].encode()).hexdigest()[:10]
                mark = marks.pop((blind_id,))
                for k in ("identified","correct","acknowledged_missing"):
                    outcomes[k] += mark.get(k,0)
                outcomes["correct_with_evidence"] += bool(mark["correct"] and mark["supported"])
            groups[task+"_"+state] = dict(outcomes, **usage(batch))
    if marks:
        raise ValueError("Unmatched Wiki judgments")
    return groups


def report(folder, figure_data=None):
    cases = read_rows(DATA/"review/cases.jsonl")
    gold = {c["case_id"]:c for c in cases}
    rows = read_rows(folder/"engine-audit.jsonl")
    rounds = score(rows, audit_cases(DATA/"review/cases.jsonl"))
    pooled = {}
    for mode in ("fixed","agent"):
        batch = [r for r in rows if r["mode"]==mode]
        correct = sum(rounds[f"{mode}-{n}"]["correct"] for n in (1,2))
        missing = sum(rounds[f"{mode}-{n}"]["missing_label"] for n in (1,2))
        total_tokens = [r["usage"]["input_tokens"] + r["usage"]["output_tokens"] for r in batch]
        if figure_data is not None:
            figure_data.mkdir(parents=True, exist_ok=True)
            with (figure_data / f"engine-{mode}.dat").open("w", encoding="utf-8") as stream:
                print("seconds ktokens", file=stream)
                for row, tokens in zip(batch, total_tokens):
                    print(f"{row['seconds']:.2f} {tokens / 1000:.2f}", file=stream)
        pooled[mode] = dict(median_total_tokens=median(total_tokens),correct=correct, wrong=len(batch)-missing-correct, missing=missing,
            verdicts=len(batch)-missing, median_seconds=median(r["seconds"] for r in batch),
            **{k: mean(r["usage"][k] for r in batch) for k in ("model_steps","input_tokens","output_tokens")})
    return dict(desktop=desktop(folder,gold), comparison=comparison(folder,gold),
                engine=dict(rounds=rounds,pooled=pooled), wiki=wiki(folder/"wiki"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records",type=Path,default=HERE/"recorded")
    parser.add_argument("--figure-data", type=Path, help="Export time/token points for the report figure")
    args = parser.parse_args()
    print(json.dumps(report(args.records, args.figure_data), indent=2))
