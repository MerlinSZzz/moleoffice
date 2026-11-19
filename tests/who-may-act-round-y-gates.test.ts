// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO WHO-MAY-ACT GATES ON THE MERGE QUEUE: WHO SUBMITS A RUN'S WORK, AND WHO WITHDRAWS AN ENTRY. Wave 13r round Y.
 *
 * SUBMITTING. At block only a run's own agent, the agent that started that agent, the run's own starter or the person
 * may submit the run's work. At off, an agent proved by its own key may also submit any run's work. The entry names it
 * as its submitter, and the gate counts it in the submission's own write, so a submission refused later, for a run with
 * no seal, is not counted. A caller that no key proves to be a registered agent is still refused, is not counted, and is
 * refused in words of its own. A caller with nothing registered is refused at both positions. The hand-over of a
 * resolution asks who is in the run's line too, and the gate does not change who may hand one over.
 *
 * WITHDRAWING. At block only whoever submitted an entry, or the person, may withdraw it. At off, an agent proved by its
 * own key may also withdraw an entry it did not submit, and the entry names who withdrew it. The gate counts it in the
 * withdrawal's own write, so a withdrawal of a final entry, refused at both positions, is not counted. A caller that no
 * key proves is refused in words of its own.
 *
 * TOGETHER. With the first gate off and the second at block, an agent that submits another run's entry is the only agent
 * that may withdraw it, and the run's own agent may not.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The run's line, the submitter and the person go through, with or
 * without a key, and are not counted. An agent with its own key that the door does not let through is refused, and the
 * gate counts the stop. The cases that ask only this run green on the code before round Y, and they are its control run.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said. The words name the run or the entry,
 * so both are asked of the same one.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's two cases about that caller
 * go red. Give that caller at off the words it gets at block, and each door's case back at block goes red. Leave out
 * the count at off, and each door's first case goes red. Leave out the count at block, and each door's case back at
 * block goes red. Count a submission at off where the caller is let through, outside the write, and the case of the run
 * with no seal goes red. A withdrawal is one transaction, so a count anywhere in it is taken back with it: keep its
 * count at off when the withdrawal is then refused, and the case of the final entry goes red. Ask the gate before the
 * run's line, and the case of the run's own agent at off goes red. Let the gate pass a hand-over of a resolution, and
 * the case of the hand-over goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The run's agent, the
 * stranger, every run, every git tree, the repository and every reason are made up. The git trees are made under
 * `.logs/` in this checkout and removed after the file, as the merge queue's doors test does.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKER = 'round-y-worker'
const STRANGER = 'round-y-stranger'
/** A name nothing in the office is registered as. */
const NOBODY = 'round-y-nobody'
const BECAUSE = 'A made-up reason for this test.'

const SUBMITS = 'who-submits-a-merge-entry'
const WITHDRAWS = 'who-withdraws-a-merge-entry'

let t: TestDb
let app: FastifyInstance
const made: string[] = []
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const switched = new Set<string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})
const withNoKey = (handle: string): Record<string, string> => {
  const { 'x-mole-office-key': _key, ...rest } = as(handle)
  return rest
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  // A reply that carries a key is shown with the key hidden, so no log holds one.
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body.replace(/[0-9a-f]{64}/g, '<a key>') }
}

/** The person starts an agent, and the office's answer is kept: its key and its registry id. */
async function start(handle: string, workArea?: string[]): Promise<void> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'worker', ...(workArea === undefined ? {} : { workArea }) })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((one) => one.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `round-y-${prefix}-`))
  made.push(dir)
  return dir
}

/** A made-up git tree with one commit on `work` over `main`, the shape a worker's worktree has. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Made-up round Y fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Made-up baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), `submitted ${String(made.length)}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Made-up submission')
  return dir
}

/** A made-up run of the worker in its own tree, not finished, so it has no seal. */
function anUnsealedRun(): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'A made-up run for round Y',
    workspaceId: 'default',
    actor: { type: 'agent', id: WORKER },
    origin: 'fixture',
    data: { state: 'running', servingAgent: WORKER, cutFrom: 'main', workingDirectory: tree() },
  }).id
}

