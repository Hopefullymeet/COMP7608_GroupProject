import test from 'node:test'
import assert from 'node:assert/strict'
import { workspace } from './client.mjs'

const question = 'What context does PubMedQA use?'
const history = w => w.call('session.get', { topic_id: w.topic_id, session_id: w.session_id })
async function locate(w, answer, paper) {
  const sentence = answer.sentences.find(s => s.assessment === 'supported')
  assert.ok(sentence?.anchor_ids.length, 'supported sentence requires a source')
  for (const anchor_id of sentence.anchor_ids) {
    const { anchor, source } = await w.call('evidence.locate', { topic_id: w.topic_id, message_id: answer.message_id, anchor_id })
    assert.equal(anchor.anchor_id, anchor_id)
    for (const item of [anchor, source]) {
      assert.equal(item.paper_id, paper.paper_id)
      assert.equal(item.source_version_id, paper.source_version_id)
    }
    const passage = source.passages.find(p => p.passage_id === anchor.location.passage_id)
    assert.ok(anchor.quote.trim() && passage?.text.includes(anchor.quote), 'quote must occur in the identified passage')
  }
}

test('DISC-01 discovery result, consent and search steps', async t => {
  const w = await workspace(t)
  assert.ok(w.search.confirmation.transfers.length)
  for (const transfer of w.search.confirmation.transfers) assert.ok(transfer.endpoint && transfer.purpose)
  const latest = await w.call('discovery.latest', { topic_id: w.topic_id })
  assert.equal(latest.search_id, w.search_id)
  const saved = await w.call('discovery.get', { topic_id: w.topic_id, search_id: latest.search_id })
  assert.ok(saved.candidates.some(c => c.doi === '10.18653/v1/D19-1259'))
  const { steps } = await w.call('discovery.steps', { task_id: w.search.task_id })
  assert.deepEqual(steps.map(s => s.action), ['search', 'search_again', 'search', 'stop'])
})

test('LIB-01 repeated Add keeps one association and one version', async t => {
  const w = await workspace(t)
  const paper = await w.add()
  assert.equal(paper.link_status, 'linked')
  const again = await w.add()
  assert.equal(again.link_status, 'already_linked')
  assert.equal(again.source_version_id, paper.source_version_id)
  const { items } = await w.call('library.list', { topic_id: w.topic_id })
  assert.deepEqual(items.map(p => p.paper_id), [paper.paper_id])
  assert.deepEqual(items[0].topic_ids, [w.topic_id])
  assert.deepEqual(items[0].source_versions.map(v => v.source_version_id), [paper.source_version_id])
  const saved = await w.call('discovery.get', { topic_id: w.topic_id, search_id: w.search_id })
  assert.equal(saved.candidates.find(c => c.candidate_id === w.candidate.candidate_id).decision, 'added')
})

test('ASK-01 fixture answer identifies abstract without conclusion and locates evidence', async t => {
  const w = await workspace(t), paper = await w.add()
  const { task_id } = await w.ask(paper, question)
  const { status, result } = await w.finish(task_id)
  assert.equal(status, 'completed')
  assert.deepEqual(result.read_sources, [{ source_version_id: paper.source_version_id, read_scope: 'abstract' }])
  assert.match(result.sentences.map(s => s.text).join(' '), /abstract without its conclusion|去掉结论的摘要/i)
  await locate(w, result, paper)
})

test('ASK-02 unsupported detail has no anchors', async t => {
  const w = await workspace(t)
  const { task_id } = await w.ask(await w.add(), 'What was the annotation budget?')
  const { status, result } = await w.finish(task_id)
  assert.equal(status, 'completed')
  assert.ok(result.sentences.length)
  for (const s of result.sentences) {
    assert.equal(s.assessment, 'evidence_not_established')
    assert.deepEqual(s.anchor_ids, [])
  }
})

for (const [expected, prompt] of [['partial', question], ['failed', 'What was the annotation budget?']]) {
  test('ASK-03 full text unavailable: ' + expected, async t => {
    const w = await workspace(t), paper = await w.add()
    const { task_id } = await w.ask(paper, prompt, 'full_text')
    const outcome = await w.finish(task_id)
    assert.equal(outcome.status, expected)
    assert.equal(outcome.issue.reason, 'FULL_TEXT_REQUIRED')
    const turns = (await history(w)).turns.filter(turn => turn.task_id === task_id)
    if (expected === 'partial') {
      assert.equal(turns.length, 1)
      assert.ok(turns[0].answer.sentences.some(s => s.assessment === 'supported'))
    } else {
      assert.deepEqual(outcome.issue.details.read_sources, [{ source_version_id: paper.source_version_id, read_scope: 'abstract' }])
      assert.equal(turns.length, 0)
    }
  })
}

test('LOC-01 historical source survives unlink from topic', async t => {
  const w = await workspace(t), paper = await w.add()
  const { task_id } = await w.ask(paper, question)
  await w.finish(task_id)
  const answer = async () => (await history(w)).turns.find(turn => turn.task_id === task_id).answer
  await locate(w, await answer(), paper)
  await w.write('library.organize', { paper_ids: [paper.paper_id], action: 'unlink', value: w.topic_id })
  assert.deepEqual((await w.call('library.list', { topic_id: w.topic_id })).items, [])
  await locate(w, await answer(), paper)
})

test('TASK-01 cancel after preview prevents late commit', async t => {
  const w = await workspace(t)
  const { task_id } = await w.ask(await w.add(), question)
  let cancellation
  const stop = await w.subscribe(task_id, 0, e => {
    if (e.type === 'answer.delta' && !cancellation) cancellation = w.write('task.cancel', { task_id })
  })
  t.after(stop)
  const outcome = await w.finish(task_id)
  assert.ok(cancellation, 'a preview must arrive before cancellation')
  assert.equal((await cancellation).status, 'cancelled')
  assert.equal(outcome.status, 'cancelled')
  assert.ok(!(await history(w)).turns.some(turn => turn.task_id === task_id))
})
