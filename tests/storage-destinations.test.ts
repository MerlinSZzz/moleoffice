// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Destination settings criteria: real routes, an offline reader, made-up credentials, bounded summaries.
 * Mutations: policy default; lost persistence; permission bypass; secret leak; unsafe mode; one code for
 * every check; validation bypass; wrong 80% value; inventory read instead of summary. Each must fail its case.
 */
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STORAGE_CATEGORIES } from '../src/shared/storage/categories.ts'
const home = aTestDatabaseFolder('destination-secrets')
const oldHome = process.env['HOME']
const person = { 'x-mole-office-workspace':'default', 'x-mole-office-actor-type':'human', 'x-mole-office-actor-id':THE_PERSON }
let t: TestDb, app: FastifyInstance, worker: Record<string,string>
let secretFile = ''
const secret = 'made-up-access-42', replacement = 'made-up-replacement-42'
let defaults: import('../src/shared/storage/destinations.ts').UploadPolicy
let warningBytes: typeof import('../src/shared/storage/destinations.ts').destinationWarningBytes
const destination = (name = 'made-up-folder') => ({ name, kind:'folder', target:{path:'/made-up/archive'}, policy:{...defaults}, limitBytes:100_000_000, enabled:true })
const ask = (method:'GET'|'POST', payload?:unknown, headers=person) => app.inject({method,url:'/api/office/storage-destinations',headers,...(payload===undefined?{}:{payload:payload as object})})
const save = (d:unknown, credentials:unknown={action:'retain'}, headers=person) => ask('POST',{destination:d,credentials,because:'Made-up settings proof'},headers)
beforeAll(async()=>{
  process.env['HOME']=home
  const template=JSON.parse(readFileSync(new URL('../sandboxes/mole-office-dev/sandbox.json',import.meta.url),'utf8'))
  secretFile=template.secrets.hostFile.replace(/^~(?=\/)/,home)
  expect(secretFile.startsWith(home+'/')).toBe(true)
  t=await freshDb(); app=(await apiApp()).app; await app.ready()
  const registered=await app.inject({method:'POST',url:'/api/agents/started',headers:person,payload:{handle:'made-up-destination-worker',name:'Made-up worker',role:'worker'}})
  expect(registered.statusCode).toBe(201)
  worker={...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':registered.json().agent.id,'x-mole-office-key':registered.json().whatToGiveIt.key}
})
afterAll(async()=>{vi.restoreAllMocks(); await app?.close(); t?.close(); if(oldHome===undefined)delete process.env['HOME'];else process.env['HOME']=oldHome;rmSync(home,{recursive:true,force:true})})
it('reads the full new-destination defaults and never fabricates occupancy or core size',async()=>{
  const r=await ask('GET'); expect(r.statusCode,r.body.slice(0,300)).toBe(200)
  const canonical=await import('../src/shared/storage/destinations.ts')
  defaults=canonical.DEFAULT_UPLOAD_POLICY;warningBytes=canonical.destinationWarningBytes
  expect(r.json().defaults.policy).toEqual(defaults)
  expect(r.json().destinations).toEqual([])
  expect(r.json().coreBytes).toBeNull()
  expect(r.json().credentials).toEqual({file:secretFile,from:'templates',exists:false,usable:true,refused:null,modeSaysWhoMayRead:true})
})
it('saves every policy tick and reloads it through the route and a read-only offline connection',async()=>{
  const d=destination(); d.policy.workers=true; d.policy.text=false; d.policy.thresholdMB=12;d.enabled=false
  const saved=await save(d);expect(saved.statusCode,saved.body).toBe(200)
  expect((await ask('GET')).json().destinations[0]).toMatchObject(d)
  const {readDestinationsOffline}=await import('../src/config/storage/destinations.mjs')
  expect(readDestinationsOffline(t.file)).toEqual([d])
})
it('applies the canonical policy when a saved destination omits every optional tick',async()=>{
  const d={...destination('made-up-defaults'),policy:{}}
  const r=await save(d);expect(r.statusCode,r.body).toBe(200)
  expect(r.json().destinations.find((one:any)=>one.name===d.name).policy).toEqual(defaults)
})
it('represents an SSH target offline and keeps its made-up credential out of the reply',async()=>{
  const d={...destination('made-up-ssh'),kind:'ssh',target:{host:'backup.invalid',user:'made-up',port:2222,path:'/made-up/archive'},enabled:false}
  const r=await save(d,{action:'replace',values:{password:secret}});expect(r.statusCode,r.body).toBe(200);expect(r.body).not.toContain(secret)
  const {readDestinationsOffline}=await import('../src/config/storage/destinations.mjs')
  expect(readDestinationsOffline(t.file).find(one=>one.name===d.name)).toEqual(d)
  expect((await save(d,{action:'remove'})).statusCode).toBe(200)
})
it('uses the existing settings authority and refuses a worker for reading and writing',async()=>{
  for(const method of ['GET','POST'] as const){const r=await ask(method,method==='POST'?{destination:destination(),credentials:{action:'retain'},because:'Made up'}:undefined,worker as typeof person);expect(r.statusCode,r.body).toBe(403)}
})
it('keeps credentials only in the host secrets file with retain, replace and remove semantics',async()=>{
  mkdirSync(join(secretFile,'..'),{recursive:true});writeFileSync(secretFile,'UNRELATED_LOGIN=made-up-unrelated\n',{mode:0o600})
  const d={...destination('made-up-cloud'),kind:'s3',target:{endpoint:'https://store.invalid',bucket:'made-up',region:'made-up-region-1',prefix:'office/'}}
  for(const value of [secret,replacement]){
    const r=await save(d,{action:'replace',values:{accessKeyId:value,secretAccessKey:value}});expect(r.statusCode,r.body).toBe(200)
    expect(r.body).not.toContain(value);expect(r.json().destinations.find((one:any)=>one.name===d.name).credentialsSet).toBe(true)
    expect(statSync(secretFile).mode&0o777).toBe(0o600)
    const raw=readFileSync(secretFile,'utf8');expect(raw).toContain('UNRELATED_LOGIN=made-up-unrelated');expect(raw).toContain(Buffer.from(JSON.stringify({accessKeyId:value,secretAccessKey:value})).toString('base64'));if(value===replacement)expect(raw).not.toContain(Buffer.from(JSON.stringify({accessKeyId:secret,secretAccessKey:secret})).toString('base64'))
    expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM runtime_settings').all())).not.toContain(value)
    expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM changes').all())).not.toContain(value)
  }
  const before=readFileSync(secretFile,'utf8');expect((await save(d)).statusCode).toBe(200);expect(readFileSync(secretFile,'utf8')).toBe(before)
  const read=await ask('GET');expect(read.body).not.toContain(secret);expect(read.body).not.toContain(replacement)
  expect((await save(d,{action:'remove'})).statusCode).toBe(200)
  expect(readFileSync(secretFile,'utf8')).toBe('UNRELATED_LOGIN=made-up-unrelated\n')
})
it('refuses unsafe identities, targets, secret fields and invalid quantities without echo or partial save',async()=>{
  const baseline=(await ask('GET')).json().destinations
  const d=destination('made-up-invalid')
  const bad=[
    {...d,name:'../made-up'}, {...d,name:'vault'}, {...d,name:'__proto__'}, {...d,limitBytes:0}, {...d,limitBytes:Number.MAX_SAFE_INTEGER+1},
    {...d,policy:{...d.policy,core:false}}, {...d,policy:{...d.policy,thresholdMB:-1}}, {...d,policy:{...d.policy,unknown:secret}},
    {...d,target:{path:'relative'}}, {...d,target:{path:'/made-up',password:secret}},
    {...d,kind:'s3',target:{endpoint:`https://user:${secret}@store.invalid`,bucket:'made-up',region:'made-up-region-1',prefix:''}},
    {...d,kind:'s3',target:{endpoint:`https://store.invalid?token=${secret}`,bucket:'made-up',region:'made-up-region-1',prefix:''}},
    {...d,kind:'s3',target:{endpoint:'https://store.invalid',bucket:'made-up',prefix:''}},
    ...['', 'Made-Up', 'made up', '-made-up', 'made_up', 'a'.repeat(64)].map(region=>({...d,kind:'s3',target:{endpoint:'https://store.invalid',bucket:'made-up',region,prefix:''}})),
    {...d,kind:'s3',target:{endpoint:'https://store.invalid/made-up-path',bucket:'made-up',region:'made-up-region-1',prefix:''}},
    ...['/office/', '../office/', 'office/../up/', 'office//double/', 'office/./here/', 'made up/', 'office\\back/', 'office/%2e%2e/'].map(prefix=>({...d,kind:'s3',target:{endpoint:'https://store.invalid',bucket:'made-up',region:'made-up-region-1',prefix}})),
    {...d,kind:'ssh',target:{host:`user:${secret}@host.invalid`,port:22,user:'made-up',path:'/made-up'}},
  ]
  for(const value of bad){const r=await save(value);expect(r.statusCode,JSON.stringify(value.target)).toBe(400);expect(r.body).not.toContain(secret)}
  const cloud={...d,kind:'s3',target:{endpoint:'https://store.invalid',bucket:'made-up',region:'made-up-region-1',prefix:''}}
  const hostBefore=readFileSync(secretFile,'utf8')
  for(const credentials of [{action:'replace',values:{accessKeyId:secret,secretAccessKey:secret,unknownSecret:secret}},{action:'replace',values:{password:secret}},{action:'retain',values:{accessKeyId:secret}},{action:'remove',unknown:secret}]){
    for(const target of [d,cloud]){const r=await save(target,credentials);expect(r.statusCode).toBe(400);expect(r.body).not.toContain(secret)}
  }
  expect((await ask('GET')).json().destinations).toEqual(baseline)
  expect(readFileSync(secretFile,'utf8')).toBe(hostBefore)
})
it('refuses insecure or linked host files and preserves the target file',async()=>{
  chmodSync(secretFile,0o644)
  const r=await save(destination('made-up-unsafe'))
  const readMode=await ask('GET')
  chmodSync(secretFile,0o600)
  expect(r.statusCode).toBe(409)
  expect(r.json()).toMatchObject({code:'storageDestinationSecretsOthersMayRead',values:{mode:'644'}})
  expect(readMode.statusCode,readMode.body).toBe(200)
  expect(readMode.json().credentials.refused.code).toBe('storageDestinationSecretsOthersMayRead')
  const before=readFileSync(secretFile);const pointed=join(home,'pointed');writeFileSync(pointed,before,{mode:0o600});rmSync(secretFile);symlinkSync(pointed,secretFile)
  const linked=await save(destination('made-up-linked'))
  const readLink=await ask('GET')
  expect(readFileSync(pointed)).toEqual(before);rmSync(secretFile);writeFileSync(secretFile,before,{mode:0o600})
  expect(linked.statusCode).toBe(409)
  expect(linked.json()).toMatchObject({code:'storageDestinationSecretsNotAPlainFile'})
  expect(readLink.statusCode,readLink.body).toBe(200)
  expect(readLink.json().credentials.refused.code).toBe('storageDestinationSecretsNotAPlainFile')
})
it('returns measured local category rows, incomplete coverage and the 80% line using only fixed reads',async()=>{
  const {readStorageCategories}=await import('../src/server/lib/storage/inventory.ts')
  for(const [i,category] of STORAGE_CATEGORIES.entries())t.client.sqlite.prepare('INSERT INTO storage_totals(category,bytes,files) VALUES(?,?,?) ON CONFLICT(category) DO UPDATE SET bytes=excluded.bytes,files=excluded.files').run(category,(i+1)*1_000_000,1)
  const expected=readStorageCategories(t.client.sqlite)
  expect(expected.categories.map(row=>row.bytes)).toEqual(STORAGE_CATEGORIES.map((_,i)=>(i+1)*1_000_000))
  const original=t.client.sqlite.prepare.bind(t.client.sqlite);const queries:string[]=[]
  const spy=vi.spyOn(t.client.sqlite,'prepare').mockImplementation(((sql:string)=>{queries.push(sql);if(/\b(?:FROM|JOIN)\s+(?:storage_files|records|revisions)\b/i.test(sql))throw Error('Unbounded settings read');return original(sql)}) as typeof t.client.sqlite.prepare)
  let r;try{r=await ask('GET')}finally{spy.mockRestore()}
  expect(r.statusCode,r.body).toBe(200);expect(r.json().local).toEqual(expected)
  expect(queries.some(sql=>/FROM storage_totals LIMIT/.test(sql))).toBe(true)
  expect(r.json().local.complete).toBe(false)
  for(const d of r.json().destinations){expect(d.warningBytes).toBe(warningBytes(d.limitBytes));expect(d.heldBytes).toBeNull();expect(d.lastUpload).toBeNull()}
})
it('keeps an s3 target\'s region and plain prefix exactly as saved, and reads them back offline',async()=>{
  const prefixes=['','office','made-up-office/trial/','made.up_office-1/week']
  const saved=prefixes.map((prefix,i)=>({...destination(`made-up-bucket-${i}`),kind:'s3',target:{endpoint:'http://127.0.0.1:9',bucket:'made-up',region:'made-up-region-1',prefix},enabled:false}))
  for(const d of saved){const r=await save(d);expect(r.statusCode,r.body).toBe(200)}
  const {readDestinationsOffline}=await import('../src/config/storage/destinations.mjs')
  const offline=readDestinationsOffline(t.file)
  for(const d of saved)expect(offline.find(one=>one.name===d.name)).toEqual(d)
})
