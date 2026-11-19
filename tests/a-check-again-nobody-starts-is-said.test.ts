// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A CHECK AGAIN THAT NOBODY STARTS IS SAID: TO WHOEVER QUEUED THE ENTRY, WITH COMMANDS THAT WORK, AND ON
 * THE QUEUE. Problem jaEGPrS3cVxe.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Twice on 25 September 2026 the merge lane waited over an hour on a scoped check again that the queue
 * had asked for (`askForACheckAgain` in src/server/lib/merge-state-machine.ts). The message worker was
 * off, so nothing started the check tool. The notice went to the inspector and the run's agent, and
 * nobody who could start the check was told. The queue said nothing about it either.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AGAINST THE REAL SERVER ON A PORT OF ITS OWN (never a live office's port)
 * ---------------------------------------------------------------------------------------
 *
 *   1. The notice reaches the agent that submitted the entry, and only it, with the commands to run the
 *      check by hand. The commands are taken out of the message and run through bash, word for word,
 *      after the person has closed the key window, with the submitter's own key in MOLE_AGENT_KEY. They
 *      file the check's session, the check tool releases the path, the entry moves on to testing, and
 *      the confirm command closes the run. One option is added to the tool's line, `--on-the-host`,
 *      because a test has no inspector sandbox. The model is a stand-in `claude` on PATH, a shell script
 *      this file writes, labelled as one in its own first line. No model runs.
 *   2. GET /api/merge-queue and GET /api/merge-queue/<id> say that the entry waits on a check nobody is
 *      recorded as having started, and since when. Once the printed tool line (with `--dry` added, so it
 *      assembles the check and runs no model) has recorded what the check reads, they stop saying it. The
 *      entry let its lane go for its first check again, so they say the entry waits, and not that the lane
 *      does (wave 13u, item 53).
 *   3. When the person submitted the entry, their notice carries the words and no command, and whoever
 *      holds the secretary card is sent the commands under its own name.
 *
 * The git trees are made under `.logs/` in this checkout, the keys are made up and written into this
 * test's own key file, and everything this file made is removed after it. The check tool is a child
 * process that ends before its case does: each run is awaited to its exit.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, one line each, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * (a) In `tellTheSubmitterOfTheCheckAgain`, `if (agent.retired) return ...` becomes `if (true) return ...`,
 *     so an agent that submitted is never told. The first case goes red, and so does the queue's case,
 *     which takes its tool line from the same notice. The person's case stays green.
 * (b) In `noCheckIsRecordedAsStarted`, the line that returns null once a check is recorded as started is
 *     removed, so the queue always says it. The queue's case goes red.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theInspectorsRowNames } from './inspector-tool-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asInspector = as('agent', 'inspector-one')
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asTheOffice = as('agent', THE_WORKER)

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const A = 'work/a.txt'
const B = 'work/b.txt'
const RULES = 'design/rules.md'

let t: TestDb
let app: FastifyInstance
let api = ''
let mainCheckout = ''
let worktrees = ''
let bin = ''
let home = ''
const keys = new Map<string, string>()
const made: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = realpathSync(mkdtempSync(join(process.cwd(), '.logs', `check-again-${prefix}-`)))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A synthetic tree: main holds three files; `work` changes all three. The shape a worker's worktree has. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic check-again fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  mkdirSync(join(dir, 'design'), { recursive: true })
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n${path} submitted.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  return dir
}

function theSealOf(run: string): { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] } {
  const id = t.api.getRecord(run)!.data['sealedTip'] as string
  const seal = t.api.getRecord(id)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string; hash: string | null }[] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files }
}

/** A release of the worker's own run through the real doors, in process: the assembly first, then the verdict. */
async function release(run: string): Promise<void> {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const read = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const released = await call('POST', `/api/checks/${run}`, asInspector, { chaptersRead: [], read, traced: syntheticTrace(t, seal.files.map((one) => one.path)), verdict: 'released', check: 'Synthetic: read the changes and found nothing missing.' })
  expect(released.status, released.raw).toBe(201)
}

async function step(id: string, name: string, facts: Record<string, unknown>) {
  const r = await call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  expect(r.status, r.raw).toBe(200)
  return r.body['entry'] as Record<string, any>
}

/**
 * AN ENTRY IN REINSPECTING, submitted by `by`: the worker's sealed run is released, pinned, integrated
 * on a clone where main moved and the rebase changed A. The office asks for a scoped check of A.
 */
