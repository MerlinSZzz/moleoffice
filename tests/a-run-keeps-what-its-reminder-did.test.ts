// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN KEEPS WHAT THE REMINDER BEFORE ITS SEAL DID, AND WHAT ITS STARTER ASKED IT TO NAME. Wave 13j round 54
 * (src/server/lib/before-the-seal.ts, src/server/lib/check-also.ts, src/shared/before-the-seal.ts). At remind, the reminder follows
 * a decision: a reminder, never a gate — except a migration item the same checks still find, which refuses a
 * git seal before any of it is written, by another decision of wave 14a round 1. A records or files
 * submission seals no branch, so the gate is not asked for one and its line can record a migration item as still found.
 * A git seal is reached only when no such item stands, and one the run has since fixed is recorded as no longer found.
 * This file covers remind, the default position. At block, a later write is refused over a certain named item still
 * found; likely items stay reminders. Its counts and later judgements are covered by
 * tests/the-before-seal-gate-counts-items-and-later-judgements.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. When the reminder fires, the office writes `remindedBeforeTheSeal` on the run: when, the chapters it asked for, and
 *      the items it named, each with a key. GET of the run serves it, and the reminder's reply hands back the version the
 *      record holds now.
 *   2. At the seal the office adds which named items the same checks still find: an item the run dealt with between the
 *      reminder and the seal (a report linked) is no longer found, one it did not deal with is still found. A migration
 *      item still found is not written here for a git seal: the gate refuses that seal before it (wave 14a round 1).
 *   3. A seal with no reminder says so, and why: the launcher's `remindBeforeTheSeal: false`, or a write not sent with the
 *      run's own key.
 *   4. Writing the line does not stop the seal: with the office's write made to fail, the reminder is still answered and
 *      the same write sent again still seals, and both replies say the line was not kept.
 *   5. The starter's `checkAlso` items, through their own door and through the door that files the run, are stored with
 *      who gave them, named by the reminder, and never counted as answered at the seal.
 *   6. The limits and the guards: more than 20 items, an item over 300 characters, the run's own key, a record that is not
 *      a run, and `checkAlso` or `remindedBeforeTheSeal` sent through the record door, each refused and nothing written.
 *   7. The run page draws the line in one plain sentence, and a sealed run with nothing kept says nobody recorded it.
 *
 * Every repository is made here in the system's temporary folder; every key, report and run is made up.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION AND RESTORE: in the round 54 report and .scratch/r54/proofs.md of the run that added this file.
 * Round 56: case 5 also asks that a starter's item is named and kept as not certain
 * (`mechanical: false`); `readRemindedBeforeTheSeal` dropping `mechanical` turns it red.
 * ---------------------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { beforeTheSealSays, readRemindedBeforeTheSeal, type RemindedBeforeTheSeal } from '../src/shared/before-the-seal.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

// THE OFFICE'S WRITE OF THE LINE, MADE TO FAIL ON DEMAND (claim 4). Everything else goes to the real door mark.
const failing = vi.hoisted(() => ({ on: false }))
vi.mock('../src/server/lib/check-field-doors.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/check-field-doors.ts')>()
  return {
    ...real,
    asTheDoorOf: <T>(field: Parameters<typeof real.asTheDoorOf>[0], write: () => T): T => {
      if (failing.on && field === 'remindedBeforeTheSeal') throw new Error('a made-up failure of this test')
      return real.asTheDoorOf(field, write)
    },
  }
})

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-that-keeps-its-reminder'

let t: TestDb
let app: FastifyInstance
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A run filed by the office's worker at commit A, with commit B on its branch adding a test file. Made-up repository. */
async function aRunWithACommit(extra: Record<string, unknown> = {}): Promise<{ id: string; key: string; b: string; filed: PanelRecord }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-keeps-its-reminder-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic reminder test')
  git(dir, 'config', 'user.email', 'reminder@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic run that keeps its reminder',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a, ...extra },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  writeFileSync(join(dir, 'work/made-up.test.ts'), 'it("is made up", () => {})\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return { id: body.record.id, key, b: git(dir, 'rev-parse', 'HEAD'), filed: body.record }
}

