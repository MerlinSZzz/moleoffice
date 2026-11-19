// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A SENSITIVE PATH LANDS ONLY AFTER A PRESS (wave 13v round 34, the decision's fourth part).
 *
 * The decision: an entry touching a database migration (drizzle/), tools/the-merger.mjs, tools/sandbox*.mjs,
 * .mole-office/protected.json or design/rules waits for a secretary's one press to land, and every other entry lands by
 * itself. The decision gives no reason in words. The office's reason: these paths change how every later entry is
 * tested and landed, what keeps the sandbox apart, or the database schema that the next stable upgrade applies to the
 * person's live database, so someone looks before they land.
 *
 * WHAT IS PROVED HERE, against a real database and the real server, with the verdicts posted through the real check door:
 *
 *   1. THE LIST. One function in src/shared/merge-queue.ts says which paths wait for a press, and why.
 *   2. THE WAIT. A git entry touching such paths asks the secretary once at the pin, naming each path and the door. The
 *      pin's sentence, which the merge tool writes into its log, says so, and so does `waitsOn`. Once judged, the merge
 *      tool is told it waits for a press and is not given it as work. A green test run says the hold, and the landing
 *      step is refused.
 *   3. THE PRESS. A stranger, the worker and a press with no reason are refused. The secretary's press is kept with who,
 *      when and why. A second press is refused, naming the first. The landing step's sentence names who pressed and when.
 *   4. EVERY OTHER ENTRY LANDS BY ITSELF. An entry touching none of the paths, design/rules.md among them, asks nobody
 *      and has nothing to press. The person may press, before the pin, and the pin then asks nobody.
 *   5. THE PAGE. The merge queue page says the wait on the row that owes a press and names who pressed and when, and it
 *      draws the person's press only on the row that owes one.
 *   6. ONLY WHAT THE ENTRY CHANGES OVER MAIN (wave 13u round 96). The merge tool reports main's content at the pin, and a
 *      path main already has with the same content needs no press: an entry on an older base is not held for it, and the
 *      pin and the notice say which paths were left out. A path the entry does change is held as before. A pin without
 *      main's content counts every path the seal names and says why, and a report of main for other paths is refused.
 *      Once integrated, what the integration changes over main is what needs the press.
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed
 * after, the records are filed as fixtures, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ABSENT, whyItLandsAfterAPress } from '../src/shared/merge-queue.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { englishWords } from '../src/shared/words/joined.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []
const en = englishWords()

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
const LIVE = 'submitted,pinned,judged,integrating,reinspecting,testing,landing,resolving'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSecretary = as('agent', THE_TEST_OFFICES_SECRETARY.handle)
const asInspector = as('agent', 'inspector-one')
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asStranger = as('agent', 'a-stranger')
const asTheOffice = as('agent', THE_WORKER)

const A = 'work/a.txt'
const RULES = 'design/rules.md'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `press-to-land-${prefix}-`))
  made.push(dir)
  return dir
}

/**
 * A synthetic tree: main holds work/a.txt and design/rules.md; the branch `work` changes both and adds each of `paths`.
 * The shape a worker's worktree has. Each tree's own line keeps two trees two works.
 *
 * Each of `onMainToo` is then committed on main with the content the branch gives it, after the branch was cut: the shape
 * of an entry on an older base, whose seal still names a path main already has.
 */
function aTreeTouching(paths: string[], onMainToo: string[] = []): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic press-to-land fixture')
  for (const path of [A, RULES]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), `${path} before.\n`)
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  for (const path of [A, RULES, ...paths]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), `${path} submitted from ${dir}.\n`)
  }
  const migrations = paths.filter((path) => /^drizzle\/\d{4}_[^/]+\.sql$/u.test(path))
  if (migrations.length > 0) {
    mkdirSync(join(dir, 'drizzle', 'meta'), { recursive: true })
    writeFileSync(join(dir, 'drizzle', 'meta', '_journal.json'), JSON.stringify({
      version: '7', dialect: 'sqlite',
      entries: migrations.map((path, index) => {
        const tag = path.slice('drizzle/'.length, -'.sql'.length)
        return { idx: Number(tag.slice(0, 4)), version: '6', when: 200 + index, tag, breakpoints: true }
      }),
    }, null, 2) + '\n')
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  if (onMainToo.length > 0) {
    git(dir, 'switch', '-q', 'main')
    for (const path of onMainToo) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), `${path} submitted from ${dir}.\n`)
    }
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic: the same change, landed on main by another entry')
    git(dir, 'switch', '-q', 'work')
  }
  return dir
}

