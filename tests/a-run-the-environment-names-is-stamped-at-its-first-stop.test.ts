// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THE ENVIRONMENT NAMES IS STAMPED, WITH ITS RESUME COMMAND, AT THE FIRST STOP AFTER ITS TRANSCRIPT EXISTS
 * (wave 13u round 109, the owner's pilot of an agent in one of the office's own panes).
 *
 * The office files an agent's run before it starts the program in its pane, and names that run in the program's
 * environment. A fresh conversation has no transcript at its start, so the start writes no stamp. The stop and the end
 * wrote only the usage receipt on such a run, so its stamp, and with it the command that resumes it, waited for a
 * compaction, and the profile showed no resume line.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A run started before its transcript existed is stamped at its first stop, with the command, worked out by the
 *    way-back rule (`theClaudeWayBack` in src/config/the-way-back.mjs) from the folder and the conversation id.
 * 2. The end stamps it the same way when no stop did.
 * 3. A stop after the stamp makes no office call a stop did not make before: two reads of the run, and no write.
 * 4. A run that is over by the stop is never stamped.
 * 5. A run that names another conversation is left alone.
 *
 * Cases 3 to 5 pass on the hook from before the change too, since it never stamped at a stop. Each is proved by a
 * mutation of its own guard, named in the commit that adds this file.
 *
 * THE AGENT IN THE PANE HOLDS A KEY OF ITS OWN, from the door that registers it, and every run of the hook is given
 * it as MOLE_AGENT_KEY, as the office's own pane gives its agent one (src/server/lib/terminal-agents.ts). A session
 * that names an agent and holds no key of it sends the name alone, and the office lets no name alone change a run,
 * so the stamps these cases read would not be written without the key.
 *
 * It runs the real hook, as Claude Code runs it and with Node's type stripping off, against a listening server on a
 * throwaway database. Every name, folder and value is made up.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theClaudeWayBack } from '../src/config/the-way-back.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const HANDLE = 'an-agent-in-a-pane'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string
/** Every request the server was sent, as its method and path, in order. */
let calls: string[] = []
const notesWritten: string[] = []
/** The key the office gave HANDLE when it was registered. Every run of the hook is given it. */
let agentsKey = ''

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  calls = []
  server.app.addHook('onRequest', async (request) => {
    calls.push(`${request.method} ${request.url}`)
  })
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-first-stop-'))
  mkdirSync(join(scratch, 'home'))
  const reply = await server.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker' } })
  expect(reply.statusCode, reply.body).toBe(201)
  agentsKey = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(agentsKey, 'the registration gave the agent no key').not.toBe('')
}, 60_000)

afterEach(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  for (const name of notesWritten.splice(0)) rmSync(join(CHECKOUT, '.logs', name), { force: true })
})

/** A conversation id, as Claude Code gives one; any note the hook writes for it is removed after the case. */
function aConversation(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  notesWritten.push(`session-${id}.json`)
  return id
}

