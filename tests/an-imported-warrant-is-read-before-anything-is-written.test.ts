// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN IMPORTED WARRANT IS READ BY readWarrant, AND ONE THAT CANNOT BE READ REFUSES THE WHOLE ARCHIVE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The importer checked `changes.warrant` and `revisions.warrant` only as "text or null". So an
 * archive could carry `{"saidBy":"somebody-else","words":""}` on a changes row, the import took it,
 * and every surface drew it as the person's words. Problem `w1TppEkU6YIF` has the reproduction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The refusals: a warrant readWarrant refuses, on a changes row or on a revisions row, and a warrant
 * text that is not JSON, each refuse the archive naming the region and the line, and the database is
 * left exactly as it was. A citation that is in neither the database nor the archive is refused.
 *
 * The acceptances beside them, because a check that refused everything would pass the first half:
 * an office holding every genuine shape of warrant, each made through the real door, exports and
 * imports into a fresh office, and every warrant reads back identical. The shapes are a promotion,
 * a settling link, a record created on the owner’s words, and a citation of a message and of a comment. In
 * the fresh office the cited message and comment are only in the archive, so the citation is found
 * there.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { AUTHORED_TABLES } from '../src/server/db/schema.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const PROJECT = 'default'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': PROJECT,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** The owner’s words as the owner said them. The shape every warrant test uses. */
const THE_OWNERS_WORDS = {
  saidBy: THE_PERSON,
  words: '这部分我按了，但是这部分需要加规则，如果有授权，秘书可以结',
  where: 'terminal',
  when: '2026-09-15 09:00',
} as const

const REGULATION_TITLE = 'The owner’s regulation: no agent designs office flow or architecture'

let t: TestDb
let app: BuiltServer
let lib: ImportLib
let root: string
/** Every non-null warrant the first office stored, by region and row id. */
let warrantsMade: string[]
/** The ids of the message and the comment the first office's warrants cite. */
let cited: { message: string; comment: string }

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: reply.body, body }
}

async function filed(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, payload)
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

/** A fork the owner reserved for themselves, filed by a registered worker. */
function aForkTheOwnerReserved(title: string): Promise<string> {
  return filed(asAgent('worker-one'), {
    kind: 'proposal',
    title,
    data: { question: 'Which of the two?', options: ['One', 'The other'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
  })
}

/** A problem the person was asked about, so closing it is a governance act. */
function askedOfTheOwner(symptom: string): Promise<string> {
  return filed(AS_THE_PERSON, { kind: 'problem', title: `Whose move · ${symptom}`, data: { whose_move: 'person', symptom } })
}

/** Every non-null warrant in both ledgers, as `<region> <row id> <text>`, sorted. */
function everyWarrant(): string[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT 'changes' AS region, id, warrant FROM changes WHERE warrant IS NOT NULL UNION ALL " +
          "SELECT 'revisions' AS region, id, warrant FROM revisions WHERE warrant IS NOT NULL",
      )
      .all() as { region: string; id: string; warrant: string }[]
  )
    .map((row) => `${row.region} ${row.id} ${row.warrant}`)
    .sort()
}

