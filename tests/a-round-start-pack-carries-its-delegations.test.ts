// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND-START PACK CARRIES ITS DELEGATIONS. A round whose brief's .round.json names delegations, as task record ids
 * beside its line, is handed each one in its start pack, right after the head and the one-read-away sentence, and is
 * asked first to restate the points with a plan for the parent to answer. readTheRoundsDelegations in
 * src/shared/round-start-delegations.ts asks GET /api/delegation/inside once and each point's own record;
 * prepareRoundChapters saves the reading in the manifest as `delegations`; withTheRoundStartPack in
 * src/shared/round-start-pack.ts writes the part.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and its own doors to
 * package, take, restate, answer, hand back and check. The worker, the line, the points and their words are made up, and
 * so is chapter 2, the one chapter the office holds, which a launched round's start reads from its chapters door. A
 * refusal is answered by a stand-in that changes the scratch office's own answer, or answers with the server's own
 * words for a door it does not have (`noSuchEndpoint`). The launcher-level cases run the real commandRound from
 * tools/sandbox.mjs over the scratch office, a sandbox folder the test makes and removes, a made-up brief and made-up
 * record ids.
 *
 * THE CASES, in plain words: the pack carries a delegation and its points; an aligned delegation asks for no
 * restatement; an answer that differs gives the parent's words, also when it answers the newer of two restatements; no
 * delegations asks nothing; an office without the
 * inside door stops the start; an answer that cannot be read stops it; a task not among the rows stops it, with and
 * without packages the office could not read; a task for another line stops it; a point that cannot be read stops it;
 * a bad declaration stops it; a reading that is not the declaration's stops it; nothing answering the door, a door
 * answering 500, and a parent's answer that cannot be read each stop it; a package handed back with no check, with a
 * check that holds and with a check that refused each stop it; rows whose hand-back and check fields do not agree stop
 * it as unreadable; and a round the launcher starts saves what was read in its manifest and delivered brief, while a
 * delegation not among the rows refuses the start before anything is filed.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { gateNamed } from '../src/config/gates.mjs'
import type { FastifyInstance } from 'fastify'
import { basename, dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { noSuchEndpoint } from '../src/server/api/kinds.ts'
import { validateData } from '../src/shared/kinds.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { readTheRoundsBacklog } from '../src/shared/round-chapters/backlog.ts'
import { prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE } from '../src/shared/round-chapters/delivery.ts'
import { bytes, deliveredRoundBrief, readRoundChapters, roundChaptersGivenText, type DelegationPoint, type DelegationStanding, type RoundDelegations } from '../src/shared/round-chapters/manifest.ts'
import {
  NOT_A_TASK_WITH_AN_INSIDE_PACKAGE, THE_PARENT_HAS_NOT_CHECKED_IT, THE_PARENTS_CHECK_SAYS_IT_HOLDS,
  aPointCannotBeRead, nothingAnsweredTheInsideDoor, readTheRoundsDelegations,
  theDelegationIsForOtherLines, theDelegationIsNotAmongTheRows, theDelegationWasHandedBack, theDelegationsRowCannotBeRead,
  theInsideAnswerCannotBeRead, theInsideDoorIsMissing, theInsideDoorRefused, theParentsAnswerCannotBeRead,
  theParentsCheckRefusedIt, whatTheOfficeAnswered,
} from '../src/shared/round-start-delegations.ts'
import {
  noPackForTheDelegations, NO_RESTATEMENT_IS_ASKED, THE_FALLBACK_RULE, THE_FIRST_INSTRUCTION, THE_MATERIALS_HEAD, THE_PACK_REFUSAL,
  THE_POINTS_HEAD, theDelegationHead, theDelegationPart, theDelegationsFirstStep, theDelegationsLines,
  theDelegationsMaterial, theDelegationsParent, theDelegationsPoint, theDelegationsThisRoundTakes, theRoundStartPackHead,
  whoTookTheDelegation,
} from '../src/shared/round-start-pack.ts'
import { aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { madeUpRound } from './round-chapters-fixture.ts'

const WORKER = 'delegation-round-worker'
const LINE = 'made-up-delegated-line'
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let t: TestDb
let app: FastifyInstance
let workerKey = ''
let workerId = ''
let decision = ''
const asTheWorker = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WORKER,
  'x-mole-office-key': workerKey,
})

/** The made-up points. Each title differs from its words, so a reading that took the title would show. */
const POINTS: { number: string; order: number; title: string; why: string; doneWhen: string; files?: string[] }[] = [
  { number: '1', order: 1, title: 'Made-up point 1, by its title only', why: 'Made-up point 1: paint the made-up fence.\n   1, a later made-up word on it.', doneWhen: 'Made-up: the fence is painted.', files: ['made-up/fence.ts', 'made-up/paint.ts'] },
  { number: '2', order: 2, title: 'Made-up point 2, by its title only', why: 'Made-up point 2: water the made-up beds.', doneWhen: 'Made-up: every made-up bed is wet.' },
]
const ids: string[] = []
const RESTATED = { restated: 'Made-up restatement of the points.', plan: 'Made-up plan: paint, then water.' }
const DIFFERS = 'Made-up answer: the fence comes after the beds.'

