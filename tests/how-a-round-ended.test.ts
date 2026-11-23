// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * HOW A ROUND ENDED, RECORDED BY THE OFFICE ON THE RUN, AND ITS STARTER WOKEN ONCE. Wave 13j round loop-1, task "every round
 * ends sealed or says why" (src/server/lib/how-a-round-ended.ts, src/shared/how-the-round-ended.ts).
 *
 * WHAT IS CLAIMED
 *   1. A sandbox round written orphaned with no commits and no report gets `howTheRoundEnded` with those three reasons,
 *      and its starter gets exactly one waking line about the run. A later write on the run adds no second line.
 *   2. A sandbox round whose launcher writes `commandEnded`, with a commit and a report linked to another record, gets the
 *      no-report reason naming that report.
 *  2b. A sandbox round whose only about link to its report goes from the run to the report gets the no-report reason
 *      saying the link goes the other way. The real fault: a run's account said its report "is linked to nothing",
 *      though the run had linked it, because only links from the report were read.
 *   3. A run not started in a sandbox is left alone: no account and no line.
 *   4. `howTheRoundEnded` sent through the record door is refused, on a patch and on a create, and nothing is written.
 *   5. A sandbox round sealed after its last message to its starter set only a condition ("If main has moved, I will not
 *      seal", the 8 October case) has its check held, and the starter one line. The person releases it once; a second
 *      release is refused.
 *   6. A sandbox round sealed after "I seal next" alone is held: it handed back no package, wrote no FEATURE READY: line,
 *      was not started as a repair and wrote no line saying not for a check. The hold's words name all four, the starter
 *      is told once, and the starter releases it with its own key.
 *   7. A sandbox round sealed after the 15 October message, with a FEATURE READY: line added, is not held. That message
 *      says "I seal next" and quotes the office's title "A round ended without a seal": words in a quotation are not the
 *      agent's own.
 *   8. A sandbox round sealed after the 17 October message, with a FEATURE READY: line added, is not held. Its sentence
 *      "That run stopped at 15:31 on the login's weekly limit (429) with no seal." is about the run it continues, so it is
 *      not this run saying it will not seal (problem Rg6Wt8oUDYDi).
 *   9. A sandbox round sealed after a message that names itself by its own id and says it goes with no seal is held, and
 *      the account and the starter's line name the sentence the office read.
 *  10. A sandbox round sealed after the 12 November message, with a FEATURE READY: line added after it, is not held,
 *      and its check is asked. That message says "I seal next", and its sentence "A fault of form is listed before the
 *      seal and refuses no seal at ..." says what a gate lets through, so it is not this run saying it will not seal.
 *      The message is the stored one, word for word.
 *  11. A sandbox round sealed after "I will not seal" is still held, and so is one sealed after "no seal this round", and
 *      each account names the sentence the office read.
 *  12. A sandbox round sealed after the other 12 November message, with a FEATURE READY: line added after it, is not
 *      held, and its check is asked. That message says "I seal next", and quotes its brief's step name in single
 *      quotes, so the words inside are not the agent's own. The message is the stored one, word for word.
 *  13. Beside that quoted step name, "I will not seal" and "no seal this round" still hold the check, and each account
 *      names that sentence, not the quoted one.
 *  14. A line of its own saying not for a check, bare or in backticks, in any case, with or without a full stop: the round
 *      is not held and no check is asked. The account says the check was not asked and quotes the line. The line wins
 *      over a FEATURE READY: line in the same message, and the words inside a sentence are not that line. Case 8 of
 *      tests/the-office-asks-the-next-round-at-the-seal.test.ts shows such a round is not queued and its next round is
 *      still asked.
 *  15. A round that handed back a package is checked, though its last message does not say it seals.
 *  16. A FEATURE READY: line asks for the check, though the message does not say it seals. The same words in small
 *      letters, or inside a sentence, do not.
 *  17. A round started as a repair is checked with no package and no FEATURE READY: line. A problem names it as the run of
 *      its hand-back's line or as the run of its main-suite repair.
 *  18. A message that says the run will not seal holds the check, though the run handed back a package and the message
 *      has a FEATURE READY: line and a line saying not for a check.
 *  19. A round that wrote its starter no message, handed back no package and was not started as a repair is held. Its
 *      words and the starter's line say nothing of a message.
 *  20. A round whose agent has no recorded starter is held, no line is written, and its words say the person or a
 *      secretary can release it. The person does.
 *  21. A FEATURE READY: line in backticks, the way a brief writes it, asks for the check. The same line in quotation
 *      marks or after > does not.
 *
 * Every repository is made in the system's temporary folder; every key, run and report is made up.
 *
 * MUTATION, RUN ON 11 OCTOBER 2026. A control run first: all green. Then in `thisWriteEndedARoundWithoutASeal` the line
 * `if (!isObject(after['sandbox']) || ...) return false` lost its `!isObject(after['sandbox']) ||` part, so every run is
 * treated as a sandbox round; case 3 went red. Separately, `theCheckOfASealedRound` was made to answer `hold: false` for
 * every message; case 5 went red. Each restored, and the control run again: green.
 *
 * MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs). A control run first: all green. Then `itIsAboutAnotherRun` in
 * src/server/lib/how-a-round-ended-rules.ts was made to answer false; case 8 went red. Separately, its
 * `!read.includes(runId)` part was removed; case 9 went red, which shows `theCheckOfASealedRound` passes the run's own id.
 * Each restored, and the control run again: green.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { readHowTheRoundEnded, WHY_NO_SEAL } from '../src/shared/how-the-round-ended.ts'
