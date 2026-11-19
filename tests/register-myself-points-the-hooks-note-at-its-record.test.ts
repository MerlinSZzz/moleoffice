// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TOOLS/REGISTER-MYSELF.MJS POINTS THE SESSION HOOK'S NOTE AT THE RECORD ITS REGISTRATION GAVE THE CONVERSATION, SO
 * THE STOP HOOK STAMPS THE RECORD THE AGENT'S HANDLE IS ON. Problem Tv32CoCfV-cP (29 September 2026).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An agent's start hook filed a record for his conversation, with no agent on it, and noted it. His registration,
 * admitted at the owner's press, filed a second record for the same conversation, and his waiter held his handle on
 * that one. The Stop hook stamps only the record its note names, so the second record never carried the
 * conversation: the office could not tie his process to it, his handle answered nobody, and the owner saw him as
 * Cannot reach. register-myself now points the note at the record the registration gave the conversation, once it
 * holds the agent's first key and `--provider-session` names the conversation. It names the start hook's own record
 * of that conversation in the note as superseded, and the Stop hook closes it: an agent may not end a run it did not
 * start or file (problem FZQflYp1vHuY), and the hook is one of the office's own processes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * The real server, started on a free port with a database and a HOME of its own; the real tool and the real hook,
 * each as a process; the registration waits, the person presses, and the next run collects the key, as a new agent's
 * does. The person's key is read from the key file that server made, to press as the person, and is never printed.
 * The notes are the checkout's own `.logs/session-<id>.json`, under ids this file makes, and each is removed after.
 *
 *   1. The order: the start hook files a record and notes it; the registration collects its key; the note names
 *      the registration's record and, as superseded, the start hook's, each with the project it is in (problem
 *      yIh8EGfyZXMH). At the end of the next turn the Stop hook stamps the registration's record with the
 *      conversation, closes the start hook's as superseded, and writes the note again without it, the project kept.
 *   2. No note at all (the start hook filed nothing): the note is written, and the Stop hook stamps the record.
 *   3. The note names a record another agent holds (the conversation was registered first as that agent): the note
 *      is left as it is and nothing is closed.
 *   4. The note names a record of another conversation that no agent holds: the note is pointed at the
 *      registration's record and names nothing as superseded, and that other record is left open by the Stop hook.
 *   5. Without --provider-session: no note is written, and nothing is said about one. Only a new note that names the
 *      registration's record counts: the folder is the checkout's own, and other test files write their notes in it
 *      at the same time (problem KascuNEqj5HB).
 *   6. The first ask without --provider-session and the second with it: the registration's record names no
 *      conversation, so no note is written, and the tool says why.
 *   7. The environment names this session's run (MOLE_OFFICE_SESSION): no note is written, and the tool says why.
 *   8. A conversation id that cannot name a note ("../escape") is refused before any request.
 *   9. The Stop hook asks again before it closes a record the note names as superseded, and asks the office to change
 *      nothing about one that an agent holds, that names another conversation, or that is over; the note loses the
 *      name each time. A proxy between the hook and the office writes down every request, because the office itself
 *      refuses to finish an agent's run it cannot seal, and that refusal must not be what the case rests on.
 *  10. The record the note named is already over: the note is pointed at the registration's record and names
 *      nothing as superseded.
 *  11. The office does not answer the Stop hook's re-check on one turn, nor its close on the next: the note keeps the
 *      superseded name both times, and the turn after, with the office answering, closes the record (problem
 *      2KmE6ffWFEEx, found by the check of this file's first entry, QAA498uFBmE9).
 *  12. A reply that says nothing about the record keeps the superseded name, and the record open: a key not accepted
 *      (401), too many requests (429) and a 200 that is not JSON to the re-check, and 401 and 429 to the close. The
 *      office refusing the close (409) and the record found gone (404) are judgments, and the name leaves the note;
 *      the office answering then closes the record (problem 72plHvwU1uAK, the inspector's two notes on the check of
 *      case 11's entry, YQD44W8WvLOs).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. register-myself writes no note: cases 1 and 2 go red, the handle's record carrying no conversation, and cases
 *      3, 4 and 10 with them, at the note each reads, and cases 11 and 12 at their first look at the note.
 *   b. register-myself names nothing as superseded: case 1 goes red, the start hook's record still running, and cases
 *      11 and 12 at their first look at the note.
 *   c. The Stop hook closes nothing it is told is superseded: case 1 goes red the same way, case 9 at the note, which
 *      the hook no longer writes again, and cases 11 and 12 at their first turn, which never asks about the record.
 *   d. The note pointed away from a record another agent holds: case 3 goes red.
 *   e. register-myself names a record of another conversation as superseded: case 4 goes red, at the note.
 *   f. register-myself names a record already over as superseded: case 10 goes red, at the note.
 *   g. The registration's record found without asking which conversation it names: case 6 goes red, a note written.
 *   h. The environment's run not asked about: case 7 goes red, a note written.
 *   i. The conversation id not checked: case 8 goes red, the tool asking the office.
 *   j. The Stop hook not asking again whether an agent holds the record: case 9 goes red, the hook asking to close it.
 *   k. The Stop hook not asking again which conversation the record names: case 9 goes red the same way.
 *   l. The Stop hook not asking again whether the record is over: case 9 goes red the same way.
 *   m. The Stop hook reading another note than the one src/config/the-session-note.mjs names: cases 1 and 2 go red,
 *      the handle's record carrying no conversation, case 9 with them, the note never written again, and cases 11 and
 *      12 at their first turn, which never asks about the record.
 *   s. The Stop hook dropping the name when its re-check got no answer: case 11 goes red at the first turn, and case 12
 *      at the key not accepted by the re-check.
 *   t. The Stop hook dropping the name when its close got no answer: case 11 goes red at the second turn, and case 12
 *      at the key not accepted by the close.
 *   u. The re-check counting any reply below 500 as a judgment again: case 12 goes red at the key not accepted by the
 *      re-check.
 *   v. The re-check counting any 200 as a judgment, a record in it or not: case 12 goes red at the 200 that is not JSON.
 *   w. The close counting any reply below 500 as a judgment again: case 12 goes red at the key not accepted by the close.
 *   x. The close counting only a 2xx as a judgment: case 12 goes red at the refused close, the name kept.
 *   y. The re-check not counting a 404 as a judgment: case 12 goes red at the record found gone, the name kept.
 *   n. register-myself writes no project in the note: cases 1, 2, 4, 10, 11 and 12 go red at the note.
 *   o. register-myself writes no project for the record it names as superseded: cases 1, 11 and 12 go red at the note.
 *   p. register-myself writes a note without --provider-session, for its own record: case 5 goes red at the note, and
 *      case 6 with it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiServerArguments } from './helpers.ts'
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer as anHttpServer, request as anHttpRequest } from 'node:http'
import { createServer, type AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'register-myself.mjs')
const HOOK = join(REPO, 'tools', 'session-hook.mjs')
const NOTES = join(REPO, '.logs')

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      if (at === null || typeof at === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const chosen = at.port
      probe.close(() => ok(chosen))
    })
  })
}

