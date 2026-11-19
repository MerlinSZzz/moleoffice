// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'

let db: TestDb, app: FastifyInstance, serial = 0
const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
afterAll(async () => { await app?.close(); db?.close() })
async function reader() {
  const handle = 'batch-reader-' + String(++serial)
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name: 'Made-up batch reader', role: 'worker' } })
  expect(r.statusCode, r.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const who = { kind: 'agent' as const, id: agentByHandle(handle)!.id }
  const headers = { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(who.id, null) }
  const save = (payload: object) => app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers, payload })
  const read = async () => (await app.inject({ method: 'GET', url: '/api/messages/notice-rules', headers })).json()
  const first = await save({ mutedKinds: [], batchedKinds: ['theBroadcastIsDue'], because: 'Made-up batch choice', ifVersion: null })
  expect(first.statusCode, first.body).toBe(200)
  db.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered' WHERE recipient_kind='agent' AND recipient_id=?").run(who.id)
  return { who, handle, headers, save, read, first: first.json() }
}
async function notice(who: { kind: 'agent'; id: string }) {
  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  return writeASystemLineToOne(who, 'default', SYSTEM_LINES.theBroadcastIsDue('Made-up report time'), { type: 'system', id: moleOffice().id })
}
function mark(id: string, who: { id: string }) { return (db.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id=? AND recipient_id=?').get(id, who.id) as { mark: string }).mark }

it('reads the notice-rule gate once for the whole queue, including multiple queued notices', async () => {
  const a = await reader()
  const notices = [await notice(a.who), await notice(a.who)]
  const settings = await import('../src/config/settings.mjs')
  const { theQueue } = await import('../src/server/lib/worker.ts')
  const gateRead = vi.spyOn(settings, 'gatePosition')
  try {
    const rows = theQueue('default')
    for (const n of notices) {
      expect(rows.find(row => row.messageId === n.id)).toMatchObject({ heldByNoticeRule: expect.any(String) })
    }
    expect(gateRead.mock.calls.filter(([id]) => id === 'held-by-a-notice-rule')).toHaveLength(1)
  } finally {
    gateRead.mockRestore()
    db.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered' WHERE recipient_kind='agent' AND recipient_id=?").run(a.who.id)
  }
})

it.each(['waiter', 'queue'] as const)('the %s read makes no batch query or batch-state call for an agent with no batched kinds', async (read) => {
  const a = await reader()
  const saved = await a.save({ mutedKinds: [], batchedKinds: [], because: 'Made-up return to defaults', ifVersion: a.first.version })
  expect(saved.statusCode, saved.body).toBe(200)
  const n = await notice(a.who)
  const batches = await import('../src/holder/notice-batches.ts')
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const { theQueue } = await import('../src/server/lib/worker.ts')
  const batchRead = vi.spyOn(batches, 'batchDeliveryStates')
  const prepare = vi.spyOn(db.client.sqlite, 'prepare')
  try {
    const rows = read === 'waiter' ? everythingWaitingFor(a.who.id) : theQueue('default')
    expect(rows.some(row => row.messageId === n.id)).toBe(true)
    expect(batchRead.mock.calls.filter(([recipient]) => recipient.id === a.who.id)).toEqual([])
    expect(prepare.mock.calls.map(([sql]) => sql).filter(sql => /notice_batch_/.test(sql))).toEqual([])
  } finally {
    prepare.mockRestore()
    batchRead.mockRestore()
  }
})

it('finds held originals by recipient key and checks batch membership before reading message records', async () => {
  const a = await reader(), b = await reader()
  const first = await notice(a.who), other = await notice(b.who)
  const { batchDeliveryStates } = await import('../src/holder/notice-batches.ts')
  const prepare = vi.spyOn(db.client.sqlite, 'prepare')
  let queries: string[]
  try {
    const states = batchDeliveryStates(a.who)
    expect(states.get(first.id)?.state).toBe('held')
    expect(states.has(other.id)).toBe(false)
    queries = prepare.mock.calls.map(([sql]) => sql).filter(sql => /notice_batch_deliveries/.test(sql))
  } finally {
    prepare.mockRestore()
  }
  expect(queries).toHaveLength(1)
  const plan = db.client.sqlite.prepare('EXPLAIN QUERY PLAN ' + queries[0]!).all(a.who.kind, a.who.id) as { detail: string }[]
  expect(plan.map(row => row.detail).join('\n')).toMatch(/SEARCH d USING .*\(recipient_kind=\? AND recipient_id=\?\)/)
  expect(plan.filter(row => /SCAN [db]\b/.test(row.detail))).toEqual([])
  const batchStep = plan.findIndex(row => /SEARCH b USING/.test(row.detail))
  const messageStep = plan.findIndex(row => /SEARCH r USING/.test(row.detail))
  expect(batchStep).toBeGreaterThanOrEqual(0)
  expect(messageStep).toBeGreaterThan(batchStep)
})

it('keeps a held notice readable at once, queued, and absent from delivery during the current turn', async () => {
  const a = await reader(), n = await notice(a.who)
  expect((await app.inject({ method: 'GET', url: '/api/records/' + n.id, headers: a.headers })).statusCode).toBe(200)
  expect(mark(n.id, a.who)).toBe('queued')
  const waiting = await app.inject({ method: 'GET', url: '/api/handles/' + a.handle + '/waiting', headers: a.headers })
  expect(waiting.json().waiting.some((r: { messageId: string }) => r.messageId === n.id)).toBe(false)
  const rules = await a.read()
  expect(rules.pendingBatches).toEqual([expect.objectContaining({ kind: 'theBroadcastIsDue', count: 1, oldest: expect.any(String) })])
  const { theQueue } = await import('../src/server/lib/worker.ts')
  expect(theQueue('default').find(r => r.messageId === n.id)).toMatchObject({ needsNoRun: null, heldByNoticeRule: expect.any(String) })
})

it('freezes a turn before launch, leaves a failed launch pending, and delivers the originals once after acceptance', async () => {
  const a = await reader(), n = await notice(a.who)
  const { prepareNoticeBatch, acceptNoticeBatch } = await import('../src/holder/notice-batches.ts')
  const first = prepareNoticeBatch(a.who, 'made-up-failed-launch')
  expect(first.messages.map(r => r.messageId)).toEqual([n.id])
  expect(mark(n.id, a.who)).toBe('queued')
  const next = prepareNoticeBatch(a.who, 'made-up-successful-launch')
  const late = await notice(a.who)
  expect(prepareNoticeBatch(a.who, next.turn).messages.map(r => r.messageId)).toEqual([n.id])
  acceptNoticeBatch(a.who, next.turn, true)
  expect(mark(n.id, a.who)).toBe('delivered'); expect(mark(late.id, a.who)).toBe('queued')
  expect(prepareNoticeBatch(a.who, next.turn).messages).toEqual([])
  acceptNoticeBatch(a.who, next.turn, true)
  expect(prepareNoticeBatch(a.who, 'made-up-following-turn').messages.map(r => r.messageId)).toEqual([late.id])
  expect((await a.read()).pendingBatches).toEqual([expect.objectContaining({ count: 1 })])
})

it('keeps the same group handover boundary separate for each recipient',async()=>{
  const a=await reader(),b=await reader(),first=await notice(a.who),second=await notice(b.who)
  const {prepareNoticeBatch,acceptNoticeBatch}=await import('../src/holder/notice-batches.ts')
  const turn='handover:made-up-shared-request'
  expect(prepareNoticeBatch(a.who,turn).messages.map(row=>row.messageId)).toEqual([first.id])
  expect(prepareNoticeBatch(b.who,turn).messages.map(row=>row.messageId)).toEqual([second.id])
  acceptNoticeBatch(a.who,turn,true)
  expect(mark(first.id,a.who)).toBe('delivered');expect(mark(second.id,b.who)).toBe('queued')
})

it('releases on a new session hold, never on a heartbeat, read, or repeated hold of that session', async () => {
  const a = await reader()
  const { holdTheHandle, beatTheHold, everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const session = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up independent work', data: { state: 'running', runtime: 'codex' }, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const n = await notice(a.who)
  const claiming = { handle: a.handle, session: session.id, workspaceId: 'default', runtime: 'codex', machine: 'made-up-machine' }
  holdTheHandle(claiming)
  expect(everythingWaitingFor(a.who.id).find(r => r.messageId === n.id)?.wakesNoWaiter).toBeUndefined()
  const { theLiveSessionTookIt, aRunTookIt } = await import('../src/server/lib/worker.ts')
  const olderTrigger=db.api.createRecord({kind:'message',workspaceId:'default',title:'Made-up older launcher request',data:{body:'Made-up ordinary work',to:[a.who]},actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id}})
  aRunTookIt(olderTrigger.id,a.who,{session:session.id,runtime:'codex',because:'Made-up older launcher received its ordinary request.'},'default')
  expect(mark(n.id,a.who)).toBe('queued')
  theLiveSessionTookIt(n.id, a.who, session.id, 'default')
  const late = await notice(a.who)
  beatTheHold(a.handle, session.id); holdTheHandle(claiming)
  await a.read(); everythingWaitingFor(a.who.id)
  expect(mark(late.id, a.who)).toBe('queued')
  expect((await app.inject({ method: 'GET', url: '/api/handles/' + a.handle + '/waiting', headers: a.headers })).json().waiting).toEqual([])
  expect(mark(n.id, a.who)).toBe('delivered')
})

it('freezes an independently waking handover and retains later arrivals for the following turn', async () => {
  const a = await reader()
  const session = db.api.createRecord({ workspaceId:'default',kind:'session',title:'Made-up held session',data:{state:'running',runtime:'codex'},actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id} })
  const { holdTheHandle } = await import('../src/server/lib/handles.ts')
  holdTheHandle({handle:a.handle,session:session.id,workspaceId:'default',runtime:'codex',machine:'made-up-machine'})
  const n = await notice(a.who)
  const trigger = db.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up work request', data: { body: 'Made-up independent work', to: [a.who] }, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const read = async () => (await app.inject({ method: 'GET', url: '/api/handles/' + a.handle + '/waiting', headers: a.headers })).json().waiting as { messageId: string; batchTurn?: string }[]
  const offered = await read()
  expect(offered.map(r => r.messageId)).toContain(n.id); expect(offered.map(r => r.messageId)).toContain(trigger.id)
  const late = await notice(a.who)
  expect((await read()).map(r => r.messageId)).not.toContain(late.id)
  expect(mark(n.id, a.who)).toBe('queued')
  const turn=offered.find(row=>row.messageId===n.id)!.batchTurn
  const preview=await app.inject({method:'POST',url:'/api/handles/'+a.handle+'/took',headers:a.headers,payload:{session:session.id,message:n.id,batchTurn:turn,prepareOnly:true}})
  expect(preview.statusCode,preview.body).toBe(200);expect(mark(n.id,a.who)).toBe('queued')
  const ack=()=>app.inject({method:'POST',url:'/api/handles/'+a.handle+'/took',headers:a.headers,payload:{session:session.id,message:n.id,batchTurn:turn}})
  expect((await ack()).statusCode).toBe(200)
  const stored=db.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id=? AND recipient_id=?').get(n.id,a.who.id)
  expect((await ack()).statusCode).toBe(200)
  expect(db.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id=? AND recipient_id=?').get(n.id,a.who.id)).toEqual(stored)
  expect(mark(late.id,a.who)).toBe('queued')
})

it('wakes a quiet agent by the office limit using a test clock and retains an unavailable recipient’s original', async () => {
  const a = await reader()
  const { settingNamed } = await import('../src/config/settings.mjs')
  const setting = settingNamed('MOLE_OFFICE_NOTICE_BATCH_MAX_MINUTES')!
  const { startNoticeBatchClock, stopNoticeBatchClock } = await import('../src/holder/notice-batches.ts')
  vi.useFakeTimers(); vi.setSystemTime(new Date('2031-02-03T04:05:06.789Z'))
  const n = await notice(a.who)
  startNoticeBatchClock(() => {})
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const deadline = Number(setting.fallback) * 60_000
  await vi.advanceTimersByTimeAsync(deadline - 1)
  expect(everythingWaitingFor(a.who.id).find(r => r.messageId === n.id)?.wakesNoWaiter).toBeDefined()
  await vi.advanceTimersByTimeAsync(1)
  expect(everythingWaitingFor(a.who.id).find(r => r.messageId === n.id)?.wakesNoWaiter).toBeUndefined()
  expect(mark(n.id, a.who)).toBe('queued')
  await vi.advanceTimersByTimeAsync(deadline * 2)
  expect(db.api.getRecord(n.id)?.data).toMatchObject({ notice: 'theBroadcastIsDue' })
  expect(mark(n.id, a.who)).toBe('queued')
  stopNoticeBatchClock()
  vi.useRealTimers()
  expect((await a.read()).pendingBatches).toEqual([expect.objectContaining({count:1})])
})

it('uses a changed time limit, keeps later arrivals out of the elapsed batch, and launches its originals together',async()=>{
  const a=await reader()
  vi.stubEnv('MOLE_OFFICE_NOTICE_BATCH_MAX_MINUTES','0.5')
  vi.useFakeTimers();vi.setSystemTime(new Date('2032-04-05T06:07:08.123Z'))
  const {startNoticeBatchClock,stopNoticeBatchClock,noticeBatchMaxMinutes,prepareNoticeBatch,acceptNoticeBatch}=await import('../src/holder/notice-batches.ts')
  const first=await notice(a.who),second=await notice(a.who)
  startNoticeBatchClock(()=>{});await vi.advanceTimersByTimeAsync(noticeBatchMaxMinutes()*60_000)
  const late=await notice(a.who)
  vi.useRealTimers();stopNoticeBatchClock()
  const waiting=(await app.inject({method:'GET',url:'/api/handles/'+a.handle+'/waiting',headers:a.headers})).json().waiting as {messageId:string;batchTurn?:string}[]
  expect(waiting.map(row=>row.messageId)).toEqual([first.id,second.id])
  expect(new Set(waiting.map(row=>row.batchTurn)).size).toBe(1)
  expect(waiting[0]!.batchTurn).toEqual(expect.any(String))
  const launched=prepareNoticeBatch(a.who,'run:made-up-timed-run',true)
  expect(launched.messages.map(row=>row.messageId)).toEqual([first.id,second.id,late.id])
  acceptNoticeBatch(a.who,launched.turn,true)
  expect([first,second,late].map(row=>mark(row.id,a.who))).toEqual(['delivered','delivered','delivered'])
})

it('refuses mute and batch overlap in words, preserves batches for older clients and restores both lists', async () => {
  const a = await reader()
  const refused = await a.save({ mutedKinds: ['theBroadcastIsDue'], batchedKinds: ['theBroadcastIsDue'], because: 'Made-up conflict', ifVersion: a.first.version })
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.json().error).toMatch(/cannot be both muted and batched/i)
  const older = await a.save({ mutedKinds: [], because: 'Made-up older client', ifVersion: a.first.version })
  expect(older.statusCode, older.body).toBe(200); expect(older.json().batchedKinds).toEqual(a.first.batchedKinds)
  const defaults = await a.save({ mutedKinds: [], batchedKinds: [], because: 'Made-up defaults', ifVersion: older.json().version })
  const restored = await app.inject({ method: 'POST', url: '/api/messages/notice-rules/restore', headers: a.headers, payload: { seq: 1, because: 'Made-up restore', ifVersion: defaults.json().version } })
  expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().batchedKinds).toEqual(a.first.batchedKinds)
})

