import { useRead } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import type { PdfObject } from '../api/reader'

export function FigurePreview({ topic, item, title, open }: {
  topic: string; item: PdfObject; title: string; open?: () => void
}) {
  const { tr } = useLanguage()
  const crop = useRead('visual.crop', { topic_id: topic, source_version_id: item.source_version_id, page: item.page, rect: item.rect })
  const label = [title, item.label, tr('PDF page {0}', item.page)].join(' · ')
  return <figure style={{ margin: '12px 0', maxWidth: 440 }}>
    {crop && <img alt={item.caption || label} src={'data:image/png;base64,' + crop.image}
      style={{ display: 'block', maxWidth: '100%', maxHeight: 230, objectFit: 'contain' }} />}
    <figcaption>{open ? <button className="link-btn" onClick={open}>{label}</button> : label}</figcaption>
  </figure>
}
