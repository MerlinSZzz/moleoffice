// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING AN AGENT WHOSE RUN STILL RUNS OPENS NOTHING, AND POINTS TO THE WAY BACK.
 * POST /api/terminals/agents (src/server/lib/terminal-agents.ts).
 *
 * No real agent program is started. A stand-in named claude runs in a real scratch holder and server
 * (tests/terminal-holder-stand.ts). The runs have the shape filed by the session hook.
 *
 *   1. A run filed by its agent without a serving agent is refused while an outside process names its
 *      conversation, including on resume. Nothing changes. Once stopped, the way back is ready and open works.
 *   2. A run in an office terminal is refused until that terminal is closed and the run has ended.
 *   3. An unfinished sandbox run without a serving agent is refused until its record is ended.
 *   4. A running run in another project is refused without disclosing its id or title.
 *   5. Every refusal's English and Chinese words hold its values.
 *   6. An older unfinished served run is checked even when a newer run has ended.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
import { zhWave13u } from '../src/shared/words/zh-wave-13u.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, startAServer, stopEverything, stopTheGroup, theStreamsScreen, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { thePersonsKeyHeader } from './helpers.ts'

let place: Place
let server: ScratchServer
let bin: string
let person: Record<string, string>
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const STAND_IN = `#!${process.execPath}
process.stdout.write('STAND-IN READY\\r\\n')
setInterval(() => undefined, 1 << 30)
`

async function register(handle: string): Promise<void> {
  const made = await ask(server.api, '/api/agents/started', { method: 'POST', headers: person, body: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  keys.set(handle, String((made.body['whatToGiveIt'] as { key: string }).key))
  ids.set(handle, String((made.body['agent'] as { id: string }).id))
  if (handle === 'open-sandbox') return
  const folder = join(place.dir, handle)
  mkdirSync(folder)
  const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', headers: person, body: { startFolder: folder, because: 'The test opens this agent here.' } })
  expect(set.status, JSON.stringify(set.body)).toBe(200)
}

/** A run filed with the agent's own key and no serving agent, as its hook files it. */
async function fileRun(handle: string, title: string, data: Record<string, unknown>, project = 'default'): Promise<string> {
  const filed = await ask(server.api, '/api/records', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle)! },
    body: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', ...data } },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

async function open(handle: string, resume = false) {
  const answer = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: person, body: { agent: handle, ...(resume ? { resume: true } : {}) } })
  const terminal = answer.body['terminal'] as { pid?: number } | undefined
  if (terminal?.pid !== undefined) groups.add(terminal.pid)
  return answer
}

function sessions(): unknown[] {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try { return db.prepare("SELECT id, title, data FROM records WHERE kind = 'session' ORDER BY id").all() }
  finally { db.close() }
}
function runData(id: string): Record<string, unknown> {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    return JSON.parse(row.data) as Record<string, unknown>
  } finally { db.close() }
}
async function terminals(): Promise<unknown[]> {
  const answer = await ask(server.api, '/api/terminals', { headers: person })
  expect(answer.status).toBe(200)
  return (answer.body['terminals'] as { id: string }[]).map(one => one.id).sort()
}
async function startOutside(conversation: string): Promise<number> {
  const child = spawn(join(bin, 'claude'), ['--resume', conversation], { detached: true, stdio: 'ignore' })
  if (child.pid === undefined) throw new Error('The stand-in did not start.')
  groups.add(child.pid)
  await once(child, 'spawn')
  return child.pid
}
async function closeOpened(answer: { body: Record<string, unknown> }): Promise<void> {
  const terminal = answer.body['terminal'] as { id: string }
  const id = String(answer.body['session'])
  await until(() => theStreamsScreen(server.api, terminal.id), lines => lines.some(line => line.includes('STAND-IN READY')))
  const closed = await ask(server.api, `/api/terminals/${terminal.id}/close`, { method: 'POST', headers: person, body: {} })
  expect(closed.status, JSON.stringify(closed.body)).toBe(200)
  await until(async () => {
    const record = await ask(server.api, `/api/records/${id}`, { headers: person })
    return (record.body['record'] as { data: { state: string } }).data.state
  }, state => state !== 'running')
}

beforeAll(async () => {
  place = aPlace('no-second-copy')
  bin = join(place.dir, 'b')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), STAND_IN)
  chmodSync(join(bin, 'claude'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  person = { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(dirname(place.database), 'keys.json')) }
  for (const handle of ['open-outside', 'open-held', 'open-sandbox', 'open-elsewhere', 'open-older']) await register(handle)
}, 180_000)
afterAll(stopEverything, 60_000)

