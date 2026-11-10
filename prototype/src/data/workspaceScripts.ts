import type { ScriptItem } from './runtime'
import type { AgentStep, Finding, StepKind, TaskEvent, WikiPage, WikiProposal } from './types'

// Scripted agent runs for the Citation check and Evidence wiki pages.

const at = (delay: number, event: TaskEvent): ScriptItem => ({ delay, event })

let stepSeq = 0
function step(runId: string, kind: StepKind, title: string, extra: Omit<AgentStep, 'id' | 'kind' | 'title'> = {}): TaskEvent {
  stepSeq += 1
  return { type: 'step', runId, step: { id: `${runId}-w${stepSeq}`, kind, title, ...extra } }
}

// ---------- Citation check ----------

const finding = (f: Finding): TaskEvent => ({ type: 'finding', finding: f })

const FINDINGS: Record<string, Finding> = {
  d1: {
    sentenceId: 'd1',
    claims: [{ text: 'QA datasets ask annotators to mark evidence for answers', status: 'pending', note: 'No citation in the draft. A source was found and is waiting for your choice.' }],
    suggestion: { evidenceIds: ['qasper-evidence', 'scifact-task'], cite: 'dasigi2021', scope: 'Read: QASPER and SciFact abstracts' },
  },
  d2: {
    sentenceId: 'd2',
    claims: [
      { text: 'over 5,000 questions about NLP papers', status: 'supported', evidenceId: 'qasper-scale', note: '5,049 questions over 1,585 papers.' },
      { text: 'answered with supporting evidence', status: 'supported', evidenceId: 'qasper-evidence', note: 'Answerers also provide supporting evidence.' },
    ],
  },
  d3: {
    sentenceId: 'd3',
    claims: [{ text: 'models match human performance on QASPER', status: 'conflict', evidenceId: 'qasper-gap', note: 'The cited paper reports the opposite: models trail humans by at least 27 F1 on full papers.' }],
    rewrite: { text: 'On full papers, models still trail humans by at least 27 F1 points on QASPER.', cites: ['dasigi2021'] },
  },
  d4: {
    sentenceId: 'd4',
    claims: [{ text: 'PubMedQA input is full biomedical papers', status: 'conflict', evidenceId: 'pubmed-context', note: 'The context is the abstract without its conclusion, not the full paper.' }],
    rewrite: { text: "PubMedQA asks models to answer yes/no/maybe questions from a paper's abstract, with its conclusion removed.", cites: ['jin2019'] },
  },
  d5: {
    sentenceId: 'd5',
    claims: [
      { text: 'both datasets annotate evidence', status: 'supported', evidenceId: 'qasper-evidence', note: 'QASPER answers carry evidence; SciFact labels carry rationales.' },
      { text: 'annotation makes models more accurate', status: 'not-established', note: 'Neither abstract reports this effect. Linking annotation to accuracy would be a new inference, so adding citations would not make it supported.' },
    ],
  },
  d6: {
    sentenceId: 'd6',
    claims: [{ text: 'test split larger than validation split', status: 'blocked', note: 'Split sizes are in the full text, which is not stored. Import the PDF to finish this check.' }],
  },
}

export function checkScript(runId: string, sentenceIds: string[]): ScriptItem[] {
  const out: ScriptItem[] = [
    at(0, { type: 'run', run: { id: runId, task: 'Citation check', label: 'related-work.md, draft v1', status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Split the draft into checkable claims', {
      detail: '6 sentences, 8 claims. Sentences that join two judgements are split so each part is checked on its own.', tokens: 820, ms: 1600,
    })),
    at(300, step(runId, 'tool', 'Match citation keys to library papers', { call: 'match_citations(keys=["dasigi2021", "jin2019", "wadden2020"])', ms: 200 })),
    at(500, step(runId, 'observe', 'All 3 keys resolve; 1 sentence has no citation', { tokens: 300, ms: 400 })),
  ]
  sentenceIds.forEach((id) => {
    const f = FINDINGS[id]
    if (!f) return
    out.push(at(350, step(runId, 'tool', `Read sources for sentence ${id.slice(1)}`, {
      call: `read_passages(sentence="${id}", sources=${f.suggestion ? '"topic papers"' : '"cited"'})`, ms: 300, tokens: 600,
    })))
    out.push(at(450, finding(f)))
  })
  out.push(
    at(400, step(runId, 'decide', 'Leave 1 claim blocked instead of guessing', {
      detail: 'Split sizes are only in the full text. Without it, that sentence stays incomplete.', tokens: 360, ms: 900,
    })),
    at(300, step(runId, 'stop', 'Deliver findings; wording changes wait for your decision', { tokens: 540, ms: 1200 })),
    at(300, { type: 'done', runId, status: 'partial', summary: '8 claims: 3 supported, 2 conflict, 1 not established, 1 blocked, 1 awaiting your choice.' }),
  )
  return out
}

