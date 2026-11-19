// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT-ROUND DOOR TAKES INSIDE PACKAGES IN PLACE OF A BRIEF PATH. An ask may name the inside packages a round takes,
 * with their line, and the office writes the brief and its declaration into the sandbox's briefs folder. Everything here
 * is made up: the office, its agents, sandboxes, runs, points, packages, lines and models. Nothing here is real work.
 *
 * Every sentence the test expects is read from the function that says it, never written out a second time.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { type AddressInfo, type Socket } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheNextRound } from '../src/shared/next-round.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_MODEL = 'claude-made-up-round-1'

const madeUp = (what: string): string => `${what}-${randomBytes(4).toString('hex')}`
/** A made-up line: a word with no blank around it, as an ask names one. */
const aLine = (): string => madeUp('line')

// The office's modules are read after the test database is made, as the server reads them.
let lib: typeof import('../src/server/lib/next-round.ts')
let writer: typeof import('../src/server/lib/the-office-writes-into-a-sandbox.ts')
let seal: typeof import('../src/server/lib/before-the-seal.ts')
let rules: typeof import('../src/server/lib/before-the-seal-rules.ts')
let delivery: typeof import('../src/shared/round-chapters/delivery.ts')

let t: TestDb
let app: FastifyInstance
let closeApp: (() => Promise<void>) | undefined
let scratch: string
let workerModeBefore: string | undefined

/** Stop this fixture's office, including connections accepted before an HTTP request arrives. */
function closingThisTestOffice(office: FastifyInstance): () => Promise<void> {
  const connections = new Set<Socket>()
  let closing = false
  office.server.on('connection', (socket) => {
    if (closing) { socket.destroy(); return }
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
  })
  return async () => {
    closing = true
    const ended = office.close()
    for (const socket of connections) socket.destroy()
    await ended
  }
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, by: Record<string, string> = AS_THE_PERSON): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code' })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key })
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

/** A record filed through the records door, by the person unless another is named. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const r = await call('POST', '/api/records', headers, { kind, title, data: kind === 'decision' ? { replaces: [], ...data } : data })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

const PACKAGE_WORDS = { forTheOutside: 'Do the made-up work and return its result.', acceptance: 'The made-up work is done.' }
const inside = (task: string, door: string, headers: Record<string, string>, payload: Record<string, unknown> = {}) =>
  call('POST', `/api/delegation/${task}/${door}`, headers, payload)

/** The made-up parent every package here is made under, filed by an agent so that agent answers a restatement. */
let parent = ''

/** An inside package for one line: a made-up point of that line, a task, and the package on it. */
async function aPackage(line: string): Promise<{ id: string; title: string; point: string }> {
  const point = await file('backlog_item', madeUp('A made-up point'), {
    line, number: madeUp('item'), placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test', doneWhen: 'Never: it is made up', state: 'todo',
  })
  const title = madeUp('A made-up package')
  const id = await file('task', title)
  const made = await inside(id, 'package', AS_THE_PERSON, { ...PACKAGE_WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))], parent: { kind: 'task', id: parent }, pointIds: [point] })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return { id, title, point }
}

async function takenInside(task: string, by: string): Promise<void> {
  const r = await inside(task, 'take-inside', asOne(by))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
}

/**
 * Take a package inside, restate it, have the person answer aligned, and hand it back from a run of the agent the
 * office files, with that run's key, as the hand-back door asks. Answers when it was handed back. The run has no sandbox
 * and no process, so it is neither the agent's last sandbox run nor a run serving it.
 */
