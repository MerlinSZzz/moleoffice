// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Contact rows show membership and update when the person marks an agent on its page. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'

let app: LiveApp
let id = ''
let probe = ''
const handle = 'made-up-contact-agent'
const project = 'made-up-contact-project'
const projectName = 'Made-up contact project'
const tagName = 'Made-up contact mark'
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  const built = await bundlePageCode({ stdin: { contents: 'window.contactMarks = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.trim())', resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
  probe = built.outputFiles[0]!.text
  app = await liveApp({ name: 'contact-agent-projects-and-tags', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const make = async (url: string, payload: unknown, headers = person) => {
    const response = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(payload) })
    expect(response.status, await response.clone().text()).toBe(201)
  }
  await make('/api/workspaces', { id: project, title: projectName })
  const data = { handle, runtime: 'claude-code', state: 'active', role: 'worker' }
  await make('/api/records', { kind: 'agent', title: 'Made-up contact agent', data })
  await make('/api/records', { kind: 'agent', title: 'Made-up contact agent other project', data }, { ...person, 'x-mole-office-workspace': project })
  await make('/api/records', { kind: 'message', title: 'Made-up contact message', data: { body: 'Made-up contact message', to: [{ kind: 'person', id: THE_PERSON }] } }, { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
  const listed = await fetch(`${app.api}/api/participants`, { headers: person })
  id = ((await listed.json()) as { agents: { id: string; handle: string }[] }).agents.find(one => one.handle === handle)!.id
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${id}`)
  await waitForThePage(app.page, 60_000)
  await app.page.addScriptTag({ content: probe })
  await openTheChatBeside(app.page)
  await app.page.locator('.px-chat-tab[data-tab="contacts"]').click()
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

it('shows all projects of the agent on its contact row', async () => {
  const row = app.page.locator(`.px-chat-contact[data-contact="agent:${id}"]`)
  await row.waitFor({ timeout: 30_000 })
  await expect.poll(() => row.locator('[data-agent-project]').count()).toBe(2)
  await expect.poll(() => row.locator('[data-agent-projects]').innerText()).toContain(projectName)
}, 60_000)

it('shows a newly made personal tag without reopening the chat', async () => {
  const row = app.page.locator(`.px-chat-contact[data-contact="agent:${id}"]`)
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  await app.page.getByLabel(t('agentTags.name')).fill(tagName)
  await app.page.getByLabel(t('agentTags.colour')).fill('#7860a8')
  await app.page.getByRole('button', { name: t('agentTags.create') }).click()
  await expect.poll(() => row.locator('[data-personal-agent-tag]').allTextContents(), { timeout: 20_000 }).toContain(tagName)
}, 60_000)
