// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS IN BOTH OF THE OFFICE'S LANGUAGES. Task AP3-49DEWqI0, from a decision.
 *
 * The office's own languages (Chinese and English now) change together. A chapter record, each of its
 * rules and a regulation's title may carry a Chinese half, whose `from` is the hash of the English it
 * was written from (src/shared/english-hash.ts). This file proves:
 *   1. the hash is SHA-256 as its one definition says;
 *   2. the record door refuses a write that changes the English and leaves a Chinese half written from
 *      the old English, with a code the page can draw, and writes nothing;
 *   3. a write that sets both together passes, and a record with no Chinese half is never refused;
 *      a chapter's label (reading level 1) is part of its English, and its Chinese label is drawn where
 *      the English page draws the label;
 *   4. the page draws the Chinese as ordinary text at ?lang=zh;
 *   5. in the test language (a language the office does not keep) it draws the English, marked as
 *      English for a screen reader, and nothing beside it says what language it is in;
 *   6. a Chinese half written from another English is never drawn: on a Chinese page the part is its
 *      English, and nothing beside it says what language it is in;
 *   8. a person gets the title suggestion for a test-created regulation id, while an agent sees no field and is refused;
 *   9. a title written from the regulation's sentence is refused, and a stale saved title stays out of the Chinese link.
 *  10. a rule's neutral twin and a chapter's neutral twin carry a Chinese whose `from` is the hash of the twin's own
 *      English. A write that changes a twin's English or its Chinese, and leaves that Chinese without that `from`, is
 *      refused, and so is a chapter filed with such a twin. A twin the write does not touch is never asked.
 *
 * Every chapter, rule and regulation here is made up. No real chapter's Chinese is in any file.
 *
 * THE MUTATIONS, each run after a control run and each put back after (chapter 5). Each turns this file red:
 *   - M1, the refusal never fires: in `chineseNotFromThisEnglish` (src/shared/office-rules.ts), change
 *     `if (asObject(part.zh)['from'] !== hash) return` to `if (false) return`.
 *   - M2, every Chinese half is refused: the same line with `if (true) return`.
 *   - M3, a stale half is read as current: in `currentHalf`, delete `if (half['from'] !== englishHash(english)) return null`.
 *   - M4, the Chinese page never draws the Chinese: in `inThePageLanguage` (RegulationsPage.tsx), `zh !== null` becomes `zh === undefined`.
 *   - M5, the test language is drawn as English with no lang mark: `language === 'en'` becomes `language !== 'zh'`.
 *   - M7, the hash keeps 15 characters: `ENGLISH_HASH_LENGTH = 15` in src/shared/english-hash.ts.
 *   - M8, the label is left out of the English: `chapterEnglish` returns `''` in place of `chapter.label`.
 *   - M9, a sentence beside a chapter drawn in English: in `Chapter` (RegulationsPage.tsx), after the Conclusion,
 *     `{words.untranslated ? <p>This part is not yet translated.</p> : null}`.
 *   - M10, the same beside a rule drawn in English: after the rule's text, `{read.untranslated ? <p>…</p> : null}`.
 *   - M11, the same beside a regulation's title drawn in English: in `Regulation`, after the title's link,
 *     `{title.untranslated ? <span>…</span> : null}`.
 *   - M12, a rule twin's Chinese is never asked: in `translatedPartsOf`, leave out the part of a rule's twin. Cases 1,
 *     2, 4 and 6 of section 8 turn red.
 *   - M13, a chapter twin's Chinese is never asked: leave out the part of the chapter's twin. Case 5 turns red.
 *   - M14, a rule twin's Chinese is asked against the owner's English: the hash of a rule twin's part is
 *     `theEnglishHashOfARule(rule)`, the owner's. Every case of section 8 but case 5 turns red.
 */

