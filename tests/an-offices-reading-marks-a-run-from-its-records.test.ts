// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Fixture update: case three's check is written on the target run by that run's own agent, as a run's record is changed only by those who hold the run; what the reading proves is unchanged. */
/**
 * FIVE SIGNALS, READ FROM RECORDS ONLY — criterion HB2, and what the reading costs, criterion HB6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   - a run with each of the five signals, read one at a time, and each entry carries the word and
 *     the record ids that say it;
 *   - a run with two distinct signals reads exemplary, with one noted;
 *   - the confirm door (the supervisor's press that closes a run) presses the reading and stores it
 *     on the session record under `honour`;
 *   - the cost the reading reports equals the records it touched, and the reading takes no path:
 *     the reader's own file imports no way to open a transcript, a log or a model.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   - Remove the evidence record behind one earned signal (soft delete the message that says the
 *     brief was wrong, and the brief note that speaks for a defect's being outside it), and that
 *     signal disappears from a fresh reading and turns up under `missing`, with the reason.
 *   - Make the reader count only the records it fetches by id and ignore the rows its scans walk,
 *     in src/server/lib/honour.ts, and the cost case goes red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let t: TestDb
let app: FastifyInstance

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A scratch git checkout, in the shape the sealed-submission fixtures use, with one changed test file. */
function aCheckout(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'honour-fixture-'))
  made.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic honour fixture')
  mkdirSync(join(dir, 'hon-code', 'tests'), { recursive: true })
  writeFileSync(join(dir, 'hon-code', 'tests', 'example.test.ts'), 'it works\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'hon-code', 'tests', 'example.test.ts'), 'it works, argued through\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

const made: string[] = []

/** Register an agent, and answer the registry id it was given. That id is not its handle. */
async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** The registry id hon-starter was given. A starter is stored by this id, not by its handle. */
let honStarterId = ''

/** One run of hon-worker, open and unfinished, as far as the reading needs it. */
async function aRun(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/records',
    // FILED BY THE AGENT IT SERVES: since the filing door of round 30, hon-worker may not file a session for another.
    headers: asAgent(typeof extra['servingAgent'] === 'string' ? extra['servingAgent'] : 'hon-worker'),
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', servingAgent: 'hon-worker', ...extra } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  return (opened.json() as { record: { id: string } }).record.id
}

async function theReading(runId: string, workspace = WORKSPACE): Promise<{
  run: string
  standing: string
  threshold: number
  signals: { signal: string; evidence: string[]; read_at: string }[]
  missing: { signal: string; because: string }[]
  cost: { records: number; ms: number }
  report: { id: string; title: string; foundBy: string } | null
}> {
  const read = await app.inject({
    method: 'GET',
    url: `/api/honour-board/runs/${runId}`,
    headers: { ...asAgent('hon-starter'), 'x-mole-office-workspace': workspace },
  })
  expect(read.statusCode, read.body).toBe(200)
  return read.json() as never
}

/** One record filed by an agent, and its id. `expected` is the status the write answers. */
async function filed(handle: string, kind: string, title: string, data: Record<string, unknown>, expected = 201): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind, title, data },
  })
  expect(made.statusCode, made.body).toBe(expected)
  return (made.json() as { record: { id: string } }).record.id
}

/** One `about` link: <fromId> is about <toId>, which is the link every reader of "about" reads. */
async function aboutIt(fromId: string, toId: string): Promise<void> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: asAgent('hon-worker'),
    payload: { fromId, toId, type: 'about' },
  })
  expect(made.statusCode, made.body).toBe(201)
}

