// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THAT MAKES THE TEXT, THE SCREEN THAT STOPS IT, AND THE PAGE OF PLAIN TEXT. F16 points 1
 * and 6.
 *
 * ---------------------------------------------------------------------------------------
 * WORDING THROUGH THE COMPOSER, REFUSALS AND RECORDING THROUGH THE DOORS
 * ---------------------------------------------------------------------------------------
 *
 *   - the text is the bundle's own text and then the suits line and the four sections, each section
 *     under its heading;
 *   - the files of the modules the package names print under their own heading, each module named
 *     beside its stated files, with the one sentence about whose files they are;
 *   - the three answers about the files are kept distinct: no module named; modules named and none
 *     has any stated code; modules named and some have code and some do not, the ones that do not
 *     named;
 *   - the line naming the kind of outside work the package suits prints near the top;
 *   - the acceptance criteria print in full with the file, the criterion and the commit;
 *   - the office regulations print by chapter and rule name only, and no rule body appears;
 *   - a made-up key is refused: nothing is recorded and the finding never carries the value;
 *   - an absolute path under the running machine's home directory is refused;
 *   - an email address stops nothing and is carried as a look-before-you-paste finding;
 *   - the line saying other people's names were not checked is present on a clean screen;
 *   - a successful export records the entry on the bundle, with the version each record held;
 *   - the page of plain text serves the same text and records nothing;
 *   - the page refuses where the export refuses.
 *
 * EVERY TEST IS PROVED BY MUTATION, after a control run. See the report for each mutation and the
 * sha256 the file was restored to.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HOME DIRECTORY COMES FROM `node:os` HERE
 * ---------------------------------------------------------------------------------------
 *
 * The screen's default home directory is `os.homedir()`, read once in lib/adapters. This file uses
 * the same call so the path it writes is genuinely under the home directory the screen will judge
 * it by, on whichever machine runs the suite. Under `src/` that import may be in one
 * file only, and a test is outside `src/`, so it may read it here.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aMadeUpModuleForPackage, injectedPackageFixture, updateMadeUpModuleForPackage } from './module-package-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'panelx'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

/** A chapter record, so the regulations section has names to print without the real corpus. */
const RULE_NAME = 'Name the door before you open it'
const RULE_BODY = 'A RULE BODY THAT MUST NOT TRAVEL INTO A CHAT WINDOW.'
const CHAPTER_TITLE = 'The live server and database'

const ACCEPTANCE = 'The text carries the bundle and the three sections, and a key stops it.'
const SOURCE = { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16 points 1 and 6', commit: '2d7f256e' }
const CLEAN_OUTSIDE = 'Build the module on its own and return a zip holding the source.'

/** A plainly made-up value with the exact shape of a key this office issues: 64 hex characters. */
const MADE_UP_KEY = '0123456789abcdef'.repeat(4)

let t: TestDb
let app: FastifyInstance
let commonPackage: { taskId: string; bundleId: string }
let composing: typeof import('../src/server/lib/outside.ts')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
  composing = await import('../src/server/lib/outside.ts')
  await seedChapter()
  commonPackage = await aPackagedTask(CLEAN_OUTSIDE)
  t.client.sqlite.exec('SAVEPOINT packaged_task')
})

beforeEach(() => { t.client.sqlite.exec('ROLLBACK TO packaged_task') })

afterAll(async () => {
  await app.close()
  t.close()
})

/** File one record through the real route. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * File the one chapter this suite's regulations section reads. It passes the one chapter check
 * (src/shared/chapter-check.ts): a label, a title, a conclusion, and a rule id such as r-1. The office
 * reads a stored chapter only when it passes; one that does not is answered with the shipped chapter
 * and a sentence naming it, so the names this suite looks for would not be the ones in use.
 */
async function seedChapter(): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'module',
      title: CHAPTER_TITLE,
      summary: 'A made-up conclusion about the live server.',
      data: {
        context: 'This chapter explains the live server.',
        parts: [],
        extra: { chapter: 1 },
        summaryBlocks: [{ id: 'r-1', type: 'text', heading: RULE_NAME, text: RULE_BODY }],
        source: 'design/rules/CODE.md',
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const id = (res.json() as { record: { id: string } }).record.id
  const revision = (await app.inject({ url: `/api/records/${id}/revisions`, headers: HUMAN })).json() as { revisions: { seq: number; contentHash: string }[] }
  const latest = revision.revisions[0]!
  const labelled = await app.inject({
    method: 'POST',
    url: `/api/records/${id}/short-forms`,
    headers: HUMAN,
    payload: { madeFrom: { seq: latest.seq, contentHash: latest.contentHash }, forms: { label: 'Made-up server' } },
  })
  expect(labelled.statusCode, labelled.body).toBe(200)
}