import { SESSION_STATES, type PanelRecord } from '../src/shared/types.ts'
import { FEATURE_READY, NOT_FOR_A_CHECK, theHoldOfARoundWithNoCaseSays, theRoundNotForACheckSays } from '../src/server/lib/how-a-round-ended-rules.ts'
import { THE_MESSAGE } from './a-quotation-that-held-a-check-fixture.ts'
import { THE_MESSAGE_ABOUT_THE_RUN_BEFORE } from './a-sentence-about-another-run-fixture.ts'
import {
  THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES,
  THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL,
  THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES,
} from './a-gate-that-refuses-no-seal-fixture.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const STARTER = 'a-round-starter'
const HANDLE = 'a-round-that-ends'
const NO_STARTER = 'a-round-nobody-started'

let t: TestDb
let app: FastifyInstance
let thisWriteEndedARoundWithoutASeal: typeof import('../src/server/lib/how-a-round-ended.ts')['thisWriteEndedARoundWithoutASeal']
let starterId = ''
let starterKey = ''
const directories: string[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_PROVED_PERSON = { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const asTheRun = (session: string, key: string, handle = HANDLE): Record<string, string> => ({ ...asAgent(handle), 'x-mole-office-session': session, 'x-mole-office-key': key })

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A run of `handle` filed by the office's worker at commit A in a made-up repository; `commit` adds commit B on its branch. */
async function aRun(options: { sandbox: boolean; commit: boolean; handle?: string }): Promise<{ id: string; key: string; tip: string; handle: string }> {
  const handle = options.handle ?? HANDLE
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-how-a-round-ended-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic round-end test')
  git(dir, 'config', 'user.email', 'round-end@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic round',
      data: {
        state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: handle, doing: 'a made-up round',
        workingDirectory: dir, cutFrom: 'main', tip: a,
        ...(options.sandbox ? { sandbox: { template: 'test-template', container: 'test-row', folder: dir } } : {}),
      },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  if (options.commit) {
    writeFileSync(join(dir, 'work/a.txt'), 'after\n')
    git(dir, 'commit', '-qam', 'Synthetic commit B')
  }
  return { id: body.record.id, key: String(body.runKey?.key), tip: git(dir, 'rev-parse', 'HEAD'), handle }
}

const theAccountOf = (id: string) => readHowTheRoundEnded(t.api.getRecord(id)!.data['howTheRoundEnded'])
async function waitForTheAccount(id: string): Promise<void> {
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    const account = theAccountOf(id)
    if (account !== null && (account.sealed || !account.reasons.some((reason) => String(reason.why) === 'git-being-read'))) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** Every line the office wrote about a run, by its line text. */
function linesAbout(run: string, line: string): { id: string; to: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT id, json_extract(data, '$.to[0].id') AS toId FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ?",
      )
      .all(run, line) as { id: string; toId: string }[]
  ).map((one) => ({ id: one.id, to: one.toId }))
}

/** The run writes its starter a message, in its own session. */
async function theRunWritesItsStarter(run: { id: string; key: string }, body: string): Promise<string> {
  const sent = await app.inject({ method: 'POST', url: '/api/records', headers: asTheRun(run.id, run.key), payload: { kind: 'message', title: 'Synthetic word to the starter', data: { body, to: [{ kind: 'agent', id: starterId }] } } })
  expect(sent.statusCode).toBe(409)
  const record = (sent.json() as { record: { id: string } }).record
  expect(record.id).toBeTruthy()
  return record.id
}

/** Seal: the reminder, then the same write again. The run's report is in form, so no fault of form refuses the seal. */
async function seal(run: { id: string; key: string; tip: string; handle: string }): Promise<Record<string, unknown>> {
  await aReportInForm(t, run.id, run.handle)
  const payload = { dataPatch: { state: 'finished', tip: run.tip } }
  const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key, run.handle), payload })
  expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
  const second = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key, run.handle), payload })
  expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
  expect(t.api.getRecord(run.id)!.data['sealedTip']).toEqual(expect.any(String))
  return second.json() as Record<string, unknown>
}

