"""Public bibliographic lookup. Calls are independent of the workspace database."""

import ipaddress
import json
import time
from http.client import HTTPException, IncompleteRead
from html.parser import HTMLParser
import re
import socket
import ssl
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from literature import LiteratureError, MAX_PDF


OPENALEX = "https://api.openalex.org/works"
CROSSREF = "https://api.crossref.org/works/"
ARXIV = "https://export.arxiv.org/api/query"
PROVIDERS = {"OpenAlex": "https://api.openalex.org", "Crossref": CROSSREF, "arXiv": ARXIV}
ATOM = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
ARXIV_ID = r"(?:\d{4}\.\d{4,5}|[a-z][a-z.\-]*/\d{7})(?:v[1-9]\d*)?"
PROXY_FAKE_IP_RANGE = ipaddress.ip_network("198.18.0.0/15")
PUBLIC_PDF_ARCHIVES = {"aclanthology.org", "arxiv.org", "export.arxiv.org", "pmc.ncbi.nlm.nih.gov"}


class PublicServiceError(LiteratureError):
    def __init__(self, reason, message, action="retry", retryable=True):
        super().__init__(reason, message, action, -32017)
        self.retryable = retryable


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(url, key=None):
    headers = {"User-Agent": "PaperTrace/0.4 (scholarly metadata client)"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        with build_opener(NoRedirect()).open(Request(url, headers=headers), timeout=6) as response:
            body = response.read(2_000_001)
    except HTTPError as error:
        if error.code in (401, 403):
            raise PublicServiceError("SERVICE_NOT_CONFIGURED", "The provider refused access. Check its configuration.",
                                     "configure_service", False) from None
        if error.code == 429:
            raise PublicServiceError("SERVICE_RATE_LIMITED", "The provider is rate limiting requests.") from None
        if error.code == 404:
            raise PublicServiceError("NOT_FOUND", "The provider did not find this identifier.",
                                     "correct_request", False) from None
        raise PublicServiceError("SERVICE_UNAVAILABLE", "The metadata provider did not respond successfully.") from None
    except (URLError, OSError) as error:
        timeout = isinstance(getattr(error, "reason", error), (TimeoutError, socket.timeout))
        raise PublicServiceError("SERVICE_TIMEOUT" if timeout else "SERVICE_UNAVAILABLE",
                                 "The metadata request timed out." if timeout else "The metadata provider is unreachable.") from None
    if len(body) > 2_000_000:
        raise PublicServiceError("SERVICE_INVALID_RESPONSE", "The metadata response was too large.")
    return body


def json_response(url, key=None):
    try:
        result = json.loads(fetch(url, key))
        if not isinstance(result, dict):
            raise ValueError
        return result
    except ValueError:
        raise PublicServiceError("SERVICE_INVALID_RESPONSE", "The metadata provider returned invalid JSON.") from None


def doi(value):
    if not isinstance(value, str):
        return ""
    value = re.sub(r"^(?:doi:\s*|https?://(?:dx\.)?doi\.org/)", "", value.strip(), flags=re.I)
    return value.lower() if (re.fullmatch(r"10\.\d{4,9}/[^\s?#<>]+", value, re.I)
                             and not {".", ".."}.intersection(value.split("/"))) else ""


def arxiv_id(value):
    value = re.sub(r"^(?:arxiv:\s*|https?://(?:(?:www|export)\.)?arxiv\.org/(?:abs|pdf)/)", "", value.strip(), flags=re.I)
    value = re.sub(r"\.pdf$", "", value, flags=re.I)
    return value.lower() if re.fullmatch(ARXIV_ID, value, re.I) else ""


def identity_keys(record):
    raw = record.get("identity", "")
    metadata = record.get("metadata", record)
    normalized_doi = doi(metadata.get("doi", raw))
    arxiv = metadata.get("arxiv_id", raw[6:] if raw.startswith("arxiv:") else "")
    if not arxiv and normalized_doi.startswith("10.48550/arxiv."):
        arxiv = arxiv_id(normalized_doi.split("/arxiv.", 1)[1])
    work_id = metadata.get("source_id") or raw
    return {key for key in (
        normalized_doi, "arxiv:" + re.sub(r"v\d+$", "", arxiv) if arxiv else "",
        work_id if re.fullmatch(r"https://openalex\.org/W\d+", work_id) else "",
        work_id if re.fullmatch(r"urn:papertrace:bibliography:[0-9a-f]{64}:\d+", work_id) else "",
    ) if key}


def selected_metadata(record):
    return {key: record[key] for key in ("title", "authors", "year", "venue", "doi", "arxiv_id", "source_id",
                                        "metadata_url", "provider", "issns", "venue_type", "publication_track")
            if key in record}


def conference_track(name):
    if re.search(r"\b(findings|workshops?|companion|demos?|tutorials?|posters?|short papers?)\b", name, re.I):
        return "other"
    if re.search(r"\b(?:long|full|regular) papers?\b", name, re.I):
        return "regular"
    return ""


def lookup_target(value):
    identifier = arxiv_id(value)
    if identifier:
        return "arXiv", identifier
    normalized = doi(value)
    if normalized.startswith("10.48550/arxiv."):
        identifier = arxiv_id(normalized.split("/arxiv.", 1)[1])
        if identifier:
            return "arXiv", identifier
    if normalized:
        return "Crossref", normalized
    raise LiteratureError("INVALID_PARAMS", "Enter a DOI or arXiv identifier.")


def metadata_from_provider(provider, identifier):
    if provider == "Crossref":
        row = json_response(CROSSREF + quote(identifier, safe="/")).get("message", {})
        if not isinstance(row, dict) or doi(row.get("DOI") or "") != identifier:
            raise PublicServiceError("SERVICE_INVALID_RESPONSE", "Crossref returned a different work.")
        dates = (row.get("published") or row.get("issued") or {}).get("date-parts") or [[]]
        venue = next(iter(row.get("container-title") or []), "")
        if row.get("type") == "proceedings-article":
            venue = (row.get("event") or {}).get("name") or venue
        result = {"title": next(iter(row.get("title") or []), ""), "doi": identifier,
                  "authors": [" ".join(filter(None, (a.get("given"), a.get("family"))))
                              for a in row.get("author") or []],
                  "year": next(iter(dates[0]), None), "venue": venue,
                  "metadata_url": f"https://doi.org/{identifier}"}
        if row.get("type") == "journal-article":
            result.update(venue_type="journal", issns=row.get("ISSN") or [])
        if row.get("type") == "proceedings-article":
            result["venue_type"] = "conference"
            container = " ".join(row.get("container-title") or [])
            track = conference_track(f"{container} {venue}")
            if track:
                result["publication_track"] = track
                if track == "other":
                    result["venue"] = container if conference_track(container) else venue
    else:
        try:
            feed = ET.fromstring(fetch(ARXIV + "?" + urlencode({"id_list": identifier, "max_results": 1})))
        except ET.ParseError:
            raise PublicServiceError("SERVICE_INVALID_RESPONSE", "arXiv returned invalid metadata.") from None
        entry = feed.find("a:entry", ATOM)
        if entry is None:
            raise PublicServiceError("NOT_FOUND", "arXiv did not find this identifier.", "correct_request", False)
        def field(tag):
            return " ".join(entry.findtext(tag, "", ATOM).split())
        returned = arxiv_id(field("a:id"))
        if (not returned or (returned != identifier and
                             (re.search(r"v\d+$", identifier) or re.sub(r"v\d+$", "", returned) != identifier))):
            raise PublicServiceError("NOT_FOUND", "arXiv did not find this identifier.", "correct_request", False)
        published = field("a:published")[:4]
        result = {"title": field("a:title"), "arxiv_id": returned,
                  "authors": [a.findtext("a:name", "", ATOM) for a in entry.findall("a:author", ATOM)],
                  "year": int(published) if published.isdigit() else None,
                  "venue": field("x:journal_ref"), "metadata_url": f"https://arxiv.org/abs/{returned}",
                  "venue_type": "preprint"}
        if publication_doi := doi(field("x:doi")):
            result["doi"] = publication_doi
    if not result["title"]:
        raise PublicServiceError("SERVICE_INVALID_RESPONSE", "The bibliographic record has no title.")
    result["authors"] = list(filter(None, result["authors"]))
    return {**result, "provider": provider}


def abstract_text(index):
    if not isinstance(index, dict):
        return ""
    words = {p: w for w, positions in index.items() if isinstance(positions, list)
             for p in positions if type(p) is int and 0 <= p < 6000}
    if not words or len(words) != max(words) + 1:
        return ""
    return " ".join(words[p] for p in range(len(words)))


def normalize_venue(value):
    return re.sub(r"[\W_]+", " ", value.casefold()).strip()


def open_pdf_urls(row):
    urls = []
    pages = []
    for location in [row.get("best_oa_location"), row.get("primary_location"), *(row.get("locations") or [])]:
        if not isinstance(location, dict) or not location.get("is_oa"):
            continue
        landing = location.get("landing_page_url") or ""
        if landing.startswith("https://"):
            pages.append(landing)
        url = location.get("pdf_url")
        if not url:
            landing = location.get("landing_page_url") or ""
            if landing.startswith("https://arxiv.org/abs/") and (identifier := arxiv_id(landing)):
                url = "https://arxiv.org/pdf/" + identifier
        if isinstance(url, str) and url.startswith("https://") and url not in urls:
            urls.append(url)
    return list(dict.fromkeys([*urls, *pages]))


def publicly_resolved(host):
    if not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9-]+\.)+[a-z]{2,63}", host):
        return False
    try:
        answer = json_response("https://dns.google/resolve?" + urlencode({"name": host, "type": "A"}))
        addresses = [ipaddress.ip_address(rr["data"]) for rr in answer.get("Answer", []) if rr.get("type") == 1]
        return bool(addresses) and all(ip.is_global for ip in addresses)
    except (PublicServiceError, ValueError, KeyError):
        return False


