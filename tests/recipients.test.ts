// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RANKING WHO A MESSAGE COULD GO TO, AND REFUSING TO GUESS.
 *
 * Every test here is about one of two rules: use the
 * durable context Mole Office already holds to rank likely recipients, and never silently guess one.
 *
 * The two that matter most are the two that can do harm:
 *
 *   THE PICK-UP ANSWER. Addressing "the agent working on X" must never quietly become "a new agent
 *   that has never heard of X". A candidate whose transcript is gone has to SAY so before anybody
 *   presses Send, and it must still be listed rather than dropped, because dropping it is how a
 *   substitution starts.
 *
 *   THE REFUSALS. Two agents matching a phrase is a refusal naming both, not a ranking with a
 *   winner. A scorer would always have a top answer and would therefore never refuse.
 *
 * The tests build their own machine: a temporary home directory holding a transcript file, so
 * "this run can be picked up" and "this run cannot" are both states a test can produce rather
 * than things that only happen in production.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { DISCOVERY_KEY } from '../src/shared/discovery-stamp.ts'

type Recipients = typeof import('../src/server/lib/recipients.ts')
type Sessions = typeof import('../src/server/lib/sessions.ts')
type Plans = typeof import('../src/server/lib/plans.ts')
type Workspaces = typeof import('../src/server/lib/workspaces.ts')

let t: TestDb
let lib: Recipients
let sessionsLib: Sessions
let plansLib: Plans
let workspacesLib: Workspaces
let app: FastifyInstance
let scratch: string[] = []

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

beforeEach(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/recipients.ts')
  sessionsLib = await import('../src/server/lib/sessions.ts')
  plansLib = await import('../src/server/lib/plans.ts')
  workspacesLib = await import('../src/server/lib/workspaces.ts')
  const { recipientRoutes } = await import('../src/server/api/recipients.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(recipientRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch = []
})

// -------------------------------------------------------------------------------- small helpers

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-recipients-'))
  scratch.push(dir)
  return dir
}

/** A session record with no discovery stamp: one somebody filed by hand. */
function handFiled(title: string, extra: Record<string, unknown> = {}): PanelRecord {
  return t.api.createRecord({
    kind: 'session',
    title,
    summary: `why ${title} was started`,
    data: { state: 'idle', runtime: 'claude-code', ...extra },
    workspaceId: 'default',
    actor: HUMAN,
  })
}

/**
 * A session record carrying a discovery stamp, and a transcript on disk when asked for one.
 *
 * The stamp is what `pickUpOf` reads: the tool, that tool's own id for the conversation, and where
 * the transcript is. Writing the file or not writing it is how the two pick-up answers are made.
 */
function discovered(
  title: string,
  opts: { transcript: boolean; tool?: string; extra?: Record<string, unknown> } = { transcript: true },
): { record: PanelRecord; logPath: string; externalId: string } {
  const home = tempHome()
  const dir = join(home, 'projects', `-home-${THE_TEST_OFFICES_OWNER.id}-test-claude`)
  mkdirSync(dir, { recursive: true })
  const externalId = `ext-${title.replace(/\W/g, '')}`
  const logPath = join(dir, `${externalId}.jsonl`)
  if (opts.transcript) writeFileSync(logPath, '{"type":"user"}\n')
  const record = t.api.createRecord({
    kind: 'session',
    title,
    summary: `why ${title} was started`,
    data: {
      state: 'idle',
      runtime: 'claude-code',
      ...(opts.extra ?? {}),
      extra: {
        [DISCOVERY_KEY]: {
          tool: opts.tool ?? 'claude-code',
          externalId,
          logPath,
          resumeCommand: `claude --resume ${externalId}`,
          startedAt: '2026-08-14 09:00:00',
          entryPoint: 'cli',
          observedState: 'idle',
          stateReason: 'made by a test',
          filesTouched: [],
          filesComplete: false,
          at: '2026-08-15 10:00:00',
        },
      },
    },
    workspaceId: 'default',
    actor: HUMAN,
  })
  return { record, logPath, externalId }
}

/** An actor whose writes are attributed to one session record. */
const asRun = (sessionRecordId: string) =>
  ({ type: 'agent', id: 'claude-code', sessionId: sessionRecordId }) as const

const idsOf = (candidates: readonly { sessionId: string }[]) => candidates.map((c) => c.sessionId)

const get = (url: string) => app.inject({ method: 'GET', url })
const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, payload })
const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

