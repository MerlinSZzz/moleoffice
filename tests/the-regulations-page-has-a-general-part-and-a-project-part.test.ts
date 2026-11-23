// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGULATIONS PAGE HAS TWO LABELLED PARTS, GENERAL AND THIS PROJECT, AND EACH RULE SAYS ITS SOURCE AND ITS REVISION.
 * Part 5 of the design-first build of project rules, on decision hL0xQI9EfpCO, answer 3. By the owner's decision, the
 * person sees the project's rules and their changes on the regulations page.
 *
 * The General part holds the person's regulations and the office's chapters. A general rule is revised with its
 * chapter, so the chapter says its record and that record's revision (`revision` of GET /api/office-regulations/chapters,
 * from src/server/lib/office-regulations.ts), or that the text shipped with this release is in use. The This project
 * part is GET /api/office-regulations/projects/current/chapters drawn: each rule with its words, its reason, a link to
 * its source record, its check, when it is asked, whether it is on, and the revision at which it last changed.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The page half is drawn by
 * `TheRegulations` with no server, and in Chromium with the page's own stylesheet. Every project, record and rule here
 * is made up.
 *
 * THE CASES:
 *   1. the chapter door answers each chapter's revision: the newest revision of its record while that record's text is
 *      in use, and none while the shipped text is;
 *   2. the page drawn from the three doors has the General part first and the This project part after it, and each
 *      project rule is drawn there with its source, its check, when it is asked, on or off, and its revision;
 *   3. a general chapter says its revision, or that its text shipped with this release;
 *   4. a project that keeps no chapter draws "No rules" in its part, and a stored rule that does not read is counted and
 *      named;
 *   6. at 1440, 990, 660 and 390, light and dark, the page with both parts never scrolls sideways;
 *   7. each of the person's regulations in the General part says its record and its revision: the newest revision of
 *      the record (`revision` of GET /api/office-regulations), or "No revision" when this office keeps none.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 036191eef with this file copied in: cases 1 to 5 red, case 6 green. The
 * chapter door answered no revision, the page drew neither part, and the Chinese page had no word for the labels.
 * Case 6 is green there because that page draws no project part; the last mutation below is its proof.
 * Case 7 was added after that, and was red at f2a116f6d with this file copied in, the other six green: the door
 * answered no revision for a regulation.
 * MUTATION PROOF, 8 November 2026, after a control run of 6 green. Each mutation alone, then restored:
 * - the chapter door answers no revision (src/server/lib/office-regulations.ts): case 1 red.
 * - the This project part drawn before the General part: case 2 red.
 * - a project rule's revision not drawn: case 2 red.
 * - a project rule's source drawn as words with no link: case 2 red.
 * - a general chapter's revision not drawn: case 3 red.
 * - "shipped with this release" not drawn beside a general chapter: case 3 red.
 * - a project with no chapter of its own drawn with no line saying so: case 4 red.
 * - a stored rule that does not read neither counted nor named: case 4 red.
 * - one label's key misnamed: case 5 red, by the ⟦ ⟧ the page draws for a missing word.
 * - a fact's words no longer broken anywhere (overflow-wrap removed): case 6 red.
 * - a regulation's revision answered as null by the door: case 7 red.
 * - a regulation's known revision not drawn: case 7 red.
 * - nothing drawn for a regulation with no revision kept: case 7 red.
 * - the door's newest revision read as the lowest, for chapters and regulations alike: cases 1 and 7 red.
 * WHAT THIS FILE DOES NOT CATCH YET: while the Chinese of these labels is not written, a Chinese page draws their English, so a
 * label typed into the page in English instead of read by t() passes cases 2 and 5. Case 5 catches it once the Chinese
 * is written.
 */

