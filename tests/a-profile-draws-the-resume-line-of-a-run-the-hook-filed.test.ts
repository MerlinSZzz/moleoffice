// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Fixture update: cases 6, 7 and 8 expect the door's refusal, as a run's record is changed only by those who hold the run; the line each case reads is unchanged. */
/**
 * A PROFILE DRAWS THE RESUME LINE OF A RUN THE HOOK FILED. Wave 13y round 135, item 78.
 *
 * After a crash the owner opened a secretary's profile for the command that resumes its conversation, and the profile
 * said the office had no record of a run of that agent. The way back (GET /api/terminals/agents/:agent/way-back,
 * drawn by AgentWayBack) counted only runs that name a serving agent. The session hook files a run under the agent's
 * name with no serving agent, so none of that agent's own conversations counted.
 *
 * A run now counts for the line when the agent filed it itself, or when its later writes are under the agent's name
 * and proved by the office's key, as the hook writes them. That is for the line only: it gives no holding, so the
 * agent's own key still holds only what it held before.
 *
 *   1. THE HOOK FILES A RUN UNDER THE NAME ALONE. The real hook is spawned at a session's start, as Claude Code spawns
 *      it, naming the agent and carrying none of its keys, against this file's own office. It files the run under the
 *      agent's name with no key, and does not say it is held by its filer. Nothing shows the agent filed it itself, so
 *      the run is not on the agent's line.
 *   2. A RUN SHAPED LIKE THE OWNER'S. It was filed with the office's key under the name "claude-code", which names no
 *      agent here, and its later writes are under the agent's name with the office's key, as the hook writes them
 *      after a resume. Its stamp carries a resume command and no process. The profile draws the command.
 *   3. THE LINE GIVES NO HOLDING. The agent's own key, sent with that run's session header, is still refused.
 *   4. A RUN COUNTS FOR ONE AGENT AT MOST. A run whose newest write the office's key proved is under a second agent's
 *      name counts for that agent and not for the first, though the first agent wrote to it earlier.
 *   5. THE PRESS FINDS THE RUN THE LINE SHOWS. The person's press to bring the run back in the office's terminal is
 *      refused because the run's folder is gone, which is a refusal it reaches only after it has found the run.
 *      Before, it said the office had no record of a run of the agent.
 *   6. A WRITE NO KEY PROVES IS REFUSED. A second agent's write under its own name, sent with no key, to a run whose
 *      keyed write is the first agent's, is refused. The run counts for the first agent, and not for the second.
 *   7. A WRITE ANOTHER AGENT'S KEY PROVES IS REFUSED. A supervisor's run key acts for the run of a subagent it started,
 *      so its write is under the subagent's name and proved by the supervisor's key. Its write to a run that neither of
 *      them holds is refused. The run counts for the agent whose write came before, and the subagent's line stays its
 *      own run.
 *   8. AN AGENT'S OWN KEY MOVES NO RUN TO ITS LINE. A second agent's own key, sent with no session header, may not
 *      write to the run the hook filed with the first agent's own key. The run still counts for the first agent, and
 *      not for the second.
 *   9. THE HOOK FILES A RUN WITH THE AGENT'S OWN KEY. When the agent holds its key, the hook files the run with that
 *      key and does not say it is held by its filer. The agent filed it itself, so the way back gives its command, and
 *      the profile draws the command that resumes it.
 *  10. A FILING NO KEY PROVES IS PASSED OVER. A run filed under the agent's name with no key does not count for it,
 *      since nothing shows the agent filed it itself.
 *
 * Each case first checks the fixture against the store: who made each write and what proved it, and that no run
 * names a serving agent. The command each case expects is the one src/config/the-way-back.mjs works out from the
 * stored record, not one written here.
 *
 * Red before the code: cases 1, 2, 4, 6, 7, 8 and 9 found no run for the agent, and case 5 found the press refused
 * with wayBackNoRun. Cases 3 and 10 are guards and passed at the old code too.
 *
 * The hook no longer files a run with the office's key under an agent's name that it holds no key of. So case 1 now
 * shows that filing passed over, case 8's run is filed by the hook with the first agent's own key, and the profile's
 * drawing of a run the hook filed is read in case 9.
 *
 * The door now refuses the writes of cases 6, 7 and 8, as a run's record is changed only by those who hold the run.
 * The reader still passes over such writes, which a store written before that rule may hold, and no case here plants
 * one.
 */

