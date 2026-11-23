// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HAND-STARTED SESSION'S HOOK SENDS ITS AGENT'S KEY FROM THE FILE ITS WAITER NOTED.
 *
 * A session started by hand names its agent and holds no key of it: the key is in a file that only its waiter was
 * given, in MOLE_AGENT_KEY_FILE. The office lets no name alone stamp, change or end a run, so the session hook's stamp,
 * its compaction note and its end were refused. Now the waiter, once the office has taken its hold, writes the full path
 * of its key file into the session's note (src/config/the-session-note.mjs) as `agentKeyFile`, and the hook, at a
 * compaction, a stop and an end, reads the key from that file and sends it under the agent's name.
 *
 * WHAT IS SHOWN HERE.
 *
 * 1. The note: a note written with the entry reads it back, an entry that is not a full path reads back as none, the
 *    writer refuses one, and the note holds the path and never the key.
 * 2. Each rewrite of the note a case can reach keeps the entry: the hook's stop after it closes the record the note
 *    supersedes, its stop after it follows a record to another project, its start after it files a new record for a
 *    note whose record is over, and its start after it finds the note's record in another project. Neither start reads
 *    the file: no request of a start carries the key.
 * 3. The waiter writes the path, and keeps every other entry, when its key came from a file, CLAUDE_CODE_SESSION_ID
 *    names the conversation and that note names the record it holds. It leaves the note as it was when the key came
 *    from MOLE_AGENT_KEY, when the note names another record and when there is no note, and it makes no note.
 * 4. The hook sends the key at a compaction, a stop and an end: the stamp, the compaction note and the end are taken.
 *    Two sessions in one folder, with two agents, each send their own key. A key file holding another agent's key is
 *    refused by the office, and nothing is written under the name. A refused file (a link, or a file other users may
 *    read) and a missing file each give one stderr line that names no path, and the hook sends the name alone, as it
 *    did before. A note with no path sends the name alone too.
 * 5. The office the waiter held: the waiter writes the address it asked beside the path, and each rewrite in 2 keeps
 *    both. The hook sends the noted key only when it asks that same office, compared as written. A hook pointed at a
 *    made-up second office, a hook that asks the same office written another way (a name in place of the number) and
 *    a note that names a key file and no office each send the name alone, with one stderr line that names no
 *    address, path or key.
 *
 * WHAT IS REAL. The office is this file's own, made by freshDb, behind a door on a free port that stamps every request as
 * arriving from this machine, as the office's own listener does, hands it to the office's own routing whole and writes
 * down each request's headers, path and answer. The made-up second office is a server of this file's own on another
 * free port, which the waiter never held. It answers every request itself with a 404, as an office that holds none of
 * this session's records, and writes down each request's headers and path. It hands nothing to this file's office,
 * so it has nothing to stamp. The hook
 * and the waiter are spawned as their tools/ entry points, with no type stripping for the hook as on the Node 18 it
 * runs on, this process's environment without a key, a key file, an agent, a run or a conversation of its own, and a
 * payload on stdin for the hook.
 * The agents and their keys come from the office's own registration door; each key file is this test's own, mode 600,
 * in a folder this test made. The notes are in the checkout's .logs folder, where both writers keep them, under
 * conversation ids this file makes, and they are removed after. Keys are compared inside this file, and each assertion
 * on a key is a true or false, so no failure prints one.
 *
 * RED ON THE BASE. No code wrote or read `agentKeyFile`. The note's reader returned no such entry and its writer wrote
 * none, so every rewrite dropped it. The waiter never read or wrote the note and said nothing about it. The hook never
 * read a key file named in the note, so every request it made at a stop, a compaction and an end carried the name
 * alone, and the office refused the stamp, the compaction note and the end. The lines the waiter and the hook print are
 * read from the note's module, which declared none.
 *
 * RED ON THE BASE OF THE SECOND CHANGE, where the waiter noted the path and not the office. The note's reader returned
 * no office and its writer wrote none, so the waiter's note and every rewrite lacked it. The hook sent the noted key
 * to whatever office it asked: a hook pointed at another office, a hook that asked the same office written another
 * way, and a note with no office all sent the key on every request of a stop. The line the hook prints then is read
 * from the note's module, which declared none.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const WAITER = join(CHECKOUT, 'tools', 'hold-the-handle.mjs')
const KEY = 'x-mole-office-key'
const ACTOR = 'x-mole-office-actor-id'
const OTHER_PROJECT = 'a-made-up-second-project'
const THIS_OFFICE = "this file's office"
const A_MADE_UP_OFFICE = 'a made-up second office'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

