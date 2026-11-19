// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { GatesReading, TheSpoolHandedOver } from '../src/server/api/runtime-settings.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { GATE_CLASSES, GATE_GROUPS, GATES } from '../src/config/gates.mjs'
import { GATES_THE_SPOOL_WAITS_FOR } from '../src/config/gate-count-spool.mjs'
import { englishWords } from '../src/shared/words/joined.ts'
import { listJoined, t, type WordKey } from '../src/shared/i18n.ts'

// All values and reasons belong to this test's temporary office.
let app: LiveApp
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const panel = () => app.page.locator('[data-target="uiSurface/settings.gates"]')
const row = (id: string) => panel().locator(`[data-gate="${id}"]`)
// The old Settings address still opens the Gates reading. Each row has its own edit press.
async function open(mode = 'normal', language = 'en') {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&mode=${mode}#/settings/gates`)
  await waitForThePage(app.page, 30_000)
  await panel().waitFor()
  await expect.poll(() => new URL(app.page.url()).hash).toBe('#/gates')
}
async function edit(id: string) { await row(id).locator(':scope > button').first().click() }
async function ready() { await row('conflict-resolving').waitFor() }
async function saveThroughTheDoor(name: string, value: string | null, because: string) {
  const response = await fetch(`${app.api}/api/office/settings`, { method: 'POST', headers, body: JSON.stringify({ changes: [{ name, value }], because }) })
  expect(response.status, await response.clone().text()).toBe(200)
}
beforeAll(async () => {
  app = await liveApp({ name: 'gates-panel', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.page.addInitScript((owner) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: owner })), THE_TEST_OFFICES_OWNER.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

it('draws Gates as a page after Office regulations, with independently editable rows and all classes and groups', async () => {
  // Test change (wave 13y round 165): the Office group's rows are listed on All pages now, so they are read there first.
  await app.page.goto(`${app.site}/?lang=en#/all-pages`)
  await app.page.locator('#main .ap-group[data-group="office"] a.ap-page').first().waitFor({ timeout: 30_000 })
  const rows = await app.page.locator('#main .ap-group[data-group="office"] a.ap-page').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
  await open(); await ready()
  const rowsRead = await panel().locator('[data-gate]').count()
  expect(rowsRead).toBeGreaterThan(0)
  expect(await panel().locator('fieldset, input, select, textarea').count()).toBe(0)
  await edit('checks-an-hour')
  expect(await row('checks-an-hour').locator('fieldset').count()).toBe(1)
  expect(await row('conflict-resolving').locator('fieldset').count()).toBe(0)
  expect(await panel().locator('[data-gate]').count()).toBe(rowsRead)
  expect(rows[rows.indexOf('#/regulations') + 1]).toBe('#/gates')
  expect(await app.page.locator('.pfs [data-target="uiSurface/settings.gates"] [data-gate-class]').first().isVisible()).toBe(true)
  expect(await panel().locator('[data-gate-class] > h3').allTextContents()).toEqual(['Safety', 'Privacy', 'Quality', 'House rules', 'Process'])
  // Which classes are empty, and which rows sit under each group, are read from the gate list, so a new row changes no line here.
  for (const name of GATE_CLASSES.filter((one) => !GATE_GROUPS.some((group) => group.class === one))) {
    const section = panel().locator(`[data-gate-class="${name}"]`)
    expect(await section.innerText()).toContain('None yet.')
    expect(await section.locator('[data-gate-group], [data-gate]').count()).toBe(0)
  }
  for (const { class: name, group } of GATE_GROUPS) {
    expect(await panel().locator(`[data-gate-class="${name}"] [data-gate-group="${group}"] [data-gate]`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-gate'))), `${name} ${group}`).toEqual(GATES.filter((one) => one.class === name && one.group === group).map(({ id }) => id))
  }
  // One row is named by its id: the switch that hands a red only with the entry to the entry's own supervisor sits under Process, Switches.
  expect(GATES.find((one) => one.id === 'red-fixing'), 'the red-fixing gate').toMatchObject({ class: 'process', group: 'switches' })
  // The group headings are read from the gate list and its words, so a new group changes no line here: every group has its heading, in the list's order, and nothing else is drawn as one.
  // The who-may-act group's heading says how many gates it holds, counted from the list and worded from the word list,
  // and its rows are folded away. Every heading is read from the list of groups, class by class, and from the word list,
  // so a new group changes no line here.
  const whoMayAct = t('gates.group.counted', { group: t('gates.group.who-may-act'), n: GATES.filter((one) => one.group === 'who-may-act').length })
  expect(await panel().locator('[data-gate-group] > h4').allTextContents()).toEqual(GATE_GROUPS.map(({ group }) => group === 'who-may-act' ? whoMayAct : englishWords()[`gates.group.${group}` as never]))
  const headings = GATE_CLASSES.flatMap((name) => GATE_GROUPS.filter((one) => one.class === name)).map(({ group }) => group === 'who-may-act' ? whoMayAct : t(`gates.group.${group}` as WordKey))
  expect(await panel().locator('[data-gate-group] > h4').allTextContents()).toEqual(headings)
  const folded = panel().locator('[data-gate-group="who-may-act"] > details')
  expect(await folded.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false)
  expect(await folded.locator('[data-gate]').first().isVisible()).toBe(false)
  await folded.locator('> summary').click()
  expect(await folded.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true)
  expect(await folded.locator('[data-gate]').first().isVisible()).toBe(true)
  expect(await panel().locator('[data-gate-group]:not([data-gate-group="who-may-act"]) details').count()).toBe(0)
  for (const id of ['release-spacing', 'agent-hops', 'counter-spacing', 'run-messages']) await edit(id)
  expect(await row('checks-an-hour').getByLabel('From 1 to 6', { exact: true }).getAttribute('step')).toBe('1')
  expect(await row('release-spacing').getByLabel('From 1 to 1440', { exact: true }).getAttribute('step')).toBe('1')
  // Zero stays a number the hops may be set to, and a counter's spacing starts at its floor of thirty.
  expect(await row('agent-hops').getByLabel('From 0 to 100', { exact: true }).getAttribute('step')).toBe('1')
  expect(await row('counter-spacing').getByLabel('From 30 to 1440', { exact: true }).getAttribute('step')).toBe('1')
  expect(await row('run-messages').getByLabel('From 0 to 1000', { exact: true }).getAttribute('step')).toBe('1')
  // The spacing is an owner-decided setting, so its row says a change needs the person's words, as Office controls says of such a setting.
  expect(await row('release-spacing').innerText()).toContain('Changed by you, or a secretary carrying your exact values.')
  expect(await row('checks-an-hour').innerText()).not.toContain('carrying your exact values')
  expect(await panel().innerText()).toContain('Defaults of an office that builds Mole Office.')
  expect(await panel().locator('.gates-history').count()).toBe(GATES.length)
  await open('inspect'); await ready()
}, 90_000)

it('requires a reason before sending, saves a switch, reads its new position and reason, and puts back the default', async () => {
  await saveThroughTheDoor('MOLE_OFFICE_CONFLICT_RESOLVING', null, 'Made-up clean start')
  await open(); await ready()
  const gate = row('conflict-resolving')
  await edit('conflict-resolving')
  let sent = 0
  const requests: unknown[] = []
  const listener = (request: import('playwright').Request) => {
    if (request.url().endsWith('/api/office/settings') && request.method() === 'POST') { sent++; requests.push(request.postDataJSON()) }
  }
  app.page.on('request', listener)
  try {
    await gate.getByRole('button', { name: 'On', exact: true }).click()
    expect(await gate.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true)
    await gate.getByLabel('Reason (required)', { exact: true }).fill('   ')
    expect(await gate.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true)
    expect(sent).toBe(0)
    await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up reason for the supervisor hour')
    await gate.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => gate.locator('.gates-position').innerText()).toContain('In force: On')
    expect(await gate.locator('fieldset').count()).toBe(0)
    expect(await gate.locator('.gates-history').innerText()).toContain('Made-up reason for the supervisor hour')
    expect(await gate.locator('.gates-history').innerText()).toContain('from Off to On')
    expect(await gate.locator('.gates-history').innerText()).toContain(THE_TEST_OFFICES_OWNER.name)
    expect(requests).toEqual([{ changes: [{ name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: '1' }], because: 'Made-up reason for the supervisor hour' }])
    await edit('conflict-resolving')
    await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up return to the default')
    await gate.getByRole('button', { name: 'Put back the default', exact: true }).click()
    await expect.poll(() => gate.locator('.gates-position').innerText()).toContain('In force: Off')
    expect(await gate.locator('fieldset').count()).toBe(0)
    expect(requests.at(-1)).toEqual({ changes: [{ name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: null }], because: 'Made-up return to the default' })
  } finally { app.page.off('request', listener) }
}, 90_000)

it('draws one press for each position a row allows, in both languages, and saves remind only', async () => {
  await saveThroughTheDoor('MOLE_OFFICE_GATE_HOUSE_RULES', null, 'Made-up clean start')
  await open(); await ready()
  for (const id of ['house-rule-reds', 'file-territories', 'few-feature-reds', 'wide-red', 'flaky-tests', 'placeholder-addresses', 'before-the-seal', 'retire-while-owed']) await edit(id)
  const presses = (id: string) => row(id).locator('.gates-actions').first().getByRole('button').allTextContents()
  expect(await presses('house-rule-reds')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('file-territories')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('few-feature-reds')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('wide-red')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('flaky-tests')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('placeholder-addresses')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('before-the-seal')).toEqual(['Block', 'Remind only', 'Off'])
  expect(await presses('retire-while-owed')).toEqual(['Block', 'Off'])
  const gate = row('house-rule-reds')
  expect(await gate.locator('.gates-position').innerText()).toContain('In force: Block')
  expect(await gate.getByRole('button', { name: 'Block', exact: true }).getAttribute('aria-pressed')).toBe('true')
  await gate.getByRole('button', { name: 'Remind only', exact: true }).click()
  await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up move to the design position')
  const sent = app.page.waitForRequest((request) => request.url().endsWith('/api/office/settings') && request.method() === 'POST')
  await gate.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await sent).postDataJSON()).toEqual({ changes: [{ name: 'MOLE_OFFICE_GATE_HOUSE_RULES', value: 'remind' }], because: 'Made-up move to the design position' })
  await expect.poll(() => gate.locator('.gates-position').innerText()).toContain('In force: Remind only')
  expect(await gate.locator('.gates-history').innerText()).toContain('from Block to Remind only')
  await open('normal', 'zh'); await ready()
  await edit('house-rule-reds')
  expect(await presses('house-rule-reds')).toEqual(['拦下', '只提醒', '关闭'])
  await saveThroughTheDoor('MOLE_OFFICE_GATE_HOUSE_RULES', null, 'Made-up return to the default')
}, 90_000)

it('leaves the position and history in force on a refusal and draws the door’s words under the row', async () => {
  await open(); await ready()
  const gate = row('checks-an-hour')
  await edit('checks-an-hour')
  const before = await gate.locator('.gates-position').innerText()
  const history = await gate.locator('.gates-history').innerText()
  await gate.getByLabel('From 1 to 6', { exact: true }).fill('7')
  await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up refused number')
  const response = app.page.waitForResponse((response) => response.url().endsWith('/api/office/settings') && response.request().method() === 'POST')
  await gate.getByRole('button', { name: 'Save', exact: true }).click()
  const refused = await response
  expect(refused.status()).toBe(400)
  const words = await refused.json() as { error: string }
  await expect.poll(() => gate.innerText()).toContain(words.error)
  expect(await gate.locator('.gates-position').innerText()).toBe(before)
  expect(await gate.locator('.gates-history').innerText()).toBe(history)
}, 60_000)

it('replaces each gate control in Office controls with a line linking to Gates', async () => {
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings/officecontrols`)
  await waitForThePage(app.page, 30_000)
  const controls = app.page.locator('[data-target="uiSurface/settings.officecontrols"]')
  for (const { setting: name } of GATES) {
    const moved = controls.locator(`[data-setting="${name}"]`)
    await moved.waitFor()
    // "page", not "panel", since Gates became a page (wave 13y round 125, the wording in message 2Wtk1ADj3F4L).
    expect(await moved.innerText()).toBe('This setting is changed on the Gates page.')
    expect(await moved.getByRole('link').getAttribute('href')).toBe('#/gates')
    expect(await moved.locator('button, input, summary').count()).toBe(0)
  }
}, 60_000)

it('disables every box and press when the reading says this caller may not change the gates', async () => {
  await app.page.route('**/api/office/gates', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), mayChange: false, mayChangeThePersonsOwn: false, office: { kind: 'ordinary', because: 'runs-from-an-installed-build' } } })
  })
  try {
    await open(); await ready()
    expect(await panel().innerText()).toContain('This office runs from an installed build, so it uses the defaults of an ordinary office.')
    const controls = panel().locator('.gates button, .gates input')
    expect(await controls.count()).toBeGreaterThan(10)
    for (const control of await controls.all()) expect(await control.isDisabled()).toBe(true)
    expect(await panel().getByText('Changed by you or a secretary.', { exact: true }).count()).toBe(GATES.filter((one) => one.whoMayChange === 'the-person-or-a-secretary').length)
    expect(await panel().getByText(t('gates.whoThePerson'), { exact: true }).count()).toBe(GATES.filter((one) => one.whoMayChange === 'the-person').length)
  } finally { await app.page.unroute('**/api/office/gates') }
}, 60_000)

it('enables only the gates this caller may change', async () => {
  await app.page.route('**/api/office/gates', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), mayChange: true, mayChangeThePersonsOwn: false } })
  })
  try {
    await open(); await ready()
    for (const { id, whoMayChange } of GATES) {
      const press = row(id).locator(':scope > button').first()
      expect(await press.isDisabled(), `${id}: ${whoMayChange}`).toBe(whoMayChange === 'the-person')
    }
  } finally { await app.page.unroute('**/api/office/gates') }
}, 90_000)

it('says when the reading is loading or failed, and can read again after a failure', async () => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => { release = resolve })
  await app.page.route('**/api/office/gates', async (route) => { await waiting; await route.continue() })
  try {
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/settings/gates`)
    await panel().waitFor()
    expect(await panel().textContent()).toContain('Reading gates')
    release(); await ready()
  } finally { release(); await app.page.unrouteAll({ behavior: 'wait' }) }
  await app.page.route('**/api/office/gates', async (route) => route.fulfill({ response: await route.fetch(), status: 500, json: { error: 'Made-up gates reading failure' } }))
  try {
    await open()
    await expect.poll(() => panel().innerText()).toContain('The gates could not be read.')
    expect(await panel().locator('[data-gate-class]').count()).toBe(0)
  } finally { await app.page.unroute('**/api/office/gates') }
  await panel().getByRole('button', { name: 'Read again', exact: true }).click()
  await ready()
}, 90_000)

