// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Ended-run caller authorization, durable notices and resource tending.
 * Every real process is this file's own detached child.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it, vi } from 'vitest'
import { apiApp, apiServerArguments, devStackEnvironment, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { ENDED_RUN_LOOK_FIELD } from '../src/shared/ended-run-resources.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type ResourcesLeftOpen } from '../src/shared/groups.ts'

let sharedWorld: Harness | undefined
async function closeSharedWorld() {
  if (sharedWorld === undefined) return
  await sharedWorld.app.close()
  sharedWorld.t.close()
  sharedWorld = undefined
}
afterAll(closeSharedWorld)

async function world(check: (h: Harness) => Promise<void>, isolated = false) {
  if (isolated) await closeSharedWorld()
  const reused = !isolated && sharedWorld !== undefined
  const h = sharedWorld ?? await setup()
  if (!isolated) sharedWorld = h
  if (reused) {
    h.app = (await apiApp()).app
    await h.app.ready()
  }
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date('2026-10-01T12:00:00'))
  if (!isolated) h.t.client.sqlite.exec('SAVEPOINT ended_case')
  try { await check(h) } finally {
    for (const child of h.children) {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) continue
      const exited = once(child, 'exit')
      process.kill(-child.pid, 'SIGKILL')
      await exited
    }
    h.children.length = 0
    await h.app.close()
    if (isolated) {
      if (h.t.client.sqlite.open) h.t.client.sqlite.close()
      h.t.close()
    } else h.t.client.sqlite.exec('ROLLBACK TO ended_case; RELEASE ended_case')
    vi.useRealTimers()
  }
}
async function setup() {
  const t = await freshDb()
  const app = (await apiApp()).app
  await app.ready()
  const res = await import('../src/server/lib/resources.ts')
  // The container is a synthetic row, not a Docker operation. Processes use the real Linux probe.
  res.useOsProbe(Object.assign(Object.create(res.LINUX_PROBE) as typeof res.LINUX_PROBE, {
    containers: () => ({ available: false, reason: 'synthetic container unavailable' }),
  }))
  return { t, app, res, children: [] as ChildProcess[] }
}
type Harness = Awaited<ReturnType<typeof setup>>
function agent(t: TestDb, handle: string, starter?: string, role = 'worker') {
  const name = handle
  handle = handle.toLowerCase().replaceAll(' ', '-')
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: name,
    data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  // THE OWNER BESIDE THE STARTER. Since the owner package the notice follows the recorded owner, and the office records an
  // agent's starter as its owner, so this test writes both, as a real office holds them.
  const by = starter === undefined ? 'person' : 'agent'
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ?, owner_kind = ?, owner_id = ?, role = ? WHERE id = ?')
    .run(by, starter ?? THE_PERSON, by, starter ?? THE_PERSON, role, row.id)
  return row.id
}
function run(h: Harness, servingAgent: string, parentAttachment?: string) {
  return h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'synthetic session',
    data: { state: 'running', runtime: 'claude-code', servingAgent,
      ...(parentAttachment === undefined ? {} : { parentAttachment }) }, actor: h.t.api.HUMAN }).id
}
async function processRow(h: Harness, session: string, exitsOnInputEnd = false) {
  const child = exitsOnInputEnd
    ? spawn(process.execPath, ['-e', 'process.stdin.resume()'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] })
    : spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  h.children.push(child)
  await once(child, 'spawn')
  expect(child.pid).toBeDefined()
  const row = h.res.registerResource({ workspaceId: 'default', sessionRecordId: session,
    type: 'process', key: String(child.pid), actor: h.t.api.HUMAN })
  return { child, row }
}
async function stop(child: ChildProcess) {
  const exited = once(child, 'exit')
  process.kill(-child.pid!, 'SIGKILL')
  await exited
}
function containerRow(h: Harness, session: string, key = 'w13k') {
  return h.res.registerResource({ workspaceId: 'default', sessionRecordId: session,
    type: 'container', key, detail: 'synthetic detail must stay out of the notice', actor: h.t.api.HUMAN })
}
function end(h: Harness, session: string, state = 'finished') {
  h.t.api.patchRecord(session, { dataPatch: { state, ...(state === 'finished' ? { submission: { kind: 'records', records: [session] } } : {}) } }, h.t.api.HUMAN)
}
function look(h: Harness) {
  h.res.lookAgainAtTheEndedRuns('default', () => Date.now() + 180_000)
}
function endAndLook(h: Harness, session: string, state = 'finished') {
  end(h, session, state)
  look(h)
}
function lines(h: Harness, session: string) {
  return (h.t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.sentBy.id') = ? AND json_type(data, '$.extra.resourcesLeftOpen') = 'object'")
    .all(session, moleOffice().id) as { data: string }[]).map(row => JSON.parse(row.data) as {
      body: string; to: { kind: string; id: string }[]; extra: { resourcesLeftOpen: ResourcesLeftOpen }
    })
}
function open(h: Harness, id: string) {
  return (h.t.client.sqlite.prepare('SELECT released_at FROM session_resources WHERE id = ?').get(id) as { released_at: string | null }).released_at === null
}
async function release(h: Harness, id: string, caller: string, human = false, payload: Record<string, unknown> = {}) {
  return h.app.inject({ method: 'POST', url: `/api/resources/${id}/release`, headers: {
    'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': human ? 'human' : 'agent',
    'x-mole-office-actor-id': caller,
  }, payload })
}
async function confirmation(h: Harness, id: string, force = false): Promise<string> {
  const answer = await release(h, id, THE_PERSON, true, force ? { force: true } : {})
  expect(answer.statusCode, answer.body).toBe(400)
  const match = /the sentence back as \{"expect": "\.\.\."\}: "(.*)"/.exec(String(answer.json().error))
  if (match === null) throw new Error(`No confirmation in ${answer.body}`)
  return match[1]!
}
async function fixture(h: Harness) {
  const supervisor = agent(h.t, 'Supervisor')
  const parent = run(h, supervisor)
  await processRow(h, parent)
  const worker = agent(h.t, 'Worker', supervisor)
  return { supervisor, worker, session: run(h, worker, parent) }
}

