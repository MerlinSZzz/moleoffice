// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE'S DOORS ASK WHAT THE GRANT CARRIES. Each door below was the person's alone. It now asks the one check
 * (`aRaiseCarriesIt` in lib/records.ts) after the person, so a secretary holding the person's grant presses it for them
 * where this office's list of what the grant carries says `may-press`, and an office that changed nothing behaves as
 * before: the secretary card keeps every one of these doors.
 *
 * THE TEN DOORS: the sandbox memory limit read and press; the start-at-login read and press; the shutdown; the mail
 * tool's read, install, take-back and disable; and the summonses the mail tool reads.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, and a worker are made-up agents, each holding the key the office answered. Every record here is
 * synthetic. This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * NOTHING REACHES THE MACHINE. `src/config/sandbox-memory-cap.mjs` is replaced by recording fakes, so no case can run
 * pkexec or systemctl. The start-at-login unit and the mail tool's unit and key are written into a scratch home, with a
 * stand-in systemctl and loginctl first on PATH that note each call, answer from a state file and start nothing. The
 * shutdown gets a stand-in way out, so the office that runs this test is never shut down.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary hears the door's old refusal, even with this office's row at may-press, and
 *      nothing changes;
 *   2. granted, no row: the raised secretary is refused in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through. A write's press row names the secretary and the grant, never the
 *      person, and a read writes no press row. The mail tool's install also names the secretary as the one who
 *      retired the old mail-tool agent.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of one door's guard, and that door's case 4 goes red.
 * Take the read skip out of `writeDownEveryPressUnderTheGrant`, and the four reads' case 4 goes red.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, buildTheFirstOfficeInAHook, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { operationNamed } from '../src/shared/ops.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'

const fake = vi.hoisted(() => ({
  read: vi.fn(async () => ({ held: 'off', bytes: null, says: 'a fake reading: off' })),
  press: vi.fn(async (_on: boolean) => ({
    outcome: 'cancelled',
    reason: 'Request dismissed',
    reading: null,
    says: 'The dialog was cancelled. Nothing was changed.',
  })),
}))

vi.mock('../src/config/sandbox-memory-cap.mjs', async (real) => ({
  ...(await real<typeof import('../src/config/sandbox-memory-cap.mjs')>()),
  readTheSandboxCap: fake.read,
  pressTheSandboxCap: fake.press,
}))

// This file's first office is built in a hook, so the setup below keeps its 60 s for what it sets up.
buildTheFirstOfficeInAHook()

const RAISED = 'machine-secretary'
const UNRAISED = 'plain-machine-secretary'
const WORKER = 'machine-worker'
const THE_OLD_TOOL = 'The old mail tool'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let grant = ''
let scratch = ''
let home = ''
let systemdState = ''
let systemdLog = ''
const shouted: string[] = []
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()

const PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const as = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

interface APressRow {
  id: string
  agent_id: string
  grant_id: string
  operation: string
  reason: string | null
}

function thePressRows(door?: string): APressRow[] {
  const sql =
    'SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person' +
    (door === undefined ? '' : ' WHERE operation = ?') +
    ' ORDER BY rowid'
  return (door === undefined ? t.client.sqlite.prepare(sql).all() : t.client.sqlite.prepare(sql).all(door)) as APressRow[]
}

interface AChangeRow {
  record_id: string
  actor_type: string
  actor_id: string
  elevation: string | null
}

function theChangeRowsAfter(rowid: number): AChangeRow[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(rowid) as AChangeRow[]
}

