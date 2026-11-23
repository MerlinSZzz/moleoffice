// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A secretary's own key opens an agent and reads the office terminal list, agent pane, steps,
 * way back and the stream of an agent's terminal. Manual terminal reads and every other terminal
 * mutation keep their guards. Synthetic agents and a stand-in program use a real scratch office,
 * holder and run key; the program claims its handle without printing its key. The machine probe
 * supplies real request provenance for the sandbox cases, rather than a fabricated Actor stamp.
 */
import type { FastifyInstance } from 'fastify'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aPlace, groups, readTheStream, startAHolder, stopEverything, until, type Place } from './terminal-holder-stand.ts'

let t: TestDb
let app: FastifyInstance
let place: Place
let api = ''
let agentTerminal = ''
let agentSession = ''
let manualTerminal = ''
let targetId = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()
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
const open = (headers: Record<string, string>, agent = 'terminal-reader-target', more: Record<string, unknown> = {}) => call('POST', '/api/terminals/agents', headers, { agent, ...more })
/** Each successful opening case starts after the preceding opening has ended. */
const openForTheSecretary = () => open(as('terminal-reader-secretary'), 'terminal-reader-open-target')
async function closeAfterTheCase(opened: { body: Record<string, unknown> }) {
  const terminal = opened.body['terminal'] as TerminalReading
  const session = String(opened.body['session'])
  await readTheStream(api, terminal.id, person, events => events.some(e => JSON.stringify(e.data).includes('HANDLE HOLD ')))
  expect((await call('POST', `/api/terminals/${terminal.id}/close`, person, {})).status).toBe(200)
  await until(() => t.api.getRecord(session)!.data['state'], state => state !== 'running')
}
const reads = [
  '/api/terminals',
  '/api/terminals/agents/terminal-reader-target/pane',
  '/api/terminals/agents/terminal-reader-target/way-back',
  '/api/terminals/agents/terminal-reader-target/steps',
]
function keyRow(session: string) {
  const extra = t.api.getRecord(session)!.data['extra'] as { runKeyId: string }
  return t.client.sqlite.prepare('SELECT whose_id, mint_proved_by, revoked_at, last_used_at FROM held_keys WHERE id = ?').get(extra.runKeyId) as {
    whose_id: string; mint_proved_by: string; revoked_at: string | null; last_used_at: string | null
  }
}

