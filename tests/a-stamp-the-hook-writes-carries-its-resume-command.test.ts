// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAMP THE SESSION HOOK WRITES CARRIES THE COMMAND THAT RESUMES ITS CONVERSATION (item 38, wave 13u round 109).
 *
 * On 27 October 2026 no long-running session's discovery stamp written since late September carried `resumeCommand`,
 * so no profile showed a resume line, and the owner had to ask for the command. The profile's line reads the command
 * from the stamp (`theOriginOf` in src/server/lib/session-origins.ts), and only the discovery sweep wrote it there. The
 * session hook, which writes nearly every stamp now, never did.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A start that files a record writes the command on the stamp, worked out by the way-back rule
 *    (`theClaudeWayBack` in src/config/the-way-back.mjs): the folder and the conversation id.
 * 2. A start on a run already stamped in today's shape, with its process facts and no command, adds the command and
 *    keeps every other field of the stamp and of `extra` as it was. The profile's origins line, read through the door
 *    the profile reads, then shows the command.
 * 3. A compaction on such a run does the same.
 * 4. A command holding a piece shaped like a key, or the value of a secret the hook's process was given, is not
 *    written. The stamp is written without it, the hook says so in one line and exits 0.
 *
 * EVERY RUN OF THE HOOK HERE HAS NODE'S TYPE STRIPPING OFF. Claude Code starts the hook with the system Node, which is
 * 18 on the owner's machine and strips no types, so a TypeScript import anywhere on the stamp's path would make the
 * hook throw there. This machine has no Node 18, and Node 22 with stripping off refuses a TypeScript import the same way.
 *
 * It runs the real hook, as Claude Code runs it, against a listening server on a throwaway database. Every name, folder
 * and value is made up.
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
const HANDLE = 'a-returning-agent'
const SECRETARY = 'a-proposing-secretary'

/** A secret the hook's process is given, under a name that says it is one. Made up, and not key-shaped on purpose. */
const PLANTED_NAME = 'MOLE_TEST_PLANTED_API_KEY'
const PLANTED_VALUE = 'zq-planted-secret-value-17'

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
const notesWritten: string[] = []
const agents = new Map<string, { id: string; key: string }>()

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-resume-'))
  mkdirSync(join(scratch, 'home'))
  for (const [handle, role] of [[HANDLE, 'worker'], [SECRETARY, 'secretary']] as const) {
    const reply = await server.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
    expect(reply.statusCode, reply.body).toBe(201)
    const said = reply.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    agents.set(handle, { id: said.agent.id, key: said.whatToGiveIt.key })
  }
}, 60_000)

afterEach(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  for (const name of notesWritten.splice(0)) rmSync(join(CHECKOUT, '.logs', name), { force: true })
})

function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  notesWritten.push(`session-${id}.json`)
  return id
}

function aTranscript(name: string): string {
  const path = join(scratch, name)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/** A running run of the agent, filed by the person, as a starter files one. */
async function aRun(data: Record<string, unknown>): Promise<string> {
  const made = await server.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'session', title: 'a run of the returning agent', data: { state: 'running', runtime: 'claude-code', servingAgent: HANDLE, ...data } },
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
 * A run already stamped in today's shape: the three naming keys and the process facts the hook writes, with no resume
 * command, and a field of somebody else's beside the stamp in `extra`.
 */
function todaysStamp(sessionId: string, transcript: string): Record<string, unknown> {
  return {
    tool: 'claude-code',
    externalId: sessionId,
    logPath: transcript,
    pid: 4242,
    pidStartedAt: '2026-10-27 08:00:00',
    pidCommand: 'claude --dangerously-skip-permissions',
    pidFlags: { kept: [{ name: '--dangerously-skip-permissions', value: null }], dropped: [] },
    pidReplaced: 4241,
  }
}

/**
 * Run the hook as Claude Code runs it, with type stripping off, and hand back what it printed. `run`, when given, is the
 * run its environment names. HOME, TMUX_PANE, any key and the office tool's configuration are never inherited.
 */
async function theHook(
  mode: 'start' | 'stop',
  payload: Record<string, unknown>,
  more: { run?: string; env?: Record<string, string> } = {},
): Promise<{ out: string; err: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: join(scratch, 'home'),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: HANDLE,
  }
  for (const name of ['TMUX_PANE', 'CLAUDE_PID', 'MOLE_AGENT_KEY', 'SANDBOX_DIR', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'MOLE_OFFICE_SESSION']) delete env[name]
  if (more.run !== undefined) env['MOLE_OFFICE_SESSION'] = more.run
  Object.assign(env, more.env ?? {})
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

/** The agent made a resident, so its profile has an origins file, and that file's lines read through the profile's door. */
async function theProfilesOriginLines(): Promise<Record<string, any>[]> {
  const secretary = agents.get(SECRETARY)!
  const agentId = agents.get(HANDLE)!.id
  const proposed = await server.app.inject({
    method: 'POST',
    url: '/api/residents/proposals',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': secretary.key },
    payload: { agentId, because: 'A made-up reason.' },
  })
  expect(proposed.statusCode, proposed.body).toBe(201)
  const proposal = (proposed.json() as { proposal: { id: string } }).proposal.id
  const confirmed = await server.app.inject({ method: 'POST', url: `/api/residents/proposals/${proposal}/confirm`, headers: AS_THE_PERSON })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  const file = await server.app.inject({ method: 'GET', url: `/api/residents/${agentId}/space/file?path=session-origins.jsonl`, headers: AS_THE_PERSON })
  expect(file.statusCode, file.body).toBe(200)
  return file.body
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as Record<string, any>)
}

