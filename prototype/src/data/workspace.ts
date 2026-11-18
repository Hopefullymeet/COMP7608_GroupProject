import type { DraftSentence, LibraryMeta, WikiPage } from './types'
import { DEMO_TOPIC, PAPERS } from './fixtures'

// Sample data for the Library, Evidence wiki, Citation check and Models & services
// pages. File names, counts and dates are mock; quotes come from EVIDENCE.

export const LIBRARY_SEED = ['qasper', 'scifact', 'multivers', 'rag-lewis', 'dpr', 's2orc']

export const LIBRARY_META: Record<string, LibraryMeta> = {
  qasper: {
    paperId: 'qasper', added: 'Nov 2', origin: 'Imported PDF', identity: 'arXiv:2105.03011 · matched by arXiv id',
    files: [
      { name: 'dasigi-2021-qasper.pdf', role: 'Published version', detail: 'NAACL 2021 · only the abstract is available to read here', href: 'https://aclanthology.org/2021.naacl-main.365.pdf' },
      { name: 'arXiv:2105.03011', role: 'Preprint', detail: 'Linked as an earlier version, not stored as a file', href: 'https://arxiv.org/abs/2105.03011' },
    ],
    tags: ['dataset', 'full-text QA'], annotations: 3,
  },
  'qasper-import': {
    paperId: 'qasper-import', added: 'Just now', origin: 'Imported PDF',
    identity: 'Separate record · identifier unverified',
    files: [{ name: 'QASPER paper (1).pdf', role: 'Imported version', detail: 'Text has not been reviewed' }],
    tags: [], annotations: 0,
  },
  pubmedqa: {
    paperId: 'pubmedqa', added: 'Today', origin: 'Added from search', identity: 'arXiv:1909.06146 · matched by arXiv id',
    files: [{ name: 'Abstract from Semantic Scholar', role: 'Abstract only', detail: 'No PDF yet. Import one to read the full text' }],
    tags: ['dataset', 'biomedical'], annotations: 0,
  },
  scifact: {
    paperId: 'scifact', added: 'Oct 21', origin: 'Added from search', identity: 'arXiv:2004.14974 · matched by arXiv id',
    files: [{ name: 'Abstract from Semantic Scholar', role: 'Abstract only', detail: 'No PDF yet' }],
    tags: ['claim verification'], annotations: 1,
  },
  multivers: {
    paperId: 'multivers', added: 'Nov 6', origin: 'Added from search', identity: 'Matched by DOI',
    files: [{ name: 'ACL Anthology publication', role: 'Published version', detail: 'Selected excerpts available', href: 'https://aclanthology.org/2022.findings-naacl.6/' }],
    tags: ['claim verification'], annotations: 0,
  },
  'rag-lewis': {
    paperId: 'rag-lewis', added: 'Nov 5', origin: 'Added from search', identity: 'arXiv:2005.11401 · matched by arXiv id',
    files: [{ name: 'arXiv preprint', role: 'Preprint', detail: 'Selected excerpts available', href: 'https://arxiv.org/abs/2005.11401' }],
    tags: ['retrieval', 'generation'], annotations: 0,
  },
  dpr: {
    paperId: 'dpr', added: 'Nov 5', origin: 'Added from search', identity: 'Matched by DOI and arXiv ID',
    files: [{ name: 'ACL Anthology publication', role: 'Published version', detail: 'Abstract excerpt available', href: 'https://aclanthology.org/2020.emnlp-main.550/' }],
    tags: ['retrieval', 'open-domain QA'], annotations: 0,
  },
  s2orc: {
    paperId: 's2orc', added: 'Oct 9', origin: 'Added from search', identity: 'Matched by title, authors and year',
    files: [{ name: 'OpenAlex record', role: 'Metadata only', detail: 'Bibliographic record only' }],
    tags: ['corpus'], annotations: 0,
  },
  eli5: {
    paperId: 'eli5', added: 'Today', origin: 'Added from search', identity: 'Matched by title, authors and year',
    files: [{ name: 'OpenAlex record', role: 'Metadata only', detail: 'Bibliographic record only' }], tags: [], annotations: 0,
  },
  nq: {
    paperId: 'nq', added: 'Today', origin: 'Added from search', identity: 'Matched by title, authors and year',
    files: [{ name: 'Semantic Scholar record', role: 'Metadata only', detail: 'Bibliographic record only' }], tags: [], annotations: 0,
  },
}

