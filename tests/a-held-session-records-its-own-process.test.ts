// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION HOLDING A HANDLE RECORDS ITS OWN CLAUDE PROCESS, AND EVERY REFUSAL WRITES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A durable agent's letters went to the owner twice — one agent's on 23 September 2026, another's on the 24th
 * — because the record holding the agent's handle named no process. The reading that decides needs
 * both a transcript and a live process (criteria M106 and M126), the start hook writes the process
 * on the record IT filed, and that is not always the record a waiter holds for. So the waiter now
 * asks the office to write it: POST /api/handles/:handle/process.
 *
 * A PROCESS NUMBER FROM THE CALLER IS NOT EVIDENCE OF ANYTHING, which is why this file is mostly
 * refusals. The office reads the process itself and then asks whether it is THIS session's: a waiter
 * that outlived the session that started it carries the old session's numbers, and one was measured
 * 47 minutes older than the session it holds for. Every refusal ends "Nothing was written", so each
 * case below reads the record before and after and requires it to be unchanged, byte for byte.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAUDE PROCESS IN THESE CASES IS THIS TEST'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * The office trusts a pid only while the process is the claude program by its own name or
 * executable, so a case that needs one sets `process.title` to `claude`. Node sets the process's
 * name (`/proc/<pid>/comm`) from it, and its command line — the same thing
 * tests/the-chats-presence-mark-is-true.test.ts does. The title is put back after
 * every case, so "this process does not name claude" is a reading and not an accident of order.
 *
 * ONE CASE NEEDS TWO LIVE CLAUDE PROCESSES — the one a record already names and the one being sent —
 * so it starts a second: a link called `claude` pointing at this Node, run detached, which is a
 * `setsid` of its own. Its process group is written down as it starts and it is stopped by that
 * group id and nothing else. Nothing here talks to any office but its own.
 *
 * WHEN THE PROCESS BEGAN IS READ WITH `ps`, deliberately not with the module under test: a stamp
 * worked out by the code being measured would agree with it however wrong both were.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first, 24 September 2026.
 * ---------------------------------------------------------------------------------------
 *
 *   MUTATION 1. Drop the holder check in lib/held-process.ts (the `held.session !== asked.session`
 *   refusal) — "another session's hold" goes red: one session writes a process onto another's record.
 *   MUTATION 2. Drop the machine check — "a hold on another machine" goes red.
 *   MUTATION 3. Drop the tie check (return a tie whatever was read) — "nothing ties the process to
 *   this conversation" goes red.
 *   MUTATION 4. Drop the conflict check (the loop over other records) — "a process another record
 *   already has" goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let answering: typeof import('../src/server/lib/answering.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let handles: typeof import('../src/server/lib/handles.ts')
let machines: typeof import('../src/server/lib/machines.ts')
let resources: typeof import('../src/server/lib/resources.ts')
let records: typeof import('../src/server/lib/records.ts')

/** The name this machine answers to, which is the only machine a pid means anything on. */
let THIS_MACHINE: string

const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-held-process-'))
let transcriptNumber = 0

/** Which conversation each session record is. One per record, as one record is one run. */
const ARGUS_CONVERSATION = '32444539-7b2c-4f1a-9d3e-0a1b2c3d4e5f'
const ANOTHER_CONVERSATION = '99faaeef-1111-2222-3333-444455556666'

const AS_ARGUS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
}

/**
 * A TRANSCRIPT THAT WAS LAST WRITTEN TO TWO HOURS AGO.
 *
 * The record must carry one — without a transcript the office answers "could not be read" whatever
 * the process says (criterion M126) — and it must be old, because a fresh one would make the session
 * answer on its own and the process would be proving nothing.
 */
function anOldTranscript(): string {
  transcriptNumber += 1
  const path = join(transcripts, `held-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'two hours ago' }] },
    })}\n`,
  )
  return path
}

/** When a process began, read from `ps` rather than from the module this file measures. */
function theStartStampOf(pid: number): string {
  const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  return localStamp(new Date(out))
}

/**
 * A SECOND LIVE CLAUDE PROCESS, STARTED BY THIS TEST AND STOPPED BY ITS PROCESS GROUP.
 *
 * `claude` here is a link to this Node, so the kernel names the process `claude`, which is what the
 * office reads a claude process by. `detached` makes the child a session and
 * process-group leader of its own — a `setsid` — so its group id is its pid and stopping that group
 * stops it and nothing else. Chapter 2 rule 1: the group id is written down as it starts.
 */
