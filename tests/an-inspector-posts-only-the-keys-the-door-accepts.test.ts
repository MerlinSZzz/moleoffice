// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * The verdict door and its source functions agree on accepted keys, chapter levels, trace words
 * and refusal shapes. Direct cases exercise those functions. Process cases keep the tool's
 * ordered normalization, one correction, restricted correction fields, posting, refused-verdict
 * delivery, prompt basis, model stdout failure, and the tool's own listed alone reaching the door
 * covered with stand-in models.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SAYS_KEYS, onlyTheKeysTheDoorAccepts, whatSaysTakes } from '../src/config/verdict-keys.mjs'
import { onlyTheRealFaults, theUnreadPartsSay } from '../src/config/verdict-kinds.mjs'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { theInvariantsTheRulesList } from '../src/server/lib/invariants.ts'
import { USER_PART_SOURCE } from '../src/worker/rules.ts'
import { LADDER, WHAT_A_CARD_MEANS, chaptersAtTheLevelsWrittenOut } from '../src/shared/chapters.ts'
import { TRACED_HOW, tracedAtTheDoorsWords } from '../src/shared/releasing.ts'
import { whatTheVerdictDoorWouldSay, theShapeTheDoorTakesFor } from '../src/shared/the-verdict-door.ts'
import { A_REFUSAL_NAMES } from '../src/shared/releasing.ts'
import { aMadeUpCheckSession, theInspectorsRowNames } from './inspector-tool-fixture.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''
let worktrees = ''
let bin = ''
/** A scratch of this file's own, under the repository so nothing is written outside it. */
let scratch = ''
let authority = ''
const traced = () => [{ paths: ['work/the-work.txt'], to: authority, how: "the person's word", said: 'Synthetic permission for the test change.' }]
/** The body of the last verdict the tool posted to the check door, by the run whose check it answers. */
const theBodyThatReachedTheDoor = new Map<string, Record<string, unknown>>()

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

let workers = 0
async function aWorkerWithAFinishedRun(title: string): Promise<{ handle: string; run: string }> {
  workers += 1
  const handle = `the-worker-${String(workers)}`
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: `The Worker ${String(workers)}`, role: 'worker', workArea: ['work'] })
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: checkout, doing: 'the work under check', cutFrom: 'main' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return { handle, run: (reply.json() as { record: { id: string } }).record.id }
}

