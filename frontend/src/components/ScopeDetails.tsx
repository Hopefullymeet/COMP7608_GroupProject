import { useLanguage } from '../i18n'
import type { TaskInput } from '../api/contract'
import type { Budget } from '../api/services'
export function ScopeDetails({
  scope,
}: {
  scope: { input: TaskInput; budget?: Budget; source_versions?: string[] }
}) {
  const { tr } = useLanguage()
  const { input, budget } = scope
  const limit = (value: number | null) => value?.toLocaleString() ?? tr('Unlimited')
  const versions =
    scope.source_versions ??
    ('sources' in input.input
      ? input.input.sources.map((s) => s.source_version_id)
      : 'source_versions' in input.input
        ? input.input.source_versions
        : [])
  const chosen =
    'files' in input.input
      ? input.input.files
      : 'note_ids' in input.input
        ? [...input.input.note_ids, ...input.input.relation_ids]
        : []
  return (
    <div className="scope-detail">
      {versions.length > 0 && <p>{tr('Source versions ·')}{' '}{versions.join(', ')}</p>}
      {chosen.length > 0 && <p>{tr('Selected material ·')}{' '}{chosen.join(', ')}</p>}
      {'sentence_ids' in input.input && (
        <p>
          {tr('Manuscript')}{' '}{input.input.version_id} · {input.input.sentence_ids.length}{' '}{tr('selected sentences')}
        </p>
      )}
      {'selection' in input.input && input.input.selection && (
        <blockquote>{input.input.selection.quote}</blockquote>
      )}
      {budget && (
        <small>
          {tr('Limits ·')}{' '}{limit(budget.calls)}{' '}{tr('calls ·')}{' '}{limit(budget.tokens)}{' '}{tr('tokens ·')}{' '}{limit(budget.minutes)}{' '}{tr('min · USD')}{' '}
          {limit(budget.cost)}
        </small>
      )}
    </div>
  )
}
