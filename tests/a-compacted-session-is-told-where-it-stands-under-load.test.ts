// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * A COMPACTED SESSION IS TOLD WHERE IT STANDS, EVEN WHEN THE OFFICE IS BUSY. Wave 13n's round 39.
 *
 * At 07:16 on 5 October 2026, at a load of about 19, the secretary's session was compacted and the session hook
 * (tools/session-hook.mjs) said the brief, the waiting list, the other runs and the open loops had all not
 * answered. On a made-up office of the live shape at a load near 20, GET /api/brief, GET /api/waiting and
 * GET /api/open-loops each took 0.9 to 3.3 s alone, and the hook's seven reads together took 3.9 to 8.1 s.
 *
 * The hook now reads the three in one, GET /api/where-you-stand (src/server/api/where-you-stand.ts). When
 * the office is busy, a caller it answered before gets the answer it kept, with how old it is.
 *
 * THE OFFICE IS SLOWED WHERE THE WORK IS. `theBriefFor` is imported only by where-you-stand.ts, so slowing
 * it blocks the office's one thread inside the door's own work, as a busy machine does, and leaves every
 * other read the hook makes at its usual speed. `Atomics.wait` holds the thread; nothing runs meanwhile.
 *
 * Case names name the source mutation tried against each assertion.
 *
 * THE AGENT HOLDS THE KEY ITS REGISTRATION GAVE, and the hook is given it. A session that names an agent and holds no
 * key of it sends the name alone, and the office lets no name alone stamp a run or record its compaction, so the
 * hook's lines would carry those refusals beside what this file reads.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * HOW LONG THE DOOR'S WORK HOLDS THE THREAD: `ms` from when the door reaches the brief, or until `until` on this
 * clock, whichever ends later.
 */
const slow = vi.hoisted(() => ({ ms: 0, until: 0 }))

vi.mock('../src/server/api/brief.ts', async (original) => {
  const real = await original<typeof import('../src/server/api/brief.ts')>()
  return {
    ...real,
    theBriefFor: (...args: Parameters<typeof real.theBriefFor>) => {
      const hold = Math.max(slow.ms, slow.until - performance.now())
      if (hold > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold)
      return real.theBriefFor(...args)
    },
  }
})

/** What the door did, in the order it did it: asked the attention rule, read what waits, got the rule's answer. */
const order = vi.hoisted(() => ({ said: [] as string[] }))

vi.mock('../src/server/lib/openwork.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/openwork.ts')>()
  return {
    ...real,
    theReadingOpenWorkIsRankedBy: (...args: Parameters<typeof real.theReadingOpenWorkIsRankedBy>) => {
      order.said.push('asked the rule')
      return real.theReadingOpenWorkIsRankedBy(...args).then((reading) => {
        order.said.push('the rule answered')
        return reading
      })
    },
  }
})

vi.mock('../src/server/api/waiting.ts', async (original) => {
  const real = await original<typeof import('../src/server/api/waiting.ts')>()
  return {
    ...real,
    theWaitingReply: (...args: Parameters<typeof real.theWaitingReply>) => {
      order.said.push('read what waits')
      return real.theWaitingReply(...args)
    },
  }
})

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'
const AGENT = 'arriving-agent'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url = ''
let scratch = ''
/** The key the office gave AGENT when it was registered. Every run of the hook is given it. */
let agentsKey = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(session: string): Record<string, string> {
  return {
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': AGENT,
    'x-mole-office-session': session,
  }
}

async function get(path: string, headers: Record<string, string>): Promise<{ body: any; ms: number }> {
  const began = performance.now()
  const reply = await server.app.inject({ method: 'GET', url: path, headers })
  const ms = performance.now() - began
  expect(reply.statusCode, reply.body).toBe(200)
  return { body: reply.json(), ms }
}

const notesWritten: string[] = []

/** Run the hook the way Claude Code runs it, for one conversation, and answer what it printed and how long it took. */
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
  const began = performance.now()
  const out = await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: conversation, cwd: scratch, source }))
  })
  return { out, ms: performance.now() - began }
}

/** Start the office this file reads, listening on a port of its own, and answer where it is. */
async function startTheOffice(): Promise<void> {
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}

beforeAll(async () => {
  t = await freshDb()
  await startTheOffice()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-where-you-stand-'))
  const registered = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: AGENT, name: 'Arriving Agent', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  agentsKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(agentsKey, 'the registration gave the agent no key').not.toBe('')
}, 60_000)

beforeEach(() => {
  slow.ms = 0
  slow.until = 0
})

