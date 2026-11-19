// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * CRITERION CHANGE, WRITTEN WHERE THE TEST MEASURES IT, because the commit that made the change
 * (77bdda4d) did not say so in its own words.
 *
 * OLD WORDING (the owner’s rule of 11 September 2026): a worker is retired the moment its work is handed
 * back, even while its check is still running; this file measured that by retiring a worker whose
 * run had already reported.
 *
 * NEW WORDING (option A of proposal Dbo6FNK86ohz, the owner’s words of 16 September 2026 at 10:40): a
 * retire is refused while a check or a report of one of the worker's runs is still owed, and the refusal
 * names what is owed. This file now retires the worker while its run is still working,
 * which the decision allows, and measures the same question after that: the verdict must still reach the
 * retired worker's starter.
 *
 * WHY: a verdict that reached a retired worker used to be thrown away (nothing written, the run
 * left inspecting). Refusing the retire until the check has ended keeps the starter there to
 * receive it. The repair of this file landed in 2ce7e67b; this note records the change of
 * criterion as its own commit, and history is not rewritten.
 */
/** These historical C29 lifecycle fixtures are explicitly inventoried, preserving every original release, refusal and confirmation assertion. */
/** Eligibility fixture update: the old run fixtures named no submitted tip. Runs meant to be checked now record cutFrom and the actual checkout HEAD. */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync as readFixtureGit } from 'node:child_process'
const fixtureTip = readFixtureGit('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
/**
 * A RUN THAT HAS REPORTED IS NOT CLOSED: INSPECTING, THEN REBUTTAL OR REPORTING, AND CLOSED ONLY
 * WHEN THE SUPERVISOR CONFIRMS.
 *
 * Criterion C29 of design/rules/ACCEPTANCE.md: a worker is not closed when it reports, but is inspecting.
 * A failed check goes to a rebuttal, with a group to discuss it, and then to rework or to a report and the end.
 * A passed check makes it reporting: it reports to its supervisor, and is closed once that is confirmed.
 *
 * WHAT IS BEING HELD, one case each:
 *
 *   - A run that says its work is finished reads `inspecting`, and says it is waiting for the
 *     inspector the office asked.
 *   - A refusal writes the refusal ON THE RUN and the run reads `rebuttal`, naming the group.
 *   - A worker that says its work is finished again after a refusal goes back to `inspecting`, and
 *     the office asks for a fresh check.
 *   - A release moves the run to `reporting`, not to closed, and the release names the supervisor
 *     the run reported to.
 *   - The supervisor confirming is what writes `closed`. Nobody else may confirm.
 *   - A claim held by a run that is being checked still reads as live, because the run is.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control:
 *
 *   - Have `standingOf` in src/shared/releasing.ts answer `closed` on a release rather than
 *     `reporting`, and the release case and the confirmation cases go red.
 *   - Take the `patchRecord` that writes `refused` out of the refusal branch of `releaseOrRefuse`,
 *     and every rebuttal case goes red.
 *   - Take the `standingRefusal` block out of `theOfficeStartsTheCheck`, and the rework case goes
 *     red.
 *   - Drop the supervisor check in `confirmTheReport`, and the case that says a stranger may not
 *     confirm goes red.
 *   - Take the standing out of `howTheRunStands` in src/server/lib/claims.ts, and the claim case
 *     goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { RUN_STANDING } from '../src/shared/releasing.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

const THE_AREA = ['src/server/lib']

/** What the check says it read. Its content does not matter here; that it is not forwarded does. */
const CHECK = 'Read the chapters the brief named and the changes in the work area.'

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A run of one worker that says its work is finished, which is the declaration C29 starts from. */
async function aFinishedRun(handle: string, title: string): Promise<string> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, cutFrom: 'main', tip: fixtureTip, doing: 'building it' } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const run = (opened.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  await sayFinished(handle, run)
  return run
}