// Mutation: send item 3's line at the run's end again (main); this case gets an unwanted notice.
it('closes the run’s own process after it exits just after the end, without sending a line or signal', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session, true)
  const signals = vi.spyOn(h.res.LINUX_PROBE, 'killProcessGroup')
  try {
    end(h, f.session)
    expect(open(h, row.id)).toBe(true)
    expect(lines(h, f.session)).toEqual([])
    const exited = once(child, 'exit')
    child.stdin!.end()
    await exited
    expect(child.exitCode).toBe(0)
    look(h)
    expect(open(h, row.id)).toBe(false)
    const stored = h.t.client.sqlite.prepare('SELECT release_note, released_by FROM session_resources WHERE id = ?').get(row.id) as { release_note: string; released_by: string }
    expect(stored.release_note).toBe(`The run ${f.session} ended as finished. Nothing is running as pid ${child.pid}. The row was closed. Nothing was signalled.`)
    expect(stored.released_by).toBe(`system:${theOfficesOwnId(h.t)}`)
    expect(lines(h, f.session)).toEqual([])
    expect(signals).not.toHaveBeenCalled()
  } finally { signals.mockRestore() }
}))

// Mutation: send item 3’s line immediately; the grace-boundary assertions fail.
// Repeated looks also verify that clearing the due mark prevents more work.
it('waits three minutes and tells the supervisor once when a process is still alive at the later look', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  end(h, f.session)
  expect(lines(h, f.session)).toEqual([])
  h.res.lookAgainAtTheEndedRuns('default', () => Date.now() + 179_999)
  expect(lines(h, f.session)).toEqual([])
  look(h)
  expect(open(h, row.id)).toBe(true)
  expect(child.exitCode).toBeNull()
  expect(lines(h, f.session)).toHaveLength(1)
  expect(lines(h, f.session)[0]!.body).toBe(`Worker's run ${f.session} ended with open resources: process ${child.pid}.`)
  expect(lines(h, f.session)[0]!.to).toEqual([{ kind: 'agent', id: f.supervisor }])
  look(h)
  look(h)
  expect(lines(h, f.session)).toHaveLength(1)
}))

// R7aRhbpnKrRO, inspector wK2To2zvH02U. Mutation: the not-ended branch throws again.
it('silently clears a resumed run’s old mark within one look and looks after its next end once', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  containerRow(h, f.session)
  end(h, f.session)
  const firstMark = h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]
  vi.advanceTimersByTime(60_000)
  end(h, f.session, 'running')
  const revisions = () => h.t.client.sqlite.prepare('SELECT actor_type, actor_id FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(f.session)
  const before = revisions().length
  const logged: string[] = []
  h.res.lookAgainAtTheEndedRuns('default', Date.now, line => logged.push(line))
  expect(logged).toEqual([])
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  expect(revisions()).toHaveLength(before + 1)
  expect(revisions().at(-1)).toEqual({ actor_type: 'system', actor_id: moleOffice().id })
  expect(open(h, row.id)).toBe(true)
  expect(lines(h, f.session)).toEqual([])
  vi.advanceTimersByTime(60_000)
  end(h, f.session)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).not.toBe(firstMark)
  h.res.lookAgainAtTheEndedRuns('default', () => Date.now() + 179_999)
  expect(lines(h, f.session)).toEqual([])
  await stop(child)
  look(h)
  expect(open(h, row.id)).toBe(false)
  expect(lines(h, f.session)).toHaveLength(1)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  look(h)
  endAndLook(h, f.session, 'running')
  endAndLook(h, f.session)
  expect(lines(h, f.session)).toHaveLength(1)
}))

