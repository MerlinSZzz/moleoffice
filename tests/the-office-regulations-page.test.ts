// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS HAVE A PAGE OF THEIR OWN, REACHABLE FROM THE RAIL — CRITERION G5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The page at #/regulations lists the person's regulations with their revocation state, and the
 * chapters with their rules. Both halves are drawn from the RECORDS, through the one mapping in
 * src/shared/office-rules.ts that tools/rules-chapters.mjs also uses — so a rule on the page and
 * a rule in design/rules/CODE.md are the same record read twice.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT PROVES THE SOURCE, RUN AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   Draw the chapter list from a SECOND COPY: in src/server/lib/office-regulations.ts, replace
 *   `chaptersInBothLanguagesFromRecords(records)` with `chaptersFrom(REPO_ROOT)` from src/worker/rules.ts,
 *   which reads the export src/config/rules/chapters.json. (Until wave 13w, `theChapters()` in
 *   src/server/lib/chapters.ts read that export.) The door test "reads the chapters from their records" goes
 *   red, because the test world's chapter record and the export are two copies and have drifted:
 *   the world holds a rule no export was ever written from. Restore, and the file is green again.
 *
 * THE SAME CHAPTERS IN EVERY PROJECT (wave 13w round 1). The page drawn from the door's answer in a project that files
 * no chapter shows the chapter filed in `default`. Mutation, run on 13 October 2026: in
 * src/server/lib/office-regulations.ts, `theOfficeRegulations` reads the chapter records of the project it is asked
 * in, as it did before. That case goes red, and the rest of the file stays green.
 *
 * THE SAME REGULATIONS IN EVERY PROJECT (wave 13w round 1, answer mMnOgzH6UgeD). The door asked in a project
 * that files no regulation answers the one filed in `default`, and the page draws it. The door says where each one is
 * filed, and a revoke asked from another project addresses that project, since the record door still answers a record
 * only in its own project. Every project then reads it revoked. Where a regulation is filed does not change.
 * Mutations, run on 13 October 2026, in src/server/lib/office-regulations.ts: reading the regulation records of the
 * asked project only turns both regulation cases red; saying every regulation is filed in the asked project turns the
 * revoke case red; reading the chapters of the asked project turns the chapter case and the first regulation case red,
 * since the door's sentence then counts no chapter there.
 *
 * This is the exact defect the criterion exists to stop: a page and a file agreeing with each
 * other against the record, because somebody reached for the copy instead of the authority.
 *
 * The widths and palettes are proved the way the notebook page proves its own: real Chromium, the
 * component's markup and stylesheet, no server.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'
import { t as word } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

type PageModule = typeof import('../src/web/pages/RegulationsPage.tsx')

let t: TestDb
let app: FastifyInstance
let pg: PageModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A project of this world that files no chapter. */
const ELSEWHERE = 'a-project-with-no-chapter'

/** The words this world holds on its records, and no export anywhere holds. */
const THEIR_SENTENCE = 'The constraint this test world holds, said once and never exported.'
const RULE_NAME = 'The rule of this world'
const RULE_TEXT = 'Read the chapter from the record that holds it, and from no copy of it.'
const SECOND_SENTENCE = 'A second constraint this test world holds, revoked from another project.'

async function get(): Promise<WhatTheOfficeRegulationsSay> {
  return theDoorIn('default')
}

/** What GET /api/office-regulations answers the person in one project. */
async function theDoorIn(project: string): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': project } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  // THE FIRST REGULATION OF THIS WORLD, filed by the person, as G3 files the real one.
  const regulation = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'regulation',
      title: 'The first regulation of this world',
      data: { sentence: THEIR_SENTENCE, binds: 'person', since: '2026-09-11' },
    },
  })
  expect(regulation.statusCode, regulation.body).toBe(201)

  // ONE CHAPTER, a module record carrying extra.chapter, with a rule in its own summary blocks.
  const chapter = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'module',
      title: 'The chapter record this world drew',
      summary: 'The Conclusion the world gave its one chapter.',
      data: {
        context: 'Why this world has a chapter.',
        parts: [{ id: 'p1', name: 'Part one', items: [] }],
        extra: { chapter: 1 },
        summaryBlocks: [{ id: 'r-1', type: 'text', heading: RULE_NAME, text: RULE_TEXT }],
        source: 'nowhere but this world',
      },
    },
  })
  expect(chapter.statusCode, chapter.body).toBe(201)
  const chapterId = chapter.json().record.id
  const revisions = await app.inject({ url: `/api/records/${chapterId}/revisions`, headers: AS_THE_PERSON })
  const newest = revisions.json().revisions[0]
  const label = await app.inject({ method: 'POST', url: `/api/records/${chapterId}/short-forms`, headers: AS_THE_PERSON, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Record-reading rules' } } })
  expect(label.statusCode, label.body).toBe(200)

  // A SECOND PROJECT, which files neither a regulation nor a chapter.
  const elsewhere = await app.inject({ method: 'POST', url: '/api/workspaces', headers: AS_THE_PERSON, payload: { id: ELSEWHERE, title: 'A project with no chapter' } })
  expect(elsewhere.statusCode, elsewhere.body).toBe(201)

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  pg = (await import('../src/web/pages/RegulationsPage.tsx')) as unknown as PageModule
})

