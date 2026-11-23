// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState, type FormEvent } from 'react'
import { t, content, type WordKey } from '@shared/i18n.ts'
import { DEFAULT_UPLOAD_POLICY, destinationWarningBytes, type Destination, type UploadPolicy } from '@shared/storage/destinations.ts'
import { STORAGE_CATEGORIES } from '@shared/storage/categories.ts'
import type { DestinationSettingsReply } from '../../server/lib/storage/destinations.ts'
import { api, ApiError, errorMessage, type Fault } from '../api.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { useLanguage } from '../lib/language.ts'
import { Panel, Loading, ErrorNote, theRefusalInWords, useAsync } from './ui.tsx'
const w=(key:string)=>t(`storageDestinations.${key}` as WordKey)
const cw=(key:string)=>t(settingsControlWord('settings.storage', `storageDestinations.${key}`))
const bytes=(n:number)=>`${new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n/1_000_000)} MB`
type Draft={name:string;kind:Destination['kind'];path:string;endpoint:string;bucket:string;region:string;prefix:string;host:string;user:string;port:string;policy:UploadPolicy;limitMB:string;enabled:boolean}
function draft(limit:number,destination?:Destination):Draft {
  const target=destination?.target
  return {name:destination?.name??'',kind:destination?.kind??'folder',path:target&&'path'in target?target.path:'',endpoint:target&&'endpoint'in target?target.endpoint:'',bucket:target&&'bucket'in target?target.bucket:'',region:target&&'region'in target?target.region:'',prefix:target&&'prefix'in target?target.prefix:'',host:target&&'host'in target?target.host:'',user:target&&'user'in target?target.user:'',port:target&&'port'in target?String(target.port):'22',policy:{...(destination?.policy??DEFAULT_UPLOAD_POLICY)},limitMB:String((destination?.limitBytes??limit)/1_000_000),enabled:destination?.enabled??true}
}
export function StorageDestinationsPanel(){
  useLanguage()
  const [state]=useAsync(()=>api.storageDestinations(),[])
  if(state.status==='loading')return <Loading what={w('title')}/>
  if(state.status==='error')return <ErrorNote message={state.message} fault={state.fault}/>
  return <Panel titleIs="label" declares={{ surface: 'settings.storage' }} title={w('title')}><Destinations first={state.value}/></Panel>
}
function Destinations({first}:{first:DestinationSettingsReply}){
  const [reading,setReading]=useState(first),[selected,setSelected]=useState<string|null>(null),[form,setForm]=useState<Draft|null>(null)
  const [action,setAction]=useState('retain'),[secrets,setSecrets]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState<{message:string;fault:Fault|null}|null>(null),[saved,setSaved]=useState(false)
  const choose=(destination?:Destination)=>{setSelected(destination?.name??null);setForm(draft(reading.defaults.limitBytes,destination));setAction('retain');setSecrets({});setError(null);setSaved(false)}
  const field=(key:keyof Draft,value:string|boolean)=>setForm(current=>current===null?null:{...current,[key]:value})
  const tick=(key:keyof UploadPolicy,value:boolean)=>setForm(current=>current===null?null:{...current,policy:{...current.policy,[key]:value}})
  async function save(event:FormEvent){
    event.preventDefault();if(form===null)return
    setBusy(true);setError(null);setSaved(false)
    const target=form.kind==='folder'?{path:form.path}:form.kind==='s3'?{endpoint:form.endpoint,bucket:form.bucket,region:form.region,prefix:form.prefix}:{host:form.host,user:form.user,port:Number(form.port),path:form.path}
    try{
      const next=await api.storageDestinations({destination:{name:form.name,kind:form.kind,target,policy:form.policy,limitBytes:Number(form.limitMB)*1_000_000,enabled:form.enabled},credentials:action==='replace'?{action,values:secrets}:{action}})
      setSecrets({});setAction('retain');setReading(next);setSelected(form.name);setSaved(true)
    }catch(e){setError({message:errorMessage(e),fault:e instanceof ApiError?e.fault:null})}finally{setBusy(false)}
  }
  const current=reading.destinations.find(one=>one.name===selected)
  const input=(name:keyof Draft,type='text')=><label className="sd-field">{cw(String(name))}<input name={name} type={type} value={String(form?.[name]??'')} disabled={busy||(name==='name'&&selected!==null)} onChange={event=>field(name,event.target.value)} required={name!=='prefix'} autoComplete="off"/></label>
  const optionalTicks=['secretaries','supervisors','workers','runHistory','changeLog','apiLog'] as const
  return <div data-storage-destinations className="sd">
    <style href="storage-destinations" precedence="default">{CSS}</style>
    <p className="set-say">{w('intro')}</p>
    <div data-storage-credentials className="sd-where">
      {reading.credentials.file===null?null:<CodeRows rows={[{label:'storageDestinations.row.credentialsFile',value:reading.credentials.file,...(reading.credentials.exists?{}:{state:'storageDestinations.row.notMadeYet' as const})}]}/>}
      {reading.credentials.file===null?null:<p className="set-say">{reading.credentials.from==='templates'?w('fromTemplates'):w('fromDataFolder')}</p>}
      {reading.credentials.modeSaysWhoMayRead?null:<p data-storage-mode-cannot-tell className="set-say">{w('modeCannotTell')}</p>}
      {reading.credentials.refused===null?null:<p data-storage-credentials-refused role="alert" className="set-say sd-refused">{theRefusalInWords(reading.credentials.refused.message,reading.credentials.refused)} {w('credentialsUnusable')}</p>}
    </div>
    <div className="sd-list">{reading.destinations.map(one=><button type="button" key={one.name} onClick={()=>choose(one)} aria-pressed={selected===one.name}>{content(one.name)}</button>)}<button type="button" onClick={()=>choose()}>{cw('add')}</button></div>
    {reading.destinations.length===0?<p className="set-say">{w('none')}</p>:null}
    {saved?<p role="status">{w('saved')}</p>:null}{error?<ErrorNote message={error.message} fault={error.fault}/>:null}
    {form===null?null:<form data-storage-form onSubmit={save}>
      <fieldset disabled={busy||!reading.mayChange}>
        <div className="sd-fields">{input('name')}<label className="sd-field">{cw('kind')}<select name="kind" value={form.kind} onChange={e=>{field('kind',e.target.value);setSecrets({});setAction('retain')}}>{(['folder','s3','ssh'] as const).map(kind=><option key={kind} value={kind}>{cw(kind)}</option>)}</select></label></div>
        <p className="set-say">{w('identity')}</p>
        <div className="sd-fields">{form.kind==='folder'?input('path'):form.kind==='s3'?<>{input('endpoint','url')}{input('bucket')}{input('region')}{input('prefix')}</>:<>{input('host')}{input('user')}{input('port','number')}{input('path')}</>}</div>
        <label className="sd-check"><input name="enabled" type="checkbox" checked={form.enabled} onChange={e=>field('enabled',e.target.checked)}/>{cw('enabled')}</label>
        <h3>{w('uploadList')}</h3>
        <label className="sd-check"><input name="core" type="checkbox" checked disabled readOnly/>{cw('core')}</label>
        <p className="set-say">{w('coreMeans')}</p>
        <div className="sd-ticks">{optionalTicks.map(key=><label className="sd-check" key={key}><input name={key} type="checkbox" checked={form.policy[key]} onChange={e=>tick(key,e.target.checked)}/>{cw(key)}<small>{w('notMeasured')}</small></label>)}</div>
        <h3>{w('localSizes')}</h3><p className="set-say">{w('incomplete')}</p>
        <div className="sd-categories">{STORAGE_CATEGORIES.map(category=>{
          const size=reading.local.categories.find(row=>row.category===category)
          return <label className="sd-check" data-storage-category={category} key={category}><input name={category} type="checkbox" checked={form.policy[category]} onChange={e=>tick(category,e.target.checked)}/><span>{cw(category)}</span><small>{size&&size.files>0?bytes(size.bytes):reading.local.state==='unmeasured'?w('notMeasured'):bytes(size?.bytes??0)}</small></label>
        })}</div>
        <div className="sd-fields"><label className="sd-field">{cw('thresholdMB')}<input name="thresholdMB" type="number" min="1" max="1000000" step="1" value={form.policy.thresholdMB} onChange={e=>setForm({...form,policy:{...form.policy,thresholdMB:Number(e.target.value)}})} required/></label>{input('limitMB','number')}</div>
        <p className="set-say">{w('thresholdMeans')}</p>
        <div className="sd-limit"><p>{w('warning')} <strong>{bytes(destinationWarningBytes(Number(form.limitMB)*1_000_000))}</strong></p><div className="sd-line" aria-hidden="true"><i/></div><p className="set-say">{w('coreContinues')}</p></div>
        <p data-storage-core className="set-say">{w('coreSize')} {(current?.coreBytes??reading.coreBytes)===null?w('notMeasured'):bytes((current?.coreBytes??reading.coreBytes)!)}</p>
        <p data-storage-held className="set-say">{w('held')} {current?.heldBytes==null?w('noUpload'):bytes(current.heldBytes)}</p>
        <p data-storage-upload className="set-say">{w('lastUpload')} {current?.lastUpload??w('noUpload')} {current?.uploadState?w(current.uploadState):null}</p>
        {current?.omittedFiles==null?null:<p data-storage-omissions className="set-say">{w('omissions')} {current.omittedFiles}</p>}
        {current?.warning?<p className="set-say">{w('capacityNotice')}</p>:null}
        {current?.receiptUnreadable?<p role="status">{w('receiptUnreadable')}</p>:null}
        {current?.lastError?<p data-storage-error role="status">{w('errors')} {content(current.lastError)}</p>:null}
        <h3>{w('credentials')}</h3><p className="set-say">{w('secretMeans')}</p>
        <p className="set-say">{current?.credentialsSet===null?w('credentialsUnknown'):current?.credentialsSet?w('credentialsSet'):w('credentialsNotSet')}</p>
        <label className="sd-field">{cw('credentialAction')}<select name="credentialAction" value={action} onChange={e=>{setAction(e.target.value);setSecrets({})}}>{['retain','replace','remove'].filter(one=>form.kind!=='folder'||one!=='replace').map(one=><option key={one} value={one}>{cw(one)}</option>)}</select></label>
        {action!=='replace'?null:<div className="sd-fields">{(form.kind==='s3'?['accessKeyId','secretAccessKey','sessionToken']:['password','privateKey','passphrase']).map(key=><label className="sd-field" key={key}>{cw(key)}{key==='privateKey'?<textarea name={key} value={secrets[key]??''} onChange={e=>setSecrets({...secrets,[key]:e.target.value})} autoComplete="off"/>:<input type="password" name={key} value={secrets[key]??''} onChange={e=>setSecrets({...secrets,[key]:e.target.value})} autoComplete="new-password"/>}</label>)}</div>}
        <button type="submit" disabled={busy}>{cw('save')}</button>
      </fieldset>
    </form>}
  </div>
}
const CSS=`
.sd { min-width:0; display:grid; gap:var(--pad); }
.sd p { margin:0; overflow-wrap:anywhere; }
.sd-where { display:grid; gap:6px; }
.sd-where code { overflow-wrap:anywhere; font-family:var(--font-mono); }
.sd-refused { border-left:3px solid var(--alarm-raised-rail); padding-left:12px; color:var(--alarm-raised-ink); }
.sd-list { display:flex; flex-wrap:wrap; gap:8px; }
.sd button { font:inherit; color:var(--text); background:var(--panel); border:1px solid var(--border); padding:8px 12px; border-radius:var(--radius,4px); cursor:pointer; overflow-wrap:anywhere; }
.sd button[aria-pressed=true] { border-color:var(--text); }
.sd fieldset { border:0; padding:0; margin:0; display:grid; gap:16px; min-width:0; }
.sd h3 { font:600 var(--fs-2)/1.4 var(--font-ui); margin:8px 0 0; }
.sd-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 20px; }
.sd-ticks { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr)); gap:12px 20px; }
.sd-field { display:grid; align-content:start; gap:6px; min-width:0; font:var(--fs-1)/1.4 var(--font-ui); }
.sd-field input,.sd-field select,.sd-field textarea { width:100%; min-width:0; box-sizing:border-box; padding:9px; font:inherit; color:var(--text); background:var(--bg); border:1px solid var(--border); border-radius:var(--radius,4px); }
.sd-check { display:flex; gap:10px; align-items:center; min-width:0; font:var(--fs-1)/1.5 var(--font-ui); }
.sd-check input { flex:0 0 auto; width:17px; height:17px; accent-color:var(--text); }
.sd-check small { min-width:0; margin-left:auto; text-align:end; color:var(--text-3); white-space:normal; font-size:var(--fs-1); }
.sd-categories { display:grid; }
.sd-categories .sd-check { padding:10px 0; border-bottom:1px solid var(--border); }
.sd-limit { display:grid; gap:10px; }
.sd-line { position:relative; height:1px; background:var(--border); margin:0 0 3px; }
.sd-line i { position:absolute; left:80%; top:-4px; height:16px; border-left:2px solid var(--text-2); }
@media(max-width:40rem) { .sd-fields { grid-template-columns:minmax(0,1fr); } }
`
