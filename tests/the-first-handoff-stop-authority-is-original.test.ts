// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** OLD: notices cannot authorize a stop. NEW: original prepared/warrant pins and one atomic use.
 * WHY: notice approval, an old yes and two concurrent callers cannot authorize another stop.
 * The authority and chronology here are explicitly made up, in this test's own database.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { fixtureBootstrapAuthority, fixtureBootstrapKeys } from './stable-bootstrap-authority-fixture.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp } from '../src/shared/time.ts'

const authorityModule = '../src/server/lib/stable-bootstrap-authority.ts'
const noticeModule = '../src/server/lib/stable-upgrade-notices.ts'
let t: TestDb, verifier: any, notice: any, app: any, key: string, writer: any, secretary: any
let serial = 0
const commit = 'a'.repeat(40), tree = 'b'.repeat(40)
const from = { commit, repository: '/fixture/development', database: '/fixture/data/office.db', port: 29991 }
const to = { ...from, repository: '/fixture/stable' }
const pin = (id: string) => ({ id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(id) as any).content_hash })
function actor(handle: string, role: string) {
  const record = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: `Made-up ${handle}`, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
  const registry = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
  t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, registry.id)
  const session = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up authority run', data: { state: 'running', servingAgent: registry.id }, actor: t.api.HUMAN })
  return { type: 'agent', id: registry.id, keyHolder: registry.id, provedBy: 'an-agent-key', sessionId: session.id }
}
/** A made-up owner decision filed directly by the secretary on made-up owner words, with this extra. */
function ownerDecision(title: string, extra: object | undefined) {
  const words = `Made-up owner: ${title}.`, when = localStamp(new Date(Date.now() - 300_000))
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up owner evidence words',
    data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
  t.client.sqlite.prepare('UPDATE records SET created_at=? WHERE id=?').run(when, message.id)
  t.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(when, message.id)
  const warrant = { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: `message:${message.id}`, when, for: [title] }
  return t.api.createRecord({ workspaceId: 'default', kind: 'decision', title,
    data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, ...(extra && { extra }) },
    actor: { ...secretary, warrant } })
}
const waiver = { version: 1, action: 'first-handoff-without-a-whole-suite-receipt', repository: from.repository, commit, tree }
async function fixture(evidence?: object) {
  const n = ++serial
  const notices = Object.fromEntries(['before', 'after'].map(stage => {
    const text = `Made-up first handoff ${stage} ${n}: the stable checkout serves the same code. No feature changed.`
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up approval', data: { body: text }, actor: secretary })
    return [stage, { text, approval: pin(note.id) }]
  }))
  const receipt = () => pin(t.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: 'Made-up original cloud receipt',
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: from.repository, clone: '/fixture/cloud-suite', commit, tree }, actor: writer }).id)
  const a = { candidateTag: `stable-2026-10-17-authority-${n}`, from, to, tree, evidence: evidence ?? receipt(), notices }
  const f = await fixtureBootstrapAuthority(t, a, writer, secretary)
  const announcement = { ...a, authority: f.authority }
  const sendId = `fixture-authority-before-${n}`
  return { ...f, announcement, request: { scope: f.scope, authority: f.authority, sendId },
    before: { kind: 'first-handoff', stage: 'before', sendId, announcement } }
}
const writes = () => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as any).n
beforeAll(async () => {
  t = await freshDb(); writer = actor('authority-writer', 'worker'); secretary = actor('authority-secretary', 'secretary')
  key = await fixtureBootstrapKeys(t, writer.id)
  verifier = await import(authorityModule); notice = await import(noticeModule)
  app = await apiApp(); await app.app.ready()
})
const children: ChildProcess[] = []
// Only the racing test makes a folder, and its workers write into it, so it is removed once they have stopped.
const folders = theFoldersThisFileMakes()
afterAll(async () => {
  try {
    for (const child of children) if (child.exitCode === null && child.signalCode === null && child.pid) process.kill(-child.pid, 'SIGTERM')
    for (const child of children) if (child.exitCode === null && child.signalCode === null) await new Promise<void>(r => child.once('exit', () => r()))
    await app?.app.close(); t?.close()
  } finally {
    folders.removeEveryOne()
  }
})