describe('opening an agent whose run still runs', () => {
  it('1: refuses a hook-shaped outside run and resume, then opens once the process stops', async () => {
    const handle = 'open-outside', title = 'Outside run', conversation = randomUUID()
    const run = await fileRun(handle, title, { providerSession: conversation, workingDirectory: join(place.dir, handle), extra: { discovered: { tool: 'claude-code', externalId: conversation } } })
    expect(runData(run)['servingAgent']).toBeUndefined()
    expect(runData(run)['servingAgentId']).toBeUndefined()
    const pid = await startOutside(conversation)
    const beforeTerminals = await terminals(), beforeSessions = sessions()
    for (const resume of [false, true]) {
      const refused = await open(handle, resume)
      expect(refused).toMatchObject({ status: 409, body: { code: 'terminalAgentRunsHere', values: { run: title, pid } } })
      expect(String(refused.body['error'])).toContain(run)
      expect(String(refused.body['error'])).toContain(title)
      expect(String(refused.body['error'])).toContain(`/api/terminals/agents/${handle}/way-back`)
      expect(String(refused.body['error'])).toContain(JSON.stringify({ session: run }))
      expect(await terminals()).toEqual(beforeTerminals)
      expect(sessions()).toEqual(beforeSessions)
    }
    await stopTheGroup(pid)
    const back = await ask(server.api, `/api/terminals/agents/${handle}/way-back`, { headers: person })
    expect(back).toMatchObject({ status: 200, body: { press: 'ready', run: { id: run } } })
    const opened = await open(handle)
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    await closeOpened(opened)
  }, 90_000)

  it('2: refuses a second office terminal until the first terminal and run end', async () => {
    const handle = 'open-held'
    const first = await open(handle)
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const terminal = first.body['terminal'] as { id: string }
    const run = String(first.body['session'])
    const record = await ask(server.api, `/api/records/${run}`, { headers: person })
    const title = (record.body['record'] as { title: string }).title
    const beforeTerminals = await terminals(), beforeSessions = sessions()
    const refused = await open(handle)
    expect(refused).toMatchObject({ status: 409, body: { code: 'terminalAgentInTheOfficesTerminal', values: { run: title, terminal: terminal.id } } })
    expect(await terminals()).toEqual(beforeTerminals)
    expect(sessions()).toEqual(beforeSessions)
    await closeOpened(first)
    const again = await open(handle)
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    await closeOpened(again)
  }, 90_000)

  it('3: refuses an unfinished sandbox run without a serving agent until its record ends', async () => {
    const handle = 'open-sandbox', title = 'Sandbox run'
    const run = await fileRun(handle, title, {})
    const sandbox = await ask(server.api, `/api/records/${run}`, { method: 'PATCH', headers: person, body: { dataPatch: { sandbox: { folder: join(place.dir, 'sandbox') } } } })
    expect(sandbox.status, JSON.stringify(sandbox.body)).toBe(200)
    expect(runData(run)['servingAgent']).toBeUndefined()
    expect(runData(run)['servingAgentId']).toBeUndefined()
    const beforeTerminals = await terminals(), beforeSessions = sessions()
    const ownFolder = join(dirname(place.database), 'agents', handle)
    expect(existsSync(ownFolder)).toBe(false)
    const refused = await open(handle)
    expect(refused).toMatchObject({ status: 409, body: { code: 'terminalAgentRunsInASandbox', values: { run: title } } })
    expect(await terminals()).toEqual(beforeTerminals)
    expect(sessions()).toEqual(beforeSessions)
    expect(existsSync(ownFolder)).toBe(false)
    const ended = await ask(server.api, `/api/records/${run}`, { method: 'PATCH', headers: person, body: { dataPatch: { state: 'crashed' } } })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const opened = await open(handle)
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    await closeOpened(opened)
  }, 90_000)

  it('4: names only the other project when a run there still runs', async () => {
    const project = 'other-test-project', projectTitle = 'Other test project'
    const made = await ask(server.api, '/api/workspaces', { method: 'POST', headers: person, body: { id: project, title: projectTitle } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const handle = 'open-elsewhere', title = 'A private test run title', conversation = randomUUID()
    const run = await fileRun(handle, title, { providerSession: conversation }, project)
    const pid = await startOutside(conversation)
    const beforeTerminals = await terminals(), beforeSessions = sessions()
    const refused = await open(handle)
    expect(refused).toMatchObject({ status: 409, body: { code: 'terminalAgentRunsInAnotherProject', values: { project: projectTitle } } })
    expect(JSON.stringify(refused.body)).not.toContain(run)
    expect(JSON.stringify(refused.body)).not.toContain(title)
    expect(await terminals()).toEqual(beforeTerminals)
    expect(sessions()).toEqual(beforeSessions)
    await stopTheGroup(pid)
  }, 90_000)

  it('5: both languages name every value of each refusal', () => {
    const expected = {
      'server.terminalAgentRunsHere': ['run', 'pid'],
      'server.terminalAgentInTheOfficesTerminal': ['run', 'terminal'],
      'server.terminalAgentRunsInASandbox': ['run'],
      'server.terminalAgentRunsInAnotherProject': ['project'],
    } as const
    for (const [key, values] of Object.entries(expected)) {
      for (const words of [enWave13u, zhWave13u]) {
        const sentence = words[key as keyof typeof expected]
        for (const value of values) expect(sentence).toContain(`{${value}}`)
      }
    }
  })

  it('6: checks an older unfinished served run when the newest record has ended', async () => {
    const handle = 'open-older', title = 'Older run', conversation = randomUUID()
    const older = await fileRun(handle, title, { runtime: undefined, servingAgent: handle, servingAgentId: ids.get(handle), extra: { discovered: { externalId: conversation } } })
    const newer = await fileRun(handle, 'Newer ended run', { servingAgent: handle, servingAgentId: ids.get(handle) })
    const ended = await ask(server.api, `/api/records/${newer}`, { method: 'PATCH', headers: person, body: { dataPatch: { state: 'crashed' } } })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const pid = await startOutside(conversation)
    const refused = await open(handle)
    expect(refused).toMatchObject({ status: 409, body: { code: 'terminalAgentRunsHere', values: { run: title, pid } } })
    expect(String(refused.body['error'])).toContain(older)
    await stopTheGroup(pid)
  }, 90_000)
})
