import type { DraftSentence, LibraryMeta, WikiPage } from './types'

// Sample data for the Library, Evidence wiki, Citation check and Models & services
// pages. File names, counts and dates are mock; quotes come from EVIDENCE.

export const LIBRARY_SEED = ['qasper', 'scifact', 's2orc']

export const LIBRARY_META: Record<string, LibraryMeta> = {
  qasper: {
    paperId: 'qasper', added: 'Nov 2', origin: 'Imported PDF', identity: 'arXiv:2105.03011 · matched by arXiv id',
    files: [
      { name: 'dasigi-2021-qasper.pdf', role: 'Published version', detail: 'NAACL 2021 · used for evidence in this workspace' },
      { name: 'arXiv:2105.03011', role: 'Preprint', detail: 'Linked as an earlier version, not stored as a file' },
    ],
    tags: ['dataset', 'full-text QA'], annotations: 3,
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

/** Sample-topic memberships (the demo topic's papers come from state). */
export const SAMPLE_MEMBERSHIP: Record<string, string[]> = {
  qasper: ['t-cite'],
  scifact: ['t-claims'],
}

/** An import that needs a decision: same title and authors, different file hash. */
export const DUPLICATE_REVIEW = {
  file: 'QASPER paper (1).pdf',
  paperId: 'qasper',
  reason: 'Same title, authors and year as QASPER, but a different file hash. A hash match would prove the same file, not the same paper, and a mismatch does not prove a different one.',
}

// ---------- Citation check ----------

export const CITE_KEYS: Record<string, string> = {
  dasigi2021: 'qasper',
  jin2019: 'pubmedqa',
  wadden2020: 'scifact',
}

export const DRAFT_NAME = 'related-work.md'

export const DRAFT: DraftSentence[] = [
  { id: 'd1', text: 'Several QA datasets now ask annotators to mark the evidence behind each answer.', cites: [] },
  { id: 'd2', text: 'QASPER contains over 5,000 questions about NLP papers, each answered with supporting evidence.', cites: ['dasigi2021'] },
  { id: 'd3', text: 'Current models already match human performance on QASPER.', cites: ['dasigi2021'] },
  { id: 'd4', text: 'PubMedQA asks models to reason over full biomedical papers.', cites: ['jin2019'] },
  { id: 'd5', text: 'Evidence annotation makes QA models more accurate.', cites: ['dasigi2021', 'wadden2020'] },
  { id: 'd6', text: "QASPER's test split is larger than its validation split.", cites: ['dasigi2021'] },
]

// ---------- Evidence wiki ----------

export const WIKI_SEED: WikiPage[] = [
  {
    id: 'w-qasper', title: 'QASPER', kind: 'Dataset',
    summary: 'Information-seeking questions over NLP papers, answered from the full text with supporting evidence.',
    statements: [
      { id: 'wq1', text: 'Questions were written by people who read only the title and abstract.', evidenceIds: ['qasper-written'], author: 'You' },
      { id: 'wq2', text: 'A separate group answered them and provided supporting evidence.', evidenceIds: ['qasper-evidence'], author: 'Saved answer' },
      { id: 'wq3', text: '5,049 questions over 1,585 NLP papers.', evidenceIds: ['qasper-scale'], author: 'You' },
    ],
    relations: [],
    disputes: [],
    revisions: [{ when: '2 hours ago', who: 'You', what: 'Created from 2 saved notes and 1 saved answer' }],
  },
]

// ---------- Models & services ----------

export const MODEL_OPTIONS = [
  { id: 'anthropic', name: 'Anthropic API', model: 'claude-sonnet-5-5', where: 'Remote', note: 'Receives your question and the passages selected for it.' },
  { id: 'compatible', name: 'OpenAI-compatible endpoint', model: 'Any chat model at a URL you set', where: 'Remote or self-hosted', note: 'Same material pack as above, sent to your endpoint.' },
  { id: 'local', name: 'Local model', model: 'Via Ollama on this computer', where: 'This device', note: 'Nothing leaves the device. Slower, and weaker on long papers.' },
]

export const SEARCH_SOURCES = [
  { id: 'openalex', name: 'OpenAlex', fields: ['Publication year', 'Venue (source)', 'Open access', 'Work type', 'Citation count'], note: 'Structured metadata; used for venue and year filters.' },
  { id: 's2', name: 'Semantic Scholar', fields: ['Year', 'Venue', 'Fields of study', 'Open-access PDF', 'Publication type'], note: 'Abstracts for screening candidates.' },
  { id: 'arxiv', name: 'arXiv', fields: ['Category', 'Submission date'], note: 'No venue filter. Venues come from the other sources.' },
]

export const PARSERS = [
  { name: 'GROBID', role: 'Sections, references and citation positions', where: 'Local service' },
  { name: 'Docling', role: 'Complex layouts, tables and OCR for scanned pages', where: 'Local, optional' },
  { name: 'PDF.js', role: 'Displays the original PDF for checking', where: 'Built in' },
]
