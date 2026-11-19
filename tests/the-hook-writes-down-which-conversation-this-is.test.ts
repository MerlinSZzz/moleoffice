// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK WRITES DOWN WHICH CONVERSATION A RUN IS, AND INVENTS NOTHING WHEN IT CANNOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `stampOf` in src/server/lib/sessions.ts needs three keys — `tool`, `externalId`, `logPath` — and
 * returns null if any is missing. Measured 27 August 2026: **0 of 103 session records carry
 * `data.extra.discovered`**, so `pickUpOf` answers `never-observed` for every one and every row in
 * the recipient picker reads *Needs a new run*. Nothing had ever written the stamp onto the record
 * it filed. This file is the proof that it does now.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. When the transcript exists, the record the hook files carries all three keys, `stampOf`
 *      reads it back, and `pickUpOf` stops saying `never-observed`.
 *   2. **When the transcript does not exist, nothing is written and the hook says so.** A computed
 *      path that names no file is not an observation, and a stamp built from one would claim a
 *      conversation is on this machine when it is not.
 *   3. The stamp is written whole or not at all. There is no half-stamp with two of the three.
 *   4. A later run of the hook — the `stop` and `end` modes — completes a stamp the start could not
 *      write, and leaves an already-stamped record alone.
 *   5. **Nothing backfills any other record.** A hook run stamps the run that is happening and
 *      nothing else, and this file asserts the count of other stamped records stays zero.
 *   6. The attachment's own facts — which provider session, which machine, which directory — land
 *      on the same record at the same moment, and a fact this run does not know is left out.
 *   7. **The session's own process is written down beside the conversation.** The hook is started
 *      by the session it files for, so its parent pid, that process's true start time and its
 *      command line land on the record — the one sign of life a session waiting in its terminal
 *      still gives. When the hook's parent is not the claude program, no process is written and
 *      the line the hook prints says so.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the fifteen cases below, all green.
 *
 * MUTATION — DROP THE PROCESS WRITE. In tools/session-hook.mjs, `withProcessFacts` was made to
 * return the stamp unchanged, so the pid, its start time and its command line never reached the
 * record. The case "writes the pid, its true start time and its command line onto the record" went
 * red; the other fourteen stayed green. The change was put back and the control repeated, green.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS THE REAL HOOK AGAINST A REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 * `node tools/session-hook.mjs start` with a hook payload on stdin, against a listening server on
 * one throwaway database and one listening server for the file. Case writes are rolled back and
 * `.logs` points somewhere disposable. Nothing here imports the hook's
 * functions and calls them, because what is being tested is the thing Claude Code actually runs.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string

beforeAll(async () => {
  t = await freshDb()
  // A LISTENING SERVER ON THE SAME THROWAWAY DATABASE THIS TEST READS. The hook is a separate
  // process that only speaks HTTP, so there has to be something to speak to; and it has to be the
  // same corpus, or the test would be reading a different database from the one the hook wrote to.
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
})

// Each case starts from the database the one server started with. Requests and readers share this
// connection, so rolling its savepoint back removes every record, revision and delivery the case wrote.
beforeEach(() => {
  t.client.sqlite.exec('SAVEPOINT hook_case')
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-'))
})

afterEach(() => {
  t.client.sqlite.exec('ROLLBACK TO hook_case; RELEASE hook_case')
  rmSync(scratch, { recursive: true, force: true })
})

afterAll(async () => {
  await server.app.close()
  t.close()
})

