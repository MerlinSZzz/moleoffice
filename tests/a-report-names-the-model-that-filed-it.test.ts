// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT NAMES WHO FILED IT, AND NOT THE MODEL ITS RUN WAS STARTED ON. Wave 13k round 43, piece 2, and the owner's
 * decision of 8 November 2026 that takes words carrying no information off the office's pages.
 *
 * The owner had to ask which model wrote a report they were reading, so wave 13k round 43 named it. The owner then
 * read that line back and named it among the ones that read as written by an AI: the model a run was started on is
 * not something a reader of the report acts on. So the normal byline names the agent and nothing else, and the whole
 * account of the run and its model stays in developer mode, where the office's mechanics are read on purpose.
 *
 * WHAT THIS FILE PROVES, in a real browser, in English and in Chinese:
 *   1. a report an agent filed from a run on a named model says the agent's name and never the model's;
 *   2. a report an agent filed from a run that recorded no model says the same, with no sentence about the gap;
 *   3. a report the person filed has no filer line at all in normal mode.
 *
 * MUTATION, after a control run: in `filedHere` (src/web/pages/RecordPage.tsx), answer the old model sentence for an
 * agent in normal mode again. Cases 1 and 2 go red in both languages.
 *
 * Everything here is made up. `liveApp` starts its own API on ports of its own with a database of its own.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_AGENT = 'kiln-writer'
const ITS_NAME = 'Morgan Vale'

let app: LiveApp
const filed: { onAModel: string; noModel: string; byThePerson: string } = { onAModel: '', noModel: '', byThePerson: '' }

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** A run of the agent, on `model` when one is given, and a report the agent filed from it. */
async function aReportFromARunOn(model: string | null): Promise<string> {
  const run = await file(AS_THE_PERSON, 'session', `A run on ${model ?? 'no recorded model'}`, {
    state: 'finished',
    runtime: 'claude-code',
    ...(model === null ? {} : { model }),
  })
  const asTheAgent = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_AGENT,
    'x-mole-office-session': run,
  }
  return file(asTheAgent, 'report', `What the run on ${model ?? 'no recorded model'} found`, { for: 'the owner' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-report-names-the-model', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ runtime: 'claude-code', handle: THE_AGENT, name: ITS_NAME, role: 'worker' }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
  filed.onAModel = await aReportFromARunOn('claude-opus-5-5')
  filed.noModel = await aReportFromARunOn(null)
  filed.byThePerson = await file(AS_THE_PERSON, 'report', 'What the person wrote down', { for: 'the owner' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

async function theFilerLine(id: string, lang: 'en' | 'zh'): Promise<string | null> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}#/r/${id}`)
  await waitForThePage(app.page, 60_000)
  const line = app.page.locator('p.rd-byline [data-testid="report-filed-by"]')
  return (await line.count()) === 0 ? null : ((await line.first().textContent()) ?? '').trim()
}

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang).t

  it(`a report from a run on a named model names the agent and not the model (${lang})`, async () => {
    const said = await theFilerLine(filed.onAModel, lang)
    expect(said).toBe(words('g2b.report.filedBy', { who: ITS_NAME }))
    expect(said, 'the model reached a normal page').not.toContain('Claude Opus 5.5')
    expect(said, 'the stored id is developer mode\'s').not.toContain('claude-opus-5-5')
  }, 120_000)

  it(`a report from a run that recorded no model does not mention a model (${lang})`, async () => {
    const said = await theFilerLine(filed.noModel, lang)
    expect(said).toBe(words('g2b.report.filedBy', { who: ITS_NAME }))
    expect(said, 'a sentence about a missing model is back').not.toContain('model')
  }, 120_000)

  it(`a report the person filed has no filer line in normal mode (${lang})`, async () => {
    expect(await theFilerLine(filed.byThePerson, lang)).toBeNull()
  }, 120_000)
}