async function posted(url: string, headers: Record<string, string>, payload: unknown) {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json()
}

/** A task packaged for inside work, with the decision as its parent and these points. */
async function aDelegation(title: string, points: string[]): Promise<string> {
  const task = String((await posted('/api/records', PERSON, { kind: 'task', title, data: {} })).record.id)
  await posted(`/api/delegation/${task}/package`, PERSON, { forTheOutside: 'Made-up: do the points.', acceptance: 'Made-up: the points are done.', parent: { kind: 'decision', id: decision }, pointIds: points, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))] })
  return task
}
const takeInside = (task: string) => posted(`/api/delegation/${task}/take-inside`, asTheWorker(), {})
const restate = (task: string) => posted(`/api/delegation/${task}/align`, asTheWorker(), RESTATED)
const answer = (task: string, said: 'aligned' | 'differs', words: string) => posted(`/api/delegation/${task}/align-answer`, PERSON, { answer: said, words })
/** The worker hands back from a run the office files for it, with that run's key: the hand-back door takes no other. */
async function handBack(task: string, point: string) {
  const asTheOffice = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, ...theOfficesKeyHeader() }
  const run = await posted('/api/records', asTheOffice, { kind: 'session', title: 'Made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: workerId } })
  const fromItsRun = { ...asTheWorker(), 'x-mole-office-session': String(run.record.id), 'x-mole-office-key': String(run.runKey?.key ?? '') }
  return posted(`/api/delegation/${task}/hand-back`, fromItsRun, { points: [{ pointId: point, outcome: 'done', words: 'Made-up: the point is done.' }] })
}
const check = (task: string, said: 'holds' | 'refused', words: string) => posted(`/api/delegation/${task}/check`, PERSON, { answer: said, words })
async function theRecord(id: string) {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().record
}

/** The launcher's request, as the round start makes it, here to the scratch office. */
const askTheMadeUpOffice = (asked: string[] = []) => async (path: string) => {
  asked.push(path)
  const reply = await app.inject({ method: 'GET', url: path, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as unknown }
}

/** The scratch office, with the answer to some paths changed from its own. */
const aStandIn = (changed: Record<string, (real: { status: number; body: any }) => { status: number; body: unknown }>) => async (path: string) => {
  const real = await askTheMadeUpOffice()(path)
  return changed[path]?.(real) ?? real
}

/** A made-up sandbox whose TERRITORIES.md names it for the line, so the pack is made, and whose declaration is this. */
function aDelegatedRound(declaration: Record<string, unknown>, territories = true) {
  const f = madeUpRound()
  const sandbox = basename(f.dir)
  writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), territories
    ? `# Territories\n\n## The lines\n\n### ${LINE}, the made-up delegated line (sandbox ${sandbox})\nMADE-UP files of the line.\n\n${THE_FALLBACK_RULE}, for every changed file not named above: made-up words.\n`
    : '# Territories\n\n## The lines\n\nMADE-UP, with no heading for this sandbox.\n')
  writeFileSync(join(f.dir, 'briefs/NEXT.md'), '# Made-up next\n\n## 1. Next work\n\nMADE-UP item.\n')
  writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { synthetic: { 'CODE.md': [{ chapter: 2, descendants: true }], 'LINE-common.md': [{ path: ['Common', 'Local'] }], 'TERRITORIES.md': '*' } }, territories: {} }))
  declare(f, declaration)
  return f
}
const declare = (f: ReturnType<typeof madeUpRound>, declaration: Record<string, unknown>) =>
  writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'], ...declaration }))

/** The round start, as the launcher makes it: the backlog, then the delegations, then the manifest. */
async function aStart(f: ReturnType<typeof madeUpRound>, request = askTheMadeUpOffice()) {
  const backlog = await readTheRoundsBacklog({ brief: f.brief, request })
  const delegations = await readTheRoundsDelegations({ brief: f.brief, request })
  return { delegations, ...prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog, delegations }) }
}

/** The pack of a start with no delegations, with the delegation part put right after its head and one-read-away sentence. */
const withThePart = (text: string, part: string) => {
  const [head, away, ...rest] = text.split('\n\n')
  return [head, away, part, ...rest].join('\n\n')
}

/** A point as the test filed it, read back as its own record gives it. */
const asFiled = (i: number): DelegationPoint => {
  const { order: _order, title: _title, ...words } = POINTS[i]!
  return { id: ids[i]!, line: LINE, ...words }
}

