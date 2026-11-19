// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * AN AGENT'S MESSAGES GO THROUGH A DRAFT BY DEFAULT: what a run writes to one set of readers in one turn goes as one
 * message, at the turn's end.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DECIDED, AND WHAT THIS FILE DRIVES
 * ---------------------------------------------------------------------------------------
 *
 *   1. A run that says it reports its turns (POST /api/drafts/turn) has its messages held, answered 202. A run that
 *      has not said so is sent at once, as before (201).
 *   2. A second write to the same readers joins the draft, after a blank line. Other readers get a draft of their own,
 *      and so does a second Take me there, since a message carries at most one. A send id already held adds nothing.
 *   3. A write with "urgent": true goes at once. So does a write with a summary. A person's message is never held.
 *   4. The turn's end sends each draft as one message, filed by the run, with the agent as the sender, and nothing is
 *      checked or asked first. The run's own inbox read sends them first too; a hook's read with ?leaveHeld=1 does not.
 *      Finishing the run sends them before its key is taken back.
 *   5. A draft to a person goes within ten minutes, even while the turn runs on: the reminders pass files it as Mole
 *      Office, with the agent as the sender and the run named. A draft to an agent waits for the turn's end. So does
 *      a draft to a group of agents only, while a draft to a group with a person among its members goes within the ten
 *      minutes.
 *   6. The chat's Replying is real: the conversation answers `replying` true only while a draft to that reader is held.
 *   7. Only Mole Office writes a turn draft: a draft written or changed through the record door with a `turn` is
 *      refused, and a draft somebody wrote is never sent by any of the above.
 *   8. Only a run's own key reports a turn.
 *   9. The hooks: a Claude Code run's step hook says the turn started once in the run, and its stop hook says it ended.
 *      Against an office that has no turn door, the step hook says once that the start was refused, never asks
 *      ?leaveHeld=1, and still gives the count.
 *  10. A run that crashes holding a draft has it sent at the next pass of the reminders, filed by Mole Office.
 *  11. The draft list gives a turn draft no reminder time, since no reminder comes for it.
 *  12. The seal sends what the run holds before it reads the run's last message to its starter, so a FEATURE READY: line
 *      written in the turn that seals is the message it reads, and the check is not held.
 *  13. A finish or seal the office refuses sends nothing. What the run holds goes in the same transaction as the write
 *      that ends the run, so a refusal before that write, or inside it, leaves the words held: the office's own
 *      fields, the reminder before the seal, a seal the reminder blocks, and a stale version.
 *
 * THE MEASURE. On this made-up office one agent writes 6 messages to the owner in one turn and 2 in the next. Before,
 * with no turn report, the owner is sent 5 messages, and the last 3 writes are refused, since one run may file 5. After,
 * the owner is sent 2 messages, one for each turn, and they hold all 8 writes.
 *
 * ---------------------------------------------------------------------------------------
 * RED ON MAIN, AND THE MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 * On main the turn door does not exist (404), so every case but the first is red; case 14 is red because the step
 * hook on main asks no turn door and says nothing.
 *
 * MUTATIONS (each after a green control, then restored):
 *   - throughTheTurnDraft in lib/turn-drafts.ts files every write at once: cases 2, 4 to 7, 10 to 13,
 *     15 and the measure are red.
 *   - the inbox read in api/messages.ts ignores leaveHeld: cases 5 and 10 are red.
 *   - sendTheTurnDraftsThatAreDue in lib/turn-drafts.ts waits for nothing: cases 7 and 15 are red.
 *   - itReachesAPerson in lib/turn-drafts.ts counts every group as a person: case 15 is red.
 *   - sendTheTurnDraftsThatAreDue sends no draft of a run that has ended: case 11 is red.
 *   - whenTheReminderIsDue in src/shared/drafts.ts gives a turn draft a time: case 12 is red.
 *   - the record PATCH door sends what the run holds after the seal is read: cases 6 and 13 are red.
 *   - the record PATCH door sends what the run holds before its refusals, as round BV first wrote it: case 16 is red.
 *   - the record PATCH door sends what the run holds outside the write's transaction: case 16 is red, at the stale
 *     version.
 *   - unseenMessages in tools/dsh-hooks/office.mjs asks ?leaveHeld=1 of every office: case 14 is red.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { aClaudeCommandsOfficeTool, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { theDeliveryPreface } from '../tools/dsh-hooks/office.mjs'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aLabelFor, aReportInForm } from './a-run-in-form.ts'

const STEP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-step.mjs', import.meta.url))
const STOP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-stop.mjs', import.meta.url))

