// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic runs and a temporary office exercise the real recipient resolver and message writer. */
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
import {apiApp,freshDb,type TestDb} from './helpers.ts'
import {THE_TEST_OFFICES_OWNER} from './a-page-of-a-test-office.ts'
let db:TestDb
let app:import('fastify').FastifyInstance
let run:string
let agents:Record<string,string>={}
const headers={'x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id}
beforeAll(async()=>{
 db=await freshDb();app=(await apiApp()).app;await app.ready()
 for(const [handle,role] of [['synthetic-starter','supervisor'],['synthetic-worker','worker'],['synthetic-secretary','secretary']]){
  const r=await app.inject({method:'POST',url:'/api/agents/started',headers,payload:{handle,name:handle,role}})
  expect(r.statusCode,r.body).toBe(201);agents[handle!]=r.json().agent.id
 }
},60_000)
afterAll(async()=>{await app?.close();db?.close()})
beforeEach(()=>{
 const parent=db.api.createRecord({kind:'session',title:'Synthetic starter run',workspaceId:'default',actor:{type:'agent',id:'synthetic-starter'},origin:'fixture',data:{state:'running',servingAgent:'synthetic-starter'}}).id
 run=db.api.createRecord({kind:'session',title:'Synthetic worker run',workspaceId:'default',actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id},origin:'fixture',data:{state:'running',servingAgent:'synthetic-worker',parentAttachment:parent}}).id
})
const messages=()=>db.api.listRecords({workspaceId:'default',kind:'message'})
it('tells the actual starter once in one line that its migration was renumbered',async()=>{
 const {tellRenumberedMigrations}=await import('../src/server/lib/merge-conflict-notices.ts')
 const before=new Set(messages().map(m=>m.id))
 const result=tellRenumberedMigrations('default',{id:'synthetic-entry',run},[{from:'0205_entry',to:'0207_entry'}])
 const added=messages().filter(m=>!before.has(m.id))
 expect(added).toHaveLength(1);expect(result).toContain(added[0]!.id)
 expect(added[0]!.data.body).toBe('Merge entry synthetic-entry: migrations renumbered at integration: 0205_entry -> 0207_entry.')
 expect(added[0]!.data.to).toEqual([{kind:'agent',id:agents['synthetic-starter']}])
 expect(added[0]!.data.notice).toBe('migrationsWereRenumbered')
})
it('puts a push failure into the single landing message to the secretary',async()=>{
 const {theSecretaryHearsOneLine}=await import('../src/server/lib/merge-state-machine.ts')
 const before=new Set(messages().map(m=>m.id))
 const reading={id:'synthetic-entry',run,state:'merged',lane:'/synthetic/repo',changeset:{adapter:'git'}} as Parameters<typeof theSecretaryHearsOneLine>[0]
 const reason='Push stopped after landing: visibility was public. Main was not rolled back.'
 const result=theSecretaryHearsOneLine(reading,'default',reason)
 const added=messages().filter(m=>!before.has(m.id))
 expect(added).toHaveLength(1);expect(result.message).toBe(added[0]!.id)
 expect(added[0]!.data.body).toContain(reason)
 expect(added[0]!.data.to).toEqual([{kind:'agent',id:agents['synthetic-secretary']}])
 expect(added[0]!.data.notice).toBe('anEntryLanded')
})
