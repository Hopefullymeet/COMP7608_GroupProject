import type { TaskInput } from '../api/contract'
import type { Budget } from '../api/services'
export function ScopeDetails({scope}:{scope:{input:TaskInput;budget?:Budget;source_versions?:string[]}}) {
  const {input,budget}=scope
  const versions=scope.source_versions??('sources' in input.input?input.input.sources.map(s=>s.source_version_id):'source_versions' in input.input?input.input.source_versions:[])
  const chosen='files' in input.input?input.input.files:'note_ids' in input.input?[...input.input.note_ids,...input.input.relation_ids]:[]
  return <div className="scope-detail">
    {versions.length>0&&<p>Source versions · {versions.join(', ')}</p>}{chosen.length>0&&<p>Selected material · {chosen.join(', ')}</p>}
    {'sentence_ids' in input.input&&<p>Manuscript {input.input.version_id} · {input.input.sentence_ids.length} selected sentences</p>}
    {'selection' in input.input&&input.input.selection&&<blockquote>{input.input.selection.quote}</blockquote>}
    {budget&&<small>Limits · {budget.calls} calls · {budget.tokens.toLocaleString()} tokens · {budget.minutes} min · USD {budget.cost}</small>}
  </div>
}