async function handedBack(pkg: { id: string; point: string }, by: string): Promise<string> {
  const filed = await call('POST', '/api/records', asAgent(THE_MESSAGE_WORKER_ID, A_MADE_UP_OFFICE_KEY), {
    kind: 'session', title: madeUp('A made-up run'), data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agents.get(by)!.id },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const fromItsRun = { ...asOne(by), 'x-mole-office-session': String(filed.body['record'].id), 'x-mole-office-key': String(filed.body['runKey']?.key ?? '') }
  await takenInside(pkg.id, by)
  const restated = await inside(pkg.id, 'align', asOne(by), { restated: 'I will do the made-up work', plan: 'Do it' })
  expect(restated.status, JSON.stringify(restated.body)).toBe(201)
  const answered = await inside(pkg.id, 'align-answer', AS_THE_PERSON, { answer: 'aligned', words: 'yes' })
  expect(answered.status, JSON.stringify(answered.body)).toBe(201)
  const back = await inside(pkg.id, 'hand-back', fromItsRun, { points: [{ pointId: pkg.point, outcome: 'part', words: 'Made-up work, part done' }] })
  expect(back.status, JSON.stringify(back.body)).toBe(201)
  return String(back.body['handback'].at)
}

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string, name: string): string {
  const id = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

interface AWorker { handle: string; run: string; folder: string; briefs: string; brief: string }

let workers = 0
/**
 * A made-up agent with its last run started in a made-up sandbox, as the launcher files one: the sandbox folder with a
 * brief in it and an empty briefs folder, and the container row that vouches for it. Each case has its own, so no ask
 * one case keeps is replaced by another's.
 */
async function aWorker(): Promise<AWorker> {
  workers += 1
  const handle = `pk-worker-${String(workers)}`
  await started(handle, asOne('pk-starter'))
  const set = await call('POST', `/api/office/run-models/agent/${agents.get(handle)!.id}`, AS_THE_PERSON, { model: A_MADE_UP_MODEL, variant: null })
  expect(set.status, JSON.stringify(set.body)).toBe(200)
  const folder = join(realpathSync(scratch), 'sandboxes', handle)
  const briefs = join(folder, 'briefs')
  mkdirSync(briefs, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for ${handle}\n\nDo the made-up next round.\n`)
  const container = aContainerRow(folder, handle)
  const run = t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: 'default',
    actor: { type: 'agent', id: agents.get('pk-starter')!.id },
    origin: 'fixture',
    data: {
      state: 'running',
      servingAgent: handle,
      servingAgentId: agents.get(handle)!.id,
      runtime: 'claude-code',
      model: A_MADE_UP_MODEL,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container, folder },
    },
  }).id
  return { handle, run, folder, briefs, brief }
}

const dataOf = (run: string): Record<string, any> =>
  JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
const theNextRoundOf = (run: string): TheNextRound | undefined => dataOf(run)['nextRound'] as TheNextRound | undefined
const theFilesIn = (folder: string): string[] => readdirSync(folder).sort()
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

const ask = (w: AWorker, body: unknown) => call('POST', `/api/agents/${w.handle}/next-round`, asOne(w.handle), body)

/** The brief and declaration file names the office gives the n-th brief it writes for a run. */
function theFilesNamedFor(w: AWorker, n = 1): { brief: string; declaration: string } {
  const brief = `next-round-${w.run}${n === 1 ? '' : `-${String(n)}`}.md`
  return { brief, declaration: `${brief}${writer.A_BRIEFS_DECLARATION_ENDS}` }
}

/** The ask is refused with these words, and nothing is written on the run or left in the briefs folder. */
async function refusedWith(w: AWorker, body: unknown, status: number, words: string): Promise<void> {
  const before = dataOf(w.run)
  const r = await ask(w, body)
  expect(r.status, JSON.stringify(r.body)).toBe(status)
  expect(r.body['error']).toBe(words)
  expect(dataOf(w.run)).toEqual(before)
  expect(theNextRoundOf(w.run)).toBeUndefined()
  expect(theFilesIn(w.briefs)).toEqual([])
}

/** The ask is taken: answered 202, and the run keeps it. */
async function taken(w: AWorker, body: unknown): Promise<{ says: string; nextRound: TheNextRound }> {
  const r = await ask(w, body)
  expect(r.status, JSON.stringify(r.body)).toBe(202)
  const nextRound = theNextRoundOf(w.run)
  expect(nextRound, 'the run kept no next round').toBeDefined()
  return { says: String(r.body['says']), nextRound: nextRound! }
}

/** The package items the reminder before the seal names for a run, read from the test office. */
function thePackagesTheSealNames(run: string): string[] {
  const record = t.api.getRecord(run)
  if (record === null) throw new Error('the test office lost the run it just filed')
  const facts = seal.theFactsBeforeTheSealOf(record, { commits: [], existedAtTheForkBase: () => false })
  const kind = rules.theKeyOfAPackageToHandBack('a task').split(':')[0]!
  return rules.whatAnInspectorWouldMostLikelyRefuse(facts).items.map((one) => one.key).filter((key) => key.split(':')[0] === kind)
}

beforeAll(async () => {
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER TAKES THE QUEUE. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  lib = await import('../src/server/lib/next-round.ts')
  writer = await import('../src/server/lib/the-office-writes-into-a-sandbox.ts')
  seal = await import('../src/server/lib/before-the-seal.ts')
  rules = await import('../src/server/lib/before-the-seal-rules.ts')
  delivery = await import('../src/shared/round-chapters/delivery.ts')
  app = (await apiApp()).app
  closeApp = closingThisTestOffice(app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  expect((app.server.address() as AddressInfo).port).toBeGreaterThan(0)
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-next-round-packages-'))

  await started('pk-starter')
  await started('pk-parent', asOne('pk-starter'))
  await started('pk-other', asOne('pk-starter'))
  // THE PARENT, packaged on a line of its own, so it never waits for a line a case asks for.
  const decision = await file('decision', madeUp('A made-up decision'))
  parent = await file('task', madeUp('A made-up parent'), {}, asOne('pk-parent'))
  const parentsPoint = await file('backlog_item', madeUp('A made-up point'), {
    line: aLine(), number: madeUp('item'), placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test', doneWhen: 'Never: it is made up', state: 'todo',
  })
  const made = await inside(parent, 'package', AS_THE_PERSON, { ...PACKAGE_WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))], parent: { kind: 'decision', id: decision }, pointIds: [parentsPoint] })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await closeApp?.()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1. an ask naming packages is taken, and the office writes the brief and its declaration', () => {
  it('takes an ask naming two packages of the line, writes both files, and keeps the brief, the packages and the line', async () => {
    const w = await aWorker()
    const line = aLine()
    const one = await aPackage(line)
    const two = await aPackage(line)
    const { nextRound } = await taken(w, { delegations: [two.id, one.id], line })

    const names = theFilesNamedFor(w)
    expect(theFilesIn(w.briefs)).toEqual([names.brief, names.declaration].sort())
    const brief = join(w.briefs, names.brief)
    const declared = delivery.roundDeclaration(brief)
    expect(declared.file).toBe(join(w.briefs, names.declaration))
    expect({ line: declared.line, delegations: declared.delegations }).toEqual({ line, delegations: [two.id, one.id] })
    expect(JSON.parse(readFileSync(declared.file, 'utf8'))).toEqual({ line, delegations: [two.id, one.id] })
    expect(readFileSync(declared.file, 'utf8')).toBe(lib.theDeclarationOfAPackagesRound(line, [two.id, one.id]))
    expect(readFileSync(brief, 'utf8')).toBe(
      lib.theWordsOfAPackagesBrief({
        handle: w.handle, run: w.run, line, packages: [{ id: two.id, title: two.title }, { id: one.id, title: one.title }],
        askedBy: w.handle, as: nextRound.askedBy.as, askedAt: nextRound.askedAt, declaration: names.declaration,
      }),
    )

    expect(nextRound.state).toBe('wanted')
    expect(nextRound.brief).toEqual({ path: brief, sha256: sha256(brief), bytes: readFileSync(brief).length })
    expect(nextRound.delegations).toEqual([two.id, one.id])
    expect(nextRound.line).toBe(line)
  })

  it('names the other package waiting for the line, and not one of another line, a taken one or a handed-back one', async () => {
    const w = await aWorker()
    const line = aLine()
    const [one, two, third] = [await aPackage(line), await aPackage(line), await aPackage(line)]
    const takenByAnother = await aPackage(line)
    await takenInside(takenByAnother.id, 'pk-other')
    const back = await aPackage(line)
    await handedBack(back, 'pk-other')
    const ofAnotherLine = await aPackage(aLine())

    const { says } = await taken(w, { delegations: [one.id, two.id], line })
    const names = theFilesNamedFor(w)
    expect(says).toContain(lib.theFilesTheAskWroteSay(join(w.briefs, names.brief), join(w.briefs, names.declaration)))
    expect(says).toContain(lib.theOtherPackagesWaitingSay(line, [{ id: third.id, title: third.title }]))
    for (const one of [takenByAnother, back, ofAnotherLine]) expect(says).not.toContain(one.id)
  })

  it('says no other package waits for the line when none does', async () => {
    const w = await aWorker()
    const line = aLine()
    const only = await aPackage(line)
    const { says } = await taken(w, { delegations: [only.id], line })
    expect(says).toContain(lib.theOtherPackagesWaitingSay(line, []))
  })

  it('takes a package the asked agent has already taken inside', async () => {
    const w = await aWorker()
    const line = aLine()
    const mine = await aPackage(line)
    await takenInside(mine.id, w.handle)
    const { nextRound } = await taken(w, { delegations: [mine.id], line })
    expect(nextRound.delegations).toEqual([mine.id])
    expect(nextRound.line).toBe(line)
  })
})

describe('2. an ask that is not one of the two shapes is refused with a 400, and nothing is written', () => {
  const shapes: [string, () => unknown, () => string][] = [
    ['a body that is not an object', () => ['a made-up brief'], () => lib.A_NEXT_ROUND_ASK_IS_AN_OBJECT],
    ['a field the ask does not take', () => ({ delegations: ['Tk-made-up'], line: 'made-up-line', briefs: 'x' }), () => lib.anAskTakesNoSuchField('briefs')],
    ['both a brief and packages', () => ({ brief: '/made/up/brief.md', delegations: ['Tk-made-up'], line: 'made-up-line' }), () => lib.AN_ASK_NAMES_A_BRIEF_OR_PACKAGES],
    ['neither a brief nor packages', () => ({}), () => lib.AN_ASK_NAMES_NEITHER_A_BRIEF_NOR_PACKAGES],
    ['a line with a brief', () => ({ brief: '/made/up/brief.md', line: 'made-up-line' }), () => lib.A_LINE_IS_NAMED_ONLY_WITH_PACKAGES],
    ['packages with no line', () => ({ delegations: ['Tk-made-up'] }), () => lib.PACKAGES_ARE_NAMED_WITH_THEIR_LINE],
    ['packages that are no list', () => ({ delegations: 'Tk-made-up', line: 'made-up-line' }), () => lib.PACKAGES_ARE_A_LIST_OF_IDS],
    ['an empty list of packages', () => ({ delegations: [], line: 'made-up-line' }), () => lib.PACKAGES_ARE_A_LIST_OF_IDS],
    ['a package id with a blank around it', () => ({ delegations: [' Tk-made-up'], line: 'made-up-line' }), () => lib.aPackageIdIsAPlainWord(' Tk-made-up')],
    ['a package id that is not text', () => ({ delegations: [7], line: 'made-up-line' }), () => lib.aPackageIdIsAPlainWord(7)],
    ['a package named twice', () => ({ delegations: ['Tk-made-up', 'Tk-made-up'], line: 'made-up-line' }), () => lib.aPackageIsNamedOnce('Tk-made-up')],
    ['a line with a blank around it', () => ({ delegations: ['Tk-made-up'], line: 'made-up-line ' }), () => lib.aLineIsAPlainWord('made-up-line ')],
    ['a line that is not text', () => ({ delegations: ['Tk-made-up'], line: 13 }), () => lib.aLineIsAPlainWord(13)],
    ['a brief that is not text', () => ({ brief: 7 }), () => lib.A_BRIEF_IS_A_PATH_AS_TEXT],
    ['a sandbox that is not text', () => ({ delegations: ['Tk-made-up'], line: 'made-up-line', sandbox: 7 }), () => lib.A_SANDBOX_IS_NAMED_AS_TEXT],
  ]
  for (const [what, body, words] of shapes) {
    it(`refuses ${what}`, async () => {
      await refusedWith(await aWorker(), body(), 400, words())
    })
  }
})

describe('3. a package the round cannot take is refused with a 409 naming it, and nothing is written', () => {
  it('refuses a package that is not among the inside packages', async () => {
    const missing = madeUp('Tk-no-such-package')
    await refusedWith(await aWorker(), { delegations: [missing], line: aLine() }, 409, lib.aPackageIsNotInsideSays(missing))
  })

  it('says it cannot tell when the office could not read a package', async () => {
    const w = await aWorker()
    const unreadable = await file('task', madeUp('A made-up task whose package cannot be read'))
    // A PACKAGE MISSING ITS LINES, which the inside column cannot read. It is taken off again, so no other case meets it.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify({ parent: { kind: 'task', id: parent }, lines: [] }), unreadable)
    try {
      const missing = madeUp('Tk-no-such-package')
      await refusedWith(w, { delegations: [missing], line: aLine() }, 409, lib.aPackageCouldNotBeToldSays(missing, [{ recordId: unreadable }]))
    } finally {
      t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.package') WHERE id = ?").run(unreadable)
    }
  })

  it('refuses a package whose lines do not name the asked line', async () => {
    const theirs = aLine()
    const other = await aPackage(theirs)
    const line = aLine()
    await refusedWith(await aWorker(), { delegations: [other.id], line }, 409, lib.aPackageIsForOtherLinesSays(other.id, other.title, line, [theirs]))
  })

  it('refuses a package that was handed back, even by the asked agent', async () => {
    const w = await aWorker()
    const line = aLine()
    const back = await aPackage(line)
    const at = await handedBack(back, w.handle)
    await refusedWith(w, { delegations: [back.id], line }, 409, lib.aPackageWasHandedBackSays(back.id, back.title, at))
  })

  it('refuses a package another agent took inside', async () => {
    const w = await aWorker()
    const line = aLine()
    const theirs = await aPackage(line)
    await takenInside(theirs.id, 'pk-other')
    await refusedWith(w, { delegations: [theirs.id], line }, 409, lib.aPackageWasTakenByAnotherSays(theirs.id, theirs.title, 'pk-other', w.handle))
  })
})

describe('4. a new ask names every package the kept ask names', () => {
  /** A worker whose run keeps an ask naming two packages of a line, with a third waiting for it. */
  async function aWorkerWithAnAsk(): Promise<{ w: AWorker; line: string; ids: string[]; third: string; kept: TheNextRound }> {
    const w = await aWorker()
    const line = aLine()
    const [one, two, third] = [await aPackage(line), await aPackage(line), await aPackage(line)]
    const { nextRound } = await taken(w, { delegations: [one.id, two.id], line })
    return { w, line, ids: [one.id, two.id], third: third.id, kept: nextRound }
  }

  /** The ask is refused for the packages it drops, and the kept ask and its two files are as they were. */
  async function refusedForDropping(asked: Awaited<ReturnType<typeof aWorkerWithAnAsk>>, body: unknown, dropped: string[]): Promise<void> {
    const { w } = asked
    const before = dataOf(w.run)
    const r = await ask(w, body)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toBe(lib.aReplacingAskDropsPackagesSays(w.run, asked.ids, dropped))
    expect(dataOf(w.run)).toEqual(before)
    const names = theFilesNamedFor(w)
    expect(theFilesIn(w.briefs)).toEqual([names.brief, names.declaration].sort())
  }

  it('refuses an ask naming packages that drops one the kept ask names', async () => {
    const asked = await aWorkerWithAnAsk()
    await refusedForDropping(asked, { delegations: [asked.ids[0], asked.third], line: asked.line }, [asked.ids[1]!])
  })

  it('refuses a brief ask that would replace an ask naming packages', async () => {
    const asked = await aWorkerWithAnAsk()
    await refusedForDropping(asked, { brief: asked.w.brief }, asked.ids)
  })

  it('keeps an ask that names every package the kept ask names, with its own brief and declaration', async () => {
    const asked = await aWorkerWithAnAsk()
    const { w, line } = asked
    const now = [asked.ids[1]!, asked.third, asked.ids[0]!]
    const { nextRound } = await taken(w, { delegations: now, line })
    expect(nextRound.delegations).toEqual(now)
    expect(nextRound.replaced?.askedAt).toBe(asked.kept.askedAt)
    const first = theFilesNamedFor(w)
    const second = theFilesNamedFor(w, 2)
    expect(theFilesIn(w.briefs)).toEqual([first.brief, first.declaration, second.brief, second.declaration].sort())
    expect(nextRound.brief.path).toBe(join(w.briefs, second.brief))
    expect(delivery.roundDeclaration(nextRound.brief.path).delegations).toEqual(now)
  })
})

describe('5. the writer writes the declaration as a new file, or neither file', () => {
  it('refuses when the declaration’s name is taken, and makes no brief', () => {
    const folder = join(realpathSync(scratch), 'sandboxes', madeUp('a-writer-only-sandbox'))
    const briefs = join(folder, 'briefs')
    mkdirSync(briefs, { recursive: true })
    const stem = madeUp('a-made-up-brief')
    const declared = join(briefs, `${stem}.md${writer.A_BRIEFS_DECLARATION_ENDS}`)
    writeFileSync(declared, '{"line": "a-made-up-line-already-there"}\n')
    const written = writer.writeABriefIntoASandbox(folder, stem, () => '# A made-up brief\n', () => '{}\n')
    expect(written).toEqual({ refused: writer.aDeclarationsNameIsTakenSays(declared) })
    expect(theFilesIn(briefs)).toEqual([`${stem}.md${writer.A_BRIEFS_DECLARATION_ENDS}`])
    expect(readFileSync(declared, 'utf8')).toBe('{"line": "a-made-up-line-already-there"}\n')
  })

  it('refuses the ask in the writer’s words when the declaration’s name is taken', async () => {
    const w = await aWorker()
    const line = aLine()
    const one = await aPackage(line)
    const declared = join(w.briefs, theFilesNamedFor(w).declaration)
    writeFileSync(declared, '{"line": "a-made-up-line-already-there"}\n')
    const r = await ask(w, { delegations: [one.id], line })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toBe(writer.aDeclarationsNameIsTakenSays(declared))
    expect(theNextRoundOf(w.run)).toBeUndefined()
    expect(theFilesIn(w.briefs)).toEqual([theFilesNamedFor(w).declaration])
  })
})

describe('6. the reminder before the seal leaves out a package the run’s next round takes', () => {
  it('leaves out a held package the next round names, and still names one it does not', async () => {
    const w = await aWorker()
    const line = aLine()
    const named = await aPackage(line)
    const notNamed = await aPackage(line)
    await takenInside(named.id, w.handle)
    await takenInside(notNamed.id, w.handle)
    expect(thePackagesTheSealNames(w.run).sort()).toEqual([rules.theKeyOfAPackageToHandBack(named.id), rules.theKeyOfAPackageToHandBack(notNamed.id)].sort())
    await taken(w, { delegations: [named.id], line })
    expect(thePackagesTheSealNames(w.run)).toEqual([rules.theKeyOfAPackageToHandBack(notNamed.id)])
  })
})
