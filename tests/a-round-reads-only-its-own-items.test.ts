// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND READS ONLY ITS OWN ITEMS. Wave 13r, item 19 (e), part 2. A round whose brief's .round.json names its line
 * is given that line's backlog items from the office, in the line's order, in place of briefs/REQUIREMENTS.md.
 * readTheRoundsBacklog in src/shared/round-chapters/backlog.ts asks GET /api/backlog?line=<line> before the round
 * starts; prepareRoundChapters saves what it was given in the round's manifest and puts it in the delivered brief.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and the launcher's own
 * ask (askTheOfficeWhileItRestarts) against a stand-in on a port of its own. The agents, lines, items and words are
 * made up. The stand-in answers with the server's own words for a door it does not have (`noSuchEndpoint`), so the
 * words the round start reads in that 404 are the server's.
 *
 * THE CASES, in order:
 *   1. a brief that names no line is delivered byte for byte as before: nothing is asked, and the manifest holds no
 *      backlog;
 *   2. a declaration that names items gets those items whole, in the line's order whatever order it names them in,
 *      and every other item of the line as one line with its number, state and record id;
 *   3. a declaration that names no items gets every item that is not done or dropped whole, and the others in one
 *      line each;
 *   4. an office with no items for the line, and an office with no backlog door (the live office on 29 October 2026
 *      answers 404), are said in one sentence that points to the file, and the round starts; the older office is asked
 *      through the launcher's own ask, which asks again while the office restarts. A sandbox with no file to fall
 *      back to stops the start;
 *   5. any other answer stops the start by name: another status, another 404, nothing answering, an unreadable
 *      answer, an item twice, and an item the declaration names that the line does not hold;
 *   6. a declaration that names items without a line, a blank line, or items that are not a list of numbers is
 *      refused, and so is a backlog reading that does not match the declaration;
 *   7. the saved manifest with its backlog is acknowledged by the office's check door, and the brief made from the
 *      saved manifest is the brief delivered.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - the items a declaration names are no longer the ones given whole, as only the state decides: case 2 is red;
 *   - the 404 of an office with no backlog door stops the start: case 4 is red;
 *   - the delivered brief leaves the backlog part out: cases 2 and 4 are red;
 *   - an item the office holds twice is read: case 5 is red;
 *   - a declaration that names a line starts with no backlog read: case 6 is red.
 */

import type { FastifyInstance } from 'fastify'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { noSuchEndpoint } from '../src/server/api/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { readTheRoundsBacklog } from '../src/shared/round-chapters/backlog.ts'
import { prepareRoundChapters, saveRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import {
  bytes,
  deliveredRoundBrief,
  readRoundChapters,
  REQUIREMENTS_FILE,
  roundChaptersGivenText,
  roundChaptersList,
  savedRoundChapters,
  WHERE_A_NAME_IS_DEFINED,
} from '../src/shared/round-chapters/manifest.ts'
import { askTheOfficeWhileItRestarts } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { madeUpRound } from './round-chapters-fixture.ts'

const PLACER = 'backlog-round-placer'
const LINE = 'made-up-round-line'
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let t: TestDb
let app: FastifyInstance
let agentKey = ''
const asTheAgent = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': PLACER,
  'x-mole-office-key': agentKey,
})

/** The made-up line's items, in the order the line gives them. */
const ITEMS = [
  { number: '1', order: 1, state: 'done', why: 'Made-up item 1: the made-up fence is painted.' },
  { number: '2', order: 2, state: 'todo', why: '2. Made-up item 2: water the made-up beds.\n   2, a later made-up word on it.', doneWhen: 'Made-up: every made-up bed is wet.' },
  { number: '2b', order: 3, why: '   2b. Made-up item 2b, whose state nobody recorded.' },
  { number: '3', order: 4, state: 'dropped', why: 'Made-up item 3: dropped.' },
  { number: '4', order: 5, state: 'doing', why: 'Made-up item 4: under way.' },
] as const
const ids: Record<string, string> = {}

/** The launcher's request, as the round start makes it, here to the made-up office. */
const askTheMadeUpOffice = (asked: string[] = []) => async (path: string) => {
  asked.push(path)
  const reply = await app.inject({ method: 'GET', url: path, headers: asTheAgent() })
  return { status: reply.statusCode, body: reply.json() }
}

