// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {randomUUID} from 'node:crypto'
import {theLastChangeOfASetting,writeDownASettingChange,type Actor} from './records.ts'
import { PanelError } from './panel-error.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import {pauseTheRunsAtWork} from './pausing.ts'

export type PauseWay={stopWorker:()=>Promise<string>;startWorker:()=>Promise<string>}
let way:PauseWay|null=null
let changing=false
export function thisOfficePausesWith(next:PauseWay|null):void {way=next}
export function officePauseState(){
 const change=theLastChangeOfASetting('office-pause')
 const value=change?.to===null||change===null?null:JSON.parse(change.to) as {paused:boolean;because:string}
 const actor=change?.by
 const by=actor?.type==='human'?readParticipant({kind:'person',id:actor.id}):actor?.type==='agent'?theAgentAStoredIdNames(actor.id):null
 return {paused:value?.paused===true,by:by?.name??null,at:change?.at??null,because:value?.because??null,available:way!==null}
}
export async function changeOfficePause(actor:Actor,paused:boolean,because:string,workspaceId:string){
 if(way===null)throw new PanelError('This server has no worker pause manager. No pause or resume was requested.',503,undefined,undefined,undefined,{code:'officePauseNotReady',values:{reason:'This server has no worker pause manager. No pause or resume was requested.'}})
 if(changing)throw new PanelError('A pause or resume is already being carried out. Wait for its answer.',409,undefined,undefined,undefined,{code:'officePauseNotReady',values:{reason:'A pause or resume is already being carried out. Wait for its answer.'}})
 changing=true
 try {
  const before=officePauseState()
  // This audit is also the durable worker-pause state. A partial run pause still leaves the worker quiet.
  const caller=participantForActor(actor)
  if(caller===null)throw new PanelError('The caller has no registry identity. The pause state was not recorded.',403,undefined,undefined,undefined,{code:'officePauseNotReady',values:{reason:'The caller has no registry identity. The pause state was not recorded.'}})
  const worker=paused?await way.stopWorker():await way.startWorker()
  writeDownASettingChange({...actor,id:caller.id},{setting:'office-pause',field:'office worker pause',before:{paused:before.paused,because:before.because},after:{paused,because,press:randomUUID()},workspaceId})
  const runs=paused?await pauseTheRunsAtWork({...actor,id:caller.id},because,'pause'): {paused:[],notPausable:[]}
  return {state:officePauseState(),worker,paused:runs.paused.filter(r=>r.paused),notPaused:runs.paused.filter(r=>!r.paused),notPausable:runs.notPausable}
 }catch(error){
  if(error instanceof PanelError && error.code!==undefined)throw error
  const reason=`Pause or resume could not finish: ${error instanceof Error?error.message:String(error)} Read the office pause state before trying again.`
  throw new PanelError(reason,error instanceof PanelError?error.status:503,undefined,undefined,undefined,{code:'officePauseNotReady',values:{reason}})
 }finally{changing=false}
}