/** Made-up keys, written before the server is built. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const WRITER = 'a-made-up-writer'
const READER = 'a-made-up-reader'
const BEFORE = 'a-made-up-writer-before'
const AFTER = 'a-made-up-writer-after'
const HOOKED = 'a-made-up-hooked-writer'
const STARTER = 'a-made-up-starter'
const SEALER = 'a-made-up-sealer'

let t: TestDb
let app: FastifyInstance
let api = ''
const ids: Record<string, string> = {}
const registrationKeys: Record<string, string> = {}
const made: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

interface Run {
  handle: string
  id: string
  key: string
}

const asTheRun = (run: Run): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': run.handle,
  'x-mole-office-session': run.id,
  'x-mole-office-key': run.key,
})

const TO_THE_PERSON = [{ kind: 'person', id: THE_PERSON }]
const toTheReader = (): { kind: string; id: string }[] => [{ kind: 'agent', id: ids[READER]! }]

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

async function register(handle: string, role = 'worker', startedBy?: string): Promise<void> {
  const by = startedBy === undefined ? AS_THE_PERSON : { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': startedBy }
  const registered = await ask('POST', '/api/agents/started', by, { handle, name: handle, role, runtime: 'claude-code', ...(startedBy === undefined ? {} : { workArea: ['work'] }) })
  expect(registered.status, JSON.stringify(registered.json).slice(0, 300)).toBe(201)
  registrationKeys[handle] = String((registered.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  ids[handle] = one(((listed.json['agents'] ?? []) as { id: string; handle: string }[]).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** A run of `handle` filed by the office's own worker, with the key the office mints it. `more` is more of its data. */