it('says a change was saved when only the following read fails, then reads again without another save', async () => {
  await saveThroughTheDoor('MOLE_OFFICE_CONFLICT_RESOLVING', null, 'Made-up start before a failed read')
  let saved = false, writes = 0
  await app.page.route('**/api/office/settings', async (route) => {
    const response = await route.fetch()
    if (route.request().method() === 'POST') { writes++; saved = response.ok() }
    await route.fulfill({ response })
  })
  await app.page.route('**/api/office/gates', async (route) => {
    if (saved) await route.fulfill({ response: await route.fetch(), status: 500, json: { error: 'Made-up failed read after saving' } })
    else await route.continue()
  })
  try {
    await open(); await ready()
    const gate = row('conflict-resolving')
  await edit('conflict-resolving')
    await gate.getByRole('button', { name: 'On', exact: true }).click()
    await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up saved change before the read fails')
    await gate.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => gate.innerText()).toContain('The change was saved, but the gates could not be read again.')
    expect(await gate.innerText()).toContain('Made-up failed read after saving')
    expect(await gate.locator('.gates-position, .gates-history').count()).toBe(0)
    expect(await gate.locator('fieldset').count()).toBe(0)
    expect(writes).toBe(1)
    await app.page.unroute('**/api/office/gates')
    await gate.getByRole('button', { name: 'Read again', exact: true }).click()
    await expect.poll(() => gate.locator('.gates-position').innerText()).toContain('In force: On')
    expect(writes).toBe(1)
  } finally {
    await app.page.unroute('**/api/office/settings')
    await app.page.unroute('**/api/office/gates')
  }
}, 90_000)