// Mutation: read the delays inside the ledger's try again.

// Like startup.test.ts, start a real office with its own settings; a direct reader test cannot
// prove that a refused delay leaves both the ledger write and the world report reachable.
it.each([
  'MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS',
])('names an unusable %s without blaming or skipping the ledger and world report', async setting => {
  await closeSharedWorld()
  const t = await freshDb()
  let child: ChildProcess | undefined
  try {
    const port = await new Promise<number>((ok, bad) => {
      const probe = createServer()
      probe.on('error', bad)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') {
          probe.close(() => bad(new Error('the probe socket reported no port')))
          return
        }
        probe.close(() => ok(address.port))
      })
    })
    const repo = fileURLToPath(new URL('..', import.meta.url))
    child = spawn(join(repo, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: repo, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...devStackEnvironment(dirname(t.file), port, port, { workspace: 'default' }),
        MOLE_OFFICE_MESSAGE_WORKER: 'off', LOG_LEVEL: 'info', [setting]: 'nonsense' },
    })
    let output = ''
    child.stdout!.on('data', chunk => { output += String(chunk) })
    child.stderr!.on('data', chunk => { output += String(chunk) })
    await once(child, 'spawn')
    const deadline = Date.now() + 60_000
    while (!output.includes('resource watcher could not start') && !output.includes('could not write itself into the ledger') &&
        child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const messages = output.split('\n').map(line => {
      try { return (JSON.parse(line) as { msg?: string }).msg ?? line } catch { return line }
    }).join('\n')
    expect(messages).toContain(`The ended-run resource watcher could not start: ${setting} is "nonsense"; it must be a positive whole number of seconds within the timer's limit.`)
    expect(messages).not.toContain('could not write itself into the ledger')
    expect(messages).toContain('written into the ledger:')
    expect(messages).toContain('this world is registered as')
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).ok).toBe(true)
  } finally {
    if (child?.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close')
      process.kill(-child.pid, 'SIGKILL')
      await closed
    }
    t.close()
  }
}, 90_000)

it.each([
  'MOLE_OFFICE_ENDED_RUN_LOOK_EVERY_SECONDS',
  'MOLE_OFFICE_ENDED_RUN_SWEEP_EVERY_SECONDS',
])('refuses an unusable %s before any resource tick or timer', async setting => world(async h => {
  vi.stubEnv(setting, 'nonsense')
  const log = vi.fn()
  const timer = vi.spyOn(globalThis, 'setInterval')
  try {
    expect(() => h.res.startTheEndedRunResourceTimers(log)).toThrow(
      `${setting} is "nonsense"; it must be a positive whole number of seconds within the timer's limit.`,
    )
    expect(log).not.toHaveBeenCalled()
    expect(timer).not.toHaveBeenCalled()
  } finally { timer.mockRestore(); vi.unstubAllEnvs() }
}))

// End-time mutation: date the look from the ledger's last ended-state write instead of the mark; both edits defer it.
it.each(['state patch', 'whole data'])('keeps the later look due at the original end after a %s', async how => world(async h => {
  const f = await fixture(h)
  await processRow(h, f.session)
  end(h, f.session, 'orphaned')
  vi.advanceTimersByTime(60_000)
  if (how === 'state patch') end(h, f.session)
  else h.t.api.patchRecord(f.session, { data: { ...h.t.api.getRecord(f.session)!.data, detail: 'synthetic later edit' } }, h.t.api.HUMAN)
  vi.advanceTimersByTime(119_999)
  h.res.lookAgainAtTheEndedRuns('default')
  expect(lines(h, f.session)).toEqual([])
  vi.advanceTimersByTime(1)
  h.res.lookAgainAtTheEndedRuns('default')
  expect(lines(h, f.session)).toHaveLength(1)
}))