type Seen = { door: string; path: string; headers: IncomingHttpHeaders; status: number }
type Agent = { handle: string; key: string; keyFile: string }

let t: TestDb
let app: FastifyInstance
let proxy: Server
let proxyAt = ''
let madeUp: Server
let madeUpAt = ''
let scratch = ''
let seen: Seen[] = []
const notes: string[] = []
const started: { child: ChildProcess; ended: Promise<number | null> }[] = []
let made = 0

/** A conversation id of this file's own, whose note is removed after. */
async function aConversation(): Promise<string> {
  const { theSessionNotePath } = await import('../src/config/the-session-note.mjs')
  made += 1
  const id = `hand-started-key-${String(Date.now())}-${String(made)}-${String(Math.random()).slice(2, 8)}`
  const path = theSessionNotePath(id)
  expect(path, 'the conversation names no note').not.toBeNull()
  notes.push(path!)
  return id
}

/** The note of a conversation, as the file holds it, or null when there is none. */
async function theNoteAsWritten(conversation: string): Promise<{ text: string; held: Record<string, unknown> } | null> {
  const { theSessionNotePath } = await import('../src/config/the-session-note.mjs')
  const path = theSessionNotePath(conversation)!
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf8')
  return { text, held: JSON.parse(text) as Record<string, unknown> }
}

/** Write a note by hand, as a writer of an earlier day or another writer left it. */
async function aNote(conversation: string, held: Record<string, unknown>): Promise<void> {
  const { theSessionNotePath } = await import('../src/config/the-session-note.mjs')
  writeFileSync(theSessionNotePath(conversation)!, JSON.stringify(held), 'utf8')
}

/** A file in this test's own folder, written with this mode. */
function aFile(name: string, text: string, mode = 0o600): string {
  const path = join(scratch, name)
  rmSync(path, { force: true })
  writeFileSync(path, text, { mode })
  chmodSync(path, mode)
  return path
}

/** An agent registered at the office's own door, with its key in a private file of this test's own. */
async function anAgent(handle: string): Promise<Agent> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker' } })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''
  expect(key === '', `the registration gave ${handle} no key`).toBe(false)
  return { handle, key, keyFile: aFile(`${handle}.key`, `${key}\n`) }
}

/** A session record of the agent in a project, filed by the person as a starter files one, running unless said. */
async function aRun(agent: Agent, workspace = 'default', state = 'running'): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace },
    payload: { kind: 'session', title: `A hand-started session of ${agent.handle}`, data: { state, runtime: 'claude-code', servingAgent: agent.handle } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/** A running session record the agent filed by its name, as the session of a waiter is filed in its own test. */
async function aRunTheAgentFiled(agent: Agent): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle },
    payload: { kind: 'session', title: `A terminal answering as ${agent.handle}`, data: { state: 'running', runtime: 'claude-code', doing: `answering as ${agent.handle}` } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

function theDataOf(id: string): Record<string, any> {
  const one = t.api.getRecord(id)
  expect(one, `record ${id} is not there`).not.toBeNull()
  return one!.data as Record<string, any>
}

function theRevisionsOf(id: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
}

/**
 * The environment of every hook and waiter run: this process's, without a key, a key file, an agent, a run, a pane, a
 * conversation or the office tool's configuration of its own, and the case's own.
 */
function anEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of [
    'MOLE_AGENT_KEY',
    'MOLE_AGENT_KEY_FILE',
    'MOLE_OFFICE_AGENT',
    'MOLE_OFFICE_SESSION',
    'MOLE_OFFICE_TOOL_CONFIGURATION',
    'TMUX_PANE',
    'CLAUDE_PID',
    'CLAUDE_CODE_SESSION_ID',
    'SANDBOX_DIR',
  ]) delete env[name]
  return { ...env, ...extra }
}