it('sends and shows an end time, and shows a choice that ran out before the office writes its history', async () => {
  await saveThroughTheDoor('MOLE_OFFICE_CONFLICT_RESOLVING', null, 'Made-up start before an ending choice')
  await open(); await ready()
  const gate = row('conflict-resolving')
  await edit('conflict-resolving')
  await gate.getByRole('button', { name: 'On', exact: true }).click()
  await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up temporary supervisor hour')
  await gate.getByLabel('End time (optional, YYYY-MM-DD HH:MM)', { exact: true }).fill('2099-10-21 07:30')
  const sent = app.page.waitForRequest((request) => request.url().endsWith('/api/office/settings') && request.method() === 'POST')
  await gate.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await sent).postDataJSON()).toEqual({ changes: [{ name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: '1', until: '2099-10-21 07:30' }], because: 'Made-up temporary supervisor hour' })
  await expect.poll(() => gate.locator('.gates-history').innerText()).toContain('The choice ends at 2099-10-21 07:30:00.')
  const database = new Database(join(app.dir, 'panelx.db'), { fileMustExist: true })
  try {
    database.prepare('UPDATE runtime_settings SET until = ? WHERE name = ?').run('2001-01-01 07:30:00', 'MOLE_OFFICE_CONFLICT_RESOLVING')
    await open(); await ready()
    await expect.poll(() => row('conflict-resolving').innerText()).toContain('Ran out at 2001-01-01 07:30:00. Back at Off, its default. Not yet written in the history.')
    expect(await row('conflict-resolving').locator('.gates-position').innerText()).toContain('In force: Off')
    expect(database.prepare('SELECT value, until FROM runtime_settings WHERE name = ?').get('MOLE_OFFICE_CONFLICT_RESOLVING')).toEqual({ value: '1', until: '2001-01-01 07:30:00' })
  } finally { database.close() }
}, 90_000)

