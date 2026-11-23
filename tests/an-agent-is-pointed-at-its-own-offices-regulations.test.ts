// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT IS POINTED AT THE REGULATIONS OF THE OFFICE IT IS IN. Item 1 of the line "the shipped rules are
 * general" (wave 13w).
 *
 * An office's regulations are its chapter records, one set for the whole office, wherever in it they are filed. A
 * fresh office copies the default set into them at its first start, and its owner may change them on the
 * regulations page. Every project of the office reads that one set, by the secretary's answer
 * E3iPaQAJ0k1_ on two decisions. Five places read the chapters from somewhere else: from
 * src/config/rules/chapters.json and CODE.md, the export of the chapters of the office this repository is developed
 * in. An agent in any other office was named that office's chapters and pointed at that office's file:
 *   - the card message and the idle reminder named CODE.md by its full path, and the card message named each
 *     chapter on the card's Must read line by the export's label;
 *   - GET /api/after-a-compaction named the chapters by the export, and named CODE.md;
 *   - GET /api/brief read the rule for a question from the export, and its opening named CODE.md;
 *   - POST /api/agents/started read a chapters line against the export, and its refusal named CODE.md;
 *   - GET /api/roles named the cards' chapters by the export.
 *
 * WHAT IS PROVED HERE. This world's office holds a made-up set of nine chapters, each labelled "Test chapter N",
 * with no chapter 4. They are filed in a project of their own, as the chapters of the office this repository is
 * developed in are. The requests are asked in `default` and in a project that holds no chapter, and each of the
 * five places answers from the office's set in both. None names CODE.md. Where the office holds no chapter the card
 * or the starter names, the answer says so rather than naming another office's chapter. The regulations page itself
 * shows the office's set in every project, and does not say its chapters are exported to CODE.md, which is true
 * only of the office this repository is developed in. Since the page shows the set in every project, the person's
 * mark on one of its rules is taken from every project too; until wave 13w the mark refused a chapter filed in
 * another project.
 *
 * MUTATIONS (each after a green control run, then restored), run on 13 October 2026:
 *   - `theChapters` in src/server/lib/chapters.ts reads the export again. Every case but the first and the last
 *     goes red; those two read GET /api/office-regulations, which does not go through `theChapters`.
 *   - `theOfficesChapterRecords` in src/server/lib/office-regulations.ts reads one project, `default`, rather
 *     than every project. Every case goes red.
 *   - the `says` of `theOfficeRegulations` in src/server/lib/office-regulations.ts names CODE.md again. The
 *     first case goes red.
 *   - `markARuleOnlyForThisOffice` in src/server/lib/office-regulations.ts refuses a chapter filed in another
 *     project again. The last case goes red.
 *   - the refusal of `markARuleOnlyForThisOffice` for an id naming no chapter says "in this project" again, as it did
 *     until wave 13w. The last case goes red.
 *   - the card message in src/server/lib/cardmessage.ts says again that the rules are whole in CODE.md. The
 *     case of the card message goes red, and so does the idle reminder's in
 *     tests/the-office-reminds-idle-agents-and-runs-past-their-expected-time.test.ts.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TOOLSET_SENTENCE } from '../src/shared/toolset.ts'
import { KNOWLEDGE_WORDS } from '../src/shared/words/en-wave-13u.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const BARE = 'no-chapters-here'
/** Where this world's office files its chapters: a project of their own, asked in by no case below. */
const FILED_IN = 'where-the-chapters-are'
/** The two projects every case asks in. Neither holds a chapter record. */
const ASKED_IN = ['default', BARE] as const
const CHAPTERS_HERE = [1, 2, 3, 5, 6, 7, 8, 9, 10]
const RULES_IN_EACH = 8

function asThePersonIn(project: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': project,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }
}