it('restores a version from before batching as an empty batch list and names an unknown stored batch kind',async()=>{
  const a=await reader()
  // An old revision has no batch field; a future release can leave an unknown stored kind.
  db.client.sqlite.prepare("UPDATE revisions SET data=json_remove(data,'$.batchedKinds') WHERE record_id=? AND seq=1").run(a.first.recordId)
  db.client.sqlite.prepare("UPDATE records SET data=json_set(data,'$.batchedKinds',json(?)) WHERE id=?").run(JSON.stringify(['madeUpRetiredBatch']),a.first.recordId)
  const unknown=await a.read()
  expect(unknown.storedButNotUsed.batchedKinds).toEqual(['madeUpRetiredBatch'])
  const restored=await app.inject({method:'POST',url:'/api/messages/notice-rules/restore',headers:a.headers,payload:{seq:1,ifVersion:unknown.version,because:'Made-up older version'}})
  expect(restored.statusCode,restored.body).toBe(200);expect(restored.json().batchedKinds).toEqual([])
})

it('records the batch hold it goes past when the existing notice-rule gate is off',async()=>{
  const a=await reader(),n=await notice(a.who)
  const {GATES}=await import('../src/config/gates.mjs')
  const gate=GATES.find(row=>row.id==='held-by-a-notice-rule')!
  vi.stubEnv(gate.setting,'off')
  const {theQueue}=await import('../src/server/lib/worker.ts')
  const row=theQueue('default').find(row=>row.messageId===n.id)!
  expect(row.heldByNoticeRule).toBeUndefined()
  expect(row.wouldHaveHeld).toContain(gate.id)
})

