// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The tag door names each refusal, and the panel draws its own words for every name. */
import { afterAll, expect, it } from 'vitest'
import { t, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const codes = [
  'agentTagsUnreadable', 'agentTagsNeedPerson', 'agentTagsNeedList', 'agentTagsBadTag',
  'agentTagsBadName', 'agentTagsDuplicateName', 'agentTagsBadColour', 'agentTagsUnknownAgent',
] as const
let app: LiveApp | undefined
afterAll(async () => { await app?.stop() }, 60_000)

it('gives each tag refusal its own code at the door', async () => {
  const db = await freshDb()
  try {
    const { keepPersonalAgentTags, personalAgentTags } = await import('../src/server/lib/agent-tags.ts')
    const person = { kind: 'person', id: THE_PERSON } as const
    const tag = { name: 'Made-up mark', colour: '#7860a8', agents: [] }
    db.client.sqlite.prepare('UPDATE people SET agent_tags = ? WHERE id = ?').run('{', THE_PERSON)
    const calls = [
      () => personalAgentTags(person),
      () => keepPersonalAgentTags(null, []),
      () => keepPersonalAgentTags(person, null),
      () => keepPersonalAgentTags(person, [null]),
      () => keepPersonalAgentTags(person, [{ ...tag, name: '' }]),
      () => keepPersonalAgentTags(person, [tag, tag]),
      () => keepPersonalAgentTags(person, [{ ...tag, colour: '#ffffff' }]),
      () => keepPersonalAgentTags(person, [{ ...tag, agents: ['made-up-unknown-agent'] }]),
    ]
    for (const [index, call] of calls.entries()) {
      let refusal: unknown
      try { call() } catch (error) { refusal = error }
      expect.soft(refusal, codes[index]).toMatchObject({ code: codes[index], values: {} })
    }
  } finally { db.close() }
}, 120_000)

it('draws the page words for all eight codes instead of the server sentence', async () => {
  const built = await bundlePageCode({ stdin: { contents: 'window.madeUpTagPanelReady = () => !!document.querySelector("[aria-label]")', resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
  app = await liveApp({ name: 'made-up-tag-refusal-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const created = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'agent', title: 'Made-up refusal agent', data: { handle: 'made-up-refusal-agent', runtime: 'claude-code', state: 'active', role: 'worker' } }) })
  expect(created.status).toBe(201)
  const response = await fetch(`${app.api}/api/participants`, { headers })
  const participants = await response.json() as { agents: { id: string; handle: string }[] }
  const id = participants.agents.find(one => one.handle === 'made-up-refusal-agent')!.id
  let code: typeof codes[number] = codes[0]
  const serverSentence = 'Made-up server refusal for inspection.'
  await app.page.route('**/api/agent-tags', async route => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const real = await route.fetch({ method: 'GET', postData: '' })
    return route.fulfill({ response: real, status: 400, contentType: 'application/json', body: JSON.stringify({ error: serverSentence, code, values: {} }) })
  })
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${id}`)
  await waitForThePage(app.page, 60_000)
  await app.page.addScriptTag({ content: built.outputFiles[0]!.text })
  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  await app.page.getByLabel(t('agentTags.name')).fill('Made-up mark')
  for (const one of codes) {
    code = one
    await app.page.getByRole('button', { name: t('agentTags.create') }).click()
    const alert = app.page.getByRole('alert')
    await alert.waitFor({ state: 'visible', timeout: 20_000 })
    const drawn = await alert.innerText()
    expect.soft(drawn, one).toContain(t(`server.${one}` as WordKey))
    expect.soft(drawn, one).not.toContain(serverSentence)
  }
}, 240_000)