it('words an office-written return and an unnamed writer from their reading', async () => {
  await app.page.route('**/api/office/gates', async (route) => {
    const response = await route.fetch()
    const reading = await response.json() as GatesReading
    const rows = reading.classes.flatMap((one) => one.groups.flatMap((group) => group.rows))
    const conflict = rows.find((one) => one.id === 'conflict-resolving')!
    conflict.value = '0'; conflict.source = 'the built-in default'; conflict.chosen = null
    conflict.ranOut = null
    conflict.lastChange = { id: 'made-up-change', appendOrder: null, at: '2001-01-01 08:00:00', by: { type: 'system', id: 'made-up-office', name: null }, from: '1', to: '0', because: 'Made-up ended choice', until: '2001-01-01 07:30:00', ranOut: true }
    const number = rows.find((one) => one.id === 'checks-an-hour')!
    number.value = '3'; number.source = 'the office database'; number.chosen = { value: '3', until: null }
    number.lastChange = { id: 'made-up-change', appendOrder: null, at: '2001-01-01 08:00:00', by: { type: 'human', id: 'made-up-writer', name: null }, from: '6', to: '3', because: 'Made-up unnamed writer reason', until: null, ranOut: false }
    await route.fulfill({ response, json: reading })
  })
  try {
    await open(); await ready()
    expect(await row('conflict-resolving').locator('.gates-history').innerText()).toContain('The office put it back at Off on 2001-01-01 08:00:00, because the choice ran out at 2001-01-01 07:30:00.')
    expect(await row('checks-an-hour').locator('.gates-history').innerText()).toContain('Changed by made-up-writer on 2001-01-01 08:00:00, from 6 to 3. Reason: Made-up unnamed writer reason')
  } finally { await app.page.unroute('**/api/office/gates') }
}, 60_000)

// A position read from .env or the environment has no change row, because nothing outside the office writes one. The
// row says it was set outside the office, apart from a default nobody changed (invariant 5, wave 13r round K). This
// reading gives one row of each, and the two cases below read it.
const SET_OUTSIDE = ['conflict-resolving', 'checks-an-hour', 'house-rule-reds'] as const
async function readTheGatesAsSetOutside(route: import('playwright').Route) {
  const response = await route.fetch()
  const reading = await response.json() as GatesReading
  const rows = reading.classes.flatMap((one) => one.groups.flatMap((group) => group.rows))
  const file = rows.find((one) => one.id === 'conflict-resolving')!
  file.value = '1'; file.source = '.env'; file.chosen = null; file.ranOut = null; file.lastChange = null
  // The office's last change put back a saved choice, so the position in force fell to the one in the environment.
  const environment = rows.find((one) => one.id === 'checks-an-hour')!
  environment.value = '4'; environment.source = 'the environment'; environment.chosen = null; environment.ranOut = null
  environment.lastChange = { id: 'made-up-change', appendOrder: null, at: '2001-01-01 08:00:00', by: { type: 'human', id: 'made-up-writer', name: null }, from: '3', to: '4', because: 'Made-up return from a saved choice', until: null, ranOut: false }
  const untouched = rows.find((one) => one.id === 'house-rule-reds')!
  untouched.source = 'the built-in default'; untouched.chosen = null; untouched.ranOut = null; untouched.lastChange = null
  await route.fulfill({ response, json: reading })
}

it('says a position from .env or the environment was set outside the office, apart from a default nobody changed', async () => {
  await app.page.route('**/api/office/gates', readTheGatesAsSetOutside)
  try {
    await open(); await ready()
    const history = (id: string) => row(id).locator('.gates-history').innerText()
    expect(await history('conflict-resolving')).toContain(t('gates.outside.envFile'))
    expect(await history('conflict-resolving')).not.toContain(t('gates.noHistoryOther'))
    expect(await history('checks-an-hour')).toContain(t('gates.last', { who: 'made-up-writer', at: '2001-01-01 08:00:00', from: '3', to: '4', because: 'Made-up return from a saved choice' }))
    expect(await history('checks-an-hour')).toContain(t('gates.outside.environment'))
    expect(await history('house-rule-reds')).toContain(t('gates.noHistory'))
    for (const key of ['gates.outside.envFile', 'gates.outside.environment'] as const) expect(await history('house-rule-reds')).not.toContain(t(key))
  } finally { await app.page.unroute('**/api/office/gates') }
}, 60_000)

it('photographs the rows of that reading at four widths in both themes', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await app.page.route('**/api/office/gates', readTheGatesAsSetOutside)
  try {
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
      // A window this tall holds a whole row at 390 below the bar stuck at the top, so the picture of the row does not
      // scroll it back under that bar and cut off the label.
      await app.page.setViewportSize({ width, height: 2000 })
      await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
      await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
      await waitForThePage(app.page, 30_000); await ready()
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
      expect(await row('conflict-resolving').locator('.gates-history').innerText()).toContain(t('gates.outside.envFile'))
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      // The label goes inside each row, above its heading, so the picture of the row carries it.
      for (const id of SET_OUTSIDE) {
        await putTheMadeUpLabelIn(app.page, 'Made-up test office — a reading changed to show where a position came from', row(id).locator('h5'), `the ${id} row`)
        await row(id).screenshot({ path: join(shots, `gates-outside-${id}-${width}-${theme}.png`) })
      }
    }
  } finally { await app.page.unroute('**/api/office/gates') }
}, 180_000)

