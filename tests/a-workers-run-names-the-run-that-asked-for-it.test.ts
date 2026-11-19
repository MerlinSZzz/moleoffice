// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER'S RUN NAMES THE SUPERVISOR'S RUN THAT ASKED FOR IT. Wave 13j round loop-5, item 2. A supervisor's run lists
 * the workers it asked for (loop-4), and the worker's own run said nothing back. The record's answer now carries
 * `askedForBy` on a run, read by `theRunThatAskedForThisWorker` in src/server/lib/worker-runs.ts, and the run's own page
 * and its record page draw it in words, leading to the supervisor's run.
 *
 * ITS PARENT IS NOT ENOUGH. Every continued run has a `parentAttachment` too, so the reading says it only when the
 * parent's own `workerRuns` keeps an entry that is `started` and names this run as the run it started. Only the office
 * writes those entries (src/shared/worker-runs.ts), inside the create that files the worker's run.
 *
 * EVERY RECORD HERE IS MADE UP, in a browser on this test's own office. The entries under `workerRuns` and the parents
 * are written straight into the test office's database, because only the office's own doors write them, and those
 * doors are proved in tests/a-supervisor-starts-its-own-worker.test.ts. Nothing is asked of the live office.
 *
 * What is proved:
 *   1. The answer: a worker's run names its supervisor's run, its title and who asked; an asker the registry does not
 *      hold is given by its stored id with no name. A continued run under the same parent that no entry names, a run
 *      whose entry is still `starting`, a run whose parent is deleted, and the supervisor's run itself answer null. A
 *      record that is not a run has no `askedForBy` key.
 *   2. The run's own page draws it in words, with a link to the supervisor's run; the no-name asker is said to be one
 *      the registry does not hold. A continued run and a starting one draw nothing.
 *   3. The run's record page draws the same, and draws nothing for the continued run.
 *   4. WHO STARTED IT, on the run's own page (wave 13j round loop-7, item 1; the secretary's answer 3 in X8LBo7MOvvMp). On a
 *      worker's run the "Started by" fact names the agent that asked for it, read from `askedForBy` and not worked out
 *      again, even where a release reported to another agent; an asker the registry does not hold is said by its stored
 *      id. Any other run names the agent its release reported to, as before, or says nobody recorded it. Nothing says
 *      which agent ran the start itself, because no stored fact pairs an asker with the agent that ran it.
 *   5. THE THREE SHARED PANELS' TITLES ARE LABELS ON THE RUN'S OWN PAGE (wave 13j round loop-7, item 2). Who asked for
 *      this run, the check on this run and the worker runs carry `data-title-is="its-label"` there, as every other
 *      panel title on that page does, and none on the record page, where they keep their writer's case.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/worker-runs.ts, an entry is taken whatever its state: cases 1 and 2 go red.
 *   B. src/server/lib/worker-runs.ts, the run an entry started is not compared with this run: cases 1, 2 and 3 go red.
 *   C. src/server/lib/worker-runs.ts, a deleted parent is read: case 1 goes red.
 *   D. src/web/pages/SessionPage.tsx, the line that mounts it is taken out: case 2 goes red.
 *   E. src/web/pages/RecordPage.tsx, the line that mounts it is taken out: case 3 goes red.
 *   F. src/web/pages/SessionPage.tsx, "Started by" reads the release alone again: case 4 goes red.
 *   G. src/web/pages/SessionPage.tsx, one of the three panels is given no titleIs: case 5 goes red, once for each.
 *   H. src/web/components/TheWorkersOfARun.tsx and TheCheckOnARun.tsx, a panel does not pass its titleIs on: case 5
 *      goes red.
 *   I. src/web/pages/RecordPage.tsx, a panel is given titleIs="label": case 5 goes red.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(method: string, url: string, body?: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers: PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

const SUPERVISOR_TITLE = 'Made-up run: the kiln supervisor plans the firing'
const GONE_TITLE = 'Made-up run: a supervisor the registry no longer holds'
const runs = { supervisor: '', gone: '', deleted: '', ada: '', continued: '', cy: '', ed: '', fy: '' }
let supervisorAgent = ''
let leadAgent = ''
let note = ''

/** One stored ask, as the worker-run door keeps it. */
function anAsk(handle: string, askerId: string, askedFrom: string, rest: Partial<TheWorkerRun>): TheWorkerRun {
  return {
    state: 'started',
    askedAt: '2026-10-13 09:01:00',
    askedBy: { who: { kind: 'agent', id: askerId }, session: askedFrom },
    handle,
    brief: { path: '/made/up/briefs/one.md', sha256: 'a'.repeat(64), bytes: 120 },
    sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up-container' },
    ...rest,
  }
}
const startedAs = (run: string) => ({ started: { at: '2026-10-13 09:31:00', run, runKeyId: 'made-up-key' } })

beforeAll(async () => {
  app = await liveApp({ name: 'a-workers-run-names-its-asker', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'kw-sup', name: 'Kiln supervisor', role: 'worker' })
  await send('POST', '/api/agents/started', { handle: 'kw-lead', name: 'Glaze lead', role: 'worker' })
  const aRun = async (title: string) =>
    (await send('POST', '/api/records', { kind: 'session', title, data: { state: 'running', runtime: 'claude-code' } }))['record'].id as string
  runs.supervisor = await aRun(SUPERVISOR_TITLE)
  runs.gone = await aRun(GONE_TITLE)
  runs.deleted = await aRun('Made-up run: a supervisor run that was deleted')
  runs.ada = await aRun('Made-up run: Ada glazes the test tiles')
  runs.continued = await aRun('Made-up run: the kiln supervisor, continued')
  runs.cy = await aRun('Made-up run: Cy, whose ask is still starting')
  runs.ed = await aRun('Made-up run: Ed fires the kiln')
  runs.fy = await aRun('Made-up run: Fy, under a deleted run')
  note = (await send('POST', '/api/records', { kind: 'note', title: 'A made-up note', data: { body: 'Made up.' } }))['record'].id as string

  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    supervisorAgent = (db.prepare('SELECT id FROM agents WHERE handle = ?').get('kw-sup') as { id: string }).id
    leadAgent = (db.prepare('SELECT id FROM agents WHERE handle = ?').get('kw-lead') as { id: string }).id
    const write = db.prepare('UPDATE records SET data = ? WHERE id = ?')
    const under = (parent: string, more: object = {}) =>
      JSON.stringify({ state: 'running', runtime: 'claude-code', parentAttachment: parent, ...more })
    // A RELEASE THAT REPORTED TO THE GLAZE LEAD, who did not ask for any run here. Finished, so the check panel draws.
    const releasedToTheLead = {
      state: 'finished',
      released: { by: { kind: 'agent', id: 'made-up-inspector' }, how: 'an inspector', at: '2026-10-13 11:00:00', reportedTo: { kind: 'agent', id: leadAgent } },
    }
    write.run(JSON.stringify({
      state: 'running', runtime: 'claude-code',
      workerRuns: {
        'made-up-ada': anAsk('kw-ada', supervisorAgent, runs.supervisor, startedAs(runs.ada)),
        // STILL STARTING, though it names the run: only a started entry says the run is the worker's.
        'made-up-cy': anAsk('kw-cy', supervisorAgent, runs.supervisor, { state: 'starting', ...startedAs(runs.cy) }),
      },
    }), runs.supervisor)
    write.run(JSON.stringify({
      state: 'running', runtime: 'claude-code',
      workerRuns: { 'made-up-ed': anAsk('kw-ed', 'made-up-gone-supervisor', runs.gone, startedAs(runs.ed)) },
    }), runs.gone)
    write.run(JSON.stringify({
      state: 'running', runtime: 'claude-code',
      workerRuns: { 'made-up-fy': anAsk('kw-fy', supervisorAgent, runs.deleted, startedAs(runs.fy)) },
    }), runs.deleted)
    db.prepare("UPDATE records SET deleted_at = '2026-10-13 10:00:00' WHERE id = ?").run(runs.deleted)
    write.run(under(runs.supervisor, releasedToTheLead), runs.ada)
    write.run(under(runs.supervisor, releasedToTheLead), runs.continued)
    write.run(under(runs.supervisor), runs.cy)
    write.run(under(runs.gone), runs.ed)
    write.run(under(runs.deleted), runs.fy)
  } finally {
    db.close()
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function open(page: Page, address: string, title: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // Both pages draw the run only once the record's answer has come, so its title being there means the answer is drawn.
  await page.locator('h1', { hasText: title }).first().waitFor({ timeout: 30_000 })
}

describe("a worker's run names the supervisor's run that asked for it", () => {
  it('1: the answer names the asking run only when its workerRuns names this run as started', async () => {
    const answer = async (id: string) => (await send('GET', `/api/records/${id}`))
    expect((await answer(runs.ada))['askedForBy']).toEqual({ run: runs.supervisor, title: SUPERVISOR_TITLE, askerId: supervisorAgent, askerName: 'Kiln supervisor' })
    expect((await answer(runs.ed))['askedForBy']).toEqual({ run: runs.gone, title: GONE_TITLE, askerId: 'made-up-gone-supervisor', askerName: null })
    for (const [which, id] of [['a continued run', runs.continued], ['a starting ask', runs.cy], ['a deleted parent', runs.fy], ['the supervisor', runs.supervisor]] as const) {
      const read = await answer(id)
      expect(Object.hasOwn(read, 'askedForBy'), `${which} carries the key`).toBe(true)
      expect(read['askedForBy'], which).toBeNull()
    }
    expect(Object.hasOwn(await answer(note), 'askedForBy'), 'a note carries the key').toBe(false)
  }, 60_000)

  it("2: the run's own page says who asked for it, in words, with a link to the supervisor's run", async () => {
    const page = app.page
    await open(page, `/session/${runs.ada}`, 'Ada glazes the test tiles')
    const asked = page.locator('.wr-asked')
    await asked.waitFor({ timeout: 20_000 })
    expect(await asked.innerText()).toContain('Kiln supervisor asked the office to start this run as one of its workers.')
    const link = asked.getByRole('link', { name: SUPERVISOR_TITLE, exact: true })
    expect(await link.getAttribute('href')).toBe(`#/session/${runs.supervisor}`)
    // ITS TEXT, AND NOT ITS DRAWN CASE: on this page the title is a label (case 5), which the light theme draws in capitals.
    expect(await page.locator('.px-panel', { has: asked }).locator('.px-panel-title').textContent()).toBe('Who asked for this run')

    await open(page, `/session/${runs.ed}`, 'Ed fires the kiln')
    await asked.waitFor({ timeout: 20_000 })
    expect(await asked.innerText()).toContain('An agent the registry does not hold asked the office to start this run as one of its workers.')
    expect(await asked.getByRole('link', { name: GONE_TITLE, exact: true }).getAttribute('href')).toBe(`#/session/${runs.gone}`)

    for (const [id, title] of [[runs.continued, 'the kiln supervisor, continued'], [runs.cy, 'Cy, whose ask is still starting']] as const) {
      await open(page, `/session/${id}`, title)
      await page.locator('.sp-facts').first().waitFor({ timeout: 20_000 })
      expect(await asked.count(), `${title}: nothing is drawn`).toBe(0)
    }
  }, 180_000)

  it("3: the run's record page says the same, and says nothing for a continued run", async () => {
    const page = app.page
    await open(page, `/r/${runs.ada}`, 'Ada glazes the test tiles')
    const asked = page.locator('.wr-asked')
    await asked.waitFor({ timeout: 20_000 })
    expect(await asked.innerText()).toContain('Kiln supervisor asked the office to start this run as one of its workers.')
    expect(await asked.getByRole('link', { name: SUPERVISOR_TITLE, exact: true }).getAttribute('href')).toBe(`#/session/${runs.supervisor}`)

    await open(page, `/r/${runs.continued}`, 'the kiln supervisor, continued')
    expect(await asked.count(), 'a continued run draws nothing').toBe(0)
  }, 120_000)

  it("4: who started a worker's run is the agent that asked for it, and any other run names whom its release reported to", async () => {
    const page = app.page
    const startedBy = page.locator('.sp-fact', { has: page.locator('dt', { hasText: 'Started by' }) }).locator('dd')
    const says = async () => ((await startedBy.textContent()) ?? '').trim()
    const leadsTo = async () => await startedBy.getByRole('link').getAttribute('href')

    // ITS RELEASE REPORTED TO THE GLAZE LEAD, and the page names the supervisor that asked for it all the same.
    await open(page, `/session/${runs.ada}`, 'Ada glazes the test tiles')
    await startedBy.waitFor({ timeout: 20_000 })
    expect(await says()).toBe('Kiln supervisor')
    expect(await leadsTo()).toBe(`#/who/agent/${supervisorAgent}`)

    // An asker the registry does not hold is said the way this page says every agent nothing has named.
    await open(page, `/session/${runs.ed}`, 'Ed fires the kiln')
    await startedBy.waitFor({ timeout: 20_000 })
    expect(await says()).toBe('agent made-up-gone-supervisor')
    expect(await leadsTo()).toBe('#/who/agent/made-up-gone-supervisor')

    // NOT A WORKER'S RUN: its release is read, as before.
    await open(page, `/session/${runs.continued}`, 'the kiln supervisor, continued')
    await startedBy.waitFor({ timeout: 20_000 })
    expect(await says()).toBe('Glaze lead')
    expect(await leadsTo()).toBe(`#/who/agent/${leadAgent}`)

    // A run whose ask is still starting is no worker's run yet, and nothing released it.
    await open(page, `/session/${runs.cy}`, 'Cy, whose ask is still starting')
    await startedBy.waitFor({ timeout: 20_000 })
    expect(await says()).toBe('Nobody recorded who started this run.')
    expect(await startedBy.getByRole('link').count()).toBe(0)
  }, 180_000)

  it("5: on the run's own page the three shared panels' titles are labels, and on its record page they are not", async () => {
    const page = app.page
    const titled = (words: string) => page.locator('h2.px-panel-title').filter({ hasText: new RegExp(`^${words}$`, 'i') })
    const panels = [
      { words: 'Who asked for this run', run: runs.ada, title: 'Ada glazes the test tiles' },
      { words: 'The check on this run', run: runs.ada, title: 'Ada glazes the test tiles' },
      { words: 'Worker runs', run: runs.supervisor, title: 'the kiln supervisor plans the firing' },
    ]
    for (const one of panels) {
      await open(page, `/r/${one.run}`, one.title)
      await titled(one.words).first().waitFor({ timeout: 20_000 })
      expect(await titled(one.words).count(), `${one.words}: one title on the record page`).toBe(1)
      expect(await titled(one.words).getAttribute('data-title-is'), `${one.words}: the record page`).toBeNull()

      await open(page, `/session/${one.run}`, one.title)
      await titled(one.words).first().waitFor({ timeout: 20_000 })
      expect(await titled(one.words).count(), `${one.words}: one title on the run's own page`).toBe(1)
      expect(await titled(one.words).getAttribute('data-title-is'), `${one.words}: the run's own page`).toBe('its-label')
    }
  }, 240_000)
})

it('a hand-started noKey worker names the asking run on its page through the hand-start office calls', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { aMadeUpSandboxRepo } = await import('./a-made-up-sandbox-repo.ts')
  const { theWordsNamingTheFolder } = await import('../src/config/sandbox-folder.mjs')
  const { fileURLToPath } = await import('node:url')
  const folder = join(app.dir, 'hand-sandbox')
  mkdirSync(folder)
  const repo = aMadeUpSandboxRepo(folder, fileURLToPath(new URL('..', import.meta.url)))
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, 'A made-up hand brief.\n')
  const request = async (url: string, body: object, headers: Record<string, string> = PERSON) => {
    const r = await fetch(app.api + url, { method: 'POST', headers, body: JSON.stringify(body) })
    const value = await r.json() as Record<string, any>
    expect(r.status, value['error']).toBeLessThan(300)
    return value
  }
  const starter = await request('/api/agents/started', { handle: 'kw-hand-boss', name: 'Hand kiln supervisor', role: 'supervisor' })
  const headers = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kw-hand-boss', 'x-mole-office-key': String(starter.whatToGiveIt.key) }
  const asking = await request('/api/records', { kind: 'session', title: 'Made-up hand asking run', data: { state: 'running', servingAgent: 'kw-hand-boss', workingDirectory: repo.repo } }, headers)
  const askingId = String(asking.record.id)
  const resource = await request('/api/resources', { sessionRecordId: askingId, type: 'container', key: 'mole-office-sandbox-hand-sandbox', detail: `Sandbox hand-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.` })
  const patched = await fetch(app.api + `/api/records/${askingId}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ dataPatch: { sandbox: { folder, container: resource.resource.id, template: 'mole-office-dev' } } }) })
  expect(patched.status).toBe(200)
  await request('/api/agents/started', { handle: 'kw-hand-worker', name: 'Hand kiln worker', noKey: true }, headers)
  const ask = { askedBy: askingId, brief }
  const checked = await request('/api/agents/kw-hand-worker/hand-run', ask, headers)
  expect(checked.cut.commit).toBe(repo.head)
  const filed = await request('/api/records', { kind: 'session', title: 'Made-up hand-started kiln worker', ...ask, data: { state: 'running', servingAgent: 'kw-hand-worker', runtime: 'claude-code', workingDirectory: repo.repo, tip: repo.head, cutFrom: repo.head } }, headers)
  const run = String(filed.record.id)
  const read = await send('GET', `/api/records/${run}`)
  expect(read.askedForBy).toMatchObject({ run: askingId, askerId: starter.agent.id })
  await open(app.page, `/session/${run}`, 'hand-started kiln worker')
  const asked = app.page.locator('.wr-asked')
  await asked.waitFor({ timeout: 20_000 })
  expect(await asked.innerText()).toContain('Hand kiln supervisor asked the office to start this run as one of its workers.')
  expect(await asked.getByRole('link', { name: 'Made-up hand asking run', exact: true }).getAttribute('href')).toBe(`#/session/${askingId}`)
}, 120_000)
