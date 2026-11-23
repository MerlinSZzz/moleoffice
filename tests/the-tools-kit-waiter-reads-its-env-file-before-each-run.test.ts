// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER IN tools/kit/ READS ITS ENV FILE AGAIN BEFORE EACH RUN OF THE HOLD TOOL, AND TRIES A
 * REFUSED HOLD ONCE MORE WHEN THE ENV FILE HAS CHANGED.
 *
 * This is proved on `tools/kit/waiter.sh`, the copy with no personal default.
 * `design/agents/kit/waiter.sh`, which live agents still run by its path, forwards to it.
 *
 * Problem `-2DXAjdifik3`, 26 September 2026. The owner granted an agent a new key, which revoked its
 * old one. The agent collected the new key and wrote it into its env file, but the kit's waiter.sh
 * had read that file once, when it started, and went on running `tools/hold-the-handle.mjs` with the
 * revoked key. A message came, the tool handed it over and ended, the next run's hold was refused,
 * the waiter ended, and the handle was not held for about ten minutes.
 *
 * THE TWO REAL-OFFICE CASES. The real waiter.sh runs the real hold tool, pointed at a listener of
 * this file's own that hands each request to a scratch office stamped as arriving from this machine,
 * so the hold door asks for a key. The agent's env file holds key A, and the hold is taken with A.
 * The agent's starter then gives it key B through the starter's re-key door, which revokes A. A
 * message ends the tool's run with a hand-over, and the waiter runs the tool again.
 * - Case 1: B is written into the env file before the message. The next hold must carry B and be
 *   taken (201).
 * - Case 3: B is written only while the next run's hold, carrying A, is on its way, so that hold is
 *   refused (403) and the run ends with "exiting: refused". The waiter must read the env file again,
 *   see that it changed, say so in the out file, and hold with B (201). This is the case of problem
 *   -2DXAjdifik3: the key was replaced while a run was going.
 * Which key a hold carried is read from the listener's own log of the hold requests, compared
 * inside this file, and never printed. The out file must hold neither key.
 *
 * WHY A HAND-OVER ENDS THE RUN. The beat and waiting doors do not ask for a key, so a run started
 * with A goes on beating after A is revoked. Only the next hold asks for one.
 *
 * THE STUB CASES. Case 2: an env file that goes away. The waiter keeps the text it last read and says
 * so once. Case 4: a refusal with an unchanged env file still stops the waiter after one run, and a
 * refusal after a change is tried again only once, so a key refused again with the same file stops it.
 *
 * MUTATION, proved after a control run (see the commit message): in tools/kit/waiter.sh, read the
 * env file before a run only when it was never read, which keeps the text of the first read. Case 1
 * goes red: the next hold carries the revoked key A.
 *
 * EVERY WAITER THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2):
 * `detached: true` makes the waiter the leader of a new group, the hold tool it runs joins that
 * group, and the cleanup stops each group by the id this file recorded when it started it. The
 * listener is this file's own, on a port the system chose, and is closed in the cleanup.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WAITER = fileURLToPath(new URL('../tools/kit/waiter.sh', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string, key: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': key,
})

let t: TestDb
let app: FastifyInstance
let door: Server
let api = ''
let scratch = ''
let starterKey = ''
const waiters: ChildProcess[] = []

/** Which of an agent's two keys a hold request carried. The keys themselves are never logged. */
type WhichKey = 'A' | 'B' | 'another'
interface AHold {
  key: WhichKey
  status: number
}
/** One agent under test: its keys (held only to be compared, never printed) and its hold requests. */
interface AnAgent {
  handle: string
  keyA: string
  keyB: string
  holds: AHold[]
  /** Called by the listener before a hold is handed to the office, with the key it carried. */
  beforeAHold?: (key: WhichKey) => void
}
const agents = new Map<string, AnAgent>()

function whichKey(agent: AnAgent, carried: string | string[] | undefined): WhichKey {
  if (carried === agent.keyA) return 'A'
  if (agent.keyB !== '' && carried === agent.keyB) return 'B'
  return 'another'
}