async function aRunOf(handle: string, more: Record<string, unknown> = {}): Promise<Run> {
  const filed = await ask('POST', '/api/records', AS_THE_OFFICE_WORKER, {
    kind: 'session',
    title: `a run of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: ids[handle], doing: 'writing', ...more },
  })
  expect(filed.status, JSON.stringify(filed.json).slice(0, 300)).toBe(201)
  const key = String((filed.json['runKey'] as { key?: string } | undefined)?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  return { handle, id: (filed.json['record'] as { id: string }).id, key }
}

const theTurn = (run: Run, turn: 'started' | 'ended'): ReturnType<typeof ask> => ask('POST', '/api/drafts/turn', asTheRun(run), { turn })

/**
 * A message the run writes, through the record door, as an agent's tool sends it.
 *
 * EACH AGENT IT WRITES TO IS HELD WHILE THE WRITE IS MADE, and let go after it. An agent's send to an agent nothing
 * holds is answered 409, and a draft holds only a write the door's check answers 201; a real reader is held by its
 * own session. Every read after the write sees the reader unheld again, as before.
 */
async function write(run: Run, title: string, data: Record<string, unknown>, more: Record<string, unknown> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const readers = ((data['to'] ?? []) as { kind: string; id: string }[])
    .filter((to) => to.kind === 'agent')
    .map((to) => one(Object.keys(ids).filter((handle) => ids[handle] === to.id), `the handle of ${to.id}`))
  const holders: [string, string][] = []
  try {
    for (const handle of readers) {
      const holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
        data: { state: 'running', runtime: 'claude-code' } }).id
      const { registerResource } = await import('../src/server/lib/resources.ts')
      registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
      const held = await ask('POST', `/api/handles/${encodeURIComponent(handle)}/hold`, AS_THE_PERSON,
        { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' })
      expect(held.status, JSON.stringify(held.json).slice(0, 300)).toBe(201)
      holders.push([handle, holder])
    }
    return await ask('POST', '/api/records', asTheRun(run), { kind: 'message', title, data, ...more })
  } finally {
    for (const [handle, holder] of holders) {
      const released = await ask('POST', `/api/handles/${encodeURIComponent(handle)}/release`, AS_THE_PERSON,
        { session: holder, because: 'The synthetic send is complete.' })
      expect(released.status, JSON.stringify(released.json).slice(0, 300)).toBe(200)
    }
  }
}

interface Row {
  id: string
  title: string
  data: Record<string, unknown>
}

function rows(sql: string, ...values: unknown[]): Row[] {
  return (t.client.sqlite.prepare(sql).all(...values) as { id: string; title: string; data: string }[]).map((row) => ({
    id: row.id,
    title: row.title,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }))
}

/** The messages an agent was the sender of, in the order they were filed: two filed in one second keep their order. */
const messagesFrom = (handle: string): Row[] =>
  rows("SELECT id, title, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = ? ORDER BY rowid", ids[handle])

/** The messages an agent sent to the person. */
const messagesToThePerson = (handle: string): Row[] =>
  messagesFrom(handle).filter((row) => Array.isArray(row.data['to']) && (row.data['to'] as { kind: string }[]).some((one) => one.kind === 'person'))

const theDraft = (id: string): Row => one(rows('SELECT id, title, data FROM records WHERE id = ?', id), `the draft ${id}`)

const theHeld = (answer: { json: Record<string, unknown> }): { draft: string; joined: boolean; writes: number; readers: string } =>
  answer.json['held'] as { draft: string; joined: boolean; writes: number; readers: string }

/** The actor the record's first change names. */
function whoFiled(recordId: string): { type: string; id: string } {
  return t.client.sqlite.prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at LIMIT 1').get(recordId) as { type: string; id: string }
}

async function theRemindersPass(now: Date): Promise<string[]> {
  const reminders = await import('../src/server/lib/reminders.ts')
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 60_000)).turnDraftsSent
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A sandbox round of SEALER: a made-up repository at commit A, and commit B on the run's branch. */
async function aSandboxRound(): Promise<Run & { tip: string }> {
  const dir = aScratchDirectory('round')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Made-up round')
  git(dir, 'config', 'user.email', 'made-up-round@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Made-up commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const run = await aRunOf(SEALER, { workingDirectory: dir, cutFrom: 'main', tip: a, sandbox: { template: 'made-up-template', container: 'made-up-row', folder: dir } })
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  git(dir, 'commit', '-qam', 'Made-up commit B')
  return { ...run, tip: git(dir, 'rev-parse', 'HEAD') }
}

function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-drafts-by-default-${what}-`))
  made.push(dir)
  return dir
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const handle of [WRITER, READER, BEFORE, AFTER, HOOKED]) await register(handle)
  // A STARTER AND THE WORKER IT STARTED, so a sandbox round of the worker has a starter its seal reads.
  await register(STARTER, 'secretary')
  await register(SEALER, 'worker', STARTER)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('drafts by default', () => {
  it('1: a run that has not said it reports its turns is sent at once, as before', async () => {
    const run = await aRunOf(WRITER)
    const sent = await write(run, 'Sent at once', { body: 'This goes now.', to: TO_THE_PERSON })
    expect(sent.status, JSON.stringify(sent.json).slice(0, 300)).toBe(201)
    expect(messagesFrom(WRITER).map((row) => row.data['body'])).toContain('This goes now.')
  })

  it('2: once the run reports its turns, its messages are held, joined per readers, and one Take me there each', async () => {
    const run = await aRunOf(WRITER)
    const before = messagesFrom(WRITER).length
    const started = await theTurn(run, 'started')
    expect(started.status, JSON.stringify(started.json).slice(0, 300)).toBe(200)
    expect(started.json).toMatchObject({ run: run.id, turn: 'started', sent: [], notSent: [] })

    const first = await write(run, 'What I found', { body: 'First words.', to: TO_THE_PERSON })
    expect(first.status, JSON.stringify(first.json).slice(0, 300)).toBe(202)
    expect(theHeld(first)).toMatchObject({ joined: false, writes: 1 })
    expect(String(first.json['note'])).toContain('"urgent": true')

    const second = await write(run, 'What I found', { body: 'Second words.', to: TO_THE_PERSON })
    expect(second.status).toBe(202)
    expect(theHeld(second)).toMatchObject({ draft: theHeld(first).draft, joined: true, writes: 2 })
    expect(theDraft(theHeld(first).draft).data['body']).toBe('First words.\n\nSecond words.')

    const toTheAgent = await write(run, 'For you', { body: 'To another reader.', to: toTheReader() })
    expect(toTheAgent.status).toBe(202)
    expect(theHeld(toTheAgent).draft).not.toBe(theHeld(first).draft)

    // ONE TAKE ME THERE PER MESSAGE: the first joins and brings its lead, the second starts a draft of its own.
    const note = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'A page to look at', data: { body: 'a note' } })
    expect(note.status).toBe(201)
    const lead = { target: { kind: 'record', recordId: (note.json['record'] as { id: string }).id, workspaceId: 'default' } }
    const led = await write(run, 'What I found', { body: 'Look here.', to: TO_THE_PERSON, lead })
    expect(theHeld(led)).toMatchObject({ draft: theHeld(first).draft, joined: true, writes: 3 })
    const ledAgain = await write(run, 'What I found', { body: 'And look here.', to: TO_THE_PERSON, lead })
    expect(ledAgain.status).toBe(202)
    expect(theHeld(ledAgain).draft).not.toBe(theHeld(first).draft)
    expect(String(ledAgain.json['startedAnotherDraftBecause'])).toContain('Take me there')

    // A SEND ID ALREADY HELD ADDS NOTHING.
    const once = await write(run, 'Once', { body: 'Said once.', to: toTheReader(), sendId: 'a-made-up-send-id' })
    expect(once.status).toBe(202)
    const twice = await write(run, 'Once', { body: 'Said once.', to: toTheReader(), sendId: 'a-made-up-send-id' })
    expect(twice.status).toBe(200)
    expect(twice.json['alreadyHeld']).toBe(true)
    expect(theDraft(theHeld(toTheAgent).draft).data['body']).toBe('To another reader.\n\nSaid once.')

    expect(messagesFrom(WRITER).length, 'a held write was sent').toBe(before)
    await theTurn(run, 'ended')
  })

  it('3: urgent, a summary and a person are never held', async () => {
    const run = await aRunOf(WRITER)
    expect((await theTurn(run, 'started')).status).toBe(200)
    const urgent = await write(run, 'Now', { body: 'Urgent words.', to: TO_THE_PERSON, urgent: true })
    expect(urgent.status, JSON.stringify(urgent.json).slice(0, 300)).toBe(201)
    const summed = await write(run, 'With a summary', { body: 'Summed words.', to: TO_THE_PERSON }, { summary: 'A summary.' })
    expect(summed.status, JSON.stringify(summed.json).slice(0, 300)).toBe(201)
    const bodies = messagesFrom(WRITER).map((row) => row.data['body'])
    expect(bodies).toContain('Urgent words.')
    expect(bodies).toContain('Summed words.')

    const fromThePerson = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: 'From the person', data: { body: 'The person’s words.', to: [{ kind: 'agent', id: ids[WRITER] }] } })
    // THE UNHELD 409 (decision 60sbc5I-bwKx): nothing holds this run's agent, so the person's line answers the error.
    // What this case measures is that it is never held as a draft; it is still stored and sent.
    expect(fromThePerson.status, JSON.stringify(fromThePerson.json).slice(0, 300)).toBe(409)
    await theTurn(run, 'ended')
  })

  it("4: the turn's end sends each draft as one message, filed by the run with the agent as sender, and Replying goes", async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const held = await write(run, 'Two things', { body: 'One.', to: TO_THE_PERSON })
    await write(run, 'Two things', { body: 'Two.', to: TO_THE_PERSON })
    const replying = await ask('GET', `/api/messages/conversation?kind=agent&id=${ids[WRITER]!}`, AS_THE_PERSON)
    expect(replying.status, JSON.stringify(replying.json).slice(0, 300)).toBe(200)
    expect(replying.json['replying'], 'the chat would not draw Replying while words to the person are held').toBe(true)

    // NOTHING IS CHECKED OR ASKED: the turn's end sends in the same request.
    const ended = await theTurn(run, 'ended')
    expect(ended.status, JSON.stringify(ended.json).slice(0, 300)).toBe(200)
    const sent = ended.json['sent'] as { draft: string; message: string }[]
    expect(sent.map((one) => one.draft)).toEqual([theHeld(held).draft])
    const message = one(rows('SELECT id, title, data FROM records WHERE id = ?', sent[0]!.message), 'the message sent')
    expect(message.data['body']).toBe('One.\n\nTwo.')
    expect(message.data['sentBy']).toEqual({ kind: 'agent', id: ids[WRITER] })
    expect(whoFiled(message.id)).toEqual({ type: 'agent', id: WRITER })
    expect(theDraft(theHeld(held).draft).data['sentAs']).toBe(message.id)

    const after = await ask('GET', `/api/messages/conversation?kind=agent&id=${ids[WRITER]!}`, AS_THE_PERSON)
    expect(after.json['replying']).toBe(false)
  })

  it("5: the run's own inbox read sends what it holds first; a hook's read with leaveHeld does not", async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const held = await write(run, 'Before you read', { body: 'Held until the read.', to: toTheReader() })
    expect(held.status).toBe(202)
    const left = await ask('GET', '/api/messages?only=waiting-for-me&leaveHeld=1', asTheRun(run))
    expect(left.status, JSON.stringify(left.json).slice(0, 300)).toBe(200)
    expect(theDraft(theHeld(held).draft).data['sentAs'], 'a hook read sent the held words').toBeUndefined()
    const read = await ask('GET', '/api/messages?only=waiting-for-me', asTheRun(run))
    expect(read.status).toBe(200)
    expect(theDraft(theHeld(held).draft).data['sentAs'], 'the inbox read did not send the held words first').toEqual(expect.any(String))

    const alone = await ask('GET', '/api/messages?leaveHeld=1', asTheRun(run))
    expect(alone.status, 'leaveHeld without only=waiting-for-me was taken').toBe(400)
    await theTurn(run, 'ended')
  })

  it('6: finishing the run sends what it holds before its key is taken back, and the reminder before it sends nothing', async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const held = await write(run, 'Last words', { body: 'Before I finish.', to: toTheReader() })
    expect(held.status).toBe(202)
    const note = await ask('POST', '/api/records', asTheRun(run), { kind: 'note', title: 'What I did', data: { body: 'a note' } })
    expect(note.status, JSON.stringify(note.json).slice(0, 300)).toBe(201)
    // The run's records are in form: the note it hands over has its label, and its report is linked.
    await aLabelFor((note.json['record'] as { id: string }).id)
    await aReportInForm(t, run.id, WRITER)
    // THE FIRST FINISH IS ANSWERED WITH THE REMINDER BEFORE THE SEAL, which stores nothing, so the words wait for the next.
    const payload = { dataPatch: { state: 'finished', submission: { kind: 'records', records: [(note.json['record'] as { id: string }).id] } } }
    const reminded = await ask('PATCH', `/api/records/${run.id}`, asTheRun(run), payload)
    expect(reminded.status, JSON.stringify(reminded.json).slice(0, 300)).toBe(200)
    expect(reminded.json['beforeTheSeal'], JSON.stringify(reminded.json).slice(0, 300)).toMatchObject({ sealed: false })
    expect(theDraft(theHeld(held).draft).data['sentAs'], 'the reminder, which stores nothing, sent the held words').toBeUndefined()
    const finished = await ask('PATCH', `/api/records/${run.id}`, asTheRun(run), payload)
    expect(finished.status, JSON.stringify(finished.json).slice(0, 300)).toBe(200)
    expect((finished.json['record'] as { data: Record<string, unknown> }).data['state'], 'the second finish did not finish the run').toBe('finished')
    const sentAs = theDraft(theHeld(held).draft).data['sentAs']
    expect(sentAs, 'the finish did not send the held words').toEqual(expect.any(String))
    expect(whoFiled(String(sentAs))).toEqual({ type: 'agent', id: WRITER })
  })

  it('7: a draft to a person goes within ten minutes, filed by Mole Office; a draft to an agent waits for the turn', async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const toThem = await write(run, 'A long turn', { body: 'Still working.', to: TO_THE_PERSON })
    const toTheAgent = await write(run, 'A long turn', { body: 'Still working too.', to: toTheReader() })
    expect(await theRemindersPass(new Date()), 'a draft went before its ten minutes').toEqual([])

    const elevenMinutesAgo = localStamp(new Date(Date.now() - 11 * 60_000))
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.turn.heldAt', ?) WHERE id = ?").run(elevenMinutesAgo, theHeld(toThem).draft)
    expect(await theRemindersPass(new Date())).toEqual([theHeld(toThem).draft])
    const sentAs = String(theDraft(theHeld(toThem).draft).data['sentAs'])
    const message = one(rows('SELECT id, title, data FROM records WHERE id = ?', sentAs), 'the message Mole Office sent')
    expect(message.data['sentBy']).toEqual({ kind: 'agent', id: ids[WRITER] })
    expect(message.data['fromRun']).toBe(run.id)
    expect(whoFiled(sentAs).type).toBe('system')
    expect(theDraft(theHeld(toTheAgent).draft).data['sentAs'], 'a draft to an agent went before the turn ended').toBeUndefined()
    await theTurn(run, 'ended')
  })

  it('15: a group with a person among its members goes within ten minutes; a group of agents only waits for the turn', async () => {
    const groups = await import('../src/server/lib/groups.ts')
    const person = { kind: 'person', id: THE_PERSON } as const
    const writer = { kind: 'agent', id: ids[WRITER]! } as const
    const reader = { kind: 'agent', id: ids[READER]! } as const
    const aGroupOf = (name: string, members: (typeof person | typeof writer)[]) =>
      groups.openAGroup({ workspaceId: 'default', name, openedBy: person, because: 'Made up for this test.', members: members.map((who) => ({ who, because: 'Made up for this test.' })) })
    const aGroupWithThem = aGroupOf('Made-up group with the person', [person, writer])
    const agentsOnly = aGroupOf('Made-up group of agents', [writer, reader])
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const toTheGroupWithThem = await write(run, 'A long turn', { body: 'Still working.', toGroup: aGroupWithThem.id })
    const toTheAgents = await write(run, 'A long turn', { body: 'Still working too.', toGroup: agentsOnly.id })
    expect([toTheGroupWithThem.status, toTheAgents.status], JSON.stringify([toTheGroupWithThem.json, toTheAgents.json]).slice(0, 400)).toEqual([202, 202])
    expect(await theRemindersPass(new Date()), 'a draft went before its ten minutes').toEqual([])

    const elevenMinutesAgo = localStamp(new Date(Date.now() - 11 * 60_000))
    for (const held of [toTheGroupWithThem, toTheAgents]) {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.turn.heldAt', ?) WHERE id = ?").run(elevenMinutesAgo, theHeld(held).draft)
    }
    expect(await theRemindersPass(new Date()), 'the drafts the pass sent').toEqual([theHeld(toTheGroupWithThem).draft])
    expect(theDraft(theHeld(toTheAgents).draft).data['sentAs'], 'a draft to a group of agents went before the turn ended').toBeUndefined()
    await theTurn(run, 'ended')
    expect(theDraft(theHeld(toTheAgents).draft).data['sentAs'], 'the turn ended and the group of agents was not sent its draft').toEqual(expect.any(String))
  })

  it('8: only Mole Office writes a turn draft, and a draft somebody wrote is never sent', async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const forged = await ask('POST', '/api/records', asTheRun(run), {
      kind: 'draft',
      title: 'A forged turn draft',
      data: { body: 'Send me.', for: TO_THE_PERSON, becomes: 'message', turn: { run: run.id, readers: `person:${THE_PERSON}`, writes: 1 } },
    })
    expect(forged.status, JSON.stringify(forged.json).slice(0, 300)).toBe(403)

    const own = await ask('POST', '/api/records', asTheRun(run), { kind: 'draft', title: 'My own draft', data: { body: 'Not yet.', for: TO_THE_PERSON, becomes: 'message' } })
    expect(own.status, JSON.stringify(own.json).slice(0, 300)).toBe(201)
    const ownId = (own.json['record'] as { id: string }).id
    const turned = await ask('PATCH', `/api/records/${ownId}`, asTheRun(run), { dataPatch: { turn: { run: run.id, readers: `person:${THE_PERSON}`, writes: 1 } } })
    expect(turned.status, JSON.stringify(turned.json).slice(0, 300)).toBe(403)

    await theTurn(run, 'ended')
    await theRemindersPass(new Date(Date.now() + 60 * 60_000))
    expect(theDraft(ownId).data['sentAs'], "somebody's own draft was sent").toBeUndefined()
  })

  it("9: only a run's own key reports a turn", async () => {
    const asTheAgent = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER, 'x-mole-office-key': registrationKeys[WRITER]! }
    const refused = await ask('POST', '/api/drafts/turn', asTheAgent, { turn: 'ended' })
    expect(refused.status, JSON.stringify(refused.json).slice(0, 300)).toBe(403)
    const unknown = await ask('POST', '/api/drafts/turn', asTheRun(await aRunOf(WRITER)), { turn: 'paused' })
    expect(unknown.status).toBe(400)
  })

  it("11: a run that crashes holding a draft has it sent at the next pass, filed by Mole Office", async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const held = await write(run, 'Cut off', { body: 'Halfway through.', to: toTheReader() })
    expect(held.status, JSON.stringify(held.json).slice(0, 300)).toBe(202)
    expect(await theRemindersPass(new Date()), 'a draft to an agent went while its run was alive').toEqual([])

    // THE RUN CRASHES as the worker marks it: its session's state, written by the office, with no turn's end and no read.
    const crashed = await ask('PATCH', `/api/records/${run.id}`, AS_THE_OFFICE_WORKER, { dataPatch: { state: 'crashed' } })
    expect(crashed.status, JSON.stringify(crashed.json).slice(0, 300)).toBe(200)
    expect(theDraft(theHeld(held).draft).data['sentAs'], 'the crash itself sent the words, so this case proves nothing of the pass').toBeUndefined()
    expect(await theRemindersPass(new Date())).toEqual([theHeld(held).draft])
    const sentAs = String(theDraft(theHeld(held).draft).data['sentAs'])
    const message = one(rows('SELECT id, title, data FROM records WHERE id = ?', sentAs), 'the message Mole Office sent')
    expect(message.data['body']).toBe('Halfway through.')
    expect(message.data['sentBy']).toEqual({ kind: 'agent', id: ids[WRITER] })
    expect(message.data['fromRun']).toBe(run.id)
    expect(whoFiled(sentAs).type).toBe('system')
  })

  it('12: the draft list gives a turn draft no reminder time, since Mole Office sends it by itself', async () => {
    const run = await aRunOf(WRITER)
    await theTurn(run, 'started')
    const held = await write(run, 'Listed', { body: 'In the list.', to: toTheReader() })
    expect(held.status).toBe(202)
    const listed = await ask('GET', '/api/drafts', asTheRun(run))
    expect(listed.status, JSON.stringify(listed.json).slice(0, 300)).toBe(200)
    const row = one(((listed.json['drafts'] ?? []) as { id: string; sent: boolean; reminderDueAt: unknown }[]).filter((one) => one.id === theHeld(held).draft), 'the turn draft in the list')
    expect(row.sent).toBe(false)
    expect(row.reminderDueAt, 'the list names a reminder that will never come').toBeNull()
    await theTurn(run, 'ended')
  })

  it('13: "I seal next" written in the turn that seals is sent before the seal reads it, so the check is not held', async () => {
    const round = await aSandboxRound()
    await aReportInForm(t, round.id, SEALER)
    await theTurn(round, 'started')
    const end = await write(round, 'The round is done', { body: `${FEATURE_READY} The report is linked. I seal next.`, to: [{ kind: 'agent', id: ids[STARTER]! }] })
    expect(end.status, JSON.stringify(end.json).slice(0, 300)).toBe(202)

    const payload = { dataPatch: { state: 'finished', tip: round.tip } }
    const reminded = await ask('PATCH', `/api/records/${round.id}`, asTheRun(round), payload)
    expect(reminded.status, JSON.stringify(reminded.json).slice(0, 600)).toBe(200)
    const sealed = await ask('PATCH', `/api/records/${round.id}`, asTheRun(round), payload)
    expect(sealed.status, JSON.stringify(sealed.json).slice(0, 600)).toBe(200)
    const sentAs = theDraft(theHeld(end).draft).data['sentAs']
    expect(sentAs, 'the seal did not send the held END').toEqual(expect.any(String))
    expect(whoFiled(String(sentAs))).toEqual({ type: 'agent', id: SEALER })
    const account = sealed.json['howTheRoundEnded'] as { sealed?: boolean; theCheck?: string; message?: string } | undefined
    expect(account, JSON.stringify(sealed.json).slice(0, 600)).toMatchObject({ sealed: true })
    expect(account!.theCheck, "the seal read the run's last message before its END was sent").not.toBe('held')
  })

  it('16: a finish or seal the office refuses sends nothing, and the held END goes with the seal that is taken', async () => {
    const round = await aSandboxRound()
    await theTurn(round, 'started')
    const words = `${FEATURE_READY} Round sixteen is done. I seal next.`
    const end = await write(round, 'The round is done', { body: words, to: [{ kind: 'agent', id: ids[STARTER]! }] })
    expect(end.status, JSON.stringify(end.json).slice(0, 300)).toBe(202)
    const draft = theHeld(end).draft
    const stillHeld = (after: string): void => {
      expect(theDraft(draft).data['sentAs'], `${after} sent the held END`).toBeUndefined()
      expect(messagesFrom(SEALER).filter((row) => row.data['body'] === words), `${after} filed the held END`).toEqual([])
    }
    const seal = (dataPatch: Record<string, unknown> = {}, more: Record<string, unknown> = {}): ReturnType<typeof ask> =>
      ask('PATCH', `/api/records/${round.id}`, asTheRun(round), { dataPatch: { state: 'finished', tip: round.tip, ...dataPatch }, ...more })

    const officeOnly = await seal({ needsNoCheck: true })
    expect(officeOnly.status, JSON.stringify(officeOnly.json).slice(0, 600)).toBe(403)
    expect(String(officeOnly.json['error'])).toContain('Nothing was written.')
    stillHeld('a seal refused for needsNoCheck')

    // AT BLOCK THE FIRST SEAL IS ANSWERED WITH THE REMINDER, and the next one is refused: the made-up round has no report.
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    try {
      const reminded = await seal()
      expect(reminded.status, JSON.stringify(reminded.json).slice(0, 600)).toBe(200)
      expect(reminded.json['beforeTheSeal'], JSON.stringify(reminded.json).slice(0, 600)).toMatchObject({ sealed: false })
      stillHeld('the reminder before the seal')
      const blocked = await seal()
      expect(blocked.status, JSON.stringify(blocked.json).slice(0, 600)).toBe(409)
      expect(String(blocked.json['error'])).toContain('still finds a certain item the reminder named')
      stillHeld('a seal the reminder blocked')
    } finally {
      vi.unstubAllEnvs()
    }

    // THE ROUND FILES ITS REPORT IN FORM, so what the reminder named is fixed and no fault of form refuses a later seal.
    await aReportInForm(t, round.id, SEALER)

    // A STALE VERSION IS REFUSED INSIDE THE WRITE ITSELF, after the reminder has let the seal through.
    const stale = await seal({}, { ifVersion: 'a-made-up-version-nobody-read' })
    expect(stale.status, JSON.stringify(stale.json).slice(0, 600)).toBe(409)
    expect(String(stale.json['error'])).toContain('nothing was written')
    stillHeld('a seal refused for a stale version')

    const sealed = await seal()
    expect(sealed.status, JSON.stringify(sealed.json).slice(0, 600)).toBe(200)
    const sentAs = theDraft(draft).data['sentAs']
    expect(sentAs, 'the seal that was taken did not send the held END').toEqual(expect.any(String))
    expect(whoFiled(String(sentAs))).toEqual({ type: 'agent', id: SEALER })
    const account = sealed.json['howTheRoundEnded'] as { sealed?: boolean; theCheck?: string } | undefined
    expect(account, JSON.stringify(sealed.json).slice(0, 600)).toMatchObject({ sealed: true })
    expect(account!.theCheck, "the seal read the run's last message before its END was sent").not.toBe('held')
  })

  it('THE MEASURE: 6 and then 2 writes to the owner are 5 messages and 3 refusals before, and 2 messages after', async () => {
    // ONE RUN MAY FILE A FEW MESSAGES, read from where the office reads it, so the measure says what this office allows.
    const allowed = (await import('../src/server/lib/worker.ts')).howManyMessagesOneRunMayFile()
    expect(allowed, 'the per-run allowance changed, so the numbers below no longer describe this office').toBe(5)

    const before = await aRunOf(BEFORE)
    const statuses: number[] = []
    for (let n = 1; n <= 8; n++) statuses.push((await write(before, 'Progress', { body: `Step ${String(n)}.`, to: TO_THE_PERSON })).status)
    expect(statuses).toEqual([201, 201, 201, 201, 201, 400, 400, 400])
    expect(messagesToThePerson(BEFORE)).toHaveLength(5)

    const after = await aRunOf(AFTER)
    await theTurn(after, 'started')
    for (let n = 1; n <= 6; n++) expect((await write(after, 'Progress', { body: `Step ${String(n)}.`, to: TO_THE_PERSON })).status).toBe(202)
    await theTurn(after, 'ended')
    for (let n = 7; n <= 8; n++) expect((await write(after, 'Progress', { body: `Step ${String(n)}.`, to: TO_THE_PERSON })).status).toBe(202)
    await theTurn(after, 'ended')
    expect(messagesToThePerson(AFTER).map((row) => row.data['body'])).toEqual([
      'Step 1.\n\nStep 2.\n\nStep 3.\n\nStep 4.\n\nStep 5.\n\nStep 6.',
      'Step 7.\n\nStep 8.',
    ])
  })
})

