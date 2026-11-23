// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY STARTED OUTSIDE IS BROUGHT INTO AN OFFICE TERMINAL, WORKS THERE, AND IS BROUGHT BACK OUT.
 * The way back: GET and POST /api/terminals/agents/:agent/way-back; the open press: POST /api/terminals/agents.
 *
 * NO REAL AGENT PROGRAM IS STARTED. A stand-in named claude is first on the scratch server's PATH. A real holder
 * and scratch server use a database in this test's own folder (tests/terminal-holder-stand.ts). The stand-in runs the
 * real hook, waiter and office tool, with a synthetic transcript, and never prints its key, only whether it is set
 * and its length. No model API is called.
 *
 *   1. A hand-started run blocks both the open press and the way-back press; neither files or opens anything.
 *   2. Once the outside process stops, the way back is ready.
 *   3. The person's proved press resumes the same conversation in the recorded folder, with the start's permission
 *      and model flags after the harness switch, and files a keyed run naming the one it brought back.
 *   4. The real SessionStart hook stamps that run under its own run key. In the office terminal the hook has
 *      MOLE_AGENT_KEY in its own environment; in a window started by hand it has none. How a hand-started session
 *      finds its key file remains an open problem. MOLE_OFFICE_PORT and MOLE_OFFICE_DB identify the scratch office
 *      declared by the test, and HOME keeps the hook's session note in the test's own folder.
 *   5. The real waiter holds the secretary's handle on the newly filed run while it runs.
 *   6. The real office tool server answers the stand-in's waiting request with status 200.
 *   7. Closing the terminal ends the new run; its way back retains the conversation, folder and flags for a hand
 *      start, and that outside process again blocks the open press.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLAUDE_CODE_FEATURES_OFF } from '../src/config/harness-features-off.mjs'
import { thePersonsKeyHeader } from './helpers.ts'
import {
  AS_THE_PERSON, aPlace, ask, groups, sleep, startAHolder, startAServer, stopEverything, stopTheGroup,
  theStreamsScreen, until, type Place, type ScratchServer,
} from './terminal-holder-stand.ts'

const HANDLE = 'move-test-secretary'
const TITLE = 'A synthetic hand-started secretary run'
const MODEL = 'test-move-model'
const conversation = randomUUID()
const hook = fileURLToPath(new URL('../for-agents/session-hook.mjs', import.meta.url))
const waiter = fileURLToPath(new URL('../for-agents/hold-the-handle.mjs', import.meta.url))
const officeTool = fileURLToPath(new URL('../tools/office-mcp.mjs', import.meta.url))
let place: Place
let server: ScratchServer
let bin = ''
let folder = ''
let transcript = ''
let personsKey: Record<string, string> = {}
let outsidePid = 0
let outsideRun = ''
let broughtRun = ''
let terminalId = ''
let waiterPid = 0

