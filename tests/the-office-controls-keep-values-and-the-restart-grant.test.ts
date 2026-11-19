// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { beforeEach, afterEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { RUNTIME_SETTING_NAMES } from '../src/config/runtime-settings.mjs'
import { SETTINGS } from '../src/config/settings.mjs'
let t: TestDb, app: FastifyInstance
const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { (await import('../src/server/lib/office-restart.ts')).thisOfficeRestartsWith(null); await app?.close(); t?.close() })
async function settings(changes: object[], headers = owner, extra = {}) { return app.inject({ method: 'POST', url: '/api/office/settings', headers, payload: { changes, because: 'Made-up change reason', ...extra } }) }
async function register(handle: string, role = 'secretary') {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name: 'Made-up ' + handle, role } })
  expect(made.statusCode, made.body).toBe(201)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const agent = agentByHandle(handle)!
  return { agent, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(agent.id, null) } }
}
async function decision() {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: owner, payload: { kind: 'decision', title: 'Made-up operating choice', data: { replaces: [] } } })
  expect(made.statusCode, made.body).toBe(201); return made.json().record.id as string
}
it('reads every non-secret setting and stores atomic values, sources and the audit without editing a file', async () => {
  const read = (await app.inject({ method: 'GET', url: '/api/office/settings' })).json().settings
  expect(read.map((s: {name:string}) => s.name)).toEqual(SETTINGS.filter((s) => !s.name.includes('KEY')).map((s) => s.name))
  expect(read.filter((s: {writable:boolean}) => s.writable).map((s:{name:string}) => s.name).sort()).toEqual([...RUNTIME_SETTING_NAMES].sort())
  for (const suffix of ['AVATAR_MAX_BYTES','MESSAGE_PICTURE_MAX_BYTES','RETURNED_FILE_MAX_BYTES']) expect(read.find((s:{name:string})=>s.name==='MOLE_OFFICE_'+suffix).restartRequired).toBe(true)
  const name = 'MOLE_OFFICE_REPLY_REMINDER_MINUTES'
  const saved = await settings([{ name, value: '9' }, { name: 'MOLE_OFFICE_WINDOW_DEBUGGING', value: 'on' }])
  expect(saved.statusCode, saved.body).toBe(200)
  const value = saved.json().settings.find((s:{name:string}) => s.name === name)
  expect(value).toMatchObject({ value: '9', chosen: '9', source: 'the office database', restartRequired: false, because: 'Made-up change reason', lastChange: { by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } } })
  expect((await import('../src/server/lib/env.ts')).replyReminderMinutes()).toBe(9)
  const { settingValue } = await import('../src/config/settings.mjs')
  expect(settingValue('MOLE_OFFICE_WINDOW_DEBUGGING')).toBe('on')
  const configuration=await import('../src/config/settings.mjs')
  const environment=configuration.mergedEnvironment()
  expect(configuration.readSetting(name,environment).source).toBe('the office database')
  expect(configuration.readSettingHere(name,environment).source).toBe('the office database')
  expect((await settings([{name:'MOLE_OFFICE_LOCK_PATHS',value:'relative/folder'}])).statusCode).toBe(400)
  expect((await settings([{name:'MOLE_OFFICE_LOCK_PATHS',value:''}])).statusCode).toBe(200)
  expect(configuration.settingValue('MOLE_OFFICE_LOCK_PATHS')).toBe('')
  expect((await settings([{name:'MOLE_OFFICE_REPLY_REMINDER_MINUTES',value:''}])).statusCode).toBe(400)
  const childReading = JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {readSettingHere,mergedEnvironment} from './src/config/settings.mjs'; console.log(JSON.stringify({read:readSettingHere('${name}'),env:mergedEnvironment()['${name}']}))`],{env:{...process.env,MOLE_OFFICE_DB:t.file,[name]:'77'},timeout:10_000,encoding:'utf8'}))
  expect(childReading).toMatchObject({read:{value:'9',source:'the office database'},env:'9'})
  const rows = t.client.sqlite.prepare("SELECT old_value,new_value FROM changes WHERE record_id=?").all('setting:runtime:' + name) as {old_value:string;new_value:string}[]
  expect(rows).toHaveLength(1); expect(JSON.parse(rows[0]!.new_value)).toMatchObject({ chosen: '9', value: '9', because: 'Made-up change reason' })
  const rejected = await settings([{ name, value: '8' }, { name: 'MOLE_OFFICE_MERGE_WORKERS', value: '33' }])
  expect(rejected.statusCode).toBe(400); expect(settingValue(name)).toBe('9')
  expect((await settings([{ name: 'MOLE_OFFICE_DB', value: '/made-up.db' }])).json().code).toBe('runtimeSettingsReadOnly')
  expect((await settings([{ name: 'MOLE_OFFICE_BROWSER_TEST_SLOTS', value: '5' }])).statusCode).toBe(200)
  expect((await import('../src/server/lib/slots.ts')).slotPools().find((pool) => pool.name === 'browser-tests')?.capacity).toBe(5)
  expect((await settings([{name:'MOLE_OFFICE_MODULE_REMINDER_SECRETARIES',value:'demo=a,demo=b'}])).statusCode).toBe(400)
  expect((await settings([{name:'MOLE_OFFICE_MODULE_REMINDER_SECRETARIES',value:'demo = clerk'}])).statusCode).toBe(200)
  expect((await settings([{name:'MOLE_OFFICE_CHORE_RUNTIME',value:'dsh'}])).statusCode).toBe(400)
  expect((await settings([{name:'MOLE_OFFICE_INSPECTION_API_SECONDS',value:'0.01'}])).statusCode).toBe(200)
  expect((await settings([{name:'MOLE_OFFICE_INSPECTION_API_SECONDS',value:'2147484'}])).statusCode).toBe(400)
  const { default: Database } = await import('better-sqlite3'); const reopened = new Database(t.file, {readonly:true})
  try { expect(reopened.prepare('SELECT value FROM runtime_settings WHERE name=?').get(name)).toEqual({value:'9'}) } finally { reopened.close() }
  expect((await settings([{ name, value: null }])).statusCode).toBe(200)
  expect(settingValue(name)).toBe('3')
  expect((await settings([{name:'MOLE_OFFICE_HANDLE_GRACE_SECONDS',value:'1'}])).statusCode).toBe(400)
  expect((await settings([{name:'MOLE_OFFICE_ORPHAN_AFTER',value:'1s'}])).statusCode).toBe(400)
  expect((await settings([{name:'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS',value:'2'},{name:'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT',value:'30'}])).statusCode).toBe(200)
  expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id='setting:dead-letter-thresholds'").get()).toEqual({n:1})
  const workerAtStart=read.find((s:{name:string})=>s.name==='MOLE_OFFICE_MESSAGE_WORKER').value
  const workerChoice=(await settings([{name:'MOLE_OFFICE_MESSAGE_WORKER',value:'off'}])).json().settings.find((s:{name:string})=>s.name==='MOLE_OFFICE_MESSAGE_WORKER')
  expect(workerChoice).toMatchObject({value:'off',currentValue:workerAtStart,pendingRestart:workerAtStart!=='off'})
  expect((await settings([{ name:'MOLE_OFFICE_MESSAGE_WORKER', value:'off' }])).json().settings.find((s:{name:string}) => s.name==='MOLE_OFFICE_MESSAGE_WORKER').restartRequired).toBe(true)
})
it('allows an ordinary secretary key and requires exact words for built-in or stored owner decisions', async () => {
  const secretary = await register('controls-clerk'), worker = await register('controls-worker','worker')
  const name = 'MOLE_OFFICE_REPLY_REMINDER_MINUTES'
  expect((await settings([{name,value:'4'}],worker.headers)).json().code).toBe('runtimeSettingsNotAllowed')
  expect((await settings([{name,value:'4'}],secretary.headers)).statusCode).toBe(200)
  const fixed = await decision()
  expect((await settings([{name,value:'5',decision:fixed}])).statusCode).toBe(200)
  expect((await settings([{name,value:'6'}],secretary.headers)).json().code).toBe('runtimeSettingsNotAllowed')
  const exact = [{name,value:'6',effective:'6',decision:fixed}]
  const warrant = { saidBy:THE_TEST_OFFICES_OWNER.id, words:'Made-up words: use six minutes.',where:'terminal',when:'2026-09-26 10:00',for:[`office.set-settings:${JSON.stringify(exact)}`] }
  expect((await settings([{name,value:'7'}],secretary.headers,{warrant})).json().code).toBe('runtimeSettingsBadWarrant')
  expect((await settings([{name,value:'6'}],secretary.headers,{warrant})).statusCode).toBe(200)
  expect((await settings([{name:'MOLE_OFFICE_BUS_MOST_ENTRIES',value:'7'}],secretary.headers)).statusCode).toBe(403)
  expect((await settings([{name,value:'9',decision:'absent'}])).statusCode).toBe(400)
})
it('uses an explicit live restart grant, answers before acting, and refuses other keys, cards and missing managers', async () => {
  const secretary = await register('restart-clerk'), other = await register('restart-other')
  const fixed = await decision()
  const restart = (headers = owner) => app.inject({ method:'POST',url:'/api/office/restart',headers,payload:{because:'Made-up restart reason'} })
  expect((await app.inject({method:'GET',url:'/api/office/restart?agentWords=restart-clerk'})).json().agents).toEqual([{id:secretary.agent.id,name:'Made-up restart-clerk',handle:'restart-clerk'}])
  expect((await restart()).json().code).toBe('officeRestartNoManager')
  let restarted = 0
  const { thisOfficeRestartsWith } = await import('../src/server/lib/office-restart.ts')
  thisOfficeRestartsWith({mode:'checkout',prepare:async()=>()=>{restarted++}})
  expect((await restart(secretary.headers)).json().code).toBe('officeRestartNotAllowed')
  const grant = (headers=owner, extra={}) => app.inject({ method:'POST',url:'/api/office/restart-grant',headers,payload:{agent:secretary.agent.id,decision:fixed,because:'Made-up grant reason',...extra} })
  expect((await grant(secretary.headers)).statusCode).toBe(403)
  const target = `office.set-restart-grant:${JSON.stringify({agent:secretary.agent.id,decision:fixed})}`
  const warrant = {saidBy:THE_TEST_OFFICES_OWNER.id,words:'Made-up words: this clerk may restart or pause.',where:'terminal',when:'2026-09-26 10:00',for:[target]}
  expect((await grant(secretary.headers,{warrant})).statusCode).toBe(200)
  expect((await restart(other.headers)).statusCode).toBe(403)
  const response = await restart(secretary.headers)
  expect(response.statusCode,response.body).toBe(200); expect(response.json()).toMatchObject({requested:true,mode:'checkout',instance:(await app.inject({method:'GET',url:'/api/office/restart'})).json().instance})
  expect(restarted).toBe(1)
  const { assertMayRestartOrPause } = await import('../src/server/lib/office-restart.ts')
  expect(()=>assertMayRestartOrPause({type:'agent',id:'restart-clerk',provedBy:'an-agent-key',keyHolder:secretary.agent.id})).not.toThrow()
  t.client.sqlite.prepare('UPDATE records SET deleted_at=? WHERE id=?').run('2026-10-01 00:00:00',fixed)
  expect((await restart(secretary.headers)).statusCode).toBe(403)
  expect((await app.inject({method:'POST',url:'/api/office/restart-grant',headers:owner,payload:{agent:secretary.agent.id,decision:null,because:'Made-up revocation'}})).statusCode).toBe(200)
  expect((await app.inject({method:'GET',url:'/api/office/restart'})).json().grants).toEqual([])
})

it('codes an unsupported operating-system restart refusal before any process starts',async()=>{
  const {theProbeForThisPlatform}=await import('../src/server/lib/resources.ts')
  const {thisOfficeRestartsWith}=await import('../src/server/lib/office-restart.ts')
  const probe=theProbeForThisPlatform('win32')
  thisOfficeRestartsWith({mode:'installed',prepare:async()=>{
    if(!probe.startTheRestartCommand)throw new Error('Made-up probe has no restart door.')
    probe.startTheRestartCommand({cwd:process.cwd(),logPath:t.file+'.unused-log',env:{}})
    throw new Error('The unsupported probe started a process.')
  }})
  const reply=await app.inject({method:'POST',url:'/api/office/restart',headers:owner,payload:{because:'Made-up unsupported-platform press'}})
  expect(reply.statusCode,reply.body).toBe(503)
  expect(reply.json()).toMatchObject({code:'officeRestartNoManager'})
  expect(reply.body).toContain('No restart was requested.')
})

it('keeps shutdown person-only while a live grant pauses and resumes the office without closing its API',async()=>{
  const secretary=await register('pause-clerk'),other=await register('pause-other')
  const fixed=await decision()
  expect((await app.inject({method:'POST',url:'/api/office/restart-grant',headers:owner,payload:{agent:secretary.agent.id,decision:fixed,because:'Made-up pause grant'}})).statusCode).toBe(200)
  const {thisOfficePausesWith}=await import('../src/server/lib/office-pause.ts')
  let stopped=0,started=0
  thisOfficePausesWith({stopWorker:async()=>{stopped++;return 'Made-up worker stopped.'},startWorker:async()=>{started++;return 'Made-up worker started.'}})
  try {
    const instance=(await app.inject({method:'GET',url:'/api/office/restart'})).json().instance
    const shut=await app.inject({method:'POST',url:'/api/office/shut-down',headers:secretary.headers,payload:{why:'Made-up granted agent shutdown'}})
    expect(shut.statusCode,shut.body).toBe(403)
    expect(shut.body).toContain("Only the owner may shut the office down, or a secretary holding the owner's grant where this office's list of what the grant carries says so. Any other agent is refused.")
    expect(stopped).toBe(0)
    const press=(path:string,headers=secretary.headers,why='Made-up pause reason')=>app.inject({method:'POST',url:path,headers,payload:{why}})
    expect((await press('/api/office/pause',other.headers)).json().code).toBe('officeRestartNotAllowed')
    expect((await press('/api/office/pause',secretary.headers,'')).statusCode).toBe(400)
    expect(stopped).toBe(0)
    const paused=await press('/api/office/pause')
    expect(paused.statusCode,paused.body).toBe(200)
    expect(paused.json()).toMatchObject({state:{paused:true,by:'Made-up pause-clerk',because:'Made-up pause reason'},paused:[],notPaused:[]})
    expect(stopped).toBe(1)
    expect((await app.inject({method:'GET',url:'/api/office/restart'})).json().instance).toBe(instance)
    expect((await app.inject({method:'GET',url:'/api/office/pause'})).json()).toMatchObject({paused:true,by:'Made-up pause-clerk'})
    const resumed=await press('/api/office/resume',secretary.headers,'Made-up resume reason')
    expect(resumed.statusCode,resumed.body).toBe(200)
    expect(resumed.json().state).toMatchObject({paused:false,because:'Made-up resume reason'})
    expect(started).toBe(1)
    const audit=t.client.sqlite.prepare("SELECT actor_id,new_value FROM changes WHERE record_id='setting:office-pause' ORDER BY append_order").all() as {actor_id:string;new_value:string}[]
    expect(audit).toHaveLength(2)
    expect(audit.map(r=>r.actor_id)).toEqual([secretary.agent.id,secretary.agent.id])
    expect(audit.map(r=>JSON.parse(r.new_value).paused)).toEqual([true,false])
    t.client.sqlite.prepare('UPDATE records SET deleted_at=? WHERE id=?').run('2026-10-01 00:00:00',fixed)
    expect((await press('/api/office/pause')).statusCode).toBe(403)
  } finally {thisOfficePausesWith(null)}
})

it('codes a missing or failed pause manager and records repeated resume presses without guessing success',async()=>{
 const {thisOfficePausesWith}=await import('../src/server/lib/office-pause.ts')
 const press=(path:string)=>app.inject({method:'POST',url:path,headers:owner,payload:{why:'Made-up same reason'}})
 thisOfficePausesWith(null)
 expect((await press('/api/office/pause')).json().code).toBe('officePauseNotReady')
 thisOfficePausesWith({stopWorker:async()=>{throw new Error('Made-up worker did not stop.')},startWorker:async()=>{throw new Error('Made-up worker did not start.')}})
 try{
  const failed=await press('/api/office/pause')
  expect(failed.statusCode,failed.body).toBe(503)
  expect(failed.json()).toMatchObject({code:'officePauseNotReady'})
  expect(failed.body).toContain('Made-up worker did not stop.')
  expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id='setting:office-pause'").get()).toEqual({n:0})
  thisOfficePausesWith({stopWorker:async()=> 'Made-up stop.',startWorker:async()=> 'Made-up start.'})
  expect((await press('/api/office/resume')).statusCode).toBe(200)
  expect((await press('/api/office/resume')).statusCode).toBe(200)
  expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id='setting:office-pause'").get()).toEqual({n:2})
 }finally{thisOfficePausesWith(null)}
})