/** What the database holds right now, every authored table, so a refusal can be proved to write nothing. */
function snapshot(): string {
  return JSON.stringify(AUTHORED_TABLES.map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table}`).all()))
}

/**
 * THE FIRST OFFICE: every genuine shape of warrant, each made through the door that makes it.
 * Exported to `root`, then closed, and a fresh second office is opened for the import.
 */
beforeEach(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await ask('POST', '/api/agents/started', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-one', name: 'Worker One', role: 'worker', workArea: ['src'] })

  // 1. A PROMOTION. `for` names the fork; the change and revision rows are on the new decision.
  const promoted = await aForkTheOwnerReserved('A fork settled by promotion')
  const promotion = await ask('POST', `/api/records/${promoted}/promote`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    title: 'The answer the owner gave in the terminal',
    data: { because: 'They said so, in their own words.' },
    warrant: { ...THE_OWNERS_WORDS, for: [promoted] },
  })
  expect(promotion.status, promotion.said).toBe(201)

  // 2. A SETTLING LINK. `for` names the fork; the change row is on the decision the link leaves.
  const linkedFork = await aForkTheOwnerReserved('A fork settled by a link')
  const decision = await filed(AS_THE_PERSON, {
    kind: 'decision',
    title: 'The answer, written down',
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'The owner answered in the terminal.' },
  })
  const link = await ask('POST', '/api/links', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    fromId: decision,
    toId: linkedFork,
    type: 'derived_from',
    warrant: { ...THE_OWNERS_WORDS, for: [linkedFork] },
  })
  expect(link.status, link.said).toBe(201)

  // 3. A RECORD CREATED ON THE OWNER'S WORDS. There is no id yet at the door, so `for` holds the title.
  await filed(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    kind: 'regulation',
    title: REGULATION_TITLE,
    data: { sentence: THE_OWNERS_WORDS.words, binds: 'person', since: '2026-09-15' },
    warrant: { ...THE_OWNERS_WORDS, for: [REGULATION_TITLE] },
  })

  // 4. A WARRANT CITING A MESSAGE this office holds.
  const message = await filed(AS_THE_PERSON, {
    kind: 'message',
    title: 'A message the owner wrote',
    data: { body: THE_OWNERS_WORDS.words, to: [{ kind: 'person', id: THE_PERSON }] },
  })
  const closedOnAMessage = await askedOfTheOwner('the wrist camera drops a frame')
  const onAMessage = await ask('PATCH', `/api/records/${closedOnAMessage}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    dataPatch: { state: 'accepted' },
    warrant: { ...THE_OWNERS_WORDS, where: `message:${message}`, for: [closedOnAMessage] },
  })
  expect(onAMessage.status, onAMessage.said).toBe(200)

  // 5. A WARRANT CITING A COMMENT this office holds. A comment is filed as an `annotation`.
  const closedOnAComment = await askedOfTheOwner('the belt slips under load')
  const comment = await filed(AS_THE_PERSON, {
    kind: 'annotation',
    title: 'A comment the owner left',
    data: { body: '这个我看过了，可以close', context: { target: { kind: 'record', recordId: closedOnAComment, workspaceId: PROJECT } } },
  })
  const onAComment = await ask('PATCH', `/api/records/${closedOnAComment}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    dataPatch: { state: 'accepted' },
    warrant: { ...THE_OWNERS_WORDS, where: `comment:${comment}`, for: [closedOnAComment] },
  })
  expect(onAComment.status, onAComment.said).toBe(200)

  cited = { message, comment }
  warrantsMade = everyWarrant()

  root = mkdtempSync(join(tmpdir(), 'mole-office-imported-warrants-'))
  const exportLib = (await import('../src/server/lib/export.ts')) as typeof import('../src/server/lib/export.ts')
  exportLib.writeExport(root)
  await app.app.close()
  t.close()

  // THE SECOND OFFICE, fresh, which the archive is imported into.
  t = await freshDb()
  lib = (await import('../src/server/lib/import.ts')) as ImportLib
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  t.close()
})

// ============================================================================ finding a warrant in the archive

/** One `warrant:` line in the archive that is not null. */
interface ArchiveWarrant {
  /** The file, relative to the archive root, the way a refusal names it. */
  path: string
  region: string
  /** The 1-based line the importer names for this block: its opening fence, or 1 for front matter. */
  blockLine: number
  /** 0-based index of the `warrant:` line in the file. */
  lineIndex: number
  /** The stored warrant text. */
  text: string
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith('.md') ? [path] : []
  })
}

function archiveWarrants(): ArchiveWarrant[] {
  const out: ArchiveWarrant[] = []
  for (const file of filesUnder(root)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let region: string | null = null
    let blockLine = 0
    // FRONT MATTER, the way a revision file is written: `---`, then `region: "revisions"`, and the
    // importer names line 1 for it.
    let inFrontMatter = lines[0] === '---'
    lines.forEach((line, i) => {
      if (inFrontMatter && i > 0) {
        if (line === '---') {
          inFrontMatter = false
          region = null
          return
        }
        if (line.startsWith('region: ')) {
          region = JSON.parse(line.slice('region: '.length)) as string
          blockLine = 1
        }
      }
      const fence = /^```mole-office (\S+)$/.exec(line)
      if (fence !== null) {
        region = fence[1] ?? null
        blockLine = i + 1
        return
      }
      if (line.startsWith('```')) {
        region = null
        return
      }
      if (region !== null && line.startsWith('warrant: ') && line !== 'warrant: null') {
        out.push({ path: relative(root, file), region, blockLine, lineIndex: i, text: JSON.parse(line.slice('warrant: '.length)) as string })
      }
    })
  }
  return out
}

/** The first archive warrant in a region whose text passes a test. Fails when there is none. */
function oneIn(region: string, which: (text: string) => boolean = () => true): ArchiveWarrant {
  const found = archiveWarrants().find((one) => one.region === region && which(one.text))
  if (found === undefined) throw new Error(`the archive holds no ${region} warrant this test can edit`)
  return found
}