/** The test sees the result lines and masked diagnostics, never the key. */
function standIn(): string {
  return `#!${process.execPath}
const { spawn } = require('node:child_process')
const { closeSync, openSync, writeFileSync } = require('node:fs')
const { createInterface } = require('node:readline')
// Linux names the synthetic process claude without overwriting the arguments used by the process reader.
writeFileSync('/proc/self/comm', 'claude')
writeFileSync(${JSON.stringify(join(place.dir, 'ready-'))} + process.pid, 'ready')
const out = (line) => process.stdout.write(line + '\\r\\n')
const key = process.env.MOLE_AGENT_KEY
out('ARGS ' + JSON.stringify(process.argv.slice(2)))
out('CWD ' + process.cwd())
out('KEY ' + (key ? 'set' : 'unset') + ' LENGTH ' + (key ? key.length : 0))
out('READY')
// Keep the real hook's test diagnostics inside this fixture without changing the terminal's identity or key.
process.env.A_MOLE_OFFICE_TEST_STARTED_THIS = '1'
process.env.MOLE_HOOK_DETAILS_FOLDER = ${JSON.stringify(join(place.dir, 'hook-details'))}
let held = null
const child = (name, args, stdio, env = process.env) => {
  const made = spawn(process.execPath, args, { detached: true, stdio, env })
  out(name + ' PID ' + made.pid)
  made.on('error', () => out(name + ' ERROR'))
  return made
}
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'hook') {
    const stdout = openSync(${JSON.stringify(join(place.dir, 'hook-stdout'))}, 'w')
    const stderr = openSync(${JSON.stringify(join(place.dir, 'hook-stderr'))}, 'w')
    const env = { ...process.env, MOLE_OFFICE_PORT: new URL(process.env.MOLE_OFFICE_API).port, MOLE_OFFICE_DB: ${JSON.stringify(place.database)}, HOME: ${JSON.stringify(place.env.HOME)} }
    const run = child('HOOK', [${JSON.stringify(hook)}, 'start'], ['pipe', stdout, stderr], env)
    closeSync(stdout)
    closeSync(stderr)
    run.stdin.end(JSON.stringify({ session_id: ${JSON.stringify(conversation)}, transcript_path: ${JSON.stringify(transcript)}, cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'resume' }))
    run.on('close', (code) => out('HOOK EXIT ' + code))
  } else if (line === 'waiter') {
    held = child('WAITER', [${JSON.stringify(waiter)}, '--agent', process.env.MOLE_OFFICE_AGENT, '--session', process.env.MOLE_OFFICE_SESSION], 'ignore')
    held.on('close', (code) => out('WAITER EXIT ' + code))
  } else if (line === 'stop-waiter' && held && held.pid) {
    try { process.kill(-held.pid, 'SIGTERM') } catch {}
  } else if (line === 'clear') {
    // Read and mark the synthetic card notice before starting a waiter that exits on delivery.
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': process.env.MOLE_OFFICE_WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': process.env.MOLE_OFFICE_AGENT, 'x-mole-office-session': process.env.MOLE_OFFICE_SESSION, 'x-mole-office-key': key }
    ;(async () => {
      const waiting = await fetch(process.env.MOLE_OFFICE_API + '/api/handles/' + process.env.MOLE_OFFICE_AGENT + '/waiting', { headers })
      if (!waiting.ok) throw new Error('waiting refused')
      for (const message of (await waiting.json()).waiting) {
        const marked = await fetch(process.env.MOLE_OFFICE_API + '/api/messages/' + message.messageId + '/mark', { method: 'POST', headers, body: JSON.stringify({ mark: 'seen' }) })
        if (!marked.ok) throw new Error('mark refused')
      }
      out('NOTICES CLEARED')
    })().catch(() => out('NOTICES FAILED'))
  } else if (line === 'tool') {
    const run = child('TOOL', [${JSON.stringify(officeTool)}], ['pipe', 'pipe', 'ignore'])
    const lines = createInterface({ input: run.stdout })
    lines.on('line', (text) => {
      try {
        const reply = JSON.parse(text)
        if (reply.id === 1) {
          run.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\\n')
          run.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'office_request', arguments: { method: 'GET', path: '/api/handles/' + process.env.MOLE_OFFICE_AGENT + '/waiting' } } }) + '\\n')
        } else if (reply.id === 2) {
          const parts = reply.result?.content ?? []
          const answer = parts.at(-1)?.text ?? ''
          out('TOOL PARTS ' + parts.length + ' IS ERROR ' + Boolean(reply.result?.isError))
          if (parts.length > 1) out('TOOL FIRST ' + (parts[0]?.text ?? '').slice(0, 200).replace(/[A-Za-z0-9_-]{32,}/g, '<masked>').replace(/[\\r\\n]+/g, ' '))
          out('TOOL STATUS ' + (answer.match(/^\\d+/)?.[0] ?? 'missing'))
          run.stdin.end()
        }
      } catch { out('TOOL BAD REPLY') }
    })
    run.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'synthetic-client', version: '1' } } }) + '\\n')
    run.on('close', (code) => out('TOOL EXIT ' + code))
  }
})
setInterval(() => undefined, 1 << 30)
`
}

