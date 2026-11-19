// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

// Three saved words this release cannot use, written before the office starts, as an older or newer release could leave them.
const UNKNOWN = 'madeUp.retired.word', EMPTY = 'g6a.working.roster', NOT_JSON = 'kind.task'
let app: LiveApp, db: TestDb
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
interface NotUsed { key: string; stored: unknown; problems: string[]; version: string }
beforeAll(async () => {
  db = await freshDb()
  db.client.sqlite.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
  const put = db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)')
  put.run('office.word:' + UNKNOWN, JSON.stringify({ en: 'Made-up word from a release that had it', zh: null, zhFrom: null }))
  put.run('office.word:' + EMPTY, JSON.stringify({ en: '', zh: null, zhFrom: null }))
  put.run('office.word:' + NOT_JSON, 'made-up text that is not JSON {')
  app = await liveApp({ name: 'bad-stored-page-word', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ person }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person })); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
async function table() { const r = await fetch(app.api + '/api/words/table?search=' + encodeURIComponent('made-up'), { headers }); expect(r.status, await r.clone().text()).toBe(200); return await r.json() as { storedButNotUsed: NotUsed[] } }
const notUsed = async (key: string) => (await table()).storedButNotUsed.find(one => one.key === key)
const storedRow = (key: string) => db.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name=?').get('office.word:' + key) as { value: string } | undefined
const ledger = (key: string) => db.client.sqlite.prepare('SELECT old_value, new_value FROM changes WHERE record_id=? ORDER BY rowid').all('setting:word:' + key) as { old_value: string; new_value: string }[]
const removeFromShipped = (key: string, version: string, because: string) => fetch(app.api + '/api/words/restore', { method: 'POST', headers, body: JSON.stringify({ key, version, from: 'shipped', because }) })
async function open(width = 1440, theme = 'light') {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/settings/words`); await app.page.reload(); await waitForThePage(app.page, 60_000)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
  await app.page.locator('[data-word-table]').waitFor()
}

it('the office starts and the word door names each saved word it cannot use, with its stored value and problems', async () => {
  const reply = await table()
  expect(reply.storedButNotUsed.map(one => one.key)).toEqual([EMPTY, NOT_JSON, UNKNOWN])
  expect(await notUsed(UNKNOWN)).toMatchObject({ stored: { en: 'Made-up word from a release that had it' }, problems: [`This release has no page word with the key ${UNKNOWN}.`] })
  expect(await notUsed(EMPTY)).toMatchObject({ stored: { en: '' }, problems: ['English: Each required word must contain text, within 4000 characters.'] })
  expect(await notUsed(NOT_JSON)).toMatchObject({ stored: 'made-up text that is not JSON {', problems: ['The saved choice is not readable JSON.'] })
  // None of them is used: the browser receives no saved word, and the shipped word stands where the release has one.
  expect((await (await fetch(app.api + '/api/words/effective', { headers })).json()).words).toEqual({})
  const empty = await (await fetch(app.api + '/api/words/table?key=' + EMPTY, { headers })).json()
  expect(empty.words[0].en).toBe(empty.words[0].shipped.en)
  expect(empty.storedButNotUsed.map((one: NotUsed) => one.key)).toEqual([EMPTY, NOT_JSON, UNKNOWN])
}, 60_000)

it('draws the notice of saved words not used at 1440 and 390 in light', async () => {
  const folder = process.env.W13R_STRANDING_SHOTS
  if (folder) mkdirSync(folder, { recursive: true })
  for (const width of [1440, 390]) for (const theme of ['light'] as const) {
    await open(width, theme)
    const notice = app.page.locator('[data-words-not-used]')
    expect(await notice.getAttribute('role')).toBe('status')
    expect(await notice.locator('[data-word-not-used]').count()).toBe(3)
    expect(await notice.innerText()).toContain('This release cannot use 3 saved words, so they are not used.')
    await notice.getByLabel('Why remove a saved word?', { exact: true }).fill('Made-up reason')
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}`).toBe(true)
  }
  if (folder) for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
    await open(width, theme)
    const notice = app.page.locator('[data-words-not-used]')
    await notice.getByLabel('Why remove a saved word?', { exact: true }).fill('Made-up reason')
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — saved words for a picture, not real office data', notice, 'the Words page')
    await app.page.screenshot({ path: `${folder}/settings-words-saved-words-not-used-${width}-${theme}.png`, fullPage: false })
  }
}, 240_000)

it('the shipped restore removes an unknown key and a row that is not JSON, needs the version read and a reason, and writes the ledger', async () => {
  const unknown = (await notUsed(UNKNOWN))!
  const stale = await removeFromShipped(UNKNOWN, 'made-up-stale-version', 'Made-up stale press')
  expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ code: 'wordSettingRefused' })
  expect((await removeFromShipped(UNKNOWN, unknown.version, '')).status).toBe(400)
  expect(storedRow(UNKNOWN)).toBeDefined(); expect(ledger(UNKNOWN)).toEqual([])
  const removed = await removeFromShipped(UNKNOWN, unknown.version, 'Made-up removal of a retired word')
  expect(removed.status, await removed.clone().text()).toBe(200)
  expect(await removed.json()).toMatchObject({ key: UNKNOWN, removed: true })
  expect(storedRow(UNKNOWN)).toBeUndefined()
  const [entry] = ledger(UNKNOWN)
  expect(JSON.parse(entry!.old_value)).toEqual({ choice: null, storedButNotUsed: unknown.stored })
  expect(JSON.parse(entry!.new_value)).toEqual({ choice: null, because: 'Made-up removal of a retired word' })

  const notJson = (await notUsed(NOT_JSON))!
  const putBack = await removeFromShipped(NOT_JSON, notJson.version, 'Made-up removal of an unreadable word')
  expect(putBack.status, await putBack.clone().text()).toBe(200)
  expect((await putBack.json()).en).toBe('task')
  expect(storedRow(NOT_JSON)).toBeUndefined()
  expect(JSON.parse(ledger(NOT_JSON)[0]!.old_value).storedButNotUsed).toBe('made-up text that is not JSON {')
  expect((await table()).storedButNotUsed.map(one => one.key)).toEqual([EMPTY])
}, 60_000)

it('a press on the word page removes a saved word with an empty required value, and the notice goes', async () => {
  await open()
  const notice = app.page.locator('[data-words-not-used]')
  expect(await notice.locator(`[data-word-not-used="${EMPTY}"]`).innerText()).toContain('Each required word must contain text')
  const press = notice.getByRole('button', { name: 'Remove this saved word', exact: true })
  expect(await press.isDisabled()).toBe(true)
  await notice.getByLabel('Why remove a saved word?', { exact: true }).fill('Made-up removal of an empty word')
  await press.click()
  await expect.poll(() => app.page.locator('[data-words-not-used]').count(), { timeout: 15_000 }).toBe(0)
  expect((await table()).storedButNotUsed).toEqual([])
  expect(storedRow(EMPTY)).toBeUndefined()
  expect(JSON.parse(ledger(EMPTY)[0]!.new_value).because).toBe('Made-up removal of an empty word')
  await app.page.reload(); await waitForThePage(app.page, 60_000); await app.page.locator('[data-word-table]').waitFor()
  expect(await app.page.locator('[data-words-not-used]').count()).toBe(0)
}, 120_000)
