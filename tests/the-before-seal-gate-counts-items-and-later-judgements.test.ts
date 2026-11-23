// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Runs, keys, commits and reports here are made up in a fresh test office. No worker starts. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aLabelFor } from './a-run-in-form.ts'
import { readRemindedBeforeTheSeal } from '../src/shared/before-the-seal.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
let t: TestDb, app: FastifyInstance, folder: string
const person = {type: 'human', id: THE_TEST_OFFICES_OWNER.id} as const
const personHeaders = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id}
const handle = 'made-up-seal-counter'
/**
 * A fresh office with the made-up agent registered. With `early`, the seal-read thread is asked a finish with no
 * questions as soon as the database is there, so the thread loads while the office is built. A server starts that
 * thread at its first finish, and its start took about 1.1 s of each case's first finish.
 */
async function aFreshOffice(early: boolean) {
  folder = mkdtempSync(join(tmpdir(), 'before-seal-count-'))
  vi.stubEnv('HOME', folder)
  vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'remind')
  t = await freshDb()
  const started = early ? (await import('../src/server/lib/the-seal-read-apart.ts')).readTheFinishApart({facts: [], seals: []}) : undefined
  const {copyTheDefaultRegulationsOnce} = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  app = (await apiApp()).app; await app.ready()
  const registered = await app.inject({method: 'POST', url: '/api/agents/started', headers: personHeaders, payload: {handle, name: 'Made-up seal counter', role: 'worker', runtime: 'claude-code', workArea: ['work', 'tests']}})
  expect(registered.statusCode, registered.body).toBe(201)
  if (started !== undefined) expect(await started).toMatchObject({stamps: [], held: true, facts: [], seals: []})
}
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); t?.close(); vi.unstubAllEnvs(); rmSync(folder, {recursive: true, force: true}) })
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8'}).trim() }
async function run(options: {test?: boolean; migration?: boolean} = {test: true}) {
  const dir = join(folder, 'tree'); mkdirSync(join(dir, 'work'), {recursive: true})
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Made-up fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(dir, 'work/a.txt'), 'Made-up baseline\n'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Made-up baseline')
  const base = git(dir, 'rev-parse', 'HEAD'); git(dir, 'switch', '-qc', 'work')
  const filed = await app.inject({method: 'POST', url: '/api/records', headers: {...personHeaders, ...theOfficesKeyHeader(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker'}, payload: {kind: 'session', title: 'Made-up run for the seal counter', data: {state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: handle, workingDirectory: dir, cutFrom: 'main', tip: base, doing: 'Made-up work is ready to seal.'}}})
  expect(filed.statusCode, filed.body).toBe(201)
  const id = filed.json().record.id as string, key = filed.json().runKey?.key as string
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dir, 'work/a.txt'), 'Made-up change\n')
  if (options.test) writeFileSync(join(dir, 'work/made-up.test.ts'), 'it("is made up", () => {})\n')
  if (options.migration) {
    mkdirSync(join(dir, 'tests'))
    const prefix = ['02', '16_'].join('')
    writeFileSync(join(dir, 'tests/made-up-prefix.test.ts'), `const before = migrationsBefore('${prefix}')\n`)
  }
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Made-up work')
  return {id, dir, tip: git(dir, 'rev-parse', 'HEAD'), headers: {...personHeaders, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key, 'x-mole-office-session': id}}
}
type Run = Awaited<ReturnType<typeof run>>
function finish(one: Run, more: Record<string, unknown> = {}) { return app.inject({method: 'PATCH', url: `/api/records/${one.id}`, headers: one.headers, payload: {dataPatch: {state: 'finished', tip: one.tip, ...more}}}) }
function count() { return t.client.sqlite.prepare("SELECT would_stop, stopped, reminded, ignored, heeded FROM gate_counts WHERE gate = 'before-the-seal'").get() }
function held(id: string) { return readRemindedBeforeTheSeal(t.api.getRecord(id)!.data['remindedBeforeTheSeal']) }
/** A report in form linked about the run, with its label. It lists every shipped chapter, read from the shipped file. */
async function report(id: string) {
  const made = t.api.createRecord({kind: 'report', workspaceId: 'default', title: 'Made-up gate count report', actor: person, origin: 'fixture', data: {for: 'Made-up test reader', date: '2026-10-22', chaptersRead: [...SHIPPED_CHAPTER_NUMBERS], blocks: [{id: 'made-up-text', type: 'text', text: 'Made-up report of this run. The audit table is left for the merger.'}]}}).id
  t.api.createLink({fromId: made, toId: id, type: 'about', actor: person})
  await aLabelFor(made)
  return made
}
/**
 * A named-tests line the run sends by hand with its own key, in a made-up named-tests tool. It is a likely item
 * (test-lines:not-from-the-tool) that the seal finds again, for a case that needs one still found.
 */
async function aLineSentByHand(one: Run) {
  const tools = t.api.createRecord({workspaceId: 'default', kind: 'tool_category', title: 'Synthetic test tools', data: {says: 'Made-up tools used by the gate count tests.'}, actor: {type: 'agent', id: handle}}).id
  t.api.createRecord({workspaceId: 'default', kind: 'tool', title: 'Synthetic named tests', data: {entry: 'tool', slug: 'named-tests', forWhom: 'developers', category: tools, kept: 'in this repository', state: 'not built yet'}, actor: {type: 'agent', id: handle}})
  const used = await app.inject({method: 'POST', url: '/api/toolset/uses', headers: one.headers, payload: {tool: 'named-tests', said: 'named 1 file (work/made-up.test.ts); 1 ran, exactly those; vitest exited 0'}})
  expect(used.statusCode, used.body).toBe(201)
}
// COLD, so this file still runs the path where a finish starts the seal-read thread itself, as a server's first
// finish does: this case's office is built with no early start. It is this case because its assertions are about
// the finish and what the seal judged.
describe('with the seal-read thread started by the first finish', () => {
  beforeEach(() => aFreshOffice(false))
  it('counts one reminder, then counts only judged items still found or gone at the seal', async () => {
    const one = await run()
    await aLineSentByHand(one)
    const checkAlso = await app.inject({method: 'PUT', url: `/api/records/${one.id}/check-also`, headers: personHeaders, payload: {items: ['Made-up item the office never judges.']}})
    expect(checkAlso.statusCode, checkAlso.body).toBe(200)
    const first = await finish(one)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().beforeTheSeal.items.length).toBeGreaterThan(0)
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 1, ignored: 0, heeded: 0})
    await report(one.id)
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    const line = held(one.id)
    if (!line?.reminded || line.atTheSeal === null) throw new Error('The test seal kept no judgement.')
    expect(line.atTheSeal.couldNotJudge).toBeNull()
    expect(line.atTheSeal.stillFound).toContain('test-lines:not-from-the-tool')
    expect(line.atTheSeal.noLongerFound).toContain('report:none')
    expect(line.atTheSeal.notJudged).toContain('check-also:0')
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 1, ignored: line.atTheSeal.stillFound!.length, heeded: line.atTheSeal.noLongerFound!.length})
  })
})
describe('with the seal-read thread started while the office is built', () => {
  beforeEach(() => aFreshOffice(true))
  it('off counts what would be named, writes no reminder, and seals on the first write with its reason', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'off')
    const one = await run()
    const first = await finish(one)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().beforeTheSeal).toBeUndefined()
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(held(one.id)).toMatchObject({reminded: false, because: 'theGateIsOff'})
    expect(t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.beforeTheSeal.run') = ?").all(one.id)).toEqual([])
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0, ignored: 0, heeded: 0})
  })
  it.each(['block', 'off'])('names no encounter for empty items at %s', async position => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', position)
    const one = await run({test: false})
    await report(one.id)
    const first = await finish(one)
    expect(first.statusCode, first.body).toBe(200)
    if (position !== 'off') expect(first.json().beforeTheSeal.items).toEqual([])
    else {
      expect(first.json().beforeTheSeal).toBeUndefined()
      expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    }
    expect(count()).toBeUndefined()
  })

  it('at block holds the first write with the reminder and counts one would-stop and one stopped', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    const first = await finish(one, {doing: 'Made-up finish not yet stored.'})
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().beforeTheSeal).toMatchObject({sealed: false, keptOnTheRun: true})
    expect(first.json().beforeTheSeal.items).toContainEqual(expect.objectContaining({key: 'report:none', mechanical: true}))
    expect(first.json().beforeTheSeal.again).toContain('At block, a certain item the reminder named that the same check still finds refuses the seal; a likely item stays a reminder.')
    expect(t.api.getRecord(one.id)!.data).toMatchObject({state: 'running', doing: 'Made-up work is ready to seal.'})
    expect(t.api.getRecord(one.id)!.data['sealedTip']).toBeUndefined()
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 0})
  })

  it('at block refuses later writes naming the certain item, leaves the run and check unchanged, and keeps each refusal count', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    const first = await finish(one)
    expect(first.statusCode, first.body).toBe(200)
    const item = first.json().beforeTheSeal.items.find((item: {key: string}) => item.key === 'report:none')
    expect(item).toMatchObject({mechanical: true})
    const before = t.api.getRecord(one.id)!
    const recordsBefore = t.client.sqlite.prepare('SELECT id, kind, data FROM records ORDER BY id').all()
    const revisionsBefore = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(one.id)
    for (const n of [2, 3]) {
      const refused = await finish(one, {doing: 'Made-up change that must not be stored.'})
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.json().error).toContain('still finds a certain item the reminder named')
      expect(refused.json().error).toContain(item.says)
      expect(refused.json().error).toContain('Nothing was written: no seal was made, no check was asked for, and nothing on the run changed.')
      expect(refused.json().error).toContain('Fix the item, then seal again.')
      expect(refused.json().reason).toBe('A certain item the reminder named is still found and refuses this seal.')
      expect(t.api.getRecord(one.id)).toEqual(before)
      expect(t.client.sqlite.prepare('SELECT id, kind, data FROM records ORDER BY id').all()).toEqual(recordsBefore)
      expect(t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(one.id)).toEqual(revisionsBefore)
      // Read after the HTTP refusal: a count inside a rolled-back write would still be one here.
      expect(count()).toEqual({would_stop: n, stopped: n, reminded: 0, ignored: 0, heeded: 0})
    }
  })

  it('at block seals when only a likely item remains, counts it ignored and never judges check-also', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    await report(one.id)
    await aLineSentByHand(one)
    const checkAlso = await app.inject({method: 'PUT', url: `/api/records/${one.id}/check-also`, headers: personHeaders, payload: {items: ['Made-up item the office never judges.']}})
    expect(checkAlso.statusCode, checkAlso.body).toBe(200)
    const first = await finish(one)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().beforeTheSeal.items).toEqual([
      expect.objectContaining({key: 'test-lines:not-from-the-tool', mechanical: false}),
      expect.objectContaining({key: 'check-also:0', mechanical: false}),
    ])
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(held(one.id)).toMatchObject({reminded: true, atTheSeal: {stillFound: ['test-lines:not-from-the-tool'], noLongerFound: [], notJudged: ['check-also:0'], couldNotJudge: null}})
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 1, heeded: 0})
  })

  it('at block seals after the certain named item is fixed and counts it heeded', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run({test: false})
    expect((await finish(one)).statusCode).toBe(200)
    await report(one.id)
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(held(one.id)).toMatchObject({reminded: true, atTheSeal: {stillFound: [], noLongerFound: ['report:none'], couldNotJudge: null}})
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 1})
  })

  it('at block does not refuse a certain item the reminder never named', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    await report(one.id)
    await aLineSentByHand(one)
    expect((await finish(one)).statusCode).toBe(200)
    // The certain item the reminder never named is a page committed after it, which the report has no pictures of. It is
    // not a fault of form, since a fault of form refuses the run's own seal whether or not the reminder named it.
    mkdirSync(join(one.dir, 'src/web'), {recursive: true}); writeFileSync(join(one.dir, 'src/web/made-up-page.tsx'), 'export const madeUp = 1\n')
    git(one.dir, 'add', '.'); git(one.dir, 'commit', '-qm', 'Made-up page')
    one.tip = git(one.dir, 'rev-parse', 'HEAD')
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 1, heeded: 0})
  })

  it.each([
    {caller: 'launcher', because: 'theLauncherAskedForNone'},
    {caller: 'another key', because: 'notTheRunsOwnKey'},
  ])('at block seals without a reminder and records $because', async ({caller, because}) => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    // The run's own key writes the launcher's finish, so its report is in form.
    if (caller === 'launcher') await report(one.id)
    const first = await app.inject({method: 'PATCH', url: `/api/records/${one.id}`, headers: caller === 'launcher' ? one.headers : personHeaders, payload: {dataPatch: {state: 'finished', tip: one.tip}, ...(caller === 'launcher' ? {remindBeforeTheSeal: false} : {})}})
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().beforeTheSeal).toBeUndefined()
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(held(one.id)).toMatchObject({reminded: false, because})
    expect(count()).toBeUndefined()
  })

  it('at block the reminder reader answers notReminded for a run that names no agent and counts nothing', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run()
    const before = t.api.getRecord(one.id)!
    const data = {...before.data}
    delete data['servingAgent']; delete data['servingAgentId']
    const {theReminderBeforeTheSealOf} = await import('../src/server/lib/before-the-seal.ts')
    expect(await theReminderBeforeTheSealOf({...before, data}, 'block')).toEqual({notReminded: expect.stringContaining('names no agent the office knows')})
    expect(t.api.getRecord(one.id)).toEqual(before)
    expect(count()).toBeUndefined()
  })

  it.each(['dataPatch', 'data'])('at block judges the proposed %s and seals with couldNotJudge when its git cannot be read', async shape => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run({test: false})
    expect((await finish(one)).statusCode).toBe(200)
    // The stored branch is readable, and judged it would find report:none gone. Only the proposed directory is unreadable.
    const submitted = await report(one.id)
    t.client.sqlite.prepare("UPDATE workspaces SET review_level = 'full' WHERE id = 'default'").run()
    const value = {state: 'finished', workingDirectory: join(folder, 'no-git-here'), submission: {kind: 'records', records: [submitted]}}
    const second = await app.inject({method: 'PATCH', url: `/api/records/${one.id}`, headers: one.headers, payload: shape === 'dataPatch' ? {dataPatch: value} : {data: {...t.api.getRecord(one.id)!.data, ...value}}})
    expect(second.statusCode, second.body).toBe(200)
    expect(held(one.id)).toMatchObject({reminded: true, atTheSeal: {stillFound: null, noLongerFound: null, couldNotJudge: expect.stringContaining('git could not be read')}})
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 0})
  })

  it('at block seals with couldNotJudge when the reminder items were not kept', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    const one = await run({test: false})
    expect((await finish(one)).statusCode).toBe(200)
    await report(one.id)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.remindedBeforeTheSeal.items') WHERE id = ?").run(one.id)
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(held(one.id)).toMatchObject({reminded: true, atTheSeal: {stillFound: null, noLongerFound: null, couldNotJudge: 'The office did not keep what the reminder named.'}})
    expect(count()).toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 0})
  })
  it('does not judge an unreadable branch, and does not count its items as ignored or heeded', async () => {
    const one = await run()
    expect((await finish(one)).statusCode).toBe(200)
    const note = await report(one.id)
    renameSync(join(one.dir, '.git'), join(one.dir, 'git-kept-by-the-test'))
    t.client.sqlite.prepare("UPDATE workspaces SET review_level = 'full' WHERE id = 'default'").run()
    const second = await finish(one, {submission: {kind: 'records', records: [note]}})
    expect(second.statusCode, second.body).toBe(200)
    const line = held(one.id)
    expect(line?.reminded && line.atTheSeal?.couldNotJudge).toEqual(expect.any(String))
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 1, ignored: 0, heeded: 0})
  })
  it('leaves the migration check on at off, and counts each refused sealing write once, as a stopped one', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'off')
    const one = await run({migration: true})
    for (const n of [1, 2]) {
      const refused = await finish(one)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.body).toContain('migration item')
      expect(t.api.getRecord(one.id)!.data['state']).toBe('running')
      expect(held(one.id)).toBeNull()
      expect(count()).toEqual({would_stop: n, stopped: n, reminded: 0, ignored: 0, heeded: 0})
    }
  })
  it('answers a failed later count beside a seal that still succeeds', async () => {
    const one = await run()
    await aLineSentByHand(one)
    expect((await finish(one)).statusCode).toBe(200)
    await report(one.id)
    t.client.sqlite.exec("CREATE TRIGGER made_up_count_failure BEFORE UPDATE ON gate_counts WHEN NEW.ignored > OLD.ignored BEGIN SELECT RAISE(FAIL, 'made-up later count failure'); END")
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(second.json().remindedBeforeTheSeal).toMatchObject({kept: false, because: expect.stringContaining('made-up later count failure')})
  })
  it('counts no later judgement when keeping it fails, beside a seal that still succeeds', async () => {
    const one = await run()
    expect((await finish(one)).statusCode).toBe(200)
    await report(one.id)
    t.client.sqlite.exec("CREATE TRIGGER made_up_keep_failure BEFORE UPDATE ON records WHEN NEW.id = '" + one.id + "' AND json_extract(NEW.data, '$.remindedBeforeTheSeal.atTheSeal') IS NOT NULL BEGIN SELECT RAISE(FAIL, 'made-up judgement keep failure'); END")
    const second = await finish(one)
    expect(second.statusCode, second.body).toBe(200)
    expect(t.api.getRecord(one.id)!.data['state']).toBe('finished')
    expect(second.json().remindedBeforeTheSeal).toMatchObject({kept: false, because: expect.stringContaining('made-up judgement keep failure')})
    expect(held(one.id)?.reminded && (held(one.id) as {atTheSeal: unknown}).atTheSeal).toBeNull()
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 1, ignored: 0, heeded: 0})
  })
})
