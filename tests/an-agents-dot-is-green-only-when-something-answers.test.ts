// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S DOT IS GREEN ONLY WHEN SOMETHING IS ANSWERING AS IT, WHICH IS WHAT "CANNOT REACH" READS.
 *
 * Problem h1S1MLK-SQ1I. In the chat, the dot beside an agent's name came from `participantPresence`
 * (src/server/lib/presence.ts) and the red "Cannot reach" notice from `whoIsAnsweringAs`
 * (src/server/lib/worker.ts). The dot also went green on an open connection, a live process row or
 * a run with recent output, none of which the notice reads, so the two could say opposite things
 * about one agent on one screen. The secretary chose on 26 September 2026: the dot is built on the answering
 * reading (criterion M106: online means a session is answering and can take a message now; criterion
 * M126: a live process alone is not read as answering).
 *
 * WHAT IS PROVED HERE, against a real server with real processes:
 *
 *   1. The problem's own case: a live process row registered by the agent, with a transcript written
 *      now, no hold and no run. The door's dot is not green, and the conversation the chat reads
 *      says nobody is answering, which is what draws "Cannot reach".
 *   2. The three places a page gets the dot from give that same reading: the first load
 *      (GET /api/presence), the once-a-minute look (`presenceMayHaveChanged('everybody')`) and the
 *      event it sends (`presence.changed`, carrying the reading).
 *   3. The other way round: a run going for the agent with a live process and no transcript. The
 *      conversation says a run is answering, and the dot is green too.
 *   4. A session holding the handle with a live transcript: green, and the conversation says a live
 *      session is answering.
 *
 * RED ON MAIN (dac417f1d): cases 1 and 2 read green, and case 3 reads grey.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE RUNS, recorded in the commit message and the report with their .logs/ paths
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: all cases green. MUTATION: in `participantPresence`, the grey line for a live process row
 * (`if (liveProcesses.length > 0) return grey(...)`) made to return the same reading coloured green,
 * which is reading the process row as green again: cases 1 and 2 red. RESTORE: all green.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, one, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ChannelEvent } from '../src/shared/events.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let t: TestDb