it('verifies original prepared and directly warranted decision authority through the keyed read door', async () => {
  const f = await fixture(), count = writes()
  expect(verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toMatchObject({ state: 'available',
    authority: f.authority, preparedAt: f.preparedAt, warrantWhen: f.when, reservation: null, outcome: null })
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id,
    'x-mole-office-session': writer.sessionId, 'x-mole-office-key': key }
  const url = `/api/office/bootstrap-stop-authority?request=${encodeURIComponent(JSON.stringify(f.request))}`
  const good = await app.app.inject({ method: 'GET', url, headers })
  expect(good.statusCode, good.body).toBe(200)
  expect(good.json().state).toBe('available')
  for (const [kind, required] of [['note', 'StableBootstrapPrepared'], ['decision', 'StableBootstrapStopScope'], ['message', 'StableBootstrapBefore']] as const) {
    const declared = await app.app.inject({ method: 'GET', url: `/api/kinds/${kind}`, headers })
    expect(declared.statusCode, declared.body).toBe(200)
    expect(declared.json().shapes.map((s: any) => s.name)).toContain(required)
  }
  const invalid = await app.app.inject({ method: 'GET', url: url + '&unexpected=true', headers })
  expect(invalid.statusCode).toBe(400)
  expect(invalid.json().code ?? invalid.json().error?.code).toBeTruthy()
  expect((await app.app.inject({ method: 'GET', url, headers: { ...headers, 'x-mole-office-key': 'not-a-fixture-key' } })).statusCode).toBe(403)
  for (const bad of [
    { ...f.request, authority: { ...f.authority, stateSha256Base64: Buffer.alloc(32, 8).toString('base64') } },
    { ...f.request, authority: { ...f.authority, decision: { ...f.authority.decision, contentHash: '0'.repeat(16) } } },
    { ...f.request, scope: { ...f.scope, candidateTag: 'stable-2026-10-17-unrelated' } },
    { ...f.request, preparedAt: '1900-01-01 00:00:00' },
  ]) expect(() => verifier.verifyBootstrapStopAuthority('default', bad, writer)).toThrow()
  // Specific implementation mutation: omit whyTheCitedPlaceMayNotBeCited; the unproved source passes.
  t.client.sqlite.prepare('UPDATE revisions SET proved_by=NULL WHERE record_id=? AND seq=1').run(f.message)
  expect(() => verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toThrow()
  t.client.sqlite.prepare("UPDATE revisions SET proved_by='the-person-key' WHERE record_id=? AND seq=1").run(f.message)
  t.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(f.when, f.prepared)
  expect(() => verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toThrow()
  t.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(f.preparedAt, f.prepared)
  expect(writes()).toBe(count)
})

it('accepts an original owner decision in place of the whole-suite receipt only when it names this commit and tree', async () => {
  const evidence = (id: string) => ({ kind: 'owner-decision', decision: pin(id) })
  const good = ownerDecision('Made-up first handoff without a whole-suite receipt', { stableBootstrapEvidence: waiver })
  const f = await fixture(evidence(good.id))
  expect(verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toMatchObject({ state: 'available', authority: f.authority })
  const first = notice.fileStableUpgradeNotice('default', f.before, writer, () => from)
  notice.fileStableUpgradeNotice('default', { kind: 'first-handoff', stage: 'after', sendId: `${f.before.sendId}-after`, before: first.original,
    outcome: { state: 'handed-off', verification: { result: 'handed-off', evidence: f.announcement.evidence, serving: to } } }, writer, () => to)
  expect(verifier.verifyBootstrapStopAuthority('default', f.request, writer).state).toBe('consumed')
  const unnamed = /does not name this first handoff's commit and tree/
  for (const extra of [undefined, { stableBootstrapEvidence: { ...waiver, commit: 'c'.repeat(40) } }, { stableBootstrapEvidence: { ...waiver, tree: 'c'.repeat(40) } }]) {
    const bad = await fixture(evidence(ownerDecision(`Made-up evidence decision ${++serial}`, extra).id))
    expect(() => verifier.verifyBootstrapStopAuthority('default', bad.request, writer)).toThrow(unnamed)
    expect(() => notice.fileStableUpgradeNotice('default', bad.before, writer, () => from)).toThrow(unnamed)
  }
  const elsewhere = await fixture(evidence(ownerDecision('Made-up evidence for another checkout', { stableBootstrapEvidence: { ...waiver, repository: '/fixture/another' } }).id))
  expect(() => verifier.verifyBootstrapStopAuthority('default', elsewhere.request, writer)).toThrow(/different development repository/)
  for (const wrong of [{ kind: 'owner-decision', decision: { ...pin(good.id), contentHash: '0'.repeat(16) } }, pin(good.id)]) {
    const bad = await fixture(wrong)
    expect(() => verifier.verifyBootstrapStopAuthority('default', bad.request, writer)).toThrow()
  }
  expect(() => ownerDecision('Made-up malformed evidence', { stableBootstrapEvidence: { ...waiver, action: 'another-action' } })).toThrow(/without a whole-suite receipt: its repository, commit and tree/)
})

it('reserves original stop authority once and blocks reuse after success rollback refusal or uncertainty', async () => {
  const sharedPath = '../src/shared/stable-bootstrap-notices.ts'
  const shared = await import(sharedPath)
  for (const state of [null, 'handed-off', 'failed-restored', 'not-restored', 'refused']) {
    const f = await fixture(), first = notice.fileStableUpgradeNotice('default', f.before, writer, () => from)
    if (state !== null) {
      const reason = state === 'refused' ? shared.STABLE_BOOTSTRAP_PUBLIC_REASONS[0]
        : state === 'failed-restored' ? shared.STABLE_BOOTSTRAP_PUBLIC_REASONS[1] : shared.STABLE_BOOTSTRAP_PUBLIC_REASONS[2]
      const outcome = state === 'handed-off' ? { state, verification: { result: state, evidence: f.announcement.evidence, serving: to } } : { state, reason }
      notice.fileStableUpgradeNotice('default', { kind: 'first-handoff', stage: 'after', sendId: `${f.before.sendId}-after`, before: first.original, outcome }, writer, () => to)
    }
    const result = verifier.verifyBootstrapStopAuthority('default', f.request, writer)
    expect(result.state).toBe(state === null ? 'reserved' : 'consumed')
    expect(result.reservation).toEqual(first.original)
    const recheck = { ...f.request, expectedBefore: first.original }
    if (state === null) {
      const own = verifier.verifyBootstrapStopAuthority('default', recheck, writer)
      expect(own.state).toBe('reserved')
      expect(own.initiator).toEqual(own.caller)
      expect(() => verifier.verifyBootstrapStopAuthority('default', { ...recheck, expectedBefore: { ...first.original, contentHash: '0'.repeat(16) } }, writer)).toThrow()
      const next = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up different run', data: { state: 'running', servingAgent: writer.id }, actor: t.api.HUMAN })
      expect(() => verifier.verifyBootstrapStopAuthority('default', recheck, { ...writer, sessionId: next.id })).toThrow()
    } else expect(() => verifier.verifyBootstrapStopAuthority('default', recheck, writer)).toThrow()
    const count = writes()
    expect(() => notice.fileStableUpgradeNotice('default', { ...f.before, sendId: `${f.before.sendId}-again` }, writer, () => from)).toThrow()
    expect(writes()).toBe(count)
    expect(notice.fileStableUpgradeNotice('default', f.before, writer, () => from)).toEqual({ ...first, replayed: true })
  }
  const f = await fixture(), first = notice.fileStableUpgradeNotice('default', f.before, writer, () => from)
  const held = (t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id=? AND seq=1').get(first.original.id) as any).data
  t.client.sqlite.prepare("UPDATE revisions SET data=json_set(data, '$.extra.stableUpgradeNotice.version', 99) WHERE record_id=? AND seq=1").run(first.original.id)
  try {
    expect(() => verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toThrow()
    expect(() => notice.fileStableUpgradeNotice('default', { ...f.before, sendId: `${f.before.sendId}-damaged` }, writer, () => from)).toThrow()
  } finally {
    t.client.sqlite.prepare('UPDATE revisions SET data=? WHERE record_id=? AND seq=1').run(held, first.original.id)
  }
  // OLD: a stage prefilter hides damaged matching originals. NEW: select by reference, then validate.
  t.client.sqlite.prepare("UPDATE revisions SET data=json_set(data, '$.extra.stableUpgradeNotice.request.stage', 'damaged-stage') WHERE record_id=? AND seq=1").run(first.original.id)
  try {
    expect.soft(() => verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toThrow()
  } finally {
    t.client.sqlite.prepare('UPDATE revisions SET data=? WHERE record_id=? AND seq=1').run(held, first.original.id)
  }
  const last = notice.fileStableUpgradeNotice('default', { kind: 'first-handoff', stage: 'after', sendId: `${f.before.sendId}-after`, before: first.original,
    outcome: { state: 'refused', reason: shared.STABLE_BOOTSTRAP_PUBLIC_REASONS[0] } }, writer, () => from)
  const ended = (t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id=? AND seq=1').get(last.original.id) as any).data
  t.client.sqlite.prepare("UPDATE revisions SET data=json_set(data, '$.extra.stableUpgradeNotice.request.stage', 'damaged-stage') WHERE record_id=? AND seq=1").run(last.original.id)
  try {
    expect.soft(() => verifier.verifyBootstrapStopAuthority('default', f.request, writer)).toThrow()
    expect.soft(() => verifier.verifyBootstrapStopAuthority('default', { ...f.request, expectedBefore: first.original }, writer)).toThrow()
  } finally {
    t.client.sqlite.prepare('UPDATE revisions SET data=? WHERE record_id=? AND seq=1').run(ended, last.original.id)
  }
})

it('atomically reserves one original BEFORE across independent WAL connections racing after the empty read', async () => {
  const f = await fixture()
  t.client.sqlite.pragma('journal_mode = WAL')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const proof = folders.make('reservation-proof')
  const barrier = join(proof, 'read-empty'), release = join(proof, 'release')
  const worker = join(proof, 'worker.mjs')
  const config = join(proof, 'request.json')
  writeFileSync(config, JSON.stringify({ root, database: t.file, project: 'default', request: f.before, actor: writer, from, barrier, release }), { mode: 0o600 })
  writeFileSync(worker, `import{readFileSync,writeFileSync,existsSync}from'node:fs';import{pathToFileURL}from'node:url';
const c=JSON.parse(readFileSync(process.argv[2],'utf8'));process.env.MOLE_OFFICE_DB=c.database;
const{sqlite}=await import(pathToFileURL(c.root+'/src/server/db/client.ts'));sqlite.pragma('busy_timeout = 10000');
const records=await import(pathToFileURL(c.root+'/src/server/lib/records.ts'));
const{readTheRoleCards}=await import(pathToFileURL(c.root+'/src/server/lib/roles.ts'));readTheRoleCards({guardActKeys:records.GOVERNANCE_GUARDS.flatMap(g=>[g.actKey,g.personAct])});
const{fileStableUpgradeNotice}=await import(pathToFileURL(c.root+'/src/server/lib/stable-upgrade-notices.ts'));
if(process.argv[3]==='A'){const prepare=sqlite.prepare.bind(sqlite);let held=false;sqlite.prepare=(sql)=>{const statement=prepare(sql);if(sql.includes('request.announcement.authority.decision.id')){const all=statement.all.bind(statement);statement.all=(...values)=>{const found=all(...values);if(!held){held=true;writeFileSync(c.barrier,'empty reservation read');const end=Date.now()+20000;while(!existsSync(c.release)){if(Date.now()>end)throw Error('Fixture barrier timed out');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5)}}return found}}return statement}}
try{const request={...c.request,sendId:c.request.sendId+'-'+process.argv[3]};const saved=fileStableUpgradeNotice(c.project,request,c.actor,()=>c.from);console.log(JSON.stringify({ok:true,original:saved.original}))}catch(error){console.log(JSON.stringify({ok:false,error:String(error.message)}))}finally{sqlite.close()}
`, { mode: 0o600 })
  function launch(name: string) {
    const child = spawn(process.execPath, ['--import', 'tsx', worker, config, name], { cwd: root, env: { ...process.env, MOLE_OFFICE_DB: t.file }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(join(proof, `${name}.process.json`), JSON.stringify({ pid: child.pid, pgid: child.pid, worker, config }), { mode: 0o600 })
    children.push(child)
    let output = ''
    child.stdout!.on('data', data => { output += data }); child.stderr!.on('data', data => { output += data })
    const done = new Promise<any>((yes, no) => {
      child.once('error', no)
      child.once('close', code => { writeFileSync(join(proof, `${name}.log`), output, { mode: 0o600 }); if (code !== 0) no(new Error(output)); else yes(JSON.parse(output.trim().split('\n').at(-1)!)) })
    })
    return done
  }
  const a = launch('A')
  const deadline = Date.now() + 20_000
  while (!existsSync(barrier)) { if (Date.now() > deadline) throw new Error('Fixture A never reached the reservation barrier.'); await delay(10) }
  const b = await launch('B')
  writeFileSync(release, 'resume A', { mode: 0o600 })
  const results = [await a, b]
  writeFileSync(join(proof, 'results.json'), JSON.stringify(results), { mode: 0o600 })
  // Specific implementation mutation: remove only fileStableUpgradeNotice's outer transaction.
  expect(results.filter(result => result.ok)).toHaveLength(1)
  const rows = t.client.sqlite.prepare("SELECT record_id FROM revisions WHERE seq=1 AND json_extract(data,'$.extra.stableUpgradeNotice.request.announcement.authority.decision.id')=?").all(f.authority.decision.id)
  expect(rows).toHaveLength(1)
  await t.client.sqlite.backup(join(proof, 'final.sqlite'))
})
