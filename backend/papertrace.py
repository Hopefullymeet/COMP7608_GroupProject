"""Local PaperTrace v0.4 worker. Stdout is reserved for newline-delimited RPC."""

import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
import datetime
import json
import math
import os
from pathlib import Path
import queue
import re
import sqlite3
import sys
import threading
from uuid import uuid4

from dsh import Dsh, DshFailure, ENDPOINT, MODEL
from literature import LiteratureError, MAX_VERSIONS, digest, init_corpus
from workbench import Workbench
from citations import CitationWorkspace, init_citations
from reader import Reader
from bibliography import (OPENALEX, PROVIDERS, PublicServiceError, arxiv_id, bibliography_records, doi, identity_keys, imported_metadata,
                          lookup_target, metadata_from_provider, normalize_venue, openalex_search, selected_metadata)
from venue_ranks import init_venue_ranks, issns, lookup_rankings


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
        "comparison.save", "draft.import", "draft.resolve_reference", "audit.review", "audit.save_to_wiki", "export.create",
        "topic.create", "topic.rename", "session.create", "session.rename", "task.prepare", "task.start", "task.cancel",
        "candidate.decide", "reader.bookmark", "note.save", "library.import_pdf", "library.set_alias", "synthesis.review",
        "reader.mark_save", "reader.mark_delete", "reader.answer_save", "reader.mark_to_wiki",
        "services.save",
        "library.commit_identifier", "library.update_metadata", "workspace.archive", "workspace.unarchive", "library.organize",
        "library.preview_bibliography", "library.commit_bibliography",
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
        init_corpus(self.db)
        init_citations(self.db)
        init_venue_ranks(self.db)
        self.citations = CitationWorkspace(self, identifier)
        self.research = Workbench(self, identifier)
        self.reader = Reader(self, identifier)
        self.send = send
        self.lock = threading.RLock()
        self.service_test_lock = threading.Lock()
        self.dsh = Dsh.configured(directory.resolve())
        self.discovery_fixture = os.environ.get("PAPERTRACE_DISCOVERY_FIXTURE") == "1"
        self.openalex_key = os.environ.get("PAPERTRACE_OPENALEX_API_KEY", "").strip()
        self.inflight = {}
        self.closing = threading.Event()
        self.subscriptions = set()
        self.jobs = queue.Queue()
        with self.db:
            for task in self.rows("task"):
                if task["status"] in ("queued", "running"):
                    self.finish(task, "failed", issue={
                        "reason": "PROCESS_INTERRUPTED", "retryable": True, "next_action": "retry"
                    })
        for (version,) in self.db.execute("""
            SELECT p.version_id FROM pdf_files p
            JOIN records r ON r.kind = 'source' AND r.id = p.version_id
            LEFT JOIN citation_index c ON c.version_id = p.version_id WHERE c.version_id IS NULL
        """):
            self.jobs.put(("index", version))
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
        method = request.get("method") if isinstance(request, dict) else None
        with nullcontext() if method in ("services.test", "library.preview_identifier") else self.lock:
            try:
                if not isinstance(rpc_id, str) or not isinstance(request.get("method"), str) or request.get("jsonrpc") != "2.0":
                    raise RpcError(-32600, "INVALID_REQUEST", "correct_request", "Expected a JSON-RPC 2.0 request.")
                params = request.get("params", {})
                if not isinstance(params, dict):
                    raise invalid("params must be an object.")
                if method == "services.test":
                    response["result"] = self.test_service(params)
                elif method == "library.preview_identifier":
                    response["result"] = self.preview_identifier(params)
                else:
                    with self.db:
                        response["result"] = self.call(method, params, after)
            except LiteratureError as failure:
                after.clear()
                issue = {"reason": failure.reason, "retryable": getattr(failure, "retryable", False),
                         "next_action": failure.action}
                response["error"] = {"code": failure.code, "message": str(failure), "data": issue}
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

    def saved_operation(self, method, operation, fingerprint):
        row = self.db.execute(
            "SELECT params, result FROM operations WHERE method = ? AND id = ?", (method, operation)
        ).fetchone()
        if row is not None:
            if row[0] != fingerprint:
                raise RpcError(-32002, "OPERATION_CONFLICT", "use_new_operation_id", "Operation key already used with different parameters.")
            return json.loads(row[1])

    def save_operation(self, method, operation, fingerprint, result):
        self.db.execute("INSERT INTO operations VALUES (?, ?, ?, ?)", (method, operation, fingerprint, encode(result)))

    def call(self, method, params, after):
        if method in self.writes:
            operation = required(params, "operation_id")
            fingerprint = encode(params)
            if method in ("library.import_pdf", "draft.import", "services.save", "library.preview_bibliography"):
                fingerprint = digest(fingerprint.encode("utf-8"))
            saved = self.saved_operation(method, operation, fingerprint)
            if saved is not None:
                return saved
            result = self.dispatch(method, params, after)
            self.save_operation(method, operation, fingerprint, result)
            return result
        return self.dispatch(method, params, after)

    def services_config(self):
        stored = self.rows("service_config")
        settings = stored[0] if stored else {"revision": "local-contract", "model": MODEL}
        available = bool(self.dsh and self.dsh.key)
        return {"revision": settings["revision"], "model_id": MODEL, "models": [{
            "id": MODEL, "label": "DeepSeek", "model": settings["model"], "endpoint": ENDPOINT,
            "local": False, "credential_configured": available,
        }], "budget": {
            "calls": 4 if self.dsh else 0, "tokens": 3200 if self.dsh else 0,
            "minutes": 1.5 if self.dsh else 1, "cost": 0,
        }, "ask_before_overage": True, "services": [] if self.discovery_fixture else [{
            "id": "openalex", "label": "OpenAlex", "kind": "search", "enabled": True,
            "status": "Available", "fields": ["year", "venue"],
        }]}

    def save_services(self, params):
        config = self.services_config()
        if required(params, "base_revision") != config["revision"]:
            raise RpcError(-32011, "STALE_REVISION", "refresh_data", "Settings changed. Reload and try again.")
        models = params.get("models")
        if (params.get("model_id") != MODEL or not isinstance(models, list) or len(models) != 1
                or not isinstance(models[0], dict) or models[0].get("id") != MODEL):
            raise invalid("Select the DeepSeek provider.")
        model = required(models[0], "model").strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", model):
            raise invalid("Use a model ID with up to 128 letters, digits, dots, underscores, or hyphens.")
        if (models[0].get("endpoint") != ENDPOINT or params.get("services") != config["services"]
                or params.get("budget") != config["budget"] or params.get("ask_before_overage") is not True):
            raise RpcError(-32016, "SETTINGS_READ_ONLY", "correct_request", "Only the model ID can currently be edited.")
        if model != config["models"][0]["model"]:
            self.put("service_config", "active", {"revision": identifier(), "model": model})
            config = self.services_config()
        return config

    def dsh_for_task(self, task):
        model = task.get("dsh_model", MODEL)
        return self.dsh.for_model(model) if isinstance(self.dsh, Dsh) else self.dsh

    def test_service(self, params):
        operation = required(params, "operation_id")
        service_id = required(params, "id")
        fingerprint = encode({"id": service_id})
        with self.service_test_lock:
            with self.lock:
                saved = self.saved_operation("services.test", operation, fingerprint)
                if saved is not None:
                    return saved
                if service_id != MODEL:
                    raise missing("This service was not found.")
                model = self.services_config()["models"][0]["model"]
                runtime = self.dsh_for_task({"dsh_model": model})
            if runtime is None:
                result = {"ok": False, "message": "DeepSeek Harness is not configured in the desktop host."}
            else:
                try:
                    runtime.probe(self.closing)
                    result = {"ok": True, "message": f"{model} responded through DeepSeek Harness."}
                except DshFailure as failure:
                    message = {
                        "SERVICE_AUTH_FAILED": "Check the DeepSeek API key in the desktop host.",
                        "SERVICE_QUOTA_EXHAUSTED": "DeepSeek reported insufficient balance.",
                        "SERVICE_RATE_LIMITED": "DeepSeek is rate limiting requests. Try again shortly.",
                        "TASK_TIMEOUT": "DeepSeek Harness did not respond in time.",
                    }.get(failure.issue["reason"], "DeepSeek Harness could not reach the saved model. Check the model ID and network.")
                    result = {"ok": False, "message": message}
            with self.lock, self.db:
                self.save_operation("services.test", operation, fingerprint, result)
            return result

    def dispatch(self, method, params, after):
        if method == "protocol.version":
            return {"major": 0, "minor": 4}
        if method == "topic.create":
            topic = {"topic_id": identifier(), "title": required(params, "title").strip()}
            self.put("topic", topic["topic_id"], topic)
            return {"topic_id": topic["topic_id"]}
        if method == "topic.list":
            return {"items": [t for t in self.rows("topic") if not t.get("archived")]}
        if method in ("workspace.archive", "workspace.unarchive"):
            return self.set_archived(params, method == "workspace.archive")
        if method == "workspace.archived":
            return self.archived()
        if method == "session.create":
            topic, sid = self.topic(params), identifier()
            self.put("session", sid, {"session_id": sid, "topic_id": topic, "updated_at": now(), "turns": []})
            return {"topic_id": topic, "session_id": sid}
        if method in ("topic.rename", "session.rename"):
            title = required(params, "title").strip()
            if len(title) > 160:
                raise invalid("Name must be at most 160 characters.")
            kind = method.split(".")[0]
            record = self.session(params) if kind == "session" else self.get("topic", self.topic(params))
            key = f"{kind}_id"
            record["title"] = title
            self.put(kind, record[key], record)
            return {key: record[key], "title": title, **({"topic_id": record["topic_id"]} if kind == "session" else {})}
        if method == "session.list":
            topic = self.topic(params)
            if self.get("topic", topic).get("archived"):
                return {"items": []}
            return {"items": [
                {"session_id": s["session_id"], "updated_at": s["updated_at"], "has_turns": bool(s["turns"]),
                 **({"title": s["title"]} if "title" in s else
                    {"title": s["turns"][0]["question"]} if s["turns"] else {})}
                for s in self.rows("session") if s["topic_id"] == topic and not s.get("archived")
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
                signal = self.inflight.get(task["task_id"])
                if signal:
                    after.append(signal.set)
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
        if method == "literature.refs":
            return self.citations.refs(self.topic(params), required(params, "source_version_id"),
                                       params.get("direction", "outgoing"))
        if method == "draft.import":
            return self.citations.import_draft(self.topic(params), params)
        if method == "draft.resolve_reference":
            return self.citations.resolve_reference(self.topic(params), params)
        if method == "draft.list":
            topic = self.topic(params)
            return {"items": [self.citations.public(r) for r in self.rows("pdf_draft") if r["topic_id"] == topic]}
        if method == "draft.page":
            return self.citations.page(self.topic(params), params)
        if method == "draft.prose":
            return self.citations.prose(self.topic(params), params)
        if method == "audit.save_to_wiki":
            return self.citations.save_to_wiki(self.topic(params), params)
        if method == "audit.review":
            return self.citations.review(self.topic(params), params)
        if method == "export.create":
            return self.citations.export(self.topic(params), params)
        if method == "library.import_pdf":
            return self.research.import_pdf(self.topic(params), params)
        if method == "comparison.list":
            topic = self.topic(params)
            return {"items": [{key: value for key, value in row.items() if key != "topic_id"}
                              for row in self.rows("comparison") if row["topic_id"] == topic]}
        if method == "comparison.save":
            return self.research.save_comparison(self.topic(params), params)
        if method == "synthesis.list":
            return self.research.results(self.topic(params))
        if method == "synthesis.wiki":
            return self.research.wiki(self.topic(params))
        if method == "synthesis.review":
            required(params, "record_id")
            return self.research.review(self.topic(params), params)
        if method in ("source.read", "source.page"):
            version, topic = required(params, "source_version_id"), self.topic(params)
            if method == "source.page" and "anchor_id" in params:
                anchor = self.get("anchor", required(params, "anchor_id"))
                value = anchor["value"]
                if (anchor["topic_id"] != topic or value["source_version_id"] != version
                        or value["location"].get("page") != params.get("page")):
                    raise missing("This evidence does not identify the requested page.")
                source = self.get("source", version)
            else:
                source = self.source(version, topic)
            return (self.research.document(source) if method == "source.read"
                    else self.research.page(source, params.get("page")))
        if method == "reader.pdf":
            _, pdf = self.reader.content(self.topic(params), required(params, "source_version_id"))
            return {"content": base64.b64encode(pdf).decode("ascii")}
        if method == "reader.marks":
            return self.reader.list(self.topic(params), required(params, "source_version_id"))
        if method == "reader.mark_save":
            return self.reader.save(self.topic(params), params)
        if method == "reader.mark_delete":
            return self.reader.delete(self.topic(params), params)
        if method == "reader.answers":
            topic = self.topic(params)
            session = self.session(params)["session_id"] if "session_id" in params else None
            return {"items": [item for item in self.rows("reader_answer") if item["topic_id"] == topic
                              and (session is None or item.get("session_id") == session)]}
        if method == "reader.answer_save":
            required(params, "answer_id")
            return self.reader.save_answer_to_wiki(self.topic(params), params)
        if method == "reader.mark_to_wiki":
            required(params, "source_version_id")
            required(params, "mark_id")
            return self.reader.save_mark_to_wiki(self.topic(params), params)
        if method == "reader.export":
            return self.reader.export(self.topic(params), required(params, "source_version_id"))
        if method == "visual.search":
            return self.reader.search(self.topic(params), params)
        if method == "visual.objects":
            return {"items": self.reader.objects(self.topic(params), required(params, "source_version_id"))}
        if method == "visual.crop":
            return self.reader.material(self.topic(params), params)
        if method == "visual.capabilities":
            return {"vision": self.reader.has_vision}
        if method == "evidence.open":
            anchor = self.get("anchor", required(params, "anchor_id"))
            value = anchor["value"]
            topic = self.topic(params) if "topic_id" in params else anchor["topic_id"]
            if topic != anchor["topic_id"]:
                raise missing("Evidence is outside the selected topic.")
            source = self.get("source", value["source_version_id"])
            if value["location"].get("precision") == "region":
                return {"anchor_id": value["anchor_id"], "topic_id": topic, "read_scope": "full_text",
                        "source": {"source_version_id": source["source_version_id"], "paper_id": source["paper_id"],
                                   "passages": []}, "passage_id": "", "quote": value["quote"],
                        "region": {"page": value["location"]["page"], "rect": value["location"]["rect"]}}
            pid = value["location"]["passage_id"]
            return {"anchor_id": value["anchor_id"], "topic_id": topic, "source": self.research.document(source, pid),
                    "passage_id": pid, "quote": value["quote"], "read_scope": value["read_scope"]}
        if method == "library.organize":
            return self.organize_papers(params)
        if method == "library.set_alias":
            topic = self.topic(params)
            paper_id = required(params, "paper_id")
            paper = self.get("paper", paper_id)
            if topic not in paper["topic_ids"]:
                raise missing("Paper is outside the selected topic.")
            alias = params.get("alias")
            if not isinstance(alias, str) or len(alias.strip()) > 80:
                raise invalid("A paper alias must be at most 80 characters.")
            alias = alias.strip()
            if alias:
                paper["alias"] = alias
            else:
                paper.pop("alias", None)
            self.put("paper", paper_id, paper)
            return {"paper_id": paper_id, "alias": alias}
        if method == "library.preview_bibliography":
            return self.preview_bibliography(params)
        if method == "library.commit_bibliography":
            return self.commit_bibliography(params)
        if method == "library.commit_identifier":
            topic = self.topic(params)
            preview = self.get("bibliography_preview", required(params, "preview_id"))
            if preview["topic_id"] != topic:
                raise missing("The preview is outside the selected topic.")
            target = self.paper_in_topic(params) if "paper_id" in params else None
            paper, linked = self.add_bibliographic_paper(topic, preview["metadata"], target)
            return {"paper_id": paper["paper_id"], **paper["source_versions"][0], "already_linked": linked}
        if method == "library.metadata":
            year = params.get("edition_year")
            if year is not None and (type(year) is not int or not 1900 <= year <= 9999):
                raise invalid("Enter a valid catalog year.")
            return self.paper_details(self.paper_in_topic(params), year)
        if method == "library.update_metadata":
            return self.update_metadata(params)
        if method in ("library.list", "library.catalog"):
            topic = self.topic(params) if "topic_id" in params else None
            papers = [p for p in self.rows("paper") if topic is None or topic in p["topic_ids"]]
            if method == "library.list":
                items = [{**{k: p[k] for k in ("paper_id", "title", "topic_ids", "alias") if k in p},
                          "source_versions": [{**v, "pdf_available": bool(
                              self.get("source", v["source_version_id"]).get("page_count"))}
                              for v in p["source_versions"]]} for p in papers]
                return {"items": items}
            return {"papers": papers, "reviews": [], "trash": []}
        if method in ("source.read_abstract", "reader.position", "reader.bookmark"):
            source = self.source(required(params, "source_version_id"), self.topic(params))
            if method == "source.read_abstract":
                return source
            session = self.session(params) if "session_id" in params else None
            position_key = encode([params["topic_id"], params.get("session_id"), source["source_version_id"]])
            try:
                position = self.get("position", position_key)
            except RpcError:
                position = {}
            if method == "reader.position":
                return position
            if "page" in params:
                page = params["page"]
                if type(page) is not int or not 1 <= page <= source.get("page_count", 0):
                    raise invalid("Page is outside this PDF.")
                if position.get("page") != page:
                    position.pop("passage_id", None)
                position["page"] = page
                for field, low, high in (("zoom", 0.1, 10), ("offset", 0, 1)):
                    value = params.get(field)
                    if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
                        raise invalid(f"Invalid reading {field}.")
                    position[field] = value
            else:
                pid = required(params, "passage_id")
                passages = self.research.document(source, pid)["passages"]
                if not passages:
                    raise missing("Passage was not found.")
                position["passage_id"] = pid
                if "page" in position and passages[0].get("page") != position["page"]:
                    position = {"passage_id": pid}
            self.put("position", position_key, position)
            if session:
                session["reader"] = {"source_version_id": source["source_version_id"], **position}
                self.put("session", session["session_id"], session)
            return position if "page" in params else {"passage_id": pid}
        if method == "evidence.locate":
            anchor = self.get("anchor", required(params, "anchor_id"))
            if anchor["topic_id"] != self.topic(params) or anchor["message_id"] != required(params, "message_id"):
                raise missing("Evidence does not belong to that answer.")
            value = anchor["value"]
            if value["location"].get("precision") == "region":
                return self.dispatch("evidence.open", params, after)
            source = self.get("source", value["source_version_id"])
            if value["read_scope"] == "full_text":
                pid = value["location"]["passage_id"]
                return {"anchor_id": value["anchor_id"], "topic_id": anchor["topic_id"],
                        "source": self.research.document(source), "passage_id": pid, "quote": value["quote"],
                        "read_scope": "full_text"}
            return {"anchor": value, "source": source}
        if method == "services.get":
            return self.services_config()
        if method == "services.save":
            return self.save_services(params)
        if method == "services.credentials":
            raise RpcError(-32015, "CREDENTIALS_HOST_REQUIRED", "configure_service",
                           "Configure the DeepSeek API key in the desktop host.")
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

    def organize_papers(self, params):
        ids = params.get("paper_ids")
        if (not isinstance(ids, list) or not ids or len(ids) > 500
                or any(not isinstance(pid, str) or not pid.strip() for pid in ids)
                or len(ids) != len(set(ids))):
            raise invalid("Choose up to 500 distinct papers.")
        action, value = required(params, "action"), required(params, "value").strip()
        if action not in ("link", "unlink", "tag", "untag"):
            raise invalid("Choose a supported organization action.")
        if action in ("link", "unlink"):
            value = self.topic({"topic_id": value})
            field = "topic_ids"
        else:
            if len(value) > 80:
                raise invalid("A tag must be at most 80 characters.")
            field = "tags"
        papers = [self.get("paper", pid) for pid in ids]
        changed = 0
        adding = action in ("link", "tag")
        for paper in papers:
            previous = paper.get(field, [])
            if adding == (value in previous):
                continue
            paper[field] = [*previous, value] if adding else [item for item in previous if item != value]
            self.put("paper", paper["paper_id"], paper)
            changed += 1
        return {"changed": changed}

    def set_archived(self, params, archived):
        kind, record_id = required(params, "kind"), required(params, "id")
        if kind not in ("topic", "session"):
            raise invalid("Choose a topic or session to archive or restore.")
        record = self.get(kind, record_id)
        if archived:
            record["archived"] = True
        else:
            record.pop("archived", None)
        self.put(kind, record_id, record)
        return {"id": record_id}

    def archived(self):
        topics = {t["topic_id"]: t["title"] for t in self.rows("topic") if t.get("archived")}
        items = [{"id": tid, "kind": "topic", "title": title} for tid, title in topics.items()]
        for session in self.rows("session"):
            if session.get("archived") and session["topic_id"] not in topics:
                title = session.get("title") or (session["turns"][0]["question"] if session["turns"] else "New session")
                items.append({"id": session["session_id"], "kind": "session", "title": title})
        return {"items": items}

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
                **({"provider": saved["provider"]} if "provider" in saved else {}),
                "candidates": [c for c in saved["candidates"] if c["decision"] != "exclude"],
                "excluded": [c for c in saved["candidates"] if c["decision"] == "exclude"]}

    def preview_bibliography(self, params):
        topic, format_ = self.topic(params), required(params, "format")
        content = params.get("content")
        records = bibliography_records(format_, content)
        fingerprint = digest(content.lstrip("\ufeff").replace("\r\n", "\n").encode("utf-8"))
        entries, rows = {}, []
        for index, record in enumerate(records, 1):
            item_id = str(index)
            row = {"item_id": item_id}
            metadata = imported_metadata(record, format_)
            if metadata is None:
                row.update(status="invalid", reason="TITLE_REQUIRED")
            else:
                metadata["source_id"] = f"urn:papertrace:bibliography:{fingerprint}:{index}"
                try:
                    paper = self.find_bibliographic_paper(metadata)
                    row.update(status="ready", metadata=self.public_bibliography_metadata(metadata))
                    if paper:
                        row["existing_paper_id"] = paper["paper_id"]
                    entries[item_id] = metadata
                except RpcError as error:
                    row.update(status="conflict", reason=error.issue["reason"])
            rows.append(row)
        preview_id = identifier()
        self.put("bibliography_batch", preview_id, {"topic_id": topic, "entries": entries})
        return {"preview_id": preview_id, "items": rows}

    @staticmethod
    def public_bibliography_metadata(metadata):
        return {key: value for key, value in selected_metadata(metadata).items() if key != "source_id"}

    def commit_bibliography(self, params):
        topic = self.topic(params)
        batch = self.get("bibliography_batch", required(params, "preview_id"))
        if batch["topic_id"] != topic:
            raise missing("The bibliography preview is outside the selected topic.")
        ids = params.get("item_ids")
        entries = batch["entries"]
        if (not isinstance(ids, list) or not ids or len(ids) > 500
                or any(not isinstance(item, str) or item not in entries for item in ids)
                or len(set(ids)) != len(ids)):
            raise invalid("Choose distinct ready entries from the bibliography preview.")
        items = []
        for item_id in ids:
            try:
                paper, linked = self.add_bibliographic_paper(topic, entries[item_id])
            except RpcError as error:
                items.append({"item_id": item_id, "status": "conflict", "reason": error.issue["reason"]})
                continue
            items.append({"item_id": item_id, "status": "already_linked" if linked else "imported",
                          "paper_id": paper["paper_id"], **paper["source_versions"][0]})
        return {"items": items}

    def preview_identifier(self, params):
        provider, identifier_ = lookup_target(required(params, "identifier"))
        with self.lock:
            topic = self.topic(params)
        metadata = metadata_from_provider(provider, identifier_)
        with self.lock, self.db:
            self.topic(params)
            paper = self.find_bibliographic_paper(metadata)
            preview = {"preview_id": identifier(), "topic_id": topic, "metadata": metadata}
            self.put("bibliography_preview", preview["preview_id"], preview)
            if paper:
                preview["existing_paper_id"] = paper["paper_id"]
            return preview

    def find_bibliographic_paper(self, metadata):
        keys = identity_keys(metadata)
        matches = [p for p in self.rows("paper") if identity_keys(p) & keys]
        if len(matches) > 1:
            raise RpcError(-32018, "IDENTIFIER_ALREADY_LINKED", "refresh_data", "Identifiers match different papers.")
        return matches[0] if matches else None

    def paper_in_topic(self, params):
        topic = self.topic(params)
        paper = self.get("paper", required(params, "paper_id"))
        if topic not in paper["topic_ids"]:
            raise missing("Paper is outside the selected topic.")
        return paper

    def paper_metadata(self, paper):
        return {"paper_id": paper["paper_id"], "revision": paper.get("metadata_revision", "initial"),
                "manual_fields": paper.get("manual_metadata_fields", []),
                "metadata": {"title": paper["title"], "authors": paper["authors"], **paper.get("metadata", {})}}

    def paper_details(self, paper, year=None):
        details = self.paper_metadata(paper)
        metadata = details["metadata"]
        source = metadata.get("provider")
        if not metadata.get("venue") and not metadata.get("issns") and not (
                set(details["manual_fields"]) & {"venue", "issns", "venue_type"}):
            version = paper["source_versions"][0]["source_version_id"]
            row = self.db.execute("SELECT data FROM citation_index WHERE version_id=?", (version,)).fetchone()
            if row:
                found = json.loads(row[0])
                if not metadata.get("doi") and "doi" not in details["manual_fields"] and found.get("doi"):
                    metadata["doi"] = found["doi"]
                if metadata.get("venue_type") != "preprint" and found.get("publication"):
                    metadata.update(found["publication"])
                    source = "PDF"
        details["rankings"] = lookup_rankings(self.db, metadata, year)
        if set(details["manual_fields"]) & {"venue", "issns"}:
            source = "Manual"
        if source:
            details["rankings"]["venue_source"] = source
        return details

    def set_paper_metadata(self, paper, metadata):
        previous = self.paper_metadata(paper)["metadata"]
        if previous != metadata:
            paper.update(metadata=metadata, metadata_revision=identifier(),
                         title=metadata["title"], authors=metadata["authors"])

    def update_metadata(self, params):
        paper = self.paper_in_topic(params)
        current = self.paper_metadata(paper)
        if required(params, "base_revision") != current["revision"]:
            raise RpcError(-32011, "STALE_REVISION", "refresh_data", "Paper metadata changed. Reload and try again.")
        edits = params.get("changes")
        allowed = {"title", "authors", "year", "venue", "doi", "arxiv_id",
                   "issns", "venue_type", "publication_track"}
        if not isinstance(edits, dict) or not edits or set(edits) - allowed:
            raise invalid("Specify editable bibliographic fields.")
        edits = dict(edits)
        for field, value in edits.items():
            if field == "authors":
                if (not isinstance(value, list) or len(value) > 500
                        or any(not isinstance(a, str) or not a.strip() or len(a) > 300 for a in value)):
                    raise invalid("Authors must be a list of names.")
                edits[field] = [a.strip() for a in value]
            elif field == "year":
                if value is not None and (type(value) is not int or not 1 <= value <= 9999):
                    raise invalid("Enter a valid year.")
            elif field == "issns":
                if (not isinstance(value, list) or len(value) > 8 or not all(isinstance(code, str)
                        and re.fullmatch(r"\d{4}-?\d{3}[\dXx]", code) and issns(code) for code in value)):
                    raise invalid("Enter valid ISSN or eISSN values.")
                edits[field] = issns(value)
            elif field in ("venue_type", "publication_track"):
                allowed_values = ("journal", "conference", "preprint", "") if field == "venue_type" else ("regular", "other", "")
                if value not in allowed_values:
                    raise invalid(f"Invalid {field}.")
            else:
                if not isinstance(value, str) or len(value) > 1000 or (field == "title" and not value.strip()):
                    raise invalid(f"Invalid {field}.")
                cleaned = value.strip()
                normalized = {"doi": doi, "arxiv_id": arxiv_id}.get(field, str)(cleaned)
                if cleaned and not normalized:
                    raise invalid(f"Invalid {field}.")
                edits[field] = normalized
        metadata = {**current["metadata"], **edits}
        if "venue" in edits and normalize_venue(edits["venue"]) != normalize_venue(current["metadata"].get("venue", "")):
            for field in ("issns", "venue_type", "publication_track"):
                if field not in edits:
                    metadata.pop(field, None)
        matches = identity_keys(metadata)
        if any(p["paper_id"] != paper["paper_id"] and identity_keys(p) & matches for p in self.rows("paper")):
            raise RpcError(-32018, "IDENTIFIER_ALREADY_LINKED", "refresh_data", "Another paper already uses this identifier.")
        if metadata != current["metadata"] or not set(edits) <= set(current["manual_fields"]):
            self.set_paper_metadata(paper, metadata)
            if paper.get("metadata_revision", "initial") == current["revision"]:
                paper["metadata_revision"] = identifier()
            paper["manual_metadata_fields"] = sorted(set(edits) | set(current["manual_fields"]))
            self.put("paper", paper["paper_id"], paper)
        return self.paper_details(paper)

    def add_bibliographic_paper(self, topic, record, target=None):
        metadata = selected_metadata(record)
        if isinstance(metadata.get("venue"), dict):
            metadata["venue"] = metadata["venue"]["name"]
        paper = self.find_bibliographic_paper(metadata)
        if target and paper and paper["paper_id"] != target["paper_id"]:
            raise RpcError(-32018, "IDENTIFIER_ALREADY_LINKED", "refresh_data", "Another paper already uses this identifier.")
        paper = target or paper
        if paper is None:
            pid, version = identifier(), identifier()
            abstract = record.get("abstract", "")
            scope = "abstract" if abstract else "metadata"
            paper = {"paper_id": pid, "title": metadata["title"], "authors": metadata["authors"],
                     "topic_ids": [], "identity": metadata.get("doi") or metadata.get("source_id") or
                     f"arxiv:{metadata['arxiv_id']}", "tags": [], "changes": [],
                     "metadata": metadata, "metadata_revision": identifier(),
                     "source_versions": [{"source_version_id": version, "available_scope": scope}],
                     "files": [{"source_version_id": version, "name": metadata["title"], "role": scope}]}
            self.put("source", version, {"source_version_id": version, "paper_id": pid, "passages": [
                {"passage_id": f"{version}-{i}", "text": text}
                for i, text in enumerate(abstract.split("\n\n"), 1) if text.strip()]})
        else:
            current = self.paper_metadata(paper)["metadata"]
            if target and any(current.get(key) and metadata.get(key)
                              and current[key] != metadata[key] and not identity_keys(current) & identity_keys(metadata)
                              for key in ("doi", "arxiv_id")):
                raise RpcError(-32018, "IDENTIFIER_ALREADY_LINKED", "refresh_data",
                               "The PDF record already has a different identifier.")
            manual = paper.get("manual_metadata_fields", [])
            confirmed_venue = (current.get("venue_type") == "preprint"
                               and metadata.get("venue_type") in ("journal", "conference")
                               and metadata.get("provider") == "Crossref")
            for key, value in metadata.items():
                if key not in manual and value and (not current.get(key) or (target and key == "title") or
                        (confirmed_venue and key in {"venue", "venue_type", "provider", "metadata_url"})):
                    current[key] = value
            self.set_paper_metadata(paper, current)
        linked = topic in paper["topic_ids"]
        if not linked:
            paper["topic_ids"].append(topic)
        self.put("paper", paper["paper_id"], paper)
        return paper, linked

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
                previous = self.search({"topic_id": topic, **input_}, "previous_search_id")
                label, filters = previous["query"], previous["filters"]
            else:
                label = required(input_, "query").strip()
                if len(label) > 500:
                    raise invalid("The search query must be at most 500 characters.")
                filters = input_.get("filters", {})
                if not isinstance(filters, dict) or set(filters) - {"year_from", "year_to", "venue"}:
                    raise invalid("Unknown discovery filters.")
                low, high = filters.get("year_from", 1), filters.get("year_to", 9999)
                if type(low) is not int or type(high) is not int or not 1 <= low <= high <= 9999:
                    raise invalid("Invalid year range.")
                if "venue" in filters:
                    venue = filters["venue"]
                    if (self.discovery_fixture or not isinstance(venue, str)
                            or len(venue) > 160 or not normalize_venue(venue)):
                        raise invalid("Enter a supported conference name.")
            if not self.discovery_fixture:
                task_data["search_request"] = {"query": label, "filters": filters}
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
        elif kind == "citation_audit":
            draft, _, audit_jobs = self.citations.jobs(topic, input_)
            target, label = draft["draft_id"], draft["name"]
            audit_pending = [j for j in audit_jobs if j["usable"] and j["cached"] is None]
        elif kind == "citation_suggest":
            draft, _, _, sources = self.citations.suggestions(topic, input_)
            target, label = draft["draft_id"], draft["name"]
            task_data["suggestion_sources"] = [s["source_version_id"] for s in sources
                                               if s["available_scope"] == "full_text"]
        elif kind == "reader_question":
            target, _, label = self.reader.question(topic, input_)
            if "session_id" in params:
                task_data["session_id"] = self.session(params)["session_id"]
        elif kind == "visual_index":
            target = required(input_, "source_version_id")
            source, _ = self.reader.content(topic, target)
            label = self.get("paper", source["paper_id"])["title"]
            if not self.reader.has_vision:
                raise RpcError(-32015, "VISION_UNAVAILABLE", "configure_service", "Configure a local vision model.")
        elif kind in ("literature_synthesis", "paper_comparison"):
            label = required(input_, "question").strip()
            if len(label) > 2000:
                raise invalid("The research question must be at most 2000 characters.")
            versions = input_.get("source_versions")
            if (not isinstance(versions, list) or not 2 <= len(versions) <= MAX_VERSIONS
                    or not all(isinstance(v, str) for v in versions) or len(set(versions)) != len(versions)):
                raise invalid("Select two to twelve distinct paper versions.")
            papers = {self.source(v, topic)["paper_id"] for v in versions}
            if len(papers) != len(versions):
                raise invalid("Select only one version per paper.")
            if kind == "paper_comparison":
                dims = input_.get("dimensions")
                if (len(versions) != 2 or not isinstance(dims, list) or not 1 <= len(dims) <= 8
                        or not all(isinstance(d, str) and 0 < len(d.strip()) <= 120 for d in dims)
                        or len(set(dims)) != len(dims)):
                    raise invalid("Select exactly two papers and one to eight distinct comparison dimensions.")
            if input_.get("mode", "wiki") not in ("fixed", "agent", "wiki"):
                raise invalid("Unknown synthesis mode.")
            if not self.dsh or not self.dsh.key:
                raise RpcError(-32015, "MODEL_UNAVAILABLE", "configure_service", "Configure DeepSeek Harness before synthesizing papers.")
            target = topic
        else:
            raise RpcError(-32601, "METHOD_NOT_FOUND", "refresh_data", "This task is not available in the local integration worker.")
        synthesis = kind in ("literature_synthesis", "paper_comparison")
        audit = kind == "citation_audit"
        suggest = kind == "citation_suggest"
        reader_question = kind == "reader_question"
        live = synthesis or (kind == "reading_qa" and self.dsh is not None) or (
            audit and bool(audit_pending) and self.dsh is not None and bool(self.dsh.key))
        live = live or (reader_question and input_["medium"] == "text")
        live = live or (suggest and bool(task_data["suggestion_sources"]) and self.dsh is not None and bool(self.dsh.key))
        if audit:
            task_data["audit_sources"] = {j["job_id"]: j["source"]["source_version_id"] for j in audit_pending} if live else {}

        model = self.services_config()["models"][0]["model"] if live else ""
        search_live = "search_request" in task_data
        endpoint = ENDPOINT if live else OPENALEX if search_live else "local-fixture"
        fingerprint = encode([task_data, endpoint, model])
        if method == "task.prepare":
            cid = identifier()
            self.put("confirmation", cid, {"fingerprint": fingerprint, "used": False})
            transfers = [{
                "endpoint": ENDPOINT,
                "purpose": "Answer the question using DeepSeek Harness and approved abstract passages",
                "data_categories": ["Research question", "Approved passage IDs and abstract excerpts"],
            }] if live else []
            if search_live:
                transfers = [{"endpoint": OPENALEX, "purpose": "Search public bibliographic records (OpenAlex)",
                              "data_categories": [f"Search query: {label}", *(
                                  f"{caption}: {filters[key]}" for key, caption in
                                  (("year_from", "From year"), ("year_to", "To year"))
                                  if key in filters)]}]
            if live and kind == "reading_qa" and any(s["requested_scope"] == "full_text" for s in input_["sources"]):
                transfers = [{"endpoint": ENDPOINT, "purpose": "Answer using selected sources",
                              "data_categories": ["Research question and excerpts from the selected papers"]}]
            if audit:
                transfers = [{"endpoint": ENDPOINT, "purpose": "Check cited claims against selected papers",
                              "data_categories": ["Selected manuscript sentences and cited full-text excerpts"]}] if live else []
            if suggest:
                transfers = [{"endpoint": ENDPOINT, "purpose": "Find citations for selected manuscript sentences",
                              "data_categories": ["Selected manuscript sentences", "Selected paper titles and excerpts"]}] if live else []
                return {"confirmation_id": cid, "transfers": transfers, "source_versions": task_data["suggestion_sources"]}
            if reader_question:
                transfers = [{"endpoint": ENDPOINT, "purpose": "Answer from the selected PDF text",
                              "data_categories": ["Only the selected text and the question"]}] if live else []
            if synthesis:
                transfers = [{"endpoint": ENDPOINT,
                              "purpose": ("Compare selected papers" if kind == "paper_comparison"
                                          else "Build an evidence-based outline"),
                              "data_categories": ["Research question, selected paper titles and excerpts",
                                                  *(["Relevant reviewed Wiki entries"]
                                                    if kind == "literature_synthesis" and input_.get("mode", "wiki") == "wiki"
                                                    else [])]}]
                return {"confirmation_id": cid, "transfers": transfers, "source_versions": input_["source_versions"]}
            return {"confirmation_id": cid, "transfers": transfers}
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
        if live:
            task["dsh_model"] = model
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
            paper, linked = self.add_bibliographic_paper(saved["topic_id"], candidate)
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
            if isinstance(task_id, tuple):
                if self.closing.is_set():
                    return
                try:
                    self.citations.index(task_id[1])
                except LiteratureError as error:
                    print(f"PaperTrace citation indexing: {error.reason}", file=sys.stderr)
                continue
            with self.lock:
                if self.closing.is_set():
                    return
                task = self.get("task", task_id)
                if task["status"] != "queued":
                    continue
                task["status"] = "running"
                discovery = task["kind"] == "discovery"
                remote_search = discovery and "search_request" in task
                audit = task["kind"] == "citation_audit"
                suggest = task["kind"] == "citation_suggest"
                reader_task = task["kind"] in ("reader_question", "visual_index")
                live = audit or suggest or reader_task or (not discovery and self.dsh is not None)
                if live or remote_search:
                    signal = threading.Event()
                    self.inflight[task_id] = signal
                with self.db:
                    event = self.emit(task, "task.progress", {
                        "stage": "searching" if discovery else "reading",
                        "message": "Checking citations." if audit else "Finding citations." if suggest else (
                            "Searching OpenAlex." if remote_search else
                            "Reading with DeepSeek Harness." if live else "Running local contract sample.")
                    })
                self.send_events([event])
            if remote_search:
                self.run_openalex(task, signal)
                continue
            if live:
                if audit:
                    self.citations.run(task, signal)
                elif suggest:
                    self.citations.run_suggestions(task, signal)
                elif reader_task:
                    run = self.reader.run_question if task["kind"] == "reader_question" else self.reader.run_index
                    run(task, signal)
                elif task["kind"] in ("literature_synthesis", "paper_comparison"):
                    self.research.run(task, signal)
                else:
                    self.run_dsh(task, signal)
                continue
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

    @staticmethod
    def read_coverage(selected, seen):
        versions = {}
        for passage in seen.values():
            version = passage["source_version_id"]
            versions.setdefault(version, "abstract")
            if passage.get("page"):
                versions[version] = "full_text"
        return [{"source_version_id": row["source_version_id"],
                 "read_scope": versions.get(row["source_version_id"], "none")} for row in selected]

    def run_dsh(self, task, signal):
        task_id = task["task_id"]
        try:
            with self.lock:
                if signal.is_set():
                    return
                sources = [self.source(item["source_version_id"], task["topic_id"], item["paper_id"])
                           for item in task["input"]["sources"]]
                for source, selected in zip(sources, task["input"]["sources"]):
                    source["title"] = self.get("paper", source["paper_id"])["title"]
                    source["available_scope"] = ("full_text" if source.get("available_scope") == "full_text"
                                                 and selected["requested_scope"] == "full_text" else "abstract")
            has_pdf = any(source["available_scope"] == "full_text" for source in sources)
            runtime = self.dsh_for_task(task)
            question = task["input"]["question"]
            issue = None
            if has_pdf:
                claims, seen, issue = runtime.answer_full_text(question, sources, signal)
            else:
                claims, seen = runtime.answer(question, sources, signal)
            with self.lock:
                task = self.get("task", task_id)
                if task["status"] != "running":
                    return
                if issue and not claims:
                    self.fail_dsh(task_id, issue, seen)
                    return
                reads = self.read_coverage(task["input"]["sources"], seen)
                with self.db:
                    message_id = identifier()
                    sentences = []
                    for passage in seen.values():
                        source = self.source(passage["source_version_id"], task["topic_id"])
                        passage["paper_id"] = source["paper_id"]
                    for claim in claims:
                        anchors = [self.store_anchor(task, message_id, ref["passage"], ref["quote"])
                                   for ref in claim["references"]]
                        sentences.append({"text": claim["text"], "anchor_ids": anchors,
                                          "assessment": "supported" if anchors else "evidence_not_established"})
                    events = self.persist_reading(task, message_id, sentences, reads, {
                        "kind": "tool", "title": "Read with DeepSeek Harness",
                        "detail": f"Read {len(seen)} approved passage(s) using paper_read.",
                    }, issue=issue)
                self.send_events(events)
        except DshFailure as error:
            self.fail_dsh(task_id, error.issue, error.seen)
        except Exception as error:
            print(f"PaperTrace DSH task: {type(error).__name__}", file=sys.stderr)
            self.fail_dsh(task_id, {"reason": "MODEL_UNAVAILABLE", "retryable": True, "next_action": "retry"})
        finally:
            with self.lock:
                self.inflight.pop(task_id, None)

    def fail_dsh(self, task_id, issue, seen=None):
        with self.lock:
            task = self.get("task", task_id)
            if task["status"] != "running":
                return
            if task["kind"] == "reading_qa":
                reads = self.read_coverage(task["input"]["sources"], seen or {})
                issue = {**issue, "details": {**issue.get("details", {}), "read_sources": reads}}
            with self.db:
                event = self.finish(task, "failed", issue=issue)
            self.send_events([event])

    def store_anchor(self, task, message_id, passage, quote):
        aid = identifier()
        pdf_page = passage.get("page")
        anchor = {"anchor_id": aid, "paper_id": passage["paper_id"],
                  "source_version_id": passage["source_version_id"], "read_scope": "full_text" if pdf_page else "abstract",
                  "quote": quote,
                  "location": {"view": "pdf" if pdf_page else "abstract", "precision": "paragraph",
                               "passage_id": passage["passage_id"], "text_excerpt": passage["text"],
                               **({"page": pdf_page} if pdf_page else {})}}
        self.put("anchor", aid, {"topic_id": task["topic_id"], "message_id": message_id, "value": anchor})
        return aid

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
        return self.save_search(task, query, filters, candidates, "Local PubMedQA fixture",
                                ["Live search is not connected."])

    def run_openalex(self, task, cancelled):
        task_id = task["task_id"]
        query, filters = (task["search_request"][key] for key in ("query", "filters"))
        try:
            if cancelled.is_set():
                return
            candidates, gaps = openalex_search(query, filters, self.openalex_key)
            with self.lock, self.db:
                current = self.get("task", task_id)
                if cancelled.is_set() or current["status"] != "running":
                    return
                paper_keys = set().union(*(identity_keys(p) for p in self.rows("paper")
                                           if task["topic_id"] in p["topic_ids"]))
                previous = {}
                for search in self.rows("search"):
                    if search["topic_id"] == task["topic_id"]:
                        for candidate in search["candidates"]:
                            for key in identity_keys(candidate):
                                previous.setdefault(key, candidate)
                for candidate in candidates:
                    keys = identity_keys(candidate)
                    prior_matches = {previous[key]["decision"] for key in keys if key in previous}
                    decision = ("added" if keys & paper_keys else "exclude" if "exclude" in prior_matches
                                else "hold" if "hold" in prior_matches else "pending")
                    candidate.update(candidate_id=identifier(), decision=decision)
                # Keep explicit exclusions available even if they fall outside this response page.
                if previous_id := task["input"].get("previous_search_id"):
                    present = set().union(*(identity_keys(c) for c in candidates))
                    prior = self.get("search", previous_id)["candidates"]
                    candidates.extend({**c, "candidate_id": identifier()} for c in prior
                                      if c["decision"] == "exclude" and identity_keys(c).isdisjoint(present | paper_keys))
                events = self.save_search(current, query, filters, candidates, "OpenAlex", gaps)
            with self.lock:
                self.send_events(events)
        except PublicServiceError as error:
            self.fail_dsh(task_id, {"reason": error.reason, "retryable": error.retryable, "next_action": error.action,
                                    "details": {"message": str(error)}})
        except Exception as error:
            print(f"PaperTrace search: {type(error).__name__}", file=sys.stderr)
            self.fail_dsh(task_id, {"reason": "SERVICE_INVALID_RESPONSE", "retryable": True, "next_action": "retry"})
        finally:
            with self.lock:
                self.inflight.pop(task_id, None)

    def save_search(self, task, query, filters, candidates, service, gaps):
        sid = identifier()
        search = {"search_id": sid, "task_id": task["task_id"], "topic_id": task["topic_id"],
                  "query": query, "filters": filters, "candidates": candidates, "provider": service,
                  "coverage": {"searched_angles": [service], "gaps": gaps}}
        self.put("search", sid, search)
        count = sum(c["decision"] != "exclude" for c in candidates)
        step = {"action": "search", "query": query, "source": service,
                "observation": f"{count} candidates available." if count else "No candidates matched the search."}
        task["steps"] = [{"kind": "tool", "title": f"Search {service}", "detail": step["observation"]}]
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
                aid = self.store_anchor(task, message_id, {
                    **passage, "paper_id": source["paper_id"], "source_version_id": vid,
                }, QUOTE)
                sentences.append({"text": "The PubMedQA fixture uses the corresponding abstract without its conclusion.",
                                  "assessment": "supported", "anchor_ids": [aid]})
                break
        if not sentences:
            sentences.append({"text": "The local sample did not establish a supporting passage.",
                              "assessment": "evidence_not_established", "anchor_ids": []})
        return self.persist_reading(task, message_id, sentences, reads, {
            "kind": "tool", "title": "Read saved abstract", "detail": "Checked the local fixture passage.",
        })

    def persist_reading(self, task, message_id, sentences, reads, step, issue=None):
        input_ = task["input"]
        answer = {"scope_id": task["scope_id"], "message_id": message_id, "read_sources": reads, "sentences": sentences}
        session = self.get("session", task["session_id"])
        session["turns"].append({"task_id": task["task_id"], "question": input_["question"], "answer": answer})
        session["updated_at"] = now()
        self.put("session", session["session_id"], session)
        task["steps"] = [step]
        delta = self.emit(task, "answer.delta", {"text": " ".join(s["text"] for s in sentences)})
        full_reads = {source["source_version_id"] for source in reads if source["read_scope"] == "full_text"}
        if issue:
            final = self.finish(task, "partial", result=answer, issue=issue)
        elif any(s["requested_scope"] == "full_text" and s["source_version_id"] not in full_reads for s in input_["sources"]):
            final = self.finish(task, "partial", result=answer, issue={
                "reason": "FULL_TEXT_REQUIRED", "retryable": False, "next_action": "attach_full_text"
            })
        else:
            final = self.finish(task, "completed", result=answer)
        return [delta, final]

    def close(self):
        with self.lock:
            self.closing.set()
            for cancellation in self.inflight.values():
                cancellation.set()
        self.jobs.put(None)
        self.runner.join()
        self.db.close()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: papertrace.py <workspace-directory>")
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    output_lock = threading.Lock()

    def send(message):
        with output_lock:
            print(encode(message), flush=True)

    worker = Worker(Path(sys.argv[1]), send)
    probes = ThreadPoolExecutor(max_workers=2)
    try:
        for line in sys.stdin:
            try:
                request = json.loads(line)
            except ValueError:
                send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                continue
            if isinstance(request, dict) and request.get("method") in ("services.test", "library.preview_identifier"):
                probes.submit(worker.process, request)
            else:
                worker.process(request)
    finally:
        worker.closing.set()
        probes.shutdown(cancel_futures=True)
        worker.close()


if __name__ == "__main__":
    main()
