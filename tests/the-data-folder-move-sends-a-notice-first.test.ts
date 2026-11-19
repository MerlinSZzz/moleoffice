// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Made-up notice receipts and a made-up move engine; no live service or owner words. */
import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { versionOf } from '../src/server/lib/version.ts'
import { commandThatStopsWithItsOwner, freshDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp } from '../src/shared/time.ts'
import { linuxProcessReader } from '../src/config/process-reader.mjs'

const implementation = new URL('../tools/stable/move-the-data-folder.mjs', import.meta.url).href
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const pin = { id: 'fixture-decision', seq: 1, contentHash: 'a'.repeat(16) }
function fixture(state = 'moved', refuse = '') {
  const root = mkdtempSync(join(tmpdir(), 'move-notice-')); roots.push(root)
  const recovery = join(root, 'recovery'); mkdirSync(recovery, { mode: 0o700 })
  const scope = { version: 1 as const, action: 'stop-to-move-the-data-folder' as const, database: '/fixture/checkout/data/invented.db',
    checkout: '/fixture/checkout', port: 29991, targetFolder: '/fixture/private-data', targetMode: '700' as const, backup: { path: '/fixture/backup.db', sha256: Buffer.alloc(32, 7).toString('base64') } }
  const events: string[] = [], filed = new Map<string, any>(), payloads: any[] = []
  const officeRequest: any = async (input: any) => {
    // The office's registry row, whose id the notice tools compare each notice's sender with.
    if (input.method === 'GET' && input.path === '/api/participants/agent/mole-office') return { status: 200, cut: false, location: null, body: JSON.stringify({ participant: { id: 'mole-office', handle: 'mole-office', retired: false } }) }
    if (input.method === 'GET') return { status: 200, cut: false, location: null, body: JSON.stringify({ notice: filed.get(new URL('http://fixture' + input.path).searchParams.get('sendId')!) ?? null }) }
    const request = input.body; events.push('notice-' + request.stage); payloads.push(request)
    if (refuse === request.stage) return { status: 409, cut: false, location: null, body: '{"error":"fixture notice refused"}' }
    const event = { version: 3, project: 'fixture-project', date: localStamp(new Date()), request }
    const content = { kind: 'message' as const, title: 'Mole Office', summary: null, deletedAt: null,
      data: { body: request.stage === 'before' ? request.announcement.notice : 'Fixture final notice', notice: 'stableUpgradeNotice',
        sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'person', id: 'fixture-owner' }], extra: { stableUpgradeNotice: event } } }
    const receipt = { original: { id: 'fixture-' + request.stage, seq: 1, contentHash: versionOf(content) }, event, content, replayed: false }
    filed.set(request.sendId, { ...receipt, replayed: true })
    return { status: 201, cut: false, location: null, body: JSON.stringify(receipt) }
  }
  officeRequest.identity = { agent: 'fixture-agent', session: 'fixture-run', project: 'fixture-project' }
  const execute = async (_target: string, options: any) => {
    await options.beforeStop({ scope, decision: pin, reservation: { ...pin, id: 'fixture-reservation' }, recovery, sendId: 'fixture-move' })
    events.push('stop'); events.push(state === 'moved' ? 'health' : 'rollback')
    return { state, recovery, database: state === 'moved' ? '/fixture/private-data/invented.db' : scope.database, registered: true, exitCode: state === 'moved' ? 0 : 1 }
  }
  return { scope, recovery, events, payloads, options: { officeRequest, execute, verifyService: async () => { expect(events).toContain(state === 'moved' ? 'health' : 'rollback') } } }
}
it('files the act, target and expected outage before the first stop and finishes after health', async () => {
  const f = fixture(), m = await import(/* @vite-ignore */ implementation)
  const result = await m.runDataFolderMove(f.scope.targetFolder, f.options)
  expect(f.events).toEqual(['notice-before', 'stop', 'health', 'notice-after'])
  expect(f.payloads[0].announcement.notice).toContain('stop-to-move-the-data-folder')
  expect(f.payloads[0].announcement.notice).toContain(f.scope.targetFolder)
  expect(f.payloads[0].announcement.notice).toMatch(/45.*50/)
  expect(result.notices.state).toBe('filed')
  expect(readFileSync(join(f.recovery, 'notice.jsonl'), 'utf8')).toContain('after-filed')
})
it('refuses before stopping when the Office refuses the BEFORE notice', async () => {
  const f = fixture('moved', 'before'), m = await import(/* @vite-ignore */ implementation)
  await expect(m.runDataFolderMove(f.scope.targetFolder, f.options)).rejects.toThrow(/notice|refused/i)
  expect(f.events).toEqual(['notice-before'])
})
it('files the outcome only after rollback has settled', async () => {
  const f = fixture('restored'), m = await import(/* @vite-ignore */ implementation)
  const result = await m.runDataFolderMove(f.scope.targetFolder, f.options)
  expect(f.events).toEqual(['notice-before', 'stop', 'rollback', 'notice-after'])
  expect(f.payloads[1].outcome.state).toBe('restored'); expect(result.notices.state).toBe('filed')
})
it('retains a failed AFTER delivery without running the move or rollback again', async () => {
  const f = fixture('moved', 'after'), m = await import(/* @vite-ignore */ implementation)
  const result = await m.runDataFolderMove(f.scope.targetFolder, f.options)
  expect(result.state).toBe('moved'); expect(result.notices.state).toBe('pending'); expect(result.exitCode).toBe(1)
  expect(f.events).toEqual(['notice-before', 'stop', 'health', 'notice-after'])
})
it('reports an unverified recovery when the engine throws after its stop', async () => {
  const f = fixture(), m = await import(/* @vite-ignore */ implementation)
  const result = await m.runDataFolderMove(f.scope.targetFolder, { ...f.options, execute: async (_target: string, options: any) => {
    await options.beforeStop({ scope: f.scope, decision: pin, reservation: pin, recovery: f.recovery, sendId: 'fixture-unknown' })
    f.events.push('stop'); throw new Error('fixture engine failure after the stop')
  } })
  expect(result.state).toBe('not-restored'); expect(result.databaseAt).toBe(null)
  expect(result.source).toBe('/fixture/checkout/data'); expect(result.target).toBe(f.scope.targetFolder)
  expect(f.payloads[1].outcome.state).toBe('not-restored')
})
it('files BEFORE before the real engine signals its recorded fixture group', async () => {
  const f = fixture(), checkout = join(f.recovery, '..', 'checkout'), data = join(checkout, 'data')
  mkdirSync(join(checkout, 'tools'), { recursive: true }); mkdirSync(join(data, 'agent-run-keys'), { recursive: true })
  const database = join(data, 'invented.db'), db = new Database(database); db.exec('CREATE TABLE invented(value TEXT)'); db.close()
  writeFileSync(join(data, 'keys.json'), '{"fixture":true}'); writeFileSync(join(data, 'agent-run-keys', 'fixture.key'), 'made up')
  writeFileSync(join(checkout, '.env'), 'MOLE_OFFICE_DB=data/invented.db\n')
  const backup = join(f.recovery, 'backup.db'); writeFileSync(backup, readFileSync(database))
  const code = `import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
const database=path.resolve(fs.readFileSync('.env','utf8').trim().slice('MOLE_OFFICE_DB='.length));const fd=fs.openSync(database,'r');
const s=http.createServer((req,res)=>res.end(JSON.stringify({ok:true,world:{database,repository:process.cwd(),port:s.address().port},process:{pid:process.pid},supervisor:{pid:process.pid},worker:{started:false},repository:{path:process.cwd()},database:{path:database},addresses:{api:'http://127.0.0.1:'+s.address().port}})));
s.listen(Number(process.env.MOLE_OFFICE_PORT),'127.0.0.1',()=>fs.writeFileSync('fixture.port',String(s.address().port)));process.on('SIGTERM',()=>s.close(()=>{fs.closeSync(fd);process.exit(0)}));`
  writeFileSync(join(checkout, 'tools', 'serve-dev.mjs'), code)
  expect(spawnSync('git', ['init', '-q', checkout]).status).toBe(0)
  // The group dies with this worker even after a SIGKILL. exec keeps the pid and its start time, so the
  // group is known at once; the record is read after the made-up serve-dev wrote its port, so it holds
  // serve-dev's argv and not the shell's.
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs', '--built'])
  const child = spawn(watched.command, watched.args, { cwd: checkout, env: { PATH: process.env.PATH, MOLE_OFFICE_PORT: '0' }, detached: true, stdio: 'ignore' })
  const { currentProcessRecord } = await import('../tools/stable/stable-bootstrap-processes.mjs'), { bootstrapProcessIdentity } = await import('../tools/stable/stable-bootstrap-support.mjs')
  const leader = bootstrapProcessIdentity(child.pid!), groups = new Map<number, string>([[leader.pgid, leader.startTime!]])
  let group: any
  try {
    for (let n = 0; n < 200 && !existsSync(join(checkout, 'fixture.port')); n++) await delay(15)
    group = currentProcessRecord(child.pid!)
    // The supervisor's start as the office's ledger holds it: processById writes the reader's moment with localStamp.
    const born = linuxProcessReader().processAt(group.pid)
    if (!born.here || born.unreadable !== undefined) throw new Error(`process ${group.pid} could not be read`)
    const port = Number(readFileSync(join(checkout, 'fixture.port'), 'utf8'))
    Object.assign(f.scope, { checkout, database, port, targetFolder: join(f.recovery, '..', 'private-data'), backup: { path: backup, sha256: createHash('sha256').update(readFileSync(backup)).digest('base64') } })
    f.scope.targetFolder = (await import('node:path')).resolve(f.scope.targetFolder)
    const wrapped: any = async (input: any) => {
      if (input.path.startsWith('/api/office/bootstrap-stop-authority')) return { scope: f.scope, decision: pin, state: input.method === 'POST' ? input.body.outcome ? 'consumed' : 'reserved' : 'available', reservation: input.method === 'POST' ? pin : null, caller: { agent: 'fixture-agent', run: 'fixture-run' }, initiator: input.method === 'POST' ? { agent: 'fixture-agent', run: 'fixture-run' } : null }
      if (input.path === '/api/runtime') return (await fetch(`http://127.0.0.1:${port}/api/runtime`)).json()
      if (input.path === '/api/resources' && input.method === 'POST') return { resource: { id: 'fixture-group' } }
      // The move reads the rows of the supervisor's group only, never the whole ledger.
      if (input.method === 'GET' && input.path === `/api/resources?pgid=${group.pgid}`) return { resources: [{ type: 'process', key: String(group.pid), pgid: group.pgid, releasedAt: null, osStartedAt: localStamp(born.startedAt), detail: 'the made-up office supervisor' }] }
      return f.options.officeRequest(input)
    }
    wrapped.identity = f.options.officeRequest.identity
    const m = await import(/* @vite-ignore */ implementation)
    const result = await m.runDataFolderMove(f.scope.targetFolder, { ...f.options, execute: undefined, officeRequest: wrapped, recoveryParent: join(f.recovery, '..'), home: join(f.recovery, 'home'),
      verifyService: async () => {}, onProcess: (p: any) => groups.set(p.pgid, p.groupLeader.startTime), onStep: ({ step, phase }: any) => {
        if (step.startsWith('stop-original-') && phase === 'before') { expect(f.events).toContain('notice-before'); f.events.push('stop') }
        if (step === 'health-target' && phase === 'after') f.events.push('health')
      } })
    expect(result.state, JSON.stringify(result)).toBe('moved'); expect(result.notices.state).toBe('filed')
    expect(f.events).toEqual(['notice-before', 'stop', 'health', 'notice-after'])
  } finally {
    for (const [pgid, birth] of groups) { try { if (bootstrapProcessIdentity(pgid).startTime !== birth) throw new Error('Fixture group changed'); process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e } }
    await delay(100)
  }
})
it('ends its reservation as refused when the Office refuses the BEFORE notice', async () => {
  const t = await freshDb()
  try {
    const actor = (handle: string, role: string) => {
      t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
      const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
      t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
      const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { servingAgent: id, state: 'running' }, actor: t.api.HUMAN })
      return { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id, sessionId: run.id }
    }
    const writer = actor('move-refused-writer', 'worker'), secretary = actor('move-refused-secretary', 'secretary')
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts'); readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
    const server = await import('../src/server/lib/stable-bootstrap-authority.ts')
    const f = fixture(), checkout = join(f.recovery, '..', 'checkout'), data = join(checkout, 'data')
    mkdirSync(join(checkout, 'tools'), { recursive: true }); mkdirSync(join(data, 'agent-run-keys'), { recursive: true })
    const database = join(data, 'invented.db'), db = new Database(database); db.exec('CREATE TABLE invented(value TEXT)'); db.close()
    writeFileSync(join(data, 'keys.json'), '{"fixture":true}'); writeFileSync(join(data, 'agent-run-keys', 'fixture.key'), 'made up')
    writeFileSync(join(checkout, '.env'), 'MOLE_OFFICE_DB=data/invented.db\n')
    const backup = join(f.recovery, 'backup.db'); writeFileSync(backup, readFileSync(database))
    const code = `import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
const database=path.resolve(fs.readFileSync('.env','utf8').trim().slice('MOLE_OFFICE_DB='.length));const fd=fs.openSync(database,'r');
const s=http.createServer((req,res)=>res.end(JSON.stringify({ok:true,world:{database,repository:process.cwd(),port:s.address().port},process:{pid:process.pid},supervisor:{pid:process.pid},worker:{started:false},repository:{path:process.cwd()},database:{path:database},addresses:{api:'http://127.0.0.1:'+s.address().port}})));
s.listen(Number(process.env.MOLE_OFFICE_PORT),'127.0.0.1',()=>fs.writeFileSync('fixture.port',String(s.address().port)));process.on('SIGTERM',()=>s.close(()=>{fs.closeSync(fd);process.exit(0)}));`
    writeFileSync(join(checkout, 'tools', 'serve-dev.mjs'), code)
    expect(spawnSync('git', ['init', '-q', checkout]).status).toBe(0)
    const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs', '--built'])
    const child = spawn(watched.command, watched.args, { cwd: checkout, env: { PATH: process.env.PATH, MOLE_OFFICE_PORT: '0' }, detached: true, stdio: 'ignore' })
    const { currentProcessRecord } = await import('../tools/stable/stable-bootstrap-processes.mjs'), { bootstrapProcessIdentity } = await import('../tools/stable/stable-bootstrap-support.mjs')
    const leader = bootstrapProcessIdentity(child.pid!), groups = new Map<number, string>([[leader.pgid, leader.startTime!]])
    const events: string[] = []
    let group: any, reservationRequest: any = null, decisions = 0
    try {
      for (let n = 0; n < 200 && !existsSync(join(checkout, 'fixture.port')); n++) await delay(15)
      group = currentProcessRecord(child.pid!)
      const born = linuxProcessReader().processAt(group.pid)
      if (!born.here || born.unreadable !== undefined) throw new Error(`process ${group.pid} could not be read`)
      const port = Number(readFileSync(join(checkout, 'fixture.port'), 'utf8'))
      Object.assign(f.scope, { checkout, database, port, targetFolder: join(f.recovery, '..', 'private-data'), backup: { path: backup, sha256: createHash('sha256').update(readFileSync(backup)).digest('base64') } })
      f.scope.targetFolder = (await import('node:path')).resolve(f.scope.targetFolder)
      const ownerDecision = () => {
        const words = 'Made-up owner approves ' + JSON.stringify(f.scope), title = 'Made-up refused move approval ' + (++decisions)
        const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
        const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: f.scope } }, actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
        return { id: decision.id, seq: 1 as const, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(decision.id) as any).content_hash }
      }
      const decisionPin = ownerDecision()
      const wrapped: any = async (input: any) => {
        if (input.method === 'GET' && input.path === '/api/participants/agent/mole-office') return { status: 200, cut: false, location: null, body: JSON.stringify({ participant: { id: 'mole-office', handle: 'mole-office', retired: false } }) }
        if (input.path.startsWith('/api/office/bootstrap-stop-authority')) {
          const request = input.method === 'GET' ? JSON.parse(new URL('http://fixture' + input.path).searchParams.get('request')!) : input.body
          try {
            const result = input.method === 'GET' ? server.readDataFolderMoveAuthority('default', request, writer) : server.reserveDataFolderMoveAuthority('default', request, writer)
            if (input.method === 'POST' && !request.outcome) reservationRequest = request
            return { status: input.method === 'POST' ? 201 : 200, cut: false, location: null, body: JSON.stringify(result) }
          } catch (error: any) {
            if (error?.code === undefined) throw error
            return { status: 409, cut: false, location: null, body: JSON.stringify({ code: error.code, error: error.message }) }
          }
        }
        if (input.method === 'POST' && input.path === '/api/office/upgrades/notice') {
          events.push('notice-before')
          try {
            const result = server.fileDataFolderMoveNotice('default', input.body, writer, () => ({ database: f.scope.database, repository: f.scope.checkout, port: f.scope.port + 1 }))
            return { status: 201, cut: false, location: null, body: JSON.stringify(result) }
          } catch (error: any) {
            if (error?.code === undefined) throw error
            return { status: 409, cut: false, location: null, body: JSON.stringify({ code: error.code, error: error.message }) }
          }
        }
        if (input.path === '/api/runtime') return (await fetch(`http://127.0.0.1:${f.scope.port}/api/runtime`)).json()
        if (input.path === '/api/resources' && input.method === 'POST') return { resource: { id: 'fixture-group' } }
        if (input.method === 'GET' && input.path === `/api/resources?pgid=${group.pgid}`) return { resources: [{ type: 'process', key: String(group.pid), pgid: group.pgid, releasedAt: null, osStartedAt: localStamp(born.startedAt), detail: 'the made-up office supervisor' }] }
        return f.options.officeRequest(input)
      }
      wrapped.identity = { agent: writer.id, session: writer.sessionId, project: 'default' }
      const m = await import(/* @vite-ignore */ implementation)
      const failure = await m.runDataFolderMove(f.scope.targetFolder, { ...f.options, execute: undefined, officeRequest: wrapped, recoveryParent: join(f.recovery, '..'), home: join(f.recovery, 'home'),
        verifyService: async () => {}, onProcess: (p: any) => groups.set(p.pgid, p.groupLeader.startTime), onStep: ({ step, phase }: any) => {
          if (step.startsWith('stop-original-') && phase === 'before') events.push('stop')
        } }).then(() => null, (error: any) => error)
      expect(failure, 'the run throws the BEFORE refusal').toBeTruthy()
      expect(String(failure.message)).toContain('(409)')
      expect(String(failure.message)).toContain('dataMoveNoticeRefused')
      expect(failure.endingFailed, 'the ending succeeded').toBeUndefined()
      expect(events, 'nothing was stopped').toEqual(['notice-before'])
      expect(() => process.kill(-group.pgid, 0), 'the made-up serve-dev group still runs').not.toThrow()
      const consumed = server.readDataFolderMoveAuthority('default', { scope: f.scope, decision: decisionPin, sendId: reservationRequest.sendId }, writer)
      expect(consumed.state).toBe('consumed')
      const ending = t.client.sqlite.prepare("SELECT json_extract(data,'$.extra.dataFolderMoveOutcome.outcome') AS outcome FROM revisions WHERE seq=1 AND kind='note' AND json_extract(data,'$.extra.dataFolderMoveOutcome.reservation.id')=?").all(consumed.reservation!.id)
      expect(ending).toEqual([{ outcome: 'refused' }])
      const nextPin = ownerDecision()
      const lookup = server.readDataFolderMoveAuthority('default', { action: f.scope.action, targetFolder: f.scope.targetFolder }, writer)
      expect(lookup).toMatchObject({ state: 'available', decision: nextPin, reservation: null })
    } finally {
      for (const [pgid, birth] of groups) { try { if (bootstrapProcessIdentity(pgid).startTime !== birth) throw new Error('Fixture group changed'); process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e } }
      await delay(100)
    }
  } finally { t.close() }
}, 60_000)
it('files and looks up a move notice as an original system message through the server library', async () => {
  const t = await freshDb()
  try {
    const actor = (handle: string, role: string) => {
      t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
      const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
      t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
      const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { servingAgent: id, state: 'running' }, actor: t.api.HUMAN })
      return { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id, sessionId: run.id }
    }
    const writer = actor('move-notice-writer', 'worker'), secretary = actor('move-notice-secretary', 'secretary')
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts'); readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
    const f = fixture(), scope = f.scope, words = 'Made-up owner approves ' + JSON.stringify(scope), title = 'Made-up move approval'
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
    const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } }, actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
    const decisionPin = { id: decision.id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(decision.id) as any).content_hash }
    const server = await import('../src/server/lib/stable-bootstrap-authority.ts'), shared = await import('../src/shared/stable-bootstrap-notices.ts')
    const request = { scope, decision: decisionPin, sendId: 'fixture-server-move' }
    const reserved = server.reserveDataFolderMoveAuthority('default', request, writer)
    const before = { kind: 'data-folder-move', stage: 'before', sendId: 'fixture-server-before', announcement: { scope, decision: decisionPin, reservation: reserved.reservation, evidence: decisionPin, moveSendId: request.sendId, notice: shared.dataFolderMoveBeforeText(scope) } }
    const identity = () => ({ database: scope.database, repository: scope.checkout, port: scope.port, commit: 'a'.repeat(40) })
    const receipt = server.fileDataFolderMoveNotice('default', before, writer, identity)
    expect(receipt.content.data.body).toBe(before.announcement.notice)
    expect(server.lookupDataFolderMoveNotice('default', before.sendId, writer)?.notice.original).toEqual(receipt.original)
    expect(() => server.fileDataFolderMoveNotice('default', { ...before, announcement: { ...before.announcement, notice: 'different words' } }, writer, identity)).toThrow()
  } finally { t.close() }
}, 60_000)
it("writes the move's AFTER notice once for its BEFORE notice", async () => {
  const t = await freshDb()
  try {
    const actor = (handle: string, role: string) => {
      t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
      const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
      t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
      const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { servingAgent: id, state: 'running' }, actor: t.api.HUMAN })
      return { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id, sessionId: run.id }
    }
    const writer = actor('move-notice-writer', 'worker'), secretary = actor('move-notice-secretary', 'secretary')
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts'); readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
    const f = fixture(), scope = f.scope, words = 'Made-up owner approves ' + JSON.stringify(scope), title = 'Made-up move approval'
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
    const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } }, actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
    const decisionPin = { id: decision.id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(decision.id) as any).content_hash }
    const server = await import('../src/server/lib/stable-bootstrap-authority.ts'), shared = await import('../src/shared/stable-bootstrap-notices.ts')
    const request = { scope, decision: decisionPin, sendId: 'fixture-server-move' }
    const reserved = server.reserveDataFolderMoveAuthority('default', request, writer)
    const before = { kind: 'data-folder-move', stage: 'before', sendId: 'fixture-server-before', announcement: { scope, decision: decisionPin, reservation: reserved.reservation, evidence: decisionPin, moveSendId: request.sendId, notice: shared.dataFolderMoveBeforeText(scope) } }
    const identity = (database: string) => () => ({ database, repository: scope.checkout, port: scope.port, commit: 'a'.repeat(40) })
    const beforeReceipt = server.fileDataFolderMoveNotice('default', before, writer, identity(scope.database))
    server.reserveDataFolderMoveAuthority('default', { ...request, reservation: reserved.reservation, outcome: 'moved' }, writer)
    const targetDatabase = scope.targetFolder + '/' + scope.database.split('/').at(-1)
    const after = { kind: 'data-folder-move', stage: 'after', sendId: 'fixture-server-after', before: beforeReceipt.original, outcome: { state: 'moved', database: targetDatabase } }
    const receipt = server.fileDataFolderMoveNotice('default', after, writer, identity(targetDatabase))
    expect(receipt.content.data.body).toBe(shared.dataFolderMoveAfterText(after.outcome))
    expect(receipt.replayed).toBe(false)
    expect(server.lookupDataFolderMoveNotice('default', after.sendId, writer)?.notice.original).toEqual(receipt.original)
    const replay = server.fileDataFolderMoveNotice('default', after, writer, identity(targetDatabase))
    expect(replay.original).toEqual(receipt.original)
    expect(replay.replayed).toBe(true)
    let refused: unknown
    try { server.fileDataFolderMoveNotice('default', { ...after, sendId: 'fixture-server-after-again' }, writer, identity(targetDatabase)) } catch (error) { refused = error }
    expect(refused).toMatchObject({ code: 'dataMoveNoticeRefused' })
    const afters = t.client.sqlite.prepare("SELECT record_id FROM revisions WHERE seq=1 AND kind='message' AND json_extract(data,'$.extra.stableUpgradeNotice.request.stage')='after' AND json_extract(data,'$.extra.stableUpgradeNotice.request.before.id')=?").all(beforeReceipt.original.id)
    expect(afters).toHaveLength(1)
  } finally { t.close() }
}, 60_000)