const theHooksEnvironment = (agent: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  anEnvironment({
    HOME: join(scratch, 'home'),
    MOLE_OFFICE_API: proxyAt,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: agent,
    ...extra,
  })

type HookRun = { status: number | null; out: string; err: string; asked: Seen[] }

/** Run the hook once, as Claude Code runs it, and hand back what it printed and the requests that named an actor. */
async function theHookRuns(mode: 'start' | 'stop' | 'end', conversation: string, env: NodeJS.ProcessEnv, more: Record<string, unknown> = {}): Promise<HookRun> {
  const transcript = join(scratch, `${conversation}.jsonl`)
  if (!existsSync(transcript)) writeFileSync(transcript, '{"type":"user"}\n', 'utf8')
  const event = mode === 'start' ? 'SessionStart' : mode === 'stop' ? 'Stop' : 'SessionEnd'
  seen = []
  const child = spawn(process.execPath, ['--no-experimental-strip-types', HOOK, mode], { cwd: scratch, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (d: Buffer) => { out += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => { err += d.toString('utf8') })
  child.stdin.on('error', () => {})
  child.stdin.end(JSON.stringify({ session_id: conversation, cwd: scratch, transcript_path: transcript, hook_event_name: event, ...more }))
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, out, err, asked: seen.filter((one) => one.headers[ACTOR] !== undefined) }
}

type Lines = {
  written: string
  noConversation: string
  noNote: string
  anotherRecord: string
  absent: string
  refused: string
  anotherOffice: string
  notWritten: (code: string) => string
}

/** The lines the waiter and the hook print about the noted key file, as the note's module declares them. */
async function theLines(): Promise<Lines> {
  const loaded = (await import('../src/config/the-session-note.mjs')) as unknown as { THE_KEY_FILE_ENTRY_SAYS?: Lines }
  expect(loaded.THE_KEY_FILE_ENTRY_SAYS, "the note's module declares no lines about the waiter's key file").toBeDefined()
  return loaded.THE_KEY_FILE_ENTRY_SAYS!
}

/** How many times `line` stands in `text`. */
const timesIn = (text: string, line: string): number => text.split(line).length - 1

/** Whether every request of a run named this agent and carried exactly this key, as a yes or no. */
const everyRequestCarried = (run: HookRun, agent: string, key: string | undefined): boolean =>
  run.asked.length > 0 && run.asked.every((one) => one.headers[ACTOR] === agent && one.headers[KEY] === key)

/** Start the waiter for this agent and session, with the case's own variables, and keep what it prints. */
function startTheWaiter(handle: string, session: string, extra: Record<string, string>): { said: () => string; ended: Promise<number | null>; child: ChildProcess } {
  const child = spawn(process.execPath, [WAITER, '--agent', handle, '--session', session, '--api', proxyAt, '--workspace', 'default'], {
    env: anEnvironment({ MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', ...extra }),
  })
  const ended = new Promise<number | null>((done) => child.on('close', done))
  started.push({ child, ended })
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  return { said: () => printed, ended, child }
}

/**
 * Kill every waiter still running and wait until each has gone, so no waiter's requests are among those a later case
 * reads.
 */
async function stopEveryWaiter(): Promise<void> {
  for (const { child, ended } of started.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await ended
  }
}

async function until(what: () => boolean, within = 30_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/**
 * Whether the waiter for this handle has gone past the place it notes its key file: the office took its hold, and it has
 * asked something after the hold. The note is written between the two, with nothing asked in between.
 */
function theWaiterWentOn(handle: string): boolean {
  const base = `/api/handles/${encodeURIComponent(handle)}`
  const held = seen.findIndex((one) => one.path === `${base}/hold` && one.status === 201)
  return held >= 0 && seen.slice(held + 1).some((one) => one.path.startsWith(`${base}/`) && one.path !== `${base}/hold`)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-noted-key-'))
  mkdirSync(join(scratch, 'home'))
  // THE DOOR IN FRONT OF THIS FILE'S OFFICE stamps every request as arriving from this machine, as the office's own
  // listener stamps each one before it is routed, and hands it to the office's own routing whole. It writes down each
  // request's path, its headers and the status the office answered. The stamp is needed because the office refuses a
  // request on a network connection that no listener stamped, as one it cannot tell came from this machine.
  const { stampArrival } = await import('../src/server/lib/http.ts')
  proxy = createServer((req, res) => {
    const one: Seen = { door: THIS_OFFICE, path: (req.url ?? '/').split('?')[0] ?? '/', headers: { ...req.headers }, status: 0 }
    seen.push(one)
    res.on('finish', () => {
      one.status = res.statusCode
    })
    stampArrival(req, 'this machine', 'the caller')
    app.routing(req, res)
  })
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', () => done()))
  proxyAt = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
  // A MADE-UP SECOND OFFICE, which no waiter of this file holds: it answers every request itself with a 404, as an
  // office that holds none of this session's records, and writes each request down. It hands nothing to this file's
  // office.
  madeUp = createServer((req, res) => {
    seen.push({ door: A_MADE_UP_OFFICE, path: (req.url ?? '/').split('?')[0] ?? '/', headers: { ...req.headers }, status: 404 })
    req.resume()
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'This made-up office holds no such record.' }))
  })
  await new Promise<void>((done) => madeUp.listen(0, '127.0.0.1', () => done()))
  madeUpAt = `http://127.0.0.1:${String((madeUp.address() as AddressInfo).port)}`
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', headers: AS_THE_PERSON, payload: { id: OTHER_PROJECT, title: 'A made-up second project' } })
  expect([200, 201], project.body).toContain(project.statusCode)
}, 120_000)

afterAll(async () => {
  await stopEveryWaiter()
  for (const note of notes.splice(0)) rmSync(note, { force: true })
  proxy?.closeAllConnections()
  await new Promise<void>((done) => proxy?.close(() => done()))
  madeUp?.closeAllConnections()
  await new Promise<void>((done) => madeUp?.close(() => done()))
  await app?.close()
  t?.close()
  rmSync(scratch, { recursive: true, force: true })
}, 90_000)

describe("the session note keeps the waiter's key file", () => {
  it('a note written with the entry reads it back, and holds the path and never the key', async () => {
    const { theSessionNote, writeTheSessionNote } = await import('../src/config/the-session-note.mjs')
    const conversation = await aConversation()
    const key = 'd4'.repeat(32)
    const keyFile = aFile('a-note-only-key', `${key}\n`)
    writeTheSessionNote(conversation, 'aMadeUpRun01', '2026-11-23 09:00', null, { workspace: 'default', agentKeyFile: keyFile } as never)
    expect((theSessionNote(conversation) as Record<string, unknown> | null)?.['agentKeyFile']).toBe(keyFile)
    const written = await theNoteAsWritten(conversation)
    expect(written?.held['agentKeyFile'], 'the note does not hold the path').toBe(keyFile)
    expect(written?.text.includes(key), 'the note holds the key').toBe(false)
  })

  it('an entry that is not a full path reads back as none, and the writer refuses one', async () => {
    const { theSessionNote, writeTheSessionNote } = await import('../src/config/the-session-note.mjs')
    const conversation = await aConversation()
    await aNote(conversation, { id: 'aMadeUpRun02', at: '2026-11-23 09:00', agentKeyFile: 'a-relative/key-file' })
    expect((theSessionNote(conversation) as Record<string, unknown> | null)?.['agentKeyFile']).toBeNull()
    await aNote(conversation, { id: 'aMadeUpRun02', at: '2026-11-23 09:00' })
    expect((theSessionNote(conversation) as Record<string, unknown> | null)?.['agentKeyFile']).toBeNull()
    expect(() => writeTheSessionNote(conversation, 'aMadeUpRun03', '2026-11-23 09:00', null, { agentKeyFile: 'a-relative/key-file' } as never)).toThrow()
    expect((await theNoteAsWritten(conversation))?.held['id'], 'the refused write changed the note').toBe('aMadeUpRun02')
  })
})

describe("each rewrite of the note keeps the waiter's key file and the office it held", () => {
  let agent: Agent

  beforeAll(async () => {
    agent = await anAgent('a-rewriting-agent')
  }, 60_000)

  it('the stop that closes the record the note supersedes keeps it', async () => {
    const conversation = await aConversation()
    const run = await aRun(agent)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default', supersedes: 'zzMadeUpOld0', agentKeyFile: agent.keyFile, agentKeyOffice: proxyAt })
    const got = await theHookRuns('stop', conversation, theHooksEnvironment(agent.handle))
    expect(got.status, got.err).toBe(0)
    const note = (await theNoteAsWritten(conversation))?.held
    expect(note?.['supersedes'], `the stop did not rewrite the note. It said:\n${got.out}${got.err}`).toBeUndefined()
    expect(note?.['agentKeyFile'], 'the rewrite dropped the key file').toBe(agent.keyFile)
    expect(note?.['agentKeyOffice'], 'the rewrite dropped the office the waiter held').toBe(proxyAt)
  }, 120_000)

  it('the stop that follows the record to another project keeps it', async () => {
    const conversation = await aConversation()
    const run = await aRun(agent, OTHER_PROJECT)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', agentKeyFile: agent.keyFile, agentKeyOffice: proxyAt })
    const got = await theHookRuns('stop', conversation, theHooksEnvironment(agent.handle))
    expect(got.status, got.err).toBe(0)
    const note = (await theNoteAsWritten(conversation))?.held
    expect(note?.['workspace'], `the stop did not follow the record. It said:\n${got.out}${got.err}`).toBe(OTHER_PROJECT)
    expect(note?.['agentKeyFile'], 'the rewrite dropped the key file').toBe(agent.keyFile)
    expect(note?.['agentKeyOffice'], 'the rewrite dropped the office the waiter held').toBe(proxyAt)
  }, 120_000)

  it('the start that files a new record for a note whose record is over keeps it, and sends no key from it', async () => {
    const conversation = await aConversation()
    // CRASHED, ONE OF THE STATES IN WHICH A RUN IS OVER. A run filed as finished is sealed as it is filed, and this
    // agent has no work area and the run names no submission, so the office refuses it. A crashed run seals nothing.
    const over = await aRun(agent, 'default', 'crashed')
    await aNote(conversation, { id: over, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: agent.keyFile, agentKeyOffice: proxyAt })
    const got = await theHookRuns('start', conversation, theHooksEnvironment(agent.handle), { source: 'startup' })
    expect(got.status, got.err).toBe(0)
    const note = (await theNoteAsWritten(conversation))?.held
    expect(typeof note?.['id'] === 'string' && note['id'] !== over, `the start filed no new record. It said:\n${got.out}${got.err}`).toBe(true)
    expect(note?.['agentKeyFile'], 'the rewrite dropped the key file').toBe(agent.keyFile)
    expect(note?.['agentKeyOffice'], 'the rewrite dropped the office the waiter held').toBe(proxyAt)
    expect(got.asked.some((one) => one.headers[KEY] === agent.key), 'a start sent the key from the noted file').toBe(false)
  }, 120_000)

  it('the start that finds the note’s record in another project keeps it, and sends no key from it', async () => {
    const conversation = await aConversation()
    const run = await aRun(agent, OTHER_PROJECT)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', agentKeyFile: agent.keyFile, agentKeyOffice: proxyAt })
    const got = await theHookRuns('start', conversation, theHooksEnvironment(agent.handle), { source: 'startup' })
    expect(got.status, got.err).toBe(0)
    const note = (await theNoteAsWritten(conversation))?.held
    expect(note?.['workspace'], `the start did not follow the record. It said:\n${got.out}${got.err}`).toBe(OTHER_PROJECT)
    expect(note?.['id']).toBe(run)
    expect(note?.['agentKeyFile'], 'the rewrite dropped the key file').toBe(agent.keyFile)
    expect(note?.['agentKeyOffice'], 'the rewrite dropped the office the waiter held').toBe(proxyAt)
    expect(got.asked.some((one) => one.headers[KEY] === agent.key), 'a start sent the key from the noted file').toBe(false)
  }, 120_000)
})

describe("the waiter notes its key file in the session's note", () => {
  afterEach(stopEveryWaiter, 60_000)

  it('with its key from a file, the conversation named and its note naming the held record, the note holds the path and keeps the rest', async () => {
    const agent = await anAgent('a-noting-waiter')
    const run = await aRunTheAgentFiled(agent)
    const conversation = await aConversation()
    const before = {
      id: run,
      at: '2026-11-23 09:00',
      supersedes: 'zzMadeUpOld1',
      workspace: 'default',
      supersedesWorkspace: 'default',
      supersededBecause: 'held',
      childOf: 'zzMadeUpParent',
    }
    await aNote(conversation, before)
    const waiter = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY_FILE: agent.keyFile, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), waiter.said()).toBe(true)
    const after = await theNoteAsWritten(conversation)
    expect(after?.held, waiter.said()).toEqual({ ...before, agentKeyFile: agent.keyFile, agentKeyOffice: proxyAt })
    expect(after?.text.includes(agent.key), 'the note holds the key').toBe(false)
    const SAYS = await theLines()
    expect(timesIn(waiter.said(), SAYS.written), waiter.said()).toBe(1)
    expect(waiter.said().includes(agent.keyFile), 'the waiter printed the path of its key file').toBe(false)
    expect(waiter.said().includes(agent.key), 'the waiter printed its key').toBe(false)
  }, 120_000)

  it('with its key from MOLE_AGENT_KEY the note is left as it was, and the same session with the file has the path noted', async () => {
    const agent = await anAgent('a-waiter-given-the-value')
    const run = await aRunTheAgentFiled(agent)
    const conversation = await aConversation()
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default' })
    const before = (await theNoteAsWritten(conversation))?.text
    const first = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY: agent.key, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), first.said()).toBe(true)
    expect((await theNoteAsWritten(conversation))?.text, 'a waiter with its key in MOLE_AGENT_KEY changed the note').toBe(before)
    const SAYS = await theLines()
    expect(Object.values(SAYS).some((line) => typeof line === 'string' && first.said().includes(line)), first.said()).toBe(false)
    first.child.kill('SIGTERM')
    expect(await Promise.race([first.ended.then(() => true), new Promise<boolean>((go) => setTimeout(() => go(false), 30_000))]), first.said()).toBe(true)
    // THE SAME SESSION, WITH THE KEY IN A FILE, has the path noted, so the case above is not a waiter that notes nothing.
    seen = []
    const second = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY_FILE: agent.keyFile, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), second.said()).toBe(true)
    expect((await theNoteAsWritten(conversation))?.held['agentKeyFile'], second.said()).toBe(agent.keyFile)
  }, 120_000)

  it('with a note that names another record the note is left as it was, and the waiter says why in one line', async () => {
    const agent = await anAgent('a-waiter-of-another-record')
    const run = await aRunTheAgentFiled(agent)
    const conversation = await aConversation()
    await aNote(conversation, { id: 'zzAnotherRun', at: '2026-11-23 09:00', workspace: 'default' })
    const before = (await theNoteAsWritten(conversation))?.text
    const waiter = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY_FILE: agent.keyFile, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), waiter.said()).toBe(true)
    expect((await theNoteAsWritten(conversation))?.text, 'the waiter changed a note of another record').toBe(before)
    const SAYS = await theLines()
    expect(timesIn(waiter.said(), SAYS.anotherRecord), waiter.said()).toBe(1)
    expect(waiter.said().includes(agent.keyFile), 'the waiter printed the path of its key file').toBe(false)
  }, 120_000)

  it('with no note no note is made, and the waiter says why in one line', async () => {
    const agent = await anAgent('a-waiter-with-no-note')
    const run = await aRunTheAgentFiled(agent)
    const conversation = await aConversation()
    const waiter = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY_FILE: agent.keyFile, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), waiter.said()).toBe(true)
    expect(await theNoteAsWritten(conversation), 'the waiter made a note').toBeNull()
    const SAYS = await theLines()
    expect(timesIn(waiter.said(), SAYS.noNote), waiter.said()).toBe(1)
    expect(waiter.said().includes(agent.keyFile), 'the waiter printed the path of its key file').toBe(false)
  }, 120_000)
})