function theLastChangeRow(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** Every call the stand-in systemd and loginctl were asked, as the program and its arguments. */
function calls(from = 0): string[][] {
  if (!existsSync(systemdLog)) return []
  return readFileSync(systemdLog, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as string[])
    .slice(from)
}

function theUnitPath(): string {
  return join(home, '.config', 'systemd', 'user', 'mole-office.service')
}

function theMailToolUnitPath(): string {
  return join(home, '.config', 'systemd', 'user', 'mole-office-mail-the-summonses.service')
}

function theMailToolKeyPath(): string {
  return join(home, '.local', 'state', 'mole-office', 'mail-the-summonses', 'key')
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function theOldToolRow(): { retired: number; retired_by_kind: string | null; retired_by_id: string | null } | undefined {
  return t.client.sqlite
    .prepare("SELECT retired, retired_by_kind, retired_by_id FROM agents WHERE handle = 'mail-tool'")
    .get() as { retired: number; retired_by_kind: string | null; retired_by_id: string | null } | undefined
}

function theToolKeys(): string {
  return JSON.stringify(
    t.client.sqlite
      .prepare("SELECT id, revoked_at FROM held_keys WHERE whose_kind = 'person-tool' AND whose_id = 'mail-tool' ORDER BY id")
      .all(),
  )
}

interface APress {
  method: 'GET' | 'POST'
  url: string
  body: Record<string, unknown>
  /** What the door would change if it ran, read before and after a refusal. */
  state: () => string | Promise<string>
  /** Whether a press that goes through changes what `state` reads. */
  changes: boolean
  /** What only a carried press writes, checked after case 4. */
  carried?: () => void | Promise<void>
}

interface ADoor {
  door: string
  /** The door's refusal before it asked the check, which a caller with no grant still hears. */
  oldWords: string
  make: () => Promise<APress>
}

async function refusedAndNothingChanged(press: APress, who: string, words: string): Promise<string> {
  const before = await press.state()
  const mark = theLastChangeRow()
  const pressesBefore = thePressRows().length
  const refused = await call(
    press.method,
    press.url,
    as(who),
    press.method === 'POST' ? { ...press.body, ...FOR_THE_PERSON } : undefined,
  )
  expect(refused.status, `${press.method} ${press.url}: ${refused.raw}`).toBe(403)
  expect(refused.error).toContain(words)
  expect(await press.state(), 'a refused press changed something').toBe(before)
  expect(theChangeRowsAfter(mark), 'a refused press wrote a change row').toEqual([])
  expect(thePressRows().length, 'a refused press wrote a press row').toBe(pressesBefore)
  return refused.error
}

function theFourCases(one: ADoor): void {
  describe(one.door, () => {
    let press: APress
    beforeAll(async () => {
      press = await one.make()
    })

    it('1: with no grant, even with the row at may-press, refuses in its old words and changes nothing', async () => {
      answer(one.door, 'may-press')
      await refusedAndNothingChanged(press, UNRAISED, one.oldWords)
    })

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      await refusedAndNothingChanged(press, RAISED, `The secretary card keeps ${one.door} for the person`)
    })

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(press, RAISED, `keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })

    it('4: with the row at may-press, goes through, and a write’s press row names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      const before = await press.state()
      const mark = theLastChangeRow()
      const pressesBefore = thePressRows().length
      const done = await call(
        press.method,
        press.url,
        as(RAISED),
        press.method === 'POST' ? { ...press.body, ...FOR_THE_PERSON } : undefined,
      )
      expect(done.status, `${one.door}: ${done.raw}`).toBeLessThan(300)
      if (press.changes) expect(await press.state(), 'the press changed nothing').not.toBe(before)
      const newPresses = thePressRows().slice(pressesBefore)
      if (operationNamed(one.door)?.effect === 'read') {
        expect(newPresses, `a read wrote a press row: ${JSON.stringify(newPresses)}`).toEqual([])
      } else {
        expect(newPresses, `no press row names the grant: ${JSON.stringify(newPresses)}`).toHaveLength(1)
        expect(newPresses[0]).toMatchObject({
          agent_id: RAISED,
          grant_id: grant,
          operation: one.door,
          reason: 'A test presses this for the person.',
        })
        expect(newPresses[0]!.agent_id, 'the press row names the person').not.toBe(THE_PERSON)
      }
      const rows = theChangeRowsAfter(mark)
      expect(rows.filter((row) => row.actor_type === 'human' || row.actor_id === THE_PERSON), 'a change row names the person as the one who did it').toEqual([])
      if (press.carried !== undefined) await press.carried()
    })
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MAIL_TOOL_DIR
  scratch = mkdtempSync(join(tmpdir(), 'machine-doors-test-'))
  home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  systemdState = join(scratch, 'systemd.json')
  systemdLog = join(scratch, 'calls.log')
  writeFileSync(systemdState, JSON.stringify({ down: false, active: false, enabled: false, linger: 'no' }))
  // THE STAND-IN systemctl AND loginctl, first on PATH: each notes its call, answers from the state file, and starts
  // nothing.
  const bin = join(scratch, 'bin')
  mkdirSync(bin)
  const head = (name: string) => `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(systemdLog)}, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n')
const state = JSON.parse(fs.readFileSync(${JSON.stringify(systemdState)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(systemdState)}, JSON.stringify(state))
`
  writeFileSync(
    join(bin, 'systemctl'),
    `${head('systemctl')}
if (args[0] !== '--user') { process.stderr.write('not as the person\\n'); process.exit(1) }
if (state.down) { process.stderr.write('Failed to connect to bus: No medium found\\n'); process.exit(1) }
const verb = args[1]
if (verb === 'show-environment') { process.stdout.write('HOME=${home}\\n'); process.exit(0) }
if (verb === 'daemon-reload') process.exit(0)
if (verb === 'is-active') { process.stdout.write(state.active ? 'active\\n' : 'inactive\\n'); process.exit(state.active ? 0 : 3) }
if (verb === 'is-enabled') { process.stdout.write(state.enabled ? 'enabled\\n' : 'disabled\\n'); process.exit(state.enabled ? 0 : 1) }
if (verb === 'enable' && args[2] === '--now') { state.active = true; state.enabled = true; save(); process.exit(0) }
if (verb === 'enable' && args.length === 3) { state.enabled = true; save(); process.exit(0) }
if (verb === 'disable' && args[2] === '--now') { state.active = false; state.enabled = false; save(); process.exit(0) }
if (verb === 'disable' && args.length === 3) { state.enabled = false; save(); process.exit(0) }
if (verb === 'restart') { state.active = true; save(); process.exit(0) }
if (verb === 'stop') { state.active = false; save(); process.exit(0) }
process.stderr.write('The stand-in does not take: ' + args.join(' ') + '\\n'); process.exit(1)
`,
  )
  writeFileSync(
    join(bin, 'loginctl'),
    `${head('loginctl')}
if (args[0] !== 'show-user' || args[2] !== '--property=Linger' || args[3] !== '--value') { process.stderr.write('not this\\n'); process.exit(1) }
process.stdout.write(state.linger + '\\n'); process.exit(0)
`,
  )
  chmodSync(join(bin, 'systemctl'), 0o755)
  chmodSync(join(bin, 'loginctl'), 0o755)
  process.env.HOME = home
  process.env.PATH = `${bin}:${String(process.env.PATH)}`
  process.env.XDG_CONFIG_HOME = join(home, '.config')
  process.env.XDG_STATE_HOME = join(home, '.local', 'state')

  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  const pausing = await import('../src/server/lib/pausing.ts')
  pausing.thisServerShutsDownWith({
    stopTheWorker: async () => 'The stand-in message worker stopped.',
    shutDown: (because: string) => {
      shouted.push(because)
    },
  })
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))

  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grant = String(raised.body.elevation?.id ?? '')
  expect(grant).not.toBe('')
  // THE OLD MAIL-TOOL AGENT, made while the mailer card is put back for the registration alone, as an office that
  // registered one before the card left holds it.
  const { withTheMailerCardBack } = await import('./the-mailer-card-that-left.ts')
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const oldTool = await withTheMailerCardBack(theRoleCards(), () =>
    call('POST', '/api/agents/started', PERSON, { handle: 'mail-tool', name: THE_OLD_TOOL, role: 'mailer' }),
  )
  expect(oldTool.status, oldTool.raw).toBe(201)
  // A WHOLE APP IS BUILT HERE, which takes more than the ten-second default on a busy machine.
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
  fake.read.mockClear()
  fake.press.mockClear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe("the machine's doors ask what the grant carries", () => {
  theFourCases({
    door: 'office.sandbox-memory-cap',
    oldWords: "Only the person may set the memory limit of the sandboxes, or a secretary holding the person's grant where this office's list of what the grant carries says so. Any other agent is refused.",
    make: async () => ({
      method: 'GET',
      url: '/api/office/sandbox-memory-cap',
      body: {},
      state: () => String(fake.read.mock.calls.length),
      changes: false,
    }),
  })

  theFourCases({
    door: 'office.set-sandbox-memory-cap',
    oldWords: "Only the person may set the memory limit of the sandboxes, or a secretary holding the person's grant where this office's list of what the grant carries says so. Any other agent is refused.",
    make: async () => ({
      method: 'POST',
      url: '/api/office/sandbox-memory-cap',
      body: { on: true },
      state: () => String(fake.press.mock.calls.length),
      changes: true,
      carried: async () => {
        expect(fake.press.mock.calls).toEqual([[true]])
      },
    }),
  })

  theFourCases({
    door: 'office.start-at-login',
    oldWords: "Only the person may say whether the office starts at login, or a secretary holding the person's grant where this office's list of what the grant carries says so. Any other agent is refused.",
    make: async () => ({
      method: 'GET',
      url: '/api/office/start-at-login',
      body: {},
      state: () => String(calls().length),
      changes: false,
    }),
  })

  theFourCases({
    door: 'office.set-start-at-login',
    oldWords: "Only the person may say whether the office starts at login, or a secretary holding the person's grant where this office's list of what the grant carries says so. Any other agent is refused.",
    make: async () => ({
      method: 'POST',
      url: '/api/office/start-at-login',
      body: { on: true },
      state: () => JSON.stringify({ unit: readOrNull(theUnitPath()), calls: calls().length }),
      changes: true,
      carried: () => {
        expect(readOrNull(theUnitPath())).toContain('mole-office')
      },
    }),
  })

  theFourCases({
    door: 'office.shut-down',
    oldWords: "Only the owner may shut the office down, or a secretary holding the owner's grant where this office's list of what the grant carries says so. Any other agent is refused.",
    make: async () => ({
      method: 'POST',
      url: '/api/office/shut-down',
      body: { seen: [] },
      state: () => JSON.stringify({ shouted: shouted.length }),
      changes: true,
      carried: () => {
        expect(shouted[shouted.length - 1]).toContain(RAISED)
        expect(shouted[shouted.length - 1]).not.toContain(THE_PERSON)
      },
    }),
  })

  theFourCases({
    door: 'office.mail-tool',
    oldWords: "Reading the state of the mail tool on this computer and the address of its page is the owner's own act",
    make: async () => ({
      method: 'GET',
      url: '/api/office/mail-tool',
      body: {},
      state: () => String(calls().length),
      changes: false,
    }),
  })

  theFourCases({
    door: 'office.install-mail-tool',
    oldWords: "Giving the owner's mail tool its key and installing it as a service of the owner's login is the owner's own act",
    make: async () => ({
      method: 'POST',
      url: '/api/office/mail-tool/install',
      body: {},
      state: () => JSON.stringify({ unit: readOrNull(theMailToolUnitPath()), key: readOrNull(theMailToolKeyPath()), agent: theOldToolRow() }),
      changes: true,
      carried: () => {
        expect(readOrNull(theMailToolKeyPath())).not.toBeNull()
        expect(readOrNull(theMailToolUnitPath())).toContain('mail-the-summonses')
        expect(theOldToolRow()).toMatchObject({ retired: 1, retired_by_kind: 'agent', retired_by_id: RAISED })
        expect(theOldToolRow()?.retired_by_id).not.toBe(THE_PERSON)
      },
    }),
  })

  theFourCases({
    door: 'office.take-back-mail-tool-key',
    oldWords: 'Taking back the owner’s mail tool key is the owner\'s own act',
    make: async () => ({
      method: 'POST',
      url: '/api/office/mail-tool/take-back-key',
      body: {},
      state: theToolKeys,
      changes: true,
      carried: () => {
        expect(theToolKeys()).not.toContain('"revoked_at":null')
      },
    }),
  })

  theFourCases({
    door: 'office.disable-mail-tool',
    oldWords: "Turning the owner's mail tool off without uninstalling it is the owner's own act",
    make: async () => ({
      method: 'POST',
      url: '/api/office/mail-tool/disable',
      body: {},
      state: () =>
        JSON.stringify({
          unit: readOrNull(theMailToolUnitPath()),
          systemd: JSON.parse(readFileSync(systemdState, 'utf8')) as Record<string, unknown>,
        }),
      changes: true,
      carried: () => {
        expect((JSON.parse(readFileSync(systemdState, 'utf8')) as { enabled: boolean }).enabled).toBe(false)
      },
    }),
  })

  theFourCases({
    door: 'office.read-summonses',
    oldWords: "The summonses are read with the mail tool's own key, or by the person",
    make: async () => ({
      method: 'GET',
      url: '/api/office/summonses',
      body: {},
      state: () => String(thePressRows('office.read-summonses').length),
      changes: false,
    }),
  })
})