// THE TWO GUARDS OF THE INTEGRATE STEP WITH A ROW (wave 13r round L): the privacy class with its first group, and the
// build guard's row in the quality class, each at its default.
it('photographs the privacy class and the integrated-tree-builds row at four widths in both themes', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
    await app.page.setViewportSize({ width, height: 2000 })
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
    await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
    await waitForThePage(app.page, 30_000); await ready()
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const privacy = panel().locator('[data-gate-class="privacy"]')
    // The label goes above the class's heading, so the bar stuck at the top covers neither the heading nor the group's.
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — the owner-content guard at its default', privacy.locator('h3'), 'the privacy class')
    await privacy.screenshot({ path: join(shots, `gates-privacy-${width}-${theme}.png`) })
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — the build guard at its default', row('integrated-tree-builds').locator('h5'), 'the integrated-tree-builds row')
    await row('integrated-tree-builds').screenshot({ path: join(shots, `gates-integrated-tree-builds-${width}-${theme}.png`) })
  }
}, 180_000)

// THE OFFICE'S OWN CHECKS (wave 13r round N): the group in both classes it is in, each with every row the list puts
// there, the held seat's row among the switches and the whole suite's seats among the numbers, each at its default.
// Mutation: draw no group called the office's own checks in a class, draw it without its rows, or draw one class's
// rows in the other's part.
it('photographs the office\'s own checks, the held seat\'s row and the whole suite\'s seats at four widths in both themes', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const own = GATES.filter((one) => one.group === 'the-offices-own-checks')
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
    // Each class's part of the group is taller than a 2000-pixel window at every width, and the quality part is taller
    // than 5000 too. A picture of a block taller than the window is scrolled under the bar stuck at the top, and the bar
    // then covers the label, so each part is photographed in a window 1000 pixels taller than the part.
    await app.page.setViewportSize({ width, height: 5000 })
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
    await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
    await waitForThePage(app.page, 30_000); await ready()
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    for (const kind of ['quality', 'process'] as const) {
      const rows = own.filter((one) => one.class === kind)
      expect(rows.length, kind).toBeGreaterThan(0)
      const group = panel().locator(`[data-gate-class="${kind}"] [data-gate-group="the-offices-own-checks"]`)
      expect(await group.locator('h4').textContent()).toBe(t('gates.group.the-offices-own-checks'))
      expect(await group.locator('[data-gate]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-gate'))), kind).toEqual(rows.map((one) => one.id))
      // The label goes above the group's heading, so the bar stuck at the top covers neither the heading nor a row.
      const tall = await group.evaluate((node) => Math.ceil(node.getBoundingClientRect().height))
      await app.page.setViewportSize({ width, height: Math.max(5000, tall + 1000) })
      await putTheMadeUpLabelIn(app.page, `Made-up test office — the office's own ${kind} checks at their defaults`, group.locator('h4'), `the office's own ${kind} checks`)
      await group.screenshot({ path: join(shots, `gates-the-offices-own-checks-${kind}-${width}-${theme}.png`) })
    }
    for (const id of ['giving-back-a-held-seat', 'whole-suite-seats']) {
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — a new row at its default', row(id).locator('h5'), `the ${id} row`)
      await row(id).screenshot({ path: join(shots, `gates-${id}-${width}-${theme}.png`) })
    }
  }
}, 180_000)

// THE SANDBOX TOOLS (wave 13r round O): the group in both classes it is in, with every row the list puts there. The
// rows are read in one look; with W13R_GATES_SHOTS, in every look it photographs. What each spool row says under it is
// asked by the two cases after this one.
// Mutation: leave a row of the group out of the page.
it('draws the sandbox tools in both their classes, with every row the list puts there, and photographs them', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const tools = GATES.filter((one) => one.group === 'the-sandbox-tools')
  const looks = shots ? [1440, 990, 660, 390].flatMap((width) => ['light', 'dark'].map((theme) => ({ width, theme }))) : [{ width: 1440, theme: 'light' }]
  for (const { width, theme } of looks) {
    await app.page.setViewportSize({ width, height: 5000 })
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
    await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
    await waitForThePage(app.page, 30_000); await ready()
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    for (const kind of ['quality', 'process'] as const) {
      const group = panel().locator(`[data-gate-class="${kind}"] [data-gate-group="the-sandbox-tools"]`)
      expect(await group.locator('h4').textContent()).toBe(t('gates.group.the-sandbox-tools'))
      const rows = tools.filter((one) => one.class === kind)
      expect(rows.length, kind).toBeGreaterThan(0)
      expect(await group.locator('[data-gate]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-gate')))).toEqual(rows.map((one) => one.id))
    }
    if (!shots) continue
    // The quality class's part of the group is short enough for a 5000-pixel window to hold it whole at every width, so
    // the bar stuck at the top does not cover its label. The process class's part is taller than any window, so some
    // of its rows are photographed one by one: the server's own row, a row the spool counts, and a row for each reason
    // the spool waits for a row, with a remind row among them.
    const quality = panel().locator('[data-gate-class="quality"] [data-gate-group="the-sandbox-tools"]')
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — the sandbox tools\' quality rows at their defaults', quality.locator('h4'), 'the sandbox tools\' quality rows')
    await quality.screenshot({ path: join(shots, `gates-the-sandbox-tools-quality-${width}-${theme}.png`) })
    const processRows = tools.filter((one) => one.class === 'process')
    const waitingHere = GATES_THE_SPOOL_WAITS_FOR.filter((one) => processRows.some((each) => each.id === one.gate))
    const photographed = new Set([
      'the-office-vouches-for-a-runs-sandbox',
      ...processRows.filter((one) => one.countedBy === 'the-sandbox-spool' && !waitingHere.some((each) => each.gate === one.id)).slice(0, 1).map((one) => one.id),
      ...[...new Set(waitingHere.map((one) => one.why))].map((why) => waitingHere.find((one) => one.why === why)!.gate),
      'other-gpu-sandboxes-reminder',
    ])
    for (const id of photographed) {
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — a sandbox tool\'s row at its default', row(id).locator('h5'), `the ${id} row`)
      await row(id).screenshot({ path: join(shots, `gates-${id}-${width}-${theme}.png`) })
    }
  }
}, 180_000)