/** Put a `claude` on PATH that prints what the body says and nothing else. It runs no model. */
function standInClaude(body: string): void {
  const file = join(bin, 'claude')
  writeFileSync(file, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\n${body}\n`)
  chmodSync(file, 0o755)
}

/** A released verdict as the model would print it, whatever it holds. */
function printsAVerdict(answer: Record<string, unknown>): string {
  const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
  return `cat >/dev/null; printf '%s' '${envelope}'`
}

/**
 * A stand-in claude that answers the check with `verdict` and a request to correct its form with `correction`, keeps
 * every prompt it was given in `prompts`, one file per call, and runs no model.
 */
function answersTheCheckThenTheCorrection(verdict: Record<string, unknown>, correction: Record<string, unknown>, prompts: string): string {
  const envelope = (answer: Record<string, unknown>) => JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
  mkdirSync(prompts, { recursive: true })
  return [
    `n=$(ls '${prompts}' | wc -l); cat > '${prompts}'/$n.txt`,
    `if grep -q 'This asks only for a correction of its form' '${prompts}'/$n.txt; then printf '%s' '${envelope(correction)}'; else printf '%s' '${envelope(verdict)}'; fi`,
  ].join('\n')
}

function inspect(run: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host. The sandbox
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--model', 'none', '--on-the-host', '--check', aMadeUpCheckSession()],
      { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_CHECK_WORKTREES: worktrees, PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

/** Every message filed about one run, as the records they are. */
async function messagesAbout(run: string): Promise<Record<string, unknown>[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { records: Record<string, unknown>[] }
  return said.records.filter((one) => (one['data'] as Record<string, unknown>)['aboutRun'] === run)
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START. The chapters are read from the office's chapter
  // records (wave 13w), and the chapters lines below name chapters 5 and 7, which a world with none does not hold.
  // Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  giveFixtureSeats(app)
  // WHAT REACHED THE DOOR is read from the office itself, not from the tool's output. The verdict door is the only POST
  // whose path is /api/checks/<run> with nothing after the run; the prompt, assembled and eligibility doors have a word
  // after the run, and a GET is not a verdict. The last body for a run is the one the door answered.
  app.addHook('preValidation', async (request) => {
    if (request.method !== 'POST') return
    const found = /^\/api\/checks\/([^/?]+)$/u.exec(request.url.split('?')[0] ?? '')
    if (found === null) return
    const body = request.body
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      theBodyThatReachedTheDoor.set(found[1]!, body as Record<string, unknown>)
    }
  })
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })

  // .logs IS GITIGNORED, so a fresh worktree has none: made here, as the other tests that keep a scratch there do (the
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  scratch = mkdtempSync(join(REPO, '.logs', 'verdict-keys-'))
  bin = join(scratch, 'bin')
  mkdirSync(bin)
  worktrees = join(scratch, 'check-worktrees')
  mkdirSync(worktrees)

  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names the model --model names below, none, with native
  // data, so the check starts from the row's selection and not from the compatibility list, which names no such model.
  await theInspectorsRowNames(app, 'none', AS_THE_PERSON)
  authority = t.api.createRecord({ kind: 'note', title: 'Synthetic permission for verdict key tests', origin: 'fixture', workspaceId: WORKSPACE, data: {}, actor: { type: 'human', id: THE_PERSON } }).id

  checkout = join(scratch, 'checkout')
  mkdirSync(checkout)
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\nAnd what the worker built.\n')
  git('commit', '-qam', 'The work under check')
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the verdict door and the inspector agree on the keys', () => {
  it('refuses a verdict body with a key inside says that the schema does not know', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run the door is asked directly')
    const refused = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'A direct body', says: { chapter: 5, where: 'x' } },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const error = String((refused.json() as { error?: string }).error ?? '')
    expect(error).toContain('Unrecognized key')
    expect(error).toContain('where')
  })

  // MUTATION: stop forwarding traced in tools/the-inspector.mjs; this real-tool case goes red.
  it('drops the keys the door does not accept, names them, and still releases the run', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose verdict carries keys the door does not know')
    const prompts = join(scratch, 'combined-release-prompts')
    const nearly = 'an engineering choice left to agents'
    standInClaude(answersTheCheckThenTheCorrection(
      { verdict: 'released', traced: [{ path: 'work/the-work.txt', to: authority, how: nearly, said: 'Synthetic permission for the test change.' }],
        check: 'Read the brief, the chapters and the changes.', chaptersRead: [{ chapter: 5, level: 'rules' }, '7:rules'],
        decision: 'released anyway', says: { chapter: 5, where: 'the work area is untouched' } },
      { traced: traced(), verdict: 'refused', check: 'Other reasons.', missing: ['something'] }, prompts,
    ))
    const ran = await inspect(run)

    expect(ran.code, ran.err).toBe(0)
    expect(ran.err).not.toContain('Unrecognized key')
    // THE TOOL SAYS WHAT IT DROPPED, because a silent drop is the same defect one layer down.
    expect(ran.out).toContain('decision')
    expect(ran.out).toContain('says.where')

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const said = read.json() as {
      stands: { released: { by: { id: string } } | null; unreleasedFinish: boolean }
    }
    expect(said.stands.unreleasedFinish).toBe(false)
    expect(said.stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(read.json().stands.released.traced).toEqual(traced())
    expect(ran.out).toContain('named levels the reading ladder has not got')
    expect(ran.out).toContain(`"${nearly}" as "${TRACED_HOW[1]}"`)
    expect(ran.out).toContain('The verdict door would refuse this verdict as the check wrote it: The check traced.0.paths')
    expect(ran.out).toContain('Asking the model once to correct `traced`.')
    expect(ran.out).toContain('which it was not asked for; that was left out.')
    expect(readdirSync(prompts).sort()).toEqual(['0.txt', '1.txt'])
    const correction = readFileSync(join(prompts, '1.txt'), 'utf8')
    expect(correction).toContain('traced.0: Unrecognized key: "path"')
    expect(correction).toContain('"required":["paths","to","how","said"]')
    expect(correction).not.toContain('- `check`:')
    expect(read.json().stands.refused).toBeNull()
    expect(read.json().stands.released.chaptersReadUnreadable.join(' ')).toContain('7:rules — ')

    // WHAT THE INSPECTOR MEANT TO SAY REACHED THE WORKER: the dropped keys are folded into the
    // check sentence the worker's message carries.
    const messages = await messagesAbout(run)
    const toTheWorker = messages.map((one) => String((one['data'] as Record<string, unknown>)['body'] ?? ''))
      .find((body) => body.includes('You are released')) ?? ''
    expect(toTheWorker).toContain('Read the brief, the chapters and the changes.')
    expect(toTheWorker).toContain('says.where')
    expect(toTheWorker).toContain('decision')
    expect(toTheWorker).toContain('so it is taken at full, the level the prompt wrote it out at')
    expect(toTheWorker).toContain('chapter 5 at full')
    expect(toTheWorker).not.toContain('Chapters read for this check: none')
    expect(toTheWorker).toContain(`"${nearly}" as "${TRACED_HOW[1]}"`)
    expect(toTheWorker).toContain('so the model was asked once to correct it, and did.')
    expect(toTheWorker).not.toContain('Other reasons.')

  })

  // A LEVEL THE LADDER HAS NOT GOT IS TAKEN AT THE LEVEL THE PROMPT WROTE THAT CHAPTER OUT AT, and said (acceptance
  // and the office recorded that it had read none. A chapter the prompt did not write out is left as said, and the
  // office says it could not read it.
  // MUTATION PROOF, 24 September 2026, alone in tools/the-inspector.mjs: the chapters line posted as the model wrote it,
  // and this goes red.
  it('takes a chapter said at a level the ladder has not got at the level the prompt wrote it out at, and says so', async () => {
    const result = chaptersAtTheLevelsWrittenOut([{ chapter: 5, level: 'rules' }, '7:rules'], [{ chapter: 5, level: 'full' }])
    expect(result.chaptersRead).toEqual([{ chapter: 5, level: 'full' }, '7:rules'])
    expect(result.taken.join(' ')).toContain('so it is taken at full, the level the prompt wrote it out at')

  })

  // THE TOOL'S READING OF A CHAPTER'S LEVEL AND THE DOOR'S ARE HELD EQUAL (acceptance finding 65; the inspector's refusal
  // as gist, as full. Every rung, every word a role card uses and some words that are neither, in both shapes the door
  // takes, for a chapter the prompt wrote out, one it did not, and one named by its name: an entry the door reads goes
  // out exactly as it was said, and an entry the tool changes is one the door could not read and reads afterwards.
  // MUTATION PROOF, 24 September 2026, alone in src/shared/chapters.ts: the level decided by the ladder alone again,
  // and this goes red on "5:conclusion".
  it("holds the tool's reading of a chapter's level and the door's equal, so a level one reads and the other does not fails", async () => {
    const { readTheChaptersNamed } = await import('../src/server/lib/chapters.ts')
    const writtenOut = [{ chapter: 5, level: 'full' }]
    const words = [...LADDER, ...Object.keys(WHAT_A_CARD_MEANS), 'rules', 'Full', ' gist ', 'deep', '']
    const changed: unknown[] = []
    for (const word of words) {
      for (const entry of [{ chapter: 5, level: word }, `5:${word}`, `Tests and gates:${word}`, { chapter: 7, level: word }]) {
        const sent = chaptersAtTheLevelsWrittenOut([entry], writtenOut).chaptersRead
        const door = readTheChaptersNamed([entry])
        if (door.problems.length === 0) expect(sent, `the door reads ${JSON.stringify(entry)}`).toEqual([entry])
        if (JSON.stringify(sent) === JSON.stringify([entry])) continue
        changed.push(entry)
        expect(door.problems, `the tool changed ${JSON.stringify(entry)}`).not.toEqual([])
        expect(readTheChaptersNamed(sent)).toEqual({ named: [{ chapter: 5, level: 'full' }], problems: [] })
      }
    }
    // WHAT IS CHANGED IS EXACTLY THE WORDS THE DOOR READS IN NEITHER SHAPE, for the chapter the prompt wrote out.
    expect(changed).toEqual([{ chapter: 5, level: 'rules' }, '5:rules', { chapter: 5, level: 'Full' }, '5:Full', { chapter: 5, level: 'deep' }, '5:deep'])
  })

  it('trims a body without changing the verdict the model gave', () => {
    const { body, dropped } = onlyTheKeysTheDoorAccepts({
      verdict: 'refused',
      check: 'Read the brief.',
      missing: ['a test'],
      says: { chapter: 5, where: 'x' },
      decision: 'refused',
      chaptersRead: [],
      read: { anything: true },
    })
    expect(body['verdict']).toBe('refused')
    expect(body['missing']).toEqual(['a test'])
    expect(body['says']).toEqual({ chapter: 5 })
    expect(dropped.map((one) => one.key).sort()).toEqual(['decision', 'says.where'])
    expect(String(body['check'])).toContain('says.where')
    expect(String(body['check'])).toContain('decision')
  })
})

// A REFUSAL MAY REST ON AN INVARIANT USER.md LISTS, AND A VERDICT THE DOOR REFUSED IS NOT LOST (acceptance finding 69;
// written `says.invariant`. The door took only a chapter or a precedent, so the tool left the key out, the door refused a
// refusal that named no basis, and the refusal was recorded nowhere: 18 minutes of a check, and nobody told.
describe('a refusal may rest on an invariant USER.md lists, and a verdict the door refused is not lost', () => {
  /** The one message with this title, as its body and whom it went to, or undefined because there is none. */
  async function theMessageTitled(title: string): Promise<{ body: string; to: { kind: string; id: string }[] } | undefined> {
    const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    const found = (reply.json() as { records: { title: string; data: Record<string, unknown> }[] }).records.filter((one) => one.title === title)
    expect(found.length, `messages titled "${title}"`).toBeLessThanOrEqual(1)
    const one = found[0]
    return one === undefined ? undefined : { body: String(one.data['body'] ?? ''), to: (one.data['to'] ?? []) as { kind: string; id: string }[] }
  }

  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/inspection.ts: the prompt's old sentence ("which chapter
  // or precedent says so") put back, and this goes red on the prompt.
  it('records a refusal resting on an invariant, names the invariant to the worker, and the prompt said what says takes', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run refused on an invariant')
    const prompts = join(scratch, 'combined-refusal-prompts')
    standInClaude(answersTheCheckThenTheCorrection(
      { verdict: 'refused', check: 'Read the change and its tests.', missing: [{ what: 'a case for a ledger that could not be read', kind: 'data' }], says: 'chapter 5', chaptersRead: [] },
      { says: { invariant: 5 } }, prompts,
    ))
    const ran = await inspect(run)
    expect(ran.out, ran.err).toContain('The check answered: refused.')

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const refused = (read.json() as { stands: { refused: { invariant: number | null; chapter: number | null; precedent: string | null } | null } }).stands.refused
    expect(refused).toMatchObject({ invariant: 5, chapter: null, precedent: null })

    // THE WORKER IS TOLD WHICH INVARIANT, by the name USER.md gives it now.
    const five = (theInvariantsTheRulesList().listed ?? []).find((one) => one.number === 5)
    expect(five, 'USER.md lists an invariant 5').toBeDefined()
    const toTheWorker = (await messagesAbout(run)).map((one) => String((one['data'] as Record<string, unknown>)['body'] ?? ''))
      .find((body) => body.includes('You are not released')) ?? ''
    expect(toTheWorker).toContain(`What says so: invariant 5 of USER.md (${five?.name ?? ''}).`)

    // THE PROMPT SAID WHAT `says` TAKES, in the words of the one list the door's shape is held to.
    const given = readFileSync(join(prompts, '0.txt'), 'utf8')
    expect(ran.out).not.toContain('The verdict door does not accept says')
    expect(ran.out).toContain('Asking the model once to correct `says`.')
    expect(readFileSync(join(prompts, '1.txt'), 'utf8')).toContain('"says": "chapter 5"')
    expect(readdirSync(prompts).sort()).toEqual(['0.txt', '1.txt'])
    expect(read.json().stands.refused.missing).toEqual(['a case for a ledger that could not be read'])
    expect(given).toContain(whatSaysTakes())
    for (const key of SAYS_KEYS) expect(given).toContain(`\`${key}\` (`)
  })

  // MUTATION PROOF, 24 September 2026, alone in src/server/api/inspection.ts: the number checked against a range typed
  // in code (1 to 9) with no names, and this goes red on the sentence naming what USER.md lists.
  it('refuses an invariant USER.md does not list, naming what it lists, and says what says takes when none is named', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run the door is asked directly about its bases')
    const unlisted = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'refused', check: 'A direct body', missing: ['a test'], says: { invariant: 99 } },
    })
    expect(unlisted.statusCode, unlisted.body).toBe(400)
    const listed = theInvariantsTheRulesList().listed ?? []
    expect(listed.length).toBeGreaterThan(0)
    const said = String((unlisted.json() as { error?: string }).error ?? '')
    expect(said).toContain('Invariant 99 is not one USER.md lists.')
    expect(said).toContain(`It lists ${listed.map((one) => `${String(one.number)}, ${one.name}`).join('; ')}.`)

    const none = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'refused', check: 'A direct body', missing: ['a test'] },
    })
    expect(none.statusCode, none.body).toBe(400)
    expect(String((none.json() as { error?: string }).error ?? '')).toContain(whatSaysTakes())
  })

  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/invariants.ts: the list returned as a range typed in code
  // (1 to 9), and this goes red.
  it('reads the invariants from the user part of the rules it is pointed at, not from a range typed in code', () => {
    const root = mkdtempSync(join(scratch, 'claude-md-'))
    mkdirSync(join(root, dirname(USER_PART_SOURCE)), { recursive: true })
    writeFileSync(
      join(root, USER_PART_SOURCE),
      '# A fixture, written by a test\n\n## The invariants\n\n1. **The first.** One line.\n2. **The second.** Two lines,\n' +
        '   the second indented.\n\n## The chapters\n\n3. **Not an invariant.** It is under another heading.\n',
    )
    expect(theInvariantsTheRulesList(root)).toEqual({ listed: [{ number: 1, name: 'The first' }, { number: 2, name: 'The second' }], why: null })
    const nowhere = theInvariantsTheRulesList(join(root, 'nothing-is-here'))
    expect(nowhere.listed).toBeNull()
    expect(nowhere.why).toContain('could not be read')
  })

  // MUTATION PROOF, 24 September 2026, alone in tools/the-inspector.mjs: the delivery taken out, and this goes red,
  // because no message arrives.
  it('sends a verdict the door refused to the worker whole, and tells the starter one line that carries none of the check', async () => {
    const { handle, run } = await aWorkerWithAFinishedRun('A run whose check the door refuses')
    const FOUND = 'What the inspector found, which only the worker may read'
    standInClaude(printsAVerdict({ verdict: 'refused', check: FOUND, missing: [{ what: 'a case the change needs', kind: 'data' }], says: { invariant: 99 }, chaptersRead: [] }))
    const ran = await inspect(run)
    expect(ran.code).not.toBe(0)
    expect(ran.err).toContain('answered 400')

    // NOTHING WAS RECORDED: the door refused the verdict, and the run stands as the door left it.
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const stands = (read.json() as { stands: { refused: unknown; released: unknown } }).stands
    expect(stands.refused).toBeNull()
    expect(stands.released).toBeNull()

    // THE WORKER HAS THE WHOLE VERDICT, the door's words and where the run is left.
    const toTheWorker = await theMessageTitled(`The check's verdict was not recorded: ${handle}`)
    expect(toTheWorker, 'a message to the worker').toBeDefined()
    expect(toTheWorker?.to).toEqual([{ kind: 'agent', id: idOf(handle) }])
    expect(toTheWorker?.body).toContain(FOUND)
    expect(toTheWorker?.body).toContain('a case the change needs')
    expect(toTheWorker?.body).toContain('Invariant 99 is not one USER.md lists.')
    expect(toTheWorker?.body).toContain("Where the run is left, in the office's words: ")

    // THE STARTER HAS ONE LINE AND NONE OF THE CHECK (criteria C20 and C21): not the inspector's words, not what is
    // missing, and not the door's sentence, which names the basis it could not take. Measured in bytes as C20 is.
    const toTheStarter = await theMessageTitled(`A check's verdict was not recorded: ${handle}`)
    expect(toTheStarter, 'a message to the starter').toBeDefined()
    expect(toTheStarter?.to).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    const line = toTheStarter?.body ?? ''
    expect(line).toContain('HTTP 400')
    expect(line).toContain(`The verdict and the door's words are with ${handle}.`)
    expect(line).not.toContain(FOUND)
    expect(line).not.toContain('a case the change needs')
    expect(line).not.toContain('Invariant 99')
    expect(line).not.toContain('\n')
    expect(Buffer.byteLength(line)).toBeLessThan(Buffer.byteLength(toTheWorker?.body ?? ''))

    // AND THE TOOL SAYS WHAT IT SENT, after the messages themselves are held, so the case goes red first because no
    // message arrived when the delivery is taken out.
    expect(ran.out).toContain('The refused verdict was sent on.')
  })
})

