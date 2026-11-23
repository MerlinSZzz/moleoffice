// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE WRITES THE SANDBOX LAUNCHER'S NOTICES ITSELF, AS OFFICE LINES, AND NEVER IN THE RUN'S SESSION. Wave 13j,
 * problem Grbb87VX3pND (src/server/lib/launcher-notices.ts, src/config/launcher-notices.mjs).
 *
 * Until now the launcher in a sandbox sent "Run X ended with its report", its notices of a Codex stop and the 8-hour reminder
 * as messages under the run's own key, so the office read the launcher's words as the run's last word to its starter.
 * A count found 68 checks held for that on the live office on 18 October 2026 (k0CfEnhvxD89). Way (c), agreed
 * in LEg_tnVeIjIB: the launcher's finishing write carries only a notice kind from a fixed list, and the office
 * writes its own sentence from facts it holds. The long-run reminder runs on the office's own clock.
 *
 * WHAT IS CLAIMED
 *   1. The first test: a sandbox round the launcher finishes with a records submission, with no message from the agent,
 *      is held, as it met no case that asks for a check. Its starter gets one office line about the run and one line
 *      saying the check is held, whose words say nothing of a message. Nothing is written in the run's session.
 *   2. The second test: a run crashed with a Codex capacity notice, or with a Codex usage-limit notice, has no
 *      "stopped-to-ask" reason in its round-end account, and the starter gets the office's line. Its sentence names the
 *      model the write names, whatever the model. A usage limit says where to ask again only when the office's table holds
 *      an entry for the model: Luna's entry, or a made-up entry for a made-up model. Any other model, and a write that names
 *      none, gets the sentence that says nothing was started again.
 *   3. The third test: a run that writes "I will not seal." is still held, when the launcher finishes it with its
 *      notice and when the run seals itself.
 *   4. A notice kind outside the list, a notice on a run not started in a sandbox, and a notice that does not fit the
 *      write it comes on are refused, and nothing is written: the run still says running, and no line is sent. So are a
 *      Codex kind with no model beside it, a model beside no Codex kind, and a model that is not one name. The refusal of a
 *      kind outside the list names the kinds of the list.
 *   5. The office reminds a starter once, from its own clock, of a sandbox run that still says running 8 hours after it
 *      was filed. It stops nothing, and a run not started in a sandbox or no longer running gets no reminder.
 *   6. The office's line names the reports linked to the run oldest first, in the order they were written, even when
 *      they were filed in the same second. A stamp holds whole seconds, so only the revisions ledger can tell those apart.
 *   7. The sentence of a Codex stop, read from a made-up table: a made-up model's entry gives that entry's advice, under its
 *      own name and under an alias; a capacity stop never gives advice; a name that is not one word is not repeated.
 *   8. A launcher older than the Codex stops for every model sends 'luna-limit' and 'sol-capacity'. The office no longer
 *      takes them: with no model and with a model each is refused with 400. The refusal names tellTheStarter and the kinds
 *      it may be, the run is left as it was, and no line is sent to the starter.
 *   9. A model's name of 200 characters is taken and named in the line. One of 201 is refused, as the refusal says.
 *  10. A long wait: the write that marks a run as waiting on a usage limit whose next try is days away, with
 *      'a-long-wait', tells its starter in the office's own words, and the secretary who takes the usage notices too. They
 *      are told once when they are the same agent. The line names the limit, the next try's time and the key by its name,
 *      and quotes nothing the run wrote. The run still says running. The same wait's next write cannot tell again.
 *  11. 'a-long-wait' is refused, and nothing is written, for a next try in the past, of seconds or under an hour away,
 *      for a key outside the list or none, for a write with no mark or one that ends the run, beside a model, and for a
 *      run not in a sandbox. A refused key is not repeated.
 *  12. A wait on the provider router names the router's Go slots by their labels as the office holds them, or says it
 *      holds none, or that it could not read them while the router is off. No key is in the line. Words that name no limit
 *      say so, and a provider other than Go is not named as Go.
 *  13. A next try the office cannot defend is told without its time: one more than 32 days away (in 2099 too), one before
 *      the moment the wait was seen, and a reset OpenCode's retry did not name. The line says the time is not given and
 *      why, and quotes no date. The mark is stored as it was sent.
 *
 * MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs). A control run first: all green. Then one line at a time:
 *   - the record door writing no line after the write (`toldTheStarter` always null): 1, 2 and 3 went red;
 *   - the door not refusing a notice that does not fit (the `noticeDoesNotFit` throw skipped): 4 went red;
 *   - the reminder pass not skipping a run already reminded, reminding before 8 hours, or reminding a run not in a
 *     sandbox (three runs): 5 went red each time;
 *   - `theRunsOwnMessageTo` also taking an office line about the run as the run's own: 1, 2 and 3 went red;
 *   - the Sol and Luna sentences swapped: 2 went red;
 *   - a write with a notice releasing the check (`hold: false`): 3 went red;
 *   - `theReportsLinkedTo` ordering by stamp and then by id, without the ledger's order: 6 went red.
 * Each restored, and the control run again: green.
 *
 * MUTATIONS OF THE CODEX STOPS FOR EVERY MODEL, ONE PER CASE, each to turn the case named red:
 *   - the office's sentence giving Luna's advice to every model at a usage limit: 2 and 7;
 *   - the office's sentence reading no entry, so Luna and the made-up entry get the plain sentence: 2 and 7;
 *   - the capacity and usage-limit lines swapped: 2;
 *   - the office naming no model (`model` dropped for null): 2;
 *   - the record door taking a Codex kind with no `theModelItRanOn`: 4;
 *   - the record door taking any words as `theModelItRanOn` (its shape check dropped): 4;
 *   - the refusal of a kind outside the list naming every kind the door takes: 4;
 *   - the older launcher's kinds dropped from the door's list, or one dropped from their table: 8;
 *   - A_MODEL_NAME taking at most 199 characters: 9; taking 201: 9 and 7.
 *
 * MUTATIONS OF THE LONG WAIT, one at a time after a control run, each to turn the case named red:
 *   - `tellOfALongWait` writing no line to the starter: 10;
 *   - `tellOfALongWait` telling no secretary: 10;
 *   - the door taking a second long wait on the same run (its check of the stored mark skipped): 10;
 *   - `aLongWait` taking a next try of any distance, the hour dropped: 11;
 *   - `itsKey` taking any key: 11;
 *   - `theGoSlotNames` giving no labels: 12;
 *   - `theNextTryToShow` always showing the time: 13;
 *   - `theNextTryToShow` not asking whether the error named the reset (`aResetTheErrorNamed`): 13.
 *
 * Every key, run and report is made up.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { SANDBOX_RUN_REMINDER, THE_LAUNCHERS_NOTICES, aCodexStopNotice } from '../src/config/launcher-notices.mjs'
