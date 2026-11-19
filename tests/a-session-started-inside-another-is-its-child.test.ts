// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION STARTED BY HAND INSIDE ANOTHER SESSION FILES ITS OWN RECORD, AS THAT RUN'S CHILD. Problem c3p75p8aALd2,
 * design SJUJkry2nwH_, with the secretary's addition from round 50's brief.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A session started inside another session's terminal inherits its environment, MOLE_OFFICE_SESSION included. The
 * session hook took the run that variable names as this session's own, whatever conversation that run already was. So
 * the inner session stamped its own process on the outer session's run, wrote its usage receipt over the outer one's,
 * and recorded its compactions there. Nothing of the inner session was on a record of its own.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. The first start of a run that names no conversation yet writes its conversation on that run.
 *   2. A start whose run names another conversation, while that conversation still runs, is that run's child: it files
 *      its own record with the run as its parent, writes a note saying so, and writes nothing on the run. Its
 *      compactions, stops and end are written on its own record.
 *   3. Whether the other conversation still runs is read from the process recorded on the run: it still runs when that
 *      process is still the one recorded, and it has ended when no process runs under its number. When that cannot be
 *      told, for example when no process is recorded, the start is a child too, because a child writes nothing on
 *      another conversation's run.
 *   4. When that conversation has ended, the start takes the run over, as before: it writes its own conversation on
 *      the run, and its process replaces the recorded one.
 *   5. When the process recorded on the run is this session's own, found by walking up from the hook, the start takes
 *      the run over too: one process has moved from that conversation to this one, as /clear does. A process named
 *      only by CLAUDE_PID is not taken for this session's own, because a session started inside another inherits the
 *      outer session's CLAUDE_PID.
 *   6. A stop or end with no note writes no usage receipt on a run that names another conversation.
 *   7. A compaction with no child note, in a session whose run names another conversation, writes nothing on that run:
 *      no stamp and no compaction. It says so, and searches for no other record (line round 51, part C's first gap).
 *   8. A start that takes the run over writes a whole new discovery stamp: this conversation, its transcript, and its
 *      process with the flags it was started with, which the way back reads (src/config/the-way-back.mjs). The old
 *      process's number is kept in `pidReplaced`. When this session's transcript is not on disk, the old stamp stays
 *      as it was and the start says why (line round 51, part C's second gap).
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER CONVERSATION'S PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * It is a real process: a shell script called `claude`, which the office takes for the claude program by its name, as
 * it does every test wrapper here. It is started in its own process group, stamped on the run the way the hook stamps
 * a run, and stopped by that group. For "it has ended" it is stopped before the hook runs.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL on the hook before this change: red, all seven cases. Each start took the run as its own: the run naming no
 * conversation was not given this one, no child was filed in the three child cases, the two takeovers left the old
 * conversation on the run, and the stop with no note wrote its receipt on the other conversation's run.
 *
 * Each mutation below was made in tools/session-hook.mjs, the file was run, and the change was put back and the file
 * run again, green:
 *   - THE READING SAYS IT HAS ENDED. `whetherTheRecordedProcessRuns` answered `runs: 'no'` in the hook: red, the cases
 *     "still runs", "no process is recorded" and "CLAUDE_PID" took the run over.
 *   - THE READING SAYS IT STILL RUNS. It answered `runs: 'yes'`: red, the case "has ended" filed a child, and the case
 *     "no process is recorded" said that conversation still runs.
 *   - NO FIRST WRITE. The write of this conversation on a run naming none was left out: red, case 1.
 *   - NO OWN PROCESS. The check that the recorded process is this session's own was left out: red, the /clear case.
 *   - CLAUDE_PID TAKEN FOR THE WALK. The check that the walk found this session's process was left out: red, the
 *     CLAUDE_PID case took the run over.
 *   - NO STOP GUARD. A stop with no note wrote the receipt on a run naming another conversation: red, that case.
 *   - THE COMPACTION ON THE RUN. After a compaction the hook asked about the run the environment names before the note's:
 *     red, the compaction was recorded on the run.
 *
 * Round 51 added cases 7 and 8. CONTROL on the hook before that round: red, the compaction with no child note wrote
 * the compaction on the run, the two takeovers left the old conversation's transcript in the stamp, and the takeover
 * with no transcript said nothing about it. The check of the start flags came after a first takeover stamp that left
 * them out; on that stamp it was red, the first takeover. Its mutations, each put back after:
 *   - NO GUARD AFTER A COMPACTION. The check that a compaction with no note names another conversation's run was left
 *     out: red, case 7.
 *   - THE TAKEOVER STAMPED AS BEFORE. `stampTheRecord` was not told the start took the run over: red, the two
 *     takeovers and the takeover with no transcript.
 *   - NO START FLAGS. The takeover's stamp was written with the process's number, start and command but not its
 *     `pidFlags`: red, the first takeover.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS THE REAL HOOK AGAINST A REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 * `node tools/session-hook.mjs <mode>` with a hook payload on stdin, as tests/the-hook-writes-down-which-conversation-
 * this-is.test.ts runs it, against a listening server on a throwaway database. The notes it writes in `.logs` are
 * removed after each case.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theProcessBehindTheHook } from '../src/config/session-process.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const HANDLE = 'a-nesting-agent'

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
const otherConversations: ChildProcess[] = []

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-nested-'))
  mkdirSync(join(scratch, 'home'))
  const registered = await server.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: 'A nesting agent' } })
  expect(registered.statusCode, registered.body).toBe(201)
}, 60_000)