/** Write a different warrant text on one archive row, exactly where the export wrote the old one. */
function rewrite(one: ArchiveWarrant, text: string): void {
  const file = join(root, one.path)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines[one.lineIndex] = `warrant: ${JSON.stringify(text)}`
  writeFileSync(file, lines.join('\n'), 'utf8')
}

/** The lines of one block: from its opening line to the line that closes it. */
function blockLines(one: ArchiveWarrant): { lines: string[]; from: number; to: number } {
  const lines = readFileSync(join(root, one.path), 'utf8').split('\n')
  const from = one.blockLine - 1
  const closing = one.blockLine === 1 && lines[0] === '---' ? '---' : '```'
  const to = lines.findIndex((line, i) => i > from && line === closing)
  return { lines, from, to }
}

/** One field of the block this warrant is in, as the export wrote it. */
function fieldOf(one: ArchiveWarrant, key: string): unknown {
  const { lines, from, to } = blockLines(one)
  const line = lines.slice(from + 1, to).find((l) => l.startsWith(`${key}: `))
  if (line === undefined) throw new Error(`the block at ${one.path}:${one.blockLine} has no ${key}`)
  return JSON.parse(line.slice(key.length + 2)) as unknown
}

/** Change one field of the block this warrant is in. */
function setField(one: ArchiveWarrant, key: string, value: unknown): void {
  const { lines, from, to } = blockLines(one)
  const at = lines.findIndex((l, i) => i > from && i < to && l.startsWith(`${key}: `))
  if (at === -1) throw new Error(`the block at ${one.path}:${one.blockLine} has no ${key}`)
  lines[at] = `${key}: ${JSON.stringify(value)}`
  writeFileSync(join(root, one.path), lines.join('\n'), 'utf8')
}

/** Apply, and hand back the refusal. Fails the test if the import was accepted. */
function refusal(): InstanceType<ImportLib['ImportRefused']> {
  try {
    lib.applyImport(root)
  } catch (err) {
    if (err instanceof lib.ImportRefused) return err
    throw err
  }
  throw new Error('the import was accepted, and this test exists because it must not be')
}

/** The refusal about this row, found by the file and the line the refusal names. */
function refusalAbout(err: InstanceType<ImportLib['ImportRefused']>, one: ArchiveWarrant): string {
  const found = err.plan.refusals.find((r) => r.path === one.path && r.line === one.blockLine && r.problem.includes('warrant'))
  expect(found, `no refusal names ${one.path}:${one.blockLine}. The refusals were:\n${err.message}`).toBeDefined()
  return found?.problem ?? ''
}

const NOBODY_THE_OWNER_IS = JSON.stringify({ ...THE_OWNERS_WORDS, saidBy: 'somebody-else', words: '', for: ['anything'] })

// ============================================================================ (a) and (b): refused, and nothing written

describe('a warrant readWarrant would refuse refuses the whole archive', () => {
  it('refuses a changes row carrying words nobody said, names the region and the line, and writes nothing', () => {
    const one = oneIn('changes')
    rewrite(one, NOBODY_THE_OWNER_IS)
    const before = snapshot()
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain(`changes line ${one.blockLine}: the warrant on this row cannot be read.`)
    // readWarrant's own sentence, not a second one.
    expect(problem).toContain('`words` is empty')
    expect(problem).toContain('An archive is refused whole when one warrant in it cannot be read.')
    expect(snapshot(), 'the refused import changed the database').toBe(before)
  })

  it('refuses a revisions row the same way', () => {
    const one = oneIn('revisions')
    rewrite(one, JSON.stringify({ ...THE_OWNERS_WORDS, saidBy: 'somebody-else', for: ['anything'] }))
    const before = snapshot()
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain(`revisions line ${one.blockLine}: the warrant on this row cannot be read.`)
    expect(problem).toContain('"somebody-else", which is not somebody Mole Office can place')
    expect(snapshot(), 'the refused import changed the database').toBe(before)
  })

  it('refuses a warrant text that is not JSON', () => {
    const one = oneIn('changes')
    rewrite(one, 'the owner said yes {')
    const before = snapshot()
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain(`changes line ${one.blockLine}: the warrant on this row is not JSON`)
    expect(snapshot(), 'the refused import changed the database').toBe(before)
  })

  it('shows the same refusal in the dry run, which writes nothing either', () => {
    const one = oneIn('changes')
    rewrite(one, NOBODY_THE_OWNER_IS)
    const before = snapshot()
    const plan = lib.planImport(root)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.map((r) => `${r.path}:${r.line} ${r.problem}`).join('\n')).toContain(
      `${one.path}:${one.blockLine} changes line ${one.blockLine}: the warrant on this row cannot be read.`,
    )
    expect(snapshot()).toBe(before)
  })
})