function aSecondClaude(): { pid: number; stop: () => void } {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-fake-claude-'))
  const link = join(folder, 'claude')
  symlinkSync(process.execPath, link)
  const child = spawn(link, ['-e', 'setInterval(() => {}, 1_000_000)'], { detached: true, stdio: 'ignore' })
  const pid = child.pid as number
  child.unref()
  return {
    pid,
    stop: () => {
      // BY THE GROUP ID AND NEVER BY A PATTERN. `detached` made the pid the group id. A group of
      // zero is never signalled: `kill(-0)` would mean this runner's own group.
      if (!Number.isInteger(pid) || pid <= 0) return
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // Already gone, which is the ordinary ending when a case has finished.
      }
      rmSync(folder, { recursive: true, force: true })
    },
  }
}

/**
 * A CLAUDE PROCESS WHOSE COMMAND LINE NAMES A CONVERSATION, started by this test and stopped by its
 * process group.
 *
 * A script named `claude`, run by /bin/sh with `--resume <conversation>`: its name is `claude` and
 * its command line carries the conversation. `detached` is a `setsid`, so the group id is the pid.
 */
function aResumedClaude(conversation: string): { pid: number; stop: () => void } {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-resumed-claude-'))
  const script = join(folder, 'claude')
  writeFileSync(script, '#!/bin/sh\n# A STAND-IN FOR THE claude PROGRAM, written by a test. It runs no model.\nwhile :; do sleep 1; done\n', {
    mode: 0o755,
  })
  const child = spawn(script, ['--resume', conversation], { detached: true, stdio: 'ignore' })
  const pid = child.pid as number
  child.unref()
  return {
    pid,
    stop: () => {
      if (!Number.isInteger(pid) || pid <= 0) return
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
      rmSync(folder, { recursive: true, force: true })
    },
  }
}

/** The test's own process, made to look like the claude program, and put back after every case. */
const ORIGINAL_TITLE = process.title
function nameThisProcess(what: string): void {
  process.title = what
}

/**
 * EVERY SESSION RECORD A CASE MADE, so the next case starts with none of them.
 *
 * The office reads across every session record on the machine when it asks whether a process is
 * already somebody else's, which is right — a pid is one machine's fact and not one project's. Every
 * case here uses the same live claude process, so a record left behind by an earlier case really is
 * another record naming this process, and the case after it would be measuring that instead of what
 * it set up. They are deleted rather than left, and the deletion is the product's own.
 */
let made: string[] = []

/** One session record, stamped as the start hook stamps one. */
function aSession(input: {
  externalId: string
  runtime?: string
  kind?: 'session' | 'note'
  data?: Record<string, unknown>
  discovered?: Record<string, unknown>
}): string {
  const id = t.api.createRecord({
    workspaceId: 'default',
    kind: input.kind ?? 'session',
    title: 'A terminal somebody opened',
    data: {
      state: 'running',
      runtime: input.runtime ?? 'claude-code',
      ...input.data,
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: input.externalId,
          logPath: anOldTranscript(),
          ...input.discovered,
        },
      },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  made.push(id)
  return id
}

/** Put a record made without `aSession` on the list too, so the case still cleans up after itself. */
function theRecordMade(id: string): string {
  made.push(id)
  return id
}

/** The discovery stamp on a record, as it is stored. */
function theStampOn(id: string): Record<string, unknown> {
  const extra = records.getRecord(id)?.data['extra'] as Record<string, unknown> | undefined
  const stamp = extra?.['discovered']
  expect(stamp, `record ${id} carries no discovery stamp`).toBeTypeOf('object')
  return stamp as Record<string, unknown>
}

/** The record's whole data, as one string, so "nothing was written" can be checked byte for byte. */
function theDataOf(id: string): string {
  const record = records.getRecord(id)
  return JSON.stringify(record?.data ?? null)
}

/** Take the handle for a session, through the door the waiter uses. */
async function hold(session: string, machine = THIS_MACHINE, runtime = 'claude-code'): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`,
    headers: AS_ARGUS,
    payload: { session, machine, runtime },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** Ask the door to record a process, as the waiter does. */
async function recordTheProcess(
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_ARGUS,
  handle = THE_TEST_OFFICES_SECRETARY.handle,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/process`,
    headers,
    payload,
  })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

