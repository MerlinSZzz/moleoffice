// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY ENTRY STANDS CLOSED AND WAITS ON NOBODY.
 *
 * Problem g2Pj8rtv0JdZ. Decision 9sQNuC_N8MVX and one other ask no check of a secretary's design/-only merge
 * entry. The office files the run for such an entry itself, already finished
 * (`submitASecretarysDesignEntry`). Before
 * this, `howARunStands` read that run as a finish nobody released: standing `inspecting`, "Waiting for a check", and
 * GET /api/checks and the person's starter list counted it as waiting for ever. Now the office writes `needsNoCheck`
 * in the run's first write, and `howARunStands` reads it as `closed`, with its own sentence. There is no seventh
 * standing; the pattern is the secretary's decision yH7W1sXTRY5q, Q3 (a).
 *
 * WHAT IS PROVED HERE, against a real database, the real merge queue door and the real checks door:
 *   1. The secretary's entry files a run whose first revision carries the field, and the run stands closed, is no
 *      unreleased finish, waits on nobody, and says the sentence.
 *   2. GET /api/checks and the person's starter list both list the run and do not count it as unreleased.
 *   3. An ordinary finished run with no field still stands `inspecting` and counts as unreleased.
 *   4. The run's check panel draws the run's own sentence, and not C29's closed sentence about a supervisor.
 *   5. The HTTP record door refuses `needsNoCheck` from every caller, on a create and on a patch, so the sentence
 *      "The office filed this run" cannot be written onto a run the office did not file. A whole `data` that keeps
 *      the office's stored value exactly is not refused by that rule.
 *   6. The person's starter list, when no run of the agents they started is waiting for a check and one of those
 *      runs is a secretary's office-filed run, says so without saying every run was released.
 *
 * MUTATION PROOFS, each run alone after a control, recorded in the commit message:
 *   - the field dropped from the `createRecord` data in `submitASecretarysDesignEntry`: cases 1, 2 and 4 go red;
 *   - `readNeedsNoCheck` made to return null: cases 1, 2 and 4 go red;
 *   - the needsNoCheck branch taken out of TheCheckOnARun.tsx: case 4 goes red;
 *   - the three refusals of needsNoCheck taken out of src/server/api/records.ts: case 5 goes red;
 *   - the old starter-list sentence put back in src/server/lib/inspection.ts: case 6 goes red.
 *
 * Every fixture here is synthetic: the git folders are made under `.logs/` in this checkout and removed after, and
 * nothing reaches the live server.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NEEDS_NO_CHECK, RUN_STANDING, howARunStands } from '../src/shared/releasing.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const THE_SENTENCE =
  "The office filed this run for a secretary's design/-only merge entry. Decision madeUpuoadum asks no check of such an entry, so this run waits on nobody."

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asSecretary = as('agent', 'nc-secretary')
const asWorker = as('agent', 'nc-worker')
const asLead = as('agent', 'nc-lead')

