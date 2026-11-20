"""Local PaperTrace v0.4 worker. Stdout is reserved for newline-delimited RPC."""

import datetime
import json
from pathlib import Path
import queue
import sqlite3
import sys
import threading
from uuid import uuid4


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def identifier():
    return uuid4().hex


PUBMEDQA = {
    "title": "PubMedQA: A Dataset for Biomedical Research Question Answering",
    "authors": ["Qiao Jin", "Bhuwan Dhingra", "Zhengping Liu", "William Cohen", "Xinghua Lu"],
    "doi": "10.18653/v1/D19-1259",
    "year": 2019,
    "venue": {"name": "EMNLP-IJCNLP", "source": "ACL Anthology"},
    "metadata_url": "https://aclanthology.org/D19-1259/",
    "abstract": "PubMedQA is a biomedical QA dataset.\n\nIt uses the corresponding abstract without its conclusion.",
    "reason": "PubMedQA is the local contract example for abstract-based scientific QA.",
    "available_scope": "abstract",
    "read_scope": "abstract",
}
QUOTE = "the corresponding abstract without its conclusion"


class RpcError(Exception):
    def __init__(self, code, reason, action, message, details=None):
        super().__init__(message)
        self.code = code
        self.issue = {"reason": reason, "next_action": action, "retryable": False}
        if details is not None:
            self.issue["details"] = details


def invalid(message):
    return RpcError(-32602, "INVALID_PARAMS", "correct_request", message)


def missing(message):
    return RpcError(-32001, "NOT_FOUND", "refresh_data", message)


def required(params, key):
    value = params.get(key)
    if not isinstance(value, str) or not value.strip():
        raise invalid(f"{key} must be a nonempty string.")
    return value


