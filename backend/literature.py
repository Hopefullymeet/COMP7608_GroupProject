"""Local full-text corpus, structured synthesis evidence, and reviewed Wiki."""

import base64
import binascii
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess


MAX_PDF = 16 * 1024 * 1024
MAX_VERSIONS = 12
RELATION_KINDS = {"background", "uses_method", "uses_data", "uses_benchmark", "extends",
                  "compares", "complements", "agrees", "conflicts"}
COVERAGE = {"supported", "partial", "conflicting", "missing"}
COMPARABILITY = {"comparable", "not_comparable", "unclear", "not_applicable"}


class LiteratureError(Exception):
    def __init__(self, reason, message, action="correct_request", code=-32602):
        super().__init__(message)
        self.reason, self.action, self.code = reason, action, code


def init_corpus(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS pdf_files (
            version_id TEXT PRIMARY KEY, digest TEXT NOT NULL, content BLOB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS pdf_digest ON pdf_files(digest);
        CREATE VIRTUAL TABLE IF NOT EXISTS paper_passages USING fts5(
            passage_id UNINDEXED, version_id UNINDEXED, page UNINDEXED,
            ordinal UNINDEXED, text, tokenize='unicode61'
        );
        CREATE TABLE IF NOT EXISTS passage_lookup (
            passage_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, page INTEGER NOT NULL,
            ordinal INTEGER NOT NULL, fts_rowid INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS passage_page ON passage_lookup(version_id, page, ordinal);
        INSERT OR IGNORE INTO passage_lookup
            SELECT passage_id, version_id, page, ordinal, rowid FROM paper_passages
            WHERE NOT EXISTS (SELECT 1 FROM passage_lookup);
        CREATE TABLE IF NOT EXISTS wiki_evidence (
            topic_id TEXT NOT NULL, item_id TEXT NOT NULL, version_id TEXT NOT NULL,
            PRIMARY KEY (topic_id, item_id, version_id)
        );
        CREATE INDEX IF NOT EXISTS wiki_evidence_version ON wiki_evidence(version_id);
    """)


def poppler(program):
    return shutil.which(program) or next(
        (str(path) for root in ("/opt/homebrew/bin", "/usr/local/bin")
         if (path := Path(root) / program).is_file()), program
    )


def pdf_content(params):
    try:
        if "path" in params:
            path = Path(params["path"])
            if not path.is_absolute() or path.suffix.lower() != ".pdf" or not path.is_file():
                raise ValueError
            with path.open("rb") as stream:
                content = stream.read(MAX_PDF + 1)
            filename = path.name
        else:
            filename = str(params["name"]).replace("\\", "/").rsplit("/", 1)[-1]
            data = params["content"]
            if not isinstance(data, str) or len(data) > ((MAX_PDF + 2) // 3) * 4:
                raise ValueError
            content = base64.b64decode(data, validate=True)
        if not content.startswith(b"%PDF-") or len(content) > MAX_PDF:
            raise ValueError
    except (KeyError, ValueError, TypeError, OSError, binascii.Error):
        raise LiteratureError("INVALID_PDF", "Choose a readable PDF up to 16 MB.") from None
    return filename, content


def extract_pdf(content):
    try:
        completed = subprocess.run(
            [poppler("pdftotext"), "-enc", "UTF-8", "-", "-"],
            input=content, capture_output=True, timeout=10, check=True,
        )
    except FileNotFoundError:
        raise LiteratureError("PDF_TOOLS_MISSING", "Install Poppler to import PDFs.", "configure_service") from None
    except (subprocess.SubprocessError, OSError):
        raise LiteratureError("PDF_READ_FAILED", "Could not extract text from this PDF.") from None
    pages = completed.stdout.decode("utf-8", errors="replace").split("\f")
    if pages[-1] == "":
        pages.pop()
    if len(pages) > 150 or sum(map(len, pages)) > 2_000_000:
        raise LiteratureError("PDF_TOO_LARGE", "Choose a paper with at most 150 pages of extractable text.")
    return pages


def make_passages(version, pages):
    for page, text in enumerate(pages, 1):
        words = " ".join(text.split()).split()
        for ordinal, start in enumerate(range(0, len(words), 160)):
            yield (f"{version}:{page}:{ordinal}", version, page, ordinal,
                   " ".join(words[start:start + 160]))


def render_pdf_page(content, page):
    try:
        rendered = subprocess.run(
            [poppler("pdftoppm"), "-f", str(page), "-l", str(page), "-scale-to", "1500", "-singlefile", "-png", "-"],
            input=content, capture_output=True, timeout=10, check=True,
        ).stdout
        if not rendered.startswith(b"\x89PNG"):
            raise ValueError
        return base64.b64encode(rendered).decode("ascii")
    except FileNotFoundError:
        raise LiteratureError("PDF_TOOLS_MISSING", "Install Poppler to open a PDF page.", "configure_service") from None
    except (OSError, ValueError, subprocess.SubprocessError):
        raise LiteratureError("PDF_READ_FAILED", "Could not render this PDF page.", "restore_source") from None


def digest(data):
    return hashlib.sha256(data).hexdigest()


def text(value, limit=1500):
    return value.strip()[:limit] if isinstance(value, str) else ""


def objects(value, limit):
    return [item for item in value[:limit] if isinstance(item, dict)] if isinstance(value, list) else []


def synthesis_result(raw, seen, versions, prior, anchor, dimensions=None):
    """Validate structural coverage and source provenance; semantic labels are model judgments."""
    gaps = [text(v) for v in raw.get("gaps", [])[:12] if text(v)] if isinstance(raw.get("gaps"), list) else []
    used = set()
    cache = {}

    def evidence(rows, version=None):
        valid = []
        for row in objects(rows, 8):
            key, quote = row.get("id"), row.get("quote")
            if not isinstance(key, str) or not isinstance(quote, str):
                continue
            passage = seen.get(key)
            if (not passage or passage["source_version_id"] not in versions
                    or (version and passage["source_version_id"] != version)
                    or not 12 <= len(quote.strip()) <= 700 or quote not in passage["text"]):
                continue
            if (key, quote) not in cache:
                cache[key, quote] = anchor(passage, quote)
            entry = cache[key, quote]
            if entry not in valid:
                valid.append(entry)
        return valid

    def previous(row, kind):
        value = row.get("prior_id")
        if not isinstance(value, str) or value in used or prior.get(value) != kind:
            return {}
        used.add(value)
        return {"prior_id": value}

    points = []
    for point in objects(raw.get("points"), 8):
        if not text(point.get("title")):
            continue
        claims = []
        for claim in objects(point.get("claims"), 8):
            statement = text(claim.get("text"))
            if not statement:
                continue
            contributions = []
            for row in objects(claim.get("contributions"), 12):
                version = row.get("version")
                role = text(row.get("role"), 240)
                assessment = text(row.get("assessment"), 32)
                if not isinstance(version, str) or version not in versions or not role or assessment not in COVERAGE - {"missing"}:
                    continue
                anchors = evidence(row.get("evidence"), version)
                if anchors:
                    contribution = {"source_version_id": version, "role": role, "assessment": assessment, "anchor_ids": anchors}
                    origin = row.get("reported_from")
                    if isinstance(origin, str) and origin != version and origin in versions:
                        attribution = evidence(row.get("attribution"), version)
                        if attribution:
                            contribution.update(reported_from=origin, attribution_anchor_ids=attribution)
                    contributions.append(contribution)
            assessments = {c["assessment"] for c in contributions}
            proposed = text(claim.get("assessment"), 32)
            if "conflicting" in assessments:
                assessment = "conflicting"
            elif proposed == "supported" and "supported" in assessments:
                assessment = "supported"
            elif contributions:
                assessment = "partial"
            else:
                assessment = "missing"
            claims.append({"text": statement, "conditions": text(claim.get("conditions")),
                           "assessment": assessment, "contributions": contributions,
                           "gap": text(claim.get("gap")) or ("Check the remaining conditions." if assessment != "supported" else "")})
        if claims:
            points.append({"title": text(point["title"], 240), "claims": claims, **previous(point, "point")})

    relations = []
    for row in objects(raw.get("relations"), 18):
        first, second = row.get("from"), row.get("to")
        kind = text(row.get("kind"), 32)
        if (not isinstance(first, str) or not isinstance(second, str) or first == second
                or first not in versions or second not in versions or kind not in RELATION_KINDS
                or not text(row.get("subject"))):
            continue
        left, right = evidence(row.get("from_evidence"), first), evidence(row.get("to_evidence"), second)
        comparability = text(row.get("comparability"), 32)
        axes, matches = {}, {}
        if isinstance(row.get("alignment"), dict):
            for axis in ("task", "dataset", "split", "metric", "setting"):
                item = row["alignment"].get(axis)
                if isinstance(item, dict):
                    detail = text(item.get("detail"), 220)
                    if detail:
                        axes[axis] = detail
                        match = text(item.get("match"), 20)
                        matches[axis] = match if match in {"same", "different"} else "unknown"
        if kind in {"compares", "agrees", "conflicts"}:
            if not (comparability == "comparable" and left and right
                    and len(matches) == 5 and set(matches.values()) == {"same"}):
                kind = "compares"
                comparability = ("not_comparable" if comparability == "not_comparable" or "different" in matches.values()
                                 else "unclear")
        comparability = comparability if comparability in COMPARABILITY else "not_applicable"
        cited = evidence(row.get("citation_evidence"), first)
        status = "proposed"
        if left and right and (kind not in {"background", "uses_method", "uses_data", "uses_benchmark", "extends"} or cited):
            status = "disputed" if kind == "conflicts" else "verified"
        relations.append({"from": first, "to": second, "kind": kind, "subject": text(row["subject"]),
                          "conditions": text(row.get("conditions")), "comparability": comparability,
                          "alignment": axes, "alignment_status": matches, "status": status,
                          "anchor_ids": list(dict.fromkeys([*left, *right, *cited])),
                          "citation_anchor_ids": cited, "open_question": text(row.get("open_question")),
                          **previous(row, "relation")})
    result = {"points": points, "relations": relations, "gaps": gaps}
    if dimensions:
        cells = {}
        for row in objects(raw.get("cells"), 24):
            dimension, version = row.get("dimension"), row.get("version")
            if dimension not in dimensions or not isinstance(version, str) or version not in versions:
                continue
            value = text(row.get("text"))
            anchors = evidence(row.get("evidence"), version)
            status = text(row.get("status"), 32)
            if value and (anchors or status == "missing"):
                cells.setdefault((dimension, version), {"dimension": dimension, "source_version_id": version,
                                                       "text": value, "anchor_ids": anchors,
                                                       "status": status if status in {"evidenced", "not_comparable", "disputed"} else "missing"})
        result["cells"] = [cells.get((dimension, version), {
            "dimension": dimension, "source_version_id": version, "text": "No source passage was established.",
            "anchor_ids": [], "status": "missing",
        }) for dimension in dimensions for version in versions]
    return result


def entry_anchors(entry):
    if "claims" not in entry:
        return entry["anchor_ids"]
    return [aid for claim in entry["claims"] for contribution in claim["contributions"]
            for aid in (*contribution["anchor_ids"], *contribution.get("attribution_anchor_ids", []))]