function asTheAgentIn(project: string, handle: string): Record<string, string> {
  return { ...asThePersonIn(project), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

const label = (n: number): string => `Test chapter ${String(n)}`
const ruleName = (n: number, r: number): string => `Test rule ${String(n)} point ${String(r)}`
const ruleText = (n: number, r: number): string => `The words of test rule ${String(n)} point ${String(r)}, written for this world.`

/** The made-up set, in the shape of src/config/rules/default-regulations.json. */
function aMadeUpSet(): unknown {
  return {
    chapters: CHAPTERS_HERE.map((n) => ({
      n,
      label: label(n),
      title: `What test chapter ${String(n)} governs`,
      conclusion: `The conclusion of test chapter ${String(n)}.`,
      context: `Why test chapter ${String(n)} exists in this world.`,
      outline: Array.from({ length: RULES_IN_EACH }, (_, i) => ({
        id: `r-${String(i + 1)}`,
        name: ruleName(n, i + 1),
        text: ruleText(n, i + 1),
        zh: { name: `测试规则 ${String(n)}.${String(i + 1)}`, text: `测试规则 ${String(n)}.${String(i + 1)} 的文字。` },
        zhFrom: 'written for the default set',
      })),
      zh: { label: `测试第 ${String(n)} 章`, title: `测试第 ${String(n)} 章管什么`, conclusion: `测试第 ${String(n)} 章的结论。` },
    })),
  }
}

let t: TestDb
let app: FastifyInstance
let scratch = ''

beforeAll(async () => {
  t = await freshDb()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-own-regulations-'))
  const file = join(scratch, 'default-regulations.json')
  writeFileSync(file, JSON.stringify(aMadeUpSet()))
  // IMPORTED AFTER freshDb, which resets the modules, so the copy writes into this world's database.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce(file).copied).toBe(CHAPTERS_HERE.length)
  app = (await apiApp()).app
  await app.ready()
  for (const [id, title] of [[BARE, 'No chapters'], [FILED_IN, 'Where the chapters are']] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: asThePersonIn('default'), payload: { id, title } })
    expect(made.statusCode, made.body).toBe(201)
  }
  // THE CHAPTERS ARE MOVED TO A PROJECT OF THEIR OWN BY A DIRECT WRITE TO THIS TEST'S DATABASE. The copy files them in
  // `default`, and the office this repository is developed in holds its chapters in another project. Only the
  // records' own project is changed; every reader of the chapters reads the records.
  const moved = t.client.sqlite
    .prepare("UPDATE records SET workspace_id = ? WHERE kind = 'module' AND json_type(data, '$.extra.chapter') = 'integer'")
    .run(FILED_IN)
  expect(moved.changes).toBe(CHAPTERS_HERE.length)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

async function register(project: string, payload: Record<string, unknown>) {
  return await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePersonIn(project), payload })
}

/** The card message a registration wrote to `handle`, in full. */
async function theCardMessageTo(handle: string): Promise<string> {
  const waiting = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: asThePersonIn('default') })
  expect(waiting.statusCode, waiting.body).toBe(200)
  const list = (waiting.json() as { waiting: { messageId: string }[] }).waiting
  expect(list.length, 'the registration wrote no card message').toBe(1)
  const read = await app.inject({ method: 'GET', url: `/api/records/${list[0]!.messageId}`, headers: asThePersonIn('default') })
  expect(read.statusCode, read.body).toBe(200)
  return (read.json() as { record: { data: { saidInFull?: string } } }).record.data.saidInFull ?? ''
}