// Mutation: do not start the sweep timer; disabling due looks isolates the regular sweep.
it('automatically sweeps an ended run whose process exits later, without a request or signal', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session, true)
  end(h, f.session)
  const { tendTheEndedRunsResources } = await import('../src/server/index.ts')
  await tendTheEndedRunsResources(h.app)
  // Due looks do not close this row: only the regular sweep can do so in this case.
  vi.stubEnv('MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS', '3600')
  const signals = vi.spyOn(h.res.LINUX_PROBE, 'killProcessGroup')
  try {
    const exited = once(child, 'exit')
    child.stdin!.end()
    await exited
    vi.advanceTimersByTime(299_999)
    expect(open(h, row.id)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(open(h, row.id)).toBe(false)
    expect(lines(h, f.session)).toEqual([])
    expect(signals).not.toHaveBeenCalled()
  } finally { signals.mockRestore(); vi.unstubAllEnvs() }
}))

// Mutation: keep pending looks only in memory; reopening the database loses the notice.
it('recovers a pending look after an office restart and keeps its notice once-only across another restart', async () => world(async h => {
  const f = await fixture(h)
  await processRow(h, f.session)
  const { tendTheEndedRunsResources } = await import('../src/server/index.ts')
  await tendTheEndedRunsResources(h.app)
  end(h, f.session)
  expect(lines(h, f.session)).toEqual([])
  const restart = async () => {
    await h.app.close()
    h.t.client.sqlite.close()
    vi.resetModules()
    h.t.client = await import('../src/server/db/client.ts')
    h.t.api = await import('../src/server/lib/records.ts')
    h.res = await import('../src/server/lib/resources.ts')
    h.app = (await apiApp()).app
    await h.app.ready()
    const server = await import('../src/server/index.ts')
    await server.tendTheEndedRunsResources(h.app)
  }
  vi.advanceTimersByTime(60_000)
  await restart()
  vi.advanceTimersByTime(119_999)
  expect(lines(h, f.session)).toEqual([])
  vi.advanceTimersByTime(1)
  expect(lines(h, f.session)).toHaveLength(1)
  await restart()
  vi.advanceTimersByTime(300_000)
  expect(lines(h, f.session)).toHaveLength(1)
}, true))

// Mutation: visit every ended run with open rows again (first pass); the old run gets an unwanted line.
it('leaves an old unmarked end silent at startup and lets the sweep close its gone process silently', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  // This represents a pre-deployment end, with an open living row and no request for a look.
  h.t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished'), updated_at = ? WHERE id = ?")
    .run('2026-09-30 12:00:00', f.session)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  const { tendTheEndedRunsResources } = await import('../src/server/index.ts')
  await tendTheEndedRunsResources(h.app)
  look(h)
  expect(open(h, row.id)).toBe(true)
  expect(lines(h, f.session)).toEqual([])
  await stop(child)
  h.res.sweepTheGoneProcessRowsOfEndedRuns('default', { type: 'system', id: moleOffice().id })
  expect(open(h, row.id)).toBe(false)
  expect(lines(h, f.session)).toEqual([])
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  look(h)
  expect(lines(h, f.session)).toEqual([])
}))

// Mutation: one project transaction and one catch again; the unreadable first run prevents the other's line.
it('logs an unreadable marked run, leaves it pending, and looks at another marked run in the same tick', async () => world(async h => {
  const bad = await fixture(h)
  containerRow(h, bad.session)
  end(h, bad.session)
  h.t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, ?) WHERE id = ?')
    .run(`$.${ENDED_RUN_LOOK_FIELD}`, 'synthetic unreadable end time', bad.session)
  const good = run(h, bad.worker)
  containerRow(h, good, 'synthetic-good-container')
  end(h, good)
  const logged: string[] = []
  vi.advanceTimersByTime(180_000)
  const stopTimers = h.res.startTheEndedRunResourceTimers(line => logged.push(line))
  try {
    expect(lines(h, bad.session)).toEqual([])
    expect(h.t.api.getRecord(bad.session)!.data[ENDED_RUN_LOOK_FIELD]).toBe('synthetic unreadable end time')
    expect(lines(h, good)).toHaveLength(1)
    expect(logged).toEqual([`Run ${bad.session}'s later resource look failed: Run ${bad.session}'s recorded end time could not be read. Its later look is still pending.`])
    expect(h.t.api.getRecord(good)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
    vi.advanceTimersByTime(30_000)
    expect(logged).toHaveLength(2)
    expect(lines(h, good)).toHaveLength(1)
  } finally { stopTimers() }
}))

