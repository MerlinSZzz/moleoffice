// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** New finishes now seal their Git tip. The old synthetic inspector metadata lacked that identity; assemblies and verdicts now echo the actual seal while every lifecycle and browser assertion remains. */
/**
 * C28, second half: a finished run starts the check tool through the message worker's process
 * path. The far end is an explicitly synthetic script, never a model or a real inspection.
 * Baseline: the old C28 file passed 8/8 while startOne always chose the agent's provider adapter
 * and resumed its conversation. This test reaches onePass, the process ledger and the browser.
 * Mutation: selecting the provider adapter for an inspection makes the runtime/command assertions
 * fail. Removing failure recording or the retry press makes the failed-check browser case fail.
 *
 * WAVE 13n ROUND F: the failed check was drawn at eight widths and looks. One drawing stays, at 1440 in light, and
 * every case of the check tool's work, its process group stop and its recovery stays.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { outputOf } from '../src/worker/runtimes/common.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

let app: LiveApp
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** Where the office's own tools are: this checkout, whose fake runtime and fake check tool the worker starts. */
const checkout = process.cwd()
/**
 * WHERE THE FIXTURE RUNS WORKED: a throwaway repository, never this checkout (message VtCw66ZmGn74). A run
 * finished in the real checkout seals the checkout, so this file read the checkout's own state, and the seal read every
 * file of it through git cat-file --batch, which kept every document from landing alone. The
 * seal is still a real git seal: a baseline on main, and one change inside the builder's work area on a branch.
 */
