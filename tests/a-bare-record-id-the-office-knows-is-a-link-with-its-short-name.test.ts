// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BARE RECORD ID THE OFFICE KNOWS IS DRAWN AS A LINK WITH ITS SHORT NAME. Wave 13y, package LK, point 1.
 *
 * `renderInline` in src/shared/inline.ts draws the inside of every line a report, a chat message and every other
 * surface that draws Markdown puts on the screen. A record id written bare in a report was drawn as twelve characters.
 * The chat had a linker of its own, which drew every word of that shape as a link, also one that names no record.
 *
 * WHAT A RECORD ID IS, to the reading: twelve characters that `piecesOfBody` in src/shared/messages.ts reads as one,
 * the rule the chat and the checklist already use. A word of the same shape that names no record stays as it was,
 * because the office answers no row for it. So a guess can never draw a link to nothing.
 *
 * The cases:
 *   1. The door. Each row of POST /api/short-forms/rows at the label length carries the record's own title as well,
 *      and the label stays null where nobody wrote one. An id no record has gets no row.
 *   2. A report's Markdown. A known id with a label is a link to its page that shows the label. A known id with no
 *      label is a link that shows its title and says the title stands in. An id no record has stays plain text. An id
 *      in a code span stays in the code. An id inside the words of an existing link is not a second link. An id inside
 *      bold is a link inside the bold.
 *   3. A long report, naming forty records in paragraphs, a list and a table, asks the names door once.
 *   4. A chat message draws the same: the known id is a link, and the unknown id and the id in a code span are not.
 *
 * Case 1 drives the real door of a test office. Cases 2 to 4 draw in Chromium from a bundle, with the names door
 * answered by hand the way case 1 shows the server answers it. No port is opened. Every id, title and label here is
 * made up.
 *
 * MUTATIONS, each after a green control run, then restored: listed in the round's report.
 */
import { build } from 'esbuild'
import type { FastifyInstance } from 'fastify'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CHAT_WORDS } from '../src/shared/messages.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** Made-up ids of the id alphabet, each with a digit, so `piecesOfBody` reads each as an id. */
const LABELLED = 'lkTest1label'
const UNLABELLED = 'lkTest2title'
const NOBODYS = 'lkTest3nobod'

const LABEL = 'Bracket load test'
const TITLE_OF_LABELLED = 'The steel bracket held at thirty newtons'
const TITLE_OF_UNLABELLED = 'The rubber pad slipped at eleven newtons'

