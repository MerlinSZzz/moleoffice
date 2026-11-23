// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DECISION GOVERNS IS SAID FOR EVERY PAGE KIND, AND ITS EXAMPLE SAYS WHAT IS TRUE.
 *
 * 13r's four points on the first half of GV-2 (design cpKcvDtzkVwo), as the starter took them:
 *   1. the decision kind's example names the file it is about and says no page fits it, rather than claiming the
 *      whole project for a rule about one printer profile;
 *   2. the three lists of the kinds of page a decision may govern are built from PAGE_KINDS, each kind in its word:
 *      the governs field's description, the GovernedPlace record's description, and the refusal of a record that is
 *      not a page;
 *   3. the governs check's line and its nightly message name every kind of page or none, never three of them;
 *   4. a report whose stored nothingFits is not a list does not stop the governs check: it is counted and named as
 *      not read, and it is never dropped silently;
 *   5. every governs refusal's English words name all the kinds of page, or at most two;
 *   6. so do the notes of the governs doors, the line of their family, and the words the seal gives for a report
 *      linked about no page.
 *
 * One or two kinds is an example, and three or more but not all is a list written by hand. The Chinese words are not
 * read here: on Node every kind's word is English (readStoredWord in src/shared/i18n.ts), so a Chinese sentence cannot
 * be read for its kinds.
 *
 * Every word is read from the code: the page kinds from PAGE_KINDS through kindWord, the list from the one helper.
 */
import Fastify from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { theKindsAPartListNames, theKindsNamedIn } from './the-page-kinds-a-sentence-names.ts'

let t: TestDb
let governs: typeof import('../src/server/lib/governs.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let WS = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  governs = await import('../src/server/lib/governs.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 120_000)