async function until(what: () => boolean, within: number): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return what()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  door = createServer((raw, res) => {
    const path = (raw.url ?? '').split('?')[0] ?? ''
    const hold = /^\/api\/handles\/([^/]+)\/hold$/.exec(path)
    const agent = hold === null ? undefined : agents.get(decodeURIComponent(hold[1] ?? ''))
    if (raw.method === 'POST' && agent !== undefined) {
      const seen: AHold = { key: whichKey(agent, raw.headers['x-mole-office-key']), status: 0 }
      agent.holds.push(seen)
      agent.beforeAHold?.(seen.key)
      res.on('finish', () => (seen.status = res.statusCode))
    }
    stampArrival(raw, 'this machine', 'the caller')
    app.routing(raw, res)
  })
  await new Promise<void>((go) => door.listen(0, '127.0.0.1', go))
  api = `http://127.0.0.1:${String((door.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-waiter-env-file-'))

  // THE STARTER, which starts each agent and later gives it a new key.
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'the-starter', name: 'The starter', role: 'secretary' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  starterKey = (starter.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''
  expect(starterKey !== '', 'the starter was answered no key').toBe(true)
}, 180_000)

afterAll(async () => {
  // EACH WAITER AND ITS TOOL ARE STOPPED BY THEIR OWN PROCESS GROUP, the one this file started them in.
  for (const waiter of waiters) {
    if (waiter.pid === undefined) continue
    try {
      process.kill(-waiter.pid, 'SIGKILL')
    } catch {
      // The group has already ended, which is what the cleanup wanted.
    }
  }
  await new Promise<void>((go) => door.close(() => go()))
  await app.close()
  t.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
}, 60_000)

/**
 * Start an agent (answered key A) with a session, write A into its env file, start the real waiter
 * for it, and wait for the hold with A. Returns what the case needs to go on.
 */
async function anAgentHoldingWithKeyA(handle: string): Promise<{
  agent: AnAgent
  envFile: string
  written: () => string
  said: () => string
}> {
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent('the-starter', starterKey),
    payload: { handle, name: `The agent ${handle}`, role: 'worker', workArea: ['src'] },
  })
  expect(started.statusCode, started.body).toBe(201)
  const agent: AnAgent = {
    handle,
    keyA: (started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '',
    keyB: '',
    holds: [],
  }
  expect(agent.keyA !== '', 'the agent was answered no key').toBe(true)
  agents.set(handle, agent)

  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle, agent.keyA),
    payload: { kind: 'session', title: `A terminal answering as ${handle}`, data: { state: 'running', runtime: 'claude-code', doing: 'holding its handle' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const session = (filed.json() as { record: { id: string } }).record.id

  // THE ENV FILE HOLDS KEY A, as the kit's README makes it: mode 600, one MOLE_AGENT_KEY line.
  const dir = mkdtempSync(join(scratch, `${handle}-`))
  const envFile = join(dir, 'env')
  writeFileSync(envFile, `MOLE_AGENT_KEY=${agent.keyA}\n`, { mode: 0o600 })
  const out = join(dir, 'waiter.out')

  // THE WAITER'S OWN ENVIRONMENT, never the launcher's (finding 44): no MOLE_AGENT_KEY of its own,
  // so the key can only come from the env file. The repeat waits are short so the message the
  // revoked key could not mark taken comes back quickly, and the test stops the waiter anyway.
  const waiter = spawn('bash', [WAITER, handle, session, WORKSPACE, out, envFile], {
    detached: true,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: join(dir, 'home'),
      MOLE_OFFICE_CHECKOUT: CHECKOUT,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_WORKSPACE: WORKSPACE,
      MOLE_OFFICE_SESSION: session,
      MOLE_OFFICE_AGENT: handle,
      WAITER_REPEAT_WAITS: '1',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  waiters.push(waiter)
  const written = (): string => {
    try {
      return readFileSync(out, 'utf8')
    } catch {
      return ''
    }
  }
  // WHAT A FAILURE PRINTS: the out file with either key blanked out, so no key reaches the log.
  const said = (): string => {
    let text = written()
    for (const key of [agent.keyA, agent.keyB]) if (key !== '') text = text.split(key).join('<a key>')
    return text
  }

  // THE FIRST RUN HOLDS WITH A.
  expect(await until(() => agent.holds.some((one) => one.key === 'A' && one.status === 201), 30_000), said()).toBe(true)
  return { agent, envFile, written, said }
}

/** The starter gives the agent key B, which revokes A. B is kept only to be compared. */
async function theStarterReKeys(agent: AnAgent): Promise<void> {
  const rekeyed = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${agent.handle}/new-key`,
    headers: asAgent('the-starter', starterKey),
    payload: { because: 'the test re-keys it' },
  })
  expect(rekeyed.statusCode, rekeyed.body).toBe(201)
  agent.keyB = (rekeyed.json() as { key?: string }).key ?? ''
  expect(agent.keyB !== '' && agent.keyB !== agent.keyA, 'the re-key answered no new key').toBe(true)
}

/** A message to the agent, which ends the tool's run with a hand-over. */
async function aMessageTo(handle: string): Promise<void> {
  const message = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('the-starter', starterKey),
    payload: { kind: 'message', title: 'Wake up', data: { body: 'A message that ends the run.', to: [{ kind: 'agent', id: handle }] } },
  })
  expect(message.statusCode, message.body).toBe(201)
}