class Worker:
    writes = {
        "topic.create", "session.create", "task.prepare", "task.start", "task.cancel",
        "candidate.decide", "reader.bookmark", "note.save",
    }

    def __init__(self, directory, send):
        directory.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(directory / "workspace.sqlite3", check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS records (
                kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id)
            );
            CREATE TABLE IF NOT EXISTS operations (
                method TEXT NOT NULL, id TEXT NOT NULL, params TEXT NOT NULL, result TEXT NOT NULL,
                PRIMARY KEY (method, id)
            );
            CREATE TABLE IF NOT EXISTS events (
                task_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (task_id, seq)
            );
        """)
        self.send = send
        self.lock = threading.RLock()
        self.subscriptions = set()
        self.jobs = queue.Queue()
        with self.db:
            for task in self.rows("task"):
                if task["status"] in ("queued", "running"):
                    self.finish(task, "failed", issue={
                        "reason": "PROCESS_INTERRUPTED", "retryable": True, "next_action": "retry"
                    })
        self.runner = threading.Thread(target=self.run_jobs, daemon=True)
        self.runner.start()

    def rows(self, kind):
        return [json.loads(row[0]) for row in self.db.execute(
            "SELECT data FROM records WHERE kind = ? ORDER BY rowid DESC", (kind,)
        )]

    def get(self, kind, identifier_):
        row = self.db.execute("SELECT data FROM records WHERE kind = ? AND id = ?", (kind, identifier_)).fetchone()
        if row is None:
            raise missing(f"{kind.replace('_', ' ').capitalize()} was not found.")
        return json.loads(row[0])

    def put(self, kind, identifier_, data):
        self.db.execute("""
            INSERT INTO records VALUES (?, ?, ?)
            ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data
        """, (kind, identifier_, encode(data)))

    def topic(self, params):
        return self.get("topic", required(params, "topic_id"))["topic_id"]

    def session(self, params):
        session = self.get("session", required(params, "session_id"))
        if session["topic_id"] != self.topic(params):
            raise missing("Session is outside the requested topic.")
        return session

    def task(self, params):
        return self.get("task", required(params, "task_id"))

    def emit(self, task, kind, payload):
        task["last_event_seq"] += 1
        data = {
            "task_id": task["task_id"], "run_id": task["run_id"], "event_seq": task["last_event_seq"],
            "type": kind, "payload": payload,
        }
        self.put("task", task["task_id"], task)
        self.db.execute("INSERT INTO events VALUES (?, ?, ?)", (task["task_id"], data["event_seq"], encode(data)))
        return data

    def finish(self, task, status, **result):
        task.update(status=status, **result)
        return self.emit(task, "task.finished", {"status": status, **result})

    def send_events(self, events):
        for data in events:
            if data["task_id"] in self.subscriptions:
                self.send({"jsonrpc": "2.0", "method": "task.event", "params": data})

    def process(self, request):
        rpc_id = request.get("id") if isinstance(request, dict) else None
        response = {"jsonrpc": "2.0", "id": rpc_id}
        after = []
        with self.lock:
            try:
                if not isinstance(rpc_id, str) or not isinstance(request.get("method"), str) or request.get("jsonrpc") != "2.0":
                    raise RpcError(-32600, "INVALID_REQUEST", "correct_request", "Expected a JSON-RPC 2.0 request.")
                params = request.get("params", {})
                if not isinstance(params, dict):
                    raise invalid("params must be an object.")
                with self.db:
                    response["result"] = self.call(request["method"], params, after)
            except RpcError as failure:
                after.clear()
                response["error"] = {"code": failure.code, "message": str(failure), "data": failure.issue}
            except Exception as failure:
                after.clear()
                print(f"PaperTrace worker: {type(failure).__name__}", file=sys.stderr)
                response["error"] = {"code": -32603, "message": "The local worker failed."}
            self.send(response)
            for action in after:
                action()

    def call(self, method, params, after):
        if method in self.writes:
            operation = required(params, "operation_id")
            fingerprint = encode(params)
            row = self.db.execute(
                "SELECT params, result FROM operations WHERE method = ? AND id = ?", (method, operation)
            ).fetchone()
            if row is not None:
                if row[0] != fingerprint:
                    raise RpcError(-32002, "OPERATION_CONFLICT", "use_new_operation_id", "Operation key already used with different parameters.")
                return json.loads(row[1])
            result = self.dispatch(method, params, after)
            self.db.execute("INSERT INTO operations VALUES (?, ?, ?, ?)", (method, operation, fingerprint, encode(result)))
            return result
        return self.dispatch(method, params, after)

    def dispatch(self, method, params, after):
        if method == "protocol.version":
            return {"major": 0, "minor": 4}
        if method == "topic.create":
            topic = {"topic_id": identifier(), "title": required(params, "title").strip()}
            self.put("topic", topic["topic_id"], topic)
            return {"topic_id": topic["topic_id"]}
        if method == "topic.list":
            return {"items": self.rows("topic")}
        if method == "session.create":
            topic, sid = self.topic(params), identifier()
            self.put("session", sid, {"session_id": sid, "topic_id": topic, "updated_at": now(), "turns": []})
            return {"topic_id": topic, "session_id": sid}
        if method == "session.list":
            topic = self.topic(params)
            return {"items": [
                {"session_id": s["session_id"], "updated_at": s["updated_at"], "has_turns": bool(s["turns"]),
                 **({"title": s["turns"][0]["question"]} if s["turns"] else {})}
                for s in self.rows("session") if s["topic_id"] == topic
            ]}
        if method == "session.get":
            session = self.session(params)
            active = self.active("reading_qa", session["session_id"])
            result = {"turns": session["turns"]}
            if active:
                result["active_task_id"] = active["task_id"]
            if "reader" in session:
                result["reader"] = session["reader"]
            return result
        if method in ("task.prepare", "task.start"):
            return self.accept(method, params, after)
        if method == "task.get":
            task = self.task(params)
            return {key: task[key] for key in ("task_id", "run_id", "last_event_seq", "status", "result", "issue") if key in task}
        if method == "task.subscribe":
            task = self.task(params)
            cursor = params.get("after_seq")
            if type(cursor) is not int or cursor < 0:
                raise invalid("after_seq must be a nonnegative integer.")
            if cursor > task["last_event_seq"]:
                raise RpcError(-32003, "INVALID_CURSOR", "refresh_task", "Cursor is ahead of saved events.")
            task_id = task["task_id"]
            events = [json.loads(row[0]) for row in self.db.execute(
                "SELECT data FROM events WHERE task_id = ? AND seq > ? ORDER BY seq", (task_id, cursor)
            )]
            self.subscriptions.add(task_id)
            after.append(lambda: self.send_events(events))
            return {"task_id": task_id}
        if method == "task.cancel":
            task = self.task(params)
            if task["status"] in ("queued", "running"):
                event = self.finish(task, "cancelled")
                after.append(lambda: self.send_events([event]))
            return {"task_id": task["task_id"], "status": task["status"]}
        if method == "task.history":
            topic = self.topic(params) if "topic_id" in params else None
            return {"items": [
                {key: t[key] for key in ("task_id", "run_id", "topic_id", "session_id", "kind", "label", "status", "started_at", "steps") if key in t}
                for t in self.rows("task") if topic is None or t["topic_id"] == topic
            ]}
        if method == "discovery.latest":
            topic = self.topic(params)
            result = {}
            latest = next((s for s in self.rows("search") if s["topic_id"] == topic), None)
            if latest:
                result.update(search_id=latest["search_id"], task_id=latest["task_id"])
            active = self.active("discovery", topic)
            if active:
                result["active_task_id"] = active["task_id"]
            return result
        if method == "discovery.get":
            return self.search_result(self.search(params))
        if method == "discovery.steps":
            task = self.task(params)
            if task["kind"] != "discovery":
                raise missing("Discovery task was not found.")
            events = self.db.execute("SELECT data FROM events WHERE task_id = ? ORDER BY seq", (task["task_id"],))
            return {"steps": [e["payload"] for (row,) in events if (e := json.loads(row))["type"] == "discovery.step"]}
        if method == "candidate.decide":
            return self.decide(params)
        if method in ("library.list", "library.catalog"):
            topic = self.topic(params) if "topic_id" in params else None
            papers = [p for p in self.rows("paper") if topic is None or topic in p["topic_ids"]]
            if method == "library.list":
                return {"items": [{k: p[k] for k in ("paper_id", "title", "topic_ids", "source_versions")} for p in papers]}
            return {"papers": papers, "reviews": [], "trash": []}
        if method in ("source.read_abstract", "reader.position", "reader.bookmark"):
            source = self.source(required(params, "source_version_id"), self.topic(params))
            if method == "source.read_abstract":
                return source
            session = self.session(params) if "session_id" in params else None
            position_key = encode([params["topic_id"], params.get("session_id"), source["source_version_id"]])
            if method == "reader.position":
                try:
                    return self.get("position", position_key)
                except RpcError:
                    return {}
            pid = required(params, "passage_id")
            if not any(p["passage_id"] == pid for p in source["passages"]):
                raise missing("Passage was not found.")
            position = {"passage_id": pid}
            self.put("position", position_key, position)
            if session:
                session["reader"] = {"source_version_id": source["source_version_id"], **position}
                self.put("session", session["session_id"], session)
            return position
        if method == "evidence.locate":
            anchor = self.get("anchor", required(params, "anchor_id"))
            if anchor["topic_id"] != self.topic(params) or anchor["message_id"] != required(params, "message_id"):
                raise missing("Evidence does not belong to that answer.")
            return {"anchor": anchor["value"], "source": self.get("source", anchor["value"]["source_version_id"])}
        if method == "services.get":
            return {"revision": "local-contract", "model_id": "", "models": [], "budget": {
                "calls": 0, "tokens": 0, "minutes": 1, "cost": 0,
            }, "ask_before_overage": True, "services": []}
        if method == "workspace.activity":
            if "topic_id" in params:
                self.topic(params)
            return {"items": [], "watches": []}
        if method == "note.list":
            topic = self.topic(params)
            return {"items": [n["value"] for n in self.rows("note") if n["topic_id"] == topic]}
        if method == "note.save":
            return self.save_note(params)
        raise RpcError(-32601, "METHOD_NOT_FOUND", "refresh_data", f"Method {method} is not available in the local integration worker.")

    def save_note(self, params):
        topic = self.topic(params)
        session = self.session(params) if "session_id" in params else None
        anchors = params.get("anchor_ids")
        origin = params.get("origin")
        if not isinstance(anchors, list) or any(not isinstance(a, str) for a in anchors) or origin not in ("user", "answer", "comparison", "citation"):
            raise invalid("Invalid note anchors or origin.")
        for anchor in anchors:
            if self.get("anchor", anchor)["topic_id"] != topic:
                raise missing("Note evidence is outside this topic.")
        history = []
        if "note_id" in params:
            note_id = required(params, "note_id")
            saved = self.get("note", note_id)
            if saved["topic_id"] != topic:
                raise missing("Note is outside this topic.")
            previous = saved["value"]
            if params.get("base_revision") != previous["revision"]:
                raise RpcError(-32002, "OPERATION_CONFLICT", "refresh_data", "Note has a newer revision.")
            history = [*previous["history"], {k: previous[k] for k in ("revision", "text", "anchor_ids", "origin")}]
        else:
            note_id = identifier()
        note = {"note_id": note_id, "revision": identifier(), "text": required(params, "text"),
                "anchor_ids": anchors, "origin": origin, "history": history}
        if session:
            note["session_id"] = session["session_id"]
        self.put("note", note_id, {"topic_id": topic, "value": note})
        return note

    def active(self, kind, scope):
        return next((t for t in self.rows("task") if t["kind"] == kind and t["target"] == scope
                     and t["status"] in ("queued", "running")), None)

    def source(self, version, topic, paper=None):
        source = self.get("source", version)
        entry = self.get("paper", source["paper_id"])
        if topic not in entry["topic_ids"] or (paper is not None and source["paper_id"] != paper):
            raise missing("Source version is outside the selected paper or topic.")
        return source

    def search(self, params, key="search_id"):
        saved = self.get("search", required(params, key))
        if saved["topic_id"] != self.topic(params):
            raise missing("Search is outside the requested topic.")
        return saved

    def search_result(self, saved):
        return {"search_id": saved["search_id"], "coverage": saved["coverage"],
                "candidates": [c for c in saved["candidates"] if c["decision"] != "exclude"],
                "excluded": [c for c in saved["candidates"] if c["decision"] == "exclude"]}

    def accept(self, method, params, after):
        topic, kind = self.topic(params), required(params, "kind")
        input_ = params.get("input")
        if not isinstance(input_, dict):
            raise invalid("input must be an object.")
        task_data = {"topic_id": topic, "kind": kind, "input": input_}
        if kind == "discovery":
            if "previous_search_id" in input_:
                if set(input_) != {"previous_search_id"}:
                    raise invalid("Refinement takes only previous_search_id.")
                label = self.search({"topic_id": topic, **input_}, "previous_search_id")["query"]
            else:
                label = required(input_, "query")
                filters = input_.get("filters", {})
                if not isinstance(filters, dict) or set(filters) - {"year_from", "year_to"}:
                    raise invalid("The local sample supports year filters only.")
                low, high = filters.get("year_from", 1), filters.get("year_to", 9999)
                if type(low) is not int or type(high) is not int or not 1 <= low <= high <= 9999:
                    raise invalid("Invalid year range.")
            target = topic
        elif kind == "reading_qa":
            target = self.session(params)["session_id"]
            task_data["session_id"] = target
            label = required(input_, "question")
            sources = input_.get("sources")
            if not isinstance(sources, list) or not sources or not all(isinstance(s, dict) for s in sources):
                raise invalid("At least one paper version must be selected.")
            seen = set()
            for item in sources:
                version = required(item, "source_version_id")
                if version in seen or item.get("requested_scope") not in ("abstract", "full_text"):
                    raise invalid("Duplicate version or invalid reading scope.")
                seen.add(version)
                self.source(version, topic, required(item, "paper_id"))
        else:
            raise RpcError(-32601, "METHOD_NOT_FOUND", "refresh_data", "This task is not available in the local integration worker.")
        fingerprint = encode(task_data)
        if method == "task.prepare":
            cid = identifier()
            self.put("confirmation", cid, {"fingerprint": fingerprint, "used": False})
            return {"confirmation_id": cid, "transfers": []}
        cid = required(params, "confirmation_id")
        try:
            confirmation = self.get("confirmation", cid)
        except RpcError:
            confirmation = {}
        if confirmation.get("used") or confirmation.get("fingerprint") != fingerprint:
            raise RpcError(-32012, "CONFIRMATION_REQUIRED", "confirm_task", "Confirm the current task inputs before starting.")
        existing = self.active(kind, target)
        if existing:
            raise RpcError(-32013, "TASK_IN_PROGRESS", "open_task", "A task is already running.", {"task_id": existing["task_id"]})
        tid = identifier()
        task = {**task_data, "target": target, "task_id": tid, "run_id": identifier(), "status": "queued",
                "label": label, "steps": [], "last_event_seq": 0, "started_at": now()}
        if kind == "reading_qa":
            task["scope_id"] = identifier()
        confirmation["used"] = True
        self.put("confirmation", cid, confirmation)
        self.put("task", tid, task)
        after.append(lambda: self.jobs.put(tid))
        return {key: task[key] for key in ("task_id", "run_id", "status", "scope_id") if key in task}

    def decide(self, params):
        saved = self.search(params)
        cid, action = required(params, "candidate_id"), required(params, "decision")
        candidate = next((c for c in saved["candidates"] if c["candidate_id"] == cid), None)
        if candidate is None:
            raise missing("Candidate was not found in the requested search.")
        if action not in ("add", "pending", "hold", "exclude"):
            raise invalid("Invalid candidate decision.")
        if candidate["decision"] == "added" and action != "add":
            raise RpcError(-32009, "INVALID_TRANSITION", "refresh_data", "This candidate is already in the topic.")
        result = {"candidate_id": cid, "decision": action}
        if action == "add":
            paper = next((p for p in self.rows("paper") if p["identity"] == candidate["doi"]), None)
            if paper is None:
                pid, version = identifier(), identifier()
                paper = {"paper_id": pid, "title": candidate["title"], "topic_ids": [], "authors": candidate["authors"],
                         "identity": candidate["doi"], "tags": [], "changes": [],
                         "source_versions": [{"source_version_id": version, "available_scope": "abstract"}],
                         "files": [{"source_version_id": version, "name": candidate["title"], "role": "abstract"}]}
                self.put("source", version, {"paper_id": pid, "source_version_id": version, "passages": [
                    {"passage_id": f"{version}-{i}", "text": text}
                    for i, text in enumerate(candidate["abstract"].split("\n\n"), 1)
                ]})
            topic = saved["topic_id"]
            linked = topic in paper["topic_ids"]
            if not linked:
                paper["topic_ids"].append(topic)
                self.put("paper", paper["paper_id"], paper)
            result.update(decision="added", paper_id=paper["paper_id"], **paper["source_versions"][0],
                          link_status="already_linked" if linked else "linked")
        candidate["decision"] = result["decision"]
        self.put("search", saved["search_id"], saved)
        return result

    def run_jobs(self):
        while True:
            task_id = self.jobs.get()
            if task_id is None:
                return
            with self.lock:
                task = self.get("task", task_id)
                if task["status"] != "queued":
                    continue
                task["status"] = "running"
                discovery = task["kind"] == "discovery"
                with self.db:
                    event = self.emit(task, "task.progress", {
                        "stage": "searching" if discovery else "reading", "message": "Running local contract sample."
                    })
                self.send_events([event])
            with self.lock:
                task = self.get("task", task_id)
                if task["status"] != "running":
                    continue
                try:
                    with self.db:
                        events = self.run_discovery(task) if discovery else self.run_reading(task)
                except Exception as failure:
                    print(f"PaperTrace task: {type(failure).__name__}", file=sys.stderr)
                    with self.db:
                        events = [self.finish(self.get("task", task_id), "failed", issue={
                            "reason": "TEMPORARILY_UNAVAILABLE", "retryable": True, "next_action": "retry"
                        })]
                self.send_events(events)

    def run_discovery(self, task):
        input_ = task["input"]
        previous = self.get("search", input_["previous_search_id"]) if "previous_search_id" in input_ else None
        filters = previous["filters"] if previous else input_.get("filters", {})
        query = previous["query"] if previous else input_["query"]
        candidates = []
        if filters.get("year_from", 1) <= PUBMEDQA["year"] <= filters.get("year_to", 9999):
            excluded = previous and any(c["decision"] == "exclude" for c in previous["candidates"])
            linked = any(p["identity"] == PUBMEDQA["doi"] and task["topic_id"] in p["topic_ids"] for p in self.rows("paper"))
            decision = "added" if linked else ("exclude" if excluded else "pending")
            candidates.append({**PUBMEDQA, "candidate_id": identifier(), "decision": decision})
        sid = identifier()
        search = {"search_id": sid, "task_id": task["task_id"], "topic_id": task["topic_id"],
                  "query": query, "filters": filters, "candidates": candidates,
                  "coverage": {"searched_angles": ["Local contract fixture"], "gaps": ["Live search is not connected."]}}
        self.put("search", sid, search)
        step = {"action": "search", "query": query, "source": "Local PubMedQA fixture",
                "observation": "One fixture matched." if candidates else "No fixture matched the selected years."}
        task["steps"] = [{"kind": "tool", "title": "Read local search fixture", "detail": step["observation"]}]
        return [self.emit(task, "discovery.step", step), self.finish(task, "completed", result=self.search_result(search))]

    def run_reading(self, task):
        input_ = task["input"]
        message_id = identifier()
        sentences, reads = [], []
        for selected in input_["sources"]:
            vid = selected["source_version_id"]
            source = self.source(vid, task["topic_id"], selected["paper_id"])
            reads.append({"source_version_id": vid, "read_scope": "abstract"})
            for passage in source["passages"]:
                if QUOTE not in passage["text"]:
                    continue
                aid = identifier()
                anchor = {"anchor_id": aid, "paper_id": source["paper_id"], "source_version_id": vid,
                          "read_scope": "abstract", "quote": QUOTE, "location": {
                              "view": "abstract", "precision": "paragraph", "passage_id": passage["passage_id"],
                              "text_excerpt": passage["text"],
                          }}
                self.put("anchor", aid, {"topic_id": task["topic_id"], "message_id": message_id, "value": anchor})
                sentences.append({"text": "The PubMedQA fixture uses the corresponding abstract without its conclusion.",
                                  "assessment": "supported", "anchor_ids": [aid]})
                break
        if not sentences:
            sentences.append({"text": "The local sample did not establish a supporting passage.",
                              "assessment": "evidence_not_established", "anchor_ids": []})
        answer = {"scope_id": task["scope_id"], "message_id": message_id, "read_sources": reads, "sentences": sentences}
        session = self.get("session", task["session_id"])
        session["turns"].append({"task_id": task["task_id"], "question": input_["question"], "answer": answer})
        session["updated_at"] = now()
        self.put("session", session["session_id"], session)
        task["steps"] = [{"kind": "tool", "title": "Read saved abstract", "detail": "Checked the local fixture passage."}]
        delta = self.emit(task, "answer.delta", {"text": " ".join(s["text"] for s in sentences)})
        if any(s["requested_scope"] == "full_text" for s in input_["sources"]):
            final = self.finish(task, "partial", result=answer, issue={
                "reason": "FULL_TEXT_REQUIRED", "retryable": False, "next_action": "attach_full_text"
            })
        else:
            final = self.finish(task, "completed", result=answer)
        return [delta, final]

    def close(self):
        self.jobs.put(None)
        self.runner.join()
        self.db.close()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: papertrace.py <workspace-directory>")
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    def send(message):
        print(encode(message), flush=True)

    worker = Worker(Path(sys.argv[1]), send)
    try:
        for line in sys.stdin:
            try:
                request = json.loads(line)
            except ValueError:
                send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                continue
            worker.process(request)
    finally:
        worker.close()


if __name__ == "__main__":
    main()
