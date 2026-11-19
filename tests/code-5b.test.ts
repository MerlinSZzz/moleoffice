// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
async function ask(path: string, body?: unknown, actor = person, method = 'POST') {
  const response = await fetch(app.api + path, { method, headers: actor, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
beforeAll(async () => { app = await liveApp({ name: 'code-5b', viewport: { width: 1440, height: 900 } }) }, 120_000)
afterAll(async () => { await app?.stop() })

it('a-directory-is-refused-as-a-work-area', async () => {
  for (const area of [`${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/code-5b`, '../outside', '.', 'src/../', 'C:\\checkout', '/tmp', 'src/../../outside']) {
    const said = await ask('/api/agents/started', { handle: 'bad-area', name: 'Bad area', runtime: 'claude-code', workArea: [area] })
    expect(said.status, JSON.stringify(said.body)).toBe(400)
    expect(said.body.error).toMatch(/work area.*files and folders.*repository/i)
  }
  const said = await ask('/api/agents/started', { handle: 'good-area', name: 'Good area', runtime: 'claude-code', workArea: ['./src//server/', 'tests/../tests/new'] })
  expect(said.status, JSON.stringify(said.body)).toBe(201)
  expect(said.body.agent.workArea).toEqual(['src/server', 'tests/new'])
})

it('a-starter-changes-a-workers-work-area', async () => {
  const starter = await ask('/api/agents/started', { handle: 'area-starter', name: 'Area starter', runtime: 'claude-code', role: 'supervisor' })
  expect(starter.status).toBe(201)
  const asStarter = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'area-starter' }
  const made = await ask('/api/agents/started', { handle: 'area-worker', name: 'Area worker', runtime: 'claude-code', workArea: ['src/server'] }, asStarter)
  expect(made.status).toBe(201)
  const changed = await ask('/api/participants/agent/area-worker/work-area', { workArea: ['src/../src/web/', 'tests\\code-5b'], because: 'The task now includes its page.' }, asStarter)
  expect(changed.status, JSON.stringify(changed.body)).toBe(200)
  expect(changed.body.agent.workArea).toEqual(['src/web', 'tests/code-5b'])
  const stranger = await ask('/api/participants/agent/area-worker/work-area', { workArea: [], because: 'Not my worker.' }, { ...asStarter, 'x-mole-office-actor-id': 'stranger' })
  expect(stranger.status).toBe(403)
  const rec = await ask('/api/records/' + made.body.record, undefined, person, 'GET')
  // The record revision stores the reason and the change log attributes the write.
  expect(rec.body.record.data.extra.workAreaChange).toMatchObject({
    by: { type: 'agent', id: starter.body.agent.id }, because: 'The task now includes its page.',
    before: ['src/server'], after: ['src/web', 'tests/code-5b'],
  })
  expect(Number.isFinite(Date.parse(rec.body.record.data.extra.workAreaChange.at))).toBe(true)
  // FILED BY ITS STARTER, as tools/register-a-run.mjs files a run: since the filing door of round 30 a claim to be
  // the person with no key may not file a session for an agent.
  const session = await ask('/api/records', { kind: 'session', title: 'Area worker run', data: { state: 'running', servingAgent: 'area-worker', cutFrom: 'main', workingDirectory: process.cwd() } }, asStarter)
  const check = await ask('/api/checks/' + session.body.record.id, undefined, person, 'GET')
  expect(check.status, JSON.stringify(check.body)).toBe(200)
  expect(JSON.stringify(check.body)).toContain('tests/code-5b')
  await app.page.goto(app.site + '/#/who/agent/area-worker')
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Change work area' }).click()
  if (process.env['CODE_5B_SHOTS']) {
    const dir = process.env['CODE_5B_SHOTS']!
    mkdirSync(dir, { recursive: true })
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/work-area-${width}-${theme}.png`, fullPage: true })
    }
  }
  await app.page.getByRole('textbox', { name: 'Files and folders' }).waitFor({ timeout: 5000 })
  await app.page.getByRole('textbox', { name: 'Files and folders' }).fill('src/shared\ntests/code-5b')
  await app.page.getByRole('textbox', { name: 'Why the area changed' }).fill('The shared drawing belongs to this task.')
  await app.page.getByRole('button', { name: 'Save work area' }).click()
  await expect.poll(async () => (await ask('/api/participants/agent/area-worker', undefined, person, 'GET')).body.participant.workArea).toEqual(['src/shared', 'tests/code-5b'])
})
