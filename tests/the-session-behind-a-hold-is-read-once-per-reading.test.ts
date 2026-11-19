// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION BEHIND A HOLD IS READ ONCE FOR A READING OF MANY PROJECTS, AND EACH PROJECT'S DOT SAYS WHAT IT SAID
 * (wave 13y round 81).
 *
 * MEASURED FIRST, on the made-up office tools/build-a-made-up-office.ts builds, given one agent with the deliveries the
 * live secretary had on 25 October 2026 (19,057, of which 18,552 were taken by the session holding its handle): the
 * people view asked for that one agent took about 700 ms, and 579 ms of it was the read of the session's hand-overs
 * (`whenThisSessionWasHandedMessages` then), read 11 times, once for each project its dot is read in. What the session behind a hold says does not depend on the project
 * asking when the session has a record: its process rows are looked up in the session's own project.
 *
 * TWO TESTS.
 * 2. THE ANSWER. In every project, the office reading's dot for an agent held by a session with a record, and for one held
 *    by a session with no record, says what the dot says when it is asked for that agent and project alone, which reads
 *    its own hold and the session behind it. The office reading is `readTheOffice` in lib/pixel-office.ts, which the
 *    plugin's views read; the people view carries the dot's colour and word, and not all that it says. A session with no record is looked up in the project asking, so its words differ
 *    from project to project here, and a reading kept for the session alone would say one project's words in all three.
 *
 * Every agent, session, message, process row and word below is made up for this fresh test database.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
// ONE INSTANT FOR THE WHOLE FILE, so a hold and its window read the same on every run of it.
const NOW = new Date(2026, 9, 25, 9, 0, 0)
const PROJECTS = ['default', 'invented-two', 'invented-three']
const RECORDED = 'invented-session-with-a-record'
const UNRECORDED = 'invented-session-with-no-record'
let recordedHolder: string
let unrecordedHolder: string
/** Where the made-up transcript of the session with a record lives, removed with the file. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-read-once-per-reading-'))

/** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
function stamp(n: number): string {
  const at = new Date(NOW.getTime() + n * 1000)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const ids: string[] = []
  for (const handle of ['invented-recorded-holder', 'invented-unrecorded-holder']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: `Made-up ${handle}`, workArea: ['src'] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    ids.push((t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id)
  }
  ;[recordedHolder, unrecordedHolder] = ids as [string, string]
  const sqlite = t.client.sqlite
  sqlite.transaction(() => {
    const project = sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    for (const id of PROJECTS) project.run(id, id, stamp(-86_400), stamp(-86_400))
    // A TERMINAL SESSION WITH A RECORD IN `default`, holding the first agent's handle, heard from a minute ago. Its
    // transcript was last written fifteen minutes ago, before the messages below were handed to it.
    const logPath = join(transcripts, 'invented-session-with-a-record.jsonl')
    writeFileSync(logPath, `${JSON.stringify({ type: 'assistant', timestamp: new Date(NOW.getTime() - 900_000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Made-up last turn' }] } })}\n`)
    const discovered = { tool: 'claude-code', externalId: 'invented-session-with-a-record', logPath, resumeCommand: null, startedAt: null, entryPoint: null }
    sqlite.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'default', ?, ?, ?, 'session', ?, ?, 'authored')")
      .run(RECORDED, THE_TEST_OFFICES_OWNER.id, stamp(-3_600), stamp(-60), 'Made-up terminal', JSON.stringify({ state: 'running', servingAgentId: recordedHolder, runtime: 'claude-code', extra: { discovered } }))
    hold('invented-hold-recorded', recordedHolder, RECORDED)
    // AND ONE WITH NO RECORD, holding the second agent's handle. The table does not tie a hold to a record.
    hold('invented-hold-unrecorded', unrecordedHolder, UNRECORDED)
    // MESSAGES HANDED TO EACH SESSION, so the read of its hand-overs has rows to read.
    for (let n = 0; n < 5; n++) {
      handedOver(`invented-handed-recorded-${String(n)}`, recordedHolder, RECORDED, stamp(-600 + n))
      handedOver(`invented-handed-unrecorded-${String(n)}`, unrecordedHolder, UNRECORDED, stamp(-600 + n))
    }
    // A PROCESS ROW OF EACH SESSION, this test's own process, in a project other than `default`. Nothing reads it but the
    // readers of presence, and they signal nothing.
    for (const session of [RECORDED, UNRECORDED]) {
      sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, detail, registered_at, registered_by) VALUES (?, 'invented-two', ?, 'process', ?, NULL, ?, ?, 'agent:invented')")
        .run(`${session}-process`, session, String(process.pid), `Invented: this test's own process, as a process of ${session}`, stamp(-3_000))
    }
  })()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  rmSync(transcripts, { recursive: true, force: true })
})

/** A made-up live hold on an agent's handle by a session, claimed an hour ago and heard from a minute ago. */
function hold(id: string, agent: string, session: string): void {
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(id, agent, session, 'invented-machine', 'claude-code', stamp(-3_600), stamp(-60))
}

/** A made-up message to an agent and its delivery, taken by `session` as the took door writes it. */
function handedOver(id: string, agent: string, session: string, at: string): void {
  t.client.sqlite.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'message', ?, ?, 'authored')")
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, `Made-up ${id}`, JSON.stringify({ body: `Made-up words of ${id}`, sentBy: { kind: 'person', id: THE_PERSON }, to: [{ kind: 'agent', id: agent }] }))
  t.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because) VALUES (?, ?, 'agent', ?, 'seen', ?, ?)")
    .run(`${id}-delivery`, id, agent, at, theLiveSessionTookIt(session))
}





describe('each project says what it said', () => {
  it("in every project, the office reading's dot for each holder says what that agent's dot alone says", async () => {
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const { readTheOffice } = await import('../src/server/lib/pixel-office.ts')
    const office = readTheOffice('default', { type: 'human', id: THE_PERSON }, 'office')
    const differ: string[] = []
    const says = new Map<string, unknown>()
    for (const agent of [recordedHolder, unrecordedHolder]) {
      const registered = office.agents().find((one) => one.id === agent)
      expect(registered, `${agent} is read`).toBeDefined()
      const { presenceByProject } = office.presenceOf(registered!)
      for (const project of PROJECTS) {
        const inTheReading = JSON.parse(JSON.stringify(presenceByProject.find((p) => p.workspaceId === project)?.reading)) as unknown
        const alone = JSON.parse(JSON.stringify(participantPresence({ kind: 'agent', id: agent }, project, new Date(), { kind: 'person', id: THE_PERSON }, true))) as Record<string, unknown>
        if (JSON.stringify(inTheReading) !== JSON.stringify(alone)) differ.push(`${agent} in ${project}: the office reading says ${JSON.stringify(inTheReading)}, alone ${JSON.stringify(alone)}`)
        says.set(`${agent} ${project}`, alone['says'])
      }
    }
    expect(differ).toEqual([])
    // THE SEED DID WHAT IT IS FOR: the session with no record reads differently in the project its process row is in, and
    // the session with a record reads alike in all three.
    expect(says.get(`${unrecordedHolder} invented-two`)).not.toEqual(says.get(`${unrecordedHolder} default`))
    expect(new Set(PROJECTS.map((p) => says.get(`${recordedHolder} ${p}`))).size).toBe(1)
  })
})
