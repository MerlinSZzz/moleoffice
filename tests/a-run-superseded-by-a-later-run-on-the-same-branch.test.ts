// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { once } from 'node:events'
/**
 * A RUN MAY BE CLOSED AS SUPERSEDED BY A LATER RUN ON THE SAME BRANCH.
 *
 * The decision agrees to item 2 of the secretary's midday report
 * `p0oJZeu-Grdo`. Four runs of that day — `EY8j_o2oBXDe`, `REbs3qDtCR4u`, `O3rNA5Yt2aXp` and
 * `4htrBW1JckoO` — were left standing `inspecting` for ever, and their workers could not be retired,
 * because the branch tip moved after each seal and `verifyRunSeal` then refuses every reading. The
 * later run on the same branch is what finished that piece of work, and the first run was overtaken
 * rather than left owing a check.
 *
 * WHAT IS MEASURED
 *
 *   · the door refuses each wrong case in one sentence naming what is wrong: a `by` that names the
 *     run itself; a later run whose check has not been released and confirmed; a first run already
 *     released, confirmed or superseded; two runs not on the same branch; and a caller who is
 *     neither the run's starter nor the owner;
 *   · it accepts the right case, writes one field on the run's `theCheck`, and the run then reads
 *     as standing `superseded by <run>` without touching its seal, its report or its refusals;
 *   · a superseded run whose seal no longer verifies still answers `GET /api/checks/<run>`, which
 *     is the whole reason the standing exists;
 *   · the retire door that the owner decided on then lets the worker go;
 *   · `GET /api/checks` counts a superseded run apart from a never-released one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 *   CONTROL: this file as committed, run once before any mutation.
 *
 *   MUTATION 1 — make the retire rule stop skipping superseded runs. In
 *   `whatRetiringWhileACheckIsOwed` in src/server/lib/inspection.ts, change
 *   `const isOwed = standing === 'inspecting' || standing === 'rebuttal' || standing === 'reporting'`
 *   so it also counts `|| standing === 'superseded'`. "the retire door lets the worker go once its
 *   run is superseded" goes red; every other case stays green. Restored byte-identical.
 *
 *   MUTATION 2 — stop reading the superseded mark. In `standingOf` in src/shared/releasing.ts,
 *   drop `if (input.superseded !== null) return 'superseded'`. The standing and list cases go red.
 *   Restored byte-identical.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

const directories: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A synthetic repository with one committed change, so a code finish has something to seal. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'superseded-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic superseded fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A check record the office would have written when the run said it was finished. */
function aTheCheck(directory: string): Record<string, unknown> {
  return {
    askedAt: '2026-09-16 12:00:00',
    askedOf: 'an-inspector',
    checkout: { directory, cutFrom: 'main' },
    says: 'The office asked an inspector to check this run.',
  }
}

/**
 * A session written straight into the table, so a standing can be built without the finish door.
 *
 * It goes through `historicalSession`, which inventories the run as legacy-unsealed: that is what
 * stops the finish writer sealing a run whose working directory is this checkout, and it is the
 * same fixture the retire tests use for the same reason.
 */
function aSession(handle: string, data: Record<string, unknown>): string {
  const made = historicalSession(t, {
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `Synthetic run for ${handle}`,
    actor: { type: 'agent', id: handle },
    data: { state: 'finished', servingAgent: handle, ...data },
  })
  return made.id
}

/** The release and confirmation a later run needs before it can supersede anything. */
const A_RELEASE = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-16 12:30:00', how: 'an inspector' as const }
const A_CONFIRMATION = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-16 12:40:00', because: 'The report is sound.' }

/** The later run every accept case uses: released and confirmed, standing `closed`. */
function aClosedLaterRun(handle: string, directory: string): string {
  return aSession(handle, { workingDirectory: directory, released: A_RELEASE, confirmed: A_CONFIRMATION })
}

/** The same later run with a seal, finished through the real finish door. */
async function aFinishedCodeRun(handle: string, directory: string): Promise<string> {
  const id = await app
    .inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(handle),
      payload: {
        kind: 'session',
        title: 'Synthetic sealed run',
        data: { state: 'running', servingAgent: handle, workingDirectory: directory, cutFrom: 'main' },
      },
    })
    .then((reply) => {
      expect(reply.statusCode, reply.body).toBe(201)
      return (reply.json() as { record: { id: string } }).record.id
    })
  const finished = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(finished.statusCode, finished.body).toBe(200)
  return id
}

