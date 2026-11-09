import type { ScriptItem } from './runtime'
import type { AgentStep, AnswerSegment, Candidate, SearchAngle, StepKind, TaskEvent } from './types'

// Scripted agent behaviour for the demo topic. Each script is what a live
// agent run would emit: plan, tool calls, observations, decisions, output.

const at = (delay: number, event: TaskEvent): ScriptItem => ({ delay, event })

let stepSeq = 0
function step(runId: string, kind: StepKind, title: string, extra: Omit<AgentStep, 'id' | 'kind' | 'title'> = {}): TaskEvent {
  stepSeq += 1
  return { type: 'step', runId, step: { id: `${runId}-s${stepSeq}`, kind, title, ...extra } }
}

const angle = (a: SearchAngle): TaskEvent => ({ type: 'angle', angle: a })
const candidate = (c: Candidate): TaskEvent => ({ type: 'candidate', candidate: c })

function stream(messageId: string, segments: AnswerSegment[]): ScriptItem[] {
  const out: ScriptItem[] = []
  segments.forEach((seg, index) => {
    const words = seg.text.match(/\S+\s*/g) ?? []
    for (let i = 0; i < words.length; i += 3) {
      out.push(at(55, { type: 'text', messageId, index, chunk: words.slice(i, i + 3).join(''), evidenceId: seg.evidenceId, tone: seg.tone }))
    }
  })
  return out
}

export const ANGLES = {
  fulltext: { id: 'a-fulltext', label: 'QA over full papers', query: 'question answering dataset full text scientific papers' },
  evidence: { id: 'a-evidence', label: 'Answers with annotated evidence', query: 'dataset answers annotated supporting evidence' },
  claims: { id: 'a-claims', label: 'Scientific claim verification', query: 'scientific claim verification dataset' },
}

export function discoveryScript(runId: string, question: string): ScriptItem[] {
  const { fulltext, evidence, claims } = ANGLES
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Discovery', label: question, status: 'running', steps: [] } }),
    at(600, step(runId, 'plan', 'Split the question into three search angles', {
      detail: 'The question mixes three needs: QA over whole papers, answers that carry evidence, and nearby scientific tasks to compare against. Each angle gets its own query so a missing one stays visible.',
      tokens: 640, ms: 1800,
    })),
    at(250, angle({ ...fulltext, status: 'queued', found: 0 })),
    at(120, angle({ ...evidence, status: 'queued', found: 0 })),
    at(120, angle({ ...claims, status: 'queued', found: 0 })),
    at(500, angle({ ...fulltext, status: 'searching', found: 0 })),
    at(200, step(runId, 'tool', 'Search OpenAlex: QA over full papers', {
      call: `search.openalex(query="${fulltext.query}", from_year=2018)`, ms: 900,
    })),
    at(1000, step(runId, 'observe', '41 results, 3 kept after de-duplication and screening', {
      detail: 'Kept items whose abstract describes QA over research papers. Dropped surveys and duplicate preprints matched by arXiv id.',
      tokens: 2100, ms: 2400,
    })),
    at(300, candidate({ id: 'c-qasper', paperId: 'qasper', angleId: fulltext.id, round: 1, decision: 'added', readLevel: 'Abstract read', source: 'OpenAlex',
      reason: 'Questions are written from title and abstract only, so answers must come from the full text.',
      note: 'Already in this topic (your imported PDF)' })),
    at(350, candidate({ id: 'c-s2orc', paperId: 's2orc', angleId: fulltext.id, round: 1, decision: 'pending', readLevel: 'Metadata only', source: 'OpenAlex',
      reason: 'A corpus of full-text papers, not a QA dataset. Useful only as raw material for building one.' })),
    at(350, candidate({ id: 'c-eli5', paperId: 'eli5', angleId: fulltext.id, round: 1, decision: 'pending', readLevel: 'Metadata only', source: 'OpenAlex',
      reason: 'Long-form answers, but the questions are general and not tied to papers.' })),
    at(300, angle({ ...fulltext, status: 'covered', found: 3 })),
    at(400, angle({ ...evidence, status: 'searching', found: 0 })),
    at(200, step(runId, 'tool', 'Search Semantic Scholar: answers with evidence', {
      call: `search.semantic_scholar(query="${evidence.query}", fields=[title, abstract, venue, year])`, ms: 1100,
    })),
    at(1000, step(runId, 'observe', '27 results, 2 kept', {
      detail: 'One biomedical set where the long answer is the abstract\'s own conclusion; one open-domain benchmark that came up through keyword overlap.',
      tokens: 1700, ms: 2100,
    })),
    at(300, candidate({ id: 'c-pubmedqa', paperId: 'pubmedqa', angleId: evidence.id, round: 1, decision: 'pending', readLevel: 'Abstract read', source: 'Semantic Scholar',
      reason: 'Research questions over biomedical abstracts; each answer has a long-form justification.' })),
    at(350, candidate({ id: 'c-nq', paperId: 'nq', angleId: evidence.id, round: 1, decision: 'pending', readLevel: 'Metadata only', source: 'Semantic Scholar',
      reason: 'Answers are marked in a source page, but the pages are Wikipedia, not research papers.' })),
    at(300, angle({ ...evidence, status: 'covered', found: 2 })),
    at(400, angle({ ...claims, status: 'searching', found: 0 })),
    at(200, step(runId, 'tool', 'Search OpenAlex: scientific claim verification', {
      call: `search.openalex(query="${claims.query}")`, ms: 800,
    })),
    at(900, step(runId, 'observe', 'Results overlap with the evidence angle; nothing new passes screening', { tokens: 1200, ms: 1600 })),
    at(250, angle({ ...claims, status: 'gap', found: 0 })),
    at(500, step(runId, 'decide', 'Stop here and report the gap', {
      detail: 'This round has a budget of 3 searches. Widening the claim angle to general fact-checking would mostly bring in news and Wikipedia sets, which the question does not ask for.',
      tokens: 480, ms: 1200,
    })),
    at(400, { type: 'done', runId, status: 'partial', summary: '5 candidates across 2 of 3 angles. Claim verification has no candidate yet.',
      coverage: { covered: [fulltext.label, evidence.label], gaps: [`${claims.label}: no candidate passed screening`] } }),
  ]
}

