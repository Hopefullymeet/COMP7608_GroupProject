"""Versioned journal and conference classifications stored in the local workspace."""

import argparse
import csv
from contextlib import nullcontext
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from urllib.parse import parse_qsl, urlsplit

from bibliography import conference_track, normalize_venue


JOURNAL = ("journal",)
CONFERENCE = ("conference",)
BOTH = (*JOURNAL, *CONFERENCE)
SCHEMES = {
    "jcr": ("JCR", "quartile", JOURNAL),
    "jci": ("JCR JCI", "quartile", JOURNAL),
    "cas": ("中科院期刊分区表", "quartile", JOURNAL),
    "sjr": ("SCImago SJR", "quartile", JOURNAL),
    "citescore": ("Scopus CiteScore", "quartile", JOURNAL),
    "scie": ("SCIE", "index", JOURNAL),
    "ssci": ("SSCI", "index", JOURNAL),
    "ahci": ("AHCI", "index", JOURNAL),
    "esci": ("ESCI", "index", JOURNAL),
    "cpci": ("CPCI", "index", CONFERENCE),
    "scopus": ("Scopus", "index", BOTH),
    "ei": ("Ei Compendex", "index", BOTH),
    "doaj": ("DOAJ", "index", JOURNAL),
    "medline": ("MEDLINE", "index", JOURNAL),
    "pmc": ("PubMed Central", "index", JOURNAL),
    "ccf": ("CCF", "rank", BOTH),
    "ccf_cn": ("CCF 计算领域高质量科技期刊", "rank", JOURNAL),
    "icore": ("CORE / ICORE", "rank", CONFERENCE),
    "cssci": ("CSSCI", "index", JOURNAL),
    "cscd": ("CSCD", "index", JOURNAL),
    "pku": ("北大核心", "index", JOURNAL),
    "cstpcd": ("中国科技核心", "index", JOURNAL),
    "ami": ("AMI", "rank", JOURNAL),
    "fms": ("FMS 管理科学高质量期刊", "rank", JOURNAL),
    "erihplus": ("ERIH PLUS", "index", JOURNAL),
    "abdc": ("ABDC", "rank", JOURNAL),
    "ajg": ("Academic Journal Guide (ABS)", "rank", JOURNAL),
    "ft50": ("FT Research Rank 50", "index", JOURNAL),
    "utd24": ("UT Dallas 24", "index", JOURNAL),
}
QUALIFIERS = re.compile(r"\b(findings|workshops?|companion|demos?|tutorials?|short papers?|posters?|symposia co located)\b",
                        re.I)