def public_pdf_url(url):
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError("Invalid PDF address")
    addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses:
        raise ValueError("Invalid PDF host")
    for item in addresses:
        address = ipaddress.ip_address(item[4][0])
        # Some desktop DNS proxies map public names into the benchmarking range.
        if address.is_global or (address in PROXY_FAKE_IP_RANGE and
                                 (parts.hostname in PUBLIC_PDF_ARCHIVES or publicly_resolved(parts.hostname))):
            continue
        raise ValueError("Invalid PDF host")
    return url


class PdfRedirect(HTTPRedirectHandler):
    last_url = None

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.last_url = public_pdf_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, self.last_url)


class PaperLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pdf = []
        self.anchors = []
        self.href = ""
        self.label = []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "a":
            self.href, self.label = fields.get("href") or "", []
        if tag == "meta" and (fields.get("name") or "").lower() == "citation_pdf_url":
            self.pdf.append(fields.get("content") or "")
        if tag in ("link", "a") and fields.get("type") == "application/pdf":
            self.pdf.append(fields.get("href") or "")

    def handle_data(self, data):
        if self.href:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.anchors.append((self.href, "".join(self.label)))
            self.href = ""


def archive_copies(candidate):
    authors = candidate.get("authors") or []
    for author in dict.fromkeys(authors[:2]):
        slug = re.sub(r"[^a-z0-9]+", "-", author.lower()).strip("-")
        if not slug:
            continue
        try:
            links = PaperLinks()
            links.feed(fetch(f"https://aclanthology.org/people/{slug}/").decode("utf-8", "replace"))
        except PublicServiceError:
            continue
        for href, label in links.anchors:
            if (re.fullmatch(r"/[A-Za-z0-9.-]+/", href)
                    and normalize_venue(label) == normalize_venue(candidate["title"])):
                yield "https://aclanthology.org" + href.rstrip("/") + ".pdf"
                break


