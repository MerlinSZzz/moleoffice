// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
beforeAll(async () => {
  app = await liveApp({ name: 'dead-letter-threshold-press', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
  const renamed = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'Rowan' }) })
  expect(renamed.status).toBe(200)
  const registered = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers, body: JSON.stringify({ handle: 'fixture-finch', name: 'Finch', role: 'secretary' }) })
  expect(registered.status).toBe(201)
  const agent = (await registered.json() as { agent: { id: string } }).agent.id
  const named = await fetch(`${app.api}/api/office/dead-letter-secretary`, { method: 'POST', headers, body: JSON.stringify({ agent }) })
  expect(named.status).toBe(200)
  const decision = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'decision', title: 'Made-up summary thresholds', data: { replaces: [] } }) })
  expect(decision.status).toBe(201)
  await app.page.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { person: THE_PERSON })
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

it('saves both thresholds, follows the stored value, removes choices, and fits 1440 and 390 in light', async () => {
  const page = app.page
  await page.goto(`${app.site}/?lang=en&mode=normal#/settings/deadletters`)
  await waitForThePage(page, 60_000)
  const control = page.locator('.dlt')
  await control.waitFor({ timeout: 30_000 })
  await control.getByLabel('Age in days').fill('2')
  await control.getByLabel('More than this many letters').fill('30')
  await control.locator('summary').click()
  await control.getByLabel('Find a decision by its words').fill('Made-up summary thresholds')
  await control.getByRole('button', { name: 'Find decisions', exact: true }).click()
  await expect.poll(() => control.getByLabel('Decision for these values').innerText()).toContain('Made-up summary thresholds')
  await control.getByLabel('Decision for these values').selectOption({ label: 'Made-up summary thresholds' })
  await control.locator('summary').click()
  await control.getByLabel('Why change these thresholds?').fill('Made-up demonstration reason')
  await control.getByRole('button', { name: 'Save thresholds', exact: true }).click()
  await expect.poll(() => control.innerText()).toContain('Now 2, from the office database.')
  expect(await control.innerText()).toContain('Now 30, from the office database.')
  // NO LINE SAYS NO RESTART IS NEEDED. A person does not need it to set the limits, so wave 13y's round 121 took it
  // out of Settings, and round 122 keeps it out.
  expect(await control.innerText()).not.toContain('No restart is needed.')
  expect(await control.innerText()).toContain('Last changed by Rowan')
  expect(await control.innerText()).toContain('Days changed from 1 to 2. Letters changed from 20 to 30.')
  expect(await control.innerText()).toContain('Last reason: Made-up demonstration reason')
  expect(await control.getByRole('link', { name: 'Made-up summary thresholds' }).count()).toBe(1)
  await page.reload()
  await control.waitFor({ timeout: 30_000 })
  expect(await control.getByLabel('Age in days').inputValue()).toBe('2')
  expect(await control.getByLabel('More than this many letters').inputValue()).toBe('30')
  await control.getByLabel('Age in days').fill('0')
  expect(await control.getByRole('button', { name: 'Save thresholds', exact: true }).isDisabled()).toBe(true)
  await control.getByLabel('Why change these thresholds?').fill('Made-up removal reason')
  await control.getByRole('button', { name: 'Remove saved choices', exact: true }).click()
  // THE DEFAULT IS BACK IN FORCE, said in the word list's words as the page says it beside the days.
  const atTheDefault = createI18n('en').t('deadLetterThresholds.source', { value: 1, source: englishWords()['deadLetterThresholds.default'] })
  await expect.poll(() => control.innerText()).toContain(atTheDefault)
  expect(await control.getByLabel('Age in days').inputValue()).toBe('1')
  expect(await control.getByLabel('More than this many letters').inputValue()).toBe('20')
  expect(await control.innerText()).toContain('Days changed from 2 to 1. Letters changed from 30 to 20.')
  // The pictures show a made-up choice, not an observation from a person's office.
  await control.getByLabel('Age in days').fill('2')
  await control.getByLabel('More than this many letters').fill('30')
  await control.getByLabel('Why change these thresholds?').fill('Made-up demonstration reason')
  await control.getByRole('button', { name: 'Save thresholds', exact: true }).click()
  await expect.poll(() => control.innerText()).toContain('Now 2, from the office database.')
  const shots = process.env.W13R_ROUND26_SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  for (const width of [1440, 390]) {
    for (const theme of ['light'] as const) {
      await page.setViewportSize({ width, height: 1100 })
      await page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/settings/deadletters`)
      await waitForThePage(page, 60_000)
      await control.waitFor({ timeout: 30_000 })
      await expect.poll(() => control.innerText()).toContain('Now 2, from the office database.')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}`).toBe(true)
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(0)
      if (shots) {
        await putTheMadeUpLabelIn(page, 'Made-up test office — demonstration settings', control, 'the Dead letters settings page')
        await page.screenshot({ path: `${shots}/settings-deadletters-${width}-${theme}.png`, fullPage: false })
      }
    }
  }
}, 240_000)
