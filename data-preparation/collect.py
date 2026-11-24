"""Collect a research-paper pilot. Generated matches are candidates, never gold labels."""
import hashlib
import json
from html.parser import HTMLParser
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'meta' and attributes.get('name', '').startswith('citation_'):
            self.values.setdefault(attributes['name'], []).append(attributes.get('content', ''))


PAPERS = [
    ("dpr", "retrieval_qa", "2020.emnlp-main.550", "Dense Passage Retrieval for Open-Domain Question Answering"),
    ("fid", "retrieval_qa", "2021.eacl-main.74", "Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering"),
    ("s2orc", "scientific_reading", "2020.acl-main.447", "S2ORC: The Semantic Scholar Open Research Corpus"),
    ("qasper", "scientific_reading", "2021.naacl-main.365", "A Dataset of Information-Seeking Questions and Answers Anchored in Research Papers"),
    ("fever", "claim_verification", "N18-1074", "FEVER: a Large-scale Dataset for Fact Extraction and VERification"),
    ("scifact", "claim_verification", "2020.emnlp-main.609", "Fact or Fiction: Verifying Scientific Claims"),
    ("drqa", "retrieval_qa", "P17-1171", "Reading Wikipedia to Answer Open-Domain Questions"),
    ("orqa", "retrieval_qa", "P19-1612", "Latent Retrieval for Weakly Supervised Open Domain Question Answering"),
    ("alce", "retrieval_qa", "2023.emnlp-main.398", "Enabling Large Language Models to Generate Text with Citations"),
    ("rarr", "retrieval_qa", "2023.acl-long.910", "RARR: Researching and Revising What Language Models Say, Using Language Models"),
    ("scicite", "scientific_reading", "N19-1361", "Structural Scaffolds for Citation Intent Classification in Scientific Publications"),
    ("scibert", "scientific_reading", "D19-1371", "SciBERT: A Pretrained Language Model for Scientific Text"),
    ("specter", "scientific_reading", "2020.acl-main.207", "SPECTER: Document-level Representation Learning using Citation-informed Transformers"),
    ("scitldr", "scientific_reading", "2020.findings-emnlp.428", "TLDR: Extreme Summarization of Scientific Documents"),
    ("vitaminc", "claim_verification", "2021.naacl-main.52", "Get Your Vitamin C! Robust Fact Verification with Contrastive Evidence"),
    ("multifc", "claim_verification", "D19-1475", "MultiFC: A Real-World Multi-Domain Dataset for Evidence-Based Fact Checking of Claims"),
    ("eraser", "claim_verification", "2020.acl-main.408", "ERASER: A Benchmark to Evaluate Rationalized NLP Models"),
    ("fever2", "claim_verification", "D19-6601", "The FEVER2.0 Shared Task"),
]


def download(url, path, pdf=False):
    if path.exists():
        return path.read_bytes()
    request = Request(url, headers={"User-Agent": "PaperTrace-Coursework-Pilot/0.1"})
    with urlopen(request, timeout=60) as response:
        data = response.read()
    if pdf and not data.startswith(b"%PDF-"):
        raise ValueError("Response is not a PDF")
    path.write_bytes(data)
    return data


def main():
    corpus = ROOT / "corpus"
    review = ROOT / "review"
    corpus.mkdir(exist_ok=True)
    review.mkdir(exist_ok=True)
    previous = {r['paper_id']: r for r in json.loads((ROOT / 'manifest.json').read_text())} if (ROOT / 'manifest.json').exists() else {}
    records, pages_by_id = [], {}
    for paper_id, topic, acl_id, title in PAPERS:
        folder = corpus / paper_id
        folder.mkdir(exist_ok=True)
        base = f"https://aclanthology.org/{acl_id}"
        record = dict(paper_id=paper_id, topic=topic, title=title,
                      source_url=base + "/", pdf_url=base + ".pdf",
                      version=acl_id, split="pilot", license_status="not_reviewed",
                      retrieved_at=previous.get(paper_id, {}).get('retrieved_at', datetime.now(timezone.utc).isoformat()))
        try:
            html = download(base + "/", folder / "source.html")
            metadata = Metadata()
            metadata.feed(html.decode('utf-8'))
            record.update(source_title=metadata.values.get('citation_title', [title])[0],
                          authors=metadata.values.get('citation_author', []),
                          publication_date=metadata.values.get('citation_publication_date', [None])[0],
                          doi=metadata.values.get('citation_doi', [None])[0],
                          family_id=paper_id)
            download(base + ".bib", folder / "source.bib")
            pdf = download(base + ".pdf", folder / "paper.pdf", pdf=True)
            digest = hashlib.sha256(pdf).hexdigest()
            reader = PdfReader(folder / "paper.pdf")
            pages = [dict(pdf_page=i + 1, text=p.extract_text() or "")
                     for i, p in enumerate(reader.pages)]
            if not any(p["text"].strip() for p in pages):
                raise ValueError("No extractable text")
            (folder / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8")
            record.update(status="collected", sha256=digest, page_count=len(pages),
                          pdf_path=f"corpus/{paper_id}/paper.pdf",
                          text_path=f"corpus/{paper_id}/pages.json")
            pages_by_id[paper_id] = pages
        except Exception as exc:
            record.update(status="failed", error=str(exc))
        records.append(record)
        print(paper_id, record["status"], flush=True)
    candidates = []
    for source, target, terms in [
        ("fid", "dpr", ["Karpukhin", "Dense Passage Retrieval"]),
        ("qasper", "s2orc", ["S2ORC", "Lo et al."]),
        ("scifact", "fever", ["FEVER", "Thorne"]),
        ("dpr", "drqa", ["Chen et al.", "Reading Wikipedia"]),
        ("dpr", "orqa", ["Lee et al.", "Latent retrieval"]),
        ("orqa", "drqa", ["Chen et al.", "Reading Wikipedia"]),
        ("fid", "orqa", ["Lee et al.", "Latent retrieval"]),
        ("alce", "rarr", ["RARR", "Researching and revising"]),
        ("specter", "scibert", ["SciBERT", "Beltagy"]),
        ("specter", "scicite", ["scaffolds", "Cohan et al."]),
        ("qasper", "scitldr", ["Cachola", "TLDR"]),
        ("scifact", "eraser", ["DeYoung", "ERASER"]),
        ("vitaminc", "fever", ["Thorne", "FEVER"]),
        ("multifc", "fever", ["Thorne", "FEVER"]),
        ("fever2", "fever", ["Thorne", "FEVER"]),
    ]:
        hits = []
        for page in pages_by_id.get(source, []):
            text = page["text"]
            for term in terms:
                start = 0
                while (pos := text.lower().find(term.lower(), start)) >= 0:
                    hits.append(dict(pdf_page=page["pdf_page"], term=term,
                                     context=text[max(0, pos - 180):pos + 400]))
                    start = pos + len(term)
        candidates.append(dict(source_paper_id=source, target_paper_id=target,
                               review_status="machine_candidate", citation_confirmed=None,
                               intent_labels=[], hits=hits))
    (review / "relation_candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    report = dict(total=len(records), collected=sum(r["status"] == "collected" for r in records),
                  failed=[r["paper_id"] for r in records if r["status"] == "failed"])
    (ROOT / "collection_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report), flush=True)
    if report["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