afterAll(async () => {
  await app.close()
  t.close()
  delete (globalThis as unknown as { window?: unknown }).window
})

// ============================================================ 1. the door reads the records

describe('GET /api/office-regulations', () => {
  it('reads the chapters from their records, and from no copy', async () => {
    const said = await get()
    // THE CHAPTER THE WORLD FILED, with the rule text the world wrote on it. An export copy of the
    // chapters holds other worlds' words, and cannot answer this.
    expect(said.chapters, `the chapters are ${JSON.stringify(said.chapters.map((c) => c.n))}`).toHaveLength(1)
    const chapter = said.chapters[0] as (typeof said.chapters)[number]
    expect(chapter.n).toBe(1)
    // A usable chapter needs its label, written through the short-forms door. Every project
    // must read these record words rather than the shipped fallback.
    expect(chapter.label).toBe('Record-reading rules')
    expect(chapter.title).toBe('The chapter record this world drew')
    expect(chapter.conclusion).toBe('The Conclusion the world gave its one chapter.')
    expect(chapter.outline).toHaveLength(1)
    expect(chapter.outline[0]?.name).toBe(RULE_NAME)
    expect(chapter.outline[0]?.text).toBe(RULE_TEXT)
    expect(chapter.source).toBe('nowhere but this world')
  })

  it('reads the regulations with their revocation state', async () => {
    const said = await get()
    expect(said.regulations).toHaveLength(1)
    const one = said.regulations[0] as (typeof said.regulations)[number]
    expect(one.sentence).toBe(THEIR_SENTENCE)
    expect(one.binds).toBe('person')
    expect(one.since).toBe('2026-09-11')
    expect(one.revokedAt).toBeNull()
    expect(one.revokedBecause).toBeNull()
  })

  it('says the revocation once the person has made it', async () => {
    const list = await get()
    const id = (list.regulations[0] as (typeof list.regulations)[number]).id
    const revoke = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { revoked_at: '2026-10-01', revoked_because: 'the world moved on' } },
    })
    expect(revoke.statusCode, revoke.body).toBe(200)
    const said = await get()
    const one = said.regulations[0] as (typeof said.regulations)[number]
    expect(one.revokedAt).toBe('2026-10-01')
    expect(one.revokedBecause).toBe('the world moved on')
  })
})

// ============================================================ 2. what the page draws

/** A reply with the revocation made, for the state half of the drawing. */
const REVOKED: WhatTheOfficeRegulationsSay = {
  regulations: [
    {
      id: 'r-1',
      title: 'A regulation that was revoked',
      filedIn: 'default',
      sentence: THEIR_SENTENCE,
      binds: 'role',
      role: 'secretary',
      since: '2026-09-11',
      revokedAt: '2026-10-01',
      revokedBecause: 'done its work',
      zhTitle: null,
      storedZhTitle: null,
      zhTitleIsStale: false,
      revision: 2,
    },
  ],
  chapters: [
    {
      n: 2,
      id: 'c-2',
      label: 'A chapter label',
      title: 'A chapter record',
      conclusion: 'The Conclusion of the chapter.',
      outline: [{ id: 'c2r1', name: RULE_NAME, text: RULE_TEXT, zh: null, onlyThisOffice: null }],
      zh: null,
      context: 'why',
      source: 'somewhere',
    },
  ],
  says: 'one chapter, one regulation',
  workspaceId: 'default',
  copiedFromTheDefaults: null,
}

function drawn(said: WhatTheOfficeRegulationsSay): string {
  return renderToStaticMarkup(h(pg.TheRegulations, { said }))
}