// ============================================================ the ladder

describe('the ranked list is built from evidence Mole Office already holds', () => {
  it('puts the run that filed the record above the run that only edited it', () => {
    const filer = handFiled('filing run')
    const editor = handFiled('editing run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Force capture, second pass',
      data: {},
      workspaceId: 'default',
      actor: asRun(filer.id),
    })
    t.api.patchRecord(report.id, { summary: 'edited once' }, asRun(editor.id))
    t.api.patchRecord(report.id, { summary: 'edited twice' }, asRun(editor.id))

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(idsOf(answer.connected)).toEqual([filer.id, editor.id])
    expect(answer.connected[0]?.ground).toBe('filed-this-record')
    expect(answer.connected[0]?.why).toMatch(/^It filed this report on \d{4}-\d{2}-\d{2}\.$/)
    expect(answer.connected[1]?.ground).toBe('wrote-to-this-record')
    expect(answer.connected[1]?.why).toContain('2 times')
  })

  it('puts a run that SAID which work it was on above one Mole Office placed by what it wrote', () => {
    const stated = handFiled('the run that said so')
    const accidental = handFiled('the run that just wrote things')
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: 'Tray clamp calibration',
      data: { blockIds: [] },
      workspaceId: 'default',
      actor: HUMAN,
    })
    const step = t.api.createRecord({
      kind: 'task',
      title: 'Measure grip force',
      workspaceId: 'default',
      actor: HUMAN,
    })
    t.api.createLink({ fromId: step.id, toId: pipeline.id, type: 'part_of', actor: HUMAN })

    // One run says where it belongs. The other only wrote to the pipeline record.
    t.api.createLink({ fromId: stated.id, toId: pipeline.id, type: 'part_of', actor: HUMAN })
    t.api.patchRecord(pipeline.id, { summary: 'touched by the other run' }, asRun(accidental.id))

    const answer = lib.recipientsFor({ kind: 'record', id: step.id }, 'default')
    expect(idsOf(answer.connected)).toEqual([stated.id, accidental.id])
    expect(answer.connected[0]?.ground).toBe('said-it-was-on-this-work')
    expect(answer.connected[1]?.ground).toBe('filed-under-the-same-work')
    expect(answer.connected[1]?.why).toContain('from what it wrote rather than from anything it said')
  })

  it('says the weakest reason is the weakest, when a run only touched something linked to this', () => {
    const neighbourly = handFiled('neighbour run')
    const task = t.api.createRecord({ kind: 'task', title: 'Recalibrate', workspaceId: 'default', actor: HUMAN })
    const problem = t.api.createRecord({
      kind: 'problem',
      title: 'Grip slips above 15N',
      data: { symptom: 'the grip slips' },
      workspaceId: 'default',
      actor: HUMAN,
    })
    t.api.createLink({ fromId: task.id, toId: problem.id, type: 'relates_to', actor: HUMAN })
    t.api.patchRecord(problem.id, { summary: 'worked on by the neighbour run' }, asRun(neighbourly.id))

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default')
    const only = one(answer.connected, 'connected candidate')
    expect(only.sessionId).toBe(neighbourly.id)
    expect(only.ground).toBe('wrote-to-something-this-is-linked-to')
    expect(only.why).toContain('This is the weakest reason on the list')
  })

  it('keeps every other reason instead of dropping it for the strongest one', () => {
    const run = handFiled('busy run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Second pass',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    t.api.patchRecord(report.id, { summary: 'and then edited' }, asRun(run.id))

    const only = one(lib.recipientsFor({ kind: 'record', id: report.id }, 'default').connected, 'candidate')
    expect(only.ground).toBe('filed-this-record')
    expect(only.alsoWhy.join(' ')).toContain('It changed this report once')
  })

  it('lists a run with no connection under its own heading, never among the ranked ones', () => {
    const connected = handFiled('connected run')
    const stranger = handFiled('unconnected run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'A report',
      data: {},
      workspaceId: 'default',
      actor: asRun(connected.id),
    })

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(idsOf(answer.connected)).toEqual([connected.id])
    expect(idsOf(answer.recent)).toContain(stranger.id)
    expect(idsOf(answer.recent)).not.toContain(connected.id)
    const listed = answer.recent.find((c) => c.sessionId === stranger.id)
    expect(listed?.ground).toBeNull()
    expect(listed?.why).toContain('Nothing Mole Office holds connects this run')
  })

  it('answers "nothing is connected" rather than falling back to whatever is recent', () => {
    handFiled('a run that did nothing here')
    const task = t.api.createRecord({ kind: 'task', title: 'Untouched', workspaceId: 'default', actor: HUMAN })

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default')
    // NOTHING RANKED IS THE ANSWER, and it is an empty list rather than a sentence saying so. The
    // reply used to carry both and they could disagree; now there is one place to read it.
    expect(answer.connected).toEqual([])
  })
})