// A ROW THE GATE-COUNT SPOOL COUNTS (wave 13r round AF). Under such a row the page draws the spool's sentence, which
// says a tool on this machine counts it. A row the spool waits for is a spool row too, and the sentence is not drawn
// under it, because no line is counted for it.
// Mutation: draw the spool's sentence under every spool row, or under none.
it('draws the spool\'s sentence under each row the spool counts, and under no row it waits for', async () => {
  const waiting = new Set(GATES_THE_SPOOL_WAITS_FOR.map((one) => one.gate))
  const spoolRows = GATES.filter((one) => one.countedBy === 'the-sandbox-spool')
  expect(spoolRows.filter((one) => !waiting.has(one.id)).length, 'rows the spool counts').toBeGreaterThan(0)
  await app.page.setViewportSize({ width: 1440, height: 1100 })
  await open(); await ready()
  for (const one of spoolRows) {
    const history = await row(one.id).locator('.gates-history').innerText()
    expect(history.includes(t('gates.count.sandboxSpool')), `${one.id}: the spool's sentence`).toBe(!waiting.has(one.id))
  }
})

// A ROW THE SPOOL NEVER COUNTS (wave 13r round AF). Under a row on GATES_THE_SPOOL_WAITS_FOR the page says the row is
// not counted. The row's own reason after it was taken out in wave 13y round 121. It draws neither "not counted yet" nor
// the spool's sentence under such a row.
// Mutation: draw the spool's sentence under a waiting row again.
it('says under each row the spool waits for that it is not counted', async () => {
  await app.page.setViewportSize({ width: 1440, height: 1100 })
  await open(); await ready()
  for (const one of GATES_THE_SPOOL_WAITS_FOR) {
    const history = await row(one.gate).locator('.gates-history').innerText()
    expect(history, `${one.gate}: the spool's sentence`).not.toContain(t('gates.count.sandboxSpool'))
    expect(history, `${one.gate}: not counted yet`).not.toContain(t('gates.notCounted'))
    expect(history, `${one.gate}: not counted`).toContain(t('gates.count.notCounted'))
  }
})

it('photographs made-up counts and choices on Gates at four widths in both themes and the moved Office controls line', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const response = await fetch(`${app.api}/api/office/settings`, { method: 'POST', headers, body: JSON.stringify({ changes: [
    { name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: '1', until: '2099-10-21 07:30' },
    { name: 'MOLE_OFFICE_CHECKS_AN_HOUR', value: '3' },
    { name: 'MOLE_OFFICE_GATE_HOUSE_RULES', value: 'remind' },
    { name: 'MOLE_OFFICE_GATE_BEFORE_THE_SEAL', value: 'block' },
  ], because: 'Made-up choice for these pictures' }) })
  expect(response.status, await response.clone().text()).toBe(200)
  const counts = new Database(join(app.dir, 'panelx.db'), { fileMustExist: true })
  try {
    const day = (daysAgo: number) => { const at = new Date(); at.setDate(at.getDate() - daysAgo); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
    const put = counts.prepare(`INSERT INTO gate_counts (gate, day, would_stop, stopped, reminded, ignored, heeded) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(gate, day) DO UPDATE SET would_stop = excluded.would_stop, stopped = excluded.stopped, reminded = excluded.reminded, ignored = excluded.ignored, heeded = excluded.heeded`)
    for (const daysAgo of [0, 10, 40]) {
      put.run('house-rule-reds', day(daysAgo), 2, 1, 1, 0, 0)
      put.run('checks-an-hour', day(daysAgo), 3, 0, 0, 0, 0)
      put.run('before-the-seal', day(daysAgo), 2, 1, 1, 1, 1)
    }
  } finally { counts.close() }
  for (const width of [1440, 390]) for (const theme of ['light']) {
    await app.page.setViewportSize({ width, height: 1100 })
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
    await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
    await waitForThePage(app.page, 30_000); await ready()
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    await edit('checks-an-hour')
    expect(await row('checks-an-hour').getByLabel('From 1 to 6', { exact: true }).inputValue()).toBe('3')
    expect(await row('conflict-resolving').locator('.gates-history').innerText()).toContain('2099-10-21 07:30:00')
    expect(await row('house-rule-reds').locator('.gates-history').innerText()).toContain('Last 30 days: would have stopped work 4 times, stopped work 2 times, reminded 2 times.')
    expect(await row('before-the-seal').locator('.gates-history').innerText()).toContain('Last 30 days: would have stopped work 4 times, stopped work 2 times, reminded 2 times.')
    expect(await row('before-the-seal').locator('.gates-history').innerText()).toContain('Still found at the seal: 2. Gone by the seal: 2.')
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — saved choices, reasons and made-up counts', panel(), 'the Gates panel')
    await app.page.locator('.pfs').screenshot({ path: join(shots, `gates-counts-${width}-${theme}.png`) })
    await row('checks-an-hour').getByRole('button', { name: t('pagesFromSettings.stopEditing'), exact: true }).click()
  }
  for (const width of [1440, 390]) for (const theme of ['light']) {
    await app.page.setViewportSize({ width, height: 1100 })
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
    await app.page.goto(`${app.site}/?lang=en&mode=inspect&look=${theme}#/settings/officecontrols`)
    await waitForThePage(app.page, 30_000)
    const controls = app.page.locator('[data-target="uiSurface/settings.officecontrols"]')
    await controls.getByLabel('Find a setting', { exact: true }).fill('merge conflict')
    await controls.locator('.orc-gate[data-setting="MOLE_OFFICE_CONFLICT_RESOLVING"]').waitFor()
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await putTheMadeUpLabelIn(app.page, 'Made-up test office — the Gates link in Office controls', controls, 'the Office controls link')
    const outer = app.page.locator('.pfs')
    const box = await outer.boundingBox()
    if (box !== null) await app.page.evaluate((top) => window.scrollBy(0, top - 300), box.y)
    await app.page.screenshot({ path: join(shots, `office-controls-gates-${width}-${theme}.png`) })
  }
}, 180_000)