import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import type { Locator } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theSessionNotePath } from '../src/config/the-session-note.mjs'
import { theWayBackOf } from '../src/config/the-way-back.mjs'
import { createI18n } from '../src/shared/i18n.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, thePersonsKeyHeader, waitForThePage } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

/** The words every refusal of a keyed session header carries (src/server/lib/the-run-a-key-holds.ts). */
const THE_RULE = 'only when the key it carries holds that run'
/** The words every refusal of a write to a run the caller does not hold carries (src/server/lib/records.ts). */
const NOT_ITS_RUN = "A run's data is changed only by"

const t = createI18n('en').t

/** The two agents, and the name the owner's run was first filed under, which names no agent here. */
const A = 'resume-line-a'
const B = 'resume-line-b'
const UNREGISTERED = 'claude-code'
/** A launcher, the supervisor it starts, and the supervisor's subagent, for the write another agent's key proves. */
const LAUNCHER = 'resume-line-launcher'
const SUPERVISOR = 'resume-line-supervisor'
const SUBAGENT = 'resume-line-subagent'

let app: LiveApp
let db: Database.Database
let person: Record<string, string> = {}
let officeKey = ''
let keyOfA = ''
let keyOfB = ''
const notesWritten: string[] = []
const foldersMade: string[] = []

/** A folder of this test's own, removed after the file. */
function aFolder(what: string): string {
  const folder = mkdtempSync(join(tmpdir(), `mole-office-resume-line-${what}-`))
  foldersMade.push(folder)
  return folder
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: reply.status, body: (await reply.json()) as Record<string, unknown> }
}