let argusSession: string
let anotherSession: string

/**
 * THE COORDINATOR'S REGISTRY ID, which is not its handle. The registry gives a new agent an id of its own, so
 * it is read back from the registry once the coordinator is made. The library readings below take this id;
 * the doors take the handle.
 */
let argusId: string

beforeAll(async () => {
  t = await freshDb()
  answering = await import('../src/server/lib/answering.ts')
  worker = await import('../src/server/lib/worker.ts')
  handles = await import('../src/server/lib/handles.ts')
  machines = await import('../src/server/lib/machines.ts')
  resources = await import('../src/server/lib/resources.ts')
  records = await import('../src/server/lib/records.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const said = machines.thisMachine()
  expect(said, 'this machine could not say what it is called, so no hold here could be compared with it').not.toBeNull()
  THIS_MACHINE = said as string
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: THE_TEST_OFFICES_SECRETARY.name,
    data: { handle: THE_TEST_OFFICES_SECRETARY.handle, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Lark',
    data: { handle: 'lark', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(THE_TEST_OFFICES_SECRETARY.handle) as
    | { id: string }
    | undefined
  expect(row, `${THE_TEST_OFFICES_SECRETARY.handle} was made but the registry has no row for it`).toBeDefined()
  argusId = (row as { id: string }).id
})

beforeEach(() => {
  argusSession = aSession({ externalId: ARGUS_CONVERSATION })
  anotherSession = aSession({ externalId: ANOTHER_CONVERSATION })
})

afterEach(() => {
  process.title = ORIGINAL_TITLE
  // WHATEVER IS HELD, WHICHEVER RECORD IT IS. A case that moved the hold to a record of its own
  // would otherwise leave it held and the next case's claim would be refused by it.
  const live = handles.theLiveHoldOn(argusId, true)
  if (live !== null) handles.releaseAHold(live.id, 'the case that took it has finished')
  for (const id of made) records.deleteRecord(id, { type: 'human', id: THE_PERSON })
  made = []
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

// ============================================================ the session records its own process

describe('a session holding a handle records its own process', () => {
  it('turns the reading from nobody into a live session, from its process', async () => {
    nameThisProcess('claude')
    await hold(argusSession)

    // BEFORE. The handle is held and the transcript is two hours old, so nothing says the session
    // can answer — which is exactly the state both incidents were in.
    expect(worker.whoIsAnsweringAs(argusId, 'default').how).toBe('nobody')

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status, JSON.stringify(said.body)).toBe(200)
    expect(said.body['changed']).toBe(true)
    expect(said.body['tiedBy']).toBe("the waiter's environment")
    expect(said.body['says']).toBe(
      `Record ${argusSession} now names process ${String(process.pid)}, started ` +
        `${theStartStampOf(process.pid)}, tied to its conversation by the waiter's environment.`,
    )

    // AFTER. The same reading, made the same way, now answers with the session and says the process
    // is what it read it from.
    expect(worker.whoIsAnsweringAs(argusId, 'default').how).toBe('a live session')
    const held = handles.theLiveHoldOn(argusId, true)
    expect(held).not.toBeNull()
    expect(answering.theSessionBehindTheHold(held!, 'default', new Date()).from).toBe('its process')
  })

  it('writes the four process fields and leaves the conversation on the record alone', async () => {
    nameThisProcess('claude')
    await hold(argusSession)

    await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    const stamp = theStampOn(argusSession)
    expect(stamp['pid']).toBe(process.pid)
    expect(stamp['pidStartedAt']).toBe(theStartStampOf(process.pid))
    expect(stamp['pidCommand']).toBe('claude')
    expect(stamp['tool']).toBe('claude-code')
    expect(stamp['externalId']).toBe(ARGUS_CONVERSATION)
  })

  it('names which of the three ties held: the command line, a stamped record, or the environment', async () => {
    // 1. THE COMMAND LINE, which the office reads for itself and nobody can write from here. The
    // process is a script named `claude`, started with `--resume <conversation>`: the office knows
    // the claude program by its name, and the kernel cuts a name to 15 characters, so this test's
    // own title cannot carry both the name `claude` and the conversation.
    const resumed = aResumedClaude(ARGUS_CONVERSATION)
    try {
      await hold(argusSession)
      const byCommandLine = await recordTheProcess({
        session: argusSession,
        pid: resumed.pid,
        pidStartedAt: theStartStampOf(resumed.pid),
      })
      expect(byCommandLine.status, JSON.stringify(byCommandLine.body)).toBe(200)
      expect(byCommandLine.body['tiedBy']).toBe('its command line')
    } finally {
      resumed.stop()
    }

    // 2. A RECORD THE START HOOK STAMPED with this same conversation and this same process. This
    // process is named `claude` and its command line names no conversation, so only the stamp on
    // another record can tie it.
    nameThisProcess('claude')
    aSession({
      externalId: ARGUS_CONVERSATION,
      discovered: { pid: process.pid, pidStartedAt: theStartStampOf(process.pid), pidCommand: 'claude' },
    })
    const second = aSession({ externalId: ARGUS_CONVERSATION })
    handles.releaseAHold(handles.theLiveHoldOn(argusId, true)!.id, 'moving to the second record')
    await hold(second)
    const byStamp = await recordTheProcess({
      session: second,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
    })
    expect(byStamp.status, JSON.stringify(byStamp.body)).toBe(200)
    expect(byStamp.body['tiedBy']).toBe('a record the start hook stamped')
  })

  it('says nothing changed, and changes nothing, when the record already names this process', async () => {
    nameThisProcess('claude')
    await hold(argusSession)
    const payload = {
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    }
    await recordTheProcess(payload)
    const before = theDataOf(argusSession)

    const again = await recordTheProcess(payload)

    expect(again.status).toBe(200)
    expect(again.body['changed']).toBe(false)
    expect(again.body['says']).toBe(
      `Record ${argusSession} already named process ${String(process.pid)}, started ` +
        `${theStartStampOf(process.pid)}. Nothing changed.`,
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('keeps a dead pid it replaced, so a change of process is on the record', async () => {
    // A RECORD WHOSE RECORDED PROCESS IS GONE is replaced, because that is the ordinary case: the
    // session was resumed and the conversation now runs under a new number. The old one is kept.
    const resumed = aSession({
      externalId: ARGUS_CONVERSATION,
      discovered: { pid: 99999999, pidStartedAt: '2026-09-23 09:02:39', pidCommand: 'claude' },
    })
    nameThisProcess('claude')
    await hold(resumed)

    const said = await recordTheProcess({
      session: resumed,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status, JSON.stringify(said.body)).toBe(200)
    const stamp = theStampOn(resumed)
    expect(stamp['pid']).toBe(process.pid)
    expect(stamp['pidReplaced']).toBe(99999999)
    handles.releaseAHold(handles.theLiveHoldOn(argusId, true)!.id, 'the case has finished')
  })
})

// ============================================================ every refusal writes nothing

describe('every refusal writes nothing at all', () => {
  it('refuses when nothing is holding the handle', async () => {
    nameThisProcess('claude')
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `Nothing is holding the handle "${THE_TEST_OFFICES_SECRETARY.handle}" now, so no process can be recorded for it. Nothing was written.`,
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it("refuses a session that is not the one holding the handle", async () => {
    nameThisProcess('claude')
    await hold(anotherSession)
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `The handle "${THE_TEST_OFFICES_SECRETARY.handle}" is held by the session filed as record ${anotherSession}, not by ${argusSession}. ` +
        'Only the session that holds a handle may record its process. Nothing was written.',
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses anybody but the agent itself, however the request names them', async () => {
    nameThisProcess('claude')
    await hold(argusSession)
    const before = theDataOf(argusSession)
    const payload = {
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    }

    const asThePerson = await recordTheProcess(payload, {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    })
    expect(asThePerson.status).toBe(403)
    expect(asThePerson.body['error']).toBe(
      `This request names the handle "${THE_TEST_OFFICES_SECRETARY.handle}" and writes as human "${THE_PERSON}". Only the agent itself ` +
        "records its session's process. Nothing was written.",
    )

    const asAnotherAgent = await recordTheProcess(payload, {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'lark',
    })
    expect(asAnotherAgent.status).toBe(403)
    expect(asAnotherAgent.body['error']).toContain('Only the agent itself records its session’s process.'.replace('’', "'"))

    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses a hold that is on another machine', async () => {
    nameThisProcess('claude')
    await hold(argusSession, 'a-computer-in-another-room')
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `The hold on "${THE_TEST_OFFICES_SECRETARY.handle}" is on a-computer-in-another-room, and this office runs on ${THIS_MACHINE}. A process ` +
        'number means something only on its own machine. Nothing was written.',
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses when this office cannot say what machine it runs on', async () => {
    // A PROBE THAT CANNOT SAY IS A REAL ANSWER — `machineName` is an optional method on the
    // interface, and `thisMachine()` hands its silence straight on. The comparison the check makes
    // cannot be made then, so the door refuses and says which of the two it could not read.
    nameThisProcess('claude')
    await hold(argusSession)
    const before = theDataOf(argusSession)
    const real = resources.osProbe()
    resources.useOsProbe({ ...real, machineName: () => null })
    try {
      const said = await recordTheProcess({
        session: argusSession,
        pid: process.pid,
        pidStartedAt: theStartStampOf(process.pid),
        conversation: ARGUS_CONVERSATION,
      })

      expect(said.status).toBe(409)
      expect(said.body['error']).toBe(
        `The hold on "${THE_TEST_OFFICES_SECRETARY.handle}" is on ${THIS_MACHINE}, and this office could not say what machine it runs on. A ` +
          'process number means something only on its own machine. Nothing was written.',
      )
      expect(theDataOf(argusSession)).toBe(before)
    } finally {
      resources.useOsProbe(real)
    }
  })

  it('refuses a record that is not a claude-code session with a conversation on it', async () => {
    nameThisProcess('claude')
    const noConversation = theRecordMade(t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'A run nobody has stamped yet',
      data: { state: 'running', runtime: 'claude-code' },
      actor: { type: 'human', id: THE_PERSON },
    }).id)
    const codex = aSession({ externalId: ANOTHER_CONVERSATION, runtime: 'codex-cli' })
    const noRuntime = theRecordMade(t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'A run whose tool nobody recorded',
      data: { state: 'running', extra: { discovered: { tool: 'claude-code', externalId: 'x', logPath: anOldTranscript() } } },
      actor: { type: 'human', id: THE_PERSON },
    }).id)

    const notASession = theRecordMade(
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'work_domain',
        title: 'Not a session at all',
        data: {},
        actor: { type: 'human', id: THE_PERSON },
      }).id,
    )

    for (const [session, clause] of [
      // THE KIND IS THE WORD A PERSON READS AND NOT THE STORED ONE: the record's kind is
      // `work_domain` and what this says is "work domain".
      [notASession, 'it is a work domain'],
      [noConversation, 'it names no conversation yet'],
      [codex, 'its runtime is codex-cli'],
      [noRuntime, 'its runtime is not recorded'],
    ] as const) {
      const before = theDataOf(session)
      await hold(session)
      const said = await recordTheProcess({
        session,
        pid: process.pid,
        pidStartedAt: theStartStampOf(process.pid),
        conversation: ARGUS_CONVERSATION,
      })
      expect(said.status, JSON.stringify(said.body)).toBe(409)
      expect(said.body['error']).toBe(
        `Record ${session} is not a claude-code session with a conversation on it: ${clause}. Nothing was written.`,
      )
      expect(theDataOf(session)).toBe(before)
      handles.releaseAHold(handles.theLiveHoldOn(argusId, true)!.id, 'the case has finished')
    }
  })

  it('refuses a record that says it ran as another agent', async () => {
    nameThisProcess('claude')
    const plumbs = aSession({ externalId: ARGUS_CONVERSATION, data: { servingAgent: 'lark' } })
    await hold(plumbs)
    const before = theDataOf(plumbs)

    const said = await recordTheProcess({
      session: plumbs,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `Record ${plumbs} ran as the agent "lark", not as "${THE_TEST_OFFICES_SECRETARY.handle}". Nothing was written.`,
    )
    expect(theDataOf(plumbs)).toBe(before)
    handles.releaseAHold(handles.theLiveHoldOn(argusId, true)!.id, 'the case has finished')
  })

  it('refuses a process that is not running, is not claude, or began at another moment', async () => {
    await hold(argusSession)
    const before = theDataOf(argusSession)

    // NOT RUNNING. A number nothing answers to.
    const gone = await recordTheProcess({
      session: argusSession,
      pid: 99999999,
      pidStartedAt: '2026-09-23 09:02:39',
      conversation: ARGUS_CONVERSATION,
    })
    expect(gone.status).toBe(409)
    expect(gone.body['error']).toBe('Process 99999999 is not running. Nothing was written.')

    // NOT THE CLAUDE PROGRAM. This process, with its own name, which is a test runner.
    const notClaude = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ARGUS_CONVERSATION,
    })
    expect(notClaude.status).toBe(409)
    expect(notClaude.body['error']).toBe(
      `Process ${String(process.pid)} is not the claude program. Nothing was written.`,
    )

    // A DIFFERENT MOMENT. The same number, claimed to have started at another time, which is how a
    // reused pid is told from the process a record really named.
    nameThisProcess('claude')
    const wrongMoment = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: '2020-01-01 00:00:00',
      conversation: ARGUS_CONVERSATION,
    })
    expect(wrongMoment.status).toBe(409)
    expect(wrongMoment.body['error']).toBe(
      `Process ${String(process.pid)} is a process that started at ${theStartStampOf(process.pid)}, not at ` +
        '2020-01-01 00:00:00. Nothing was written.',
    )

    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses when nothing ties the process to the conversation the record names', async () => {
    // THE WAITER THAT OUTLIVED ITS SESSION. Its environment names another conversation, its command
    // line names none, and no record ties this process to this one. Nothing here is a tie.
    nameThisProcess('claude')
    await hold(argusSession)
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: theStartStampOf(process.pid),
      conversation: ANOTHER_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `Nothing Mole Office can read ties process ${String(process.pid)} to the conversation record ` +
        `${argusSession} names (${ARGUS_CONVERSATION}). Nothing was written.`,
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses a process another record already has, naming that record and why', async () => {
    nameThisProcess('claude')
    const stamped = theStartStampOf(process.pid)
    // ANOTHER CONVERSATION, on a record that already carries this exact process.
    const other = aSession({
      externalId: ANOTHER_CONVERSATION,
      discovered: { pid: process.pid, pidStartedAt: stamped, pidCommand: 'claude' },
    })
    await hold(argusSession)
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: stamped,
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `Process ${String(process.pid)} is already recorded on record ${other}, which names another conversation, ` +
        `${ANOTHER_CONVERSATION}. One process is one session. Nothing was written.`,
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses a process another agent’s record already has', async () => {
    nameThisProcess('claude')
    const stamped = theStartStampOf(process.pid)
    // THE SAME CONVERSATION, so the tie holds, but the other record is another agent's run.
    const plumbs = aSession({
      externalId: ARGUS_CONVERSATION,
      data: { servingAgent: 'lark' },
      discovered: { pid: process.pid, pidStartedAt: stamped, pidCommand: 'claude' },
    })
    await hold(argusSession)
    const before = theDataOf(argusSession)

    const said = await recordTheProcess({
      session: argusSession,
      pid: process.pid,
      pidStartedAt: stamped,
      conversation: ARGUS_CONVERSATION,
    })

    expect(said.status).toBe(409)
    expect(said.body['error']).toBe(
      `Process ${String(process.pid)} is already recorded on record ${plumbs}, which runs as "lark". One ` +
        'process is one session. Nothing was written.',
    )
    expect(theDataOf(argusSession)).toBe(before)
  })

  it('refuses when the record already names a different live claude process', async () => {
    // TWO LIVE CLAUDE PROCESSES, which is the only way this refusal can be reached honestly: the
    // record names one and the request names the other, and both really are running claude
    // programs. A record whose recorded process is gone is replaced instead — the case above.
    const second = aSecondClaude()
    try {
      nameThisProcess('claude')
      const taken = aSession({
        externalId: ARGUS_CONVERSATION,
        discovered: { pid: second.pid, pidStartedAt: theStartStampOf(second.pid), pidCommand: 'claude' },
      })
      await hold(taken)
      const before = theDataOf(taken)

      const said = await recordTheProcess({
        session: taken,
        pid: process.pid,
        pidStartedAt: theStartStampOf(process.pid),
        conversation: ARGUS_CONVERSATION,
      })

      expect(said.status).toBe(409)
      expect(said.body['error']).toBe(
        `Record ${taken} already names a live claude process, ${String(second.pid)}, that is not ` +
          `${String(process.pid)}. Nothing was written.`,
      )
      expect(theDataOf(taken)).toBe(before)
    } finally {
      second.stop()
    }
  })
})