it('keeps a typed end on Put back and leaves the row unchanged when the door refuses it', async () => {
  await saveThroughTheDoor('MOLE_OFFICE_CONFLICT_RESOLVING', '1', 'Made-up choice before refusing an ended removal')
  await open(); await ready()
  const gate = row('conflict-resolving')
  await edit('conflict-resolving')
  const position = await gate.locator('.gates-position').innerText()
  const history = await gate.locator('.gates-history').innerText()
  await gate.getByLabel('Reason (required)', { exact: true }).fill('Made-up removal with an end')
  await gate.getByLabel('End time (optional, YYYY-MM-DD HH:MM)', { exact: true }).fill('2099-10-21 07:30')
  const reply = app.page.waitForResponse((response) => response.url().endsWith('/api/office/settings') && response.request().method() === 'POST')
  await gate.getByRole('button', { name: 'Put back the default', exact: true }).click()
  const response = await reply
  expect(response.status()).toBe(400)
  expect(response.request().postDataJSON()).toEqual({ changes: [{ name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: null, until: '2099-10-21 07:30' }], because: 'Made-up removal with an end' })
  await expect.poll(() => gate.innerText()).toContain('Removing a choice has nothing to end, so it cannot have an end time. Nothing was changed.')
  expect(await gate.locator('.gates-position').innerText()).toBe(position)
  expect(await gate.locator('.gates-history').innerText()).toBe(history)
  expect(await gate.getByLabel('End time (optional, YYYY-MM-DD HH:MM)', { exact: true }).inputValue()).toBe('2099-10-21 07:30')
  expect(await gate.getByLabel('Reason (required)', { exact: true }).inputValue()).toBe('Made-up removal with an end')
}, 60_000)

