// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A person can make a coloured mark and apply or remove it on agents' pages. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let probe = ''
const ids: string[] = []
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const name = 'Made-up review'

beforeAll(async () => {
  const built = await bundlePageCode({ stdin: { contents: 'window.agentTagsProbe = () => [...document.querySelectorAll("[data-personal-agent-tag]")].map(node => node.textContent.trim())', resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
  probe = built.outputFiles[0]!.text
  app = await liveApp({ name: 'agent-personal-tags', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const handle of ['made-up-first-marked-agent', 'made-up-second-marked-agent']) {
    const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'agent', title: 'Made-up marked agent', data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' } }) })
    expect(response.status, await response.clone().text()).toBe(201)
  }
  const response = await fetch(`${app.api}/api/participants`, { headers })
  const participants = await response.json() as { agents: { id: string; handle: string }[] }
  for (const handle of ['made-up-first-marked-agent', 'made-up-second-marked-agent']) ids.push(participants.agents.find(one => one.handle === handle)!.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

async function profile(id: string) {
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${id}`)
  await waitForThePage(app.page, 60_000)
  await app.page.addScriptTag({ content: probe })
  expect(await app.page.getByLabel(t('agentTags.name')).count()).toBe(0)
  expect(await app.page.getByLabel(t('agentTags.colour')).count()).toBe(0)
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
}

it('makes a tag, puts it on two agents and takes it off one', async () => {
  await profile(ids[0]!)
  await app.page.getByLabel(t('agentTags.name')).fill(name)
  await app.page.getByLabel(t('agentTags.colour')).fill('#7860a8')
  await app.page.getByRole('button', { name: t('agentTags.create') }).click()
  await expect.poll(() => app.page.locator('[data-personal-agent-tag]').allTextContents()).toContain(name)
  await app.page.getByRole('button', { name: t('g6b.profile.cancel') }).click()
  expect(await app.page.getByLabel(t('agentTags.name')).count()).toBe(0)
  await expect.poll(() => app.page.locator('[data-personal-agent-tag]').allTextContents()).toContain(name)
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  await app.page.getByLabel(t('agentTags.name')).fill('Made-up unfinished')
  await app.page.getByLabel(t('agentTags.colour')).fill('#007e81')
  await app.page.getByRole('button', { name: t('g6b.profile.cancel') }).click()
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  expect(await app.page.getByLabel(t('agentTags.name')).inputValue()).toBe('')
  expect(await app.page.getByLabel(t('agentTags.colour')).inputValue()).toBe('#7860a8')
  await profile(ids[1]!)
  await app.page.getByRole('checkbox', { name }).check()
  await expect.poll(() => app.page.locator('[data-personal-agent-tag]').allTextContents()).toContain(name)
  await profile(ids[0]!)
  await app.page.getByRole('checkbox', { name }).uncheck()
  await expect.poll(() => app.page.locator('[data-personal-agent-tag]').allTextContents()).not.toContain(name)
  await app.page.goto(`${app.site}/?lang=en#/embassy`)
  await waitForThePage(app.page, 60_000)
  const show = app.page.getByRole('button', { name: t('g4.embassy.showEveryone') })
  if (await show.count()) await show.click()
  const row = app.page.locator('.emb-row', { has: app.page.locator(`a[href="#/who/agent/${ids[1]}"]`) })
  await expect.poll(() => row.locator('[data-personal-agent-tag]').allTextContents()).toContain(name)
}, 180_000)

it('explains when the chosen colour is too close to a background', async () => {
  await profile(ids[0]!)
  await app.page.getByLabel(t('agentTags.name')).fill('Made-up light')
  await app.page.getByLabel(t('agentTags.colour')).fill('#ffffff')
  await app.page.getByRole('button', { name: t('agentTags.create') }).click()
  await expect.poll(() => app.page.locator('[role="alert"]').innerText()).toContain(t('agentTags.colourRefused'))
}, 120_000)
