// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GO WAIT MARK LIMITS ONLY WHILE ITS RUN LIVES, ON THE KEY A NEW GO RUN GETS.
 *
 * Point U5ZNMQKj-8AJ, problem 2bKpIq0_zHxu.
 *
 * Before: the Casting rule counted every mark of waiting on Go's limit until its reset, whatever its run's state and
 * whichever key it named. Two runs the stop door had crashed kept their marks, on OPENCODE_API_KEY with a reset days
 * ahead, so every Go row stayed out after both runs had ended. Now a mark counts only while its run has not ended, as
 * theRunHasEnded reads the state, and only when it names the key a new run on the mark's own provider would get: the
 * router's slots while the router is on and routes that provider, and otherwise OPENCODE_API_KEY or OpenCode's own
 * login, which the office cannot tell apart. A mark with no key, with no provider, or with a key the session kind does
 * not declare is judged by its run's state alone. A Go stop is judged as before (decisions IBuGShbFZ5pP, DSvi3SSy_trI).
 *
 * The runs here are fixture sessions in a disposable database, in the shape the launcher writes. No provider, router or
 * launcher runs, and nothing listens on the live office port. The router setting is given to the rule as its option,
 * except in the case that reads the setting itself: that case sets the variable in this process's own environment and
 * puts the old value back, and writes no file. These cases were written and not run by their writer.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'

let t: TestDb

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const NAMED = 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Two Go models, so a mark is seen to keep out every Go row and not only its own run's. */
const GO_MODELS = ['opencode-go/glm-5.1', 'opencode-go/deepseek-v4.1-flash'] as const
/**
 * THE THREE KEY NAMES A MARK MAY CARRY, as the cases name them. The session kind declares them only as the type of the
 * mark's `key`, and which one is the router's is the launcher's word, so they are written here once and checked against
 * that declared type before any case uses them.
 */
const THE_ROUTER = 'the-router'
const THE_VARIABLE = 'OPENCODE_API_KEY'
const THE_LOGIN = 'opencode-login'

beforeEach(async () => {
  t = await freshDb()
  const { SHAPE_SPECS } = await import('../src/shared/kinds.ts')
  const { declaredTypeOf } = await import('../src/shared/kinds/type-reader.ts')
  const field = SHAPE_SPECS['WaitOnALimit']?.fields.find((one) => one.key === 'key')
  if (field === undefined) throw new Error('The session kind declares no `key` on a mark of waiting on a limit.')
  const declared = declaredTypeOf(field)
  expect(declared.kind === 'literals' ? [...declared.values].sort() : declared).toEqual([THE_ROUTER, THE_VARIABLE, THE_LOGIN].sort())
})
afterEach(() => t.close())

/** The provider a Go wait names, read from the router's own list so a rename is seen here. */
async function theGoProvider(): Promise<string> {
  const { THE_ROUTED_PROVIDERS } = await import('../src/config/provider-router.mjs')
  const go = Object.entries(THE_ROUTED_PROVIDERS).find(([, provider]) => provider.modelPrefix === 'opencode-go/')?.[0]
  if (go === undefined) throw new Error('The router names no provider for the opencode-go models.')
  return go
}

interface AMark {
  state: string
  key?: string | null
  provider?: string | null
  /** Where the mark is kept: the session field, or the copy an older run kept in `extra`. */
  inExtra?: boolean
  seenAt: Date
  resetsAt: Date
}

/**
 * An OpenCode run the launcher marked as waiting on Go's limit. A `key` that is null or left out is left off the mark.
 * A `provider` left out is Go's own, and a null one is written as null, as the launcher writes a retry that named none.
 */