/** After a rewrite or an added citation, only the changed sentence is checked again. */
export function recheckScript(runId: string, sentenceId: string, text: string, evidenceId: string): ScriptItem[] {
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Citation check', label: `Re-check sentence ${sentenceId.slice(1)}`, status: 'running', steps: [] } }),
    at(400, step(runId, 'tool', 'Read the cited passage again', { call: `read_passages(sentence="${sentenceId}")`, ms: 300, tokens: 500 })),
    at(500, finding({ sentenceId, claims: [{ text, status: 'supported', evidenceId, note: 'The new wording matches the source.' }] })),
    at(300, { type: 'done', runId, status: 'done', summary: 'New wording is supported.' }),
  ]
}

// ---------- Evidence wiki ----------

const DRAFT_PAGE: WikiPage = {
  id: 'w-grounded', title: 'Evidence-grounded QA datasets', kind: 'Concept',
  summary: 'Datasets where an answer must be traced to sentences in a research text, not only produced.',
  statements: [
    { id: 'wg1', text: 'QASPER answerers provide supporting evidence for their answers.', evidenceIds: ['qasper-evidence'], author: 'Agent draft' },
    { id: 'wg2', text: "In PubMedQA, the long answer is the abstract's own conclusion.", evidenceIds: ['pubmed-long'], author: 'Agent draft' },
    { id: 'wg3', text: 'SciFact makes evidence part of the label: each SUPPORTS or REFUTES decision comes with rationale sentences.', evidenceIds: ['scifact-task'], author: 'Agent draft' },
  ],
  relations: [
    { id: 'wr1', from: 'QASPER', type: 'contrasts with', to: 'PubMedQA', evidenceIds: ['qasper-gap', 'pubmed-context'], status: 'verified' },
    { id: 'wr2', from: 'SciFact', type: 'extends', to: 'Evidence-grounded QA datasets', evidenceIds: ['scifact-task'], status: 'unverified' },
  ],
  disputes: [{
    claim: 'Which dataset leaves the larger human–model gap?',
    sides: [
      { text: 'QASPER: models at least 27 F1 below humans', evidenceId: 'qasper-gap' },
      { text: 'PubMedQA: 68.1% model vs 78.0% human accuracy', evidenceId: 'pubmed-result' },
    ],
    question: 'Needs a shared metric and input length before the two gaps can be ranked.',
  }],
  revisions: [],
}

export function wikiScript(runId: string, inputs: string[]): ScriptItem[] {
  const proposal: WikiProposal = {
    page: { ...DRAFT_PAGE, revisions: [{ when: 'Just now', who: 'Agent draft', what: `Proposed from ${inputs.join(', ')}` }] },
    edits: [{ pageId: 'w-qasper', relations: [{ id: 'wr3', from: 'QASPER', type: 'not comparable with', to: 'PubMedQA', evidenceIds: ['qasper-gap', 'pubmed-result'], status: 'verified' }] }],
    inputs,
  }
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Wiki draft', label: 'Draft a concept page', status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Group your material into one concept page', {
      detail: `Inputs: ${inputs.join(', ')}. Every statement keeps a source; anything without one becomes an open question.`, tokens: 700, ms: 1500,
    })),
    at(300, step(runId, 'tool', 'Collect sourced sentences', { call: 'collect_evidence(scope="topic: Evidence in scientific QA")', ms: 300, tokens: 900 })),
    at(500, step(runId, 'observe', '3 statements with sources, 2 relations, 1 disagreement')),
    at(400, step(runId, 'decide', 'Keep the gap disagreement open', {
      detail: 'The two results use different metrics. The page records both sides instead of choosing one.', tokens: 420, ms: 900,
    })),
    at(300, { type: 'wiki-proposal', proposal }),
    at(200, step(runId, 'stop', 'Show the diff; nothing is saved until you accept', { tokens: 380, ms: 800 })),
    at(200, { type: 'done', runId, status: 'done', summary: '1 new page and 1 edit proposed.' }),
  ]
}
