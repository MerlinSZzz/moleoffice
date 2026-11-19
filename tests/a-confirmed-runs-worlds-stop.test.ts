// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FrF3zyjDmnOE: CONFIRM stops a run's unshown worlds; C31/C32 keep worlds up for the person.
 * All worlds, process groups and namespaces here are synthetic; no process is started or signalled.
 *
 * Mutations, each alone after the unmutated control and then restored:
 * - Remove the shown-world branch: both "leaves and names a world shown to the person" cases
 *   and "confirmation reports stopped and shown worlds to the reply and run record" turn red (3).
 * - Remove the leader command and working-directory checks before killProcessGroup:
 *   "refuses and names a group in another folder", "checks every member, including a child outside
 *   the checkout", all four "refuses and names an unrelated leader" cases, and
 *   "refuses unknown working directories" turn red (7).
 * - Remove stopTheUnshownWorldsOfARun from confirmTheReport:
 *   "confirmation reports stopped and shown worlds to the reply and run record",
 *   "keeps confirmation and reports a failed outcome write in the reply", and
 *   "confirmation stays written and records the outcome when stopping fails" turn red (3).
 * - Restore the old message append after confirmation: "keeps the closing message the same
 *   with and without worlds and never edits it" turns red (1).
 * - Remove the start-time comparison: "refuses and names a group leader that started after the
 *   recorded world" turns red (1).
 * - Remove the own-group refusal: "refuses and names the office's own process group" turns red (1).
 * - Let stopTheUnshownWorldsOfARun stop a world the ledger says is held: "keeps a world up when a live
 *   ledger row holds one of its ports, and says which row" turns red (1). Round 40.
 * - Take out the refusal of a where.json that does not name both ports and the database: "keeps a world
 *   up whose where.json does not name its ports and its database" turns red (1).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'
import { THE_WORLDS_STOP_KEY } from '../src/shared/worlds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let worlds: typeof import('../src/server/lib/isolated-worlds.ts')
let folder: string
let processes: Map<number, OsProcess & { cwd: string | null; inner?: number; ns?: string }>
let signals: { pgid: number; signal: string }[]
let failSignal: boolean
const HUMAN = { type: 'human', id: THE_PERSON } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  worlds = await import('../src/server/lib/isolated-worlds.ts')
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.renameWorkspace('default', { reviewLevel: 'none' })
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers,
    payload: { handle: 'world-worker', name: 'Synthetic world worker', role: 'worker', workArea: ['src/server/lib'] } })
  expect(registered.statusCode, registered.body).toBe(201)
})

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'confirmed-worlds-'))
  processes = new Map()
  signals = []
  failSignal = false
  const probe: OsProbe = {
    platform: 'synthetic',
    processById: (pid) => processes.get(pid) ?? null,
    processesInGroup: (pgid) => [...processes.values()].filter((one) => one.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...processes.values()].map((p) => ({ pid: p.pid, command: p.command, cwd: p.cwd })) }),
    pidNamespaceOf: (pid) => {
      const p = processes.get(pid)
      return p ? { namespace: p.ns ?? 'host', nspid: p.inner === undefined ? [pid] : [pid, p.inner] } : null
    },
    containerFirstProcess: () => ({ ok: true, pid: 5001 }),
    containers: () => ({ available: true, containers: [{ id: 'a'.repeat(64), name: 'synthetic-sandbox', image: 'synthetic', status: 'Up' }] }),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999999,
    killProcessGroup: (pgid, signal) => {
      if (failSignal) throw new Error('Synthetic signal refusal')
      signals.push({ pgid, signal })
      for (const [pid, p] of processes) if (p.pgid === pgid) processes.delete(pid)
    },
    stopContainer: () => { throw new Error('must never stop a container') },
  }
  res.useOsProbe(probe)
})
afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  rmSync(folder, { recursive: true, force: true })
})
afterAll(async () => { await app?.close(); t?.close() })

