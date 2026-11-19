// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A page's comment readers ask the comments door for the page shape, and still draw the card and the pane. */
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp
let page: string
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-lark' }
const SHOTS = process.env['COMMENTS_SHOTS']
const WHEN = process.env['COMMENTS_SHOTS_WHEN'] ?? 'after'
const REMARK = 'This made-up reading needs one more check.'
const ANSWER = 'Checked again; the made-up reading holds.'
// The answer's id sorts before the remark's, by code unit and by locale.
const REMARK_ID = 'Z9madeUpRmrk'
const ANSWER_ID = 'A1madeUpAnsr'

/** Give a stored message another id in every table that names it, in one transaction. */
function renameAMessage(db: Database.Database, from: string, to: string): void {
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON')
    for (const [table, column] of [['records', 'id'], ['message_delivery', 'message_id'], ['revisions', 'record_id'], ['changes', 'record_id']]) {
      db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(to, from)
    }
  })()
}

async function write(body: unknown, headers = PERSON): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return ((await reply.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'short-comments', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ name: 'Made-up Rowan', language: 'en' }) })
  expect(named.status, await named.text()).toBe(200)
  await write({ kind: 'agent', title: 'Made-up Lark', data: { handle: 'made-up-lark', runtime: 'claude-code', state: 'active' } })
  page = await write({ kind: 'module', title: 'Made-up page for an agent remark', summary: 'A made-up page whose links have a remark.', data: { context: 'This module is only a test fixture.' } })
  const place = { target: { kind: 'region', recordId: page, regionId: 'section.links' }, place: { at: 'surface' } }
  const remark = await write({ kind: 'message', title: 'A made-up remark', data: { body: REMARK, to: [{ kind: 'person', id: THE_PERSON }], target: place } }, AGENT)
  const answer = await write({ kind: 'message', title: 'A made-up answer', data: { body: ANSWER, to: [{ kind: 'agent', id: 'made-up-lark' }], target: place } })
  // THE ANSWER IN THE SAME SECOND AS THE REMARK, WITH AN ID THAT SORTS FIRST. The remark was stored
  // first. A card that breaks a tie of stamps by id takes the answer for the first thing said, and
  // draws nothing. For the pictures the stamps are also fixed, so before and after compare.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = SHOTS ? '2026-10-13 09:00:00' : (db.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(remark) as { at: string }).at
    const stamp = db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?')
    for (const record of SHOTS ? [page, remark, answer] : [answer]) stamp.run(at, at, record)
    renameAMessage(db, remark, REMARK_ID)
    renameAMessage(db, answer, ANSWER_ID)
  } finally { db.close() }
  if (SHOTS) await app.page.clock.setFixedTime(new Date('2026-10-13T09:10:00Z'))
}, 180_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function openThePage(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/r/${page}`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  if (await app.page.locator('.px-chat-close').isVisible()) await app.page.locator('.px-chat-close').click()
  await app.page.locator('.px-comment-circle').first().waitFor({ timeout: 30_000 })
  // The card is drawn when the comments arrive, as the circle is. Where it is not drawn, the case
  // below says so, and the pictures show the page without it.
  await app.page.locator('.px-said').first().waitFor({ timeout: 10_000 }).catch(() => undefined)
}

async function openTheComments(): Promise<void> {
  await app.page.locator('.px-comment-circle').first().click()
  await app.page.locator('.px-pane-title').waitFor({ timeout: 30_000 })
  await app.page.locator('.px-rev-words').first().waitFor({ timeout: 30_000 })
}

it('every comments read on a record page asks for the page shape, and the card and the comments column still say who said what to whom', async () => {
  const whole = await fetch(`${app.api}/api/messages/comments`, { headers: PERSON })
  expect(whole.status).toBe(200)
  const read = (await whole.json()) as { comments: { id: string; data: { body?: string } }[]; recipientNames: Record<string, string | null> }
  const named = read.comments.flatMap(one => typeof read.recipientNames[one.id] === 'string' ? [{ body: one.data.body!, forWhom: read.recipientNames[one.id]! }] : [])
  expect(named.map(one => one.body), 'a comment here has a recipient to name').toContain(ANSWER)
  const asked: URL[] = []
  const listener = (request: import('playwright').Request): void => {
    const url = new URL(request.url())
    if (url.pathname === '/api/messages/comments') asked.push(url)
  }
  app.page.on('request', listener)
  try {
    await openThePage()
    expect(await app.page.locator('.px-said').count(), "no card was drawn for the agent's remark").toBe(1)
    const card = await app.page.locator('.px-said').first().innerText()
    expect(card, "the agent's remark is on its card").toContain(REMARK)
    expect(card, 'and the answer under it').toContain(ANSWER)
    expect(card.indexOf(REMARK), 'oldest first').toBeLessThan(card.indexOf(ANSWER))
    await openTheComments()
    expect(await app.page.locator('.px-pane-title').innerText()).toBe('Comments here')
    const rows = await app.page.locator('.px-rev-item').allInnerTexts()
    const row = rows.find(one => one.includes(REMARK))
    expect(row, 'the remark is in the column').toBeDefined()
    for (const one of named) expect(rows.find(each => each.includes(one.body)), 'with who it was for').toContain(one.forWhom)
    await app.page.waitForTimeout(500)
    expect(asked.length, 'the comments were read').toBeGreaterThan(0)
    expect(asked.map(one => one.search), 'a page reader asked for whole comments').toEqual(asked.map(() => '?shape=page'))
  } finally { app.page.off('request', listener) }
}, 180_000)

// The same made-up office before and after the change, in English, at every required width and look.
it.runIf(SHOTS)('pictures of an agent remark and of the comments column', async () => {
  mkdirSync(SHOTS!, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.emulateMedia({ colorScheme: theme })
    await openThePage()
    await app.page.waitForTimeout(500)
    await app.page.mouse.move(5, 5)
    await app.page.screenshot({ path: join(SHOTS!, `${WHEN}-remark-${width}-${theme}.png`), fullPage: true })
    await openTheComments()
    await app.page.waitForTimeout(500)
    await app.page.mouse.move(5, 5)
    // Whole pages, because at the narrow widths the column is stacked below the page.
    await app.page.screenshot({ path: join(SHOTS!, `${WHEN}-column-${width}-${theme}.png`), fullPage: true })
  }
}, 300_000)