/**
 * AN OPEN RUN, still working: what a retire is allowed while and what the
 * two descriptions of the retired worker above need — the worker is retired with nothing it
 * owes, and only afterwards says its work is finished, through sayFinished as the worker does.
 */
async function anOpenRun(handle: string, title: string): Promise<string> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, cutFrom: 'main', tip: fixtureTip, doing: 'building it' } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const run = (opened.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  return run
}

/** The worker patching its own record to `finished`, which is the transition the office watches. */
async function sayFinished(handle: string, run: string): Promise<void> {
  const said = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(said.statusCode, said.body).toBe(200)
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
}

/** Back to work, so that saying finished again is a fresh transition rather than a repeat. */
async function backToWork(handle: string, run: string): Promise<void> {
  const said = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'running' } },
  })
  expect(said.statusCode, said.body).toBe(200)
}

interface Stands {
  standing: string
  waitingFor: string | null
  says: string
  released: { reportedTo?: { kind: string; id: string } } | null
  refused: { group: string; missing: string[]; reworked: unknown } | null
  confirmed: { by: { id: string } } | null
}

/** Where the run stands, read off the page every screen reads. */
async function stands(run: string): Promise<Stands> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { stands: Stands }).stands
}

async function release(run: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-one'),
    payload: { verdict: 'released', check: CHECK, chaptersRead: ['5:full'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function refuse(run: string, missing: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-one'),
    payload: {
      verdict: 'refused',
      check: CHECK,
      missing: [missing],
      says: { chapter: 5 },
      chaptersRead: ['5:full'],
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  for (const handle of ['builder-a', 'builder-b', 'builder-c', 'builder-d', 'builder-e', 'builder-f', 'builder-g', 'builder-h', 'builder-i', 'builder-j']) {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle,
      name: `Builder ${handle.slice(-1).toUpperCase()}`,
      role: 'worker',
      chapters: ['5:full'],
      workArea: THE_AREA,
    })
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('C29 — a run that said its work is finished is being checked, and is still live', () => {
  it('reads inspecting, and names the inspector it is waiting for', async () => {
    const run = await aFinishedRun('builder-a', 'Builder A, the run being checked')
    const where = await stands(run)
    expect(where.standing).toBe('inspecting')
    expect(where.waitingFor).toContain('inspector-one')
  })

  it('draws a name a person reads, not the stored word', () => {
    // The five words and their sentences are declared once. A word with no sentence does not
    // compile, and a screen drawing the stored word instead of the name is the defect this holds.
    expect(RUN_STANDING.inspecting.word).toBe('Being checked')
    expect(RUN_STANDING.reporting.word).toBe('Waiting for its report to be confirmed')
    expect(RUN_STANDING.closed.word).toBe('Closed')
  })
})

describe('C29 — a refusal puts the run in rebuttal, and the refusal is on the run', () => {
  let run = ''

  beforeAll(async () => {
    run = await aFinishedRun('builder-b', 'Builder B, the refused run')
    await refuse(run, 'The test for criterion 2 would pass with the feature deleted.')
  })

  it('writes the refusal on the run itself, with what is missing and the group', async () => {
    const where = await stands(run)
    expect(where.refused).not.toBe(null)
    expect(where.refused?.missing).toEqual(['The test for criterion 2 would pass with the feature deleted.'])
    expect(where.refused?.group).toMatch(/^.{4,}$/)
  })

  it('reads rebuttal, and says it is waiting for the group', async () => {
    const where = await stands(run)
    expect(where.standing).toBe('rebuttal')
    expect(where.waitingFor).toContain(String(where.refused?.group))
  })

  it('stops saying no check happened, which was false on a refused run', async () => {
    const where = await stands(run)
    expect(where.says).toContain('A check refused to release this run')
    expect(where.says).not.toContain('no check happened')
  })
})

describe('C29 — the worker reworks it and the run goes back to being checked', () => {
  let run = ''

  beforeAll(async () => {
    run = await aFinishedRun('builder-c', 'Builder C, the reworked run')
    await refuse(run, 'A criterion has no test.')
    await backToWork('builder-c', run)
    await sayFinished('builder-c', run)
  })

  it('marks the refusal answered by rework rather than deleting it', async () => {
    const where = await stands(run)
    expect(where.refused).not.toBe(null)
    expect(where.refused?.reworked).not.toBe(null)
  })

  it('reads inspecting again', async () => {
    expect((await stands(run)).standing).toBe('inspecting')
  })

  it('makes the office ask for a fresh check', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const said = reply.json() as { theCheck: { askedOf?: string; askedAt: string } | null }
    expect(said.theCheck?.askedOf).toBe('inspector-one')
  })
})

describe('C29 — a release puts the run in reporting, and does not close it', () => {
  let run = ''

  beforeAll(async () => {
    run = await aFinishedRun('builder-d', 'Builder D, the released run')
    await release(run)
  })

  it('reads reporting rather than closed', async () => {
    expect((await stands(run)).standing).toBe('reporting')
  })

  it('names on the release who the run reported to', async () => {
    expect((await stands(run)).released?.reportedTo).toEqual({ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) })
  })

  it('says it is waiting for that supervisor to confirm', async () => {
    const where = await stands(run)
    expect(where.waitingFor).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(where.waitingFor).toContain('confirm')
  })

  it('refuses a confirmation from somebody who is neither the supervisor nor the person', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/confirm`,
      headers: asAgent('inspector-one'),
      payload: { because: 'Looks fine to me.' },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.body).toContain(THE_TEST_OFFICES_SECRETARY.name)
    expect((await stands(run)).standing).toBe('reporting')
  })

  it('closes only when that supervisor confirms', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/confirm`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'Read the report. The three criteria are met.' },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const where = await stands(run)
    expect(where.standing).toBe('closed')
    expect(where.confirmed?.by.id).toBe(idOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(where.says).toContain('this run is closed')
  })

  it('refuses a second confirmation, so there is one answer to who ended it', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/confirm`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'Again.' },
    })
    expect(reply.statusCode).toBe(409)
  })
})

describe('C29 — a confirmation is not a way round the check', () => {
  it('refuses to confirm a run nobody released', async () => {
    const run = await aFinishedRun('builder-e', 'Builder E, the unreleased run')
    const reply = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/confirm`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'Close it anyway.' },
    })
    expect(reply.statusCode).toBe(409)
    expect(reply.body).toContain('has not been released')
    expect((await stands(run)).standing).toBe('inspecting')
  })
})

