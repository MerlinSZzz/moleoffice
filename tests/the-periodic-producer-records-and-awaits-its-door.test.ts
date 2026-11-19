// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real producer and door; the unreachable transport is an explicitly synthetic fixture. No listening server. */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { runPeriodicSuiteOnce } from '../tools/periodic-main-suite.mjs'
import type { OsProbe } from '../src/server/lib/resources.ts'

let root: string
let office: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let resources: typeof import('../src/server/lib/resources.ts')
let session: string
let options: Parameters<typeof runPeriodicSuiteOnce>[0]
let registered: number[]
let expectedGroup: number

function git(...args: string[]) {
  const answer = spawnSync('git', args, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } })
  if (answer.status !== 0) throw new Error(answer.stderr)
  return answer.stdout.trim()
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'periodic-door-fixture-'))
  const repository = join(root, 'main')
  mkdirSync(repository)
  writeFileSync(join(repository, 'source.txt'), 'Made-up source\n')
  git('init', '-q', '-b', 'main', repository)
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up source')
  const transport = join(root, 'transport')
  writeFileSync(transport, `#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const data=JSON.parse(readFileSync(args[args.indexOf('-i')+1], 'utf8'));
writeFileSync(data.script, readFileSync(0, 'utf8'));
writeFileSync(data.started, JSON.stringify({pid:process.pid,synthetic:true}));
await new Promise(resolve=>setTimeout(resolve, 250));
writeFileSync(data.ended, 'Synthetic transport completed\\n');
console.error('made-up unreachable cloud transport');
process.exitCode=255;
`)
  chmodSync(transport, 0o755)
  const config = join(root, 'fixture-config')
  writeFileSync(config, JSON.stringify({ started: join(root, 'started'), ended: join(root, 'ended'), script: join(root, 'script') }))
  const runner = join(root, 'runner.env')
  writeFileSync(runner, `RUNNER_HOST=fixture.invalid\nRUNNER_USER=fixture\nRUNNER_KEY=${config}\nRUNNER_WORKERS=1\n`, {mode:0o600})
  office = await freshDb()
  server = await apiApp()
  resources = await import('../src/server/lib/resources.ts')
  const original = resources.LINUX_PROBE
  // The injected office has a synthetic group; producer and door identities come from the real OS.
  const probe: OsProbe = new Proxy(original, {get(target,key){
    if(key==='ownProcessGroup')return()=>999
    const value=Reflect.get(target,key)
    return typeof value==='function'?value.bind(target):value
  }})
  resources.useOsProbe(probe)
  session = office.api.createRecord({workspaceId:'default',kind:'session',title:'Fixture real-door producer',data:{state:'running',runtime:'mole-office'},actor:office.api.HUMAN}).id
  const processResource = resources.registerResource({workspaceId:'default',sessionRecordId:session,type:'process',key:String(process.pid),actor:office.api.HUMAN}).id
  registered=[]
  expectedGroup=original.processById(process.pid)!.pgid
  options={repository,workdir:join(root,'results'),processResource,timeoutSeconds:5,env:{PATH:process.env.PATH,HOME:root,[THE_TEST_MARK]:String(process.pid),MOLE_OFFICE_SESSION:session,MOLE_OFFICE_CLOUD_RUNNER_FILE:runner,MOLE_OFFICE_CLOUD_TRANSPORT:transport}}
})

afterEach(async () => {
  // A lifecycle mutation can return early. Await these exact fixture children before removing their files.
  for(const pid of registered){
    const deadline=Date.now()+10000
    while(resources.LINUX_PROBE.processById(pid)!==null){
      if(Date.now()>deadline)throw new Error(`Fixture child ${pid} did not end; recovery files stay at ${root}`)
      await new Promise(resolve=>setTimeout(resolve,20))
    }
  }
  resources.useOsProbe(resources.LINUX_PROBE)
  await server.app.close()
  office.close()
  rmSync(root,{recursive:true,force:true})
})

async function officeRequest(asked: { method:string; path:string; body?:unknown }) {
  if(asked.path.startsWith('/api/merge-queue?')) throw new Error('An unbounded lane read is refused in this fixture.')
  if(asked.path==='/api/resources') {
    expect(existsSync(join(root,'started'))).toBe(false)
    registered.push(Number((asked.body as {key:string}).key))
    expect(resources.LINUX_PROBE.processById(registered.at(-1)!)?.pgid).toBe(expectedGroup)
  }
  const reply=await server.app.inject({method:asked.method as 'GET'|'POST',url:asked.path,headers:{'x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-session':session,...thePersonsKeyHeader()},...(asked.body===undefined?{}:{payload:asked.body as Record<string,unknown>})})
  return {status:reply.statusCode,body:reply.body,cut:false,location:null}
}

function endedGroupsAndSeats() {
  expect(registered).toHaveLength(1)
  for(const pid of registered) expect(resources.LINUX_PROBE.processById(pid)).toBeNull()
  const active=office.client.sqlite.prepare("SELECT COUNT(*) n FROM session_resources WHERE released_at IS NULL AND type IN ('slot','process') AND key <> ?").get(String(process.pid)) as {n:number}
  expect(active.n).toBe(0)
  expect(office.api.listRecords({workspaceId:'default',kinds:['whole_suite_receipt']})).toHaveLength(0)
}

