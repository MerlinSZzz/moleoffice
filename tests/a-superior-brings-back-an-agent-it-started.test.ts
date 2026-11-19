// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWN SUPERIOR ON THIS COMPUTER BRINGS BACK AN AGENT IT STARTED, to the same conversation, with a run key.
 * Wave 13s round 209: POST /api/terminals/agents/:agent/way-back (src/server/api/terminal-agents.ts,
 * src/server/lib/terminal-agents.ts), and the rule in THE_TERMINAL_PERMISSION (src/server/api/terminals.ts).
 *
 * After the agents have stopped, they come back down the chain, one at a time. The person brings back the secretary.
 * Each superior then brings back, through the office, the agents below it that the work needs. A superior is the
 * agent that started the agent, or one above that agent, as the registry's starters say. No press brings every agent
 * back.
 *
 * NO REAL AGENT PROGRAM IS STARTED. A stand-in named claude is put first on the PATH the server gives its terminals.
 * It prints its arguments, holds its handle with the key its terminal was given, prints the answer, and waits. A real
 * holder and an in-process server run on a fresh database in the test's own folder. The runs are session records the
 * person files, in the shape the session hook files them, each with a made-up conversation of its own.
 *
 *   1. A secretary brings back a worker it started. The stand-in resumes the run's conversation, the new run keeps it,
 *      and the run has a key of its own: made on the secretary's proved key, held by the worker, and good enough to
 *      hold the worker's handle. The run names the secretary as the one who pressed.
 *   2. Down the chain: a supervisor the secretary started brings back a worker it started, and the secretary brings
 *      back another worker that supervisor started.
 *   3. Any other agent is refused 403 with terminalsOnlyThePerson, in words that name who may, and nothing opens: the
 *      secretary for a worker the person started, another secretary, a worker for its sibling, a supervisor for a
 *      worker its own starter started, a worker for itself, a worker for its own starter, and the secretary's name
 *      with no key. The page's word for the refusal says the same rule.
 *   4. A starter that has retired is refused for an agent it started, because its keys ended with it, and nothing
 *      opens.
 *   5. A press from a sandbox is refused with the same refusal, and the same press from this computer opens.
 *   6. The person's own press is unchanged: it brings back a worker no agent started, with a key made on the
 *      person's press, and the run names no agent as the one who pressed.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - api/terminal-agents.ts the way-back press asks only the person or the grant, as before: cases 1, 2 and 5 red.
 *   - lib/terminal-agents.ts a superior is only the agent's own starter, the first of its chain: case 2 red.
 *   - lib/terminal-agents.ts any agent with a key is a superior: case 3 red.
 *   - lib/terminal-agents.ts the superior's run is filed as the person's press: case 1 red at the doing.
 *   - api/participants.ts the retire press leaves the agent's keys live: case 4 red.
 *   - api/terminal-agents.ts the press does not ask where it came from: case 5 red.
 *   - api/terminal-agents.ts the press asks only whether a superior pressed: case 6 red.
 *   - api/terminals.ts THE_TERMINAL_PERMISSION leaves out the superior's sentence: case 3 red at the error; the same
 *     with the English word server.terminalsOnlyThePerson: case 3 red at the page's word.
 */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { CLAUDE_CODE_FEATURES_OFF } from '../src/config/harness-features-off.mjs'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aPlace, groups, readTheStream, startAHolder, stopEverything, type Place } from './terminal-holder-stand.ts'

let t: TestDb
let app: FastifyInstance
let place: Place
let api = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()
/** Each agent's run, and the made-up conversation it was. */
const runs = new Map<string, { session: string; conversation: string }>()
const saved = new Map<string, string | undefined>()
let resources: typeof import('../src/server/lib/resources.ts')
let bound: typeof import('../src/server/lib/bound-address.ts')
const person: Record<string, string> = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const as = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' })