async function anEntryInReinspecting(by: Record<string, string>, branch: string): Promise<{ id: string; run: string; again: string; askedAt: string; clone: string }> {
  const dir = tree()
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic check-again run',
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'worker-w' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir },
  }).id
  const patched = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(patched.statusCode, patched.body).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', by, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(submitted.status, submitted.raw).toBe(201)
  const id = String(submitted.body['entry'].id)
  await release(run)
  const seal = theSealOf(run)
  expect((await step(id, 'pinned', { files: Object.fromEntries(seal.files.map((one) => [one.path, one.hash])) })).state).toBe('judged')
  await step(id, 'integrating', {})
  // THE CLONE THE MERGE TOOL MAKES: `work` put on top of a moved main, and A changed by that.
  const clone = scratch('clone')
  execFileSync('git', ['clone', '-q', dir, clone])
  git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'config', 'user.name', 'Synthetic merge clone')
  git(clone, 'checkout', '-q', 'main')
  writeFileSync(join(clone, 'work', 'other.txt'), 'main moved on.\n')
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '-m', 'Synthetic: main moved')
  git(clone, 'checkout', '-q', 'work')
  git(clone, 'rebase', '-q', 'main')
  writeFileSync(join(clone, A), `${A} before.\n${A} submitted.\n${A} merged with main.\n`)
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '--amend', '--no-edit')
  const files = Object.fromEntries(
    [A, B, RULES].map((path) => [path, createHash('sha256').update(execFileSync('git', ['-C', clone, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')]),
  )
  const integrated = await step(id, 'integrated', { result: git(clone, 'rev-parse', 'HEAD'), mainAt: git(clone, 'rev-parse', 'main'), clone, files })
  expect(integrated.state).toBe('reinspecting')
  const asked = integrated.machine.reinspection as { run: string; only: string[]; askedAt: string }
  expect(asked.only).toEqual([A])
  return { id, run, again: asked.run, askedAt: asked.askedAt, clone }
}

interface Message { id: string; title: string; to: { kind: string; id: string }[]; body: string }
function messagesAbout(run: string): Message[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { id: string; title: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to?: Message['to']; body: string }
    return { id: row.id, title: row.title, to: data.to ?? [], body: data.body }
  })
}

/** The notice of a check again is found by its title, which says the same whether the entry holds its lane or let it go. */
const isTheNoticeOf = (id: string) => (m: Message) => m.title.startsWith(`Merge entry ${id} waits on a check again of `)

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

/** The paragraph of a message that begins with these words: a command block, as the notice prints it. */
function theParagraph(body: string, beginning: string): string {
  const found = body.split('\n\n').filter((one) => one.startsWith(beginning))
  expect(found, `the notice has no paragraph beginning "${beginning}":\n${body}`).toHaveLength(1)
  return found[0]!
}

/**
 * RUN A PRINTED COMMAND BLOCK THROUGH BASH, awaited to its exit. The environment is this process's without
 * the office's database, so the only database the check tool is given is the one the command names.
 */
function bash(script: string, more: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !key.startsWith('MOLE_OFFICE_') && key !== 'MOLE_AGENT_KEY') env[key] = value
  return new Promise((done) => {
    const child = spawn('bash', ['-euo', 'pipefail', '-c', script], {
      env: { ...env, HOME: home, PATH: `${bin}:${env['PATH'] ?? ''}`, MOLE_OFFICE_CHECK_WORKTREES: worktrees, ...more },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { err += String(d) })
    child.on('close', (code) => { done({ code, out, err }) })
  })
}

/** Put a `claude` on PATH that prints a release, as Claude Code's envelope carries one, and runs no model. */
function aStandInClaudeThatReleases(): void {
  const verdict = { verdict: 'released', traced: syntheticTrace(t, [A]), check: 'A check this test made up. No model ran.', chaptersRead: [] }
  const envelope = { type: 'result', subtype: 'success', is_error: false, session_id: '44444444-4444-4444-4444-444444444444', result: JSON.stringify(verdict), usage: { input_tokens: 1, output_tokens: 1 } }
  writeFileSync(join(bin, 'envelope.json'), JSON.stringify(envelope))
  const script = join(bin, 'claude')
  writeFileSync(script, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\ncat >/dev/null; cat "${bin}/envelope.json"\n`)
  chmodSync(script, 0o755)
}

async function register(by: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
  expect(r.statusCode, r.body).toBe(201)
  const key = (r.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''
  if (key !== '') keys.set(String(payload['handle']), key)
}

/** FREE THE LANE AFTER EACH CASE, so a case that failed half way does not hold the lane against the next one. */
async function freeTheLane(): Promise<void> {
  const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(mainCheckout)}`, asPerson)
  const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string } | null | undefined
  if (holder === null || holder === undefined) return
  const r = await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'the case is over; the lane is freed for the next one' })
  expect(r.status, r.raw).toBe(200)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  giveFixtureSeats(app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  // WHAT src/server/index.ts DOES THE MOMENT IT LISTENS, so the notice can name the address this server answers on.
  const { rememberWhatThisProcessBound, theAddressThisProcessAnswersOn, addressText } = await import('../src/server/lib/bound-address.ts')
  rememberWhatThisProcessBound(app.server)
  api = addressText(theAddressThisProcessAnswersOn()!)
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))

  // EVERY AGENT IS REGISTERED THROUGH A PROVED PATH, because the close below refuses while a live agent
  // holds no proved key: the person's key for the three they start, and the
  // supervisor's own key, itself proved, for the worker it starts.
  const withTheirKey = { ...asPerson, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
  await register(withTheirKey, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(withTheirKey, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names a made-up model with native data, so the printed
  // tool line, which names no model, starts the check from the row's selection and not from the compatibility list.
  await theInspectorsRowNames(app, 'a-made-up-check-model', withTheirKey)
  await register(withTheirKey, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register({ ...asSupervisor, 'x-mole-office-key': keys.get('super-r') ?? '' }, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work', 'design'] })
  const repositories = await import('../src/server/lib/repositories.ts')
  mainCheckout = scratch('main')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: mainCheckout, actor: { type: 'human', id: THE_PERSON } })

  worktrees = mkdtempSync(join(tmpdir(), 'mole-office-check-again-worktrees-'))
  bin = mkdtempSync(join(tmpdir(), 'mole-office-check-again-stand-in-claude-'))
  home = mkdtempSync(join(tmpdir(), 'mole-office-check-again-home-'))
  made.push(worktrees, bin, home)
  aStandInClaudeThatReleases()

  // THE KEY WINDOW IS CLOSED, so a keyless claim to be an agent counts for nothing, and the printed commands work
  // only if they carry the agent's own key. Every call this file makes in process is the office's own and untouched.
  const closed = await fetch(`${api}/api/office/key-window/close`, {
    method: 'POST',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
  })
  expect(closed.status, await closed.text()).toBe(200)
}, 60_000)

afterEach(async () => {
  await freeTheLane()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the submitter is told of a check again, with commands that work', () => {
  it('sends the agent that submitted the entry, and nobody else, the commands, and they run the check and confirm it', async () => {
    const one = await anEntryInReinspecting(asSupervisor, 'told-with-commands')
    const told = messagesAbout(one.again).filter(isTheNoticeOf(one.id))
    expect(told, 'no notice of the check again reached anybody').toHaveLength(1)
    const notice = told[0]!
    expect(notice.to).toEqual([{ kind: 'agent', id: idOf('super-r') }])
    expect(notice.body).toContain(`changed 1 path that no verdict has read: ${A}.`)
    expect((await call('GET', `/api/merge-queue/${one.id}`, asPerson)).body['entry'].machine.reinspection.says).toContain(`The submitter super-r was told, in message ${notice.id}.`)

    // THE COMMANDS, WORD FOR WORD, with `--on-the-host` added to the tool's line because a test has no sandbox.
    const commands = theParagraph(notice.body, 'cd ')
    const toolLine = commands.split('\n').find((line) => line.includes('node tools/the-inspector.mjs'))
    expect(toolLine).toContain(`--run ${one.again} --as inspector-one --check "$CHECK_SESSION" --api ${api} --workspace ${WORKSPACE} --checkout ${one.clone} --only ${A}`)
    const ran = await bash(commands.replace('node tools/the-inspector.mjs', 'node tools/the-inspector.mjs --on-the-host'), { MOLE_AGENT_KEY: keys.get('super-r')! })
    expect(ran.code, `${ran.out}\n${ran.err}`).toBe(0)
    expect(ran.out).toContain('The check answered: released.')

    // THE SESSION THE FIRST COMMAND FILED is the check's own, under the submitter's name, serving the inspector.
    const sessions = t.client.sqlite
      .prepare("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.inspectionRun') = ?")
      .all(one.again) as { id: string }[]
    expect(sessions).toHaveLength(1)
    const filed = t.api.getRecord(sessions[0]!.id)!
    expect(filed.data['servingAgent']).toBe('inspector-one')
    expect(filed.data['state']).toBe('finished')
    expect(t.client.sqlite.prepare("SELECT actor_id FROM changes WHERE record_id = ? AND op = 'create'").pluck().get(filed.id)).toBe('super-r')

    const moved = (await call('GET', `/api/merge-queue/${one.id}`, asPerson)).body['entry']
    expect(moved.state).toBe('testing')
    expect(moved.machine.reinspected).toEqual([{ run: one.again, only: [A], needsJudgment: [], releasedAt: expect.any(String) }])

    // THE CONFIRM is the starter's, and the starter of worker-w is the submitter, so the notice gives it to super-r.
    expect(notice.body).toContain('stays open until you confirm it, because the release reports to you.')
    const confirm = theParagraph(notice.body, 'node -e ')
    const confirmed = await bash(confirm, { MOLE_AGENT_KEY: keys.get('super-r')!, BECAUSE: 'The scoped check released the one path the rebase changed.' })
    expect(confirmed.code, `${confirmed.out}\n${confirmed.err}`).toBe(0)
    expect(t.api.getRecord(one.again)!.data['confirmed']).toMatchObject({ because: 'The scoped check released the one path the rebase changed.' })
  }, 120_000)

  it('tells the person without a command, and gives the commands to whoever holds the secretary card', async () => {
    const one = await anEntryInReinspecting(asPerson, 'told-to-the-person')
    const told = messagesAbout(one.again).filter(isTheNoticeOf(one.id))
    const toThem = told.filter((m) => m.to.some((who) => who.kind === 'person'))
    const toArgus = told.filter((m) => m.to.some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))
    expect(toThem).toHaveLength(1)
    expect(toArgus).toHaveLength(1)
    expect(toThem[0]!.to).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(toThem[0]!.body).not.toContain('the-inspector.mjs')
    expect(toThem[0]!.body).not.toContain('curl')
    expect(toThem[0]!.body).toContain(`${THE_TEST_OFFICES_SECRETARY.handle}, who holds the secretary card, was sent this notice with the commands, in message ${toArgus[0]!.id}.`)
    expect(toArgus[0]!.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(theParagraph(toArgus[0]!.body, 'cd ')).toContain(`'x-mole-office-actor-id: ${THE_TEST_OFFICES_SECRETARY.handle}'`)
  }, 60_000)
})

describe('the queue says the entry waits on a check nobody is recorded as having started', () => {
  it('says it, with the time the check was asked for, until the check tool records what it reads', async () => {
    const one = await anEntryInReinspecting(asSupervisor, 'said-on-the-queue')
    const said = `merge entry ${one.id} waits on a check nobody is recorded as having started. The office asked for the check of run ${one.again} at ${one.askedAt}`
    const alone = (await call('GET', `/api/merge-queue/${one.id}`, asPerson)).body['entry']
    expect(alone.occupies).toBeNull()
    expect(alone.waitsOn).not.toContain('the lane waits')
    expect(alone.checkNotRecordedAsStarted).toEqual({ run: one.again, askedAt: one.askedAt, says: expect.stringContaining(said) })
    expect(alone.waitsOn).toContain(said)
    const listed = (await call('GET', `/api/merge-queue?lane=${encodeURIComponent(mainCheckout)}`, asPerson)).body['lanes'][0].entries.find((e: { id: string }) => e.id === one.id)
    expect(listed.checkNotRecordedAsStarted).toEqual(alone.checkNotRecordedAsStarted)
    expect(listed.waitsOn).toBe(alone.waitsOn)

    // THE PRINTED TOOL LINE WITH --dry: it assembles the check, records what it reads, and runs no model.
    const notice = messagesAbout(one.again).find(isTheNoticeOf(one.id))!
    const commands = theParagraph(notice.body, 'cd ')
    const toolLine = commands.split('\n').find((line) => line.includes('node tools/the-inspector.mjs'))!
    expect(toolLine).toContain(`--only ${A}`)
    const ran = await bash(commands.replace('node tools/the-inspector.mjs', 'node tools/the-inspector.mjs --dry'), { MOLE_AGENT_KEY: keys.get('super-r')! })
    expect(ran.code, `${ran.out}\n${ran.err}`).toBe(0)

    const after = (await call('GET', `/api/merge-queue/${one.id}`, asPerson)).body['entry']
    expect(after.state).toBe('reinspecting')
    expect(after.checkNotRecordedAsStarted).toBeUndefined()
    expect(after.waitsOn).not.toContain('nobody is recorded as having started')
    expect(after.waitsOn).toContain(`on run ${one.again}`)
    const listedAfter = (await call('GET', `/api/merge-queue?lane=${encodeURIComponent(mainCheckout)}`, asPerson)).body['lanes'][0].entries.find((e: { id: string }) => e.id === one.id)
    expect(listedAfter.checkNotRecordedAsStarted).toBeUndefined()
  }, 60_000)
})