async function theDataOf(id: string): Promise<Record<string, unknown>> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return (read.json() as { record: { data: Record<string, unknown> } }).record.data
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: `${THE_TEST_OFFICES_SECRETARY.name}, the fixture secretary`, role: 'secretary' })
  honStarterId = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'hon-starter', name: 'Hon fixture starter', role: 'supervisor' })
  await register(asAgent('hon-starter'), {
    handle: 'hon-worker',
    name: 'Hon fixture worker',
    role: 'worker',
    workArea: ['hon-code', 'records'],
  })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the five signals are read off the run\u2019s records, one at a time', () => {
  it('one — corrected its brief: the run\u2019s own message to the starter that says the brief was wrong', async () => {
    const briefRun = await aRun('the run whose brief its own words corrected')
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const message = await filed('hon-worker', 'message', 'The brief was wrong', {
      to: [{ kind: 'agent', id: 'hon-starter' }],
      aboutRun: briefRun,
      body: 'The brief said to build the clamp first; the work needed the fixture first. The brief was wrong about the order.',
    }, 409)
    const read = await theReading(briefRun)
    const mine = read.signals.find((one) => one.signal === 'corrected its brief')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([message])
    // AND WITH NOTHING ELSE IN THE FIXTURE, the reading stays at one signal: noted, not exemplary.
    expect(read.standing).toBe('noted')
    expect(read.threshold).toBe(2)
  })

  it('two — found a real defect outside its brief: a problem it filed, fixed, that the kept brief did not name', async () => {
    const run = await aRun('the run that found a defect the brief did not know about')
    const brief = await filed('hon-starter', 'note', 'Brief of the honour two run', {
      body: 'The brief asks about the clamp\u2019s grip force and the mounting plate. Nothing else.',
    })
    await aboutIt(brief, run)
    const problem = await filed('hon-worker', 'problem', 'The tally drops every second visit of the sweep', {
      found_by: `filed by run ${run}`,
      state: 'fixed',
      fix: 'the sweep restarted its index at every second visit',
      why_it_hurts: 'the tally is read twice a day and came back with half of it',
    })
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'found a real defect outside its brief')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toContain(problem)
    expect(mine?.evidence).toContain(brief)
  })

  it('three — caught a blocking defect in review: the checking run\u2019s agent wrote a refusal that stood because the refused run was released later', async () => {
    // THE OFFICE'S CHAIN, THE ONLY WAY THE READING CAN NAME THE REFUSING RUN: the check-start
    // message the office asked the check with is the message the checking run was started with,
    // and this fixture builds exactly that join.
    const run = await aRun('the run that caught a real defect while reading another\u2019s work')
    const target = await aRun('the run whose work was refused and released whole later')
    // NOTHING HOLDS THE CHECKING AGENT IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const checkStart = await filed('hon-starter', 'message', 'The office asked for a check', {
      to: [{ kind: 'agent', id: 'hon-worker' }],
      aboutRun: target,
      body: 'The office asked hon-worker to read the work of this run.',
    }, 409)
    const bound = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { deliveringMessage: checkStart } },
    })
    expect(bound.statusCode, bound.body).toBe(200)
    const written = await app.inject({
      method: 'PATCH',
      url: `/api/records/${target}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { theCheck: { askedAt: '2026-09-16 07:00:00', message: checkStart, checkout: { directory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/honour-records`, cutFrom: 'main' }, says: 'The office asked hon-worker to check this run.' } } },
    })
    expect(written.statusCode, written.body).toBe(200)
    // THE REFUSAL AND THE RELEASE, as the check door writes them: an ordinary write of either is refused.
    writeAVerdictAsItsDoorWould(t, target, {
      refused: { by: { kind: 'agent', id: 'hon-worker' }, at: '2026-09-16 08:00:00', missing: ['The test for the criterion would pass with the feature deleted.'], chapter: 5, group: 'g-fixture' },
      released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-16 09:00:00', how: 'an inspector' },
    })
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'caught a blocking defect in review')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([target])
  })

  /**
   * MUTATION PROOF, run on 23 September 2026 in src/server/lib/honour.ts.
   *
   * Control: both cases below green. Then each stored-versus-stored compare was put back on the raw
   * string (`row.actorId === serving`, `by['id'] !== serving`): the message written under the minted
   * id no longer reads as the run's agent (signal one) and the refusal by the minted id no longer
   * reads as the run's agent (signal three), so both cases go red. The comparisons were restored and
   * the control run again.
   *
   * A minted agent is written straight at the table, so the test chooses its id. It carries a
   * starter, because signal one is addressed to the run's starter and a row with none has no address
   * to check. The starter is stored by its registry id, as the registration stores it.
   */
  function insertAMintedAgent(slug: string, id: string, takesTheHandle?: string): { id: string; handle: string } {
    const handle = takesTheHandle ?? `hon-minted-${slug}`
    const avatar = `avatar-default-agent-${id}`
    t.client.sqlite
      .prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
          "'generated') ON CONFLICT(id) DO NOTHING",
      )
      .run(avatar, '2026-09-23 10:00:00')
    t.client.sqlite
      .prepare(
        'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, role, started_by_kind, started_by_id, created_at) ' +
          'VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
      )
      .run(id, `Hon ${slug}`, handle, avatar, 'worker', 'agent', honStarterId, '2026-09-23 10:00:00')
    return { id, handle }
  }

  it('one, read through an id that is not the handle the run serves', async () => {
    const minted = insertAMintedAgent('brief', 'Xq7rT3yUi9O1')
    const run = await aRun('the minted run whose own words corrected its brief', { servingAgent: minted.handle })
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const message = await filed(minted.id, 'message', 'The brief was wrong', {
      to: [{ kind: 'agent', id: 'hon-starter' }],
      aboutRun: run,
      body: 'The brief said to build the clamp first; the work needed the fixture first. The brief was wrong about the order.',
    }, 409)
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'corrected its brief')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([message])
  })

  it('three, read through an id that is not the handle the run serves', async () => {
    const minted = insertAMintedAgent('refusal', 'Yr8sU4zVj0Pq')
    const run = await aRun('the minted run that caught a defect while reading', { servingAgent: minted.handle })
    const target = await aRun('the run the minted agent refused and later released')
    // NOTHING HOLDS THE CHECKING AGENT IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const checkStart = await filed('hon-starter', 'message', 'The office asked for a check', {
      to: [{ kind: 'agent', id: minted.id }],
      aboutRun: target,
      body: 'The office asked the minted worker to read the work of this run.',
    }, 409)
    const bound = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent(minted.id),
      payload: { dataPatch: { deliveringMessage: checkStart } },
    })
    expect(bound.statusCode, bound.body).toBe(200)
    // Written by the target run's own agent, as in the first case of signal three: the minted agent does not hold that
    // run, so it may not change the run's record, and the reading does not ask who wrote the check.
    const written = await app.inject({
      method: 'PATCH',
      url: `/api/records/${target}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { theCheck: { askedAt: '2026-09-23 07:00:00', message: checkStart, checkout: { directory: '/synthetic', cutFrom: 'main' }, says: 'The office asked the minted worker to check this run.' } } },
    })
    expect(written.statusCode, written.body).toBe(200)
    // THE REFUSAL AND THE RELEASE, as the check door writes them: an ordinary write of either is refused.
    writeAVerdictAsItsDoorWould(t, target, {
      refused: { by: { kind: 'agent', id: minted.id }, at: '2026-09-23 08:00:00', missing: ['The test for the criterion would pass with the feature deleted.'], chapter: 5, group: 'g-minted' },
      released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-23 09:00:00', how: 'an inspector' },
    })
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'caught a blocking defect in review')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([target])
  })

  /**
   * ONE STORED STRING, TWO AGENTS, AND THE BOARD STILL ANSWERS. Refusal H97ABDlJVUoO.
   *
   * WHAT THIS IS ABOUT. `hon-twin` is one agent's registry ID and another live agent's HANDLE. A
   * writer's stamp on the revision ledger is a STORED reference, so it is read by exact id first
   * and then by the one agent bearing it as a handle. The ARRIVING resolver answers the same
   * question differently and on purpose: it refuses with 409 and names both agents, because a
   * caller sending an ambiguous name can be told to send its id instead. Nobody can be told
   * anything here: the writer wrote its stamp and left.
   *
   * WHY IT IS A DEFECT AND NOT A STYLE. `readTheHonourOfARun` reads that stamp inside a `find` over
   * a message's whole change log, and `GET /honour-board/runs/:run` does not catch, so one
   * ambiguous stamp anywhere in that log turned the run's honour board into a 409 — a run whose
   * standing nobody can read, which is the shape of problem 1depXfmbfVH9.
   *
   * HOW THE AMBIGUITY IS MADE, in the order it will really happen. The message is written while
   * `hon-twin` names exactly one agent, so the door accepts it and the ledger stores that stamp.
   * The second agent takes the handle afterwards, which is what I-2 allows once a retired agent
   * releases a name. Nothing rewrites the stored stamp, which is the point: it is read later, by an
   * office that now knows two agents the string could mean.
   *
   * MUTATION PROOF, run on 23 September 2026 in src/server/lib/honour.ts. Control: green. Then
   * `theStampNamesTheRunsAgent` was put back on `sameAgent({ actorType: 'agent', actorId: serving },
   * { type: 'agent', id: stamp })`: this case went red with 409 "names two agents" out of the door,
   * and the other honour cases stayed green. Restored, and the control run again.
   */
  it('a stored stamp two agents could answer is nobody, and the board still reads', async () => {
    // THE FIRST AGENT holds `hon-twin` as its registry id.
    const byItsId = insertAMintedAgent('twinid', 'hon-twin')
    // THE RUN SERVES THE SECOND AGENT, named by its id so the run itself is never in doubt.
    const run = await aRun('the run whose agent shares a name with somebody else\u2019s id', { servingAgent: 'Hb3kQ8mTv1Zc' })
    // THE WORDS ARE WRITTEN WHILE THE NAME STILL MEANS ONE AGENT, so the door accepts the write and
    // the ledger keeps `hon-twin` as the writer's stamp.
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const message = await filed(byItsId.id, 'message', 'The brief was wrong', {
      to: [{ kind: 'agent', id: 'hon-starter' }],
      aboutRun: run,
      body: 'The brief said to build the clamp first; the work needed the fixture first. The brief was wrong about the order.',
    }, 409)
    expect(message).toBeTruthy()
    // AND THE SECOND AGENT TAKES THAT NAME AS ITS HANDLE. From here the arriving resolver refuses
    // the string and the stored reader does not.
    const byItsHandle = insertAMintedAgent('twinhandle', 'Hb3kQ8mTv1Zc', 'hon-twin')
    expect(byItsHandle.handle).toBe('hon-twin')

    // THE BOARD ANSWERS. `theReading` asserts the door's own 200.
    const read = await theReading(run)

    // AND IT CREDITS NOBODY. The words are the first agent's; the run serves the second. A reader
    // that matched the stamp against the run's HANDLE would hand one agent's words to another.
    const mine = read.signals.find((one) => one.signal === 'corrected its brief')
    expect(mine, JSON.stringify(read)).toBeUndefined()
    const why = read.missing.find((one) => one.signal === 'corrected its brief')
    expect(why?.because, JSON.stringify(read)).toContain('were not written by the agent the run serves')
  })

  it('four — needed no rework: released whole at the first asking, with no refusal and no second finish', async () => {
    const run = await aRun('the run that was released whole at the first asking', { workingDirectory: 'nowhere' })
    // THE RELEASE ITSELF, exactly as POST /api/checks stores it: the release, with no refusal
    // beside it, no rebuttal behind it and no second run of the same agent spelling the work again.
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-16 09:30:00', how: 'its starter' } })
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'needed no rework')
    expect(mine, JSON.stringify(read)).toBeDefined()
  })

  it('four, as the acceptance words the absence — no check was asked for this run', async () => {
    const run = await aRun('the run nobody released, from an older office')
    const read = await theReading(run)
    expect(read.signals.find((one) => one.signal === 'needed no rework')).toBeUndefined()
    const mine = read.missing.find((one) => one.signal === 'needed no rework')
    expect(mine?.because).toBe('no check was asked for this run')
  })

  it('five — proved every test by mutation: the seal names the test files, the report names each proof with a hash', async () => {
    const dir = aCheckout()
    const run = await aRun('the run whose tests it proved by mutation', { workingDirectory: dir, cutFrom: 'main' })
    // THE REPORT, WORDS ON THE OFFICE: the run's own words about what it proved, one hash beside
    // each test file it added or changed.
    const hash = 'a'.repeat(64)
    const report = await filed('hon-worker', 'report', 'What the honour five run left behind', {
      for: 'hon-starter',
      date: '2026-09-16',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'The proofs', text: `Mutation proof for hon-code/tests/example.test.ts: ${hash}, after a control run.` },
      ],
    })
    await aboutIt(report, run)
    // THE FINISH SEALS THE TIP, which is what names the test files it added or changed.
    const finished = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { state: 'finished' } },
    })
    expect(finished.statusCode, finished.body).toBe(200)
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'proved every test by mutation')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([report])
  })
})

describe('the report is found the way the corpus actually files it, not only through an about link', () => {
  /** One mixed-submission run of hon-worker, opened, not yet finished. */
  async function aMixedRun(dir: string, records: string[]): Promise<string> {
    const opened = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('hon-worker'),
      payload: {
        kind: 'session',
        title: 'the sealed run of the honour follow-up',
        data: {
          state: 'running',
          runtime: 'claude-code',
          servingAgent: 'hon-worker',
          workingDirectory: dir,
          cutFrom: 'main',
          submission: { kind: 'mixed', records },
        },
      },
    })
    expect(opened.statusCode, opened.body).toBe(201)
    return (opened.json() as { record: { id: string } }).record.id
  }

  async function finish(runId: string): Promise<void> {
    const finished = await app.inject({
      method: 'PATCH',
      url: `/api/records/${runId}`,
      headers: asAgent('hon-worker'),
      payload: { dataPatch: { state: 'finished' } },
    })
    expect(finished.statusCode, finished.body).toBe(200)
  }

  /** One report with one hash-argued mutation proof, filed inside the named session (or before any session exists when null), and never linked `about` anything. */
  async function aProofReport(hash: string, viaSession: string | null): Promise<string> {
    const headers = viaSession === null ? asAgent('hon-worker') : { ...asAgent('hon-worker'), 'x-mole-office-session': viaSession }
    const report = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: {
        kind: 'report',
        title: 'What the unlinked run left behind',
        data: {
          for: 'hon-starter',
          date: '2026-09-16',
          blocks: [{ id: 'b-1', type: 'text', heading: 'The proofs', text: `Mutation proof for hon-code/tests/example.test.ts: ${hash}, after a control run.` }],
        },
      },
    })
    expect(report.statusCode, report.body).toBe(201)
    return (report.json() as { record: { id: string } }).record.id
  }

  it('the report only the run\u2019s own session\u2019s change rows name is read, with the seal naming the tests and no `about` link at all', async () => {
    const dir = aCheckout()
    const note = await filed('hon-worker', 'note', 'A note the mixed run also submitted', { body: 'The records half of the submission.' })
    const run = await aMixedRun(dir, [note])
    // THE REPORT, FILED FROM INSIDE THE RUN'S OWN SESSION: its create change row carries this
    // run's session id. The submission list holds the note alone, and nothing is linked `about`
    // anything — the corpus's real filing practice, and the point of this case.
    const hash = 'c'.repeat(64)
    const reportId = await aProofReport(hash, run)
    await finish(run)
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'proved every test by mutation')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([reportId])
    expect(read.report?.id).toBe(reportId)
    expect(read.report?.foundBy).toBe('session-changes')
  })

  it('the report the seal pinned in its records half is read through the seal, and no `about` link names it', async () => {
    const dir = aCheckout()
    const hash = 'd'.repeat(64)
    const report = await aProofReport(hash, null)
    const run = await aMixedRun(dir, [report])
    await finish(run)
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'proved every test by mutation')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([report])
    expect(read.report?.id).toBe(report)
    expect(read.report?.foundBy).toBe('seal-pinned')
  })

  it('and with no report anywhere, the reading still says so', async () => {
    const dir = aCheckout()
    const note = await filed('hon-worker', 'note', 'A note of the reportless run', { body: 'The records half of the submission.' })
    const run = await aMixedRun(dir, [note])
    await finish(run)
    const read = await theReading(run)
    expect(read.signals.find((one) => one.signal === 'proved every test by mutation')).toBeUndefined()
    expect(read.missing.find((one) => one.signal === 'proved every test by mutation')?.because).toContain('no report record is filed about this run')
  })

  it('two signals together read exemplary', async () => {
    const run = await aRun('the run that both corrected its brief and released whole')
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    await filed('hon-worker', 'message', 'The brief again', {
      to: [{ kind: 'agent', id: 'hon-starter' }],
      aboutRun: run,
      body: 'The brief named no work area, and the run needed one.',
    }, 409)
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-16 10:00:00', how: 'its starter' } })
    const read = await theReading(run)
    expect(read.signals.length).toBe(2)
    expect(read.standing).toBe('exemplary')
  })
})

describe('the mutation: remove one signal\u2019s evidence record, and the signal goes missing', () => {
  it('the message that says the brief was wrong is taken away, and the reading says so', async () => {
    const run = await aRun('the run whose corrected-brief evidence will be removed')
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same.
    const message = await filed('hon-worker', 'message', 'The brief was wrong here too', {
      to: [{ kind: 'agent', id: 'hon-starter' }],
      aboutRun: run,
      body: 'The brief asked for module work; the work was module work but the brief pointed at another project.',
    }, 409)
    const before = await theReading(run)
    expect(before.signals.find((one) => one.signal === 'corrected its brief')?.evidence).toEqual([message])
    // ITS WRITER TAKES IT AWAY, because only the writer may delete a message.
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${message}`, headers: asAgent('hon-worker') })
    expect(gone.statusCode, gone.body).toBe(200)
    const after = await theReading(run)
    expect(after.signals.find((one) => one.signal === 'corrected its brief')).toBeUndefined()
    expect(after.missing.find((one) => one.signal === 'corrected its brief')?.because).toContain('no message this run wrote to its starter says the brief was wrong')
  })

  it('the kept brief is taken away, and a defect outside it cannot be told apart any more', async () => {
    const run = await aRun('the run whose kept brief will be removed')
    const brief = await filed('hon-starter', 'note', 'Brief of the honour removal run', {
      body: 'The brief asks for the mount alone.',
    })
    await aboutIt(brief, run)
    await filed('hon-worker', 'problem', 'The file lockout hits the report writer', {
      found_by: `filed by run ${run}`,
      state: 'accepted',
    })
    const before = await theReading(run)
    expect(before.signals.find((one) => one.signal === 'found a real defect outside its brief')).toBeDefined()
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${brief}`, headers: AS_THE_PERSON })
    expect(gone.statusCode, gone.body).toBe(200)
    const after = await theReading(run)
    expect(after.signals.find((one) => one.signal === 'found a real defect outside its brief')).toBeUndefined()
    expect(after.missing.find((one) => one.signal === 'found a real defect outside its brief')?.because).toContain('not kept about it')
  })
})

describe('the confirm door presses the reading when it closes a run', () => {
  it('stores the reading on the session record under `honour`, and the reply carries it', async () => {
    const run = await aRun('the run the supervisor closes and the office reads')
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-16 10:30:00', how: 'its starter' } })
    const closed = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/confirm`,
      headers: asAgent('hon-starter'),
      payload: { because: 'Read the report. The two criteria are met.' },
    })
    expect(closed.statusCode, closed.body).toBe(201)
    const said = closed.json() as { honour?: { standing: string }; honourSays: string }
    expect(said.honour, closed.body).toBeDefined()
    expect(said.honourSays).toContain('stored')
    const data = await theDataOf(run)
    expect((data['honour'] as { standing: string }).standing).toBe(said.honour?.standing)
  })
})



