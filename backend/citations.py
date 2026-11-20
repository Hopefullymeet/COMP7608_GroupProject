"""Local bibliography parsing, citation navigation, and manuscript audit."""

from collections import defaultdict
import hashlib
import http.client
import json
import os
import re
import xml.etree.ElementTree as ET
from uuid import uuid4
from dsh import DshFailure, MODEL
from literature import LiteratureError, digest, extract_pdf, pdf_content, render_pdf_page


HEADING = re.compile(r"(?im)^\s*(?:references|bibliography|works cited)\s*$")
NUMBERED = re.compile(r"(?m)^\s*\[([1-9]\d{0,3})\]\s+")
NUM_CALL = re.compile(r"\[(\d{1,4}(?:\s*[-–,;]\s*\d{1,4})*)\]")
YEAR = re.compile(r"\b(?:19|20)\d{2}[a-z]?\b", re.I)
AUTHOR_CALL = re.compile(r"(?P<author>[A-Z][\w’'-]+)(?:\s+et\s+al\.?|\s+(?:and|&)\s+[A-Z][\w’'-]+)?"
                         r"(?:,?\s+|\s*\(\s*)(?P<year>(?:19|20)\d{2}[a-z]?)(?=\s*[,;).])")
DOI = re.compile(r"(?:https?://(?:dx\.)?doi\.org/|\bdoi\s*:\s*)(10\.\d{4,9}/[^\s<>]+)", re.I)
ARXIV = re.compile(r"(?:arxiv\.org/(?:abs|pdf)/|\barxiv\s*:\s*)(\d{4}\.\d{4,5})(?:v\d+)?", re.I)


def compact(text):
    return " ".join(text.split())


def norm(text):
    return " ".join(re.findall(r"[^\W_]+", re.sub(r"(?<=\w)[-‐‑](?=\w)", "", text.casefold())))


def identifiers(text):
    doi, arxiv = DOI.search(text), ARXIV.search(text)
    return ((doi[1].rstrip(".,);]") if doi else "").casefold(), arxiv[1] if arxiv else "")