export function refineScript(runId: string, feedback: string[]): ScriptItem[] {
  const { fulltext, evidence, claims } = ANGLES
  const named = feedback.length ? feedback.join(' and ') : 'some candidates'
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Discovery', label: 'Refine with your feedback', status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Use your feedback to adjust the search', {
      detail: `You marked ${named} as not a fit. I'll keep to datasets built on scientific text and retry the claim-verification angle with different wording. Papers you already added stay in the topic.`,
      tokens: 520, ms: 1400,
    })),
    at(400, angle({ ...claims, status: 'searching', found: 0 })),
    at(200, step(runId, 'tool', 'Search Semantic Scholar: verify claims with rationales', {
      call: 'search.semantic_scholar(query="verify scientific claims rationales abstracts", exclude=[open_domain])', ms: 1000,
    })),
    at(1000, step(runId, 'observe', '19 results, 1 new candidate', {
      detail: 'Claims are checked against research abstracts, and each label comes with rationale sentences.', tokens: 1400, ms: 1900,
    })),
    at(300, candidate({ id: 'c-scifact', paperId: 'scifact', angleId: claims.id, round: 2, decision: 'pending', readLevel: 'Abstract read', source: 'Semantic Scholar',
      reason: 'Evidence is part of the label: each SUPPORTS/REFUTES decision cites rationale sentences.' })),
    at(300, angle({ ...claims, status: 'covered', found: 1 })),
    at(500, step(runId, 'decide', 'Coverage is enough for this round', {
      detail: 'Every angle now has at least one candidate. Cross-document QA (one question over many papers) is outside this question and was not searched.',
      tokens: 380, ms: 900,
    })),
    at(400, { type: 'done', runId, status: 'done', summary: '1 new candidate. All three angles now have a match.',
      coverage: { covered: [fulltext.label, evidence.label, claims.label], gaps: ['Not searched: cross-document QA over many papers'] } }),
  ]
}

export interface ScriptedQuestion {
  id: string
  text: string
  requires?: string
}

export const SEED_QUESTION: ScriptedQuestion = {
  id: 'q-evidence', text: 'Why do QASPER answers need supporting evidence?',
}

export const QUESTIONS: ScriptedQuestion[] = [
  { id: 'q-dataset', text: 'How large is QASPER, and where do its questions come from?' },
  { id: 'q-gap', text: "Can I compare QASPER's human gap with PubMedQA's?", requires: 'pubmedqa' },
]