describe('C29 — a run being checked is still a live run, so nothing it holds is free', () => {
  it('keeps a claim of a run that just said it was finished reading as live', async () => {
    const run = await aFinishedRun('builder-f', 'Builder F, the run holding a claim')
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent('builder-f'),
      payload: { run, things: [{ what: 'path', id: 'src/server/lib/inspection.ts' }] },
    })
    expect(claimed.statusCode, claimed.body).toBe(201)
    const claim = (claimed.json() as { claim: { id: string } }).claim
    const read = await app.inject({ method: 'GET', url: '/api/claims', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const mine = (read.json() as { claims: { id: string; state: string }[] }).claims.find(
      (one) => one.id === claim.id,
    )
    // The run's own word is `state: finished`, and C29 says that word is not the end. Before this,
    // the claim read "the run ended" and whatever it held looked free while the check was running.
    expect(mine?.state).toBe('live')
  })
})

describe('a confirmation reaches the starter when the worker was retired, and writes nothing when nobody can receive it (problem kmBCj5Zki18R)', () => {
  // THE OWNER'S RULE OF 11 SEPTEMBER retires a worker the moment its work is handed back, and a confirmation
  // comes after the handback by definition, so a retired worker is the common case here. Until 13
  // September 2026 the confirmation was written first and the message to the worker second; the
  // message door refused the retired agent, and the door answered 409 "nothing was written" over a
  // run that was already closed. MUTATIONS: address the closure to the worker again and the first
  // describe goes red at the confirm (409); take the two writes out of their transaction and the
  // second describe goes red, because the run reads closed under a 409.
  async function retire(handle: string, by: Record<string, string>): Promise<void> {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/participants/agent/${handle}/retire`,
      headers: by,
      payload: { because: 'The work was handed back, and a worker with nothing left is retired at once.' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  }  async function messagesAbout(run: string): Promise<Record<string, unknown>[]> {
    const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    return (reply.json() as { records: Record<string, unknown>[] }).records.filter(
      (one) => (one['data'] as Record<string, unknown>)['aboutRun'] === run,
    )
  }

  describe('the worker is retired and its starter is not', () => {
    let run = ''
    beforeAll(async () => {
      await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'lead-r', name: 'Lead R', role: 'supervisor' })
      await register(asAgent('lead-r'), { handle: 'builder-r', name: 'Builder R', role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
      // A DECISION OF THE OWNER'S REFUSES THE RETIRE DOOR while a run of the worker still owes a check or a
      // report. The retirement here happens while the run is still working, which the
      // decision allows; the finish, the release and the confirmation then stand over the run of a
      // retired agent, which is what this describe has always been about.
      run = await anOpenRun('builder-r', 'Builder R, retired before its report was confirmed')
      await retire('builder-r', asAgent('lead-r'))
      await sayFinished('builder-r', run)
      await release(run)
    })

    it('closes the run on the starter\'s confirmation, and the reply says so', async () => {
      const reply = await app.inject({
        method: 'POST',
        url: `/api/checks/${run}/confirm`,
        headers: asAgent('lead-r'),
        payload: { because: 'Read the report. The criteria are met.' },
      })
      expect(reply.statusCode, reply.body).toBe(201)
      expect((reply.json() as { says: string }).says).toContain('is retired')
      expect((await stands(run)).standing).toBe('closed')
    })

    it('tells the starter in the retired worker\'s place, saying so in the first line', async () => {
      const written = await messagesAbout(run)
      const closed = written.find((one) => String((one['data'] as Record<string, unknown>)['body']).includes('is closed'))
      expect(closed, 'no closing message was written').toBeDefined()
      const to = ((closed!['data'] as Record<string, unknown>)['to'] ?? []) as { kind: string; id: string }[]
      expect(to).toEqual([{ kind: 'agent', id: idOf('lead-r') }])
      expect(String((closed!['data'] as Record<string, unknown>)['body']).split('\n')[0]).toContain('is retired')
    })
  })

  describe('a retired worker with a different recorded owner', () => {
    async function readyForConfirmation(handle: string): Promise<string> {
      await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: handle, role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
      const run = await anOpenRun(handle, 'A synthetic retired worker run')
      await retire(handle, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
      await sayFinished(handle, run)
      await release(run)
      return run
    }

    it('sends the closure to the owner and says why it reaches them', async () => {
      await register(AS_THE_PERSON, { handle: 'synthetic-closure-owner', name: 'Synthetic closure owner', role: 'secretary' })
      const run = await readyForConfirmation('synthetic-closure-worker')
      const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
      if (columns.some((column) => column.name === 'owner_id')) {
        setFixtureOwner(t.client.sqlite, idOf('synthetic-closure-owner'), idOf('synthetic-closure-worker'), 'id')
      }
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { because: 'The synthetic report was read.' } })
      expect(reply.statusCode, reply.body).toBe(201)
      const written = await messagesAbout(run)
      const closed = written.find((one) => String((one['data'] as Record<string, unknown>)['body']).includes('is closed'))
      expect(closed).toBeDefined()
      const data = closed!['data'] as Record<string, unknown>
      expect(data['to']).toEqual([{ kind: 'agent', id: idOf('synthetic-closure-owner') }])
      expect(String(data['body']).split('\n')[0]).toMatch(/owner/i)
    })

    it('says in its reply that the owner was told, and gives the owner the verdict’s sentence', async () => {
      await register(AS_THE_PERSON, { handle: 'synthetic-reply-owner', name: 'Synthetic reply owner', role: 'supervisor' })
      const run = await readyForConfirmation('synthetic-reply-worker')
      setFixtureOwner(t.client.sqlite, idOf('synthetic-reply-owner'), idOf('synthetic-reply-worker'), 'id')
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { because: 'The synthetic report was read.' } })
      expect(reply.statusCode, reply.body).toBe(201)
      const { sayInEnglish } = await import('../src/shared/i18n.ts')
      expect((reply.json() as { says: string }).says).toContain(
        sayInEnglish('checks.retiredWorkerOwnerWasTold', { worker: 'synthetic-reply-worker', owner: 'Synthetic reply owner' }),
      )
      const toTheOwner = (await messagesAbout(run)).filter((one) =>
        (((one['data'] as Record<string, unknown>)['to'] ?? []) as { id: string }[]).some((who) => who.id === idOf('synthetic-reply-owner')),
      )
      expect(toTheOwner.length, 'no message about the run reached the owner').toBeGreaterThan(0)
      expect(toTheOwner.map((one) => String((one['data'] as Record<string, unknown>)['body']).split('\n')[0])).toContain(
        sayInEnglish('checks.retiredWorkerReachesOwner', { name: 'synthetic-reply-worker' }),
      )
    })

    it('does not fall back to the starter when the recorded owner is unknown', async () => {
      const run = await readyForConfirmation('synthetic-unknown-owner-worker')
      const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
      if (columns.some((column) => column.name === 'owner_id')) {
        setFixtureOwner(t.client.sqlite, 'synthetic-missing-owner', idOf('synthetic-unknown-owner-worker'), 'id')
      }
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { because: 'The synthetic report was read.' } })
      expect(reply.statusCode).toBe(409)
      const where = await stands(run)
      expect(where.standing).toBe('reporting')
      expect(where.confirmed).toBeNull()
    })
  })

  describe('the worker is retired and nothing recorded its starter, so nobody can receive the closure', () => {
    // A ROW WITH NO STARTER is what every agent registered by hand before 6 September 2026 holds, so
    // the registry is edited directly here to make one; the door always records a starter. The
    // confirmer is an agent, because a message the PERSON writes is never refused by the door.
    let run = ''
    beforeAll(async () => {
      await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-s', name: 'Builder S', role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
      // The registry row is re-synced from the agent record on every write to it, so the starter is
      // removed from both, the record first.
      const seen = await app.inject({ method: 'GET', url: `/api/participants/agent/${idOf('builder-s')}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
      const recordId = String((seen.json() as { participant: { record: string } }).participant.record)
      t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.startedBy') WHERE id = ?").run(recordId)
      t.client.sqlite.prepare('UPDATE agents SET started_by_kind = NULL, started_by_id = NULL WHERE handle = ?').run('builder-s')
      const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
      if (columns.some((column) => column.name === 'owner_id')) {
        setFixtureOwner(t.client.sqlite, null, 'builder-s', 'handle')
      }
      run = await anOpenRun('builder-s', 'Builder S, retired with no starter recorded')
      await sayFinished('builder-s', run)
      await release(run)
      // RETIRING THIS RUN THROUGH THE RETIRE DOOR is refused by the owner's decision — its report is still
      // owed. The state the confirm door has to handle — a retired addressee with no
      // starter recorded — is made on the registry row directly, the way an already-retired row looks
      // when the confirm arrives, which is what this describe is about.
      t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the work was handed back' WHERE handle = 'builder-s'").run()
    })

    it('refuses the confirmation and writes NOTHING: the run still reads reporting', async () => {
      const reply = await app.inject({
        method: 'POST',
        url: `/api/checks/${run}/confirm`,
        headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
        payload: { because: 'Read the report. The criteria are met.' },
      })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(reply.body).toContain('retired')
      const where = await stands(run)
      expect(where.standing, 'the run was closed under a 409').toBe('reporting')
      expect(where.confirmed).toBeNull()
    })
  })
})