// Mutation: omit clearing the due mark after the look; either outcome remains marked and is revisited.
it.each(['line sent', 'nothing left'])('clears the end’s durable look mark after %s and a second look does no work', async outcome => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  end(h, f.session)
  const held = h.t.api.getRecord(f.session)!
  expect(held.data[ENDED_RUN_LOOK_FIELD]).toBe(held.updatedAt)
  const marking = h.t.client.sqlite.prepare('SELECT actor_type, actor_id, new_value FROM changes WHERE record_id = ? AND field = ?')
    .get(f.session, `data.${ENDED_RUN_LOOK_FIELD}`)
  expect(marking).toEqual({ actor_type: 'system', actor_id: moleOffice().id, new_value: held.updatedAt })
  if (outcome === 'nothing left') await stop(child)
  look(h)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  expect(lines(h, f.session)).toHaveLength(outcome === 'line sent' ? 1 : 0)
  expect(open(h, row.id)).toBe(outcome === 'line sent')
  const before = h.t.api.getRecord(f.session)!.updatedAt
  const reads = vi.spyOn(h.res.LINUX_PROBE, 'processById')
  try {
    look(h)
    expect(reads).not.toHaveBeenCalled()
    expect(h.t.api.getRecord(f.session)!.updatedAt).toBe(before)
    expect(lines(h, f.session)).toHaveLength(outcome === 'line sent' ? 1 : 0)
  } finally { reads.mockRestore() }
}))

// Mutation: leave a due mark even when the immediate close leaves no open rows.
it('leaves no look mark when the immediate close leaves no open rows', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  await stop(child)
  end(h, f.session)
  expect(open(h, row.id)).toBe(false)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBeUndefined()
  look(h)
  expect(lines(h, f.session)).toEqual([])
}))

// Mutation: allow callers to forge, change or remove the office's mark; old runs can ask for a line by hand.
it('refuses a caller’s look mark on create, patch and replacement while allowing an unchanged round trip', async () => world(async h => {
  const f = await fixture(h)
  const refusal = 'Only the office writes or clears a run’s later resource look mark.'
  expect(() => h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'synthetic forged mark',
    data: { state: 'finished', [ENDED_RUN_LOOK_FIELD]: '2026-09-30 12:00:00' }, actor: h.t.api.HUMAN })).toThrow(refusal)
  containerRow(h, f.session)
  end(h, f.session)
  const stored = h.t.api.getRecord(f.session)!.data
  for (const value of [null, '2026-09-30 12:00:00']) {
    expect(() => h.t.api.patchRecord(f.session, { dataPatch: { [ENDED_RUN_LOOK_FIELD]: value } }, h.t.api.HUMAN)).toThrow(refusal)
  }
  const omitted = { ...stored }
  delete omitted[ENDED_RUN_LOOK_FIELD]
  expect(() => h.t.api.patchRecord(f.session, { data: omitted }, h.t.api.HUMAN)).toThrow(refusal)
  h.t.api.patchRecord(f.session, { data: { ...stored, detail: 'synthetic round trip' } }, h.t.api.HUMAN)
  expect(h.t.api.getRecord(f.session)!.data[ENDED_RUN_LOOK_FIELD]).toBe(stored[ENDED_RUN_LOOK_FIELD])
}))

// Mutation: put back the unreadable-run throw; this direct call throws instead of answering.
it('answers with a reason and writes no message when the run id names no record', async () => world(async h => {
  const messages = () => h.t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message'").all()
  const before = messages()
  expect(h.res.tellTheSuperiorWhatARunLeftOpen('synthetic-missing-run', 'default', h.t.api.HUMAN)).toEqual({
    written: false,
    because: 'Run synthetic-missing-run could not be read, so its open resources could not be reported. Nothing was written.',
  })
  expect(messages()).toEqual(before)
}))

// Mutation: put back the route-to-self throw; neither the run-end write nor the direct call succeeds.
it.each(['run-end write', 'direct call'])('tells the owner when routing reaches the ended agent itself, through a %s', async how => world(async h => {
  const worker = agent(h.t, 'Worker')
  // A synthetic self-starter and self-owner is a real registry row. The owner walk ends a chain that comes back to
  // its addressee as broken and names nobody, so the notice goes to the owner.
  h.t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ?, owner_kind = ?, owner_id = ? WHERE id = ?').run('agent', worker, 'agent', worker, worker)
  const session = run(h, worker)
  await processRow(h, run(h, worker))
  if (how === 'direct call') endAndLook(h, session)
  containerRow(h, session)
  if (how === 'direct call') {
    expect(h.res.tellTheSuperiorWhatARunLeftOpen(session, 'default', h.t.api.HUMAN)).toEqual({
      written: true,
      because: `Run ${session}'s resource notice named nobody. The owner was told because the owner is the routing walk's last stop.`,
    })
  } else endAndLook(h, session)
  expect(h.t.api.getRecord(session)!.data['state']).toBe('finished')
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'person', id: THE_PERSON }])
  expect(lines(h, session)[0]!.body).toBe(`Worker's run ${session} ended with open resources: container w13k.`)
}))