const theFinish = (b: string) => ({ dataPatch: { state: 'finished', tip: b } })
const theLineOn = (id: string): RemindedBeforeTheSeal | null => readRemindedBeforeTheSeal(t.api.getRecord(id)!.data['remindedBeforeTheSeal'])

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the line the reminder keeps on the run', () => {
  it('1: the reminder writes the line, GET serves it, and the reply hands back the version the record holds now', async () => {
    const { id, key, b } = await aRunWithACommit()
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reply = first.json() as { version: string; beforeTheSeal: { sealed: false; keptOnTheRun: boolean; line: string; items: { key: string }[] } }
    expect(reply.beforeTheSeal.sealed).toBe(false)
    expect(reply.beforeTheSeal.keptOnTheRun).toBe(true)

    const got = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
    expect(got.statusCode).toBe(200)
    const served = (got.json() as { record: PanelRecord; version: string })
    const line = readRemindedBeforeTheSeal(served.record.data['remindedBeforeTheSeal'])
    expect(line).toMatchObject({ reminded: true, afterSeal: null, line: reply.beforeTheSeal.line, atTheSeal: null })
    if (line === null || !line.reminded) throw new Error('no line')
    expect(line.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u)
    expect(Array.isArray(line.chapters)).toBe(true)
    expect(line.items?.map((one) => one.key)).toEqual(reply.beforeTheSeal.items.map((one) => one.key))
    expect(line.items?.map((one) => one.key)).toEqual(expect.arrayContaining(['report:none', 'test:work/made-up.test.ts']))
    expect(reply.version).toBe(served.version)
    // The run itself is still running and unsealed: the line is the office's, and nothing of the run's write was stored.
    expect(served.record.data['state']).toBe('running')
    expect(served.record.data['sealedTip']).toBeUndefined()
  })

  it('2: at the seal, an item the run dealt with is no longer found and one it did not is still found', async () => {
    const { id, key, b } = await aRunWithACommit()
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    const version = (first.json() as { version: string }).version
    // A report in form answers the reminder's "no report is linked", and no fault of form refuses the seal.
    await aReportInForm(t, id, HANDLE)
    // SENT AGAIN WITH THE VERSION THE REMINDER HANDED BACK, as a careful caller would: the report's link is not a write
    // on the run, so the version still holds.
    const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: { ...theFinish(b), ifVersion: version } })
    expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
    expect((second.json() as { remindedBeforeTheSeal?: unknown }).remindedBeforeTheSeal).toEqual({ kept: true })
    const sealed = t.api.getRecord(id)!
    expect(sealed.data['sealedTip']).toEqual(expect.any(String))
    const line = theLineOn(id)
    if (line === null || !line.reminded || line.atTheSeal === null) throw new Error(`no seal on the line: ${JSON.stringify(line)}`)
    expect(line.atTheSeal.sealedTip).toBe(sealed.data['sealedTip'])
    expect(line.atTheSeal.noLongerFound).toContain('report:none')
    expect(line.atTheSeal.stillFound).toContain('test:work/made-up.test.ts')
    expect(line.atTheSeal.couldNotJudge).toBeNull()
  })

  it('3: a seal with no reminder says so, and why', async () => {
    const launched = await aRunWithACommit()
    await aReportInForm(t, launched.id, HANDLE)
    const byTheLauncher = await app.inject({ method: 'PATCH', url: `/api/records/${launched.id}`, headers: asTheRun(launched.id, launched.key), payload: { ...theFinish(launched.b), remindBeforeTheSeal: false } })
    expect(byTheLauncher.statusCode, byTheLauncher.body.slice(0, 600)).toBe(200)
    expect(theLineOn(launched.id)).toMatchObject({ reminded: false, because: 'theLauncherAskedForNone', sealedTip: t.api.getRecord(launched.id)!.data['sealedTip'] })

    const other = await aRunWithACommit()
    const byAnother = await app.inject({ method: 'PATCH', url: `/api/records/${other.id}`, headers: AS_THE_OFFICE_WORKER, payload: theFinish(other.b) })
    expect(byAnother.statusCode, byAnother.body.slice(0, 600)).toBe(200)
    expect(theLineOn(other.id)).toMatchObject({ reminded: false, because: 'notTheRunsOwnKey' })
  })

  it('4: a failed write of the line stops neither the reminder nor the seal, and both replies say it was not kept', async () => {
    const { id, key, b } = await aRunWithACommit()
    await aReportInForm(t, id, HANDLE)
    failing.on = true
    try {
      const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
      const reminded = (first.json() as { beforeTheSeal: { sealed: boolean; keptOnTheRun: boolean; notKept?: string } }).beforeTheSeal
      expect(reminded).toMatchObject({ sealed: false, keptOnTheRun: false })
      expect(reminded.notKept).toContain('a made-up failure of this test')
      const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
      expect((second.json() as { remindedBeforeTheSeal?: { kept: boolean; because?: string } }).remindedBeforeTheSeal).toMatchObject({ kept: false, because: expect.stringContaining('a made-up failure of this test') })
    } finally {
      failing.on = false
    }
    const sealed = t.api.getRecord(id)!
    expect(sealed.data['state']).toBe('finished')
    expect(sealed.data['sealedTip']).toEqual(expect.any(String))
    expect(sealed.data['remindedBeforeTheSeal']).toBeUndefined()
  })
})