/** The words of a sealed round's account. */
const theWordsOf = (reply: Record<string, unknown>): string => String((reply['howTheRoundEnded'] as { says?: unknown } | undefined)?.says)

/**
 * A PACKAGE THE RUN HANDED BACK, waiting for its check: a made-up task whose package's latest hand-back names the run. It
 * is written into the task by SQL in the shape the hand-back door stores, because the doors that make one need a parent
 * agent and the person; tests/the-check-judges-each-point-of-a-package.test.ts goes through those doors.
 */
function aPackageHandedBackBy(run: string): void {
  const task = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Synthetic task with a made-up package', data: {}, actor: { type: 'human', id: THE_PERSON } }).id
  const pkg = {
    bundleId: 'synthetic-bundle', forTheOutside: 'A made-up package.', acceptance: 'Made up.', parent: { kind: 'decision', id: 'synthetic-decision' },
    lines: ['a-made-up-line'], pointIds: ['synthetic-point'], at: '2026-11-12 20:00:00', by: { actorType: 'human', actorId: THE_PERSON },
    handedBack: [{ by: { actorType: 'agent', actorId: HANDLE }, at: '2026-11-12 20:30:00', run, points: [{ pointId: 'synthetic-point', outcome: 'done', words: 'Made up.' }] }],
  }
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify(pkg), task)
}

/** A made-up problem that names the run at `path`, written there by SQL as the merge queue and the repair tool write it. */
function aProblemNaming(run: string, path: '$.extra.handBack.line.run' | '$.mainSuiteFix.repair.run'): void {
  const problem = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Synthetic problem a repair round is started for', data: {}, actor: { type: 'human', id: THE_PERSON } }).id
  t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, ?) WHERE id = ?').run(path, run, problem)
}