/** This process's environment without the names that point at the owner's live office, carry a key or name a run. */
function withoutTheLiveOffice(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY', 'TMUX_PANE']) {
    delete env[name]
  }
  return env
}

let child: ChildProcess | undefined
let api = ''
let dir = ''
const notesWritten: string[] = []

beforeAll(async () => {
  dir = aTestDatabaseFolder('register-note')
  const port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...withoutTheLiveOffice(),
      HOME: dir,
      LOG_LEVEL: 'warn',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'panelx.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_NO_WATCH: '1',
    },
  })
  for (let tries = 0; tries < 180; tries += 1) {
    try {
      if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) return
    } catch {
      // not answering yet
    }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  throw new Error(`the server this test started never answered ${api}/api/health`)
}, 120_000)

afterEach(() => {
  for (const name of notesWritten.splice(0)) rmSync(join(NOTES, name), { force: true })
})

afterAll(() => {
  // BY THE GROUP ID WRITTEN DOWN WHEN IT WAS STARTED, never by a pattern (problem LD9Yor6qIVVC).
  if (child?.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

/** A conversation id of this file's own, whose note is removed after each case. */
function aConversation(): string {
  const id = `note-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** All the note of `conversation` holds, or null when there is none. */
function theWholeNote(conversation: string): Record<string, unknown> | null {
  const path = join(NOTES, `session-${conversation}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

/** The record the note of `conversation` names, or null when there is none. */
function theNote(conversation: string): string | null {
  const held = theWholeNote(conversation)
  return held === null ? null : String(held['id'] ?? '')
}

function register(args: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; out: string; err: string } {
  const done = spawnSync(process.execPath, [TOOL, ...args, '--workspace', 'default', '--api', api], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...withoutTheLiveOffice(), ...env },
    timeout: 60_000,
  })
  return { status: done.status, out: done.stdout, err: done.stderr }
}

/** The person's key, from the key file this test's own server made beside its database. */
function thePersonsKey(): string {
  return String((JSON.parse(readFileSync(join(dir, 'keys.json'), 'utf8')) as { person: string }).person)
}

const AS_THE_PERSON = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-key': thePersonsKey(),
})