interface Seal { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

function theSealOf(run: string): Seal {
  const id = t.api.getRecord(run)!.data['sealedTip'] as string
  const seal = t.api.getRecord(id)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: Seal['files'] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files }
}

/** The sealed content as the state machine spells it: every changed path at its blob hash. */
function contentOf(seal: Seal): Record<string, string> {
  return Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
}

let mainCheckout = ''

/** A submitted git entry of a fresh sealed run of the worker, by the supervisor, from a tree that adds `paths`. */
async function anEntryTouching(paths: string[], branch = 'work', onMainToo: string[] = []): Promise<{ id: string; run: string; seal: Seal; dir: string }> {
  const dir = aTreeTouching(paths, onMainToo)
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic press-to-land run',
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'worker-w' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'worker-w' })
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  const r = await call('POST', '/api/merge-queue', asSupervisor, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(r.status, r.raw).toBe(201)
  return { id: String(r.body['entry'].id), run, seal: theSealOf(run), dir }
}

async function step(id: string, step: string, facts: Record<string, unknown>) {
  return call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step, facts })
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asStranger)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry']
}

/** An inspector's release of a run, through the real doors: the assembly first, then the verdict. */
async function release(run: string) {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const read = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const released = await call('POST', `/api/checks/${run}`, asInspector, {
    chaptersRead: [],
    read,
    traced: syntheticTrace(t, seal.files.map((one) => one.path)),
    verdict: 'released',
    check: 'Synthetic: read the changes and found nothing missing.',
  })
  expect(released.status, released.raw).toBe(201)
}

interface Message { id: string; title: string; to: { kind: string; id: string }[]; body: string }
function toTheSecretary(run: string): Message[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { id: string; title: string; data: string }[]
  return rows
    .map((row) => {
      const data = JSON.parse(row.data) as { to?: Message['to']; body: string }
      return { id: row.id, title: row.title, to: data.to ?? [], body: data.body }
    })
    .filter((one) => one.to.some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))
}

/** Take a judged entry through integrating and a clean integrate, to testing. */
async function toTesting(id: string, seal: Seal): Promise<void> {
  const taking = await step(id, 'integrating', {})
  expect(taking.status, taking.raw).toBe(200)
  const integrated = await step(id, 'integrated', { result: seal.commit, mainAt: seal.forkBase, files: contentOf(seal) })
  expect(integrated.status, integrated.raw).toBe(200)
  expect(integrated.body['entry'].state).toBe('testing')
}

/** The ids of the entries the merge tool would be handed now. */
async function theToolsWork(): Promise<string[]> {
  const queue = await import('../src/server/lib/merge-queue.ts')
  return queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)
}

/** Withdraw an entry a case left waiting, so it is not in the next case's way. */
async function withdraw(id: string): Promise<void> {
  const r = await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'the case is over' })
  expect(r.status, r.raw).toBe(200)
}