it('exports and restores the held originals, frozen cutoff and accepted turn before resuming delivery',async()=>{
  await app.close();db.close();db=await freshDb();app=(await apiApp()).app;await app.ready()
  const a=await reader(),first=await notice(a.who)
  const {prepareNoticeBatch,acceptNoticeBatch}=await import('../src/holder/notice-batches.ts')
  const frozen=prepareNoticeBatch(a.who,'made-up-restored-turn');acceptNoticeBatch(a.who,frozen.turn)
  const late=await notice(a.who)
  const {writeExport}=await import('../src/server/lib/export.ts')
  const {readThePartTables,compareThePartTables,comparisonOfThePartTable}=await import('../scripts/restore-check.ts')
  const before=readThePartTables(db.client.sqlite),folder=db.file+'.archive'
  writeExport(folder)
  const source=db
  db=await freshDb()
  const {applyImport}=await import('../src/server/lib/import.ts')
  const imported=applyImport(folder)
  expect(imported.refusals).toEqual([]);expect(imported.applied).toBe(true)
  // The two notice-batch tables by name: the restore proof compares every part table, and the others are not this test's.
  const batchTables=['notice_batch_deliveries','notice_batch_turns'].map(comparisonOfThePartTable)
  const verdicts=compareThePartTables(before,readThePartTables(db.client.sqlite))
  expect(batchTables.map(name=>[name,verdicts.find(row=>row.name===name)?.verdict])).toEqual(batchTables.map(name=>[name,'held']))
  const restarted=await import('../src/holder/notice-batches.ts')
  expect(restarted.prepareNoticeBatch(a.who,frozen.turn).messages.map(row=>row.messageId)).toEqual([first.id])
  restarted.acceptNoticeBatch(a.who,frozen.turn,true)
  expect(mark(first.id,a.who)).toBe('delivered');expect(mark(late.id,a.who)).toBe('queued')
  expect(restarted.prepareNoticeBatch(a.who,'made-up-next-restored-turn').messages.map(row=>row.messageId)).toEqual([late.id])
  source.close()
})