def init_venue_ranks(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS venue_catalogs (
            scheme TEXT NOT NULL, edition TEXT NOT NULL, year INTEGER NOT NULL,
            label TEXT NOT NULL, metric TEXT NOT NULL, types TEXT NOT NULL, source_url TEXT NOT NULL,
            PRIMARY KEY (scheme, edition)
        );
        CREATE TABLE IF NOT EXISTS venue_rank_rows (
            row_id INTEGER PRIMARY KEY, scheme TEXT NOT NULL, edition TEXT NOT NULL,
            venue TEXT NOT NULL, venue_type TEXT NOT NULL, value TEXT NOT NULL, category TEXT NOT NULL,
            source_url TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS venue_rank_catalog ON venue_rank_rows(scheme, edition);
        CREATE TABLE IF NOT EXISTS venue_rank_keys (key TEXT NOT NULL, row_id INTEGER NOT NULL,
                                                   PRIMARY KEY(key, row_id));
        CREATE INDEX IF NOT EXISTS venue_rank_row ON venue_rank_keys(row_id);
    """)


    # Small, explicitly scoped offline snapshots for the library's vision venues.
    venues = [
        ("IEEE Conference on Computer Vision and Pattern Recognition", "CVPR|IEEE/CVF Conference on Computer Vision and Pattern Recognition|IEEE/CVF Computer Vision and Pattern Recognition Conference", "A"),
        ("International Conference on Computer Vision", "ICCV|IEEE International Conference on Computer Vision|IEEE/CVF International Conference on Computer Vision", "A"),
        ("European Conference on Computer Vision", "ECCV", "B"),
    ]
    for scheme, edition, year, url in (
        ("ccf", "2022 · CV 摘选", 2022, "https://www.ccf.org.cn/Academic_Evaluation/AI/"),
        ("icore", "CORE2023 · CV 摘选", 2023, "https://portal.core.edu.au/conf-ranks/?search=vision&source=CORE2023"),
    ):
        if not db.execute("SELECT 1 FROM venue_catalogs WHERE scheme=?", (scheme,)).fetchone():
            import_catalog(db, scheme, edition, year, url, [
                {"venue": name, "aliases": aliases, "venue_type": "conference", "value": grade if scheme == "ccf" else "A*"}
                for name, aliases, grade in venues
            ])


def issns(value):
    text = " ".join(map(str, value)) if isinstance(value, (list, tuple)) else str(value or "")
    found = set()
    for candidate in re.findall(r"(?<![\w])\d{4}-?\d{3}[\dXx](?![\w])", text):
        code = candidate.replace("-", "").upper()
        check = sum(int(digit) * weight for digit, weight in zip(code, range(8, 1, -1)))
        if (check + (10 if code[-1] == "X" else int(code[-1]))) % 11 == 0:
            found.add(f"{code[:4]}-{code[4:]}")
    return sorted(found)


def name_key(name):
    return normalize_venue(unicodedata.normalize("NFKC", name))


def conference_key(name):
    name = re.sub(r"^(?:proceedings of (?:the )?)?(?:\d{4}\s+)?(?:\d+(?:st|nd|rd|th)\s+)?", "", name, flags=re.I)
    name = re.sub(r"\s*\([^)]*(?:volume|main conference|long papers)[^)]*\)\s*$", "", name, flags=re.I)
    name = re.sub(r"\s+(?:19|20)\d{2}$", "", name)
    return name_key(name)


def pdf_venue(first_page):
    front = re.split(r"(?im)^\s*(?:references|bibliography|参考文献)\s*$", first_page, maxsplit=1)[0]
    lines = front.splitlines()[:120]
    publication = {}
    for raw in lines:
        line = raw.strip()
        journal = re.match(r"^(?:journal(?: title)?|期刊(?:名称)?)\s*[:：]\s*(.{2,240})$", line, re.I)
        proceedings = re.match(r"^(Proceedings of .{4,245})$", line, re.I)
        if journal:
            publication.update(venue=journal[1], venue_type="journal")
            break
        if proceedings:
            venue = re.split(r",?\s+pages?\s+\d|,?\s+pp\.\s*\d", proceedings[1], maxsplit=1, flags=re.I)[0]
            publication.update(venue=venue, venue_type="conference")
            if track := conference_track(venue):
                publication["publication_track"] = track
            break
    if publication.get("venue_type") != "conference":
        labels = re.findall(r"\b(?:e-?|p-?)?ISSN\s*[:：]?\s*(\d{4}-?\d{3}[\dXx])",
                            "\n".join(lines), re.I)
        if codes := issns(labels):
            publication.update(issns=codes, venue_type="journal")
    return publication


def checked_url(url):
    parts = urlsplit(url)
    secret = any(re.search(r"token|secret|password|api.?key|signature", key, re.I)
                 for key, _ in parse_qsl(parts.query, keep_blank_values=True))
    if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password or secret
            or any(c.isspace() for c in url)):
        raise ValueError("Use a public HTTPS source URL.")
    return url


def csv_records(path, format_, scheme):
    native = {"sjr": {"sjr"}, "doaj": {"doaj"}, "mjl": {"scie", "ssci", "ahci", "esci"}}
    if format_ in native and scheme not in native[format_]:
        raise ValueError("The export format does not match the selected scheme.")
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows = csv.DictReader(file, delimiter=";" if format_ == "sjr" else ",")
        fields = set(rows.fieldnames or [])
        required = {"standard": {"venue", "venue_type", "value"}, "sjr": {"Title", "Issn", "SJR Best Quartile"},
                    "doaj": {"Journal title", "Journal ISSN (print version)", "Journal EISSN (online version)"},
                    "mjl": {"Journal title", "ISSN", "eISSN"}}[format_]
        headers = {field.strip().casefold(): field for field in fields}
        if not {field.casefold() for field in required} <= set(headers):
            raise ValueError(f"Expected columns: {', '.join(sorted(required))}.")
        for row in rows:
            def field(key):
                return (row.get(headers.get(key.casefold())) or "").strip()
            if format_ == "sjr":
                value = field("SJR Best Quartile")
                if value not in {"Q1", "Q2", "Q3", "Q4"}:
                    continue
                yield {"venue": field("Title"), "venue_type": "journal", "value": value, "issns": field("Issn"),
                       "category": "Best quartile"}
            elif format_ == "doaj":
                yield {"venue": field("Journal title"), "venue_type": "journal", "value": "Listed",
                       "issns": [field("Journal ISSN (print version)"), field("Journal EISSN (online version)")],
                       "source_url": field("DOAJ URL")}
            elif format_ == "mjl":
                yield {"venue": field("Journal title"), "venue_type": "journal", "value": scheme.upper(),
                       "issns": [field("ISSN"), field("eISSN")]}
            else:
                yield {key: field(key) for key in ("venue", "venue_type", "value", "issns", "aliases", "category", "source_url")}


class IcoreTable(HTMLParser):
    def __init__(self, edition):
        super().__init__()
        self.edition = edition
        self.rows = []
        self.path = None
        self.cells = []
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            action = dict(attrs).get("onclick") or ""
            self.path = re.search(r"/conf-ranks/\d+/", action)
            self.cells = []
            self.cell = None
        elif tag == "td" and self.path:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.cells.append(" ".join(" ".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.path:
            if len(self.cells) >= 4:
                venue, acronym, edition, grade = self.cells[:4]
                if edition.casefold() == self.edition.casefold() and venue and grade:
                    self.rows.append({"venue": venue, "aliases": acronym, "venue_type": "conference",
                                      "value": grade, "source_url": "https://portal.core.edu.au" + self.path[0]})
            self.path = None


def catalog_records(paths, format_, scheme, edition):
    for path in paths:
        if format_ == "icore-html":
            if scheme != "icore":
                raise ValueError("The export format does not match the selected scheme.")
            parser = IcoreTable(edition)
            parser.feed(path.read_text(encoding="utf-8-sig"))
            yield from parser.rows
        else:
            yield from csv_records(path, format_, scheme)


def import_catalog(db, scheme, edition, year, source_url, rows, *, label="", metric="", venue_types=(), transaction=True):
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,49}", scheme) or not edition.strip() or not 1900 <= year <= 9999:
        raise ValueError("Specify a scheme ID, edition and year.")
    if scheme == "cas" and year > 2025:
        raise ValueError("Use the original edition year for a historical CAS catalog.")
    source_url = checked_url(source_url)
    label, metric, venue_types = SCHEMES.get(scheme, (label, metric, venue_types))
    if not label or metric not in ("quartile", "rank", "index") or not venue_types or set(venue_types) - set(BOTH):
        raise ValueError("Custom schemes need a label, metric and at least one venue type.")
    count = 0
    with db if transaction else nullcontext():
        db.execute("""DELETE FROM venue_rank_keys WHERE row_id IN
                      (SELECT row_id FROM venue_rank_rows WHERE scheme=? AND edition=?)""", (scheme, edition))
        db.execute("DELETE FROM venue_rank_rows WHERE scheme=? AND edition=?", (scheme, edition))
        db.execute("""INSERT OR REPLACE INTO venue_catalogs
                      (scheme, edition, year, label, metric, types, source_url) VALUES (?,?,?,?,?,?,?)""",
                   (scheme, edition, year, label, metric, json.dumps(venue_types), source_url))
        for row in rows:
            venue, venue_type, value = (row[key] for key in ("venue", "venue_type", "value"))
            if not venue or not value or venue_type not in venue_types:
                raise ValueError(f"Invalid venue, type or value in row {count + 1}.")
            if scheme in {"jcr", "jci", "sjr", "citescore"} and value not in {"Q1", "Q2", "Q3", "Q4"}:
                raise ValueError(f"Invalid quartile in row {count + 1}.")
            if scheme == "cas" and value not in {"1区", "2区", "3区", "4区"}:
                raise ValueError(f"Use 1区, 2区, 3区 or 4区 for the historical CAS catalog in row {count + 1}.")
            if scheme == "ccf" and value not in {"A", "B", "C"}:
                raise ValueError(f"Invalid CCF rank in row {count + 1}.")
            key_for = conference_key if venue_type == "conference" else name_key
            canonical = key_for(venue)
            if not canonical:
                raise ValueError(f"Invalid venue in row {count + 1}.")
            if venue_type == "conference" and QUALIFIERS.search(canonical):
                # A named workshop may itself be ranked. Its full name and explicit aliases remain distinct.
                canonical = name_key(venue)
            names = {canonical, *(key_for(alias) for alias in row.get("aliases", "").split("|") if alias.strip())}
            keys = {"name:" + name for name in names if name}
            if venue_type == "journal":
                keys.update("issn:" + code for code in issns(row.get("issns")))
            row_id = db.execute("""INSERT INTO venue_rank_rows
                (scheme, edition, venue, venue_type, value, category, source_url) VALUES (?,?,?,?,?,?,?)""",
                (scheme, edition, venue, venue_type, value, row.get("category", ""),
                 checked_url(row["source_url"]) if row.get("source_url") else source_url)).lastrowid
            db.executemany("INSERT INTO venue_rank_keys VALUES (?,?)", ((key, row_id) for key in keys))
            count += 1
        if not count:
            raise ValueError("The catalog has no applicable entries.")
    return count


def lookup_rankings(db, metadata, year=None):
    db.execute("SAVEPOINT venue_lookup")
    try:
        return read_rankings(db, metadata, year)
    finally:
        db.execute("RELEASE venue_lookup")


def read_rankings(db, metadata, year):
    catalog = {}
    definitions = dict(SCHEMES)
    for scheme, edition, catalog_year, label, metric, venue_types, url in db.execute("""
        SELECT scheme, edition, year, label, metric, types, source_url FROM venue_catalogs
        ORDER BY year DESC, rowid DESC
    """):
        definitions[scheme] = (label, metric, json.loads(venue_types))
        if year is None or year == catalog_year:
            catalog.setdefault(scheme, {"edition": edition, "year": catalog_year, "source_url": url})
    venue, kind = metadata.get("venue", ""), metadata.get("venue_type")
    codes = issns(metadata.get("issns"))
    if not kind and codes:
        kind = "journal"
    name = (conference_key if kind == "conference" else name_key)(venue)
    keys = [*("issn:" + code for code in codes), *(["name:" + name] if name else [])]
    results = []
    for scheme, (label, metric, kinds) in definitions.items():
        source = catalog.get(scheme)
        result = {"scheme": scheme, "label": label, "metric": metric, "status": "catalog_missing", "entries": []}
        if source:
            result.update(source)
        other_track = (metadata.get("publication_track") == "other" or conference_track(venue) == "other")
        if (kind and kind not in kinds) or (scheme == "ccf" and kind == "conference" and other_track):
            result["status"] = "not_applicable"
        elif not keys:
            result["status"] = "venue_unknown"
        elif source:
            rows = db.execute(f"""SELECT key, venue, venue_type, value, category, source_url
                FROM venue_rank_keys JOIN venue_rank_rows USING (row_id)
                WHERE scheme=? AND edition=? AND key IN ({','.join('?' for _ in keys)})""",
                (scheme, source["edition"], *keys)).fetchall()
            eligible = [row for row in rows if not kind or row[2] == kind]
            exact = [row for row in eligible if row[0].startswith("issn:")]
            # If the paper has a known ISSN, use names only for catalog rows without an ISSN.
            if codes and not exact:
                eligible = db.execute(f"""SELECT key, venue, venue_type, value, category, source_url
                    FROM venue_rank_keys AS names JOIN venue_rank_rows AS rows USING (row_id)
                    WHERE rows.scheme=? AND rows.edition=? AND names.key=? AND rows.venue_type='journal'
                    AND NOT EXISTS (SELECT 1 FROM venue_rank_keys WHERE row_id=rows.row_id AND key LIKE 'issn:%')""",
                    (scheme, source["edition"], "name:" + name)).fetchall()
            matched = exact or eligible
            identities = {(name_key(row[1]), row[2]) for row in matched}
            conflicting_grade = len({(row[4], row[3]) for row in matched}) > len({row[4] for row in matched})
            matching = "issn" if exact else "name"
            result["status"] = "not_found"
            if len(identities) > 1 or conflicting_grade:
                result["status"] = "ambiguous"
            elif matched:
                result["status"] = "matched"
                # The CCF venue rank may be displayed, with the paper track separately marked for review.
                if scheme == "ccf" and matched[0][2] == "conference":
                    track = metadata.get("publication_track") or conference_track(venue)
                    if other_track:
                        result["status"] = "not_applicable"
                        results.append(result)
                        continue
                    result["applicability"] = "confirmed" if track == "regular" else "verify_track"
                result["entries"] = [
                    {"venue": title, "venue_type": typ, "value": value, "category": cat,
                     "source_url": url, "matched_by": matching}
                    for title, typ, value, cat, url in sorted({tuple(row[1:]) for row in matched})
                ]
        results.append(result)
    return {"venue_type": kind or "unknown", "items": results}


def main():
    parser = argparse.ArgumentParser(description="Install an authorized venue catalog in a PaperTrace workspace.")
    parser.add_argument("workspace", type=Path)
    parser.add_argument("files", type=Path, nargs="+")
    parser.add_argument("--scheme", required=True)
    parser.add_argument("--edition", required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--format", choices=("standard", "sjr", "doaj", "mjl", "icore-html"), default="standard")
    parser.add_argument("--label", default="")
    parser.add_argument("--metric", choices=("rank", "index", "quartile"), default="")
    parser.add_argument("--venue-type", choices=BOTH, action="append", default=[])
    args = parser.parse_args()
    try:
        rows = catalog_records(args.files, args.format, args.scheme, args.edition)
        args.workspace.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(args.workspace / "workspace.sqlite3") as db:
            init_venue_ranks(db)
            count = import_catalog(db, args.scheme, args.edition, args.year, args.source_url, rows,
                                   label=args.label, metric=args.metric, venue_types=args.venue_type)
    except (ValueError, OSError, csv.Error, sqlite3.Error) as error:
        parser.exit(1, f"{error}\n")
    print(f"Imported {count} {args.scheme} entries for {args.edition}.")


if __name__ == "__main__":
    main()