export const SAMPLE_MEMBERSHIP: Record<string, string[]> = {
  qasper: [DEMO_TOPIC, 't-cite'],
  scifact: [DEMO_TOPIC, 't-claims'],
  multivers: [DEMO_TOPIC],
  'rag-lewis': ['t-rag'],
  dpr: ['t-rag'],
}

/** An import that needs a decision: same title and authors, different file hash. */
export const DUPLICATE_REVIEW = {
  file: 'QASPER paper (1).pdf',
  paperId: 'qasper',
  separateId: 'qasper-import',
  match: 'Title, authors and year match',
  reason: 'The hashes differ. A hash identifies file contents; paper identity needs a separate decision.',
  version: { name: 'QASPER paper (1).pdf', role: 'Imported version', detail: 'Linked during import review · text has not been reviewed' } satisfies LibraryMeta['files'][number],
}

// ---------- Citation check ----------

const RELATED_WORK_CITES = {
  dasigi2021: 'qasper',
  jin2019: 'pubmedqa',
  wadden2020: 'scifact',
}

const RELATED_WORK: DraftSentence[] = [
  { id: 'd1', text: 'QASPER answers and SciFact judgments both come with annotated evidence.', cites: [] },
  { id: 'd2', text: 'QASPER contains over 5,000 questions about NLP papers, each answered with supporting evidence.', cites: ['dasigi2021'] },
  { id: 'd3', text: 'Current models already match human performance on QASPER.', cites: ['dasigi2021'] },
  { id: 'd4', text: 'PubMedQA asks models to reason over full biomedical papers.', cites: ['jin2019'] },
  { id: 'd5', text: 'Evidence annotation makes QA models more accurate.', cites: ['dasigi2021', 'wadden2020'] },
  { id: 'd6', text: "QASPER's test split is larger than its validation split.", cites: ['dasigi2021'] },
]

export const MANUSCRIPTS: { id: string; name: string; citeKeys: Record<string, string>; sentences: DraftSentence[] }[] = [
  { id: 'related-work', name: 'related-work.md', citeKeys: RELATED_WORK_CITES, sentences: RELATED_WORK },
  {
    id: 'retrieval-methods', name: 'retrieval-methods.md',
    citeKeys: { lewis2020: 'rag-lewis', karpukhin2020: 'dpr' },
    sentences: [
      { id: 'r1', text: 'DPR learns embeddings for questions and passages with a dual encoder.', cites: [] },
      { id: 'r2', text: 'RAG initializes its retriever without a pretrained encoder.', cites: ['lewis2020'] },
      { id: 'r3', text: 'RAG uses a dense vector index of Wikipedia.', cites: ['lewis2020'] },
    ],
  },
]

// ---------- Evidence wiki ----------

