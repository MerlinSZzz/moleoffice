// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { constants, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, realpathSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { theSandboxesFolderNow } from '../sandbox-folder.mjs'
export interface UploadReceipt {
 version:1; attempt:string; destination:string; at:string; status:'uploaded'|'failed'|'prepared'; kind:'base'|'change'|null
 pack:string|null; base:string|null; sentBytes:number; heldBytes:number|null; coreBytes:number|null
 omittedFiles:number; omittedRows:number; warning:boolean; error:string|null
}
export interface ReceiptLocation {database:string;spool?:string}
export function receiptFolder({database,spool}:ReceiptLocation):string {
 const root=spool??join(theSandboxesFolderNow(),'.storage-uploads')
 return join(root,createHash('sha256').update(resolve(database)).digest('hex'))
}
export function privateFolder(path:string):void {
 let ancestor=resolve(path);while(!existsSync(ancestor))ancestor=dirname(ancestor);if(realpathSync(ancestor)!==ancestor)throw new Error('The upload spool path contains a symbolic link.')
 mkdirSync(path,{recursive:true,mode:0o700})
 const s=lstatSync(path)
 if(realpathSync(path)!==resolve(path)||!s.isDirectory()||(s.mode&0o777)!==0o700||(process.getuid!==undefined&&s.uid!==process.getuid()))throw new Error('The upload spool must be an unlinked private directory (0700).')
}
function privateFile(file:string):void {const s=lstatSync(file);if(realpathSync(file)!==resolve(file)||!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||(process.getuid!==undefined&&s.uid!==process.getuid()))throw new Error('The upload receipt must be an unlinked private file (0600).')}
const validName=(name:string)=>{if(!/^[a-z][a-z0-9-]{0,47}$/.test(name))throw new Error('Invalid receipt destination.');return name}
function journal(location:ReceiptLocation,writable=false):Database.Database {
 const folder=receiptFolder(location),file=join(folder,'journal.sqlite')
 if(writable)privateFolder(folder)
 else if(!existsSync(file))throw new Error('No upload journal exists.')
 if(!existsSync(file)){const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd)}
 privateFile(file)
 const db=new Database(file,{readonly:!writable,fileMustExist:true})
 if(writable){db.pragma('journal_mode=DELETE');db.exec('CREATE TABLE IF NOT EXISTS attempts(attempt TEXT PRIMARY KEY,destination TEXT NOT NULL,receipt TEXT NOT NULL,ingested INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS attempts_destination ON attempts(destination); CREATE INDEX IF NOT EXISTS attempts_pending ON attempts(ingested); CREATE TABLE IF NOT EXISTS omissions(attempt TEXT NOT NULL,path TEXT NOT NULL,category TEXT NOT NULL,bytes INTEGER NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(attempt,path));')}
 return db
}
export function recordAttempt(location:ReceiptLocation,receipt:UploadReceipt,omissions?:Iterable<{path:string;category:string;bytes:number;reason:string}>):void{
 const db=journal(location,true)
 try{db.transaction(()=>{db.prepare('INSERT INTO attempts(attempt,destination,receipt) VALUES(?,?,?) ON CONFLICT(attempt) DO UPDATE SET receipt=excluded.receipt').run(receipt.attempt,receipt.destination,JSON.stringify(receipt));if(omissions){const add=db.prepare('INSERT OR REPLACE INTO omissions VALUES(@attempt,@path,@category,@bytes,@reason)');for(const row of omissions)add.run({...row,attempt:receipt.attempt})}})()}finally{db.close()}
 const folder=receiptFolder(location),last=join(folder,validName(receipt.destination)+'.json'),temp=join(folder,'.'+randomUUID()+'.json')
 if(existsSync(last))privateFile(last)
 writeFileSync(temp,JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});renameSync(temp,last)
}
export function readReceipt(location:ReceiptLocation&{destination:string}):UploadReceipt|null {
 const file=join(receiptFolder(location),validName(location.destination)+'.json')
 if(!existsSync(file))return null
 privateFile(file);if(lstatSync(file).size>256*1024)throw new Error('The upload receipt is too large.')
 const row=JSON.parse(readFileSync(file,'utf8')) as UploadReceipt
 if(row.version!==1||row.destination!==location.destination||!['uploaded','failed','prepared'].includes(row.status)||typeof row.attempt!=='string')throw new Error('The upload receipt is invalid.')
 return row
}
export function* readJournal(location:ReceiptLocation&{destination?:string;pendingOnly?:boolean}):Generator<UploadReceipt>{
 if(!existsSync(join(receiptFolder(location),'journal.sqlite')))return
 const db=journal(location)
 try{let after=0;for(;;){const row=db.prepare(`SELECT rowid,CASE WHEN length(CAST(receipt AS BLOB))<=262144 THEN receipt ELSE NULL END receipt FROM attempts WHERE rowid>? AND (? IS NULL OR destination=?) ${location.pendingOnly?'AND ingested=0':''} ORDER BY rowid LIMIT 1`).get(after,location.destination??null,location.destination??null) as {rowid:number;receipt:string|null}|undefined;if(!row)break;after=row.rowid;if(row.receipt===null)throw new Error('An upload journal entry is too large.');yield JSON.parse(row.receipt) as UploadReceipt}}finally{db.close()}
}
export function markReceiptIngested(location:ReceiptLocation,attempt:string):void{const db=journal(location,true);try{db.prepare('UPDATE attempts SET ingested=1 WHERE attempt=?').run(attempt)}finally{db.close()}}