function env(name: string, value: string): void {
  saved.set(name, process.env[name])
  process.env[name] = value
}
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const body = reply.json<Record<string, unknown>>()
  const terminal = body['terminal'] as TerminalReading | undefined
  if (terminal !== undefined) groups.add(terminal.pid)
  return { status: reply.statusCode, body }
}
/** Press the way back to an agent's run. */
const press = (handle: string, headers: Record<string, string>) =>
  call('POST', `/api/terminals/agents/${handle}/way-back`, headers, { session: runs.get(handle)!.session, cols: 160, rows: 40 })
const terminalCount = async () => ((await call('GET', '/api/terminals', person)).body['terminals'] as unknown[]).length
function keyRow(session: string) {
  const extra = t.api.getRecord(session)!.data['extra'] as { runKeyId: string }
  return t.client.sqlite.prepare('SELECT whose_id, mint_proved_by, revoked_at FROM held_keys WHERE id = ?').get(extra.runKeyId) as {
    whose_id: string; mint_proved_by: string; revoked_at: string | null
  }
}
/** The new run a press filed, and what it says. */
function theNewRun(session: string) {
  const data = t.api.getRecord(session)!.data
  return { data, extra: data['extra'] as { wayBackOf?: string; openedBy?: unknown } }
}

/** Register an agent, started by the person or by an agent registered here, and keep its id and key. */
async function started(handle: string, role: string, by: string | null): Promise<void> {
  const registered = await call('POST', '/api/agents/started', by === null ? person : as(by), { handle, name: handle, role, runtime: 'claude-code' })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  keys.set(handle, String((registered.body['whatToGiveIt'] as { key: string }).key))
  ids.set(handle, String((registered.body['agent'] as { id: string }).id))
}

/** A stopped run of an agent, in its own start folder, filed as the session hook files one. */
async function aRun(handle: string): Promise<void> {
  const folder = join(place.dir, handle)
  mkdirSync(folder)
  expect((await call('POST', `/api/participants/agent/${ids.get(handle)!}/start-folder`, person, { startFolder: folder, because: 'A synthetic run works here.' })).status).toBe(200)
  const conversation = randomUUID()
  const filed = t.api.createRecord({
    kind: 'session',
    workspaceId: DEFAULT_WORKSPACE,
    title: `A synthetic run of ${handle}`,
    data: {
      state: 'running',
      servingAgent: handle,
      runtime: 'claude-code',
      providerSession: conversation,
      workingDirectory: folder,
      extra: { discovered: { tool: 'claude-code', externalId: conversation, pidCommand: 'claude' } },
    },
    actor: { type: 'human', id: THE_PERSON },
  })
  runs.set(handle, { session: filed.id, conversation })
}

beforeAll(async () => {
  t = await freshDb()
  const made = aPlace('superior')
  env('HOME', made.home)
  env('XDG_CONFIG_HOME', made.config)
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  const program = `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
out('STAND-IN claude ARGS ' + JSON.stringify(process.argv.slice(2)))
const key = process.env.MOLE_AGENT_KEY
const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': process.env.MOLE_OFFICE_AGENT, 'x-mole-office-session': process.env.MOLE_OFFICE_SESSION, ...(key ? { 'x-mole-office-key': key } : {}) }
;(async () => {
  const result = await fetch(process.env.MOLE_OFFICE_API + '/api/handles/' + process.env.MOLE_OFFICE_AGENT + '/hold', { method: 'POST', headers, body: JSON.stringify({ session: process.env.MOLE_OFFICE_SESSION, runtime: 'claude-code' }) })
  out('HANDLE HOLD ' + result.status)
})().catch(() => out('HANDLE HOLD FAILED'))
setInterval(() => undefined, 1 << 30)
`
  writeFileSync(join(bin, 'claude'), program)
  chmodSync(join(bin, 'claude'), 0o755)
  env('PATH', `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}`)
  await startAHolder(place)
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  resources = await import('../src/server/lib/resources.ts')
  bound = await import('../src/server/lib/bound-address.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  bound.rememberWhatThisProcessBound(app.server)
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  Object.assign(person, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  // THE CHAIN: the person started both secretaries and one worker; the secretary started a supervisor, three workers
  // and a supervisor that retires; the supervisor started three workers, and the one that retires started one.
  for (const [handle, role, by] of [
    ['wbs-secretary', 'secretary', null],
    ['wbs-other-secretary', 'secretary', null],
    ['wbs-persons-worker', 'worker', null],
    ['wbs-worker', 'worker', 'wbs-secretary'],
    ['wbs-sibling', 'worker', 'wbs-secretary'],
    ['wbs-sandboxed', 'worker', 'wbs-secretary'],
    ['wbs-supervisor', 'supervisor', 'wbs-secretary'],
    ['wbs-retiring', 'supervisor', 'wbs-secretary'],
    ['wbs-low-a', 'worker', 'wbs-supervisor'],
    ['wbs-low-b', 'worker', 'wbs-supervisor'],
    ['wbs-low-d', 'worker', 'wbs-supervisor'],
    ['wbs-low-c', 'worker', 'wbs-retiring'],
  ] as const) await started(handle, role, by)
  for (const handle of ['wbs-worker', 'wbs-sibling', 'wbs-sandboxed', 'wbs-supervisor', 'wbs-low-a', 'wbs-low-b', 'wbs-low-c', 'wbs-persons-worker']) await aRun(handle)
}, 120_000)

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  bound?.forgetWhatThisProcessBound()
  t?.close()
  await stopEverything()
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}, 60_000)