beforeEach(() => {
  caseNumber += 1
  WS = `governs-words-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WS, title: 'Test project of the governs words' })
})

afterAll(() => {
  t.close()
})

const AS_THE_OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const

describe("the decision kind's example", () => {
  it('1: names the file and says which page is missing, and does not claim the whole project', async () => {
    const { decisionKind, DECISION_SHAPES } = await import('../src/shared/kinds/decision.ts')
    const { GOVERNS_FILES_FIELD, NOTHING_FITS_FIELD, WHOLE_PROJECT_KEY } = await import('../src/shared/what-a-record-names.ts')
    const { GOVERNS_FIELD } = await import('../src/shared/governs.ts')
    const example = decisionKind.example as Record<string, unknown>
    const shape = DECISION_SHAPES['NothingFits']!.fields
    const exampleOf = (key: string): unknown => shape.find((field) => field.key === key)?.example
    expect(example[NOTHING_FITS_FIELD]).toEqual([{ missing: exampleOf('missing'), what: exampleOf('what') }])
    expect(Array.isArray(example[GOVERNS_FILES_FIELD]) && (example[GOVERNS_FILES_FIELD] as unknown[]).length).toBe(1)
    expect(JSON.stringify(example[GOVERNS_FIELD] ?? [])).not.toContain(WHOLE_PROJECT_KEY)
  })
})

describe('the kinds of page a decision may govern, in one list', () => {
  it('2: the two descriptions and the refusal each hold the list built from PAGE_KINDS', async () => {
    const { thePageKindsInWords } = await import('../src/shared/page-kinds-in-words.ts')
    const { decisionKind, DECISION_SHAPES } = await import('../src/shared/kinds/decision.ts')
    const { assertTheGovernedPlacesAreReal } = await import('../src/server/lib/assert-the-governed-places-are-real.ts')
    const { GOVERNS_FIELD } = await import('../src/shared/governs.ts')
    const list = thePageKindsInWords()
    expect(await theKindsNamedIn(list)).toHaveLength((await import('../src/shared/what-a-record-names.ts')).PAGE_KINDS.length)

    const governsField = decisionKind.fields.find((field) => field.key === GOVERNS_FIELD)
    expect(governsField?.description).toContain(list)
    const recordField = DECISION_SHAPES['GovernedPlace']!.fields.find((field) => field.key === 'record')
    expect(recordField?.description).toContain(list)

    const task = t.api.createRecord({ workspaceId: WS, kind: 'task', title: 'Test: a task is not a page', data: {}, actor: AS_THE_OWNER }).id
    expect(() => assertTheGovernedPlacesAreReal({ [GOVERNS_FIELD]: [{ record: task }] }, WS)).toThrow(list)
  })
})

describe("the governs check's words name every kind of page or none", () => {
  it('3: the check line and the nightly message, with pairs that share only a page', async () => {
    const check = { ...governs.theGovernsCheck(WS), sharingNoFile: 2 }
    const line = governs.theGovernsCheckLine(check, 'Test: nothing was done.')
    const named = await theKindsNamedIn(line)
    const all = (await import('../src/shared/what-a-record-names.ts')).PAGE_KINDS.length
    expect([0, all], `the check line names only ${named.join(', ')}`).toContain(named.length)

    const message = governs.theNightlyMessage(check)
    const inTheMessage = await theKindsNamedIn(message)
    expect([0, all], `the nightly message names only ${inTheMessage.join(', ')}`).toContain(inTheMessage.length)
  })
})

describe('a report whose nothingFits is not a list', () => {
  it('4: is counted and named as not read, and the rest of the check still answers', async () => {
    const aReport = (title: string): string =>
      t.api.createRecord({
        workspaceId: WS,
        kind: 'report',
        title,
        data: { for: 'Readers', date: '2026-01-01', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] },
        actor: AS_THE_OWNER,
      }).id
    const before = governs.theGovernsCheck(WS)
    const plain = aReport('Test: a report about nothing')
    const aString = aReport('Test: a report whose nothingFits is a string')
    const anObject = aReport('Test: a report whose nothingFits is an object')
    const held = (id: string): Record<string, unknown> => (t.api.getRecord(id) as { data: Record<string, unknown> }).data
    writeDataBypassingTheGate(t, aString, { ...held(aString), nothingFits: 'the printer profiles' })
    writeDataBypassingTheGate(t, anObject, { ...held(anObject), nothingFits: { missing: 'module', what: 'the printer profiles' } })

    const check = governs.theGovernsCheck(WS)
    expect(check.reportsNotRead.map((one) => one.id).sort()).toEqual([aString, anObject].sort())
    expect(check.reportsNamingNothing.map((one) => one.id)).toEqual([plain])
    expect(check.notCompared, 'and the answer says it, so the list is not read as whole').toHaveLength(before.notCompared.length + 1)
    expect(before.reportsNotRead).toEqual([])
  })
})

describe('every other sentence that lists the kinds of page lists all of them', () => {
  it('5: the English words of every governs refusal', async () => {
    const { GOVERNS_REFUSAL_CODES, DECISION_NAMES_REFUSAL_CODES } = await import('../src/shared/refusal-codes.ts')
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    const codes = [...Object.keys(GOVERNS_REFUSAL_CODES), ...Object.keys(DECISION_NAMES_REFUSAL_CODES)]
    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) {
      const words = sayInEnglish(`server.${code}` as Parameters<typeof sayInEnglish>[0])
      expect(await theKindsAPartListNames(words), words).toEqual([])
    }
  })

  it("6: the governs doors' notes, their family's line, and the seal's words for a report about no page", async () => {
    const { trackApiRoutes, FAMILY_LINES, familyOf } = await import('../src/server/api/kinds.ts')
    const { governsRoutes } = await import('../src/server/api/governs.ts')
    const { whatAReportAboutNoPageIsTold } = await import('../src/server/lib/before-the-seal-rules.ts')
    const probe = Fastify()
    const listed = trackApiRoutes(probe)
    await probe.register(governsRoutes, { prefix: '/api' })
    await probe.ready()
    const doors = listed()
    await probe.close()
    expect(doors.length).toBeGreaterThan(0)
    const sentences = [
      ...doors.map((door) => door.note ?? ''),
      ...new Set(doors.map((door) => FAMILY_LINES[familyOf(door.path)] ?? '')),
      whatAReportAboutNoPageIsTold('Test-report'),
    ]
    for (const sentence of sentences) {
      expect(sentence, 'each door and its family say what they hold').not.toBe('')
      expect(await theKindsAPartListNames(sentence), sentence).toEqual([])
    }
  })
})