// ============================================================ can it be picked up

describe('every candidate says whether it can be picked up where it left off', () => {
  it('carries the runtime and that runtime’s own id when the transcript is there', () => {
    const { record, logPath, externalId } = discovered('live run', { transcript: true })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by the live run',
      data: {},
      workspaceId: 'default',
      actor: asRun(record.id),
    })

    const only = one(lib.recipientsFor({ kind: 'record', id: report.id }, 'default').connected, 'candidate')
    expect(only.pickUp.answer).toBe('yes')
    if (only.pickUp.answer !== 'yes') throw new Error('unreachable')
    expect(only.pickUp.runtime).toBe('claude-code')
    expect(only.pickUp.conversationId).toBe(externalId)
    expect(only.pickUp.transcript).toBe(logPath)
    expect(only.pickUp.resumeCommand).toContain(externalId)
  })

  it('says no, with the reason, when the transcript has gone — and still lists the run', () => {
    const { record, logPath } = discovered('gone run', { transcript: false })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by the gone run',
      data: {},
      workspaceId: 'default',
      actor: asRun(record.id),
    })

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    const only = one(answer.connected, 'candidate')
    expect(only.pickUp.answer).toBe('no')
    if (only.pickUp.answer !== 'no') throw new Error('unreachable')
    expect(only.pickUp.why).toBe('transcript-gone')
    expect(only.pickUp.because).toContain(logPath)
    expect(answer.read.whenItCannotBePickedUp).toContain('start a new agent and hand it this context, or stop')
    // The count, which is what a screen draws. The reason is on the candidate, above.
    expect(answer.read.pickUp).toEqual({ total: 1, stuck: 1, allSameReason: 'transcript-gone' })
  })

  it('says no, and why, for a run nobody ever observed', () => {
    const record = handFiled('hand-filed run')
    const pick = lib.pickUpOf(record)
    expect(pick.answer).toBe('no')
    if (pick.answer !== 'no') throw new Error('unreachable')
    expect(pick.why).toBe('never-observed')
  })

  it('answers unknown, not no, for a runtime this build cannot read', () => {
    const { record } = discovered('another tool', { transcript: true, tool: 'codex' })
    const pick = lib.pickUpOf(record)
    expect(pick.answer).toBe('unknown')
    if (pick.answer !== 'unknown') throw new Error('unreachable')
    expect(pick.why).toBe('runtime-unknown')
  })
})

// ============================================================ what was pointed at

describe('what Mole Office made of what you pointed at is shown back', () => {
  it('says a plan line is not tracked as work yet, instead of ranking anything', () => {
    handFiled('some run')
    const made = plansLib.createPlan({ title: 'This week', body: 'Test the gripper' }, HUMAN)
    const line = one(plansLib.linesOf(made.plan.id), 'plan line')

    const answer = lib.recipientsFor({ kind: 'planLine', planId: made.plan.id, lineId: line.id }, 'default')
    expect(answer.context.record).toBeNull()
    // A CODE A SCREEN CAN BRANCH ON, and the sentence behind it. Both, because "which case is it"
    // and "say it in words" are different questions and the reply used to answer only the second.
    expect(answer.context.nothingFiled?.code).toBe('line-not-tracked')
    expect(answer.context.nothingFiled?.detail).toContain('not tracked as work yet')
    expect(answer.connected).toEqual([])
  })

  it('reads the project off the record, and says which project the request had named', () => {
    workspacesLib.createWorkspace({ id: 'robotics', title: 'Robotics' })
    const theirs = t.api.createRecord({
      kind: 'task',
      title: 'Their task',
      workspaceId: 'robotics',
      actor: HUMAN,
    })

    // The request names `default`; the record is in `robotics`. The record wins, and the answer
    // says both, because an answer about a project the caller did not name would look normal.
    const answer = lib.recipientsFor({ kind: 'record', id: theirs.id }, 'default')
    expect(answer.context.workspaceId).toBe('robotics')
    expect(answer.context.askedForProject).toBe('default')
  })

  it('refuses a record id nothing answers to rather than answering about nothing', () => {
    expect(() => lib.recipientsFor({ kind: 'record', id: 'nope' }, 'default')).toThrow(/No record with id nope/)
  })
})