export const WIKI_SEED: WikiPage[] = [
  {
    id: 'w-qasper', title: PAPERS.qasper.title, kind: 'Dataset', paperId: 'qasper',
    summary: 'Information-seeking questions over NLP papers, answered from the full text with supporting evidence.',
    statements: [
      { id: 'wq1', text: 'Questions were written by people who read only the title and abstract.', evidenceIds: ['qasper-written'], author: 'You' },
      { id: 'wq2', text: 'A separate group answered them and provided supporting evidence.', evidenceIds: ['qasper-evidence'], author: 'Saved answer' },
      { id: 'wq3', text: '5,049 questions over 1,585 NLP papers.', evidenceIds: ['qasper-scale'], author: 'You' },
    ],
    relations: [{ id: 'qasper-scifact', fromPaperId: 'qasper', toPaperId: 'scifact', type: 'contrasts with', evidenceIds: ['qasper-evidence', 'scifact-task'], status: 'verified' }],
    questions: [],
    revisions: [{ when: '2 hours ago', who: 'You', what: 'Created from 2 saved notes and 1 saved answer' }],
  },
  paperWikiPage('scifact', 'Dataset', 'A benchmark for verifying claims against scientific abstracts.', [
    ['scifact-task', 'The task retrieves abstracts that support or refute a scientific claim and identifies rationales for the decision.'],
  ]),
  paperWikiPage('multivers', 'Paper', 'A scientific claim verification method that shares document context across predictions.', [
    ['multivers-context', 'Fact-checking and rationale selection share an encoding of the claim and full document context.'],
    ['multivers-datasets', 'The experiments include the dataset introduced in Fact or Fiction: Verifying Scientific Claims.'],
  ], [{ id: 'multivers-scifact', fromPaperId: 'multivers', toPaperId: 'scifact', type: 'uses', evidenceIds: ['multivers-datasets'], status: 'verified' }]),
  paperWikiPage('rag-lewis', 'Paper', 'A generator that uses passages retrieved from an external index.', [
    ['rag-index', 'The external memory is a dense index of Wikipedia.'],
    ['rag-retriever', 'The authors initialize the retriever with a pretrained encoder from Dense Passage Retrieval for Open-Domain Question Answering.'],
  ], [{ id: 'rag-dpr', fromPaperId: 'rag-lewis', toPaperId: 'dpr', type: 'uses', evidenceIds: ['rag-retriever'], status: 'verified' }]),
  paperWikiPage('dpr', 'Paper', 'Dense retrieval for selecting passages that can answer open-domain questions.', [
    ['dpr-encoders', 'A dual encoder learns dense representations of questions and passages for retrieval.'],
  ]),
]

export const WIKI_NOTE_SEED = ['qasper-written', 'qasper-scale', 'scifact-task', 'multivers-context', 'rag-retriever', 'dpr-encoders']

function paperWikiPage(paperId: string, kind: WikiPage['kind'], summary: string, statements: [string, string][], relations: WikiPage['relations'] = []): WikiPage {
  return {
    id: 'w-' + paperId, paperId, title: PAPERS[paperId].title, kind, summary, relations,
    statements: statements.map(([id, text]) => ({ id: 'seed-' + id, text, evidenceIds: [id], author: 'You' })),
    questions: [],
    revisions: [{ when: 'Nov 6', who: 'You', what: 'Created from saved source excerpts' }],
  }
}

// ---------- Models & services ----------

export const MODEL_OPTIONS = [
  { id: 'anthropic', name: 'Anthropic API', where: 'Remote', note: 'Uses a model ID from your Anthropic account.' },
  { id: 'compatible', name: 'OpenAI-compatible endpoint', where: 'Custom endpoint', note: 'Uses the base URL and model ID you provide.' },
  { id: 'local', name: 'Local model', where: 'This device', note: 'Runs model inference through Ollama on this computer.' },
] as const

export const SEARCH_SOURCES = [
  { id: 'openalex', name: 'OpenAlex', fields: ['Publication year', 'Primary source ID', 'Open access', 'Work type', 'Citation count'], note: 'Structured metadata for filtering works by year and primary source.' },
  { id: 's2', name: 'Semantic Scholar', fields: ['Year', 'Venue', 'Fields of study', 'Open-access PDF', 'Publication type'], note: 'Abstracts for screening candidates.' },
  { id: 'arxiv', name: 'arXiv', fields: ['Category', 'Submission date'], note: 'Searches preprints by arXiv category and submission date.' },
] as const

export const PARSERS = [
  { name: 'GROBID', role: 'Sections, references and citation positions', where: 'Local parser', status: 'Unconnected' },
  { name: 'Docling', role: 'Complex layouts, tables and OCR for scanned pages', where: 'Optional local parser', status: 'Unconnected' },
  { name: 'PDF.js', role: 'Displays the original PDF for checking', where: 'PDF viewer', status: 'Unavailable in demo' },
]
