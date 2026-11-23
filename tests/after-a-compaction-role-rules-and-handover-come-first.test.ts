// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER A COMPACTION, ROLE, RULES AND HANDOVER COME BACK FIRST, EVEN WHEN WHERE-YOU-STAND CANNOT ANSWER IN TIME.
 *
 * The session hook runs as a process against this file's own office and database. The startup's
 * where-you-stand read is refused immediately, so no kept answer can replace the compaction's
 * fresh read. The compaction read holds the office thread for 10.5 seconds, past the hook's whole
 * ten-second budget. Other doors answer at their usual speed.
 *
 * What is checked, after a startup that files the run and then a compaction:
 *   - the first request the compaction sends is GET /api/after-a-compaction, and no health read is sent;
 *   - the output starts with the role, then the rules, then the handover, before the run and before the brief;
 *   - the hook ends inside ten seconds;
 *   - exactly one compaction is added to the run, at the one read's own clock, and a startup adds none.
 *
 * Mutations tried against it, in tools/session-hook.mjs: where-you-stand sent before the one read; the role part dropped.
 * In this file: the startup's read not refused (the kept answer is then given); the compaction's read not slowed.
 *
 * THE AGENT HOLDS THE KEY ITS REGISTRATION GAVE, and both runs of the hook are given it. A session that names an
 * agent and holds no key of it sends the name alone, and the office lets no name alone change a run, so the
 * compaction this file counts could not be recorded without the key.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { A_COMPACTION_REPORTED_BY_CLAUDE_CODE } from '../src/config/a-reported-compaction.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { readTheHookDetails } from './hook-details.ts'

/** `ms`: how long each where-you-stand read waits. `refuse`: the read fails after its wait. `reads`: slowed reads. */
const slow = vi.hoisted(() => ({ ms: 0, refuse: false, reads: 0 }))

vi.mock('../src/server/api/brief.ts', async (original) => {
  const real = await original<typeof import('../src/server/api/brief.ts')>()
  return {
    ...real,
    theBriefFor: (...args: Parameters<typeof real.theBriefFor>) => {
      if (slow.ms > 0) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, slow.ms)
        slow.reads += 1
      }
      if (slow.refuse) throw new Error('Test: the startup read of where-you-stand is refused, so no answer is kept.')
      return real.theBriefFor(...args)
    },
  }
})

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'
const AGENT = 'compacted-agent'
/** Past the hook's whole budget of ten seconds. */
const WHERE_YOU_STAND_TAKES_MS = 10_500
const HANDOVER = 'Finish the review of the parser.\nThe failing case is in tests/parse.test.ts.'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url = ''
let scratch = ''
/** The key the office gave AGENT when it was registered. Both runs of the hook are given it. */
let agentsKey = ''
/** Every request the office was sent, in the order it arrived. */
const asked: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function runHook(conversation: string, source: string): Promise<{ out: string; ms: number }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_OFFICE_AGENT: AGENT,
    MOLE_AGENT_KEY: agentsKey,
    HOME: scratch,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'details'),
  }
  delete env['TMUX_PANE']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY_FILE']
  // THE HOOK IS TIMED BY THE SHELL THAT STARTS IT, not by this process. This process is also the office, and while
  // the slowed door holds its thread, it cannot see the hook end until the door's work is done.
  const timed = 'began=$(date +%s%N); node "$0" start; status=$?; ended=$(date +%s%N); echo "HOOK-MS $(( (ended - began) / 1000000 ))" >&2; exit $status'
  const { out, err } = await new Promise<{ out: string; err: string }>((resolve, reject) => {
    const child = execFile('/bin/sh', ['-c', timed, HOOK], { encoding: 'utf8', env }, (error, stdout, stderr) => {
      if (error !== null) reject(error)
      else resolve({ out: stdout, err: stderr })
    })
    child.stdin?.end(JSON.stringify({ session_id: conversation, cwd: scratch, source }))
  })
  const ms = /HOOK-MS (\d+)/.exec(err)
  if (ms === null) throw new Error(`The shell did not say how long the hook took. It wrote: ${err}`)
  return { out, ms: Number(ms[1]) }
}

async function theRun(id: string): Promise<{ compactions?: { at: string; what: string }[] }> {
  const reply = await server.app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { record: { data: { compactions?: { at: string; what: string }[] } } }).record.data
}

const notesWritten: string[] = []

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the rules part names the chapters from the office's
  // chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  server = await apiApp()
  server.app.addHook('onRequest', async (req) => {
    asked.push(`${req.method} ${req.url.split('?')[0]!}`)
  })
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-after-a-compaction-'))
  const registered = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: AGENT, name: 'Compacted Agent', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  agentsKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(agentsKey, 'the registration gave the agent no key').not.toBe('')
  const written = await server.app.inject({ method: 'PUT', url: `/api/agents/${AGENT}/handover`, headers: AS_THE_PERSON, payload: { text: HANDOVER } })
  expect(written.statusCode, written.body).toBe(200)
}, 60_000)