def download_open_pdf(urls):
    deadline = time.monotonic() + 85
    pending = list(urls)
    seen = set()
    retries = {}
    while pending and time.monotonic() < deadline:
        url = pending.pop(0)
        if url in seen:
            continue
        seen.add(url)
        redirects = PdfRedirect()
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            request = Request(public_pdf_url(url), headers={"User-Agent": "PaperTrace/0.4", "Accept": "application/pdf"})
            with build_opener(redirects).open(request, timeout=min(18, remaining)) as response:
                length = getattr(response, "headers", {}).get("Content-Length")
                expected = int(length) if length and length.isdecimal() else None
                if expected is not None and expected > MAX_PDF:
                    continue
                body = bytearray()
                while len(body) <= MAX_PDF and time.monotonic() < deadline:
                    chunk = response.read1(65536)
                    if not chunk:
                        if expected is not None and len(body) < expected:
                            raise IncompleteRead(b"", expected - len(body))
                        if body.startswith(b"%PDF-"):
                            return bytes(body)
                        break
                    body.extend(chunk)
                    if len(body) >= 5 and not body.startswith(b"%PDF-"):
                        if b"<" in body[:512] and len(body) <= 512_000:
                            body.extend(response.read(512_000 - len(body)))
                            page = PaperLinks()
                            page.feed(body.decode("utf-8", "replace"))
                            base = getattr(response, "url", url)
                            pending[:0] = [urljoin(base, href) for href in page.pdf if href]
                        break
        except (OSError, HTTPException) as error:
            if isinstance(error, HTTPError) and error.code not in (408, 502, 503, 504):
                continue
            if isinstance(getattr(error, "reason", error), ssl.SSLCertVerificationError):
                continue
            attempt = retries.get(url, 0) + 1
            target = redirects.last_url or url
            if attempt <= 2 and time.monotonic() + attempt < deadline:
                retries[target] = max(attempt, retries.get(target, 0))
                seen.discard(target)
                pending.append(target)
                time.sleep(attempt)
        except ValueError:
            continue
    return None