// A TRACE WORD THE DOOR CANNOT READ IS TAKEN AT THE ONE OF ITS TWO WORDS IT NEARLY IS, AND SAID (problem -WZ40nNgHnTR;
// left to agents", one word short of the door's, and the door refused the whole verdict.
describe('a trace word the door cannot read is taken at the word it nearly is', () => {
  const NEAR_MISS = 'an engineering choice left to agents'

  // MUTATION: post the trace as the model wrote it in tools/the-inspector.mjs, and this goes red.
  it('the door refuses the near miss, and the tool takes it at the door\'s word, says so, and the run is released', async () => {
    const nearly = [{ ...traced()[0], how: NEAR_MISS }]
    expect(whatTheVerdictDoorWouldSay({ verdict: 'released', check: 'A direct body', traced: nearly })?.said).toContain('how')
    const result = tracedAtTheDoorsWords(nearly)
    expect(result.traced).toEqual([{ ...nearly[0], how: TRACED_HOW[1] }])
    expect(result.taken).toEqual([`"${NEAR_MISS}" as "${TRACED_HOW[1]}"`])
    expect(whatTheVerdictDoorWouldSay({ verdict: 'released', check: 'A direct body', traced: result.traced })).toBeNull()

  })

  // MUTATION: decide a near miss by exact words again in src/shared/releasing.ts, and this goes red.
  it('takes only a near miss, leaves the door\'s own words and every other word as written, and keeps the other fields', () => {
    const line = { paths: ['work/the-work.txt'], to: 'a-record', said: 'What it says.' }
    const asWritten = [
      { ...line, how: NEAR_MISS },
      { ...line, how: 'The person’s words' },
      { ...line, how: TRACED_HOW[0] },
      { ...line, how: TRACED_HOW[1] },
      { ...line, how: 'delegated engineering judgment' },
      { ...line, how: 'the agents' },
      { ...line },
      'not a line',
    ]
    const { traced, taken } = tracedAtTheDoorsWords(asWritten)
    expect(traced).toEqual([
      { ...line, how: TRACED_HOW[1] },
      { ...line, how: TRACED_HOW[0] },
      ...asWritten.slice(2),
    ])
    expect(taken).toEqual([`"${NEAR_MISS}" as "${TRACED_HOW[1]}"`, `"The person’s words" as "${TRACED_HOW[0]}"`])
    expect(tracedAtTheDoorsWords(undefined)).toEqual({ traced: undefined, taken: [] })
    expect(tracedAtTheDoorsWords(asWritten.slice(2))).toEqual({ traced: asWritten.slice(2), taken: [] })
  })
})