let app: FastifyInstance
let at = ''
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
/** The transcripts this file writes, removed with the file. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-dot-answers-'))

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  at = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 120_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

async function post(path: string, body: unknown, headers: Record<string, string> = OWNER): Promise<Record<string, unknown>> {
  const res = await fetch(`${at}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const said = await res.text()
  expect(res.status, said).toBeLessThan(300)
  return JSON.parse(said) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${at}${path}`, { headers: OWNER })
  const said = await res.text()
  expect(res.status, said).toBe(200)
  return JSON.parse(said) as Record<string, unknown>
}

/** Register an agent and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  const listed = (await get('/api/participants')) as { agents: { id: string; handle: string }[] }
  return one(listed.agents.filter((row) => row.handle === handle), `the registry row for ${handle}`).id
}

/** A transcript whose last line was written now, as a working session leaves one. */
function aTranscriptWrittenNow(name: string): string {
  const path = join(transcripts, `${name}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

/** A session record, with a transcript when `transcript` names one. */
async function aSession(title: string, data: Record<string, unknown>, transcript: string | null, headers: Record<string, string> = OWNER): Promise<string> {
  const filed = await post(
    '/api/records',
    {
      kind: 'session',
      title,
      data: {
        state: 'running',
        runtime: 'claude-code',
        ...data,
        ...(transcript === null
          ? {}
          : {
              extra: {
                discovered: { tool: 'claude-code', externalId: title, logPath: transcript, resumeCommand: null, startedAt: null, entryPoint: null },
              },
            }),
      },
    },
    headers,
  )
  return (filed['record'] as { id: string }).id
}

/** A real process of this file's own, in its own group, registered against the session. */
async function aLiveProcessFor(session: string, headers: Record<string, string> = OWNER): Promise<void> {
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  await post('/api/resources', { type: 'process', key: String(child.pid), sessionRecordId: session, detail: 'a process of this test' }, headers)
}

/** What the header's dot draws and what the notice under it reads, for one agent, from the two doors the chat reads. */
async function whatTheChatReads(agentId: string): Promise<{ colour: string; from: string | null; says: string; how: string }> {
  const dot = (await get(`/api/presence/agent/${agentId}`)) as { presence: { colour: string; from: string | null; says: string } }
  const talk = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as { answering: { how: string } }
  return { colour: dot.presence.colour, from: dot.presence.from, says: dot.presence.says, how: talk.answering.how }
}

/** One stream as the person's page opens it, read into events as they arrive. */
async function openStream(): Promise<{ events: () => ChannelEvent[]; close: () => void }> {
  const stop = new AbortController()
  const res = await fetch(`${at}/api/events`, { headers: { ...OWNER, accept: 'text/event-stream' }, signal: stop.signal })
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  const blocks: string[] = []
  let counted = false
  void (async () => {
    let kept = ''
    for (;;) {
      const next = await reader.read().catch(() => ({ done: true, value: undefined }))
      if (next.done === true) return
      kept += decoder.decode(next.value, { stream: true })
      let cut = kept.indexOf('\n\n')
      while (cut !== -1) {
        const block = kept.slice(0, cut)
        kept = kept.slice(cut + 2)
        cut = kept.indexOf('\n\n')
        if (block === ': counted') counted = true
        blocks.push(block)
      }
    }
  })()
  const until = Date.now() + 10_000
  while (!counted && Date.now() < until) await new Promise((r) => setTimeout(r, 20))
  expect(counted, 'the stream never said it was counted').toBe(true)
  return {
    events: () =>
      blocks
        .filter((block) => block.includes('\ndata: '))
        .map((block) => JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? 'null') as ChannelEvent),
    close: () => stop.abort(),
  }
}

describe('the problem’s own case: a live process row, no hold, no run', () => {
  it('reads not green, beside the conversation saying nobody is answering', async () => {
    const handle = 'a-process-and-nobody'
    const agentId = await anAgent(handle)
    // THE SESSION IS NOT A RUN (it names no agent it serves) and holds no handle. Its transcript was
    // written now, so on main the process row's own judgement answered, and the dot went green.
    const session = await aSession('a session with a process', {}, aTranscriptWrittenNow(handle), asAgent(handle))
    await aLiveProcessFor(session, asAgent(handle))

    const read = await whatTheChatReads(agentId)
    expect(read.how, 'the fixture: nothing is answering, so the chat draws Cannot reach').toBe('nobody')
    expect(read.colour, 'the dot is green beside Cannot reach').not.toBe('green')
    expect(read.colour).toBe('grey')
    expect(read.from).toBeNull()
    // THE WORDS STILL SAY A PROCESS IS THERE, and then what the notice says.
    expect(read.says).toContain('A process registered for this agent is running on this machine')
    expect(read.says).toContain('Nothing is answering as this agent right now')
  }, 60_000)

  it('gives the same reading on the first load, at the minute’s look and in the event', async () => {
    const handle = 'a-process-seen-by-a-page'
    const agentId = await anAgent(handle)
    // THE PAGE OPENS FIRST, so its first reading of this agent (Inactive, grey) is remembered.
    const page = await openStream()
    try {
      const { presenceMayHaveChanged } = await import('../src/server/api/events.ts')
      presenceMayHaveChanged('everybody')
      // THEN THE PROCESS ARRIVES.
      const session = await aSession('a session with a process, later', {}, aTranscriptWrittenNow(handle), asAgent(handle))
      await aLiveProcessFor(session, asAgent(handle))
      // THE MINUTE'S LOOK, asked for directly rather than waited for.
      presenceMayHaveChanged('everybody')
      await new Promise((r) => setTimeout(r, 300))

      // THE FIRST LOAD: what a page reads when it opens.
      const firstLoad = (await get('/api/presence')) as { presence: { who: { kind: string; id: string }; colour: string; word: string }[] }
      const loaded = one(
        firstLoad.presence.filter((row) => row.who.kind === 'agent' && row.who.id === agentId),
        'the agent in GET /api/presence',
      )
      // THE EVENT: the newest presence.changed about this agent, with the reading the page draws.
      const told = page
        .events()
        .filter((event): event is Extract<ChannelEvent, { name: 'presence.changed' }> => event.name === 'presence.changed' && event.who.id === agentId)
        .at(-1)
      const door = await whatTheChatReads(agentId)

      expect(door.how).toBe('nobody')
      expect(loaded.colour, 'the first load draws green beside Cannot reach').toBe('grey')
      // WHAT THE PAGE DRAWS CHANGED (Inactive became a process seen), so the page was told, with the reading.
      expect(told, 'the page was not told the agent’s reading changed').toBeDefined()
      expect(told?.colour, 'the event says green beside Cannot reach').toBe('grey')
      expect(told?.reading?.colour).toBe('grey')
      expect(told?.reading?.word).toBe(loaded.word)
      expect(door.colour).toBe(loaded.colour)
    } finally {
      page.close()
    }
  }, 60_000)
})

describe('the dot and the notice agree when something is answering', () => {
  it('reads green when a run going for the agent has a live process, as the conversation reads it', async () => {
    const handle = 'a-run-with-no-transcript'
    const agentId = await anAgent(handle)
    // A RUN WITH NO TRANSCRIPT ON RECORD, as tools/sandbox.mjs files one: the conversation counts the
    // run going, and on main the dot read the process row's judgement instead and went grey.
    const run = await aSession('a run going for the agent', { servingAgent: agentId }, null, { ...OWNER, ...thePersonsKeyHeader() })
    await aLiveProcessFor(run)

    const read = await whatTheChatReads(agentId)
    expect(read.how).toBe('a run')
    expect(read.colour, 'the dot is grey while the conversation says a run is answering').toBe('green')
    expect(read.from).toBe('a run answering as it')
  }, 60_000)

  it('reads green when a session holding the handle is answering, as the conversation reads it', async () => {
    const handle = 'a-session-holding'
    const agentId = await anAgent(handle)
    const session = await aSession('a terminal answering', {}, aTranscriptWrittenNow(handle))
    // THE SESSION TAKES THE HANDLE through the real door, asked in-process as
    // tests/a-held-messages-row-reads-the-hold.test.ts asks it.
    const held = await app.inject({
      method: 'POST',
      url: `/api/handles/${handle}/hold`,
      headers: OWNER,
      payload: { session, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)

    const read = await whatTheChatReads(agentId)
    expect(read.how).toBe('a live session')
    expect(read.colour).toBe('green')
    expect(read.from).toBe('a session answering as it')
  }, 60_000)
})
