// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'
import { keepTheCommentInAReview, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'

// Wave 13q's pictures (report h3Rjf86iBrO5, block b-8): the role cards at 390 ran past the right edge.
// This draws the real Role cards page at 390 and names every box that ends right of the screen.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS
const wordsPicturesOnly = process.env.W13W_READER_SHOTS_ONLY === '1'

beforeAll(async () => {
  app = await liveApp({ name: 'role-cards-390', workspace: 'default', opensAt: 'full', viewport: { width: 390, height: 844 } })
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

/** Every visible box on the page whose right edge is past the screen's, with enough to find it. */
async function pastTheRightEdge(): Promise<string[]> {
  return app.page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const out: string[] = []
    for (const node of document.querySelectorAll<HTMLElement>('main.page *')) {
      if (!node.checkVisibility()) continue
      const box = node.getBoundingClientRect()
      if (box.width === 0 || box.right <= width + 0.5) continue
      // A box a scrolling region cuts off is past the screen too: the reader sees half a card.
      out.push(`${node.tagName.toLowerCase()}.${[...node.classList].join('.')} right=${box.right.toFixed(1)} text=${(node.textContent ?? '').trim().slice(0, 40)}`)
    }
    return out
  })
}

it('draws every role card inside the screen at 390', async () => {
  for (const theme of ['light', 'dark'] as const) {
    await app.page.emulateMedia({ colorScheme: theme })
    await app.page.goto(`${app.site}/?lang=en#/roles`)
    await waitForThePage(app.page)
    await app.page.evaluate(look => document.documentElement.setAttribute('data-theme', look), theme)
    await app.page.locator('main.page .rol-block').first().waitFor({ state: 'attached', timeout: 10_000 })
    const past = await pastTheRightEdge()
    // And no box on the page scrolls sideways: a region that does holds a card the reader sees half of.
    const scroll = await app.page.evaluate(() => Math.max(0, ...[document.documentElement, ...document.querySelectorAll<HTMLElement>('main.page *')]
      .filter(node => node === document.documentElement || /(auto|scroll)/.test(getComputedStyle(node).overflowX))
      .map(node => node.scrollWidth - node.clientWidth)))
    console.log('role cards past the right edge', theme, scroll, JSON.stringify(past.slice(0, 40)))
    if (shots && !wordsPicturesOnly) {
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
      await app.page.screenshot({ path: join(shots, `roles-390-${theme}.png`), fullPage: true })
    }
    expect(past).toEqual([])
    expect(scroll).toBeLessThanOrEqual(0)
  }
})

// MADE-UP card words, supplied by this test's own GET reply. The link must use `words`, even
// where it names a different record from the mirror. Mutation: ignore `words` in RolesPage.
it('opens each declared card’s words record, or says the office holds none, without printing ids', async () => {
  const response = await fetch(`${app.api}/api/roles`)
  expect(response.ok).toBe(true)
  const said = await response.json() as WhatTheRolesSay
  const cards = [...said.cards, ...said.personCards]
  const words: { role: string; record: string | null; fromTheDeclaration: string[] }[] = cards.map((card, index) => ({ role: card.name, record: `MADE-UP-words-${index}`, fromTheDeclaration: [] }))
  const absent = words[words.length - 1]!
  for (const card of cards) {
    card.duties = 'MADE-UP: keeps the paper boats in order.'
    card.howItWorks = { en: '**MADE-UP handbook**\n\n1. Fold a paper boat.\n2. Put the boat on the shelf.', zh: '**MADE-UP 手册**\n\n1. 折一只纸船。' }
    if ('standing' in card) card.standing = 'MADE-UP: reads the boat labels.'
  }
  await app.page.route('**/api/roles', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...said, words } })
  })
  try {
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/roles`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(app.page)
    await app.page.locator('.rol-block').first().waitFor({ timeout: 10_000 })
    const blocks = app.page.locator('.rol-group').filter({ has: app.page.locator('.rol-block') }).locator('.rol-block')
    for (let index = 0; index < cards.length; index++) {
      const block = blocks.nth(index)
      const one = words[index]!
      const link = block.getByRole('link', { name: 'Change these words', exact: true })
      if (one.record !== null) {
        expect(await link.count()).toBe(1)
        expect(await link.getAttribute('href')).toBe(`#/r/${one.record}`)
        expect(await block.innerText()).not.toContain(one.record)
      } else {
        expect(await link.count()).toBe(0)
        expect(await block.locator('.px-absent[title="The office holds no words record for this card."]').count()).toBe(1)
      }
    }
    absent.record = null
    await app.page.reload({ waitUntil: 'domcontentloaded' })
    await waitForThePage(app.page)
    const last = app.page.locator('.rol-block').nth(cards.length - 1)
    expect(await last.getByRole('link', { name: 'Change these words', exact: true }).count()).toBe(0)
    expect(await last.locator('.px-absent[title="The office holds no words record for this card."]').count()).toBe(1)
    if (shots && !wordsPicturesOnly) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.evaluate(look => localStorage.setItem('mole-office.preset.theme', look), theme)
        await app.page.reload()
        await waitForThePage(app.page)
        expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
        for (const width of [1440, 990, 660, 390]) {
          await app.page.setViewportSize({ width, height: 1000 })
          expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
          await app.page.screenshot({ path: join(shots, `roles-${width}-${theme}.png`), fullPage: true })
        }
      }
    }
  } finally {
    await app.page.unroute('**/api/roles')
  }
}, 180_000)