describe('the page draws what the records say', () => {
  it("draws the owner's sentence, whom it binds, and the standing state", () => {
    const html = drawn(REVOKED)
    expect(html).toContain(THEIR_SENTENCE)
    expect(html).toContain('binds the role')
    expect(html).toContain('secretary')
    expect(html).toContain('since')
    expect(html).toContain('revoked')
    expect(html).toContain('done its work')
  })

  it('draws each chapter with its rules as the record holds them', () => {
    const html = drawn(REVOKED)
    // THE NUMBERS SIT INLINE, before the chapter's name and before each rule's name (report
    // n9Mjk3c_sJRu block b-13): the chapter is "2 A chapter label" and its first rule is "2.1".
    expect(html).toMatch(/>2<\/span> A chapter label/)
    expect(html).toMatch(/>2\.1<\/span> /)
    expect(html).toContain('The Conclusion of the chapter.')
    expect(html).toContain(RULE_NAME)
    expect(html).toContain(RULE_TEXT)
  })

  it('says when nothing has been filed, rather than drawing an empty list', () => {
    const html = drawn({ regulations: [], chapters: [], says: 'nothing here', workspaceId: 'default', copiedFromTheDefaults: null })
    expect(html).toContain(String(pg.REGULATIONS_WORDS.noneYet))
    expect(html).toContain(String(pg.REGULATIONS_WORDS.noChapters))
  })

  it("draws the office's chapter in a project that files none, as the door answers it there", async () => {
    // WAVE 13W ROUND 1. An office holds one set of chapters, and every project reads it, by answer E3iPaQAJ0k1_ on two
    // decisions. Message b6LU5WAwtbMk asks for the page. Until then the door
    // read the chapters of the project it was asked in, and the page of a project that filed none said the office held
    // no chapter.
    const said = await theDoorIn(ELSEWHERE)
    expect(said.workspaceId).toBe(ELSEWHERE)
    const html = drawn(said)
    expect(html).toContain('Record-reading rules')
    expect(html).toContain(RULE_NAME)
    expect(html).toContain(RULE_TEXT)
    expect(html).not.toContain(String(pg.REGULATIONS_WORDS.noChapters))
  })

  it("draws the person's regulation in a project that files none, as the door answers it there", async () => {
    // WAVE 13W ROUND 1, by answer mMnOgzH6UgeD on a decision.
    // A regulation binds the person in whichever project the person is working, so every project reads the office's
    // regulation records, in whichever project each is filed. Until then the door read the project it was asked in,
    // and the page of another project said no regulation was filed.
    const said = await theDoorIn(ELSEWHERE)
    expect(said.regulations.map((one) => one.sentence)).toEqual([THEIR_SENTENCE])
    expect(said.says).toContain('Read from this office\'s records, in every project: 1 module record carries a chapter number and 1 regulation record is filed.')
    const html = drawn(said)
    expect(html).toContain(THEIR_SENTENCE)
    expect(html).not.toContain(String(pg.REGULATIONS_WORDS.noneYet))
  })

  it('the person revokes a regulation read in a project it is not filed in, by the project it says it is filed in', async () => {
    // The record door answers a record only in its own project, and stays so (the secretary: "Keep where a regulation is filed
    // as it is: only the reading becomes per office"). So the door says where each regulation is filed, and a press made
    // from the page of another project addresses that project.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'regulation', title: 'A second regulation of this world', data: { sentence: SECOND_SENTENCE, binds: 'person', since: '2026-10-13' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const read = (await theDoorIn(ELSEWHERE)).regulations.find((each) => each.id === id)
    expect(read, 'the regulation is read in a project it is not filed in').toBeDefined()
    expect(read?.filedIn, 'where it is filed').toBe('default')
    const asked = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': ELSEWHERE },
      payload: { dataPatch: { revoked_at: '2026-10-13', revoked_because: 'asked from another project' } },
    })
    expect(asked.statusCode, 'the record door still answers a record only in its own project').toBe(404)
    const revoke = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': String(read?.filedIn) },
      payload: { dataPatch: { revoked_at: '2026-10-13', revoked_because: 'asked from another project' } },
    })
    expect(revoke.statusCode, revoke.body).toBe(200)
    for (const project of ['default', ELSEWHERE]) {
      const one = (await theDoorIn(project)).regulations.find((each) => each.id === id)
      expect(one, `read in ${project}`).toMatchObject({ sentence: SECOND_SENTENCE, revokedAt: '2026-10-13', revokedBecause: 'asked from another project' })
    }
  })

  it('keeps office-only marks readable without drawing a press under marked or unmarked rules', () => {
    // WAVE 13S ROUND 9. A marked rule is left out of the default regulations.
    const unmarked = drawn(REVOKED)
    expect(unmarked).not.toContain(word('regulationsPage.onlyThisOffice'))
    expect(unmarked).not.toContain(word('regulationsPage.keepForThisOffice'))
    const chapter = REVOKED.chapters[0]!
    const marked = drawn({
      ...REVOKED,
      chapters: [{ ...chapter, outline: chapter.outline.map((rule) => ({ ...rule, onlyThisOffice: { by: THE_PERSON, at: '2026-10-02 21:00:00' } })) }],
    })
    expect(marked).toContain(word('regulationsPage.onlyThisOffice'))
    expect(marked).not.toContain(word('regulationsPage.giveToNewOffices'))
    expect(marked).not.toContain(word('regulationsPage.keepForThisOffice'))
  })

  it('says the chapters were copied from the default set only when the records say they were, with the day in words', async () => {
    // WAVE 13S ROUND 7: a fresh office copies the default regulations (src/server/lib/default-regulations.ts).
    expect(drawn(REVOKED)).not.toContain('copied from the default regulations')
    const { THE_DEFAULT_REGULATIONS_FILE } = await import('../src/server/lib/default-regulations.ts')
    const said = { ...REVOKED, copiedFromTheDefaults: { copies: [{ file: THE_DEFAULT_REGULATIONS_FILE, at: '2026-10-02 09:00:00', first: true, chapters: REVOKED.chapters.map((one) => one.n) }], notCopied: [] } }
    // THE DAY IS WRITTEN AS THE OFFICE WRITES A DAY (`dayInThePageLanguage`), never as the stored stamp.
    const i18n = await import('../src/shared/i18n.ts')
    const copied = drawn(said)
    expect(copied).toContain(`These chapters were copied from the default regulations when this office first started, on ${i18n.dayInThePageLanguage(new Date(2026, 9, 2), true)}.`)
    // WAVE 13W ROUND 5: the sentence that said this first set is about developing Mole Office went with the export from the
    // reworded chapter records; the page says the person may change them, and nothing about what the set is for.
    expect(copied).toContain('You may change any of them.')
    expect(copied).not.toContain('developing Mole Office')
    expect(copied).not.toContain('2026-10-02')
    i18n.setWordLanguage('zh')
    let inChinese = ''
    try {
      inChinese = drawn(said)
    } finally {
      i18n.setWordLanguage('en')
    }
    expect(inChinese).toContain('这些章节是这个办公室在 2026 年 10 月 2 日第一次启动时从默认规定复制来的。你可以修改其中任何一条。')
    expect(inChinese).not.toContain('2026-10-02')
  })
})

