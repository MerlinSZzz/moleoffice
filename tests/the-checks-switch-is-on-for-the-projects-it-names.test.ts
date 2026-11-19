// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SWITCH FOR CHECKS IN MERGES-ONLY MODE IS ON FOR THE PROJECTS IT NAMES (wave 13j, the round after the check line's
 * round 14). The words of message BUF_DSiSl5vQ: "please design the switch so it can apply per project. For example,
 * "on" names the projects it is on for, defaults to the project the switch is set from, and the reading says which
 * projects."
 *
 * WHAT IS PROVED HERE, through POST and GET /api/office/checks-in-merges-only and the real worker pass:
 *
 *   1. AN OLDER DATABASE. A switch that was on before it could name projects reads as on for every project, and says why.
 *   2. ON, NAMING NONE. Switched on from project `default` with no projects, it is on for `default` alone, the reading's
 *      `projects` and `says` say so, and the change is kept with who, from what and to what.
 *   3. ON, NAMING TWO. It is on for both, and the reading names both.
 *   4. REFUSED, AND NOTHING CHANGED: projects with on false, an empty list, and a project this office does not have.
 *   5. OFF CLEARS THEM. Switched off, the reading names no project. Switched on again from another project, it is on for
 *      that project alone.
 *   6. THE WORKER. A merges-only worker of `default`, with the switch on for another project only, starts no check, and
 *      the check's delivery stays queued with no reason written. On for `default`, the same pass starts it.
 *   7. AN UNREADABLE PROJECTS ROW. A change row for the projects setting that the office cannot read is refused with a
 *      500, and neither the switch's own column nor how many checks run at once changes, so the reply's "nothing was
 *      changed" is true whether one body sends both or only how many checks run at once.
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every project, run and reason here is synthetic. The git trees and the worker's output folder are made under the
 * system's temporary folder and removed after. The check tool is tests/fake-inspection-tool.mjs, so no model is called,
 * and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { whatOnMeans, CHECKS_AT_ONCE_BOUNDS, CHECKS_AT_ONCE_BY_DEFAULT } from '../src/shared/checks-in-merges-only.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const THE_DOOR = '/api/office/checks-in-merges-only'
const SECOND = 'second'
const as = (workspace: string, type: 'agent' | 'human', id: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('default', 'human', THE_PERSON)
const asPersonInTheSecond = as(SECOND, 'human', THE_PERSON)
const asSupervisor = as('default', 'agent', 'super-r')
const asWorker = as('default', 'agent', 'worker-w')
const theWorker = { type: 'agent' as const, id: 'worker-w' }
const A = 'work/a.txt'
const ON_MEANS = whatOnMeans(CHECKS_AT_ONCE_BY_DEFAULT)

interface TheReading { on: boolean; nobodyChose: boolean; projects: string[] | null; says: string }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** The switch's reading, less the machine's load and free memory, which the office reads anew on every call. */
async function read(): Promise<TheReading> {
  const r = await call('GET', THE_DOOR, asPerson)
  expect(r.status, r.raw).toBe(200)
  const { machine: _machine, ...reading } = r.body
  return reading as TheReading
}

/** The rows the change log keeps for one setting, oldest first. */
function theChangesOf(setting: string): { to: string | null }[] {
  return t.client.sqlite.prepare("SELECT new_value AS \"to\" FROM changes WHERE record_id = ? AND op = 'update' ORDER BY rowid").all(`setting:${setting}`) as { to: string | null }[]
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `switch-projects-${prefix}-`)))
  made.push(dir)
  return dir
}

/**
 * A finished run of the worker in `default`, sealed at its own tree's tip. If sealing asks for no check, the person
 * explicitly asks through ask-again. Returns the run id and its real check message.
 */
async function aSealedRun(): Promise<{ run: string; check: string }> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic switch-projects fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic switch-projects run',
    workspaceId: 'default',
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir, doing: 'Synthetic: the run changes work/a.txt.' },
  }).id
  writeFileSync(join(dir, A), `${A} changed by ${dir}.\n`)
  git(dir, 'commit', '-q', '-am', 'Synthetic work of the run')
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  if (!(t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, asPerson, {})
    expect(asked.status, asked.raw).toBe(200)
  }
  const check = (t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message ?? ''
  expect(check, `the office asked for no check of ${run}`).not.toBe('')
  return { run, check }
}

function itStarted(run: string): boolean {
  return (t.api.getRecord(run)!.data['theCheck'] as { execution?: unknown } | undefined)?.execution !== undefined
}

