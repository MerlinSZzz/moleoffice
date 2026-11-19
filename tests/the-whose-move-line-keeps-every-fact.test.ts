// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD PAGE'S WHOSE-MOVE LINE NAMES WHO HOLDS THE QUESTION, IN THE PAGE'S LANGUAGE.
 *
 * Check gfJxVyLI6nvX refused wave 13k's round 18 on invariant 9. The line under "Who made this, and
 * whose move it is" had been the server's own sentence, which names the agent that asked and the
 * starter that holds the question. Round 18 drew a fixed word per case instead, so the English page
 * read only "The question is with the agent who started the asker." and named nobody. Now the words
 * carry the facts the server sends beside its sentence, and the server builds its English sentence
 * from the same English words, so the page, the door and a refusal say one thing.
 *
 * Here a made-up lead is started by the person, the lead starts a made-up asker, and the asker files a
 * problem that says it is the person's move. The question waits with the lead. The line must name the
 * lead and the asker, in English and in Chinese.
 *
 * MUTATION: the page hands the words no facts (facts: {}), so every name reads as not recorded, the way
 * round 18's fixed sentence named nobody; the case goes red on the lead's name, English first.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const LEAD = 'made-up-lead'
const ASKER = 'made-up-asker'
const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
let app: LiveApp
let record = ''

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`POST ${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'whose-move-keeps-every-fact', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: LEAD, name: 'Made-up lead', runtime: 'claude-code', role: 'supervisor' }, asPerson)
  await post('/api/agents/started', { handle: ASKER, name: 'Made-up asker', runtime: 'claude-code', role: 'worker' }, asAgent(LEAD))
  const made = (await post('/api/records', { kind: 'problem', title: 'The made-up kiln door sticks', data: { whose_move: 'person', symptom: 'The made-up kiln door sticks halfway.' } }, asAgent(ASKER)))['record'] as { id: string }
  record = made.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('names the asker and the lead that holds the question, in English and in Chinese', async () => {
  for (const language of ['en', 'zh'] as const) {
    await app.page.goto(`${app.site}/?lang=${language}&mode=normal#/r/${record}`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const line = app.page.locator('.rp-question-is')
    await line.waitFor({ timeout: 20_000 })
    const text = (await line.innerText()).trim()
    expect(text, `${language}: the line names the lead holding the question`).toContain(LEAD)
    expect(text, `${language}: the line names the asker`).toContain(ASKER)
    if (language === 'zh') expect(text, 'zh: the line is Chinese').toMatch(/[一-鿿]/)
    else expect(text, 'en: the line is the sentence the server writes').toMatch(/^agent "made-up-asker" said this is the person's move/)
  }
}, 120_000)
