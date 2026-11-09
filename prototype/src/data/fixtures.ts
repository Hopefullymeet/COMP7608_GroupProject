import type { EvidenceAnchor, Paper, Passage, Session, Topic } from './types'

// Abstract sentences are transcribed from the published abstracts. Metadata-only
// papers carry no text. Everything else (counts, timings, tokens) is mock data.

const abstract = (paperId: string, texts: string[]): Passage[] =>
  texts.map((text, i) => ({ id: `${paperId}-p${i + 1}`, section: 'Abstract', page: 1, text }))

export const PAPERS: Record<string, Paper> = {
  qasper: {
    id: 'qasper',
    short: 'QASPER',
    title: 'A Dataset of Information-Seeking Questions and Answers Anchored in Research Papers',
    authors: ['Pradeep Dasigi', 'Kyle Lo', 'Iz Beltagy', 'Arman Cohan', 'Noah A. Smith', 'Matt Gardner'],
    venue: 'NAACL',
    year: 2021,
    venueSource: 'Imported PDF + OpenAlex',
    externalId: 'arXiv:2105.03011',
    stored: 'abstract',
    passages: abstract('qasper', [
      'Readers of academic research papers often read with the goal of answering specific questions.',
      'Question Answering systems that can answer those questions can make consumption of the content much more efficient.',
      'However, building such tools requires data that reflect the difficulty of the task arising from complex reasoning about claims made in multiple parts of a paper.',
      'In contrast, existing information-seeking question answering datasets usually contain questions about generic factoid-type information.',
      'We therefore present QASPER, a dataset of 5,049 questions over 1,585 Natural Language Processing papers.',
      'Each question is written by an NLP practitioner who read only the title and abstract of the corresponding paper, and the question seeks information present in the full text.',
      'The questions are then answered by a separate set of NLP practitioners who also provide supporting evidence to answers.',
      'We find that existing models that do well on other QA tasks do not perform well on answering these questions, underperforming humans by at least 27 F1 points when answering them from entire papers, motivating further research in document-grounded, information-seeking QA, which our dataset is designed to facilitate.',
    ]),
  },
  pubmedqa: {
    id: 'pubmedqa',
    short: 'PubMedQA',
    title: 'PubMedQA: A Dataset for Biomedical Research Question Answering',
    authors: ['Qiao Jin', 'Bhuwan Dhingra', 'Zhengping Liu', 'William W. Cohen', 'Xinghua Lu'],
    venue: 'EMNLP',
    year: 2019,
    venueSource: 'Semantic Scholar',
    externalId: 'arXiv:1909.06146',
    stored: 'abstract',
    passages: abstract('pubmedqa', [
      'We introduce PubMedQA, a novel biomedical question answering (QA) dataset collected from PubMed abstracts.',
      'The task of PubMedQA is to answer research questions with yes/no/maybe (e.g.: Do preoperative statins reduce atrial fibrillation after coronary artery bypass grafting?) using the corresponding abstracts.',
      'PubMedQA has 1k expert-annotated, 61.2k unlabeled and 211.3k artificially generated QA instances.',
      'Each PubMedQA instance is composed of (1) a question which is either an existing research article title or derived from one, (2) a context which is the corresponding abstract without its conclusion, (3) a long answer, which is the conclusion of the abstract and, presumably, answers the research question, and (4) a yes/no/maybe answer which summarizes the conclusion.',
      'PubMedQA is the first QA dataset where reasoning over biomedical research texts, especially their quantitative contents, is required to answer the questions.',
      'Our best performing model, multi-phase fine-tuning of BioBERT with long answer bag-of-word statistics as additional supervision, achieves 68.1% accuracy, compared to single human performance of 78.0% accuracy and majority-baseline of 55.2% accuracy, leaving much room for improvement.',
    ]),
  },
  scifact: {
    id: 'scifact',
    short: 'SciFact',
    title: 'Fact or Fiction: Verifying Scientific Claims',
    authors: ['David Wadden', 'Shanchuan Lin', 'Kyle Lo', 'Lucy Lu Wang', 'Madeleine van Zuylen', 'Arman Cohan', 'Hannaneh Hajishirzi'],
    venue: 'EMNLP',
    year: 2020,
    venueSource: 'Semantic Scholar',
    externalId: 'arXiv:2004.14974',
    stored: 'abstract',
    passages: abstract('scifact', [
      'We introduce scientific claim verification, a new task to select abstracts from the research literature containing evidence that SUPPORTS or REFUTES a given scientific claim, and to identify rationales justifying each decision.',
      'To study this task, we construct SciFact, a dataset of 1.4K expert-written scientific claims paired with evidence-containing abstracts annotated with labels and rationales.',
      'We develop baseline models for SciFact, and demonstrate that simple domain adaptation techniques substantially improve performance compared to models trained on Wikipedia or political news.',
    ]),
  },
  s2orc: {
    id: 's2orc',
    short: 'S2ORC',
    title: 'S2ORC: The Semantic Scholar Open Research Corpus',
    authors: ['Kyle Lo', 'Lucy Lu Wang', 'Mark Neumann', 'Rodney Kinney', 'Daniel Weld'],
    venue: 'ACL',
    year: 2020,
    venueSource: 'OpenAlex',
    stored: 'metadata',
    passages: [],
  },
  eli5: {
    id: 'eli5',
    short: 'ELI5',
    title: 'ELI5: Long Form Question Answering',
    authors: ['Angela Fan', 'Yacine Jernite', 'Ethan Perez', 'David Grangier', 'Jason Weston', 'Michael Auli'],
    venue: 'ACL',
    year: 2019,
    venueSource: 'OpenAlex',
    stored: 'metadata',
    passages: [],
  },
  nq: {
    id: 'nq',
    short: 'Natural Questions',
    title: 'Natural Questions: A Benchmark for Question Answering Research',
    authors: ['Tom Kwiatkowski', 'Jennimaria Palomaki', 'Olivia Redfield', 'Michael Collins', 'et al.'],
    venue: 'TACL',
    year: 2019,
    venueSource: 'Semantic Scholar',
    stored: 'metadata',
    passages: [],
  },
}

