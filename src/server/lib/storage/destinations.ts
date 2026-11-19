// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readReceipt } from '../../../config/storage/receipts.ts'
import { settings } from '../../../config/settings.mjs'
import type { Actor } from '../records.ts'
import { writeDownASettingChange } from '../records.ts'
import { PanelError } from '../panel-error.ts'
import { sqlite } from '../../db/client.ts'
import { DEFAULT_UPLOAD_POLICY,DEFAULT_DESTINATION_LIMIT_BYTES,DESTINATION_MAX,DESTINATION_SETTING,destinationShape,readDestinations } from '../../../config/storage/destinations.mjs'
import { readStorageCategories } from './inventory.ts'
import { credentialActionShape,destinationCredentialsReading,destinationSecretStore,validateCredentials } from './destination-secrets.ts'
import { z } from 'zod'
import { destinationWarningBytes } from '../../../shared/storage/destinations.ts'

const saveShape=z.strictObject({destination:destinationShape,credentials:credentialActionShape.default({action:'retain'}),because:z.string().trim().min(1).max(500).optional()})
function invalid():never{throw new PanelError('The destination or credential fields are invalid. Nothing was changed.',400,undefined,undefined,undefined,{code:'storageDestinationInvalid',values:{}})}
function saved(){try{return readDestinations(sqlite)}catch{invalid()}}
export function destinationSettingsReading(mayChange:boolean,spool?:string) {
  const secrets=destinationCredentialsReading()
  return {mayChange,defaults:{policy:{...DEFAULT_UPLOAD_POLICY},limitBytes:DEFAULT_DESTINATION_LIMIT_BYTES},local:readStorageCategories(sqlite),coreBytes:null,credentials:secrets.credentials,
    destinations:saved().map(destination=>{let receipt=null,receiptUnreadable=false;try{receipt=readReceipt({database:settings().databasePath,destination:destination.name,spool})}catch{receiptUnreadable=true}
      return {...destination,credentialsSet:secrets.has(destination.name),warningBytes:destinationWarningBytes(destination.limitBytes),heldBytes:receipt?.heldBytes??null,lastUpload:receipt?.at??null,coreBytes:receipt?.coreBytes??null,lastError:receipt?.error??null,omittedFiles:receipt?.omittedFiles??null,uploadState:receipt?.status??null,warning:receipt?.warning??false,receiptUnreadable}}),
  }
}
export type DestinationSettingsReply=ReturnType<typeof destinationSettingsReading>
export function saveDestinationSettings(input:unknown,actor:Actor,workspaceId:string):void {
  const parsed=saveShape.safeParse(input);if(!parsed.success)invalid()
  const {destination,credentials,because}=parsed.data
  validateCredentials(destination.kind,credentials)
  const rows=saved(),before=rows.find(row=>row.name===destination.name)
  if(before===undefined&&rows.length>=DESTINATION_MAX)invalid()
  const secrets=destinationSecretStore()
  if(before!==undefined&&before.kind!==destination.kind&&secrets.has(destination.name)&&credentials.action==='retain')invalid()
  const after=before===undefined?[...rows,destination]:rows.map(row=>row.name===destination.name?destination:row)
  const undo=secrets.change(destination.name,credentials)
  try{
    sqlite.transaction(()=>{
      sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(DESTINATION_SETTING,JSON.stringify(after))
      writeDownASettingChange(actor,{setting:DESTINATION_SETTING,field:'storage destinations',before:before??null,after:{destination,because:because??null},workspaceId})
    })()
  }catch{undo();invalid()}
}
