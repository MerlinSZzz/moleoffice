// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'

// A saved rule naming a kind of notice this release does not have, written before the office starts, as another release could leave it.
const RETIRED = 'madeUpRetiredNotice'
const recipient = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
let app: LiveApp, db: TestDb
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
beforeAll(async () => {
  db = await freshDb()
  db.client.sqlite.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
  const { asNoticeRulesDoor } = await import('../src/server/lib/notice-rules-door.ts')
  // The record's own shape takes any list of words, so the door files the retired kind as another release would have.
  asNoticeRulesDoor(() => db.api.createRecord({ kind: 'notice_rules', title: 'Personal notice wake rules', workspaceId: MESSAGE_CENTRE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, data: { recipient, mutedKinds: ['theBroadcastIsDue', RETIRED], because: 'Made-up choice from another release' } }))
  app = await liveApp({ name: 'bad-stored-notice-rule', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ person }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person })); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
async function rules() { const r = await fetch(app.api + '/api/messages/notice-rules', { headers }); expect(r.status, await r.clone().text()).toBe(200); return await r.json() as { mutedKinds: string[]; storedButNotUsed: { mutedKinds: unknown; problems: string[] } | null; version: string | null } }
async function open(width = 1440, theme = 'light') {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/messages`); await waitForThePage(app.page, 60_000)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
  const section = app.page.locator('.px-notice-rules')
  if (!(await section.evaluate((node) => (node as HTMLDetailsElement).open))) await section.locator(':scope > summary').click()
  return section
}

it('the office starts and the rules door answers, naming the saved rule it cannot use and using the rest', async () => {
  const reading = await rules()
  expect(reading.mutedKinds).toEqual(['theBroadcastIsDue'])
  expect(reading.storedButNotUsed).toEqual({ mutedKinds: ['theBroadcastIsDue', RETIRED], problems: [`This release has no kind of notice called "${RETIRED}".`] })
}, 60_000)

it('draws the notice of a saved rule not used at 1440 and 390 in the light theme', async () => {
  const folder = process.env.W13R_STRANDING_SHOTS
  if (folder) mkdirSync(folder, { recursive: true })
  const widths = folder ? [1440, 990, 660, 390] : [1440, 390]
  const themes: readonly ('light' | 'dark')[] = folder ? ['light', 'dark'] : ['light']
  for (const width of widths) for (const theme of themes) {
    const section = await open(width, theme)
    const notice = section.locator('[data-notice-rules-not-used]')
    expect(await notice.getAttribute('role')).toBe('status')
    expect(await notice.innerText()).toContain('This release cannot use your saved wake rules as they are saved.')
    expect(await notice.locator('li').allInnerTexts()).toEqual([`This release has no kind of notice called "${RETIRED}".`, 'It asks the secretary to write the report that is due.'])
    expect(await section.getByRole('button', { name: 'Save wake rules', exact: true }).count()).toBe(1)
    expect(await section.getByRole('button', { name: 'Use office wake defaults', exact: true }).count()).toBe(1)
    await section.getByLabel('Why change these rules?').fill('Made-up reason')
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}`).toBe(true)
    if (folder) {
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — saved wake rules for a picture, not real office data', section, 'the Messages page')
      await app.page.screenshot({ path: `${folder}/messages-saved-wake-rule-not-used-${width}-${theme}.png`, fullPage: false })
    }
  }
}, 240_000)

it('the office wake defaults press puts the shipped rules back, and the notice goes', async () => {
  const section = await open()
  expect(await section.locator('[data-notice-rules-not-used]').count()).toBe(1)
  expect(await section.locator('[data-notice-kind=theBroadcastIsDue]').inputValue()).toBe('mute')
  await section.getByLabel('Why change these rules?').fill('Made-up return to the office defaults')
  await section.getByRole('button', { name: 'Use office wake defaults', exact: true }).click()
  await expect.poll(() => section.locator('[data-notice-rules-not-used]').count(), { timeout: 15_000 }).toBe(0)
  expect(await section.locator('[data-notice-kind=theBroadcastIsDue]').inputValue()).toBe('default')
  const reading = await rules()
  expect(reading.mutedKinds).toEqual([]); expect(reading.storedButNotUsed).toBeNull()
  const stored = db.client.sqlite.prepare("SELECT data FROM records WHERE kind='notice_rules' AND deleted_at IS NULL").all() as { data: string }[]
  expect(stored.map(row => JSON.parse(row.data))).toEqual([{ recipient, mutedKinds: [], batchedKinds: [], because: 'Made-up return to the office defaults' }])
  const again = await open()
  expect(await again.locator('[data-notice-rules-not-used]').count()).toBe(0)
}, 120_000)