import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { A_HOOK_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishHash } from '../src/shared/english-hash.ts'
import type { PageLanguage } from '../src/shared/i18n.ts'
import {
  type WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

type PageModule = typeof import('../src/web/pages/RegulationsPage.tsx')

let t: TestDb
let app: FastifyInstance
let pg: PageModule
// IMPORTED AFTER THE TEST DATABASE, as the page is: freshDb gives this file a fresh module registry, so
// the page's word reader is the one imported after it, and a static import here would be another one.
let i18n: typeof import('../src/shared/i18n.ts')
let browserApi: typeof import('../src/web/api.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'made-up-agent',
}

// A MADE-UP CHAPTER AND A MADE-UP REGULATION, in both languages.
const LABEL = 'Workshop kettle checks'
const TITLE = 'Every kettle in the workshop is switched off at night'
const SUMMARY = 'The last person to leave checks every kettle.'
const TITLE_ZH = '车间里的每个水壶晚上都要关掉'
const SUMMARY_ZH = '最后离开的人检查每个水壶。'
const RULE = { heading: 'Check the kettles', text: 'Walk past each bench and switch off any kettle still on.' }
const RULE_ZH = { heading: '检查水壶', text: '走过每张工作台，把还开着的水壶关掉。' }
const REG_TITLE = 'Tea breaks are taken away from the benches'
const REG_TITLE_ZH = '喝茶休息要离开工作台'

/** The chapter, with every Chinese half written from its English. */
function aChapter(): Record<string, unknown> {
  return {
    kind: 'module',
    title: TITLE,
    summary: SUMMARY,
    data: {
      context: 'Why this made-up workshop has a chapter.',
      parts: [],
      extra: { chapter: 4 },
      zh: { title: TITLE_ZH, summary: SUMMARY_ZH, from: englishHash([TITLE, SUMMARY, '']) },
      summaryBlocks: [{ id: 'r-1', type: 'text', ...RULE, zh: { ...RULE_ZH, from: englishHash([RULE.heading, RULE.text]) } }],
    },
  }
}

async function file(body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  const data = body['data'] as Record<string, unknown>
  if (body['kind'] === 'module' && (data['extra'] as { chapter?: number } | undefined)?.chapter !== undefined) {
    // A chapter's label and current Chinese name the same English in one record write.
    const zh = data['zh'] as Record<string, unknown> | undefined
    const label = await patch(id, { dataPatch: { shortForms: { label: { text: LABEL, madeFrom: await newestRevision(id), writtenBy: 'human' } }, ...(zh === undefined ? {} : { zh: { ...zh, from: englishHash([String(body['title']), String(body['summary']), LABEL]) } }) } })
    expect(label.statusCode, label.body).toBe(200)
  }
  return id
}

async function patch(id: string, body: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: body })
}

async function patchAs(id: string, body: Record<string, unknown>, headers: Record<string, string>) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: body })
}

async function read(id: string): Promise<{ title: string; summary: string | null; data: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { record?: unknown }
  return (body.record ?? body) as { title: string; summary: string | null; data: Record<string, unknown> }
}

/** The newest revision of a record, which a short form must name to be written. */
async function newestRevision(id: string): Promise<{ seq: number; contentHash: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: AS_THE_PERSON })
  const list = (reply.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = [...list].sort((a, b) => b.seq - a.seq)[0]!
  return { seq: newest.seq, contentHash: newest.contentHash }
}

/** Write a chapter's label through the short-forms door. */
async function writeLabel(id: string, label: string) {
  return app.inject({
    method: 'POST',
    url: `/api/records/${id}/short-forms`,
    headers: AS_THE_PERSON,
    payload: { madeFrom: await newestRevision(id), forms: { label } },
  })
}

/**
 * THE CHANGE-TOGETHER REFUSAL: its code for the page, which draws a plain sentence with no field in it,
 * and the English reply for the writer, which names the field to set and the hash its from must name.
 */
function expectTheRefusal(body: unknown, field: string, hash: string): void {
  const said = body as { code?: string; values?: unknown; error?: string }
  expect(said.code).toBe('chineseHalfNotFromThisEnglish')
  expect(said.values).toEqual({})
  expect(said.error).toContain(`Set ${field} in the same write`)
  expect(said.error).toContain(`"from": "${hash}"`)
}

async function regulations(): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

/**
 * THE WORDS OF ONE ELEMENT OF THE MARKUP, one piece for each text between two tags, with the empty ones left out. The
 * element is the one that `opening` begins, or, given `holding`, the last such one before those words. A sentence
 * drawn beside a part is one more piece, so a case that names every piece of a part proves nothing else is drawn.
 */