def init_citations(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS citation_index (version_id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS citation_refs (
            version_id TEXT NOT NULL, ref_key TEXT NOT NULL, title TEXT NOT NULL, doi TEXT NOT NULL,
            arxiv TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(version_id, ref_key)
        );
        CREATE INDEX IF NOT EXISTS citation_ref_title ON citation_refs(title);
        CREATE INDEX IF NOT EXISTS citation_ref_doi ON citation_refs(doi);
        CREATE INDEX IF NOT EXISTS citation_ref_arxiv ON citation_refs(arxiv);
        CREATE TABLE IF NOT EXISTS audit_cache (
            cache_key TEXT PRIMARY KEY, finding TEXT NOT NULL
        );
    """)


def parse_document(pages):
    header = [line.strip() for line in (pages[0] if pages else "").splitlines() if line.strip()]
    metadata = {"title": header[0] if header else "", "author_line": header[1] if len(header) > 1 else "",
                "doi": "", "arxiv": ""}
    publication = re.search(r"(?im)^(?:Proceedings of |Published as ).{0,300}\b((?:19|20)\d{2})\b",
                            pages[0] if pages else "")
    metadata["year"] = publication[1] if publication else ""
    metadata["doi"], metadata["arxiv"] = identifiers("\n".join(header[:7]))
    body, references = [], []
    in_refs = False
    for page, raw in enumerate(pages, 1):
        if in_refs:
            if re.match(r"\s*(?:Appendix\b|Supplementary Material\b)", raw, re.I):
                break
            references.append(raw)
            continue
        heading = HEADING.search(raw)
        body.append((page, raw[:heading.start()] if heading else raw))
        if heading:
            in_refs = True
            references.append(raw[heading.end():])
    bibliography = "\n".join(references)
    marked = list(NUMBERED.finditer(bibliography))
    entries = [(mark[1], bibliography[mark.end():marked[i+1].start() if i+1 < len(marked) else None])
               for i, mark in enumerate(marked)]
    if not marked or (len(marked) == 1 and compact(bibliography[:marked[0].start()])):
        marked = []
        breaks = [m.start() for m in re.finditer(
            r"(?m)^[A-Z][\w’'-]+(?: [A-Z][\w’'-]+){1,5}(?:,|\s+(?:and |& |(?:19|20)\d{2}\b))",
            bibliography,
        ) if not compact(bibliography[:m.start()]) or bibliography[:m.start()].rstrip().endswith(".")]
        starts = sorted(set([0, *breaks, len(bibliography)]))
        segments = [bibliography[start:end] for start, end in zip(starts, starts[1:]) if bibliography[start:end].strip()]
        entries = [(str(i+1), block) for i, block in enumerate(segments)]

    rows = []
    for key, value in entries:
        value = compact(re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", value))
        if not value:
            continue
        years = list(YEAR.finditer(value))
        year = next((y for y in years if re.match(r"[.)]", value[y.end():])), years[0] if years else None)
        author_line = value[:year.start()].strip(" .,(;") if year else ""
        first_name = re.split(r",|\band\b|\s+&\s+", author_line)[0].strip().split()
        surname = first_name[-1].strip(".,") if first_name else ""
        title = value[year.end():].strip(" .,)") if year else value
        title = re.split(r"\.\s+(?:In |Proceedings|arXiv)|\s+https?://", title, maxsplit=1)[0].rstrip(".")
        doi, arxiv = identifiers(value)
        rows.append({"key": key, "text": value[:2200], "title": title[:650], "surname": surname,
                     "year": year[0].lower() if year else "", "doi": doi, "arxiv": arxiv, "mentions": []})
    aliases = defaultdict(list)
    for ref in rows:
        aliases[(norm(ref["surname"]), ref["year"])].append(ref)
    by_num = {r["key"]: r for r in rows} if marked else {}
    sentences = []
    for page, raw in body:
        text = compact(re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", raw))
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z\[“])", text):
            if len(sentence) < 12:
                continue
            keys, unresolved = set(), set()
            spans = []
            for m in NUM_CALL.finditer(sentence):
                for part in re.split(r"[,;]", m[1]):
                    parts = re.split(r"[-–]", part)
                    low, high = int(parts[0]), int(parts[-1])
                    if 0 <= high-low <= 20:
                        for number in range(low, high+1):
                            ref = by_num.get(str(number))
                            if ref:
                                keys.add(ref["key"])
                                spans.append((ref, m.start(), m.end()))
                            elif marked:
                                unresolved.add(str(number))
            for m in AUTHOR_CALL.finditer(sentence):
                matches = aliases[norm(m["author"]), m["year"].lower()]
                if len(matches) == 1:
                    keys.add(matches[0]["key"])
                    spans.append((matches[0], m.start(), m.end()))
                elif matches or in_refs:
                    unresolved.add(m[0])
            for ref, start, end in spans:
                ref["mentions"].append({"page": page, "quote": sentence[max(0,start-95):end+115]})
            if keys or unresolved:
                sentences.append({"page": page, "text": sentence[:2500], "cites": sorted(keys),
                                  "unresolved": sorted(unresolved)})
    return {"metadata": metadata, "references": rows, "sentences": sentences,
            "has_text": any(page.strip() for page in pages)}


def grobid_index(xml, fallback):
    ns = {"tei": "http://www.tei-c.org/ns/1.0"}
    root = ET.fromstring(xml)
    references = {}
    for item in root.findall(".//tei:listBibl/tei:biblStruct", ns):
        key = item.get("{http://www.w3.org/XML/1998/namespace}id")
        title = item.find("./tei:analytic/tei:title", ns)
        if title is None:
            title = item.find("./tei:monogr/tei:title", ns)
        if not key or title is None:
            continue
        surname = item.find(".//tei:surname", ns)
        date = item.find(".//tei:date", ns)
        raw = item.find(".//tei:note[@type='raw_reference']", ns)
        title_text = compact(" ".join(title.itertext()))
        if not title_text:
            continue
        doi = item.find(".//tei:idno[@type='DOI']", ns)
        arxiv = item.find(".//tei:idno[@type='arXiv']", ns)
        references[key] = {"key": key, "title": title_text,
                           "text": compact(" ".join(raw.itertext())) if raw is not None else title_text,
                           "surname": (surname.text or "") if surname is not None else "",
                           "year": (date.get("when", "")[:4]) if date is not None else "",
                           "doi": (doi.text or "").strip().casefold() if doi is not None else "",
                           "arxiv": (arxiv.text or "").strip().split("v")[0] if arxiv is not None else "", "mentions": []}
    sentences = []
    for paragraph in root.findall(".//tei:body//tei:p", ns):
        for context in paragraph.findall("tei:s", ns) or [paragraph]:
            sentence = compact(" ".join(context.itertext()))[:2500]
            markers = context.findall(".//tei:ref[@type='bibr']", ns)
            if not markers:
                continue
            pages = set()
            keys, unresolved = set(), set()
            for marker in markers:
                coords = marker.get("coords", "").split(",")[0]
                raw_keys = marker.get("target", "").split()
                if not coords.isdecimal() or not 1 <= int(coords) <= fallback["page_count"]:
                    unresolved.add(compact(" ".join(marker.itertext())) or "?")
                    continue
                page = int(coords)
                pages.add(page)
                for key in raw_keys:
                    entry = references.get(key.removeprefix("#"))
                    if entry:
                        keys.add(entry["key"])
                        entry["mentions"].append({"page": page, "quote": sentence})
                if not raw_keys or any(k.removeprefix("#") not in references for k in raw_keys):
                    unresolved.add(compact(" ".join(marker.itertext())) or "?")
            if len(pages) == 1:
                sentences.append({"page": pages.pop(), "text": sentence, "cites": sorted(keys),
                                  "unresolved": sorted(unresolved)})
    if not references or not sentences:
        return fallback
    return {**fallback, "references": list(references.values()), "sentences": sentences}


def parse_pdf_index(content, pages):
    baseline = {**parse_document(pages), "page_count": len(pages)}
    setting = os.environ.get("PAPERTRACE_GROBID_PORT")
    if not setting or not baseline["has_text"] or not setting.isdecimal() or not 1 <= int(setting) <= 65535:
        return baseline
    # Explicit local parser. Never follow redirects or send a document to a remote parser.
    boundary = "papertrace-" + uuid4().hex
    parts = [(b'input"; filename="paper.pdf', content),
             (b"segmentSentences", b"1"), (b"teiCoordinates", b"ref"),
             (b"consolidateHeader", b"0"), (b"consolidateCitations", b"0"), (b"includeRawCitations", b"1")]
    body = b"".join((f"--{boundary}\r\nContent-Disposition: form-data; name=\"".encode()
                     + name + b"\"\r\n\r\n" + data + b"\r\n") for name, data in parts)
    body += f"--{boundary}--\r\n".encode()
    session = http.client.HTTPConnection("127.0.0.1", int(setting), timeout=3)
    try:
        session.request("POST", "/api/processFulltextDocument", body,
                        {"Content-Type": f"multipart/form-data; boundary={boundary}", "Accept": "application/xml"})
        response = session.getresponse()
        if response.status == 200:
            xml = response.read(6 * 1024 * 1024 + 1)
            if len(xml) <= 6 * 1024 * 1024:
                return grobid_index(xml, baseline)
    except (OSError, http.client.HTTPException, ET.ParseError, ValueError):
        pass  # The local text route remains available during parser outages.
    finally:
        session.close()
    return baseline


def save_index(db, version, parsed):
    db.execute("INSERT INTO citation_index VALUES (?, ?)", (version, json.dumps(parsed["metadata"], ensure_ascii=False)))
    db.executemany("INSERT INTO citation_refs VALUES (?, ?, ?, ?, ?, ?)",
                   ((version, r["key"], norm(r["title"]), r["doi"], r["arxiv"], json.dumps(r, ensure_ascii=False))
                    for r in parsed["references"]))


def citation_match(ref, sources):
    candidates = []
    for source in sources:
        metadata = source["metadata"]
        id_equal = any(ref[key] and ref[key] == metadata[key] for key in ("doi", "arxiv"))
        id_conflict = any(ref[key] and metadata[key] and ref[key] != metadata[key] for key in ("doi", "arxiv"))
        title, target_title = norm(ref["title"]), norm(metadata["title"])
        surname = norm(ref["surname"])
        title_equal = len(target_title.split()) >= 4 and (
            title == target_title or title.startswith(target_title + " "))
        author_compatible = surname and surname in norm(re.sub(r"(?<=[A-Za-z])\d+", "", metadata["author_line"])).split()
        year_compatible = not metadata.get("year") or not ref["year"] or ref["year"][:4] == metadata["year"]
        if id_equal or (not id_conflict and title_equal and author_compatible and year_compatible):
            candidates.append((2 if id_equal else 1, source))
    if not candidates:
        return "unmatched", None
    best = max(score for score, _ in candidates)
    hits = [source for score, source in candidates if score == best]
    return ("matched", hits[0]) if len(hits) == 1 else ("ambiguous", None)


def stable_key(*fields):
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


class CitationWorkspace:
    def __init__(self, worker, identifier):
        self.host = worker
        self.identifier = identifier

    def index(self, version):
        db = self.host.db
        with self.host.lock:
            row = db.execute("""SELECT content FROM pdf_files WHERE version_id = ?
                                AND NOT EXISTS (SELECT 1 FROM citation_index WHERE version_id = ?)""",
                             (version, version)).fetchone()
        if row is None:
            return
        parsed = parse_pdf_index(row[0], extract_pdf(row[0]))
        with self.host.lock, db:
            if not db.execute("SELECT 1 FROM citation_index WHERE version_id = ?", (version,)).fetchone():
                save_index(db, version, parsed)

    def sources(self, topic, versions=None):
        result = []
        for paper in self.host.rows("paper"):
            if topic not in paper["topic_ids"]:
                continue
            selections = (v for v in paper["source_versions"] if v["source_version_id"] in versions) if versions is not None else paper["source_versions"][:1]
            for version in selections:
                vid = version["source_version_id"]
                row = self.host.db.execute("SELECT data FROM citation_index WHERE version_id = ?", (vid,)).fetchone()
                metadata = json.loads(row[0]) if row else {
                    "title": paper["title"], "author_line": " ".join(paper["authors"]),
                    "doi": paper["identity"] if paper["identity"].startswith("10.") else "", "arxiv": ""}
                result.append({**version, "paper_id": paper["paper_id"], "title": paper["title"], "metadata": metadata})
        return result

    def refs(self, topic, version, direction="outgoing"):
        source = self.host.source(version, topic)
        sources = self.sources(topic)
        if direction not in ("outgoing", "incoming"):
            raise LiteratureError("INVALID_PARAMS", "Choose incoming or outgoing references.")
        if direction == "outgoing":
            origins = [version]
        else:
            origins = [v["source_version_id"] for v in sources if v["paper_id"] != source["paper_id"]]
            if not any(v["source_version_id"] == version for v in sources):
                sources = [s for s in sources if s["paper_id"] != source["paper_id"]] + self.sources(topic, {version})
        indexed = {r[0] for r in self.host.db.execute("SELECT version_id FROM citation_index")}
        titles = {v["source_version_id"]: v["title"] for v in sources}
        result = []
        for origin in origins:
            query = "SELECT data FROM citation_refs WHERE version_id = ?"
            args = [origin]
            if direction == "incoming":
                target_metadata = next(s["metadata"] for s in sources if s["source_version_id"] == version)
                target_title = norm(target_metadata["title"])
                query += " AND ((doi != '' AND doi = ?) OR (arxiv != '' AND arxiv = ?) OR title = ? OR title GLOB ?)"
                args += [target_metadata["doi"], target_metadata["arxiv"], target_title, target_title + " *"]
            for (raw,) in self.host.db.execute(query, args):
                ref = json.loads(raw)
                status, target = citation_match(ref, [s for s in sources if s["source_version_id"] != origin])
                if direction == "incoming" and (not target or target["source_version_id"] != version):
                    continue
                result.append({**ref, "status": status, "citing_version_id": origin,
                               "citing_title": titles.get(origin, ""),
                               "target_version_id": target["source_version_id"] if target else None,
                               "target_title": target["title"] if target else None})
        pending = [v for v in origins if v not in indexed and self.host.get("source", v).get("page_count")]
        return {"items": result, "pending_versions": pending}

    def draft(self, topic, draft_id):
        if not isinstance(draft_id, str):
            raise LiteratureError("INVALID_PARAMS", "A manuscript ID is required.")
        doc = self.host.get("pdf_draft", draft_id)
        if doc["topic_id"] != topic:
            raise LiteratureError("NOT_FOUND", "Manuscript is outside the selected topic.", "refresh_data", -32001)
        return doc

    def snapshot(self, topic, params):
        doc = self.draft(topic, params.get("draft_id"))
        version = next((v for v in doc["versions"] if v["version_id"] == params.get("version_id")), None)
        if version is None:
            raise LiteratureError("NOT_FOUND", "Manuscript version was not found.", "refresh_data", -32001)
        return doc, version

    def import_draft(self, topic, params):
        filename, content = pdf_content(params)
        checksum = digest(content)
        existing = self.draft(topic, params["draft_id"]) if params.get("draft_id") else None
        if not existing:
            existing = next((d for d in self.host.rows("pdf_draft") if d["topic_id"] == topic
                             and any(v["checksum"] == checksum for v in d["versions"])), None)
        if existing and any(v["checksum"] == checksum for v in existing["versions"]):
            return self.public(existing)
        parsed = parse_pdf_index(content, pages := extract_pdf(content))
        doc = existing or {"draft_id": self.identifier(), "topic_id": topic, "name": filename,
                           "format": "pdf", "write_mode": "positions", "versions": []}
        snapshot = {"version_id": self.identifier(), "checksum": checksum, "page_count": len(pages),
                    "sentences": [{"id": self.identifier(), **row} for row in parsed["sentences"]],
                    "references": parsed["references"], "reports": [], "warnings": []}
        if not snapshot["sentences"]:
            snapshot["warnings"].append("No identifiable in-text citations. Check that this PDF has selectable text and a reference list.")
        if any(row["unresolved"] for row in snapshot["sentences"]):
            snapshot["warnings"].append("Some citation markers could not be matched to the bibliography.")
        doc["versions"].insert(0, snapshot)
        self.host.db.execute("INSERT INTO pdf_files VALUES (?, ?, ?)", (snapshot["version_id"], checksum, content))
        self.host.put("pdf_draft", doc["draft_id"], doc)
        return self.public(doc)

    def resolve_reference(self, topic, params):
        doc, version = self.snapshot(topic, params)
        key, paper = params.get("ref_key"), params.get("paper_id")
        if not any(r["key"] == key for r in version["references"]):
            raise LiteratureError("INVALID_PARAMS", "Select a manuscript reference.")
        if paper is not None and not any(p["paper_id"] == paper for p in self.sources(topic)):
            raise LiteratureError("INVALID_PARAMS", "Choose a paper in this topic.")
        mapping = version.setdefault("mapping", {})
        if paper is None:
            mapping.pop(key, None)
        else:
            mapping[key] = paper
        self.host.put("pdf_draft", doc["draft_id"], doc)
        return self.public(doc)

    def match(self, version, ref, sources):
        paper = version.get("mapping", {}).get(ref["key"])
        if paper:
            matched = next((item for item in sources if item["paper_id"] == paper), None)
            return ("user_confirmed", matched) if matched else ("unmatched", None)
        return citation_match(ref, sources)

    def reference_versions(self, draft, sources):
        return {ref["key"]: source["source_version_id"] if source else None
                for ref in draft["references"] for _, source in [self.match(draft, ref, sources)]}

    @staticmethod
    def finding_stale(finding, targets):
        return any(claim.get("source_version_id") != targets.get(finding["ref_key"])
                   for claim in finding["claims"])

    def wiki_changes(self, topic, items):
        audit_items = {item["id"]: item for item in items if item["id"].startswith("audit-")}
        if not audit_items:
            return {}
        reports = {item["record_id"] for item in audit_items.values()}
        sources = self.sources(topic)
        changes = {}
        for doc in self.host.rows("pdf_draft"):
            if doc["topic_id"] != topic:
                continue
            for draft in doc["versions"]:
                relevant = [report for report in draft["reports"] if report["report_id"] in reports]
                if not relevant:
                    continue
                targets = self.reference_versions(draft, sources)
                for report in relevant:
                    for finding in report["findings"]:
                        key = "audit-" + finding["cache_key"]
                        if key in audit_items and self.finding_stale(finding, targets):
                            changes[key] = audit_items[key]["source_versions"]
        return changes

    def public(self, doc):
        versions = []
        sources = self.sources(doc["topic_id"])
        for v in doc["versions"]:
            refs = []
            for ref in v["references"]:
                state, source = self.match(v, ref, sources)
                refs.append({**ref, "status": state, "target_title": source["title"] if source else None,
                             "target_version_id": source["source_version_id"] if source else None})
            targets = {r["key"]: r["target_version_id"] for r in refs}
            reports = [{**r, "findings": [{**f, "needs_review": self.finding_stale(f, targets)}
                                         for f in r["findings"]]} for r in v["reports"]]
            stale = {f["sentence_id"] for r in reports for f in r["findings"] if f["needs_review"]}
            versions.append({**v, "references": refs, "reports": reports, "stale_sentence_ids": sorted(stale)})
        return {**doc, "versions": versions}

    def page(self, topic, params):
        _, draft = self.snapshot(topic, params)
        page = params.get("page")
        if type(page) is not int or not 1 <= page <= draft["page_count"]:
            raise LiteratureError("INVALID_PARAMS", "Invalid manuscript page.")
        row = self.host.db.execute("SELECT content FROM pdf_files WHERE version_id = ?", (draft["version_id"],)).fetchone()
        return {"page": page, "png": render_pdf_page(row[0], page)}

    def jobs(self, topic, params):
        doc, v = self.snapshot(topic, params)
        ids, versions = params.get("sentence_ids"), params.get("source_versions")
        if (not isinstance(ids, list) or not 1 <= len(ids) <= 12 or not all(isinstance(x, str) for x in ids)
                or len(ids) != len(set(ids)) or not isinstance(versions, list) or len(versions) > 12
                or not all(isinstance(x, str) for x in versions) or len(versions) != len(set(versions))):
            raise LiteratureError("INVALID_PARAMS", "Select up to 12 sentences and 12 source versions.")
        candidates = self.sources(topic, set(versions))
        if {v["source_version_id"] for v in candidates} != set(versions) or len({v["paper_id"] for v in candidates}) != len(versions):
            raise LiteratureError("INVALID_PARAMS", "Select one version per paper in this topic.")
        # Resolve identity against the whole topic before filtering authorized versions.
        # Excluding an ambiguous candidate cannot turn the remaining paper into a match.
        selected = {s["paper_id"]: s for s in candidates}
        identities = {s["paper_id"]: s for s in self.sources(topic)}
        identities.update(selected)
        refs = {r["key"]: self.match(v, r, identities.values()) for r in v["references"]}
        chosen = [s for s in v["sentences"] if s["id"] in ids]
        if len(chosen) != len(ids):
            raise LiteratureError("INVALID_PARAMS", "A selected sentence is outside this manuscript.")
        jobs = []
        for s in chosen:
            for key in s["cites"] + s["unresolved"]:
                status, candidate = refs.get(key, ("unmatched", None)) if key in s["cites"] else ("unmatched", None)
                version = candidate["source_version_id"] if candidate else ""
                usable = (candidate and selected.get(candidate["paper_id"]) == candidate
                          and candidate["available_scope"] == "full_text")
                cache = stable_key(topic, s["text"], s["cites"], s["unresolved"], key, version)
                cached = self.host.db.execute("SELECT finding FROM audit_cache WHERE cache_key = ?", (cache,)).fetchone() if usable else None
                jobs.append({"job_id": str(len(jobs)), "sentence": s, "ref_key": key, "source": candidate,
                             "cache": cache, "cached": json.loads(cached[0]) if cached else None,
                             "usable": bool(usable), "state": status})
        if len(jobs) > 24:
            raise LiteratureError("INVALID_PARAMS", "Select fewer sentences. One run can check up to 24 citations.")
        return doc, v, jobs

    def run(self, task, cancelled):
        host = self.host
        topic = task["topic_id"]
        issue = None
        seen, trace, usage, judgments = {}, [], {}, {}
        try:
            with host.lock:
                doc, draft, jobs = self.jobs(topic, task["input"])
            pending = [j for j in jobs if j["usable"] and j["cached"] is None
                       and task.get("audit_sources", {}).get(j["job_id"]) == j["source"]["source_version_id"]]
            if pending and host.dsh:
                versions = {j["source"]["source_version_id"]: j["source"] for j in pending}
                inputs = [{"id": j["job_id"], "claim": j["sentence"]["text"],
                           "source_version_id": j["source"]["source_version_id"]} for j in pending]
                def progress(name, detail):
                    with host.lock:
                        with host.db:
                            current = host.get("task", task["task_id"])
                            if current["status"] != "running":
                                return
                            event = host.emit(current, "task.progress", {"stage": name, "message": f"{name}: {detail}"})
                        host.send_events([event])

                try:
                    raw, seen, trace, usage, issue = host.dsh.audit(inputs, list(versions.values()), cancelled, progress)
                    rows = raw.get("checks") if isinstance(raw, dict) else None
                    if isinstance(rows, list):
                        judgments = {r["id"]: r for r in rows if isinstance(r, dict) and isinstance(r.get("id"), str)}
                    elif not issue:
                        issue = {"reason": "MODEL_OUTPUT_INVALID", "retryable": True, "next_action": "retry"}
                except DshFailure as error:
                    issue = error.issue
            elif any(j["usable"] and j["cached"] is None for j in jobs):
                issue = {"reason": "MODEL_UNAVAILABLE", "retryable": True, "next_action": "configure_service"}
            with host.lock, host.db:
                current = host.get("task", task["task_id"])
                if current["status"] != "running":
                    return
                doc, draft = self.snapshot(topic, task["input"])
                report_id = self.identifier()
                findings = []
                for j in jobs:
                    findings.append(self.finding(task, report_id, j, judgments.get(j["job_id"]), seen))
                complete = not issue and all(c["status"] != "blocked" for f in findings for c in f["claims"])
                report = {"report_id": report_id, "kind": "citation_audit", "complete": complete,
                          "model": MODEL if pending and host.dsh else "", "findings": findings, "usage": usage}
                draft["reports"].insert(0, report)
                host.put("pdf_draft", doc["draft_id"], doc)
                current["steps"] = trace
                result = {"record_id": report_id, "kind": "citation_audit"}
                event = host.finish(current, "completed", result=result) if complete else host.finish(
                    current, "partial", result=result, issue=issue or {
                        "reason": "CITATIONS_UNRESOLVED", "retryable": False, "next_action": "review_gaps"})
            host.send_events([event])
        except Exception as error:
            import sys
            print(f"PaperTrace citation audit: {type(error).__name__}", file=sys.stderr)
            host.fail_dsh(task["task_id"], {"reason": "AUDIT_UNAVAILABLE", "retryable": True, "next_action": "retry"})
        finally:
            with host.lock:
                host.inflight.pop(task["task_id"], None)

    def finding(self, task, report_id, job, answer, seen):
        source = job["source"]
        vid = source["source_version_id"] if source else None
        sentence = job["sentence"]
        claim = {"text": sentence["text"], "source_version_id": vid, "anchor_ids": [],
                 "status": "blocked", "limit": "Reference is unresolved or the selected full text is unavailable."}
        if job["cached"]:
            claim = job["cached"]
        elif job["usable"] and isinstance(answer, dict):
            refs = answer.get("evidence", [])
            for ref in refs[:6] if isinstance(refs, list) else []:
                if not isinstance(ref, dict) or not isinstance(ref.get("id"), str) or not isinstance(ref.get("quote"), str):
                    continue
                passage = seen.get(ref["id"])
                if not passage or passage["source_version_id"] != vid or not 12 <= len(ref["quote"]) <= 700:
                    continue
                doc = self.host.research.document(self.host.source(vid, task["topic_id"]), ref["id"])
                for actual in doc["passages"]:
                    if ref["quote"] in actual["text"]:
                        aid = self.host.store_anchor(task, report_id, {**actual, "paper_id": source["paper_id"],
                                                                      "source_version_id": vid}, ref["quote"])
                        claim["anchor_ids"].append(aid)
            state = answer.get("status")
            claim["status"] = (state if state in ("supported", "partial", "conflict") and claim["anchor_ids"]
                               else "evidence_not_established")
            claim["limit"] = (str(answer.get("limit", ""))[:1000]
                              if claim["anchor_ids"] or state == "evidence_not_established"
                              else "No valid supporting or conflicting passage was established.")
        elif job["usable"]:
            claim["limit"] = "The selected source could not be checked in this run."
        return {"finding_id": self.identifier(), "sentence_id": sentence["id"], "ref_key": job["ref_key"],
                "claims": [claim], "cache_key": job["cache"]}

    def report(self, topic, params):
        doc, draft = self.snapshot(topic, params)
        report = next((r for r in draft["reports"] if r["report_id"] == params.get("report_id")), None)
        if report is None:
            raise LiteratureError("NOT_FOUND", "Audit report was not found.", "refresh_data", -32001)
        return doc, report

    def review(self, topic, params):
        doc, report = self.report(topic, params)
        finding = next((f for f in report["findings"] if f["finding_id"] == params.get("finding_id")), None)
        decision = params.get("decision")
        if finding is None or decision not in ("accept", "reject", "defer"):
            raise LiteratureError("INVALID_PARAMS", "Select a finding and a review decision.")
        if decision == "accept":
            self.require_current(topic, params, [finding])
        finding["decision"] = decision
        claim = finding["claims"][0]
        if decision == "accept" and claim["anchor_ids"] and claim["status"] != "blocked":
            self.host.db.execute("INSERT OR REPLACE INTO audit_cache VALUES (?, ?)",
                                 (finding["cache_key"], json.dumps(claim, ensure_ascii=False)))
        else:
            # Only remove this review's cached decision; another report may have superseded it.
            self.host.db.execute("DELETE FROM audit_cache WHERE cache_key = ? AND finding = ?",
                                 (finding["cache_key"], json.dumps(claim, ensure_ascii=False)))
        self.host.put("pdf_draft", doc["draft_id"], doc)
        return {"finding_id": finding["finding_id"]}

    def save_to_wiki(self, topic, params):
        _, report = self.report(topic, params)
        finding = next((f for f in report["findings"] if f["finding_id"] == params.get("finding_id")), None)
        if not finding or finding.get("decision") != "accept" or not finding["claims"][0]["anchor_ids"]:
            raise LiteratureError("INVALID_PARAMS", "Accept an evidence-backed finding first.")
        claim = finding["claims"][0]
        version = claim["source_version_id"]
        self.require_current(topic, params, [finding])
        wiki = self.host.research.wiki(topic)
        key = "audit-" + finding["cache_key"]
        current = {item["id"]: item for item in wiki["items"]}
        if key in current:
            return {"item_id": key}
        status = {"supported": "supported", "partial": "partial", "conflict": "conflicting"}.get(claim["status"], "missing")
        current[key] = {"id": key, "kind": "point", "record_id": report["report_id"],
                        "anchor_ids": claim["anchor_ids"], "source_versions": [version],
                        "entry": {"id": key, "title": claim["text"], "claims": [{
                            "text": claim["text"], "assessment": status, "conditions": claim["limit"], "gap": "",
                            "contributions": [{"source_version_id": version, "assessment": status,
                                               "role": "Cited evidence", "anchor_ids": claim["anchor_ids"]}],
                        }]}}
        self.host.db.execute("INSERT INTO wiki_evidence VALUES (?, ?, ?)", (topic, key, version))
        self.host.put("research_wiki", topic, {"revision": self.identifier(), "items": list(current.values()),
                                             "history": wiki.get("history", [])})
        return {"item_id": key}

    def require_current(self, topic, params, findings):
        _, draft = self.snapshot(topic, params)
        targets = self.reference_versions(draft, self.sources(topic))
        if any(self.finding_stale(finding, targets) for finding in findings):
            raise LiteratureError("STALE_REVISION", "Check the current cited paper before using this finding.", "refresh_data", -32020)

    def export(self, topic, params):
        if params.get("format") not in ("audit_report", "evidence", "bibliography") or params.get("include_originals"):
            raise LiteratureError("INVALID_PARAMS", "Export selected evidence and bibliography without original files.")
        ids = params.get("item_ids")
        if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
            raise LiteratureError("INVALID_PARAMS", "Select the findings or outline points to export.")
        if params.get("record_id"):
            record = self.host.get("synthesis", params["record_id"])
            if record["topic_id"] != topic:
                raise LiteratureError("NOT_FOUND", "Outline is outside the selected topic.", "refresh_data", -32001)
            selected = {p["id"]: p["claims"] for p in record["points"]}
        else:
            _, report = self.report(topic, params)
            findings = {f["finding_id"]: f for f in report["findings"] if f.get("decision") == "accept"}
            self.require_current(topic, params, [findings[key] for key in ids if key in findings])
            selected = {key: f["claims"] for key, f in findings.items()}
        if not set(ids).issubset(selected):
            raise LiteratureError("INVALID_PARAMS", "Select available outline points or accepted findings.")
        markdown, bibliography = ["# PaperTrace evidence", ""], {}
        for key in dict.fromkeys(ids):
            for claim in selected[key]:
                markdown += [f'## {claim["text"]}', "",
                             f'Assessment: {claim["assessment"] if "assessment" in claim else claim["status"]}', ""]
                note = claim.get("conditions") or claim.get("limit")
                if note:
                    markdown += [note, ""]
                contributions = claim.get("contributions") or [claim]
                for item in contributions:
                    for aid in item.get("anchor_ids", []):
                        anchor = self.host.get("anchor", aid)
                        if anchor["topic_id"] != topic:
                            continue
                        a = anchor["value"]
                        source = self.host.get("paper", a["paper_id"])
                        row = self.host.db.execute("SELECT data FROM citation_index WHERE version_id = ?",
                                                   (a["source_version_id"],)).fetchone()
                        meta = json.loads(row[0]) if row else {}
                        title = meta.get("title") or source["title"]
                        cite = "pt" + stable_key(a["source_version_id"])[:16]
                        fields = {"title": title, **({"doi": meta["doi"]} if meta.get("doi") else {}),
                                  **({"eprint": meta["arxiv"], "archivePrefix": "arXiv"} if meta.get("arxiv") else {})}
                        bibliography[cite] = "@misc{" + cite + ",\n" + ",\n".join(
                            "  " + k + " = {" + re.sub(r"[{}\\\\]", " ", value) + "}" for k, value in fields.items()
                        ) + "\n}"
                        page = a["location"].get("page")
                        markdown += [f'- [@{cite}] {title} · ' + (f'PDF p. {page}' if page else 'Abstract'),
                                     f'  > {a["quote"]}', ""]
                        if not meta.get("doi") and not meta.get("arxiv"):
                            markdown += ["  Bibliographic identifier requires review.", ""]
        files = [{"name": "papertrace-evidence.md", "text": "\n".join(markdown)},
                 {"name": "papertrace-references.bib", "text": "\n\n".join(bibliography.values()) + "\n"}]
        return {"name": "PaperTrace evidence", "saved": True, "files": files[1:] if params["format"] == "bibliography" else files}