/** Free both lanes of the repository after each case, so a case that failed half way does not hold the next. */
async function freeTheLane(): Promise<void> {
  for (const lane of [mainCheckout, `${mainCheckout} documents`]) {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(lane)}`, asStranger)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) continue
    if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'the case is over; the lane is freed for the next one' })
  }
}

/** The registry id of the agent registered under this handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work', 'design', 'drizzle', 'tools'] })
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  const repositories = await import('../src/server/lib/repositories.ts')
  mainCheckout = realpathSync(scratch('main'))
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: mainCheckout, actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterEach(async () => {
  await freeTheLane()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

// ============================================================================ 1. the list

describe('which paths land only after a press', () => {
  it('is the five patterns of the decision, each with its reason, and nothing beside them', () => {
    for (const path of ['drizzle/0264_synthetic.sql', 'drizzle/meta/_journal.json', 'tools/the-merger.mjs', 'tools/sandbox.mjs', 'tools/sandbox-start.mjs', '.mole-office/protected.json', 'design/rules/CODE.md']) {
      const why = whyItLandsAfterAPress(path)
      expect(why, path).not.toBeNull()
      expect(why!.why.length, path).toBeGreaterThan(0)
    }
    for (const path of ['tools/sandbox/inner.mjs', 'tools/the-merger.mjs.bak', 'tools/merge-tool/integrate.mjs', 'design/rules.md', 'src/drizzle/x.ts', '.mole-office/other.json', 'work/drizzle/x.sql']) {
      expect(whyItLandsAfterAPress(path), path).toBeNull()
    }
  })
})

// ============================================================================ 2 and 3. the wait and the press

describe('an entry touching a sensitive path waits for one press to land', () => {
  it('asks the secretary at the pin, is not handed to the merge tool, cannot land, and lands after the secretary presses', async () => {
    const SENSITIVE = ['drizzle/0264_synthetic.sql', 'drizzle/meta/_journal.json', 'tools/sandbox-synthetic.mjs']
    const one = await anEntryTouching(SENSITIVE)

    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    // THE PIN'S SENTENCE IS WHAT THE MERGE TOOL WRITES INTO ITS LOG ("the office decided: ...").
    expect(pinned.body['decided']).toContain('the secretary was asked to press')
    expect(pinned.body['entry'].waitsOn).toContain(`POST /api/merge-queue/${one.id}/press-to-land`)
    expect(pinned.body['entry'].pressToLand).toEqual({ paths: SENSITIVE, pressed: null })
    const asked = toTheSecretary(one.run).filter((m) => m.id === pinned.body['entry'].machine.pressToLand.asked)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.title).toBe(`Press to land merge entry ${one.id}: it touches 3 sensitive paths`)
    expect(asked[0]!.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    for (const path of SENSITIVE) expect(asked[0]!.body).toContain(`- ${path}: `)
    expect(asked[0]!.body).toContain(`POST /api/merge-queue/${one.id}/press-to-land with {"because":"<one sentence>"}`)

    await release(one.run)
    const judged = await entry(one.id)
    expect(judged.state).toBe('judged')
    expect(judged.toolWaits).toMatchObject({ because: 'waits-for-a-press', paths: SENSITIVE })
    expect(await theToolsWork()).not.toContain(one.id)
    // THE PIN ASKED ONCE, and the release asked nobody again.
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('Press to land'))).toHaveLength(1)

    await toTesting(one.id, one.seal)
    const green = await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })
    expect(green.status, green.raw).toBe(200)
    expect(green.body['decided']).toContain('nobody has pressed')
    const held = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(held.status, held.raw).toBe(409)
    expect(held.body['error']).toContain('nobody has pressed')
    expect((await entry(one.id)).state).toBe('testing')

    const stranger = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asStranger, { because: 'not mine' })
    expect(stranger.status, stranger.raw).toBe(403)
    const worker = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asWorker, { because: 'my own migration' })
    expect(worker.status, worker.raw).toBe(403)
    const noReason = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asSecretary, {})
    expect(noReason.status, noReason.raw).toBe(400)
    expect((await entry(one.id)).pressToLand).toEqual({ paths: SENSITIVE, pressed: null })

    const BECAUSE = 'The migration is additive and the sandbox change was read.'
    const pressed = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asSecretary, { because: BECAUSE })
    expect(pressed.status, pressed.raw).toBe(200)
    const press = pressed.body['entry'].pressToLand.pressed
    expect(press).toMatchObject({ by: { kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }, because: BECAUSE })
    expect(press.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u)
    expect(pressed.body['entry'].machine.pressToLand.pressed).toEqual(press)
    expect(pressed.body['says']).toContain(`agent ${idOf(THE_TEST_OFFICES_SECRETARY.handle)} pressed`)
    const twice = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asPerson, { because: 'again' })
    expect(twice.status, twice.raw).toBe(409)
    expect(twice.body['error']).toContain(`already pressed by agent ${idOf(THE_TEST_OFFICES_SECRETARY.handle)} at ${String(press.at)}`)

    const landing = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(landing.status, landing.raw).toBe(200)
    expect(landing.body['entry'].state).toBe('landing')
    expect(landing.body['decided']).toContain(`after the press of agent ${idOf(THE_TEST_OFFICES_SECRETARY.handle)} at ${String(press.at)}`)
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    expect(landed.body['entry'].machine.pressToLand.pressed).toEqual(press)
  })
})

// ============================================================================ 4. every other entry lands by itself

describe('every other entry lands by itself', () => {
  it('asks nobody about an entry touching none of the paths, design/rules.md among them, and has nothing to press', async () => {
    const one = await anEntryTouching([])
    expect(one.seal.files.map((file) => file.path)).toContain(RULES)
    await release(one.run)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')
    expect(pinned.body['decided']).not.toContain('press')
    expect(pinned.body['entry'].pressToLand).toBeUndefined()
    expect(pinned.body['entry'].machine.pressToLand).toBeUndefined()
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('Press to land'))).toEqual([])
    const judged = await entry(one.id)
    expect(judged.toolWaits).toBeUndefined()
    expect(await theToolsWork()).toContain(one.id)
    const r = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asPerson, { because: 'nothing' })
    expect(r.status, r.raw).toBe(409)
    expect(r.body['error']).toContain('touches no path that waits for a press')
    await withdraw(one.id)
  })

  it('takes the person’s press before the pin, and the pin then asks nobody', async () => {
    const one = await anEntryTouching(['design/rules/SYNTHETIC.md'])
    expect((await entry(one.id)).pressToLand).toEqual({ paths: ['design/rules/SYNTHETIC.md'], pressed: null })
    const pressed = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asPerson, { because: 'I read the rule change.' })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(pressed.body['entry'].pressToLand.pressed).toMatchObject({ by: { kind: 'person' }, because: 'I read the rule change.' })
    await release(one.run)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')
    expect(pinned.body['decided']).toContain('pressed already')
    expect(pinned.body['entry'].machine.pressToLand.asked).toBeNull()
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('Press to land'))).toEqual([])
    expect((await entry(one.id)).toolWaits).toBeUndefined()
    expect(await theToolsWork()).toContain(one.id)
    await withdraw(one.id)
  })
})

// ============================================================================ 5. the page

/** The page module, loaded under a window whose stored actor is the person, in English. */
async function thePage(): Promise<typeof import('../src/web/pages/MergeQueuePage.tsx')> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage('en')
  return import('../src/web/pages/MergeQueuePage.tsx')
}

/** The page's text as a reader reads it, tags left out and entities read back. */
function theWords(html: string): string {
  return html
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&#x27;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, ' ')
}

/** Each row's html, by entry id. */
function theRows(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/<li class="mq-row" data-entry="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gu)].map((m) => [m[1]!, m[2]!]))
}

describe('the merge queue page', () => {
  it('says the wait on the row that owes a press, names who pressed and when, and offers the person the press only there', async () => {
    const owes = await anEntryTouching(['drizzle/0264_page.sql'], 'owes')
    expect((await step(owes.id, 'pinned', { files: contentOf(owes.seal) })).body['entry'].state).toBe('pinned')
    const done = await anEntryTouching(['tools/the-merger.mjs'], 'done')
    await release(done.run)
    expect((await step(done.id, 'pinned', { files: contentOf(done.seal) })).body['entry'].state).toBe('judged')
    const pressed = await call('POST', `/api/merge-queue/${done.id}/press-to-land`, asSecretary, { because: 'the merger change was read' })
    expect(pressed.status, pressed.raw).toBe(200)
    const at = String(pressed.body['entry'].pressToLand.pressed.at)
    const plain = await anEntryTouching([], 'plain')
    await release(plain.run)
    expect((await step(plain.id, 'pinned', { files: contentOf(plain.seal) })).body['entry'].state).toBe('judged')

    const got = await call('GET', `/api/merge-queue?state=${LIVE}`, asPerson)
    expect(got.status, got.raw).toBe(200)
    const reply = got.body as unknown as MergeQueueReply
    expect(reply.page.pressers[done.id]).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(reply.page.pressers[owes.id]).toBeUndefined()

    try {
      const page = await thePage()
      const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply, now: new Date(at.replace(' ', 'T')) }))
      const rows = theRows(html)
      expect(theWords(rows[owes.id]!)).toContain('It touches 2 paths that land only after a press: drizzle/0264_page.sql, drizzle/meta/_journal.json. It waits until a secretary or the person presses.')
      expect(theWords(rows[done.id]!)).toContain(`Pressed to land by ${THE_TEST_OFFICES_SECRETARY.handle} at ${at.slice(11, 16)}, because the merger change was read`)
      expect(theWords(rows[done.id]!)).not.toContain('It waits until a secretary or the person presses.')
      // THE PLAIN ROW SAYS NO PRESS. Its name is the fixture run's title, which holds the word "press-to-land", so the
      // row is read for the two press sentences and not for the word.
      expect(theWords(rows[plain.id]!)).not.toMatch(/only after a press|Pressed to land by/u)
      const offered = Object.entries(rows).filter(([, row]) => row.includes(en['mergeQueuePage.landPress.open']!)).map(([id]) => id)
      expect(offered).toEqual([owes.id])
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window
    }
    for (const id of [owes.id, done.id, plain.id]) await withdraw(id)
  })
})

// ============================================================================ 6. only what the entry changes over main

const MERGER = 'tools/the-merger.mjs'
const SANDBOX = 'tools/sandbox-synthetic.mjs'

/**
 * Main's content at each path, as the merge tool reports it at the pin: the commit main is at, and each path's sha256
 * there, or "absent".
 */
function theContentOnMain(dir: string, paths: string[]): { at: string; files: Record<string, string> } {
  const at = git(dir, 'rev-parse', 'main')
  const files = Object.fromEntries(
    paths.map((path) => [
      path,
      git(dir, 'ls-tree', '--name-only', at, '--', path) === path
        ? createHash('sha256').update(execFileSync('git', ['-C', dir, 'cat-file', 'blob', `${at}:${path}`])).digest('hex')
        : ABSENT,
    ]),
  )
  return { at, files }
}

/** The pin's sentence for the paths main already has. */
const leftOutBy = (mainAt: string, paths: string[]): string => `Left out, because main at ${mainAt} already has the same content: ${paths.join(', ')}.`
const NOT_COMPARED = "Main's content was not reported at the pin, so every path the seal names that lands only after a press is counted."

describe('the press counts only what an entry changes over main', () => {
  it('does not hold an entry on an older base for a path main already has with the same content, and says it left it out', async () => {
    const one = await anEntryTouching([MERGER], 'older', [MERGER])
    const paths = one.seal.files.map((file) => file.path)
    expect(paths).toContain(MERGER)
    const main = theContentOnMain(one.dir, paths)
    expect(main.files[MERGER]).toBe(contentOf(one.seal)[MERGER])
    expect(main.at).not.toBe(one.seal.forkBase)
    await release(one.run)

    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), main })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')
    expect(pinned.body['decided']).toContain(` It touches no path that needs a press. ${leftOutBy(main.at, [MERGER])}`)
    expect(pinned.body['entry'].pressToLand).toBeUndefined()
    expect(pinned.body['entry'].machine.pressToLand).toEqual({ paths: [], asked: null, leftOut: { mainAt: main.at, paths: [MERGER] } })
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('Press to land'))).toEqual([])
    expect((await entry(one.id)).toolWaits).toBeUndefined()
    expect(await theToolsWork()).toContain(one.id)
    const press = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asPerson, { because: 'nothing to press' })
    expect(press.status, press.raw).toBe(409)
    expect(press.body['error']).toBe(`Merge entry ${one.id} needs no press, so it lands by itself. ${leftOutBy(main.at, [MERGER])} Nothing was written.`)

    // WHAT LANDS IS WHAT THE INTEGRATION CHANGES OVER MAIN, and it leaves the merger file as main has it.
    const { [MERGER]: _asMainHasIt, ...overMain } = contentOf(one.seal)
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt: main.at, files: overMain })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body['entry'].state).toBe('testing')
    const green = await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })
    expect(green.status, green.raw).toBe(200)
    expect(green.body['decided']).not.toContain('nobody has pressed')
    const landing = await step(one.id, 'landing', { mainAt: main.at })
    expect(landing.status, landing.raw).toBe(200)
    const landed = await step(one.id, 'landed', { mainAfter: one.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
  })

  it('still holds an entry that changes a path that lands only after a press, and the notice names that path', async () => {
    const one = await anEntryTouching([MERGER], 'changes')
    const main = theContentOnMain(one.dir, one.seal.files.map((file) => file.path))
    expect(main.files[MERGER]).toBe(ABSENT)

    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), main })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('pinned')
    expect(pinned.body['decided']).toContain(` It touches 1 path that lands only after a press (${MERGER}), and the secretary was asked to press.`)
    expect(pinned.body['decided']).not.toContain('Left out')
    expect(pinned.body['entry'].pressToLand).toEqual({ paths: [MERGER], pressed: null })
    expect(pinned.body['entry'].machine.pressToLand).toMatchObject({ paths: [MERGER], leftOut: { mainAt: main.at, paths: [] } })
    const asked = toTheSecretary(one.run).filter((m) => m.id === pinned.body['entry'].machine.pressToLand.asked)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.title).toBe(`Press to land merge entry ${one.id}: it touches 1 sensitive path`)
    expect(asked[0]!.body).toContain(`- ${MERGER}: `)
    expect(asked[0]!.body).not.toContain('Left out')
    expect(asked[0]!.body).not.toContain(NOT_COMPARED)

    await release(one.run)
    expect((await entry(one.id)).toolWaits).toMatchObject({ because: 'waits-for-a-press', paths: [MERGER] })
    expect(await theToolsWork()).not.toContain(one.id)
    await toTesting(one.id, one.seal)
    const green = await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })
    expect(green.status, green.raw).toBe(200)
    expect(green.body['decided']).toContain('nobody has pressed')
    const held = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(held.status, held.raw).toBe(409)
    expect(held.body['error']).toContain(`only after a press (${MERGER}), and nobody has pressed it yet`)
  })

  it('says in the pin and the notice which paths it left out because main already has them', async () => {
    const one = await anEntryTouching([MERGER, SANDBOX], 'both', [MERGER])
    const main = theContentOnMain(one.dir, one.seal.files.map((file) => file.path))

    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), main })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['decided']).toContain(
      ` It touches 1 path that lands only after a press (${SANDBOX}), and the secretary was asked to press. ${leftOutBy(main.at, [MERGER])}`,
    )
    expect(pinned.body['entry'].pressToLand).toEqual({ paths: [SANDBOX], pressed: null })
    expect(pinned.body['entry'].machine.pressToLand).toMatchObject({ paths: [SANDBOX], leftOut: { mainAt: main.at, paths: [MERGER] } })
    const asked = toTheSecretary(one.run).filter((m) => m.id === pinned.body['entry'].machine.pressToLand.asked)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.title).toBe(`Press to land merge entry ${one.id}: it touches 1 sensitive path`)
    expect(asked[0]!.body).toContain(`- ${SANDBOX}: `)
    expect(asked[0]!.body).not.toContain(`- ${MERGER}: `)
    expect(asked[0]!.body).toContain(`\n\n${leftOutBy(main.at, [MERGER])}\n\n`)
    await withdraw(one.id)
  })

  it('says it when main’s content was not reported at the pin, and counts every path of the seal that waits for a press', async () => {
    const one = await anEntryTouching([MERGER], 'unread', [MERGER])

    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['decided']).toContain(` It touches 1 path that lands only after a press (${MERGER}), and the secretary was asked to press. ${NOT_COMPARED}`)
    expect(pinned.body['entry'].machine.pressToLand).not.toHaveProperty('leftOut')
    expect(pinned.body['entry'].pressToLand).toEqual({ paths: [MERGER], pressed: null })
    const asked = toTheSecretary(one.run).filter((m) => m.id === pinned.body['entry'].machine.pressToLand.asked)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.body).toContain(`\n\n${NOT_COMPARED}\n\n`)
    await withdraw(one.id)
  })

  it('refuses a pin whose report of main names other paths than the seal, and writes nothing', async () => {
    const one = await anEntryTouching([MERGER], 'other')
    const main = theContentOnMain(one.dir, [MERGER, 'work/elsewhere.txt'])

    const r = await step(one.id, 'pinned', { files: contentOf(one.seal), main })
    expect(r.status, r.raw).toBe(422)
    expect(r.body['error']).toBe(
      `The pin reports main's content at ${main.at} for other paths than seal ${one.seal.id} names. Not reported: ${RULES}, ${A}. Not in the seal: work/elsewhere.txt. Nothing was written.`,
    )
    expect((await entry(one.id)).state).toBe('submitted')
    expect(toTheSecretary(one.run).filter((m) => m.title.startsWith('Press to land'))).toEqual([])
    await withdraw(one.id)
  })

  it('holds an entry at the landing when its integration changes a path the pin left out', async () => {
    const one = await anEntryTouching([MERGER], 'moved', [MERGER])
    const main = theContentOnMain(one.dir, one.seal.files.map((file) => file.path))
    await release(one.run)
    const pinned = await step(one.id, 'pinned', { files: contentOf(one.seal), main })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body['entry'].state).toBe('judged')

    // MAIN MOVED AFTER THE PIN, so the integration changes the merger file over main after all.
    await toTesting(one.id, one.seal)
    expect((await entry(one.id)).pressToLand).toEqual({ paths: [MERGER], pressed: null })
    const green = await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })
    expect(green.status, green.raw).toBe(200)
    expect(green.body['decided']).toContain('nobody has pressed')
    const held = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(held.status, held.raw).toBe(409)
    expect(held.body['error']).toContain(`only after a press (${MERGER}), and nobody has pressed it yet`)
    const pressed = await call('POST', `/api/merge-queue/${one.id}/press-to-land`, asSecretary, { because: 'the merger change was read' })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(pressed.body['entry'].machine.pressToLand).toMatchObject({ leftOut: { mainAt: main.at, paths: [MERGER] } })
    const landing = await step(one.id, 'landing', { mainAt: one.seal.forkBase })
    expect(landing.status, landing.raw).toBe(200)
  })
})