/** The words of a refusal. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** An agent's headers: its name, and a key where one is sent. No assertion prints the key. */
function asAgent(name: string, key: string | null, session?: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': name,
    ...(key === null ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

/** Register an agent at the starter door, as the person or as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string> = person, role = 'worker'): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

/** Who made each write to a record, in order, and what proved it. */
function theWritesOf(recordId: string): { seq: number; actorType: string; actorId: string; provedBy: string | null }[] {
  return db
    .prepare('SELECT seq, actor_type AS actorType, actor_id AS actorId, proved_by AS provedBy FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(recordId) as { seq: number; actorType: string; actorId: string; provedBy: string | null }[]
}

/** The id of a registered agent. */
function theIdOf(handle: string): string {
  const row = db.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/** Whose key proved one write, where the key proved another agent than the name on the write, or null. */
function theKeyHolderOf(recordId: string, seq: number): string | null {
  const row = db.prepare('SELECT proved_holder AS holder FROM revisions WHERE record_id = ? AND seq = ?').get(recordId, seq) as { holder: string | null } | undefined
  expect(row, `no write ${String(seq)} of ${recordId}`).toBeDefined()
  return row!.holder === null ? null : String((JSON.parse(row!.holder) as { id?: unknown }).id)
}

/** File a running run serving an agent, with the headers given, and hand back its id and the run key it was minted, if any. */
async function fileARunServing(
  handle: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; runKey: string | null }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `Test run · ${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: theIdOf(handle), servingAgent: handle, ...extra },
  })
  expect(filed.status, said(filed.body)).toBe(201)
  const key = (filed.body['runKey'] as { key?: string } | undefined)?.key
  return { id: String((filed.body['record'] as { id?: string }).id), runKey: typeof key === 'string' && /^[0-9a-f]{64}$/.test(key) ? key : null }
}

/** A record's stored data. */
function theDataOf(recordId: string): Record<string, unknown> {
  const row = db.prepare('SELECT data FROM records WHERE id = ?').get(recordId) as { data: string } | undefined
  expect(row, `no record ${recordId}`).toBeDefined()
  return JSON.parse(row!.data) as Record<string, unknown>
}

/**
 * Run the hook at a session's start, as Claude Code runs it, naming the agent. It carries none of the agent's keys,
 * or the agent's own key where one is given, as a started agent's environment carries it.
 */
async function theHookFilesARun(agent: string, conversation: string, agentsKey?: string): Promise<string> {
  const home = aFolder('home')
  const startedIn = aFolder('start')
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('MOLE_') && !name.startsWith('SANDBOX_')) env[name] = value
  }
  Object.assign(env, {
    HOME: home,
    MOLE_OFFICE_API: app.api,
    // THE OFFICE THIS CHECKOUT DECLARES is this file's own, on its own port, or the hook files nothing.
    MOLE_OFFICE_PORT: String(app.apiPort),
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: join(app.dir, 'panelx.db'),
    MOLE_HOOK_DETAILS_FOLDER: join(home, 'hook-details'),
    MOLE_OFFICE_AGENT: agent,
    ...(agentsKey === undefined ? {} : { MOLE_AGENT_KEY: agentsKey }),
  })
  const note = theSessionNotePath(conversation)
  if (note === null) throw new Error(`The conversation id ${conversation} can name no note.`)
  notesWritten.push(note)
  const out = await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env, cwd: startedIn }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: conversation, cwd: startedIn, hook_event_name: 'SessionStart' }))
  })
  expect(existsSync(note), `the hook filed no record, so it wrote no note. It said: ${out}`).toBe(true)
  const id = String((JSON.parse(readFileSync(note, 'utf8')) as { id?: unknown }).id ?? '')
  expect(id, 'the note names no record').not.toBe('')
  return id
}

/**
 * File a run as the owner's was filed: with the office's key, under a name that names no agent, carrying its folder,
 * its conversation and a stamp with a resume command and no process. Then each later write, under the names given,
 * with the office's key, as the hook writes after a resume.
 */
async function aRunFiledBeforeItsAgentWasKnown(conversation: string, laterWritesUnder: string[]): Promise<string> {
  const folder = aFolder('worked-in')
  const logPath = join(folder, `${conversation}.jsonl`)
  writeFileSync(logPath, '')
  const filed = await ask('POST', '/api/records', asAgent(UNREGISTERED, officeKey), {
    kind: 'session',
    title: 'Test run · filed before its agent was known',
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing: 'Test run, made up for this file.',
      providerSession: conversation,
      workingDirectory: folder,
      extra: { discovered: { tool: 'claude-code', externalId: conversation, logPath, resumeCommand: `cd '${folder}' && claude --resume ${conversation}` } },
    },
  })
  expect(filed.status, said(filed.body)).toBe(201)
  const id = String((filed.body['record'] as { id?: string }).id)
  for (const [n, name] of laterWritesUnder.entries()) {
    const wrote = await ask('PATCH', `/api/records/${id}`, asAgent(name, officeKey), { dataPatch: { doing: `Test run, written later, write ${String(n + 1)}.` } })
    expect(wrote.status, said(wrote.body)).toBe(200)
  }
  return id
}

/** The way back the profile reads for an agent, asked as the person. */
async function theWayBackFor(handle: string): Promise<{ run: { id: string } | null; way: { way: string; command?: string } }> {
  const read = await ask('GET', `/api/terminals/agents/${handle}/way-back`, person)
  expect(read.status, said(read.body)).toBe(200)
  return read.body as unknown as { run: { id: string } | null; way: { way: string; command?: string } }
}

/** The command that resumes a stored run, as src/config/the-way-back.mjs works it out from the record. */
function theCommandOf(recordId: string): string {
  const way = theWayBackOf({ id: recordId, data: theDataOf(recordId) }) as { way: string; command?: string }
  expect(way.way, 'the fixture has no way back of its own').toBe('host')
  return String(way.command)
}

/** The way-back panel of the agent's profile, open in the browser. */
async function theProfilesWayBack(handle: string): Promise<Locator> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#${whoPath('agent', handle)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  const panel = app.page
    .locator('section.px-panel')
    .filter({ has: app.page.locator('.px-panel-head', { hasText: t('agentLive.back.title') }) })
  await panel.locator('.al-back-state, .al-command').first().waitFor({ state: 'visible', timeout: 30_000 })
  return panel
}

/** The profile's way back: its state line if it draws one, its command, and whether it offers the press. */
async function whatTheProfileDraws(handle: string): Promise<{ state: string | null; command: string | null; press: number }> {
  const panel = await theProfilesWayBack(handle)
  const line = panel.locator('.al-back-state')
  const state = (await line.count()) === 0 ? null : ((await line.textContent()) ?? '').trim()
  const code = panel.locator('.al-command code')
  const command = (await code.count()) === 0 ? null : ((await code.textContent()) ?? '').trim()
  const press = await panel.getByRole('button', { name: t('agentLive.back.press') }).count()
  return { state, command, press }
}

/** The fixture's own check: no write names a serving agent, so the old reading finds none of these runs. */
function namesNoServingAgent(recordId: string): void {
  const data = theDataOf(recordId)
  expect(data['servingAgent'], `${recordId} names a serving agent`).toBeUndefined()
  expect(data['servingAgentId'], `${recordId} names a serving agent`).toBeUndefined()
}

beforeAll(async () => {
  app = await liveApp({ name: 'resume-line', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const keysFile = join(app.dir, 'keys.json')
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader(keysFile) }
  officeKey = (JSON.parse(readFileSync(keysFile, 'utf8')) as { office: string }).office
  keyOfA = await register(A)
  keyOfB = await register(B)
  db = new Database(join(app.dir, 'panelx.db'), { readonly: true, fileMustExist: true })
}, 300_000)

afterAll(async () => {
  db?.close()
  for (const note of notesWritten.splice(0)) rmSync(note, { force: true })
  for (const folder of foldersMade.splice(0)) rmSync(folder, { recursive: true, force: true })
  await app?.stop()
}, 60_000)

describe("an agent's profile draws the resume line of its own run, which names no serving agent", () => {
  let hookRun = ''
  let ownersShape = ''

  it('passes over a run the hook filed under its name alone', async () => {
    hookRun = await theHookFilesARun(A, randomUUID())
    namesNoServingAgent(hookRun)
    expect(theDataOf(hookRun)['heldByItsFiler'], 'the hook said the run is held by its filer').toBeUndefined()
    expect(theWritesOf(hookRun), 'the hook did not file it by the agent’s name alone').toEqual([
      { seq: 1, actorType: 'agent', actorId: A, provedBy: null },
    ])

    expect((await theWayBackFor(A)).run?.id ?? null, 'the run the hook filed by the name alone').not.toBe(hookRun)
  }, 60_000)

  it("of a run filed under another name whose later writes are under its name, shaped like the owner's", async () => {
    ownersShape = await aRunFiledBeforeItsAgentWasKnown(randomUUID(), [A, A])
    namesNoServingAgent(ownersShape)
    expect(theDataOf(ownersShape)['heldByItsFiler']).toBeUndefined()
    expect(theWritesOf(ownersShape)).toEqual([
      { seq: 1, actorType: 'agent', actorId: UNREGISTERED, provedBy: 'the-office-key' },
      { seq: 2, actorType: 'agent', actorId: A, provedBy: 'the-office-key' },
      { seq: 3, actorType: 'agent', actorId: A, provedBy: 'the-office-key' },
    ])

    const command = theCommandOf(ownersShape)
    const way = await theWayBackFor(A)
    expect(way.run?.id ?? null).toBe(ownersShape)
    expect(way.way.command).toBe(command)
    expect(await whatTheProfileDraws(A)).toEqual({ state: null, command, press: 1 })
  }, 180_000)

  it("gives the agent's own key no holding of that run", async () => {
    expect(ownersShape, 'the case before filed no run').not.toBe('')
    const refused = await ask('PATCH', `/api/records/${ownersShape}`, asAgent(A, keyOfA, ownersShape), {
      dataPatch: { doing: 'Test: the agent writes with its own key.' },
    })
    expect(refused.status, said(refused.body)).toBe(403)
    expect(said(refused.body)).toContain(THE_RULE)
  }, 60_000)

  it("counts a run for the agent whose name its newest keyed write is under, and for no other", async () => {
    const second = await aRunFiledBeforeItsAgentWasKnown(randomUUID(), [A, B])
    namesNoServingAgent(second)
    expect(theWritesOf(second).map((one) => one.actorId)).toEqual([UNREGISTERED, A, B])

    const forB = await theWayBackFor(B)
    expect(forB.run?.id ?? null).toBe(second)
    expect(forB.way.command).toBe(theCommandOf(second))
    expect((await theWayBackFor(A)).run?.id ?? null, 'the newer run whose newest write is the other agent’s').toBe(ownersShape)
  }, 60_000)

  it('finds the run the line shows when the person presses to bring it back', async () => {
    expect(ownersShape, 'the second case filed no run').not.toBe('')
    // THE RUN'S FOLDER IS TAKEN AWAY FIRST, so the press is refused after it has found the run and before it opens
    // anything: no program is started by this case.
    const folder = String(theDataOf(ownersShape)['workingDirectory'])
    rmSync(folder, { recursive: true, force: true })
    expect(existsSync(folder)).toBe(false)
    const pressed = await ask('POST', `/api/terminals/agents/${A}/way-back`, person, { session: ownersShape })
    expect(pressed.status, said(pressed.body)).toBe(409)
    expect(pressed.body['code'], said(pressed.body)).toBe('wayBackFolderGone')
    expect(said(pressed.body)).toContain('Nothing was opened.')
  }, 60_000)

  it('refuses a later write under an agent\'s name that no key proves', async () => {
    const unkeyed = await aRunFiledBeforeItsAgentWasKnown(randomUUID(), [A])
    const claimed = await ask('PATCH', `/api/records/${unkeyed}`, asAgent(B, null), { dataPatch: { doing: 'Test run, written later with no key.' } })
    expect(claimed.status, said(claimed.body)).toBe(403)
    expect(said(claimed.body)).toContain(NOT_ITS_RUN)
    namesNoServingAgent(unkeyed)
    expect(theWritesOf(unkeyed)).toEqual([
      { seq: 1, actorType: 'agent', actorId: UNREGISTERED, provedBy: 'the-office-key' },
      { seq: 2, actorType: 'agent', actorId: A, provedBy: 'the-office-key' },
    ])

    expect((await theWayBackFor(A)).run?.id ?? null).toBe(unkeyed)
    expect((await theWayBackFor(B)).run?.id ?? null, 'the run the second agent was refused a write to').not.toBe(unkeyed)
  }, 60_000)

  it("refuses a later write under an agent's name that another agent's key proves", async () => {
    // A SUPERVISOR'S RUN KEY ACTS FOR A RUN ITS HOLDER STARTED (lib/acting-for.ts), so a write under the subagent's name
    // is proved by the supervisor's key. The launcher starts the supervisor, whose run is minted a key; the supervisor
    // registers the subagent with that key and files the subagent's run from its own.
    const launcher = await register(LAUNCHER, person, 'supervisor')
    await register(SUPERVISOR, asAgent(LAUNCHER, launcher), 'supervisor')
    const supervisors = await fileARunServing(SUPERVISOR, asAgent(LAUNCHER, launcher))
    expect(supervisors.runKey, 'the supervisor’s run was minted no key').not.toBeNull()
    await register(SUBAGENT, asAgent(SUPERVISOR, supervisors.runKey!), 'worker')
    const subagents = await fileARunServing(SUBAGENT, asAgent(SUPERVISOR, supervisors.runKey!, supervisors.id), { parentAttachment: supervisors.id })

    const actedFor = await aRunFiledBeforeItsAgentWasKnown(randomUUID(), [A])
    const wrote = await ask('PATCH', `/api/records/${actedFor}`, asAgent(SUBAGENT, supervisors.runKey!, subagents.id), {
      dataPatch: { doing: 'Test run, written later with the supervisor’s key for its subagent.' },
    })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(NOT_ITS_RUN)
    namesNoServingAgent(actedFor)
    expect(theWritesOf(actedFor)).toEqual([
      { seq: 1, actorType: 'agent', actorId: UNREGISTERED, provedBy: 'the-office-key' },
      { seq: 2, actorType: 'agent', actorId: A, provedBy: 'the-office-key' },
    ])

    expect((await theWayBackFor(A)).run?.id ?? null).toBe(actedFor)
    expect((await theWayBackFor(SUBAGENT)).run?.id ?? null, 'the subagent’s line is its own run, not the run another key tried to write to').toBe(subagents.id)
  }, 60_000)

  it("leaves a run on its agent's line when a second agent's own key tries to write to it", async () => {
    const hooks = await theHookFilesARun(A, randomUUID(), keyOfA)
    const wrote = await ask('PATCH', `/api/records/${hooks}`, asAgent(B, keyOfB), { dataPatch: { doing: 'Test run, written later with the second agent’s own key.' } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(NOT_ITS_RUN)
    namesNoServingAgent(hooks)
    expect(theWritesOf(hooks)).toEqual([{ seq: 1, actorType: 'agent', actorId: A, provedBy: 'an-agent-key' }])

    expect((await theWayBackFor(A)).run?.id ?? null).toBe(hooks)
    expect((await theWayBackFor(B)).run?.id ?? null, 'the run the second agent’s own key was refused a write to').not.toBe(hooks)
  }, 60_000)

  it('of a run the hook filed with the agent’s own key', async () => {
    const filed = await theHookFilesARun(A, randomUUID(), keyOfA)
    namesNoServingAgent(filed)
    expect(theDataOf(filed)['heldByItsFiler'], 'the hook said the run is held by its filer, so it filed with the office’s key').toBeUndefined()
    expect(theWritesOf(filed), 'the filing is not the only write, so the case would not be about the filing').toEqual([
      { seq: 1, actorType: 'agent', actorId: A, provedBy: 'an-agent-key' },
    ])
    expect(theKeyHolderOf(filed, 1)).toBeNull()

    const command = theCommandOf(filed)
    const back = await theWayBackFor(A)
    expect(back.run?.id ?? null).toBe(filed)
    expect(back.way.command).toBe(command)
    expect(await whatTheProfileDraws(A)).toEqual({ state: null, command, press: 1 })
  }, 180_000)

  it("passes over a filing under an agent's name that no key proves", async () => {
    const filed = await ask('POST', '/api/records', asAgent(A, null), {
      kind: 'session',
      title: 'Test run · filed under the agent’s name with no key',
      data: { state: 'running', runtime: 'claude-code', doing: 'Test run, made up for this file.' },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    const unkeyed = String((filed.body['record'] as { id?: string }).id)
    namesNoServingAgent(unkeyed)
    expect(theWritesOf(unkeyed)).toEqual([{ seq: 1, actorType: 'agent', actorId: A, provedBy: null }])

    expect((await theWayBackFor(A)).run?.id ?? null, 'the run filed under its name with no key').not.toBe(unkeyed)
  }, 60_000)
})
