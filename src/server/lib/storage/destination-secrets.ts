// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Credentials share the established host secrets file, or the data folder's file in an installed office. Replies only
 * expose presence. The line's name and the safe read are src/config/storage/destination-secrets.ts's, which the storage
 * command reads them with; other logins stay byte for byte.
 */
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  cloudCredentialsShape,
  destinationSecretName as key,
  hostSecretsPath,
  HostSecretsRefusal,
  readHostSecrets,
  whereDestinationCredentialsAreKept,
  type HostSecretsCheck,
  type WhereCredentialsAreKept,
} from '../../../config/storage/destination-secrets.ts'
import { THIS_PLATFORM, aFileModeSaysWhoMayRead } from '../../../config/the-paths-of-a-system.mjs'
import { STORAGE_REFUSAL_CODES } from '../../../shared/storage/refusals.ts'
import { PanelError } from '../panel-error.ts'
import { z } from 'zod'

export const credentialActionShape=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('retain')}),z.strictObject({action:z.literal('remove')}),
  z.strictObject({action:z.literal('replace'),values:z.record(z.string(),z.string().min(1).max(16384))}),
])
type Action=z.infer<typeof credentialActionShape>
const line=z.string().min(1).max(4096).refine(value=>!/[\r\n\0]/.test(value))
const ssh=z.strictObject({password:line.optional(),privateKey:z.string().min(1).max(16384).refine(value=>!value.includes('\0')).optional(),passphrase:line.optional()}).refine(value=>!!value.password||!!value.privateKey)
export function validateCredentials(kind:string,action:Action): void {
  if(action.action==='replace' && !(kind==='s3'?cloudCredentialsShape:kind==='ssh'?ssh:z.never()).safeParse(action.values).success) {
    throw new PanelError('The destination or credential fields are invalid. Nothing was changed.',400,undefined,undefined,undefined,{code:'storageDestinationInvalid',values:{}})
  }
}

/** The one sentence a host secrets refusal keeps, as the code the page draws and the values its sentence names. */
function asPanelError(error:HostSecretsRefusal):PanelError {
  const value=(name:string):string=>{
    const found=error.values[name]
    if(found===undefined)throw new Error(`The ${error.check} refusal has no ${name} value.`)
    return found
  }
  switch(error.check){
    case 'manyDeclared':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsManyDeclared',values:{}})
    case 'parentIsALink':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsParentIsALink',values:{}})
    case 'noParent':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsNoParent',values:{}})
    case 'notAPlainFile':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsNotAPlainFile',values:{}})
    case 'othersMayRead':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsOthersMayRead',values:{mode:value('mode')}})
    case 'anotherOwner':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsAnotherOwner',values:{}})
    case 'tooLarge':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsTooLarge',values:{}})
    case 'changedWhileRead':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsChangedWhileRead',values:{}})
    case 'unreadable':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsUnreadable',values:{systemError:value('systemError')}})
    case 'unwritable':return new PanelError(error.message,409,undefined,undefined,undefined,{code:'storageDestinationSecretsUnwritable',values:{systemError:value('systemError')}})
  }
}

/** An errno from making or replacing the file is the one unwritable refusal; an error with no code is thrown unchanged. */
function throwTheUnwritable(error:unknown):never {
  const code=(error as NodeJS.ErrnoException).code
  if(typeof code==='string'&&code!=='')throw asPanelError(new HostSecretsRefusal('unwritable',{systemError:code}))
  throw error
}

type SecretStore={has:(name:string)=>boolean;change:(name:string,action:Action)=>()=>void}
type OpenedDestinationSecrets={store:SecretStore;where:WhereCredentialsAreKept;exists:boolean}

/**
 * THE OPEN STORE, OR THE CHECK THAT REFUSED IT. Only a HostSecretsRefusal is answered as a refusal; every other error is
 * thrown on unchanged. The reading and the store both ask here, so the reading can name the check without catching every
 * PanelError.
 */
