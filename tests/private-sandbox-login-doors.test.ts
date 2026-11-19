// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import { privateLoginDoors } from '../src/server/lib/sandbox-login-addition/attempts.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'

const marker = 'invented-short-code-never-in-log'
const headers = { origin: 'http://office.invalid', 'x-private-login-binding': 'a'.repeat(32), 'x-private-login-generation': 'b'.repeat(32), 'content-type': 'application/json' }
const context = { person: true, permittedReach: true, owner: 'invented-owner', device: 'invented-device', session: 'invented-browser-session' }
const transport = vi.fn(async (request: any) => request.op === 'privateLoginCapability' ? { version: 1, available: true, code: true } : { attempt: 'd'.repeat(32), generation: 'b'.repeat(32), state: 'waiting', deadline: 600000, canOpen: true, code: true })
const doors = privateLoginDoors({ transport, generation: 'b'.repeat(32), allowedOrigins: ['http://office.invalid'] })

it('checks person, reach, origin and binding at every private door with zero holder calls', async () => {
  for (const action of ['capability', 'start', 'status', 'sign-in', 'code', 'cancel'] as const) for (const changed of [{ person: false }, { permittedReach: false }, { session: '' }, { device: '' }]) {
    transport.mockClear()
    await expect(doors.act(action, { ...context, ...changed }, headers, action === 'start' ? { nonce: 'c'.repeat(32) } : action === 'code' ? { code: marker } : {}, 'd'.repeat(32))).rejects.toMatchObject({ reason: expect.any(String) })
    expect(transport).not.toHaveBeenCalled()
  }
  for (const bad of [{ origin: 'https://attacker.invalid' }, { 'x-private-login-binding': '' }, { 'x-private-login-generation': 'f'.repeat(32) }]) {
    transport.mockClear()
    await expect(doors.act('code', context, { ...headers, ...bad }, { code: marker }, 'd'.repeat(32))).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  }
})

it('sends only the fixed holder operation and a bound identity, with a code only in private input', async () => {
  await doors.act('start', context, headers, { nonce: 'c'.repeat(32) })
  expect(transport.mock.lastCall?.[0]).toMatchObject({ op: 'privateLoginStart', version: 1, generation: 'b'.repeat(32), binding: expect.stringMatching(/^[a-f0-9]{64}$/) })
  await doors.act('code', context, headers, { code: marker }, 'd'.repeat(32))
  expect(transport.mock.lastCall?.[0]).toMatchObject({ op: 'privateLoginCode', code: marker })
})

it('refuses request-controlled commands, tokens, URLs, unknown bodies and old capabilities', async () => {
  for (const body of [{ nonce: 'c'.repeat(32), command: 'invented-shell' }, { token: marker }, { code: marker, path: '/invented' }]) {
    transport.mockClear()
    await expect(doors.act('start', context, headers, body)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  }
  const old = privateLoginDoors({ transport: async () => ({ version: 0, available: true }), generation: 'b'.repeat(32), allowedOrigins: ['http://office.invalid'] })
  await expect(old.act('start', context, headers, { nonce: 'c'.repeat(32) })).rejects.toMatchObject({ reason: 'Unavailable' })
})

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterAll(async () => { await app.close(); db.close() })
it('registers the real guarded family, no-store, with production unavailable and no token door', async () => {
  const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
  const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': (await import('../src/shared/person.ts')).THE_PERSON, ...headers, origin: originsAPageMayBeOn(settings())[0]! }
  const reply = await app.inject({ method: 'GET', url: '/api/office/sandbox-logins/claude/capability', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.headers['cache-control']).toBe('no-store')
  expect(reply.json()).toMatchObject({ available: false })
  const denied = await app.inject({ method: 'POST', url: '/api/office/sandbox-logins/claude/attempts', headers: { ...person, 'x-private-login-generation': reply.json().generation }, payload: { nonce: 'c'.repeat(32) } })
  expect(denied.statusCode).toBe(503)
  expect(denied.body).not.toContain(marker)
})

it('refuses an ordinary registered agent at every real route and never starts a holder job', async () => {
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const p = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...headers }
  await app.inject({ method: 'POST', url: '/api/agents/started', headers: p, payload: { handle: 'invented-login-agent', name: 'Invented agent', role: 'worker' } })
  const a = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'invented-login-agent' }
  for (const [method, path, payload] of [
    ['GET','/capability',undefined],['POST','/attempts',{ nonce:'c'.repeat(32) }],['GET','/attempts/'+'d'.repeat(32)+'/status',undefined], ['GET','/attempts/'+'d'.repeat(32)+'/sign-in',undefined],['POST','/attempts/'+'d'.repeat(32)+'/code',{code:marker}],['POST','/attempts/'+'d'.repeat(32)+'/cancel',{}],
  ] as const) {
    const r = await app.inject({ method, url: '/api/office/sandbox-logins/claude'+path, headers:a, ...(payload ? {payload} : {}) })
    expect(r.statusCode,r.body).toBe(403); expect(r.body).not.toContain(marker)
  }
})

