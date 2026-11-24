"""PaperTrace research task and persistence entry points."""

from collections import Counter
from threading import Lock

from model_agent import ModelFailure
from citations import parse_pdf_index, save_index
from literature import (LiteratureError, digest, entry_anchors, extract_pdf, make_passages,
                        pdf_content, render_pdf_page, synthesis_result)


class Workbench:
    def __init__(self, worker, identifier):
        self.worker = worker
        self.new_id = identifier
        self.pdf_previews = {}
        self.pdf_preview_lock = Lock()

    def preview_pdf(self, params):
        _, content = pdf_content(params)
        checksum = digest(content)
        with self.pdf_preview_lock:
            parsed = self.pdf_previews.get(checksum)
        if parsed is None:
            pages = extract_pdf(content)
            parsed = pages, parse_pdf_index(content, pages)
            with self.pdf_preview_lock:
                self.pdf_previews[checksum] = parsed
                if len(self.pdf_previews) > 4:
                    del self.pdf_previews[next(iter(self.pdf_previews))]
        return {"parsed": True}

    def import_pdf(self, topic, params):
        host = self.worker
        filename, content = pdf_content(params)
        checksum = digest(content)
        paper_id = params.get("paper_id")
        if paper_id is not None and not isinstance(paper_id, str):
            raise LiteratureError("INVALID_PARAMS", "paper_id must be a string.")
        paper = host.get("paper", paper_id) if paper_id else None
        if paper and topic not in paper["topic_ids"]:
            raise LiteratureError("NOT_FOUND", "Paper is outside the selected topic.", "refresh_data", -32001)

        previous = host.db.execute("""
            SELECT p.version_id FROM pdf_files p JOIN records r ON r.kind = 'source' AND r.id = p.version_id
            WHERE p.digest = ?
        """, (checksum,)).fetchall()
        for (version,) in previous:
            source = host.get("source", version)
            if source["paper_id"] == paper_id or not paper_id:
                if host.db.execute("SELECT 1 FROM records WHERE kind = 'trashed_paper' AND id = ?",
                                   (source["paper_id"],)).fetchone():
                    raise LiteratureError("IDENTITY_CONFLICT", "Restore the matching paper from Trash first.",
                                          "review_import", -32010)
                entry = host.get("paper", source["paper_id"])
                if topic not in entry["topic_ids"]:
                    entry["topic_ids"].append(topic)
                    host.put("paper", entry["paper_id"], entry)
                record = next(v for v in entry["source_versions"] if v["source_version_id"] == version)
                return {"paper_id": entry["paper_id"], **record, "duplicate": True}
        if previous:
            raise LiteratureError("IDENTITY_CONFLICT", "This PDF is already attached to a different paper.",
                                  "review_import", -32010)

        with self.pdf_preview_lock:
            parsed = self.pdf_previews.get(checksum)
        pages = parsed[0] if parsed else extract_pdf(content)
        version = self.new_id()
        passages = list(make_passages(version, pages))
        scope = "full_text" if passages else "metadata"
        if not paper:
            paper_id = self.new_id()
            paper = {"paper_id": paper_id, "title": filename.rsplit(".", 1)[0], "topic_ids": [topic],
                     "identity": checksum, "source_versions": [], "authors": [], "tags": [],
                     "changes": [], "files": []}
        record = {"source_version_id": version, "available_scope": scope}
        paper["source_versions"].insert(0, record)
        paper["files"].insert(0, {"source_version_id": version, "name": filename, "role": scope})
        host.put("paper", paper_id, paper)
        host.put("source", version, {"source_version_id": version, "paper_id": paper_id,
                                     "page_count": len(pages), "available_scope": scope, "passages": []})
        host.db.execute("INSERT INTO pdf_files VALUES (?, ?, ?)", (version, checksum, content))
        host.db.executemany("INSERT INTO paper_passages VALUES (?, ?, ?, ?, ?)", passages)
        if passages:
            first = host.db.execute("SELECT last_insert_rowid()").fetchone()[0] - len(passages) + 1
            host.db.executemany("INSERT INTO passage_lookup VALUES (?, ?, ?, ?, ?)",
                                ((*p[:4], first + i) for i, p in enumerate(passages)))
        save_index(host.db, version, parsed[1] if parsed else parse_pdf_index(content, pages))
        return {"paper_id": paper_id, **record, "duplicate": False}

    def document(self, source, passage_id=None):
        query = """SELECT lookup.passage_id, lookup.page, paper_passages.text FROM passage_lookup AS lookup
                   JOIN paper_passages ON paper_passages.rowid = lookup.fts_rowid WHERE lookup.version_id = ?"""
        args = (source["source_version_id"],)
        if passage_id:
            query += " AND lookup.passage_id = ?"
            args += (passage_id,)
        rows = self.worker.db.execute(query + " ORDER BY lookup.page, lookup.ordinal", args)
        passages = [{"passage_id": pid, "page": page, "section": f"PDF · page {page}", "text": body}
                    for pid, page, body in rows]
        if not passages:
            passages = [{**p, "page": 0, "section": "Abstract"} for p in source["passages"]
                        if not passage_id or p["passage_id"] == passage_id]
        return {"paper_id": source["paper_id"], "source_version_id": source["source_version_id"],
                "passages": passages}

    def page(self, source, page):
        if type(page) is not int or not 1 <= page <= source.get("page_count", 0):
            raise LiteratureError("INVALID_PARAMS", "Page is outside the saved PDF.")
        row = self.worker.db.execute("SELECT content FROM pdf_files WHERE version_id = ?",
                                     (source["source_version_id"],)).fetchone()
        return {"page": page, "png": render_pdf_page(row[0], page)}

    def current_versions(self, topic):
        return {p["source_versions"][0]["source_version_id"]
                for p in self.worker.rows("paper") if topic in p["topic_ids"]}

    def results(self, topic):
        host = self.worker
        active = next((t["task_id"] for t in host.rows("task") if t["topic_id"] == topic
                       and t["kind"] == "literature_synthesis" and t["status"] in ("queued", "running")), None)
        latest = self.current_versions(topic)
        items = [{**record, "stale_item_ids": self.stale_items(record, latest)}
                 for record in host.rows("synthesis") if record["topic_id"] == topic]
        return {"items": items, "active_task_id": active}

    def stale_items(self, record, latest):
        anchor_versions = {}
        stale = []
        for item in record["points"] + record["relations"]:
            dependencies = {item[key] for key in ("from", "to") if key in item}
            for aid in entry_anchors(item):
                if aid not in anchor_versions:
                    anchor_versions[aid] = self.worker.get("anchor", aid)["value"]["source_version_id"]
                dependencies.add(anchor_versions[aid])
            if not dependencies.issubset(latest):
                stale.append(item["id"])
        return stale

    def wiki(self, topic):
        host = self.worker
        row = host.db.execute("SELECT data FROM records WHERE kind = 'research_wiki' AND id = ?", (topic,)).fetchone()
        wiki = host.get("research_wiki", topic) if row else {"revision": "", "items": []}
        latest = {p["paper_id"]: p["source_versions"][0]["source_version_id"] for p in host.rows("paper") if topic in p["topic_ids"]}
        dependencies = host.citations.wiki_changes(topic, wiki["items"])
        for item_id, version in host.db.execute("SELECT item_id, version_id FROM wiki_evidence WHERE topic_id = ?", (topic,)):
            source = host.get("source", version)
            if latest.get(source["paper_id"]) != version:
                changed = dependencies.setdefault(item_id, [])
                if version not in changed:
                    changed.append(version)
        return {**wiki, "items": [{**item, "needs_review": item["id"] in dependencies,
                                   "changed_versions": dependencies.get(item["id"], [])}
                                  for item in wiki["items"]]}

    def review(self, topic, params):
        host = self.worker
        result = host.get("synthesis", params.get("record_id"))
        if result["topic_id"] != topic:
            raise LiteratureError("NOT_FOUND", "Outline is outside this topic.", "refresh_data", -32001)
        wiki = self.wiki(topic)
        if params.get("base_revision") != wiki["revision"]:
            raise LiteratureError("STALE_REVISION", "The Wiki changed. Review the latest revision and try again.", "refresh_data", -32020)
        eligible = {item["id"]: (kind, item) for kind, items in
                    (("point", result["points"]), ("relation", result["relations"])) for item in items}
        chosen = params.get("item_ids")
        if (not isinstance(chosen, list) or not chosen or not all(isinstance(v, str) and v in eligible for v in chosen)
                or len(set(chosen)) != len(chosen)):
            raise LiteratureError("INVALID_PARAMS", "Select distinct items from this outline.")
        latest = self.current_versions(topic)
        if set(chosen).intersection(self.stale_items(result, latest)):
            raise LiteratureError("STALE_REVISION", "Recheck the current paper versions before saving to Wiki.",
                                  "refresh_data", -32020)
        current = {item["id"]: item for item in wiki["items"]}
        history = wiki.get("history", [])
        for item_id in chosen:
            kind, entry = eligible[item_id]
            saved_id = entry.get("prior_id", item_id)
            old = current.get(saved_id)
            if old and old["record_id"] == result["record_id"]:
                continue
            if (old and entry.get("prior_id") and
                    old["record_id"] != result.get("prior_records", {}).get(saved_id)):
                raise LiteratureError("STALE_REVISION", "This Wiki item changed since the outline. Run a new synthesis.", "refresh_data", -32020)
            if old:
                history.append(old)
            anchor_ids = list(dict.fromkeys(entry_anchors(entry)))
            versions = {host.get("anchor", aid)["value"]["source_version_id"] for aid in anchor_ids}
            if kind == "relation":
                versions.update((entry["from"], entry["to"]))
            host.db.execute("DELETE FROM wiki_evidence WHERE topic_id = ? AND item_id = ?", (topic, saved_id))
            host.db.executemany("INSERT INTO wiki_evidence VALUES (?, ?, ?)",
                                [(topic, saved_id, version) for version in versions])
            current[saved_id] = {"id": saved_id, "kind": kind, "record_id": result["record_id"],
                                 "entry": entry, "anchor_ids": anchor_ids, "source_versions": sorted(versions)}
        stored = {"revision": self.new_id(), "items": list(current.values()), "history": history}
        host.put("research_wiki", topic, stored)
        return self.wiki(topic)

    def save_comparison(self, topic, params):
        host = self.worker
        record_id = params.get("comparison_id")
        record = host.get("comparison", record_id)
        if record["topic_id"] != topic:
            raise LiteratureError("NOT_FOUND", "Comparison is outside this topic.", "refresh_data", -32001)
        if params.get("base_revision") != record["revision"]:
            raise LiteratureError("STALE_REVISION", "The comparison changed. Review the latest revision.", "refresh_data", -32020)
        cells = params.get("cells")
        old = record["cells"]
        if not isinstance(cells, list) or len(cells) != len(old):
            raise LiteratureError("INVALID_PARAMS", "Keep the original comparison dimensions and sources.")
        revised = []
        for row, original in zip(cells, old):
            if not isinstance(row, dict) or any(row.get(k) != original[k] for k in ("dimension", "source_version_id")):
                raise LiteratureError("INVALID_PARAMS", "Keep the original comparison dimensions and sources.")
            text, state, ids = row.get("text"), row.get("status"), row.get("anchor_ids")
            if (not isinstance(text, str) or not text.strip() or len(text) > 5000
                    or state not in ("evidenced", "missing", "not_comparable", "disputed")
                    or not isinstance(ids, list) or not all(isinstance(a, str) for a in ids)
                    or (state == "evidenced" and not ids)):
                raise LiteratureError("INVALID_PARAMS", "Provide a finding and any required evidence.")
            for aid in ids:
                anchor = host.get("anchor", aid)
                if anchor["topic_id"] != topic or anchor["value"]["source_version_id"] != original["source_version_id"]:
                    raise LiteratureError("INVALID_PARAMS", "Comparison evidence must match the cell's paper version.")
            revised.append({**original, "text": text, "status": state, "anchor_ids": list(dict.fromkeys(ids))})
        record["history"].insert(0, {"revision": record["revision"], "cells": old})
        record.update(revision=self.new_id(), cells=revised)
        host.put("comparison", record_id, record)
        return {key: value for key, value in record.items() if key != "topic_id"}

    def scope(self, task):
        host = self.worker
        topic = task["topic_id"]
        sources = []
        for version in task["input"]["source_versions"]:
            source = host.source(version, topic)
            paper = host.get("paper", source["paper_id"])
            scope = next(v["available_scope"] for v in paper["source_versions"] if v["source_version_id"] == version)
            sources.append({"source_version_id": version, "paper_id": source["paper_id"], "title": paper["title"],
                            "available_scope": scope, "passages": source["passages"]})
        versions = {s["source_version_id"] for s in sources}
        for source in sources:
            refs = host.citations.refs(topic, source["source_version_id"])["items"]
            source["relations"] = [{"target_version_id": item["target_version_id"],
                                    "target_title": item["target_title"],
                                    "mentions": item["mentions"][:2]} for item in refs
                                   if item["target_version_id"] in versions]
        leads = []
        for item in self.wiki(topic)["items"]:
            entry = item["entry"]
            title = entry.get("title") or entry["subject"]
            if item["needs_review"]:
                # Reopen the lead after a replacement only when every affected paper
                # remains in scope. The old claims and quotations stay out of the prompt.
                old_papers = {host.get("source", v)["paper_id"] for v in item["source_versions"]}
                if not old_papers.issubset({s["paper_id"] for s in sources}):
                    continue
                leads.append({"id": item["id"], "kind": item["kind"], "search_text": title,
                              "needs_review": True, "record_id": item["record_id"], "passage_ids": []})
                continue
            if not set(item["source_versions"]).issubset(versions):
                continue
            text = " ".join([title, *(claim["text"] for claim in entry.get("claims", [])),
                             entry.get("open_question", ""), *(claim["gap"] for claim in entry.get("claims", []))])
            anchors = [host.get("anchor", aid)["value"] for aid in item["anchor_ids"]]
            leads.append({"id": item["id"], "kind": item["kind"], "search_text": text[:1600],
                          "record_id": item["record_id"], "needs_review": item["needs_review"],
                          "passage_ids": list(dict.fromkeys(a["location"]["passage_id"] for a in anchors
                                                             if a["location"].get("passage_id")))[:12]})
        return sources, leads

    def run(self, task, cancelled):
        host = self.worker
        task_id = task["task_id"]
        try:
            with host.lock:
                sources, wiki = self.scope(task)
            runtime = host.agent_for_task(task)
            if not runtime:
                raise ModelFailure("MODEL_UNAVAILABLE", False, "configure_service")

            def progress(name, detail):
                with host.lock:
                    current = host.get("task", task_id)
                    if current["status"] != "running":
                        return
                    with host.db:
                        ev = host.emit(current, "task.progress", {"stage": name, "message": f"{name}: {detail}"})
                    host.send_events([ev])

            dimensions = task["input"].get("dimensions") if task["kind"] == "paper_comparison" else None
            mode = "agent" if dimensions else task["input"].get("mode", "wiki")
            raw, seen, trace, usage, issue = runtime.synthesize(
                task["input"]["question"], sources, wiki, cancelled, progress, mode=mode, dimensions=dimensions,
            )
            with host.lock:
                current = host.get("task", task_id)
                if current["status"] != "running":
                    return
                versions = {s["source_version_id"]: s for s in sources}
                for pid in list(seen):
                    passage = seen[pid]
                    info = versions.get(passage.get("source_version_id"))
                    if not info:
                        del seen[pid]
                        continue
                    verified = self.document(host.source(passage["source_version_id"], task["topic_id"]), pid)["passages"]
                    if not verified:
                        del seen[pid]
                        continue
                    seen[pid] = {**verified[0], "source_version_id": passage["source_version_id"], "paper_id": info["paper_id"]}
                prior = {item["id"]: item["kind"] for item in wiki} if mode == "wiki" else {}
                record_id = self.new_id()
                with host.db:
                    result = synthesis_result(raw, seen, versions, prior,
                                              lambda passage, quote: host.store_anchor(task, record_id, passage, quote), dimensions)
                    for entry in [*result["points"], *result["relations"]]:
                        entry["id"] = self.new_id()
                    counts = Counter(p["source_version_id"] for p in seen.values())
                    reads = [{"source_version_id": v, "title": src["title"], "available_scope": src["available_scope"],
                              "passages_read": counts[v]} for v, src in versions.items()]
                    for read in reads:
                        if read["available_scope"] != "full_text":
                            result["gaps"].append(f'{read["title"]}: full text unavailable.')
                    for entry in result["points"]:
                        for claim in entry["claims"]:
                            if claim["assessment"] != "supported":
                                result["gaps"].append(claim["text"] + " — " + claim["gap"])
                    if not result["points"]:
                        result["gaps"].append("No evidence-backed outline could be assembled in this run.")
                    if issue:
                        messages = {
                            "TASK_BUDGET_EXHAUSTED": "The evidence budget was reached. Refine the question to continue.",
                            "TASK_TIMEOUT": "The task timed out. Evidence read so far is available below.",
                            "MODEL_OUTPUT_INVALID": "The model returned an unusable outline. Previously read evidence is still available.",
                        }
                        result["gaps"].append(messages.get(issue["reason"], "The task ended before verification was complete."))
                    read_anchors = [host.store_anchor(task, record_id, p, p["text"][:200])
                                    for p in list(seen.values())[:12]] if not result["points"] else []
                    record = {**result, "record_id": record_id, "topic_id": task["topic_id"],
                              "question": task["input"]["question"], "mode": mode, "reads": reads,
                              "read_anchor_ids": read_anchors, "usage": usage, "trace": trace,
                              "prior_records": {v["id"]: v["record_id"] for v in wiki if v["id"] in prior},
                              "source_versions": list(versions)}
                    if dimensions:
                        host.put("comparison", record_id, {
                            "comparison_id": record_id, "topic_id": task["topic_id"], "revision": self.new_id(),
                            "question": task["input"]["question"], "source_versions": list(versions),
                            "cells": result["cells"], "history": [],
                        })
                        result["gaps"] = [cell["text"] for cell in result["cells"] if cell["status"] == "missing"]
                    else:
                        host.put("synthesis", record_id, record)
                    current["steps"] = trace + [s for s in current["steps"] if s.get("title") == "Evidence review"]
                    partial = issue or ({"reason": "EVIDENCE_INCOMPLETE", "retryable": False, "next_action": "review_gaps"}
                                        if result["gaps"] else None)
                    summary = {"record_id": record_id}
                    if not dimensions:
                        summary["kind"] = "literature_synthesis"
                    event = host.finish(current, "partial", result=summary, issue=partial) if partial else (
                        host.finish(current, "completed", result=summary))
                host.send_events([event])
        except ModelFailure as error:
            host.fail_task(task_id, error.issue)
        except Exception as error:
            import sys
            print(f"PaperTrace synthesis: {type(error).__name__}", file=sys.stderr)
            host.fail_task(task_id, {"reason": "TEMPORARILY_UNAVAILABLE", "retryable": True, "next_action": "retry"})
        finally:
            with host.lock:
                host.inflight.pop(task_id, None)
