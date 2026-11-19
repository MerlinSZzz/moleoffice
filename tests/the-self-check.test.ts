// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SELF-CHECK GIVES EXACTLY ONE OF FIVE ANSWERS (criterion W3; src/config/the-self-check.mjs).
 *
 * One case per answer, and one for the reply that names no world, which tools/session-hook.mjs
 * refuses on and the self-check calls the wrong world:
 *
 *   - healthy: a real office this test starts, on a database and a port of its own;
 *   - the wrong world: the same real office, asked about while expecting another real database file
 *     at its port;
 *   - cannot tell: a fact that is `unknown` on one side or both is never read as a match (check
 *     FaHVVEwRbcak, invariant 5). The declaration's side is unknown when it names a database file that
 *     is not there, asked of the real office; the office's side is unknown when a stand-in says so;
 *     both, when both are. A known difference still makes the answer the wrong world;
 *   - not answering: a port this test holds open for a moment and then closes, so nothing listens;
 *   - unhealthy, and a reply with no world header: a STAND-IN, a small HTTP server this test runs. A
 *     real office says `ok: false` only when it answers on the port its checkout's .env declares
 *     with another database or checkout, or when its supervisor keeps failing, or when its code has
 *     been stale too long. The first would mean this checkout's real port, the second writes into the
 *     checkout's .logs, and the third cannot be made in a test. So the stand-in sends what such an
 *     office sends: the world header of the office expected, and a body with `ok: false` and its
 *     reasons. Its reasons are this test's own words, not the office's.
 *
 * Every office here is this test's own. None is the live office, its port or its database.
 *
 * MUTATIONS, each in src/config/the-self-check.mjs:
 *   - the commit is compared too: the healthy case goes red, because the expected world names none;
 *   - an unknown is not set apart, so the old comparison returns: the three unknown cases go red,
 *     the one with both sides unknown as healthy;
 *   - an unknown on the office's side is not seen: that case goes red;
 *   - an unknown on the declaration's side is not seen: that case goes red;
 *   - the health check's `ok` is not read: the unhealthy case goes red;
 *   - `answeredWithoutAWorld` is not read: the no-header case goes red, as not answering;
 *   - a failed read is called healthy: the closed-port case goes red.
 *
 * MUTATIONS, in src/config/the-self-check-words.mjs:
 *   - the Chinese words name a fact with the English name: the wrong-world case goes red;
 *   - the Chinese words describe the office answering with the English `worldInWords`: the
 *     wrong-world case goes red.
 *
 * MUTATION, in src/config/the-self-check.mjs:
 *   - `whatTheWindowSays` leaves out what the person can do: the wrong-world case goes red.
 *
 * ROUND 14 OF WAVE 13T: nothing answering is said plainly, and the system's detail only in Developer
 * mode. MUTATIONS:
 *   - `whatTheWindowSays` says the system's sentence again (`notAnswering(found.why)`): the closed-port
 *     case goes red;
 *   - the detail is shown whatever the mode: the closed-port case goes red;
 *   - a Chinese not-answering sentence ends in an English full stop: the Chinese case goes red;
 *   - src/desktop/main.mjs reads the mode under another key than src/web/lib/mode.ts: the key case goes red.
 *
 * WHEN THE OFFICE THIS FILE STARTS DOES NOT ANSWER, THE RED SAYS WHY (item 2u of wave 13n). In the merge
 * queue this file once went red with only "did not answer within 90 seconds", and it was green alone, so
 * nobody could tell an office that was slow to start from one that never started. The office's output
 * now goes to office.log in its own folder. The red of the wait carries the last 2,000 characters of that
 * log, and whether the office's process still runs or how it ended. The wait is no longer than before,
 * and it is not tried again. When the start or any case fails, afterAll keeps the folder and says where.
 * MUTATIONS, in this file:
 *   - THE_SERVER names a file that is not there: the office's process ends at once, and the red carries
 *     node's own words and "exited with code 1";
 *   - the wait asks a port the office does not listen on: the red says the office's process still runs,
 *     and carries the end of its log.
 */