async function aMarkedRun(mark: AMark): Promise<string> {
  const provider = mark.provider === undefined ? await theGoProvider() : mark.provider
  const waitingOnALimit = {
    provider, said: 'Synthetic Go usage limit. It will reset in 2 hours.', attempt: 1,
    seenAt: mark.seenAt.toISOString(), resetsAt: mark.resetsAt.toISOString(), resetFrom: NAMED,
    ...(mark.key === undefined || mark.key === null ? {} : { key: mark.key }),
  }
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', actor: HUMAN,
    title: `Synthetic ${mark.state} run waiting on Go on ${mark.key ?? 'no key'} at ${String(mark.seenAt.getTime())}`,
    data: {
      state: mark.state, runtime: 'opencode', model: GO_MODELS[0],
      ...(mark.inExtra === true ? { extra: { waitingOnALimit } } : { waitingOnALimit }),
    },
  }).id
}

/** What keeps each Go row out at `nowMs`, one list a row. `routerIsOn` left out lets the rule read the setting. */
async function theGoRowsOut(nowMs: number, routerIsOn?: boolean): Promise<string[][]> {
  const { theModelsLimitedAt } = await import('../src/server/db/the-models-limited-at.ts')
  const { theLimitsOn } = await import('../src/shared/casting-roll.ts')
  const limits = theModelsLimitedAt(nowMs, { officeZone: 'UTC', ...(routerIsOn === undefined ? {} : { routerIsOn }) })
  return GO_MODELS.map((model) => theLimitsOn('opencode', model, limits))
}

const NO_ROW_OUT = GO_MODELS.map(() => [])

/** Every Go row is kept out at `nowMs` by the one run, and by nothing else. */
async function everyGoRowIsKeptOutBy(run: string, nowMs: number, routerIsOn: boolean | undefined, said: string): Promise<void> {
  const out = await theGoRowsOut(nowMs, routerIsOn)
  for (const [index, reasons] of out.entries()) {
    expect(reasons, `${said}: ${GO_MODELS[index] ?? ''}`).toHaveLength(1)
    expect(reasons[0], `${said}: ${GO_MODELS[index] ?? ''}`).toContain(`Run ${run} `)
  }
}