/** The words of a refusal up to its reason, read from the function that makes them. */
const WHY = '\u0000'
const upToTheReason = (made: string) => THE_PACK_REFUSAL(made).split(WHY)[0]!

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: WORKER, name: WORKER, role: THE_WORKER } })
  expect(started.statusCode, started.body).toBe(201)
  workerKey = String(started.json().whatToGiveIt?.key ?? '')
  workerId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(WORKER) as { id: string }).id
  decision = String((await posted('/api/records', PERSON, { kind: 'decision', title: 'Made-up decision the delegations come from', data: { ...governsTheWholeProject(), replaces: [] } })).record.id)
  for (const { title, ...data } of POINTS) {
    const made = await posted('/api/records', PERSON, { kind: 'backlog_item', title, data: { line: LINE, state: 'todo', placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, ...data } })
    ids.push(String(made.record.id))
  }
  // THE CHAPTER A LAUNCHED ROUND IS GIVEN: its start reads the chapters from the office, and the policy selects chapter 2.
  const chapter = {
    label: 'MADE-UP chapter 2', title: 'MADE-UP rules of chapter 2', conclusion: 'MADE-UP conclusion of chapter 2: read it before the made-up work.',
    zh: { label: '测试章节 2', title: '测试规章 2', conclusion: '测试结论 2。' },
    rules: [{ id: 'r-1', heading: 'MADE-UP rule of chapter 2', text: 'MADE-UP work of chapter 2 is recorded.', zh: { heading: '测试条文 2', text: '测试工作 2 已记录。' } }],
  }
  const written = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: PERSON, payload: { n: 2, version: null, because: 'MADE-UP chapter for the launched round', chapter } })
  expect(written.statusCode, written.body).toBe(200)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a round's delegations", () => {
  it('carries the office switch into the pack and accepts an older office answer', async () => {
    const task = await aDelegation('Made-up delegation for the answer switch', [ids[0]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const save = (value: string) => app.inject({ method: 'POST', url: '/api/office/settings', headers: PERSON, payload: { changes: [{ name: gateNamed('package-alignment-answer').setting, value }], because: 'Made-up test choice.' } })
    const enabled = await save('1')
    expect(enabled.statusCode, enabled.body).toBe(200)
    try {
      const on = await aStart(f)
      expect(on.manifest.pack!.text).toContain(sayInEnglish('roundStart.waitForAnswer' as WordKey))
      const older = await aStart(f, aStandIn({ '/api/delegation/inside': real => {
        const { answerRequired: _answerRequired, ...body } = real.body as Record<string, unknown>
        return { ...real, body }
      } }))
      expect(older.manifest.pack!.text).toContain(sayInEnglish('roundStart.startAfterPlan' as WordKey))
      const malformed = aStandIn({ '/api/delegation/inside': real => ({ ...real, body: { ...(real.body as object), answerRequired: 'made-up' } }) })
      await expect(aStart(f, malformed)).rejects.toThrow(THE_PACK_REFUSAL(theInsideAnswerCannotBeRead([task], sayInEnglish('roundStart.badAnswerSetting' as WordKey))))
    } finally {
      const off = await save('0')
      expect(off.statusCode, off.body).toBe(200)
    }
    const off = await aStart(f)
    expect(off.manifest.pack!.text).toContain(sayInEnglish('roundStart.startAfterPlan' as WordKey))
  })

  it('1. one delegation with two points, not aligned: its part comes before the rules, asks for the restatement first, and holds the points whole', async () => {
    const task = await aDelegation('Made-up delegation not yet taken', [ids[0]!, ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const asked: string[] = []
    const { manifest, brief, delegations } = await aStart(f, askTheMadeUpOffice(asked))
    expect(asked).toEqual([`/api/backlog?line=${LINE}`, '/api/delegation/inside', `/api/records/${ids[0]}`, `/api/records/${ids[1]}`])

    const stored = (await theRecord(task)).data.package
    const inside: DelegationStanding = { taken: false, alignment: 'none' }
    const reading: RoundDelegations = {
      line: LINE,
      named: [task],
      tasks: [{ task, title: 'Made-up delegation not yet taken', parent: { kind: 'decision', id: decision }, lines: [LINE], inside, points: [asFiled(0), asFiled(1)], materials: stored.materials }],
    }
    expect(delegations).toEqual(reading)
    expect(manifest.delegations).toEqual(reading)
    expect(stored.materials.filter((one: { kind: string }) => one.kind === 'point').map((one: { ref: string }) => one.ref)).toEqual([ids[0], ids[1]])

    const pack = manifest.pack!.text
    const at = (sentence: string) => { expect(pack).toContain(sentence); return pack.indexOf(sentence) }
    expect(pack.startsWith(theRoundStartPackHead(LINE))).toBe(true)
    expect(pack.split('\n\n')[2]).toBe(theDelegationsThisRoundTakes(1))
    const order = [
      at(theDelegationsThisRoundTakes(1)),
      at(THE_FIRST_INSTRUCTION),
      at(theDelegationHead('Made-up delegation not yet taken', task)),
      at(theDelegationsParent({ kind: 'decision', id: decision })),
      at(theDelegationsLines([LINE])),
      at(whoTookTheDelegation(inside)),
      at(theDelegationsFirstStep(task, inside)),
      at(THE_POINTS_HEAD),
      at(theDelegationsPoint(asFiled(0))),
      at(theDelegationsPoint(asFiled(1))),
      at(THE_MATERIALS_HEAD),
      ...stored.materials.map((one: Parameters<typeof theDelegationsMaterial>[0]) => at(theDelegationsMaterial(one))),
      at(roundChaptersGivenText(manifest)),
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(THE_FIRST_INSTRUCTION).toContain('POST /api/delegation/<task>/align')
    expect(theDelegationsFirstStep(task, inside)).toContain(`POST /api/delegation/${task}/take-inside`)
    expect(theDelegationsFirstStep(task, inside)).toContain(`POST /api/delegation/${task}/align`)
    for (const point of POINTS) {
      expect(pack).toContain(point.why)
      expect(pack).toContain(point.doneWhen)
    }
    expect(pack).toContain(POINTS[0]!.files!.join(', '))
    expect(pack).not.toContain(NO_RESTATEMENT_IS_ASKED)

    // The rest of the pack is the pack of the same start with no delegations, and the delivered brief is made from it.
    declare(f, { line: LINE })
    const without = (await aStart(f)).manifest
    const text = withThePart(without.pack!.text, theDelegationPart(reading))
    expect(manifest).toEqual({ ...without, delegations: reading, pack: { ...without.pack!, text, bytes: bytes(text) } })
    expect(readFileSync(brief, 'utf8')).toBe(deliveredRoundBrief(manifest))
    expect(() => readRoundChapters({ ...manifest, delegations: { ...reading, tasks: [{ ...reading.tasks[0]!, points: [] }] } })).toThrow('invalid delegation')
    expect(() => readRoundChapters({ ...manifest, delegations: { ...reading, tasks: [{ ...reading.tasks[0]!, inside: { taken: false, alignment: 'aligned' } }] } })).toThrow('invalid inside state')
  })

  it('2. an aligned delegation asks for no restatement, and the pack says it is aligned', async () => {
    const task = await aDelegation('Made-up delegation aligned', [ids[1]!])
    await takeInside(task)
    await restate(task)
    await answer(task, 'aligned', 'Made-up: yes.')
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const asked: string[] = []
    const { manifest, delegations } = await aStart(f, askTheMadeUpOffice(asked))
    expect(asked).toEqual([`/api/backlog?line=${LINE}`, '/api/delegation/inside', `/api/records/${ids[1]}`])
    const inside = delegations!.tasks[0]!.inside
    const takenAt = (await theRecord(task)).data.package.takenInside[0].at
    expect(inside).toEqual({ taken: true, takenBy: { kind: 'agent', id: workerId }, takenAt, alignment: 'aligned' })
    const pack = manifest.pack!.text
    expect(pack).toContain(NO_RESTATEMENT_IS_ASKED)
    expect(pack).toContain(whoTookTheDelegation(inside))
    expect(pack).toContain(theDelegationsFirstStep(task, inside))
    expect(pack).not.toContain(THE_FIRST_INSTRUCTION)
    expect(pack).not.toContain(`/api/delegation/${task}/align`)
    expect(manifest.delegations).toEqual(delegations)
  })

  it("3. a delegation whose parent's answer differs gives the parent's words and asks for a new restatement", async () => {
    const task = await aDelegation('Made-up delegation that differs', [ids[0]!])
    await takeInside(task)
    await restate(task)
    const waiting = (await aStart(aDelegatedRound({ line: LINE, delegations: [task] }))).manifest
    const before = waiting.delegations!.tasks[0]!.inside
    expect(before).toMatchObject({ taken: true, alignment: 'waiting' })
    expect(before).not.toHaveProperty('answerWords')
    expect(waiting.pack!.text).toContain(theDelegationsFirstStep(task, before))
    expect(waiting.pack!.text).toContain(NO_RESTATEMENT_IS_ASKED)

    await answer(task, 'differs', DIFFERS)
    const asked: string[] = []
    const { manifest, delegations } = await aStart(aDelegatedRound({ line: LINE, delegations: [task] }), askTheMadeUpOffice(asked))
    expect(asked).toEqual([`/api/backlog?line=${LINE}`, '/api/delegation/inside', `/api/records/${ids[0]}`, `/api/records/${task}`])
    const inside = delegations!.tasks[0]!.inside
    expect(inside).toEqual({ ...before, alignment: 'differs', answerWords: DIFFERS })
    const pack = manifest.pack!.text
    expect(pack).toContain(DIFFERS)
    expect(pack).toContain(theDelegationsFirstStep(task, inside))
    expect(theDelegationsFirstStep(task, inside)).toContain(DIFFERS)
    expect(theDelegationsFirstStep(task, inside)).toContain(`POST /api/delegation/${task}/align`)
    expect(pack).toContain(THE_FIRST_INSTRUCTION)
    expect(manifest.delegations).toEqual(delegations)
  })

  it('4. with no delegations nothing under /api/delegation is asked, and the start equals one with no delegations key', async () => {
    const f = aDelegatedRound({ line: LINE, delegations: [] })
    const asked: string[] = []
    const empty = await aStart(f, askTheMadeUpOffice(asked))
    expect(empty.delegations).toBeNull()
    expect(asked.filter(path => path.startsWith('/api/delegation'))).toEqual([])
    expect(asked).toEqual([`/api/backlog?line=${LINE}`])
    declare(f, { line: LINE })
    const none = await aStart(f)
    expect(empty.manifest).not.toHaveProperty('delegations')
    expect(JSON.stringify(empty.manifest)).toBe(JSON.stringify(none.manifest))
    expect(readFileSync(empty.brief, 'utf8')).toBe(readFileSync(none.brief, 'utf8'))
  })

  it('5. an office with no inside delegation door stops the start', async () => {
    const task = await aDelegation('Made-up delegation of an older office', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': () => ({ status: 404, body: noSuchEndpoint('GET', '/api/delegation/inside', []) }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theInsideDoorIsMissing([task])))
  })

  it('6. an answer that cannot be read stops the start', async () => {
    const task = await aDelegation('Made-up delegation read wrong', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const notAList = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: 'not a list' } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request: notAList })).rejects.toThrow(upToTheReason(theInsideAnswerCannotBeRead([task], WHY)))
    const noInside = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.map((row: { recordId: string; inside: Record<string, unknown> }) => (row.recordId === task ? { ...row, inside: null } : row)) } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request: noInside })).rejects.toThrow(upToTheReason(theDelegationsRowCannotBeRead(task, WHY)))
  })

  it('7. a task that is not among the rows stops the start', async () => {
    const task = await aDelegation('Made-up delegation left out', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.filter((row: { recordId: string }) => row.recordId !== task), couldNotRead: [] } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theDelegationIsNotAmongTheRows(task, [])))
  })

  it('8. a task that is not among the rows is said differently when the office could not read some packages', async () => {
    const task = await aDelegation('Made-up delegation left out, beside unread ones', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const unread = [
      [{ recordId: task, title: 'Made-up', because: 'Made-up: its package is missing a part.' }],
      [{ recordId: `${task}-other`, title: 'Made-up other', because: 'Made-up: another package is missing a part.' }],
    ]
    const said = [[], ...unread].map(couldNotRead => theDelegationIsNotAmongTheRows(task, couldNotRead))
    expect(new Set(said).size).toBe(3)
    for (const couldNotRead of unread) {
      const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.filter((row: { recordId: string }) => row.recordId !== task), couldNotRead } }) })
      await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theDelegationIsNotAmongTheRows(task, couldNotRead)))
    }
  })

  it("9. a task whose lines do not name the declaration's line stops the start", async () => {
    const task = await aDelegation('Made-up delegation of another line', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.map((row: { recordId: string }) => (row.recordId === task ? { ...row, lines: ['another-made-up-line'] } : row)) } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theDelegationIsForOtherLines(task, LINE, ['another-made-up-line'])))
  })

  it('10. a point whose words cannot be read stops the start', async () => {
    const task = await aDelegation('Made-up delegation with an unreadable point', [ids[0]!, ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const point = `/api/records/${ids[1]}`
    for (const request of [
      aStandIn({ [point]: real => ({ status: 200, body: { ...real.body, record: { ...real.body.record, data: { ...real.body.record.data, why: undefined } } } }) }),
      aStandIn({ [point]: () => ({ status: 404, body: { error: 'Made-up: no such record.' } }) }),
    ]) {
      await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(upToTheReason(aPointCannotBeRead(task, ids[1]!, WHY)))
    }
  })

  it('11. delegations without a line, or not a list of task ids each once, are refused by the file, and nothing is asked', async () => {
    for (const declaration of [{ delegations: ['made-up-task'] }, { line: LINE, delegations: 'made-up-task' }, { line: LINE, delegations: [' made-up-task'] }, { line: LINE, delegations: ['made-up-task', 'made-up-task'] }]) {
      const f = aDelegatedRound(declaration)
      const asked: string[] = []
      const refusal = await readTheRoundsDelegations({ brief: f.brief, request: askTheMadeUpOffice(asked) }).then(() => 'no refusal', (e: Error) => e.message)
      expect(refusal, JSON.stringify(declaration)).toContain(`declaration delegations in ${resolve(f.brief)}.round.json`)
      expect(asked).toEqual([])
    }
  })

  it('12. a reading that is not the declaration\'s, or a sandbox with no pack to carry it, stops the start', async () => {
    const task = await aDelegation('Made-up delegation read for another start', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const { delegations } = await aStart(f)
    const backlog = await readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice() })
    const refusals: string[] = []
    const refused = (start: () => unknown) => {
      expect(start).toThrow('Nothing was started.')
      try { start() } catch (e) { refusals.push((e as Error).message) }
    }
    refused(() => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog }))
    refused(() => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog, delegations: { ...delegations!, named: [`${task}-other`] } }))
    declare(f, { line: LINE })
    refused(() => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog, delegations }))
    expect(new Set(refusals).size).toBe(3)

    const unnamed = aDelegatedRound({ line: LINE, delegations: [task] }, false)
    const reading = await readTheRoundsDelegations({ brief: unnamed.brief, request: askTheMadeUpOffice() })
    const unnamedBacklog = await readTheRoundsBacklog({ brief: unnamed.brief, request: askTheMadeUpOffice() })
    expect(() => prepareRoundChapters({ sandboxDir: unnamed.dir, worktree: unnamed.worktree, brief: unnamed.brief, backlog: unnamedBacklog, delegations: reading }))
      .toThrow(THE_PACK_REFUSAL(noPackForTheDelegations(realpathSync(join(unnamed.dir, 'briefs/TERRITORIES.md')), basename(unnamed.dir))))
  })

  it('13. nothing answering the inside door stops the start', async () => {
    const task = await aDelegation('Made-up delegation with no door answer', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const why = 'Made-up: no office answered the inside door.'
    const request = async () => ({ status: null, why })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(nothingAnsweredTheInsideDoor([task], why)))
  })

  it('14. an inside door that answers 500 stops the start', async () => {
    const task = await aDelegation('Made-up delegation with a broken door', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const words = 'Made-up: the inside door broke.'
    const request = async () => ({ status: 500, body: { error: words } })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theInsideDoorRefused([task], 500, words)))
  })

  it("15. a parent's latest answer that cannot be read stops the start", async () => {
    const task = await aDelegation('Made-up delegation whose answer is unreadable', [ids[1]!])
    await takeInside(task)
    await restate(task)
    await answer(task, 'differs', DIFFERS)
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const recordPath = `/api/records/${task}`
    const noSuchRecord = { status: 404, body: { error: 'Made-up: no such record.' } }
    const answers = [
      { reply: { status: 200, body: { record: { id: task, kind: 'task', data: {} } } }, reason: NOT_A_TASK_WITH_AN_INSIDE_PACKAGE },
      { reply: noSuchRecord, reason: whatTheOfficeAnswered(noSuchRecord) },
    ]
    for (const { reply, reason } of answers) {
      const request = aStandIn({ [recordPath]: () => reply })
      await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(THE_PACK_REFUSAL(theParentsAnswerCannotBeRead(task, reason)))
    }
  })

  it('16. a package handed back with no check stops the start, before its points are read', async () => {
    const task = await aDelegation('Made-up delegation handed back unchecked', [ids[1]!])
    await takeInside(task)
    await restate(task)
    await answer(task, 'aligned', 'Made-up: yes.')
    await handBack(task, ids[1]!)
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const at = (await theRecord(task)).data.package.handedBack.at(-1).at
    const sentence = theDelegationWasHandedBack(task, at, 'none', null)
    const asked: string[] = []
    await expect(readTheRoundsDelegations({ brief: f.brief, request: askTheMadeUpOffice(asked) })).rejects.toThrow(THE_PACK_REFUSAL(sentence))
    expect(asked).toEqual(['/api/delegation/inside'])
    // AN INSPECTOR'S CHECK IS NOT THE PARENT'S ANSWER, so the sentence says whose check has not come, never that nobody
    // has checked: the inspector may have.
    expect(sentence).not.toContain('Nobody')
    expect(sentence).toContain(THE_PARENT_HAS_NOT_CHECKED_IT)
  })

  it('17. a package handed back with a check that holds stops the start', async () => {
    const task = await aDelegation('Made-up delegation handed back and held', [ids[1]!])
    await takeInside(task)
    await restate(task)
    await answer(task, 'aligned', 'Made-up: yes.')
    await handBack(task, ids[1]!)
    const words = 'Made-up: the hand-back holds up.'
    await check(task, 'holds', words)
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const at = (await theRecord(task)).data.package.handedBack.at(-1).at
    const sentence = theDelegationWasHandedBack(task, at, 'holds', words)
    const refusal = await readTheRoundsDelegations({ brief: f.brief, request: askTheMadeUpOffice() }).then(() => 'no refusal', (e: Error) => e.message)
    expect(refusal).toBe(THE_PACK_REFUSAL(sentence))
    expect(sentence).toContain(THE_PARENTS_CHECK_SAYS_IT_HOLDS)
  })

  it('18. a package handed back with a check that refused stops the start and quotes its words', async () => {
    const task = await aDelegation('Made-up delegation handed back and refused', [ids[1]!])
    await takeInside(task)
    await restate(task)
    await answer(task, 'aligned', 'Made-up: yes.')
    await handBack(task, ids[1]!)
    const words = 'Made-up: the hand-back leaves a hole.'
    await check(task, 'refused', words)
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const at = (await theRecord(task)).data.package.handedBack.at(-1).at
    const sentence = theDelegationWasHandedBack(task, at, 'refused', words)
    const refusal = await readTheRoundsDelegations({ brief: f.brief, request: askTheMadeUpOffice() }).then(() => 'no refusal', (e: Error) => e.message)
    expect(refusal).toBe(THE_PACK_REFUSAL(sentence))
    expect(refusal).toContain(words)
    expect(refusal).toContain(theParentsCheckRefusedIt(words))
    expect(sentence).not.toBe(theDelegationWasHandedBack(task, at, 'holds', words))
  })

  it('19. a row whose hand-back time disagrees with its hand-back is unreadable', async () => {
    const task = await aDelegation('Made-up delegation with a disagreeing hand-back time', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.map((row: { recordId: string; inside: Record<string, unknown> }) => (row.recordId === task ? { ...row, inside: { ...row.inside, handedBack: false, handedBackAt: '2026-11-11 00:00:00' } } : row)) } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(upToTheReason(theDelegationsRowCannotBeRead(task, WHY)))
  })

  it('20. a row whose check has no words is unreadable', async () => {
    const task = await aDelegation('Made-up delegation with a wordless check', [ids[1]!])
    await takeInside(task)
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.map((row: { recordId: string; inside: Record<string, unknown> }) => (row.recordId === task ? { ...row, inside: { ...row.inside, handedBack: true, handedBackAt: '2026-11-11 00:00:00', check: 'holds', checkWords: null } } : row)) } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(upToTheReason(theDelegationsRowCannotBeRead(task, WHY)))
  })

  it('21. a row whose check was written with no hand-back is unreadable', async () => {
    const task = await aDelegation('Made-up delegation checked without a hand-back', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const request = aStandIn({ '/api/delegation/inside': real => ({ status: 200, body: { ...real.body, tasks: real.body.tasks.map((row: { recordId: string; inside: Record<string, unknown> }) => (row.recordId === task ? { ...row, inside: { ...row.inside, handedBack: false, handedBackAt: null, check: 'refused', checkWords: 'Made-up: a check with no hand-back.' } } : row)) } }) })
    await expect(readTheRoundsDelegations({ brief: f.brief, request })).rejects.toThrow(upToTheReason(theDelegationsRowCannotBeRead(task, WHY)))
  })

  it("24. a delegation restated twice, whose parent answers the newer restatement, gives that answer's words", async () => {
    const task = await aDelegation('Made-up delegation restated twice', [ids[0]!])
    await takeInside(task)
    await restate(task)
    await posted(`/api/delegation/${task}/align`, asTheWorker(), { restated: 'Made-up second restatement of the points.', plan: 'Made-up plan: water, then paint.' })
    await answer(task, 'differs', DIFFERS)
    const { delegations } = await aStart(aDelegatedRound({ line: LINE, delegations: [task] }))
    expect(delegations!.tasks[0]!.inside).toMatchObject({ taken: true, alignment: 'differs', answerWords: DIFFERS })
  })
})