it('sanitizes malformed private URLs, JSON, and unexpected errors before HTTP logging', async () => {
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { privateRequestLogAddress } = await import('../src/config/private-sandbox-login.mjs')
  expect(privateRequestLogAddress('/api/office/sandbox-logins/claude/attempts/invented-secret/code?code=invented-secret')).toBe('/api/office/sandbox-logins/claude/[private]')
  const logs: string[] = []
  const server = Fastify({ logger: { level:'info', stream:{ write: (line:string) => { logs.push(line) } } }, disableRequestLogging:true })
  installErrorHandling(server)
  server.post('/api/office/sandbox-logins/claude/attempts/:id/code', async () => { throw new Error(marker) })
  for (const payload of ['{"code":"'+marker+'",', JSON.stringify({code:marker})]) {
    const r = await server.inject({method:'POST',url:'/api/office/sandbox-logins/claude/attempts/invented-secret/code?code='+marker,headers:{'content-type':'application/json'},payload})
    expect(r.statusCode).toBeGreaterThanOrEqual(400); expect(r.headers['cache-control']).toBe('no-store'); expect(r.body).not.toContain(marker)
  }
  expect(logs.join('')).not.toContain(marker)
  await server.close()
})

it('runs both protected code and native callback completion through real routes into the invented helper', async () => {
  const { privatePoolFixture, clearPrivatePoolFixtures } = await import('./private-sandbox-login-pool-stand.ts')
  const { createPrivateLogin } = await import('../src/holder/private-sandbox-login.mjs')
  const terminals = await import('../src/server/lib/terminals.ts')
  const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const { readFileSync } = await import('node:fs')
  for (const mode of ['callback','code']) {
    const f = privatePoolFixture(); const active = readFileSync(f.active)
    let native: any
    let buffer = ''
    const child = {pgid:987654,identity:'invented-start',matchesIdentity:()=>true,signalGroup:vi.fn(),clear:vi.fn(),disposeScratch:vi.fn(),writeCode:vi.fn()}
    const adapter = {version:1,executable:'/invented/setup',args:['setup-token'],allowedSignInOrigins:['https://signin.invalid'],verified:{protocol:true,callback:true,code:mode==='code',storageIsolation:true,dumpPrevention:true,ownerWatch:true},createParser:()=>({feed:(_channel:string,chunk:Uint8Array)=>{buffer+=Buffer.from(chunk).toString();if(!buffer.endsWith('\n'))return [];const event=JSON.parse(buffer);buffer='';return [event]},clear:()=>{buffer=''}}),start:vi.fn(async (cb:any)=>{native=cb;return child})}
    const service=createPrivateLogin({adapter,pool:f.pool})
    const transport=vi.spyOn(terminals,'askPrivateLoginHolder').mockImplementation(req=>service.handle(req))
    const view=(mode==='code'?'e':'f').repeat(32)
    const h={...headers,'x-private-login-binding':view,'x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON,origin:originsAPageMayBeOn(settings())[0]!}
    const cap=await app.inject({method:'GET',url:'/api/office/sandbox-logins/claude/capability',headers:h})
    expect(cap.json()).toMatchObject({available:true})
    const boundHeaders={...h,'x-private-login-generation':cap.json().generation}
    const start=await app.inject({method:'POST',url:'/api/office/sandbox-logins/claude/attempts',headers:boundHeaders,payload:{nonce:'c'.repeat(32)}})
    expect(start.statusCode,start.body).toBe(200)
    const state=start.json(); const path='/api/office/sandbox-logins/claude/attempts/'+state.attempt
    const emit=(event:unknown)=>native.output('stdout',Buffer.from(JSON.stringify(event)+'\n'))
    emit({type:'sign-in',url:'https://signin.invalid/authorize?state=invented-authorization-state'})
    if(mode==='code')emit({type:'code'})
    for(const changed of [{origin:'https://attacker.invalid'},{'x-mole-office-session':'invented-stale-session'},{'x-private-login-generation':'0'.repeat(32)},{'x-private-login-binding':'0'.repeat(32)}]) {
      const refused=await app.inject({method:'POST',url:path+'/code',headers:{...boundHeaders,...changed},payload:{code:marker}})
      expect(refused.statusCode).toBeGreaterThanOrEqual(400)
      expect(child.writeCode).not.toHaveBeenCalled();expect(f.tool.execute).not.toHaveBeenCalled()
    }
    const safe=await app.inject({method:'GET',url:path+'/status',headers:boundHeaders});expect(safe.body).not.toContain('invented-authorization-state')
    const link=await app.inject({method:'GET',url:path+'/sign-in',headers:boundHeaders});expect(link.json().url).toContain('signin.invalid')
    const used=await app.inject({method:'GET',url:path+'/sign-in',headers:boundHeaders});expect(used.statusCode).toBe(409)
    if(mode==='code') {
      const entered=await app.inject({method:'POST',url:path+'/code',headers:boundHeaders,payload:{code:marker}})
      expect(entered.statusCode,entered.body).toBe(200);expect(child.writeCode).toHaveBeenCalledWith(marker)
      const replay=await app.inject({method:'POST',url:path+'/code',headers:boundHeaders,payload:{code:marker}});expect(replay.statusCode).toBe(409)
    } else {
      const unsupported=await app.inject({method:'POST',url:path+'/code',headers:boundHeaders,payload:{code:marker}});expect(unsupported.statusCode).toBe(409);expect(child.writeCode).not.toHaveBeenCalled()
    }
    emit({type:'token',value:'invented-route-subscription-'+mode});native.exit(0);await service.settled()
    const added=await app.inject({method:'GET',url:path+'/status',headers:boundHeaders})
    expect(added.json()).toMatchObject({state:'added',letter:'E'});expect(added.body).not.toContain('invented-route-subscription')
    expect(f.tool.execute).toHaveBeenCalledTimes(1);expect(adapter.start).toHaveBeenCalledTimes(1);expect(readFileSync(f.active)).toEqual(active)
    const cancel=await app.inject({method:'POST',url:path+'/cancel',headers:boundHeaders,payload:{}});expect(cancel.json()).toMatchObject({state:'added',letter:'E'})
    const sqlite=(await import('../src/server/db/client.ts')).sqlite
    const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[]
    for(const {name} of tables) {
      const rows=sqlite.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()
      const stored=JSON.stringify(rows)
      expect(stored,name).not.toContain(marker);expect(stored,name).not.toContain('invented-route-subscription-')
      expect(stored,name).not.toContain('invented-authorization-state')
    }
    const {readdirSync,lstatSync}=await import('node:fs')
    const walk=(folder:string):void=>{for(const entry of readdirSync(folder)){const file=folder+'/'+entry;if(lstatSync(file).isDirectory())walk(file);else{const bytes=readFileSync(file,'utf8');if(file===f.root+'/E.token')expect(bytes).toBe('invented-route-subscription-'+mode+'\n');else expect(bytes,file).not.toContain('invented-route-subscription-');expect(bytes,file).not.toContain(marker)}}}
    walk(f.home)
    service.close();transport.mockRestore()
  }
  clearPrivatePoolFixtures()
})

it('traps real request completion, slow-request and loop-watch addresses, including private 404s', async () => {
  const { buildApp } = await import('../src/server/index.ts')
  const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const loop = await import('../src/server/lib/loop-watch.ts')
  const watch = vi.spyOn(loop,'watchTheLoop')
  const logs: string[] = []
  const built = await buildApp({production:false,webDir:'/invented/unused-web',webAppUrl:settings().webAddress,logLevel:'info',logStream:{write:line=>{logs.push(line)}}})
  const server=built.app
  let began!:()=>void; const started=new Promise<void>(resolve=>{began=resolve})
  server.get('/api/office/sandbox-logins/claude/attempts/:attempt/invented-slow',{config:{operation:'office.private-login-status',reach:'local',keptHere:{because:'acts-on-this-machine',act:'Invented private test'}}},async()=>{began();await new Promise(resolve=>setTimeout(resolve,2100));return {state:'waiting'}})
  await server.ready()
  const p={...headers,origin:originsAPageMayBeOn(settings())[0]!,'x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
  const slow=server.inject({method:'GET',url:'/api/office/sandbox-logins/claude/attempts/'+marker+'/invented-slow?code='+marker,headers:p})
  await started
  const addresses=watch.mock.calls.at(-1)![0].open()
  expect(JSON.stringify(addresses)).not.toContain(marker)
  await slow
  for (const [path,payload] of [['/attempts/'+marker+'/code?code='+marker,'{"code":"'+marker+'",'],['/unknown-'+marker+'?code='+marker,undefined]] as const) {
    const r=await server.inject({method:payload?'POST':'GET',url:'/api/office/sandbox-logins/claude'+path,headers:p,...(payload?{payload}: {})})
    expect(r.statusCode).toBeGreaterThanOrEqual(400);expect(r.body).not.toContain(marker);expect(r.headers['cache-control']).toBe('no-store')
  }
  expect(logs.join('')).toContain('[private]');expect(logs.join('')).not.toContain(marker)
  await server.close();watch.mockRestore()
})
it('whitelists holder progress replies and rejects raw or malformed protocol states', async () => {
  const state={attempt:'d'.repeat(32),generation:'b'.repeat(32),deadline:600000,state:'waiting',canOpen:true,code:false}
  const safe=privateLoginDoors({transport:async()=>({...state,stdout:marker,error:marker,url:'https://signin.invalid/?code='+marker}),generation:'b'.repeat(32),allowedOrigins:['http://office.invalid']})
  expect(JSON.stringify(await safe.act('status',context,headers,{},'d'.repeat(32)))).not.toContain(marker)
  const bad=privateLoginDoors({transport:async()=>({...state,state:marker}),generation:'b'.repeat(32),allowedOrigins:['http://office.invalid']})
  await expect(bad.act('status',context,headers,{},'d'.repeat(32))).rejects.toMatchObject({reason:'Unsupported'})
})