// The record page has no per-kind field reader slot. Its four handbook fields give a link to
// the existing reader instead. Mutation: remove this link from BodyField in RecordPage.
it('links all four handbook fields to their reading on the Roles page', async () => {
  const response = await fetch(`${app.api}/api/roles`)
  const said = await response.json() as WhatTheRolesSay
  const record = said.words.find(one => one.role === 'worker')?.record
  expect(record).toBeTruthy()
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
  const fields = ['howItWorks', 'howItWorksZh', 'inPractice', 'inPracticeZh'] as const
  const patched = await fetch(`${app.api}/api/records/${record!}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ title: 'MADE-UP words for paper boats', dataPatch: {
      duties: 'MADE-UP: folds the paper boats.', reportsTo: 'MADE-UP: answers to the boat keeper.',
      whatEndsIt: 'MADE-UP: the boats are folded.', flow: 'MADE-UP: fold the first boat.',
      workAreaSays: 'MADE-UP: keep the boats on the shelf.', copiedFrom: null, copiedFromCommit: null,
      ...Object.fromEntries(fields.map(key => [key, `**MADE-UP ${key}**\n\n1. Fold a boat.\n2. Read its label.`])),
    } }),
  })
  expect(patched.status, await patched.clone().text()).toBe(200)
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/r/${record!}`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(app.page)
  await app.page.locator('.rd-fold-body').first().waitFor({ timeout: 10_000 })
  for (const heading of ['How it works, in English', 'How it works, in Chinese', 'In practice, in English', 'In practice, in Chinese']) {
    const fold = app.page.locator('.rd-fold-body').filter({ has: app.page.locator('summary', { hasText: heading }) })
    await fold.evaluate(node => { (node as HTMLDetailsElement).open = true })
    expect(await fold.locator('a[href="#/roles"]').count()).toBe(1)
    expect(await fold.locator('textarea').count()).toBe(0)
  }
  const cleared = await fetch(`${app.api}/api/records/${record!}`, {
    method: 'PATCH', headers, body: JSON.stringify({ dataPatch: { inPracticeZh: null } }),
  })
  expect(cleared.status).toBe(200)
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/r/${record!}`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(app.page)
  expect(await app.page.locator('.rd-add').innerText()).toContain('in practice, in Chinese')
  if (shots && !wordsPicturesOnly) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.evaluate(look => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.goto(`${app.site}/?lang=en&mode=inspect#/r/${record!}`, { waitUntil: 'domcontentloaded' })
      await app.page.reload({ waitUntil: 'domcontentloaded' })
      await waitForThePage(app.page)
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
      await app.page.locator('.rd-fold-body').evaluateAll(nodes => { for (const node of nodes) (node as HTMLDetailsElement).open = true })
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
        await app.page.screenshot({ path: join(shots, `card-words-developer-${width}-${theme}.png`), fullPage: true })
      }
    }
  }
}, 180_000)