import { theHoldOfARoundWithNoCaseSays } from '../src/server/lib/how-a-round-ended-rules.ts'
import { readHowTheRoundEnded } from '../src/shared/how-the-round-ended.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp, parseAnyStamp } from '../src/shared/time.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { aLabelFor, EVERY_CHAPTER, thePageOf } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const STARTER = 'a-launcher-notice-starter'
const HANDLE = 'a-launched-round'

let t: TestDb
let app: FastifyInstance
let starterId = ''
const directories: string[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const asTheRun = (session: string, key: string): Record<string, string> => ({ ...asAgent(HANDLE), 'x-mole-office-session': session, 'x-mole-office-key': key })

type ARun = { id: string; key: string }

/** A running run filed by the office's worker, in a sandbox or not. Its folder is a made-up empty one. */
async function aRun(options: { sandbox: boolean }): Promise<ARun> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-launcher-notices-'))
  directories.push(dir)
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic launched round',
      data: {
        state: 'running', runtime: 'codex', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'a made-up round', workingDirectory: dir,
        ...(options.sandbox ? { sandbox: { template: 'test-template', container: 'test-row', folder: dir } } : {}),
      },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  return { id: body.record.id, key: String(body.runKey?.key) }
}

let reportsFiled = 0

/**
 * The run files a report linked about itself and about a page, as an agent does before its command ends. It is in form,
 * so no fault of form refuses the run's seal: complete, with a title of its own and its label.
 */
async function itsReport(run: ARun): Promise<string> {
  reportsFiled += 1
  const report = await app.inject({
    method: 'POST', url: '/api/records', headers: asTheRun(run.id, run.key),
    payload: { kind: 'report', title: `Synthetic report number ${String(reportsFiled)} of a launched round`, links: [{ type: 'about', toId: run.id }, { type: 'about', toId: thePageOf(t) }],
      data: { for: 'The starter of the made-up round', date: '2026-10-18', chaptersRead: EVERY_CHAPTER, blocks: [{ id: 'b1', type: 'text', text: 'A made-up report.' }] } },
  })
  expect(report.statusCode, report.body.slice(0, 400)).toBe(201)
  const id = (report.json() as { record: { id: string } }).record.id
  await aLabelFor(id)
  return id
}

/** The launcher's records finish after a clean exit, as tools/sandbox-start.mjs writes it, with its notice kind. */
function theLaunchersRecordsFinish(run: ARun, report: string, tellTheStarter: unknown = 'ended-with-its-report', theModelItRanOn?: unknown) {
  return app.inject({
    method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key),
    payload: {
      dataPatch: {
        state: 'finished', submission: { kind: 'records', records: [report] },
        detail: 'Synthetic: finished by the launcher, which read its command\'s clean exit and a report linked to it.',
        commandEnded: { at: '2026-10-18 15:00:00', code: 0 },
      },
      remindBeforeTheSeal: false,
      tellTheStarter,
      theModelItRanOn,
    },
  })
}

/**
 * The launcher's crash write after a Codex stop, as tools/sandbox-start.mjs writes it, with its notice kind and the model's
 * name. A model left undefined is left out of the write.
 */
function theLaunchersCrash(run: ARun, detail: string, tellTheStarter: unknown, theModelItRanOn?: unknown) {
  return app.inject({
    method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key),
    payload: { dataPatch: { state: 'crashed', detail, commandEnded: { at: '2026-10-18 15:00:00', code: 1 } }, tellTheStarter, theModelItRanOn },
  })
}

/** The words a stop ends with when nothing says where to ask again: the same for a capacity stop and a usage limit. */
const NOTHING_STARTED_AGAIN = 'so this run has ended. Nothing was started again on another model; its supervisor chooses what comes next.'

type WhereToAskAgain = { runtime: string; model: string }

/**
 * The office's own copy of the table: its aliases, and its entries of where to ask again after a Codex usage limit, which
 * are undefined while the table holds none. freshDb resets the modules before the office is built, so a copy imported at
 * this file's top would not be the one the office reads. Imported after the office is built, it is.
 */
const theOfficesTable = async () =>
  (await import('../src/config/model-efforts.mjs')).LAUNCHER_MODEL_COMPATIBILITY as {
    aliases: Record<string, string>
    askAgainAfterACodexUsageLimit?: Record<string, WhereToAskAgain>
  }

/** The run writes its starter a message, in its own session. */
async function theRunWritesItsStarter(run: ARun, body: string): Promise<string> {
  const sent = await app.inject({ method: 'POST', url: '/api/records', headers: asTheRun(run.id, run.key), payload: { kind: 'message', title: 'Synthetic word to the starter', data: { body, to: [{ kind: 'agent', id: starterId }] } } })
  expect(sent.statusCode, sent.body.slice(0, 400)).toBe(409)
  const id = (sent.json() as { record: { id: string } }).record.id
  expect(id).toBeTruthy()
  return id
}