import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { setWordLanguage, t as word } from '../src/shared/i18n.ts'
import type { SelectedChapter, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'
import type { ProjectRule, TheProjectChapter } from '../src/shared/project-rules.ts'

type PageModule = typeof import('../src/web/pages/RegulationsPage.tsx')
type RouterModule = typeof import('../src/web/components/router.tsx')

const PROJECT = 'made-up-lab'
const ELSEWHERE = 'made-up-project-with-no-rules'
const DOOR = '/api/office-regulations/projects/current/chapters'

let t: TestDb
let app: FastifyInstance
let pg: PageModule
let router: RouterModule
let source = ''
let chapterRecord = ''

const PERSON: Record<string, string> = {
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const inProject = (project: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-workspace': project })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read<T = any>(url: string, project = PROJECT): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: inProject(project) })
  expect(reply.statusCode, `${url}: ${reply.body}`).toBe(200)
  return reply.json() as T
}

/** A made-up rule as a writer sends it. */
function aRule(id: string, check: Record<string, unknown>, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    heading: `Made-up heading of ${id}`,
    text: `Made-up text of ${id}.`,
    reason: `Made-up reason for ${id}.`,
    source,
    trigger: 'method-work',
    check,
    effect: 'remind',
    on: true,
    ...more,
  }
}

/** The part of the drawn page with this data-part, from its opening tag to the end of the page. */
function partOf(html: string, part: 'general' | 'project'): string {
  const at = html.indexOf(`data-part="${part}"`)
  expect(at, `the page draws no ${part} part`).toBeGreaterThanOrEqual(0)
  return html.slice(at)
}

/** One drawn project rule: its list item, by its id. */
function ruleIn(html: string, id: string): string {
  const at = html.indexOf(`data-project-rule="${id}"`)
  expect(at, `the page draws no rule ${id}`).toBeGreaterThanOrEqual(0)
  const end = html.indexOf('</li>', at)
  return html.slice(at, end)
}

/** React escapes these in text and in attributes; the words are compared as drawn. */
const asDrawn = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function drawn(said: WhatTheOfficeRegulationsSay, selected: TheSelectedChapters | undefined, project: TheProjectChapter | undefined): string {
  return renderToStaticMarkup(h(pg.TheRegulations, { said, selected, project }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [id, title] of [[PROJECT, 'Made-up lab'], [ELSEWHERE, 'Made-up project with no rules']] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: inProject('default'), payload: { id, title } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const note = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'note', title: 'Made-up decision the rules come from', data: { body: 'Made-up.' } } })
  expect(note.statusCode, note.body).toBe(201)
  source = note.json().record.id

  // ONE GENERAL CHAPTER HELD BY A RECORD: chapter 1 restored from the shipped text, then one rule's words edited, through
  // the chapter doors, as tests/chapter-doors-select-and-restore.test.ts writes a chapter. The rule's Chinese is changed in the same
  // edit, which the door asks for. Its record has two revisions.
  const before = (await read<TheSelectedChapters>('/api/office-regulations/chapters', 'default')).chapters.find((one) => one.n === 1)!
  const restored = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: inProject('default'), payload: { n: 1, version: before.version, because: 'Made-up: the shipped chapter filed.', from: 'shipped' } })
  expect(restored.statusCode, restored.body).toBe(200)
  const filed = (await read<TheSelectedChapters>('/api/office-regulations/chapters', 'default')).chapters.find((one) => one.n === 1)!
  const edited = structuredClone(filed.chapter!)
  const last = edited.rules[edited.rules.length - 1]!
  last.text += ' Made-up words added.'
  last.zh = { heading: last.zh?.heading ?? last.heading, text: `${last.zh?.text ?? ''}测试加上的话。` }
  const applied = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: inProject('default'), payload: { n: 1, version: filed.version, because: 'Made-up: one rule edited.', chapter: edited } })
  expect(applied.statusCode, applied.body).toBe(200)
  chapterRecord = String(filed.record)

  // THE PROJECT'S CHAPTER, written by the person through its door: one rule on, one off.
  const written = await app.inject({
    method: 'POST',
    url: DOOR,
    headers: PERSON,
    payload: { version: null, because: 'Made-up: the first rules of the made-up lab.', rules: [aRule('trials', { name: 'evidence-linked', evidence: 'grasp_trials' }), aRule('reviewed', { name: 'reviewed-design-linked' }, { trigger: 'go', on: false })] },
  })
  expect(written.statusCode, written.body).toBe(200)

  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
  pg = (await import('../src/web/pages/RegulationsPage.tsx')) as unknown as PageModule
  router = (await import('../src/web/components/router.tsx')) as unknown as RouterModule
})

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t?.close()
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('the doors the page reads', () => {
  it("answers each chapter's revision: its record's newest while the record's text is in use, and none for the shipped text", async () => {
    const selected = await read<TheSelectedChapters>('/api/office-regulations/chapters', 'default')
    const one = selected.chapters.find((chapter) => chapter.n === 1)
    expect(one?.inUse, JSON.stringify(selected.chapters.map((chapter) => [chapter.n, chapter.inUse]))).toBe('stored')
    const revisions = (await read(`/api/records/${chapterRecord}/revisions`, 'default')).revisions as { seq: number }[]
    expect(revisions.length, 'the edit wrote a second revision').toBeGreaterThan(1)
    expect(one?.revision).toBe(Math.max(...revisions.map((revision) => revision.seq)))
    for (const chapter of selected.chapters.filter((each) => each.inUse !== 'stored')) expect(chapter.revision, `chapter ${String(chapter.n)}`).toBeNull()
  })
})

