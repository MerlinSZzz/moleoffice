// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every record, name, git tree, sandbox and clock value here is made up in a throwaway office. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { ABSENT } from '../src/shared/merge-queue.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { localStamp, momentOfAnInstant, stampInZone } from '../src/shared/time.ts'

let t: TestDb, app: FastifyInstance, folder: string
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id }
const worker = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
const START = new Date('2026-10-22T10:00:00Z')
const count = () => t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'conflict-minutes'").get()
const stored = (id: string) => t.api.getRecord(id)!.data
const raw = (id: string, data: Record<string, unknown>) => t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
async function call(method: 'GET' | 'POST', url: string, payload?: unknown, as = headers) {
  const r = await app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, { step: name, facts }, worker)
const over = (id: string) => call('POST', `/api/worker/merges/${id}/hour-over`, {}, worker)
function resolving(id: string): Record<string, any> { return stored(id)['resolving'] as Record<string, any> }
function end(id: string, minutes: number) {
  const conflict = resolving(id)
  const ms = momentOfAnInstant(conflict['since'])! + minutes * 60_000
  return { ms, stamp: stampInZone(ms, conflict['timeZone']), local: localStamp(new Date(ms)) }
}

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'made-up-resolving-time-'))
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING', '1')
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', '30')
  t = await freshDb()
  app = (await apiApp()).app
  const main = join(folder, 'main')
  mkdirSync(main)
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  registerRepository({ workspaceId: 'default', name: 'made-up-duration', root: main, actor: { ...person, provedBy: 'the-person-key' } })
  const agent = await call('POST', '/api/agents/started', { handle: 'made-up-resolver', name: 'Made-up resolver', role: 'supervisor', workArea: ['work'] })
  expect(agent.status, agent.raw).toBe(201)
  const sandbox = join(folder, 'sandbox')
  for (const part of ['briefs', 'worktrees', 'repo']) mkdirSync(join(sandbox, part), { recursive: true })
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES ('made-up-container', 'default', 'made-up-session', 'container', ?, ?, '2026-10-22 09:00:00', 'agent:fixture')")
    .run(`mole-office-sandbox-${basename(sandbox)}`, `Sandbox ${basename(sandbox)}, from the template mole-office-dev; ${theWordsNamingTheFolder(sandbox)} Started by node tools/sandbox.mjs up.`)
  t.api.createRecord({ kind: 'session', title: 'Made-up resolver sandbox run', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: 'made-up-resolver', servingAgentId: agent.body.agent.id, workingDirectory: join(sandbox, 'repo'), cutFrom: 'main', sandbox: { template: 'mole-office-dev', container: 'made-up-container', folder: sandbox } } })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})
afterEach(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  rmSync(folder, { recursive: true, force: true })
})

/** The real conflict step hands on a sealed, released git entry, as in the conflict-supervisor door tests. */
async function anEntry() {
  const dir = mkdtempSync(join(folder, 'tree-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Made-up resolver fixture')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'Made-up before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Made-up baseline')
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work/a.txt'), `Made-up after ${basename(dir)}\n`)
  git(dir, 'commit', '-qam', 'Made-up work')
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up conflicting run', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: 'made-up-resolver', workingDirectory: dir, cutFrom: 'main' } })
  t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, person)
  const sealId = stored(run.id)['sealedTip'] as string
  const seal = stored(sealId)['seal'] as { hash: string; git: { commit: string; files: { path: string; hash: string | null }[] } }
  writeAVerdictAsItsDoorWould(t, run.id, { released: { by: { kind: 'agent', id: 'made-up-inspector' }, at: '2026-10-22 09:00:00', how: 'an inspector', check: 'made-up-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Made-up release.' } } })
  const queued = await call('POST', '/api/merge-queue', { run: run.id, changeset: { adapter: 'git', repository: 'made-up-duration' } })
  expect(queued.status, queued.raw).toBe(201)
  const id = String(queued.body.entry.id)
  expect((await step(id, 'pinned', { files: Object.fromEntries(seal.git.files.map(one => [one.path, one.hash ?? ABSENT])) })).status).toBe(200)
  expect((await step(id, 'integrating', {})).status).toBe(200)
  const handed = await step(id, 'conflict', { files: ['work/a.txt'], mainAt })
  expect(handed.status, handed.raw).toBe(200)
  return { id, dir, mainAt }
}

async function serverEnd(id: string) {
  const { whereTheHourOfAResolvingEntryStands } = await import('../src/server/lib/merge-state-machine.ts')
  return whereTheHourOfAResolvingEntryStands(t.api.getRecord(id)!)
}
/** Draw the server's reply in the page's own static-render style and read its visible words. */
async function pageWords() {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} })
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage('en')
  const page = await import('../src/web/pages/MergeQueuePage.tsx')
  const reply = await call('GET', '/api/merge-queue?state=resolving')
  expect(reply.status, reply.raw).toBe(200)
  return renderToStaticMarkup(h(page.TheMergeQueue, { reply: reply.body as unknown as MergeQueueReply, now: START })).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ')
}