import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { theAnswerInWords, theWorldTheDeclarationNames, whatAnswersForThisOffice, whatTheWindowSays } from '../src/config/the-self-check.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX, commandThatStopsWithItsOwner, devStackEnvironment } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_SERVER = join(REPO, 'src', 'server', 'index.ts')

/** Every process group this file started, so `afterAll` can stop each one. */
const groups = new Set<number>()
/** Every folder this file made. */
const folders = new Set<string>()
/** Every stand-in this file started. */
const standIns: Server[] = []

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/**
 * A stand-in that answers every request with 200, the headers and the body `answer` gives for the
 * port it listens on, so it can say its own port in a world header as an office does.
 */
async function aStandIn(answer: (port: number) => { headers: Record<string, string>; body: unknown }): Promise<number> {
  const server = createHttpServer((_req, res) => {
    const address = server.address()
    const said = answer(typeof address === 'object' && address !== null ? address.port : 0)
    res.writeHead(200, { 'content-type': 'application/json', ...said.headers })
    res.end(JSON.stringify(said.body))
  })
  standIns.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

let office: { database: string; port: number }
/** The folder of this test's office, which holds its log, and whether a failure asks afterAll to keep it. */
let theOfficesFolder = ''
let keepTheOfficesFolder = false

beforeAll(async () => {
  // A real office of this test's own: its own folder, database, home and port, in its own group, which the
  // watchdog ends if this worker dies before afterAll runs.
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}self-check-`)
  folders.add(dir)
  theOfficesFolder = dir
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const log = join(dir, 'office.log')
  const out = openSync(log, 'a')
  const watched = commandThatStopsWithItsOwner(process.execPath, ['--import', 'tsx', THE_SERVER])
  const child = spawn(watched.command, watched.args, {
    cwd: REPO,
    env: { ...devStackEnvironment(dir, port, await aFreePort(), { database }), HOME: home, MOLE_OFFICE_MESSAGE_WORKER: 'off' },
    detached: true,
    stdio: ['ignore', out, out],
  })
  closeSync(out)
  if (child.pid !== undefined) groups.add(child.pid)
  // HOW THE OFFICE'S PROCESS ENDED, once it has. The watchdog's shell execs the server, so this is the server's own end.
  let ended = ''
  child.on('exit', (code, signal) => {
    ended = signal === null ? `exited with code ${String(code)}` : `was ended by ${signal}`
  })
  office = { database, port }
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, asks: 1, waitMs: 1_000 })
    if (found.answer !== 'not-answering') return
    await sleep(250)
  }
  keepTheOfficesFolder = true
  const said = readFileSync(log, 'utf8')
  throw new Error(
    `The test's own office did not answer on port ${String(port)} within 90 seconds. ` +
      `Its process ${ended === '' ? `still runs, as pid ${String(child.pid)}` : ended}. ` +
      (said === '' ? `Its log, kept at ${log}, is empty.` : `The end of its log, kept at ${log}:\n${said.slice(-2_000)}`),
  )
}, 120_000)

beforeEach(({ onTestFailed }) => {
  onTestFailed(() => {
    keepTheOfficesFolder = true
  })
})

afterAll(async () => {
  for (const server of standIns) server.close()
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) {
    if (dir === theOfficesFolder && keepTheOfficesFolder) process.stderr.write(`the-self-check: a test failed, so the office's folder and its log are kept at ${dir}\n`)
    else rmSync(dir, { recursive: true, force: true })
  }
}, 40_000)

/** The world this test's office should be: its database, this checkout, its port. */
function theOfficesWorld(): ReturnType<typeof theWorldTheDeclarationNames> {
  return theWorldTheDeclarationNames({ databasePath: office.database, apiPort: office.port })
}

