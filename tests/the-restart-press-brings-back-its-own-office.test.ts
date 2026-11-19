// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real checkout and service offices, each in mkdtemp with only their service imports and fixture assets: the response is accepted, the process
 * changes, and a database value survives. Mutation: suppress each manager's restart message. */
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { REPO, aPlace, aFreePort, aServerEnvironment, askThePlacesOffice, groups, stopEverything, until, sleep } from './terminal-holder-stand.ts'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { commandThatStopsWithItsOwner } from './helpers.ts'
const headers = {'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-workspace':'default'}
afterAll(stopEverything,60_000)
async function read(api:string, path:string, body?:unknown) {
  const response=await fetch(api+path,{headers,signal:AbortSignal.timeout(5000),...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
}
for (const mode of ['checkout','installed'] as const) it(`${mode}: the press answers and a new server keeps the database choice`,async()=>{
  const place=aPlace(`restart-${mode}`), port=await aFreePort(), api=`http://127.0.0.1:${port}`
  // The import graph does not follow a file the supervisor spawns, so the stand-in is named here.
  const entries = ['tools/build-the-page.mjs', 'tools/office-diagnostic-report.mjs', 'tools/files-that-restart-the-server.mjs', 'tools/serve-dev.mjs', 'tools/serve-dev-stand-in.mjs', 'src/config/the-service-command.mjs', 'src/server/index.ts', 'src/worker/index.ts']
  const files = new Set(entries.flatMap(entry => theFilesBuiltFrom(entry, REPO).files))
  for (const part of [...files, 'src/config/roles.json', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json', 'dist/web/index.html']) {
    mkdirSync(dirname(join(place.dir, part)), { recursive: true })
    cpSync(join(REPO, part), join(place.dir, part), { recursive: true, preserveTimestamps: true })
  }
  symlinkSync(join(REPO,'node_modules'),join(place.dir,'node_modules'))
  const env={...await aServerEnvironment(place,port),MOLE_OFFICE_MESSAGE_WORKER:'off',MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES:'0',MOLE_OFFICE_TERMINAL_HOLDER:'off',MOLE_OFFICE_WORKSPACE:'default'}
  let output=''
  // Its own group, which the watchdog ends if this worker dies before afterAll runs.
  const watched=commandThatStopsWithItsOwner(process.execPath,mode==='checkout'?['tools/serve-dev.mjs']:['src/config/the-service-command.mjs','start'])
  const child=spawn(watched.command,watched.args,{cwd:place.dir,env,detached:true,stdio:['ignore','pipe','pipe']})
  if(child.pid===undefined)throw new Error('No test starter process was made.')
  groups.add(child.pid); child.stdout.on('data',(b)=>output+=String(b));child.stderr.on('data',(b)=>output+=String(b))
  const lockPath=serviceLockPathFrom({MOLE_OFFICE_DB:place.database})
  function recordServer(){const lock=readTheServiceLock(lockPath);if(lock.state==='read')groups.add(lock.lock.pgid);return lock}
  const first=await until(async()=>{recordServer();return askThePlacesOffice(api,place,()=>read(api,'/api/office/restart'))},r=>r?.status===200,120_000)
  expect(first,output).not.toBeNull();expect(first!.body.mode,output).toBe(mode)
  const old=recordServer();expect(old.state).toBe('read')
  const name='MOLE_OFFICE_REPLY_REMINDER_MINUTES'
  expect((await read(api,'/api/office/settings',{changes:[{name,value:'9'}],because:'Made-up persistence proof'})).status).toBe(200)
  const press=await read(api,'/api/office/restart',{because:'Made-up restart proof'})
  expect(press,output).toMatchObject({status:200,body:{requested:true,mode,instance:first!.body.instance}})
  const next=await until(async()=>{recordServer();return askThePlacesOffice(api,place,()=>read(api,'/api/office/restart'))},r=>r?.status===200&&r.body.instance!==first!.body.instance,45_000)
  recordServer()
  expect(next?.body.instance,output).not.toBe(first!.body.instance);expect(next?.status,output).toBe(200)
  const current=recordServer();expect(current.state).toBe('read')
  if(old.state==='read'&&current.state==='read')expect(current.lock.pid).not.toBe(old.lock.pid)
  // The place holds what a checkout holds: a file the supervisor starts, not imports, is copied too.
  expect(output).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/)
  const values=await read(api,'/api/office/settings')
  expect(values.body.settings.find((s:{name:string})=>s.name===name)).toMatchObject({value:'9',currentValue:'9',source:'the office database'})
  expect((await read(api,'/api/office/settings',{changes:[{name,value:null}],because:'Made-up removal proof'})).status).toBe(200)
  const removed=await read(api,'/api/office/settings')
  expect(removed.body.settings.find((s:{name:string})=>s.name===name)).toMatchObject({value:'3',chosen:null,source:'the built-in default'})
  // Pause goes through the same grant check. In a checkout it also ends the supervisor;
  // otherwise serve-dev would restart the office the person had just paused.
  expect((await read(api,'/api/office/shut-down',{why:'Made-up pause proof'})).status).toBe(200)
  const gone=await until(()=>read(api,'/api/health').then(()=>false,()=>true),Boolean,20_000)
  expect(gone,output).toBe(true)
  await sleep(1500);expect(await read(api,'/api/health').then(()=>false,()=>true)).toBe(true)
},240_000)
