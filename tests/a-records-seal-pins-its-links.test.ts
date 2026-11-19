// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORDS SEAL PINS ITS LINKS, AND ITS CHECK IS SHOWN THEM (round BM, item 2aq; problem SAiQqT0kMD_Z).
 *
 * A check of a records seal refused a run because "the report's about links to those four records are not in the
 * carried evidence: the sealed manifest's dependencies list is empty and the report record carries no link". The seal
 * pinned no link, and the check was handed none, while its prompt told it to "check the sealed record revisions,
 * dependencies and link evidence above". Now the seal pins every link with a sealed record at either end, each by its
 * id and the sha256 of its row, and marks the inferred ones. It copies no link's content: criterion C34 stands. The
 * check reads each pinned link from the links table, and its prompt shows it beside the pinned revisions.
 *
 * WHAT IS REAL. A fresh test database, the real finish door and the real check doors. Every record and link is
 * synthetic and labelled so. The row hash is worked out here from the fifteen columns, named in their order, and not
 * through the office's own reader.
 *
 * THE VERDICT DOOR READS NO LINK A VERDICT CITES: a verdict cites records, chapters and invariants, and the seal it read.
 * So no case here asks it about one. Each case that says nothing is refused takes the check's reading, its assembly and
 * its release through their doors.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, each after a control run:
 *   - the seal pins no link: the first, second, third and seventh cases;
 *   - the reading drops the pinned links: the first five cases;
 *   - the prompt door takes no file of links from the check's tool: the first case;
 *   - a pinned link the office no longer holds is refused: the fourth case;
 *   - a pinned link whose row changed is refused: the fifth case;
 *   - an old seal is said to have "no links": the sixth case;
 *   - migration 0154's rewrite takes a seal's list of links for the copies it dropped: the seventh case.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aRepository, aSealedRun, asAgent, THE_INSPECTOR, theOfficesCheckers, WORKSPACE } from './a-seal-read-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let lib: typeof import('../src/server/lib/inspection.ts')
let scratch = ''

const WORKER = 'a-links-worker'
const actor = { type: 'agent' as const, id: WORKER }
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the sealed revisions and the links the seal pinned.', chaptersRead: [] }

/** THE COLUMNS A LINK'S ROW HASH IS MADE OF, IN THEIR ORDER, written out here so the test does not borrow the office's list. */
const THE_HASHED_COLUMNS = 'id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, gate, gate_up_to, gate_up_to_sort, carries'

/** The sentence a records check of an old seal is given, whole. */
const MADE_BEFORE_LINKS_WERE_PINNED =
  'None of the links of this submission is shown, because this seal was made before seals pinned links. ' +
  'A link this check asks for cannot be read from the seal: name it as unread rather than guess what it was.'
/** The rule the prompt gives about a link it was not handed. */
const AN_UNHANDED_LINK =
  'A link this check asks for must be among the links above. A link that is not among them was not sealed, so it is no evidence of this submission.'
const THE_LINKS_HEADING = '## The links of this submission'
/** The words before the path of the file the check's tool wrote the links into. */
const A_FILE_OF_LINKS = "The tool that started you wrote these links, as the office's reading gave them to it, into a file you can read:"

function rowHashOf(link: string): string {
  const row = t.client.sqlite.prepare(`SELECT ${THE_HASHED_COLUMNS} FROM links WHERE id = ?`).get(link) as Record<string, unknown> | undefined
  if (row === undefined) throw new Error(`the fixture holds no link ${link}`)
  return createHash('sha256').update(JSON.stringify(row)).digest('hex')
}

function rowOf(link: string): { created_at: string } {
  return t.client.sqlite.prepare('SELECT created_at FROM links WHERE id = ?').get(link) as { created_at: string }
}

/** Every link with this record at either end, read off the table. */
function theLinksOf(record: string): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM links WHERE from_id = ? OR to_id = ? ORDER BY id').all(record, record) as { id: string }[]).map((one) => one.id)
}

function aNote(title: string): string {
  return t.api.createRecord({ kind: 'note', title: `Synthetic: ${title}`, workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} }).id
}

function aReport(title: string): string {
  return t.api.createRecord({
    kind: 'report',
    title: `Synthetic: ${title}`,
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { for: 'nobody', date: '2026-10-30', blocks: [{ id: 'b-1', type: 'text', text: 'Synthetic report of a records run.' }] },
  }).id
}

function link(fromId: string, toId: string, type: 'about' | 'consumes' | 'relates_to', inferred = false): string {
  return t.api.createLink({ fromId, toId, type, inferred, actor }).id
}