describe('the page draws a General part and a This project part', () => {
  it('draws General first, then This project with each rule, its source, its check, when it is asked, on or off, and its revision', async () => {
    const said = await read<WhatTheOfficeRegulationsSay>('/api/office-regulations')
    const selected = await read<TheSelectedChapters>('/api/office-regulations/chapters')
    const project = await read<TheProjectChapter>(DOOR)
    expect(project.rules.map((rule) => rule.id)).toEqual(['trials', 'reviewed'])
    const html = drawn(said, selected, project)

    const general = html.indexOf('data-part="general"')
    const ours = html.indexOf('data-part="project"')
    expect(general, 'the General part').toBeGreaterThanOrEqual(0)
    expect(ours, 'the This project part comes after the General part').toBeGreaterThan(general)
    const generalPart = html.slice(general, ours)
    const projectPart = partOf(html, 'project')
    expect(generalPart).toContain(asDrawn(word('regulationsPage.general')))
    const generalRule = asDrawn(selected.chapters.find((chapter) => chapter.n === 1)!.chapter!.rules[0]!.heading)
    expect(generalPart).toContain(generalRule)
    expect(projectPart).toContain(asDrawn(word('regulationsPage.thisProject')))
    expect(projectPart).not.toContain(generalRule)
    for (const rule of project.rules) expect(generalPart, `rule ${rule.id} is drawn in the General part`).not.toContain(rule.heading)

    // THE CHAPTER'S RECORD, where every change is kept with its reason, and the revision it is at.
    expect(projectPart).toContain(`href="#${router.recordPath(String(project.chapter))}"`)
    expect(projectPart).toContain(asDrawn(word('regulationsPage.revision', { n: Number(project.version) })))

    const [trials, reviewed] = project.rules as [ProjectRule, ProjectRule]
    const first = ruleIn(html, 'trials')
    expect(first).toContain(asDrawn(trials.heading))
    expect(first).toContain(asDrawn(trials.text))
    expect(first).toContain(asDrawn(trials.reason))
    expect(first).toContain(`href="#${router.recordPath(source)}"`)
    expect(first).toContain(asDrawn(word('regulationsPage.checks.evidenceLinked', { evidence: 'grasp_trials' })))
    expect(first).toContain(asDrawn(word('regulationsPage.triggers.methodWork')))
    expect(first).toContain(asDrawn(word('regulationsPage.rule.on')))
    expect(first).toContain(asDrawn(word('regulationsPage.revision', { n: trials.revision })))

    const second = ruleIn(html, 'reviewed')
    expect(second).toContain(asDrawn(word('regulationsPage.checks.reviewedDesignLinked')))
    expect(second).toContain(asDrawn(word('regulationsPage.triggers.go')))
    expect(second).toContain(asDrawn(word('regulationsPage.rule.off')))
    expect(second).toContain(asDrawn(word('regulationsPage.revision', { n: reviewed.revision })))
  })

  it('says beside a general chapter the revision of its record, or that its text shipped with this release', async () => {
    const said = await read<WhatTheOfficeRegulationsSay>('/api/office-regulations')
    const selected = await read<TheSelectedChapters>('/api/office-regulations/chapters')
    const one = selected.chapters.find((chapter) => chapter.n === 1) as SelectedChapter
    const stored = partOf(drawn(said, { ...selected, chapters: [{ ...one, revision: 7 }] }, undefined), 'general')
    expect(stored).toContain(asDrawn(word('regulationsPage.revision', { n: 7 })))
    expect(stored).not.toContain(asDrawn(word('regulationsPage.shipped')))
    const shipped = partOf(drawn(said, { ...selected, chapters: [{ ...one, inUse: 'shipped', chapter: one.shipped, revision: null }] }, undefined), 'general')
    expect(shipped).toContain(asDrawn(word('regulationsPage.shipped')))
    expect(shipped).not.toContain(asDrawn(word('regulationsPage.revision', { n: 7 })))
  })

  it('draws "No rules" for a project with no rules of its own, and counts and names a stored rule that does not read', async () => {
    const said = await read<WhatTheOfficeRegulationsSay>('/api/office-regulations', ELSEWHERE)
    const none = await read<TheProjectChapter>(DOOR, ELSEWHERE)
    expect(none.chapter).toBeNull()
    const empty = partOf(drawn(said, undefined, none), 'project')
    expect(empty).toContain(asDrawn(word('regulationsPage.thisProject')))
    expect(empty).toContain(asDrawn(word('regulationsPage.project.noRules')))
    expect(empty).not.toContain('data-project-rule=')

    const project = await read<TheProjectChapter>(DOOR)
    const withAProblem: TheProjectChapter = { ...project, problems: [{ at: 2, rule: 'made-up-broken', code: 'unknownCheck', says: 'Made-up: the check is not on the list.' }] }
    const named = partOf(drawn(said, undefined, withAProblem), 'project')
    expect(named).toContain(asDrawn(word('regulationsPage.project.unread', { n: 1 })))
    expect(named).toContain('made-up-broken')
    expect(partOf(drawn(said, undefined, project), 'project')).not.toContain(asDrawn(word('regulationsPage.project.unread', { n: 1 })))
  })
})