export function questionScript(questionId: string, question: string, runId: string, messageId: string, sessionId: string): ScriptItem[] {
  const head: ScriptItem[] = [
    at(0, { type: 'run', run: { id: runId, task: 'Question', label: question, status: 'running', steps: [] } }),
    at(0, { type: 'message', message: { id: messageId, sessionId, role: 'agent', segments: [], runId, done: false } }),
  ]

  if (questionId === 'q-dataset') {
    return [
      ...head,
      at(500, step(runId, 'plan', 'Check dataset size and question collection', {
        detail: 'Look for counts and who wrote the questions in the stored abstract.', tokens: 320, ms: 800,
      })),
      at(300, step(runId, 'tool', 'Retrieve dataset description', {
        call: 'retrieve_passages(paper="QASPER", query="dataset size and question authors", k=2)', ms: 300,
      })),
      at(500, step(runId, 'observe', 'Found dataset counts and question-writing protocol in the abstract', { tokens: 520, ms: 400 })),
      at(300, step(runId, 'stop', 'The abstract supports both parts of the answer', { tokens: 430, ms: 900 })),
      ...stream(messageId, [
        { text: 'QASPER contains 5,049 questions over 1,585 NLP research papers', evidenceId: 'qasper-scale' },
        { text: '. ' },
        { text: 'NLP practitioners wrote the questions after reading only each paper’s title and abstract, seeking information in the full text', evidenceId: 'qasper-written' },
        { text: '. This makes the questions reflect what a reader wants to learn before reading the entire paper. ' },
        { text: 'These details come from the abstract. Train/dev/test counts are not available in the stored text.', tone: 'scope' },
      ]),
      at(200, { type: 'done', runId, messageId, status: 'done', summary: 'Dataset size and question origins checked against the abstract.' }),
    ]
  }

  if (questionId === 'q-evidence') {
    return [
      ...head,
      at(500, step(runId, 'plan', 'Look for how the dataset was built', {
        detail: 'This asks about QASPER\'s design, so the dataset description should answer it before any experiment.', tokens: 410, ms: 1100,
      })),
      at(300, step(runId, 'tool', 'Retrieve passages from QASPER', { call: 'retrieve_passages(paper="QASPER", query="how questions and answers were collected", k=4)', ms: 300 })),
      at(700, step(runId, 'observe', '4 passages, all in the Abstract (PDF p. 1)', { tokens: 900, ms: 600 })),
      at(400, step(runId, 'decide', 'The performance part needs the Experiments section', {
        detail: 'The abstract answers the design question. How much models gain from evidence would need the experiments.', tokens: 300, ms: 700,
      })),
      at(300, step(runId, 'tool', 'Read the Experiments section', { call: 'read_section(paper="QASPER", section="Experiments")', ms: 200 })),
      at(500, step(runId, 'observe', 'Not available: only the abstract is stored for this paper')),
      at(300, step(runId, 'stop', 'Answer from the abstract and say what was not read', { tokens: 620, ms: 1500 })),
      ...stream(messageId, [
        { text: 'Because the people asking and the people answering see different things. ' },
        { text: 'Each question was written by someone who read only the title and abstract, so the answer usually sits in the full text', evidenceId: 'qasper-written' },
        { text: '. A separate group then answered the questions and was asked to provide supporting evidence to answers', evidenceId: 'qasper-evidence' },
        { text: ', so each answer records where in the paper it comes from. ' },
        { text: 'This matters because strong QA models still trail humans by at least 27 F1 points on whole papers', evidenceId: 'qasper-gap' },
        { text: '. ' },
        { text: 'I read only the abstract. How evidence selection is scored is in the Experiments section, which is not stored for this paper.', tone: 'scope' },
      ]),
      at(200, { type: 'done', runId, messageId, status: 'done', summary: 'Answered from the abstract. Experiment details were not read.' }),
    ]
  }

  if (questionId === 'q-gap') {
    return [
      ...head,
      at(500, step(runId, 'plan', 'Check that both numbers measure the same thing', { tokens: 380, ms: 900 })),
      at(300, step(runId, 'tool', 'Retrieve passages from PubMedQA', { call: 'retrieve_passages(paper="PubMedQA", query="human performance accuracy", k=3)', ms: 300 })),
      at(700, step(runId, 'observe', 'Found the result sentence in the PubMedQA abstract', { tokens: 700, ms: 500 })),
      at(400, step(runId, 'decide', 'The metrics differ: F1 vs accuracy', {
        detail: 'QASPER reports an F1 gap on full papers. PubMedQA reports accuracy on a yes/no/maybe label over an abstract. Putting both on one scale would need a new experiment.',
        tokens: 520, ms: 1000,
      })),
      at(300, step(runId, 'stop', 'Answer and point to the comparison table', { tokens: 540, ms: 1300 })),
      ...stream(messageId, [
        { text: 'Not directly. ' },
        { text: 'QASPER reports models underperforming humans by at least 27 F1 points on entire papers', evidenceId: 'qasper-gap' },
        { text: ', while the best PubMedQA model achieves 68.1% accuracy against 78.0% for a single human', evidenceId: 'pubmed-result' },
        { text: '. One is token-overlap F1 on free-form answers, the other is accuracy on a three-way label, and the inputs differ in length. ' },
        { text: 'The Compare tab lays these conditions side by side.', tone: 'scope' },
      ]),
      at(200, { type: 'done', runId, messageId, status: 'done', summary: 'Not comparable as stated: different metric and input.' }),
    ]
  }

  return [
    ...head,
    at(500, step(runId, 'stop', 'No scripted path for this question', {
      detail: 'This prototype replays scripted runs only. A live agent would plan, retrieve passages and answer here.',
    })),
    ...stream(messageId, [{ text: 'This prototype only scripts the suggested questions. With a live agent, this question would be planned, checked against the topic papers, and answered with sources.', tone: 'scope' }]),
    at(200, { type: 'done', runId, messageId, status: 'partial', summary: 'Not scripted in the prototype.' }),
  ]
}

