import type { ScriptItem } from './runtime'
import type { MANUSCRIPTS } from './workspace'
import type { AgentStep, DraftSentence, Finding, StepKind, TaskEvent, WikiProposal } from './types'

// Scripted agent runs for the Citation check and Evidence wiki pages.

const at = (delay: number, event: TaskEvent): ScriptItem => ({ delay, event })

let stepSeq = 0
function step(runId: string, kind: StepKind, title: string, extra: Omit<AgentStep, 'id' | 'kind' | 'title'> = {}): TaskEvent {
  stepSeq += 1
  return { type: 'step', runId, step: { id: `${runId}-w${stepSeq}`, kind, title, ...extra } }
}

// ---------- Citation check ----------

const QASPER_CITE = 'dasigi2021'
const SCIFACT_CITE = 'wadden2020'
const PUBMED_CITE = 'jin2019'

const REWRITES: Record<string, NonNullable<Finding['rewrite']>> = {
  d3: { text: 'On full papers, models still trail humans by at least 27 F1 points on QASPER.', cites: [QASPER_CITE] },
  d4: { text: "PubMedQA asks models to answer yes/no/maybe questions from a paper's abstract, with its conclusion removed.", cites: [PUBMED_CITE] },
  r2: { text: 'RAG initializes its retriever with a pretrained bi-encoder from DPR.', cites: ['lewis2020'] },
}

const EVIDENCE_ANNOTATION = [
  { cite: QASPER_CITE, evidenceId: 'qasper-evidence', scope: 'QASPER answerers provide supporting evidence.' },
  { cite: SCIFACT_CITE, evidenceId: 'scifact-task', scope: 'SciFact provides rationales for support or refutation judgments.' },
]

function evaluateSentence(sentence: DraftSentence, original: DraftSentence | undefined): Finding {
  const sentenceId = sentence.id
  const cites = sentence.cites
  const finding = (claims: Finding['claims']): Finding => ({ sentenceId, claims })
  const rewrite = REWRITES[sentenceId]

  if (rewrite?.text === sentence.text && rewrite.cites.every((cite) => cites.includes(cite))) {
    const claim = sentenceId === 'r2'
      ? { cite: 'lewis2020', evidenceId: 'rag-retriever', note: 'The retriever section identifies the pretrained DPR bi-encoder.' }
      : sentenceId === 'd3'
      ? { cite: QASPER_CITE, evidenceId: 'qasper-gap', note: 'The abstract reports a gap of at least 27 F1 on full papers.' }
      : { cite: PUBMED_CITE, evidenceId: 'pubmed-context', note: 'The abstract defines the input as an abstract with its conclusion removed.' }
    return finding([{ text: sentence.text, status: 'supported', ...claim }])
  }
  if (original?.text !== sentence.text) {
    return finding([{ text: sentence.text, status: 'not-established', note: 'This wording has no matching evidence in the demo.' }])
  }
  if (sentenceId === 'd1') {
    const suggestions = EVIDENCE_ANNOTATION.filter(({ cite }) => !cites.includes(cite))
    const claims = EVIDENCE_ANNOTATION.map(({ cite, evidenceId, scope }): Finding['claims'][number] =>
      cites.includes(cite)
        ? { text: scope, status: 'supported', cite, evidenceId, note: 'Supported by the cited abstract.' }
        : { text: scope, cite, status: 'pending', note: 'This part of the sentence needs its own citation.' })
    return { ...finding(claims), suggestions }
  }

  const citedClaim = (text: string, cite: string, status: Finding['claims'][number]['status'], note: string, evidenceId?: string): Finding['claims'][number] =>
    cites.includes(cite) ? { text, cite, status, note, evidenceId }
      : { text, status: 'not-established', note: 'The draft lacks the citation needed for this claim.' }

  switch (sentenceId) {
    case 'r1': {
      const cite = 'karpukhin2020'
      const evidenceId = 'dpr-encoders'
      const scope = 'The DPR abstract describes learning question and passage embeddings with a dual encoder.'
      return cites.includes(cite)
        ? finding([citedClaim(sentence.text, cite, 'supported', scope, evidenceId)])
        : { ...finding([{ text: sentence.text, cite, status: 'pending', note: 'Add the DPR citation for this claim.' }]),
          suggestions: [{ cite, evidenceId, scope }] }
    }
    case 'r2':
      return {
        ...finding([citedClaim(sentence.text, 'lewis2020', 'conflict', 'The retriever is initialized with a pretrained DPR encoder.', 'rag-retriever')]),
        rewrite: cites.includes('lewis2020') ? rewrite : undefined,
      }
    case 'r3':
      return finding([citedClaim(sentence.text, 'lewis2020', 'supported', 'The abstract describes a dense vector index of Wikipedia.', 'rag-index')])
    case 'd2':
      return finding([
        citedClaim('Over 5,000 questions about NLP papers', QASPER_CITE, 'supported', '5,049 questions over 1,585 papers.', 'qasper-scale'),
        citedClaim('Answers have supporting evidence', QASPER_CITE, 'supported', 'Answerers also provide supporting evidence.', 'qasper-evidence'),
      ])
    case 'd3':
      return {
        ...finding([citedClaim(sentence.text, QASPER_CITE, 'conflict', 'The abstract reports a gap of at least 27 F1 on full papers.', 'qasper-gap')]),
        rewrite: cites.includes(QASPER_CITE) ? rewrite : undefined,
      }
    case 'd4':
      return {
        ...finding([citedClaim(sentence.text, PUBMED_CITE, 'conflict', 'The context is an abstract without its conclusion.', 'pubmed-context')]),
        rewrite: cites.includes(PUBMED_CITE) ? rewrite : undefined,
      }
    case 'd5':
      return {
        ...finding([{ text: sentence.text, status: 'not-established', note: 'The cited abstracts describe annotation practices. They do not establish a causal effect on accuracy.' }]),
        sources: EVIDENCE_ANNOTATION.filter(({ cite }) => cites.includes(cite)).map(({ cite, evidenceId, scope }) => ({
          cite, evidenceId, note: scope + ' The abstract does not test whether annotation improves accuracy.',
        })),
      }
    default:
      return finding([citedClaim(sentence.text, QASPER_CITE, 'blocked', 'The stored abstract does not report split sizes. Full text is needed.')])
  }
}