def openalex_search(query, filters, key):
    criteria = ["is_retracted:false"]
    if "year_from" in filters:
        criteria.append(f"publication_year:>{filters['year_from'] - 1}")
    if "year_to" in filters:
        criteria.append(f"publication_year:<{filters['year_to'] + 1}")
    params = {"search": query, "filter": ",".join(criteria), "per_page": 50 if "venue" in filters else 20,
              "select": "id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,locations,abstract_inverted_index"}
    payload = json_response(OPENALEX + "?" + urlencode(params), key)
    rows = payload.get("results")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise PublicServiceError("SERVICE_INVALID_RESPONSE", "OpenAlex returned invalid search results.")
    candidates, gaps = [], []
    venue_filter = normalize_venue(filters.get("venue", ""))
    unknown_venues = 0
    seen = set()
    for row in rows:
        work_id, title = row.get("id", ""), row.get("display_name")
        if not isinstance(work_id, str) or not re.fullmatch(r"https://openalex\.org/W\d+", work_id) or not title:
            continue
        work_doi = doi(row.get("doi") or "")
        year = row.get("publication_year")
        if any(k in filters for k in ("year_from", "year_to")) and (
                type(year) is not int or not filters.get("year_from", 1) <= year <= filters.get("year_to", 9999)):
            continue
        location = row.get("primary_location") or {}
        source = location.get("source") or {}
        if venue_filter:
            conferences = [s["display_name"] for loc in [location, *(row.get("locations") or [])]
                           if (s := loc.get("source") or {}).get("type") == "conference" and s.get("display_name")]
            if not conferences:
                unknown_venues += 1
            match = next((name for name in conferences
                          if f" {venue_filter} " in f" {normalize_venue(name)} "), None)
            if not match:
                continue
            source = {"display_name": match, "type": "conference"}
        if work_id in seen or (work_doi and work_doi in seen):
            continue
        seen.update(filter(None, (work_id, work_doi)))
        abstract = abstract_text(row.get("abstract_inverted_index"))
        candidates.append({"title": title, "authors": [n for a in row.get("authorships") or []
                           if (n := (a.get("author") or {}).get("display_name"))],
                           **({"year": year} if type(year) is int else {}),
                           **({"doi": work_doi} if work_doi else {}), "source_id": work_id,
                           "metadata_url": work_id, "provider": "OpenAlex", "abstract": abstract,
                           "pdf_urls": open_pdf_urls(row),
                           **({"venue": {"name": source["display_name"], "source": "OpenAlex"}}
                              if source.get("display_name") else {}),
                           **({"venue_type": source["type"], "issns": source.get("issn") or []}
                              if source.get("type") in ("journal", "conference") else {}),
                           "available_scope": "abstract" if abstract else "metadata", "read_scope": "none",
                           "reason": "Matched the OpenAlex search query."})
    if venue_filter:
        gaps.append(f"Conference filter checked the first {len(rows)} OpenAlex results. "
                    f"{unknown_venues} had no verified conference metadata.")
    return candidates, gaps


