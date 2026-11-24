import { Dialog } from '../components/PageHead'
import { type Shortcut, applyPreferencesFile, options, setPreference, usePreferences } from '../data/preferences'
import { version } from '../../src-tauri/tauri.conf.json'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { PersonalProfile } from '../api/services'
import { LanguagePicker } from '../components/LanguagePicker'
import { confirmAction } from '../components/confirmAction'

export function PersonalSettings() {
  const { tr } = useLanguage()
  const prefs = usePreferences()
  const profile = useRead('profile.get', {})
  const { write, busy, report } = useWorkspace()
  const [config,setConfig] = useState<string>()
  const [configError,setConfigError] = useState('')
  const [recording,setRecording] = useState<Shortcut>()
  const [shortcutError,setShortcutError] = useState(false)
  const permission = useRef<HTMLSelectElement>(null)
  const focused = useRef(false)
  useEffect(()=>{
    if (profile && !busy && !focused.current && permission.current?.closest('.wiki-permission-target')) {
      focused.current = true
      permission.current.scrollIntoView({block:'center'})
      permission.current.focus()
    }
  },[profile,busy])
  const labels = {
    appearance: ['Appearance','Light','Dark','Follow system'],
    font: ['Conversation font size','14 px','16 px','18 px','20 px'],
    steps: ['Trace detail','Compact','Detailed'],
    collapse: ['Collapse work steps','After the answer','Keep expanded'],
    replies: ['Completed replies','Show all','Fold earlier answers'],
    send: ['Send reading questions with','Enter','Ctrl / ⌘ + Enter'],
    busy: ['When the assistant is busy','Keep a draft','Queue next question'],
    usage: ['Performance and usage','Detailed','Compact','Hide'],
    findKey: ['Find in PDF','Ctrl / ⌘ + F','Ctrl / ⌘ + G'],
    settingsKey: ['Open settings','Ctrl / ⌘ + ,','Ctrl / ⌘ + .'],
    links: ['External paper links','Open directly','Confirm before opening','In sidebar'],
  }
  return <section className="set-section general-settings"><h2>{tr('General settings')}</h2>
    <div className="preference-list">
      <label className="preference-row">{tr('New reading sessions')}<select disabled={!profile || busy} value={profile?.session_access ?? 'edit'}
        onChange={e=>profile && void write('profile.save',{...profile,session_access:e.target.value as 'read'|'edit'}).catch(report)}>
        <option value="edit">{tr('Allow Wiki and memory updates')}</option><option value="read">{tr('Save conversation only')}</option></select></label>
      <div className="preference-row"><label htmlFor="wiki-permission">{tr('Assistant edits in Wiki chat')}</label>
        <select ref={permission} id="wiki-permission" disabled={!profile || busy} value={profile?.wiki_access ?? 'edit'}
          onChange={e=>profile && void write('profile.save',{...profile,wiki_access:e.target.value as 'read'|'edit'}).catch(report)}>
          <option value="edit">{tr('Allow entry edits')}</option><option value="read">{tr('Answer only')}</option></select></div>
      <div className="preference-row"><span>{tr('Language')}</span><LanguagePicker/></div>
      {(Object.keys(options) as (keyof typeof options)[]).map(key=>key === 'findKey' || key === 'settingsKey' ? <div className="preference-row" key={key}><span>{tr(labels[key][0])}</span>
        <button className="ghost-btn" onClick={()=>{setRecording(key);setShortcutError(false)}} onBlur={()=>setRecording(undefined)}
          onKeyDown={e=>{
            if (recording !== key) return
            e.stopPropagation()
            if (e.key === 'Tab') return
            e.preventDefault()
            if (e.key === 'Escape') {setRecording(undefined);return}
            if (['Meta','Control','Shift','Alt'].includes(e.key)) return
            if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || !setPreference(key,e.key.toLowerCase())) {setShortcutError(true);return}
            setRecording(undefined);setShortcutError(false)
          }}>{recording === key ? tr(shortcutError ? 'Choose a different shortcut' : 'Press Ctrl / ⌘ and a key') : 'Ctrl / ⌘ + ' + prefs[key].toUpperCase()}</button></div> : <label className="preference-row" key={key}>
        {tr(labels[key][0])}<select value={prefs[key]} onChange={e=>setPreference(key,e.target.value)}>
          {options[key].map((value,i)=><option key={value} value={value}>{tr(labels[key][i+1])}</option>)}</select></label>)}
    </div>
    <button className="ghost-btn" onClick={()=>{setConfig(JSON.stringify(prefs,null,2));setConfigError('')}}>{tr('Edit interface configuration')}</button>
    {config !== undefined && <Dialog title={tr('Interface configuration')} onClose={()=>setConfig(undefined)}>
      <textarea aria-label={tr('Interface configuration')} className="text-field" rows={13} value={config} onChange={e=>setConfig(e.target.value)}/>
      <label>{tr('Open configuration file')} <input type="file" accept=".json,application/json" onChange={async e=>{
        const file=e.target.files?.[0]
        if (!file) return
        try {if (file.size>65536) throw new Error();setConfig(await file.text());setConfigError('')}
        catch {setConfigError(tr('Check the settings JSON and available values.'))}
      }}/></label>
      {configError && <p role="alert">{configError}</p>}
      <div className="dialog-actions"><button className="ghost-btn" onClick={()=>{
        const url=URL.createObjectURL(new Blob([config],{type:'application/json'}))
        const a=document.createElement('a');a.href=url;a.download='papertrace-interface.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      }}>{tr('Export JSON')}</button><button className="primary" onClick={()=>{
        try {applyPreferencesFile(config);setConfig(undefined)} catch {setConfigError(tr('Check the settings JSON and available values.'))}
      }}>{tr('Apply')}</button></div>
    </Dialog>}
    <small className="fine">PaperTrace · {version}</small></section>
}