/** The refusal the record door answers to any caller that writes needsNoCheck. */
const ONLY_THE_OFFICE =
  "The office writes needsNoCheck when it files a run for a secretary's design/-only merge entry. Nothing was written."

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `needs-no-check-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic git folder: `main`, and a branch on top of it changing the files given, checked out. */
function aFolder(branch: string, files: Record<string, string>): string {
  const dir = scratch(branch)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic needs-no-check fixture')
  mkdirSync(join(dir, 'design'), { recursive: true })
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'design', 'rules.md'), 'The rules, as they were.\n')
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', branch)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic change')
  return realpathSync(dir)
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

interface Listed {
  run: string
  stands: { standing: string; unreleasedFinish: boolean; waitingFor: string | null; says: string }
}

/** The secretary's run, filed by the office through the real door. */
let secretarysRun: PanelRecord
/** An ordinary worker's run that said its work is finished, which nobody has released. */
let ordinaryRun: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  // THE PERSON STARTS THE SECRETARY AND A LEAD, AND THE LEAD STARTS THE ORDINARY WORKER. So the person's list holds
  // the secretary's run and nothing unreleased, and the lead's list holds the ordinary run, which is unreleased.
  for (const [by, payload] of [
    [asPerson, { handle: 'nc-secretary', name: 'Synthetic nc-secretary', role: 'secretary' }],
    [asPerson, { handle: 'nc-lead', name: 'Synthetic nc-lead' }],
    [asLead, { handle: 'nc-worker', name: 'Synthetic nc-worker', workArea: ['work'] }],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, payload)
    expect(r.status, r.raw).toBe(201)
  }

  const secretarysFolder = aFolder('notes', { 'design/rules.md': 'The rules, as they are now.\n' })
  const filed = await call('POST', '/api/merge-queue', asSecretary, {
    changeset: { adapter: 'git', repository: 'fixture-main', branch: 'notes' },
    workingDirectory: secretarysFolder,
  })
  expect(filed.status, filed.raw).toBe(201)
  secretarysRun = t.api.getRecord(filed.body['entry'].run)!

  const workersFolder = aFolder('work', { 'work/a.txt': 'after\n' })
  ordinaryRun = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic ordinary run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'nc-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'nc-worker', cutFrom: 'main', workingDirectory: workersFolder },
  }).id
  const finished = await call('PATCH', `/api/records/${ordinaryRun}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe("a run the office filed for a secretary's design/-only entry", () => {
  it('carries the field from its first write, and stands closed, waiting on nobody, with its own sentence', () => {
    const first = t.client.sqlite.prepare('SELECT actor_id AS id, data FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1').get(secretarysRun.id) as {
      id: string
      data: string
    }
    expect(first.id).toBe('mole-office/the-api-server')
    expect((JSON.parse(first.data) as Record<string, any>)[NEEDS_NO_CHECK]).toMatchObject({ decision: 'madeUpuoadum' })
    const stands = howARunStands(secretarysRun.data)
    expect(stands.saidFinished).toBe(true)
    expect(stands.standing).toBe('closed')
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.waitingFor).toBeNull()
    expect(stands.says).toBe(THE_SENTENCE)
  })

  it('is listed by GET /api/checks and on the person\'s starter list, and neither counts it as unreleased', async () => {
    const every = await call('GET', '/api/checks', asPerson)
    expect(every.status, every.raw).toBe(200)
    const onEvery = (every.body['list'] as Listed[]).find((one) => one.run === secretarysRun.id)
    expect(onEvery?.stands).toMatchObject({ standing: 'closed', unreleasedFinish: false, waitingFor: null, says: THE_SENTENCE })
    // THE ORDINARY RUN IS THE ONLY ONE COUNTED, which is what makes the count a measurement of this change.
    expect(every.body['says']).toContain('1 of 2 runs that said the work was finished have not been released.')

    const theirs = await call('GET', `/api/checks?startedBy=${THE_TEST_OFFICES_OWNER.id}&startedByKind=person`, asPerson)
    expect(theirs.status, theirs.raw).toBe(200)
    expect(theirs.body['startedBy']).toBe(THE_TEST_OFFICES_OWNER.id)
    const list = theirs.body['list'] as Listed[]
    expect(list.map((one) => one.run)).toEqual([secretarysRun.id])
    expect(list[0]?.stands).toMatchObject({ standing: 'closed', unreleasedFinish: false, waitingFor: null })

    // THE LEAD'S LIST IS THE CONTROL: the ordinary run on it is still counted as unreleased.
    const leads = await call('GET', '/api/checks?startedBy=nc-lead', asPerson)
    expect(leads.status, leads.raw).toBe(200)
    expect((leads.body['list'] as Listed[]).filter((one) => one.stands.unreleasedFinish).map((one) => one.run)).toEqual([ordinaryRun])
    expect(leads.body['says']).toBe('1 run said the work was finished and nobody released it. A subagent saying it is done does not end it.')
  })

  it("makes the person's starter list say nothing is waiting for a check, without saying every run was released", async () => {
    const theirs = await call('GET', `/api/checks?startedBy=${THE_TEST_OFFICES_OWNER.id}&startedByKind=person`, asPerson)
    expect(theirs.status, theirs.raw).toBe(200)
    expect(theirs.body['says']).toBe(
      `No run of the 2 agents ${THE_TEST_OFFICES_OWNER.id} started is waiting for a check: every one that said it was finished was released, closed or needs no check.`,
    )
  })
})

