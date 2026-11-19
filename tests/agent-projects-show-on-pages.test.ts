// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The agent's page and the agents list show the projects the office answered. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let probe = ''
let id = ''
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PROJECT = 'made-up-second-project'
const PROJECT_NAME = 'Made-up second project'

beforeAll(async () => {
  const bundled = await bundlePageCode({ stdin: { contents: 'window.agentProjectWords = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.trim())', resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
  probe = bundled.outputFiles[0]!.text
  app = await liveApp({ name: 'agent-project-pages', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const make = async (url: string, payload: unknown, project = 'default') => {
    const response = await fetch(`${app.api}${url}`, { method: 'POST', headers: { ...person, 'x-mole-office-workspace': project }, body: JSON.stringify(payload) })
    expect(response.status, await response.clone().text()).toBe(201)
    return response.json() as Promise<Record<string, any>>
  }
  await make('/api/workspaces', { id: PROJECT, title: PROJECT_NAME })
  const data = { handle: 'made-up-page-agent', runtime: 'claude-code', state: 'active', role: 'worker' }
  await make('/api/records', { kind: 'agent', title: 'Made-up page agent', data })
  await make('/api/records', { kind: 'agent', title: 'Made-up page agent second project', data }, PROJECT)
  const listed = await fetch(`${app.api}/api/participants`, { headers: person })
  id = ((await listed.json()) as { agents: { id: string; handle: string }[] }).agents.find(one => one.handle === data.handle)!.id
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

it('shows both project names on the profile and the agents list', async () => {
  for (const path of [`/who/agent/${id}`, '/embassy']) {
    await app.page.goto(`${app.site}/?lang=en#${path}`)
    await waitForThePage(app.page, 60_000)
    await app.page.addScriptTag({ content: probe })
    if (path === '/embassy') {
      const show = app.page.getByRole('button', { name: t('g4.embassy.showEveryone') })
      if (await show.count()) await show.click()
    }
    const tags = path === '/embassy' ? app.page.locator('.emb-row', { has: app.page.locator(`a[href="#/who/agent/${id}"]`) }).locator('[data-agent-projects]') : app.page.locator('[data-agent-projects]')
    await expect.poll(() => tags.innerText(), { timeout: 15_000 }).toContain(PROJECT_NAME)
    expect(await tags.locator('[data-agent-project]').count()).toBe(2)
  }
}, 120_000)
