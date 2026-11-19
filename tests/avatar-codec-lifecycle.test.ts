// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Actual codec children remain within the upgrade's ordinary topology and die with their owner. */
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { closeSync, openSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { currentProcessRecord } from '../tools/stable/stable-bootstrap-processes.mjs'
import { bootstrapProcessIdentity } from '../tools/stable/stable-bootstrap-support.mjs'
import { observeUpgradeTopology, servingUpgradeTopology } from '../tools/stable/stable-upgrade-processes.mjs'
import { commandThatWatchesItsOwnerFromInside } from './the-owner-watching-gate.ts'
import { avatarPng } from './avatar-upload-fixtures.ts'

const root=resolve(import.meta.dirname,'..')
const kept:{folder:string;supervisor:ChildProcess;server?:number;child?:number}[]=[]
async function until(check:()=>boolean):Promise<void>{const end=Date.now()+10_000;while(!check()){if(Date.now()>end)throw new Error('The recorded codec fixture did not reach its next state.');await delay(20)}}
const gone=(pid:number):boolean=>{try{return ['Z','X'].includes(bootstrapProcessIdentity(pid).state ?? '')}catch(error:any){if(['ENOENT','ESRCH'].includes(error.code))return true;throw error}}

async function avatarCodecOffice(){
 const folder=mkdtempSync(join(tmpdir(),'avatar-lifecycle-'))
 for(const dir of ['tools','src/server/lib','node_modules/sharp'])mkdirSync(join(folder,dir),{recursive:true})
 writeFileSync(join(folder,'package.json'),JSON.stringify({type:'module'}))
 symlinkSync(createRequire(import.meta.url).resolve('tsx/esm'),join(folder,'tsx-loader.mjs'))
 copyFileSync(join(root,'src/server/lib/avatar-compression.ts'),join(folder,'src/server/lib/avatar-compression.ts'))
 writeFileSync(join(folder,'src/server/lib/os-probe.ts'),`export { osProbe } from ${JSON.stringify(join(root,'src/server/lib/os-probe.ts'))}`)
 writeFileSync(join(folder,'input.png'),avatarPng(41,256,256))
 const sharp=createRequire(import.meta.url).resolve('sharp')
 writeFileSync(join(folder,'node_modules/sharp/package.json'),JSON.stringify({name:'sharp',main:'index.cjs'}))
 writeFileSync(join(folder,'node_modules/sharp/index.cjs'),`const sharp=require(${JSON.stringify(sharp)}),fs=require('node:fs');function wrapped(...args){const image=sharp(...args),read=image.metadata.bind(image);image.metadata=async()=>{fs.writeFileSync(${JSON.stringify(join(folder,'codec-ready.json'))},JSON.stringify({pid:process.pid,parent:process.ppid}));while(!fs.existsSync(${JSON.stringify(join(folder,'release'))}))await new Promise(r=>setTimeout(r,20));return read()};return image}Object.assign(wrapped,sharp);module.exports=wrapped`)
 writeFileSync(join(folder,'tools/serve-dev.mjs'),`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const server=spawn(process.execPath,['--import',${JSON.stringify(createRequire(import.meta.url).resolve('tsx/esm'))},'src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:process.env});writeFileSync('server.json',JSON.stringify({pid:server.pid}));server.on('exit',()=>process.exit());`)
 writeFileSync(join(folder,'src/server/index.ts'),`import ${JSON.stringify(join(root,'src/server/lib/resources.ts'))};import{readFileSync,writeFileSync}from'node:fs';import{compressAvatar}from'./lib/avatar-compression.ts';const owner=process.ppid;function stopWithFixtureOwner(){if(process.ppid!==owner)process.exit(1)}setInterval(stopWithFixtureOwner,50).unref();const got=compressAvatar(readFileSync('input.png'),'image/png');writeFileSync('completed',String(got.bytes.length));setInterval(()=>{},1000);`)
 const launch=commandThatWatchesItsOwnerFromInside(['tools/serve-dev.mjs','--built','--prepared'])
 const log=openSync(join(folder,'fixture.log'),'a')
 const supervisor=spawn(launch.command,launch.args,{cwd:folder,detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,MOLE_OFFICE_DB:join(folder,'fixture.db'),TSX_TSCONFIG_PATH:join(root,'tsconfig.json')}})
 closeSync(log)
 if(!supervisor.pid)throw new Error('The recorded supervisor did not start.')
 const held={folder,supervisor,server:undefined as number|undefined,child:undefined as number|undefined};kept.push(held)
 try { await until(()=>existsSync(join(folder,'server.json'))&&existsSync(join(folder,'codec-ready.json'))) }
 catch(error) { throw new Error(`${String(error)}\n${readFileSync(join(folder,'fixture.log'),'utf8')}`) }
 held.server=JSON.parse(readFileSync(join(folder,'server.json'),'utf8')).pid
 held.child=JSON.parse(readFileSync(join(folder,'codec-ready.json'),'utf8')).pid
 const gate=currentProcessRecord(supervisor.pid),server=currentProcessRecord(held.server!)
 const group={pgid:gate.pgid,startTime:gate.startTime}
 const c={stableCheckout:folder,database:join(folder,'fixture.db'),servicePort:29895,serviceGroups:[gate,server].map(row=>({pgid:row.pgid,startTime:row.startTime,cwd:folder,database:join(folder,'fixture.db'),port:29895}))}
 return{...held,group,c,runtime:{process:{pid:held.server},supervisor:{pid:supervisor.pid},worker:{started:false}}}
}
afterEach(async()=>{
 for(const held of kept.splice(0)){
  writeFileSync(join(held.folder,'release'),'go')
  for(const pid of [held.server,held.supervisor.pid])if(pid&&!gone(pid)){const record=currentProcessRecord(pid);if(record.pgid===pid)process.kill(-pid,'SIGTERM')}
  if(held.child)await until(()=>gone(held.child!))
  await until(()=>gone(held.supervisor.pid!))
  rmSync(held.folder,{recursive:true,force:true})
 }
})
describe('the codec child belongs to the server',()=>{
 it('passes both real upgrade topology readers while running and leaves no child after the upload',async()=>{
  const f=await avatarCodecOffice()
  expect(currentProcessRecord(f.child!).pgid).toBe(currentProcessRecord(f.server!).pgid)
  expect(()=>observeUpgradeTopology(f.runtime,f.group,f.c)).not.toThrow()
  expect(()=>servingUpgradeTopology([f.server!],f.c)).not.toThrow()
  writeFileSync(join(f.folder,'release'),'go')
  await until(()=>existsSync(join(f.folder,'completed')))
  await until(()=>gone(f.child!))
 },60_000)
 it('ends the native child when its server is killed even without a graceful cleanup',async()=>{
  const f=await avatarCodecOffice()
  process.kill(f.server!,'SIGKILL')
  await until(()=>gone(f.child!))
  expect(gone(f.child!)).toBe(true)
 },60_000)
})