/** What an agent's requests carry. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-bare-ids',
}

describe('the names door answers a title beside each label', () => {
  let t: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    t = await freshDb()
    ;({ app } = await apiApp())
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('gives each row the record title, and no row to an id no record has', async () => {
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const blocks = [{ id: 'b-1', type: 'text', text: 'The bracket was pulled three times on the bench.' }]
    const withALabel = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: TITLE_OF_LABELLED, data: { blocks }, actor: t.api.HUMAN }).id
    const withNone = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: TITLE_OF_UNLABELLED, data: { blocks }, actor: t.api.HUMAN }).id
    const entry = listRevisions(withALabel).revisions[0]
    if (entry === undefined) throw new Error('the record has no revisions')
    const wrote = await app.inject({
      method: 'POST',
      url: `/api/records/${withALabel}/short-forms`,
      headers: AS_AGENT,
      payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms: { label: LABEL } },
    })
    expect(wrote.statusCode, wrote.body).toBeLessThan(300)

    const reply = await app.inject({
      method: 'POST',
      url: '/api/short-forms/rows',
      headers: AS_AGENT,
      payload: { recordIds: [withALabel, withNone, NOBODYS], level: 'label' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const rows = (JSON.parse(reply.body) as { rows: { recordId: string; text: string | null; title?: string | null }[] }).rows
    expect(rows.map((row) => row.recordId), 'an id no record has was given a row').toEqual([withALabel, withNone])
    const labelled = rows.find((row) => row.recordId === withALabel)
    const bare = rows.find((row) => row.recordId === withNone)
    expect(labelled?.text).toBe(LABEL)
    expect(labelled?.title, 'a row does not carry the record title').toBe(TITLE_OF_LABELLED)
    // THE LABEL IS NOT FILLED IN FROM THE TITLE. The title is its own field, so a row still says no label is written.
    expect(bare?.text, 'a row with no label was handed another length').toBeNull()
    expect(bare?.title, 'a row with no label does not carry the record title').toBe(TITLE_OF_UNLABELLED)
  })
})

describe('a bare record id in a report or a chat message', () => {
  let browser: Browser
  let script = ''

  beforeAll(async () => {
    const built = await build({
      stdin: {
        contents: `import './tests/a-page-of-a-test-office.ts';
          import { createElement as h } from 'react';
          import { createRoot } from 'react-dom/client';
          import { api } from './src/web/api.ts';
          import { renderMarkdown } from './src/web/components/SummaryBlocks.tsx';
          import { Body } from './src/web/components/Chat.tsx';
          const asked = [];
          let known = new Map();
          // THE DOOR AS CASE 1 SHOWS IT: a row for each id a record has, its label or null, and its title beside it.
          api.shortFormRows = async (ids, level) => {
            asked.push({ ids: [...ids], level });
            const rows = ids.filter((id) => known.has(id)).map((id) => {
              const one = known.get(id);
              const text = level === 'title' ? one.title : one.label;
              return { recordId: id, level, text, title: one.title, state: text === null ? 'none' : 'current', override: false, by: null, at: null, says: '' };
            });
            return { level, rows, asked: ids.length, note: '' };
          };
          const root = createRoot(document.getElementById('app'));
          window.lk = {
            asked: () => asked,
            know: (records) => { known = new Map(records); },
            report: (md) => root.render(h('div', { className: 'sb', id: 'drawn' }, renderMarkdown(md, 'lk'))),
            chat: (text) => root.render(h('div', { id: 'drawn' }, h(Body, { text }))),
          };`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      loader: { '.css': 'empty' },
      bundle: true,
      write: false,
      // AN ES MODULE, as the other chat tests build theirs: the shared ui reads its pictures by `import.meta.url`, which a
      // classic script leaves empty, and then the whole script stops before it sets anything up.
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    script = built.outputFiles[0]?.text ?? ''
    if (script === '') throw new Error('The test page did not build.')
    browser = await chromium.launch()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
  })

  interface Lk {
    asked: () => { ids: string[]; level: string }[]
    know: (records: [string, { label: string | null; title: string }][]) => void
    report: (md: string) => void
    chat: (text: string) => void
  }

  /** A fresh page, so no name read for one case is held for the next. */
  async function aPage(records: [string, { label: string | null; title: string }][]): Promise<Page> {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('http://bare-ids.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
    await page.goto('http://bare-ids.test/')
    await page.addScriptTag({ type: 'module', content: script })
    // A module script runs after it is added, so the test waits for it, and says the page's own error if it never ran.
    const ready = await page
      .waitForFunction(() => (window as unknown as { lk?: Lk }).lk !== undefined, undefined, { timeout: 10_000 })
      .then(
        () => true,
        () => false,
      )
    if (!ready) throw new Error(`The test page never set itself up. The page said: ${errors.join(' | ') || 'nothing'}`)
    await page.evaluate((all) => (window as unknown as { lk: Lk }).lk.know(all), records)
    return page
  }

  const THE_TWO: [string, { label: string | null; title: string }][] = [
    [LABELLED, { label: LABEL, title: TITLE_OF_LABELLED }],
    [UNLABELLED, { label: null, title: TITLE_OF_UNLABELLED }],
  ]

  /** True once the names door was asked and no id is still waiting for its answer. False when that never happened. */
  async function namesCame(page: Page): Promise<boolean> {
    return page
      .waitForFunction(
        () =>
          (window as unknown as { lk: Lk }).lk.asked().length > 0 &&
          document.querySelectorAll('#drawn [data-named="reading"]').length === 0,
        undefined,
        { timeout: 5_000 },
      )
      .then(
        () => true,
        () => false,
      )
  }

  /** Every link in the drawing, as its address, its words, its mark and its hover words. */
  async function linksIn(page: Page): Promise<{ href: string; words: string; named: string | null; says: string | null }[]> {
    return page.$$eval('#drawn a', (all) =>
      all.map((one) => ({
        href: one.getAttribute('href') ?? '',
        words: (one.textContent ?? '').trim(),
        named: one.getAttribute('data-named'),
        says: one.getAttribute('title'),
      })),
    )
  }

  it('links a known id with its label or its title, and leaves the rest as they were', async () => {
    const page = await aPage(THE_TWO)
    const md = [
      `The result is in ${LABELLED}, and the other pull is in ${UNLABELLED}.`,
      '',
      `Nothing is filed as ${NOBODYS}. The id \`${LABELLED}\` is quoted in code.`,
      '',
      `See [the pull of ${UNLABELLED}](#/r/${LABELLED}) and **the bracket ${LABELLED}**.`,
    ].join('\n')
    await page.evaluate((text) => (window as unknown as { lk: Lk }).lk.report(text), md)
    expect(await namesCame(page), 'the names door was never asked about the ids in a report').toBe(true)

    const links = await linksIn(page)
    const toLabelled = links.filter((one) => one.href === `#/r/${LABELLED}`)
    const toUnlabelled = links.filter((one) => one.href === `#/r/${UNLABELLED}`)
    // THREE LINKS TO THE LABELLED RECORD: the bare id, the existing link, and the id inside bold.
    expect(toLabelled.map((one) => one.words), 'a known id with a label is not a link that shows its label').toEqual([
      LABEL,
      `the pull of ${UNLABELLED}`,
      LABEL,
    ])
    expect(toLabelled[0]?.named).toBe('label')
    expect(toUnlabelled.map((one) => one.words), 'a known id with no label is not a link that shows its title').toEqual([
      TITLE_OF_UNLABELLED,
    ])
    expect(toUnlabelled[0]?.named).toBe('title')
    expect(toUnlabelled[0]?.says, 'the link does not say the title stands in for a label').toBe(CHAT_WORDS.titleStandsInForTheLabel)

    const drawn = await page.$eval('#drawn', (box, nobodys) => ({
      words: box.textContent ?? '',
      linksToNobody: box.querySelectorAll(`a[href*="${nobodys}"]`).length,
      inCode: [...box.querySelectorAll('code')].map((one) => ({ words: one.textContent ?? '', links: one.querySelectorAll('a').length })),
      linksInLinks: box.querySelectorAll('a a').length,
      inBold: box.querySelectorAll('strong a').length,
    }), NOBODYS)
    expect(drawn.linksToNobody, 'an id no record has became a link').toBe(0)
    expect(drawn.words, 'an id no record has is not drawn as itself').toContain(`Nothing is filed as ${NOBODYS}.`)
    expect(drawn.inCode, 'an id in a code span did not stay as it was quoted').toEqual([{ words: LABELLED, links: 0 }])
    expect(drawn.linksInLinks, 'an id inside an existing link became a second link').toBe(0)
    expect(drawn.inBold, 'an id inside bold is not a link inside the bold').toBe(1)
    await page.close()
  }, 60_000)

  it('asks the names door once for a long report', async () => {
    const ids = Array.from({ length: 40 }, (_, n) => `lkLong${String(n).padStart(6, '0')}`)
    const page = await aPage(ids.map((id, n) => [id, { label: n % 2 === 0 ? `Label ${String(n)}` : null, title: `Title of record ${String(n)}` }]))
    const md = [
      '## Results',
      '',
      ...ids.slice(0, 10).map((id) => `The pull ${id} is done.`),
      '',
      ...ids.slice(10, 20).map((id) => `- one item names ${id}`),
      '',
      '| Record | What |',
      '| --- | --- |',
      ...ids.slice(20, 30).map((id) => `| ${id} | a row |`),
      '',
      ids.slice(30).join(', '),
    ].join('\n')
    await page.evaluate((text) => (window as unknown as { lk: Lk }).lk.report(text), md)
    expect(await namesCame(page), 'the names door was never asked about the ids in a report').toBe(true)
    // A SECOND READ WOULD ARRIVE AFTER THE FIRST ANSWER, so the count is read once that has had time to happen.
    await page.waitForTimeout(300)
    const asked = await page.evaluate(() => (window as unknown as { lk: Lk }).lk.asked())
    expect(asked.length, 'a long report asked the names door more than once').toBe(1)
    expect(new Set(asked[0]?.ids), 'the one request did not ask about every id').toEqual(new Set(ids))
    const linked = new Set((await linksIn(page)).map((one) => one.href))
    expect(linked, 'not every known id in the report is a link').toEqual(new Set(ids.map((id) => `#/r/${id}`)))
    await page.close()
  }, 60_000)

  it('draws the same in a chat message', async () => {
    const page = await aPage(THE_TWO)
    await page.evaluate(
      (text) => (window as unknown as { lk: Lk }).lk.chat(text),
      `The result is in ${LABELLED}. Nothing is filed as ${NOBODYS}. Quoted: \`${UNLABELLED}\`.`,
    )
    expect(await namesCame(page), 'the names door was never asked about the ids in a message').toBe(true)
    await page.waitForFunction((id) => document.querySelector(`#drawn a[href="#/r/${id}"][data-named]`) !== null, LABELLED, { timeout: 5_000 })
    const links = await linksIn(page)
    expect(links.map((one) => [one.href, one.words]), 'a message does not draw only the known id as a link').toEqual([
      [`#/r/${LABELLED}`, LABEL],
    ])
    const words = await page.$eval('#drawn', (box) => box.textContent ?? '')
    expect(words, 'an id no record has is not drawn as itself in a message').toContain(`Nothing is filed as ${NOBODYS}.`)
    expect(await page.$$eval('#drawn code', (all) => all.map((one) => one.textContent ?? ''))).toEqual([UNLABELLED])
    await page.close()
  }, 60_000)
})
