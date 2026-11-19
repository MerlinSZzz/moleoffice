// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S MODEL RUN HOLDS ONE TEST-BATCHES SEAT, AND ITS WORDS SAY HOW LONG IT WAITED.
 *
 * The office keeps the pool `test-batches` for the batches of tests run on this machine (src/server/lib/slots.ts), and a
 * check's model runs tests beside those batches. tools/the-inspector.mjs asks for one seat through
 * tools/test-batch-seat.mjs before it starts its model, and gives it back when the model has ended. The standard check's
 * run of tools/run-named-tests.mjs takes one the same way, held by that run's own process group
 * (tools/standard-check-runs.mjs).
 *
 * WHAT IS PROVED, with the real tool and --on-the-host:
 *   1. A seat granted at once. The model starts after the grant, the seat is held by the tool's own process group, it is
 *      given back once after the model ended, and the verdict says when it was asked for, granted and given back.
 *   2. A seat in line. The model does not start, and its clock does not run, while the check waits; the words say how
 *      long it waited.
 *   3. The seat is given back once however the model ends: a release, an error, and the tool's own clock.
 *   4. A kill -9 of the tool's group while the model runs. The office's real seat doors, on a database of this test's
 *      own, held the seat for the tool's group and take it back at the next ask.
 *   5. An office with no such pool, and an office that does not answer the ask: the check stops before its model
 *      starts and says why; the wait markers still bracket the ask.
 *   6. The standard check. Its run of the named tests starts after the grant, in the process group that holds the seat,
 *      and gives the seat back after it ends; the standard release says so. Its clock starts at the grant, which is
 *      proved on runAStandardCheckAsAChild itself, because the standard check's ten minutes are not given on the command.
 *      So is a seat that cannot be asked for: the run never starts, and it ends with no exit code and says why.
 *   7. The model is handed nothing new: no office variable, no key and no address.
 *
 * THE STAND-INS ARE LABELLED. The office is tests/inspector-tool-fixture.ts, a stand-in, and its seat doors are answered
 * here; case 4 hands them to the office's real app instead. The `claude` on PATH is a stand-in written here that runs no
 * model. The key is a made-up value in a keys.json this test writes in its own folder. Nothing reaches the live office.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { freshDb } from './helpers.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { runAStandardCheckAsAChild } from '../tools/standard-check-runs.mjs'
import { A_WAITING_BATCH_ASKS_EVERY_MS, TEST_BATCH_POOL, waitsForASeat } from '../tools/test-batch-seat.mjs'
import { THE_CHECK_BEGAN_ASKING, THE_CHECK_FINISHED_ASKING, theSeatWaitsIn } from '../src/config/a-checks-seat-wait.mjs'

type OsProbe = (typeof import('../src/server/lib/resources.ts'))['LINUX_PROBE']
type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
type Answer = { status: number; body: unknown }

const A_MADE_UP_KEY = 'a-key-this-test-made-up-for-a-checks-seat'
const SEAT = 'seat-of-the-checks-model'
const ASK = 'POST /api/slots/acquire'
const GIVE_BACK = `POST /api/slots/${SEAT}/release`
const GRANTED = 'Granted: seat 2 of 3 in test-batches, as the stand-in office says.'
const QUEUED = 'Queued: number 1 in line for test-batches, as the stand-in office says.'
const granted: Answer = { status: 200, body: { slot: { id: SEAT, state: 'granted', seat: 2, position: null }, asked: 'new', handedOn: [], says: GRANTED } }
const queued: Answer = { status: 200, body: { slot: { id: SEAT, state: 'queued', seat: null, position: 1 }, asked: 'new', handedOn: [], says: QUEUED } }
/** What an office whose pools are older than `test-batches` answers, in the words src/server/lib/slots.ts gives. */
const NO_SUCH_POOL = `There is no slot pool called "${TEST_BATCH_POOL}". The pools are inspector (1 seat) and builds (2 seats).`
const A_RELEASE = { verdict: 'released', check: 'Synthetic: no model ran.', chaptersRead: [] }

/** One ask the tool made at a seat door, as the door heard it. */
interface Heard {
  url: string
  at: number
  /** Whether the made-up office key came with it. Compared as a boolean, so a failure prints no key. */
  key: boolean
  session: unknown
  actor: unknown
  body: Record<string, any> | null
}