// Mutation: remove the new permission check; a stranger signals the stand-in and closes its row.
it('refuses another agent with 403, names who may stop it, and leaves process and row open', async () => world(async h => {
  const f = await fixture(h)
  const stranger = agent(h.t, 'Stranger')
  const { child, row } = await processRow(h, f.session)
  endAndLook(h, f.session)
  const answer = await release(h, row.id, stranger, false, { expect: await confirmation(h, row.id) })
  expect(answer.statusCode, answer.body).toBe(403)
  expect(answer.json().error).toBe(`Only Worker, Supervisor, a secretary, or the person may stop process ${child.pid} after its registering session has ended.`)
  expect(open(h, row.id)).toBe(true)
  expect(child.exitCode).toBeNull()
  expect(h.res.LINUX_PROBE.processById(child.pid!)).not.toBeNull()
}))

// Mutation: admit the whole registered chain again (the first pass), past the first secretary.
// Shared-walk mutation: omit the first-secretary stop; routing may also reach Higher past it.
it('refuses Higher above the secretary told what the worker left open, without naming Higher or signalling the process', async () => world(async h => {
  const higher = agent(h.t, 'Higher')
  await processRow(h, run(h, higher))
  const secretary = agent(h.t, 'Secretary', higher, 'secretary')
  await processRow(h, run(h, secretary))
  const worker = agent(h.t, 'Worker', secretary)
  const session = run(h, worker)
  const { child, row } = await processRow(h, session)
  endAndLook(h, session)
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: secretary }])
  const signals = vi.spyOn(h.res.LINUX_PROBE, 'killProcessGroup')
  try {
    const answer = await release(h, row.id, higher, false, { expect: await confirmation(h, row.id) })
    expect(answer.statusCode, answer.body).toBe(403)
    expect(answer.json().error).toBe(`Only Worker, Secretary, a secretary, or the person may stop process ${child.pid} after its registering session has ended.`)
    expect(answer.json().error).not.toContain('Higher')
    expect(signals).not.toHaveBeenCalled()
    expect(open(h, row.id)).toBe(true)
    expect(child.signalCode).toBeNull()
    expect(h.res.LINUX_PROBE.processById(child.pid!)).not.toBeNull()
  } finally { signals.mockRestore() }
}))

// Shared-walk mutation: omit the secretary-addressee stop; its starter is admitted and signalled.
it('refuses the starter of a registering secretary because routing visits no chain', async () => world(async h => {
  const higher = agent(h.t, 'Higher')
  await processRow(h, run(h, higher))
  const secretary = agent(h.t, 'Secretary', higher, 'secretary')
  const session = run(h, secretary)
  const { child, row } = await processRow(h, session)
  endAndLook(h, session)
  const signals = vi.spyOn(h.res.LINUX_PROBE, 'killProcessGroup')
  try {
    const answer = await release(h, row.id, higher, false, { expect: await confirmation(h, row.id) })
    expect(answer.statusCode, answer.body).toBe(403)
    expect(answer.json().error).toBe(`Only Secretary, a secretary, or the person may stop process ${child.pid} after its registering session has ended.`)
    expect(signals).not.toHaveBeenCalled()
    expect(open(h, row.id)).toBe(true)
    expect(child.signalCode).toBeNull()
    expect(h.res.LINUX_PROBE.processById(child.pid!)).not.toBeNull()
  } finally { signals.mockRestore() }
  // The notice follows the secretary's recorded owner, as any agent's does since the owner package.
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: higher }])
}))

// Mutation: omit the registered chain from the stop rule; the told supervisor gets 403 again.
it('lets the told registered supervisor stop a worker’s resource when its run has no parent', async () => world(async h => {
  const supervisor = agent(h.t, 'Supervisor')
  await processRow(h, run(h, supervisor))
  const worker = agent(h.t, 'Worker', supervisor)
  const session = run(h, worker)
  expect(h.t.api.getRecord(session)!.data['parentAttachment']).toBeUndefined()
  const { child, row } = await processRow(h, session)
  endAndLook(h, session)
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: supervisor }])
  const answer = await release(h, row.id, supervisor, false, { expect: await confirmation(h, row.id) })
  expect(answer.statusCode, answer.body).toBe(200)
  expect(answer.json().acted).toBe(true)
  expect(open(h, row.id)).toBe(false)
  expect(h.res.LINUX_PROBE.processById(child.pid!)).toBeNull()
}))