// ============================================================ fixtures and deleted runs

describe('a candidate that is not a real agent says so', () => {
  it('marks a fixture session as fixture content rather than offering a made-up agent', () => {
    const fixture = t.api.createRecord({
      kind: 'session',
      title: 'seeded run',
      data: { state: 'finished' },
      workspaceId: 'default',
      actor: HUMAN,
      origin: 'fixture',
    })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by the fixture',
      data: {},
      workspaceId: 'default',
      actor: asRun(fixture.id),
    })

    const only = one(lib.recipientsFor({ kind: 'record', id: report.id }, 'default').connected, 'candidate')
    expect(only.origin).toBe('fixture')
    expect(only.originNote).toContain('fixture content')
    expect(only.originNote).toContain('not a real run')
  })

  it('does not report the record’s stored state as an observation', () => {
    const run = handFiled('a run that says it is running', { state: 'running' })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by it',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    const only = one(lib.recipientsFor({ kind: 'record', id: report.id }, 'default').connected, 'candidate')
    expect(only.recordedState?.word).toBe('running')
    expect(only.recordedState?.because).toContain('not a check made now')
  })
})

// ============================================================ say who you mean

describe('say who you mean, without a language model', () => {
  it('resolves one agent and says which words matched what', () => {
    handFiled('controller calibration sweep')
    handFiled('gripper force capture')

    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.title).toBe('controller calibration sweep')
    expect(answer.read.words).toEqual(['controller', 'calibration'])
    expect(answer.note).toContain('“controller” matched the run’s title')
    expect(answer.note).toContain('“calibration” matched')
  })

  it('refuses, naming every candidate, when the words reach more than one', () => {
    handFiled('calibration sweep, morning')
    handFiled('calibration sweep, afternoon')

    const answer = lib.resolveRecipient('the agent working on calibration', null, 'default')
    expect(answer.outcome).toBe('many')
    if (answer.outcome !== 'many') throw new Error('unreachable')
    expect(answer.recipient).toBeNull()
    expect(answer.candidates).toHaveLength(2)
    expect(answer.note).toContain('calibration sweep, morning')
    expect(answer.note).toContain('calibration sweep, afternoon')
    // THE PHRASE THE OWNER BANNED BY NAME IS NOT ON IT, and what it was doing is: the refusal
    // names every candidate and says what to do, and `recipient` is null.
    expect(answer.note).not.toContain('will not choose between them')
    expect(answer.note).toContain('Pick one, or add a word that tells them apart')
    expect(answer.recipient).toBeNull()
  })

  it('refuses, and offers a new agent, when nothing matched', () => {
    handFiled('calibration sweep')
    const answer = lib.resolveRecipient('the agent working on hydraulics', null, 'default')
    expect(answer.outcome).toBe('none')
    if (answer.outcome !== 'none') throw new Error('unreachable')
    expect(answer.why).toBe('nothing-matched')
    expect(answer.startANewAgent).toContain('Mole Office will not pick one for you')
  })

  it('refuses when every word typed is one that names any agent, rather than ranking by noise', () => {
    handFiled('a run with a very long title about many different things')
    handFiled('short run')

    const answer = lib.resolveRecipient('the agent working on it', null, 'default')
    expect(answer.outcome).toBe('none')
    if (answer.outcome !== 'none') throw new Error('unreachable')
    expect(answer.why).toBe('no-words-to-match-with')
    expect(answer.read.words).toEqual([])
    expect(answer.read.stripped.map((s) => s.word)).toEqual(['the', 'agent', 'working', 'on', 'it'])
    expect(answer.read.stripped[1]?.because).toContain('every candidate is an agent')
  })

  it('needs every word to be found, so a partial match is not a match', () => {
    handFiled('controller calibration')
    handFiled('controller tuning')

    // "controller" is on both. "calibration" is on one. Counting the hits would rank rather than
    // resolve, and a scorer that ranked would never refuse anything.
    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.title).toBe('controller calibration')
  })

  it('matches the work a run is filed under, not only its own title', () => {
    const run = handFiled('run 41ba')
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: 'Controller calibration',
      data: { blockIds: [] },
      workspaceId: 'default',
      actor: HUMAN,
    })
    t.api.createLink({ fromId: run.id, toId: pipeline.id, type: 'part_of', actor: HUMAN })

    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.sessionId).toBe(run.id)
    expect(answer.matched.some((m) => m.where === 'filed-under')).toBe(true)
  })

  it('keeps what was typed, exactly, beside what it made of it', () => {
    handFiled('calibration sweep')
    const said = '  the agent working on CALIBRATION  '
    const answer = lib.resolveRecipient(said, null, 'default')
    expect(answer.read.said).toBe(said)
    expect(answer.read.words).toEqual(['calibration'])
  })
})

