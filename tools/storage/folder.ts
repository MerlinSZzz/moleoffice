// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, opendirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readDestinations } from '../../src/config/storage/destinations.mjs'
import { recordAttempt, readReceipt, readJournal, receiptFolder, privateFolder, type ReceiptLocation, type UploadReceipt } from '../../src/config/storage/receipts.ts'
import { destinationShape, destinationWarningBytes, type Destination, type UploadPolicy } from '../../src/shared/storage/destinations.ts'
import { STORAGE_STORES } from '../../src/shared/storage/categories.ts'
import { clockStamp, fileNameStamp, localStamp } from '../../src/shared/time.ts'
import { assertScrubbed, carriesAHeldHash, filterCopy, MAX_JSON_BYTES, type TableClass } from './records.ts'
import { directory, durableJSON, inside, plainPath, safeKey, stamp, syncDirectory, transfer, walk, MAX_METADATA_BYTES } from './io.ts'
export { readReceipt, readJournal, receiptFolder }
export interface UploadOptions{database:string;destination:Destination;now?:Date;spool?:string}
export interface Pack {version:1;kind:'base'|'change';office:string;week:string;at:string;base:string|null;database:{size:number;sha256:string};manifest:{size:number;sha256:string};policy:UploadPolicy;coreBytes:number}
interface FileRow{path:string;size:number;sha256:string;category:string;source:'base'|'change';original:string;stamp:string}
function* omissionRows(db:Database.Database):Generator<Omission>{yield* db.prepare('SELECT * FROM omissions').iterate() as Iterable<Omission>}
interface Omission{path:string;category:string;bytes:number;reason:string}
const openRead=(file:string)=>{plainPath(file);return new Database(file,{readonly:true,fileMustExist:true})}
export function heldBytes(root:string):number{let n=0;for(const f of walk(root))n+=f.size;return n}
// A week is the operator's: it starts on the Sunday of this host's own calendar.
export function weekOf(date:Date):string{return localStamp(new Date(date.getFullYear(),date.getMonth(),date.getDate()-date.getDay())).slice(0,10)}
function readPack(path:string):Pack {
 plainPath(path);const file=join(path,'pack.json');plainPath(file);if(lstatSync(file).size>MAX_METADATA_BYTES)throw new Error('Pack metadata exceeds its bounded size.')
 return checkPack(JSON.parse(readFileSync(file,'utf8')))
}
export function checkPack(value:unknown):Pack {
 const p=value as Pack
 if(p===null||typeof p!=='object'||p.version!==1||!['base','change'].includes(p.kind)||!p.database||!p.manifest||!p.policy)throw new Error('Invalid pack manifest.')
 return p
}
function latestBase(root:string,week:string):string|null {
 let found:string|null=null
 const entries=opendirSync(root)
 try{for(let entry=entries.readSync();entry!==null;entry=entries.readSync()){const name=entry.name;if(name.startsWith('.'))continue;const path=join(root,name);plainPath(path);if(!lstatSync(path).isDirectory())throw new Error('Unexpected destination entry.');const p=readPack(path);if(p.kind==='base'&&p.week===week&&(!found||name>found))found=name}}finally{entries.closeSync()}
 return found===null?null:join(root,found)
}
function manifest(file:string):Database.Database {
 const db=new Database(file);db.pragma('journal_mode=DELETE');db.exec(`CREATE TABLE files(path TEXT PRIMARY KEY,size INTEGER NOT NULL,sha256 TEXT NOT NULL,category TEXT NOT NULL,source TEXT NOT NULL,original TEXT NOT NULL,stamp TEXT NOT NULL);
 CREATE TABLE omissions(path TEXT PRIMARY KEY,category TEXT NOT NULL,bytes INTEGER NOT NULL,reason TEXT NOT NULL);
 CREATE TABLE tables(name TEXT PRIMARY KEY,category TEXT NOT NULL,before_rows INTEGER NOT NULL,kept_rows INTEGER NOT NULL,reason TEXT NOT NULL);
 CREATE TABLE sources(path TEXT PRIMARY KEY,stamp TEXT NOT NULL);
 CREATE TABLE facts(name TEXT PRIMARY KEY,value TEXT NOT NULL);`);db.exec('BEGIN');return db
}
function omission(db:Database.Database,row:Omission):void{db.prepare('INSERT OR REPLACE INTO omissions VALUES(@path,@category,@bytes,@reason)').run(row)}
function policyReason(policy:UploadPolicy,category:string,size:number):string|null {return !policy[category as keyof UploadPolicy]?'policy':size>policy.thresholdMB*1_000_000?'threshold':null}
function transcriptRows(source:Database.Database):Iterable<{path:string;category:string;key:string}> {
 return (function*(){
  const agents=source.prepare('SELECT id,role FROM agents WHERE id=? OR handle=?')
  const sessions=source.prepare("SELECT id,CASE WHEN length(CAST(data AS BLOB))<=? THEN data ELSE NULL END data FROM records WHERE kind='session'")
  for(const row of sessions.iterate(MAX_JSON_BYTES) as Iterable<{id:string;data:string|null}>){
   if(row.data===null)throw new Error('A session exceeds the bounded transcript metadata size.')
   const data=JSON.parse(row.data) as Record<string,unknown>
   const identity=data.servingAgentId??data.servingAgent
   const actor=typeof identity==='string'?identity:identity&&typeof identity==='object'?String((identity as Record<string,unknown>).id??''):''
   const exact=source.prepare('SELECT id,role FROM agents WHERE id=?').get(actor) as {id:string;role:string}|undefined
   const matches=exact?[exact]:source.prepare('SELECT id,role FROM agents WHERE handle=? LIMIT 2').all(actor) as {id:string;role:string}[]
   const a=matches.length===1?matches[0]:undefined
   const extra=data.extra as Record<string,unknown>|undefined
   const discovered=extra?.discovered as Record<string,unknown>|undefined
   const path=discovered?.logPath
   if(typeof path!=='string'||!path)continue
   const category=a?.role==='secretary'?'secretaries':a?.role==='supervisor'?'supervisors':a?.role==='worker'?'workers':'unassigned'
   yield{path,category,key:`transcripts/${createHash('sha256').update(path).digest('hex')}.jsonl`}
  }
  for(const row of source.prepare('SELECT id,handle,conversation_path path FROM visitor_credentials WHERE conversation_path IS NOT NULL').iterate() as Iterable<{id:string;handle:string;path:string}>){
   const exact=source.prepare('SELECT id,role FROM agents WHERE id=?').get(row.handle) as {id:string;role:string}|undefined
   const matches=exact?[exact]:source.prepare('SELECT id,role FROM agents WHERE handle=? LIMIT 2').all(row.handle) as {id:string;role:string}[]
   const a=matches.length===1?matches[0]:undefined
   const category=a?.role==='secretary'?'secretaries':a?.role==='supervisor'?'supervisors':a?.role==='worker'?'workers':'unassigned'
   yield{path:row.path,category,key:`transcripts/${createHash('sha256').update(row.path).digest('hex')}.jsonl`}
  }
 })()
}
function addFile(db:Database.Database,base:Database.Database|null,stage:string,root:string,path:string,category:string,expected?:{bytes:number;fingerprint:string},key?:string):void{
 const rel=key??safeKey(path.slice(root.length+1).split('\\').join('/'))
 const measured=transfer(path)
 if(expected&&(expected.bytes!==measured.size||expected.fingerprint!==measured.sha256))throw new Error('Stored file changed since its inventory entry; a checked inventory is required.')
 const old=base?.prepare('SELECT size,sha256 FROM files WHERE path=?').get(rel) as {size:number;sha256:string}|undefined
 const from=old?.sha256===measured.sha256&&old.size===measured.size?'base':'change'
 if(from==='change'){
  const copied=transfer(path,join(stage,'files',safeKey(rel)))
  if(copied.sha256!==measured.sha256||copied.stamp!==measured.stamp)throw new Error('The source changed between hashing and copying.')
 }
 db.prepare('INSERT OR IGNORE INTO files VALUES(@path,@size,@sha256,@category,@source,@original,@stamp)').run({path:rel,size:measured.size,sha256:measured.sha256,category,source:from,original:path,stamp:measured.stamp})
}
/**
 * Where a destination keeps its packs. A folder and an s3 bucket build the same pack through uploadPack; only
 * these steps differ. close() is called once, whatever happened, and releases only what open() took.
 */