/** Every office line of one notice kind about a run, with whom it went to and its whole sentence. */
function theOfficeLines(run: string, notice: string): { id: string; to: string; said: string }[] {
  return t.client.sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.to[0].id') AS 'to', json_extract(data, '$.saidInFull') AS said FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = ? ORDER BY created_at, id",
    )
    .all(run, notice) as { id: string; to: string; said: string }[]
}

/** Every office line about a run, whatever its kind. */
const everyOfficeLineAbout = (run: string): string[] =>
  (t.client.sqlite
    .prepare("SELECT json_extract(data, '$.notice') AS notice FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.aboutRun') = ?")
    .all(run) as { notice: string }[]).map((one) => one.notice)

/** Every message written in the run's own session: what the office reads as the run's own words. */
function theMessagesInTheRunsSession(run: string): string[] {
  return (t.client.sqlite
    .prepare("SELECT r.id AS id FROM records r JOIN revisions v ON v.record_id = r.id AND v.op = 'create' WHERE v.session_id = ? AND r.kind = 'message'")
    .all(run) as { id: string }[]).map((one) => one.id)
}

/** A crash write the door refuses with `status`: the run still says running. The caller checks that no line was sent. */
async function refusedAs(status: number, why: string, tellTheStarter: unknown, theModelItRanOn?: unknown): Promise<ARun> {
  const run = await aRun({ sandbox: true })
  const crashed = await theLaunchersCrash(run, 'Synthetic: the command exited 1.', tellTheStarter, theModelItRanOn)
  expect(crashed.statusCode, `${why}: ${crashed.body.slice(0, 400)}`).toBe(status)
  expect(theStateOf(run.id), why).toBe('running')
  return run
}