describe('the record door and needsNoCheck', () => {
  const sessions = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
  const revisions = (id: string) => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
  const THE_MARK = {
    decision: 'Synthetic001',
    at: '2026-09-25 01:00:00',
    because: 'Synthetic: written by somebody who is not the office.'
  }

  it('refuses a create carrying it, from an agent and from the person, and files nothing', async () => {
    const before = sessions()
    for (const who of [asWorker, asPerson]) {
      const r = await call('POST', '/api/records', who, {
        kind: 'session',
        title: 'Synthetic run that claims the office filed it',
        data: { state: 'running', servingAgent: 'nc-worker', [NEEDS_NO_CHECK]: THE_MARK },
      })
      expect(r.status, r.raw).toBe(403)
      expect(r.body['error']).toBe(ONLY_THE_OFFICE)
    }
    expect(sessions()).toBe(before)
  })

  it("refuses a dataPatch carrying it on an agent's own finished run, which reads exactly as before", async () => {
    const seq = revisions(ordinaryRun)
    const r = await call('PATCH', `/api/records/${ordinaryRun}`, asWorker, { dataPatch: { [NEEDS_NO_CHECK]: THE_MARK } })
    expect(r.status, r.raw).toBe(403)
    expect(r.body['error']).toBe(ONLY_THE_OFFICE)
    expect(revisions(ordinaryRun)).toBe(seq)
    const stands = howARunStands(t.api.getRecord(ordinaryRun)!.data)
    expect(stands).toMatchObject({ standing: 'inspecting', unreleasedFinish: true, needsNoCheck: null })
  })

  it("refuses a whole data that adds, changes or drops it, and not one that keeps the office's value", async () => {
    const ordinary = t.api.getRecord(ordinaryRun)!.data
    const added = await call('PATCH', `/api/records/${ordinaryRun}`, asPerson, { data: { ...ordinary, [NEEDS_NO_CHECK]: THE_MARK } })
    expect(added.status, added.raw).toBe(403)
    expect(added.body['error']).toBe(ONLY_THE_OFFICE)

    const stored = t.api.getRecord(secretarysRun.id)!.data
    const { [NEEDS_NO_CHECK]: kept, ...without } = stored
    const changed = await call('PATCH', `/api/records/${secretarysRun.id}`, asPerson, {
      data: { ...stored, [NEEDS_NO_CHECK]: { ...(kept as object), because: 'Synthetic: changed.' } },
    })
    expect(changed.status, changed.raw).toBe(403)
    expect(changed.body['error']).toBe(ONLY_THE_OFFICE)
    const dropped = await call('PATCH', `/api/records/${secretarysRun.id}`, asPerson, { data: without, replace: true })
    expect(dropped.status, dropped.raw).toBe(403)
    expect(dropped.body['error']).toBe(ONLY_THE_OFFICE)

    // A WHOLE data THAT KEEPS THE MARK GETS PAST THIS RULE. On the office's run a later rule still refuses it: a
    // finished run written whole is sealed again, and the secretary's run declares no submission and has no registered
    // work area, so the answer is that rule's 409, naming the missing submission (problem o8rBHt9RtUUJ), and not this
    // rule's 403. Nothing is written either way.
    const seq = revisions(secretarysRun.id)
    const same = await call('PATCH', `/api/records/${secretarysRun.id}`, asPerson, { data: { ...stored, doing: 'Synthetic: the doing line rewritten, the mark kept.' } })
    expect(same.status, same.raw).toBe(409)
    expect(String(same.body['error'])).toContain('The run cannot finish: it declares no submission')
    expect(revisions(secretarysRun.id)).toBe(seq)
    expect(t.api.getRecord(secretarysRun.id)!.data[NEEDS_NO_CHECK]).toEqual(kept)
  })
})

describe('an ordinary finished run, with no field', () => {
  // THE CONTROL THAT THE CHANGE IS NARROW: a run nobody filed for a secretary still waits for a check.
  it('still stands inspecting and counts as a finish nobody released', () => {
    const run = t.api.getRecord(ordinaryRun)!
    expect(run.data).not.toHaveProperty(NEEDS_NO_CHECK)
    const stands = howARunStands(run.data)
    expect(stands.standing).toBe('inspecting')
    expect(stands.unreleasedFinish).toBe(true)
    expect(stands.needsNoCheck).toBeNull()
    expect(stands.waitingFor).not.toBeNull()
  })
})

describe("the check panel on the secretary's run", () => {
  // THE PANEL IS IMPORTED AFTER A WINDOW STAND-IN EXISTS: src/web/api.ts reads `window.localStorage` at module scope.
  // It is the stand-in tests/nothing-there-is-not-nobody-looked.test.ts installs, for the same reason.
  let drawn = ''
  let drawnOrdinary = ''
  beforeAll(async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const { TheCheckOnARun } = await import('../src/web/components/TheCheckOnARun.tsx')
    drawn = renderToStaticMarkup(h(TheCheckOnARun, { record: secretarysRun }))
    drawnOrdinary = renderToStaticMarkup(h(TheCheckOnARun, { record: t.api.getRecord(ordinaryRun)! }))
  })

  it("draws the run's own sentence under the closed word, and not C29's sentence about a supervisor's confirmation", () => {
    expect(drawn).toContain(`data-standing="closed">${RUN_STANDING.closed.word}<`)
    expect(drawn).toContain(THE_SENTENCE.replaceAll("'", '&#x27;'))
    expect(drawn).not.toContain(RUN_STANDING.closed.sentence)
    // NOTHING ON THE PANEL SAYS A CHECK IS STILL TO COME, which the ordinary run's panel does say.
    for (const sentence of ['No check has answered about this run yet.', 'Nobody has assembled a check for this run yet']) {
      expect(drawnOrdinary).toContain(sentence)
      expect(drawn).not.toContain(sentence)
    }
    expect(drawn).not.toContain('The office has not asked for a check on this run.')
  })
})