afterAll(async () => {
  slow.ms = 0
  slow.until = 0
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

describe('GET /api/where-you-stand', () => {
  it('one read: answering anything but the three doors\' own replies tells a session something no door says', async () => {
    const headers = asAgent('session-one-read')
    const stand = await get('/api/where-you-stand', headers)
    // EACH DOOR'S REPLY CARRIES `narrowedByPermission` AT ITS TOP, put there by the server for every reply
    // (sayWhetherPermissionNarrowedIt, src/server/lib/http.ts). The one read carries it once, at its own top.
    expect(stand.body[NARROWED_BY_PERMISSION]).toBeNull()
    const asTheDoorWorksItOut = async (path: string) => {
      const { [NARROWED_BY_PERMISSION]: narrowed, ...rest } = (await get(path, headers)).body
      expect(narrowed).toBeNull()
      return rest
    }
    expect(stand.body.waiting).toEqual(await asTheDoorWorksItOut('/api/waiting'))
    expect(stand.body.openLoops).toEqual(await asTheDoorWorksItOut('/api/open-loops'))
    expect(stand.body.brief).toEqual(await asTheDoorWorksItOut('/api/brief'))
    expect(stand.body.workedOut).toMatchObject({ kept: false, ageSeconds: 0 })
    expect(stand.body.workedOut.says).toMatch(/^This was worked out for this request, at .+, in \d+ ms\.$/)
  })

  it('what waits is read while the rule runs: reading it after the rule\'s answer adds its time to the rule\'s', async () => {
    // Wave 13y round 22: on the made-up office of the live size at a load near 43 the rule took 1.1 to 2.3 s on its own
    // thread, and what waits 0.7 to 0.9 s on the office's, read after the rule had answered.
    order.said.length = 0
    await get('/api/where-you-stand', asAgent('session-read-while-the-rule-runs'))
    expect(order.said).toEqual(['asked the rule', 'read what waits', 'the rule answered'])
  })

  it('a quiet office: keeping answers when the last one was quick tells a session an old answer it did not need', async () => {
    const headers = asAgent('session-quiet')
    await get('/api/where-you-stand', headers)
    const again = await get('/api/where-you-stand', headers)
    expect(again.body.workedOut.kept).toBe(false)
  })

  it('a busy office: removing the kept answer makes the second read wait for the whole work again', async () => {
    const headers = asAgent('session-busy')
    slow.ms = 1_700
    const first = await get('/api/where-you-stand', headers)
    expect(first.body.workedOut.kept).toBe(false)
    expect(first.body.workedOut.tookMs).toBeGreaterThanOrEqual(1_700)
    const second = await get('/api/where-you-stand', headers)
    expect(second.ms).toBeLessThan(1_000)
    expect(second.body.workedOut.kept).toBe(true)
    // NOTHING KEPT IS PRESENTED AS CURRENT: the reply says when it was worked out and how old it is.
    expect(second.body.workedOut.at).toBe(first.body.workedOut.at)
    expect(typeof second.body.workedOut.ageSeconds).toBe('number')
    expect(second.body.workedOut.says).toMatch(
      new RegExp(`^This was worked out at ${first.body.workedOut.at}, \\d+ seconds before this request, and kept, because the office was busy`),
    )
    expect(second.body.workedOut.says).toContain('GET /api/brief, GET /api/waiting and GET /api/open-loops answer what holds now.')
    expect(second.body.brief).toEqual(first.body.brief)
    expect(second.body.waiting).toEqual(first.body.waiting)
    expect(second.body.openLoops).toEqual(first.body.openLoops)
  })

  it('an old kept answer: serving a kept answer of any age tells a session hours-old counts as where it stands', async () => {
    const headers = asAgent('session-old')
    // Imported here, after the test office's database is open: the door's module opens the database client.
    const { KEPT_FOR_AT_MOST_MS } = await import('../src/server/api/where-you-stand.ts')
    slow.ms = 1_700
    const first = await get('/api/where-you-stand', headers)
    expect(first.body.workedOut.kept).toBe(false)
    slow.ms = 0
    // ONLY THE CLOCK THE AGE IS READ FROM MOVES. The office is still counted busy: its last work-out took 1.7 s.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + KEPT_FOR_AT_MOST_MS - 5_000)
      const young = await get('/api/where-you-stand', headers)
      expect(young.body.workedOut.kept).toBe(true)
      vi.setSystemTime(Date.now() + 10_000)
      const old = await get('/api/where-you-stand', headers)
      expect(old.body.workedOut.kept).toBe(false)
      expect(old.body.workedOut.ageSeconds).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('another caller: keeping one answer for everybody hands one session what was worked out for another', async () => {
    slow.ms = 1_700
    await get('/api/where-you-stand', asAgent('session-mine'))
    const kept = await get('/api/where-you-stand', asAgent('session-mine'))
    expect(kept.body.workedOut.kept).toBe(true)
    slow.ms = 0
    const someoneElse = await get('/api/where-you-stand', asAgent('session-someone-else'))
    expect(someoneElse.body.workedOut.kept).toBe(false)
  })
})

describe('the session hook after a compaction, with the office busy', () => {
  // AN OFFICE OF ITS OWN, with no refresh pending. Each kept answer served above schedules a refresh
  // REFRESH_AFTER_MS later, and a refresh is slowed like any work-out. One that fell due while the hook's
  // read held the thread ran at once, with this case's 8 s, and the hook was timed at 16.5 s (problem
  // RC_2_RQYlqpI). Closing the office clears its refreshes; the database and the agent are kept.
  beforeAll(async () => {
    await server.app.close()
    await startTheOffice()
  }, 60_000)

  it('gets the brief: without the kept answer, a compaction under load is told nothing about the project', async () => {
    const conversation = `test-compacted-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
    notesWritten.push(`session-${conversation}.json`)
    // THE START: the door's work takes longer than the hook waits for it, so the read misses, and the
    // hook says which read missed and which doors answer each part alone. The office finishes the work
    // anyway and keeps it.
    //
    // THE HOLD ENDS 8 S AFTER THE HOOK STARTS, however long the door takes to reach the brief. A hook that sends this
    // read in its first 3.5 s gives it up 6.5 s after it started, and it gives up any later read at 9.5 s
    // (for-agents/session-hook.mjs). So 8 s is 1.5 s after the first and 1.5 s before the second. A hold of 8 s from
    // the brief ended as late as the door was slow to reach it: 10.5 to 11 s after the start on the cloud box, and
    // 9.6 s on a developer's machine. On that machine the handle read after the miss had given up too, and the start
    // printed a second Details line.
    slow.until = performance.now() + 8_000
    const start = await runHook(conversation, 'startup')
    // INSIDE THE 10 S CLAUDE CODE GIVES THE HOOK (ENTRY_HOOK_TIMEOUT_SECONDS in src/config/install-the-entry.mjs).
    // The stopwatch runs on this thread, which is held until 8 s after the start. So the bound leaves 2 s for the
    // hook's reads and output after the hold. A hook that waited out the whole hold would also end inside 10 s.
    // The one Details line below is what catches that hook.
    expect(start.ms).toBeLessThan(10_000)
    const detailsPaths = [...start.out.matchAll(/Details: (.+)/g)].map((match) => match[1]!)
    expect(detailsPaths).toHaveLength(1)
    const detailsPath = detailsPaths[0]!
    expect(dirname(detailsPath)).toBe(join(scratch, 'details'))
    const details = readTheHookDetails(start.out)
    expect(start.out).toContain('Mole Office could not read GET /api/where-you-stand. Details: ')
    expect(start.out).not.toContain('Mole Office did not answer the brief')
    expect(details).toContain('Mole Office did not answer the brief, so this run was told nothing about the project. GET /api/brief.')
    expect(details).toContain('GET /api/waiting answers it alone.')
    expect(details).toContain('GET /api/open-loops answers it alone.')

    // THE COMPACTION: the office is just as slow, and the session is told where it stands at once.
    slow.ms = 8_000
    const compacted = await runHook(conversation, 'compact')
    expect(compacted.ms).toBeLessThan(10_000)
    const brief = (await get('/api/brief', asAgent('session-reads-the-brief'))).body as { head: string }
    const head = brief.head.split('\n').find((line) => line.trim() !== '')
    expect(head).toBeDefined()
    expect(compacted.out).toContain(head)
    expect(compacted.out).not.toContain('did not answer the brief')
    expect(compacted.out).not.toContain('Could not read what is waiting on a person')
    expect(compacted.out).not.toContain('Details:')
    expect(compacted.out).not.toContain('did not answer')
    expect(compacted.out).toContain(`You are answering as the agent "${AGENT}" here.`)
    expect(compacted.out).toContain(`YOU CAN ANSWER AS THE AGENT "${AGENT}" IN THIS SESSION. Start the waiter once, in the background:`)
    expect(compacted.out).toContain(`This session is in the project "${WORKSPACE}", where the record its note names is.`)
    expect(compacted.out).toMatch(/This session is filed in the world this checkout declares: .+commit/)
    expect(compacted.out).toMatch(/^This was worked out at .+, \d+ seconds before this request, and kept, because the office was busy/m)
  }, 60_000)
})