const theAccountOf = (id: string) => readHowTheRoundEnded(t.api.getRecord(id)!.data['howTheRoundEnded'])
const theStateOf = (id: string) => t.api.getRecord(id)!.data['state']

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: STARTER, name: STARTER, role: 'secretary', runtime: 'claude-code' } })
  expect(starter.statusCode, starter.body.slice(0, 300)).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(STARTER), payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'codex', workArea: ['work'] } })
  expect(worker.statusCode, worker.body.slice(0, 300)).toBe(201)
  const agents = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  starterId = agents.agents.find((one) => one.handle === STARTER)!.id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe("The tool maintainer's three tests", () => {
  it('1: a round the launcher finishes with its report, and no message from the agent, is held, as no case asks for its check; the office tells the starter', async () => {
    const run = await aRun({ sandbox: true })
    const report = await itsReport(run)
    const finished = await theLaunchersRecordsFinish(run, report)
    expect(finished.statusCode, finished.body.slice(0, 800)).toBe(200)
    const reply = finished.json() as { howTheRoundEnded?: { sealed?: boolean; theCheck?: string }; tellTheStarter?: { told?: string } }
    expect(reply.howTheRoundEnded).toMatchObject({ sealed: true, theCheck: 'held' })
    expect(reply.howTheRoundEnded).not.toHaveProperty('message')
    const lines = theOfficeLines(run.id, 'aRunEndedWithItsReport')
    expect(lines).toEqual([{ id: reply.tellTheStarter?.told, to: starterId, said: expect.stringContaining(`Run ${run.id} ended with its report.`) }])
    expect(lines[0]!.said).toContain(report)
    expect(lines[0]!.said).toContain('the agent did not say finished itself')
    const held = theOfficeLines(run.id, 'theCheckIsHeld')
    expect(held).toEqual([{ id: expect.any(String), to: starterId, said: expect.stringContaining(theHoldOfARoundWithNoCaseSays(true)) }])
    expect(held[0]!.said).not.toMatch(/message/iu)
    expect(theMessagesInTheRunsSession(run.id)).toEqual([])
  })

  it('2: a Codex stop on any model has no "stopped-to-ask" reason, and the starter gets the office\'s line naming the model', async () => {
    const { aliases, askAgainAfterACodexUsageLimit: entries } = await theOfficesTable()
    expect(entries, 'askAgainAfterACodexUsageLimit in src/config/launcher-model-compatibility.json').toBeTypeOf('object')
    // LUNA AS A START NAMES IT, with its provider, so the entry is found through the aliases.
    const luna = Object.keys(aliases).find((name) => name.includes('/') && aliases[name] === 'gpt-6-luna')
    const lunasEntry = entries?.['gpt-6-luna']
    expect([luna, lunasEntry], "Luna's alias and its entry: the owner's rule that a Codex limit on Luna is asked again elsewhere").not.toContain(undefined)
    const madeUp = `made-up-codex-model-${randomBytes(4).toString('hex')}`
    const madeUpWithAnEntry = `made-up-codex-model-${randomBytes(4).toString('hex')}`
    const itsEntry = { runtime: 'made-up-runtime', model: `made-up-provider/${madeUpWithAnEntry}` }
    entries![madeUpWithAnEntry] = itsEntry
    onTestFinished(() => { delete entries![madeUpWithAnEntry] })
    const cases = [
      ['codex-usage-limit', 'codexMetAUsageLimit', luna, `Codex rate-limited ${luna}, so ask again with runtime ${lunasEntry!.runtime} and model ${lunasEntry!.model}.`],
      ['codex-capacity', 'codexAnsweredAtCapacity', 'openai/gpt-6.1-sol', `The model openai/gpt-6.1-sol answered at capacity, ${NOTHING_STARTED_AGAIN}`],
      ['codex-usage-limit', 'codexMetAUsageLimit', madeUp, `Codex rate-limited ${madeUp}, ${NOTHING_STARTED_AGAIN}`],
      ['codex-capacity', 'codexAnsweredAtCapacity', madeUp, `The model ${madeUp} answered at capacity, ${NOTHING_STARTED_AGAIN}`],
      ['codex-usage-limit', 'codexMetAUsageLimit', madeUpWithAnEntry, `Codex rate-limited ${madeUpWithAnEntry}, so ask again with runtime made-up-runtime and model ${itsEntry.model}.`],
      ['codex-usage-limit', 'codexMetAUsageLimit', null, `Codex rate-limited this run's model, ${NOTHING_STARTED_AGAIN}`],
      ['codex-capacity', 'codexAnsweredAtCapacity', null, `This run's model answered at capacity, ${NOTHING_STARTED_AGAIN}`],
    ] as const
    for (const [kind, notice, model, sentence] of cases) {
      const run = await aRun({ sandbox: true })
      const crashed = await theLaunchersCrash(run, `Synthetic: the command exited 1. ${sentence}`, kind, model)
      expect(crashed.statusCode, `${kind} on ${model}: ${crashed.body.slice(0, 800)}`).toBe(200)
      const account = theAccountOf(run.id)
      if (account === null || account.sealed) throw new Error(`no unsealed account for ${kind} on ${model}: ${JSON.stringify(account)}`)
      expect(account.reasons.map((one) => one.why)).not.toContain('stopped-to-ask')
      const told = (crashed.json() as { tellTheStarter?: { told?: string } }).tellTheStarter?.told
      expect(theOfficeLines(run.id, notice), `${kind} on ${model}`).toEqual([
        { id: told, to: starterId, said: `Run ${run.id} has crashed. The write that ended it says: ${sentence}` },
      ])
      // THE OTHER CODEX STOP'S LINE IS NOT WRITTEN AS WELL. A crash with an unsealed account also writes the office's line
      // that a round ended without a seal, which is not the launcher's notice.
      expect(everyOfficeLineAbout(run.id).filter((line) => line === 'codexAnsweredAtCapacity' || line === 'codexMetAUsageLimit'), `${kind} on ${model}: one Codex stop line, of its own kind`).toEqual([notice])
      expect(theMessagesInTheRunsSession(run.id)).toEqual([])
    }
  })

  it('3: a run that writes "I will not seal." is still held, finished by the launcher or sealed by itself', async () => {
    const byTheLauncher = await aRun({ sandbox: true })
    const report = await itsReport(byTheLauncher)
    const message = await theRunWritesItsStarter(byTheLauncher, 'The report is linked. I will not seal.')
    const finished = await theLaunchersRecordsFinish(byTheLauncher, report)
    expect(finished.statusCode, finished.body.slice(0, 800)).toBe(200)
    expect((finished.json() as Record<string, unknown>)['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message })
    expect(theOfficeLines(byTheLauncher.id, 'aRunEndedWithItsReport')).toHaveLength(1)

    const byItself = await aRun({ sandbox: true })
    const itsOwn = await itsReport(byItself)
    const said = await theRunWritesItsStarter(byItself, 'The report is linked. I will not seal.')
    const payload = { dataPatch: { state: 'finished', submission: { kind: 'records', records: [itsOwn] } } }
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${byItself.id}`, headers: asTheRun(byItself.id, byItself.key), payload })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${byItself.id}`, headers: asTheRun(byItself.id, byItself.key), payload })
    expect(sealed.statusCode, sealed.body.slice(0, 600)).toBe(200)
    expect((sealed.json() as Record<string, unknown>)['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message: said })
  })
})

describe("the office's line", () => {
  it('6: names the reports linked to the run in the order they were written, though they are filed in one second', async () => {
    const run = await aRun({ sandbox: true })
    const reports: string[] = []
    for (let n = 0; n < 6; n += 1) reports.push(await itsReport(run))
    const finished = await theLaunchersRecordsFinish(run, reports[0]!)
    expect(finished.statusCode, finished.body.slice(0, 800)).toBe(200)
    const lines = theOfficeLines(run.id, 'aRunEndedWithItsReport')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.said).toContain(`Reports linked to it: ${reports.join(', ')}.`)
  })
})

describe('a notice the office does not take', () => {
  it('4: a kind outside the list, a run outside a sandbox, and a kind that does not fit the write are refused, and nothing is written', async () => {
    const outsideTheList = await aRun({ sandbox: true })
    const wordsOfItsOwn = await theLaunchersCrash(outsideTheList, 'Synthetic: the command exited 1.', 'The run may choose these words.')
    expect(wordsOfItsOwn.statusCode, wordsOfItsOwn.body.slice(0, 400)).toBe(400)
    // THE REFUSAL NAMES THE KINDS OF THE LIST ONLY; the two an older launcher sent are no longer taken (case 8).
    const { error } = wordsOfItsOwn.json() as { error: string }
    expect(error).toContain(`tellTheStarter may only be one of ${THE_LAUNCHERS_NOTICES.join(', ')}, or left out.`)
    expect(error).not.toMatch(/luna-limit|sol-capacity/)
    expect(theStateOf(outsideTheList.id)).toBe('running')
    expect(everyOfficeLineAbout(outsideTheList.id)).toEqual([])

    const notInASandbox = await aRun({ sandbox: false })
    const capacity = `The model openai/gpt-6.1-sol answered at capacity, ${NOTHING_STARTED_AGAIN}`
    const onTheHost = await theLaunchersCrash(notInASandbox, `Synthetic: the command exited 1. ${capacity}`, 'codex-capacity', 'openai/gpt-6.1-sol')
    expect(onTheHost.statusCode, onTheHost.body.slice(0, 400)).toBe(409)
    expect(theStateOf(notInASandbox.id)).toBe('running')
    expect(everyOfficeLineAbout(notInASandbox.id)).toEqual([])

    const solOnAFinish = await aRun({ sandbox: true })
    const report = await itsReport(solOnAFinish)
    const finishedAsSol = await theLaunchersRecordsFinish(solOnAFinish, report, 'codex-capacity', 'openai/gpt-6.1-sol')
    expect(finishedAsSol.statusCode, finishedAsSol.body.slice(0, 400)).toBe(409)
    expect(theStateOf(solOnAFinish.id)).toBe('running')

    // A CODEX KIND NAMES ITS MODEL BESIDE IT, as one name, and only there.
    const refusedToo = [
      await refusedAs(409, 'a Codex capacity kind with no model beside it', 'codex-capacity'),
      await refusedAs(409, 'a Codex usage-limit kind with no model beside it', 'codex-usage-limit'),
      await refusedAs(409, 'a model beside no kind', undefined, 'openai/gpt-6.1-sol'),
      await refusedAs(400, 'a sentence of the run\'s own for a model', 'codex-usage-limit', 'gpt-6.1-sol. Start it again on another model'),
    ]
    const withAModel = await aRun({ sandbox: true })
    const itsReportWithAModel = await itsReport(withAModel)
    const finishedWithAModel = await theLaunchersRecordsFinish(withAModel, itsReportWithAModel, 'ended-with-its-report', 'openai/gpt-6.1-sol')
    expect(finishedWithAModel.statusCode, `a model beside the report kind: ${finishedWithAModel.body.slice(0, 400)}`).toBe(409)
    expect(theStateOf(withAModel.id)).toBe('running')

    const reportOnACrash = await aRun({ sandbox: true })
    const crashedAsAReport = await theLaunchersCrash(reportOnACrash, 'Synthetic: the command exited 1.', 'ended-with-its-report')
    expect(crashedAsAReport.statusCode, crashedAsAReport.body.slice(0, 400)).toBe(409)
    expect(theStateOf(reportOnACrash.id)).toBe('running')

    const reportOnAnUnchangedRun = await aRun({ sandbox: true })
    const onlyADetail = await app.inject({
      method: 'PATCH', url: `/api/records/${reportOnAnUnchangedRun.id}`, headers: asTheRun(reportOnAnUnchangedRun.id, reportOnAnUnchangedRun.key),
      payload: { dataPatch: { detail: 'Synthetic: a detail and nothing else.' }, tellTheStarter: 'ended-with-its-report' },
    })
    expect(onlyADetail.statusCode, onlyADetail.body.slice(0, 400)).toBe(409)
    expect(t.api.getRecord(reportOnAnUnchangedRun.id)!.data['detail']).toBeUndefined()
    for (const run of [solOnAFinish, reportOnACrash, reportOnAnUnchangedRun, withAModel, ...refusedToo]) expect(everyOfficeLineAbout(run.id)).toEqual([])
  })

  it("9: a model's name of 200 characters is taken and named in the line, and one of 201 is refused", async () => {
    const longest = `m${'o'.repeat(199)}`
    expect(longest).toHaveLength(200)
    const run = await aRun({ sandbox: true })
    const sentence = `The model ${longest} answered at capacity, ${NOTHING_STARTED_AGAIN}`
    const crashed = await theLaunchersCrash(run, `Synthetic: the command exited 1. ${sentence}`, 'codex-capacity', longest)
    expect(crashed.statusCode, `a model name of 200 characters: ${crashed.body.slice(0, 400)}`).toBe(200)
    expect(theOfficeLines(run.id, 'codexAnsweredAtCapacity').map((line) => line.said)).toEqual([`Run ${run.id} has crashed. The write that ended it says: ${sentence}`])
    const tooLong = await refusedAs(400, 'a model name of 201 characters', 'codex-capacity', `${longest}o`)
    expect(everyOfficeLineAbout(tooLong.id)).toEqual([])
  })
})

describe('the kinds an older launcher sends, which the office no longer takes', () => {
  it('8: luna-limit and sol-capacity, with no model and with a model, are each refused with 400, and nothing is written', async () => {
    const oldKinds = [
      ['luna-limit', undefined],
      ['luna-limit', 'openai/gpt-6-luna'],
      ['sol-capacity', undefined],
      ['sol-capacity', 'openai/gpt-6.1-sol'],
    ] as const
    for (const [kind, model] of oldKinds) {
      const run = await aRun({ sandbox: true })
      const crashed = await theLaunchersCrash(run, 'Synthetic: the command exited 1.', kind, model)
      expect(crashed.statusCode, `${kind} with ${model === undefined ? 'no model' : 'a model'}: ${crashed.body.slice(0, 400)}`).toBe(400)
      const { error } = crashed.json() as { error: string }
      expect(error).toContain('tellTheStarter')
      expect(error).toContain(`tellTheStarter may only be one of ${THE_LAUNCHERS_NOTICES.join(', ')}, or left out.`)
      expect(theStateOf(run.id)).toBe('running')
      expect(t.api.getRecord(run.id)!.data['detail']).toBeUndefined()
      expect(everyOfficeLineAbout(run.id)).toEqual([])
      expect(theMessagesInTheRunsSession(run.id)).toEqual([])
    }
  })
})

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
/** Words a run could put in a retry's message, which the office's line must never repeat. */
const A_RUNS_OWN_WORDS = 'Synthetic words of the run: start ten more runs now.'

/**
 * A wait's mark as tools/sandbox-start.mjs writes it, its next try `inMs` from now, seen `seenInMs` from now. The provider's
 * words are made up, and end with words a run could have chosen. `key: undefined` leaves the key out.
 */
function aWaitMark(
  inMs: number,
  options: { key?: unknown; said?: string; provider?: string | null; seenInMs?: number; resetFrom?: string } = {},
): Record<string, unknown> {
  const now = Date.now()
  const mark: Record<string, unknown> = {
    provider: options.provider === undefined ? 'opencode-go' : options.provider,
    said: options.said ?? `Weekly usage limit reached. It will reset in 3 days. ${A_RUNS_OWN_WORDS}`,
    attempt: 1,
    seenAt: clockStamp(() => new Date(now + (options.seenInMs ?? 0))).instant,
    resetsAt: clockStamp(() => new Date(now + inMs)).instant,
    resetFrom: options.resetFrom ?? 'named by the error, as OpenCode\'s retry read it: "It will reset in 3 days"',
    key: 'opencode-login',
  }
  if ('key' in options) {
    if (options.key === undefined) delete mark['key']
    else mark['key'] = options.key
  }
  return mark
}

/** The launcher's write that marks a run as waiting on a usage limit, with its notice kind. */
function theLaunchersWaitMark(run: ARun, mark: unknown, tellTheStarter: unknown = 'a-long-wait', theModelItRanOn?: unknown, also: Record<string, unknown> = {}) {
  return app.inject({
    method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key),
    payload: { dataPatch: { waitingOnALimit: mark, ...also }, tellTheStarter, theModelItRanOn },
  })
}

