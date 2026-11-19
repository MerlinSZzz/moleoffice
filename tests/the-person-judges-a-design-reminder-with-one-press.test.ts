// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON JUDGES A DESIGN REMINDER WITH ONE PRESS, ON THE REGULATIONS PAGE, AND THE PRESS IS DRAWN FOR NOBODY ELSE.
 * Part 6 of the design-first build of wave 13s's requirements, on decision bYwACBK03tGT: the secretary the
 * assigner answers to, or the person, judges each reminder with one press. The secretary judges at its door with its
 * key; the person judges on the page. The door is POST /api/design-reminders/<id>/judgement, in
 * src/server/api/project-rules.ts; the page is src/web/pages/RegulationsPage.tsx, and what it draws is held still in
 * tests/the-regulations-page-counts-the-design-reminders-of-the-days.test.ts.
 *
 * The same three claims as tests/the-persons-three-presses.test.ts, in the same order:
 *   1. an agent viewer is offered no press on the reminder;
 *   2. the person is offered the three verdicts on it;
 *   3. one press judges it: the judgement is read back from the door, with the person as its judge, and the page
 *      then draws the verdict and no press.
 *
 * WHY IT IS A BROWSER TEST: a drawn page can show a button, and cannot show that pressing it writes, or who the
 * browser writes as.
 *
 * WHAT IS REAL: a scratch office of this test's own (`liveApp`), a browser, and a scratch git folder. The world is made
 * over HTTP: the person registers an assigner, the assigner registers a worker and files the worker's run with its own
 * key, the person marks the run as method work, and the run's first write that would seal it, with no design linked, is
 * answered with the reminder that is kept. Every name and record here is made up.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 17adf3aef (since remade with its author set, as e6a155c12, the same tree),
 * with this file in the worktree and the code not yet written: the file was red in its setup. Registering and filing
 * the run over HTTP worked, and the mark found no such door (404), so no case ran. Each case's proof is a mutation.
 * MUTATION PROOF, 8 November 2026, after a control run of 3 green. Each mutation alone, then restored:
 * - the press drawn for any viewer: case 1 red.
 * - two verdicts offered in place of three: case 2 red.
 * - the page not read again after the press: case 3 red, at the test's 30-second limit, waiting for the verdict's
 *   words.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t as word } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
let folder = ''
let reminder = ''

const WORKSPACE = 'default'
let asThePerson: Record<string, string> = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const res = await fetch(`${app.api}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const raw = await res.text()
  let parsed: unknown = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }
  return { status: res.status, body: parsed, raw }
}

const asAgent = (handle: string, key: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key })

async function register(handle: string, by: Record<string, string>, workArea?: string[]): Promise<Record<string, string>> {
  const made = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(workArea === undefined ? {} : { workArea }) })
  expect(made.status, made.raw).toBe(201)
  const key = String(made.body.whatToGiveIt?.key)
  expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
  return asAgent(handle, key)
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** Open the regulations page from nothing, as the person or as an agent viewer, the way the sidebar's picker sets it. */
async function openTheRegulations(as: 'person' | 'agent'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${app.site}/#/regulations`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((who) => {
    if (who === 'person') window.localStorage.removeItem('mole-office.actor')
    else window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude-code' }))
  }, as)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`[data-design-reminder="${reminder}"]`).waitFor({ state: 'visible', timeout: 30_000 })
}

const theReminder = () => page.locator(`[data-design-reminder="${reminder}"]`)

beforeAll(async () => {
  app = await liveApp({ name: 'design-reminder-press', viewport: { width: 1440, height: 900 } })
  page = app.page
  asThePerson = {
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
  const assigner = await register('made-up-press-assigner', asThePerson)
  // The worker's work area is work/, which its run changes, so the run seals as git.
  const worker = await register('made-up-press-worker', assigner, ['work'])

  folder = mkdtempSync(join(tmpdir(), 'design-reminder-press-'))
  const dir = join(folder, 'tree')
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Made-up fixture')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(dir, 'work/a.txt'), 'Made-up baseline\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Made-up baseline')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'work')
  const filed = await call('POST', '/api/records', assigner, {
    kind: 'session',
    title: 'Made-up run of the press',
    data: { state: 'running', runtime: 'claude-code', servingAgent: 'made-up-press-worker', workingDirectory: dir, cutFrom: 'main', tip: base, doing: 'Made-up work is ready to seal.' },
  })
  expect(filed.status, filed.raw).toBe(201)
  const run = String(filed.body.record.id)
  const runKey = String(filed.body.runKey?.key)
  expect(/^[0-9a-f]{64}$/.test(runKey), 'the run was answered no key of its own').toBe(true)
  writeFileSync(join(dir, 'work/a.txt'), 'Made-up change\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Made-up work')
  const tip = git(dir, 'rev-parse', 'HEAD')

  const marked = await call('POST', `/api/runs/${run}/method-work`, asThePerson, { work: 'method-work', because: 'Made-up: the run builds the grasp method.' })
  expect(marked.status, marked.raw).toBe(200)
  const finish = await call('PATCH', `/api/records/${run}`, { ...asAgent(worker['x-mole-office-actor-id']!, runKey), 'x-mole-office-session': run }, { dataPatch: { state: 'finished', tip } })
  expect(finish.status, finish.raw).toBe(200)
  reminder = String(finish.body.beforeTheSeal?.design?.reminder)
  expect(reminder, `the run was not reminded of its design: ${finish.raw}`).toMatch(/^[A-Za-z0-9_-]{12}$/)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

describe('the person judges a design reminder with one press', () => {
  it('1. an agent viewer is offered no press on the reminder', async () => {
    await openTheRegulations('agent')
    await theReminder().getByText(word('regulationsPage.reminders.notJudged')).waitFor({ state: 'visible', timeout: 30_000 })
    expect(await theReminder().locator('[data-verdict]').count()).toBe(0)
  })

  it('2. the person is offered the three verdicts on it', async () => {
    await openTheRegulations('person')
    const offered = await theReminder().locator('[data-verdict]').evaluateAll((all) => all.map((one) => one.getAttribute('data-verdict')))
    expect(offered).toEqual(['right', 'wrong-not-method-work', 'wrong-it-was-there'])
  })

  it('3. one press judges it, as the person, and the page then draws the verdict and no press', async () => {
    await openTheRegulations('person')
    const sent = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().endsWith(`/api/design-reminders/${reminder}/judgement`), { timeout: 30_000 })
    await theReminder().locator('[data-verdict="right"] button').click()
    const answered = await sent
    expect(answered.status(), await answered.text()).toBe(200)
    const held = await call('GET', `/api/records/${reminder}`, asThePerson)
    expect(held.status, held.raw).toBe(200)
    expect(held.body.record.data.judgement).toEqual({ verdict: 'right', words: null, by: { kind: 'person', id: THE_PERSON }, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) })
    await theReminder().getByText(word('regulationsPage.reminders.byThePerson')).waitFor({ state: 'visible', timeout: 30_000 })
    expect(await theReminder().locator('[data-verdict]').count(), 'a press is still drawn on the judged reminder').toBe(0)
  })
})