/** A made-up run of the worker, finished, so the office has sealed it. */
async function aSealedRun(): Promise<string> {
  const run = anUnsealedRun()
  const finished = await call('PATCH', `/api/records/${run}`, as(WORKER), { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  return run
}

const submit = (run: string, headers: Record<string, string>) =>
  call('POST', '/api/merge-queue', headers, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })

const withdraw = (entry: string, headers: Record<string, string>) => call('POST', `/api/merge-queue/${entry}/withdraw`, headers, { because: BECAUSE })

/** The worker submits a sealed run of its own, and the entry's id is answered. */
async function anEntry(): Promise<string> {
  const submitted = await submit(await aSealedRun(), as(WORKER))
  expect(submitted.status, submitted.raw).toBe(201)
  return String(submitted.body.entry?.id ?? '')
}

const mergeEntries = (): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'merge_entry'").get() as { n: number }).n

/** An entry as the scratch database holds it. */
const theEntry = (id: string): string => JSON.stringify(t.client.sqlite.prepare('SELECT data, deleted_at FROM records WHERE id = ?').get(id) ?? null)

const anAgent = (handle: string) => ({ kind: 'agent', id: ids.get(handle) })

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  await start(WORKER, ['work'])
  await start(STRANGER)
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterEach(async () => {
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the two rows', () => {
  it('each is a who-may-act gate only the person moves, at block in both kinds of office, and an agent cannot move it', async () => {
    for (const gate of [SUBMITS, WITHDRAWS]) {
      const row = GATES.find((one) => one.id === gate)
      expect(row, `the gate list has no row "${gate}"`).toMatchObject({
        class: 'process',
        group: 'who-may-act',
        whoMayChange: 'the-person',
        positions: { allowed: ['block', 'off'] },
        defaults: { buildsMoleOffice: 'block', ordinary: 'block' },
        countedBy: 'the-server',
      })
      const moved = await call('POST', '/api/office/settings', as(STRANGER), { changes: [{ name: row!.setting, value: 'off' }], because: 'A made-up reason for a gate' })
      expect(moved.status, `an agent moved "${gate}": ${moved.raw}`).toBeGreaterThanOrEqual(400)
    }
  })
})

describe(`${SUBMITS} at the submission door`, () => {
  it('at off, an agent proved by its own key submits a run outside its line, the entry names it as its submitter, and the gate counts it', async () => {
    await setTheGate(SUBMITS, 'off')
    const run = await aSealedRun()
    const before = counted(SUBMITS)
    const done = await submit(run, as(STRANGER))
    expect(done.status, done.raw).toBe(201)
    expect(done.body.entry?.submittedBy).toEqual(anAgent(STRANGER))
    expect(counted(SUBMITS)).toEqual({ ...before, would_stop: before.would_stop + 1 })
  })

  it('at off, the same agent with no key is refused, nothing is written, and the gate does not count it', async () => {
    await setTheGate(SUBMITS, 'off')
    const run = await aSealedRun()
    const before = counted(SUBMITS)
    const entries = mergeEntries()
    const refused = await submit(run, withNoKey(STRANGER))
    expect(refused.status, refused.raw).toBe(403)
    expect(mergeEntries(), 'a refused submission wrote an entry').toBe(entries)
    expect(counted(SUBMITS), 'a caller with no key was counted').toEqual(before)
  })

  it('back at block, the agent with its own key is refused, nothing is written, the gate counts the stop, and the refusal at off was in words of its own', async () => {
    await setTheGate(SUBMITS, 'off')
    const run = await aSealedRun()
    const entries = mergeEntries()
    const atOff = await submit(run, withNoKey(STRANGER))
    expect(atOff.status, atOff.raw).toBe(403)
    await setTheGate(SUBMITS, 'block')
    const keylessAtBlock = await submit(run, withNoKey(STRANGER))
    expect(keylessAtBlock.status, keylessAtBlock.raw).toBe(403)
    const before = counted(SUBMITS)
    const refused = await submit(run, as(STRANGER))
    expect(refused.status, refused.raw).toBe(403)
    expect(mergeEntries(), 'a refused submission wrote an entry').toBe(entries)
    expect(counted(SUBMITS)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
    // At off an agent with a key may, so the words that say only the run's line may are not true there.
    expect(atOff.error, 'a caller with no key at off was refused in the words it gets at block').not.toBe(keylessAtBlock.error)
    expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
  })

  it("at off, the run's own agent, with or without its key, and the person submit as before, uncounted", async () => {
    await setTheGate(SUBMITS, 'off')
    for (const [who, headers] of [['the worker with its key', as(WORKER)], ['the worker with no key', withNoKey(WORKER)], ['the person', PERSON]] as const) {
      const run = await aSealedRun()
      const before = counted(SUBMITS)
      const done = await submit(run, headers)
      expect(done.status, `${who}: ${done.raw}`).toBe(201)
      expect(counted(SUBMITS), `${who}: a caller in the run's line was counted`).toEqual(before)
    }
  })

  it('at off, a submission the office refuses after the gate, for a run with no seal, is not counted', async () => {
    await setTheGate(SUBMITS, 'off')
    const run = anUnsealedRun()
    const before = counted(SUBMITS)
    const entries = mergeEntries()
    const refused = await submit(run, as(STRANGER))
    expect(refused.status, refused.raw).toBe(409)
    expect(mergeEntries(), 'a refused submission wrote an entry').toBe(entries)
    expect(counted(SUBMITS), 'a submission refused after the gate was counted').toEqual(before)
  })

  it('a caller with nothing registered is refused at both positions, writes nothing, and is not counted', async () => {
    const run = await aSealedRun()
    for (const position of ['block', 'off'] as const) {
      await setTheGate(SUBMITS, position)
      const before = counted(SUBMITS)
      const entries = mergeEntries()
      const refused = await submit(run, withNoKey(NOBODY))
      expect(refused.status, `${position}: ${refused.raw}`).toBe(403)
      expect(mergeEntries(), `${position}: a refused submission wrote an entry`).toBe(entries)
      expect(counted(SUBMITS), `${position}: a caller with nothing registered was counted`).toEqual(before)
    }
  })

  it('at off, an agent with its own key outside the run\'s line still may not hand over a resolution, in the same words as at block, uncounted', async () => {
    const entry = await anEntry()
    const handOver = () => call('POST', `/api/merge-queue/${entry}/resolution`, as(STRANGER), { workingDirectory: '/nowhere-a-made-up-folder' })
    const atBlock = await handOver()
    expect(atBlock.status, atBlock.raw).toBe(403)
    await setTheGate(SUBMITS, 'off')
    const before = counted(SUBMITS)
    const state = theEntry(entry)
    const atOff = await handOver()
    expect(atOff.status, atOff.raw).toBe(403)
    expect(atOff.error, 'the gate changed who may hand over a resolution').toBe(atBlock.error)
    expect(theEntry(entry), 'a refused hand-over changed the entry').toBe(state)
    expect(counted(SUBMITS), 'a refused hand-over was counted').toEqual(before)
  })

  // The control run: nothing in this case switches the gate, so it reads the door as it stands before round Y.
  it("at block, the run's own agent and the person submit uncounted, and an agent outside the line is refused with or without its own key", async () => {
    for (const [who, headers] of [['the worker with its key', as(WORKER)], ['the worker with no key', withNoKey(WORKER)], ['the person', PERSON]] as const) {
      const run = await aSealedRun()
      const before = counted(SUBMITS)
      const done = await submit(run, headers)
      expect(done.status, `${who}: ${done.raw}`).toBe(201)
      expect(counted(SUBMITS), `${who}: a caller the door lets through was counted`).toEqual(before)
    }
    const run = await aSealedRun()
    const entries = mergeEntries()
    const keyed = await submit(run, as(STRANGER))
    const keyless = await submit(run, withNoKey(STRANGER))
    expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
    expect(mergeEntries(), 'a refused submission wrote an entry').toBe(entries)
    expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
  })
})

describe(`${WITHDRAWS} at the withdrawal door`, () => {
  it('at off, an agent proved by its own key withdraws an entry it did not submit, the entry names it, and the gate counts it', async () => {
    await setTheGate(WITHDRAWS, 'off')
    const entry = await anEntry()
    const before = counted(WITHDRAWS)
    const done = await withdraw(entry, as(STRANGER))
    expect(done.status, done.raw).toBe(200)
    expect(done.body.entry?.state).toBe('withdrawn')
    expect(done.body.entry?.withdrawn?.by).toEqual(anAgent(STRANGER))
    expect(counted(WITHDRAWS)).toEqual({ ...before, would_stop: before.would_stop + 1 })
  })

  it('at off, the same agent with no key is refused, the entry is unchanged, and the gate does not count it', async () => {
    await setTheGate(WITHDRAWS, 'off')
    const entry = await anEntry()
    const before = counted(WITHDRAWS)
    const state = theEntry(entry)
    const refused = await withdraw(entry, withNoKey(STRANGER))
    expect(refused.status, refused.raw).toBe(403)
    expect(theEntry(entry), 'a refused withdrawal changed the entry').toBe(state)
    expect(counted(WITHDRAWS), 'a caller with no key was counted').toEqual(before)
  })

  it('back at block, the agent with its own key is refused, the entry is unchanged, the gate counts the stop, and the refusal at off was in words of its own', async () => {
    await setTheGate(WITHDRAWS, 'off')
    const entry = await anEntry()
    const state = theEntry(entry)
    const atOff = await withdraw(entry, withNoKey(STRANGER))
    expect(atOff.status, atOff.raw).toBe(403)
    await setTheGate(WITHDRAWS, 'block')
    const keylessAtBlock = await withdraw(entry, withNoKey(STRANGER))
    expect(keylessAtBlock.status, keylessAtBlock.raw).toBe(403)
    const before = counted(WITHDRAWS)
    const refused = await withdraw(entry, as(STRANGER))
    expect(refused.status, refused.raw).toBe(403)
    expect(theEntry(entry), 'a refused withdrawal changed the entry').toBe(state)
    expect(counted(WITHDRAWS)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
    expect(atOff.error, 'a caller with no key at off was refused in the words it gets at block').not.toBe(keylessAtBlock.error)
    expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
  })

  it('at off, the submitter, with or without its key, and the person withdraw as before, uncounted', async () => {
    await setTheGate(WITHDRAWS, 'off')
    for (const [who, headers] of [['the submitter with its key', as(WORKER)], ['the submitter with no key', withNoKey(WORKER)], ['the person', PERSON]] as const) {
      const entry = await anEntry()
      const before = counted(WITHDRAWS)
      const done = await withdraw(entry, headers)
      expect(done.status, `${who}: ${done.raw}`).toBe(200)
      expect(counted(WITHDRAWS), `${who}: a caller the door lets through was counted`).toEqual(before)
    }
  })

  it('at off, a withdrawal of a final entry is refused as at block, and is not counted', async () => {
    const entry = await anEntry()
    const first = await withdraw(entry, PERSON)
    expect(first.status, first.raw).toBe(200)
    await setTheGate(WITHDRAWS, 'off')
    const before = counted(WITHDRAWS)
    const state = theEntry(entry)
    const refused = await withdraw(entry, as(STRANGER))
    expect(refused.status, refused.raw).toBe(409)
    expect(theEntry(entry), 'a refused withdrawal changed the entry').toBe(state)
    expect(counted(WITHDRAWS), 'a withdrawal refused after the gate was counted').toEqual(before)
  })

  it('a caller with nothing registered is refused at both positions, the entry is unchanged, and it is not counted', async () => {
    const entry = await anEntry()
    for (const position of ['block', 'off'] as const) {
      await setTheGate(WITHDRAWS, position)
      const before = counted(WITHDRAWS)
      const state = theEntry(entry)
      const refused = await withdraw(entry, withNoKey(NOBODY))
      expect(refused.status, `${position}: ${refused.raw}`).toBe(403)
      expect(theEntry(entry), `${position}: a refused withdrawal changed the entry`).toBe(state)
      expect(counted(WITHDRAWS), `${position}: a caller with nothing registered was counted`).toEqual(before)
    }
  })

  // The control run: nothing in this case switches the gate, so it reads the door as it stands before round Y.
  it('at block, the submitter and the person withdraw uncounted, and an agent that did not submit is refused with or without its own key', async () => {
    for (const [who, headers] of [['the submitter with its key', as(WORKER)], ['the submitter with no key', withNoKey(WORKER)], ['the person', PERSON]] as const) {
      const entry = await anEntry()
      const before = counted(WITHDRAWS)
      const done = await withdraw(entry, headers)
      expect(done.status, `${who}: ${done.raw}`).toBe(200)
      expect(counted(WITHDRAWS), `${who}: a caller the door lets through was counted`).toEqual(before)
    }
    const entry = await anEntry()
    const state = theEntry(entry)
    const keyed = await withdraw(entry, as(STRANGER))
    const keyless = await withdraw(entry, withNoKey(STRANGER))
    expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
    expect(theEntry(entry), 'a refused withdrawal changed the entry').toBe(state)
    expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
  })
})

describe('the two gates together', () => {
  it("with the first off and the second at block, the agent that submitted another run's entry may withdraw it, and the run's own agent may not", async () => {
    await setTheGate(SUBMITS, 'off')
    const submitted = await submit(await aSealedRun(), as(STRANGER))
    expect(submitted.status, submitted.raw).toBe(201)
    const entry = String(submitted.body.entry?.id ?? '')
    await setTheGate(WITHDRAWS, 'block')
    const state = theEntry(entry)
    const byItsOwnAgent = await withdraw(entry, as(WORKER))
    expect(byItsOwnAgent.status, byItsOwnAgent.raw).toBe(403)
    expect(theEntry(entry), "the run's own agent changed the entry").toBe(state)
    const before = counted(WITHDRAWS)
    const bySubmitter = await withdraw(entry, as(STRANGER))
    expect(bySubmitter.status, bySubmitter.raw).toBe(200)
    expect(bySubmitter.body.entry?.withdrawn?.by).toEqual(anAgent(STRANGER))
    expect(counted(WITHDRAWS), 'the submitter was counted').toEqual(before)
  })
})