function theDeliveryOf(message: string): { mark: string; because: string | null } {
  const inspector = t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'inspector-one'").get() as { id: string }
  return t.client.sqlite.prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(message, inspector.id) as { mark: string; because: string | null }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: SECOND, title: 'Synthetic second project' })
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work'] })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: scratch('main'), actor: { type: 'human', id: THE_PERSON } })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 9,
    hops: 3,
    outputRoot: scratch('worker'),
    mergesOnly: true,
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
}, 60_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The switch-projects test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('the switch for checks in merges-only mode, and the projects it is on for', () => {
  it('1: reads as on for every project when it was switched on before it could name projects, and says why', async () => {
    expect(await read()).toMatchObject({ on: false, nobodyChose: true, projects: null })
    // AN OLDER OFFICE'S STATE, written as that office's door wrote it: the column alone, and no projects anywhere.
    t.client.sqlite.prepare('UPDATE installation SET checks_in_merges_only = 1 WHERE only_row = 1').run()
    const reading = await read()
    expect(reading).toMatchObject({ on: true, nobodyChose: false, projects: null })
    expect(reading.says).toBe(`On for every project, because it was switched on before the switch could name projects: ${ON_MEANS}.`)
    t.client.sqlite.prepare('UPDATE installation SET checks_in_merges_only = NULL WHERE only_row = 1').run()
  })

  it('2: switched on with no projects named, is on for the project it was switched on from, and keeps the change', async () => {
    const on = await call('POST', THE_DOOR, asPerson, { on: true, because: 'Synthetic: on for this project.' })
    expect(on.status, on.raw).toBe(200)
    expect(on.body).toMatchObject({ on: true, projects: ['default'] })
    const reading = await read()
    expect(reading).toMatchObject({ on: true, nobodyChose: false, projects: ['default'] })
    expect(reading.says).toBe(`On for default: ${ON_MEANS}.`)
    expect(theChangesOf('checks-in-merges-only-for').map((one) => JSON.parse(one.to ?? 'null'))).toEqual([
      { projects: ['default'], because: 'Synthetic: on for this project.' },
    ])
    const kept = await call('GET', '/api/office/setting-changes', asPerson)
    expect(kept.body['settings']['checks-in-merges-only-for']).toMatchObject({ by: { type: 'human', id: THE_PERSON } })
  })

  it('3: switched on naming two projects, is on for both and names both', async () => {
    const on = await call('POST', THE_DOOR, asPerson, { on: true, projects: ['default', SECOND], because: 'Synthetic: on for two.' })
    expect(on.status, on.raw).toBe(200)
    const reading = await read()
    expect(reading).toMatchObject({ on: true, projects: ['default', SECOND] })
    expect(reading.says).toBe(`On for default and ${SECOND}: ${ON_MEANS}.`)
  })

  it('4: refuses projects with on false, an empty list, and a project this office does not have, and changes nothing', async () => {
    const before = await read()
    const rows = theChangesOf('checks-in-merges-only-for').length
    for (const [body, words] of [
      [{ on: false, projects: ['default'] }, 'only with on: true'],
      [{ on: true, projects: [] }, 'at least one project'],
      [{ on: true, projects: ['nowhere'] }, '"nowhere"'],
    ] as const) {
      const refused = await call('POST', THE_DOOR, asPerson, { ...body, because: 'Synthetic: refused.' })
      expect(refused.status, refused.raw).toBe(400)
      expect(String(refused.body['error'])).toContain(words)
      expect(String(refused.body['error'])).toContain('Nothing was changed.')
    }
    expect(await read()).toEqual(before)
    expect(theChangesOf('checks-in-merges-only-for')).toHaveLength(rows)
  })

  it('5: switched off, names no project; switched on again from another project, is on for that one alone', async () => {
    const off = await call('POST', THE_DOOR, asPerson, { on: false, because: 'Synthetic: off.' })
    expect(off.status, off.raw).toBe(200)
    expect(await read()).toMatchObject({ on: false, nobodyChose: false, projects: null })
    const on = await call('POST', THE_DOOR, asPersonInTheSecond, { on: true, because: 'Synthetic: on from the second project.' })
    expect(on.status, on.raw).toBe(200)
    const reading = await read()
    expect(reading).toMatchObject({ on: true, projects: [SECOND] })
    expect(reading.says).toBe(`On for ${SECOND}: ${ON_MEANS}.`)
  })

  it('6: a merges-only worker starts no check for a project the switch does not name, and starts it once it does', async () => {
    expect((await read()).projects).toEqual([SECOND])
    const { run, check } = await aSealedRun()
    const pass = await onePass(settings, watching, [])
    expect(pass.started, JSON.stringify(pass)).toEqual([])
    expect(pass.held.some((one) => one.messageId === check)).toBe(false)
    expect(theDeliveryOf(check)).toEqual({ mark: 'queued', because: null })
    expect(itStarted(run)).toBe(false)

    const on = await call('POST', THE_DOOR, asPerson, { on: true, because: 'Synthetic: on for default.' })
    expect(on.status, on.raw).toBe(200)
    const next = await onePass(settings, watching, [])
    expect(next.started.some((one) => one.messageId === check), JSON.stringify(next)).toBe(true)
    expect(itStarted(run)).toBe(true)
    const until = Date.now() + 30_000
    while (watching.length > 0 && Date.now() < until) {
      await new Promise((go) => setTimeout(go, 100))
      await onePass(settings, watching, [])
    }
    expect(watching, 'the started check did not end').toEqual([])
  })

  it('7: a projects row the office cannot read leaves the switch as it was', async () => {
    const off = await call('POST', THE_DOOR, asPerson, { on: false, because: 'Synthetic: off before the unreadable row.' })
    expect(off.status, off.raw).toBe(200)
    const column = (): number | null =>
      (t.client.sqlite.prepare('SELECT checks_in_merges_only AS value FROM installation WHERE only_row = 1').get() as { value: number | null }).value
    expect(column()).toBe(0)
    const { CHECKS_IN_MERGES_ONLY_FOR_SETTING, theChecksAtOnce } = await import('../src/server/lib/checks-in-merges-only.ts')
    const checksAtOnce = theChecksAtOnce().checksAtOnce
    const wanted = checksAtOnce === CHECKS_AT_ONCE_BOUNDS.most ? CHECKS_AT_ONCE_BOUNDS.fewest : CHECKS_AT_ONCE_BOUNDS.most
    const row = 'synthetic-unreadable-projects-row'
    t.client.sqlite
      .prepare(
        "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, new_value, at) VALUES (?, ?, 'default', 'update', 'human', ?, ?, ?, ?)",
      )
      .run(row, `setting:${CHECKS_IN_MERGES_ONLY_FOR_SETTING}`, THE_PERSON, 'checks-in-merges-only-for', 'not a JSON document', localStamp(new Date()))
    const refused = await call('POST', THE_DOOR, asPerson, {
      on: true,
      checksAtOnce: wanted,
      because: 'Synthetic: this must leave the switch and the limit as they were.',
    })
    expect(refused.status, refused.raw).toBe(500)
    expect(String(refused.body['error'])).toContain('Nothing was guessed and nothing was changed.')
    expect(column(), 'the switch was changed even though the reply said nothing was').toBe(0)
    expect(theChecksAtOnce().checksAtOnce, 'the limit was changed even though the reply said nothing was').toBe(checksAtOnce)
    t.client.sqlite.prepare('DELETE FROM changes WHERE id = ?').run(row)
  })

  it('8: a limit-only change is refused as a whole when the switch is on and the projects row is unreadable', async () => {
    const on = await call('POST', THE_DOOR, asPerson, { on: true, because: 'Synthetic: on before the unreadable row.' })
    expect(on.status, on.raw).toBe(200)
    const column = (): number | null =>
      (t.client.sqlite.prepare('SELECT checks_in_merges_only AS value FROM installation WHERE only_row = 1').get() as { value: number | null }).value
    expect(column()).toBe(1)
    const { CHECKS_IN_MERGES_ONLY_FOR_SETTING, theChecksAtOnce } = await import('../src/server/lib/checks-in-merges-only.ts')
    const checksAtOnce = theChecksAtOnce().checksAtOnce
    const wanted = checksAtOnce === CHECKS_AT_ONCE_BOUNDS.most ? CHECKS_AT_ONCE_BOUNDS.fewest : CHECKS_AT_ONCE_BOUNDS.most
    const row = 'synthetic-unreadable-projects-row-for-a-limit'
    t.client.sqlite
      .prepare(
        "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, new_value, at) VALUES (?, ?, 'default', 'update', 'human', ?, ?, ?, ?)",
      )
      .run(row, `setting:${CHECKS_IN_MERGES_ONLY_FOR_SETTING}`, THE_PERSON, 'checks-in-merges-only-for', 'not a JSON document', localStamp(new Date()))
    const refused = await call('POST', THE_DOOR, asPerson, {
      checksAtOnce: wanted,
      because: 'Synthetic: the limit alone must not change.',
    })
    expect(refused.status, refused.raw).toBe(500)
    expect(String(refused.body['error'])).toContain('Nothing was guessed and nothing was changed.')
    expect(column(), 'the switch was changed by a limit-only body').toBe(1)
    expect(theChecksAtOnce().checksAtOnce, 'the limit was changed even though the reply said nothing was').toBe(checksAtOnce)
    t.client.sqlite.prepare('DELETE FROM changes WHERE id = ?').run(row)
    const off = await call('POST', THE_DOOR, asPerson, { on: false, because: 'Synthetic: off after the unreadable row.' })
    expect(off.status, off.raw).toBe(200)
  })
})
