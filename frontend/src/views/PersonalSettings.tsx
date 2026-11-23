import { useState } from 'react'
import { useLanguage } from '../i18n'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { PersonalProfile } from '../api/services'
import { LanguagePicker } from '../components/LanguagePicker'
import { confirmAction } from '../components/confirmAction'

export function PersonalSettings() {
  const { tr } = useLanguage()
  const profile=useRead('profile.get',{})
  return <section className="set-section"><div className="set-intro"><h2>{tr('General')}</h2></div>
    <div className="set-body"><LanguagePicker/>{profile && <ProfileForm profile={profile}/>}</div>
  </section>
}

function ProfileForm({profile}:{profile:PersonalProfile}) {
  const {language,tr}=useLanguage()
  const t=(zh:string,en:string)=>language==='zh-CN'?zh:en
  const {write,busy}=useWorkspace()
  const [draft,setDraft]=useState<PersonalProfile>()
  const [error,setError]=useState('')
  const [saved,setSaved]=useState(false)
  const value=draft ?? profile
  function change(delta:Partial<PersonalProfile>) {setDraft({...value,...delta});setSaved(false);setError('')}
  async function save() {
    if (profile.memories.some(m=>!value.memories.includes(m)) &&
      !await confirmAction(t('保存后将替换或移除原有记忆，继续吗？','Replace or remove the edited memories?'),tr('Cancel'),tr('Save'))) return
    try {await write('profile.save',value);setDraft(undefined);setSaved(true)}
    catch {setError(t('保存失败。重新读取设置后再试。','Could not save. Reload settings and retry.'))}
  }
  return <div className="set-body">
    <label className="set-field">{t('我的身份','My profile')}<textarea className="text-field" maxLength={500} rows={2}
      value={value.identity} onChange={e=>change({identity:e.target.value})}
      placeholder={t('例如：我是研究图像拼接的硕士生','For example: I study image stitching')}/></label>
    <label><input type="checkbox" checked={value.enabled} onChange={e=>change({enabled:e.target.checked})}/> {t('在不同主题的对话中使用我的身份和记忆','Use my profile and memories across topics')}</label>
    <label className="set-field">{t('长期记忆','Long-term memories')}<textarea className="text-field" rows={4}
      value={value.memories.join('\n')} onChange={e=>change({memories:e.target.value.split('\n')})}/></label>
    <small>{t('每行一条。开启后，在论文问答中说“记住：……”也能保存。回答时会把相关偏好发送给所选模型。','One per line. When enabled, start a reading question with “Remember…” to save it. Preferences are sent to the selected model when answering.')}</small>
    <div><button className="primary" disabled={!draft || busy || value.memories.length>60 || value.memories.some(m=>m.length>400)} onClick={()=>void save()}>{tr('Save')}</button>
      {saved && <small role="status"> {tr('Saved')}</small>}{error && <p role="alert">{error} <button className="link-btn" onClick={()=>{setDraft(undefined);setError('')}}>{tr('Reload')}</button></p>}</div>
  </div>
}
