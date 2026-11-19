// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The s3-compatible destination (S3-CRITERIA.md). The pack is built by uploadPack in folder.ts exactly as for a
 * folder; this file is only the place it is kept: a signed request over node:http or node:https, path-style.
 * Nothing imports the server or contacts the office. Credentials are read from the host secrets file and go only
 * into the signature and the session token header; no error repeats a response body or a key.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { closeSync, constants, createReadStream, existsSync, fsyncSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs'
import { request as plainRequest, type IncomingMessage } from 'node:http'
import { request as secureRequest } from 'node:https'
import { dirname, join } from 'node:path'
import { privateFolder, receiptFolder, type ReceiptLocation, type UploadReceipt } from '../../src/config/storage/receipts.ts'
import { readCloudCredentials, type CloudCredentials } from '../../src/config/storage/destination-secrets.ts'
import { destinationShape, type Destination } from '../../src/shared/storage/destinations.ts'
import { checkPack, restoreFolder, uploadPack, type Pack, type Place } from './folder.ts'
import { directory, safeKey, transfer, walk, MAX_METADATA_BYTES } from './io.ts'

type S3=Extract<Destination,{kind:'s3'}>
/** The largest object one PUT may send. There is no multipart upload. */
const MOST_BYTES=5*1024**3
const IDLE_MS=60_000
const LISTING_BYTES=8*1024*1024
const EMPTY=createHash('sha256').update('').digest('hex')
const enc=(s:string):string=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const hmac=(key:string|Buffer,s:string):Buffer=>createHmac('sha256',key).update(s).digest()

/** `most` is the most bytes the answer may hold; `tooLong` is what is said when it holds more. */
interface Ask{method:'GET'|'PUT'|'DELETE';what:string;key:string;query?:[string,string][];send?:{path:string;size:number;sha256:string};into?:string;most:number;tooLong?:string}
/** One bucket, signed with AWS Signature Version 4 on the real clock. */
function aBucket(target:S3['target'],login:CloudCredentials){
 const url=new URL(target.endpoint),request=url.protocol==='https:'?secureRequest:plainRequest
 function ask(r:Ask):Promise<Buffer>{
  const path=`/${enc(target.bucket)}${r.key===''?'':`/${r.key.split('/').map(enc).join('/')}`}`
  const query=(r.query??[]).map(([k,v])=>[enc(k),enc(v)] as const).sort(([a,x],[b,y])=>a<b?-1:a>b?1:x<y?-1:x>y?1:0).map(([k,v])=>`${k}=${v}`).join('&')
  // UTC BY PROTOCOL: AWS Signature Version 4 signs x-amz-date and the scope's day in UTC, and a bucket refuses a local time as a skewed request.
  const at=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),day=at.slice(0,8),payload=r.send?.sha256??EMPTY
  const headers:Record<string,string>={host:url.host,'x-amz-content-sha256':payload,'x-amz-date':at}
  if(login.sessionToken!==undefined)headers['x-amz-security-token']=login.sessionToken
  const names=Object.keys(headers).sort(),scope=`${day}/${target.region}/s3/aws4_request`
  const canonical=[r.method,path,query,names.map(n=>`${n}:${headers[n]!.trim().replace(/\s+/g,' ')}\n`).join(''),names.join(';'),payload].join('\n')
  const key=hmac(hmac(hmac(hmac(`AWS4${login.secretAccessKey}`,day),target.region),'s3'),'aws4_request')
  const signature=createHmac('sha256',key).update(['AWS4-HMAC-SHA256',at,scope,createHash('sha256').update(canonical).digest('hex')].join('\n')).digest('hex')
  headers['authorization']=`AWS4-HMAC-SHA256 Credential=${login.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
  if(r.send)headers['content-length']=String(r.send.size)
  return new Promise((done,fail)=>{
   let settled=false,file:number|undefined,got=0
   const chunks:Buffer[]=[]
   const end=(error:Error|null,body?:Buffer):void=>{
    if(settled)return;settled=true
    if(file!==undefined){try{if(error===null)fsyncSync(file)}finally{closeSync(file)}}
    if(error===null)done(body!);else{if(r.into!==undefined)rmSync(r.into,{force:true});fail(error)}
   }
   const req=request({protocol:url.protocol,hostname:url.hostname.replace(/^\[|\]$/g,''),port:url.port,method:r.method,path:query===''?path:`${path}?${query}`,headers},(res:IncomingMessage)=>{
    const status=res.statusCode??0,ok=status>=200&&status<300
    if(ok&&r.into!==undefined)file=openSync(r.into,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    res.on('data',(chunk:Buffer)=>{
     got+=chunk.length
     if(!ok){if(got<=64*1024)chunks.push(chunk);return}
     if(got>r.most){res.destroy();end(new Error(r.tooLong??`${r.what} was answered with more than ${String(r.most)} bytes.`));return}
     if(file===undefined)chunks.push(chunk);else{let at=0;while(at<chunk.length)at+=writeSync(file,chunk,at,chunk.length-at)}
    })
    res.on('end',()=>{
     if(ok){end(null,Buffer.concat(chunks));return}
     const code=/<Code>([A-Za-z0-9]{1,64})<\/Code>/.exec(Buffer.concat(chunks).toString('utf8'))?.[1]
     end(new Error(`${r.what} was answered ${String(status)}${code===undefined?'':` (${code})`} by the bucket.`))
    })
    res.on('error',()=>end(new Error(`${r.what} was cut off by the bucket.`)))
    res.on('close',()=>end(new Error(`${r.what} was cut off by the bucket.`)))
   })
   req.setTimeout(IDLE_MS,()=>req.destroy(new Error(`${r.what} sent and received nothing for 60 seconds.`)))
   req.on('error',error=>end(new Error(error.message.includes('60 seconds')?error.message:`${r.what} could not reach the bucket.`)))
   if(r.send===undefined){req.end();return}
   const body=createReadStream(r.send.path);let sent=0
   body.on('data',(chunk)=>{sent+=chunk.length})
   body.on('error',()=>{req.destroy(new Error(`${r.what} could not read its staged file.`))})
   body.on('end',()=>{if(sent!==r.send!.size)req.destroy(new Error(`${r.what} sent a staged file that changed size.`))})
   body.pipe(req)
  })
 }
 const xml=(s:string):string=>{
  if(/&(?!(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(s))throw new Error('The bucket\'s listing could not be read.')
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,(_,e:string)=>e==='amp'?'&':e==='lt'?'<':e==='gt'?'>':e==='quot'?'"':e==='apos'?"'":String.fromCodePoint(e.startsWith('#x')?parseInt(e.slice(2),16):Number(e.slice(1))))
 }
 return{
  /** Every object whose key starts with `prefix`, following every continuation page. */
  async list(prefix:string):Promise<{key:string;size:number}[]>{
   const all:{key:string;size:number}[]=[];let token:string|undefined
   for(;;){
    const query:[string,string][]=[['list-type','2'],['prefix',prefix]];if(token!==undefined)query.push(['continuation-token',token])
    const page=(await ask({method:'GET',what:'A listing',key:'',query,most:LISTING_BYTES})).toString('utf8')
    if(!page.includes('<ListBucketResult'))throw new Error('The bucket\'s listing could not be read.')
    for(const [,one] of page.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
     const key=/<Key>([\s\S]*?)<\/Key>/.exec(one!)?.[1],size=Number(/<Size>(\d+)<\/Size>/.exec(one!)?.[1])
     if(key===undefined||!Number.isSafeInteger(size))throw new Error('The bucket\'s listing could not be read.')
     const decoded=xml(key);if(!decoded.startsWith(prefix))throw new Error('The bucket listed a key outside the prefix it was asked for.')
     all.push({key:decoded,size})
    }
    if(!/<IsTruncated>true<\/IsTruncated>/.test(page))return all
    const next=/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(page)?.[1]
    if(next===undefined||next==='')throw new Error('The bucket said its listing goes on but gave no continuation.')
    token=xml(next)
   }
  },
  async get(key:string,most:number,what='A download'):Promise<Buffer>{return ask({method:'GET',what,key,most})},
  async download(key:string,into:string,most:number):Promise<void>{directory(dirname(into));await ask({method:'GET',what:'A download of a pack file',key,into,most,tooLong:'A pack file in the bucket is longer than declared, so its size and hash cannot match its manifest.'})},
  async put(key:string,path:string):Promise<void>{
   const staged=transfer(path);if(staged.size>MOST_BYTES)throw new Error('A staged file is over 5 GiB, which one upload cannot send.')
   await ask({method:'PUT',what:'An upload',key,send:{path,size:staged.size,sha256:staged.sha256},most:64*1024})
  },
  async remove(key:string):Promise<void>{await ask({method:'DELETE',what:'A deletion',key,most:64*1024})},
 }
}
/** The destination's place in the bucket: `<prefix><office>/<name>/`, the prefix exactly as saved. */
const placeOf=(destination:S3,office:string):string=>`${destination.target.prefix}${office}/${destination.name}/`

function aBucketPlace(destination:Destination,location:ReceiptLocation):Place{
 if(destination.kind!=='s3')throw new Error('The selected destination is not an s3 bucket.')
 let at='',lock:string|undefined,attempted:string|undefined,bucket:ReturnType<typeof aBucket>|undefined
 const sent:string[]=[]
 return{
  async open({office,week,attempt,work}){
   bucket=aBucket(destination.target,readCloudCredentials(destination.name))
   const ownLock=join(receiptFolder(location),'.upload-lock-'+destination.name);mkdirSync(ownLock,{mode:0o700});lock=ownLock
   at=placeOf(destination,office)
   const listed=await bucket.list(at),held=listed.reduce((n,one)=>n+one.size,0)
   const packs=listed.map(one=>/^([^/.][^/]*)\/pack\.json$/.exec(one.key.slice(at.length))?.[1]).filter((name):name is string=>name!==undefined).sort().reverse()
   let base:{id:string;name:string;folder:string}|null=null
   for(const name of packs){
    const said=await bucket.get(`${at}${name}/pack.json`,MAX_METADATA_BYTES,'A download of a pack.json')
    let pack:Pack
    try{pack=checkPack(JSON.parse(said.toString('utf8')))}catch{throw new Error('A pack.json in the bucket could not be read.')}
    if(pack.kind!=='base'||pack.week!==week)continue
    // Downloaded into the private work folder; uploadPack checks it against what this pack.json declares.
    const folder=join(work,'base',safeKey(name));directory(folder,true)
    const fd=openSync(join(folder,'pack.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    try{let n=0;while(n<said.length)n+=writeSync(fd,said,n,said.length-n);fsyncSync(fd)}finally{closeSync(fd)}
    await bucket.download(`${at}${name}/manifest.sqlite`,join(folder,'manifest.sqlite'),pack.manifest.size)
    base={id:at+name,name,folder};break
   }
   const stage=join(work,'pack-'+attempt);directory(stage,true)
   return{held,base,stage}
  },
  id:name=>at+name,
  async publish(stage,name,prepared){
   const id=at+name,files=[...walk(stage)].map(one=>({key:`${id}/${one.key}`,path:one.path,size:one.size})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
   const last=files.find(one=>one.key===`${id}/pack.json`)
   if(last===undefined)throw new Error('The staged pack has no pack.json.')
   if(files.some(one=>one.size>MOST_BYTES))throw new Error('A staged file is over 5 GiB, which one upload cannot send.')
   prepared()
   attempted=id
   for(const one of files)if(one!==last){sent.push(one.key);await bucket!.put(one.key,one.path)}
   await bucket!.put(last.key,last.path)
  },
  /** pack.json first, so the pack stops existing before its files go. */
  async withdraw(){
   if(attempted===undefined)return
   const failed:string[]=[]
   for(const key of [`${attempted}/pack.json`,...sent]){try{await bucket!.remove(key)}catch(error){failed.push(error instanceof Error?error.message:'A deletion failed.')}}
   attempted=undefined
   if(failed.length>0)throw new Error(`Taking back the attempt's objects also failed for ${String(failed.length)} of them (${failed[0]!}), so they are still in the bucket without a pack.json.`)
  },
  close(){if(lock)rmSync(lock,{recursive:true,force:true})},
 }
}