/** A transcript file on disk, the way a conversation that has said anything has one. */
function aTranscript(name = 'conversation.jsonl'): string {
  const path = join(scratch, name)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/**
 * Run the hook the way Claude Code runs it: a mode, a JSON payload on stdin, and nothing else.
 *
 * **IT MUST NOT BE `execFileSync`.** The server this hook talks to is listening in THIS process,
 * and a synchronous child would block the event loop that has to answer it — every request would
 * time out and the hook would print *Mole Office is not answering*, which reads exactly like a broken
 * hook. Measured by writing it that way first: twelve failures, none of them about the hook.
 *
 * `.logs` is inside the checkout, so the note file this writes lands beside the real ones. The
 * session ids here are ones nothing else will ever use, and the notes are removed afterwards.
 *
 * **THE TERMINAL IS SET HERE, NEVER INHERITED.** The hook reads `TMUX_PANE` out of the environment
 * it is handed, and vitest hands a child whatever the shell had. This project is worked on inside
 * tmux, so the shell usually has one — and the test below that asserts no terminal was recorded
 * used to fail for everybody working that way and pass for everybody else. Problem `9ck8oqm7lszz`.
 * `terminal` says which environment the child gets: `null` for a run in no tmux pane, which is what
 * every test that says nothing about it wants, and a pane name for the one test about being in one.
 */
async function runHook(
  mode: 'start' | 'stop' | 'end',
  payload: Record<string, unknown>,
  terminal: string | null = null,
): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  if (terminal === null) delete env['TMUX_PANE']
  else env['TMUX_PANE'] = terminal
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, mode], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify(payload))
  })
}

/**
 * Run the hook as the child of a process whose command line names the claude program.
 *
 * The hook records its parent only when that parent names claude, and a test runner does not. This
 * wrapper is a shell script called `claude`, so the hook's parent command line is
 * `/bin/sh <scratch>/claude <hook> start` — the same shape a real session gives it. The wrapper
 * prints its own pid first, then runs node and waits, so the shell is still the parent while the
 * hook runs.
 */
async function runHookBehindAClaudeProcess(
  mode: 'start' | 'stop' | 'end',
  payload: Record<string, unknown>,
): Promise<string> {
  const wrapper = join(scratch, 'claude')
  writeFileSync(wrapper, `#!/bin/sh\necho "WRAPPER-PID $$"\n"${process.execPath}" "$@"\n`, { mode: 0o755 })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  delete env['TMUX_PANE']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile(wrapper, [HOOK, mode], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify(payload))
  })
}

/** The notes the hook leaves beside the checkout, removed so one test cannot see another's. */
const notesWritten: string[] = []