describe("an agent's own superior brings back an agent it started", () => {
  it('1: a secretary brings back a worker it started, to the same conversation, with a run key of its own', async () => {
    const pressed = await press('wbs-worker', as('wbs-secretary'))
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(201)
    expect(pressed.body['key']).toMatchObject({ given: true })
    expect(JSON.stringify(pressed.body)).not.toMatch(/[a-f0-9]{64}/)
    const terminal = pressed.body['terminal'] as TerminalReading & { args: string[] }
    const { session: before, conversation } = runs.get('wbs-worker')!
    expect(terminal.args).toEqual([...CLAUDE_CODE_FEATURES_OFF, '--resume', conversation])
    expect(terminal.who).toEqual({ kind: 'agent', id: ids.get('wbs-secretary') })
    expect(terminal.envNames).toContain('MOLE_AGENT_KEY')
    const session = String(pressed.body['session'])
    const { data, extra } = theNewRun(session)
    expect([data['providerSession'], extra.wayBackOf, extra.openedBy]).toEqual([conversation, before, { type: 'agent', id: 'wbs-secretary' }])
    expect(data['doing']).toContain('wbs-secretary')
    expect(keyRow(session)).toMatchObject({ whose_id: ids.get('wbs-worker'), mint_proved_by: 'a-proved-agents-key', revoked_at: null })
    const read = await readTheStream(api, terminal.id, person, (events) => events.some((e) => JSON.stringify(e.data).includes('HANDLE HOLD ')), 15_000)
    expect(JSON.stringify(read.events)).toContain('HANDLE HOLD 201')
  }, 60_000)

  it("2: down the chain: a supervisor brings back its worker, and the secretary brings back a worker its supervisor started", async () => {
    for (const [presser, handle] of [['wbs-supervisor', 'wbs-low-a'], ['wbs-secretary', 'wbs-low-b']] as const) {
      const pressed = await press(handle, as(presser))
      expect(pressed.status, `${presser} for ${handle}: ${JSON.stringify(pressed.body)}`).toBe(201)
      expect(pressed.body['key'], handle).toMatchObject({ given: true })
      const session = String(pressed.body['session'])
      expect((pressed.body['terminal'] as { args: string[] }).args, handle).toEqual([...CLAUDE_CODE_FEATURES_OFF, '--resume', runs.get(handle)!.conversation])
      expect(theNewRun(session).extra.openedBy, handle).toEqual({ type: 'agent', id: presser })
      expect(keyRow(session), handle).toMatchObject({ whose_id: ids.get(handle), mint_proved_by: 'a-proved-agents-key', revoked_at: null })
    }
  }, 60_000)

  it('3: refuses any other agent in words that name who may, and opens nothing', async () => {
    const { A_SUPERIOR_MAY_BRING_ITS_AGENT_BACK } = await import('../src/server/api/terminals.ts')
    const before = await terminalCount()
    const noKey = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'wbs-secretary' }
    for (const [who, headers, handle] of [
      ['the secretary, for a worker the person started', as('wbs-secretary'), 'wbs-persons-worker'],
      ['another secretary', as('wbs-other-secretary'), 'wbs-sibling'],
      ['a worker, for its sibling', as('wbs-sibling'), 'wbs-sandboxed'],
      ['a supervisor, for a worker its own starter started', as('wbs-supervisor'), 'wbs-sibling'],
      ['a worker, for itself', as('wbs-sibling'), 'wbs-sibling'],
      ['a worker, for its own starter', as('wbs-low-d'), 'wbs-supervisor'],
      ["the secretary's name with no key", noKey, 'wbs-sibling'],
    ] as const) {
      const refused = await press(handle, headers)
      expect(refused.status, `${who}: ${JSON.stringify(refused.body)}`).toBe(403)
      expect(refused.body['code'], who).toBe('terminalsOnlyThePerson')
      expect(String(refused.body['error']), who).toContain(A_SUPERIOR_MAY_BRING_ITS_AGENT_BACK)
    }
    expect(await terminalCount()).toBe(before)
    expect(sayInEnglish('server.terminalsOnlyThePerson'), "the page's word").toContain(A_SUPERIOR_MAY_BRING_ITS_AGENT_BACK)
  }, 60_000)

  it('4: refuses a starter that has retired, and opens nothing', async () => {
    const retired = await call('POST', '/api/participants/agent/wbs-retiring/retire', person, { because: 'The test retires a starter.' })
    expect(retired.status, JSON.stringify(retired.body)).toBe(200)
    const before = await terminalCount()
    const refused = await press('wbs-low-c', as('wbs-retiring'))
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body['code']).toBe('terminalsOnlyThePerson')
    expect(await terminalCount()).toBe(before)
  }, 60_000)

  it('5: refuses a press from a sandbox, and opens the same press from this computer', async () => {
    const pressFrom = async (inAnotherContainer: boolean) => {
      const probe = Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE
      Object.assign(probe, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer }) })
      resources.useOsProbe(probe)
      try {
        const reply = await fetch(`${api}/api/terminals/agents/wbs-sandboxed/way-back`, {
          method: 'POST',
          headers: { ...as('wbs-secretary'), connection: 'close', 'content-type': 'application/json' },
          body: JSON.stringify({ session: runs.get('wbs-sandboxed')!.session, cols: 160, rows: 40 }),
          signal: AbortSignal.timeout(15_000),
        })
        const body = (await reply.json()) as Record<string, unknown>
        const terminal = body['terminal'] as TerminalReading | undefined
        if (terminal !== undefined) groups.add(terminal.pid)
        return { status: reply.status, body }
      } finally {
        resources.useOsProbe(resources.LINUX_PROBE)
      }
    }
    const before = await terminalCount()
    const sandboxed = await pressFrom(true)
    expect(sandboxed.status, JSON.stringify(sandboxed.body)).toBe(403)
    expect(sandboxed.body['code']).toBe('terminalsOnlyThePerson')
    expect(await terminalCount()).toBe(before)
    const here = await pressFrom(false)
    expect(here.status, JSON.stringify(here.body)).toBe(201)
    expect(here.body['key']).toMatchObject({ given: true })
  }, 60_000)

  it("6: the person's own press is unchanged", async () => {
    const pressed = await press('wbs-persons-worker', person)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(201)
    expect(pressed.body['key']).toMatchObject({ given: true })
    const session = String(pressed.body['session'])
    const { data, extra } = theNewRun(session)
    expect([data['providerSession'], extra.openedBy]).toEqual([runs.get('wbs-persons-worker')!.conversation, { type: 'human', id: THE_PERSON }])
    expect(String(data['doing'])).not.toContain('wbs-')
    expect(keyRow(session)).toMatchObject({ whose_id: ids.get('wbs-persons-worker'), mint_proved_by: 'the-persons-press', revoked_at: null })
  }, 60_000)
})