describe('the hook sends the key from the noted file at a compaction, a stop and an end', () => {
  let first: Agent
  let second: Agent

  beforeAll(async () => {
    first = await anAgent('a-hand-started-agent')
    second = await anAgent('a-second-hand-started-agent')
  }, 60_000)

  afterEach(stopEveryWaiter, 60_000)

  it('the stamp, the compaction note and the end are taken, under the agent, with its key', async () => {
    const conversation = await aConversation()
    // FILED UNDER THE AGENT'S NAME, as a hand-started session's hook files its record at its start, so the agent answers
    // for the run as the one that filed it. A run that names the agent it serves is sealed when its state is written as
    // finished, and this agent has no work area and the run names no submission, so the office would refuse the end.
    const run = await aRunTheAgentFiled(first)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: first.keyFile, agentKeyOffice: proxyAt })
    const env = theHooksEnvironment(first.handle)

    const stopped = await theHookRuns('stop', conversation, env)
    expect(stopped.status, stopped.err).toBe(0)
    expect(everyRequestCarried(stopped, first.handle, first.key), 'a request of the stop did not carry the agent’s key').toBe(true)
    expect(theDataOf(run)['extra']?.['discovered']?.['externalId'], `the stop did not stamp the run. It said:\n${stopped.out}${stopped.err}`).toBe(conversation)

    const compacted = await theHookRuns('start', conversation, env, { source: 'compact' })
    expect(compacted.status, compacted.err).toBe(0)
    expect(everyRequestCarried(compacted, first.handle, first.key), 'a request after the compaction did not carry the agent’s key').toBe(true)
    expect((theDataOf(run)['compactions'] as unknown[] | undefined)?.length, `the compaction note was not filed. It said:\n${compacted.out}`).toBe(1)

    const ended = await theHookRuns('end', conversation, env, { reason: 'other' })
    expect(ended.status, ended.err).toBe(0)
    expect(everyRequestCarried(ended, first.handle, first.key), 'a request of the end did not carry the agent’s key').toBe(true)
    expect(theDataOf(run)['state'], `the end was not taken. It said:\n${ended.out}${ended.err}`).toBe('finished')

    const printed = [stopped, compacted, ended].map((one) => `${one.out}${one.err}`).join('')
    expect(printed.includes(first.key), 'the hook printed the key').toBe(false)
    expect(printed.includes(first.keyFile), 'the hook printed the path of the key file').toBe(false)
  }, 180_000)

  it('two sessions in one folder, with two agents, each send their own key', async () => {
    const one = await aConversation()
    const two = await aConversation()
    const runOne = await aRun(first)
    const runTwo = await aRun(second)
    await aNote(one, { id: runOne, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: first.keyFile, agentKeyOffice: proxyAt })
    await aNote(two, { id: runTwo, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: second.keyFile, agentKeyOffice: proxyAt })
    const gotOne = await theHookRuns('stop', one, theHooksEnvironment(first.handle))
    const gotTwo = await theHookRuns('stop', two, theHooksEnvironment(second.handle))
    expect(everyRequestCarried(gotOne, first.handle, first.key), 'the first session did not send its own agent’s key').toBe(true)
    expect(everyRequestCarried(gotTwo, second.handle, second.key), 'the second session did not send its own agent’s key').toBe(true)
    expect(theDataOf(runOne)['extra']?.['discovered']?.['externalId'], gotOne.err).toBe(one)
    expect(theDataOf(runTwo)['extra']?.['discovered']?.['externalId'], gotTwo.err).toBe(two)
  }, 180_000)

  it('a key file holding another agent’s key is refused by the office, and nothing is written under the name', async () => {
    const conversation = await aConversation()
    const run = await aRun(first)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: second.keyFile, agentKeyOffice: proxyAt })
    const got = await theHookRuns('stop', conversation, theHooksEnvironment(first.handle))
    expect(got.status, got.err).toBe(0)
    const carried = got.asked.filter((one) => one.headers[KEY] === second.key)
    expect(carried.length > 0, 'no request carried the key the noted file holds, so the case proved nothing').toBe(true)
    expect(carried.every((one) => one.headers[ACTOR] === first.handle && one.status === 403), 'the office took another agent’s key under the name').toBe(true)
    expect(theRevisionsOf(run), 'something was written on the run under the name').toBe(1)
    expect(theDataOf(run)['extra']?.['discovered'], 'the run was stamped under the name').toBeUndefined()
  }, 120_000)

  const UNUSABLE: readonly { name: string; says: 'absent' | 'refused'; put: () => string }[] = [
    { name: 'a missing key file', says: 'absent', put: () => join(scratch, 'no-key-file-is-here') },
    { name: 'a key file other users may read', says: 'refused', put: () => aFile('a-key-others-may-read', `${first.key}\n`, 0o644) },
    {
      name: 'a link where the key file is',
      says: 'refused',
      put: () => {
        const link = join(scratch, 'a-link-to-the-key')
        rmSync(link, { force: true })
        symlinkSync(first.keyFile, link)
        return link
      },
    },
  ]

  for (const one of UNUSABLE) {
    it(`with ${one.name}, one stderr line that names no path, and the name alone, as before`, async () => {
      const SAYS = await theLines()
      const conversation = await aConversation()
      const run = await aRun(first)
      const path = one.put()
      await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: path, agentKeyOffice: proxyAt })
      const got = await theHookRuns('stop', conversation, theHooksEnvironment(first.handle))
      expect(got.status, got.err).toBe(0)
      expect(timesIn(got.err, SAYS[one.says]), got.err).toBe(1)
      expect(`${got.out}${got.err}`.includes(path), 'the hook printed the path the note names').toBe(false)
      expect(everyRequestCarried(got, first.handle, undefined), 'a request carried a key').toBe(true)
      expect(theDataOf(run)['extra']?.['discovered'], 'a name alone stamped the run').toBeUndefined()
    }, 120_000)
  }

  it('a note with no path sends the name alone, as before, and the same note with the path sends the key', async () => {
    const conversation = await aConversation()
    const run = await aRun(first)
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default' })
    const without = await theHookRuns('stop', conversation, theHooksEnvironment(first.handle))
    expect(without.status, without.err).toBe(0)
    expect(everyRequestCarried(without, first.handle, undefined), 'a request carried a key with no path noted').toBe(true)
    expect(theDataOf(run)['extra']?.['discovered'], 'a name alone stamped the run').toBeUndefined()
    // THE SAME NOTE WITH THE PATH, so the case above is not a hook that never sends the key.
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default', agentKeyFile: first.keyFile, agentKeyOffice: proxyAt })
    const withIt = await theHookRuns('stop', conversation, theHooksEnvironment(first.handle))
    expect(everyRequestCarried(withIt, first.handle, first.key), 'the stop with the path noted did not send the key').toBe(true)
    expect(theDataOf(run)['extra']?.['discovered']?.['externalId'], withIt.err).toBe(conversation)
  }, 180_000)

  it('the note the waiter wrote names the office it held, and a hook that asks that office sends the key, with no line about another office', async () => {
    const SAYS = await theLines()
    expect(typeof SAYS.anotherOffice, "the note's module declares no line for a note of another office").toBe('string')
    const agent = await anAgent('an-agent-whose-waiter-noted-its-office')
    const run = await aRunTheAgentFiled(agent)
    const conversation = await aConversation()
    await aNote(conversation, { id: run, at: '2026-11-23 09:00', workspace: 'default' })
    const waiter = startTheWaiter(agent.handle, run, { MOLE_AGENT_KEY_FILE: agent.keyFile, CLAUDE_CODE_SESSION_ID: conversation })
    expect(await until(() => theWaiterWentOn(agent.handle)), waiter.said()).toBe(true)
    const said = waiter.said()
    // THE WAITER IS STOPPED FIRST, so no request of its own is among those the stop is judged by.
    await stopEveryWaiter()
    const noted = (await theNoteAsWritten(conversation))?.held
    expect(noted?.['agentKeyFile'], said).toBe(agent.keyFile)
    expect(noted?.['agentKeyOffice'], `the waiter did not note the office it held. It said:\n${said}`).toBe(proxyAt)
    const got = await theHookRuns('stop', conversation, theHooksEnvironment(agent.handle))
    expect(got.status, got.err).toBe(0)
    expect(everyRequestCarried(got, agent.handle, agent.key), 'a request of the stop did not carry the agent’s key').toBe(true)
    expect(got.asked.every((one) => one.door === THIS_OFFICE), 'a request of the stop went to another office').toBe(true)
    expect(theDataOf(run)['extra']?.['discovered']?.['externalId'], `the stop did not stamp the run. It said:\n${got.out}${got.err}`).toBe(conversation)
    expect(timesIn(got.err, SAYS.anotherOffice), got.err).toBe(0)
  }, 180_000)

  // NOT THE OFFICE THE WAITER HELD, AS WRITTEN. The note names this file's office, or none, and the hook asks another
  // address: a made-up second office, or this file's own office under a name in place of the number.
  const NOT_THE_OFFICE_HELD: readonly { name: string; noted: () => string | undefined; asks: () => string; door: string }[] = [
    { name: 'a hook pointed at a made-up second office', noted: () => proxyAt, asks: () => madeUpAt, door: A_MADE_UP_OFFICE },
    {
      name: 'the same office written another way, a name in place of the number',
      noted: () => proxyAt.replace('//127.0.0.1:', '//localhost:'),
      asks: () => proxyAt,
      door: THIS_OFFICE,
    },
    { name: 'a note that names a key file and no office', noted: () => undefined, asks: () => proxyAt, door: THIS_OFFICE },
  ]

  for (const one of NOT_THE_OFFICE_HELD) {
    it(`with ${one.name}, the name alone, and one stderr line that names no address, path or key`, async () => {
      const SAYS = await theLines()
      expect(typeof SAYS.anotherOffice, "the note's module declares no line for a note of another office").toBe('string')
      const conversation = await aConversation()
      const run = await aRun(first)
      const noted = one.noted()
      expect(noted === undefined || noted !== one.asks(), 'the note names the office the hook asks, so the case proves nothing').toBe(true)
      await aNote(conversation, {
        id: run,
        at: '2026-11-23 09:00',
        workspace: 'default',
        agentKeyFile: first.keyFile,
        ...(noted === undefined ? {} : { agentKeyOffice: noted }),
      })
      const got = await theHookRuns('stop', conversation, theHooksEnvironment(first.handle, { MOLE_OFFICE_API: one.asks() }))
      expect(got.status, got.err).toBe(0)
      expect(timesIn(got.err, SAYS.anotherOffice), got.err).toBe(1)
      expect(everyRequestCarried(got, first.handle, undefined), 'a request carried a key to an office its waiter did not hold').toBe(true)
      expect(got.asked.every((asked) => asked.door === one.door), 'a request went to another office than the one the hook asks').toBe(true)
      // THE LINE ITSELF names no address, path or key. The hook's own lines about the office it asks name that address,
      // as they did before, so only the key, the key file's path and the office the note names are looked for in all
      // the hook printed.
      for (const word of [first.key, first.keyFile, proxyAt, madeUpAt, ...(noted === undefined ? [] : [noted])]) {
        expect(SAYS.anotherOffice.includes(word), 'the line names a key, a key file’s path or an office’s address').toBe(false)
      }
      expect(/https?:|127\.0\.0\.1|localhost|\//.test(SAYS.anotherOffice), 'the line names an address or a path').toBe(false)
      const printed = `${got.out}${got.err}`
      for (const word of [first.key, first.keyFile, ...(noted === undefined ? [] : [noted])]) {
        expect(printed.includes(word), 'the hook printed a key, a key file’s path or the office the note names').toBe(false)
      }
      expect(theDataOf(run)['extra']?.['discovered'], 'the run was stamped').toBeUndefined()
    }, 120_000)
  }
})