it('registers the real door group before releasing it and awaits its original unavailable result',async()=>{
  const result=await runPeriodicSuiteOnce(options,{officeRequest})
  expect(result).toMatchObject({status:'not run'})
  expect(result.says).toContain('receive the commit')
  expect(readFileSync(join(root,'ended'),'utf8')).toContain('Synthetic')
  endedGroupsAndSeats()
})

it('asks the real door for the runs alone in the attempt folder, beside the manifest',async()=>{
  expect(await runPeriodicSuiteOnce(options,{officeRequest})).toMatchObject({status:'not run'})
  // The door's first script on the box names every path it was given. The made-up transport kept it.
  const script=readFileSync(join(root,'script'),'utf8')
  const attempt=script.match(/^manifest='(.*\/results\/attempt-[^/']+)\/manifest\.json'$/m)?.[1]
  expect(attempt,script).toBeDefined()
  expect(script).toContain(`\nalone='${attempt}/alone'\n`)
  endedGroupsAndSeats()
})

it('a stop request waits for the bounded real door and its detached transport before returning the seat',async()=>{
  const controller=new AbortController()
  const stopping=(async()=>{
    const deadline=Date.now()+5000
    while(!existsSync(join(root,'started'))){if(Date.now()>deadline)throw new Error('The fixture transport never started');await new Promise(resolve=>setTimeout(resolve,10))}
    controller.abort()
  })()
  const [result]=await Promise.all([runPeriodicSuiteOnce({...options,signal:controller.signal},{officeRequest}),stopping])
  expect(result).toMatchObject({status:'not run'})
  expect(readFileSync(join(root,'ended'),'utf8')).toContain('Synthetic')
  endedGroupsAndSeats()
})

it('refuses a seat held by a different recorded process group before starting the door',async()=>{
  const other=spawn(process.execPath,['-e',"process.stdin.once('data',()=>process.exit(0))"],{detached:true,stdio:['pipe','ignore','ignore']})
  const closed=new Promise<void>((resolve,reject)=>{other.once('error',reject);other.once('close',()=>resolve())})
  const row=resources.registerResource({workspaceId:'default',sessionRecordId:session,type:'process',key:String(other.pid),actor:office.api.HUMAN})
  try{
    await expect(runPeriodicSuiteOnce({...options,processResource:row.id},{officeRequest})).rejects.toThrow('recorded producer group')
    expect(existsSync(join(root,'started'))).toBe(false)
  }finally{
    other.stdin.end('done\n')
    await closed
    await resources.releaseResource(row.id,{actor:{...office.api.HUMAN,sessionId:session},signalNothing:true},'default')
  }
  endedGroupsAndSeats()
})

it('a recorded producer-group SIGTERM keeps the door alive through its bounded transport',async()=>{
  const childFile=join(root,'producer.mjs')
  const module=pathToFileURL(join(import.meta.dirname,'..','tools','periodic-main-suite.mjs')).href
  writeFileSync(childFile,`import {runPeriodicSuiteOnce} from ${JSON.stringify(module)};
const options=${JSON.stringify(options)};
const controller=new AbortController();
process.on('SIGTERM',()=>controller.abort());
let next=0;const pending=new Map();
process.on('message',message=>{if(message.id){const give=pending.get(message.id);pending.delete(message.id);give(message.reply)}});
const officeRequest=asked=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);process.send({id,asked})});
process.stdin.once('data',async bytes=>{
 options.processResource=bytes.toString().trim();
 try{const result=await runPeriodicSuiteOnce({...options,signal:controller.signal},{officeRequest});process.send({done:true,result})}
 catch(error){process.send({done:true,error:error.message})}
 finally{process.disconnect()}
});
`)
  const child=spawn(process.execPath,[childFile],{env:options.env,detached:true,stdio:['pipe','ignore','ignore','ipc']})
  const closed=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',()=>resolve())})
  const done=new Promise<{result?:{status:string};error?:string}>((resolve,reject)=>{
    child.once('error',reject)
    child.on('message',async(message:any)=>{
      if(message.done){resolve(message);return}
      if(message.asked){
        let reply
        try{reply=await officeRequest(message.asked)}catch(error){reply={status:500,body:{error:String(error)}}}
        if(child.connected)child.send({id:message.id,reply})
      }
    })
  })
  const producerRow=resources.registerResource({workspaceId:'default',sessionRecordId:session,type:'process',key:String(child.pid),actor:office.api.HUMAN})
  expectedGroup=producerRow.pgid!
  child.stdin!.end(producerRow.id+'\n')
  let transportRow: ReturnType<typeof resources.registerResource>|undefined
  try{
    const deadline=Date.now()+10000
    while(!existsSync(join(root,'started'))){if(Date.now()>deadline)throw new Error('The fixture transport never started');await new Promise(resolve=>setTimeout(resolve,10))}
    const transportPid=JSON.parse(readFileSync(join(root,'started'),'utf8')).pid
    transportRow=resources.registerResource({workspaceId:'default',sessionRecordId:session,type:'process',key:String(transportPid),actor:office.api.HUMAN})
    process.kill(-producerRow.pgid!,'SIGTERM')
    const answer=await done
    expect(answer.error).toBeUndefined()
    expect(answer.result).toMatchObject({status:'not run'})
    expect(readFileSync(join(root,'ended'),'utf8')).toContain('Synthetic')
  }finally{
    await closed
    if(transportRow){
      const deadline=Date.now()+10000
      while(resources.LINUX_PROBE.processById(Number(transportRow.key))!==null){if(Date.now()>deadline)throw new Error('The recorded fixture transport did not end');await new Promise(resolve=>setTimeout(resolve,20))}
      await resources.releaseResource(transportRow.id,{actor:{...office.api.HUMAN,sessionId:session},signalNothing:true},'default')
    }
    await resources.releaseResource(producerRow.id,{actor:{...office.api.HUMAN,sessionId:session},signalNothing:true},'default')
  }
  endedGroupsAndSeats()
})