/** The launcher's own declaration of a name, run with the globals this file gives it, as the neighbouring round test does. */
function actual(name: string, globals: Record<string, unknown>) {
  const launcher = resolve('tools/sandbox.mjs')
  const source = readFileSync(launcher, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: launcher }) as (...args: any[]) => any
}

/** Every exported function the round delivery, its chapters, the delegation reader and the rules reader are made from. */
async function theRoundFunctions(): Promise<Record<string, any>> {
  return {
    ...await import('../src/shared/round-chapters/delivery.ts'),
    ...await import('../src/shared/round-chapters/manifest.ts'),
    ...await import('../src/shared/round-chapters/backlog.ts'),
    ...await import('../src/shared/round-chapters/standing.ts'),
    ...await import('../src/shared/round-start-delegations.ts'),
    ...await import('../src/shared/round-start-rules.ts'),
  }
}

describe('a round the launcher starts carries what its delegation reader read', () => {
  /**
   * The real commandRound, with the real chapter delivery and delegation reader. The office it asks is the scratch
   * office above; the sandbox folder, the brief, the prior run and every record id it files are made up. Nothing here
   * starts a runtime or writes to the live office.
   */
  const aLauncherRound = async (f: ReturnType<typeof madeUpRound>) => {
    const module = await theRoundFunctions()
    const launcher = resolve('tools/sandbox.mjs')
    const events: string[] = []
    let record: any = { data: { extra: { retained: 'keep' } } }
    let filedArgs: any
    const globals: Record<string, any> = {
      ...module, Buffer, existsSync, statSync, readFileSync, resolve, join, FULL_PERMISSIONS,
      chosen: { runtime: 'claude-code', agent: 'synthetic', brief: f.brief }, A_WORKERS_RUNTIME: 'claude-code',
      aWorkersWords: () => 'sandbox', theAddressARunCommitsAt: () => {}, whoIsAsking: () => ({}),
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: f.dir, name: 'synthetic', workspace: 'fixture' }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, with the worktree this sandbox's chapter rules are in and a title and model the round takes.
      theRunARoundContinues: async () => ({ run: 'prior', data: { runtime: 'claude-code', workingDirectory: f.worktree, cutFrom: 'synthetic-base', model: 'made-up-model', territory: ['prior-territory'] }, title: 'A made-up run before the round', entry: {} }),
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theRoundsRunWasFiledHere: async () => {}, theNameClaudeTakes: (s: string) => s, theNameCodexTakes: (s: string) => s,
      theCodexThreadOf: () => 'thread',
      theOpenCodeSessionOf: () => ({ session: 'session', database: 'opencode-agent-synthetic.db', says: null }),
      theBriefInside: (_dir: string, path: string) => path, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => true,
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, path: string) => path,
      theHelperTakesTheOpenCodeDatabase: () => true,
      theClaudeCodeCommand: ({ brief }: any) => ['claude', brief],
      anAgentsRunFiledHere: async (_sb: any, _who: any, args: any) => { filedArgs = args; events.push('filed'); return { id: 'filed', words: ['--filed', 'filed', '--brief', args.brief] } },
      api: 'synthetic', theCallerNamed: () => ({}),
      // THE STAND-IN OFFICE answers the inside delegation door, the backlog, every point's record and the two rules doors from the scratch office.
      askTheOfficeWhileItRestarts: async (_api: string, path: string) => {
        const reply = await app.inject({ method: 'GET', url: path, headers: PERSON })
        return { status: reply.statusCode, body: reply.json() as unknown }
      },
      THE_PROGRAM_A_RUNTIME_RUNS,
      theStartValues: async (command: string[]) => ({ command, env: {}, start: null }),
      theClaudeCodeEnvironment: () => ({}),
      theSecretsFor: () => ({ lines: [], says: '', file: null, quiet: true, warning: null }),
      askTheOffice: async (_api: any, path: string, options: any = {}) => {
        if (options.method === 'PATCH') { record.data = { ...record.data, ...options.body.dataPatch }; expect(validateData('session', record.data).ok).toBe(true); events.push('saved'); return { status: 200, body: { record } } }
        if (path.startsWith('/api/checks/')) { events.push('acknowledged'); return { status: 200, body: { chapters: module.savedChaptersLine(record.data.extra.roundChapters) } } }
        return { status: 200, body: { record } }
      },
      startThroughTheHelper: async () => { events.push('started'); return {} },
      printTheStart: () => {}, sayWhatWasStarted: () => {}, writeTheUseLine: async () => {}, say: () => {},
      refuse: (s: string) => { throw new Error(s) }, usage: (s: string) => { throw new Error(s) },
    }
    for (const name of ['theCodexCommand', 'theOpenCodeCommand', 'theClaudeCodeCommand']) globals[name] = actual(name, globals)
    if (readFileSync(launcher, 'utf8').includes('function theStandingStagesFor(')) globals['theStandingStagesFor'] = actual('theStandingStagesFor', globals)
    for (const name of ['whyARoundCannotWorkIn', 'whyARoundStartsANewConversation']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    for (const name of ['theAreaTheDoorSetIsTheDeclaredOne', 'theDeclaredAreaIsSetForTheRun']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    const outcome = await actual('commandRound', globals)().then(() => null, (e: Error) => e)
    return { outcome, events, record, filedArgs }
  }

  it('22. the saved manifest and the delivered brief hold the delegation the reader read', async () => {
    const task = await aDelegation('Made-up delegation the launcher carries', [ids[1]!])
    const f = aDelegatedRound({ line: LINE, delegations: [task] })
    const { outcome, events, record, filedArgs } = await aLauncherRound(f)
    expect(outcome).toBeNull()
    expect(events).toEqual(['filed', 'saved', 'acknowledged', 'started'])
    const manifest = record.data.extra.roundChapters
    const stored = (await theRecord(task)).data.package
    const inside: DelegationStanding = { taken: false, alignment: 'none' }
    const reading: RoundDelegations = {
      line: LINE,
      named: [task],
      tasks: [{ task, title: 'Made-up delegation the launcher carries', parent: { kind: 'decision', id: decision }, lines: [LINE], inside, points: [asFiled(1)], materials: stored.materials }],
    }
    expect(manifest.delegations).toEqual(reading)
    const delivered = readFileSync(filedArgs.brief, 'utf8')
    expect(delivered).toContain(theDelegationPart(reading))
    expect(theDelegationPart(reading)).toContain(THE_FIRST_INSTRUCTION)
  })

  it('23. a delegation not among the rows refuses the start and files nothing', async () => {
    const task = await aDelegation('Made-up delegation the launcher is not given', [ids[1]!])
    const missing = `${task}-not-among-the-rows`
    const f = aDelegatedRound({ line: LINE, delegations: [missing] })
    const { outcome, events } = await aLauncherRound(f)
    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toBe(THE_PACK_REFUSAL(theDelegationIsNotAmongTheRows(missing, [])))
    expect(events).not.toContain('filed')
  })
})