/** The refused-and-changed line waiter.sh writes. */
const TRIED_AGAIN =
  '=== waiter: the hold was refused, and the env file has changed since this run started; holding again with the env file as it is now ('

describe("the waiter in tools/kit reads its env file before each run", () => {
  it('case 1: holds the handle with the new key written into the env file after the old key was revoked', async () => {
    const { agent, envFile, written, said } = await anAgentHoldingWithKeyA('rekeyed-before')
    await theStarterReKeys(agent)
    writeFileSync(envFile, `MOLE_AGENT_KEY=${agent.keyB}\n`, { mode: 0o600 })
    const holdsBeforeTheReKey = agent.holds.length
    await aMessageTo(agent.handle)

    // THE NEXT HOLD CARRIES B AND IS TAKEN, and no later hold carries A.
    const later = (): AHold[] => agent.holds.slice(holdsBeforeTheReKey).filter((one) => one.status !== 0)
    expect(await until(() => later().length > 0, 30_000), said()).toBe(true)
    const next = later()[0]!
    expect(next.key, `the next hold carried key ${next.key}; the out file said:\n${said()}`).toBe('B')
    expect(next.status, said()).toBe(201)
    expect(later().some((one) => one.key === 'A'), 'a hold after the re-key carried the revoked key A').toBe(false)

    // THE OUT FILE SAYS NOTHING OF EITHER KEY, and the waiter did not end.
    const everything = written()
    expect(everything.includes(agent.keyA), 'the out file holds key A').toBe(false)
    expect(everything.includes(agent.keyB), 'the out file holds key B').toBe(false)
    expect(everything.includes('=== waiter ended'), said()).toBe(false)
  }, 120_000)

  it('case 3: a hold refused while the key was being replaced is tried again with the new env file, and holds', async () => {
    const { agent, envFile, written, said } = await anAgentHoldingWithKeyA('rekeyed-during')
    await theStarterReKeys(agent)
    const holdsBeforeTheReKey = agent.holds.length
    // B IS WRITTEN WHILE THE NEXT HOLD, STILL CARRYING THE REVOKED A, IS ON ITS WAY. The run that sent
    // it started with A in the env file, so the office refuses it and the run ends with a refusal.
    agent.beforeAHold = (key) => {
      if (key === 'A') writeFileSync(envFile, `MOLE_AGENT_KEY=${agent.keyB}\n`, { mode: 0o600 })
    }
    await aMessageTo(agent.handle)

    const later = (): AHold[] => agent.holds.slice(holdsBeforeTheReKey).filter((one) => one.status !== 0)
    expect(await until(() => later().some((one) => one.key === 'B'), 30_000), said()).toBe(true)
    // FIRST THE REFUSED HOLD WITH A, THEN THE HOLD WITH B, TAKEN.
    const [refused, retried] = later()
    expect(refused?.key, said()).toBe('A')
    expect(refused?.status, said()).toBe(403)
    expect(retried?.key, said()).toBe('B')
    expect(retried?.status, said()).toBe(201)

    // THE OUT FILE SAYS THE ENV FILE CHANGED AND THE HOLD WAS TRIED AGAIN, ONCE, AND NAMES NO KEY.
    const everything = written()
    expect(everything.split(TRIED_AGAIN).length - 1, said()).toBe(1)
    expect(everything.includes(agent.keyA), 'the out file holds key A').toBe(false)
    expect(everything.includes(agent.keyB), 'the out file holds key B').toBe(false)
    expect(everything.includes('=== waiter ended'), said()).toBe(false)
  }, 120_000)

  it('case 2: keeps the text it last read when the env file cannot be read, and says so once', async () => {
    const dir = mkdtempSync(join(scratch, 'gone-'))
    mkdirSync(join(dir, 'for-agents'), { recursive: true })
    const envFile = join(dir, 'env')
    // A MADE-UP VALUE, NOT A KEY: the stub never reaches an office.
    const madeUp = 'a-made-up-value-for-the-stub'
    writeFileSync(envFile, `MOLE_AGENT_KEY=${madeUp}\n`, { mode: 0o600 })
    writeFileSync(
      join(dir, 'for-agents', 'hold-the-handle.mjs'),
      `import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'attempts')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))
appendFileSync(join(here, 'had-the-value'), String(process.env.MOLE_AGENT_KEY === ${JSON.stringify(madeUp)}) + '\\n')
rmSync(${JSON.stringify(envFile)}, { force: true })
const ids = ['X', 'Y', 'Z']
process.stdout.write(n < ids.length ? 'exiting: delivered ' + ids[n] + '\\n' : 'exiting: stopped\\n')
`,
    )
    const out = join(dir, 'waiter.out')
    const child = spawn('bash', [WAITER, 'keeper', 'the-session', WORKSPACE, out, envFile], {
      detached: true,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: join(dir, 'home'),
        MOLE_OFFICE_CHECKOUT: dir,
        MOLE_OFFICE_API: 'http://127.0.0.1:9',
        MOLE_OFFICE_WORKSPACE: WORKSPACE,
        MOLE_OFFICE_SESSION: 'the-session',
        MOLE_OFFICE_AGENT: 'keeper',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    waiters.push(child)
    const code = await new Promise<number>((go) => child.on('exit', (c) => go(c ?? -1)))
    const written = readFileSync(out, 'utf8')
    expect(code, written).toBe(0)
    // FOUR RUNS: the first read the file, the other three found it gone and kept what was read.
    expect(readFileSync(join(dir, 'for-agents', 'had-the-value'), 'utf8')).toBe('true\ntrue\ntrue\ntrue\n')
    // THE OUT FILE SAYS SO ONCE, names the file, and holds no part of what the file held.
    const line = `=== waiter: could not read the env file ${envFile}; the tool runs with the text last read from it (`
    expect(written.split(line).length - 1, written).toBe(1)
    expect(written.includes(madeUp), 'the out file holds what the env file held').toBe(false)
  }, 60_000)

  /**
   * Run the real waiter over a stub hold tool that ends every run with a refusal. On its first run
   * the stub writes `firstRunWrites` into the env file, when it is given. The stub writes down only
   * whether the MOLE_AGENT_KEY it was given is the first or the second made-up value.
   */
  async function aWaiterOverAStubThatRefuses(firstRunWrites: string | null): Promise<{ attempts: number; values: string; written: string; code: number }> {
    const dir = mkdtempSync(join(scratch, 'refused-'))
    mkdirSync(join(dir, 'for-agents'), { recursive: true })
    const envFile = join(dir, 'env')
    writeFileSync(envFile, 'MOLE_AGENT_KEY=first-made-up-value\n', { mode: 0o600 })
    writeFileSync(
      join(dir, 'for-agents', 'hold-the-handle.mjs'),
      `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'attempts')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))
const value = process.env.MOLE_AGENT_KEY
appendFileSync(join(here, 'values'), (value === 'first-made-up-value' ? 'first' : value === 'second-made-up-value' ? 'second' : 'other') + '\\n')
const writes = ${JSON.stringify(firstRunWrites)}
if (n === 0 && writes !== null) writeFileSync(${JSON.stringify(envFile)}, writes)
process.stdout.write('exiting: refused: a made-up refusal\\n')
`,
    )
    const out = join(dir, 'waiter.out')
    const child = spawn('bash', [WAITER, 'keeper', 'the-session', WORKSPACE, out, envFile], {
      detached: true,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: join(dir, 'home'),
        MOLE_OFFICE_CHECKOUT: dir,
        MOLE_OFFICE_API: 'http://127.0.0.1:9',
        MOLE_OFFICE_WORKSPACE: WORKSPACE,
        MOLE_OFFICE_SESSION: 'the-session',
        MOLE_OFFICE_AGENT: 'keeper',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    waiters.push(child)
    const code = await new Promise<number>((go) => child.on('exit', (c) => go(c ?? -1)))
    return {
      attempts: Number(readFileSync(join(dir, 'for-agents', 'attempts'), 'utf8')),
      values: readFileSync(join(dir, 'for-agents', 'values'), 'utf8'),
      written: readFileSync(out, 'utf8'),
      code,
    }
  }

  it('case 4: a refusal with an unchanged env file stops the waiter after one run', async () => {
    const run = await aWaiterOverAStubThatRefuses(null)
    expect(run.code, run.written).toBe(0)
    expect(run.attempts, run.written).toBe(1)
    expect(run.written.includes(TRIED_AGAIN), run.written).toBe(false)
    expect(run.written.trimEnd().split('\n').pop()?.startsWith('=== waiter ended'), run.written).toBe(true)
  }, 60_000)

  it('case 4: a refusal after the env file changed is tried again once, and a second refusal with the same file stops it', async () => {
    const run = await aWaiterOverAStubThatRefuses('MOLE_AGENT_KEY=second-made-up-value\n')
    expect(run.code, run.written).toBe(0)
    expect(run.attempts, run.written).toBe(2)
    expect(run.values).toBe('first\nsecond\n')
    expect(run.written.split(TRIED_AGAIN).length - 1, run.written).toBe(1)
    expect(run.written.includes('made-up-value'), 'the out file holds what the env file held').toBe(false)
    expect(run.written.trimEnd().split('\n').pop()?.startsWith('=== waiter ended'), run.written).toBe(true)
  }, 60_000)
})