/**
 * THE TWO CASES, both seen on run 2TJhUkWVWOnm (message WQQrW9oCFVEP, problem Nn3781Q8frhE). Wave 13k round 7.
 * Each fixture is synthetic, built in the shape found on that run.
 *
 *   · Signal 5, report TrfdiT-oCC9Q's shape: one block lists the run's files, and a later block, more than 400
 *     characters on, gives each test file's sha256. The reading read "0 of N" because it looked only at the first
 *     mention.
 *   · Signal 4, session FFsyr8o6L6A8's shape: the inspector's check session was started in the worker's folder, and
 *     counted as "a second run of the same agent". A session of another agent does not count; a second run of the
 *     same agent in the same folder still does.
 *
 * MUTATIONS (wave 13k round 7), each after a control run: read only the first mention again (the five case goes red);
 * drop the `servingAgent` match (the four case goes red).
 */
describe('the tool maintainer’s two cases: every mention of a test file, and runs of the same agent only', () => {
  it('five: a report that lists its files first and gives each one’s hash in a later block is read as proved', async () => {
    const dir = aCheckout()
    const run = await aRun('the run whose report gives the hashes in a later block', { workingDirectory: dir, cutFrom: 'main' })
    const hash = 'b'.repeat(64)
    const report = await filed('hon-worker', 'report', 'What the run carries, and each file’s proof', {
      for: 'hon-starter',
      date: '2026-09-26',
      blocks: [
        { id: 'b-what', type: 'text', heading: 'What this run carries', text: `Files: hon-code/tests/example.test.ts.\n\n${'The change is described here at length, without a hash. '.repeat(12)}` },
        { id: 'b-each-file', type: 'text', heading: 'Each changed test file, at the tip, and its proof', text: `- hon-code/tests/example.test.ts (sha256 ${hash} at the tip): red under the mutation, green restored.` },
      ],
    })
    await aboutIt(report, run)
    const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('hon-worker'), payload: { dataPatch: { state: 'finished' } } })
    expect(finished.statusCode, finished.body).toBe(200)
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'proved every test by mutation')
    expect(mine, JSON.stringify(read)).toBeDefined()
    expect(mine?.evidence).toEqual([report])
  })

  async function aReleasedRunIn(folder: string, title: string): Promise<string> {
    const run = await aRun(title, { workingDirectory: folder })
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-26 11:00:00', how: 'an inspector' } })
    return run
  }

  it('four: an inspector’s check session in the worker’s folder is not a second run of the worker', async () => {
    const folder = '/synthetic/worktrees/isolated-keys'
    const run = await aReleasedRunIn(folder, 'the worker run released at the first asking')
    await filed('hon-starter', 'session', 'Check of the worker’s entry, run by hand', { state: 'running', runtime: 'claude-code', servingAgent: 'inspector', workingDirectory: folder })
    const read = await theReading(run)
    const mine = read.signals.find((one) => one.signal === 'needed no rework')
    expect(mine, JSON.stringify(read)).toBeDefined()
  })

  it('four: a second run of the same agent in the same folder still counts', async () => {
    const folder = '/synthetic/worktrees/worked-twice'
    const run = await aReleasedRunIn(folder, 'the worker run that was started again')
    const again = await aRun('the same worker, started again in the same folder', { workingDirectory: folder })
    const read = await theReading(run)
    expect(read.signals.find((one) => one.signal === 'needed no rework')).toBeUndefined()
    expect(read.missing.find((one) => one.signal === 'needed no rework')?.because).toContain(`(run ${again})`)
  })
})