function processAt(pid: number, command: string, cwd: string | null = folder, pgid = pid): void {
  processes.set(pid, { pid, pgid, ppid: 1, command, startedAt: '2026-09-30 10:00:00', cwd })
}
function world(name: string, extra: Record<string, unknown> = {}): string {
  const at = join(folder, '.logs', 'isolated', name)
  mkdirSync(at, { recursive: true })
  const file = join(at, 'where.json')
  // A world names its two ports and its database, as tools/isolated-mole-office.mjs writes them, so the
  // ledger can be asked whether a live world holds them before this one is stopped.
  writeFileSync(file, JSON.stringify({ apiPgid: 41, webPgid: 51, apiPort: 40001, webPort: 40002, db: join(at, 'mole-office.db'),
    startedAt: '2026-09-30 10:00:00', ...extra }))
  return file
}
function run(extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic world run',
    data: { state: 'running', servingAgent: 'world-worker', workingDirectory: folder, ...extra }, actor: HUMAN }).id
}
function stop(id = run()): string { return worlds.stopTheUnshownWorldsOfARun(t.api.getRecord(id)!).says }
function liveWorld(): void {
  processAt(41, 'node tools/serve-dev.mjs')
  processAt(42, 'node src/server/index.ts', folder, 41)
  processAt(51, 'node /checkout/node_modules/.bin/vite --strictPort')
}