/** Register `handle` as a new agent does: the first ask waits, the person presses, and the second collects the key. */
async function registerAndCollect(
  handle: string,
  first: string[],
  second: string[] = first,
  env: NodeJS.ProcessEnv = {},
): Promise<{ out: string; err: string }> {
  const keyFile = join(dir, `${handle}.key`)
  const common = ['--handle', handle, '--name', handle, '--dir', dir, '--key-file', keyFile]
  const asked = register([...common, ...first], env)
  expect(asked.status, `${asked.out}${asked.err}`).toBe(0)
  const request = /the ask: (\S+)/.exec(asked.out)?.[1]
  expect(request, `the first ask was not left waiting: ${asked.out}${asked.err}`).toBeDefined()
  const pressed = await fetch(`${api}/api/roles/requests/${String(request)}/grant`, { method: 'POST', headers: AS_THE_PERSON(), body: '{}' })
  expect([200, 201], await pressed.clone().text()).toContain(pressed.status)
  const collected = register([...common, ...second], env)
  expect(collected.status, `${collected.out}${collected.err}`).toBe(0)
  expect(existsSync(keyFile), `no key was collected: ${collected.out}${collected.err}`).toBe(true)
  return { out: collected.out, err: collected.err }
}

async function aRecord(id: string): Promise<{ id: string; data: Record<string, any> }> {
  const res = await fetch(`${api}/api/records/${id}`, { headers: AS_THE_PERSON() })
  expect(res.status, `record ${id}`).toBe(200)
  return ((await res.json()) as { record: { id: string; data: Record<string, any> } }).record
}

async function theRecordsOfKind(kind: string): Promise<{ id: string; title: string; data: Record<string, any> }[]> {
  const listed = await fetch(`${api}/api/records?kind=${kind}&shape=full`, { headers: AS_THE_PERSON() })
  expect(listed.status).toBe(200)
  return ((await listed.json()) as { records: { id: string; title: string; data: Record<string, any> }[] }).records
}

/** The one session record of the agent registered as `handle`: the one whose `ranAs` names the agent record it wrote. */
async function theSessionRecordOf(handle: string): Promise<string> {
  const agentRecord = (await theRecordsOfKind('agent')).find((one) => one.data['handle'] === handle)?.id
  expect(agentRecord, `no agent record for "${handle}"`).toBeDefined()
  const held = (await theRecordsOfKind('session'))
    .filter((one) => Array.isArray(one.data['ranAs']) && (one.data['ranAs'] as { agentId?: string }[]).some((ran) => ran.agentId === agentRecord))
    .map((one) => one.id)
  expect(held, `the registration of "${handle}" did not give it one session record`).toHaveLength(1)
  return held[0]!
}