describe("the starter's items", () => {
  it('5: through their own door and through the door that files the run, stored with who gave them, named, never judged', async () => {
    const { id, key, b } = await aRunWithACommit()
    await aReportInForm(t, id, HANDLE)
    const put = await app.inject({ method: 'PUT', url: `/api/records/${id}/check-also`, headers: AS_THE_PERSON, payload: { items: ['  Does the report answer the made-up question?  ', 'Is the made-up page drawn at 390?'] } })
    expect(put.statusCode, put.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(id)!.data['checkAlso']).toMatchObject({ items: ['Does the report answer the made-up question?', 'Is the made-up page drawn at 390?'], by: { actorType: 'human', actorId: THE_PERSON }, at: expect.any(String) })

    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    const items = (first.json() as { beforeTheSeal: { items: { key: string; about: string; says: string }[] } }).beforeTheSeal.items
    expect(items.filter((one) => one.about === 'check also')).toEqual([
      { key: 'check-also:0', about: 'check also', says: expect.stringContaining('"Does the report answer the made-up question?"'), mechanical: false },
      { key: 'check-also:1', about: 'check also', says: expect.stringContaining('"Is the made-up page drawn at 390?"'), mechanical: false },
    ])
    await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    const line = theLineOn(id)
    if (line === null || !line.reminded || line.atTheSeal === null) throw new Error('no seal on the line')
    // ROUND 56: the line keeps whether each item is certain, and a starter's item never is.
    expect(line.items?.filter((one) => one.about === 'check also').map((one) => one.mechanical)).toEqual([false, false])
    expect(line.atTheSeal.notJudged).toEqual(['check-also:0', 'check-also:1'])
    expect([...(line.atTheSeal.stillFound ?? []), ...(line.atTheSeal.noLongerFound ?? [])]).not.toContain('check-also:0')

    const filedWithThem = await aRunWithACommit({ checkAlso: ['Was the made-up migration taken at 0255?'] })
    expect(filedWithThem.filed.data['checkAlso']).toMatchObject({ items: ['Was the made-up migration taken at 0255?'], by: { actorId: 'mole-office/the-message-worker' } })
  })

  it('6: the limits and the guards are refused with codes, and nothing is written', async () => {
    const { id, key } = await aRunWithACommit()
    const put = (headers: Record<string, string>, items: unknown, on = id) => app.inject({ method: 'PUT', url: `/api/records/${on}/check-also`, headers, payload: { items } })
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic note', data: { body: 'Made up.' }, actor: { type: 'human', id: THE_PERSON } }).id
    const cases: [Awaited<ReturnType<typeof put>>, number, string][] = [
      [await put(AS_THE_PERSON, Array.from({ length: 21 }, (_, n) => `Made-up item ${n}`)), 400, 'checkAlsoTooMany'],
      [await put(AS_THE_PERSON, ['x'.repeat(301)]), 400, 'checkAlsoItemTooLong'],
      [await put(asTheRun(id, key), ['Made-up item the run gives itself']), 403, 'checkAlsoByTheRunItself'],
      [await put(AS_THE_PERSON, ['Made-up item'], note), 409, 'checkAlsoNotARun'],
      [await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: { dataPatch: { checkAlso: { items: ['Made up'] } } } }), 403, 'checkAlsoWrittenOutsideItsDoor'],
    ]
    for (const [reply, status, code] of cases) {
      expect(reply.statusCode, reply.body.slice(0, 400)).toBe(status)
      expect((reply.json() as { code?: string }).code).toBe(code)
    }
    // The limits themselves: 20 items of 300 characters are taken.
    expect((await put(AS_THE_PERSON, Array.from({ length: 20 }, () => 'y'.repeat(300)))).statusCode).toBe(200)
    expect(t.api.getRecord(id)!.data['checkAlso']).toMatchObject({ items: Array.from({ length: 20 }, () => 'y'.repeat(300)) })
    const office = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: { dataPatch: { remindedBeforeTheSeal: { reminded: false } } } })
    expect(office.statusCode).toBe(403)
    expect(office.body).toContain('The office writes remindedBeforeTheSeal')
    expect(t.api.getRecord(id)!.data['remindedBeforeTheSeal']).toBeUndefined()
  })
})

