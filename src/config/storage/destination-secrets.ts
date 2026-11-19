// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** WHERE A DESTINATION'S CREDENTIALS ARE KEPT, AND HOW SAFELY THEY ARE READ, WITHOUT THE OFFICE.
 *
 * THE FILE. A developer machine's sandbox templates name one host secrets file, and that file is used, so the machine
 * keeps working as it did. An installed office (a bundle) ships no `sandboxes/` folder, so no template names a file;
 * there the credentials live in the per-user data folder, beside the database. More than one template naming a file is
 * refused, because the office cannot tell which file keeps the credentials.
 *
 * WHAT A REFUSED FILE SAYS. Every check has its own name and sentence, so a person can see which check failed. The
 * settings page writes the line through src/server/lib/storage/destination-secrets.ts; the storage command reads it
 * here, so this module imports nothing that opens the database. Nothing here prints, keeps or returns a value except
 * to the caller that signs with it.
 */
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { REPO_ROOT, thePerUserDataFolder } from '../settings.mjs'
import { theOwnersHome } from '../install-the-entry.mjs'
import { THIS_PLATFORM, aFileModeSaysWhoMayRead } from '../the-paths-of-a-system.mjs'

const HOST_SECRETS_BYTES=1024*1024
/** Destination names are encoded losslessly in an environment name. */
export function destinationSecretName(name:string):string{return `MOLE_STORAGE_DESTINATION_${Buffer.from(name,'utf8').toString('hex').toUpperCase()}`}
const line=z.string().min(1).max(4096).refine(value=>!/[\r\n\0]/.test(value))
export const cloudCredentialsShape=z.strictObject({accessKeyId:line,secretAccessKey:line,sessionToken:line.optional()})
export type CloudCredentials=z.infer<typeof cloudCredentialsShape>

/** The file name an office keeps destination credentials in when no sandbox template names a file. */
export const THE_DATA_FOLDER_SECRETS_FILE='storage-destination-secrets.env'

export type WhereCredentialsAreKept=
  |{from:'templates';file:string}      // the one file every template names, `~` read as the home, resolved
  |{from:'data-folder';file:string}    // join(thePerUserDataFolder(env,platform),THE_DATA_FOLDER_SECRETS_FILE)
  |{from:'many-templates';file:null}   // the templates name more than one file

/**
 * WHERE DESTINATION CREDENTIALS ARE KEPT. The sandbox templates are read exactly as the office has always read them:
 * one file named by every template is the file, with `~` read as the home and the path resolved. No template names one
 * in an installed office, which ships no `sandboxes/` folder, so the file is `storage-destination-secrets.env` in the
 * per-user data folder. More than one file named cannot be told apart, so the answer names none.
 */
export function whereDestinationCredentialsAreKept(
  templates=join(REPO_ROOT,'sandboxes'),
  env:Record<string,string|undefined>=process.env,
  platform:string=THIS_PLATFORM,
):WhereCredentialsAreKept{
  const files=new Set<string>()
  const found=existsSync(templates)?readdirSync(templates).filter(one=>existsSync(join(templates,one,'sandbox.json'))).sort():[]
  for(const template of found){
    let office:unknown
    try{office=JSON.parse(readFileSync(join(templates,template,'sandbox.json'),'utf8'))}catch{continue}
    const secrets=(office as {secrets?:{hostFile?:unknown;names?:unknown}}|null)?.secrets
    if(typeof secrets?.hostFile!=='string'||!Array.isArray(secrets.names))continue
    files.add(secrets.hostFile)
  }
  if(files.size===0)return {from:'data-folder',file:join(thePerUserDataFolder(env,platform),THE_DATA_FOLDER_SECRETS_FILE)}
  if(files.size===1){
    const only=[...files][0]!
    return {from:'templates',file:resolve(only.replace(/^~(?=\/)/,theOwnersHome()))}
  }
  return {from:'many-templates',file:null}
}

/** Every check a host secrets file can fail, in the order the refusals are declared. */
export type HostSecretsCheck='manyDeclared'|'parentIsALink'|'noParent'|'notAPlainFile'|'othersMayRead'|'anotherOwner'|'tooLarge'|'changedWhileRead'|'unreadable'|'unwritable'

/** The sentence each check says, with `{mode}` and `{systemError}` filled from the refusal's values. */
export const HOST_SECRETS_SENTENCES:Record<HostSecretsCheck,string>={
  manyDeclared:'The sandbox templates name more than one secrets file, so Mole Office cannot tell which one keeps destination credentials. Make every template name the same file.',
  parentIsALink:'A folder above the secrets file is a link, so Mole Office does not use the file. Keep the file in a folder that is not reached through a link.',
  noParent:'No folder above the secrets file exists, so Mole Office cannot use the file.',
  notAPlainFile:'The secrets file is not a plain file with one name, so Mole Office does not use it. It may be a link, a folder or a second name for another file.',
  othersMayRead:'Other users may read the secrets file (mode {mode}), so Mole Office does not use it. Make it readable by its owner only, with mode 600.',
  anotherOwner:'The secrets file belongs to another user, so Mole Office does not use it.',
  tooLarge:'The secrets file is larger than 1 MiB, the most Mole Office reads, so it does not use the file.',
  changedWhileRead:'The secrets file changed while Mole Office read it, so the reading was not used. Try again.',
  unreadable:'Mole Office could not read the secrets file. The system answered {systemError}.',
  unwritable:'Mole Office could not write the secrets file, so nothing was changed. The system answered {systemError}.',
}

