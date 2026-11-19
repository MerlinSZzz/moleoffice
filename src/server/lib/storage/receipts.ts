// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settings } from '../../../config/settings.mjs'
import { readJournal,markReceiptIngested,type ReceiptLocation,type UploadReceipt } from '../../../config/storage/receipts.ts'
import { sqlite } from '../../db/client.ts'
import { createRecord } from '../records.ts'
import { anOfficeId,idsInTurn } from '../ids.ts'
import { whoHoldsTheSecretaryCard } from '../inspection.ts'
import { THE_OFFICE } from '../the-office.ts'
import { moleOffice } from '../../../shared/participants.ts'
import { sayInEnglish } from '../../../shared/i18n.ts'
import { named } from '../named-timers.ts'
import type { AnotherNoticeKind } from '../notices.ts'
/** The label of the id turn for the record of one kind for one upload attempt. It is hashed into the id and never shown. */
export const receiptTurn=(attempt:string,kind:'report'|'note'|'message'):string=>['storage upload',attempt,kind].join(' ')
/**
 * The record of one kind for one upload attempt, written once. Its id is the first id of the turn named by the attempt
 * and the kind, so a replay finds it by the primary key and never searches record data. The turn holds exactly one
 * create and ends even when the create throws. An occupied id that belongs to another kind or attempt is refused.
 */
function onceForTheAttempt(receipt:UploadReceipt,kind:'report'|'note'|'message',create:()=>{id:string}):void{
 const label=receiptTurn(receipt.attempt,kind)
 let id:string;{const end=idsInTurn(label);try{id=anOfficeId()}finally{end()}}
 const held=sqlite.prepare("SELECT kind,json_extract(data,'$.extra.storageUpload.attempt') attempt FROM records WHERE id = ?").get(id) as {kind:string;attempt:unknown}|undefined
 if(held){if(held.kind===kind&&held.attempt===receipt.attempt)return;throw new Error('A storage receipt record id is already held by another record.')}
 const end=idsInTurn(label);let made:{id:string};try{made=create()}finally{end()}
 if(made.id!==id)throw new Error('A storage receipt record was not stored under the id its attempt names.')
}
/** Only a normal canonical-office job reads the host-only spool. Each office write is atomic and replayable. */
export function ingestStorageReceipts(location:ReceiptLocation={database:settings().databasePath}):{ingested:number}{
 let ingested=0,examined=0
 const project=(sqlite.prepare('SELECT id FROM workspaces ORDER BY rowid LIMIT 1').get() as {id:string}|undefined)?.id
 if(!project)return{ingested}
 for(const receipt of readJournal({...location,pendingOnly:true})){
  if(++examined>128)break
  if(typeof receipt.attempt!=='string'||!receipt.attempt)throw new Error('An upload journal entry names no attempt.')
  if(receipt.status==='prepared')continue
  const secretary=whoHoldsTheSecretaryCard()
  sqlite.transaction(()=>{
   const extra={storageUpload:{...receipt}}
   const text=receipt.status==='failed'
    ?sayInEnglish('storageDestinations.receiptFailedBody',{destination:receipt.destination,error:receipt.error??sayInEnglish('storageDestinations.receiptNoError')})
    :sayInEnglish('storageDestinations.receiptBody',{destination:receipt.destination,bytes:receipt.sentBytes,omissions:receipt.omittedFiles})
   onceForTheAttempt(receipt,'report',()=>createRecord({kind:'report',title:sayInEnglish('storageDestinations.receiptTitle'),workspaceId:project,actor:THE_OFFICE,data:{for:sayInEnglish('storageDestinations.receiptFor'),date:receipt.at.slice(0,10),blocks:[{id:'receipt',type:'text',text}],extra}}))
   if(receipt.warning){
    onceForTheAttempt(receipt,'note',()=>createRecord({kind:'note',title:sayInEnglish('storageDestinations.capacityTitle'),workspaceId:project,actor:THE_OFFICE,data:{body:sayInEnglish('storageDestinations.capacityNotice'),extra:{storageUpload:{...receipt,noticeClass:'C'}}}}))
    if(secretary)onceForTheAttempt(receipt,'message',()=>createRecord({kind:'message',title:sayInEnglish('storageDestinations.capacityTitle'),workspaceId:project,actor:THE_OFFICE,senderIsMoleOffice:true,data:{body:sayInEnglish('storageDestinations.secretaryLine',{destination:receipt.destination,held:receipt.heldBytes??0,core:receipt.coreBytes??0,omissions:receipt.omittedFiles}),to:[{kind:'agent',id:secretary.id}],notice:'storageCapacity' satisfies AnotherNoticeKind,sentBy:moleOffice(),extra}}))
   }
  })()
  if(receipt.warning&&!secretary)continue
  markReceiptIngested(location,receipt.attempt);ingested++
 }
 return{ingested}
}
export function startReadingStorageReceipts(standing:'canonical'|'scratch',log:(line:string)=>void):NodeJS.Timeout|null{
 if(standing!=='canonical')return null
 const tick=()=>{const r=ingestStorageReceipts();if(r.ingested)log(`Ingested ${r.ingested} storage upload receipts.`)}
 const read=named('storage upload receipts',log,tick);read();const watch=setInterval(read,60_000);watch.unref();return watch
}
