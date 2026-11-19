import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '../../../prototype/src/components/PageHead'
import { ScopeDetails } from '../components/ScopeDetails'
import { errorText, type Client, type Method, type Methods, type WorkspaceTask } from '../api/contract'
import { operation, retryWrite, useTask } from './useTask'

type WriteMethod = { [M in Method]: Methods[M][0] extends {operation_id:string}?M:never }[Method]
type Payload<P> = P extends unknown ? Omit<P,'operation_id'> : never
type Workspace = {
  api:Client; tick:number; demo:boolean; busy:boolean; refresh:()=>void; report:(error:unknown)=>void
  write:<M extends WriteMethod>(method:M,params:Payload<Methods[M][0]>)=>Promise<Methods[M][1]>
  prepare:(task:WorkspaceTask)=>Promise<void>
}
const Context=createContext<Workspace|null>(null)
export function useWorkspace() { const ctx=useContext(Context); if(!ctx) throw new Error('Workspace unavailable'); return ctx }
export function useRead<M extends Method>(method:M,params:Methods[M][0],enabled=true) {
  const {api,tick,report}=useWorkspace()
  const [data,setData]=useState<{key:string;value:Methods[M][1]}>()
  const query=JSON.stringify(params)
  const key=method+query
  useEffect(()=>{
    let current=true
    if(enabled) void api.call(method,JSON.parse(query)).then(value=>{if(current)setData({key,value})}).catch(e=>{if(current)report(e)})
    return ()=>{current=false}
  },[api,tick,method,query,key,enabled,report])
  return enabled && data?.key===key ? data.value : undefined
}
export function WorkspaceProvider({api,demo,children}:{api:Client;demo:boolean;children:ReactNode}) {
  const [tick,setTick]=useState(0)
  const [notice,setNotice]=useState('')
  const [pending,setPending]=useState(0)
  const report=useCallback((cause:unknown)=>setNotice(errorText(cause)),[])
  const refresh=useCallback(()=>setTick(t=>t+1),[])
  const taskKey='papertrace-workspace-task/'+(demo?'demo':'rpc')
  const task=useTask(api,()=>{localStorage.removeItem(taskKey);refresh()})
  const attached=useRef(false)
  useEffect(()=>{
    if(attached.current)return
    attached.current=true
    const saved=localStorage.getItem(taskKey)
    if(saved)task.attach(saved)
  },[taskKey,task])
  useEffect(()=>{if(task.task)localStorage.setItem(taskKey,task.task)},[task.task,taskKey])
  const writing=useRef(new Map<string,Promise<unknown>>())
  async function write<M extends WriteMethod>(method:M,params:Payload<Methods[M][0]>):Promise<Methods[M][1]> {
    const key=method+JSON.stringify(params)
    const active=writing.current.get(key)
    if(active)return active as Promise<Methods[M][1]>
    const payload={...params,operation_id:operation()} as unknown as Methods[M][0]
    setPending(p=>p+1)
    const sent=retryWrite(()=>api.call(method,payload)).then(result=>{refresh();return result}).finally(()=>{
      writing.current.delete(key);setPending(p=>p-1)
    })
    writing.current.set(key,sent)
    return sent
  }
  const busy=Boolean(task.task||task.busy||task.confirmation||pending)
  return <Context.Provider value={{api,tick,report,refresh,write,prepare:task.prepare,demo,busy}}>
    {children}
    {task.confirmation && <Dialog title="Confirm task scope" onClose={task.dismiss}>
      <p className="dialog-text">{task.confirmation.input.kind.replaceAll('_',' ')}</p>
      <ScopeDetails scope={task.confirmation}/>
      {task.confirmation.transfers.length===0 && <p>All material stays in this workspace.</p>}
      {task.confirmation.transfers.map((t,i)=><p key={i}><b>{t.purpose}</b><br/>{t.endpoint}<br/>{t.data_categories.join(', ')}</p>)}
      <div className="dialog-actions"><button className="ghost-btn" onClick={task.dismiss}>Cancel</button><button className="primary" disabled={task.busy} onClick={task.start}>Confirm and start</button></div>
    </Dialog>}
    {task.task && <div className="mainline-task-actions" role="status">{task.preview.progress || 'Task running'}
      <button className="ghost-btn sm" onClick={task.cancel}>Cancel task</button><button className="ghost-btn sm" onClick={task.reconnect}>Reconnect</button></div>}
    {(notice||task.error||task.connectionError||task.status) && <Dialog title="Workspace notice" onClose={()=>{setNotice('');task.clearNotice()}}>
      <p role="alert">{notice||task.error||task.connectionError||task.status}</p><button className="ghost-btn" onClick={()=>{setNotice('');task.clearNotice()}}>Close</button>
    </Dialog>}
  </Context.Provider>
}