/**
 * F1 OF PROBLEM DrX8P0fYGmx8: A CLAIM ENDS ON THE RUN STANDING, NOT ON THE WORD `finished`.
 *
 * An inspecting run keeps its claim, and a run a check released or refused ends it. The release and
 * the refusal are the office's own acts, written with the real doors above, so this is not a
 * hand-made record — it is what the product does when a check ends a run.
 *
 * MUTATION that turns these red, after a control run: put `rebuttal` and `reporting` back into the
 * live branch of `howTheRunStands` in src/server/lib/claims.ts, and both cases go red.
 */
describe('F1 — a claim ends on the run standing, not on the word finished', () => {
  it('keeps an inspecting claim live and ends it when the check releases the run', async () => {
    const run = await aFinishedRun('builder-g', 'Builder G, released while it held a claim')
    const claim = await aClaimOn('builder-g', run)
    expect(await claimState(claim)).toBe('live')
    await release(run)
    expect(await claimState(claim)).toBe('the run ended')
  })

  it('ends the claim when a check refuses the run', async () => {
    const run = await aFinishedRun('builder-h', 'Builder H, refused while it held a claim')
    const claim = await aClaimOn('builder-h', run)
    expect(await claimState(claim)).toBe('live')
    await refuse(run, 'A criterion has no test.')
    expect(await claimState(claim)).toBe('the run ended')
  })
})