// ============================================================ the classification cannot drift

describe('the statement-or-accident reading stays in step with sessions.ts', () => {
  it('classifies every placement ground sessions.ts declares, and no others', () => {
    const classified = new Set([...lib.statementGrounds()])
    for (const ground of sessionsLib.PLACEMENT_GROUNDS) {
      expect(typeof lib.saysWhereItBelongs(ground)).toBe('boolean')
    }
    // The four stated ones, in the order sessions.ts declares them. A ground added there and not
    // classified here fails `tsc`; this pins which side of the line the existing ones fall on.
    expect([...classified]).toEqual(['part-of-link', 'link', 'part-of-block-link', 'block-link'])
  })
})

// ============================================================ the routes

describe('the routes', () => {
  it('answers about one record and carries the rule it used', async () => {
    const run = handFiled('a run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'A report',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    const res = await get(`/api/agent/recipients?record=${report.id}`)
    expect(res.statusCode).toBe(200)
    const answer = body(res)
    expect(answer['connected']).toHaveLength(1)
    expect(answer['read']['rule']).toContain('never guesses')
    expect(answer['read']['tookMs']).toBeGreaterThanOrEqual(0)
  })

  it('refuses a request that points at two things instead of picking one', async () => {
    const res = await get('/api/agent/recipients?record=abc&window=def')
    expect(res.statusCode).toBe(400)
    expect(body(res)['error']).toContain('Point at one thing')
  })

  it('refuses half a plan line rather than reading the plan on its own', async () => {
    const res = await get('/api/agent/recipients?plan=abc')
    expect(res.statusCode).toBe(400)
    expect(body(res)['error']).toContain('named by both')
  })

  it('answers a refusal as an answer, with no recipient on it', async () => {
    handFiled('calibration sweep, morning')
    handFiled('calibration sweep, afternoon')
    const res = await post('/api/agent/recipients/resolve', { said: 'the agent doing calibration' })
    expect(res.statusCode).toBe(200)
    expect(body(res)['outcome']).toBe('many')
    expect(body(res)['recipient']).toBeNull()
  })
})

// ============================================================ a whole list of refusals

/**
 * WHAT THESE TESTS ARE ABOUT, MEASURED ON A COPY OF THE OWNER'S CORPUS ON 19 AUGUST 2026.
 *
 * All 92 of the owner's session records carried no conversation, so every candidate on every ranked list
 * answered "cannot be picked up". The note said "24 of them cannot be picked up", which reads as
 * though the other agents on the reply can. None of them could.
 *
 * THESE ARE TESTS OF WHAT THE ANSWER HAS TO SAY, NOT OF THE WORDING IT SAYS IT IN. Each one asserts
 * on the fact — that the reply admits it is a whole list of refusals, and that it says what would
 * change that — rather than on a whole sentence. If the wording improves and one of these fails,
 * the fix is to move the assertion onto the new words for the same fact, not to restore the old
 * sentence.
 */
describe('a list where nothing can be picked up says so as one fact', () => {
  /** Two hand-filed runs that both wrote to one record, so both are ranked and neither is resumable. */
  function twoRunsAndTheirRecord(): string {
    const first = handFiled('the morning run')
    const second = handFiled('the afternoon run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'What the two runs wrote',
      data: {},
      workspaceId: 'default',
      actor: asRun(first.id),
    })
    t.api.patchRecord(report.id, { summary: 'edited by the second run' }, asRun(second.id))
    return report.id
  }

  it('says none of them can be picked up, rather than counting the ones that cannot', () => {
    const reportId = twoRunsAndTheirRecord()
    const answer = lib.recipientsFor({ kind: 'record', id: reportId }, 'default')
    expect(answer.connected.length).toBe(2)
    expect(answer.connected.every((c) => c.pickUp.answer !== 'yes')).toBe(true)
    // The fact: the reply says how many agents are on it and how many of those are unreachable, so
    // "all of them" and "2 of 7" cannot be confused. It used to be a sentence and is now two counts.
    expect(answer.read.pickUp.total).toBe(2)
    expect(answer.read.pickUp.stuck).toBe(2)
  })

  it('says what writes a conversation down, since every refusal has the same reason', () => {
    const reportId = twoRunsAndTheirRecord()
    const answer = lib.recipientsFor({ kind: 'record', id: reportId }, 'default')
    // The fact: a reader of a list of refusals is told what would change it. The finding is that
    // every one of them gives the SAME reason — which no single row can show — and the rule beside
    // it names the two things that write a conversation down, so the answer is not a dead end.
    expect(answer.read.pickUp.allSameReason).toBe('never-observed')
    expect(answer.read.conversationRule).toContain('POST /api/sessions/discover')
  })

  it('does not say the whole list is unreachable when one of them can be picked up', () => {
    const { record } = discovered('a run Mole Office has really seen', { transcript: true })
    const handled = handFiled('a run nobody stamped')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Written by the seen run',
      data: {},
      workspaceId: 'default',
      actor: asRun(record.id),
    })
    t.api.patchRecord(report.id, { summary: 'and edited by the other one' }, asRun(handled.id))

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.connected.length).toBe(2)
    expect(answer.read.pickUp.total).toBe(2)
    expect(answer.read.pickUp.stuck).toBe(1)
    // The reason for the one that is stuck is still worth saying. What must not be said is that
    // the whole list is unreachable, because a person acts differently on "none of these" than on
    // "one of these". `stuck` below `total` is the whole of that, in two numbers.
    expect(answer.read.pickUp.allSameReason).toBe('never-observed')
    expect(answer.read.pickUp.stuck).not.toBe(answer.read.pickUp.total)
  })
})