/** The forms of a line of its own, made lazily so that the first is read before any of the others is made. */
function* theFormsOf(words: string): Generator<string> {
  yield words
  yield `${words[0]!.toUpperCase()}${words.slice(1)}.`
  yield `\`${words}\``
  yield `\`${words.toUpperCase()}.\``
  yield `\`${words.replace(/\b\w/gu, (letter) => letter.toUpperCase())}\`.`
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  ;({ thisWriteEndedARoundWithoutASeal } = await import('../src/server/lib/how-a-round-ended.ts'))
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: STARTER, name: STARTER, role: 'secretary', runtime: 'claude-code' } })
  expect(starter.statusCode, starter.body.slice(0, 300)).toBe(201)
  starterKey = String((starter.json() as { whatToGiveIt?: { key?: unknown } }).whatToGiveIt?.key ?? '')
  for (const handle of [HANDLE, NO_STARTER]) {
    const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(STARTER), payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
    expect(worker.statusCode, worker.body.slice(0, 300)).toBe(201)
  }
  const agents = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  starterId = agents.agents.find((one) => one.handle === STARTER)!.id
  // NOBODY IS RECORDED AS HAVING STARTED THIS ONE, as for an agent registered before starters were recorded.
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = NULL, started_by_id = NULL WHERE handle = ?').run(NO_STARTER)
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) setFixtureOwner(t.client.sqlite, null, NO_STARTER, 'handle')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('a round that ends without a seal', () => {
  it('does not record an earlier command end again when a later write crashes the run', () => {
    const before = { state: SESSION_STATES[0], sandbox: {}, commandEnded: { at: '2026-10-11 23:00:00', code: 0 } }
    const after = { ...before, state: SESSION_STATES[3] }
    expect(thisWriteEndedARoundWithoutASeal(before, after)).toBe(false)
    const withoutEnd = { state: before.state, sandbox: before.sandbox }
    expect(thisWriteEndedARoundWithoutASeal(withoutEnd, after)).toBe(true)
  })

  it('tells the starter the refusal once when a clean command is written crashed', async () => {
    const run = await aRun({ sandbox: true, commit: false })
    const refusal = 'Synthetic refusal from the finish door.'
    const written = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { state: SESSION_STATES[3], detail: refusal, commandEnded: { at: '2026-10-11 23:00:00', code: 0 } } } })
    expect(written.statusCode).toBe(200)
    await waitForTheAccount(run.id)
    const account = theAccountOf(run.id)
    if (account === null || account.sealed) throw new Error('No unsealed account was recorded.')
    expect(account.reasons.map((reason) => reason.why)).not.toContain(WHY_NO_SEAL[0])
    expect(account.says.split(refusal)).toHaveLength(2)
    expect(linesAbout(run.id, 'A round ended without a seal')).toHaveLength(1)
  })

  it('1: orphaned with no commits and no report: the account says so, and the starter gets one line, once', async () => {
    const run = await aRun({ sandbox: true, commit: false })
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { state: 'orphaned', detail: 'Synthetic: the process was gone.' } } })
    expect(ended.statusCode, ended.body.slice(0, 600)).toBe(200)
    await waitForTheAccount(run.id)
    const account = theAccountOf(run.id)
    if (account === null || account.sealed) throw new Error(`no unsealed account: ${JSON.stringify(account)}`)
    expect(account.reasons.map((one) => one.why)).toEqual(['the-process-died', 'no-commits', 'no-report'])
    expect(account.state).toBe('orphaned')
    expect(account.whatToDo).toContain(`finish.log`)
    const lines = linesAbout(run.id, 'A round ended without a seal')
    expect(lines).toEqual([{ id: account.starterTold, to: starterId }])
    const again = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { detail: 'Synthetic: a later write.', commandEnded: { at: '2026-10-11 23:00:00', code: 1 } } } })
    expect(again.statusCode, again.body.slice(0, 600)).toBe(200)
    expect(linesAbout(run.id, 'A round ended without a seal')).toHaveLength(1)
  })

  it('2: the launcher writes commandEnded: a report linked to another record is named', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const elsewhere = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic module', data: {}, actor: { type: 'human', id: THE_PERSON } }).id
    const report = await app.inject({
      method: 'POST', url: '/api/records', headers: asTheRun(run.id, run.key),
      payload: { kind: 'report', title: 'Synthetic report linked to the wrong record', links: [{ type: 'about', toId: elsewhere }],
        data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [{ id: 'b1', type: 'text', text: 'A made-up report.' }] } },
    })
    expect(report.statusCode, report.body.slice(0, 400)).toBe(201)
    const reportId = (report.json() as { record: { id: string } }).record.id
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { detail: 'Synthetic: ended.', commandEnded: { at: '2026-10-11 23:00:00', code: 0 } } } })
    expect(ended.statusCode, ended.body.slice(0, 600)).toBe(200)
    await waitForTheAccount(run.id)
    const account = theAccountOf(run.id)
    if (account === null || account.sealed) throw new Error(`no unsealed account: ${JSON.stringify(account)}`)
    expect(account.reasons).toEqual([expect.objectContaining({ why: 'no-report', names: reportId })])
    expect(account.whatToDo).toContain(`"fromId":"${reportId}","toId":"${run.id}"`)
    expect(linesAbout(run.id, 'A round ended without a seal')).toHaveLength(1)
  })

  it('2b: an about link from the run to its report is named as going the other way, not as a report linked to nothing', async () => {
    // THE REAL FAULT. A run filed its report with no link and then linked itself about the report. The account said the
    // report "is linked to nothing", which the starter could not square with the link it saw. The run makes no commit, so
    // no patch log is read here and the reader's temporary folder is not looked for.
    const run = await aRun({ sandbox: true, commit: false })
    const report = await app.inject({
      method: 'POST', url: '/api/records', headers: asTheRun(run.id, run.key),
      payload: { kind: 'report', title: 'Synthetic report the run links about itself the wrong way',
        data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [{ id: 'b1', type: 'text', text: 'A made-up report.' }] } },
    })
    expect(report.statusCode, report.body.slice(0, 400)).toBe(201)
    const reportId = (report.json() as { record: { id: string } }).record.id
    const linked = await app.inject({ method: 'POST', url: '/api/links', headers: asTheRun(run.id, run.key), payload: { fromId: run.id, toId: reportId, type: 'about' } })
    expect(linked.statusCode, linked.body.slice(0, 400)).toBe(201)
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { detail: 'Synthetic: ended.', commandEnded: { at: '2026-11-23 10:47:42', code: 0 } } } })
    expect(ended.statusCode, ended.body.slice(0, 600)).toBe(200)
    await waitForTheAccount(run.id)
    const account = theAccountOf(run.id)
    if (account === null || account.sealed) throw new Error(`no unsealed account: ${JSON.stringify(account)}`)
    expect(account.reasons.map((one) => one.why)).toEqual(['no-commits', 'no-report'])
    expect(account.reasons.find((one) => one.why === 'no-report')).toEqual({
      why: 'no-report',
      says:
        `No report is linked about the run. It filed report ${reportId}, and the about link between them goes the other way, ` +
        'from the run to the report, so nothing waiting on the run sees it.',
      names: reportId,
    })
  })

  it('3: a run not started in a sandbox is left alone', async () => {
    const run = await aRun({ sandbox: false, commit: false })
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { state: 'orphaned' } } })
    expect(ended.statusCode, ended.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(run.id)!.data['howTheRoundEnded']).toBeUndefined()
    expect(linesAbout(run.id, 'A round ended without a seal')).toEqual([])
  })

  it('4: howTheRoundEnded sent through the record door is refused, and nothing is written', async () => {
    const run = await aRun({ sandbox: true, commit: false })
    const made = { sealed: true, at: '2026-10-11 23:00:00', sealedTip: 'x', theCheck: 'asked', says: 'made up' }
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_PROVED_PERSON, payload: { dataPatch: { howTheRoundEnded: made } } })
    expect(patched.statusCode, patched.body.slice(0, 300)).toBe(403)
    expect(t.api.getRecord(run.id)!.data['howTheRoundEnded']).toBeUndefined()
    const created = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OFFICE_WORKER, payload: { kind: 'session', title: 'Synthetic', data: { state: 'running', howTheRoundEnded: made } } })
    expect(created.statusCode, created.body.slice(0, 300)).toBe(403)
  })
})