function database<T>(read: (db: Database.Database) => T): T {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try { return read(db) } finally { db.close() }
}
function record(id: string): { title: string; data: Record<string, unknown> } {
  const row = database(db => db.prepare('SELECT title, data FROM records WHERE id = ?').get(id)) as { title: string; data: string }
  return { title: row.title, data: JSON.parse(row.data) as Record<string, unknown> }
}
function sessionIds(): string[] {
  return (database(db => db.prepare("SELECT id FROM records WHERE kind = 'session' AND deleted_at IS NULL AND (json_extract(data, '$.servingAgent') = ? OR json_extract(data, '$.servingAgentId') = ?)").all(HANDLE, agentId)) as { id: string }[]).map(row => row.id).sort()
}
function revisions(id: string): { seq: number; actor_type: string; actor_id: string; proved_by: string | null; data: string }[] {
  return database(db => db.prepare('SELECT seq, actor_type, actor_id, proved_by, data FROM revisions WHERE record_id = ? ORDER BY seq').all(id)) as ReturnType<typeof revisions>
}
let agentId = ''
const wayBack = () => ask(server.api, `/api/terminals/agents/${HANDLE}/way-back`)
async function open() {
  const answer = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { agent: HANDLE } })
  const terminal = answer.body['terminal'] as { pid?: number } | undefined
  if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
  return answer
}
async function terminalCount(): Promise<number> {
  const answer = await ask(server.api, '/api/terminals')
  expect(answer.status).toBe(200)
  return (answer.body['terminals'] as unknown[]).length
}
async function startOutside(args: string[]): Promise<number> {
  // A hand start inherits no office identity or key from the test runner.
  const env: Record<string, string | undefined> = { ...process.env, ...place.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_')) delete env[name]
  const child = spawn(join(bin, 'claude'), args, { cwd: folder, env, detached: true, stdio: 'ignore' })
  if (child.pid === undefined) throw new Error('The outside stand-in did not start.')
  groups.add(child.pid)
  const ready = await until(() => existsSync(join(place.dir, `ready-${child.pid}`)), Boolean)
  expect(ready).toBe(true)
  return child.pid
}
async function screenUntil(words: string): Promise<string> {
  const lines = await until(async () => {
    const seen = await theStreamsScreen(server.api, terminalId)
    for (const line of seen) {
      const match = line.match(/(?:HOOK|WAITER|TOOL) PID (\d+)/)
      if (match?.[1] !== undefined) groups.add(Number(match[1]))
    }
    return seen
  }, seen => seen.join('\n').includes(words), 30_000)
  const screen = lines.join('\n')
  expect(screen).toContain(words)
  return screen
}
async function type(line: string): Promise<void> {
  const sent = await ask(server.api, `/api/terminals/${terminalId}/input`, { method: 'POST', body: { data: `${line}\r` } })
  expect(sent.status, JSON.stringify(sent.body)).toBe(200)
}

beforeAll(async () => {
  place = aPlace('secretary-move')
  bin = join(place.dir, 'b')
  folder = join(place.dir, 'work')
  transcript = join(place.dir, 'transcript.jsonl')
  mkdirSync(bin)
  mkdirSync(folder)
  writeFileSync(transcript, '{"type":"user","message":{"role":"user","content":"synthetic"}}\n')
  writeFileSync(join(bin, 'claude'), standIn())
  chmodSync(join(bin, 'claude'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { handle: HANDLE, name: HANDLE, role: 'secretary', runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  agentId = String((registered.body['agent'] as { id: string }).id)
  const startFolder = await ask(server.api, `/api/participants/agent/${agentId}/start-folder`, { method: 'POST', body: { startFolder: folder, because: 'The synthetic secretary works in this test folder.' } })
  expect(startFolder.status, JSON.stringify(startFolder.body)).toBe(200)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('a secretary moves into an office terminal and back out', () => {
  it('1: a hand-started process blocks both presses and opens nothing', async () => {
    const args = ['--session-id', conversation, '--dangerously-skip-permissions', '--model', MODEL]
    outsidePid = await startOutside(args)
    const filed = await ask(server.api, '/api/records', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: {
      kind: 'session', title: TITLE, data: { state: 'running', servingAgent: HANDLE, runtime: 'claude-code', providerSession: conversation, workingDirectory: folder,
        extra: { discovered: { tool: 'claude-code', externalId: conversation, pidCommand: `claude ${args.join(' ')}` } } },
    } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    outsideRun = String((filed.body['record'] as { id: string }).id)
    const before = await terminalCount()
    const sessions = sessionIds()
    const refused = await open()
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body).toMatchObject({ code: 'terminalAgentRunsHere', values: { run: TITLE, pid: outsidePid } })
    const pressed = await ask(server.api, `/api/terminals/agents/${HANDLE}/way-back`, { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { session: outsideRun } })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(409)
    expect(pressed.body['code']).toBe('wayBackStillRunning')
    expect(await terminalCount()).toBe(before)
    expect(sessionIds()).toEqual(sessions)
  }, 60_000)

  it('2: stopping the outside process makes its way back ready', async () => {
    await stopTheGroup(outsidePid)
    const answer = await until(wayBack, one => one.body['press'] === 'ready')
    expect(answer.status).toBe(200)
    expect(answer.body).toMatchObject({ press: 'ready', run: { id: outsideRun } })
  }, 60_000)

  it('3: the person brings the same conversation across with its flags and a run key', async () => {
    const pressed = await ask(server.api, `/api/terminals/agents/${HANDLE}/way-back`, { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { session: outsideRun, cols: 160, rows: 40 } })
    const terminal = pressed.body['terminal'] as { id: string; pid: number; args: string[]; folder: string } | undefined
    if (terminal?.pid !== undefined) groups.add(terminal.pid)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(201)
    expect(pressed.body['key']).toMatchObject({ given: true })
    terminalId = terminal!.id
    broughtRun = String(pressed.body['session'])
    const args = [...CLAUDE_CODE_FEATURES_OFF, '--resume', conversation, '--dangerously-skip-permissions', '--model', MODEL]
    expect(terminal).toMatchObject({ args, folder })
    const screen = await screenUntil('READY')
    expect(screen.replaceAll('\n', '')).toContain(`ARGS ${JSON.stringify(args)}`)
    expect(screen).toContain(`CWD ${folder}`)
    expect(screen).toContain('KEY set LENGTH 64')
    expect(record(broughtRun).data).toMatchObject({ servingAgent: HANDLE, providerSession: conversation, extra: { wayBackOf: outsideRun } })
    expect(broughtRun).not.toBe(outsideRun)
  }, 90_000)

  it('4: the session hook stamps the new run with its own key and attribution', async () => {
    const before = revisions(broughtRun).at(-1)!.seq
    const keyId = String((record(broughtRun).data['extra'] as { runKeyId: string }).runKeyId)
    const keyBefore = database(db => db.prepare('SELECT last_used_at FROM held_keys WHERE id = ?').get(keyId)) as { last_used_at: string | null }
    expect(keyBefore.last_used_at).toBeNull()
    await type('hook')
    await screenUntil('HOOK PID ')
    const screen = await screenUntil('HOOK EXIT ')
    const masked = (name: string) => readFileSync(join(place.dir, name), 'utf8').slice(0, 1500).replace(/[A-Za-z0-9_-]{32,}/g, '<masked>')
    const diagnostics = `Hook stdout: ${masked('hook-stdout')}\nHook stderr: ${masked('hook-stderr')}`
    expect(screen, diagnostics).toContain('HOOK EXIT 0')
    const written = revisions(broughtRun).filter(row => row.seq > before)
    expect(written.some(row => row.actor_type === 'agent' && row.actor_id === HANDLE && row.proved_by === 'an-agent-key' && (JSON.parse(row.data) as { extra?: { discovered?: { externalId?: string; logPath?: string } } }).extra?.discovered?.externalId === conversation), diagnostics).toBe(true)
    expect(record(broughtRun).data, diagnostics).toMatchObject({ extra: { discovered: { externalId: conversation, logPath: transcript }, wayBackOf: outsideRun } })
    const key = database(db => db.prepare('SELECT last_used_at FROM held_keys WHERE id = ?').get(keyId)) as { last_used_at: string | null }
    expect(key.last_used_at, diagnostics).not.toBeNull()
  }, 60_000)

  it('5: its waiter holds the handle on the brought-across run', async () => {
    await type('clear')
    await screenUntil('NOTICES CLEARED')
    await type('waiter')
    const screen = await screenUntil('WAITER PID ')
    waiterPid = Number(screen.match(/WAITER PID (\d+)/)?.[1])
    expect(waiterPid).toBeGreaterThan(0)
    const held = await until(() => ask(server.api, `/api/handles/${HANDLE}`), answer => JSON.stringify(answer.body['answering']).includes(broughtRun), 20_000)
    expect(held.status).toBe(200)
    expect(held.body['answering']).toMatchObject({ hold: { session: broughtRun } })
    await sleep(3000)
    const still = await ask(server.api, `/api/handles/${HANDLE}`)
    expect(JSON.stringify(still.body['answering'])).toContain(broughtRun)
    await type('stop-waiter')
    await screenUntil('WAITER EXIT ')
    await stopTheGroup(waiterPid)
  }, 60_000)

  it('6: its office tool answers a waiting request', async () => {
    await type('tool')
    await screenUntil('TOOL PID ')
    await screenUntil('TOOL STATUS 200')
    await screenUntil('TOOL EXIT 0')
  }, 60_000)

  it('7: closing it offers the same command for a hand start, which blocks open again', async () => {
    const closed = await ask(server.api, `/api/terminals/${terminalId}/close`, { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: {} })
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    const ended = await until(() => record(broughtRun).data['state'], state => state !== 'running')
    expect(ended).not.toBe('running')
    const ready = await until(wayBack, answer => answer.body['press'] === 'ready')
    expect(ready.status).toBe(200)
    const args = ['--resume', conversation, '--dangerously-skip-permissions', '--model', MODEL]
    expect(ready.body).toMatchObject({ press: 'ready', run: { id: broughtRun }, way: { way: 'host', program: 'claude', folder, args, kept: args.slice(2), command: `cd '${folder}' && claude ${args.join(' ')}` } })
    outsidePid = await startOutside(args)
    const refused = await open()
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body).toMatchObject({ code: 'terminalAgentRunsHere', values: { run: record(broughtRun).title, pid: outsidePid } })
  }, 60_000)
})