afterEach(() => {
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** The one session record in the throwaway corpus, read through the product's own reader. */
function theRecord() {
  const rows = t.api.listRecords({ workspaceId: 'default', kind: 'session' })
  expect(rows.length, 'the hook filed something other than exactly one session record').toBe(1)
  return rows[0]!
}

/** How many session records in the whole corpus carry a stamp. */
function stampedCount(): number {
  const row = t.client.sqlite
    .prepare(
      "SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.discovered') IS NOT NULL",
    )
    .get() as { n: number }
  return row.n
}

// ============================================================ the stamp lands

describe('when the transcript exists, the hook writes down which conversation this is', () => {
  it('writes all three keys, and the product reader reads them back', async () => {
    const externalId = aSessionId()
    const transcript = aTranscript()
    const out = await runHook('start', { session_id: externalId, transcript_path: transcript, cwd: scratch })
    expect(out).toContain('MOLE OFFICE —')

    const sessions = await import('../src/server/lib/sessions.ts')
    const stamp = sessions.stampOf(theRecord())
    expect(stamp, 'stampOf read nothing back, which is what 0 of 103 records look like').not.toBeNull()
    expect(stamp?.tool).toBe('claude-code')
    expect(stamp?.externalId).toBe(externalId)
    expect(stamp?.logPath).toBe(transcript)
  })

  it('stops the picker answering never-observed for this run', async () => {
    await runHook('start', { session_id: aSessionId(), transcript_path: aTranscript(), cwd: scratch })
    const recipients = await import('../src/server/lib/recipients.ts')
    const answer = recipients.pickUpOf(theRecord())
    // `why` is only on the negative arms of the answer, so its absence IS the good news here.
    const why = 'why' in answer ? answer.why : null
    expect(why, 'this is the string that made every picker row read "Needs a new run"').not.toBe('never-observed')
  })

  it('says so in the line the agent reads', async () => {
    const out = await runHook('start', { session_id: aSessionId(), transcript_path: aTranscript(), cwd: scratch })
    expect(out).toMatch(/conversation is written down on its record/)
  })

  it('lands the attachment own facts at the same moment, and leaves out what it does not know', async () => {
    const externalId = aSessionId()
    await runHook('start', { session_id: externalId, transcript_path: aTranscript(), cwd: scratch })
    const data = theRecord().data as Record<string, unknown>
    expect(data['providerSession']).toBe(externalId)
    expect(data['workingDirectory']).toBe(scratch)
    expect(typeof data['machine']).toBe('string')
    // THE CHILD WAS GIVEN NO TMUX PANE, by `runHook` and not by whatever shell started this run.
    // A run in no pane says nothing about a terminal. An absent key is the honest answer; a
    // terminal called "unknown" would be a made-up place to go and watch.
    expect(Object.keys(data)).not.toContain('terminal')
  })

  it('records the terminal when the run really is in one, rather than never saying', async () => {
    // THE OTHER HALF, so that "no terminal" is a reading and not an accident of where the suite was
    // started. This is the environment a session inside tmux hands the hook, built here on purpose.
    await runHook('start', { session_id: aSessionId(), transcript_path: aTranscript(), cwd: scratch }, '%42')

    expect((theRecord().data as Record<string, unknown>)['terminal']).toBe('tmux %42')
  })
})

// ============================================================ and does not when it cannot

describe('when the transcript does not exist, nothing is written down', () => {
  it('writes no stamp for a path that names no file', async () => {
    await runHook('start', {
      session_id: aSessionId(),
      transcript_path: join(scratch, 'a-transcript-that-was-never-written.jsonl'),
      cwd: scratch,
    })
    const sessions = await import('../src/server/lib/sessions.ts')
    expect(sessions.stampOf(theRecord()), 'a computed path is not an observation').toBeNull()
    expect(stampedCount()).toBe(0)
  })

  it('says the transcript is not there yet, rather than saying nothing', async () => {
    const out = await runHook('start', {
      session_id: aSessionId(),
      transcript_path: join(scratch, 'not-written-yet.jsonl'),
      cwd: scratch,
    })
    expect(out).toMatch(/transcript does not exist on disk yet/)
    expect(out).toMatch(/Nothing was guessed at/)
  })

  it('writes no stamp when the payload carries no transcript path at all', async () => {
    await runHook('start', { session_id: aSessionId(), cwd: scratch })
    const sessions = await import('../src/server/lib/sessions.ts')
    expect(sessions.stampOf(theRecord())).toBeNull()
  })

  it('writes no half-stamp: two of the three keys never reach the record', async () => {
    await runHook('start', { session_id: aSessionId(), cwd: scratch })
    const extra = (theRecord().data as { extra?: unknown }).extra
    expect(extra, 'a stamp missing any of the three cannot be matched to anything').toBeUndefined()
  })
})

// ============================================================ the later writers

describe('a later run of the hook completes what the first could not', () => {
  it('stamps at stop, when the transcript exists by then', async () => {
    const externalId = aSessionId()
    const transcript = join(scratch, 'written-after-the-first-turn.jsonl')
    await runHook('start', { session_id: externalId, transcript_path: transcript, cwd: scratch })

    const sessions = await import('../src/server/lib/sessions.ts')
    expect(sessions.stampOf(theRecord())).toBeNull()

    writeFileSync(transcript, '{"type":"assistant"}\n', 'utf8')
    await runHook('stop', { session_id: externalId, transcript_path: transcript, cwd: scratch })
    const stamp = sessions.stampOf(theRecord())
    expect(stamp?.externalId).toBe(externalId)
    expect(stamp?.logPath).toBe(transcript)
  })

  it('stamps at end, which is the writer that is wired today', async () => {
    const externalId = aSessionId()
    const transcript = join(scratch, 'written-by-the-end.jsonl')
    await runHook('start', { session_id: externalId, transcript_path: transcript, cwd: scratch })
    writeFileSync(transcript, '{"type":"assistant"}\n', 'utf8')
    await runHook('end', { session_id: externalId, transcript_path: transcript, cwd: scratch })

    const sessions = await import('../src/server/lib/sessions.ts')
    expect(sessions.stampOf(theRecord())?.logPath).toBe(transcript)
    expect((theRecord().data as { state?: string }).state, 'end still marks the run finished').toBe('finished')
  })

  it('leaves an already-stamped record alone rather than rewriting it', async () => {
    const externalId = aSessionId()
    const transcript = aTranscript()
    await runHook('start', { session_id: externalId, transcript_path: transcript, cwd: scratch })
    // THE WHOLE OF THE RECORD'S DATA, not a version number: `PanelRecord` has no version field, and
    // comparing one would have compared undefined with undefined and passed with the guard deleted.
    // Wave 13p round 26: every stop writes the conversation's usage so far as the run's receipt (milestone M8), so the
    // receipt is left out of the comparison and everything else must be as it was.
    const withoutTheReceipt = (data: unknown): string => {
      const { usageReceipt: _receipt, ...rest } = data as Record<string, unknown>
      return JSON.stringify(rest)
    }
    const before = withoutTheReceipt(theRecord().data)

    await runHook('stop', { session_id: externalId, transcript_path: aTranscript('a-different-file.jsonl'), cwd: scratch })
    const sessions = await import('../src/server/lib/sessions.ts')
    expect(sessions.stampOf(theRecord())?.logPath, 'what was observed first is what was observed').toBe(transcript)
    expect(withoutTheReceipt(theRecord().data), 'something besides the usage receipt was written on the record').toBe(before)
  })
})

// ============================================================ nothing is backfilled

describe('a hook run stamps the run that is happening and nothing else', () => {
  it('leaves every record it did not observe unstamped, whatever else is in the corpus', async () => {
    // Five old runs of the shape the corpus is full of: filed by hand, no stamp, nobody observed a
    // transcript. Ninety-five records in the live corpus are exactly this and they stay this way.
    for (let n = 0; n < 5; n += 1) {
      t.api.createRecord({
        kind: 'session',
        title: `an old run nobody recorded a conversation for (${n})`,
        workspaceId: 'default',
        data: { state: 'finished', runtime: 'claude-code' },
        actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
      })
    }
    expect(stampedCount()).toBe(0)

    await runHook('start', { session_id: aSessionId(), transcript_path: aTranscript(), cwd: scratch })

    expect(stampedCount(), 'exactly one record was observed, so exactly one is stamped').toBe(1)
    const sessions = await import('../src/server/lib/sessions.ts')
    const old = t.api
      .listRecords({ workspaceId: 'default', kind: 'session' })
      .filter((one) => one.title.startsWith('an old run'))
    expect(old).toHaveLength(5)
    for (const one of old) {
      expect(sessions.stampOf(one), 'nothing may invent a conversation nobody observed').toBeNull()
    }
  })
})

// ============================================================ the session's own process

describe("the hook writes down the session's own process", () => {
  it('writes the pid, its true start time and its command line onto the record', async () => {
    const externalId = aSessionId()
    const out = await runHookBehindAClaudeProcess('start', {
      session_id: externalId,
      transcript_path: aTranscript(),
      cwd: scratch,
    })

    const data = theRecord().data as Record<string, unknown>
    const discovered = ((data['extra'] as Record<string, unknown>)['discovered'] ?? {}) as Record<string, unknown>
    // THE PID IS THE WHOLE POINT. A session waiting in its terminal writes nothing to its
    // transcript, so without this the record cannot say whether it is still there.
    expect(typeof discovered['pid'], 'the hook recorded no pid').toBe('number')
    expect(typeof discovered['pidStartedAt']).toBe('string')
    expect(discovered['pidStartedAt']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(typeof discovered['pidCommand']).toBe('string')
    expect(discovered['pidCommand']).toContain('claude')

    // THE PID IS THE PROCESS THAT STARTED THE HOOK, not a number that happened to be handy. The
    // wrapper printed its own pid, and the line the hook prints carries the same pid and stamp.
    const printedPid = /WRAPPER-PID (\d+)/.exec(out)?.[1] ?? null
    expect(printedPid, 'the wrapper did not say which process it was').not.toBeNull()
    expect(discovered['pid']).toBe(Number(printedPid))
    expect(out).toContain(`pid ${String(discovered['pid'])}`)
    expect(out).toContain(String(discovered['pidStartedAt']))
  })

  it('writes no process when the hook was not started by the claude program, and says why', async () => {
    const out = await runHook('start', { session_id: aSessionId(), transcript_path: aTranscript(), cwd: scratch })
    const data = theRecord().data as Record<string, unknown>
    const discovered = ((data['extra'] as Record<string, unknown>)['discovered'] ?? {}) as Record<string, unknown>
    expect(discovered['pid']).toBeUndefined()
    expect(out).toContain("This run's own process is NOT on its record")
  })
})

