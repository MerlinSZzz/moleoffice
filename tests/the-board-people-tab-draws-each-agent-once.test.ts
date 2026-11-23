// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOARD PEOPLE TAB DRAWS EACH AGENT ONCE, in its own made-up office.
 * 1. At 1280 in English, supervisor runs, packages and workers are ordered and linked; one-run agents keep their view.
 * 2. An unassigned worker's runs keep their own packages and the line summaries count each card or say at rest.
 * 3. Chinese words appear in the summary and headings. At 390 in dark the page fits without sideways scrolling.
 * The page is src/web/pages/ProjectBoardPage.tsx and its answer is src/server/lib/project-people.ts.
 */
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, setWordLanguage } from '../src/shared/i18n.ts'
import { stampToTheMinute } from '../src/web/lib/minute.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const HERE = 'default'
const AT = '2026-11-22 10:00:00'
const EARLY = '2026-11-22 08:00:00'
const LATE = '2026-11-22 09:00:00'
let app: LiveApp
const id: Record<string, string> = {}

function writeTheOffice(db: Database.Database): void {
  const anAgent = (name: string, handle: string, role: string | null): void => {
    id[name] = `made-up-agent-${name}`
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    ).run(`avatar-default-agent-${id[name]}`, AT)
    db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, role) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id[name], `Made-up ${name}`, handle, `avatar-default-agent-${id[name]}`, AT, role)
  }
  const aRecord = (name: string, kind: string, title: string, data: Record<string, unknown>): void => {
    id[name] = `made-up-${name}`
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')",
    ).run(id[name], HERE, THE_TEST_OFFICES_OWNER.id, AT, AT, kind, title, JSON.stringify(data))
  }
  const aRun = (name: string, agent: string, handle: string, more: Record<string, unknown> = {}): void => {
    aRecord(name, 'session', `A made-up run, ${name}`, {
      state: 'running',
      servingAgent: handle,
      servingAgentId: id[agent],
      model: 'made-up-model',
      runtime: 'claude-code',
      ...more,
    })
  }
  const anAct = (order: number) => ({ by: { actorType: 'agent', actorId: id['supervisor']! }, at: AT, order })
  const aPackage = (name: string, lines: string[], acts: Record<string, unknown>, state = 'todo'): void => {
    aRecord(name, 'task', `A made-up package, ${name}`, {
      state,
      package: {
        bundleId: 'madeUpBundle',
        forTheOutside: 'Made-up: nothing leaves.',
        acceptance: 'Made-up: nothing is judged.',
        parent: { kind: 'decision', id: 'made-up-parent' },
        lines,
        pointIds: [`made-up-point-${name}`],
        at: AT,
        by: { actorType: 'human', actorId: THE_PERSON },
        ...acts,
      },
    })
  }
  const aStartedWorker = (handle: string, run: string) => ({
    state: 'started',
    askedAt: AT,
    askedBy: { who: { kind: 'agent', id: 'made-up-asker' }, session: id['supervisor-run'] },
    handle,
    brief: { path: '/made-up/sandbox/brief.md', sha256: 'a'.repeat(64), bytes: 1 },
    sandbox: { folder: '/made-up/sandbox', instance: 'made-up-instance', container: 'made-up-container' },
    started: { at: AT, run, runKeyId: 'made-up-key' },
  })
  const aRequestFrom = (run: string): void => {
    db.prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'agent', 'made-up-agent', ?, ?, 'none')",
    ).run(`made-up-call-${run}`, Date.now() - 5 * 60_000, run, HERE)
  }

  anAgent('supervisor', 'wave-99z-supervisor', 'supervisor')
  anAgent('single', 'wave-99z-single', 'supervisor')
  anAgent('shared', 'w99z-shared', 'worker')
  anAgent('free', 'w99z-free', 'worker')
  anAgent('another', 'w99z-another', 'worker')
  anAgent('inspector', 'w99z-inspector', 'inspector')
  aPackage('held', ['99z'], { takenInside: [anAct(1)] })
  aPackage('worker-package', ['99z'], {})
  aPackage('rest', ['99y'], {})
  aRun('shared-early', 'shared', 'w99z-shared', { startedAt: EARLY })
  aRun('shared-late', 'shared', 'w99z-shared', { startedAt: LATE })
  const workerPackage = { task: id['worker-package'], points: ['made-up-point-worker-package'], difficulty: 'simple', why: 'A made-up reason.', askedAt: AT }
  aRun('free-early', 'free', 'w99z-free', { startedAt: EARLY, workerPackage })
  aRun('free-late', 'free', 'w99z-free', { startedAt: LATE })
  id['supervisor-run'] = 'made-up-supervisor-early'
  aRun('supervisor-early', 'supervisor', 'wave-99z-supervisor', { startedAt: EARLY, workerRuns: { [id['shared']!]: aStartedWorker('w99z-shared', id['shared-early']!) } })
  aRun('supervisor-late', 'supervisor', 'wave-99z-supervisor', { startedAt: LATE, workerRuns: { [id['shared']!]: aStartedWorker('w99z-shared', id['shared-late']!) } })
  aRun('single-run', 'single', 'wave-99z-single', { startedAt: EARLY })
  aRun('another-run', 'another', 'w99z-another', { startedAt: EARLY })
  aRun('inspector-run', 'inspector', 'w99z-inspector', { startedAt: EARLY })
  for (const key of ['shared-early', 'shared-late', 'free-early', 'free-late', 'supervisor-early', 'supervisor-late', 'single-run', 'another-run', 'inspector-run']) aRequestFrom(id[key]!)
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  app = await liveApp({ name: 'board-people-each-agent-once', viewport: { width: 1280, height: 900 }, workspace: HERE })
  const db = new Database(join(app.dir, 'panelx.db'))
  try { db.pragma('busy_timeout = 10000'); writeTheOffice(db) } finally { db.close() }
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'pipeline', title: 'A made-up master', data: { blockIds: [] } }) })
  expect(made.ok).toBe(true)
  const master = (await made.json()) as { record: { id: string } }
  const marked = await fetch(`${app.api}/api/projects/${HERE}/master-pipeline`, { method: 'PUT', headers, body: JSON.stringify({ pipeline: master.record.id }) })
  expect(marked.ok).toBe(true)
  await app.page.addInitScript(({ person, project }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON, project: HERE })
}, 300_000)