// THE VERDICT IS HELD TO THE DOOR'S OWN SHAPE BEFORE IT IS POSTED, AND THE MODEL CORRECTS WHAT THE DOOR WOULD REFUSE, ONCE
// every trace line as {path, ...}, and the door answered 400 "traced.0.paths: Invalid input: expected array, received
describe("a verdict is held to the door's own shape before it is posted, and corrected once", () => {
  const theTraceAsWrongFields = () => [{ path: 'work/the-work.txt', to: authority, how: "the person's word", said: 'Synthetic permission for the test change.' }]

  // MUTATION: skip the check against the door's shape in tools/the-inspector.mjs, and this goes red: the door answers 400.
  // MUTATION: leave the door's words out of the correction's prompt, and the prompt assertion goes red.
  it("asks the model once to correct the key the door would refuse, shows it the door's words, and the run is released", async () => {
    const said = whatTheVerdictDoorWouldSay({ verdict: 'released', traced: theTraceAsWrongFields(), check: 'Read the changes.' })
    expect(said?.modelsKeys).toEqual(['traced'])
    expect(said?.toolsKeys).toEqual([])
    expect(said?.said).toContain('traced.0: Unrecognized key: "path"')
    const shape = theShapeTheDoorTakesFor(said!.modelsKeys)
    expect(shape).toContain('"required":["paths","to","how","said"]')
    expect(shape).not.toContain('- `check`:')

  })

  // MUTATION: take the whole correction back instead of only the keys at fault in tools/the-inspector.mjs, and this goes red.
  it('takes back only the key at fault, so a correction cannot change the verdict or its reasons', async () => {
    const body = { verdict: 'released', traced: theTraceAsWrongFields(), check: 'The reasons the check gave.' }
    expect(whatTheVerdictDoorWouldSay(body)?.modelsKeys).toEqual(['traced'])
    expect(whatTheVerdictDoorWouldSay({ ...body, traced: traced() })).toBeNull()

  })

  it('posts a correction that still does not fit as it stands, asks no second time, and the refusal reaches the worker', async () => {
    const { handle, run } = await aWorkerWithAFinishedRun('A run whose correction still does not fit')
    const prompts = join(scratch, 'prompts-of-a-correction-that-does-not-fit')
    standInClaude(answersTheCheckThenTheCorrection(
      { verdict: 'released', traced: theTraceAsWrongFields(), check: 'Read the changes.', chaptersRead: [] },
      { traced: theTraceAsWrongFields() },
      prompts,
    ))
    const ran = await inspect(run)
    expect(ran.code).not.toBe(0)
    expect(ran.out).toContain('and the door would still refuse the result: The check traced.0.paths')
    expect(readdirSync(prompts)).toHaveLength(2)
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect((read.json() as { stands: { released: unknown } }).stands.released).toBeNull()
    const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const titles = (reply.json() as { records: { title: string }[] }).records.map((one) => one.title)
    expect(titles).toContain(`The check's verdict was not recorded: ${handle}`)
  })

  // THE DOOR AND THE TOOL SAY THE SAME WORDS, because they parse with the one shape: what the tool would say before the
  // post is what the door says to the same body.
  it("holds the tool's reading of a verdict and the door's to the same words", async () => {
    const { run } = await aWorkerWithAFinishedRun('A run the door is asked directly about its trace')
    const bodies: Record<string, unknown>[] = [
      { verdict: 'released', check: 'A direct body', traced: theTraceAsWrongFields() },
      { verdict: 'released', check: 'A direct body', traced: [{ ...traced()[0], how: 'delegated engineering judgment' }] },
      { verdict: 'refused', check: '', missing: ['a test'], says: { chapter: 5 } },
    ]
    for (const body of bodies) {
      const said = whatTheVerdictDoorWouldSay(body)
      expect(said, JSON.stringify(body)).not.toBeNull()
      const door = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: body })
      expect(door.statusCode, door.body).toBe(400)
      expect(String((door.json() as { error?: string }).error ?? '')).toBe(said?.said)
    }
    expect(whatTheVerdictDoorWouldSay({ verdict: 'released', check: 'A direct body', traced: traced() })).toBeNull()
  })
})