/** A records run of the worker, filed through the door, that submits these records. Not finished. */
async function aRecordsRun(records: string[]): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WORKER),
    payload: { kind: 'session', title: 'Synthetic records run whose links are sealed', data: { state: 'running', servingAgent: WORKER, submission: { kind: 'records', records } } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function finish(run: string): Promise<void> {
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(WORKER), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
}

function thePromptOf(run: string): string {
  const reads = lib.whatTheInspectorReads(run, WORKSPACE)
  return lib.assembleTheInspectorsPrompt({ reads, changes: lib.changesInTheWorkArea([], []), workspaceId: WORKSPACE }).text
}

/** The check's GET reply, its assembly and its release, each through its door: none of them is refused. */
async function readAssembledAndReleased(run: string): Promise<Record<string, unknown>> {
  const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR) })
  expect(read.statusCode, read.body).toBe(200)
  const seal = seals.readRunSeal(run)!
  const reading = { sealId: seal.id, sealHash: seal.seal.hash, sealKind: 'records', worktree: `record manifest ${seal.id}`, ofItsOwn: true, says: 'Synthetic reading of a sealed record manifest.' }
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(THE_INSPECTOR), payload: { changes: [], base: null, read: reading } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const released = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR), payload: { ...A_RELEASE, read: reading } })
  expect(released.statusCode, released.body).toBe(201)
  return read.json() as Record<string, unknown>
}