export function RoleSettings({onSaved}:{onSaved?:()=>void}) {
  const profile = useRead('profile.get', {})
  return profile && <ProfileForm profile={profile} onSaved={onSaved}/>
}

function ProfileForm({profile,onSaved}:{profile:PersonalProfile;onSaved?:()=>void}) {
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
    try {await write('profile.save',value);setDraft(undefined);setSaved(true);onSaved?.()}
    catch {setError(t('保存失败。重新读取设置后再试。','Could not save. Reload settings and retry.'))}
  }
  const contexts = [
    {key:'enabled', label:t('论文问答','Paper Q&A'), checked:value.enabled},
    {key:'wiki_enabled', label:t('Wiki 对话','Wiki chat'), checked:value.wiki_enabled ?? profile.enabled},
  ] as const
  return <section className="role-form">
    <header><h2>{t('自定义角色','Customize roles')}</h2>
      <p>{t('选择在哪些对话中使用你的角色和记忆。','Choose where to use your profile and memories.')}</p>
      <div className="role-columns">{contexts.map(({key,label,checked})=>
        <button type="button" key={key} role="switch" aria-checked={checked} className="role-toggle"
          onClick={()=>change({[key]:!checked})}>{label}<span aria-hidden="true" className={'switch'+(checked?' on':'')}><span/></span></button>)}</div>
    </header>
    <div className="role-columns">
      <label>{t('助手风格','Assistant style')}<textarea className="text-field" maxLength={500} rows={3}
        placeholder={t('先讲直觉，再列实验依据。','Explain the intuition, then show the evidence.')}
        value={value.persona ?? ''} onChange={e=>change({persona:e.target.value})}/></label>
      <label>{t('我的背景','My background')}<textarea className="text-field" maxLength={500} rows={3}
        placeholder={t('我是研究图像拼接的硕士生。','I study image stitching.')}
        value={value.identity} onChange={e=>change({identity:e.target.value})}/></label>
    </div>
    <label>{t('长期记忆','Long-term memories')}<small>{t('每行一条。开启论文问答个性化后，也可以在对话里说「记住……」。','One per line. With personalization on in paper Q&A, you can also say “Remember…”.')}</small>
      <textarea className="text-field" rows={4} placeholder={t('例如：比较论文时，优先列出实验条件。','For example: compare experimental conditions first.')}
        value={value.memories.join('\n')} onChange={e=>change({memories:e.target.value.split('\n')})}/></label>
    <footer><small>{t('已开启的对话会将相关偏好发送给所选模型。','Enabled conversations send relevant preferences to the selected model.')}</small>
      {saved && <small role="status">{tr('Saved')}</small>}
      <button className="primary" disabled={!draft || busy || value.memories.length>60 || value.memories.some(m=>m.length>400)} onClick={()=>void save()}>{tr('Save')}</button></footer>
    {error && <p role="alert">{error} <button className="link-btn" onClick={()=>{setDraft(undefined);setError('')}}>{tr('Reload')}</button></p>}
  </section>
}