// Shared-walk mutation: keep only the nearest registered starter; the told higher supervisor gets no notice.
// Stop-reader mutation: keep only the nearest walk rung; the told higher supervisor gets 403.
it('lets the told higher supervisor stop a resource after routing passes an unreachable supervisor', async () => world(async h => {
  const higher = agent(h.t, 'Higher')
  await processRow(h, run(h, higher))
  const supervisor = agent(h.t, 'Supervisor', higher)
  h.t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(supervisor)
  const worker = agent(h.t, 'Worker', supervisor)
  const session = run(h, worker)
  const { child, row } = await processRow(h, session)
  endAndLook(h, session)
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: higher }])
  const answer = await release(h, row.id, higher, false, { expect: await confirmation(h, row.id) })
  expect(answer.statusCode, answer.body).toBe(200)
  expect(answer.json().acted).toBe(true)
  expect(open(h, row.id)).toBe(false)
  expect(h.res.LINUX_PROBE.processById(child.pid!)).toBeNull()
}))

// Mutations: omit chain names, append the parent starter first, or stop deduplicating agent ids.
// Each gives the wrong full 403; removing the permission check instead stops the stand-in.
it.each(['parent in the chain', 'different parent starter', 'chain loops to worker'])('refuses an outside agent and names each admitted agent once: %s', async how => world(async h => {
  const higher = agent(h.t, 'Higher')
  const supervisor = agent(h.t, 'Supervisor', higher)
  const worker = agent(h.t, 'Worker', supervisor)
  if (how === 'chain loops to worker') {
    h.t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('agent', worker, higher)
  }
  const parentStarter = how === 'different parent starter' ? agent(h.t, 'Session starter') : supervisor
  const session = run(h, worker, run(h, parentStarter))
  const stranger = agent(h.t, 'Stranger')
  const { child, row } = await processRow(h, session)
  endAndLook(h, session)
  const answer = await release(h, row.id, stranger, false, { expect: await confirmation(h, row.id) })
  expect(answer.statusCode, answer.body).toBe(403)
  const names = `Worker, Supervisor, Higher, ${how === 'different parent starter' ? 'Session starter, ' : ''}`
  expect(answer.json().error).toBe(`Only ${names}a secretary, or the person may stop process ${child.pid} after its registering session has ended.`)
  expect(open(h, row.id)).toBe(true)
  expect(h.res.LINUX_PROBE.processById(child.pid!)).not.toBeNull()
}))

// Mutation: omit registering agent; registering agent in a later session is refused.
// Mutation: omit session starter; starter case is refused (registered starter is deliberately different).
// Mutations: omit the secretary or person exemption; that caller is refused.
it.each(['registering agent in a later session', 'session starter', 'secretary', 'person'])('admits the %s to stop an ended session’s resource', async who => world(async h => {
  const f = await fixture(h)
  const otherStarter = agent(h.t, 'Original registrar')
  h.t.client.sqlite.prepare('UPDATE agents SET started_by_id = ? WHERE id = ?').run(otherStarter, f.worker)
  const { child, row } = await processRow(h, f.session)
  endAndLook(h, f.session)
  const secretary = agent(h.t, 'Secretary', undefined, 'secretary')
  const caller = who === 'person' ? THE_PERSON : who === 'secretary' ? secretary : who === 'session starter' ? f.supervisor : f.worker
  const later = run(h, caller)
  const answer = await h.app.inject({ method: 'POST', url: `/api/resources/${row.id}/release`, headers: {
    'x-mole-office-actor-type': who === 'person' ? 'human' : 'agent', 'x-mole-office-actor-id': caller,
    'x-mole-office-session': later,
  }, payload: { expect: await confirmation(h, row.id) } })
  expect(answer.statusCode, answer.body).toBe(200)
  expect(answer.json().acted).toBe(true)
  expect(open(h, row.id)).toBe(false)
  expect(h.res.LINUX_PROBE.processById(child.pid!)).toBeNull()
}))

// Mutations: remove the running refusal, apply the ended-run rule to live runs, or apply it before the gone-row close.
it.each(['running', 'ended'])('keeps the running refusal and force, and lets any caller close a gone row while its session is %s', async state => world(async h => {
  const f = await fixture(h)
  const stranger = agent(h.t, 'Stranger')
  const alive = await processRow(h, f.session)
  expect((await release(h, alive.row.id, stranger)).statusCode).toBe(409)
  const forced = await release(h, alive.row.id, stranger, false, { force: true, expect: await confirmation(h, alive.row.id, true) })
  expect(forced.statusCode, forced.body).toBe(200)
  const gone = await processRow(h, f.session)
  if (state === 'ended') endAndLook(h, f.session)
  await stop(gone.child)
  expect((await release(h, gone.row.id, stranger)).statusCode).toBe(200)
  expect(open(h, gone.row.id)).toBe(false)
}))