let worktree = ''
let tip = ''
function aThrowawayRepository(): string {
  const dir = realpathSync(aTestDatabaseFolder('the-office-runs-the-check-tool'))
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic check-tool fixture')
  mkdirSync(join(dir, 'src', 'server', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\nexport const after = 2\n')
  git('commit', '-q', '-am', 'Synthetic work')
  return dir
}
const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
/**
 * THE BUILDER WITH ITS OWN KEY, the one the office answered when the builder was registered. A run's own agent changes
 * or ends the run only with a key, even while the key window is open, so the builder writes its runs' state with it.
 */
let builderKey = ''
const asTheBuilder = () => ({ ...asAgent('builder-fixture'), 'x-mole-office-key': builderKey })
/**
 * THE OFFICE'S MESSAGE WORKER AS IT SPEAKS: its name and the office's own key, which the real worker sends on every
 * request it makes as itself. The check tool's start and end doors refuse a request a listener carried with no key
 * (keys wave piece 7). `theOfficesKey` below reads it; it is never printed.
 */
const asOfficeWorker = () => ({ ...asAgent('mole-office/the-message-worker'), 'x-mole-office-key': theOfficesKey() })
/**
 * THE OFFICE'S OWN KEY, WHICH THE CHECK TOOL SENDS UNDER THE INSPECTOR'S NAME, read from the file this test's office made
 * beside its database. The door that takes a verdict refuses one that a listener carried with no key (acceptance finding
 * 79), so this file's inspector sends it as the real tool does. It is never printed or asserted on.
 */
function theOfficesKey(): string {
  const held = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office?: unknown }
  if (typeof held.office !== 'string') throw new Error('this test office made no key of its own beside its database')
  return held.office
}
const asInspectorRun = (session: string) => ({ ...asAgent('inspector-fixture'), 'x-mole-office-session': session, 'x-mole-office-key': theOfficesKey() })
interface Check {
  message: string
  execution?: { session: string; log: string; model: string; minutes: number; endedAt?: string; failed?: string }
  says: string
}
interface RecordRead { record: { id: string; data: Record<string, unknown> & { theCheck?: Check } } }
let failedRun = ''
let releasedRun = ''
let failedMessage = ''
let failedSession = ''
let group = ''
let groupMessage = ''

async function request<T>(path: string, method = 'GET', body?: unknown, headers = asPerson): Promise<T> {
  const res = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text) as T
}
const record = (id: string) => request<RecordRead>(`/api/records/${id}`)
async function makeRun(title: string): Promise<string> {
  const permission = await request<RecordRead>('/api/records', 'POST', { kind: 'note', title: 'Synthetic permission for office check fixture',
    summary: 'Synthetic permission for the test to change src/server/lib/fixture.ts.', data: {} })
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session', title,
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: worktree, cutFrom: 'main', tip, deliveringMessage: groupMessage, doing: 'Synthetic fixture for the check worker test.', extra: { traceFixturePermission: permission.record.id } },
  }, asAgent('builder-fixture'))
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  return made.record.id
}
async function finishTool(run: string): Promise<void> {
  const until = Date.now() + 20_000
  do {
    await onePass(settings, watching)
    if ((await record(run)).record.data.theCheck?.execution?.endedAt !== undefined) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  } while (Date.now() < until)
  throw new Error(`The synthetic check of ${run} did not end.`)
}
async function startInterrupted(run: string): Promise<Parameters<typeof onePass>[1][number]> {
  const until = Date.now() + 10_000
  let session: string | undefined
  do {
    await onePass(settings, watching)
    session = (await record(run)).record.data.theCheck?.execution?.session
    if (session) break
    if (Date.now() > until) throw new Error('The synthetic process never started.')
    await new Promise((resolve) => setTimeout(resolve, 50))
  } while (!session)
  const processRun = watching.find((one) => one.session === session)!
  while (!outputOf(processRun.handle).problems.includes('Synthetic check interrupted')) {
    if (Date.now() > until) throw new Error('The synthetic process never started waiting.')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return processRun
}
async function stopInterrupted(processRun: Parameters<typeof onePass>[1][number]): Promise<void> {
  processRun.adapter.stop(processRun.handle, 'Synthetic interruption for the lifecycle test.')
  const until = Date.now() + 10_000
  while (processRun.adapter.alive(processRun.handle)) {
    if (Date.now() > until) throw new Error('The synthetic process did not stop.')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
async function assembleAs(run: string, session: string) {
  const checked = await request<{ submission: { id: string; seal: { hash: string; git: { directory: string; commit: string; forkBase: string } } } }>(`/api/checks/${run}`)
  const { submission } = checked
  const read = { sealId: submission.id, sealHash: submission.seal.hash, worktree: submission.seal.git.directory, tip: submission.seal.git.commit, ofItsOwn: false, says: 'Synthetic fixture identity; no real work was inspected.' }
  await request(`/api/checks/${run}/assembled`, 'POST', { changes: [], base: { ref: submission.seal.git.forkBase, how: 'fork point', says: 'Synthetic fixture base; no real work was inspected.' }, read }, asInspectorRun(session))
  return read
}

async function open(run: string, width: number, theme: 'light' | 'dark', mode: 'normal' | 'developer' = 'normal'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.emulateMedia({ colorScheme: theme })
  // `?mode=inspect` is developer mode for this one address; it is not stored, so the next open is normal.
  await app.page.goto(`${app.site}/${mode === 'developer' ? '?mode=inspect' : ''}#/r/${run}`, { waitUntil: 'domcontentloaded' })
  await app.page.reload()
  await waitForThePage(app.page)
}

beforeAll(async () => {
  worktree = aThrowawayRepository()
  tip = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  app = await liveApp({ name: 'office-check-tool', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await request('/api/agents/started', 'POST', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await request('/api/agents/started', 'POST', { handle: 'inspector-fixture', name: 'Synthetic Inspector', runtime: 'claude-code', role: 'inspector' })
  builderKey = (await request<{ whatToGiveIt: { key: string } }>('/api/agents/started', 'POST', { handle: 'builder-fixture', name: 'Synthetic Builder', runtime: 'claude-code', role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib'] }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).whatToGiveIt.key
  const opened = await request<{ group: { id: string } }>('/api/groups', 'POST', { name: 'Synthetic check conversation', because: 'Synthetic browser and worker fixture.', members: [THE_TEST_OFFICES_SECRETARY.handle, 'builder-fixture'].map((id) => ({ who: { kind: 'agent', id }, because: 'Synthetic test participant.' })) })
  group = opened.group.id
  const conversation = await request<{ messages: { id: string }[] }>(`/api/groups/${group}`)
  groupMessage = conversation.messages[0]!.id
  await request('/api/records', 'POST', { kind: 'session', title: 'Synthetic older provider conversation', data: { state: 'finished', servingAgent: 'inspector-fixture', runtime: 'claude-code', providerSession: 'old-provider-conversation' } }, { ...asPerson, ...thePersonsKeyHeader(app.dir + '/keys.json') })
  settings = { api: app.api, workspace: 'default', session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(app.dir, 'runs'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(checkout, 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(checkout, 'tests/fake-runtime.mjs'),
    // THIS TEST'S OFFICE'S KEY FILE, for the stand-in tool: it sends the office's key with its verdict as the real tool does
    // (acceptance finding 79), and the worker hands a run no MOLE_OFFICE_ setting, so it is named here (tests/fake-inspection-tool.mjs).
    FAKE_INSPECTION_TOOL_KEY_FILE: join(app.dir, 'keys.json'),
    // AND THE DATABASE THIS TEST'S OFFICE SERVES, which the real message worker has in its environment, so the worker
    // reads that office's key beside it and sends it: the check tool's start and end doors refuse a request a listener
    // carried with no key (keys wave piece 7).
    MOLE_OFFICE_DB: join(app.dir, 'panelx.db') } }
  failedRun = await makeRun('Synthetic failed check, no verdict')
  failedMessage = (await record(failedRun)).record.data.theCheck!.message
}, 180_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The synthetic check test ended.')
  await app?.stop()
  if (worktree !== '') rmSync(worktree, { recursive: true, force: true })
}, 60_000)

describe('the office runs the check tool itself', () => {
  it('hands the trusted check job to the normal worker queue', async () => {
    const queue = await request<{ queue: { messageId: string; inspection?: { run: string; checkout: string; pace?: { notPaced?: string } }; nobodyIsAnsweringAsIt: string | null }[] }>('/api/worker/queue')
    const job = queue.queue.find((one) => one.messageId === failedMessage && one.inspection !== undefined)
    // THE CHECK READS THE RUN'S OWN CHECKOUT: the repository its fixture run worked in.
    // ITS PACE UNDER THE HOURLY CAP, BY PART 2 OF A DECISION: this project registers no repository and the run has no
    // merge entry, so no lane can be told and the cap does not pace it.
    // tests/a-seventh-check-in-an-hour-waits-its-turn.test.ts proves the pace itself.
    expect(job?.inspection).toEqual({ run: failedRun, checkout: worktree, readingOnly: false, pace: { notPaced: expect.stringContaining(`run ${failedRun}: it has no merge entry`) } })
    expect(job?.nobodyIsAnsweringAsIt).toBeNull()
    expect((await record(failedMessage)).record.data['body']).not.toContain('RUN IT IN THE FOREGROUND')
    expect((await record(failedMessage)).record.data['toGroup']).toBe(group)
  })

  it('starts the tool in the existing process ledger with its own log and no provider resume', async () => {
    const pass = await onePass(settings, watching)
    const started = pass.started.find((one) => one.messageId === failedMessage)
    expect(started, JSON.stringify(pass)).toBeDefined()
    failedSession = started!.session
    expect(started!.runtime).toBe('inspection-tool')
    const data = (await record(failedSession)).record.data
    expect(data['extra']).toMatchObject({ purpose: 'inspection', inspectionRun: failedRun })
    expect(data['startedByMoleOffice']).toBe(true)
    expect(data['providerSession'] ?? null).toBeNull()
    const check = (await record(failedRun)).record.data.theCheck!
    expect(check.execution?.session).toBe(failedSession)
    expect(check.execution?.log).toBeTruthy()
    const resources = await request<{ resources: { sessionRecordId: string; type: string; pgid: number; startedByTheProduct: boolean }[] }>('/api/resources')
    expect(resources.resources.some((one) => one.sessionRecordId === failedSession && one.type === 'process' && one.startedByTheProduct)).toBe(true)
  })

  it('records a dead check as failed, keeps the run inspecting, and releases the ledger row', async () => {
    await finishTool(failedRun)
    const check = (await record(failedRun)).record.data.theCheck!
    expect(check.execution?.failed).toContain('Synthetic check stopped at its clock')
    const logged = readFileSync(check.execution!.log, 'utf8')
    expect(logged).toContain('--run')
    expect(logged).toContain(failedRun)
    expect(logged).not.toContain('--resume')
    expect(logged).not.toContain('old-provider-conversation')
    const read = await request<{ stands: { standing: string } }>(`/api/checks/${failedRun}`)
    expect(read.stands.standing).toBe('inspecting')
    const resources = await request<{ resources: { sessionRecordId: string; type: string; releasedAt: string | null }[] }>('/api/resources?includeReleased=true')
    expect(resources.resources.find((one) => one.sessionRecordId === failedSession && one.type === 'process')?.releasedAt).toBeTruthy()
  })

  it('records a verdict from the tool without starting a model run for its notices', async () => {
    releasedRun = await makeRun('Synthetic released check')
    await finishTool(releasedRun)
    const read = await request<{ stands: { standing: string }; theCheck: Check }>(`/api/checks/${releasedRun}`)
    expect(read.stands.standing).toBe('reporting')
    expect(read.theCheck.execution?.failed).toBeUndefined()
    expect(read.theCheck.says).toContain('released')
    const pass = await onePass(settings, watching)
    expect(pass.started).toEqual([])
    const conversation = await request<{ messages: { id: string; body: string }[] }>(`/api/groups/${group}`)
    const bodies = conversation.messages.map((one) => one.body).join('\n')
    expect(bodies).toContain(`The office started check ${failedSession}`)
    expect(bodies).toContain('The check failed without a verdict')
    expect(bodies).toContain(`released run ${releasedRun}`)
  })

  it('recovers a dead tool after the worker loses its memory and records the failed check', async () => {
    const run = await makeRun('Synthetic interrupted check')
    const first = await onePass(settings, watching)
    const session = first.started[0]!.session
    const processRun = watching.find((one) => one.session === session)!
    const until = Date.now() + 10_000
    while (!outputOf(processRun.handle).problems.includes('Synthetic check interrupted')) {
      if (Date.now() > until) throw new Error('The synthetic process never started waiting.')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    processRun.adapter.stop(processRun.handle, 'Synthetic process death for the recovery test.')
    watching.splice(watching.indexOf(processRun), 1)
    while (processRun.adapter.alive(processRun.handle)) {
      if (Date.now() > until) throw new Error('The synthetic process did not stop.')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const recovered = await onePass(settings, watching)
    expect(recovered.pickedUp).toContain(session)
    expect((await record(run)).record.data.theCheck?.execution?.failed).toContain('Synthetic check interrupted')
    expect(recovered.started).toEqual([])
  })

  it('stops the tool by its recorded process group when its office clock expires', async () => {
    const before = settings.env
    settings.env = { ...before, MOLE_OFFICE_INSPECTION_MINUTES: '0.01' }
    try {
      const run = await makeRun('Synthetic interrupted clock check')
      await finishTool(run)
      const check = (await record(run)).record.data.theCheck!
      expect(check.execution?.minutes).toBe(0.01)
      expect(check.execution?.failed).toContain('exceeded its 0.01 minute clock')
      expect(watching.some((one) => one.session === check.execution?.session)).toBe(false)
    } finally {
      settings.env = before
    }
  })

  it('draws the failed check and the office run at 1440 in light', async () => {
    const width = 1440
    const theme = 'light'
    for (const [run, label] of [[failedRun, 'failed'], [releasedRun, 'office-ran']] as const) {
      await open(run, width, theme)
      const panel = app.page.locator('.chk')
      const text = await panel.innerText()
      const check = (await record(run)).record.data.theCheck!
      // THE OFFICE'S RUN IS REACHED FROM THE PANEL IN BOTH MODES. In normal mode the link is in
      // words and the page shows no run id and no log path (plan 7FEOshq3mBGG, row F1, check 3);
      // developer mode adds both.
      expect(await panel.locator(`a[href="#/r/${check.execution!.session}"]`).count()).toBe(1)
      expect(text).toContain(check.execution!.model)
      expect(text).not.toContain(check.execution!.session)
      expect(text).not.toContain(check.execution!.log)
      // The run's working folder is developer detail too, as item 3 of a decision says for C27.
      expect(text).not.toContain(worktree)
      if (label === 'failed') {
        expect(text).toContain('failed')
        expect(await panel.getByRole('button', { name: /ask.*again/i }).isVisible()).toBe(true)
      } else expect(text).toContain('released')
      expect(await app.page.locator('body').innerText()).toContain('Synthetic')
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      const shots = process.env['MOLE_CHECK_TEST_SHOTS']
      if (shots) {
        mkdirSync(shots, { recursive: true })
        await app.page.screenshot({ path: join(shots, `${label}-${width}-${theme}.png`), fullPage: true })
      }
      await open(run, width, theme, 'developer')
      const inDeveloperMode = app.page.locator('.chk')
      const developerText = await inDeveloperMode.innerText()
      expect(await inDeveloperMode.locator(`a[href="#/r/${check.execution!.session}"]`).count()).toBe(1)
      expect(developerText).toContain(check.execution!.session)
      expect(developerText).toContain(check.execution!.log)
      expect(developerText).toContain(check.execution!.model)
      expect(developerText).toContain(worktree)
    }
  })

  it('lets the starter ask again from the failed run page and writes a fresh request', async () => {
    await open(failedRun, 390, 'light')
    await app.page.locator('.chk').getByRole('button', { name: /ask.*again/i }).click()
    await app.page.waitForFunction(() => !document.querySelector('.chk')?.textContent?.includes('The check failed without a verdict'))
    const check = (await record(failedRun)).record.data.theCheck!
    expect(check.message).not.toBe(failedMessage)
    expect(check.execution).toBeUndefined()
  })

  it('reaps an older office check after its refusal and rework queued a new check', async () => {
    const run = await makeRun('Synthetic interrupted refusal and rework')
    const older = await startInterrupted(run)
    const read = await assembleAs(run, older.session)
    await request(`/api/checks/${run}`, 'POST', { read, verdict: 'refused', check: 'Synthetic refusal for the lifecycle race.', missing: ['Synthetic work requires another pass.'], says: { chapter: 5 }, chaptersRead: ['5:full'] }, asInspectorRun(older.session))
    await request(`/api/records/${run}`, 'PATCH', { dataPatch: { state: 'running' } }, asTheBuilder())
    await request(`/api/records/${run}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
    const newer = (await record(run)).record.data.theCheck!
    expect(newer.message).not.toBe(older.messageId)
    expect(newer.execution).toBeUndefined()
    await stopInterrupted(older)
    const pass = await onePass({ ...settings, runs: 0 }, watching)
    expect(pass.failed.filter((one) => one.messageId === older.messageId)).toEqual([])
    expect(watching.some((one) => one.session === older.session)).toBe(false)
    expect((await record(older.session)).record.data['state']).toBe('finished')
    const resources = await request<{ resources: { sessionRecordId: string; type: string; releasedAt: string | null }[] }>('/api/resources?includeReleased=true')
    expect(resources.resources.find((one) => one.sessionRecordId === older.session && one.type === 'process')?.releasedAt).toBeTruthy()
    expect((await record(run)).record.data.theCheck).toEqual(newer)
    const replacement = await startInterrupted(run)
    await stopInterrupted(replacement)
    await onePass({ ...settings, runs: 0 }, watching)
  })

  it('does not claim a manual inspectors verdict as the office tools own verdict', async () => {
    const run = await makeRun('Synthetic interrupted office check beside a manual check')
    const office = await startInterrupted(run)
    const manual = await request<RecordRead>('/api/records', 'POST', { kind: 'session', title: 'Synthetic manual inspection session', data: { state: 'running', servingAgent: 'inspector-fixture', extra: { purpose: 'inspection' } } }, asAgent('inspector-fixture'))
    const read = await assembleAs(run, manual.record.id)
    const said = 'Synthetic permission for the test to change src/server/lib/fixture.ts.'
    const permission = await request<RecordRead>('/api/records', 'POST', { kind: 'note', title: 'Synthetic permission for manual check fixture', summary: said, data: {} })
    await request(`/api/checks/${run}`, 'POST', { read, verdict: 'released',
      traced: [{ paths: ['src/server/lib/fixture.ts'], to: permission.record.id, how: "the person's word", said }],
      check: 'Synthetic manual inspection verdict.', chaptersRead: ['5:full'] }, asInspectorRun(manual.record.id))
    await stopInterrupted(office)
    const ended = await request<{ failed: boolean; says: string }>(`/api/checks/${run}/tool-ended`, 'POST', { session: office.session, reason: 'Synthetic office check ended without its own verdict.' }, asOfficeWorker())
    expect(ended.failed).toBe(true)
    expect(ended.says).not.toContain(`office check ${office.session} released`)
    await onePass({ ...settings, runs: 0 }, watching)
    expect((await record(office.session)).record.data['state']).toBe('crashed')
    expect((await record(run)).record.data.theCheck?.execution?.failed).toContain('without its own verdict')
  })

  it('recovers a tool whose starter died between recording the check and registering a process', async () => {
    const run = await makeRun('Synthetic check interrupted before process registration')
    const check = (await record(run)).record.data.theCheck!
    const participants = await request<{ agents: { id: string; handle: string }[] }>('/api/participants')
    const inspector = participants.agents.find((one) => one.handle === 'inspector-fixture')!
    const parent = await request<RecordRead>('/api/records', 'POST', { kind: 'session', title: 'Synthetic worker startup parent', data: { state: 'running' } })
    const tool = await request<RecordRead>('/api/records', 'POST', { kind: 'session', title: 'Synthetic inspection whose process never registered', data: {
      state: 'running', runtime: 'inspection-tool', servingAgent: inspector.id, startedByMoleOffice: true,
      parentAttachment: parent.record.id, deliveringMessage: check.message,
      extra: { purpose: 'inspection', inspectionRun: run, inspectionMinutes: 40 },
    } }, { ...asPerson, ...thePersonsKeyHeader(app.dir + '/keys.json') })
    await request(`/api/checks/${run}/tool-started`, 'POST', { session: tool.record.id, log: join(app.dir, 'synthetic-startup.log'), model: 'fixture', minutes: 40 }, asOfficeWorker())
    type Pending = { runs: { session: string; startupFailed?: { run: string; reason: string }; pgid: number | null }[] }
    expect((await request<Pending>('/api/worker/runs')).runs.some((one) => one.session === tool.record.id)).toBe(false)
    // ENDED BY THE PERSON WITH THEIR KEY: a claim to be the person with no key does not end a run (problem FZQflYp1vHuY).
    await request(`/api/records/${parent.record.id}`, 'PATCH', { dataPatch: { state: 'crashed' } }, { ...asPerson, ...thePersonsKeyHeader(app.dir + '/keys.json') })
    const pending = (await request<Pending>('/api/worker/runs')).runs.find((one) => one.session === tool.record.id)
    expect(pending?.startupFailed?.run).toBe(run)
    expect(pending?.pgid).toBeNull()
    await onePass({ ...settings, runs: 0 }, watching)
    expect((await record(tool.record.id)).record.data['state']).toBe('crashed')
    expect((await record(run)).record.data.theCheck?.execution?.failed).toBeTruthy()
    expect((await request<Pending>('/api/worker/runs')).runs.some((one) => one.session === tool.record.id)).toBe(false)
  })
})
