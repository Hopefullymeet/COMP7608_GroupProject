"""Check local data integrity only. Does not run or score the PaperTrace system."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_lines(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def main():
    papers = {p['paper_id']:p for p in json.loads((ROOT/'manifest.json').read_text())}
    pages = {}
    for key,p in papers.items():
        assert p['status']=='collected', key
        assert hashlib.sha256((ROOT/p['pdf_path']).read_bytes()).hexdigest()==p['sha256'], key
        pages[key]=json.loads((ROOT/p['text_path']).read_text())
        assert len(pages[key])==p['page_count'] and p['authors'], key
    cases=load_lines(ROOT/'review/cases.jsonl')
    relations=load_lines(ROOT/'review/relations.jsonl')
    inputs=load_lines(ROOT/'review/task_inputs.jsonl')
    assert len({c['case_id'] for c in cases})==len(cases)
    assert len(inputs)==len(cases)
    spans=0

    def check_evidence(e):
        nonlocal spans
        p=papers[e['paper_id']]
        assert e['pdf_sha256']==p['sha256']
        text=pages[e['paper_id']][e['pdf_page']-1]['text']
        assert text[e['char_start']:e['char_end']]==e['exact_quote']
        spans+=1

    for c,inp in zip(cases,inputs):
        assert inp=={k:c[k] for k in ['case_id','topic','task_type','split','input']}
        assert 'reference' not in inp and 'review_status' not in inp
        assert set(c['input']['allowed_paper_ids']) <= set(papers)
        es=c['reference'].get('evidence',[])
        for e in es:
            check_evidence(e)
            assert e['paper_id'] in c['input']['allowed_paper_ids']
        ids={e['evidence_id'] for e in es}
        for a in c['reference'].get('atomic_claims',[]):
            assert set(a.get('evidence_ids',[])) <= ids
            assert a['semantic_label'] in ['supported','contradicted','not_established',None]
            assert (a['semantic_label'] is None)==(a['execution_status']=='blocked')
        if c['review_status']=='adjudicated':
            assert len([x for x in c['annotations'] if x.get('annotator_kind')=='human'])>=2 and c['adjudication']
        if c['review_status']=='assistant_source_checked':
            assert any(x.get('annotator_kind')=='ai_assistant' for x in c['annotations'])
            assert c['adjudication'] is None
    for r in relations:
        assert r['source_paper_id'] in papers and r['target_paper_id'] in papers
        for e in r['evidence']:
            check_evidence(e)
    report=dict(papers=len(papers),pdf_pages=sum(x['page_count'] for x in papers.values()),
                cases=len(cases),relations=len(relations),exact_span_checks=spans,
                task_types=dict(Counter(c['task_type'] for c in cases)),
                human_adjudicated=sum(c['review_status']=='adjudicated' for c in cases),
                assistant_source_checked_cases=sum(c['review_status']=='assistant_source_checked' for c in cases),
                assistant_source_checked_relations=sum(r['review_status']=='assistant_source_checked' for r in relations),
                status='passed',scope='Data integrity, not semantic accuracy or model performance')
    (ROOT/'review/validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
