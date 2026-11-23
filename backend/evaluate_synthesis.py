"""Run the three literature synthesis configurations on public papers."""

import argparse
import json
from pathlib import Path
import tempfile
import time
from uuid import uuid4

from dsh import MODEL
from literature import entry_anchors
from papertrace import Worker


PAPERS = {
    "ASQA": "https://aclanthology.org/2022.emnlp-main.566.pdf",
    "ALCE": "https://aclanthology.org/2023.emnlp-main.398.pdf",
    "RARR": "https://aclanthology.org/2023.acl-long.910.pdf",
    "Self-RAG": "https://arxiv.org/pdf/2310.11511",
    "AIS": "https://aclanthology.org/2023.cl-4.2.pdf",
    "FActScore": "https://aclanthology.org/2023.emnlp-main.741.pdf",
}
GOLD = [
    {
        "question": "How does ALCE build on ASQA to evaluate long answers with citations?",
        "expected": [
            {"paper": "ASQA", "page": 1, "term": "different interpretations", "role": "Defines the long-answer task."},
            {"paper": "ALCE", "page": 2, "term": "ASQA (Stelmakh et al., 2022)",
             "role": "Uses ASQA as one dataset in its citation benchmark."},
        ],
        "false_support": "ASQA itself introduces ALCE's citation evaluation.",
    },
    {
        "question": "Contrast when RARR and Self-RAG retrieve evidence. Can their reported numbers determine which is better?",
        "expected": [
            {"paper": "RARR", "page": 1, "term": "post-edits", "role": "Retrieves and revises an existing output."},
            {"paper": "Self-RAG", "page": 1, "term": "reflection tokens", "role": "Controls retrieval and critique during generation."},
        ],
        "false_support": "A direct comparison declares an overall winner without matched conditions.",
    },
    {
        "question": "How do AIS, FActScore and ALCE complement one another when evaluating attribution and factual precision? Do they show that retrieval guarantees correctness?",
        "expected": [
            {"paper": "AIS", "page": 2, "term": "Attributable to Identified Sources", "role": "Judges attribution to identified sources."},
            {"paper": "FActScore", "page": 1, "term": "atomic facts", "role": "Checks factual support at the level of atomic facts."},
            {"paper": "ALCE", "page": 4, "term": "Citation Recall", "role": "Distinguishes aspects of citation quality."},
        ],
        "false_support": "The methods establish that retrieving evidence guarantees correctness.",
    },
]


def call(worker, method, **params):
    after = []
    if method in Worker.writes:
        params["operation_id"] = uuid4().hex
    with worker.lock, worker.db:
        result = worker.call(method, params, after)
    for action in after:
        action()
    return result


def run(worker, topic, versions, question, mode):
    args = {"topic_id": topic, "kind": "literature_synthesis",
            "input": {"question": question, "source_versions": versions, "mode": mode}}
    confirmation = call(worker, "task.prepare", **args)["confirmation_id"]
    task = call(worker, "task.start", confirmation_id=confirmation, **args)["task_id"]
    deadline = time.monotonic() + 200
    while time.monotonic() < deadline:
        snapshot = call(worker, "task.get", task_id=task)
        if snapshot["status"] not in ("queued", "running"):
            return snapshot
        time.sleep(0.2)
    raise RuntimeError("The synthesis did not return within the evaluation deadline.")


def review_rows(worker, topic, record):
    evidence = {}
    for row in [*record["points"], *record["relations"]]:
        for aid in entry_anchors(row):
            loc = call(worker, "evidence.open", topic_id=topic, anchor_id=aid)
            passage, = loc["source"]["passages"]
            evidence[aid] = {**passage, "source_version_id": loc["source"]["source_version_id"], "quote": loc["quote"]}
    return {**record, "evidence": evidence, "review": {
        "correct_relations": None, "covered_expected_findings": None, "false_support_count": None,
    }}


def evaluate(folder, corpus_only):
    with tempfile.TemporaryDirectory(prefix="papertrace-evaluation-") as directory:
        worker = Worker(Path(directory), lambda _: None)
        try:
            topic = call(worker, "topic.create", title="Evidence and attribution in long-form answers")["topic_id"]
            sources = {
                name: call(worker, "library.import_pdf", topic_id=topic, path=str(folder / f"{name}.pdf"))
                for name in PAPERS
            }
            versions = [source["source_version_id"] for source in sources.values()]
            pages = {name: call(worker, "source.read", topic_id=topic, source_version_id=source["source_version_id"])["passages"]
                     for name, source in sources.items()}
            checked = []
            for case in GOLD:
                for ref in case["expected"]:
                    original = " ".join(p["text"] for p in pages[ref["paper"]] if p["page"] == ref["page"])
                    if ref["term"].lower() not in original.lower():
                        raise ValueError(f"Expected text in {ref['paper']} on PDF page {ref['page']}.")
                    rendered = call(worker, "source.page", topic_id=topic,
                                    source_version_id=sources[ref["paper"]]["source_version_id"], page=ref["page"])
                    checked.append({**ref, "rendered": bool(rendered["png"])})
            report = {"papers": PAPERS, "corpus_anchors": checked,
                      "indexed_passages": {k: len(v) for k, v in pages.items()},
                      "model_executed": False, "cases": []}
            if corpus_only:
                return report
            if not worker.dsh or not worker.dsh.key:
                raise RuntimeError("Configure PAPERTRACE_DSH_CLI and DEEPSEEK_API_KEY to run the model comparison.")
            report["model_executed"] = True
            report["model"] = MODEL
            # Build the reviewed notes before asking the held-out evaluation questions.
            seed = run(worker, topic, versions, "Outline the roles of datasets, retrieval, and source attribution in this topic.", "agent")
            if "result" not in seed:
                raise RuntimeError(f"Wiki seed failed: {seed.get('issue', {}).get('reason', seed['status'])}")
            record = worker.get("synthesis", seed["result"]["record_id"])
            if input("Human review: inspect the seed and approve selected evidence before continuing? [y/N] ").lower() != "y":
                raise RuntimeError("The Wiki evaluation requires an intentional review.")
            for row in [*record["points"], *record["relations"]]:
                print(json.dumps(review_rows(worker, topic, {**record, "points": [row] if "claims" in row else [],
                                                              "relations": [] if "claims" in row else [row]}),
                                 ensure_ascii=False, indent=2))
                if input("Accept this finding into the Wiki? [y/N] ").lower() == "y":
                    base = call(worker, "synthesis.wiki", topic_id=topic)["revision"]
                    call(worker, "synthesis.review", topic_id=topic, record_id=record["record_id"],
                         base_revision=base, item_ids=[row["id"]])
            if not call(worker, "synthesis.wiki", topic_id=topic)["items"]:
                raise RuntimeError("Accept at least one reviewed finding for the Wiki condition.")
            for case in GOLD:
                trial = {**case, "runs": {}}
                for mode in ("fixed", "agent", "wiki"):
                    snapshot = run(worker, topic, versions, case["question"], mode)
                    result = snapshot.get("result")
                    trial["runs"][mode] = {
                        "status": snapshot["status"], "issue": snapshot.get("issue"),
                        **({"outline": review_rows(worker, topic, worker.get("synthesis", result["record_id"]))}
                           if result else {}),
                    }
                report["cases"].append(trial)
            return report
        finally:
            worker.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path, help="Directory containing the six named PDFs")
    parser.add_argument("--corpus-only", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = json.dumps(evaluate(args.corpus.resolve(), args.corpus_only), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(report)
    else:
        print(report, end="")