export async function uploadS3(options:{database:string;destination:Destination;now?:Date;spool?:string}):Promise<UploadReceipt>{return uploadPack(options,'s3',aBucketPlace)}

/**
 * Downloads the base and the chosen change the receipts name into the private work folder, then checks and restores
 * them exactly as a folder restore does.
 */
export async function restoreS3(options:{database:string;destination:Destination;base:string;change?:string;into:string;spool?:string}):Promise<{files:number}>{
 const destination=destinationShape.parse(options.destination)
 if(destination.kind!=='s3')throw new Error('The selected destination is not an s3 bucket.')
 const prefix=destination.target.prefix,inPlace=(key:string):string|null=>{
  if(!key.startsWith(prefix))return null
  const rest=/^([0-9a-f]{64})\/([^/]+)\/([^/.][^/]*)$/.exec(key.slice(prefix.length))
  return rest===null||rest[2]!==destination.name?null:rest[1]!
 }
 const office=inPlace(options.base)
 if(office===null||(options.change!==undefined&&inPlace(options.change)!==office))throw new Error('A pack key is not a pack of this destination. Use the keys its receipts name.')
 if(existsSync(options.into))throw new Error('The restore destination already exists. Nothing was restored.')
 const bucket=aBucket(destination.target,readCloudCredentials(destination.name))
 const location={database:options.database,spool:options.spool};privateFolder(receiptFolder(location))
 const work=join(receiptFolder(location),'.work-'+randomUUID());privateFolder(work)
 try{
  const local=async(key:string):Promise<string>=>{
   const folder=join(work,'packs',safeKey(key.slice(key.lastIndexOf('/')+1)));directory(folder,true)
   const listed=await bucket.list(`${key}/`)
   if(listed.length===0)throw new Error('The bucket holds no pack under that key.')
   for(const one of listed)await bucket.download(one.key,join(folder,safeKey(one.key.slice(key.length+1))),one.size)
   return folder
  }
  const base=await local(options.base),change=options.change===undefined?undefined:await local(options.change)
  return restoreFolder({base,change,into:options.into,named:{base:options.base,chosen:options.change??options.base}})
 }finally{rmSync(work,{recursive:true,force:true})}
}