describe('the run page', () => {
  // THE PANEL IS IMPORTED AFTER A WINDOW STAND-IN EXISTS: src/web/api.ts reads `window.localStorage` at module scope.
  let TheCheckOnARun: typeof import('../src/web/components/TheCheckOnARun.tsx')['TheCheckOnARun']
  beforeAll(async () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} }
    TheCheckOnARun = (await import('../src/web/components/TheCheckOnARun.tsx')).TheCheckOnARun
  })

  const aRun = (data: Record<string, unknown>): PanelRecord => ({ ...t.api.getRecord(t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic drawn run', data: { state: 'running', servingAgent: HANDLE }, actor: { type: 'human', id: THE_PERSON } }).id)!, data })
  const theLineDrawn = (record: PanelRecord): string | null => /data-part="before-the-seal"><h3 class="chk-h">Before the seal<\/h3><p class="chk-said">([^<]*)<\/p>/u.exec(renderToStaticMarkup(h(TheCheckOnARun, { record })))?.[1] ?? null

  it('7: draws the line in one sentence; a sealed run with nothing kept says nobody recorded it', () => {
    const reminded: RemindedBeforeTheSeal = {
      reminded: true,
      at: '2026-10-11 12:40:00',
      afterSeal: null,
      line: 'made-up-line',
      chapters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      items: [{ key: 'report:none', about: 'report', says: 'Made up.' }, { key: 'test:a.test.ts', about: 'test proof', says: 'Made up.' }, { key: 'check-also:0', about: 'check also', says: 'Made up.' }],
      atTheSeal: { at: '2026-10-11 12:52:00', sealedTip: 'made-up-seal', stillFound: ['test:a.test.ts'], noLongerFound: ['report:none'], notJudged: ['check-also:0'], couldNotJudge: null },
    }
    const said = 'Reminded 2026-10-11 12:40:00, asking for chapters 1\u2060–\u206010; it named 3 items. At the seal, 2026-10-11 12:52:00: 1 no longer found, 1 still found. 1 the office cannot judge.'
    expect(beforeTheSealSays(reminded, true)).toBe(said)
    expect(theLineDrawn(aRun({ state: 'finished', servingAgent: HANDLE, sealedTip: 'made-up-seal', remindedBeforeTheSeal: reminded }))).toBe(said)
    // Reminded and not sealed yet: the panel is drawn for the line alone.
    expect(theLineDrawn(aRun({ state: 'running', servingAgent: HANDLE, remindedBeforeTheSeal: { ...reminded, atTheSeal: null } }))).toBe(
      'Reminded 2026-10-11 12:40:00, asking for chapters 1\u2060–\u206010; it named 3 items. Not sealed since.',
    )
    expect(theLineDrawn(aRun({ state: 'finished', servingAgent: HANDLE, sealedTip: 'made-up-seal', remindedBeforeTheSeal: { reminded: false, at: '2026-10-11 12:52:00', sealedTip: 'made-up-seal', because: 'theLauncherAskedForNone' } }))).toBe(
      'Sealed 2026-10-11 12:52:00 without a reminder: the launcher sealed it after the agent’s command had ended.'.replaceAll('’', '’'),
    )
    expect(theLineDrawn(aRun({ state: 'finished', servingAgent: HANDLE, sealedTip: 'made-up-seal' }))).toBe('Nobody recorded whether this run was reminded before its seal.')
    expect(theLineDrawn(aRun({ state: 'running', servingAgent: HANDLE }))).toBeNull()
  })
})
