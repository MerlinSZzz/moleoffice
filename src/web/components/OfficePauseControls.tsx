// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {useState} from 'react'
import {t} from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import {api,errorMessage,faultOf} from '../api.ts'
import {ErrorNote,Loading,useAsync} from './ui.tsx'
import {RouteLink} from './router.tsx'
type State=Awaited<ReturnType<typeof api.officePauseState>>
function PauseLine({state}:{state:State}){
 return <p>{state.paused?t('officePause.paused',{who:state.by??t('runtimeSettings.unset'),when:state.at??t('runtimeSettings.unset'),because:state.because??t('runtimeSettings.unset')}):t('officePause.running')}</p>
}
export function OfficePauseControls(){
 const [state]=useAsync(()=>api.officePauseState(),[])
 const [reading,setReading]=useState<State|null>(null)
 const [why,setWhy]=useState(''),[busy,setBusy]=useState(false)
 const [fault,setFault]=useState<unknown>(null)
 const current=reading??(state.status==='ready'?state.value:null)
 async function press(paused:boolean){
  setBusy(true);setFault(null)
  try{const reply=await api.changeOfficePause(paused,why);setReading(reply.state);setWhy('')}
  catch(error){setFault(error)}finally{setBusy(false)}
 }
 return <div className="orc office-pause-controls">
  <h4>{t('officePause.title')}</h4><p>{t('officePause.explain')}</p>
  {current?<PauseLine state={current}/>:state.status==='error'?<ErrorNote message={state.message}/>:<Loading what={t('officePause.loading')}/>}
  <label>{t(settingsControlWord('settings.restart', 'officePause.reason'))}<input value={why} onChange={e=>setWhy(e.target.value)} maxLength={500}/></label>
  <button disabled={busy||!why.trim()||!current?.available||current.paused} onClick={()=>{void press(true)}}>{t(settingsControlWord('settings.restart', 'officePause.press'))}</button>
  <button disabled={busy||!why.trim()||!current?.available||!current.paused} onClick={()=>{void press(false)}}>{t(settingsControlWord('settings.restart', 'officePause.resume'))}</button>
  {fault?<ErrorNote message={errorMessage(fault)} fault={faultOf(fault)}/>:null}
 </div>
}
export function OfficePauseNotice({tick=0}:{tick?:number}){
 const [state]=useAsync(()=>api.officePauseState(),[tick])
 if(state.status==='error')return <ErrorNote message={t('officePause.unread')}/>
 if(state.status!=='ready'||!state.value.paused)return null
 return <aside className="office-pause-notice" role="status"><PauseLine state={state.value}/><p>{t('officePause.explain')}</p><RouteLink to="/settings/restart">{t('officePause.open')}</RouteLink></aside>
}