interface Answer {
  code: number
  said: Record<string, unknown>
}

async function supersede(run: string, by: string, because: string, headers = asAgent(THE_TEST_OFFICES_SECRETARY.handle)): Promise<Answer> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/superseded`,
    headers,
    payload: { by, because },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function standsOf(run: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { stands: Record<string, unknown> }).stands
}

async function retire(handle: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers: AS_THE_PERSON,
    payload: { because: 'the piece of work is done' },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'superseded-worker', name: 'Superseded worker', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'outsider', name: 'Outsider', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'retire-me', name: 'Retire me', role: 'worker', workArea: ['work'] })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
})

describe('the door refuses each wrong case, in one sentence naming what is wrong', () => {
  it('refuses a by that names the run itself', async () => {
    const run = aSession('superseded-worker', { workingDirectory: process.cwd(), theCheck: aTheCheck(process.cwd()) })
    const { code, said } = await supersede(run, run, 'It overtook itself.')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain('cannot be superseded by itself')
    expect(why).toContain('Nothing was written.')
  })

  it('refuses a later run whose check has not been released and confirmed', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aSession('superseded-worker', { workingDirectory: directory })
    const { code, said } = await supersede(run, later, 'The later run overtook it.')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain(`Run ${later} has not been released and confirmed`)
    expect(why).toContain('Nothing was written.')
  })

  it('refuses a first run that was already released', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', {
      workingDirectory: directory,
      theCheck: aTheCheck(directory),
      released: A_RELEASE,
    })
    const later = aClosedLaterRun('superseded-worker', directory)
    const { code, said } = await supersede(run, later, 'The later run overtook it.')
    expect(code).toBe(409)
    expect(String(said['error'])).toContain(`Run ${run} is already released`)
    expect(String(said['error'])).toContain('Nothing was written.')
  })

  it('refuses a first run that was already confirmed', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', {
      workingDirectory: directory,
      theCheck: aTheCheck(directory),
      confirmed: A_CONFIRMATION,
    })
    const later = aClosedLaterRun('superseded-worker', directory)
    const { code, said } = await supersede(run, later, 'The later run overtook it.')
    expect(code).toBe(409)
    expect(String(said['error'])).toContain(`Run ${run} is already confirmed`)
  })

  it('refuses two runs that are not on the same branch', async () => {
    const run = aSession('superseded-worker', { workingDirectory: '/synthetic/checkout/one', theCheck: aTheCheck('/synthetic/checkout/one') })
    const later = aClosedLaterRun('superseded-worker', '/synthetic/checkout/two')
    const { code, said } = await supersede(run, later, 'The later run overtook it.')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain(`Run ${later} is not on the same branch as run ${run}`)
    expect(why).toContain('Nothing was written.')
  })

  it('refuses a caller who is neither the run’s starter nor the owner', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aClosedLaterRun('superseded-worker', directory)
    const { code, said } = await supersede(run, later, 'The later run overtook it.', asAgent('outsider'))
    expect(code).toBe(403)
    const why = String(said['error'])
    expect(why).toContain('is the act of its starter')
    expect(why).toContain('Nothing was written.')
  })
})

describe('the door accepts the right case, and the run then reads superseded', () => {
  it('writes one field and leaves the seal, the report and the refusal as they were', async () => {
    const directory = process.cwd()
    const refusal = {
      by: { kind: 'agent' as const, id: 'an-inspector' },
      at: '2026-09-16 11:00:00',
      missing: ['The report does not name what it read.'],
      chapter: 5,
      group: 'synthetic-group',
      check: 'synthetic-check-message',
    }
    const run = aSession('superseded-worker', {
      workingDirectory: directory,
      theCheck: aTheCheck(directory),
      refused: { ...refusal, reworked: { at: '2026-09-16 11:30:00', because: 'The worker said it was finished again.' } },
    })
    const before = t.api.getRecord(run)!
    const later = aClosedLaterRun('superseded-worker', directory)

    const { code, said } = await supersede(run, later, 'The later run on this branch finished the same work.')
    expect(code, JSON.stringify(said)).toBe(201)
    const stands = said['stands'] as Record<string, unknown>
    expect(stands['standing']).toBe('superseded')
    expect(String(stands['says'])).toContain(`Superseded by run ${later}:`)
    expect(String(stands['says'])).toContain(`agent ${THE_TEST_OFFICES_SECRETARY.handle} closed it as superseded`)
    expect(String(stands['says'])).toContain('The later run on this branch finished the same work.')

    const after = t.api.getRecord(run)!
    // THE CHECK CARRIES THE MARK, AND THE REST OF THE CHECK IS STILL THERE.
    const check = after.data['theCheck'] as Record<string, unknown>
    const mark = check['superseded'] as Record<string, unknown>
    expect(mark['by']).toBe(later)
    // STORED AS THE SECRETARY'S REGISTRY ID, which since criterion I1 is not its handle; the sentence above names the handle.
    const secretary = (t.client.sqlite.prepare(`SELECT id FROM agents WHERE handle = '${THE_TEST_OFFICES_SECRETARY.handle}'`).get() as { id: string }).id
    expect(mark['byWhom']).toEqual({ kind: 'agent', id: secretary })
    expect(mark['because']).toBe('The later run on this branch finished the same work.')
    // A LATER ROUND OF THE SAME BRANCH, SAID AS SUCH: no commit was compared, and the mark claims no containment
    // (message pbdbhR5auhrd; wave 13k round 4).
    // This fixture's later run holds no seal, so no laterCommit is named.
    expect(mark['contains']).toEqual({ how: 'a later round of the same branch', commits: [] })
    expect(typeof mark['at']).toBe('string')
    expect(String(mark['at']).length).toBeGreaterThan(0)
    expect(check['askedAt']).toBe('2026-09-16 12:00:00')
    expect(check['askedOf']).toBe('an-inspector')
    // NOTHING ELSE MOVED: the seal, the report and the refusal are byte for byte what they were.
    expect(after.data['sealedTip']).toEqual(before.data['sealedTip'])
    expect(after.data['refused']).toEqual(before.data['refused'])
    expect(after.data['released']).toEqual(before.data['released'])
    expect(after.data['confirmed']).toEqual(before.data['confirmed'])

    // AND IT READS SUPERSEDED: not an unreleased finish, and waiting on nothing.
    const read = await standsOf(run)
    expect(read['standing']).toBe('superseded')
    expect(read['unreleasedFinish']).toBe(false)
    expect(read['waitingFor']).toBeNull()
    expect(String(read['says'])).toContain(`Superseded by run ${later}`)
  })

  it('allows the owner to close a run this way, not only its starter', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aClosedLaterRun('superseded-worker', directory)
    const { code, said } = await supersede(run, later, 'The owner closed it as superseded.', AS_THE_PERSON)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(((said['stands'] as Record<string, unknown>)['superseded'] as Record<string, unknown>)['byWhom']).toEqual({
      kind: 'person',
      id: THE_PERSON,
    })
  })

  it('refuses a second supersede, so there is one answer to which run overtook it', async () => {
    const directory = process.cwd()
    const run = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aClosedLaterRun('superseded-worker', directory)
    expect((await supersede(run, later, 'The later run overtook it.')).code).toBe(201)
    const { code, said } = await supersede(run, later, 'The later run overtook it.')
    expect(code).toBe(409)
    expect(String(said['error'])).toContain(`Run ${run} is already superseded`)
  })

  it('reads a superseded run whose seal no longer verifies, which is why the standing exists', async () => {
    const directory = tree()
    const first = await aFinishedCodeRun('superseded-worker', directory)
    // THE TIP MOVES AFTER THE SEAL, which is the state of every run of 16 September 2026 that this
    // decision was written for. The sealed commit is reworded first, so HEAD no longer contains it: a
    // commit only added on top of it is read from the sealed commit since wave 13s's round 20
    // (problem Qrcr9t4iT2Id), and would not make the control refuse.
    git(directory, 'commit', '--amend', '-q', '-m', 'The sealed work, reworded')
    writeFileSync(join(directory, 'work', 'a.txt'), 'moved on\n')
    git(directory, 'commit', '-am', 'The follow-up work')
    // CONTROL: before the close, the reading refuses with the moved tip.
    const before = await app.inject({ method: 'GET', url: `/api/checks/${first}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(before.statusCode).toBe(409)
    expect(String((before.json() as { error: string }).error)).toContain('The tip moved after seal')

    const later = await aFinishedCodeRun('superseded-worker', directory)
    writeAVerdictAsItsDoorWould(t, later, { released: A_RELEASE, confirmed: A_CONFIRMATION })
    expect((await supersede(first, later, 'The later run on this branch finished the same work.')).code).toBe(201)

    // THE READING NOW ANSWERS, and the seal is still exactly the seal it was.
    const after = await app.inject({ method: 'GET', url: `/api/checks/${first}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(after.statusCode, after.body).toBe(200)
    const stands = (after.json() as { stands: Record<string, unknown>; submission: { id: string } }).stands
    expect(stands['standing']).toBe('superseded')
    expect(String(stands['says'])).toContain(`Superseded by run ${later}`)
    expect((after.json() as { submission: { id: string } }).submission.id).toBeTruthy()
  })
})

describe('a superseded run no longer blocks the retire door', () => {
  it('refuses the retire while the run is inspecting, and lets the worker go once it is superseded', async () => {
    const directory = process.cwd()
    const run = aSession('retire-me', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aClosedLaterRun('retire-me', directory)

    const blocked = await retire('retire-me')
    expect(blocked.code).toBe(409)
    expect(String(blocked.said['error'])).toContain(`run ${run}`)
    expect(String(blocked.said['error'])).toContain('being checked')

    expect((await supersede(run, later, 'The later run on this branch finished the same work.')).code).toBe(201)

    const allowed = await retire('retire-me')
    expect(allowed.code, JSON.stringify(allowed.said)).toBe(200)
  })
})

describe('the list counts a superseded run apart from a never-released one', () => {
  it('says how many were closed as superseded, and leaves them out of the never-released number', async () => {
    const directory = process.cwd()
    const neverReleased = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const overtaken = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
    const later = aClosedLaterRun('superseded-worker', directory)
    expect((await supersede(overtaken, later, 'The later run overtook it.')).code).toBe(201)

    const reply = await app.inject({ method: 'GET', url: '/api/checks', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { list: { run: string; stands: Record<string, unknown> }[]; says: string }
    const rows = new Map(said.list.map((one) => [one.run, one.stands]))
    expect((rows.get(neverReleased) as Record<string, unknown>)['unreleasedFinish']).toBe(true)
    expect((rows.get(neverReleased) as Record<string, unknown>)['standing']).toBe('inspecting')
    expect((rows.get(overtaken) as Record<string, unknown>)['unreleasedFinish']).toBe(false)
    expect((rows.get(overtaken) as Record<string, unknown>)['standing']).toBe('superseded')
    // THE WORDS CHANGED ON 25 SEPTEMBER 2026: a later run on another branch
    // may now close a run too, so the sentence names both kinds of later run.
    expect(said.says).toContain(
      'closed as superseded by a later run that was on the same branch, or that was checked and merged and holds its commits',
    )
    expect(said.says).toContain('have not been released')
    expect(said.says).toContain('does not end it')
  })
})

/** Mutation: omit this settlement's shared close; the release and rollback assertions fail. */
it('closes only gone process rows in the settlement write and keeps the live process running', async () => {
  const directory = process.cwd()
  const id = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
  const later = aClosedLaterRun('superseded-worker', directory)
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const ended = once(child, 'exit')
  try {
    const live = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor: { type: 'agent' as const, id: 'superseded-worker' } })
    const goneChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    await once(goneChild, 'spawn')
    const goneEnded = once(goneChild, 'exit')
    let gone: ReturnType<typeof resources.registerResource>
    try {
      gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(goneChild.pid!), actor: { type: 'agent' as const, id: 'superseded-worker' } })
    } finally {
      process.kill(-goneChild.pid!, 'SIGTERM')
      await goneEnded
    }
    const stored = (row: string) => t.client.sqlite.prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?').get(row) as { released_at: string | null; release_note: string | null }
    const before = t.api.getRecord(id)!.data
    t.client.sqlite.exec("CREATE TRIGGER refuse_settlement_close BEFORE UPDATE OF released_at ON session_resources BEGIN SELECT RAISE(ABORT, 'synthetic settlement close failure'); END")
    try {
      const refused = await supersede(id, later, 'Synthetic: the later run overtook it.')
      expect(refused.code, JSON.stringify(refused.said)).toBe(409)
      expect(JSON.stringify(refused.said)).toContain('synthetic settlement close failure')
      expect(t.api.getRecord(id)!.data).toEqual(before)
      expect(stored(gone.id).released_at).toBeNull()
    } finally { t.client.sqlite.exec('DROP TRIGGER refuse_settlement_close') }
    const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
    expect(response.code, JSON.stringify(response.said)).toBe(201)
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toMatch(new RegExp(`^The run ${id} ended as superseded\\.`))
    expect(stored(live.id).released_at).toBeNull()
    expect(response.said['says']).toContain(`It closed 1 process row whose process had ended (${gone.id}).`)
    expect(response.said['says']).toContain(`1 process row stays open because its process is still running or could not be read (${live.id}).`)
    expect(child.exitCode).toBeNull()
    expect(child.signalCode).toBeNull()
    expect(resources.processLivenessForRun(id, 'default').some(one => one.state === 'alive')).toBe(true)
  } finally {
    process.kill(-child.pid!, 'SIGTERM')
    await ended
  }
})

/** Mutations: always append a process-row or claim sentence, even when the run holds none. */
it('keeps the answer unchanged when the settled run holds no claims or process rows', async () => {
  const directory = process.cwd()
  const id = aSession('superseded-worker', { workingDirectory: directory, theCheck: aTheCheck(directory) })
  const later = aClosedLaterRun('superseded-worker', directory)
  const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
  expect(response.code, JSON.stringify(response.said)).toBe(201)
  expect(response.said['says']).toBe((response.said['stands'] as { says: string }).says)
})

/** Mutations: restore the state-only guard; use state rather than standing in the settled reason.
 * The synthetic run says it finished through closedHow, while its stored state remains running. */
it('closes a running run’s gone row at settlement with its settled reason and keeps its live process running', async () => {
  const directory = process.cwd()
  const id = aSession('superseded-worker', { state: 'running', closedHow: 'agent-said', workingDirectory: directory, theCheck: aTheCheck(directory) })
  const later = aClosedLaterRun('superseded-worker', directory)
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const ended = once(child, 'exit')
  try {
    const live = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor: { type: 'agent' as const, id: 'superseded-worker' } })
    const goneChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    await once(goneChild, 'spawn')
    const goneEnded = once(goneChild, 'exit')
    let gone: ReturnType<typeof resources.registerResource>
    try {
      gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(goneChild.pid!), actor: { type: 'agent' as const, id: 'superseded-worker' } })
    } finally {
      process.kill(-goneChild.pid!, 'SIGTERM')
      await goneEnded
    }
    const stored = (row: string) => t.client.sqlite.prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?').get(row) as { released_at: string | null; release_note: string | null }
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
    const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
    expect(response.code, JSON.stringify(response.said)).toBe(201)
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toMatch(new RegExp(`^The run ${id} ended as superseded\\.`))
    expect(stored(live.id).released_at).toBeNull()
    expect(response.said['says']).toContain(`It closed 1 process row whose process had ended (${gone.id}).`)
    expect(response.said['says']).toContain(`1 process row stays open because its process is still running or could not be read (${live.id}).`)
    expect(child.exitCode).toBeNull()
    expect(child.signalCode).toBeNull()
    expect(resources.processLivenessForRun(id, 'default').some(one => one.state === 'alive')).toBe(true)
  } finally {
    process.kill(-child.pid!, 'SIGTERM')
    await ended
  }
})

/** Mutation: restore the old settlement code without its claims call. */
it('ends a running run’s claim at settlement and tells its overlap group', async () => {
  const directory = process.cwd()
  const id = aSession('superseded-worker', { state: 'running', workingDirectory: directory, theCheck: aTheCheck(directory) })
  const later = aClosedLaterRun('superseded-worker', directory)
  const claims = await import('../src/server/lib/claims.ts')
  const participants = await import('../src/server/lib/participants.ts')
  const actor = { type: 'agent' as const, id: 'superseded-worker' }
  const claimant = { kind: 'agent' as const, id: participants.agentByHandle(actor.id)!.id }
  const things = [{ what: 'path' as const, id: 'work/synthetic-claim' }]
  const first = claims.fileAClaim({ workspaceId: 'default', claimant, run: id, things }, actor)
  const other = historicalSession(t, { workspaceId: 'default', kind: 'session', title: 'Synthetic overlapping run', origin: 'fixture', actor: personActor(), data: { state: 'running' } }).id
  const second = claims.fileAClaim({ workspaceId: 'default', claimant: { kind: 'person', id: personActor().id }, run: other, things }, personActor())
  expect(second.groups).toHaveLength(1)
  t.api.patchRecord(id, { dataPatch: { closedHow: 'agent-said' } }, actor)
  const stored = () => t.client.sqlite.prepare('SELECT released_at, released_because FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null; released_because: string | null }
  expect(t.api.getRecord(id)!.data['state']).toBe('running')
  expect(stored().released_at).toBeNull()
  const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
  expect(response.code, JSON.stringify(response.said)).toBe(201)
  expect(stored().released_at).not.toBeNull()
  expect(stored().released_because).toBe('The run it belonged to was closed as superseded.')
  expect(response.said['says']).toContain(` It ended 1 claim (${first.claim.id}).`)
  const messages = await import('../src/server/lib/messages.ts')
  const { THE_OVERLAP_ENDED_PREFIX } = await import('../src/shared/groups.ts')
  const ended = messages.messagesInAGroup(second.groups[0]!, messages.EVERY_PROJECT).filter(one => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
  expect(ended).toHaveLength(1)
  expect(ended[0]!.body).toContain('run ended')
})

/** Mutation: move the claims call after the transaction commits. */
it('rolls settlement and process rows back when ending a running run’s claim fails', async () => {
  const directory = process.cwd()
  const id = aSession('superseded-worker', { state: 'running', workingDirectory: directory, theCheck: aTheCheck(directory) })
  const later = aClosedLaterRun('superseded-worker', directory)
  const claims = await import('../src/server/lib/claims.ts')
  const participants = await import('../src/server/lib/participants.ts')
  const actor = { type: 'agent' as const, id: 'superseded-worker' }
  const first = claims.fileAClaim({ workspaceId: 'default', claimant: { kind: 'agent', id: participants.agentByHandle(actor.id)!.id }, run: id, things: [{ what: 'path', id: 'work/synthetic-rollback' }] }, actor)
  t.api.patchRecord(id, { dataPatch: { closedHow: 'agent-said' } }, actor)
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const exited = once(child, 'exit')
  let gone: ReturnType<typeof resources.registerResource>
  try {
    gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor })
  } finally { process.kill(-child.pid!, 'SIGTERM'); await exited }
  const before = t.api.getRecord(id)!.data
  t.client.sqlite.exec("CREATE TRIGGER refuse_claim_end BEFORE UPDATE OF released_at ON work_claims BEGIN SELECT RAISE(ABORT, 'synthetic claim end failure'); END")
  try {
    const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
    expect(response.code, JSON.stringify(response.said)).toBe(409)
    expect(JSON.stringify(response.said)).toContain('synthetic claim end failure')
    expect(t.api.getRecord(id)!.data).toEqual(before)
    expect((t.client.sqlite.prepare('SELECT released_at FROM session_resources WHERE id = ?').get(gone.id) as { released_at: string | null }).released_at).toBeNull()
    expect((t.client.sqlite.prepare('SELECT released_at FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null }).released_at).toBeNull()
  } finally { t.client.sqlite.exec('DROP TRIGGER refuse_claim_end') }
  const response = await supersede(id, later, 'Synthetic: the later run overtook it.')
  expect(response.code, JSON.stringify(response.said)).toBe(201)
  expect((t.client.sqlite.prepare('SELECT released_at FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null }).released_at).not.toBeNull()
})

function personActor() { return { type: 'human' as const, id: THE_PERSON } }