it('keeps a gate’s refused saved value in the Normal-mode notice', async () => {
  const database = new Database(join(app.dir, 'panelx.db'), { fileMustExist: true })
  try {
    database.prepare('INSERT INTO runtime_settings (name, value, until) VALUES (?, ?, NULL) ON CONFLICT(name) DO UPDATE SET value = excluded.value, until = NULL').run('MOLE_OFFICE_CHECKS_AN_HOUR', '9')
    await open(); await ready()
    // The notice stays on Settings, under its title, when Gates has a page of its own (wave 13y round 125).
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/settings`)
    await waitForThePage(app.page, 30_000)
    const refused = app.page.locator('[data-refused-saved-settings] [data-setting="MOLE_OFFICE_CHECKS_AN_HOUR"]')
    await refused.waitFor()
    expect(await refused.locator('[data-stored-refused]').count()).toBe(1)
    expect(await refused.getByRole('button', { name: 'Reset to shipped value', exact: true }).count()).toBe(1)
  } finally {
    database.prepare('DELETE FROM runtime_settings WHERE name = ?').run('MOLE_OFFICE_CHECKS_AN_HOUR')
    database.close()
  }
}, 60_000)

// THE GATE-COUNT SPOOL ANOTHER WORLD OWNS (wave 13r round W, item 12). This test's office is a scratch one, which never
// reads a spool, so its own reading has none and the block is not drawn. A reading changed to name a made-up spool in a
// made-up folder, owned by a made-up world, draws it, and the press's answer is made up too, so nothing is removed. The
// press still reaches this test's office, whose answer carries the headers the page checks; that office reads no spool,
// so it refuses and changes nothing, and the made-up status and body are put in place of its own.
const A_MADE_UP_SPOOL = { folder: '/made/up/sandboxes/.gate-counts', itsWorld: 'made-up-world-of-another-office', thisWorld: 'made-up-world-of-this-office', mayPress: true }
const A_MADE_UP_HAND_OVER: TheSpoolHandedOver = {
  removed: '/made/up/sandboxes/.gate-counts/.world', itNamed: A_MADE_UP_SPOOL.itsWorld, givenTo: A_MADE_UP_SPOOL.thisWorld,
  countingFrom: [
    { file: '2026-10-20.jsonl', way: 'continues from this office\'s row', byte: 4096 },
    { file: '2026-10-21.jsonl', way: 'starts at the press', byte: 2048 },
    { file: '2026-10-22.jsonl', way: 'starts at the press', byte: 512 },
  ],
  readBefore: 'Made-up sentence about rows read before the press.', readsItNow: true, said: [],
}
const THE_PRESS = '**/api/office/gate-count-spool/hand-over'
const spoolBlock = () => panel().locator('[data-gate-spool]')
const handedOver = () => panel().locator('[data-gate-spool-handed-over]')
/** The gates reading with a made-up spool while `owned()` says another world owns it, and with none after. */
function readTheGatesWithASpool(spool: () => typeof A_MADE_UP_SPOOL | null) {
  return async (route: import('playwright').Route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), spool: spool() } })
  }
}

// Mutation: send another world than the one the block showed, or leave out the sentence about rows read before.
it('draws the spool block only while another world owns the spool, waits for a reason, sends the world it showed, and says what the press did', async () => {
  await open(); await ready()
  const read = await fetch(`${app.api}/api/office/gates`, { headers })
  expect(((await read.json()) as GatesReading).spool).toBeNull()
  expect(await spoolBlock().count()).toBe(0)
  let owned = true
  const sent: unknown[] = []
  await app.page.route('**/api/office/gates', readTheGatesWithASpool(() => owned ? A_MADE_UP_SPOOL : null))
  await app.page.route(THE_PRESS, async (route) => {
    sent.push(route.request().postDataJSON())
    owned = false
    await route.fulfill({ response: await route.fetch(), status: 200, json: A_MADE_UP_HAND_OVER })
  })
  try {
    await open(); await ready()
    await spoolBlock().waitFor()
    expect(await spoolBlock().locator('h3').innerText()).toBe(t('gates.spool.title'))
    const words = await spoolBlock().innerText()
    for (const said of [t('gates.spool.owned', { folder: A_MADE_UP_SPOOL.folder, theirs: A_MADE_UP_SPOOL.itsWorld, ours: A_MADE_UP_SPOOL.thisWorld }), t('gates.spool.what'), t('gates.spool.who')]) expect(words).toContain(said)
    await spoolBlock().getByRole('button', { name: t('pagesFromSettings.edit'), exact: true }).click()
    const give = spoolBlock().getByRole('button', { name: t('gates.spool.give'), exact: true })
    expect(await give.isDisabled()).toBe(true)
    await spoolBlock().getByLabel(t('gates.spool.reason'), { exact: true }).fill('   ')
    expect(await give.isDisabled()).toBe(true)
    expect(sent).toEqual([])
    await spoolBlock().getByLabel(t('gates.spool.reason'), { exact: true }).fill('Made-up reason for giving the spool to this office')
    await give.click()
    await handedOver().waitFor()
    expect(sent).toEqual([{ saw: A_MADE_UP_SPOOL.itsWorld, because: 'Made-up reason for giving the spool to this office' }])
    const done = await handedOver().innerText()
    expect(done).toContain(t('gates.spool.given', { ours: A_MADE_UP_SPOOL.thisWorld }))
    expect(done).toContain(t('gates.spool.startsAtThePress', { files: listJoined(['2026-10-21.jsonl', '2026-10-22.jsonl']) }))
    expect(await handedOver().locator('[data-gate-spool-read-before]').innerText()).toBe(t('gates.spool.readBefore', { files: '2026-10-20.jsonl' }))
    await expect.poll(() => spoolBlock().count()).toBe(0)
  } finally {
    await app.page.unroute(THE_PRESS)
    await app.page.unroute('**/api/office/gates')
  }
}, 90_000)

// Mutation: leave the press open to a caller the reading says may not press.
it('disables the spool press when the reading says this caller may not press it, and draws the door\'s words when it refuses', async () => {
  let spool = { ...A_MADE_UP_SPOOL, mayPress: false }
  await app.page.route('**/api/office/gates', readTheGatesWithASpool(() => spool))
  const refusal = { code: 'gateCountSpoolNotWhatYouSaw', values: { saw: A_MADE_UP_SPOOL.itsWorld, now: 'made-up-third-world' } }
  await app.page.route(THE_PRESS, async (route) => route.fulfill({ response: await route.fetch(), status: 409, json: { error: t('server.gateCountSpoolNotWhatYouSaw', refusal.values), ...refusal } }))
  try {
    await open(); await ready()
    await spoolBlock().waitFor()
    for (const control of await spoolBlock().locator('input, button').all()) expect(await control.isDisabled()).toBe(true)
    spool = A_MADE_UP_SPOOL
    await open(); await ready()
    await spoolBlock().getByRole('button', { name: t('pagesFromSettings.edit'), exact: true }).click()
    await spoolBlock().getByLabel(t('gates.spool.reason'), { exact: true }).fill('Made-up reason the door refuses')
    await spoolBlock().getByRole('button', { name: t('gates.spool.give'), exact: true }).click()
    await expect.poll(() => spoolBlock().innerText()).toContain(t('server.gateCountSpoolNotWhatYouSaw', refusal.values))
    expect(await handedOver().count()).toBe(0)
    expect(await spoolBlock().getByLabel(t('gates.spool.reason'), { exact: true }).inputValue()).toBe('Made-up reason the door refuses')
  } finally {
    await app.page.unroute(THE_PRESS)
    await app.page.unroute('**/api/office/gates')
  }
}, 90_000)

it('photographs the spool block and what the press did at four widths in both themes', async () => {
  const shots = process.env.W13R_GATES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  let owned = true
  await app.page.route('**/api/office/gates', readTheGatesWithASpool(() => owned ? A_MADE_UP_SPOOL : null))
  await app.page.route(THE_PRESS, async (route) => { owned = false; await route.fulfill({ response: await route.fetch(), status: 200, json: A_MADE_UP_HAND_OVER }) })
  try {
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
      owned = true
      await app.page.setViewportSize({ width, height: 2000 })
      await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
      await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/gates/edit`)
      await waitForThePage(app.page, 30_000); await ready()
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
      await spoolBlock().waitFor()
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await spoolBlock().getByRole('button', { name: t('pagesFromSettings.edit'), exact: true }).click()
      await spoolBlock().getByLabel(t('gates.spool.reason'), { exact: true }).fill('Made-up reason for giving the spool to this office')
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — a made-up spool in a made-up folder, owned by a made-up world', spoolBlock().locator('h3'), 'the spool block')
      await spoolBlock().screenshot({ path: join(shots, `gates-spool-${width}-${theme}.png`) })
      await spoolBlock().getByRole('button', { name: t('gates.spool.give'), exact: true }).click()
      await handedOver().waitFor()
      await expect.poll(() => spoolBlock().count()).toBe(0)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — a made-up answer of the press', handedOver().locator('p'), 'what the press did')
      await handedOver().screenshot({ path: join(shots, `gates-spool-handed-over-${width}-${theme}.png`) })
    }
  } finally {
    await app.page.unroute(THE_PRESS)
    await app.page.unroute('**/api/office/gates')
  }
}, 240_000)