def bibliography_records(format_, content):
    """Read a UTF-8 bibliographic export without resolving links or attachments."""
    if not isinstance(content, str) or not content.strip() or len(content) > 2_000_000:
        raise LiteratureError("INVALID_PARAMS", "Choose a nonempty bibliography of at most two million characters.")
    content = content.lstrip("\ufeff")
    if format_ == "csl-json":
        try:
            records = json.loads(content)
        except (ValueError, RecursionError):
            raise LiteratureError("INVALID_PARAMS", "The CSL JSON file is invalid.") from None
        if isinstance(records, dict):
            records = [records]
    elif format_ == "ris":
        records = ris_records(content)
    elif format_ == "bibtex":
        records = bibtex_records(content)
    elif format_ == "zotero-rdf":
        records = zotero_rdf_records(content)
    else:
        raise LiteratureError("INVALID_PARAMS", "Choose a BibTeX, RIS, CSL JSON or Zotero RDF bibliography.")
    if not isinstance(records, list) or not 1 <= len(records) <= 500:
        raise LiteratureError("INVALID_PARAMS", "Choose a bibliography containing one to 500 entries.")
    return records


def bibtex_records(content):
    try:
        from pybtex.backends.plaintext import Backend
        from pybtex.database.input.bibtex import LowLevelParser, Parser
        from pybtex.exceptions import PybtexError
        from pybtex.richtext import Text
    except ImportError:
        raise LiteratureError("BIBTEX_PARSER_UNAVAILABLE", "Install the BibTeX parser in the worker environment.",
                              "configure_service", -32017) from None

    class BoundedParser(LowLevelParser):
        # A small file can contain macros that expand into large strings.
        expanded = 0

        def parse_value(self):
            super().parse_value()
            length = sum(map(len, self.current_value))
            self.expanded += length
            if length > 100_000 or self.expanded > 8_000_000:
                raise LiteratureError("INVALID_PARAMS", "The BibTeX file expands beyond the import limit.")

    parser = Parser()
    seen = set()
    try:
        for entry_type, fields in BoundedParser(content, macros=parser.macros):
            if entry_type.lower() in ("string", "preamble"):
                continue
            key = fields[0].casefold()
            if key in seen:
                raise LiteratureError("INVALID_PARAMS", "The BibTeX file repeats an entry key.")
            if len(seen) >= 500:
                raise LiteratureError("INVALID_PARAMS", "Choose a bibliography containing at most 500 entries.")
            seen.add(key)
            parser.process_entry(entry_type, *fields)
    except (PybtexError, ValueError, RecursionError):
        raise LiteratureError("INVALID_PARAMS", "The BibTeX file is invalid. Check its syntax and entry keys.") from None

    output = Backend()

    def display(value):
        return Text.from_latex(value).render(output)

    records = []
    for entry in parser.data.entries.values():
        fields = entry.fields
        kind = entry.type.lower()
        parent = parser.data.entries.get(fields.get("crossref", ""))
        venue = fields.get("journal") or fields.get("journaltitle") or fields.get("booktitle")
        if not venue and parent and kind in ("inproceedings", "conference"):
            venue = parent.fields.get("title")
        year = re.match(r"\d{4}", fields.get("year") or fields.get("date", ""))
        if not year and parent:
            year = re.match(r"\d{4}", parent.fields.get("year") or parent.fields.get("date", ""))
        identifier = ""
        if fields.get("archiveprefix", fields.get("eprinttype", "")).lower() == "arxiv":
            identifier = arxiv_id(fields.get("eprint", ""))
        records.append({
            "title": display(fields.get("title", "")), "container-title": display(venue or ""),
            "author": [{"literal": display(str(author))} for author in entry.persons.get("author", [])],
            "abstract": display(fields.get("abstract", "")), "DOI": display(fields.get("doi", "")),
            "arxiv_id": identifier, "URL": fields.get("url", ""),
            "type": {"article": "article-journal", "inproceedings": "paper-conference",
                     "conference": "paper-conference"}.get(kind),
            "issued": {"date-parts": [[int(year[0])]]} if year else {},
        })
    return records