/** The line the prompt gives a pinned link the office holds. */
function aHeldLine(id: string, type: string, from: string, to: string, inferred: boolean): string {
  return `- ${id}: ${type} from ${from} to ${to}, created ${rowOf(id).created_at} by ${WORKER} (agent), ${inferred ? 'inferred' : 'not inferred'}.`
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-records-seal-pins-its-links-'))
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  lib = await import('../src/server/lib/inspection.ts')
  await theOfficesCheckers(app)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: WORKER, name: 'A Synthetic Worker Of Records', role: 'worker', workArea: [] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('a records seal pins every link with a sealed record at either end', () => {
  it('pins each link by its id and row hash, marks the inferred one, and the reading, the prompt and the check doors show each', async () => {
    const report = aReport('a report linked about its run and two records')
    const first = aNote('the first record the report is about')
    const second = aNote('the second record the report is about')
    const run = await aRecordsRun([report])
    const aboutTheRun = link(report, run, 'about')
    const aboutTheFirst = link(report, first, 'about')
    const aboutTheSecond = link(report, second, 'about', true)
    await finish(run)
    expect(theLinksOf(report), 'the fixture made these three links of the report and no other').toEqual([aboutTheRun, aboutTheFirst, aboutTheSecond].sort())

    const pinned = [aboutTheRun, aboutTheFirst, aboutTheSecond].sort().map((id) => ({ id, hash: rowHashOf(id), inferred: id === aboutTheSecond }))
    const held = seals.readRunSeal(run)!.seal.records!
    expect(held.links, 'the seal pins each link by its id and the hash of its row, in the order of their ids').toEqual(pinned)
    expect(held.links!.map((one) => Object.keys(one).sort()), 'and copies nothing of a link but its id, its hash and its inferred mark').toEqual(pinned.map(() => ['hash', 'id', 'inferred']))

    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    const ends: Record<string, string> = { [aboutTheRun]: run, [aboutTheFirst]: first, [aboutTheSecond]: second }
    expect(reads.pinnedLinks).toEqual({
      links: pinned.map(({ id, inferred }) => ({
        id,
        standing: 'as sealed',
        inferredAtTheSeal: inferred,
        now: { type: 'about', from: report, to: ends[id], createdAt: rowOf(id).created_at, createdBy: WORKER, createdByType: 'agent', inferred },
      })),
      says:
        'The seal pinned 3 links, each by its id and the hash of its row: every link that had a sealed record at either end when the run finished. ' +
        'All 3 are counted present: 3 as sealed, 0 changed since the seal, 0 no longer held. Each held one is shown below as the office holds it now.',
    })

    const prompt = thePromptOf(run)
    const heading = prompt.indexOf(THE_LINKS_HEADING)
    expect(heading, 'the prompt has a part for the links').toBeGreaterThan(prompt.indexOf('Submitted content, sealed at finish.'))
    expect(heading, 'and it stands right after the pinned revisions').toBeLessThan(prompt.indexOf('YOU ARE AN INSPECTOR.'))
    for (const id of pinned.map((one) => one.id)) expect(prompt).toContain(aHeldLine(id, 'about', report, ends[id]!, id === aboutTheSecond))
    expect(prompt).toContain(reads.pinnedLinks!.says)
    expect(prompt).toContain(AN_UNHANDED_LINK)
    // THE SENTENCE IS TRUE NOW, and so it stays word for word.
    expect(prompt).toContain('This submission contains records only. Check the sealed record revisions, dependencies and link evidence above. No Git base is required.')
    expect(prompt, 'no file of links was named, so none is').not.toContain(A_FILE_OF_LINKS)

    // THE FILE THE CHECK'S TOOL WROTE THEM INTO, named to the prompt door, is named in the prompt.
    const file = '/inputs/records/links.pinned-by-the-seal.json'
    const asked = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent(THE_INSPECTOR), payload: { changes: [], base: null, pinnedLinksFile: file } })
    expect(asked.statusCode, asked.body).toBe(200)
    expect((asked.json() as { prompt: string }).prompt).toContain(`${A_FILE_OF_LINKS} ${file}.`)

    const reply = await readAssembledAndReleased(run)
    expect(reply['pinnedLinks'], 'the GET reply hands the tool the same reading').toEqual(reads.pinnedLinks)
  })

  /** UNDER THE READING THAT A SEALED RECORD IS ONE THE SEAL PINS, a dependency's own links are pinned as well. */
  it("pins the links of a record the seal pins as a dependency, and of no record it does not pin", async () => {
    const report = aReport('a report that consumes a record')
    const consumed = aNote('a record the report consumes, pinned as a dependency')
    const further = aNote('a record the consumed one relates to, not pinned')
    const run = await aRecordsRun([report])
    const consumes = link(report, consumed, 'consumes')
    const relates = link(consumed, further, 'relates_to')
    const unsealed = link(further, aNote('a record nothing sealed is linked to'), 'relates_to')
    await finish(run)
    const held = seals.readRunSeal(run)!.seal.records!
    expect(held.dependencies.map((one) => one.record)).toEqual([consumed])
    expect(held.links?.map((one) => one.id)).toEqual([consumes, relates].sort())
    expect(held.links?.map((one) => one.id)).not.toContain(unsealed)
  })

  it('pins no link that was never made or that was made after the seal, and the prompt says an unhanded link was not sealed', async () => {
    const report = aReport('a report linked again after its seal')
    const later = aNote('a record linked to the report after the seal')
    const run = await aRecordsRun([report])
    const aboutTheRun = link(report, run, 'about')
    await finish(run)
    const afterTheSeal = link(report, later, 'about')
    const neverMade = 'aLinkNvrMade'

    const held = seals.readRunSeal(run)!.seal.records!
    expect(held.links?.map((one) => one.id)).toEqual([aboutTheRun])
    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    expect(reads.pinnedLinks?.links?.map((one) => one.id)).toEqual([aboutTheRun])
    const prompt = thePromptOf(run)
    expect(prompt).toContain(AN_UNHANDED_LINK)
    expect(prompt).not.toContain(afterTheSeal)
    expect(prompt).not.toContain(neverMade)
    // NEITHER DOOR REFUSES FOR A LINK IT WAS NOT HANDED: the check reads on, and the prompt says what such a link is.
    await readAssembledAndReleased(run)
  })

  it('counts a pinned link the office no longer holds as present, says so, and refuses nothing for it', async () => {
    const report = aReport('a report one of whose links is deleted after the seal')
    const other = aNote('a record the deleted link was about')
    const run = await aRecordsRun([report])
    const aboutTheRun = link(report, run, 'about')
    const deleted = link(report, other, 'about')
    await finish(run)
    t.api.deleteLink(deleted, actor, WORKSPACE)

    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    expect(reads.pinnedLinks?.links?.find((one) => one.id === deleted)).toEqual({ id: deleted, standing: 'no longer held', inferredAtTheSeal: false, now: null })
    expect(reads.pinnedLinks?.says).toBe(
      'The seal pinned 2 links, each by its id and the hash of its row: every link that had a sealed record at either end when the run finished. ' +
        'All 2 are counted present: 1 as sealed, 0 changed since the seal, 1 no longer held. Each held one is shown below as the office holds it now.',
    )
    const prompt = thePromptOf(run)
    expect(prompt).toContain(`- ${deleted}: pinned at the seal; the office no longer holds it. The seal marked it not inferred.`)
    expect(prompt).toContain(aHeldLine(aboutTheRun, 'about', report, run, false))
    await readAssembledAndReleased(run)
  })

  it('shows a pinned link whose row changed as the office holds it now, says its hash is not the sealed one, and refuses nothing for it', async () => {
    const report = aReport('a report one of whose links is changed after the seal')
    const other = aNote('a record the changed link is between')
    const run = await aRecordsRun([report])
    link(report, run, 'about')
    const changed = link(report, other, 'about')
    await finish(run)
    // NOTHING IN THE PRODUCT CHANGES A LINK'S TYPE. The row is changed in the database so that its hash is not the sealed one.
    t.client.sqlite.prepare("UPDATE links SET type = 'relates_to' WHERE id = ?").run(changed)

    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    expect(reads.pinnedLinks?.links?.find((one) => one.id === changed)).toEqual({
      id: changed,
      standing: 'changed',
      inferredAtTheSeal: false,
      now: { type: 'relates_to', from: report, to: other, createdAt: rowOf(changed).created_at, createdBy: WORKER, createdByType: 'agent', inferred: false },
    })
    expect(reads.pinnedLinks?.says).toContain('All 2 are counted present: 1 as sealed, 1 changed since the seal, 0 no longer held.')
    const prompt = thePromptOf(run)
    expect(prompt).toContain(
      `${aHeldLine(changed, 'relates_to', report, other, false)} CHANGED: its row no longer hashes to what the seal recorded, so this is the link as the office holds it now, not as it was sealed.`,
    )
    await readAssembledAndReleased(run)
  })
})