afterEach(async () => {
  for (const one of otherConversations.splice(0)) await stopped(one)
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

/**
 * The other conversation's process: a `claude` script in its own process group, waiting until it is stopped. It ends by
 * itself after five minutes, so a run of this file that dies before its cleanup leaves nothing running for long.
 */
async function anotherConversationsProcess(): Promise<{ child: ChildProcess; stamp: Record<string, unknown> }> {
  const folder = join(scratch, `other-${String(otherConversations.length)}`)
  mkdirSync(folder)
  const path = join(folder, 'claude')
  writeFileSync(path, '#!/bin/sh\ni=0\nwhile [ "$i" -lt 300 ]; do sleep 1; i=$((i + 1)); done\n', { mode: 0o755 })
  const child = spawn(path, [], { detached: true, stdio: 'ignore' })
  otherConversations.push(child)
  const pid = child.pid!
  let facts = theProcessBehindTheHook(pid)
  for (let tries = 0; !facts.recorded && tries < 50; tries += 1) {
    await new Promise((done) => setTimeout(done, 50))
    facts = theProcessBehindTheHook(pid)
  }
  expect(facts.recorded, `the other conversation's process was not read as the claude program: ${String(facts.why)}`).toBe(true)
  return { child, stamp: { pid: facts.pid, pidStartedAt: facts.pidStartedAt, pidCommand: facts.pidCommand } }
}

/** Stop a process this file started, by its own process group, and wait until it has been collected. */
async function stopped(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const gone = new Promise<void>((done) => child.once('exit', () => done()))
  try {
    process.kill(-child.pid!, 'SIGTERM')
  } catch {
    return
  }
  await gone
}

/** A running run of the agent, filed by the person, as a starter files one. */
async function aRun(data: Record<string, unknown>): Promise<string> {
  const made = await server.app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title: 'the outer run', data: { state: 'running', runtime: 'claude-code', servingAgent: HANDLE, ...data } } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

function theRecord(id: string) {
  const one = t.api.getRecord(id)
  expect(one, `record ${id} is not there`).not.toBeNull()
  return one!
}

function theSessions() {
  return t.api.listRecords({ workspaceId: 'default', kind: 'session' })
}

function theNoteOf(sessionId: string): Record<string, unknown> | null {
  const path = join(CHECKOUT, '.logs', `session-${sessionId}.json`)
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : null
}

/**
 * Run the hook as Claude Code runs it, with the environment naming `run`, and hand back what it printed.
 *
 * `behindClaude` runs it under a wrapper called `claude`, so the hook finds a session process above itself. The wrapper
 * prints its own pid and waits for a line on its stdin before it starts the hook, so `beforeItRuns` can write that pid
 * on the run first: that is how a run names this session's own process. `flags` go on the wrapper's command line, where
 * the hook reads the start flags of this session's process; the hook itself ignores them. CLAUDE_PID, TMUX_PANE, any
 * key and the office tool's configuration are never inherited from the shell that runs this file.
 */
async function theHook(
  mode: 'start' | 'stop' | 'end',
  run: string,
  payload: Record<string, unknown>,
  more: { behindClaude?: boolean; flags?: string[]; env?: Record<string, string>; beforeItRuns?: (wrapperPid: number) => Promise<void> } = {},
): Promise<{ out: string; err: string; wrapperPid: number | null }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: join(scratch, 'home'),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: HANDLE,
    MOLE_OFFICE_SESSION: run,
  }
  for (const name of ['TMUX_PANE', 'CLAUDE_PID', 'MOLE_AGENT_KEY', 'SANDBOX_DIR', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
  Object.assign(env, more.env ?? {})
  const wrapper = join(scratch, 'claude')
  if (more.behindClaude === true) {
    writeFileSync(wrapper, `#!/bin/sh\necho "WRAPPER-PID $$"\nIFS= read -r go\n"${process.execPath}" "$@"\n`, { mode: 0o755 })
  }
  const child = more.behindClaude === true ? spawn(wrapper, [HOOK, mode, ...(more.flags ?? [])], { env }) : spawn(process.execPath, [HOOK, mode], { env })
  let out = ''
  let err = ''
  let wrapperPid: number | null = null
  let sent = false
  let failed: unknown = null
  const send = () => {
    sent = true
    child.stdin!.end(`${more.behindClaude === true ? 'go\n' : ''}${JSON.stringify(payload)}`)
  }
  const ended = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  child.stderr!.on('data', (chunk) => (err += String(chunk)))
  child.stdout!.on('data', (chunk) => {
    out += String(chunk)
    const said = /^WRAPPER-PID (\d+)\n/.exec(out)
    if (said !== null && !sent && wrapperPid === null) {
      wrapperPid = Number(said[1])
      void (more.beforeItRuns ?? (async () => {}))(wrapperPid).then(send, (error: unknown) => {
        failed = error
        send()
      })
    }
  })
  if (more.behindClaude !== true) send()
  const code = await ended
  if (failed !== null) throw failed
  expect(code, `the hook exited ${String(code)}: ${err}`).toBe(0)
  return { out: out.replace(/^WRAPPER-PID \d+\n/, ''), err, wrapperPid }
}

describe('a start whose run names no conversation yet', () => {
  it('writes its own conversation on the run, and files nothing else', async () => {
    const run = await aRun({})
    const id = aSessionId()
    const before = theSessions().length
    const { out } = await theHook('start', run, { session_id: id, cwd: scratch })
    expect(theRecord(run).data['providerSession']).toBe(id)
    expect(theSessions().length).toBe(before)
    expect(out).toContain(`This session is filed as record ${run}, the run its environment names (MOLE_OFFICE_SESSION).`)
    expect(out).toContain(`Run ${run} named no conversation yet, so this start wrote this one (${id}) on it.`)
  }, 60_000)
})

describe('a start whose run names another conversation that still runs', () => {
  it('files its own record as the run\'s child, writes nothing on the run, and keeps its compaction, stop and end on its own record', async () => {
    const other = await anotherConversationsProcess()
    const outer = 'the-outer-conversation'
    const run = await aRun({ providerSession: outer, extra: { discovered: { tool: 'claude-code', externalId: outer, logPath: aTranscript('outer.jsonl'), ...other.stamp } } })
    const runBefore = theRecord(run).data
    const id = aSessionId()
    const transcript = aTranscript('inner.jsonl')

    const { out, wrapperPid } = await theHook('start', run, { session_id: id, transcript_path: transcript, cwd: scratch }, { behindClaude: true })

    const filed = theSessions().filter((one) => one.id !== run)
    expect(filed.length, out).toBe(1)
    const child = filed[0]!
    expect(child.data['parentAttachment']).toBe(run)
    expect(child.data['providerSession']).toBe(id)
    expect((child.data['extra'] as { discovered?: { externalId?: string; pid?: number } }).discovered).toMatchObject({ externalId: id, pid: wrapperPid })
    expect(theRecord(run).data, 'the start wrote on the outer run').toEqual(runBefore)
    expect(theNoteOf(id)).toMatchObject({ id: child.id, childOf: run, workspace: 'default' })
    expect(out).toContain(`that conversation still runs: its recorded process ${String(other.stamp['pid'])} is the one that was recorded.`)
    expect(out).toContain(`it filed its own record ${child.id}, with run ${run} as its parent, and wrote nothing on run ${run}.`)

    // AFTER A COMPACTION the compaction is recorded on the child's own record, which its note names.
    await theHook('start', run, { session_id: id, transcript_path: transcript, cwd: scratch, source: 'compact' }, { behindClaude: true })
    expect((theRecord(child.id).data['compactions'] as unknown[] | undefined)?.length, 'the compaction is not on the child').toBe(1)
    expect(theRecord(run).data, 'the compaction wrote on the outer run').toEqual(runBefore)

    // A STOP AND AN END find the child through the note, and close it; the outer run is left as it was.
    writeFileSync(transcript, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { id: 'msg_1', model: 'claude-opus-5', usage: { input_tokens: 5, output_tokens: 7 } } }) + '\n')
    await theHook('stop', run, { session_id: id, transcript_path: transcript, cwd: scratch })
    await theHook('end', run, { session_id: id, transcript_path: transcript, cwd: scratch, reason: 'other' })
    expect(theRecord(child.id).data).toMatchObject({ state: 'finished', usageReceipt: { inputTokens: 5, outputTokens: 7 } })
    expect(theRecord(run).data, 'the stop or end wrote on the outer run').toEqual(runBefore)
  }, 90_000)

  it('writes nothing on another conversation\'s run after a compaction when this session has no child note', async () => {
    const other = await anotherConversationsProcess()
    const outer = 'the-outer-conversation'
    const run = await aRun({ providerSession: outer, compactions: [], extra: { discovered: { tool: 'claude-code', externalId: 'the-earlier-stamped-conversation', logPath: aTranscript('outer.jsonl'), ...other.stamp } } })
    const runBefore = theRecord(run).data
    const id = aSessionId()
    expect(theNoteOf(id)).toBeNull()

    const { out } = await theHook('start', run, { session_id: id, transcript_path: aTranscript('inner.jsonl'), cwd: scratch, source: 'compact' }, { behindClaude: true })

    expect(theRecord(run).data['compactions'], 'the compaction wrote on the outer run').toEqual(runBefore['compactions'])
    expect((theRecord(run).data['extra'] as { discovered?: unknown }).discovered, 'the compaction stamped the outer run').toEqual((runBefore['extra'] as { discovered?: unknown }).discovered)
    expect(out).toContain(`This compaction was not recorded on run ${run}, because that run names another conversation (${outer}) and this session has no note naming a record of its own. Nothing was written on that run.`)
  }, 60_000)

  it('is a child too when no process is recorded on the run, because whether that conversation runs cannot be told', async () => {
    const run = await aRun({ providerSession: 'the-outer-conversation' })
    const runBefore = theRecord(run).data
    const id = aSessionId()
    const { out } = await theHook('start', run, { session_id: id, cwd: scratch })
    const filed = theSessions().filter((one) => one.id !== run)
    expect(filed.length, out).toBe(1)
    expect(filed[0]!.data['parentAttachment']).toBe(run)
    expect(theRecord(run).data).toEqual(runBefore)
    expect(out).toContain('whether that conversation still runs cannot be told: no process was recorded for it.')
  }, 60_000)

  it('is a child when CLAUDE_PID names the run\'s process, because a session started inside another inherits it', async () => {
    const other = await anotherConversationsProcess()
    const outer = 'the-outer-conversation'
    const run = await aRun({ providerSession: outer, extra: { discovered: { tool: 'claude-code', externalId: outer, logPath: aTranscript('outer.jsonl'), ...other.stamp } } })
    const runBefore = theRecord(run).data
    const id = aSessionId()
    const { out } = await theHook('start', run, { session_id: id, cwd: scratch }, { env: { CLAUDE_PID: String(other.stamp['pid']) } })
    const filed = theSessions().filter((one) => one.id !== run)
    expect(filed.length, out).toBe(1)
    expect(filed[0]!.data['parentAttachment']).toBe(run)
    expect(theRecord(run).data).toEqual(runBefore)
  }, 60_000)
})

