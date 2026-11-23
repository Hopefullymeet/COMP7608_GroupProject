import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'

const presets = [
  ['wiki', 'Wiki research', 'Search the selected papers and follow leads from reviewed Wiki entries.'],
  ['agent', 'Independent research', 'Let the agent search and read the selected papers without using the Wiki.'],
  ['fixed', 'Fixed retrieval', 'Write from a single set of retrieved passages without additional searches.'],
] as const

export function AgentPresets() {
  const { tr } = useLanguage()
  const current = useRead('preset.get', {})
  const { write, busy, report } = useWorkspace()
  return <section className="set-section">
    <div className="set-intro"><h2>{tr('Agent presets')}</h2><p>{tr('Choose how new multi-paper outlines gather evidence.')}</p></div>
    <div className="preset-options">{presets.map(([mode, title, description]) =>
      <button key={mode} className="preset-option" aria-pressed={current?.mode === mode}
        disabled={!current || busy} onClick={() => {
          if (current?.mode !== mode) void write('preset.save', { mode }).catch(report)
        }}>
        <strong>{tr(title)}</strong>{current?.mode === mode && <small>{tr('Default')}</small>}
        <span>{tr(description)}</span>
      </button>)}</div>
  </section>
}