// Mutation: send to ended agent itself, even though its later run can be reached.
it('routes exactly one short office line above a reachable worker, naming process and container only', async () => world(async h => {
  const f = await fixture(h)
  const { row } = await processRow(h, f.session)
  containerRow(h, f.session)
  await processRow(h, run(h, f.worker))
  endAndLook(h, f.session)
  const notice = lines(h, f.session)
  expect(notice).toHaveLength(1)
  expect(notice[0]!.to).toEqual([{ kind: 'agent', id: f.supervisor }])
  expect(notice[0]!.body).toMatch(new RegExp(`^Worker's run ${f.session} ended with open resources: `))
  expect(notice[0]!.extra.resourcesLeftOpen.resources).toEqual(expect.arrayContaining([{ type: 'process', key: row.key }, { type: 'container', key: 'w13k' }]))
  expect([
    `Worker's run ${f.session} ended with open resources: process ${row.key}, container w13k.`,
    `Worker's run ${f.session} ended with open resources: container w13k, process ${row.key}.`,
  ]).toContain(notice[0]!.body)
  expect(notice[0]!.body).not.toContain('synthetic detail')
}))

// Mutation: send with no open rows; this case gets an unwanted notice.
it('sends nothing when every registered process row is already gone', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  await stop(child)
  endAndLook(h, f.session)
  expect(open(h, row.id)).toBe(false)
  expect(lines(h, f.session)).toEqual([])
}))

// Mutation: remove the stored notice-marker check; another run-to-end transition sends a second line, even after message deletion.
it('orphaned then finished, sweep, release, and another run-to-end transition cannot write a second line', async () => world(async h => {
  const f = await fixture(h)
  const { child, row } = await processRow(h, f.session)
  containerRow(h, f.session)
  endAndLook(h, f.session, 'orphaned')
  expect(lines(h, f.session)).toHaveLength(1)
  endAndLook(h, f.session)
  expect(lines(h, f.session)).toHaveLength(1)
  const sweep = await h.app.inject({ method: 'POST', url: '/api/resources/sweep', headers: {
    'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
  }, payload: {} })
  expect(sweep.statusCode, sweep.body).toBe(200)
  expect(lines(h, f.session)).toHaveLength(1)
  expect((await release(h, row.id, THE_PERSON, true, { expect: await confirmation(h, row.id) })).statusCode).toBe(200)
  expect(lines(h, f.session)).toHaveLength(1)
  h.t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-10-01 12:00:00' WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").run(f.session)
  endAndLook(h, f.session, 'running')
  endAndLook(h, f.session)
  expect(lines(h, f.session)).toHaveLength(1)
}))

// Shared-walk mutation: keep only the nearest starter; the higher reachable agent gets no line.
it('passes an unreachable starter and tells the next reachable one above a supervisor', async () => world(async h => {
  const higher = agent(h.t, 'Higher')
  await processRow(h, run(h, higher))
  const unavailable = agent(h.t, 'Unavailable', higher)
  h.t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(unavailable)
  const supervisor = agent(h.t, 'Supervisor', unavailable)
  const session = run(h, supervisor)
  containerRow(h, session)
  endAndLook(h, session)
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: higher }])
}))

// The owner walk starts at a secretary addressee as at any other, so its recorded owner receives the line.
it('tells the owner when the ended agent holds the secretary card', async () => world(async h => {
  const f = await fixture(h)
  const secretary = agent(h.t, 'Secretary', f.supervisor, 'secretary')
  const session = run(h, secretary)
  containerRow(h, session)
  endAndLook(h, session)
  expect(lines(h, session)).toHaveLength(1)
  expect(lines(h, session)[0]!.to).toEqual([{ kind: 'agent', id: f.supervisor }])
}))

// Mutation: remove the five-resource limit; this case lists seven instead of five.
it('names at most five resource types and keys, then the remaining count', async () => world(async h => {
  const f = await fixture(h)
  for (let i = 0; i < 7; i++) containerRow(h, f.session, `synthetic-${i}`)
  endAndLook(h, f.session)
  const notice = lines(h, f.session)[0]!
  expect(notice.extra.resourcesLeftOpen.resources).toHaveLength(5)
  expect(notice.extra.resourcesLeftOpen.more).toBe(2)
  expect(notice.body.match(/container synthetic-/g)).toHaveLength(5)
  expect(notice.body).toMatch(/, and 2 more\.$/)
}))