describe('a start whose run names another conversation that has ended', () => {
  it('takes the run over: its conversation is written on the run and its process replaces the recorded one', async () => {
    const other = await anotherConversationsProcess()
    await stopped(other.child)
    const outer = 'the-outer-conversation'
    const theirFlags = { kept: [{ name: '--model', value: 'the-outer-model' }], dropped: [] }
    const run = await aRun({
      providerSession: outer,
      extra: { discovered: { tool: 'claude-code', externalId: outer, logPath: aTranscript('outer.jsonl'), ...other.stamp, pidFlags: theirFlags } },
    })
    const id = aSessionId()
    const before = theSessions().length
    const transcript = aTranscript('inner.jsonl')

    const { out, wrapperPid } = await theHook('start', run, { session_id: id, transcript_path: transcript, cwd: scratch }, {
      behindClaude: true,
      flags: ['--model', 'the-inner-model', '--verbose'],
    })

    expect(theSessions().length, out).toBe(before)
    const data = theRecord(run).data
    expect(data['providerSession']).toBe(id)
    expect((data['extra'] as { discovered?: unknown }).discovered).toMatchObject({ pid: wrapperPid, pidReplaced: other.stamp['pid'] })
    expect((data['extra'] as { discovered?: unknown }).discovered).toMatchObject({ externalId: id, logPath: transcript })
    // THE WAY BACK READS THESE FLAGS, so after a takeover they are this session's, never the ended conversation's.
    expect((data['extra'] as { discovered: { pidFlags?: unknown } }).discovered.pidFlags).toEqual({
      kept: [{ name: '--model', value: 'the-inner-model' }],
      dropped: ['--verbose'],
    })
    expect(theNoteOf(id)).toBeNull()
    expect(out).toContain(`Run ${run} named another conversation (${outer}), which is no longer running: its recorded process ${String(other.stamp['pid'])} is not alive.`)
    expect(out).toContain(`So this session took the run over and wrote this conversation (${id}) on it.`)
  }, 60_000)

  it('takes the run over when the recorded process is this session\'s own, which has moved to a new conversation', async () => {
    const outer = 'the-outer-conversation'
    const run = await aRun({ providerSession: outer })
    const id = aSessionId()
    const before = theSessions().length
    const transcript = aTranscript('inner.jsonl')
    const { out, wrapperPid } = await theHook('start', run, { session_id: id, transcript_path: transcript, cwd: scratch, source: 'clear' }, {
      behindClaude: true,
      beforeItRuns: async (pid) => {
        const facts = theProcessBehindTheHook(pid)
        expect(facts.recorded, String(facts.why)).toBe(true)
        t.api.patchRecord(run, { dataPatch: { extra: { discovered: { tool: 'claude-code', externalId: outer, logPath: aTranscript('outer.jsonl'), pid: facts.pid, pidStartedAt: facts.pidStartedAt, pidCommand: facts.pidCommand } } } }, t.api.HUMAN)
      },
    })
    expect(theSessions().length, out).toBe(before)
    expect(theRecord(run).data['providerSession']).toBe(id)
    expect((theRecord(run).data['extra'] as { discovered?: unknown }).discovered).toMatchObject({ externalId: id, logPath: transcript })
    expect(out).toContain(`which is no longer running: its recorded process ${String(wrapperPid)} is this session's own process, which has left that conversation for this one.`)
  }, 60_000)

  it('keeps the old stamp and says why when a takeover has no transcript on disk', async () => {
    const other = await anotherConversationsProcess()
    await stopped(other.child)
    const outer = 'the-outer-conversation'
    const extra = { kept: 'another writer put this here', discovered: { tool: 'claude-code', externalId: outer, logPath: aTranscript('outer.jsonl'), ...other.stamp } }
    const run = await aRun({ providerSession: outer, extra })
    const id = aSessionId()
    const { out } = await theHook('start', run, { session_id: id, transcript_path: join(scratch, 'not-on-disk.jsonl'), cwd: scratch }, { behindClaude: true })

    expect(theRecord(run).data['providerSession']).toBe(id)
    expect(theRecord(run).data['extra'], 'no transcript was observed, so nothing should change in the stamp').toEqual(extra)
    expect(out).toContain(`The discovery stamp of run ${run} still names the conversation that ended (${outer}), because this session's transcript was not found.`)
  }, 60_000)
})

describe('a stop with no note', () => {
  it('writes no usage receipt on a run that names another conversation, and says why', async () => {
    const outer = 'the-outer-conversation'
    const run = await aRun({ providerSession: outer })
    const id = aSessionId()
    const transcript = aTranscript('inner.jsonl')
    writeFileSync(transcript, JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() + 1_000).toISOString(), message: { id: 'msg_1', model: 'claude-opus-5', usage: { input_tokens: 5, output_tokens: 7 } } }) + '\n')
    const { err } = await theHook('stop', run, { session_id: id, transcript_path: transcript, cwd: scratch })
    expect(theRecord(run).data['usageReceipt'], err).toBeUndefined()
    expect(err).toContain(`session-hook: the usage receipt of run ${run} was not written, because that run names another conversation (${outer}), not this one (${id}).`)
  }, 60_000)
})