export interface Place{
 /** Takes this host's lock, then reads the bytes held there and the week's latest base. The stage is a new empty folder. */
 open(at:{office:string;week:string;attempt:string;work:string}):Promise<{held:number;base:{id:string;name:string;folder:string}|null;stage:string}>
 /** What a receipt names the pack called `name`. */
 id(name:string):string
 /** Makes the staged pack visible. prepared() journals the prepared receipt and is called before anything can be seen. */
 publish(stage:string,name:string,prepared:()=>void):Promise<void>
 /** Takes back whatever publish made visible, after a failure. */
 withdraw():Promise<void>
 close():void
}
function aFolder(destination:Destination,database:string):Place{
 if(destination.kind!=='folder')throw new Error('The selected destination is not a folder.')
 let root='',lock:string|undefined,published:string|undefined
 return{
  async open({office,week,attempt}){
   root=join(resolve(destination.target.path),office,destination.name)
   if(inside(dirname(resolve(database)),root)||inside(root,resolve(database)))throw new Error('The destination overlaps the source database or its files.')
   directory(root);const ownLock=join(root,'.upload-lock');mkdirSync(ownLock);lock=ownLock
   const held=heldBytes(root),base=latestBase(root,week)
   const stage=join(root,'.partial-'+attempt);directory(stage,true)
   return{held,base:base===null?null:{id:base,name:base.slice(root.length+1),folder:base},stage}
  },
  id:name=>join(root,name),
  async publish(stage,name,prepared){const pack=join(root,name);prepared();renameSync(stage,pack);published=pack;syncDirectory(root)},
  async withdraw(){if(published){const failed=published+'.failed';renameSync(published,failed);published=undefined;rmSync(failed,{recursive:true,force:true})}},
  close(){if(lock)rmSync(lock,{recursive:true,force:true})},
 }
}
/** One SQLite snapshot and one file at a time. Nothing imports the server or contacts the office. */
export async function uploadFolder(options:UploadOptions):Promise<UploadReceipt>{return uploadPack(options,'folder',destination=>aFolder(destination,options.database))}
export async function uploadPack(options:UploadOptions,kind:'folder'|'s3',make:(destination:Destination,location:ReceiptLocation)=>Place):Promise<UploadReceipt>{
 const {database,spool}=options;const location={database,spool};privateFolder(receiptFolder(location))
 const destination=destinationShape.parse(options.destination),date=options.now??new Date()
 const receipt:UploadReceipt={version:1,attempt:randomUUID(),destination:destination.name,at:clockStamp(()=>date).instant,status:'failed',kind:null,pack:null,base:null,sentBytes:0,heldBytes:null,coreBytes:null,omittedFiles:0,omittedRows:0,warning:false,error:null}
 let place:Place|undefined,stage:string|undefined,work:string|undefined,coreSpare:string|undefined,coreClasses:TableClass[]=[],optionalDatabase=false,heldBefore:number|null=null,source:Database.Database|undefined,m:Database.Database|undefined,bm:Database.Database|undefined
 try{
  if(destination.kind!==kind||!destination.enabled)throw new Error(`The selected destination is not an enabled ${kind==='folder'?'folder':'s3 bucket'}.`)
  plainPath(database);source=openRead(database);const generation=source.pragma('data_version',{simple:true})
  const identity=(source.prepare('SELECT id FROM installation WHERE only_row=1').get() as {id:string}|undefined)?.id
  if(!identity)throw new Error('The database has no installation identity.')
  const office=createHash('sha256').update(identity).digest('hex'),week=weekOf(date)
  work=join(receiptFolder(location),'.work-'+receipt.attempt);privateFolder(work)
  place=make(destination,location)
  const opened=await place.open({office,week,attempt:receipt.attempt,work}),held=opened.held,base=opened.base;stage=opened.stage
  heldBefore=held;receipt.kind=base?'change':'base';receipt.base=base?.id??null;receipt.heldBytes=held
  const original=join(work,'snapshot.sqlite');source.prepare('VACUUM INTO ?').run(original)
  const snapshot=openRead(original)
  try{
   // Settings read comes from the same read-only source, never a server door.
   const saved=readDestinations(snapshot).find(d=>d.name===destination.name)
   if(saved&&JSON.stringify(saved)!==JSON.stringify(destination))throw new Error('The saved destination settings changed.')
   if(base){const bp=readPack(base.folder);if(bp.office!==office)throw new Error('The base belongs to another office.');verifyDigest(join(base.folder,'manifest.sqlite'),bp.manifest);bm=openRead(join(base.folder,'manifest.sqlite'))}
   m=manifest(join(stage,'manifest.sqlite'))
   const corePolicy={...destination.policy,runHistory:false,changeLog:false,apiLog:false}
   const core=join(work,'core.sqlite');snapshot.prepare('VACUUM INTO ?').run(core);coreClasses=filterCopy(core,corePolicy);assertScrubbed(snapshot,core)
   receipt.coreBytes=lstatSync(core).size
   const output=join(work,'selected.sqlite');let classes:TableClass[]
   if(!destination.policy.runHistory&&!destination.policy.changeLog&&!destination.policy.apiLog){renameSync(core,output);classes=coreClasses}
   else{snapshot.prepare('VACUUM INTO ?').run(output);classes=filterCopy(output,destination.policy);assertScrubbed(snapshot,output)
    if(held+lstatSync(output).size>destination.limitBytes){rmSync(output);renameSync(core,output);classes=coreClasses.map(row=>({...row,reason:row.category==='core'?row.reason:'limit'}))}else{coreSpare=core;optionalDatabase=true}
   }
   transfer(output,join(stage,'office.db'))
   for(const row of classes)m.prepare('INSERT INTO tables VALUES(@name,@category,@before_rows,@kept_rows,@reason)').run(row)
   receipt.omittedRows=classes.reduce((n,r)=>n+r.before_rows-r.kept_rows,0)
   if(!destination.policy.runHistory)receipt.omittedRows+=Number((snapshot.prepare("SELECT count(*) n FROM records WHERE kind='session' AND json_extract(data,'$.sealedTip') IS NULL AND json_extract(data,'$.submission') IS NULL").get() as {n:number}).n)
   // Every physical entry must have a durable stored category. No upload-time guessing.
   for(const store of STORAGE_STORES){const top=join(dirname(resolve(database)),store);if(!existsSync(top)){m.prepare('INSERT INTO facts VALUES(?,?)').run(`absent:${store}`,'The physical store was absent at upload time; no files from it were sent.');continue}
    for(const entry of walk(top,store,(folder,seen)=>m!.prepare('INSERT OR REPLACE INTO sources VALUES(?,?)').run(folder,seen))){
     if(!snapshot.prepare('SELECT 1 FROM storage_files WHERE path=?').get(entry.key))throw new Error('A physical file has no inventory category; a checked inventory is required.')
    }
   }
   for(const row of snapshot.prepare('SELECT path,category,bytes,fingerprint FROM storage_files ORDER BY path').iterate() as Iterable<{path:string;category:string;bytes:number;fingerprint:string}>){
    safeKey(row.path);if(!STORAGE_STORES.some(s=>row.path.startsWith(s+'/')))throw new Error('An inventory path is outside the physical stores.')
    const path=join(dirname(resolve(database)),row.path),reason=policyReason(destination.policy,row.category,row.bytes)
    if(!existsSync(path))throw new Error('An inventoried physical file is missing unexpectedly.')
    const measured=transfer(path);if(measured.sha256!==row.fingerprint||measured.size!==row.bytes)throw new Error('A file changed since inventory.')
    m.prepare('INSERT OR REPLACE INTO sources VALUES(?,?)').run(path,measured.stamp)
    if(reason){omission(m,{path:row.path,category:row.category,bytes:row.bytes,reason});continue}
    // Every stored file is optional, so one that carries a usable key or token hash is left out and named, never cleaned.
    if(carriesAHeldHash(snapshot,path)){omission(m,{path:row.path,category:row.category,bytes:row.bytes,reason:'unsafe-source'});continue}
    addFile(m,bm??null,stage,dirname(resolve(database)),path,row.category,row)
   }
   for(const row of transcriptRows(snapshot)){
    const reason=policyReason(destination.policy,row.category,0)
    if(reason){omission(m,{path:row.key,category:row.category,bytes:existsSync(row.path)?lstatSync(row.path).size:0,reason});continue}
    if(!existsSync(row.path)){omission(m,{path:row.key,category:row.category,bytes:0,reason:'unavailable-transcript'});continue}
    const measured=transfer(row.path),tooLarge=policyReason(destination.policy,row.category,measured.size)
    m.prepare('INSERT OR REPLACE INTO sources VALUES(?,?)').run(row.path,measured.stamp)
    if(tooLarge){omission(m,{path:row.key,category:row.category,bytes:measured.size,reason:tooLarge});continue}
    if(m.prepare('SELECT 1 FROM files WHERE path=?').get(row.key))continue
    if(carriesAHeldHash(snapshot,row.path)){omission(m,{path:row.key,category:row.category,bytes:measured.size,reason:'unsafe-source'});continue}
    addFile(m,bm??null,stage,'',row.path,row.category,undefined,row.key)
   }
  }finally{snapshot.close();rmSync(original,{force:true})}
  // Exact final size, including manifests and metadata. Remove only staged optional copies.
  const output=join(stage,'office.db'),dbMeasured=transfer(output),dbDigest={size:dbMeasured.size,sha256:dbMeasured.sha256}
  const meta:Pack={version:1,office,kind:receipt.kind!,week,at:receipt.at,base:base?.name??null,database:dbDigest,manifest:{size:0,sha256:''},policy:destination.policy,coreBytes:receipt.coreBytes!}
  if(m!.inTransaction)m!.exec('COMMIT')
  for(;;){
   m!.exec('VACUUM');m!.close();m=undefined
   {const measured=transfer(join(stage,'manifest.sqlite'));meta.manifest={size:measured.size,sha256:measured.sha256}}
   const predicted=held+heldBytes(stage)+Buffer.byteLength(JSON.stringify(meta)+'\n')
   m=new Database(join(stage,'manifest.sqlite'))
   if(predicted<=destination.limitBytes)break
   if(optionalDatabase&&coreSpare){
    rmSync(output);transfer(coreSpare,output);optionalDatabase=false
    m.exec('BEGIN;DELETE FROM tables');for(const row of coreClasses)m.prepare('INSERT INTO tables VALUES(@name,@category,@before_rows,@kept_rows,@reason)').run({...row,reason:row.category==='core'?row.reason:'limit'});m.exec('COMMIT')
    receipt.omittedRows=coreClasses.reduce((n,r)=>n+r.before_rows-r.kept_rows,0);{const measured=transfer(output);meta.database={size:measured.size,sha256:measured.sha256}};continue
   }
   // At or above the limit all optional files stop, including files inherited from the base.
   const row=m.prepare('SELECT * FROM files ORDER BY size DESC,path LIMIT 1').get() as FileRow|undefined
   if(!row)break
   if(row.source==='change')rmSync(join(stage,'files',safeKey(row.path)))
   m.prepare('DELETE FROM files WHERE path=?').run(row.path);omission(m,{path:row.path,category:row.category,bytes:row.size,reason:'limit'})
  }
  receipt.omittedFiles=Number((m!.prepare('SELECT count(*) n FROM omissions').get() as {n:number}).n)
  for(const row of m!.prepare('SELECT path,stamp FROM sources').iterate() as Iterable<{path:string;stamp:string}>){if(stamp(lstatSync(row.path))!==row.stamp)throw new Error('A source changed before publication.')}
  if(source.pragma('data_version',{simple:true})!==generation)throw new Error('The database changed before publication.')
  m!.exec('VACUUM');m!.close();m=undefined;{const measured=transfer(join(stage,'manifest.sqlite'));meta.manifest={size:measured.size,sha256:measured.sha256}}
  durableJSON(join(stage,'pack.json'),meta);syncDirectory(stage)
  const name=fileNameStamp(date)+'-'+receipt.attempt,staged=stage,at=place
  receipt.sentBytes=heldBytes(stage);receipt.heldBytes=held+receipt.sentBytes;receipt.warning=receipt.heldBytes>=destinationWarningBytes(destination.limitBytes)
  // A prepared receipt is durable before publication; it never claims success after an interrupted publication.
  await place.publish(stage,name,()=>{
   receipt.pack=at.id(name);receipt.status='prepared'
   const omissions=openRead(join(staged,'manifest.sqlite'));try{recordAttempt(location,receipt,omissionRows(omissions))}finally{omissions.close()}
  })
  receipt.status='uploaded';recordAttempt(location,receipt)
  return receipt
 }catch(error){
  let failure=error
  try{await place?.withdraw()}catch(also){failure=new Error(`${error instanceof Error?error.message:'Upload failed.'} ${also instanceof Error?also.message:'Taking back the attempt also failed.'}`)}
  receipt.status='failed';receipt.pack=null;receipt.sentBytes=0;receipt.heldBytes=heldBefore;receipt.error=failure instanceof Error?failure.message:'Upload failed.';recordAttempt(location,receipt);throw failure
 }
 finally{m?.close();bm?.close();source?.close();if(stage)rmSync(stage,{recursive:true,force:true});if(work)rmSync(work,{recursive:true,force:true});place?.close()}
}
export function verifyDigest(file:string,want:{size:number;sha256:string}):void{const actual=transfer(file);if(actual.size!==want.size||actual.sha256!==want.sha256)throw new Error('A pack file hash differs from its manifest.')}
/** `named` is what storage-restore.json says the packs were; a folder restore names its own paths. */
export function restoreFolder({base,change,into,named}:{base:string;change?:string;into:string;named?:{base:string;chosen:string}}):{files:number}{
 const bp=readPack(base),chosen=change??base,cp=readPack(chosen)
 if(bp.kind!=='base'||(change&&(cp.kind!=='change'||cp.office!==bp.office||cp.base!==base.split('/').at(-1))))throw new Error('The change does not name this base.')
 verifyDigest(join(base,'manifest.sqlite'),bp.manifest);verifyDigest(join(base,'office.db'),bp.database)
 verifyDigest(join(chosen,'manifest.sqlite'),cp.manifest);verifyDigest(join(chosen,'office.db'),cp.database)
 if(existsSync(into))throw new Error('The restore destination already exists. Nothing was restored.')
 directory(dirname(resolve(into)));const partial=join(dirname(resolve(into)),'.restore-'+randomUUID());directory(partial,true)
 const m=openRead(join(chosen,'manifest.sqlite'));let files=0
 try{
  for(const row of m.prepare('SELECT * FROM files ORDER BY path').iterate() as Iterable<FileRow>){
   safeKey(row.path);if(!STORAGE_STORES.some(s=>row.path.startsWith(s+'/'))&&!row.path.startsWith('transcripts/'))throw new Error('Unsafe restore store.')
   const from=row.source==='base'?base:chosen;if(row.source!=='base'&&row.source!=='change')throw new Error('Unknown file source.')
   const actual=transfer(join(from,'files',row.path),join(partial,row.path));if(actual.size!==row.size||actual.sha256!==row.sha256)throw new Error('Restored file hash differs from manifest.');files++
  }
  transfer(join(chosen,'office.db'),join(partial,'office.db'))
  const db=openRead(join(partial,'office.db'));try{if(db.pragma('integrity_check',{simple:true})!=='ok'||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Restored SQLite integrity failed.')
   for(const row of m.prepare('SELECT name,kept_rows FROM tables').iterate() as Iterable<{name:string;kept_rows:number}>){const name='"'+row.name.replaceAll('"','""')+'"';if(Number((db.prepare(`SELECT count(*) n FROM ${name}`).get() as {n:number}).n)!==row.kept_rows)throw new Error('Restored category table count differs.')}
  }finally{db.close()}
  transfer(join(chosen,'manifest.sqlite'),join(partial,'storage-omissions.sqlite'))
  durableJSON(join(partial,'storage-restore.json'),{version:1,base:named?.base??resolve(base),chosen:named?.chosen??resolve(chosen),manifest:cp.manifest})
  renameSync(partial,into);syncDirectory(dirname(resolve(into)));return{files}
 }finally{m.close();if(existsSync(partial))rmSync(partial,{recursive:true,force:true})}
}