it('keeps the share-a-process switch in the environment it starts the door with, so the script the box gets carries it',async()=>{
  // A made-up box that takes the push into a bare repository, keeps the run script, and says it is busy (criterion 25).
  const bare=join(root,'box.git')
  git('init','-q','--bare',bare)
  const transport=join(root,'busy-transport')
  writeFileSync(transport,`#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const data=JSON.parse(readFileSync(args[args.indexOf('-i')+1], 'utf8'));
if(args.some(word=>word.includes('git-receive-pack'))){
  spawn('git',['receive-pack',data.bare],{stdio:'inherit'}).on('exit',code=>process.exit(code??1));
}else{
  const script=readFileSync(0,'utf8');
  if(/^# cloud-suite: run$/m.test(script)){
    writeFileSync(data.script,script);
    console.log(JSON.stringify({ran:false,reason:'the cloud box is busy with another suite'}));
    process.exitCode=75;
  }
}
`)
  chmodSync(transport,0o755)
  const config=join(root,'busy-config')
  writeFileSync(config,JSON.stringify({bare,script:join(root,'run-script')}))
  const runner=join(root,'busy-runner.env')
  writeFileSync(runner,`RUNNER_HOST=fixture.invalid\nRUNNER_USER=fixture\nRUNNER_KEY=${config}\nRUNNER_WORKERS=1\n`,{mode:0o600})
  const result=await runPeriodicSuiteOnce({...options,env:{...options.env,MOLE_OFFICE_CLOUD_RUNNER_FILE:runner,MOLE_OFFICE_CLOUD_TRANSPORT:transport,MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS:'on'}},{officeRequest})
  expect(result).toMatchObject({status:'not run'})
  expect(result.says).toContain('busy with another suite')
  const script=readFileSync(join(root,'run-script'),'utf8')
  expect(script.split(' "MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS=on"'),'discovery and the whole run get the switch').toHaveLength(3)
  endedGroupsAndSeats()
})

describe('the seat row the office lists for the door group',()=>{
  function standInForTheSeatRows(change:(rows:Record<string,unknown>[])=>Record<string,unknown>[]){
    return async(asked:{method:string;path:string;body?:unknown})=>{
      if(asked.method!=='GET'||!asked.path.startsWith('/api/resources?pgid='))return officeRequest(asked)
      const reply=await officeRequest(asked)
      const answer=JSON.parse(reply.body) as {resources:Record<string,unknown>[]}
      return {...reply,body:{...answer,resources:change(answer.resources)}}
    }
  }
  it('lets the door run when the seat row is in the recorded group',async()=>{
    const result=await runPeriodicSuiteOnce(options,{officeRequest:standInForTheSeatRows(rows=>rows)})
    expect(result).toMatchObject({status:'not run'})
    expect(readFileSync(join(root,'ended'),'utf8')).toContain('Synthetic')
    endedGroupsAndSeats()
  })
  it('refuses when the seat row is missing from the recorded group',async()=>{
    await expect(runPeriodicSuiteOnce(options,{officeRequest:standInForTheSeatRows(rows=>rows.filter(row=>row.type!=='slot'))})).rejects.toThrow('recorded producer group')
    expect(existsSync(join(root,'started'))).toBe(false)
    endedGroupsAndSeats()
  })
  it('refuses when the seat row is recorded in another group',async()=>{
    await expect(runPeriodicSuiteOnce(options,{officeRequest:standInForTheSeatRows(rows=>rows.map(row=>row.type==='slot'?{...row,pgid:Number(row.pgid)+1}:row))})).rejects.toThrow('recorded producer group')
    expect(existsSync(join(root,'started'))).toBe(false)
    endedGroupsAndSeats()
  })
  it('refuses when the row with the seat id is not a slot',async()=>{
    await expect(runPeriodicSuiteOnce(options,{officeRequest:standInForTheSeatRows(rows=>rows.map(row=>row.type==='slot'?{...row,type:'process'}:row))})).rejects.toThrow('recorded producer group')
    expect(existsSync(join(root,'started'))).toBe(false)
    endedGroupsAndSeats()
  })
})