async function confirm(): Promise<{ reply: Record<string, unknown>; runId: string; message: string }> {
  const runId = run()
  // A pre-seal historical run exercises the real confirmation door without inventing a git seal.
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(runId)
  writeDataBypassingTheGate(t, runId, { ...t.api.getRecord(runId)!.data, state: 'finished' })
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${runId}/confirm`, headers, payload: { because: 'Synthetic accepted report' } })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as Record<string, unknown>
  return { reply: body, runId, message: String(t.api.getRecord(String(body['toTheWorker']))!.data['body']) }
}

describe('a confirmed run releases only its unshown worlds', () => {
  it.each(['node tools/serve-dev.mjs', 'node /checkout/src/server/index.ts', 'tsx watch src/server/index.ts'])('stops both checked groups with SIGTERM (%s)', (command) => {
    const file = world('test')
    const before = readFileSync(file, 'utf8')
    liveWorld()
    processAt(41, command)
    expect(stop()).toContain('World "test": API group was stopped with SIGTERM; browser group was stopped with SIGTERM')
    expect(signals).toEqual([{ pgid: 41, signal: 'SIGTERM' }, { pgid: 51, signal: 'SIGTERM' }])
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
  it.each([{ worldAtTheOffice: 'world-row' }, { registeredWith: 'http://synthetic.invalid' }])('leaves and names a world shown to the person (%j)', (mark) => {
    world('shown', mark)
    liveWorld()
    expect(stop()).toContain('World "shown" was left for the person')
    expect(signals).toEqual([])
  })
  it('refuses and names a group in another folder', () => {
    world('wrong-folder')
    processAt(41, 'node src/server/index.ts', '/other-checkout')
    processAt(51, 'vite', '/other-checkout')
    expect(stop()).toMatch(/World "wrong-folder".*outside the run checkout/)
    expect(signals).toEqual([])
  })
  it('checks every member, including a child outside the checkout', () => {
    world('unsafe-child')
    liveWorld()
    processAt(42, 'node src/server/index.ts', '/other-checkout', 41)
    const outcome = worlds.stopTheUnshownWorldsOfARun(t.api.getRecord(run())!)
    expect(outcome.says).toContain('process 42 works in /other-checkout')
    expect(outcome.stopped).toEqual(['unsafe-child'])
    expect(outcome.notChecked).toEqual(['unsafe-child'])
    expect(signals).toEqual([{ pgid: 51, signal: 'SIGTERM' }])
  })
  it('refuses and names a group leader that started after the recorded world', () => {
    world('later-group')
    liveWorld()
    processes.get(41)!.startedAt = '2026-09-30 10:00:01'
    processes.get(51)!.startedAt = '2026-09-30 10:00:01'
    const outcome = worlds.stopTheUnshownWorldsOfARun(t.api.getRecord(run())!)
    expect(outcome.says).toMatch(/World "later-group".*leader started at 2026-09-30 10:00:01, after where.json startedAt 2026-09-30 10:00:00/)
    expect(outcome.stopped).toEqual([])
    expect(outcome.notChecked).toEqual(['later-group'])
    expect(signals).toEqual([])
  })
  it("refuses and names the office's own process group", () => {
    world('own-group', { apiPgid: 999999, webPgid: 999999 })
    processAt(999999, 'node src/server/index.ts')
    const outcome = worlds.stopTheUnshownWorldsOfARun(t.api.getRecord(run())!)
    expect(outcome.says).toMatch(/World "own-group".*Mole Office's own process group, 999999/)
    expect(outcome.stopped).toEqual([])
    expect(outcome.notChecked).toEqual(['own-group'])
    expect(signals).toEqual([])
  })
  it.each(['sleep 100', 'sh -c node tools/serve-dev.mjs', 'node fake-vite', 'node tools/serve-dev.mjs.backup'])('refuses and names an unrelated leader (%s)', (command) => {
    world('wrong-command')
    processAt(41, command)
    processAt(51, command)
    expect(stop()).toMatch(/World "wrong-command".*leader is not a world API or Vite/)
    expect(signals).toEqual([])
  })
  it('names a world already gone', () => {
    world('gone')
    expect(stop()).toContain('World "gone": API group is already gone; browser group is already gone')
    expect(signals).toEqual([])
  })
  it('says when the run has no working directory, folder, or recorded worlds', () => {
    expect(stop(run({ workingDirectory: undefined }))).toContain('No working directory was recorded')
    expect(stop()).toContain('no isolated-world folder')
    mkdirSync(join(folder, '.logs', 'isolated'), { recursive: true })
    expect(stop()).toContain('no recorded test worlds')
    expect(signals).toEqual([])
  })
  it('names unreadable files and invalid group numbers without signalling', () => {
    const file = world('broken')
    writeFileSync(file, 'null')
    world('bad-pids', { apiPgid: -1, webPgid: '51' })
    world('missing-start', { startedAt: undefined })
    world('unreadable-start', { startedAt: 'not a time' })
    liveWorld()
    const says = stop()
    expect(says).toContain('World "broken" could not be checked')
    expect(says).toMatch(/World "bad-pids".*not a positive whole number/)
    expect(says).toMatch(/World "missing-start".*where.json startedAt is missing or could not be read/)
    expect(says).toMatch(/World "unreadable-start".*where.json startedAt is missing or could not be read/)
    expect(signals).toEqual([])
  })
  it('refuses unknown working directories', () => {
    world('unknown')
    processAt(41, 'node src/server/index.ts', null)
    processAt(51, 'vite', null)
    expect(stop()).toContain('a folder that could not be read')
    expect(signals).toEqual([])
  })
  it('maps sandbox pids through its namespace before checking and signalling host groups', () => {
    world('sandbox-world', { apiPgid: 8, webPgid: 9 })
    processAt(8, 'node src/server/index.ts') // same small number, on the host: must survive
    processAt(9, 'vite')
    processAt(5001, 'docker-init')
    processAt(5040, 'node tools/serve-dev.mjs')
    processAt(5050, 'vite')
    for (const [host, inner] of [[5001, 1], [5040, 8], [5050, 9]]) {
      Object.assign(processes.get(host!)!, { inner, ns: 'sandbox' })
    }
    const id = run()
    const container = res.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'container', key: 'synthetic-sandbox', actor: HUMAN })
    const says = stop(run({ sandbox: { template: 'synthetic', container: container.id, folder } }))
    expect(says).toContain('was stopped with SIGTERM')
    expect(signals).toEqual([{ pgid: 5040, signal: 'SIGTERM' }, { pgid: 5050, signal: 'SIGTERM' }])
    expect(processes.has(8)).toBe(true)
    expect(processes.has(9)).toBe(true)
  })
  it('never falls back to host pids when the sandbox cannot be checked', () => {
    world('unknown-sandbox')
    liveWorld()
    expect(stop(run({ sandbox: { template: 'synthetic', container: 'missing', folder } }))).toContain('no live container row')
    expect(signals).toEqual([])
  })
  it('confirmation reports stopped and shown worlds to the reply and run record', async () => {
    world('test')
    const broken = world('broken')
    writeFileSync(broken, 'null')
    world('shown', { worldAtTheOffice: 'shown-row', apiPgid: 61, webPgid: 71 })
    liveWorld()
    const result = await confirm()
    expect(result.reply['says']).toContain('World "test": API group was stopped with SIGTERM')
    expect(result.reply['says']).toContain('World "shown" was left for the person')
    expect(t.api.getRecord(result.runId)!.data[THE_WORLDS_STOP_KEY]).toEqual({
      says: result.reply['worldsSays'], stopped: ['test'], leftForThePerson: ['shown'], notChecked: ['broken'],
    })
    expect(signals).toHaveLength(2)
    expect(t.api.getRecord(result.runId)!.data['confirmed']).toBeTruthy()
  })
  it('keeps the closing message the same with and without worlds and never edits it', async () => {
    const without = await confirm()
    world('test')
    liveWorld()
    const withWorlds = await confirm()
    expect(withWorlds.message.replaceAll(withWorlds.runId, '<run>')).toBe(without.message.replaceAll(without.runId, '<run>'))
    for (const result of [without, withWorlds]) {
      const changes = t.api.listChanges({ workspaceId: 'default', recordId: String(result.reply['toTheWorker']) })
      expect(changes.filter((change) => change.op !== 'create')).toEqual([])
    }
  })
  it('keeps confirmation and reports a failed outcome write in the reply', async () => {
    world('test')
    liveWorld()
    t.client.sqlite.exec(`CREATE TEMP TRIGGER refuse_worlds_outcome BEFORE UPDATE ON records
      WHEN json_extract(NEW.data, '$.${THE_WORLDS_STOP_KEY}') IS NOT NULL
        OR json_extract(NEW.data, '$.extra.${THE_WORLDS_STOP_KEY}') IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'Synthetic outcome storage refusal'); END`)
    try {
      const result = await confirm()
      const record = t.api.getRecord(result.runId)!
      expect(record.data['confirmed']).toBeTruthy()
      expect(record.data[THE_WORLDS_STOP_KEY]).toBeUndefined()
      expect(result.reply['worldsSays']).toContain('The test-world outcome could not be stored on the run:')
      expect(result.reply['worldsSays']).toContain('Synthetic outcome storage refusal')
      expect(result.reply['says']).toContain(String(result.reply['worldsSays']))
      expect(result.message).not.toContain('Synthetic outcome storage refusal')
      expect(signals).toHaveLength(2)
    } finally {
      t.client.sqlite.exec('DROP TRIGGER refuse_worlds_outcome')
    }
  })
  it('confirmation stays written and records the outcome when stopping fails', async () => {
    world('signal-failed')
    liveWorld()
    failSignal = true
    const result = await confirm()
    expect(t.api.getRecord(result.runId)!.data['confirmed']).toBeTruthy()
    expect(result.reply['says']).toMatch(/World "signal-failed".*Synthetic signal refusal/)
    expect(t.api.getRecord(result.runId)!.data[THE_WORLDS_STOP_KEY]).toEqual({
      says: result.reply['worldsSays'], stopped: [], leftForThePerson: [], notChecked: ['signal-failed'],
    })
    expect(signals).toEqual([])
  })
})

// These tests cite a decision.
describe('a confirmed run asks the ledger before it stops a world', () => {
  /** A live process the ledger says serves a world on port 40001, in another checkout, registered by another run. */
  function aLiveWorldOnItsPort(): string {
    processAt(71, 'node src/server/index.ts', '/synthetic/another-checkout')
    return res.registerResource({ workspaceId: 'default', sessionRecordId: run(), type: 'process', key: '71', actor: HUMAN,
      world: { repository: '/synthetic/another-checkout', database: '/synthetic/another-checkout/mole-office.db', databaseIdentity: null,
        port: 40001, head: null, standing: { kind: 'scratch', because: ['a synthetic world'] }, readAt: '2026-09-30 10:00:00', saidBy: 'this test' } }).id
  }
  afterEach(() => { t.client.sqlite.prepare('DELETE FROM session_resources').run() })

  it('keeps a world up when a live ledger row holds one of its ports, and says which row', () => {
    world('held')
    liveWorld()
    const row = aLiveWorldOnItsPort()
    const said = stop()
    expect(said).toContain('World "held" was not stopped, because the ledger says a live world holds what stopping it would free.')
    expect(said).toContain(`Ledger row ${row} (process 71)`)
    expect(signals).toEqual([])
  })
  it('stops a world when the row that names its port is about a process that has gone', () => {
    world('held-by-nobody')
    liveWorld()
    aLiveWorldOnItsPort()
    processes.delete(71)
    expect(stop()).toContain('World "held-by-nobody": API group was stopped with SIGTERM; browser group was stopped with SIGTERM')
    expect(signals).toEqual([{ pgid: 41, signal: 'SIGTERM' }, { pgid: 51, signal: 'SIGTERM' }])
  })
  it('keeps a world up whose where.json does not name its ports and its database', () => {
    world('unnamed', { apiPort: undefined, db: undefined })
    liveWorld()
    expect(stop()).toContain('World "unnamed" was not stopped: its where.json does not name both ports and its database')
    expect(signals).toEqual([])
  })
})