/** The chapter is part of the restored fixture. */
async function fileAChapter(): Promise<void> {}

/** A task, packaged with the words this test wants. Returns the task id and the bundle id. */
async function aPackagedTask(
  forTheOutside: string,
  over: Record<string, unknown> = {},
): Promise<{ taskId: string; bundleId: string }> {
  if (commonPackage !== undefined && forTheOutside === CLEAN_OUTSIDE && Object.keys(over).length === 0) return commonPackage
  const taskId = await file('task', 'Fit the wrist camera')
  const fixture = injectedPackageFixture(app, WORKSPACE)
  const moduleIds = Array.isArray(over['moduleIds'])
    ? over['moduleIds'] as string[]
    : [await aMadeUpModuleForPackage(fixture)]
  for (const id of moduleIds) await updateMadeUpModuleForPackage(fixture, id)
  const res = await app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers: HUMAN,
    payload: {
      forTheOutside,
      suits: 'own_module',
      acceptance: ACCEPTANCE,
      acceptanceSource: SOURCE,
      ...over,
      moduleIds,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return { taskId, bundleId: (res.json() as { bundle: { id: string } }).bundle.id }
}

/** The export door, exactly as a press would call it. */
async function exportOutside(taskId: string) {
  return app.inject({ method: 'POST', url: `/api/delegation/${taskId}/export-outside`, headers: HUMAN })
}

/**
 * File a module and state one file for it through the implementation doors of a scratch repository.
 *
 * THE FILES ARE STATED AND THE REPOSITORY IS MADE UP FOR THE TEST. `statedFor` reads rows this test
 * writes, so the test proves the export reads that map rather than depending on the real panelx
 * corpus, in which nobody has stated code for anything.
 */
async function aModuleWithStatedCode(title: string, pattern: string): Promise<string> {
  const moduleId = await file('module', title)
  const root = mkdtempSync(join(os.tmpdir(), 'f16-outside-repo-'))
  try {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/implementation/repositories',
      headers: HUMAN,
      payload: { name: 'f16-outside-scratch', root },
    })
    expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
    const repositoryId = (registered.json() as { repository: { id: string } }).repository.id
    const declared = await app.inject({
      method: 'POST',
      url: '/api/implementation',
      headers: HUMAN,
      payload: { recordId: moduleId, repositoryId, pattern, relation: 'implements' },
    })
    expect(declared.statusCode, declared.body.slice(0, 300)).toBe(201)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  return moduleId
}

/** The page of plain text, exactly as a link would open it. */
async function openTheTextPage(taskId: string) {
  return app.inject({ method: 'GET', url: `/api/delegation/as-text?workspace=${WORKSPACE}&task=${taskId}` })
}