describe('the hook writes the resume command on the stamp', () => {
  it('a start that files a record writes the command on its stamp', async () => {
    const id = aSessionId()
    await theHook('start', { session_id: id, transcript_path: aTranscript('first.jsonl'), cwd: scratch })
    const sessions = t.api.listRecords({ workspaceId: 'default', kind: 'session' })
    expect(sessions, 'the start filed exactly one record').toHaveLength(1)
    const stamp = (sessions[0]!.data as Record<string, any>)['extra']?.['discovered']
    expect(stamp?.['externalId']).toBe(id)
    expect(stamp?.['resumeCommand'], 'the stamp the start wrote carries no resume command').toBe(theClaudeWayBack({ folder: scratch, sessionId: id }))
  }, 60_000)

  it('a start on a run stamped in today\'s shape adds the command, keeps every other field, and the profile shows it', async () => {
    const id = aSessionId()
    const transcript = aTranscript('resumed.jsonl')
    const before = todaysStamp(id, transcript)
    const run = await aRun({ providerSession: id, workingDirectory: scratch, extra: { discovered: before, anotherWritersField: 'kept as it was' } })

    await theHook('start', { session_id: id, transcript_path: transcript, cwd: scratch, source: 'resume' }, { run })

    const command = theClaudeWayBack({ folder: scratch, sessionId: id })
    const extra = theDataOf(run)['extra'] as Record<string, any>
    expect(extra['discovered'], 'the stamp was not given its command, or lost a field').toEqual({ ...before, resumeCommand: command })
    expect(extra['anotherWritersField']).toBe('kept as it was')

    const lines = await theProfilesOriginLines()
    const line = lines.find((one) => one['sessionRecordId'] === run)
    expect(line, JSON.stringify(lines)).toBeDefined()
    expect(line?.['resumeCommand'], 'the profile shows no resume line').toBe(command)
    expect(line?.['unknown']).not.toContain('resumeCommand')
  }, 60_000)

  it('a compaction on a run stamped in today\'s shape adds the command and keeps every other field', async () => {
    const id = aSessionId()
    const transcript = aTranscript('compacted.jsonl')
    const before = todaysStamp(id, transcript)
    const run = await aRun({ providerSession: id, workingDirectory: scratch, extra: { discovered: before } })

    const { out } = await theHook('start', { session_id: id, transcript_path: transcript, cwd: scratch, source: 'compact' }, { run })

    expect(out).toContain('after a compaction')
    expect(theDataOf(run)['extra']['discovered'], out).toEqual({ ...before, resumeCommand: theClaudeWayBack({ folder: scratch, sessionId: id }) })
  }, 60_000)
})

describe('a command that holds a key is never written', () => {
  it('leaves out a command holding a piece shaped like a key, writes the stamp without it, and says so', async () => {
    // BUILT HERE, so no key-shaped word stands in this file.
    const folder = join(scratch, ['sk', 'madeUpNotAKey0123456789'].join('-'))
    mkdirSync(folder)
    const id = aSessionId()
    const { out } = await theHook('start', { session_id: id, transcript_path: aTranscript('shaped.jsonl'), cwd: folder })
    const stamp = (t.api.listRecords({ workspaceId: 'default', kind: 'session' })[0]!.data as Record<string, any>)['extra']?.['discovered']
    expect(stamp?.['externalId'], 'the stamp itself was not written').toBe(id)
    expect(stamp).not.toHaveProperty('resumeCommand')
    expect(out).toContain('The command that resumes this conversation was not written on its record')
  }, 60_000)

  it('leaves out a command holding the value of a secret the hook was given, and says so', async () => {
    const folder = join(scratch, PLANTED_VALUE)
    mkdirSync(folder)
    const id = aSessionId()
    const { out } = await theHook('start', { session_id: id, transcript_path: aTranscript('planted.jsonl'), cwd: folder }, { env: { [PLANTED_NAME]: PLANTED_VALUE } })
    const stamp = (t.api.listRecords({ workspaceId: 'default', kind: 'session' })[0]!.data as Record<string, any>)['extra']?.['discovered']
    expect(stamp?.['externalId'], 'the stamp itself was not written').toBe(id)
    expect(stamp).not.toHaveProperty('resumeCommand')
    expect(out).toContain('The command that resumes this conversation was not written on its record')
  }, 60_000)
})