beforeAll(async () => {
  t = await freshDb()
  const made = aPlace('reader')
  env('HOME', made.home)
  env('XDG_CONFIG_HOME', made.config)
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  const program = `#!${process.execPath}
const key = process.env.MOLE_AGENT_KEY
const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': process.env.MOLE_OFFICE_AGENT, 'x-mole-office-session': process.env.MOLE_OFFICE_SESSION, ...(key ? { 'x-mole-office-key': key } : {}) }
;(async () => {
  const result = await fetch(process.env.MOLE_OFFICE_API + '/api/handles/' + process.env.MOLE_OFFICE_AGENT + '/hold', { method: 'POST', headers, body: JSON.stringify({ session: process.env.MOLE_OFFICE_SESSION, runtime: 'claude-code' }) })
  process.stdout.write('HANDLE HOLD ' + result.status + '\\r\\n')
})().catch(() => process.stdout.write('HANDLE HOLD FAILED\\r\\n'))
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
  for (const [handle, role] of [['terminal-reader-secretary', 'secretary'], ['terminal-reader-other', 'secretary'], ['terminal-reader-supervisor', 'supervisor'], ['terminal-reader-worker', 'worker'], ['terminal-reader-target', 'worker'], ['terminal-reader-open-target', 'worker'], ['terminal-reader-key-target', 'worker'], ['terminal-reader-no-folder', 'worker']] as const) {
    const registered = await call('POST', '/api/agents/started', person, { handle, name: handle, role, runtime: 'claude-code' })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    keys.set(handle, String((registered.body['whatToGiveIt'] as { key: string }).key))
    ids.set(handle, String((registered.body['agent'] as { id: string }).id))
  }
  targetId = ids.get('terminal-reader-target')!
  const startFolder = join(place.dir, 'work')
  mkdirSync(startFolder)
  for (const id of [targetId, ids.get('terminal-reader-open-target')!, ids.get('terminal-reader-key-target')!]) expect((await call('POST', `/api/participants/agent/${id}/start-folder`, person, { startFolder, because: 'A synthetic agent start folder.' })).status).toBe(200)
  const opened = await open(person)
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  agentTerminal = (opened.body['terminal'] as TerminalReading).id
  agentSession = String(opened.body['session'])
  const manual = await call('POST', '/api/terminals', person, { folder: place.dir, command: '/bin/sh' })
  expect(manual.status).toBe(201)
  manualTerminal = (manual.body['terminal'] as TerminalReading).id
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

describe('the secretary uses its own key at agent terminal doors', () => {
  it('finds the newest run in the office holder and reads its existing stream without a tmux view', async () => {
    const found = await call('GET', reads[1]!, as('terminal-reader-secretary'))
    expect(found).toMatchObject({ status: 200, body: { state: 'shown', run: { id: agentSession }, pane: null, view: { id: agentTerminal } } })
    const shown = await call('POST', reads[1]!, person, {})
    expect(shown).toMatchObject({ status: 200, body: { opened: false, pane: null, view: { id: agentTerminal } } })
    const read = await readTheStream(api, agentTerminal, as('terminal-reader-secretary'))
    expect(read.status, read.refusal).toBe(200)
    expect(read.events[0]?.event).toBe('screen')
  })

  it('does not show an older held terminal as the screen of a newer run', async () => {
    const newer = t.api.createRecord({ kind: 'session', workspaceId: DEFAULT_WORKSPACE, title: 'A newer synthetic run', data: { state: 'running', servingAgent: 'terminal-reader-target', servingAgentId: targetId, runtime: 'claude-code', sandbox: { folder: place.dir } }, actor: { type: 'human', id: THE_PERSON } })
    // The timestamps have one-second precision. Give the newer fixture a strict ordering within this scratch database.
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2099-01-01 00:00:00', newer.id)
    try {
      const found = await call('GET', reads[1]!, person)
      expect(found).toMatchObject({ status: 200, body: { state: 'sandbox', run: { id: newer.id }, view: null } })
      expect(JSON.stringify(found.body)).not.toContain(agentTerminal)
    } finally { t.client.sqlite.prepare('UPDATE records SET deleted_at = created_at WHERE id = ?').run(newer.id) }
  })

  it('does not accept a held-screen binding from a different holder generation', async () => {
    const session = agentSession
    const row = t.api.getRecord(session)!
    const data = structuredClone(row.data)
    const extra = data['extra'] as { inATerminal: { holder: { pid: number } } }
    extra.inATerminal.holder.pid = -1
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), session)
    try {
      const found = await call('GET', reads[1]!, person)
      expect(found.body['view']).toBeNull()
    } finally { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(row.data), session) }
  })

  it('lets a secretary close its own agent terminal and records that secretary as the closer', async () => {
    const opened = await openForTheSecretary()
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const terminal = opened.body['terminal'] as TerminalReading
    const session = String(opened.body['session'])
    const closed = await call('POST', `/api/terminals/${terminal.id}/close`, as('terminal-reader-secretary'), {})
    expect(closed).toMatchObject({ status: 200, body: { closed: terminal.id } })
    await until(() => t.api.getRecord(session)!.data['state'], state => state !== 'running')
    const data = t.api.getRecord(session)!.data
    expect(data['closedHow']).toBe('agent-said')
    expect(data['closedBecause']).toContain('terminal-reader-secretary')
    expect(data['closedBecause']).not.toContain('The person closed')
    expect(keyRow(session).revoked_at).not.toBeNull()
  })

  for (const handle of ['terminal-reader-other', 'terminal-reader-supervisor', 'terminal-reader-worker']) it(`refuses ${handle} closing another secretary's agent terminal`, async () => {
    const opened = await openForTheSecretary()
    const terminal = opened.body['terminal'] as TerminalReading
    expect(await call('POST', `/api/terminals/${terminal.id}/close`, as(handle), {})).toMatchObject({ status: 403, body: { code: 'terminalsOnlyThePerson' } })
    const listed = await call('GET', '/api/terminals', person)
    expect((listed.body['terminals'] as TerminalReading[]).some(one => one.id === terminal.id)).toBe(true)
    await closeAfterTheCase(opened)
  })

  it('keeps the person-opened agent terminal and a manual terminal from the secretary', async () => {
    for (const id of [agentTerminal, manualTerminal]) expect(await call('POST', `/api/terminals/${id}/close`, as('terminal-reader-secretary'), {})).toMatchObject({ status: 403 })
  })

  it('opens in the recorded folder and attributes both terminal and run to the secretary', async () => {
    const opened = await openForTheSecretary()
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    expect((opened.body['terminal'] as TerminalReading).who).toEqual({ kind: 'agent', id: ids.get('terminal-reader-secretary') })
    const record = t.api.getRecord(String(opened.body['session']))!
    expect((record.data['extra'] as { openedBy: unknown }).openedBy).toEqual({ type: 'agent', id: 'terminal-reader-secretary' })
    expect(record.data['doing']).toContain('terminal-reader-secretary')
    expect(record.data['doing']).not.toContain('opened by the person')
    expect((opened.body['terminal'] as TerminalReading).folder).toBe(join(place.dir, 'work'))
    await closeAfterTheCase(opened)
  })

  it('mints a starter-proved run key that really holds its handle, leaks no key, and revokes it at terminal close', async () => {
    const opened = await open(as('terminal-reader-secretary'), 'terminal-reader-key-target')
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    expect(opened.body['key']).toMatchObject({ given: true })
    const terminal = opened.body['terminal'] as TerminalReading
    const session = String(opened.body['session'])
    expect(terminal.envNames).toContain('MOLE_AGENT_KEY')
    const read = await readTheStream(api, terminal.id, person, events => events.some(e => JSON.stringify(e.data).includes('HANDLE HOLD ')), 15_000)
    expect(JSON.stringify(read.events)).toContain('HANDLE HOLD 201')
    expect(keyRow(session)).toMatchObject({ whose_id: ids.get('terminal-reader-key-target'), mint_proved_by: 'a-proved-agents-key', revoked_at: null, last_used_at: expect.any(String) })
    const held = await call('GET', `/api/handles/terminal-reader-key-target`, person)
    expect(JSON.stringify(held.body)).toContain(session)
    expect(JSON.stringify([opened.body, read.events, held.body])).not.toMatch(/[a-f0-9]{64}/)
    expect((await call('POST', `/api/terminals/${terminal.id}/close`, person, {})).status).toBe(200)
    await until(() => keyRow(session).revoked_at, value => value !== null)
    expect(keyRow(session).revoked_at).not.toBeNull()
  }, 60_000)

  it('keeps an unproved secretary key from minting a proved run key', async () => {
    const secretaryId = ids.get('terminal-reader-secretary')!
    const rows = t.client.sqlite.prepare('SELECT id, mint_proved_by FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL').all(secretaryId) as { id: string; mint_proved_by: string | null }[]
    t.client.sqlite.prepare("UPDATE held_keys SET mint_proved_by = 'no-key' WHERE whose_id = ? AND revoked_at IS NULL").run(secretaryId)
    try {
      const opened = await openForTheSecretary()
      expect(opened.status, JSON.stringify(opened.body)).toBe(201)
      expect(opened.body['key']).toMatchObject({ given: false })
      expect((opened.body['terminal'] as TerminalReading).envNames).not.toContain('MOLE_AGENT_KEY')
      await closeAfterTheCase(opened)
    } finally {
      for (const row of rows) t.client.sqlite.prepare('UPDATE held_keys SET mint_proved_by = ? WHERE id = ?').run(row.mint_proved_by, row.id)
    }
  })

  for (const url of reads) it(`reads ${url} without a grant`, async () => {
    const before = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM presses_for_the_person').get()
    const read = await call('GET', url, as('terminal-reader-secretary'))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(JSON.stringify(read.body)).not.toMatch(/[a-f0-9]{64}/)
    expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM presses_for_the_person').get()).toEqual(before)
  })

  it('reads the stream of the bound agent terminal', async () => {
    const read = await readTheStream(api, agentTerminal, as('terminal-reader-secretary'))
    expect(read.status, read.refusal).toBe(200)
    expect(read.events[0]?.event).toBe('screen')
  })

  for (const handle of ['terminal-reader-supervisor', 'terminal-reader-worker']) it(`refuses ${handle} at each door`, async () => {
    for (const url of reads) expect((await call('GET', url, as(handle)))).toMatchObject({ status: 403, body: { code: 'terminalsOnlyThePerson' } })
    expect(await open(as(handle))).toMatchObject({ status: 403, body: { code: 'terminalsOnlyThePerson' } })
    const stream = await readTheStream(api, agentTerminal, as(handle))
    expect(stream.status, stream.refusal).toBe(403)
  })

  it('refuses a secretary name with no key at each door', async () => {
    const named = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'terminal-reader-secretary' }
    for (const url of reads) expect((await call('GET', url, named)).status).toBe(403)
    expect((await open(named)).status).toBe(403)
    expect((await readTheStream(api, agentTerminal, named)).status).toBe(403)
    expect((await call('POST', `/api/terminals/${agentTerminal}/close`, named, {})).status).toBe(403)
  })

  it('keeps manual reads, typing and the other terminal mutations guarded', async () => {
    const secretary = as('terminal-reader-secretary')
    expect((await readTheStream(api, manualTerminal, secretary)).status).toBe(403)
    for (const [url, body] of [
      [`/api/terminals/${agentTerminal}/input`, { line: 'echo forbidden' }],
      [`/api/terminals/${agentTerminal}/resize`, { cols: 80, rows: 25 }],
      [`/api/terminals/${agentTerminal}/close`, {}],
      ['/api/terminals/agents/terminal-reader-target/pane', {}],
      ['/api/terminals/agents/terminal-reader-target/way-back', { session: 'no-run' }],
    ] as const) expect((await call('POST', url, secretary, body)).status).toBe(403)
  })

  // WITH NO START FOLDER ONLY "resume" IS REFUSED: since wave 13s round 205 the office makes an agent with none a folder of
  // its own and opens it there (tests/an-agent-with-no-start-folder-opens-in-its-own-folder.test.ts).
  it('refuses a resume with no start folder, and a vanished start folder, without a fallback', async () => {
    const secretary = as('terminal-reader-secretary')
    expect(await open(secretary, 'terminal-reader-no-folder', { resume: true })).toMatchObject({ status: 409, body: { code: 'terminalAgentNoStartFolder' } })
    const gone = join(place.dir, 'gone')
    mkdirSync(gone)
    expect((await call('POST', '/api/participants/agent/terminal-reader-no-folder/start-folder', person, { startFolder: gone, because: 'A folder this test removes.' })).status).toBe(200)
    rmSync(gone, { recursive: true })
    expect((await open(secretary, 'terminal-reader-no-folder')).status).toBe(409)
  })

  it('refuses sandbox provenance at every new door, including the live stream', async () => {
    const probe = Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE
    Object.assign(probe, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: true }) })
    resources.useOsProbe(probe)
    try {
      for (const url of [...reads, `/api/terminals/${agentTerminal}/stream`, '/api/terminals/agents', `/api/terminals/${agentTerminal}/close`]) {
        const isOpen = url === '/api/terminals/agents'
        const isClose = url.endsWith('/close')
        const reply = await fetch(api + url, { method: isOpen || isClose ? 'POST' : 'GET', headers: { ...as('terminal-reader-secretary'), connection: 'close', 'content-type': 'application/json' }, ...(isOpen || isClose ? { body: JSON.stringify(isOpen ? { agent: 'terminal-reader-target' } : {}) } : {}), signal: AbortSignal.timeout(5000) })
        expect(reply.status, url).toBe(403)
        expect(await reply.json()).toMatchObject({ code: 'terminalsOnlyThePerson' })
      }
    } finally {
      resources.useOsProbe(resources.LINUX_PROBE)
    }
    // The same socket route with this computer's provenance proves the positive side too.
    const probeHere = Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE
    Object.assign(probeHere, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: false }) })
    resources.useOsProbe(probeHere)
    try {
      const reply = await fetch(api + reads[0], { headers: { ...as('terminal-reader-secretary'), connection: 'close' } })
      expect(reply.status).toBe(200)
    } finally { resources.useOsProbe(resources.LINUX_PROBE) }
  }, 60_000)
})