def ris_records(content):
    records = []
    entry = None
    previous = None
    for line in content.splitlines():
        if not line.strip():
            continue
        field = re.fullmatch(r"([A-Z0-9]{2})[ \t]+-[ \t]*(.*)", line)
        if not field:
            if entry is None or previous is None or not line[0].isspace():
                raise LiteratureError("INVALID_PARAMS", "An RIS field or record boundary is invalid.")
            entry[previous][-1] += " " + line.strip()
            continue
        tag, value = field.groups()
        if tag == "TY" and entry is None:
            entry = {}
        if entry is None or (tag == "TY" and entry):
            raise LiteratureError("INVALID_PARAMS", "Each RIS record needs a TY and ER boundary.")
        if tag == "ER":
            def first(*tags):
                return next((entry[key][0] for key in tags if key in entry), "")

            year = re.match(r"\d{4}", first("PY", "Y1", "DA"))
            records.append({
                "title": first("TI", "T1", "CT"), "container-title": first("JF", "JO", "JA", "T2"),
                "author": [{"literal": a} for a in (entry.get("AU") or entry.get("A1") or [])],
                "abstract": first("AB", "N2"), "DOI": first("DO"), "URL": first("UR"),
                "type": {"JOUR": "article-journal", "CPAPER": "paper-conference"}.get(first("TY")),
                "issued": {"date-parts": [[int(year[0])]]} if year else {},
            })
            if len(records) > 500:
                raise LiteratureError("INVALID_PARAMS", "Choose a bibliography containing at most 500 entries.")
            entry, previous = None, None
        else:
            entry.setdefault(tag, []).append(value.strip())
            previous = tag
    if entry is not None:
        raise LiteratureError("INVALID_PARAMS", "The last RIS record has no ER boundary.")
    return records


def imported_metadata(row, format_):
    if not isinstance(row, dict):
        return None
    title = row.get("title")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 500:
        return None
    authors = []
    creators = row.get("author")
    if isinstance(creators, list):
        for author in creators[:500]:
            if not isinstance(author, dict):
                continue
            names = [author.get(k) for k in ("given", "family")]
            name = author.get("literal") or " ".join(part.strip() for part in names if isinstance(part, str))
            if isinstance(name, str) and name.strip():
                authors.append(name.strip()[:300])
    meta = {"title": title.strip(), "authors": authors, "provider": {"csl-json": "CSL JSON", "ris": "RIS", "bibtex": "BibTeX", "zotero-rdf": "Zotero RDF"}[format_]}
    venue = row.get("container-title")
    if isinstance(venue, str) and venue.strip():
        meta["venue"] = venue.strip()[:300]
    venue_type = {"article-journal": "journal", "paper-conference": "conference"}.get(
        row["type"] if isinstance(row.get("type"), str) else "")
    if venue_type:
        meta["venue_type"] = venue_type
    issued = row.get("issued")
    dates = issued.get("date-parts") if isinstance(issued, dict) else None
    if isinstance(dates, list) and dates and isinstance(dates[0], list) and dates[0]:
        year = dates[0][0]
        if type(year) is int and 1 <= year <= 9999:
            meta["year"] = year
    normalized = doi(row.get("DOI"))
    if normalized:
        meta["doi"] = normalized
    raw_identifier = row.get("arxiv_id")
    identifier = arxiv_id(raw_identifier) if isinstance(raw_identifier, str) else ""
    url = row.get("URL")
    if not identifier and isinstance(url, str) and re.match(
        r"https?://(?:(?:www|export)\.)?arxiv\.org/(?:abs|pdf)/", url, re.I
    ):
        identifier = arxiv_id(url)
    if identifier:
        meta["arxiv_id"] = identifier
    abstract = row.get("abstract")
    if isinstance(abstract, str) and abstract.strip():
        meta["abstract"] = abstract.strip()[:24000]
    return meta


ZOTERO_NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "bib": "http://purl.org/net/biblio#",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "link": "http://purl.org/rss/1.0/modules/link/",
    "z": "http://www.zotero.org/namespaces/export#",
}
RDF = "{" + ZOTERO_NS["rdf"] + "}"