/** One start or end of the stand-in model, as it wrote it down. */
interface ModelSaw {
  event: 'start' | 'end'
  at: number
  pid: number
  /** The names of what it was handed that begin MOLE_. */
  names: string[]
  /** Whether any value it was handed holds the made-up key, the stand-in office's address, or the check's session. */
  key: boolean
  address: boolean
  session: boolean
}

interface Ended {
  code: number | null
  out: string
  err: string
}

const made: Fixture[] = []
const groups: number[] = []

afterEach(async () => {
  for (const group of groups.splice(0)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  for (const f of made.splice(0)) await f.close()
})

/**
 * A CHECK OF THE FIXTURE'S RUN, ready to start: the made-up key beside a world's database path, the stand-in model in
 * `mode`, and the seat doors answered by `doors`. Every other ask goes to the stand-in office as it is.
 */
async function aCheck(
  mode: 'release' | 'error' | 'hang',
  doors: (heard: Heard, reply: ServerResponse, request: IncomingMessage) => void | Promise<void>,
  { check = aMadeUpCheckSession(), other = null }: { check?: string; other?: ((request: IncomingMessage, reply: ServerResponse) => boolean) | null } = {},
) {
  const f = await inspectorFixture()
  made.push(f)
  const world = join(f.home, 'a-world')
  mkdirSync(world, { recursive: true })
  writeFileSync(join(world, 'keys.json'), JSON.stringify({ office: A_MADE_UP_KEY }))
  const heard: Heard[] = []
  f.state.onRequest = (request, reply) => {
    if (!(request.url ?? '').startsWith('/api/slots/')) return other?.(request, reply) ?? false
    let raw = ''
    request.on('data', (part) => {
      raw += String(part)
    })
    request.on('end', () => {
      const one: Heard = {
        url: `${request.method ?? ''} ${request.url ?? ''}`,
        at: Date.now(),
        key: request.headers[KEY_HEADER] === A_MADE_UP_KEY,
        session: request.headers['x-mole-office-session'],
        actor: request.headers['x-mole-office-actor-id'],
        body: raw === '' ? null : (JSON.parse(raw) as Record<string, any>),
      }
      heard.push(one)
      void doors(one, reply, request)
    })
    return true
  }
  const bin = join(f.home, 'bin')
  mkdirSync(bin)
  const saw = join(f.home, 'what-the-model-saw.jsonl')
  writeFileSync(
    join(bin, 'claude'),
    [
      `#!${process.execPath}`,
      '// A stand-in for claude, written by a test. It runs no model: it writes down when it started and ended and what',
      '// it was handed, then answers a made-up release, exits 3, or runs until it is stopped.',
      "import { appendFileSync } from 'node:fs'",
      'const handed = Object.entries(process.env)',
      'const holds = (words) => handed.some(([, value]) => (value ?? "").includes(words))',
      `const write = (event) => appendFileSync(${JSON.stringify(saw)}, JSON.stringify({ event, at: Date.now(), pid: process.pid, names: handed.map(([name]) => name).filter((name) => name.startsWith('MOLE_')), key: holds(${JSON.stringify(A_MADE_UP_KEY)}), address: holds(${JSON.stringify(f.api)}), session: holds(${JSON.stringify(check)}) }) + '\\n')`,
      "write('start')",
      "process.on('SIGTERM', () => { write('end'); process.exit(143) })",
      'process.stdin.resume()',
      "process.stdin.on('end', () => {",
      `  const mode = ${JSON.stringify(mode)}`,
      "  if (mode === 'hang') { setInterval(() => {}, 1000); return }",
      "  write('end')",
      "  if (mode === 'error') { process.stderr.write('The stand-in model failed on purpose.\\n'); process.exit(3) }",
      `  process.stdout.write(${JSON.stringify(JSON.stringify({ session_id: 'a-session-a-test-made-up', result: JSON.stringify(A_RELEASE) }))})`,
      '})',
    ].join('\n') + '\n',
  )
  chmodSync(join(bin, 'claude'), 0o755)
  // THE TOOL'S ENVIRONMENT HAS NONE OF THIS TEST'S OWN OFFICE VARIABLES, KEYS OR SANDBOX, as a check the office's worker
  // starts on the host has none: only the world's database path, the fixture's worktree folder, a home of its own and the
  // stand-in first on PATH. A sandbox's process row would make the seat the row's (tools/test-batch-seat.mjs).
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^(?:MOLE_OFFICE_|MOLE_AGENT_|SANDBOX_)/u.test(name)) env[name] = value
  }
  Object.assign(env, {
    HOME: f.home,
    PATH: `${bin}:${process.env['PATH'] ?? ''}`,
    MOLE_OFFICE_DB: join(world, 'world.db'),
    MOLE_OFFICE_CHECK_WORKTREES: join(f.home, '.cache/mole-office/worktrees'),
  })
  /** The real tool, started as the office's worker starts it: the leader of a process group of its own. */
  const start = (flags: string[] = []): { child: ChildProcess; ended: Promise<Ended> } => {
    const child = spawn(
      process.execPath,
      [join(process.cwd(), 'tools/the-inspector.mjs'), '--run', f.run, '--as', 'fixture-inspector', '--api', f.api, '--workspace', 'default', '--checkout', f.checkout, '--on-the-host', '--check', check, ...flags],
      { cwd: process.cwd(), env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    if (child.pid !== undefined) groups.push(child.pid)
    let out = ''
    let err = ''
    child.stdout?.on('data', (part) => {
      out += String(part)
    })
    child.stderr?.on('data', (part) => {
      err += String(part)
    })
    return { child, ended: new Promise((done) => child.on('close', (code) => done({ code, out, err }))) }
  }
  const modelSaw = (): ModelSaw[] =>
    existsSync(saw) ? readFileSync(saw, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as ModelSaw) : []
  const verdicts = () => f.state.writes.filter(({ path }) => path === `/api/checks/${f.run}`).map(({ body }) => body)
  return { f, heard, check, start, modelSaw, verdicts }
}

/** The stand-in seat doors: each ask is answered by `asks`, counted from 1, and each give-back is taken. */
const theStandInDoors = (asks: (n: number) => Answer) => {
  let n = 0
  return (heard: Heard, reply: ServerResponse) => {
    const answer = heard.url === ASK ? asks((n += 1)) : { status: 200, body: { released: true, id: SEAT, says: 'Gave back seat 2 of test-batches.' } }
    reply.statusCode = answer.status
    reply.setHeader('content-type', 'application/json')
    reply.end(JSON.stringify(answer.body))
  }
}

/** How often `words` is in `text`. */
const times = (text: string, words: string) => text.split(words).length - 1

/** The sentence a seat that was held leaves in what the check read, and in its output: its three instants and the wait. */
function theSeatsSentence(text: string, what: string) {
  const found = new RegExp(
    `${what} asked for a ${TEST_BATCH_POOL} seat at (\\S+), was given the seat ${SEAT} at (\\S+) after waiting (\\d+(?:\\.\\d)?) s, and gave it back at (\\S+)\\.`,
    'u',
  ).exec(text)
  if (found === null) return null
  const [, asked, given, waited, back] = found
  return { asked: Date.parse(asked!), given: Date.parse(given!), waited: Number(waited), back: Date.parse(back!) }
}

describe("a check's model run and its test-batches seat", () => {
  // Mutation: start the model before the seat is granted; leave the seat's sentence out of the verdict.
  it("starts the model once the seat is granted, holds it by the tool's own group, gives it back once, and says when", async () => {
    const one = await aCheck('release', theStandInDoors(() => granted))
    const { child, ended } = one.start()
    const ran = await ended
    expect(ran.code, ran.err).toBe(0)
    const asks = one.heard.filter((h) => h.url === ASK)
    expect(asks).toHaveLength(1)
    expect(asks[0]!.body).toMatchObject({ pool: TEST_BATCH_POOL, pid: child.pid })
    expect(typeof asks[0]!.body?.['startedAt']).toBe('string')
    expect(String(asks[0]!.body?.['detail'])).toContain(`the check's model, in the check of the run ${one.f.run}`)
    // ASKED AS THE CHECK ASKS FOR EVERYTHING: its session, its handle and the office's own key.
    expect(asks[0]).toMatchObject({ key: true, session: one.check, actor: 'fixture-inspector' })
    const backs = one.heard.filter((h) => h.url === GIVE_BACK)
    expect(backs).toHaveLength(1)
    expect(backs[0]).toMatchObject({ key: true, session: one.check, body: { note: "the check's model ended" } })
    const [start, end] = one.modelSaw()
    expect(start?.event).toBe('start')
    expect(start!.at).toBeGreaterThanOrEqual(asks[0]!.at)
    expect(backs[0]!.at).toBeGreaterThanOrEqual(end!.at)
    expect(ran.out).toContain(`the check's model: ${GRANTED}`)
    expect(times(ran.out, `the check's model: gave the ${TEST_BATCH_POOL} seat ${SEAT} back.`)).toBe(1)
    // THE WAIT IS SAID WHILE IT HAPPENS, before the grant, and settled after it.
    const beganAt = ran.out.indexOf(THE_CHECK_BEGAN_ASKING)
    const grantedAt = ran.out.indexOf(`the check's model: ${GRANTED}`)
    const finishedAt = ran.out.indexOf(THE_CHECK_FINISHED_ASKING)
    expect(beganAt).toBeGreaterThanOrEqual(0)
    expect(grantedAt).toBeGreaterThan(beganAt)
    expect(finishedAt).toBeGreaterThan(grantedAt)
    expect(theSeatWaitsIn(ran.out)).toMatchObject({ openSince: null, readALine: true })
    const verdicts = one.verdicts()
    expect(verdicts).toHaveLength(1)
    const said = theSeatsSentence(String(verdicts[0]!['read']?.['says']), "The check's model")
    expect(said, String(verdicts[0]!['read']?.['says'])).not.toBeNull()
    expect(said!.asked).toBeLessThanOrEqual(asks[0]!.at)
    expect(said!.given).toBeGreaterThanOrEqual(asks[0]!.at)
    expect(said!.given).toBeLessThanOrEqual(start!.at)
    expect(said!.back).toBeGreaterThanOrEqual(end!.at)
    expect(said!.waited).toBe(Math.round((said!.given - said!.asked) / 100) / 10)
  }, 60_000)

  // Mutation: start the model before the seat is granted; count the model's clock from the tool's start; leave the wait
  // out of the words.
  it('does not start the model, or its clock, while the check waits in line, and says how long it waited', async () => {
    const one = await aCheck('release', theStandInDoors((n) => (n === 1 ? queued : granted)))
    // THREE SECONDS ON THE MODEL'S CLOCK, and five in line: a clock that ran while the check waited would stop it.
    const ran = await one.start(['--limit', '0.05']).ended
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('with 0.05 minutes to finish')
    const asks = one.heard.filter((h) => h.url === ASK)
    expect(asks).toHaveLength(2)
    expect(asks[1]!.at - asks[0]!.at).toBeGreaterThanOrEqual(A_WAITING_BATCH_ASKS_EVERY_MS - 100)
    const [start] = one.modelSaw()
    expect(start!.at).toBeGreaterThanOrEqual(asks[1]!.at)
    expect(times(ran.out, waitsForASeat(QUEUED, 1, "the check's model:"))).toBe(1)
    expect(one.heard.filter((h) => h.url === GIVE_BACK)).toHaveLength(1)
    const said = theSeatsSentence(String(one.verdicts()[0]?.['read']?.['says']), "The check's model")
    expect(said, String(one.verdicts()[0]?.['read']?.['says'])).not.toBeNull()
    expect(said!.waited).toBeGreaterThanOrEqual(A_WAITING_BATCH_ASKS_EVERY_MS / 1000)
    expect(said!.waited).toBe(Math.round((said!.given - said!.asked) / 100) / 10)
    expect(said!.given).toBeGreaterThanOrEqual(asks[1]!.at)
    expect(said!.given).toBeLessThanOrEqual(start!.at)
  }, 60_000)

  // Mutation: give the seat back only when the model released, not in a `finally`.
  it.each([
    { mode: 'release' as const, code: 0, flags: [], says: null },
    { mode: 'error' as const, code: 1, flags: [], says: 'claude exited 3.' },
    { mode: 'hang' as const, code: 1, flags: ['--limit', '0.02'], says: 'was stopped by this tool' },
  ])('gives the seat back once, after the model ended, when the model ends by a $mode', async ({ mode, code, flags, says }) => {
    const one = await aCheck(mode, theStandInDoors(() => granted))
    const ran = await one.start(flags).ended
    expect(ran.code, ran.err).toBe(code)
    if (says !== null) expect(ran.err).toContain(says)
    expect(one.heard.filter((h) => h.url === ASK)).toHaveLength(1)
    const backs = one.heard.filter((h) => h.url === GIVE_BACK)
    expect(backs).toHaveLength(1)
    const ends = one.modelSaw().filter((saw) => saw.event === 'end')
    expect(ends).toHaveLength(1)
    expect(backs[0]!.at).toBeGreaterThanOrEqual(ends[0]!.at)
    expect(times(ran.out, `the check's model: gave the ${TEST_BATCH_POOL} seat ${SEAT} back.`)).toBe(1)
    expect(theSeatsSentence(ran.out, "The check's model"), ran.out).not.toBeNull()
  }, 60_000)

  // Mutation: hold the seat by the group of the process that started the tool, which outlives the kill.
  it("leaves a seat the office takes back once a kill -9 has ended the tool's group", async () => {
    const t = await freshDb()
    const res = await import('../src/server/lib/resources.ts')
    const Fastify = (await import('fastify')).default
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const { resourceRoutes } = await import('../src/server/api/resources.ts')
    const { slotRoutes } = await import('../src/server/api/slots.ts')
    const app = Fastify({ logger: false })
    installErrorHandling(app)
    await app.register(resourceRoutes, { prefix: '/api' })
    await app.register(slotRoutes, { prefix: '/api' })
    await app.ready()
    // THE REAL PROCESS TABLE, so the doors read the tool's group as they read any holder's. The load and the free space
    // are made up and quiet, so no limit holds the seat back whatever this machine is doing.
    const quiet = Object.assign(Object.create(res.LINUX_PROBE) as OsProbe, {
      machineNow: () => ({ loadOneMinute: 1, freeBytes: null }),
      rootFreeBytes: () => 500_000_000_000,
    })
    res.useOsProbe(quiet)
    let sleeper: ChildProcess | null = null
    try {
      const aSession = (title: string) =>
        t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
      const check = aSession("A made-up check whose tool is killed while its model runs")
      // THE TOOL'S ASKS GO TO THE REAL DOORS, with the headers that say who asks. The key is not handed on: the test app
      // takes an agent's name unchecked.
      const handOn = ['content-type', 'x-mole-office-workspace', 'x-mole-office-actor-type', 'x-mole-office-actor-id', 'x-mole-office-session', 'x-mole-office-purpose']
      const answers: { url: string; status: number; body: Record<string, any> }[] = []
      const one = await aCheck(
        'hang',
        async (heard, reply, request) => {
          const headers: Record<string, string> = {}
          for (const name of handOn) {
            const value = request.headers[name]
            if (typeof value === 'string') headers[name] = value
          }
          const answer = await app.inject({ method: 'POST', url: request.url ?? '', headers, payload: JSON.stringify(heard.body ?? {}) })
          answers.push({ url: heard.url, status: answer.statusCode, body: answer.json() as Record<string, any> })
          reply.statusCode = answer.statusCode
          reply.setHeader('content-type', 'application/json')
          reply.end(answer.body)
        },
        { check },
      )
      const { child, ended } = one.start()
      const deadline = Date.now() + 45_000
      while (one.modelSaw().length === 0 && Date.now() < deadline) await new Promise((wait) => setTimeout(wait, 100))
      expect(one.modelSaw()[0]?.event, 'the stand-in model never started').toBe('start')
      expect(answers.map((a) => a.status)).toEqual([200])
      expect(answers[0]!.body).toMatchObject({ asked: 'new', slot: { pool: TEST_BATCH_POOL, state: 'granted' } })
      const seat = String(answers[0]!.body['slot']['id'])
      const heldWhileRunning = (await app.inject({ method: 'GET', url: '/api/slots' })).json() as {
        pools: { name: string; held: { id: string; holder: { pgid: number } }[] }[]
      }
      expect(heldWhileRunning.pools.find((pool) => pool.name === TEST_BATCH_POOL)?.held.find((one) => one.id === seat)?.holder.pgid).toBe(child.pid)
      process.kill(-child.pid!, 'SIGKILL')
      const ran = await ended
      expect(ran.code).toBeNull()
      // NOTHING WAS GIVEN BACK BY THE TOOL: a kill -9 runs no handler.
      expect(one.heard.map((h) => h.url)).toEqual([ASK])
      // THE OFFICE TAKES IT BACK AT THE NEXT ASK, once every process of the group has gone. Another holder asks.
      sleeper = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
      groups.push(sleeper.pid!)
      const asker = aSession('A made-up batch that asks after the check was killed')
      const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-made-up-batch', 'x-mole-office-session': asker, 'x-mole-office-purpose': 'normal' }
      let next: Record<string, any> = {}
      let heldAfterTheAsk: { id: string }[] = []
      while (Date.now() < deadline) {
        const asked = await app.inject({ method: 'POST', url: '/api/slots/acquire', headers, payload: { pool: TEST_BATCH_POOL, pid: sleeper.pid } })
        expect(asked.statusCode, asked.body).toBe(200)
        next = asked.json() as Record<string, any>
        const pools = (await app.inject({ method: 'GET', url: '/api/slots' })).json() as { pools: { name: string; held: { id: string }[] }[] }
        heldAfterTheAsk = pools.pools.find((pool) => pool.name === TEST_BATCH_POOL)?.held ?? []
        if (!heldAfterTheAsk.some((one) => one.id === seat)) break
        await new Promise((wait) => setTimeout(wait, 200))
      }
      // The dead group's row is gone from the pool, and the one seat left is the new asker's.
      expect(heldAfterTheAsk.map((held) => held.id)).toEqual([String(next['slot']['id'])])
      const back = await app.inject({ method: 'POST', url: `/api/slots/${String(next['slot']['id'])}/release`, headers, payload: { note: 'the made-up batch ended' } })
      expect(back.statusCode, back.body).toBe(200)
      const pools = (await app.inject({ method: 'GET', url: '/api/slots' })).json() as { pools: { name: string; held: unknown[] }[] }
      expect(pools.pools.find((pool) => pool.name === TEST_BATCH_POOL)?.held).toEqual([])
    } finally {
      sleeper?.kill('SIGKILL')
      res.useOsProbe(res.LINUX_PROBE)
      await app.close()
      t.close()
    }
  }, 90_000)

  // Mutation: run the model after a seat request failed, or leave out the reason.
  it.each([
    { office: 'has no such pool', doors: theStandInDoors(() => ({ status: 400, body: { error: NO_SUCH_POOL } })), why: () => `the office answered 400: ${NO_SUCH_POOL}` },
    {
      office: 'does not answer the ask',
      doors: (_heard: Heard, _reply: ServerResponse, request: IncomingMessage) => {
        request.socket.destroy()
      },
      why: (api: string) => `the office at ${api} did not answer (`,
    },
  ])('stops before starting the model, and says why, when the office $office', async ({ doors, why }) => {
    const one = await aCheck('release', doors)
    const ran = await one.start().ended
    expect(ran.code, ran.err).not.toBe(0)
    expect(one.heard.map((h) => h.url)).toEqual([ASK])
    expect(one.modelSaw()).toEqual([])
    expect(ran.err).toContain(why(one.f.api))
    // A refused ask still begins and finishes its wait.
    const beganAt = ran.out.indexOf(THE_CHECK_BEGAN_ASKING)
    const finishedAt = ran.out.indexOf(THE_CHECK_FINISHED_ASKING)
    expect(beganAt).toBeGreaterThanOrEqual(0)
    expect(finishedAt).toBeGreaterThan(beganAt)
    expect(theSeatWaitsIn(ran.out)).toMatchObject({ openSince: null, readALine: true })
  }, 60_000)

  // Mutation: hand the model the office's key or address beside the seat.
  it('hands the model no office variable, no key and no address', async () => {
    const one = await aCheck('release', theStandInDoors(() => granted))
    const ran = await one.start().ended
    expect(ran.code, ran.err).toBe(0)
    expect(one.heard.filter((h) => h.url === ASK)).toHaveLength(1)
    const [start] = one.modelSaw()
    expect(start).toMatchObject({ event: 'start', key: false, address: false, session: false })
    expect(start!.names.filter((name) => name.startsWith('MOLE_OFFICE_') || name.startsWith('MOLE_AGENT_'))).toEqual([])
  }, 60_000)
})

describe("the standard check's run of the named tests and its test-batches seat", () => {
  const A_TEST = "import { it } from 'vitest'\nit('waves at a made-up person', () => {})\n"

  // Mutation: run the standard check without a seat; leave out the give-back when the run has ended.
  it('starts the run after the grant, in the group that holds the seat, gives it back after it ends, and the release says so', async () => {
    const asks: Record<string, any>[] = []
    const one = await aCheck('release', theStandInDoors(() => granted), {
      other: (request, reply) => {
        const answer = (status: number, said: unknown) => {
          reply.statusCode = status
          reply.setHeader('content-type', 'application/json')
          reply.end(JSON.stringify(said))
        }
        if (request.method === 'GET' && request.url === '/api/office/gates') {
          const rows = ['standard-one-plugin', 'standard-words', 'standard-tests', 'standard-documents'].map((id) => ({ id, value: '1' }))
          answer(200, { classes: [{ class: 'process', groups: [{ group: 'standard-changes', rows }] }] })
          return true
        }
        if (request.method !== 'POST' || !(request.url ?? '').endsWith('/standard')) return false
        let raw = ''
        request.on('data', (part) => {
          raw += String(part)
        })
        request.on('end', () => {
          asks.push(JSON.parse(raw) as Record<string, any>)
          answer(201, { says: 'Synthetic: released as a standard change.' })
        })
        return true
      },
    })
    const { f } = one
    // THE FORK BASE HOLDS A MADE-UP TEST COMMAND AND A MADE-UP BUILD. The command runs no test: it writes down its pid,
    // its process group's leader and when it started.
    const ranTheTests = join(f.home, 'the-named-tests-ran.json')
    mkdirSync(join(f.checkout, 'tools'))
    writeFileSync(
      join(f.checkout, 'tools/run-named-tests.mjs'),
      [
        '// A made-up stand-in for the tests, written by a test. It runs no test: it writes down its pid and when it started.',
        "import { writeFileSync } from 'node:fs'",
        `writeFileSync(${JSON.stringify(ranTheTests)}, JSON.stringify({ pid: process.pid, at: Date.now(), argv: process.argv.slice(2) }))`,
        "console.log('The made-up runner ran.')",
      ].join('\n') + '\n',
    )
    mkdirSync(join(f.checkout, 'node_modules/.bin'), { recursive: true })
    writeFileSync(
      join(f.checkout, 'node_modules/.bin/vite'),
      [`#!${process.execPath}`, "import { mkdirSync, writeFileSync } from 'node:fs'", "mkdirSync('dist/web', { recursive: true })", "writeFileSync('dist/web/index.html', 'made-up built page\\n')"].join('\n') + '\n',
      { mode: 0o755 },
    )
    f.git('add', '.')
    f.git('commit', '-qm', 'Fixture: a made-up tests command')
    const forkBase = f.git('rev-parse', 'HEAD')
    mkdirSync(join(f.checkout, 'tests'))
    writeFileSync(join(f.checkout, 'tests/made-up-thing.test.ts'), A_TEST)
    f.git('add', '.')
    f.git('commit', '-qm', 'Fixture: a made-up change')
    f.state.workArea = ['tests/made-up-thing.test.ts']
    f.state.submission = {
      id: 'synthetic-seal',
      seal: { kind: 'git', hash: 'a'.repeat(64), git: { directory: f.checkout, commit: f.git('rev-parse', 'HEAD'), forkBase }, records: null, standard: 'tests' },
    }
    // THE CHECK'S OWN LOG, in a folder of its own, so the standard check can keep its full output beside it.
    const logFolder = join(f.home, 'the-checks-log')
    mkdirSync(logFolder)
    f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null }, theCheck: { execution: { log: join(logFolder, 'said.txt') } } } as never
    const ran = await one.start().ended
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('is released as a standard change of the kind tests, and no model ran.')
    expect(one.modelSaw()).toEqual([])
    expect(existsSync(ranTheTests), ran.out).toBe(true)
    const tests = JSON.parse(readFileSync(ranTheTests, 'utf8')) as { pid: number; at: number; argv: string[] }
    expect(tests.argv).toEqual(['tests/made-up-thing.test.ts'])
    const seatAsks = one.heard.filter((h) => h.url === ASK)
    expect(seatAsks).toHaveLength(1)
    // HELD BY THE RUN'S OWN GROUP: the pid asked with is the pid the command ran as.
    expect(seatAsks[0]!.body).toMatchObject({ pool: TEST_BATCH_POOL, pid: tests.pid })
    expect(String(seatAsks[0]!.body?.['detail'])).toContain('the standard check changed-tests')
    expect(tests.at).toBeGreaterThanOrEqual(seatAsks[0]!.at)
    const backs = one.heard.filter((h) => h.url === GIVE_BACK)
    expect(backs).toHaveLength(1)
    expect(backs[0]).toMatchObject({ key: true, body: { note: 'the standard check changed-tests ended' } })
    expect(backs[0]!.at).toBeGreaterThanOrEqual(tests.at)
    expect(asks).toHaveLength(1)
    const said = theSeatsSentence(String(asks[0]!['read']?.['says']), 'The standard check changed-tests')
    expect(said, String(asks[0]!['read']?.['says'])).not.toBeNull()
    expect(said!.given).toBeLessThanOrEqual(tests.at)
    expect(said!.back).toBeGreaterThanOrEqual(tests.at)
  }, 90_000)

  // Mutation: start the run's clock when the child is started, before its seat is granted; leave out the give-back when
  // the run has ended.
  it("starts the run's clock at the grant, not while the run waits for its seat", async () => {
    const folder = mkdtempSync(join(tmpdir(), 'a-standard-checks-seat-'))
    try {
      const wrote = join(folder, 'the-command-ran.json')
      const asked: { pid: number; at: number }[] = []
      const givenBack: number[] = []
      let grantedAt = 0
      // ONE SECOND ON THE CLOCK, and a seat granted after one and a half: a clock that ran while the run waited stops it.
      const ran = await runAStandardCheckAsAChild({
        name: 'changed-tests',
        argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(wrote)}, JSON.stringify({ pid: process.pid, at: Date.now() }))`],
        limitMs: 1_000,
        cwd: folder,
        seat: async (pid) => {
          asked.push({ pid, at: Date.now() })
          await new Promise((wait) => setTimeout(wait, 1_500))
          grantedAt = Date.now()
          return { giveBack: () => givenBack.push(Date.now()) }
        },
      })
      expect(ran.code, ran.said).toBe(0)
      const command = JSON.parse(readFileSync(wrote, 'utf8')) as { pid: number; at: number }
      expect(asked).toEqual([{ pid: command.pid, at: expect.any(Number) }])
      expect(command.at).toBeGreaterThanOrEqual(grantedAt)
      expect(givenBack).toHaveLength(1)
      expect(givenBack[0]!).toBeGreaterThanOrEqual(command.at)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)

  // Mutation: take out the catch on the seat's ask.
  it('does not start the run when its seat cannot be asked for, stops the waiting group, and says why', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'a-standard-checks-seat-'))
    try {
      const wrote = join(folder, 'the-command-ran.json')
      const log = join(folder, 'the-checks-log.txt')
      const asked: number[] = []
      // A MINUTE ON THE CLOCK, which never starts: without the catch nothing ends the run, and the case runs out of time.
      const ran = await runAStandardCheckAsAChild({
        name: 'changed-tests',
        argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(wrote)}, '{}')`],
        limitMs: 60_000,
        cwd: folder,
        keepAt: log,
        seat: async (pid) => {
          asked.push(pid)
          throw new Error('a refusal this test made up')
        },
      })
      const why = 'Its seat could not be asked for, so the command was not started: a refusal this test made up'
      expect(ran.code, ran.said).toBeNull()
      expect(ran.said).toBe(why)
      expect(existsSync(wrote)).toBe(false)
      expect(times(readFileSync(log, 'utf8'), why)).toBe(1)
      expect(asked).toHaveLength(1)
      expect(() => process.kill(-asked[0]!, 0)).toThrow()
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)
})
