import type { DraftSentence, LibraryMeta } from './types'
import type { WikiKind, WikiOrigin } from '../api/wiki'
import { DEMO_TOPIC } from './fixtures'

// Sample data for the Library, Wiki, Citation check and Models & services
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

// ---------- Wiki ----------

export const NOTE_SEED = ['qasper-written', 'qasper-scale', 'scifact-task', 'multivers-context', 'rag-retriever', 'dpr-encoders']

type SampleEntry = [kind: WikiKind, origin: WikiOrigin, text: string, evidenceIds: string[], pinned?: true]
export type WikiSample = {
  topicId: string
  minutesAgo: number
  headline: string
  summary: string[]
  entries: SampleEntry[]
  thread: { role: 'user' | 'assistant'; text: string; added?: string }[]
}

/** Topic Wikis that have already accumulated: parsed papers, Q&A turns, notes and a chat-taught preference. */
export const WIKI_SAMPLES: WikiSample[] = [
  {
    topicId: DEMO_TOPIC, minutesAgo: 95,
    headline: 'Research on how scientific QA datasets tie answers to evidence, across QASPER, SciFact and MultiVerS.',
    summary: [
      'This topic compares datasets and methods that ask questions about research papers. QASPER poses information-seeking questions written from titles and abstracts and answered from full text, while SciFact frames the task as verifying claims against abstracts with rationale sentences.',
      'Across the conversations so far, the recurring theme is that answers must point to supporting evidence. QASPER asks annotators for evidence alongside answers, and MultiVerS shares the full document context between labelling a claim and selecting rationales.',
      'Still open: whether the reported gaps between models and humans come from retrieval over long papers or from reasoning once the evidence is found.',
    ],
    entries: [
      ['focus', 'summary', 'Which datasets test QA over research papers, and how do they handle evidence?', []],
      ['paper', 'pdf', 'QASPER: 5,049 questions over 1,585 NLP papers, written by people who read only the title and abstract.', ['qasper-scale', 'qasper-written']],
      ['paper', 'paper', 'SciFact: decide whether abstracts SUPPORT or REFUTE a scientific claim and identify the rationale sentences.', ['scifact-task']],
      ['paper', 'pdf', 'MultiVerS: fact-checking and rationale selection share one encoding of the claim and full document context.', ['multivers-context']],
      ['finding', 'qa', 'QASPER answers come with supporting evidence provided by a separate group of annotators.', ['qasper-evidence']],
      ['finding', 'qa', 'Models trail humans by at least 27 F1 points when answering QASPER questions from entire papers.', ['qasper-gap']],
      ['finding', 'note', 'MultiVerS reports experiments on the SciFact dataset from “Fact or Fiction”.', ['multivers-datasets']],
      ['preference', 'chat', 'Focus on datasets where answers must cite sentences from the paper, not just give a label.', [], true],
      ['open_question', 'summary', 'Does the human–model gap on QASPER come from finding evidence in long papers or from reasoning once it is found?', []],
    ],
    thread: [
      { role: 'user', text: 'Remember that I care about datasets where answers must cite sentences from the paper.' },
      { role: 'assistant', text: 'Got it. I added that as a preference for this topic.', added: 'Focus on datasets where answers must cite sentences from the paper, not just give a label.' },
      { role: 'user', text: 'Which papers in this topic ask for evidence sentences?' },
      { role: 'assistant', text: `Here is what the Wiki records:
- QASPER answers come with supporting evidence provided by a separate group of annotators.
- SciFact asks for the rationale sentences behind each SUPPORTS or REFUTES label.
- MultiVerS selects rationales from the full document context.` },
    ],
  },
  {
    topicId: 't-rag', minutesAgo: 60 * 26,
    headline: 'Research on retrieval-augmented generation for open-domain QA, built around RAG and Dense Passage Retrieval.',
    summary: [
      'The topic follows how a generator uses passages from an external index. RAG retrieves from a dense index of Wikipedia, and its retriever starts from the DPR question and passage encoders.',
      'Sessions so far compared retrieval strategies and chunk sizes; reranking for long PDFs is still being explored.',
    ],
    entries: [
      ['focus', 'summary', 'How does passage retrieval support generation in open-domain question answering?', []],
      ['paper', 'pdf', 'RAG: the external memory is a dense vector index of Wikipedia.', ['rag-index']],
      ['paper', 'paper', 'DPR: a dual encoder learns dense representations of questions and passages for retrieval.', ['dpr-encoders']],
      ['finding', 'note', 'RAG initializes its retriever with the pretrained DPR encoder.', ['rag-retriever']],
      ['open_question', 'qa', 'How much does chunk size change recall when retrieving from long PDFs?', []],
    ],
    thread: [],
  },
]

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
