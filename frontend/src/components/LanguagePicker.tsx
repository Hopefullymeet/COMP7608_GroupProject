import { useLanguage } from '../i18n'
import { Icon } from './Icon'

export function LanguagePicker() {
  const { preference, setLanguage, tr } = useLanguage()
  return (
    <label className="side-language">
      <Icon name="globe" size={15} />
      <select aria-label={tr('Language')} value={preference}
        onChange={(event) => setLanguage(event.currentTarget.value === 'system' ? 'system' : event.currentTarget.value === 'zh-CN' ? 'zh-CN' : 'en')}>
        <option value="system">{tr('Follow system')}</option>
        <option value="zh-CN" lang="zh-CN">简体中文</option>
        <option value="en" lang="en">English</option>
      </select>
    </label>
  )
}