/** A session record the person files, naming `conversation`, left running or closed by the person. */
async function aRecordThePersonFiles(conversation: string, closed: boolean): Promise<string> {
  const made = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON(),
    body: JSON.stringify({ kind: 'session', title: 'a run the person filed', data: { state: 'running', runtime: 'claude-code', providerSession: conversation } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const id = ((await made.json()) as { record: { id: string } }).record.id
  if (closed) {
    const ended = await fetch(`${api}/api/records/${id}`, {
      method: 'PATCH',
      headers: AS_THE_PERSON(),
      body: JSON.stringify({ dataPatch: { state: 'finished', detail: 'closed by the person' } }),
    })
    expect(ended.status, await ended.clone().text()).toBe(200)
  }
  return id
}

/**
 * Run the real session hook as a process, with the payload Claude Code would hand it, talking to `through` (this test's
 * server, or a proxy in front of it). Asynchronous, so that a proxy in this process answers while the hook runs.
 */
function runTheHook(mode: 'start' | 'stop', payload: Record<string, unknown>, through = api): Promise<string> {
  const home = mkdtempSync(join(dir, 'home-'))
  return new Promise((resolve) => {
    const hook = execFile(
      process.execPath,
      [HOOK, mode],
      {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 60_000,
        // THE WORLD THIS CHECKOUT DECLARES IS THIS TEST'S SERVER: its database and its port, or the hook files nothing.
        env: {
          ...withoutTheLiveOffice(),
          HOME: home,
          MOLE_OFFICE_API: through,
          MOLE_OFFICE_PORT: new URL(api).port,
          MOLE_OFFICE_WORKSPACE: 'default',
          MOLE_OFFICE_DB: join(dir, 'panelx.db'),
          MOLE_HOOK_DETAILS_FOLDER: join(dir, 'hook-details'),
        },
      },
      (_error, stdout, stderr) => resolve(`${stdout}${stderr}`),
    )
    hook.stdin?.end(JSON.stringify(payload))
  })
}

/** The start hook's record of `conversation`, and its note, as the hook files them for a session nothing names yet. */
async function theStartHooksRecord(conversation: string): Promise<string> {
  const said = await runTheHook('start', { session_id: conversation, cwd: dir })
  const noted = theNote(conversation)
  expect(noted, `the start hook wrote no note, so this case measures nothing: ${said}`).not.toBeNull()
  return String(noted)
}

/** A reply the proxy gives in the office's place: its status, its body, and the body's type (JSON when not named). */
type AReplyInstead = { status: number; body: string; type?: string }

/**
 * A PROXY IN FRONT OF THIS TEST'S SERVER THAT WRITES DOWN EVERY REQUEST, so a case sees what the hook asked the office to
 * do and not only what the office let it do: the office refuses to finish an agent's run it cannot seal, and that
 * refusal must not be what a case rests on. `instead` picks the requests the office never sees: 'drop' leaves one
 * unanswered, and a reply answers it in the office's place.
 */
async function aRecordingProxy(
  instead: (asked: string) => 'drop' | AReplyInstead | null = () => null,
): Promise<{ url: string; asked: string[]; close: () => Promise<void> }> {
  const asked: string[] = []
  const target = new URL(api)
  const proxy = anHttpServer((req, res) => {
    const line = `${req.method ?? ''} ${req.url ?? ''}`
    asked.push(line)
    const handled = instead(line)
    // A REQUEST THIS CASE WANTS UNANSWERED: its connection is dropped, as a restarting office drops it.
    if (handled === 'drop') {
      req.socket.destroy()
      return
    }
    // A REQUEST THIS CASE ANSWERS ITSELF, with a reply that says nothing about the record.
    if (handled !== null) {
      req.resume()
      res.writeHead(handled.status, { 'content-type': handled.type ?? 'application/json' })
      res.end(handled.body)
      return
    }
    const onward = anHttpRequest({ host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    onward.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(onward)
  })
  await new Promise<void>((ready) => proxy.listen(0, '127.0.0.1', () => ready()))
  const port = (proxy.address() as AddressInfo).port
  return { url: `http://127.0.0.1:${String(port)}`, asked, close: () => new Promise<void>((done) => proxy.close(() => done())) }
}

/** A transcript file for the Stop hook to find, as Claude Code keeps one for every conversation. */
function aTranscript(): string {
  const path = join(dir, `transcript-${Math.random().toString(36).slice(2)}.jsonl`)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/** The end of a turn in `conversation`, as Claude Code runs the Stop hook. */
function aTurnEnds(conversation: string, through = api): Promise<string> {
  return runTheHook('stop', { session_id: conversation, transcript_path: aTranscript(), cwd: dir }, through)
}

/** The conversation a record's discovery stamp names, or null when it carries none. */
function theConversationStampedOn(record: { data: Record<string, any> }): string | null {
  return (record.data['extra']?.discovered?.externalId as string | undefined) ?? null
}

describe('register-myself points the session hook note at the record its registration gave the conversation', () => {
  it("Quill's order: the Stop hook stamps the registration's record, and closes the start hook's as superseded", async () => {
    const conversation = aConversation()
    const theHooks = await theStartHooksRecord(conversation)
    expect((await aRecord(theHooks)).data['ranAs'] ?? [], 'the start hook record already holds an agent').toEqual([])

    const collected = await registerAndCollect('note-quill', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-quill')
    const noteBeforeTheTurnEnds = theWholeNote(conversation)
    const stateBeforeTheTurnEnds = (await aRecord(theHooks)).data['state']
    await aTurnEnds(conversation)

    // THE HARM FIRST: the record the handle is on carries the conversation once a turn has ended.
    expect(theConversationStampedOn(await aRecord(mine)), 'the record the handle is on carries no conversation').toBe(conversation)
    // AND THE CONVERSATION IS NOT LEFT WITH TWO LIVE RECORDS.
    const superseded = await aRecord(theHooks)
    expect(superseded.data['state'], `the start hook record of this conversation is still running: ${collected.out}`).toBe('finished')
    expect(String(superseded.data['detail'])).toContain(`Superseded by ${mine}`)
    expect(theWholeNote(conversation), 'the note still names a record to close').toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
    // THE TOOL NAMED IT, WITH THE PROJECT OF EACH RECORD, AND THE HOOK CLOSED IT: before the turn ended it was still open.
    expect(noteBeforeTheTurnEnds).toEqual({ id: mine, at: expect.any(String), supersedes: theHooks, workspace: 'default', supersedesWorkspace: 'default' })
    expect(stateBeforeTheTurnEnds).not.toBe('finished')
    expect(collected.out).toContain(`names record ${mine} now`)
    expect(collected.out).toContain(
      `Record ${theHooks}, which the start hook filed for this conversation and no agent holds, is closed as superseded by ${mine} by the session hook at the end of this session's next turn`,
    )
  }, 180_000)

  it('with no note at all, writes one, and the Stop hook stamps the record', async () => {
    const conversation = aConversation()
    await registerAndCollect('note-no-start', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-no-start')
    await aTurnEnds(conversation)

    expect(theConversationStampedOn(await aRecord(mine)), 'the record the handle is on carries no conversation').toBe(conversation)
    expect(theWholeNote(conversation)).toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
  }, 180_000)

  it('leaves a note that names a record another agent holds, and closes nothing', async () => {
    const conversation = aConversation()
    await registerAndCollect('note-first-agent', ['--provider-session', conversation])
    const theFirst = await theSessionRecordOf('note-first-agent')
    expect(theNote(conversation)).toBe(theFirst)

    const collected = await registerAndCollect('note-second-agent', ['--provider-session', conversation])
    await theSessionRecordOf('note-second-agent')
    await aTurnEnds(conversation)

    expect(theNote(conversation), 'the note was pointed away from a record another agent holds').toBe(theFirst)
    expect((await aRecord(theFirst)).data['state'], 'the other agent record was closed').not.toBe('finished')
    expect(collected.out).toContain(`names record ${theFirst}, which another agent holds, so it is left as it is`)
  }, 180_000)

  it('points a note that names a record of another conversation, and never names that record as superseded', async () => {
    const conversation = aConversation()
    const another = aConversation()
    const ofAnother = await theStartHooksRecord(another)
    writeFileSync(join(NOTES, `session-${conversation}.json`), JSON.stringify({ id: ofAnother, at: '2026-09-29 20:00' }), 'utf8')

    await registerAndCollect('note-misplaced', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-misplaced')
    const noted = theWholeNote(conversation)
    await aTurnEnds(conversation)

    expect((await aRecord(ofAnother)).data['state'], 'a record of another conversation was closed').not.toBe('finished')
    expect(noted, 'a record of another conversation was named as superseded').toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
    expect(theNote(conversation)).toBe(mine)
  }, 180_000)

  it('writes no note, and says nothing of one, without --provider-session', async () => {
    const before = new Set(readdirSync(NOTES).filter((name) => name.startsWith('session-')))
    const collected = await registerAndCollect('note-without', [])
    const mine = await theSessionRecordOf('note-without')

    // ONLY A NEW NOTE THAT NAMES THIS REGISTRATION'S RECORD COUNTS: the folder is the checkout's own, and other test
    // files write their notes in it at the same time (problem KascuNEqj5HB).
    const naming = readdirSync(NOTES)
      .filter((name) => name.startsWith('session-') && !before.has(name))
      .filter((name) => {
        try {
          return (JSON.parse(readFileSync(join(NOTES, name), 'utf8')) as { id?: unknown }).id === mine
        } catch {
          return false
        }
      })
    for (const name of naming) notesWritten.push(name)
    expect(naming, 'a note was written').toEqual([])
    expect(collected.out).not.toContain("session hook's note")
  }, 180_000)

  it('writes no note when the registration record names no conversation, and says why', async () => {
    const conversation = aConversation()
    const collected = await registerAndCollect('note-late', [], ['--provider-session', conversation])

    expect(theNote(conversation), 'a note was written for a record that names no conversation').toBeNull()
    expect(collected.out).toContain(`No live session record of "note-late" names this conversation (${conversation})`)
  }, 180_000)

  it('writes no note when the environment names the run, and says why', async () => {
    const conversation = aConversation()
    const run = await aRecordThePersonFiles('a-run-a-starter-filed', false)
    const collected = await registerAndCollect('note-started', ['--provider-session', conversation], undefined, { MOLE_OFFICE_SESSION: run })

    expect(theNote(conversation), 'a note was written although the environment names the run').toBeNull()
    expect(collected.out).toContain(`This session's environment names its run, ${run} (MOLE_OFFICE_SESSION)`)
  }, 180_000)

  it('refuses a conversation id that cannot name a note, before any request', async () => {
    const refused = register(['--handle', 'note-escape', '--name', 'note-escape', '--dir', dir, '--key-file', join(dir, 'note-escape.key'), '--provider-session', '../escape'])

    expect(refused.status, 'the tool went on with an id that cannot name a note').toBe(2)
    expect(refused.err).toContain('--provider-session must be letters, digits, dots, underscores and dashes')
    expect(JSON.stringify(await theRecordsOfKind('role_request')), 'the tool asked the office').not.toContain('note-escape')
  })

  it('the Stop hook asks again, and writes nothing to a record it is told is superseded that it may not close', async () => {
    const conversation = aConversation()
    await registerAndCollect('note-asks-again', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-asks-again')
    // A SECOND REGISTRATION IN THE SAME CONVERSATION leaves the note on the first agent's record, and gives its own.
    await registerAndCollect('note-asks-again-too', ['--provider-session', conversation])
    const held = await theSessionRecordOf('note-asks-again-too')
    const ofAnother = await theStartHooksRecord(aConversation())
    const over = await aRecordThePersonFiles(conversation, true)

    const proxy = await aRecordingProxy()
    try {
      for (const [because, told] of [
        ['an agent holds it', held],
        ['it names another conversation', ofAnother],
        ['it is over', over],
      ] as const) {
        writeFileSync(join(NOTES, `session-${conversation}.json`), JSON.stringify({ id: mine, at: '2026-09-29 20:00', supersedes: told }), 'utf8')
        const before = JSON.stringify((await aRecord(told)).data)
        const from = proxy.asked.length
        await aTurnEnds(conversation, proxy.url)

        const changes = proxy.asked.slice(from).filter((one) => !one.startsWith('GET ') && one.includes(told))
        expect(changes, `the Stop hook asked to change a record it may not close: ${because}`).toEqual([])
        expect(JSON.stringify((await aRecord(told)).data)).toBe(before)
        expect(theWholeNote(conversation), `the note still names ${told} to close`).toEqual({ id: mine, at: '2026-09-29 20:00' })
        // THE TURN WENT THROUGH THE PROXY: every Stop reads the record its note names before it stamps it.
        expect(proxy.asked.slice(from).some((one) => one.includes(mine)), 'the turn went past the proxy unseen').toBe(true)
      }
    } finally {
      await proxy.close()
    }
  }, 240_000)

  it('keeps the superseded name while the office does not answer the re-check or the close, and closes it later', async () => {
    const conversation = aConversation()
    const theHooks = await theStartHooksRecord(conversation)
    await registerAndCollect('note-no-answer', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-no-answer')
    expect(theWholeNote(conversation)).toEqual({ id: mine, at: expect.any(String), supersedes: theHooks, workspace: 'default', supersedesWorkspace: 'default' })

    // THE FIRST TURN: THE RE-CHECK OF THE START HOOK'S RECORD GETS NO ANSWER.
    const noRead = await aRecordingProxy((asked) => (asked === `GET /api/records/${theHooks}` ? 'drop' : null))
    try {
      await aTurnEnds(conversation, noRead.url)
    } finally {
      await noRead.close()
    }
    expect(noRead.asked, 'the turn never asked about the record').toContain(`GET /api/records/${theHooks}`)
    expect(theWholeNote(conversation)?.['supersedes'], 'the name was dropped although the re-check got no answer').toBe(theHooks)
    expect((await aRecord(theHooks)).data['state']).not.toBe('finished')

    // THE SECOND TURN: THE RE-CHECK IS ANSWERED, AND THE CLOSE GETS NO ANSWER.
    const noClose = await aRecordingProxy((asked) => (asked === `PATCH /api/records/${theHooks}` ? 'drop' : null))
    try {
      await aTurnEnds(conversation, noClose.url)
    } finally {
      await noClose.close()
    }
    expect(noClose.asked, 'the turn never tried the close').toContain(`PATCH /api/records/${theHooks}`)
    expect(theWholeNote(conversation)?.['supersedes'], 'the name was dropped although the close got no answer').toBe(theHooks)
    expect((await aRecord(theHooks)).data['state']).not.toBe('finished')

    // THE THIRD TURN, WITH THE OFFICE ANSWERING: the record is closed, and the name leaves the note.
    await aTurnEnds(conversation)
    expect((await aRecord(theHooks)).data['state'], 'a later turn did not close it').toBe('finished')
    expect(theWholeNote(conversation)).toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
  }, 240_000)

  it('keeps the superseded name while a reply says nothing about the record, and lets it go on a judgment', async () => {
    const conversation = aConversation()
    const theHooks = await theStartHooksRecord(conversation)
    await registerAndCollect('note-says-nothing', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-says-nothing')
    expect(theWholeNote(conversation)).toEqual({ id: mine, at: expect.any(String), supersedes: theHooks, workspace: 'default', supersedesWorkspace: 'default' })

    const read = `GET /api/records/${theHooks}`
    const close = `PATCH /api/records/${theHooks}`
    /** One turn in which the proxy answers `asked` with `reply`, so the office never sees that request. */
    const aTurnAnswered = async (asked: string, reply: AReplyInstead): Promise<string[]> => {
      const proxy = await aRecordingProxy((one) => (one === asked ? reply : null))
      try {
        await aTurnEnds(conversation, proxy.url)
      } finally {
        await proxy.close()
      }
      expect(proxy.asked, `the turn never asked ${asked}`).toContain(asked)
      return proxy.asked
    }

    // REPLIES THAT SAY NOTHING ABOUT THE RECORD: each keeps the name, and the record stays open.
    for (const [what, asked, reply] of [
      ['a key not accepted, to the re-check', read, { status: 401, body: '{"error":"The key was not accepted."}' }],
      ['too many requests, to the re-check', read, { status: 429, body: '{"error":"Too many requests."}' }],
      ['a 200 that is not JSON, to the re-check', read, { status: 200, body: '<html>busy</html>', type: 'text/html' }],
      ['a key not accepted, to the close', close, { status: 401, body: '{"error":"The key was not accepted."}' }],
      ['too many requests, to the close', close, { status: 429, body: '{"error":"Too many requests."}' }],
    ] as const) {
      await aTurnAnswered(asked, reply)
      expect(theWholeNote(conversation)?.['supersedes'], `the name was dropped after ${what}`).toBe(theHooks)
      expect((await aRecord(theHooks)).data['state'], `the record was closed after ${what}`).not.toBe('finished')
    }

    // THE OFFICE REFUSING THE CLOSE IS A JUDGMENT: the name leaves the note, and the record stays open for a person.
    await aTurnAnswered(close, { status: 409, body: '{"error":"The run cannot finish."}' })
    expect(theWholeNote(conversation), 'the name was kept although the office refused the close').toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
    expect((await aRecord(theHooks)).data['state']).not.toBe('finished')

    // SO IS THE RECORD FOUND GONE: the name leaves the note, and the hook asks to change nothing.
    const named = { id: mine, at: '2026-09-29 22:00', supersedes: theHooks }
    writeFileSync(join(NOTES, `session-${conversation}.json`), JSON.stringify(named), 'utf8')
    const gone = await aTurnAnswered(read, { status: 404, body: `{"error":"No record with id ${theHooks}."}` })
    expect(gone, 'the hook asked to close a record it was told is gone').not.toContain(close)
    expect(theWholeNote(conversation), 'the name was kept although the record was found gone').toEqual({ id: mine, at: '2026-09-29 22:00' })

    // AND WITH THE OFFICE ANSWERING, the record is closed.
    writeFileSync(join(NOTES, `session-${conversation}.json`), JSON.stringify(named), 'utf8')
    await aTurnEnds(conversation)
    expect((await aRecord(theHooks)).data['state'], 'the office answering did not close it').toBe('finished')
    expect(theWholeNote(conversation)).toEqual({ id: mine, at: '2026-09-29 22:00' })
  }, 300_000)

  it('names nothing as superseded when the record the note named is already over', async () => {
    const conversation = aConversation()
    const theHooks = await theStartHooksRecord(conversation)
    const closed = await fetch(`${api}/api/records/${theHooks}`, {
      method: 'PATCH',
      headers: AS_THE_PERSON(),
      body: JSON.stringify({ dataPatch: { state: 'finished', detail: 'closed by the person' } }),
    })
    expect(closed.status, await closed.clone().text()).toBe(200)

    await registerAndCollect('note-after-a-close', ['--provider-session', conversation])
    const mine = await theSessionRecordOf('note-after-a-close')

    expect(theWholeNote(conversation), 'a record already over was named as superseded').toEqual({ id: mine, at: expect.any(String), workspace: 'default' })
  }, 180_000)
})