describe("a Claude Code run's hooks report its turns", () => {
  /** Runs a hook as Claude Code does. What it prints on stdout is added to `out` when one is given. */
  function runHook(script: string, cwd: string, run: Run, tool: { changes: Record<string, string | null> }, payload: unknown, out?: string[]): Promise<{ status: number | null; stderr: string }> {
    const env: Record<string, string> = { ...withoutInheritedEffort() } as Record<string, string>
    for (const name of ['FORCE_COLOR', 'NO_COLOR', 'MOLE_AGENT_KEY', OFFICE_TOOL_CONFIGURATION]) delete env[name]
    env['MOLE_OFFICE_AGENT'] = run.handle
    env['MOLE_OFFICE_SESSION'] = run.id
    env['MOLE_OFFICE_WORKSPACE'] = 'default'
    env['MOLE_OFFICE_API'] = api
    env['MOLE_OFFICE_DB'] = join(aScratchDirectory('no-key-file'), 'panelx.db')
    for (const [name, value] of Object.entries(tool.changes)) {
      if (value === null) delete env[name]
      else env[name] = value
    }
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [script], { cwd, env })
      let stderr = ''
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      child.stdout.on('data', (chunk) => out?.push(String(chunk)))
      child.stdin.on('error', () => {})
      child.on('close', (status) => resolve({ status, stderr }))
      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
    })
  }

  it('10: the step hook says the turn started once, and the stop hook says it ended, so the held words go', async () => {
    const run = await aRunOf(HOOKED)
    const path = join(aScratchDirectory('office-mcp'), 'office-mcp.json')
    const answered = aClaudeCommandsOfficeTool(['claude', '-p'], {
      MOLE_OFFICE_AGENT: run.handle,
      MOLE_OFFICE_SESSION: run.id,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_API: api,
      MOLE_AGENT_KEY: run.key,
    }, path)
    expect(answered.configuration, 'the launcher wrote no office tool configuration').not.toBeNull()
    writeFileSync(path, `${JSON.stringify(answered.configuration)}\n`, { mode: 0o600, flag: 'wx' })
    const tool = { changes: answered.env }
    const workspace = aScratchDirectory('worktree')

    const sentAtOnce = await write(run, 'Before the first step', { body: 'Goes at once.', to: TO_THE_PERSON })
    expect(sentAtOnce.status, 'a write before the first step was held').toBe(201)
    const stepped = await runHook(STEP, workspace, run, tool, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(stepped).toEqual({ status: 0, stderr: '' })
    const held = await write(run, 'After a step', { body: 'Held for the turn.', to: TO_THE_PERSON })
    expect(held.status, JSON.stringify(held.json).slice(0, 300)).toBe(202)
    const again = await runHook(STEP, workspace, run, tool, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(again).toEqual({ status: 0, stderr: '' })
    expect(theDraft(theHeld(held).draft).data['sentAs'], 'a second step sent the held words').toBeUndefined()

    const stopped = await runHook(STOP, workspace, run, tool, { hook_event_name: 'Stop' })
    expect(stopped.status, stopped.stderr).toBe(0)
    const sentAs = theDraft(theHeld(held).draft).data['sentAs']
    expect(sentAs, "the stop hook did not end the turn").toEqual(expect.any(String))
    expect(whoFiled(String(sentAs))).toEqual({ type: 'agent', id: HOOKED })
  })

  it('14: against an office with no turn door, which refuses leaveHeld, the step hook still hands the message over', async () => {
    // A MADE-UP OFFICE OF BEFORE THIS CHANGE: no turn door, and a pool door that refuses a word it does not know.
    const asked: string[] = []
    const older: Server = createServer((req, res) => {
      asked.push(`${String(req.method)} ${String(req.url)}`)
      req.resume()
      res.setHeader('content-type', 'application/json')
      if (req.method === 'GET' && String(req.url).startsWith('/api/messages?only=waiting-for-me')) {
        if (String(req.url).includes('leaveHeld')) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Unrecognized key: "leaveHeld"' }))
          return
        }
        res.end(JSON.stringify({ messages: [{ id: 'a-made-up-message', title: 'Made up', body: 'Made up.' }] }))
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Not found' }))
    })
    await new Promise<void>((resolve) => older.listen(0, '127.0.0.1', resolve))
    try {
      const at = `http://127.0.0.1:${String((older.address() as AddressInfo).port)}`
      const run = { handle: 'a-made-up-older-run', id: 'a-made-up-older-session', key: 'not-a-key' }
      const workspace = aScratchDirectory('older-office')
      const tool = { changes: { MOLE_OFFICE_API: at } }
      const out: string[] = []
      const first = await runHook(STEP, workspace, run, tool, { hook_event_name: 'PostToolUse', tool_name: 'Bash' }, out)
      expect(first.status).toBe(0)
      const context = String((JSON.parse(out.join('')) as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext ?? '')
      expect(context.startsWith(theDeliveryPreface({ handle: run.handle }, 1)), first.stderr).toBe(true)
      expect(context, 'the step did not hand over the waiting message’s words').toContain('Made up.')
      expect(first.stderr).toContain('when this run said its turn started, so its messages are sent at once and not held')
      const second = await runHook(STEP, workspace, run, tool, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
      expect(second, 'the refused start was said again after a later step').toEqual({ status: 0, stderr: '' })
      const reads = asked.filter((one) => one.startsWith('GET /api/messages?only=waiting-for-me'))
      expect(reads, asked.join('\n')).toHaveLength(2)
      expect(reads.some((one) => one.includes('leaveHeld')), 'the hook asked an office that holds nothing to leave held words held').toBe(false)
    } finally {
      await new Promise<void>((resolve) => older.close(() => resolve()))
    }
  })
})