// ============================================================================ (c) the round trip

describe('every genuine shape of warrant survives an export and an import', () => {
  it('imports into a fresh office, and every warrant reads back identical', () => {
    // FIVE ACTS, each on both ledgers where the door writes both, so there are more rows than acts.
    expect(new Set(warrantsMade.map((row) => row.split(' ').slice(2).join(' '))).size).toBe(5)
    expect(everyWarrant()).toEqual([])
    const report = lib.applyImport(root)
    expect(report.applied, report.refusals.map((r) => r.problem).join('\n')).toBe(true)
    expect(everyWarrant()).toEqual(warrantsMade)
  })
})

// ============================================================================ (d) where a citation is found

describe('a cited message or comment may be in the archive rather than the database', () => {
  it('imports a warrant citing a message and a comment that only the archive holds', () => {
    const held = t.client.sqlite.prepare('SELECT id FROM records WHERE id IN (?, ?)').all(cited.message, cited.comment)
    expect(held, 'the fresh office already holds the cited rows, so this proves nothing').toEqual([])
    expect(oneIn('changes', (text) => text.includes(`message:${cited.message}`))).toBeDefined()
    expect(oneIn('changes', (text) => text.includes(`comment:${cited.comment}`))).toBeDefined()
    const report = lib.applyImport(root)
    expect(report.applied, report.refusals.map((r) => r.problem).join('\n')).toBe(true)
  })

  it('refuses a warrant citing a message that is in neither', () => {
    const one = oneIn('changes', (text) => text.includes(`message:${cited.message}`))
    rewrite(one, one.text.replace(`message:${cited.message}`, 'message:NOSUCHIDxxxx'))
    const before = snapshot()
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain('"NOSUCHIDxxxx", which Mole Office does not hold')
    expect(snapshot()).toBe(before)
  })
})

// ============================================================================ (e) and (f): written before `for` existed

/**
 * `for` became part of a warrant at 2026-09-03 21:46:47 (commit b8ed13cfa309). The owner's live office
 * holds 32 changes rows and 20 revisions rows written earlier that evening whose warrant has no `for`.
 */
describe('a warrant with no `for` is accepted only on a row written before `for` existed', () => {
  /** A genuine changes row, rewritten to the four-key shape and dated at a given time. */
  function withoutFor(at: string): { one: ArchiveWarrant; text: string } {
    const one = oneIn('changes', (text) => (JSON.parse(text) as { where: string }).where === 'terminal')
    const { for: _covers, ...fourKeys } = JSON.parse(one.text) as Record<string, unknown>
    const text = JSON.stringify({ ...fourKeys, when: '2026-09-03 21:30' })
    rewrite(one, text)
    setField(one, 'at', at)
    return { one, text }
  }

  it('imports one written before, stored unchanged, and names the row and the count', () => {
    const { one, text } = withoutFor('2026-09-03 21:35:00')
    const id = String(fieldOf(one, 'id'))
    const report = lib.applyImport(root)
    expect(report.applied, report.refusals.map((r) => r.problem).join('\n')).toBe(true)
    const note = report.notes.find((n) => n.includes('carry no `for`'))
    expect(note, report.notes.join('\n')).toBeDefined()
    expect(note).toContain('1 warrant(s) carry no `for`, on rows written before 2026-09-03 21:46:47')
    expect(note).toContain(`changes ${id}`)
    const stored = t.client.sqlite.prepare('SELECT warrant FROM changes WHERE id = ?').get(id) as { warrant: string }
    expect(stored.warrant).toBe(text)
  })

  it('refuses the same warrant on a row written after, naming the row', () => {
    const { one } = withoutFor('2026-09-03 21:50:00')
    const before = snapshot()
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain(`changes line ${one.blockLine}: the warrant on this row cannot be read.`)
    expect(problem).toContain('A warrant with no `for` is accepted only on a row written before 2026-09-03 21:46:47')
    expect(problem).toContain('"2026-09-03 21:50:00"')
    expect(snapshot()).toBe(before)
  })

  it('still makes every other check on one written before', () => {
    const { one } = withoutFor('2026-09-03 21:35:00')
    rewrite(one, JSON.stringify({ saidBy: 'somebody-else', words: 'yes', where: 'terminal', when: '2026-09-03 21:30' }))
    const problem = refusalAbout(refusal(), one)
    expect(problem).toContain('"somebody-else", which is not somebody Mole Office can place')
  })
})