/** A claim on a path, filed by one builder's run, answered with its id. */
async function aClaimOn(handle: string, run: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/claims',
    headers: asAgent(handle),
    payload: { run, things: [{ what: 'path', id: 'src/server/lib/inspection.ts' }] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { claim: { id: string } }).claim.id
}

/** How one claim reads in GET /api/claims, or a sentence saying it is not there. */
async function claimState(claimId: string): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: '/api/claims', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { claims: { id: string; state: string }[] }).claims.find((one) => one.id === claimId)
  return found?.state ?? 'that claim is not in the list'
}

/**
 * F4 OF PROBLEM DrX8P0fYGmx8: THE SECRETARY MAY RELEASE A CLAIM OF A RUN THAT IS NOT RUNNING.
 *
 * The test office's secretary is registered as the secretary in this file, so `theActiveSecretary` finds it, which is the
 * same reader the work-area overlap uses. A claim of a run that is still running stays its author's
 * alone, because the author is there.
 *
 * MUTATIONS that turn these red, after a control run:
 *   - take the secretary branch out of `releaseAClaim`, and the secretary case goes red with a 403;
 *   - drop `theSecretaryMayEndThisClaim`'s running check, and the running case goes green where it
 *     must go red.
 */
describe('F4 — the secretary may end a claim of a run that is not running', () => {
  it('lets the secretary release a claim whose run is being checked, and records the reason', async () => {
    const run = await aFinishedRun('builder-i', 'Builder I, whose claim the secretary released')
    const claim = await aClaimOn('builder-i', run)
    const released = await app.inject({
      method: 'POST',
      url: `/api/claims/${claim}/release`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'Its run finished and nobody is checking it, so the secretary let the claim go.' },
    })
    expect(released.statusCode, released.body).toBe(200)
    const body = released.json() as { claim: { state: string; releasedBecause: string } }
    expect(body.claim.state).toBe('released')
    expect(body.claim.releasedBecause).toContain('the secretary let the claim go')
  })

  it('refuses the secretary a claim of a run that is still running', async () => {
    const opened = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('builder-j'),
      payload: { kind: 'session', title: 'Builder J, still running', data: { state: 'running', runtime: 'claude-code' } },
    })
    expect(opened.statusCode, opened.body).toBe(201)
    const run = (opened.json() as { record: { id: string } }).record.id
    const claim = await aClaimOn('builder-j', run)
    const refused = await app.inject({
      method: 'POST',
      url: `/api/claims/${claim}/release`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'Stop.' },
    })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('still running')
    expect(await claimState(claim)).toBe('live')
  })
})