type ALongWaitReply = { tellTheStarter?: { told?: string; notTold?: string; theUsageNoticeSecretary?: { told?: string; notTold?: string } } }

/** The next try's time as the office's own clock writes it. */
const theTimeOf = (mark: Record<string, unknown>) => {
  const at = clockStamp(() => String(mark['resetsAt']))
  return `${at.stamp} ${at.timeZone}`
}

describe('a long wait on a usage limit', () => {
  it("10: a next try days away tells the starter and the usage notices' secretary once each, in the office's words, and the run still says running", async () => {
    // THE STARTER IS THE ONLY SECRETARY HERE, so it takes the usage notices as well, and gets one line.
    const run = await aRun({ sandbox: true })
    const mark = aWaitMark(3 * 24 * HOUR + 2 * HOUR + 10 * MINUTE)
    const marked = await theLaunchersWaitMark(run, mark)
    expect(marked.statusCode, marked.body.slice(0, 800)).toBe(200)
    const reply = marked.json() as ALongWaitReply
    const lines = theOfficeLines(run.id, 'aRunWaitsLongOnALimit')
    expect(lines).toEqual([{ id: reply.tellTheStarter?.told, to: starterId, said: expect.any(String) }])
    expect(reply.tellTheStarter?.theUsageNoticeSecretary).toEqual({ told: lines[0]!.id })
    const said = lines[0]!.said
    expect(said).toContain(`Run ${run.id} is waiting on OpenCode Go's weekly usage limit.`)
    expect(said).toContain(`OpenCode tries again at ${theTimeOf(mark)}, in about 3 days and 2 hours,`)
    expect(said).toContain("It waits on OpenCode's own login.")
    expect(said).not.toContain(A_RUNS_OWN_WORDS)
    expect(said).not.toContain('reached')
    expect(theStateOf(run.id)).toBe('running')
    expect(t.api.getRecord(run.id)!.data['waitingOnALimit']).toEqual(mark)
    expect(theMessagesInTheRunsSession(run.id)).toEqual([])

    // THE SAME WAIT'S NEXT WRITE cannot tell again, and without the kind it is written and tells nobody.
    const again = { ...mark, attempt: 2 }
    const toldAgain = await theLaunchersWaitMark(run, again)
    expect(toldAgain.statusCode, toldAgain.body.slice(0, 400)).toBe(409)
    expect((toldAgain.json() as { error: string }).error).toContain('already holds a wait of more than an hour')
    expect(t.api.getRecord(run.id)!.data['waitingOnALimit']).toEqual(mark)
    const quietly = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: { dataPatch: { waitingOnALimit: again } } })
    expect(quietly.statusCode, quietly.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(run.id)!.data['waitingOnALimit']).toEqual(again)
    expect(everyOfficeLineAbout(run.id)).toEqual(['aRunWaitsLongOnALimit'])

    // A SECRETARY CHOSEN TO TAKE THE USAGE NOTICES gets its own line beside the starter's.
    const handle = 'a-usage-notice-secretary'
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'secretary', runtime: 'claude-code' } })
    expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
    const chosen = await app.inject({ method: 'POST', url: '/api/office/usage-notice-secretary', headers: AS_THE_PERSON, payload: { agent: handle, because: 'Synthetic: this test chooses it.' } })
    expect(chosen.statusCode, chosen.body.slice(0, 300)).toBe(200)
    onTestFinished(async () => {
      const back = await app.inject({ method: 'POST', url: '/api/office/usage-notice-secretary', headers: AS_THE_PERSON, payload: { agent: null } })
      expect(back.statusCode, back.body.slice(0, 300)).toBe(200)
    })
    const agents = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
    const secretaryId = agents.agents.find((one) => one.handle === handle)!.id
    const second = await aRun({ sandbox: true })
    const itsMark = aWaitMark(5 * HOUR + 10 * MINUTE, { said: `5-hour usage limit reached. It will reset in 5 hours. ${A_RUNS_OWN_WORDS}` })
    const both = await theLaunchersWaitMark(second, itsMark)
    expect(both.statusCode, both.body.slice(0, 800)).toBe(200)
    const toBoth = theOfficeLines(second.id, 'aRunWaitsLongOnALimit')
    expect(toBoth.map((line) => line.to).sort()).toEqual([starterId, secretaryId].sort())
    const told = (both.json() as ALongWaitReply).tellTheStarter
    expect(told?.told).toBe(toBoth.find((line) => line.to === starterId)!.id)
    expect(told?.theUsageNoticeSecretary).toEqual({ told: toBoth.find((line) => line.to === secretaryId)!.id })
    for (const line of toBoth) {
      expect(line.said).toContain(`Run ${second.id} is waiting on OpenCode Go's 5-hour usage limit.`)
      expect(line.said).toContain(`OpenCode tries again at ${theTimeOf(itsMark)}, in about 5 hours,`)
      expect(line.said).not.toContain(A_RUNS_OWN_WORDS)
    }
  })

  it('11: a next try in the past, of seconds or within an hour, a key outside the list, and a write it does not fit are refused', async () => {
    const A_KEYS_VALUE = `not-a-real-key-${randomBytes(6).toString('hex')}`
    const refusals: [string, (run: ARun) => ReturnType<typeof theLaunchersWaitMark>][] = [
      ['a next try an hour ago', (run) => theLaunchersWaitMark(run, aWaitMark(-HOUR))],
      ['a next try of seconds', (run) => theLaunchersWaitMark(run, aWaitMark(30_000))],
      ['a next try 59 minutes away', (run) => theLaunchersWaitMark(run, aWaitMark(59 * MINUTE))],
      ["a key's value for its name", (run) => theLaunchersWaitMark(run, aWaitMark(3 * HOUR, { key: A_KEYS_VALUE }))],
      ['no key', (run) => theLaunchersWaitMark(run, aWaitMark(3 * HOUR, { key: undefined }))],
      ['no mark', (run) => theLaunchersWaitMark(run, null)],
      ['a model beside it', (run) => theLaunchersWaitMark(run, aWaitMark(3 * HOUR), 'a-long-wait', 'openai/gpt-6.1-sol')],
      ['a write that ends the run', (run) => theLaunchersWaitMark(run, aWaitMark(3 * HOUR), 'a-long-wait', undefined, { state: 'crashed', commandEnded: { at: '2026-11-06 09:00:00', code: 1 } })],
    ]
    for (const [why, write] of refusals) {
      const run = await aRun({ sandbox: true })
      const refused = await write(run)
      expect(refused.statusCode, `${why}: ${refused.body.slice(0, 400)}`).toBe(409)
      expect(refused.body, why).not.toContain(A_KEYS_VALUE)
      expect(theStateOf(run.id), why).toBe('running')
      expect(t.api.getRecord(run.id)!.data['waitingOnALimit'], why).toBeUndefined()
      expect(everyOfficeLineAbout(run.id), why).toEqual([])
    }
    const notInASandbox = await aRun({ sandbox: false })
    const onTheHost = await theLaunchersWaitMark(notInASandbox, aWaitMark(3 * HOUR))
    expect(onTheHost.statusCode, onTheHost.body.slice(0, 400)).toBe(409)
    expect(t.api.getRecord(notInASandbox.id)!.data['waitingOnALimit']).toBeUndefined()
    expect(everyOfficeLineAbout(notInASandbox.id)).toEqual([])
  })

  it("12: a wait on the router names the router's Go slots by their labels, or says why it cannot, and never a key", async () => {
    const before = { HOME: process.env['HOME'], MOLE_OFFICE_PROVIDER_ROUTER: process.env['MOLE_OFFICE_PROVIDER_ROUTER'] }
    const home = mkdtempSync(join(tmpdir(), 'mole-office-long-wait-home-'))
    directories.push(home)
    onTestFinished(() => {
      for (const [name, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    })
    const theLineOf = async (mark: Record<string, unknown>) => {
      const run = await aRun({ sandbox: true })
      const marked = await theLaunchersWaitMark(run, mark)
      expect(marked.statusCode, marked.body.slice(0, 800)).toBe(200)
      const lines = theOfficeLines(run.id, 'aRunWaitsLongOnALimit')
      expect(lines).toHaveLength(1)
      return lines[0]!.said
    }
    // THE ROUTER OFF: the office cannot read the slots, and says so.
    process.env['MOLE_OFFICE_PROVIDER_ROUTER'] = 'off'
    expect(await theLineOf(aWaitMark(3 * HOUR, { key: 'the-router' }))).toContain("It waits on the provider router's OpenCode Go key slots, whose names the office could not read.")
    // THE ROUTER ON IN A HOME OF THIS TEST'S OWN: first no slot, then two, named by their labels and never by their keys.
    process.env['HOME'] = home
    process.env['MOLE_OFFICE_PROVIDER_ROUTER'] = 'on'
    expect(await theLineOf(aWaitMark(3 * HOUR, { key: 'the-router' }))).toContain("It waits on the provider router's OpenCode Go key slots, of which the office holds none.")
    const keys = [`not-a-real-go-key-${randomBytes(6).toString('hex')}`, `not-a-real-go-key-${randomBytes(6).toString('hex')}`]
    for (const [label, key] of [['Made-up Go one', keys[0]], ['Made-up Go two', keys[1]]]) {
      const added = await app.inject({ method: 'POST', url: '/api/provider-router/key-slots/add', headers: AS_THE_PERSON, payload: { label, key } })
      expect(added.statusCode, added.body.slice(0, 300)).toBe(200)
    }
    const routed = await theLineOf(aWaitMark(3 * HOUR, { key: 'the-router' }))
    expect(routed).toContain("It waits on the provider router's OpenCode Go key slots Made-up Go one, Made-up Go two.")
    for (const key of keys) expect(routed).not.toContain(key)
    // WORDS THAT NAME NO LIMIT, from a provider that is not Go, and OPENCODE_API_KEY by its name.
    const unnamed = await theLineOf(aWaitMark(3 * HOUR, { said: `Synthetic: the provider refused the call. ${A_RUNS_OWN_WORDS}`, provider: 'made-up-provider', key: 'OPENCODE_API_KEY' }))
    expect(unnamed).toContain('is waiting on a usage limit of its provider, and the words do not say which one.')
    expect(unnamed).toContain('It waits on the key in OPENCODE_API_KEY.')
    expect(unnamed).not.toContain('OpenCode Go')
    expect(unnamed).not.toContain(A_RUNS_OWN_WORDS)
  })

  it('13: a next try past 32 days, before the wait was seen, or not named by the error is told without its time', async () => {
    const assumed = "assumed: five hours, Go's allowance window (OpenCode's retry named no reset)"
    const pastAnyLimit = 'the mark puts it more than 32 days away, longer than any limit Go names'
    const cases: [string, Record<string, unknown>, string][] = [
      ['32 days and an hour away', aWaitMark(32 * 24 * HOUR + HOUR), pastAnyLimit],
      ['in 2099', { ...aWaitMark(3 * HOUR), resetsAt: clockStamp(() => new Date(Date.UTC(2099, 0, 1))).instant }, pastAnyLimit],
      ['before the wait was seen', aWaitMark(3 * HOUR, { seenInMs: 5 * HOUR }), 'the mark puts it before the moment the wait was seen'],
      ['a reset the error did not name', aWaitMark(5 * HOUR, { resetFrom: assumed }), "OpenCode's retry named no reset, and the office has only an assumed one"],
    ]
    for (const [why, mark, because] of cases) {
      const run = await aRun({ sandbox: true })
      const marked = await theLaunchersWaitMark(run, mark)
      expect(marked.statusCode, `${why}: ${marked.body.slice(0, 800)}`).toBe(200)
      const lines = theOfficeLines(run.id, 'aRunWaitsLongOnALimit')
      expect(lines, why).toHaveLength(1)
      const said = lines[0]!.said
      expect(said, why).toContain(`Run ${run.id} is waiting on OpenCode Go's weekly usage limit.`)
      expect(said, why).toContain("The write that marked the wait puts OpenCode's next try more than an hour away.")
      expect(said, why).toContain(`Its time is not given, because ${because}.`)
      expect(said, why).not.toContain(theTimeOf(mark))
      expect(said, why).not.toMatch(/\d{4}-\d\d-\d\d/)
      expect(said, why).not.toContain('tries again at')
      expect(said, why).not.toContain(A_RUNS_OWN_WORDS)
      expect(t.api.getRecord(run.id)!.data['waitingOnALimit'], why).toEqual(mark)
    }
  })
})