describe('a seal made before seals pinned links', () => {
  it('still verifies, and its check says it was made before seals pinned links and never that there are no links', async () => {
    const report = aReport('a report sealed before seals pinned links')
    const run = await aRecordsRun([report])
    link(report, run, 'about')
    await finish(run)

    // THE SEAL IS PUT BACK INTO THE SHAPE A SEAL HAD BEFORE IT PINNED LINKS: its records part with no `links`, hashed
    // again as the finish door hashes it, so it verifies by its own hash.
    const { id: sealId } = seals.readRunSeal(run)!
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(sealId) as { data: string }).data) as { seal: Record<string, any> }
    const { hash: _was, ...content } = data.seal
    delete content['records']['links']
    data.seal = { ...content, hash: createHash('sha256').update(JSON.stringify(content)).digest('hex') }
    t.client.sqlite.exec('DROP TRIGGER IF EXISTS sealed_tip_no_update')
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), sealId)
    t.client.sqlite.exec(
      "CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' " +
        "BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END",
    )
    expect(seals.readRunSeal(run)!.seal.records, 'the seal verifies by its hash').not.toHaveProperty('links')

    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    expect(reads.pinnedLinks).toEqual({ links: null, says: MADE_BEFORE_LINKS_WERE_PINNED })
    const prompt = thePromptOf(run)
    expect(prompt).toContain(THE_LINKS_HEADING)
    expect(prompt).toContain(MADE_BEFORE_LINKS_WERE_PINNED)
    expect(prompt).toContain(
      'This submission contains records only. Check the sealed record revisions and dependencies above. ' +
        'This seal was made before seals pinned links, so it cannot show which links stood when the run finished. No Git base is required.',
    )
    expect(prompt).not.toContain('dependencies and link evidence above')
    expect(prompt.toLowerCase()).not.toContain('no links')
    expect(prompt).not.toContain('The seal pinned no link')
    const reply = await readAssembledAndReleased(run)
    expect(reply['pinnedLinks']).toEqual(reads.pinnedLinks)
  })
})

describe("migration 0154's rewrite of seals that copied rows", () => {
  it("leaves a seal's list of pinned links alone, because that list is no copy", async () => {
    const report = aReport('a report whose seal is read by the copy rewrite')
    const run = await aRecordsRun([report])
    link(report, run, 'about')
    await finish(run)
    const before = seals.readRunSeal(run)!.seal
    expect(before.records?.links, 'the seal pinned the link').toHaveLength(1)

    const { migrateSealCopiesToPointers } = await import('../src/server/db/seal-copies-to-pointers.ts')
    const report0154 = migrateSealCopiesToPointers(t.client.sqlite)
    expect(report0154.rewritten, report0154.says).toBe(0)
    const after = seals.readRunSeal(run)!.seal
    expect(after).toEqual(before)
    expect(after.reduced).toBeUndefined()
  })
})

describe('a git seal is read as before', () => {
  it('has no records part, and its reading, its GET reply and its prompt carry nothing about links', async () => {
    const { run } = await aSealedRun(app, aRepository(join(scratch, 'repository')), 'a-git-seal')
    const reads = lib.whatTheInspectorReads(run, WORKSPACE)
    expect(reads.submission?.seal.kind).toBe('git')
    expect(reads.submission?.seal.records).toBeNull()
    expect(Object.keys(reads.submission!.seal)).toEqual(['version', 'run', 'execution', 'attempt', 'area', 'sealedAt', 'kind', 'git', 'records', 'hash'])
    expect(Object.keys(reads)).not.toContain('pinnedLinks')
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR) })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(Object.keys(reply.json() as Record<string, unknown>)).not.toContain('pinnedLinks')
    const prompt = thePromptOf(run)
    expect(prompt).not.toContain(THE_LINKS_HEADING)
    expect(prompt).not.toContain(AN_UNHANDED_LINK)
    expect(prompt).not.toContain('seals pinned links')
    expect(prompt).not.toContain('The seal pinned')
  })
})