class ZoteroNote(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if tag == "br" and not self.hidden:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
        if tag in ("p", "div", "li", "h1", "h2", "h3", "blockquote") and not self.hidden:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    def text(self):
        return re.sub(r"\n{3,}", "\n\n", "".join(self.parts)).strip()[:12000]


def zotero_rdf_records(content):
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", content, re.I):
        raise LiteratureError("INVALID_PARAMS", "Zotero RDF must not declare a document type or entity.")
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        raise LiteratureError("INVALID_PARAMS", "The Zotero RDF file is invalid.") from None
    if root.tag != RDF + "RDF":
        raise LiteratureError("INVALID_PARAMS", "Choose a Zotero RDF export.")

    def ref(node):
        return (node.get(RDF + "about") or node.get(RDF + "resource") or
                ("_:" + node.get(RDF + "nodeID") if node.get(RDF + "nodeID") else ""))

    def text(node, path):
        return (node.findtext(path, default="", namespaces=ZOTERO_NS) or "").strip() if node is not None else ""

    nodes = {key: node for node in root.iter() if (key := ref(node))
             and (node.get(RDF + "about") or node.get(RDF + "nodeID")) and len(node)}

    def edge_target(edge):
        if len(edge):
            return edge[0]
        return nodes.get(ref(edge))

    def related(node, path):
        return [target for edge in node.findall(path, ZOTERO_NS) if (target := edge_target(edge)) is not None]

    def kind(node, namespace, name):
        target = ZOTERO_NS[namespace] + name
        return node.tag == "{" + ZOTERO_NS[namespace] + "}" + name or any(
            edge.get(RDF + "resource") == target for edge in node.findall("rdf:type", ZOTERO_NS))

    collections = {key: node for key, node in nodes.items() if kind(node, "z", "Collection")}
    if len(collections) > 500:
        raise LiteratureError("INVALID_PARAMS", "Export at most 500 Zotero collections at a time.")
    memberships, parents = {}, {}
    for key, node in collections.items():
        for edge in node.findall("dcterms:hasPart", ZOTERO_NS):
            child = ref(edge[0]) if len(edge) else ref(edge)
            if child in collections:
                if child in parents and parents[child] != key:
                    raise LiteratureError("INVALID_PARAMS", "A Zotero collection has multiple parents.")
                parents[child] = key
            elif child:
                memberships.setdefault(child, set()).add(key)

    paths = {}
    for key in collections:
        path, visited, current = [], set(), key
        while current:
            if current in visited or len(path) == 20:
                raise LiteratureError("INVALID_PARAMS", "A Zotero collection hierarchy is cyclic or too deep.")
            visited.add(current)
            path.append(text(collections[current], "dc:title") or "Zotero collection")
            current = parents.get(current)
        paths[key] = " / ".join(reversed(path))[:160]

    records = []
    for key, node in nodes.items():
        item_type = text(node, "z:itemType")
        if not item_type or item_type in ("note", "attachment", "annotation"):
            continue
        venue = next(iter(related(node, "dcterms:isPartOf")), None)
        if venue is not None and kind(venue, "bib", "Part"):
            venue = next(iter(related(venue, "dcterms:isPartOf")), None)
        conference = next(iter(related(node, "bib:presentedAt")), None)
        identifiers = []
        for source in (node, venue):
            if source is None:
                continue
            for entry in source.findall("dc:identifier", ZOTERO_NS):
                value = text(edge_target(entry), "rdf:value") or entry.get(RDF + "resource") or entry.text or ""
                identifiers.append(value.strip())
        if key.lower().startswith(("https://", "http://")):
            identifiers.append(key)
        normalized_doi = next((candidate for value in identifiers
                               if (candidate := doi(re.sub(r"^DOI\s+", "", value, flags=re.I)))), "")
        preprint = next((candidate for value in identifiers if (candidate := arxiv_id(value))), "")
        author_seq = next(iter(related(node, "bib:authors")), None)
        authors = [] if author_seq is None else [
            {"given": text(author, "foaf:givenName"), "family": text(author, "foaf:surname")}
            for author in related(author_seq, "rdf:li")]
        year = re.search(r"\b\d{4}\b", text(node, "dc:date"))
        notes = []
        for note in related(node, "dcterms:isReferencedBy"):
            parser = ZoteroNote()
            parser.feed(text(note, "rdf:value"))
            parser.close()
            if body := parser.text():
                notes.append(body)
        attachments = []
        for index, attachment in enumerate(related(node, "link:link"), 1):
            link = attachment.find("z:path", ZOTERO_NS)
            path = unquote((link.get(RDF + "resource") or link.text or "").strip()) if link is not None else ""
            filename = path.split("/")[-1] or text(attachment, "dc:title")
            parts = path.split("/")
            available = (path and len(path) <= 1000 and all(part not in ("", ".", "..") for part in parts)
                         and parts[0] != "~" and not re.search(r"[\\:\x00-\x1f\x7f]|%[0-9A-Fa-f]{2}", path))
            if text(attachment, "link:type").lower() != "application/pdf" and not filename.lower().endswith(".pdf"):
                continue
            item = {"attachment_id": str(index), "name": filename[:200] or "attachment.pdf",
                    "status": "awaiting_file" if available else "missing_path"}
            if available:
                item["relative_path"] = path
            attachments.append(item)
        records.append({
            "title": text(node, "dc:title"), "author": authors,
            "type": {"journalArticle": "article-journal", "conferencePaper": "paper-conference"}.get(item_type),
            "container-title": text(venue, "dc:title") or text(conference, "dc:title"),
            "abstract": text(node, "dcterms:abstract"),
            "DOI": normalized_doi, "arxiv_id": preprint,
            "issued": {"date-parts": [[int(year[0])]]} if year else {},
            "zotero": {"collections": [{"id": cid, "title": paths[cid]} for cid in sorted(memberships.get(key, []))],
                       "notes": notes, "attachments": attachments,
                       "tags": [e.text.strip() for e in node.findall("dc:subject", ZOTERO_NS)
                                if e.text and 0 < len(e.text.strip()) <= 80]},
        })
    return records


def export_bibliography(papers, format_):
    from literature import digest

    parts = []
    keys = []
    for paper_id, metadata in papers:
        key = "pt" + digest(paper_id.encode("utf-8"))[:24]
        keys.append({"paper_id": paper_id, "citation_key": key})
        title = metadata["title"]
        authors = [name for name in metadata["authors"] if name.strip()]
        year, venue = metadata.get("year"), metadata.get("venue")
        doi_value, arxiv = metadata.get("doi"), metadata.get("arxiv_id")
        venue_type = metadata.get("venue_type")
        if format_ == "csl-json":
            entry = {"id": key, "title": title,
                     "type": {"journal": "article-journal", "conference": "paper-conference",
                              "preprint": "article"}.get(venue_type, "document")}
            if authors:
                entry["author"] = [{"literal": name} for name in authors]
            if year:
                entry["issued"] = {"date-parts": [[year]]}
            if venue:
                entry["container-title"] = venue
            if doi_value:
                entry["DOI"] = doi_value
            if arxiv:
                entry["URL"] = f"https://arxiv.org/abs/{arxiv}"
            if metadata.get("issns"):
                entry["ISSN"] = ", ".join(metadata["issns"])
            parts.append(entry)
            continue

        kind = {"journal": "article", "conference": "inproceedings"}.get(venue_type, "misc")
        fields = [("title", bibtex_escape(title))]
        if authors:
            encoded = [bibtex_escape(name) for name in authors]
            fields.append(("author", " and ".join(
                "{" + value + "}" if re.search(r"\band\b", name, re.I) else value
                for name, value in zip(authors, encoded))))
        if year:
            fields.append(("year", str(year)))
        if venue:
            name = {"article": "journal", "inproceedings": "booktitle"}.get(kind, "howpublished")
            fields.append((name, bibtex_escape(venue)))
        if doi_value:
            fields.append(("doi", bibtex_escape(doi_value)))
        if arxiv:
            fields.extend((("eprint", bibtex_escape(arxiv)), ("archivePrefix", "arXiv")))
        if metadata.get("issns"):
            fields.append(("issn", bibtex_escape(", ".join(metadata["issns"]))))
        body = ",\n".join("  " + name + " = {" + value + "}" for name, value in fields)
        parts.append(f"@{kind}{{{key},\n{body}\n}}")

    content = json.dumps(parts, ensure_ascii=False, indent=2) if format_ == "csl-json" else "\n\n".join(parts)
    extension = "json" if format_ == "csl-json" else "bib"
    return {"name": "papertrace-bibliography." + extension, "content": content + "\n", "entries": keys}


def bibtex_escape(value):
    special = {"\\": r"\textbackslash{}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    special.update({char: "\\" + char for char in "{}%#&_$"})
    return "".join(special.get(char, char) for char in " ".join(value.split()))