describe("an agent is pointed at the regulations of the office it is in", () => {
  it("the regulations page shows the office's made-up set in every project, so the cases below read against it, and names no export", async () => {
    for (const project of [...ASKED_IN, FILED_IN]) {
      const read = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: asThePersonIn(project) })
      expect(read.statusCode, read.body).toBe(200)
      const page = read.json() as { chapters: { n: number; label: string }[]; says: string }
      expect(page.chapters.map((one) => [one.n, one.label]), `asked in ${project}`).toEqual(CHAPTERS_HERE.map((n) => [n, label(n)]))
      // THIS OFFICE'S CHAPTERS ARE EXPORTED TO NO FILE, so the page does not say that they are.
      expect(page.says).not.toContain('CODE.md')
    }
  })

  it("GET /api/roles names the cards' chapters as the office holds them in every project, and leaves out one it does not hold", async () => {
    for (const project of ASKED_IN) {
      const here = await app.inject({ method: 'GET', url: '/api/roles', headers: asThePersonIn(project) })
      expect(here.statusCode, here.body).toBe(200)
      const named = (here.json() as { chapters: { number: number; name: string; zh: string | null }[] }).chapters
      expect(named.length, `asked in ${project}: ${here.body}`).toBeGreaterThan(0)
      for (const one of named) {
        expect(one.name, `chapter ${String(one.number)} is not named as the office holds it, asked in ${project}`).toBe(label(one.number))
        expect(one.zh).toBe(`测试第 ${String(one.number)} 章`)
      }
      expect(named.map((one) => one.number), 'the office holds no chapter 4, so it has no name to give').not.toContain(4)
    }
  })

  it("the card message names the office's chapters and its regulations door in every project, and never CODE.md", async () => {
    for (const project of ASKED_IN) {
      const handle = `card-reader-${project}`
      const registered = await register(project, { handle, name: handle, role: 'worker' })
      expect(registered.statusCode, registered.body).toBe(201)
      const said = await theCardMessageTo(handle)
      expect(said).toContain(`${THE_TOOLSET_SENTENCE} ${KNOWLEDGE_WORDS.introduction}`)
      for (const n of [1, 2, 3, 5, 9]) expect(said, `the worker card reads chapter ${String(n)}, registered in ${project}`).toContain(label(n))
      expect(said, 'the worker card reads chapter 4, which the office does not hold, and the message must say so').toMatch(
        /chapter 4[^.]*does not hold|holds no chapter 4/u,
      )
      expect(said).toContain('GET /api/office-regulations')
      expect(said).not.toContain('CODE.md')
    }
  })

  it('GET /api/after-a-compaction names the office\'s chapters in every project, and never CODE.md', async () => {
    const handle = 'own-regulations-compaction-reader'
    const registered = await register('default', { handle, name: handle, role: 'worker' })
    expect(registered.statusCode, registered.body).toBe(201)

    for (const project of ASKED_IN) {
      const here = await app.inject({ method: 'GET', url: '/api/after-a-compaction', headers: asTheAgentIn(project, handle) })
      expect(here.statusCode, here.body).toBe(200)
      const rules = (here.json() as { rules: { chapters: { n: number; name: string; rules: string[] }[]; says: string; whereTheWholeIs: string } }).rules
      expect(rules.chapters.map((one) => one.n), `asked in ${project}`).toEqual([1, 2, 3, 5, 9])
      for (const one of rules.chapters) {
        expect(one.name).toBe(label(one.n))
        expect(one.rules[0]).toBe(ruleName(one.n, 1))
      }
      expect(rules.says, 'the card names chapter 4 and the office holds none, so the reply must say so').toMatch(/no chapter 4/u)
      expect(rules.says).not.toContain('CODE.md')
      expect(rules.whereTheWholeIs).toContain('GET /api/office-regulations')
      expect(rules.whereTheWholeIs).not.toContain('CODE.md')
    }
  })

  it("a registration's chapters line is read against the office's chapters in every project, and its refusal names the regulations door", async () => {
    for (const project of ASKED_IN) {
      const byName = await register(project, { handle: `by-name-${project}`, name: 'by name', chapters: [`${label(5)}:outline`] })
      expect(byName.statusCode, byName.body).toBe(201)
      expect((byName.json() as { chapters: { named: unknown } }).chapters.named).toEqual([{ chapter: 5, level: 'outline' }])

      const absent = await register(project, { handle: `absent-${project}`, name: 'absent', chapters: ['4'] })
      expect(absent.statusCode, absent.body).toBe(400)
      expect(absent.body).toContain('no chapter 4')
      expect(absent.body).toContain('GET /api/office-regulations')
      expect(absent.body).not.toContain('CODE.md')
    }
  })

  it("GET /api/brief carries the office's rule for a question and points at its chapter 9 rule 8 in every project, never at CODE.md", async () => {
    const handle = 'own-regulations-brief-reader'
    const registered = await register('default', { handle, name: handle, role: 'worker' })
    expect(registered.statusCode, registered.body).toBe(201)

    for (const project of ASKED_IN) {
      const here = await app.inject({ method: 'GET', url: '/api/brief', headers: asTheAgentIn(project, handle) })
      expect(here.statusCode, here.body).toBe(200)
      const brief = here.json() as { head: string; aQuestionFromThePerson: Record<string, unknown> }
      expect(brief.aQuestionFromThePerson, `asked in ${project}`).toMatchObject({ found: true, chapter: 7, number: 8, name: ruleName(7, 8), text: ruleText(7, 8) })
      expect(brief.head).toContain(`Chapter 7 rule 8, ${ruleName(7, 8)}: ${ruleText(7, 8)}`)
      expect(brief.head).toContain(`chapter 9 rule 8, ${ruleName(9, 8)}`)
      expect(brief.head).toContain('GET /api/office-regulations')
      expect(brief.head).not.toContain('CODE.md')
    }
  })

  it("the person's mark on a rule of the office's set is taken in every project, not only where the chapter is filed", async () => {
    const filed = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: asThePersonIn(FILED_IN) })
    expect(filed.statusCode, filed.body).toBe(200)
    const chapter = (filed.json() as { chapters: { n: number; id: string }[] }).chapters.find((one) => one.n === 7)
    expect(chapter, 'the office holds no chapter 7').toBeDefined()
    const markedBy = async (): Promise<unknown> => {
      const read = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: asThePersonIn(FILED_IN) })
      const rules = (read.json() as { chapters: { n: number; outline: { id: string; onlyThisOffice?: { by: string } | null }[] }[] }).chapters
      return rules.find((one) => one.n === 7)?.outline.find((one) => one.id === 'r-1')?.onlyThisOffice?.by ?? null
    }

    for (const project of ASKED_IN) {
      for (const only of [true, false]) {
        const pressed = await app.inject({
          method: 'POST',
          url: '/api/office-regulations/only-this-office',
          headers: { ...asThePersonIn(project), ...thePersonsKeyHeader() },
          payload: { chapter: chapter!.id, rule: 'r-1', only },
        })
        expect(pressed.statusCode, `pressed in ${project}: ${pressed.body}`).toBe(200)
        expect(pressed.json()).toMatchObject({ chapter: chapter!.id, rule: 'r-1', onlyThisOffice: only, changed: true })
        expect(await markedBy(), `pressed in ${project}`).toBe(only ? THE_PERSON : null)
      }
    }

    // AN ID NAMING NO CHAPTER OF THE OFFICE is refused in every project, and the refusal says the office holds none.
    for (const project of ASKED_IN) {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/office-regulations/only-this-office',
        headers: { ...asThePersonIn(project), ...thePersonsKeyHeader() },
        payload: { chapter: 'no-such-chapter', rule: 'r-1', only: true },
      })
      expect(refused.statusCode, `pressed in ${project}: ${refused.body}`).toBe(404)
      expect(refused.body).toContain('No chapter record no-such-chapter in this office. Nothing was written.')
    }
  })
})