export function compareScript(runId: string): ScriptItem[] {
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Comparison', label: 'QASPER vs PubMedQA', status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Pick dimensions for a dataset comparison', {
      detail: 'Task, input, scale, evidence, headline result and data split. A result only counts as comparable if metric and input match.', tokens: 560, ms: 1300,
    })),
    at(300, step(runId, 'tool', 'Read both abstracts', { call: 'read_section(paper=["QASPER", "PubMedQA"], section="Abstract")', ms: 400 })),
    at(700, step(runId, 'observe', '5 of 6 dimensions have a source sentence', { tokens: 1800, ms: 1200 })),
    at(300, { type: 'row', row: { id: 'r-task', dimension: 'Task', comparable: true, cells: [
      { status: 'sourced', value: 'Information-seeking questions whose answers are in the full text of NLP papers', evidenceId: 'qasper-written' },
      { status: 'sourced', value: 'Answer research questions with yes / no / maybe', evidenceId: 'pubmed-task' },
    ] } }),
    at(350, { type: 'row', row: { id: 'r-input', dimension: 'Input to the model', comparable: true, cells: [
      { status: 'sourced', value: 'The entire paper', evidenceId: 'qasper-gap' },
      { status: 'sourced', value: 'The abstract without its conclusion', evidenceId: 'pubmed-context' },
    ] } }),
    at(350, { type: 'row', row: { id: 'r-scale', dimension: 'Scale', comparable: true, cells: [
      { status: 'sourced', value: '5,049 questions over 1,585 papers', evidenceId: 'qasper-scale' },
      { status: 'sourced', value: '1k expert-annotated, 61.2k unlabeled, 211.3k generated', evidenceId: 'pubmed-scale' },
    ] } }),
    at(350, { type: 'row', row: { id: 'r-evidence', dimension: 'Evidence for answers', comparable: true, cells: [
      { status: 'sourced', value: 'Annotators provide supporting evidence for each answer', evidenceId: 'qasper-evidence' },
      { status: 'sourced', value: "The long answer is the abstract's own conclusion", evidenceId: 'pubmed-long' },
    ] } }),
    at(500, step(runId, 'decide', 'Headline results are not comparable', {
      detail: 'F1 on free-form answers vs accuracy on a 3-way label, and full paper vs abstract input. Ranking the two gaps would need a new experiment.', tokens: 640, ms: 1400,
    })),
    at(300, { type: 'row', row: { id: 'r-result', dimension: 'Headline result', comparable: false,
      note: 'Different metric (F1 vs accuracy) and input length. The gaps cannot be ranked against each other.', cells: [
      { status: 'sourced', value: 'Models trail humans by at least 27 F1', evidenceId: 'qasper-gap' },
      { status: 'sourced', value: '68.1% model vs 78.0% human accuracy', evidenceId: 'pubmed-result' },
    ] } }),
    at(400, step(runId, 'tool', 'Look for split sizes', { call: 'read_section(paper=["QASPER", "PubMedQA"], section="Dataset statistics")', ms: 200 })),
    at(500, step(runId, 'observe', 'Not available: only abstracts are stored in this library')),
    at(300, { type: 'row', row: { id: 'r-split', dimension: 'Train / dev / test split', comparable: true, cells: [
      { status: 'missing', value: 'Not read. Split sizes are in the full text.' },
      { status: 'missing', value: 'Not read. Split sizes are in the full text.' },
    ] } }),
    at(400, step(runId, 'stop', 'Deliver the table with one row not comparable and one row missing material', { tokens: 700, ms: 1600 })),
    at(300, { type: 'done', runId, status: 'partial', summary: '4 rows sourced, 1 not comparable, 1 missing material.',
      verdict: 'Both datasets ground QA in research text, but they differ in input, answer form and metric. Their human–model gaps cannot be ranked against each other.' }),
  ]
}