describe('the page with both parts fits at four widths in both themes', () => {
  it('never scrolls sideways', async () => {
    const said = await read<WhatTheOfficeRegulationsSay>('/api/office-regulations')
    const selected = await read<TheSelectedChapters>('/api/office-regulations/chapters')
    const project = await read<TheProjectChapter>(DOOR)
    const long: TheProjectChapter = { ...project, rules: project.rules.map((rule) => ({ ...rule, heading: `${rule.heading} ${'and-a-very-long-unbroken-word-'.repeat(4)}`, check: rule.check.evidence === undefined ? rule.check : { ...rule.check, evidence: 'a_very_long_evidence_account_name_that_does_not_break_anywhere' } })) }
    const browser = await drawInABrowser(`<style>${pg.REGULATIONS_CSS}</style>${drawn(said, selected, long)}`, { width: 1440, height: 900 })
    try {
      for (const width of [1440, 990, 660, 390]) {
        await browser.page.setViewportSize({ width, height: 900 })
        for (const theme of [null, 'dark'] as const) {
          await browser.palette(theme)
          const overflow = await browser.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(overflow, `${String(width)}px, ${theme ?? 'light'}: the page scrolls sideways`).toBeLessThanOrEqual(0)
        }
      }
    } finally {
      await browser.close()
    }
  })
})

describe("the person's regulations in the General part", () => {
  it('each says its record and its revision, or "No revision" when none of it is kept here', async () => {
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'regulation', title: 'Made-up regulation of the made-up lab', data: { sentence: 'Made-up: every made-up trial is written down.', binds: 'person', since: '2026-11-08' } } })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = String(filed.json().record.id)
    const revoked = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: PERSON, payload: { dataPatch: { revoked_at: '2026-11-08', revoked_because: 'Made-up: revoked, so the record has a second revision.' } } })
    expect(revoked.statusCode, revoked.body).toBe(200)
    const revisions = (await read(`/api/records/${id}/revisions`)).revisions as { seq: number }[]
    expect(revisions.length, 'the revocation wrote a second revision').toBeGreaterThan(1)
    const newest = Math.max(...revisions.map((revision) => revision.seq))

    const said = await read<WhatTheOfficeRegulationsSay>('/api/office-regulations')
    const one = said.regulations.find((regulation) => regulation.id === id)
    expect(one, 'the door answers the regulation').toBeDefined()
    expect(one!.revision, 'the door answers the newest revision of its record').toBe(newest)

    const selected = await read<TheSelectedChapters>('/api/office-regulations/chapters')
    const project = await read<TheProjectChapter>(DOOR)
    const html = drawn(said, selected, project)
    const generalPart = html.slice(html.indexOf('data-part="general"'), html.indexOf('data-part="project"'))
    const item = regulationIn(generalPart, id)
    expect(item).toContain(asDrawn(word('regulationsPage.revision', { n: newest })))

    const none = regulationIn(partOf(drawn({ ...said, regulations: [{ ...one!, revision: null }] }, selected, project), 'general'), id)
    expect(none).toContain(asDrawn(word('regulationsPage.revisionNone')))
    expect(none).not.toContain(asDrawn(word('regulationsPage.revision', { n: newest })))
  })
})

/** One drawn regulation of the person: its list item, found by the link to its record. */
function regulationIn(html: string, id: string): string {
  const link = html.indexOf(`href="#${router.recordPath(id)}"`)
  expect(link, `the page draws no link to the regulation ${id}`).toBeGreaterThanOrEqual(0)
  return html.slice(html.lastIndexOf('<li', link), html.indexOf('</li>', link))
}