export function checkScript(runId: string, manuscript: typeof MANUSCRIPTS[number], version: number, sentences: DraftSentence[],
  checkSources: (finding: Finding) => Finding, sentenceNumber?: number): ScriptItem[] {
  const label = manuscript.name + ' · draft v' + version + (sentenceNumber === undefined ? '' : ' · sentence ' + sentenceNumber)
  const out: ScriptItem[] = [
    at(0, { type: 'run', run: { id: runId, task: 'Citation check', manuscriptId: manuscript.id, label, status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Split the current wording into checkable claims', { tokens: 820, ms: 1600 })),
  ]
  let incomplete = false
  sentences.forEach((sentence) => {
    const finding = evaluateSentence(sentence, manuscript.sentences.find((item) => item.id === sentence.id))
    const checked = checkSources(finding)
    const blocked = checked.claims.every((claim) => claim.status === 'blocked')
    if (checked.claims.some((claim) => claim.status === 'blocked' || claim.status === 'pending')) incomplete = true
    out.push(at(350, step(runId, blocked ? 'observe' : 'tool', blocked ? 'Record missing material' : 'Check cited passages for the current wording', {
      call: blocked ? undefined : 'read_passages(citations=' + JSON.stringify(sentence.cites) + ')', ms: 300,
    })))
    out.push(at(450, { type: 'finding', runId, finding }))
  })
  out.push(at(300, { type: 'done', runId, status: incomplete ? 'partial' : 'done',
    summary: incomplete ? 'Some claims need material or a citation choice.' : 'Findings delivered for draft v' + version + '.' }))
  return out
}

// ---------- Evidence wiki ----------

export function wikiScript(runId: string, proposal: WikiProposal): ScriptItem[] {
  const { noteIds, comparisonEvidenceIds } = proposal.inputs
  return [
    at(0, { type: 'run', run: { id: runId, task: 'Wiki draft', label: 'Draft a concept page', status: 'running', steps: [] } }),
    at(500, step(runId, 'plan', 'Group your material into one concept page', {
      detail: `Selected notes: ${noteIds.length}. Selected comparison passages: ${comparisonEvidenceIds.length}.`,
      tokens: 700, ms: 1500,
    })),
    at(300, step(runId, 'tool', 'Collect the selected passages', {
      call: `collect_evidence(ids=${JSON.stringify([...new Set([...noteIds, ...comparisonEvidenceIds])])})`, ms: 300, tokens: 900,
    })),
    at(500, step(runId, 'observe', `${proposal.page.statements.length} sourced statements prepared for review`)),
    at(300, step(runId, 'stop', 'Preview changes before writing to the Wiki', { tokens: 380, ms: 800 })),
    at(0, { type: 'wiki-proposal', runId, proposal }),
    at(0, { type: 'done', runId, status: 'done', summary: 'Proposal ready to review.' }),
  ]
}