afterAll(async () => { await app?.stop() }, 120_000)

async function open(width: number, language: 'en' | 'zh', look: 'light' | 'dark'): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=${look}#/board`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('button.pb-tab[data-tab="people"]').click()
  await app.page.locator('[data-board-view="people"]').waitFor()
}
const lane = (line: string) => app.page.locator(`[data-board-line="${line}"]`)
const agent = (key: string) => lane('99z').locator(`[data-people-agent="${id[key]}"]`)

describe('the board people tab draws each agent once', () => {
  it('draws ordered supervisor runs and workers, with links and packages; one-run agents stay as before', async () => {
    await open(1280, 'en', 'light')
    const supervisor = agent('supervisor')
    expect(await supervisor.count()).toBe(1)
    expect(await supervisor.locator(':scope > h3 a').getAttribute('href')).toBe(`#/who/agent/${id['supervisor']}`)
    const parts = supervisor.locator(':scope > [data-people-packages], :scope > [data-people-run]')
    expect(await parts.evaluateAll((nodes) => nodes.map((node) => node.hasAttribute('data-people-packages') ? 'packages' : node.getAttribute('data-people-run')))).toEqual(['packages', id['supervisor-early'], id['supervisor-late']])
    expect(await supervisor.locator(':scope > [data-people-packages]').innerText()).toContain('Packages')
    expect(await supervisor.locator(`:scope > [data-people-packages] [data-people-package="${id['held']}"]`).count()).toBe(1)
    for (const [key, start, child] of [['supervisor-early', EARLY, 'shared-early'], ['supervisor-late', LATE, 'shared-late']] as const) {
      const part = supervisor.locator(`:scope > [data-people-run="${id[key]}"]`)
      const heading = part.locator(':scope > h3 a')
      expect(await heading.innerText()).toBe(`Run since ${stampToTheMinute(start!)}`)
      expect(await heading.getAttribute('href')).toBe(`#/session/${id[key]}`)
      const worker = part.locator(`[data-people-agent="${id['shared']}"]`)
      expect(await worker.count()).toBe(1)
      expect(await worker.locator(':scope > h3 a').getAttribute('href')).toBe(`#/session/${id[child!]}`)
    }
    const single = agent('single')
    expect(await single.locator(':scope > h3 a').getAttribute('href')).toBe(`#/session/${id['single-run']}`)
    expect(await single.locator(':scope > [data-people-packages], :scope > [data-people-run]').count()).toBe(0)
  }, 180_000)
  it('draws an unassigned worker once with each run package, and counts each card', async () => {
    await open(1280, 'en', 'light')
    const free = agent('free')
    expect(await free.count()).toBe(1)
    expect(await free.locator(`[data-people-run="${id['free-early']}"] [data-people-package="${id['worker-package']}"]`).count()).toBe(1)
    expect(await free.locator(`[data-people-run="${id['free-late']}"]`).innerText()).toContain('package not named')
    expect(await lane('99z').locator('[data-people-summary]').innerText()).toContain('2 supervisors, 3 workers and 1 inspector running')
    expect(await lane('99y').locator('[data-people-summary]').innerText()).toContain('at rest')
  })
  it('uses the Chinese words and fits a dark phone', async () => {
    await open(1280, 'zh', 'light')
    expect(await lane('99z').locator('[data-people-summary]').innerText()).toContain('2 个主管、3 个工人和 1 个检查员在运行')
    expect(await agent('supervisor').locator(':scope > [data-people-packages]').innerText()).toContain('任务包')
    setWordLanguage('zh')
    try {
      const heading = createI18n('zh').t('board.people.run.since', { time: stampToTheMinute(EARLY) })
      expect(await agent('supervisor').locator(':scope > [data-people-run]').first().locator(':scope > h3').innerText()).toBe(heading)
    } finally { setWordLanguage('en') }
    await open(390, 'en', 'dark')
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }, 180_000)
})