it('A mark on a finished, crashed, paused or orphaned run keeps no Go row out, with a key and without one', async () => {
  const { RUN_IS_OVER_STATES } = await import('../src/shared/run-has-ended.ts')
  expect(RUN_IS_OVER_STATES.length).toBeGreaterThan(0)
  const now = Date.now()
  for (const state of RUN_IS_OVER_STATES) {
    for (const key of [null, THE_ROUTER, THE_VARIABLE, THE_LOGIN]) {
      const run = await aMarkedRun({ state, key, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
      for (const routerIsOn of [true, false]) {
        expect(await theGoRowsOut(now, routerIsOn), `a ${state} run on ${key ?? 'no key'}, the router ${routerIsOn ? 'on' : 'off'}`).toEqual(NO_ROW_OUT)
      }
      t.api.deleteRecord(run, HUMAN)
    }
  }
})

it('A mark on a running, idle or unknown run, on the key a new Go run gets, keeps every Go row out until its reset', async () => {
  const { SESSION_STATES } = await import('../src/shared/types.ts')
  const { theRunHasEnded } = await import('../src/shared/run-has-ended.ts')
  const living = SESSION_STATES.filter((state) => !theRunHasEnded(state))
  expect(living.length).toBeGreaterThan(0)
  const now = Date.now()
  const resetsAt = new Date(now + 2 * HOUR)
  for (const state of living) {
    for (const [routerIsOn, key] of [[true, THE_ROUTER], [false, THE_VARIABLE], [false, THE_LOGIN]] as const) {
      const run = await aMarkedRun({ state, key, seenAt: new Date(now - 10 * MINUTE), resetsAt })
      const said = `a ${state} run on ${key}, the router ${routerIsOn ? 'on' : 'off'}`
      await everyGoRowIsKeptOutBy(run, now, routerIsOn, said)
      expect(await theGoRowsOut(resetsAt.getTime() + MINUTE, routerIsOn), `${said}, after its reset`).toEqual(NO_ROW_OUT)
      t.api.deleteRecord(run, HUMAN)
    }
  }
})

it('With the router on, a mark on OPENCODE_API_KEY or opencode-login keeps no Go row out, and a mark on the-router does', async () => {
  const now = Date.now()
  for (const key of [THE_VARIABLE, THE_LOGIN]) {
    const run = await aMarkedRun({ state: 'running', key, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
    expect(await theGoRowsOut(now, true), `a running run on ${key}`).toEqual(NO_ROW_OUT)
    t.api.deleteRecord(run, HUMAN)
  }
  const run = await aMarkedRun({ state: 'running', key: THE_ROUTER, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
  await everyGoRowIsKeptOutBy(run, now, true, `a running run on ${THE_ROUTER}`)
})

it('With the router off, a mark on the-router keeps no Go row out, and a mark on OPENCODE_API_KEY or opencode-login does', async () => {
  const now = Date.now()
  const routed = await aMarkedRun({ state: 'running', key: THE_ROUTER, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
  expect(await theGoRowsOut(now, false), `a running run on ${THE_ROUTER}`).toEqual(NO_ROW_OUT)
  t.api.deleteRecord(routed, HUMAN)
  for (const key of [THE_VARIABLE, THE_LOGIN]) {
    const run = await aMarkedRun({ state: 'running', key, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
    await everyGoRowIsKeptOutBy(run, now, false, `a running run on ${key}`)
    t.api.deleteRecord(run, HUMAN)
  }
})

it('A mark with no key on a running run keeps Go out with the router on and with it off', async () => {
  const now = Date.now()
  const run = await aMarkedRun({ state: 'running', key: null, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
  for (const routerIsOn of [true, false]) await everyGoRowIsKeptOutBy(run, now, routerIsOn, `the router ${routerIsOn ? 'on' : 'off'}`)
})

it("The problem's case: two crashed runs whose marks on OPENCODE_API_KEY reset days ahead leave officeOut [] on the " +
  'opencode rows of the Casting table, through theCastingTable', async () => {
  const { THE_WORKER } = await import('../src/shared/roles.ts')
  const { theCastingTable } = await import('../src/server/lib/casting.ts')
  // THE ROLE CARDS ARE READ HERE. theCastingTable asks for them, and in a server buildApp reads them first. This case
  // starts no server, so it reads them itself, and forgets them again after, so no other case depends on the order.
  const roles = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  roles.forgetTheRoleCards()
  roles.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  try {
    // ONE GO ROW OF THE WORKER'S, written straight into the table as the test of the casting in force writes its rows,
    // so this case holds the limits the table shows and nothing the Casting writers check.
    const at = '2026-11-17 19:00:00'
    const source = JSON.stringify({ at, by: { kind: 'human', id: HUMAN.id }, decision: null, moved: false })
    t.client.sqlite.prepare(
      `insert into casting_rows (role, project, marked, program, program_from, model, model_from, changed_at, changed_by_kind, changed_by_id)
       values (?, '', 0, 'opencode', ?, ?, ?, ?, 'human', ?)`,
    ).run(THE_WORKER, source, GO_MODELS[1], source, at, HUMAN.id)
    const now = Date.now()
    for (const hoursAgo of [26, 25]) {
      await aMarkedRun({ state: 'crashed', key: THE_VARIABLE, seenAt: new Date(now - hoursAgo * HOUR), resetsAt: new Date(now + 3 * DAY) })
    }
    const rows = theCastingTable().roles.flatMap((card) => card.scopes).flatMap((scope) => scope.castings)
      .filter((row) => row.cells.program.value === 'opencode' && (row.cells.model.value ?? '').startsWith('opencode-go/'))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.officeOut, `${String(row.id)} ${row.cells.model.value ?? ''}`).toEqual([])
  } finally {
    roles.forgetTheRoleCards()
  }
})

it('A Go stop still keeps Go out until its reset, with the router on and with it off', async () => {
  const { A_GO_LIMIT_IS } = await import('../src/config/stopped-run-cause.mjs')
  const { localStamp } = await import('../src/shared/time.ts')
  const now = Date.now()
  const stoppedAt = new Date(now - 10 * MINUTE)
  const resetsAt = new Date(now + 2 * HOUR)
  const run = t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Synthetic Go stop at ${String(stoppedAt.getTime())}`, actor: HUMAN,
    data: {
      state: 'crashed', runtime: 'opencode', model: GO_MODELS[0],
      closedAt: localStamp(stoppedAt), closedHow: 'provider-event', closedBecause: 'The run ended, in the words of its close.',
      stopCause: { kind: A_GO_LIMIT_IS, said: 'Synthetic Go usage limit.', at: stoppedAt.toISOString(), resetsAt: resetsAt.toISOString(), resetFrom: NAMED },
    },
  }).id
  for (const routerIsOn of [true, false]) {
    await everyGoRowIsKeptOutBy(run, now, routerIsOn, `the router ${routerIsOn ? 'on' : 'off'}`)
    expect(await theGoRowsOut(resetsAt.getTime() + MINUTE, routerIsOn), `the router ${routerIsOn ? 'on' : 'off'}, after the reset`).toEqual(NO_ROW_OUT)
  }
})

it('Without the option, the rule follows the router setting as theProviderRouterIsOn reads it', async () => {
  const { THE_ROUTER_SETTING, theProviderRouterIsOn } = await import('../src/config/provider-router.mjs')
  const before = Object.hasOwn(process.env, THE_ROUTER_SETTING) ? process.env[THE_ROUTER_SETTING] : undefined
  const now = Date.now()
  try {
    const onTheVariable = await aMarkedRun({ state: 'running', key: THE_VARIABLE, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
    process.env[THE_ROUTER_SETTING] = 'on'
    expect(theProviderRouterIsOn()).toBe(true)
    expect(await theGoRowsOut(now), `the setting on, a running run on ${THE_VARIABLE}`).toEqual(NO_ROW_OUT)
    process.env[THE_ROUTER_SETTING] = 'off'
    expect(theProviderRouterIsOn()).toBe(false)
    await everyGoRowIsKeptOutBy(onTheVariable, now, undefined, `the setting off, a running run on ${THE_VARIABLE}`)
    t.api.deleteRecord(onTheVariable, HUMAN)

    const onTheRouter = await aMarkedRun({ state: 'running', key: THE_ROUTER, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
    expect(await theGoRowsOut(now), `the setting off, a running run on ${THE_ROUTER}`).toEqual(NO_ROW_OUT)
    process.env[THE_ROUTER_SETTING] = 'on'
    expect(theProviderRouterIsOn()).toBe(true)
    await everyGoRowIsKeptOutBy(onTheRouter, now, undefined, `the setting on, a running run on ${THE_ROUTER}`)
  } finally {
    if (before === undefined) delete process.env[THE_ROUTER_SETTING]
    else process.env[THE_ROUTER_SETTING] = before
  }
})

it('A mark with no provider, on a running run, keeps Go out with the router on, whether its key is the-router or OPENCODE_API_KEY', async () => {
  const now = Date.now()
  for (const key of [THE_ROUTER, THE_VARIABLE]) {
    const run = await aMarkedRun({ state: 'running', key, provider: null, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
    await everyGoRowIsKeptOutBy(run, now, true, `a running run on ${key} with no provider`)
    t.api.deleteRecord(run, HUMAN)
  }
})

it('A mark kept only in extra, with a key name outside the three, on a running run, keeps Go out', async () => {
  const now = Date.now()
  const key = 'a-key-name-the-session-kind-does-not-declare'
  const run = await aMarkedRun({ state: 'running', key, inExtra: true, seenAt: new Date(now - 10 * MINUTE), resetsAt: new Date(now + 2 * HOUR) })
  expect(t.api.getRecord(run)?.data['waitingOnALimit'] ?? null, 'the mark was written to the field, not to extra').toBeNull()
  for (const routerIsOn of [true, false]) await everyGoRowIsKeptOutBy(run, now, routerIsOn, `the router ${routerIsOn ? 'on' : 'off'}`)
})