afterAll(async () => {
  slow.ms = 0
  slow.refuse = false
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

describe('the session hook after a compaction, with where-you-stand slowed past ten seconds', () => {
  it('reads role, rules and handover first, ends inside ten seconds, and records exactly one compaction', async () => {
    const conversation = `test-after-a-compaction-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
    notesWritten.push(`session-${conversation}.json`)

    // The start files the run without a compaction; its refused read leaves no kept answer.
    slow.ms = 0
    slow.refuse = true
    const start = await runHook(conversation, 'startup')
    slow.ms = 0
    slow.refuse = false
    const filed = /This session is filed as record ([A-Za-z0-9_-]{12})/.exec(start.out) ?? /record ([A-Za-z0-9_-]{12})/.exec(start.out)
    expect(filed, start.out).not.toBeNull()
    const runId = filed![1]!
    expect((await theRun(runId)).compactions ?? []).toEqual([])
    expect(start.out).toContain(`GET /api/agents/${AGENT}/handover`)

    // THE COMPACTION, with where-you-stand slower than the whole budget.
    asked.splice(0)
    slow.reads = 0
    slow.ms = WHERE_YOU_STAND_TAKES_MS
    const compacted = await runHook(conversation, 'compact')
    const sent = asked.slice()
    const slowedReads = slow.reads
    slow.ms = 0

    // THE SLOWED READ HAPPENED, exactly once: no kept answer stood in for it.
    expect(slowedReads, compacted.out).toBe(1)

    console.log(`MEASURED: the hook after a compaction took ${String(compacted.ms)} ms, timed by its shell, with where-you-stand slowed to ${String(WHERE_YOU_STAND_TAKES_MS)} ms`)
    expect(compacted.ms, compacted.out).toBeLessThan(10_000)

    // THE ONE READ IS THE FIRST REQUEST, and there is no health read.
    expect(sent[0], sent.join('\n')).toBe('GET /api/after-a-compaction')
    expect(sent).not.toContain('GET /api/health')
    expect(sent.indexOf('GET /api/where-you-stand')).toBeGreaterThan(0)

    // ROLE, RULES AND HANDOVER, FIRST, in that order, before the run and the brief.
    const lines = compacted.out.split('\n')
    expect(lines[0]).toMatch(new RegExp(`^MOLE OFFICE — after a compaction\\. Your role: You are "${AGENT}" \\(Compacted Agent\\), holding the card "worker"`))
    const rulesAt = lines.findIndex((line) => line.startsWith('Your rules: '))
    const chapterAt = lines.findIndex((line) => /^ {2}Chapter \d+, /.test(line))
    const handoverAt = lines.findIndex((line) => line.startsWith('Your handover: The current handover of'))
    const textAt = lines.indexOf('  | Finish the review of the parser.')
    const runAt = lines.findIndex((line) => line.startsWith(`This session is filed as record ${runId}`))
    expect(rulesAt, compacted.out).toBeGreaterThan(0)
    expect(chapterAt).toBeGreaterThan(rulesAt)
    expect(handoverAt).toBeGreaterThan(chapterAt)
    expect(textAt).toBe(handoverAt + 1)
    expect(lines[textAt + 1]).toBe('  | The failing case is in tests/parse.test.ts.')
    expect(runAt).toBeGreaterThan(textAt)

    // WHERE-YOU-STAND MISSED, AND THE LINES SAY SO, with the doors that were not read.
    expect(compacted.out).toContain('Mole Office could not read GET /api/where-you-stand. Details: ')
    expect(readTheHookDetails(compacted.out)).toContain('GET /api/where-you-stand, which carries it, answered')
    expect(compacted.out).toContain('Not read after a compaction, to keep this inside ten seconds:')
    expect(compacted.out).toContain('GET /api/resources/orphans')
    expect(compacted.out).toContain('GET /api/sessions?only=running')

    // EXACTLY ONE COMPACTION, at the one read's clock, in the words declared once.
    const recordedLine = lines.find((line) => line.startsWith(`This compaction is recorded on run ${runId}, at `))
    expect(recordedLine, compacted.out).toBeDefined()
    const compactions = (await theRun(runId)).compactions ?? []
    expect(compactions).toHaveLength(1)
    expect(compactions[0]!.what).toBe(A_COMPACTION_REPORTED_BY_CLAUDE_CODE)
    expect(recordedLine).toContain(`at ${compactions[0]!.at} on the office's clock, as compaction 1 of this run.`)

    // THE START'S READ WAS REFUSED, which is what kept no answer for the compaction.
    expect(start.out).toContain('Mole Office could not read GET /api/where-you-stand.')
  }, 90_000)
})