describe('a sealed round', () => {
  it('5: a last message that only sets a condition holds the check; the person releases it once', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const message = await theRunWritesItsStarter(run, 'The work is committed. If main has moved, I will not seal.')
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message })
    const lines = linesAbout(run.id, 'The check is held')
    expect(lines).toEqual([{ id: expect.any(String), to: starterId }])
    const released = await app.inject({ method: 'POST', url: `/api/records/${run.id}/release-the-held-check`, headers: AS_THE_PROVED_PERSON, payload: { because: 'Synthetic: the round is done.' } })
    expect(released.statusCode, released.body.slice(0, 600)).toBe(200)
    expect(theAccountOf(run.id)).toMatchObject({ theCheck: 'held', released: { by: THE_PERSON, because: 'Synthetic: the round is done.' } })
    const twice = await app.inject({ method: 'POST', url: `/api/records/${run.id}/release-the-held-check`, headers: AS_THE_PROVED_PERSON, payload: { because: 'Synthetic: again.' } })
    expect(twice.statusCode, twice.body.slice(0, 300)).toBe(409)
    expect(linesAbout(run.id, 'The check is held')).toHaveLength(1)
  })

  it('6: "I seal next" alone holds the check, its words name the four cases, and the starter releases it', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const message = await theRunWritesItsStarter(run, 'The report is linked. I seal next.')
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message })
    expect(reply['theCheck']).toBeUndefined()
    const says = theWordsOf(reply)
    expect(says).toBe(theHoldOfARoundWithNoCaseSays(true))
    for (const named of ['package', FEATURE_READY, 'repair', NOT_FOR_A_CHECK]) expect(says, named).toContain(named)
    const lines = linesAbout(run.id, 'The check is held')
    expect(lines).toEqual([{ id: expect.any(String), to: starterId }])
    expect(t.api.getRecord(lines[0]!.id)!.data['saidInFull']).toContain(says)
    expect(starterKey, 'the starter was given no key').not.toBe('')
    const asTheStarter = { ...asAgent(STARTER), 'x-mole-office-key': starterKey }
    const released = await app.inject({ method: 'POST', url: `/api/records/${run.id}/release-the-held-check`, headers: asTheStarter, payload: { because: 'Synthetic: the round is done.' } })
    expect(released.statusCode, released.body.slice(0, 600)).toBe(200)
    expect(theAccountOf(run.id)).toMatchObject({ theCheck: 'held', released: { by: STARTER, because: 'Synthetic: the round is done.' } })
  })

  it('7: the 15 October message, which quotes the office\'s title "A round ended without a seal", does not hold the check', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    await theRunWritesItsStarter(run, `${THE_MESSAGE}\n${FEATURE_READY} the made-up feature is done.`)
    const reply = await seal(run)
    const account = reply['howTheRoundEnded'] as { theCheck?: string }
    expect(account).toMatchObject({ sealed: true })
    expect(account.theCheck).not.toBe('held')
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
  })

  it('8: the 17 October message, whose "with no seal" is about the run it continues, does not hold the check', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    await theRunWritesItsStarter(run, `${THE_MESSAGE_ABOUT_THE_RUN_BEFORE}\n${FEATURE_READY} the made-up feature is done.`)
    const reply = await seal(run)
    const account = reply['howTheRoundEnded'] as { theCheck?: string }
    expect(account).toMatchObject({ sealed: true })
    expect(account.theCheck).not.toBe('held')
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
  })

  it('9: a message that names its own run "with no seal" holds the check, and the office names the sentence it read', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const message = await theRunWritesItsStarter(run, `The tests are red. Run ${run.id} ends with no seal.`)
    const reply = await seal(run)
    const says =
      `The run's last message to its starter, ${message}, says it will not seal, so the office asked for no check. ` +
      `The office read it from this sentence: "Run ${run.id} ends with no seal."`
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message, says })
    const lines = linesAbout(run.id, 'The check is held')
    expect(lines).toEqual([{ id: expect.any(String), to: starterId }])
    expect(t.api.getRecord(lines[0]!.id)!.data['saidInFull']).toContain(says)
  })

  it('10: the 12 November message, whose gate "refuses no seal", does not hold the check, and the check is asked', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const message = await theRunWritesItsStarter(run, `${THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL}\n${FEATURE_READY} the made-up feature is done.`)
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'asked', message, says: `Run ${run.id} was sealed, and the office asked for its check.` })
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
  })

  it('11: "I will not seal" and "no seal this round" still hold the check, and the office names the sentence it read', async () => {
    for (const [body, sentence] of [
      ['The tests are red. I will not seal.', 'I will not seal.'],
      ['The tests are red, so no seal this round.', 'The tests are red, so no seal this round.'],
    ] as const) {
      const run = await aRun({ sandbox: true, commit: true })
      const message = await theRunWritesItsStarter(run, body)
      const reply = await seal(run)
      const says =
        `The run's last message to its starter, ${message}, says it will not seal, so the office asked for no check. ` +
        `The office read it from this sentence: "${sentence}"`
      expect(reply['howTheRoundEnded'], body).toMatchObject({ sealed: true, theCheck: 'held', message, says })
      expect(linesAbout(run.id, 'The check is held'), body).toEqual([{ id: expect.any(String), to: starterId }])
    }
  })

  it('12: the message that quotes its step name in single quotes does not hold the check, and the check is asked', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const message = await theRunWritesItsStarter(run, `${THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES}\n${FEATURE_READY} the made-up feature is done.`)
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'asked', message, says: `Run ${run.id} was sealed, and the office asked for its check.` })
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
  })

  it('13: beside that quoted step name, "I will not seal" and "no seal this round" still hold the check', async () => {
    for (const [body, sentence] of [
      [`${THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES} I will not seal.`, 'I will not seal.'],
      [`${THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES}\nThe tests are red, so no seal this round.`, 'The tests are red, so no seal this round.'],
    ] as const) {
      const run = await aRun({ sandbox: true, commit: true })
      const message = await theRunWritesItsStarter(run, body)
      const reply = await seal(run)
      const says =
        `The run's last message to its starter, ${message}, says it will not seal, so the office asked for no check. ` +
        `The office read it from this sentence: "${sentence}"`
      expect(reply['howTheRoundEnded'], body).toMatchObject({ sealed: true, theCheck: 'held', message, says })
      expect(linesAbout(run.id, 'The check is held'), body).toEqual([{ id: expect.any(String), to: starterId }])
    }
  })

  it('14: a line of its own saying not for a check asks no check, and the account says so and quotes the line', async () => {
    let first = true
    for (const line of theFormsOf(NOT_FOR_A_CHECK)) {
      const run = await aRun({ sandbox: true, commit: true })
      const before = first ? `${FEATURE_READY} the made-up feature is done.\n` : ''
      first = false
      const message = await theRunWritesItsStarter(run, `The work is committed.\n${before}  ${line}  \nI seal next.`)
      const reply = await seal(run)
      expect(reply['howTheRoundEnded'], line).toMatchObject({ sealed: true, theCheck: 'not asked', message })
      expect(reply['theCheck'], line).toBeUndefined()
      expect(theWordsOf(reply), line).toBe(theRoundNotForACheckSays(run.id, message, line))
      expect(theWordsOf(reply), line).toContain(line)
      expect(linesAbout(run.id, 'The check is held'), line).toEqual([])
    }
    const inASentence = await aRun({ sandbox: true, commit: true })
    await theRunWritesItsStarter(inASentence, `The work is committed, and it is ${NOT_FOR_A_CHECK} yet. I seal next.`)
    const reply = await seal(inASentence)
    expect(reply['howTheRoundEnded']).toMatchObject({ theCheck: 'held' })
    expect(theWordsOf(reply)).toBe(theHoldOfARoundWithNoCaseSays(true))
  })

  it('15: a round that handed back a package is checked, though its last message does not say it seals', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    aPackageHandedBackBy(run.id)
    await theRunWritesItsStarter(run, 'The package is handed back.')
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'asked' })
    expect(reply['theCheck']).toEqual(expect.any(Object))
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
  })

  it('16: a FEATURE READY: line asks for the check; small letters or the words inside a sentence do not', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    await theRunWritesItsStarter(run, `The work is committed.\n  ${FEATURE_READY} the made-up feature is done.`)
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'asked' })
    expect(reply['theCheck']).toEqual(expect.any(Object))
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
    for (const body of [`${FEATURE_READY.toLowerCase()} the made-up feature is done.`, `I will write ${FEATURE_READY} when the feature is done. I seal next.`]) {
      const not = await aRun({ sandbox: true, commit: true })
      await theRunWritesItsStarter(not, body)
      const held = await seal(not)
      expect(held['howTheRoundEnded'], body).toMatchObject({ theCheck: 'held' })
      expect(theWordsOf(held), body).toBe(theHoldOfARoundWithNoCaseSays(true))
    }
  })

  it('17: a round started as a repair is checked, with no package and no FEATURE READY: line', async () => {
    for (const path of ['$.extra.handBack.line.run', '$.mainSuiteFix.repair.run'] as const) {
      const run = await aRun({ sandbox: true, commit: true })
      aProblemNaming(run.id, path)
      await theRunWritesItsStarter(run, 'The repair is committed.')
      const reply = await seal(run)
      expect(reply['howTheRoundEnded'], path).toMatchObject({ sealed: true, theCheck: 'asked' })
      expect(reply['theCheck'], path).toEqual(expect.any(Object))
      expect(linesAbout(run.id, 'The check is held'), path).toEqual([])
    }
  })

  it('18: a message that says the run will not seal holds the check, whatever else it says', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    aPackageHandedBackBy(run.id)
    const message = await theRunWritesItsStarter(run, `${FEATURE_READY} the made-up feature is done.\n${NOT_FOR_A_CHECK}\nRun ${run.id} ends with no seal.`)
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held', message })
    expect(theWordsOf(reply)).toContain(`Run ${run.id} ends with no seal.`)
    expect(reply['theCheck']).toBeUndefined()
  })

  it('19: a round that wrote its starter nothing is held, and its words say nothing of a message', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held' })
    expect(reply['howTheRoundEnded']).not.toHaveProperty('message')
    expect(reply['theCheck']).toBeUndefined()
    expect(theWordsOf(reply)).toBe(theHoldOfARoundWithNoCaseSays(true))
    const lines = linesAbout(run.id, 'The check is held')
    expect(lines).toEqual([{ id: expect.any(String), to: starterId }])
    expect(String(t.api.getRecord(lines[0]!.id)!.data['saidInFull'])).not.toMatch(/message/iu)
  })

  it('20: a round whose agent has no recorded starter is held with no line, for the person or a secretary to release', async () => {
    const run = await aRun({ sandbox: true, commit: true, handle: NO_STARTER })
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held' })
    expect(reply['theCheck']).toBeUndefined()
    expect(theWordsOf(reply)).toBe(theHoldOfARoundWithNoCaseSays(false))
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
    const released = await app.inject({ method: 'POST', url: `/api/records/${run.id}/release-the-held-check`, headers: AS_THE_PROVED_PERSON, payload: { because: 'Synthetic: the round is done.' } })
    expect(released.statusCode, released.body.slice(0, 600)).toBe(200)
  })

  it('21: a FEATURE READY: line in backticks asks for the check; in quotation marks or after > it does not', async () => {
    const run = await aRun({ sandbox: true, commit: true })
    await theRunWritesItsStarter(run, `The work is committed.\n  \`${FEATURE_READY} the made-up feature is done.\``)
    const reply = await seal(run)
    expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'asked' })
    expect(reply['theCheck']).toEqual(expect.any(Object))
    expect(linesAbout(run.id, 'The check is held')).toEqual([])
    for (const body of [`"${FEATURE_READY} the made-up feature is done."`, `> ${FEATURE_READY} the made-up feature is done.`]) {
      const not = await aRun({ sandbox: true, commit: true })
      await theRunWritesItsStarter(not, body)
      const held = await seal(not)
      expect(held['howTheRoundEnded'], body).toMatchObject({ theCheck: 'held' })
      expect(theWordsOf(held), body).toBe(theHoldOfARoundWithNoCaseSays(true))
    }
  })
})


describe('a held check after ownership changes', () => {
  it('notifies the owner while the starter still may release the hold', async () => {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'another-check-owner', name: 'Another check owner', role: 'secretary', runtime: 'claude-code' } })
    expect(registered.statusCode).toBe(201)
    const owner = (registered.json() as { agent: { id: string } }).agent.id
    setFixtureOwner(t.client.sqlite, owner, HANDLE, 'handle')
    try {
      const run = await aRun({ sandbox: true, commit: true })
      await theRunWritesItsStarter(run, 'The report is linked. I seal next.')
      const reply = await seal(run)
      expect(reply['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'held' })
      expect(linesAbout(run.id, 'The check is held')).toEqual([{ id: expect.any(String), to: owner }])
      const released = await app.inject({ method: 'POST', url: `/api/records/${run.id}/release-the-held-check`, headers: { ...asAgent(STARTER), 'x-mole-office-key': starterKey }, payload: { because: 'The test round is ready.' } })
      expect(released.statusCode).toBe(200)
    } finally {
      setFixtureOwner(t.client.sqlite, starterId, HANDLE, 'handle')
    }
  })
})