// MADE-UP stored text in this test's office. Mutation: draw these fields through BodyValue again.
it('draws only handbook bold and keeps each run at its stored offset', async () => {
  const roles = await fetch(`${app.api}/api/roles`)
  expect(roles.ok).toBe(true)
  const said = await roles.json() as WhatTheRolesSay
  const record = said.words.find(one => one.role === 'worker')?.record
  expect(record).toBeTruthy()
  const fields = ['howItWorks', 'howItWorksZh', 'inPractice', 'inPracticeZh'] as const
  const stored = 'MADE-UP: **Read the card first.** Then act. Keep *one star* and `typed`, $5$, [the label](https://example.invalid).\n\n1. Keep the line.\n2. Read **the label**.'
  const drawn = stored.replace('**Read the card first.**', 'Read the card first.').replace('**the label**', 'the label')
  const changed = await fetch(`${app.api}/api/records/${record!}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
    },
    body: JSON.stringify({ dataPatch: Object.fromEntries(fields.map(field => [field, stored])) }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/r/${record!}`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(app.page)
  await app.page.locator('.rd-fold-body').first().waitFor({ timeout: 10_000 })
  await app.page.locator('.rd-fold-body').evaluateAll(nodes => { for (const node of nodes) (node as HTMLDetailsElement).open = true })
  if (shots) {
    const before = process.env.W13W_READER_BEFORE === '1'
    for (const theme of before ? ['light'] as const : ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.evaluate(look => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.reload({ waitUntil: 'domcontentloaded' })
      await waitForThePage(app.page)
      await app.page.locator('.rd-fold-body').first().waitFor({ timeout: 10_000 })
      await app.page.locator('.rd-fold-body').evaluateAll(nodes => { for (const node of nodes) (node as HTMLDetailsElement).open = true })
      for (const width of before ? [1440] : [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
        await app.page.screenshot({ path: join(shots, `card-words-normal-${width}-${theme}.png`), fullPage: true })
      }
    }
  }
  for (const field of fields) {
    const prose = app.page.locator(`.rd-prose:has([data-text-field="data.${field}"]), .rd-prose[data-text-field="data.${field}"]`)
    expect(await prose.count()).toBe(1)
    expect(await prose.locator('strong').allTextContents()).toEqual(['Read the card first.', 'the label'])
    expect(await prose.textContent()).toBe(drawn)
    expect(await prose.textContent()).not.toContain('**')
    expect(await prose.locator('em, code, a, ol, br').count()).toBe(0)
    const bold = prose.locator('strong').first()
    expect(await bold.getAttribute('data-text-field')).toBe(`data.${field}`)
    expect(await bold.getAttribute('data-text-offset')).toBe(String(stored.indexOf('**') + 2))
    if (field === 'howItWorks') {
      await bold.scrollIntoViewIfNeeded()
      await bold.evaluate(node => {
        const range = document.createRange()
        range.setStart(node.firstChild!, 5)
        range.setEnd(node.firstChild!, 13)
        window.getSelection()!.removeAllRanges()
        window.getSelection()!.addRange(range)
        const box = node.getBoundingClientRect()
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 5 }))
      })
      await app.page.locator('.px-talk textarea').first().fill('MADE-UP: check this bold quote.')
      await keepTheCommentInAReview(app.page)
      await app.page.locator('.px-talk-said [data-part="in-the-review"]').waitFor({ timeout: 15_000 })
      const comments = await fetch(`${app.api}/api/messages/comments`)
      expect(comments.ok).toBe(true)
      type Context = { span?: { quote: string; from: number; to: number; field?: string }; place?: { span?: Context['span'] } }
      const held = await comments.json() as { comments: { data: { body?: string; target?: Context; context?: Context } }[] }
      const note = held.comments.find(one => one.data.body === 'MADE-UP: check this bold quote.')
      const context = note?.data.target ?? note?.data.context
      expect(context?.place?.span ?? context?.span).toEqual({ field: `data.${field}`, quote: 'the card', from: stored.indexOf('**') + 7, to: stored.indexOf('**') + 15 })
      await app.page.getByRole('button', { name: 'Back to reading', exact: true }).click()
    }
    const runs = await prose.locator('[data-text-field]').evaluateAll(nodes => nodes.map(node => ({
      field: node.getAttribute('data-text-field'), offset: Number(node.getAttribute('data-text-offset')), text: node.textContent ?? '',
    })))
    expect(runs.map(run => run.text).join('')).toBe(drawn)
    for (const run of runs) {
      expect(run.field).toBe(`data.${field}`)
      expect(stored.slice(run.offset, run.offset + run.text.length)).toBe(run.text)
    }
    expect(await prose.evaluate(node => getComputedStyle(node).whiteSpace)).toBe('normal')
  }
  const response = await fetch(`${app.api}/api/records/${record!}`)
  expect(response.ok).toBe(true)
  const saved = await response.json() as { record: { data: Record<string, string> } }
  for (const field of fields) expect(saved.record.data[field]).toBe(stored)
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/r/${record!}`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(app.page)
  for (const field of fields) {
    const raw = app.page.locator(`.rd-prose[data-text-field="data.${field}"]`)
    expect(await raw.textContent()).toBe(stored)
    expect(await raw.getAttribute('data-text-offset')).toBe('0')
    expect(await raw.locator('strong').count()).toBe(0)
  }
}, 180_000)

