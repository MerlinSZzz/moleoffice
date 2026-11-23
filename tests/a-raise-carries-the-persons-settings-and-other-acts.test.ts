// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAISE CARRIES THE PERSON'S SETTINGS AND OTHER ACTS, AND EACH IS WRITTEN DOWN AS DONE UNDER IT. A raise carries
 * every act but the three the person keeps. This is the second half of the raise,
 * after run pzdakzeFExuI carried the record kinds only the owner may write and retiring an agent.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Unraised, the secretary is refused each of these: the goal spans, the price table, the models the office's runs
 *      use, whether agents may inject, what the office keeps, applying a change set the owner settled, and confirming a task
 *      finished that is not its own.
 *   2. Raised, it does each. Every setting it changed is on the period's list as a setting, and the price table and the
 *      models say the owner's raise is what allowed them; the change set's records and the confirmation name the grant on their
 *      revisions, as every record write under a raise does.
 *   3. A run the office started for it carries none of them (criterion M81).
 *   4. When RAISE_SHOTS names a folder, the secretary's profile is photographed with the press and with a raise
 *      holding, at the four widths and in both themes (chapter 6; the inspector's note on run pzdakzeFExuI).
 *
 * The entry door is carried the same way and is not pressed here, because it writes into the home directory of the
 * machine the test runs on; tests/every-person-only-check-is-sorted-for-a-raise.test.ts shows its guard asks the raise.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the raise taken out of the goal spans' guard: case 2 goes red;
 *   - a setting changed under a raise not written down: case 2 goes red;
 *   - applying a change set not carried by a raise: case 2 goes red;
 *   - confirming a task not carried by a raise: case 2 goes red;
 *   - a run the office started carried by its agent's raise: case 3 goes red.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, FOR_THE_PERSON, FOR_THE_PERSON_IN_THE_QUERY, type TestDb, governsTheWholeProject } from './helpers.ts'

type Built = Awaited<ReturnType<typeof apiApp>>

/** The owner's name, and no key: enough for the owner's writes in this file, which the key window counts on this machine. */
const PERSON_NAME = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: Built
let run = ''

const asArgus = (session: string = run): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
  ...(session === '' ? {} : { 'x-mole-office-session': session }),
})

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** A change set the owner settled: one task to create, as tests/apply.test.ts builds one. */
async function aSettledChangeSet(title: string): Promise<string> {
  const proposal = await ask('POST', '/api/records', PERSON_NAME, {
    kind: 'proposal',
    title: 'What this draft would mean as project structure',
    data: {
      question: 'Should the project take this shape?',
      options: ['a — yes, as written', 'b — no'],
      who_settles_it: 'the owner',
      extra: { delta: { ops: [{ op: 'create_record', says: `Create the task "${title}"`, kind: 'task', title, workspaceId: 'default', data: { state: 'todo' } }] } },
    },
  })
  expect(proposal.status, proposal.said).toBe(201)
  const decision = await ask('POST', '/api/records', { ...PERSON_NAME, ...thePersonsKeyHeader() }, {
    kind: 'decision',
    title: 'Yes, as written',
    data: { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It is right.' },
  })
  expect(decision.status, decision.said).toBe(201)
  const settled = await ask('POST', '/api/links', { ...PERSON_NAME, ...thePersonsKeyHeader() }, { fromId: decision.body['record'].id, toId: proposal.body['record'].id, type: 'derived_from' })
  expect(settled.status, settled.said).toBeLessThan(300)
  return String(proposal.body['record'].id)
}

/** A task the owner filed, whose responsible one is not the secretary. */
async function aTaskOfTheOwner(title: string): Promise<string> {
  const task = await ask('POST', '/api/records', PERSON_NAME, { kind: 'task', title, data: { state: 'todo' } })
  expect(task.status, task.said).toBe(201)
  return String(task.body['record'].id)
}

/** Every act the door can be asked for, as the secretary asks it from the session in `session`. */
async function everyAct(session: string, suffix: string): Promise<Record<string, number>> {
  const proposal = await aSettledChangeSet(`A task the change set creates ${suffix}`)
  const task = await aTaskOfTheOwner(`A task the owner filed ${suffix}`)
  const as = asArgus(session)
  return {
    goalSpans: (await ask('POST', '/api/office/goal-spans', as, { ...FOR_THE_PERSON, shortGoalDays: 20 })).status,
    priceTable: (await ask('POST', '/api/office/price-table', as, { ...FOR_THE_PERSON, table: { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } } })).status,
    runModels: (await ask('POST', '/api/office/run-models', as, { ...FOR_THE_PERSON, places: { conversation: { runtime: 'claude-code', model: 'claude-opus-5-5' } } })).status,
    inject: (await ask('POST', '/api/office/agents-may-inject', as, { ...FOR_THE_PERSON, may: false })).status,
    whatIsKept: (await ask('POST', '/api/office/what-is-kept', as, { ...FOR_THE_PERSON, keepBackups: 9 })).status,
    apply: (await ask('POST', `/api/planning/proposals/${proposal}/apply?${FOR_THE_PERSON_IN_THE_QUERY}`, as)).status,
    confirm: (await ask('POST', `/api/delegation/${task}/confirm?${FOR_THE_PERSON_IN_THE_QUERY}`, as)).status,
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const started = await ask('POST', '/api/agents/started', PERSON_NAME, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
  const session = await ask('POST', '/api/records', asArgus(''), { kind: 'session', title: `${THE_TEST_OFFICES_SECRETARY.handle} answering`, data: { state: 'running' } })
  expect(session.status, session.said).toBe(201)
  run = String(session.body['record'].id)
  const held = await ask('POST', `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`, asArgus(), { session: run, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, held.said).toBe(201)
})

afterEach(async () => {
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, PERSON_NAME)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('the owner\'s other acts', () => {
  it('1: are refused to the secretary unraised', async () => {
    const statuses = await everyAct(run, 'unraised')
    for (const [act, status] of Object.entries(statuses)) expect(status, act).toBe(403)
  })

  it('2: are done by the secretary raised, and each setting is written down as done under the raise', async () => {
    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...PERSON_NAME, ...thePersonsKeyHeader() }, { reason: 'Keep the office running tonight' })
    expect(pressed.status, pressed.said).toBe(201)
    const grant = String(pressed.body['elevation'].id)

    const statuses = await everyAct(run, 'raised')
    // THE CASTING TABLE IS NOT HERE: a secretary changes it by its own card and key, raised or not, so a raise
    // carries nothing there. tests/a-secretary-changes-the-casting-table.test.ts has it.
    expect(statuses).toEqual({ goalSpans: 200, priceTable: 200, runModels: 200, inject: 200, whatIsKept: 200, apply: 200, confirm: 201 })

    // THE PERIOD'S LIST: every setting, as a setting, beside the record acts it already listed.
    const profile = (await ask('GET', `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`, PERSON_NAME)).body
    const acts = (profile['theCardTheyHold']?.elevation?.period?.acts ?? []) as { kind: string; title: string }[]
    expect(acts.filter((one) => one.kind === 'setting').map((one) => one.title).sort()).toEqual(
      ['the goal spans', "the models the office's runs use", 'the price table', 'what the office keeps', 'whether agents may inject'].sort(),
    )
    expect(acts.some((one) => one.kind === 'task'), 'the change set and the confirmation are on it as record acts').toBe(true)

    // AND THE TWO ROWS THAT SAY WHO SET THEM say what allowed it.
    const table = (await ask('GET', '/api/office/price-table', PERSON_NAME)).body
    expect(table['authority']).toBe(`the person's raise ${grant}`)
    const models = t.client.sqlite.prepare('SELECT authority FROM run_models WHERE only_row = 1').get() as { authority: string | null }
    expect(models.authority).toBe(`the person's raise ${grant}`)
  })

  it('3: are carried by no run the office started for the secretary, raised or not', async () => {
    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...PERSON_NAME, ...thePersonsKeyHeader() }, { reason: 'Keep the office running tonight' })
    expect(pressed.status, pressed.said).toBe(201)
    const filed = await ask('POST', '/api/records', PERSON_NAME, {
      kind: 'session',
      title: `${THE_TEST_OFFICES_SECRETARY.handle} answering a message`,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: THE_TEST_OFFICES_SECRETARY.handle },
    })
    expect(filed.status, filed.said).toBe(201)
    const statuses = await everyAct(String(filed.body['record'].id), 'from a run the office started')
    for (const [act, status] of Object.entries(statuses)) expect(status, act).toBe(403)
  })
})

