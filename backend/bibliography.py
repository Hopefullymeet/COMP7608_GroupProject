"""Public bibliographic lookup. Calls are independent of the workspace database."""

import json
import re
import socket
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from literature import LiteratureError


OPENALEX = "https://api.openalex.org/works"
CROSSREF = "https://api.crossref.org/works/"
ARXIV = "https://export.arxiv.org/api/query"
PROVIDERS = {"OpenAlex": "https://api.openalex.org", "Crossref": CROSSREF, "arXiv": ARXIV}
ATOM = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
ARXIV_ID = r"(?:\d{4}\.\d{4,5}|[a-z][a-z.\-]*/\d{7})(?:v[1-9]\d*)?"


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
    value = re.sub(r"^(?:arxiv:\s*|https?://(?:www\.)?arxiv\.org/(?:abs|pdf)/)", "", value.strip(), flags=re.I)
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


def openalex_search(query, filters, key):
    criteria = ["is_retracted:false"]
    if "year_from" in filters:
        criteria.append(f"publication_year:>{filters['year_from'] - 1}")
    if "year_to" in filters:
        criteria.append(f"publication_year:<{filters['year_to'] + 1}")
    params = {"search": query, "filter": ",".join(criteria), "per_page": 50 if "venue" in filters else 20,
              "select": "id,doi,display_name,publication_year,authorships,primary_location,locations,abstract_inverted_index"}
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
    else:
        raise LiteratureError("INVALID_PARAMS", "Choose an RIS or CSL JSON bibliography.")
    if not isinstance(records, list) or not 1 <= len(records) <= 500:
        raise LiteratureError("INVALID_PARAMS", "Choose a bibliography containing one to 500 entries.")
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
    meta = {"title": title.strip(), "authors": authors, "provider": {"csl-json": "CSL JSON", "ris": "RIS"}[format_]}
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
    url = row.get("URL")
    if isinstance(url, str) and url.lower().startswith(("https://arxiv.org/", "http://arxiv.org/",
                                                        "https://www.arxiv.org/", "http://www.arxiv.org/")):
        identifier = arxiv_id(url)
        if identifier:
            meta["arxiv_id"] = identifier
    abstract = row.get("abstract")
    if isinstance(abstract, str) and abstract.strip():
        meta["abstract"] = abstract.strip()[:24000]
    return meta