function piecesOf(html: string, opening: string, holding?: string): string[] {
  const start = holding === undefined ? html.indexOf(opening) : html.lastIndexOf(opening, html.indexOf(holding))
  expect(start, opening).toBeGreaterThan(-1)
  const tag = /^<([a-z0-9]+)/.exec(opening)![1]!
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  tags.lastIndex = start
  let depth = 0
  let end = -1
  for (let found = tags.exec(html); found !== null; found = tags.exec(html)) {
    depth += found[1] === '/' ? -1 : 1
    if (depth === 0) {
      end = found.index + found[0].length
      break
    }
  }
  expect(end, `the end of ${opening}`).toBeGreaterThan(start)
  return html
    .slice(start, end)
    .split(/<[^>]*>/)
    .map((piece) => piece.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').trim())
    .filter((piece) => piece !== '')
}

/** The opening of a chapter's section on the page. */
const chapterSection = (n: number): string => `<section class="ofc-ch" aria-labelledby="ofc-ch-${n}"`

/** The page's half, drawn in one page language, with the language put back afterwards. */
function drawnIn(language: PageLanguage, said: WhatTheOfficeRegulationsSay): string {
  i18n.setWordLanguage(language)
  try {
    return renderToStaticMarkup(h(pg.TheRegulations, { said }))
  } finally {
    i18n.setWordLanguage('en')
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
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
  i18n = await import('../src/shared/i18n.ts')
  browserApi = await import('../src/web/api.ts')
  // THIS HOOK USES THE SHARED FOUR-MINUTE BUDGET. A fresh database, the API and the page module take about
  // seven seconds here, and the inspector's check of run EPe3dtGr6Fkp saw this hook pass its ten-second
  // limit in a loaded run of ten files while it passed alone (the kind of flake problems jddGW981fri2 and
  // RzOvH_2PKnih describe). With an eleven-second wait added to it, this hook was red under the default
  // and green under sixty (.logs/named-tests-2026-09-29T22-16-24-182.log and 22-16-35-854).
}, A_HOOK_THAT_STARTS_SOMETHING)

afterAll(async () => {
  await app.close()
  t.close()
  delete (globalThis as unknown as { window?: unknown }).window
})

// ============================================================ 1. the hash

describe('the hash a Chinese half names', () => {
  it('is the first 16 hex characters of SHA-256 over the JSON of the English parts', () => {
    for (const parts of [[''], [RULE.heading, RULE.text], [TITLE_ZH, 'x'.repeat(200)], ['a"b\\c', '\n'], ['y'.repeat(55)], ['z'.repeat(64)]]) {
      const expected = createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16)
      expect(englishHash(parts), JSON.stringify(parts)).toBe(expected)
    }
  })
})

// ============================================================ 2. the refusal

describe('the English and the Chinese change together', () => {
  it('refuses a change to a rule\'s English that leaves its Chinese from the old English, and writes nothing', async () => {
    const id = await file(aChapter())
    const before = await read(id)
    const blocks = [{ id: 'r-1', type: 'text', heading: RULE.heading, text: 'A new English text.', zh: { ...RULE_ZH, from: englishHash([RULE.heading, RULE.text]) } }]
    const reply = await patch(id, { dataPatch: { summaryBlocks: blocks } })
    expect(reply.statusCode, reply.body).toBe(400)
    expectTheRefusal(reply.json(), 'data.summaryBlocks[0].zh', englishHash([RULE.heading, 'A new English text.']))
    expect(await read(id)).toEqual(before)
  })

  it('refuses a new chapter title that leaves the chapter\'s Chinese from the old title', async () => {
    const id = await file(aChapter())
    const reply = await patch(id, { title: 'Every kettle is switched off at six' })
    expect(reply.statusCode, reply.body).toBe(400)
    expectTheRefusal(reply.json(), 'data.zh', englishHash(['Every kettle is switched off at six', SUMMARY, LABEL]))
    expect((await read(id)).title).toBe(TITLE)
  })

  it('refuses a new regulation title that leaves its Chinese from the old title', async () => {
    const id = await file({
      kind: 'regulation',
      title: REG_TITLE,
      data: { sentence: 'Made-up words of a made-up person.', binds: 'person', since: '2026-09-11', zh: { title: REG_TITLE_ZH, from: englishHash([REG_TITLE]) } },
    })
    const reply = await patch(id, { title: 'Tea breaks are taken in the yard' })
    expect(reply.statusCode, reply.body).toBe(400)
    expect((reply.json() as { code?: string }).code).toBe('chineseHalfNotFromThisEnglish')
    expect((await read(id)).title).toBe(REG_TITLE)
  })

  it('refuses a chapter filed with a Chinese half that names another English', async () => {
    const chapter = aChapter()
    const data = chapter['data'] as Record<string, unknown>
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { ...chapter, data: { ...data, zh: { title: TITLE_ZH, summary: SUMMARY_ZH, from: '0000000000000000' } } },
    })
    expect(reply.statusCode, reply.body).toBe(400)
    expect((reply.json() as { code?: string }).code).toBe('chineseHalfNotFromThisEnglish')
  })
})

// ============================================================ 3. what passes