function aRound(declaration: Record<string, unknown> | null, requirements = true) {
  const f = madeUpRound()
  if (declaration === null) writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'] }))
  else writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'], ...declaration }))
  if (requirements) writeFileSync(join(f.dir, REQUIREMENTS_FILE), '# Made-up requirements\n1. Made-up.\n')
  return f
}

const todaysBrief = (manifest: ReturnType<typeof readRoundChapters>) =>
  manifest.brief.text + '\n\n---\n\n' + WHERE_A_NAME_IS_DEFINED + '\n\n' + roundChaptersGivenText(manifest)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: PLACER, name: PLACER, role: THE_WORKER } })
  expect(started.statusCode, started.body).toBe(201)
  agentKey = String(started.json().whatToGiveIt?.key ?? '')
  for (const item of ITEMS) {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asTheAgent(),
      payload: { kind: 'backlog_item', title: `Made-up item ${item.number} of ${LINE}`, data: { line: LINE, placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, ...item } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    ids[item.number] = String(filed.json().record.id)
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a round's items", () => {
  it('1. a brief that names no line is delivered byte for byte as before, and nothing is asked', async () => {
    const f = aRound(null)
    const asked: string[] = []
    expect(await readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice(asked) })).toBeNull()
    expect(asked).toEqual([])
    for (const given of [{}, { backlog: null }]) {
      const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, ...given })
      expect(manifest).not.toHaveProperty('backlog')
      expect(readFileSync(brief, 'utf8')).toBe(todaysBrief(manifest))
      expect(deliveredRoundBrief(manifest)).toBe(todaysBrief(manifest))
      expect(roundChaptersList(manifest)).not.toContain('Backlog')
    }
  })

  it('2. a declaration that names items gets them whole in the line’s order, and every other item in one line', async () => {
    const f = aRound({ line: LINE, items: ['2b', '2'] })
    const asked: string[] = []
    const backlog = await readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice(asked) })
    expect(asked).toEqual([`/api/backlog?line=${LINE}`])
    const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog })
    const saved = manifest.backlog!
    expect(saved).toMatchObject({ line: LINE, named: ['2b', '2'], from: 'the office' })
    expect(saved.items).toEqual([
      { id: ids['1'], number: '1', state: 'done', given: false },
      { id: ids['2'], number: '2', state: 'todo', given: true },
      { id: ids['2b'], number: '2b', given: true },
      { id: ids['3'], number: '3', state: 'dropped', given: false },
      { id: ids['4'], number: '4', state: 'doing', given: false },
    ])
    expect(saved.bytes).toBe(bytes(saved.text))
    const two = `Item 2 (to do, record ${ids['2']}):\n${ITEMS[1].why}\nDone when: ${ITEMS[1].doneWhen}`
    const twoB = `Item 2b (state not recorded, record ${ids['2b']}):\n${ITEMS[2].why}`
    expect(saved.text).toContain(two)
    expect(saved.text).toContain(twoB)
    expect(saved.text.indexOf(two)).toBeLessThan(saved.text.indexOf(twoB))
    for (const short of [`- 1: done, record ${ids['1']}`, `- 3: dropped, record ${ids['3']}`, `- 4: doing, record ${ids['4']}`]) expect(saved.text).toContain(short)
    for (const other of [ITEMS[0].why, ITEMS[3].why, ITEMS[4].why]) expect(saved.text).not.toContain(other)
    expect(saved.text).toContain(`in place of ${REQUIREMENTS_FILE}`)

    const delivered = readFileSync(brief, 'utf8')
    expect(delivered).toBe(manifest.brief.text + '\n\n---\n\n' + saved.text + '\n\n---\n\n' + WHERE_A_NAME_IS_DEFINED + '\n\n' + roundChaptersGivenText(manifest))
    expect(delivered).toBe(deliveredRoundBrief(manifest))
    expect(roundChaptersList(manifest)).toContain(`Backlog of line ${LINE}: 2 items given whole and 3 named in one line, from the office (${saved.bytes} bytes).`)
  })

  it('3. a declaration that names no items gets every item not done or dropped whole, and the others in one line', async () => {
    const f = aRound({ line: LINE })
    const backlog = await readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice() })
    const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog })
    const saved = manifest.backlog!
    expect(saved.named).toEqual([])
    expect(saved.items.map((one) => [one.number, one.given])).toEqual([['1', false], ['2', true], ['2b', true], ['3', false], ['4', true]])
    for (const given of [ITEMS[1].why, ITEMS[2].why, ITEMS[4].why]) expect(saved.text).toContain(given)
    for (const other of [ITEMS[0].why, ITEMS[3].why]) expect(saved.text).not.toContain(other)
    expect(saved.text).toContain(`- 1: done, record ${ids['1']}`)
    expect(saved.text).toContain(`- 3: dropped, record ${ids['3']}`)
  })

  it('4. no items for the line, or no backlog door, is said in one sentence that points to the file, and the round starts', async () => {
    const empty = aRound({ line: 'made-up-empty-line' })
    const none = await readTheRoundsBacklog({ brief: empty.brief, request: askTheMadeUpOffice() })
    const { manifest, brief } = prepareRoundChapters({ sandboxDir: empty.dir, worktree: empty.worktree, brief: empty.brief, backlog: none })
    expect(manifest.backlog).toEqual({
      line: 'made-up-empty-line',
      named: [],
      from: 'the file',
      items: [],
      text: `The office holds no backlog items for line made-up-empty-line, so this round reads its items in ${REQUIREMENTS_FILE} as before.`,
      bytes: bytes(manifest.backlog!.text),
    })
    expect(readFileSync(brief, 'utf8')).toContain('\n\n---\n\n' + manifest.backlog!.text + '\n\n---\n\n')

    // THE OLDER OFFICE, through the launcher's own ask: nothing listens on the port at first, as while the office
    // restarts, and the stand-in that then listens answers with the server's own answer for a door it does not have.
    const older = aRound({ line: LINE, items: ['2'] })
    const heard: string[] = []
    const standIn: Server = createServer((req, res) => {
      heard.push(String(req.url))
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(noSuchEndpoint('GET', String(req.url), [])))
    })
    const port = await new Promise<number>((done) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const free = (probe.address() as AddressInfo).port
        probe.close(() => done(free))
      })
    })
    setTimeout(() => standIn.listen(port, '127.0.0.1'), 300)
    try {
      const said: string[] = []
      const backlog = await readTheRoundsBacklog({
        brief: older.brief,
        request: (path) => askTheOfficeWhileItRestarts(`http://127.0.0.1:${String(port)}`, path, { workspace: 'default' }, { betweenMs: 100, longestMs: 10_000, saying: (one: string) => said.push(one) }),
      })
      expect(said.length).toBeGreaterThan(0)
      expect(heard).toEqual([`/api/backlog?line=${LINE}`])
      const { manifest: m, brief: b } = prepareRoundChapters({ sandboxDir: older.dir, worktree: older.worktree, brief: older.brief, backlog })
      expect(m.backlog).toMatchObject({ line: LINE, named: ['2'], from: 'the file', items: [] })
      expect(m.backlog!.text).toBe(`This office has no backlog door (it answered GET /api/backlog with 404), so this round reads its items in ${REQUIREMENTS_FILE} as before.`)
      expect(readFileSync(b, 'utf8')).toContain('\n\n---\n\n' + m.backlog!.text + '\n\n---\n\n')
    } finally {
      await new Promise((done) => standIn.close(done))
    }

    const nowhere = aRound({ line: 'made-up-empty-line' }, false)
    expect(existsSync(join(nowhere.dir, REQUIREMENTS_FILE))).toBe(false)
    const fallback = await readTheRoundsBacklog({ brief: nowhere.brief, request: askTheMadeUpOffice() })
    expect(() => prepareRoundChapters({ sandboxDir: nowhere.dir, worktree: nowhere.worktree, brief: nowhere.brief, backlog: fallback }))
      .toThrow(`this sandbox has no ${REQUIREMENTS_FILE} to read instead. Nothing was started.`)
  })

  it('5. any other answer stops the start by name', async () => {
    const f = aRound({ line: LINE, items: ['2'] })
    const answering = (status: number | null, body?: unknown, why?: string) => async () => ({ status, body, ...(why === undefined ? {} : { why }) })
    const item = (number: string) => ({ id: `made-up-${number}`, data: { line: LINE, number, why: 'Made-up.', state: 'todo' } })
    for (const [request, says] of [
      [answering(500, { error: 'Made-up failure.' }), `the office refused the backlog of line ${LINE} (500): Made-up failure.`],
      [answering(404, { error: 'Made-up: no such line here.' }), `the office refused the backlog of line ${LINE} (404): Made-up: no such line here.`],
      [answering(null, undefined, 'connect ECONNREFUSED 127.0.0.1:9'), `nothing answered for the backlog of line ${LINE}: connect ECONNREFUSED 127.0.0.1:9`],
      [answering(200, { line: LINE, items: 'not a list', noneFiled: null }), `the office's answer for the backlog of line ${LINE} could not be read`],
      [answering(200, { line: 'another-made-up-line', items: [item('2')], noneFiled: null }), `the office's answer for the backlog of line ${LINE} could not be read`],
      [answering(200, { line: LINE, items: [{ id: 'made-up-x', data: { line: LINE, number: '2', why: 'Made-up.', state: 'later' } }], noneFiled: null }), `the office's answer for the backlog of line ${LINE} could not be read`],
      [answering(200, { line: LINE, items: [item('2'), item('2')], noneFiled: null }), `the office's backlog of line ${LINE} holds item 2 twice`],
      [answering(200, { line: LINE, items: [item('1')], noneFiled: null }), `the declaration names item 2, which the office's backlog of line ${LINE} does not hold`],
    ] as const) {
      await expect(readTheRoundsBacklog({ brief: f.brief, request })).rejects.toThrow(says)
      await expect(readTheRoundsBacklog({ brief: f.brief, request })).rejects.toThrow('Nothing was started.')
    }
  })

  it('6. a declaration with items and no line, a blank line or items that are not numbers is refused, and so is a reading that does not match', async () => {
    for (const declaration of [{ items: ['2'] }, { line: '' }, { line: ' made-up ' }, { line: LINE, items: '2' }, { line: LINE, items: [2] }, { line: LINE, items: ['2', '2'] }, { line: LINE, items: [''] }]) {
      const f = aRound(declaration)
      const asked: string[] = []
      await expect(readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice(asked) }), JSON.stringify(declaration)).rejects.toThrow('invalid declaration')
      expect(asked).toEqual([])
      expect(() => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })).toThrow('invalid declaration')
    }
    const named = aRound({ line: LINE, items: ['2'] })
    const reading = await readTheRoundsBacklog({ brief: named.brief, request: askTheMadeUpOffice() })
    expect(() => prepareRoundChapters({ sandboxDir: named.dir, worktree: named.worktree, brief: named.brief }))
      .toThrow(`the declaration names line ${LINE}, but the round start did not read its backlog`)
    const unnamed = aRound(null)
    expect(() => prepareRoundChapters({ sandboxDir: unnamed.dir, worktree: unnamed.worktree, brief: unnamed.brief, backlog: reading }))
      .toThrow('a backlog reading was given, but the declaration names no line')
    const otherItems = aRound({ line: LINE, items: ['4'] })
    expect(() => prepareRoundChapters({ sandboxDir: otherItems.dir, worktree: otherItems.worktree, brief: otherItems.brief, backlog: reading }))
      .toThrow('the backlog reading is not the one the declaration names')
  })

  it('7. the saved manifest with its backlog is acknowledged by the check door, and its brief is the one delivered', async () => {
    const starter = 'backlog-round-starter'
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: starter, name: starter, role: 'supervisor' } })
    expect(made.statusCode, made.body).toBe(201)
    const starterHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter, 'x-mole-office-key': String(made.json().whatToGiveIt?.key ?? '') }
    const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starterHeaders, payload: { handle: 'backlog-round-worker', name: 'Made-up worker', role: 'worker', workArea: ['src'] } })
    expect(worker.statusCode, worker.body).toBe(201)

    const f = aRound({ line: LINE, items: ['2'] })
    const backlog = await readTheRoundsBacklog({ brief: f.brief, request: askTheMadeUpOffice() })
    const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, backlog })
    const run = t.api.createRecord({ kind: 'session', title: 'Made-up round with a backlog', workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running', servingAgent: 'backlog-round-worker' } })
    const notice = await saveRoundChapters({ id: run.id, manifest, request: async (method, path, body) => {
      const response = await app.inject({ method: method as 'GET' | 'PATCH', url: path, headers: starterHeaders, ...(body === undefined ? {} : { payload: body }) })
      return { status: response.statusCode, body: response.json() }
    } })
    expect(notice).toBeNull()
    const stored = savedRoundChapters(t.api.getRecord(run.id)!.data)!
    expect(stored.backlog).toEqual(manifest.backlog)
    expect(deliveredRoundBrief(stored)).toBe(readFileSync(brief, 'utf8'))
  })
})