// ============================================================ which of these are real runs

describe('the list says which candidates are real runs and which are not', () => {
  /** One fixture run and one authored run, both of which wrote to the record you point at. */
  function oneOfEach(): string {
    const fixture = t.api.createRecord({
      kind: 'session',
      title: 'a seeded run',
      summary: 'why the seeded run was started',
      data: { state: 'idle', runtime: 'claude-code' },
      workspaceId: 'default',
      actor: HUMAN,
      origin: 'fixture',
    })
    const real = handFiled('a run somebody filed')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Written by both',
      data: {},
      workspaceId: 'default',
      actor: asRun(fixture.id),
    })
    t.api.patchRecord(report.id, { summary: 'edited by the real one' }, asRun(real.id))
    return report.id
  }

  it('counts both sides, so the reader does not have to subtract', () => {
    const answer = lib.recipientsFor({ kind: 'record', id: oneOfEach() }, 'default')
    expect(answer.read.origins.fixture).toBe(1)
    expect(answer.read.origins.authored).toBe(1)
  })

  it('says outright when not one of them is a real run', () => {
    const fixture = t.api.createRecord({
      kind: 'session',
      title: 'the only run there is',
      summary: 'why it was started',
      data: { state: 'idle', runtime: 'claude-code' },
      workspaceId: 'default',
      actor: HUMAN,
      origin: 'fixture',
    })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Written by fixture content',
      data: {},
      workspaceId: 'default',
      actor: asRun(fixture.id),
    })
    // 56 of the 56 runs in the owner's `robotics` project are fixture rows, so this is the owner's commonest
    // list rather than an edge case. "1 of them is fixture content" and nothing else would read as a
    // caveat on a list of agents, when in fact the list holds no agent at all.
    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.read.origins.authored).toBe(0)
    expect(answer.read.origins.fixture).toBeGreaterThan(0)
  })
})

// ============================================================ a stamp that names only the conversation