describe('the raise on the page, photographed', () => {
  /**
   * PHOTOGRAPH THE SECRETARY'S PROFILE, with the press and with a raise holding, at the widths and in both themes, when
   * `RAISE_SHOTS` names a folder. The mutation and control runs leave it unset and take no picture.
   */
  it.skipIf(!process.env['RAISE_SHOTS'])('4: photographs the press and the raise holding', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['RAISE_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({ name: 'the-raise', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      for (const state of ['the-press', 'raised'] as const) {
        if (state === 'raised') {
          const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...PERSON_NAME, ...thePersonsKeyHeader() }, { reason: 'Keep the office running tonight' })
          expect(pressed.status, pressed.said).toBe(201)
        }
        await live.page.goto(`${live.site}/#/who/agent/${THE_TEST_OFFICES_SECRETARY.handle}`, { timeout: 60_000 })
        // A RELOAD, because going to the address the page is already on does not read the profile again.
        await live.page.reload({ timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.locator('.tc-elev').first().waitFor()
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.locator('.tc-elev-block').first().scrollIntoViewIfNeeded()
            await live.page.screenshot({ path: `${shots}/raise-${state}-${String(width)}-${theme}.png`, fullPage: false })
          }
        }
      }
    } finally {
      await live.stop()
    }
  }, 300_000)
})
