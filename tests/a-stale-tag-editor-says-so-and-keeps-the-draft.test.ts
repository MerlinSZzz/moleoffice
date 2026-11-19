// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TAG EDITOR LEFT OPEN ACROSS A CHANGE SAYS SO, OFFERS A RE-READ, AND KEEPS THE DRAFT.
 *
 * The office can re-mint agent ids while a person has the tags editor open. The editor still holds
 * the old list, so its next save is refused because a tagged agent no longer exists. It used to
 * draw the server's sentence and nothing else: no way to read the current tags without reloading
 * the page, and no promise that the words typed into the name field would survive that reload.
 *
 * Here the refusal is made by a held route, and the stored tags are changed to a second made-up
 * mark on a second made-up agent while the editor is open. The editor must say in plain words that
 * the tags no longer match the office and nothing was saved, offer to read them again, and keep the
 * typed name. After the re-read it must draw the stored mark, still be editing, and still hold the
 * draft.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<void> {
  const made = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
}

async function keepTags(tags: unknown): Promise<void> {
  const made = await fetch(`${app.api}/api/agent-tags`, { method: 'PUT', headers: HEADERS, body: JSON.stringify({ tags }) })
  expect(made.status, await made.clone().text()).toBe(200)
}

let alpha = ''
let beta = ''

beforeAll(async () => {
  app = await liveApp({ name: 'a-stale-tag-editor', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [['made-up-tag-alpha', 'Made-up Tag Alpha'], ['made-up-tag-beta', 'Made-up Tag Beta']] as const) {
    await post('/api/records', { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const answer = await fetch(`${app.api}/api/participants`, { headers: HEADERS })
  const participants = (await answer.json()) as { agents: { id: string; handle: string }[] }
  alpha = participants.agents.find((one) => one.handle === 'made-up-tag-alpha')!.id
  beta = participants.agents.find((one) => one.handle === 'made-up-tag-beta')!.id
  await keepTags([{ name: 'Alpha mark', colour: '#7860a8', agents: [alpha] }])
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('says the tags no longer match, reads them again on a press, and keeps the typed name', async () => {
  let refused = false
  await app.page.route('**/api/agent-tags', async (route) => {
    if (route.request().method() !== 'PUT' || refused) return route.fallback()
    refused = true
    const real = await route.fetch({ method: 'GET', postData: '' })
    return route.fulfill({
      response: real,
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Each tagged agent must be registered in this office.', code: 'agentTagsUnknownAgent', values: {} }),
    })
  })

  await app.page.goto(`${app.site}/?lang=en#/who/agent/${alpha}`)
  await waitForThePage(app.page, 60_000)
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  await app.page.getByLabel(t('agentTags.name')).fill('Draft mark')
  const alphaBox = app.page.getByRole('checkbox', { name: 'Alpha mark' })
  await alphaBox.waitFor({ timeout: 20_000 })

  await keepTags([{ name: 'Beta mark', colour: '#336699', agents: [beta] }])
  await alphaBox.uncheck()
  const changed = app.page.getByText(t('agentTags.changed'), { exact: false })
  await expect.poll(() => changed.count(), { timeout: 20_000, message: 'the editor did not say the tags no longer match when the save was refused' }).toBeGreaterThan(0)
  expect(await app.page.getByLabel(t('agentTags.name')).inputValue(), 'the typed name was lost when the save was refused').toBe('Draft mark')
  expect(await app.page.getByRole('button', { name: t('agentTags.readAgain') }).isVisible(), 'there is no press to read the tags again').toBe(true)

  await app.page.getByRole('button', { name: t('agentTags.readAgain') }).click()
  await app.page.getByRole('checkbox', { name: 'Beta mark' }).waitFor({ timeout: 20_000 })
  expect(await app.page.getByRole('checkbox', { name: 'Alpha mark' }).count(), 'the old mark stayed after the re-read').toBe(0)
  expect(await app.page.getByLabel(t('agentTags.name')).inputValue(), 'the typed name did not survive the re-read').toBe('Draft mark')
  expect(await app.page.getByRole('button', { name: t('agentTags.create') }).isVisible(), 'the editor closed itself instead of staying open').toBe(true)
  expect(await changed.count(), 'the changed sentence stayed after the re-read').toBe(0)
}, 120_000)