// ============================================================ 3. four widths, both themes

/** The same markup with the page's own stylesheet, which is what the browser has to be given. */
function forTheBrowser(said: WhatTheOfficeRegulationsSay): string {
  return `<style>${pg.REGULATIONS_CSS}</style>${drawn(said)}`
}

const WIDTHS = [1440, 990, 660, 390] as const

describe('the regulations page fits at four widths in both themes', () => {
  it('never scrolls sideways, and its words are drawn in both palettes', async () => {
    const html = forTheBrowser(REVOKED)
    for (const width of WIDTHS) {
      const browser = await drawInABrowser(html, { width, height: 900 })
      try {
        for (const theme of [null, 'dark'] as const) {
          await browser.palette(theme)
          const overflow = await browser.page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, `${String(width)}px, ${theme ?? 'light'}: the page scrolls sideways`).toBeLessThanOrEqual(0)
          const ink = await browser.styleOf('.ofc-reg-words', 'color')
          expect(ink, `${String(width)}px, ${theme ?? 'light'}: the owner's sentence has no colour`).not.toBe('')
          expect(ink, `${String(width)}px, ${theme ?? 'light'}: the words are the same colour as the ground`).not.toBe(
            'rgba(0, 0, 0, 0)',
          )
        }
      } finally {
        await browser.close()
      }
    }
  })

  it('names only custom properties tokens.css declares', async () => {
    const browser = await drawInABrowser(forTheBrowser(REVOKED), { width: 1440, height: 900 })
    try {
      const named = [...new Set([...pg.REGULATIONS_CSS.matchAll(/var\((--[a-z0-9-]+)[),]/g)].map((one) => one[1] as string))]
      expect(named.length, 'the sheet names no tokens at all').toBeGreaterThan(3)
      const undeclared = await browser.page.evaluate((names) => {
        const style = getComputedStyle(document.documentElement)
        return (names as string[]).filter((name) => style.getPropertyValue(name).trim() === '')
      }, named)
      expect(undeclared, 'the regulations sheet names custom properties tokens.css does not declare').toEqual([])
    } finally {
      await browser.close()
    }
  })
})