/** One bundle's stored `exports` list. */
async function storedExports(bundleId: string): Promise<Record<string, unknown>[]> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${bundleId}`, headers: HUMAN })
  const data = (read.json() as { record: { data: Record<string, unknown> } }).record.data
  const list = data['exports']
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

/** The refusal sentence, whichever field the error envelope put it in. */
function said(body: string): string {
  const parsed = JSON.parse(body) as { error?: string }
  return String(parsed.error ?? body)
}

/** A body with the `Made:` line taken off, so two readings a second apart can still be compared. */
function withoutTheMadeLine(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('Made: '))
    .join('\n')
}

// ============================================================================ the text and its parts

describe('the text the door makes', () => {
  it('is the bundle text and then the four sections, each under its own heading', async () => {
    await fileAChapter()
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(200)
    const text = (res.json() as { text: string }).text

    const bundleAt = text.indexOf('CONTEXT FROM MOLE OFFICE')
    const filesAt = text.indexOf('THE FILES OF THE MODULES THIS WORK IS IN')
    const acceptanceAt = text.indexOf('THE ACCEPTANCE CRITERIA, IN FULL')
    const regulationsAt = text.indexOf('THE OFFICE REGULATIONS, BY NAME ONLY')
    const forTheOutsideAt = text.indexOf('WRITTEN FOR THE OUTSIDE')
    expect(bundleAt, 'the bundle text is not in what leaves').toBeGreaterThanOrEqual(0)
    expect(filesAt, 'the files section has no heading').toBeGreaterThan(bundleAt)
    expect(acceptanceAt, 'the acceptance section has no heading').toBeGreaterThan(filesAt)
    expect(regulationsAt, 'the regulations section has no heading').toBeGreaterThan(acceptanceAt)
    expect(forTheOutsideAt, 'the section written for the outside has no heading').toBeGreaterThan(regulationsAt)
  })

  it('prints the acceptance criteria in full with the file, the criterion and the commit', async () => {
    await fileAChapter()
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE)
    const text = (await (await composeOutside(taskId)).json() as { text: string }).text
    expect(text).toContain(ACCEPTANCE)
    expect(text, 'the file the criteria were copied from is not printed').toContain(SOURCE.file)
    expect(text, 'the criterion is not printed').toContain(SOURCE.criterion)
    expect(text, 'the commit is not printed').toContain(SOURCE.commit)
  })

  it('prints the regulations as chapter and rule names only, and no rule body', async () => {
    await fileAChapter()
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE)
    const text = (await (await composeOutside(taskId)).json() as { text: string }).text
    expect(text, 'the chapter title is not printed').toContain(CHAPTER_TITLE)
    expect(text, 'the rule name is not printed').toContain(RULE_NAME)
    expect(text, 'a rule body travelled into the text').not.toContain(RULE_BODY)
  })
})

// ============================================================================ the files of the modules

describe('the files of the modules the package names', () => {
  it('carries a fourth section that names each module beside its stated files', async () => {
    await fileAChapter()
    const moduleId = await aModuleWithStatedCode('The wrist camera module', 'src/camera.ts')
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE, { moduleIds: [moduleId] })
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(200)
    const text = (res.json() as { text: string }).text

    expect(text, 'the files section has no heading').toContain('THE FILES OF THE MODULES THIS WORK IS IN')
    expect(text, 'the module is not named beside its files').toContain('The wrist camera module')
    expect(text, 'the module id is not named beside its files').toContain(moduleId)
    expect(text, 'the file stated for the module is not carried').toContain('src/camera.ts')
    expect(text, 'the relation the file was stated under is not carried').toContain('implements')
  })

  it('prints the one sentence about whose files these are, from the one place it is written', async () => {
    await fileAChapter()
    const moduleId = await aModuleWithStatedCode('The wrist camera module', 'src/camera.ts')
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE, { moduleIds: [moduleId] })
    const text = (await (await composeOutside(taskId)).json() as { text: string }).text

    // DYNAMIC, so the test reads the one shared sentence rather than a second copy of it.
    const { thePackageFilesSentence } = await import('../src/shared/delegation.ts')
    const expected = thePackageFilesSentence({ namedModuleCount: 1, modulesWithNoStatedCode: [] })
    expect(text, 'the one sentence about whose files these are is not printed').toContain(expected)
    expect(expected, 'the shared sentence no longer says whose files these are').toContain(
      'the files of the modules this work is in',
    )

    // AND IT IS THE SENTENCE THE COLUMN ROW CARRIES, so the text and the column cannot drift apart.
    const column = await app.inject({ method: 'GET', url: '/api/delegation', headers: HUMAN })
    const row = (column.json() as { tasks: { recordId: string; filesSays: string }[] }).tasks.find(
      (one) => one.recordId === taskId,
    )
    expect(row?.filesSays, 'the text and the column do not carry the same sentence').toBe(expected)
  })

  it('keeps the three answers distinct in the text', async () => {
    await fileAChapter()

    // ---- 1. NO MODULE WAS NAMED AT ALL.
    const { taskId: noneTask } = await aPackagedTask(CLEAN_OUTSIDE)
    // A legacy stored package can still have no module even though the package door now requires one.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.package.moduleIds') WHERE id = ?").run(noneTask)
    const none = (await (await exportOutside(noneTask)).json() as { text: string }).text
    expect(none, 'the no-module answer is not in the text').toContain(
      'The package names no module, so it carries no file list',
    )
    expect(none, 'the no-module text used the all-silent answer').not.toContain('none of them has any stated code')

    // ---- 2. MODULES WERE NAMED AND NONE OF THEM HAS ANY STATED CODE.
    const silentModule = await file('module', 'The silent module')
    const { taskId: silentTask } = await aPackagedTask(CLEAN_OUTSIDE, { moduleIds: [silentModule] })
    const allSilent = (await (await exportOutside(silentTask)).json() as { text: string }).text
    expect(allSilent, 'the all-silent answer is not in the text').toContain('none of them has any stated code')
    expect(allSilent, 'the module with no stated code is not named').toContain('The silent module')

    // ---- 3. MODULES WERE NAMED AND SOME HAVE CODE AND SOME DO NOT.
    const withCode = await aModuleWithStatedCode('The stated module', 'src/stated.ts')
    const withoutCode = await file('module', 'The unspoken module')
    const { taskId: someTask } = await aPackagedTask(CLEAN_OUTSIDE, { moduleIds: [withCode, withoutCode] })
    const some = (await (await exportOutside(someTask)).json() as { text: string }).text
    expect(some, 'the some-have-code answer is not in the text').toContain('the files of the modules this work is in')
    expect(some, 'the module with no stated code is not named in the mixed case').toContain(
      'The module(s) The unspoken module name no stated code',
    )
    expect(some, 'the module with code is not carried in the mixed case').toContain('src/stated.ts')
    expect(some, 'the mixed case used the all-silent answer').not.toContain('none of them has any stated code')

    // THE THREE READINGS ARE NOT ONE. A reader can tell which answer they got.
    expect(new Set([none, allSilent, some]).size, 'two of the three answers read the same').toBe(3)
  })

  it('names the kind of outside work the package suits, in a line near the top', async () => {
    await fileAChapter()
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE)
    const text = (await (await composeOutside(taskId)).json() as { text: string }).text

    const { packageSuitWord } = await import('../src/shared/words.ts')
    const line = `This package suits: ${packageSuitWord('own_module').text}.`
    expect(text, 'the suits line is missing from the text').toContain(line)
    const bundleAt = text.indexOf('CONTEXT FROM MOLE OFFICE')
    const suitsAt = text.indexOf(line)
    const filesAt = text.indexOf('THE FILES OF THE MODULES THIS WORK IS IN')
    expect(suitsAt, 'the suits line is not in the appended part').toBeGreaterThan(bundleAt)
    expect(suitsAt, 'the suits line is not near the top of the appended sections').toBeLessThan(filesAt)
  })
})

/** Direct composition over the restored package; the screen and export wiring have separate door cases. */
async function composeOutside(taskId: string) {
  const { theMessageReader } = await import('../src/server/lib/messages.ts')
  const made = await composing.theTextForOutside(taskId, WORKSPACE, theMessageReader({ type: 'human', id: THE_PERSON }))
  return { body: made.text, json: () => made }
}

// ============================================================================ what the screen stops

describe('nothing leaves that the screen refuses', () => {
  it('refuses a made-up key, records nothing, and never carries the value', async () => {
    await fileAChapter()
    const { taskId, bundleId } = await aPackagedTask(`${CLEAN_OUTSIDE} use ${MADE_UP_KEY} as the key`)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(409)
    const refusal = said(res.body)
    expect(refusal, 'the refusal does not name the check that stopped it').toContain('a key')
    expect(refusal, 'the refusal does not say nothing was recorded').toContain('nothing was recorded')
    expect(refusal, 'the finding carried the made-up key').not.toContain(MADE_UP_KEY)
    expect(await storedExports(bundleId), 'a refused export was recorded anyway').toEqual([])
  })

  it('refuses an absolute path under the home directory, and says which path', async () => {
    await fileAChapter()
    const underHome = `${os.homedir()}/notes-that-must-not-leave.txt`
    const { taskId } = await aPackagedTask(`${CLEAN_OUTSIDE} see ${underHome} for the plan`)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(409)
    const refusal = said(res.body)
    expect(refusal).toContain('a path under the home directory')
    expect(refusal, 'the refusal does not name the path it found').toContain(underHome)
  })

  it('stops nothing for an email address and carries it as look-before-you-paste', async () => {
    await fileAChapter()
    const email = 'outside.person@example-not-real.test'
    const { taskId } = await aPackagedTask(`${CLEAN_OUTSIDE} write to ${email} when done`)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(200)
    const screening = (res.json() as { screening: { findings: { check: string; severity: string }[] } }).screening
    const found = screening.findings.filter((one) => one.check === 'email_address')
    expect(found.length, 'the email address was not reported').toBeGreaterThan(0)
    expect(found.every((one) => one.severity === 'look_before_you_paste')).toBe(true)
  })

  it('carries the line that other people’s names were not checked, even when nothing was found', async () => {
    await fileAChapter()
    const { taskId } = await aPackagedTask(CLEAN_OUTSIDE)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(200)
    const screening = (res.json() as {
      screening: { findings: { check: string; says: string }[]; summary: string; ranChecks: string[] }
    }).screening
    const names = screening.findings.filter((one) => one.check === 'other_peoples_names')
    expect(names, 'the names-not-checked line is missing').toHaveLength(1)
    expect(names[0]?.says, 'the line does not say why nobody looked').toContain('no roll')
    expect(screening.summary, 'a clean screen did not say it found nothing').toContain('found nothing')
    expect(screening.ranChecks).toContain('key_in_text')
    expect(screening.ranChecks).toContain('home_directory_path')
  })
})

// ============================================================================ what a successful export records

describe('a successful export records what left', () => {
  it('writes one entry on the bundle, with the version each record held and the hash of the text', async () => {
    await fileAChapter()
    const { taskId, bundleId } = await aPackagedTask(CLEAN_OUTSIDE)
    const res = await exportOutside(taskId)
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as {
      export: { n: number; textHash: string; characters: number; bytes: number; carried: { recordId: string; contentHash: string }[] }
      text: string
    }
    // DYNAMIC, because lib/bundle reaches the database client and the throwaway database has to be
    // in place before that module loads. See tests/helpers.ts.
    const { textHash } = await import('../src/server/lib/bundle.ts')
    expect(body.export.n).toBe(1)
    expect(body.export.textHash, 'the recorded hash is not of the text that left').toBe(textHash(body.text))
    expect(body.export.characters).toBe(body.text.length)

    const stored = await storedExports(bundleId)
    expect(stored, 'the entry was not written to the bundle').toHaveLength(1)
    expect(stored[0]?.['textHash']).toBe(textHash(body.text))
    const carried = stored[0]?.['carried'] as { recordId: string; contentHash: string }[]
    const theTask = carried.find((one) => one.recordId === taskId)
    expect(theTask, 'the task is not among the records the entry says left').toBeDefined()
    expect(theTask?.contentHash, 'the task was recorded with no version').not.toBe('')
  })
})

// ============================================================================ the page of plain text

describe('the page of plain text', () => {
  it('answers the same text as the export and records nothing', async () => {
    await fileAChapter()
    const { taskId, bundleId } = await aPackagedTask(CLEAN_OUTSIDE)
    const exported = await exportOutside(taskId)
    expect(exported.statusCode, exported.body).toBe(200)
    const exportText = (exported.json() as { text: string }).text
    const recorded = (await storedExports(bundleId)).length

    for (let i = 0; i < 2; i += 1) {
      const page = await openTheTextPage(taskId)
      expect(page.statusCode, page.body).toBe(200)
      expect(page.headers['content-type'] ?? '', 'the page is not plain text').toContain('text/plain')
      expect(withoutTheMadeLine(page.body), 'the page and the export are not the same text').toBe(
        withoutTheMadeLine(exportText),
      )
    }
    expect(await storedExports(bundleId), 'opening the page recorded an export').toHaveLength(recorded)
  })

  it('refuses where the export refuses, and serves no text', async () => {
    await fileAChapter()
    const { taskId, bundleId } = await aPackagedTask(`${CLEAN_OUTSIDE} use ${MADE_UP_KEY} as the key`)
    const page = await openTheTextPage(taskId)
    expect(page.statusCode, page.body).toBe(409)
    expect(page.headers['content-type'] ?? '', 'a refusal is not a page of text').toContain('text/plain')
    expect(page.body, 'the refusal does not name the check').toContain('a key')
    expect(page.body, 'the page served text the export refused').not.toContain('CONTEXT FROM MOLE OFFICE')
    expect(page.body, 'the page carried the made-up key').not.toContain(MADE_UP_KEY)
    expect(await storedExports(bundleId), 'the refusing page recorded an export').toEqual([])
  })
})