describe('what the change-together check lets through', () => {
  it('passes a write that changes the English and sets the Chinese from it in the same write', async () => {
    const id = await file(aChapter())
    const text = 'A new English text.'
    const reply = await patch(id, {
      title: 'Every kettle is switched off at six',
      dataPatch: {
        zh: { title: '每个水壶六点关掉', summary: SUMMARY_ZH, from: englishHash(['Every kettle is switched off at six', SUMMARY, LABEL]) },
        summaryBlocks: [{ id: 'r-1', type: 'text', heading: RULE.heading, text, zh: { ...RULE_ZH, from: englishHash([RULE.heading, text]) } }],
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const after = await read(id)
    expect(after.title).toBe('Every kettle is switched off at six')
    expect((after.data['zh'] as { title: string }).title).toBe('每个水壶六点关掉')
  })

  it('never refuses a chapter with no Chinese half, nor a module that is not a chapter', async () => {
    const id = await file({ kind: 'module', title: 'A chapter nobody translated', summary: 'Its Conclusion.', data: { context: 'why', parts: [], extra: { chapter: 9 }, summaryBlocks: [{ id: 'r-8', type: 'text', heading: 'A rule', text: 'Its text.' }] } })
    expect((await patch(id, { title: 'A chapter still nobody translated' })).statusCode).toBe(200)
    // A MODULE WITHOUT extra.chapter IS A SUBSYSTEM: its zh is stored and nothing here reads or checks it.
    const other = await file({ kind: 'module', title: 'A kettle rack', data: { context: 'why', parts: [], zh: { title: '水壶架', summary: '放水壶的架子', from: 'anything' } } })
    expect((await patch(other, { title: 'A kettle rack, moved' })).statusCode).toBe(200)
  })
})

// ============================================================ 3b. the label

describe('a chapter\'s label is part of the English its Chinese translates', () => {
  it('refuses a new English label that leaves the Chinese from the old one, and passes both in one write', async () => {
    // A CHAPTER WITH NO CHINESE YET TAKES ITS FIRST LABEL THROUGH THE SHORT-FORMS DOOR, unrefused.
    const chapter = aChapter()
    const { zh: _none, ...english } = chapter['data'] as Record<string, unknown>
    const id = await file({ ...chapter, data: { ...english, extra: { chapter: 3 } } })
    const first = await writeLabel(id, 'Kettles')
    expect(first.statusCode, first.body).toBe(200)
    // ITS CHINESE, written from the title, the summary and the label.
    const zh = { title: TITLE_ZH, summary: SUMMARY_ZH, label: '水壶', from: englishHash([TITLE, SUMMARY, 'Kettles']) }
    const add = await patch(id, { dataPatch: { zh } })
    expect(add.statusCode, add.body).toBe(200)

    // A NEW ENGLISH LABEL ALONE, through the short-forms door, is refused and names data.zh.
    const alone = await writeLabel(id, 'Kettle rules')
    expect(alone.statusCode, alone.body).toBe(400)
    expectTheRefusal(alone.json(), 'data.zh', englishHash([TITLE, SUMMARY, 'Kettle rules']))

    // THE SAME LABEL AND ITS CHINESE IN ONE PATCH pass: the stored label, with new words.
    const stored = (await read(id)).data['shortForms'] as { label: Record<string, unknown> }
    const both = await patch(id, {
      dataPatch: {
        shortForms: { label: { ...stored.label, text: 'Kettle rules', madeFrom: await newestRevision(id) } },
        zh: { ...zh, label: '水壶规定', from: englishHash([TITLE, SUMMARY, 'Kettle rules']) },
      },
    })
    expect(both.statusCode, both.body).toBe(200)

    // THE CHINESE PAGE NAMES THE CHAPTER BY ITS CHINESE LABEL, where the English page draws the label.
    const said = await regulations()
    const three = said.chapters.find((one) => one.id === id)!
    expect(three.label).toBe('Kettle rules')
    expect(three.zh?.label).toBe('水壶规定')
    const html = drawnIn('zh', said)
    expect(html).toMatch(/id="ofc-ch-3"[^>]*><span class="num">3<\/span> 水壶规定</)
    expect(drawnIn('en', said)).toMatch(/id="ofc-ch-3"[^>]*><span class="num">3<\/span> Kettle rules</)
  })
})

// ============================================================ 4 to 6. what the page draws

describe('the page draws the regulations in the page language', () => {
  it('draws the Chinese as ordinary text at ?lang=zh, with no mark on it', async () => {
    await file({ ...aChapter(), data: { ...(aChapter()['data'] as Record<string, unknown>), extra: { chapter: 2 } } })
    const said = await regulations()
    const html = drawnIn('zh', said)
    const two = said.chapters.find((one) => one.n === 2)!
    expect(two.zh).toEqual({ title: TITLE_ZH, conclusion: SUMMARY_ZH, label: null })
    expect(html).toContain(TITLE_ZH)
    expect(html).toContain(SUMMARY_ZH)
    expect(html).toContain(RULE_ZH.heading)
    expect(html).toContain(RULE_ZH.text)
    // ITS OWN SECTION OF THE PAGE, chapter 2, carries neither the English nor the mark.
    const section = html.slice(html.indexOf('id="ofc-ch-2"'), html.indexOf('</section>', html.indexOf('id="ofc-ch-2"')))
    expect(section).not.toContain(RULE.text)
    expect(section).not.toContain(SUMMARY)
    expect(section).not.toContain('lang="en"')
  })

  it('draws the English in the test language, marked for a screen reader, with nothing beside it', async () => {
    const said = await regulations()
    const html = drawnIn('xx', said)
    const two = html.slice(html.indexOf('id="ofc-ch-2"'), html.indexOf('</section>', html.indexOf('id="ofc-ch-2"')))
    expect(two).toContain(LABEL)
    expect(two).toContain(RULE.text)
    expect(two).not.toContain(TITLE_ZH)
    expect(two).toContain('lang="en"')
    // EVERY PIECE OF THE CHAPTER, so a sentence drawn beside its English would be one piece too many.
    const open = String(i18n.createI18n('xx').t('regulationsPage.openRecord'))
    expect(piecesOf(html, chapterSection(2))).toEqual(['2', LABEL, open, SUMMARY, '2.1', RULE.heading, RULE.text])
  })

  it('draws the English with no mark on an English page', async () => {
    const html = drawnIn('en', await regulations())
    expect(html).toContain(LABEL)
    expect(html).not.toContain(TITLE_ZH)
    const open = String(i18n.createI18n('en').t('regulationsPage.openRecord'))
    expect(piecesOf(html, chapterSection(2))).toEqual(['2', LABEL, open, SUMMARY, '2.1', RULE.heading, RULE.text])
  })

  it('offers the keyed title suggestion on a made-up regulation id', async () => {
    browserApi.setActor({ type: 'human', id: THE_PERSON })
    const id = await file({
      kind: 'regulation',
      title: 'Every window in the workshop closes before rain',
      data: { sentence: 'Made-up workshop words.', binds: 'person', since: '2026-09-11' },
    })
    const suggestions = pg.REGULATION_CHINESE_TITLE_SUGGESTIONS
    const suggestion = suggestions['Jx1aakVYqZft']
    expect(suggestion).toBeDefined()
    suggestions[id] = suggestion as string
    try {
      const said = await regulations()
      const one = said.regulations.find((regulation) => regulation.id === id)!
      expect(one.zhTitle).toBeNull()
      expect(one.storedZhTitle).toBeNull()
      const html = drawnIn('en', { ...said, regulations: [one] })
      expect(html).toContain('ofc-reg-title-edit')
      expect(html).toContain(`value="${suggestion}"`)
    } finally {
      delete suggestions[id]
    }
  })

  it('keeps a stale title in the field, leaves it off the Chinese title link, and refuses the wrong English source', async () => {
    browserApi.setActor({ type: 'human', id: THE_PERSON })
    const sentence = 'Made-up words about taking tea away from the benches.'
    const id = await file({
      kind: 'regulation',
      title: REG_TITLE,
      data: { sentence, binds: 'person', since: '2026-09-11' },
    })
    const wrongSource = await patch(id, {
      dataPatch: { zh: { title: REG_TITLE_ZH, from: englishHash([sentence]) } },
    })
    expect(wrongSource.statusCode, wrongSource.body).toBe(400)
    expect((wrongSource.json() as { code?: string }).code).toBe('chineseHalfNotFromThisEnglish')
    expect((await read(id)).data['zh']).toBeUndefined()

    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const data = JSON.parse(row.data) as Record<string, unknown>
    data['zh'] = { title: REG_TITLE_ZH, from: englishHash([sentence]) }
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)

    const said = await regulations()
    const one = said.regulations.find((regulation) => regulation.id === id)!
    expect(one.zhTitle).toBeNull()
    expect(one.storedZhTitle).toBe(REG_TITLE_ZH)
    expect(one.zhTitleIsStale).toBe(true)
    const staleEnglish = drawnIn('en', { ...said, regulations: [one] })
    expect(staleEnglish).toContain(String(i18n.t('regZh.titleIsStale')))
    expect(staleEnglish).toContain(`value="${REG_TITLE_ZH}"`)
    const staleChinese = drawnIn('zh', { ...said, regulations: [one] })
    expect(staleChinese).toContain('ofc-reg-link')
    expect(staleChinese).toContain(`>${REG_TITLE}</a>`)
    expect(staleChinese).not.toContain(`>${REG_TITLE_ZH}</a>`)
  })

  it('hides the title field from an agent and refuses the agent write', async () => {
    const id = await file({
      kind: 'regulation',
      title: REG_TITLE,
      data: { sentence: 'Made-up words.', binds: 'person', since: '2026-09-11' },
    })
    const said = await regulations()
    const one = said.regulations.find((regulation) => regulation.id === id)!
    browserApi.setActor({ type: 'agent', id: 'made-up-agent' })
    try {
      const html = drawnIn('en', { ...said, regulations: [one] })
      expect(html).not.toContain('ofc-reg-title-edit')
      const denied = await patchAs(id, {
        dataPatch: { zh: { title: REG_TITLE_ZH, from: englishHash([REG_TITLE]) } },
      }, AS_AN_AGENT)
      expect(denied.statusCode, denied.body).toBe(403)
      expect((await read(id)).data['zh']).toBeUndefined()
    } finally {
      browserApi.setActor({ type: 'human', id: THE_PERSON })
    }
  })

  it('never draws a Chinese half written from another English, even on an old record', async () => {
    // AN OLD RECORD: its English was changed behind the door's back, so its Chinese is from the old
    // English. The door would refuse this write; the row is changed in the database directly.
    const id = await file({ ...aChapter(), data: { ...(aChapter()['data'] as Record<string, unknown>), extra: { chapter: 7 }, summaryBlocks: [{ id: 'r-8', type: 'text', ...RULE, zh: { ...RULE_ZH, from: englishHash([RULE.heading, RULE.text]) } }] } })
    const regulation = await file({
      kind: 'regulation',
      title: REG_TITLE,
      data: { sentence: 'Other made-up words.', binds: 'person', since: '2026-09-11', zh: { title: REG_TITLE_ZH, from: englishHash([REG_TITLE]) } },
    })
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const data = JSON.parse(row.data) as { summaryBlocks: { text: string }[] }
    data.summaryBlocks[0]!.text = 'The English somebody changed later.'
    t.client.sqlite.prepare('UPDATE records SET data = ?, summary = ? WHERE id = ?').run(JSON.stringify(data), 'A later Conclusion.', id)
    t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('A later regulation title', regulation)

    const said = await regulations()
    const seven = said.chapters.find((one) => one.n === 7)!
    expect(seven.zh).toBeNull()
    expect(seven.outline[0]?.zh).toBeNull()
    expect(said.regulations.find((one) => one.id === regulation)?.zhTitle).toBeNull()

    const html = drawnIn('zh', said)
    const section = html.slice(html.indexOf('id="ofc-ch-7"'), html.indexOf('</section>', html.indexOf('id="ofc-ch-7"')))
    expect(section).toContain('The English somebody changed later.')
    expect(section).toContain('A later Conclusion.')
    expect(section).not.toContain(RULE_ZH.text)
    expect(section).not.toContain(SUMMARY_ZH)
    // ON A CHINESE PAGE THE PART IS ITS ENGLISH, AND NOTHING BESIDE IT says what language it is in.
    const open = String(i18n.createI18n('zh').t('regulationsPage.openRecord'))
    expect(piecesOf(html, chapterSection(7))).toEqual(['7', LABEL, open, 'A later Conclusion.', '7.1', RULE.heading, 'The English somebody changed later.'])
    expect(html).toContain('A later regulation title')
    expect(piecesOf(html, '<span class="ofc-reg-name"', '>A later regulation title<')).toEqual(['A later regulation title'])
  })
})

// ============================================================ 8. a neutral twin's Chinese

// A MADE-UP RULE TWIN AND CHAPTER TWIN: the made-up rule and chapter above in neutral words, with their Chinese.
const TWIN = { heading: 'Switch off every kettle', text: 'Walk past each bench and switch off any kettle that is still on.' }
const TWIN_ZH = { heading: '关掉每个水壶', text: '走过每张工作台，关掉仍然开着的水壶。' }
const CHAPTER_TWIN = {
  label: 'Kettle checks',
  title: 'Every kettle is switched off at night',
  conclusion: 'The last one to leave checks every kettle.',
  context: 'Why a made-up workshop checks its kettles.',
}
const CHAPTER_TWIN_ZH = { label: '水壶检查', title: '每个水壶晚上都要关掉', conclusion: '最后离开的人检查每个水壶。' }

describe('a neutral twin\'s Chinese changes with its English', () => {
  /** A rule twin of the made-up rule, with `zh` as its Chinese. Its own `from` names the owner's rule as filed. */
  async function aRuleTwin(english: { heading: string; text: string }, zh: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    return { ...english, zh, zhFrom: 'the chapter records', from: theEnglishHashOfARule({ name: RULE.heading, text: RULE.text }) }
  }

  /** A chapter twin of the made-up chapter, with `zh` as its Chinese. Its own `from` names the chapter as filed. */
  async function aChapterTwin(english: typeof CHAPTER_TWIN, zh: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { theEnglishHashOfAChapter } = await import('../src/shared/office-rules.ts')
    return { ...english, zh, from: theEnglishHashOfAChapter({ title: TITLE, conclusion: SUMMARY, label: LABEL }) }
  }

  /**
   * TWINS ON A RECORD AS THE RECORDS HELD THEM BEFORE A TWIN'S CHINESE NAMED ITS ENGLISH. They are written in the database
   * directly, because the door now refuses a twin whose Chinese names no English, and an old record still holds one. So
   * the write each case makes is the only one that goes through the door.
   */
  function storeTwins(id: string, twins: { rule?: Record<string, unknown>; chapter?: Record<string, unknown> }): void {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const data = JSON.parse(row.data) as { summaryBlocks: Record<string, unknown>[]; neutral?: unknown }
    if (twins.rule !== undefined) data.summaryBlocks[0]!['neutral'] = twins.rule
    if (twins.chapter !== undefined) data.neutral = twins.chapter
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  }

  /** The record's stored blocks with block `i`'s twin replaced: a write of summaryBlocks sends every block. */
  async function blocksWithTwin(id: string, i: number, neutral: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const blocks = (await read(id)).data['summaryBlocks'] as Record<string, unknown>[]
    return blocks.map((block, at) => (at === i ? { ...block, neutral } : block))
  }

  const NEW_TEXT = 'Walk past each bench at six and switch off any kettle that is still on.'

  it('refuses a new English on a rule twin that leaves its Chinese naming no English, and writes nothing', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const id = await file(aChapter())
    storeTwins(id, { rule: await aRuleTwin(TWIN, TWIN_ZH) })
    const before = await read(id)
    const reply = await patch(id, { dataPatch: { summaryBlocks: await blocksWithTwin(id, 0, await aRuleTwin({ ...TWIN, text: NEW_TEXT }, TWIN_ZH)) } })
    expect(reply.statusCode, reply.body).toBe(400)
    expectTheRefusal(reply.json(), 'data.summaryBlocks[0].neutral.zh', theEnglishHashOfARule({ name: TWIN.heading, text: NEW_TEXT }))
    expect(await read(id)).toEqual(before)
  })

  it('refuses the same change when the twin\'s Chinese names the old English, and writes nothing', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const id = await file(aChapter())
    const zh = { ...TWIN_ZH, from: theEnglishHashOfARule({ name: TWIN.heading, text: TWIN.text }) }
    storeTwins(id, { rule: await aRuleTwin(TWIN, zh) })
    const before = await read(id)
    const reply = await patch(id, { dataPatch: { summaryBlocks: await blocksWithTwin(id, 0, await aRuleTwin({ ...TWIN, text: NEW_TEXT }, zh)) } })
    expect(reply.statusCode, reply.body).toBe(400)
    expectTheRefusal(reply.json(), 'data.summaryBlocks[0].neutral.zh', theEnglishHashOfARule({ name: TWIN.heading, text: NEW_TEXT }))
    expect(await read(id)).toEqual(before)
  })

  it('passes the same change when the twin\'s Chinese names the new English', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const id = await file(aChapter())
    storeTwins(id, { rule: await aRuleTwin(TWIN, { ...TWIN_ZH, from: theEnglishHashOfARule({ name: TWIN.heading, text: TWIN.text }) }) })
    const zh = { ...TWIN_ZH, text: '六点走过每张工作台，关掉仍然开着的水壶。', from: theEnglishHashOfARule({ name: TWIN.heading, text: NEW_TEXT }) }
    const reply = await patch(id, { dataPatch: { summaryBlocks: await blocksWithTwin(id, 0, await aRuleTwin({ ...TWIN, text: NEW_TEXT }, zh)) } })
    expect(reply.statusCode, reply.body).toBe(200)
    const stored = ((await read(id)).data['summaryBlocks'] as { neutral: { text: string; zh: unknown } }[])[0]!.neutral
    expect(stored.text).toBe(NEW_TEXT)
    expect(stored.zh).toEqual(zh)
  })

  it('refuses a new Chinese alone on a rule twin, with no from or with a from of another English', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const id = await file(aChapter())
    const twinHash = theEnglishHashOfARule({ name: TWIN.heading, text: TWIN.text })
    storeTwins(id, { rule: await aRuleTwin(TWIN, { ...TWIN_ZH, from: twinHash }) })
    const before = await read(id)
    // THE OWNER'S RULE'S HASH IS THE OTHER ENGLISH: the twin's own from names it, so it is the one a writer may copy by mistake.
    for (const from of [{}, { from: theEnglishHashOfARule({ name: RULE.heading, text: RULE.text }) }]) {
      const zh = { heading: '把水壶都关掉', text: TWIN_ZH.text, ...from }
      const reply = await patch(id, { dataPatch: { summaryBlocks: await blocksWithTwin(id, 0, await aRuleTwin(TWIN, zh)) } })
      expect(reply.statusCode, `${JSON.stringify(from)}: ${reply.body}`).toBe(400)
      expectTheRefusal(reply.json(), 'data.summaryBlocks[0].neutral.zh', twinHash)
    }
    expect(await read(id)).toEqual(before)
  })

  it('refuses a new title, conclusion or label on a chapter twin whose Chinese names no English, and passes the right from', async () => {
    const { theEnglishHashOfAChapter } = await import('../src/shared/office-rules.ts')
    const id = await file(aChapter())
    storeTwins(id, { chapter: await aChapterTwin(CHAPTER_TWIN, CHAPTER_TWIN_ZH) })
    const before = await read(id)
    for (const changed of [
      { title: 'Every kettle is switched off at six' },
      { conclusion: 'The last one to leave at six checks every kettle.' },
      { label: 'Kettles at night' },
    ]) {
      const english = { ...CHAPTER_TWIN, ...changed }
      const reply = await patch(id, { dataPatch: { neutral: await aChapterTwin(english, CHAPTER_TWIN_ZH) } })
      expect(reply.statusCode, `${JSON.stringify(changed)}: ${reply.body}`).toBe(400)
      expectTheRefusal(reply.json(), 'data.neutral.zh', theEnglishHashOfAChapter(english))
    }
    expect(await read(id)).toEqual(before)

    const english = { ...CHAPTER_TWIN, title: 'Every kettle is switched off at six' }
    const zh = { ...CHAPTER_TWIN_ZH, title: '每个水壶六点关掉', from: theEnglishHashOfAChapter(english) }
    const passed = await patch(id, { dataPatch: { neutral: await aChapterTwin(english, zh) } })
    expect(passed.statusCode, passed.body).toBe(200)
    expect(((await read(id)).data['neutral'] as { zh: unknown }).zh).toEqual(zh)
  })

  it('refuses a chapter filed with a rule twin whose Chinese names no English', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const chapter = aChapter()
    const data = chapter['data'] as { summaryBlocks: Record<string, unknown>[] }
    const blocks = [{ ...data.summaryBlocks[0]!, neutral: await aRuleTwin(TWIN, TWIN_ZH) }]
    const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { ...chapter, data: { ...data, summaryBlocks: blocks } } })
    expect(reply.statusCode, reply.body).toBe(400)
    expectTheRefusal(reply.json(), 'data.summaryBlocks[0].neutral.zh', theEnglishHashOfARule({ name: TWIN.heading, text: TWIN.text }))
  })

  it('never refuses a write for a stored twin it does not touch', async () => {
    const { theEnglishHashOfARule } = await import('../src/shared/office-rules.ts')
    const second = { id: 'r-2', type: 'text', heading: 'Empty the kettles', text: 'Pour out the water left in each kettle.' }
    const chapter = aChapter()
    const data = chapter['data'] as { summaryBlocks: Record<string, unknown>[] }
    const id = await file({ ...chapter, data: { ...data, summaryBlocks: [...data.summaryBlocks, second] } })
    // BOTH TWINS AS THE RECORDS HOLD THEM TODAY: their Chinese names no English.
    storeTwins(id, { rule: await aRuleTwin(TWIN, TWIN_ZH), chapter: await aChapterTwin(CHAPTER_TWIN, CHAPTER_TWIN_ZH) })
    const twinsOf = async () => {
      const held = (await read(id)).data
      return { rule: (held['summaryBlocks'] as Record<string, unknown>[])[0]!['neutral'], chapter: held['neutral'] }
    }
    const twins = await twinsOf()

    // THE OWNER'S OWN RULE, a new English with its own Chinese set from it.
    const ownText = 'Walk past each bench and switch off every kettle.'
    const own = (await read(id)).data['summaryBlocks'] as Record<string, unknown>[]
    const ownChanged = own.map((block, at) =>
      at === 0 ? { ...block, text: ownText, zh: { ...RULE_ZH, from: theEnglishHashOfARule({ name: RULE.heading, text: ownText }) } } : block,
    )
    const first = await patch(id, { dataPatch: { summaryBlocks: ownChanged } })
    expect(first.statusCode, first.body).toBe(200)

    // ANOTHER RULE'S TWIN, written with its Chinese from its own English.
    const secondTwin = { heading: 'Empty every kettle', text: 'Pour out any water left in a kettle.' }
    const secondZh = { heading: '倒空每个水壶', text: '把水壶里剩下的水倒掉。', from: theEnglishHashOfARule({ name: secondTwin.heading, text: secondTwin.text }) }
    const withSecond = (await read(id)).data['summaryBlocks'] as Record<string, unknown>[]
    const neutral = { ...secondTwin, zh: secondZh, zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: second.heading, text: second.text }) }
    const next = await patch(id, { dataPatch: { summaryBlocks: withSecond.map((block, at) => (at === 1 ? { ...block, neutral } : block)) } })
    expect(next.statusCode, next.body).toBe(200)

    // THE CHAPTER'S CONTEXT.
    const context = await patch(id, { dataPatch: { context: 'Why a made-up workshop checks its kettles every night.' } })
    expect(context.statusCode, context.body).toBe(200)

    expect(await twinsOf()).toEqual(twins)
  })
})