it('stores 30 minutes, names that end in the brief and asking message, and refuses a hand-over 40 minutes later', async () => {
  const one = await anEntry()
  expect(resolving(one.id)['minutes']).toBe(30)
  const until = end(one.id, 30)
  const asked = resolving(one.id)['asked']
  expect(readFileSync(asked.brief, 'utf8')).toContain(`before ${until.stamp} (${resolving(one.id)['timeZone']})`)
  expect(readFileSync(asked.brief, 'utf8')).toContain('The 30 minutes started when')
  const message = stored(asked.message)
  expect(message['askedToResolve']).toMatchObject({ until: new Date(until.ms).toISOString() })
  expect(message['body']).toContain(`The 30 minutes end at ${until.stamp}`)
  vi.setSystemTime(START.getTime() + 40 * 60_000)
  const late = await call('POST', `/api/merge-queue/${one.id}/resolution`, { workingDirectory: one.dir })
  expect(late.status, late.raw).toBe(409)
  expect(late.body['error']).toContain('30 minutes')
  expect(count()).toBeUndefined()
})

it('keeps the first 30-minute end after the setting changes to 120 and gives a new entry 120', async () => {
  const first = await anEntry()
  const until = end(first.id, 30)
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', '120')
  expect(await serverEnd(first.id)).toEqual({ over: false, until: until.stamp })
  expect(resolving(first.id)['minutes']).toBe(30)
  const second = await anEntry()
  expect(resolving(second.id)['minutes']).toBe(120)
  expect(await serverEnd(second.id)).toEqual({ over: false, until: end(second.id, 120).stamp })
  // Made-up passed check returning to integrating, as the checked-resolution tests store it.
  const conflict = { ...resolving(first.id) }
  raw(first.id, { ...stored(first.id), state: 'integrating', occupies: (stored(first.id)['changeset'] as { root: string }).root,
    resolution: { commit: 'a'.repeat(40), mainAt: first.mainAt, checked: {} } })
  const again = await step(first.id, 'conflict', { files: ['work/a.txt'], mainAt: first.mainAt })
  expect(again.status, again.raw).toBe(200)
  expect(resolving(first.id)).toMatchObject({ since: conflict['since'], timeZone: conflict['timeZone'], minutes: 30 })
  expect(await serverEnd(first.id)).toEqual({ over: false, until: until.stamp })
})

it('reads an entry stored without minutes as its original 60 minutes on the server and page', async () => {
  const one = await anEntry()
  const { minutes: _minutes, ...old } = resolving(one.id)
  raw(one.id, { ...stored(one.id), resolving: old })
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', '120')
  const until = end(one.id, 60)
  expect(await serverEnd(one.id)).toEqual({ over: false, until: until.stamp })
  expect(await pageWords()).toContain(`until ${until.local.slice(11, 16)}.`)
})

it('treats stored minutes 7 as the same unreadable end as a broken since, without counting', async () => {
  const one = await anEntry()
  raw(one.id, { ...stored(one.id), resolving: { ...resolving(one.id), minutes: 7 } })
  const badMinutes = await over(one.id)
  raw(one.id, { ...stored(one.id), resolving: { ...resolving(one.id), minutes: 30, since: 'Made-up broken stamp' } })
  const badSince = await over(one.id)
  expect(badMinutes.status, badMinutes.raw).toBe(500)
  expect(badSince.status, badSince.raw).toBe(500)
  expect(badMinutes.body['error']).toBe(badSince.body['error'])
  expect(count()).toBeUndefined()
})

it('counts only the worker door bounce after the end, and no refusal or repeated reading', async () => {
  const one = await anEntry()
  const early = await over(one.id)
  expect(early.status, early.raw).toBe(409)
  expect(count()).toBeUndefined()
  vi.setSystemTime(end(one.id, 30).ms)
  const { resolvingEntriesWhoseHourIsOver } = await import('../src/server/lib/merge-state-machine.ts')
  for (let n = 0; n < 3; n++) {
    expect(resolvingEntriesWhoseHourIsOver('default').over).toContainEqual({ entry: one.id, until: end(one.id, 30).stamp, resolution: 'the hour ran out' })
    expect(await serverEnd(one.id)).toMatchObject({ over: true })
  }
  expect(count()).toBeUndefined()
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', '120')
  // The bounce itself can be refused by storage. A count before bounce would survive that refusal.
  t.client.sqlite.exec("CREATE TRIGGER made_up_bounce_refusal BEFORE UPDATE ON records WHEN NEW.id = '" + one.id + "' AND json_extract(NEW.data, '$.state') = 'bounced' BEGIN SELECT RAISE(ABORT, 'Made-up bounce refusal'); END")
  const refused = await over(one.id)
  expect(refused.status, refused.raw).toBe(409)
  expect(count()).toBeUndefined()
  t.client.sqlite.exec('DROP TRIGGER made_up_bounce_refusal')
  const bounced = await over(one.id)
  expect(bounced.status, bounced.raw).toBe(200)
  expect(stored(one.id)['state']).toBe('bounced')
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  expect((await over(one.id)).status).toBe(409)
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})

it('draws the stored 30-minute end on the page after the setting changes to 120', async () => {
  const one = await anEntry()
  vi.stubEnv('MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', '120')
  expect(await pageWords()).toContain(`until ${end(one.id, 30).local.slice(11, 16)}.`)
})

it('counts a refused resolution bounced as could not be read when its 30 minutes end', async () => {
  const one = await anEntry()
  // Made-up stored check refusal, as the merge tool writes it; no tool starts here.
  raw(one.id, { ...stored(one.id), resolution: { commit: 'a'.repeat(40), at: '2026-10-22 10:10:00', refused: { at: '2026-10-22 10:20:00', says: 'Made-up check refusal.' } } })
  vi.setSystemTime(end(one.id, 30).ms)
  const bounced = await over(one.id)
  expect(bounced.status, bounced.raw).toBe(200)
  expect(stored(one.id)['bounced']).toMatchObject({ resolution: 'could not be read' })
  expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})