const ABSTRACT_ONLY = 'Abstract only. The full text is not parsed in this library.'

export const EVIDENCE: Record<string, EvidenceAnchor> = {
  'qasper-scale': { id: 'qasper-scale', paperId: 'qasper', passageId: 'qasper-p5', quote: '5,049 questions over 1,585 Natural Language Processing papers', scope: ABSTRACT_ONLY },
  'qasper-written': { id: 'qasper-written', paperId: 'qasper', passageId: 'qasper-p6', quote: 'read only the title and abstract of the corresponding paper, and the question seeks information present in the full text', scope: ABSTRACT_ONLY },
  'qasper-evidence': { id: 'qasper-evidence', paperId: 'qasper', passageId: 'qasper-p7', quote: 'provide supporting evidence to answers', scope: ABSTRACT_ONLY },
  'qasper-gap': { id: 'qasper-gap', paperId: 'qasper', passageId: 'qasper-p8', quote: 'underperforming humans by at least 27 F1 points when answering them from entire papers', scope: ABSTRACT_ONLY },
  'pubmed-task': { id: 'pubmed-task', paperId: 'pubmedqa', passageId: 'pubmedqa-p2', quote: 'answer research questions with yes/no/maybe', scope: ABSTRACT_ONLY },
  'pubmed-scale': { id: 'pubmed-scale', paperId: 'pubmedqa', passageId: 'pubmedqa-p3', quote: '1k expert-annotated, 61.2k unlabeled and 211.3k artificially generated QA instances', scope: ABSTRACT_ONLY },
  'pubmed-context': { id: 'pubmed-context', paperId: 'pubmedqa', passageId: 'pubmedqa-p4', quote: 'a context which is the corresponding abstract without its conclusion', scope: ABSTRACT_ONLY },
  'pubmed-long': { id: 'pubmed-long', paperId: 'pubmedqa', passageId: 'pubmedqa-p4', quote: 'a long answer, which is the conclusion of the abstract', scope: ABSTRACT_ONLY },
  'pubmed-result': { id: 'pubmed-result', paperId: 'pubmedqa', passageId: 'pubmedqa-p6', quote: 'achieves 68.1% accuracy, compared to single human performance of 78.0% accuracy', scope: ABSTRACT_ONLY },
  'scifact-task': { id: 'scifact-task', paperId: 'scifact', passageId: 'scifact-p1', quote: 'SUPPORTS or REFUTES a given scientific claim, and to identify rationales justifying each decision', scope: ABSTRACT_ONLY },
}