// the wrong shape, and the door refused a refusal that named nothing missing, so nothing was recorded.
describe('a refusal keeps what is missing and what says so', () => {
  type ARefusal = { missing: string[]; chapter: number | null } | null
  async function theRefusalOf(run: string): Promise<ARefusal> {
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    return (read.json() as { stands: { refused: ARefusal } }).stands.refused
  }

  it('takes a missing written as one sentence as a list of that one sentence, says so, and the refusal is recorded', async () => {
    const result = onlyTheKeysTheDoorAccepts({ verdict: 'refused', check: 'Read the changes.', missing: 'a case for an empty list', says: { chapter: 5 }, chaptersRead: [] })
    expect(result.body['missing']).toEqual(['a case for an empty list'])
    expect(result.reshaped.join(' ')).toContain('took it as a list of that one sentence')
    expect(whatTheVerdictDoorWouldSay(result.body)).toBeNull()

  })

  it("keeps a refusal's says of the wrong shape, so the model is asked once to correct it, and the refusal is recorded", async () => {
    const result = onlyTheKeysTheDoorAccepts({ verdict: 'refused', check: 'Read the changes.', missing: ['a case for an empty list'], says: 'chapter 5', chaptersRead: [] })
    expect(result.body['says']).toBe('chapter 5')
    expect(result.dropped).toEqual([])
    expect(whatTheVerdictDoorWouldSay(result.body)?.modelsKeys).toEqual(['says'])

  })

  it("asks the door's refusal rule before the post: a refusal naming no basis is corrected once, in the door's words", async () => {
    const { run } = await aWorkerWithAFinishedRun('A run refused on no basis')
    const prompts = join(scratch, 'prompts-of-a-refusal-on-no-basis')
    standInClaude(answersTheCheckThenTheCorrection(
      { verdict: 'refused', check: 'Read the changes.', missing: [{ what: 'a case for an empty list', kind: 'data' }], says: {}, chaptersRead: [] },
      { says: { chapter: 5 } },
      prompts,
    ))
    const ran = await inspect(run)
    expect(ran.out, ran.err).toContain('The check answered: refused.')
    expect(readFileSync(join(prompts, '1.txt'), 'utf8')).toContain(A_REFUSAL_NAMES)
    expect(await theRefusalOf(run)).toMatchObject({ chapter: 5 })
  })

  it("holds the tool's reading of a refusal and the door's to the same words", async () => {
    const { run } = await aWorkerWithAFinishedRun('A run the door is asked directly about a refusal')
    for (const body of [
      { verdict: 'refused', check: 'A direct body', missing: ['a test'], says: {} },
      { verdict: 'refused', check: 'A direct body', missing: [], says: { chapter: 5 } },
    ]) {
      const said = whatTheVerdictDoorWouldSay(body)
      expect(said, JSON.stringify(body)).not.toBeNull()
      const door = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: body })
      expect(door.statusCode, door.body).toBe(400)
      expect(String((door.json() as { error?: string }).error ?? '')).toBe(said?.said)
    }
  })
})