describe('a stamp holding only the conversation is read honestly', () => {
  it('answers with a null resume command rather than a missing one', () => {
    const home = tempHome()
    const dir = join(home, 'projects', `-home-${THE_TEST_OFFICES_OWNER.id}-test-claude`)
    mkdirSync(dir, { recursive: true })
    const externalId = 'only-the-conversation'
    const logPath = join(dir, `${externalId}.jsonl`)
    writeFileSync(logPath, '{"type":"user"}\n')

    // THE THREE FIELDS THAT NAME A CONVERSATION AND NOTHING ELSE. This is what an agent writing
    // `data.extra.discovered` through the API produces, and what tests/agent-dispatch.test.ts
    // writes. `stampOf` used to check these three and hand back the whole stored object, so a
    // reader of the reply got a missing key where the type promised `string | null`.
    const record = t.api.createRecord({
      kind: 'session',
      title: 'a run that says which conversation it is',
      summary: 'why it was started',
      data: { state: 'idle', runtime: 'claude-code', extra: { [DISCOVERY_KEY]: { tool: 'claude-code', externalId, logPath } } },
      workspaceId: 'default',
      actor: HUMAN,
    })

    const pick = lib.pickUpOf(record)
    expect(pick.answer).toBe('yes')
    if (pick.answer !== 'yes') throw new Error('unreachable')
    expect(pick.conversationId).toBe(externalId)
    expect(pick.transcript).toBe(logPath)
    // The fact: a field the reply's type says is a string or null is one of those two, never absent.
    expect(pick.resumeCommand).toBeNull()
    expect(JSON.parse(JSON.stringify(pick))).toHaveProperty('resumeCommand', null)
  })
})

// ============================================ Mole Office's own processes are not runs to write to

/**
 * MOLE OFFICE FILES A SESSION RECORD FOR ITS OWN PROCESSES, AND NONE OF THEM IS A RECIPIENT.
 *
 * The API server files one at every start, and so do the message worker, the browser app and the
 * dev supervisor. Every one is a session record, so every one was offered in the To control as a
 * run a comment could be written to. On a copy of the owner's database the first six rows offered
 * were all of them. Choosing one wrote nothing and explained itself with the name of a database
 * field. Problem `TXUeeKcpTVI4`.
 *
 * The fact they are dropped by is the stored one: a runtime word the office files for its own
 * processes, or `startedByMoleOffice`. Not the title.
 */
describe("Mole Office's own processes are never offered as runs to write to", () => {
  /** A session record of the shape one of Mole Office's own processes files for itself. */
  function serverProcess(title: string, data: Record<string, unknown>): PanelRecord {
    return t.api.createRecord({
      kind: 'session',
      title,
      summary: `why ${title} was started`,
      data: { state: 'running', ...data },
      workspaceId: 'default',
      actor: HUMAN,
    })
  }

  function offered(): string[] {
    const answer = lib.recipientsFor(null, 'default')
    return [...answer.connected, ...answer.recent].map((one) => one.sessionId)
  }

  it('leaves out the API server, the message worker, the browser app and the dev supervisor', () => {
    const anAgentRun = handFiled('Calibration work')
    const apiServer = serverProcess('The API server', { runtime: 'mole-office', doing: 'serving the API' })
    const worker = serverProcess('The message worker', { runtime: 'mole-office', startedByMoleOffice: true })
    const browser = serverProcess('The browser app', { runtime: 'vite', doing: 'serving the pages' })
    const supervisor = serverProcess('The dev supervisor', { runtime: 'mole-office', doing: 'watching the code' })

    const list = offered()
    expect(list, 'a run somebody could really write to').toContain(anAgentRun.id)
    for (const own of [apiServer, worker, browser, supervisor]) {
      expect(list, `${own.title} is one of Mole Office's own processes and nothing can be addressed to it`).not.toContain(
        own.id,
      )
    }
  })

  it('drops a process Mole Office says it started even where the runtime word would pass', () => {
    const started = serverProcess('A process Mole Office started', { runtime: 'claude-code', startedByMoleOffice: true })
    expect(offered()).not.toContain(started.id)
  })

  it('still offers a run that names no runtime, because absent means nobody said', () => {
    const nobodySaid = t.api.createRecord({
      kind: 'session',
      title: 'A run that never said which tool it is',
      summary: 'why it was started',
      data: { state: 'idle' },
      workspaceId: 'default',
      actor: HUMAN,
    })
    expect(offered(), 'a run with no runtime word can still be given a durable identity').toContain(nobodySaid.id)
  })

  it('says nothing about them in the fuzzy match either, because they are off the one list', () => {
    serverProcess('The API server', { runtime: 'mole-office', doing: 'serving the API' })
    const resolved = lib.resolveRecipient('the API server', null, 'default')
    expect(resolved.candidates.map((one) => one.candidate.title)).not.toContain('The API server')
    expect(resolved.searched.agents, 'the server process was not among the runs searched').toBe(0)
  })
})