export const DEMO_TOPIC = 't-evidence'

// Only DEMO_TOPIC is scripted; the rest are sample rows that show how lists behave.
export const TOPICS: Topic[] = [
  { id: DEMO_TOPIC, title: 'Evidence in scientific QA', goal: 'Which datasets test QA over research papers, and how do they handle evidence?', paperCount: 1, updated: '2 hours ago', scripted: true },
  { id: 't-rag', title: 'Retrieval-augmented generation', goal: 'Compare retrieval strategies for long documents.', paperCount: 5, updated: 'Yesterday', scripted: false },
  { id: 't-agents', title: 'Multi-agent collaboration', goal: 'How do agent teams split research tasks?', paperCount: 2, updated: 'Nov 5', scripted: false },
  { id: 't-long', title: 'Long-context evaluation', goal: 'What do long-context benchmarks actually measure?', paperCount: 4, updated: 'Oct 30', scripted: false },
  { id: 't-cite', title: 'Citation recommendation', goal: 'How are citation suggestions checked against a draft?', paperCount: 3, updated: 'Oct 28', scripted: false },
  { id: 't-claims', title: 'Scientific claim verification', goal: 'How are claims labelled against research abstracts?', paperCount: 2, updated: 'Oct 21', scripted: false },
  { id: 't-tables', title: 'Table and figure QA', goal: 'Which QA datasets need tables or figures to answer?', paperCount: 3, updated: 'Oct 14', scripted: false },
]

export const SEED_SESSION = 's-evidence'

export const SESSIONS: Session[] = [
  { id: SEED_SESSION, topicId: DEMO_TOPIC, title: 'Why QASPER answers need evidence', updated: '2 hours ago', order: 100 },
  { id: 's-rag-1', topicId: 't-rag', title: 'Comparing two retrieval strategies', updated: 'Yesterday', order: 90 },
  { id: 's-agents-1', topicId: 't-agents', title: 'How agent teams split a search', updated: 'Nov 5', order: 80 },
  { id: 's-rag-2', topicId: 't-rag', title: 'Chunk size vs recall', updated: 'Nov 4', order: 75 },
  { id: 's-agents-2', topicId: 't-agents', title: 'Planner and executor roles', updated: 'Nov 2', order: 70 },
  { id: 's-rag-3', topicId: 't-rag', title: 'Reranking for long PDFs', updated: 'Nov 1', order: 65 },
  { id: 's-long-1', topicId: 't-long', title: 'Needle tests and their limits', updated: 'Oct 30', order: 60 },
  { id: 's-rag-4', topicId: 't-rag', title: 'Hybrid search baselines', updated: 'Oct 29', order: 58 },
  { id: 's-cite-1', topicId: 't-cite', title: 'When a citation only half-supports a claim', updated: 'Oct 28', order: 55 },
  { id: 's-rag-5', topicId: 't-rag', title: 'Query rewriting notes', updated: 'Oct 25', order: 52 },
  { id: 's-claims-1', topicId: 't-claims', title: 'Rationale sentences in SciFact', updated: 'Oct 21', order: 50 },
  { id: 's-tables-1', topicId: 't-tables', title: 'Questions that need a table', updated: 'Oct 14', order: 40 },
]

export const DEFAULT_QUESTION = 'Which datasets test question answering over research papers, and do they require evidence for answers?'