describe('a model that fails says why on its standard output (problem JRY5OEjnrAPu)', () => {
  // MUTATION: the host path says only what the error channel held, as before 5 October 2026, and this goes red.
  it('quotes the standard output when the error channel is empty, on the host', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose check the model could not take')
    const said = JSON.stringify({ type: 'result', is_error: true, result: 'Prompt is too long' }).replace(/'/gu, "'\\''")
    standInClaude(`cat >/dev/null; printf '%s' '${said}'; exit 1`)
    const ran = await inspect(run)
    expect(ran.code, ran.out + ran.err).toBe(1)
    expect(ran.err).toContain('claude exited 1. It printed nothing on the error channel, and this on its standard output:')
    expect(ran.err).toContain('Prompt is too long')
  })
})

// THE TOOL'S OWN `listed` ALONE REACHES THE DOOR. A release that lists faults is stored with the tool's two normalised
// lists, never the model's raw value, and a release with nothing listed carries no `listed` at all. An empty or wrongly
// shaped `listed` the model wrote used to stay in the body because the door names the key, and the door then refused the
// whole verdict.
// MUTATION: keep the model's raw `listed` in the body, and the empty-list and not-a-list cases go red at the door's 400.
// MUTATION: stop setting the tool's own `listed`, and the listed-items case goes red because the release stores none.
// MUTATION: set the tool's own `listed` even when both its lists are empty, and both no-list cases go red because the body carries it.
describe("the tool's own listed alone reaches the door", () => {
  type TheStands = {
    released: { by: { id: string }; listed?: { nextRound: string[]; afterLanding: string[] } } | null
    refused: unknown
    unreleasedFinish: boolean
  }

  async function theStandsOf(run: string): Promise<TheStands> {
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    return (read.json() as { stands: TheStands }).stands
  }

  function aReleaseListing(listed: unknown): Record<string, unknown> {
    return { verdict: 'released', check: 'Read the change and its tests.', traced: traced(), chaptersRead: [], listed }
  }

  function theBodyReachedFor(run: string): Record<string, unknown> {
    const reached = theBodyThatReachedTheDoor.get(run)
    expect(reached, 'the body that reached the door').toBeDefined()
    return reached!
  }

  it('a verdict whose model wrote an empty listed reaches the door with no listed', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose model wrote an empty listed')
    standInClaude(printsAVerdict(aReleaseListing([])))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)
    const reached = theBodyReachedFor(run)
    expect(reached).not.toHaveProperty('listed')
    const stands = await theStandsOf(run)
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(stands.refused).toBeNull()
  })

  it('a verdict whose model wrote a listed that is not a list reaches the door with no listed', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose model wrote a listed that is not a list')
    standInClaude(printsAVerdict(aReleaseListing({})))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)
    const reached = theBodyReachedFor(run)
    expect(reached).not.toHaveProperty('listed')
    const stands = await theStandsOf(run)
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(stands.refused).toBeNull()
  })

  it("a verdict whose model listed items reaches the door as the tool's two lists", async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose model listed faults')
    const answer = aReleaseListing([
      { what: 'The report has no label.', kind: 'form' },
      'The test copies the sentence the code defines.',
    ])
    const expected = onlyTheRealFaults(answer).listed
    expect(expected.nextRound.length).toBeGreaterThan(0)
    expect(expected.afterLanding.length).toBeGreaterThan(0)
    standInClaude(printsAVerdict(answer))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)
    const reached = theBodyReachedFor(run)
    expect(reached['listed']).toEqual(expected)
    expect(Object.keys(reached['listed'] as Record<string, unknown>).sort()).toEqual(['afterLanding', 'nextRound'])
    const stands = await theStandsOf(run)
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(stands.refused).toBeNull()
    expect(stands.released?.listed).toEqual(expected)
  })

  it("a verdict whose model wrote the door's own two sides reaches the door as the tool's two lists", async () => {
    const { run } = await aWorkerWithAFinishedRun("A run whose model wrote the door's own two sides")
    const answer = aReleaseListing({
      nextRound: ['The test copies the sentence the code defines.'],
      afterLanding: [{ what: 'The report has no label.', kind: 'code' }],
    })
    const expected = onlyTheRealFaults(answer).listed
    expect(expected.nextRound).toEqual(['The test copies the sentence the code defines.'])
    expect(expected.afterLanding).toEqual(['The report has no label.'])
    standInClaude(printsAVerdict(answer))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)
    const reached = theBodyReachedFor(run)
    expect(reached['listed']).toEqual(expected)
    const stands = await theStandsOf(run)
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(stands.refused).toBeNull()
    expect(stands.released?.listed).toEqual(expected)
  })

  it('a verdict whose model wrote a listed the tool cannot read says so on its output and in the check', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose model wrote a listed the tool cannot read')
    const answer = aReleaseListing(42)
    const unreadWords = theUnreadPartsSay(onlyTheRealFaults(answer).unread)
    expect(unreadWords).not.toBe('')
    standInClaude(printsAVerdict(answer))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)
    expect(withoutTheTimes(ran.out)).toContain(unreadWords)
    const reached = theBodyReachedFor(run)
    expect(reached).not.toHaveProperty('listed')
    expect(String(reached['check'])).toContain(unreadWords)
    const stands = await theStandsOf(run)
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
    expect(stands.refused).toBeNull()
  })
})
