"""Read-only research tools scoped to one confirmed set of paper versions."""
from contextlib import closing, contextmanager
import re
import sqlite3
from urllib.parse import quote


@contextmanager
def open_corpus(database):
    # Encode the native filename as the URI path. A Windows verbatim or UNC
    # prefix must reach SQLite's filesystem layer, not its URI authority parser.
    uri = "file:" + quote(str(database), safe=":") + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        db.execute("PRAGMA temp_store=MEMORY")
        yield db


def function(name, description, properties):
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}}}


STRING = {"type": "string"}


class ResearchTools:
    def __init__(self, workspace, sources, wiki, selection=None, *, passage_limit=36):
        self.database = workspace / "workspace.sqlite3"
        self.sources = {s["source_version_id"]: s for s in sources}
        self.full = [v for v, s in self.sources.items() if s.get("available_scope") == "full_text"]
        self.abstracts = {p["passage_id"]: {**p, "source_version_id": v, "paper_id": s["paper_id"]}
                          for v, s in self.sources.items() for p in s.get("passages", [])}
        self.wiki = wiki
        self.selection = selection
        self.passage_limit = passage_limit
        self.read_ids = set()
        if selection is not None:
            self.schemas = [function("paper_read", "Read one approved passage by its exact ID.", {"id": STRING})]
        else:
            self.schemas = [
                function("paper_search", "Search scoped paper text. Use an empty version to search all papers.",
                         {"query": STRING, "version": STRING}),
                function("paper_read", "Read up to four passage IDs and adjacent context on the same page.",
                         {"ids": {"type": "array", "items": STRING, "minItems": 1, "maxItems": 4}}),
                function("paper_refs", "List indexed links to other approved paper versions.", {"version": STRING}),
                function("wiki_search", "Search reviewed discoveries and open questions for leads.", {"query": STRING}),
            ]

    def initial_readings(self, question):
        """Supply citable text even if the model answers without making a tool call."""
        passages = []
        terms = list(dict.fromkeys(re.findall(r"[^\W_]+", question.lower())))[:12]
        for version, source in self.sources.items():
            if version not in self.full:
                passages.extend([p for p in self.abstracts.values() if p["source_version_id"] == version][:2])
                continue
            hits = self.search(terms, version)
            with open_corpus(self.database) as db:
                if hits:
                    rows = db.execute("SELECT passage_id,page,ordinal,text FROM paper_passages "
                                      "WHERE version_id=? AND passage_id=?", (version, hits[0]["passage_id"]))
                else:
                    rows = db.execute("SELECT passage_id,page,ordinal,text FROM paper_passages WHERE version_id=? "
                                      "ORDER BY page,ordinal LIMIT 2", (version,))
                passages.extend(dict(passage_id=pid, source_version_id=version, page=page, ordinal=n, text=text)
                                for pid, page, n, text in rows)
        return passages

    def execute(self, name, args):
        if self.selection is not None:
            if name != "paper_read":
                raise ValueError("Unknown tool")
            return self.selection[args["id"]]
        if name == "paper_refs":
            source = self.sources[args["version"]]
            return [r for r in source.get("relations", []) if r.get("target_version_id") in self.sources][:20]
        if name in ("wiki_search", "paper_search"):
            terms = list(dict.fromkeys(re.findall(r"[^\W_]+", args["query"].lower())))[:12]
            if name == "wiki_search":
                scored = [(sum(t in entry["search_text"].lower() for t in terms), entry) for entry in self.wiki]
                return [e for score, e in sorted(scored, key=lambda pair: -pair[0]) if score][:6]
            return self.search(terms, args.get("version", ""))
        if name == "paper_read":
            return self.read(args["ids"])
        raise ValueError("Unknown tool")

    def search(self, terms, version):
        if version and version not in self.sources:
            raise ValueError("Version outside approved scope")
        if not terms:
            return []
        versions = [v for v in self.full if not version or v == version]
        results = []
        if versions:
            slots = ",".join("?" for _ in versions)
            with open_corpus(self.database) as db:
                rows = db.execute(f"""SELECT passage_id,version_id,page,ordinal,text FROM paper_passages
                    WHERE paper_passages MATCH ? AND version_id IN ({slots}) ORDER BY bm25(paper_passages),
                    version_id,page,ordinal LIMIT 48""", (' OR '.join(f'"{t}"' for t in terms), *versions))
                for pid, vid, page, ordinal, body in rows:
                    offset = self.sources[vid].get("body_starts", {}).get(pid, 0)
                    excerpt = body[offset:].strip()
                    if excerpt:
                        results.append(dict(passage_id=pid, source_version_id=vid, page=page,
                                            ordinal=ordinal, preview=excerpt[:180]))
                    if len(results) == 10:
                        break
        for p in self.abstracts.values():
            if (not version or p["source_version_id"] == version) and any(t in p["text"].lower() for t in terms):
                results.append({**{k: v for k, v in p.items() if k != "text"}, "preview": p["text"][:180]})
        return results[:12]

    def read(self, ids):
        if not isinstance(ids, list) or not 1 <= len(ids) <= 4 or not all(isinstance(i, str) for i in ids):
            raise ValueError("Read one to four passage IDs")
        found = {}
        for pid in dict.fromkeys(ids):
            if pid in self.abstracts:
                found[pid] = self.abstracts[pid]
                continue
            with open_corpus(self.database) as db:
                loc = db.execute("SELECT version_id,page,ordinal FROM passage_lookup WHERE passage_id=?", (pid,)).fetchone()
                if not loc or loc[0] not in self.full:
                    raise ValueError("Passage outside approved scope")
                version, page, ordinal = loc
                rows = db.execute("""SELECT l.passage_id,l.ordinal,p.text FROM passage_lookup l
                    JOIN paper_passages p ON p.rowid=l.fts_rowid WHERE l.version_id=? AND l.page=?
                    AND l.ordinal BETWEEN ? AND ? ORDER BY l.ordinal""", (version, page, ordinal-1, ordinal+1))
                for key, n, body in rows:
                    found[key] = dict(passage_id=key, source_version_id=version, page=page, ordinal=n, text=body)
                    offset = self.sources[version].get("body_starts", {}).get(key)
                    if offset:
                        found[key]["body_starts_at"] = offset
        remaining = self.passage_limit - len(self.read_ids)
        new_ids = [pid for pid in found if pid not in self.read_ids]
        self.read_ids.update(new_ids[:remaining])
        passages = [item for pid, item in found.items() if pid in self.read_ids]
        if len(new_ids) > remaining:
            return {"limit_reached": True, "passages": passages}
        return passages