function openDestinationSecretStore(platform:string):{opened:OpenedDestinationSecrets;refusal:null}|{opened:null;refusal:HostSecretsRefusal;where:WhereCredentialsAreKept}{
  const where=whereDestinationCredentialsAreKept(undefined,undefined,platform)
  try {
    if(where.from==='many-templates')throw new HostSecretsRefusal('manyDeclared')
    const path=hostSecretsPath(where.file)
    const before=readHostSecrets(path,platform)
    const text=before?.toString('utf8')??''
    const entries=text.split('\n')
    const has=(name:string):boolean=>entries.some(one=>one.startsWith(`${key(name)}=`)&&one.length>key(name).length+1)
    const write=(bytes:Buffer):void=>{
      try{mkdirSync(dirname(path),{recursive:true,mode:0o700})}catch(error){throwTheUnwritable(error)}
      if(realpathSync(dirname(path))!==dirname(path))throw asPanelError(new HostSecretsRefusal('parentIsALink'))
      const next=`${path}.${randomUUID()}.new`
      try{
        const fd=openSync(next,'wx',0o600)
        try{writeFileSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}
        renameSync(next,path)
      }catch(error){throwTheUnwritable(error)}
      finally{rmSync(next,{force:true})}
    }
    const change=(name:string,action:Action):()=>void=>{
      if(action.action==='retain')return ()=>{}
      const kept=entries.filter(one=>!one.startsWith(`${key(name)}=`))
      if(kept.at(-1)==='')kept.pop()
      if(action.action==='replace')kept.push(`${key(name)}=${Buffer.from(JSON.stringify(action.values)).toString('base64')}`)
      write(Buffer.from(kept.length?`${kept.join('\n')}\n`:''))
      return ()=>{if(before===null)rmSync(path,{force:true});else write(before)}
    }
    return {opened:{store:{has,change},where,exists:before!==null},refusal:null}
  }catch(error){
    if(error instanceof HostSecretsRefusal)return {opened:null,refusal:error,where}
    throw error
  }
}

/** The settings page's store of destination credentials. A refused file is answered as its own check. */
export function destinationSecretStore(platform=THIS_PLATFORM) {
  const opened=openDestinationSecretStore(platform)
  if(opened.refusal!==null)throw asPanelError(opened.refusal)
  return opened.opened.store
}

export type StorageRefusalCode=keyof typeof STORAGE_REFUSAL_CODES

export interface CredentialsReading {
  /** The file on this machine, or null when the templates name more than one. */
  file:string|null
  /** Where that answer came from. */
  from:'templates'|'data-folder'|'many-templates'
  /** Whether the file is there now. */
  exists:boolean
  /** Whether Mole Office can use it. */
  usable:boolean
  /** The check that failed: its code, its English sentence and its values. Null when usable. */
  refused:{code:StorageRefusalCode;message:string;values:Record<string,string|number>}|null
  /** False on Windows, where a file's mode does not say who may read it. */
  modeSaysWhoMayRead:boolean
}

/** Whether lstat finds the path: a link, a folder and a plain file all count as there. */
function theFileIsThere(path:string):boolean {
  try{lstatSync(path);return true}catch{return false}
}

/** Where the credentials are kept, whether they can be used, and the check that refused the file when they cannot. */
export function destinationCredentialsReading(platform=THIS_PLATFORM):{credentials:CredentialsReading;has:(name:string)=>boolean|null} {
  const modeSaysWhoMayRead=aFileModeSaysWhoMayRead(platform)
  const opened=openDestinationSecretStore(platform)
  if(opened.refusal!==null){
    const where=opened.where
    const panel=asPanelError(opened.refusal)
    if(panel.code===undefined)throw new Error(`The ${opened.refusal.check} refusal has no code.`)
    return {credentials:{file:where.file,from:where.from,exists:where.file!==null&&theFileIsThere(where.file),usable:false,
      refused:{code:panel.code as StorageRefusalCode,message:panel.message,values:(panel.values??{}) as Record<string,string|number>},
      modeSaysWhoMayRead},has:()=>null}
  }
  return {credentials:{file:opened.opened.where.file,from:opened.opened.where.from,exists:opened.opened.exists,usable:true,refused:null,modeSaysWhoMayRead},has:opened.opened.store.has}
}