describe('what answers for this office', () => {
  it('is healthy when the office expected answers and its health check says ok', async () => {
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(office.port)}`, expected: theOfficesWorld() })
    expect(found.answer, theAnswerInWords(found).join('\n')).toBe('healthy')
    if (found.answer !== 'healthy') return
    expect(found.world.database).toBe(databaseIdentity(office.database).id)
    expect(theAnswerInWords(found)[0]).toBe(
      `The office this checkout declares answers at http://127.0.0.1:${String(office.port)}, and its health check says ok.`,
    )
  })

  it('is the wrong world when another database answers at the port expected, and names the field', async () => {
    // Another database: a real file of its own, so its identity can be read and is not this office's.
    const another = mkdtempSync(`${TEST_DATABASE_PREFIX}self-check-another-`)
    folders.add(another)
    writeFileSync(join(another, 'another.db'), '')
    const expected = theWorldTheDeclarationNames({ databasePath: join(another, 'another.db'), apiPort: office.port })
    expect(expected.database).not.toBe('unknown')
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(office.port)}`, expected })
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.differences.map((one) => one.key)).toEqual(['database'])
    expect(found.differences[0]?.answered).toBe(databaseIdentity(office.database).id)
    expect(theAnswerInWords(found)).toContain(
      `The database: this checkout says ${expected.database}; the office answering says ${databaseIdentity(office.database).id}.`,
    )
    // The same answer in Chinese names the fact in Chinese, from the one table of these words.
    expect(theAnswerInWords(found, 'zh')).toEqual(
      expect.arrayContaining([
        `http://127.0.0.1:${String(office.port)} 有办公室在回应，但不是这个代码目录声明的那个。`,
        `数据库：这个代码目录说是 ${expected.database}；回应的办公室说是 ${databaseIdentity(office.database).id}。`,
      ]),
    )
    // And the office answering is described in Chinese: its facts' names and its standing are words,
    // and only the values stay as they are (the review of round 8).
    const described = theAnswerInWords(found, 'zh').at(-1) ?? ''
    expect(described).toMatch(/^回应的办公室是：数据库 \S+，代码目录 \S+，端口 \d+，提交 \S+，(临时世界|你工作的办公室)。$/)
    expect(described).toContain(`端口 ${String(office.port)}`)

    // THE WINDOW SAYS THE SAME ANSWER IN PLAIN WORDS (the review of round 9 of wave 13t): what is
    // wrong first, every value with a label saying what it is, and what the person can do last.
    for (const language of ['en', 'zh'] as const) {
      const says = WINDOW_WORDS[language].says
      const lines = whatTheWindowSays(found, language)
      expect(lines[0]).toEqual({ say: says.wrongWorld(`http://127.0.0.1:${String(office.port)}`) })
      expect(lines).toContainEqual({ label: says.labels.database, value: says.differs(databaseIdentity(office.database).id, expected.database) })
      expect(lines).toContainEqual({ label: says.labels.port, value: String(office.port) })
      expect(lines.at(-1)).toEqual({ todo: says.wrongTodo })
    }
  })

  it('is not answering when nothing listens at the port', async () => {
    const closed = await aFreePort()
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(closed)}`, expected: theOfficesWorld() })
    expect(found.answer).toBe('not-answering')
    if (found.answer !== 'not-answering') return
    expect(found.failure).toBe('refused')
    expect(theAnswerInWords(found)[0]).toMatch(/^Nothing answers for this office: /)

    // THE WINDOW SAYS IT PLAINLY (wave 13t, round 14): one sentence in the person's language, with no
    // address and none of the system's English. Chinese is Chinese throughout and ends in its own mark.
    expect(whatTheWindowSays(found, 'en')).toEqual([{ say: "This window's Mole Office is not running." }])
    expect(whatTheWindowSays(found, 'zh')).toEqual([{ say: '这个窗口的 Mole Office 没有在运行。' }])
    for (const language of ['en', 'zh'] as const) {
      const said = JSON.stringify(whatTheWindowSays(found, language))
      expect(said).not.toContain('127.0.0.1')
      expect(said).not.toContain('refused')
    }
    // The system's own detail is shown only in Developer mode, under a label that says what it is.
    for (const language of ['en', 'zh'] as const) {
      expect(whatTheWindowSays(found, language, { developer: true })).toEqual([
        { say: WINDOW_WORDS[language].says.notAnswering('refused') },
        { label: WINDOW_WORDS[language].says.detail, value: found.why },
      ])
    }
  })

  it('is unhealthy, with its reasons, when the office expected answers and its health check says ok: false (a stand-in)', async () => {
    const reasons = ['a reason this test gave its stand-in', 'and a second one']
    const world = { ...theOfficesWorld(), head: 'abc1234', standing: 'scratch' }
    const port = await aStandIn((itsPort) => ({
      headers: { [WORLD_HEADER]: formatWorldHeader({ ...world, port: String(itsPort) }) },
      body: { ok: false, wrong: reasons },
    }))
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, expected: { ...theOfficesWorld(), port: String(port) } })
    expect(found.answer).toBe('unhealthy')
    if (found.answer !== 'unhealthy') return
    expect(found.reasons).toEqual(reasons)
    expect(theAnswerInWords(found)).toContain('Wrong: a reason this test gave its stand-in')
  })

  it('is the wrong world, saying why, when something answers with no world header (a stand-in)', async () => {
    const port = await aStandIn(() => ({ headers: {}, body: { ok: true } }))
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, expected: theOfficesWorld() })
    expect(found.answer).toBe('wrong-world')
    if (found.answer !== 'wrong-world') return
    expect(found.world).toBeNull()
    expect(found.differences).toEqual([])
    expect(found.notSaid).toContain(`carried no ${WORLD_HEADER} header`)
  })

  it('cannot tell, naming the database, when the declaration cannot read its own database identity', async () => {
    const expected = theWorldTheDeclarationNames({ databasePath: join(REPO, 'no-such-database.db'), apiPort: office.port })
    expect(expected.database).toBe('unknown')
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(office.port)}`, expected })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([['database', 'this checkout']])
    expect(theAnswerInWords(found)[0]).toBe(
      `An office answers at http://127.0.0.1:${String(office.port)}, but whether it is the one this checkout declares cannot be told.`,
    )
  })

  it('cannot tell when the office answering says its database identity is unknown (a stand-in)', async () => {
    const port = await aStandIn((itsPort) => ({
      headers: { [WORLD_HEADER]: formatWorldHeader({ ...theOfficesWorld(), database: 'unknown', port: String(itsPort), head: 'abc1234', standing: 'scratch' }) },
      body: { ok: true },
    }))
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, expected: { ...theOfficesWorld(), port: String(port) } })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([['database', 'the office answering']])
  })

  it('cannot tell when the database identity is unknown on both sides, and never calls it healthy (a stand-in)', async () => {
    const port = await aStandIn((itsPort) => ({
      headers: { [WORLD_HEADER]: formatWorldHeader({ ...theOfficesWorld(), database: 'unknown', port: String(itsPort), head: 'abc1234', standing: 'scratch' }) },
      body: { ok: true },
    }))
    const expected = { ...theOfficesWorld(), database: 'unknown', port: String(port) }
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, expected })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([['database', 'both']])
    expect(theAnswerInWords(found)).toContain('The database is unknown both to this checkout and to the office answering, so it cannot be compared.')
  })

  it('treats an unknown or empty checkout or port the same way, and a known difference still wins (a stand-in)', async () => {
    const port = await aStandIn(() => ({
      headers: { [WORLD_HEADER]: formatWorldHeader({ ...theOfficesWorld(), repository: '', port: 'unknown', head: 'abc1234', standing: 'scratch' }) },
      body: { ok: true },
    }))
    const found = await whatAnswersForThisOffice({ address: `http://127.0.0.1:${String(port)}`, expected: { ...theOfficesWorld(), port: String(port) } })
    expect(found.answer).toBe('cannot-tell')
    if (found.answer !== 'cannot-tell') return
    expect(found.unknowns.map((one) => [one.key, one.unknownTo])).toEqual([
      ['repository', 'the office answering'],
      ['port', 'the office answering'],
    ])
    // The same office, expected with another database whose identity is known: that difference is proof.
    const wrong = await whatAnswersForThisOffice({
      address: `http://127.0.0.1:${String(port)}`,
      expected: { ...theOfficesWorld(), database: '0123456789abcdef', port: String(port) },
    })
    expect(wrong.answer).toBe('wrong-world')
  })
})
