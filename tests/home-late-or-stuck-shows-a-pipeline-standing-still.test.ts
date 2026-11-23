// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LATE OR STUCK SAYS WHEN A PIPELINE IS STANDING STILL.
 *
 * A decision settled problem RK4zJb6hJyV6. When every unfinished step of a pipeline is paused,
 * Home says the pipeline is standing still. The old Home said it under its pipelines band. The five-section Home has no
 * pipelines band. So the sentence moves to Late or stuck, which is where a stuck thing goes,
 * with the state first as the side column draws it. A pipeline that is still moving is not in Late or stuck.
 *
 * This replaces the browser case that the homes-last-words-follow-the-page-language test held
 * until wave 13k's round 16 (the sentence itself is proved by home-says-a-paused-pipeline-stands-
 * still.test.ts). MUTATION: Home stops passing its standing-still pipelines to Late or stuck; both
 * languages go red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let app: LiveApp

async function request(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(`${app.api}${path}`, { method: body === undefined ? 'GET' : method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const answer = await response.json()
  expect(response.ok, `${method} ${path}: ${JSON.stringify(answer)}`).toBe(true)
  return answer
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-pipeline-standing-still', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const still = (await request('/api/records', { kind: 'pipeline', title: 'Made-up lantern making', data: { blockIds: [] } })).record
  await request(`/api/records/${still.id}/blocks`, { name: 'Cut the paper', state: 'done' })
  for (const [name, state] of [['Glue the frame', 'doing'], ['Fit the wick', 'todo']]) {
    const block = await request(`/api/records/${still.id}/blocks`, { name, state })
    await request(`/api/records/${block.record.id as string}`, { dataPatch: { paused: { since: '2026-08-12 10:00:00', why: 'The made-up workshop is closed.' } } }, 'PATCH')
  }
  const moving = (await request('/api/records', { kind: 'pipeline', title: 'Made-up kite making', data: { blockIds: [] } })).record
  await request(`/api/records/${moving.id}/blocks`, { name: 'Tie the string', state: 'doing' })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('draws a pipeline whose unfinished steps are all paused in Late or stuck, state first, in both languages, and leaves a moving one out', async () => {
  for (const [language, words] of [['en', en], ['zh', zh]] as const) {
    await app.page.goto(`${app.site}/?lang=${language}&mode=normal#/`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const late = app.page.locator('[data-home-section="late"]')
    // Late or stuck is one number, and pressing it opens its list.
    await late.locator('summary').click({ timeout: 20_000 })
    const still = words['homeWords.pipelineStill'] as { other: string }
    const sentence = still.other.replace('{n}', '2')
    const row = late.locator('.hm-alarm-row', { hasText: 'Made-up lantern making' })
    await row.waitFor({ timeout: 20_000 })
    expect((await row.locator('.hm-alarm-state').innerText()).trim(), `${language}: the state comes first`).toBe(sentence)
    expect(await late.locator('.hm-alarm-row', { hasText: 'Made-up kite making' }).count(), `${language}: a moving pipeline is not stuck`).toBe(0)
  }
}, 120_000)