function aTranscript(name: string): string {
  const path = join(scratch, name)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/** A running run of the agent, filed by the person as the office files one for a pane: before the program starts. */
async function aRun(data: Record<string, unknown>): Promise<string> {
  const made = await server.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'session', title: 'a run of the agent in a pane', data: { state: 'running', runtime: 'claude-code', servingAgent: HANDLE, workingDirectory: scratch, ...data } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

function theDataOf(id: string): Record<string, any> {
  const one = t.api.getRecord(id)
  expect(one, `record ${id} is not there`).not.toBeNull()
  return one!.data as Record<string, any>
}

/**
 * Run the hook as Claude Code runs it, with type stripping off, for the run its environment names, and hand back what
 * it printed. The agent's own key goes as MOLE_AGENT_KEY. HOME, TMUX_PANE, any other key, any key file and the office
 * tool's configuration are never inherited.
 */
async function theHook(mode: 'start' | 'stop' | 'end', payload: Record<string, unknown>, run: string): Promise<{ out: string; err: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: join(scratch, 'home'),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: HANDLE,
    MOLE_AGENT_KEY: agentsKey,
  }
  for (const name of ['TMUX_PANE', 'CLAUDE_PID', 'MOLE_AGENT_KEY_FILE', 'SANDBOX_DIR', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
  env['MOLE_OFFICE_SESSION'] = run
  const child: ChildProcess = spawn(process.execPath, ['--no-experimental-strip-types', HOOK, mode], { env })
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk) => (out += String(chunk)))
  child.stderr!.on('data', (chunk) => (err += String(chunk)))
  const ended = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  child.stdin!.end(JSON.stringify(payload))
  const code = await ended
  expect(code, `the hook exited ${String(code)}: ${err}`).toBe(0)
  expect(err, 'the hook could not load a file with type stripping off').not.toContain('ERR_UNKNOWN_FILE_EXTENSION')
  return { out, err }
}

/** The calls one run of the hook made, from the requests the server was sent while it ran. */
async function theCallsOf(run: () => Promise<unknown>): Promise<string[]> {
  const from = calls.length
  await run()
  return calls.slice(from)
}

describe('the stop stamps a run the environment names', () => {
  it('1: a run started before its transcript existed is stamped, with its command, at its first stop', async () => {
    const id = aConversation()
    const transcript = join(scratch, 'fresh.jsonl')
    const run = await aRun({ providerSession: id })
    await theHook('start', { session_id: id, transcript_path: transcript, cwd: scratch, source: 'startup' }, run)
    expect(theDataOf(run)['extra']?.['discovered'], 'the start stamped a run whose transcript did not exist').toBeUndefined()

    writeFileSync(transcript, '{"type":"user"}\n', 'utf8')
    const { err } = await theHook('stop', { session_id: id, transcript_path: transcript, cwd: scratch }, run)

    const stamp = theDataOf(run)['extra']?.['discovered']
    expect(stamp, `the stop wrote no stamp: ${err}`).toMatchObject({ tool: 'claude-code', externalId: id, logPath: transcript })
    expect(stamp?.['resumeCommand'], 'the stamp carries no resume command').toBe(theClaudeWayBack({ folder: scratch, sessionId: id }))
  }, 60_000)

  it('2: the end stamps it the same way when no stop did', async () => {
    const id = aConversation()
    const transcript = aTranscript('ended.jsonl')
    const run = await aRun({ providerSession: id })
    const { err } = await theHook('end', { session_id: id, transcript_path: transcript, cwd: scratch, reason: 'other' }, run)
    const stamp = theDataOf(run)['extra']?.['discovered']
    expect(stamp, `the end wrote no stamp: ${err}`).toMatchObject({ externalId: id, resumeCommand: theClaudeWayBack({ folder: scratch, sessionId: id }) })
  }, 60_000)

  it('3: a stop after the stamp makes no office call a stop did not make before', async () => {
    const id = aConversation()
    const transcript = aTranscript('stamped.jsonl')
    const run = await aRun({ providerSession: id })
    await theHook('stop', { session_id: id, transcript_path: transcript, cwd: scratch }, run)
    expect(theDataOf(run)['extra']?.['discovered']?.['externalId'], 'the first stop did not stamp the run').toBe(id)

    const ofTheRun = (call: string): boolean => call.startsWith(`GET /api/records/${run}`)
    for (const which of ['second', 'third']) {
      const made = await theCallsOf(() => theHook('stop', { session_id: id, transcript_path: transcript, cwd: scratch }, run))
      const writes = made.filter((call) => !call.startsWith('GET '))
      expect(writes, `the ${which} stop wrote: ${made.join(', ')}`).toEqual([])
      expect(made.filter(ofTheRun), `the ${which} stop read the run more often than the receipt needs: ${made.join(', ')}`).toHaveLength(2)
    }
  }, 60_000)

  it('4: a run that is over by the stop is never stamped', async () => {
    const id = aConversation()
    const transcript = join(scratch, 'over.jsonl')
    const run = await aRun({ providerSession: id })
    await theHook('start', { session_id: id, transcript_path: transcript, cwd: scratch, source: 'startup' }, run)
    const closed = await server.app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_PERSON, payload: { dataPatch: { state: 'crashed' } } })
    expect(closed.statusCode, closed.body).toBe(200)

    writeFileSync(transcript, '{"type":"user"}\n', 'utf8')
    await theHook('stop', { session_id: id, transcript_path: transcript, cwd: scratch }, run)
    expect(theDataOf(run)['extra']?.['discovered'], 'a run that was over was stamped').toBeUndefined()
  }, 60_000)

  it('5: a run that names another conversation is left alone', async () => {
    const id = aConversation()
    const another = aConversation()
    const transcript = aTranscript('another.jsonl')
    const run = await aRun({ providerSession: another })
    const { err } = await theHook('stop', { session_id: id, transcript_path: transcript, cwd: scratch }, run)
    expect(theDataOf(run)['extra']?.['discovered'], 'another conversation\'s run was stamped').toBeUndefined()
    expect(err).toContain('names another conversation')
  }, 60_000)
})