describe('the sentence of a Codex stop', () => {
  it('7: a made-up entry gives its own advice, under its name and an alias; capacity gives none; a name out of shape is not said', () => {
    expect(aCodexStopNotice, 'aCodexStopNotice in src/config/launcher-notices.mjs').toBeTypeOf('function')
    const table = {
      aliases: { 'made-up-provider/made-up-x': 'made-up-x' },
      askAgainAfterACodexUsageLimit: { 'made-up-x': { runtime: 'made-up-runtime', model: 'made-up-elsewhere/x' } },
    }
    const advice = 'so ask again with runtime made-up-runtime and model made-up-elsewhere/x.'
    expect(aCodexStopNotice('codex-usage-limit', 'made-up-x', table)).toBe(`Codex rate-limited made-up-x, ${advice}`)
    expect(aCodexStopNotice('codex-usage-limit', 'made-up-provider/made-up-x', table)).toBe(`Codex rate-limited made-up-provider/made-up-x, ${advice}`)
    expect(aCodexStopNotice('codex-usage-limit', 'made-up-y', table)).toBe(`Codex rate-limited made-up-y, ${NOTHING_STARTED_AGAIN}`)
    expect(aCodexStopNotice('codex-capacity', 'made-up-x', table)).toBe(`The model made-up-x answered at capacity, ${NOTHING_STARTED_AGAIN}`)
    // A NAME THE TABLE'S OBJECTS HOLD FROM THEIR PROTOTYPE is no entry.
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(aCodexStopNotice('codex-usage-limit', name, table)).toBe(`Codex rate-limited ${name}, ${NOTHING_STARTED_AGAIN}`)
    }
    for (const name of [null, 'two words', `m${'o'.repeat(200)}`, '']) {
      expect(aCodexStopNotice('codex-usage-limit', name, table)).toBe(`Codex rate-limited this run's model, ${NOTHING_STARTED_AGAIN}`)
      expect(aCodexStopNotice('codex-capacity', name, table)).toBe(`This run's model answered at capacity, ${NOTHING_STARTED_AGAIN}`)
    }
  })
})