/** A host secrets file refused by its check, with the values its sentence names. */
export class HostSecretsRefusal extends Error {
  constructor(readonly check:HostSecretsCheck, readonly values:Readonly<Record<string,string>>={}) {
    super(HOST_SECRETS_SENTENCES[check].replace(/\{(\w+)\}/g,(_,name:string)=>values[name]??`{${name}}`))
  }
}

/**
 * The file on this machine, with `~` read as the home folder. Every parent that exists must resolve as named, and a
 * parent that is a link is refused. When no parent exists the path is refused rather than guessed.
 */
export function hostSecretsPath(declared:string):string{
  const path=resolve(declared.replace(/^~(?=\/)/,theOwnersHome()))
  let parent=dirname(path)
  for(;;){
    try{
      if(realpathSync(parent)!==parent)throw new HostSecretsRefusal('parentIsALink')
      break
    }catch(error){
      if(error instanceof HostSecretsRefusal)throw error
      const code=(error as NodeJS.ErrnoException).code
      if(code==='ENOENT'){
        // The next parent up is asked.
      }else if(typeof code==='string'&&code!=='')throw new HostSecretsRefusal('unreadable',{systemError:code})
      else throw error
    }
    const next=dirname(parent);if(next===parent)throw new HostSecretsRefusal('noParent');parent=next
  }
  return path
}

/**
 * The file's bytes, or null when it is absent. It must be this user's plain, unlinked file that nobody else may read.
 * `platform` says whether a file's mode says who may read it: on Windows it does not, so the mode is not judged there.
 */
export function readHostSecrets(path:string,platform:string=THIS_PLATFORM):Buffer|null{
  let leaf
  try{leaf=lstatSync(path)}catch(error){
    const code=(error as NodeJS.ErrnoException).code
    if(code==='ENOENT')return null
    if(typeof code==='string'&&code!=='')throw new HostSecretsRefusal('unreadable',{systemError:code})
    throw error
  }
  if(!leaf.isFile()||leaf.nlink!==1)throw new HostSecretsRefusal('notAPlainFile')
  if(aFileModeSaysWhoMayRead(platform)&&(leaf.mode&0o077)!==0)throw new HostSecretsRefusal('othersMayRead',{mode:(leaf.mode&0o777).toString(8)})
  if(process.getuid&&leaf.uid!==process.getuid())throw new HostSecretsRefusal('anotherOwner')
  if(leaf.size>HOST_SECRETS_BYTES)throw new HostSecretsRefusal('tooLarge')
  let fd
  try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}
  catch(error){
    const code=(error as NodeJS.ErrnoException).code
    if(code==='ELOOP')throw new HostSecretsRefusal('changedWhileRead')
    if(typeof code==='string'&&code!=='')throw new HostSecretsRefusal('unreadable',{systemError:code})
    throw error
  }
  try{
    const s=fstatSync(fd)
    if(!s.isFile()||s.nlink!==1||s.ino!==leaf.ino||s.dev!==leaf.dev)throw new HostSecretsRefusal('changedWhileRead')
    if(aFileModeSaysWhoMayRead(platform)&&(s.mode&0o077)!==0)throw new HostSecretsRefusal('othersMayRead',{mode:(s.mode&0o777).toString(8)})
    if(s.size>HOST_SECRETS_BYTES)throw new HostSecretsRefusal('tooLarge')
    const buffer=Buffer.alloc(HOST_SECRETS_BYTES+1);let used=0
    for(;;){
      let n
      try{n=readSync(fd,buffer,used,buffer.length-used,null)}
      catch(error){
        const code=(error as NodeJS.ErrnoException).code
        if(typeof code==='string'&&code!=='')throw new HostSecretsRefusal('unreadable',{systemError:code})
        throw error
      }
      if(n===0)break
      used+=n
      if(used>HOST_SECRETS_BYTES)throw new HostSecretsRefusal('tooLarge')
    }
    return buffer.subarray(0,used)
  }finally{closeSync(fd)}
}

/**
 * An s3 destination's saved credentials. It reads the one file the templates name, or the data folder's file when no
 * template names one; more than one named file is refused. It throws, naming no value, when the line is missing or
 * unreadable.
 */
export function readCloudCredentials(destination:string):CloudCredentials{
  const where=whereDestinationCredentialsAreKept()
  if(where.from==='many-templates')throw new HostSecretsRefusal('manyDeclared')
  const bytes=readHostSecrets(hostSecretsPath(where.file)),name=destinationSecretName(destination)
  const found=(bytes?.toString('utf8')??'').split('\n').find(one=>one.startsWith(`${name}=`))
  if(found===undefined||found.length===name.length+1)throw new Error('This destination has no credentials saved on this host. Set them on the settings page.')
  let values:unknown
  try{values=JSON.parse(Buffer.from(found.slice(name.length+1),'base64').toString('utf8'))}catch{values=null}
  const parsed=cloudCredentialsShape.safeParse(values)
  if(!parsed.success)throw new Error('This destination\'s saved credentials cannot be read. Save them again on the settings page.')
  return parsed.data
}