describe("the office's own clock", () => {
  it('5: a sandbox run still running 8 hours after it was filed is reminded once to its starter, and nothing stops it', async () => {
    const reminders = await import('../src/server/lib/reminders.ts')
    const resources = await import('../src/server/lib/resources.ts')
    // THE MADE-UP CONTAINER IS SAID TO BE RUNNING, so the pass's closer of runs whose container stopped leaves these runs as they are.
    resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
      containers: () => ({ available: true, containers: [{ id: 'made-up', name: 'test-row', image: 'made-up', status: 'Up' }] }),
    }))
    onTestFinished(() => resources.useOsProbe(resources.LINUX_PROBE))
    const long = await aRun({ sandbox: true })
    // THE EARLIER CASES LEAVE SANDBOX RUNS OF THE SAME STARTER SAYING RUNNING, and a starter's long-run line names every run
    // then due. They are ended here, so this case's run is the only one due (wave 13y round 141).
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE kind = 'session' AND id != ? AND json_extract(data, '$.state') = 'running'").run(long.id)
    const onTheHost = await aRun({ sandbox: false })
    const ended = await aRun({ sandbox: true })
    const crashed = await theLaunchersCrash(ended, 'Synthetic: the command exited 1.', undefined)
    expect(crashed.statusCode, crashed.body.slice(0, 400)).toBe(200)
    const filedAt = parseAnyStamp(t.api.getRecord(long.id)!.createdAt)!.getTime()
    const at = (ms: number) => new Date(filedAt + ms)
    const tick = (ms: number) => reminders.sendTheRemindersThatAreDue('default', at(ms), at(ms - 60_000))

    const early = tick(SANDBOX_RUN_REMINDER.ms - 60_000)
    expect(early.longSandboxRunsReminded).not.toContain(long.id)
    expect(theOfficeLines(long.id, 'aSandboxRunHasRunLong')).toEqual([])

    const due = tick(SANDBOX_RUN_REMINDER.ms + 60_000)
    expect(due.longSandboxRunsReminded).toContain(long.id)
    const lines = theOfficeLines(long.id, 'aSandboxRunHasRunLong')
    expect(lines).toEqual([{ id: expect.any(String), to: starterId, said: expect.stringContaining(`Run ${long.id} `) }])
    expect(lines[0]!.said).toContain('nothing stops it')

    const later = tick(SANDBOX_RUN_REMINDER.ms + 3_600_000)
    expect(later.longSandboxRunsReminded).not.toContain(long.id)
    expect(theOfficeLines(long.id, 'aSandboxRunHasRunLong')).toHaveLength(1)
    expect(theStateOf(long.id)).toBe('running')
    expect(theOfficeLines(onTheHost.id, 'aSandboxRunHasRunLong')).toEqual([])
    expect(theOfficeLines(ended.id, 'aSandboxRunHasRunLong')).toEqual([])
  })
})
