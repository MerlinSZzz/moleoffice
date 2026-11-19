// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY RELEASE NEEDS THE SWITCH AND THE MESSAGE. A test office made for this file: its owner, agents, notes,
 * messages, receipts and git repository are made up here, and the serving identities given to the library calls are
 * synthetic callbacks for a process that is not running.
 *
 * OLD: the notice door took an upgrade BEFORE only with an authored original green receipt for the announced commit and
 * tree, and the history read notice versions 1 and 2.
 * NEW: notice version 4 is an emergency release. The door takes its BEFORE without a receipt only when the owner threw
 * the emergency switch to 1 with an end time at most 120 minutes away, after the newest completed release, and a holder
 * of the secretary card told the owner alone in chat, naming the full target commit, after that release's AFTER. One
 * throw and one message serve one BEFORE. A release that went in owes a follow-up receipt and a report, both worked out
 * when the history is read; while one is owed, a new emergency release is refused. The way back to an emergency release
 * names its green follow-up receipt, and the door takes it only for that case, with the line that says so.
 * WHY: a fix on main goes into the stable version first while the office is broken, and the whole
 * suite tests it afterwards. The door is the second place that checks it, so a release tool that skipped
 * its own check still cannot publish an emergency release.
 *
 * OLD (wave 13q item 1g): the cases ran on the real clock in the machine's zone. Run at 00:19 summer time on 25 October
 * 2026, the throw's 125-minute end time fell in the hour the clocks go back. The switch case then got the refusal that
 * the time is not one moment, stopped before it kept its throw, and the next two cases sent no throw and got the shape
 * refusal.
 * NEW: the cases run on a fixed clock in Europe/London, at noon summer time on 24 October 2026, and never read the real
 * time. Cases on the two nights the clocks change follow: on 25 October 2026 a switch thrown in either pass of the
 * repeated hour, or with its end time typed inside it, gets the refusal that the time is not one moment; the length of
 * a throw is read in real minutes on both nights; and a switch thrown after the hour, or across the skipped hour of 28
 * March 2027, is let in.
 * WHY: a test that reads the real time passes or fails by the hour it is run at. The refusal in the repeated hour stands
 * until the owner decides whether the switch's two times are kept as instants.
 *
 * CASE PROOF MAP — each case has a control, a mutation, the assertion that goes red, and the restore.
 * - the gate row: control a secretary's change of a number nobody decided; drop the setting from the owner-decided list;
 *   the secretary's throw saves and goes red.
 * - shape: control the strict version 4 request; let `kind: "emergency"` carry `evidence`; the shape case goes red.
 * - switch: control the valid throw; remove one switch check from the door's call of the shared rule; its row goes red.
 * - message: control the valid message; remove one message check from the door's facts; its row goes red.
 * - spent and pinned twice: control a second attempt; stop reading earlier BEFOREs' pins; both refusals go red.
 * - owing: control the filed follow-up and report; treat `missing` as filed; the owing refusals go red.
 * - not owed: control a failed-restored and a refused attempt; count them as owing; the later BEFOREs go red.
 * - follow-up on read: control the side-branch receipt; drop the refs/heads/main check; that receipt counts and goes red.
 * - could not be checked: control a receipt whose repository is gone; read git's failure as "no"; the unknown row goes red.
 * - the way back: control the standing line; drop its check; the way back without the line is taken and goes red.
 * - the repeated hour: control the throw after the hour; read the throw time as its earlier moment in the door; the
 *   throws in the hour go red.
 * - real minutes: control the throw across the skipped hour; count the length on the wall clock; both nights go red.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { STABLE_UPGRADE_PUBLIC_REASONS, stableUpgradeHistoryPageSchema } from '../src/shared/stable-upgrade-notices.ts'
import { STABLE_EMERGENCY_NOT_ONE_MOMENT, STABLE_EMERGENCY_TOO_LONG } from '../src/shared/stable-emergency.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
import { moleOffice } from '../src/shared/participants.ts'
import type { Actor } from '../src/server/lib/records.ts'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone, so the two nights below are the nights its
// clocks change. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})
/** Noon summer time on 24 October 2026, an ordinary day: the clock every case before the two nights stands at. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

type ObjectValue = Record<string, any>
type Pin = { id: string; seq: 1; contentHash: string }
type Throw = { change: string; appendOrder: number }
let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/stable-upgrade-notices.ts')
let commit: string
let repository: string
let folder: string
let git: string
let number = 0
let because = 0
const commits: Record<'R' | 'A' | 'B' | 'C' | 'D', string> = { R: '', A: '', B: '', C: '', D: '' }
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
const personKey = randomBytes(32).toString('hex')
const owner = THE_TEST_OFFICES_OWNER.id
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const SETTING = 'MOLE_OFFICE_STABLE_EMERGENCY'
const LINE = (message: string) => `Emergency release: no complete test receipt was read for this version. Message ${message} told the owner.`
const OWES = (tag: string, what: string) => `The emergency release ${tag} still owes ${what}. No second emergency release goes in while an earlier one owes either.`
const ownerHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': owner, 'x-mole-office-key': personKey }
function headers(who = 'controller') {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ids.get(who)!, 'x-mole-office-key': keys.get(who)!, 'x-mole-office-session': runs.get(who)! }
}
function actor(who = 'controller'): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(who)! }
}
async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, as: Record<string, string> = headers()) {
  return app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as object }) })
}
function reference(id: string, seq = 1): Pin {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq: seq as 1, contentHash: r.content_hash }
}
function totalWrites() { return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as { n: number }).n }
function inTheRepository(...args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  return execFileSync('git', ['-C', git, '-c', 'user.name=Synthetic writer', '-c', 'user.email=synthetic@example.invalid', ...args],
    { env: { ...env, HOME: folder, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', timeout: 30_000 }).trim()
}
const treeOf = (sha: string) => inTheRepository('rev-parse', `${sha}^{tree}`)

/**
 * The owner throws the switch on the settings door, as the Gates page does. `ends` is the end time that many minutes
 * after the test's clock, or the end time as the owner typed it.
 */
async function throwTheSwitch(value: '0' | '1', ends: number | string | null) {
  const until = ends === null ? {} : { until: typeof ends === 'string' ? ends : localStamp(new Date(Date.now() + ends * 60_000)).slice(0, 16) }
  const saved = await ask('POST', '/api/office/settings', { changes: [{ name: SETTING, value, ...until }], because: `Made-up emergency throw ${++because}.` }, ownerHeaders)
  expect(saved.statusCode, saved.body).toBe(200)
  const { pin } = await theSwitch()
  // The reading names the throw by the change row that wrote it and the order the office wrote that row in.
  expect(typeof pin.change, 'the throw has a change id').toBe('string')
  expect(Number.isInteger(pin.appendOrder), 'the throw has an append order').toBe(true)
  return pin
}
async function theSwitch() {
  const reply = await ask('GET', '/api/office/gates', undefined, ownerHeaders)
  expect(reply.statusCode, reply.body).toBe(200)
  const rows = (reply.json() as { classes: { groups: { rows: ObjectValue[] }[] }[] }).classes.flatMap(one => one.groups.flatMap(group => group.rows))
  const row = rows.find(one => one.id === 'stable-emergency')
  expect(row, 'the gate list has the emergency switch').toBeDefined()
  return { row: row!, pin: { change: row!.lastChange?.id, appendOrder: row!.lastChange?.appendOrder } as Throw }
}
/** A chat message, written as any agent writes one. */
function tellTheOwner(body: string, who = 'secretary', to: ObjectValue[] = [{ kind: 'person', id: owner }]) {
  return reference(t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic emergency message', data: { body, to }, actor: actor(who) }).id)
}
const aFix = (sha: string) => `The office is broken. Synthetic fix ${sha} goes in now.`

/** An emergency announcement and the secretary's note that authorizes it, pinning the same throw and message. */
function anEmergency(pins: { throw: Throw; message: Pin }, toCommit: string, options: { fromCommit?: string; noteMessage?: Pin; mode?: string } = {}) {
  const n = ++number
  const fromCommit = options.fromCommit ?? 'a'.repeat(40)
  const notice = `Synthetic emergency notice ${n}.`
  const release = { candidateTag: `stable-2026-10-24-emergency-${n}`, baselineTag: `fixture-baseline-${n}`, fromCommit, toCommit, tree: treeOf(toCommit) }
  const mode = options.mode ?? 'emergency'
  const authorization = { version: 1, mode, reason: 'Made-up emergency release.', timeZone: zone, ...release,
    ...(mode === 'emergency' ? { message: options.noteMessage ?? pins.message } : { evidence: { id: 'synthetic-receipt', seq: 1, contentHash: '0'.repeat(16) } }),
    serving: { commit: fromCommit, repository, database: t.file, port: 12345 },
    validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
    baselineSource: { kind: 'bootstrap', note: { id: 'synthetic-baseline-note', seq: 1, contentHash: '0'.repeat(16) } } }
  const note = t.api.createRecord({ kind: 'note', title: `Synthetic emergency approval ${n}`, workspaceId: 'default',
    data: { body: notice, extra: { stableReleaseAuthorization: authorization } }, actor: actor('secretary') })
  return { ...release, notice, noticeApproval: reference(note.id), emergency: pins }
}
type Announced = ReturnType<typeof anEmergency>
const beforeRequest = (a: Announced) => ({ kind: 'emergency', stage: 'before', sendId: `emergency-before-${a.candidateTag}`, announcement: a })
/** The library call with a synthetic identity: the serving process this release replaces is made up. */
function fileBefore(a: Announced) {
  return lib.fileStableUpgradeNotice('default', beforeRequest(a) as never, actor(), () => ({ commit: a.fromCommit, repository, database: t.file, port: 12345 }))
}
function refusedBefore(a: Announced, words: string | RegExp) {
  const writes = totalWrites()
  expect(() => fileBefore(a)).toThrow(words)
  expect(totalWrites()).toBe(writes)
}
function serving(sha: string) { return { commit: sha, repository, database: t.file, port: 12346 } }
function fileAfter(a: Announced, before: Pin, outcome: ObjectValue, identity = serving(a.toCommit)) {
  return lib.fileStableUpgradeNotice('default', { kind: 'emergency', stage: 'after', sendId: `emergency-after-${a.candidateTag}`, before, outcome } as never, actor(), () => identity)
}
const completed = (sha: string) => ({ state: 'completed', verification: { result: 'completed', serving: serving(sha) } })
function aReceipt(sha: string, green: boolean, where = git) {
  const data = { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: where, commit: sha, tree: where === git ? treeOf(sha) : WHOLE_SUITE_RECEIPT_EXAMPLE.tree,
    ...(green ? {} : { suiteExitCode: 1, failedFiles: ['tests/synthetic.test.ts'], failedTests: [{ file: 'tests/synthetic.test.ts', name: 'Synthetic failing test' }] }) }
  return reference(t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic receipt for ${sha.slice(0, 7)}`, workspaceId: 'default', data, actor: actor() }).id)
}
function aReportAbout(before: Pin) {
  const id = t.api.createRecord({ kind: 'report', title: 'Synthetic follow-up report', workspaceId: 'default', data: { blocks: [] }, actor: actor() }).id
  t.api.createLink({ fromId: id, toId: before.id, type: 'about', actor: actor() })
  return id
}
async function historyRow(before: Pin) {
  const reply = await ask('GET', '/api/office/upgrades?limit=25')
  expect(reply.statusCode, reply.body).toBe(200)
  const row = stableUpgradeHistoryPageSchema.parse(reply.json()).entries.find(one => one.before.id === before.id) as ObjectValue | undefined
  expect(row, 'the history has the release').toBeDefined()
  return row!
}

beforeAll(async () => {
  // A frozen clock: only the cases move it.
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON })
  folder = mkdtempSync(join(tmpdir(), 'emergency-release-'))
  git = join(folder, 'repository')
  mkdirSync(git)
  inTheRepository('init', '-q', '-b', 'main')
  const step = (name: keyof typeof commits) => {
    writeFileSync(join(git, 'step.txt'), `Synthetic step ${name}.\n`)
    inTheRepository('add', 'step.txt')
    inTheRepository('commit', '-q', '-m', `Synthetic step ${name}`)
    commits[name] = inTheRepository('rev-parse', 'HEAD')
  }
  // main: R, A, B, D. The side branch C starts at A and is never on main.
  step('R'); step('A')
  inTheRepository('switch', '-q', '-c', 'side'); step('C'); inTheRepository('switch', '-q', 'main')
  step('B'); step('D')
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  ;({ commit, repository } = settings.theServingInstall())
  const webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const who of ['controller', 'secretary', 'stranger']) {
    const made = await ask('POST', '/api/agents/started', { handle: `emergency-${who}`, name: `Synthetic ${who}`, role: who === 'secretary' ? 'secretary' : 'worker' }, ownerHeaders)
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
    runs.set(who, t.api.createRecord({ workspaceId: 'default', kind: 'session', title: `Synthetic ${who} run`, data: { state: 'running', servingAgent: data.agent.id }, actor: t.api.HUMAN }).id)
  }
  lib = await import('../src/server/lib/stable-upgrade-notices.ts')
})
afterAll(async () => {
  vi.restoreAllMocks(); await app?.close(); t?.close(); if (folder) rmSync(folder, { recursive: true, force: true })
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

// The switch is a gate row of its own, at 0 in both columns, counted by the
// release tool, and only the owner's words move it. Nobody has thrown it yet, so its reading has no last change.
it('keeps the emergency switch at 0 in both columns, counted by the release tool, and refuses a secretary\'s throw without the owner\'s words', async () => {
  const { GATES } = await import('../src/config/gates.mjs')
  expect(GATES.find(one => one.id === 'stable-emergency')).toEqual({ id: 'stable-emergency', class: 'quality', group: 'the-stable-version',
    setting: SETTING, positions: { kind: 'switch' }, whoMayChange: 'the-person-or-a-secretary', defaults: { buildsMoleOffice: '0', ordinary: '0' },
    countedBy: 'the-release-tool', looksAgain: null })
  const { DECIDED_SETTING_NAMES } = await import('../src/config/runtime-settings.mjs')
  expect(DECIDED_SETTING_NAMES).toContain(SETTING)
  // The control: the same secretary may change a number nobody decided.
  const until = localStamp(new Date(Date.now() + 30 * 60_000)).slice(0, 16)
  const control = await ask('POST', '/api/office/settings', { changes: [{ name: 'MOLE_OFFICE_CHECKS_AN_HOUR', value: '3' }], because: 'Made-up control change.' }, headers('secretary'))
  expect(control.statusCode, control.body).toBe(200)
  const refused = await ask('POST', '/api/office/settings', { changes: [{ name: SETTING, value: '1', until }], because: 'Made-up secretary throw.' }, headers('secretary'))
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json().error).toBe('These exact values need the owner’s words. A raise alone is not enough. Nothing was changed.')
  expect((await theSwitch()).row).toMatchObject({ value: '0', chosen: null, ownerDecided: true, lastChange: null })
})

// The cases share one office, in this order: each later case needs what the earlier ones filed.
describe('the notice door and an emergency release', () => {
  const state: ObjectValue = {}

  it('still refuses a version 1 BEFORE without a receipt, and takes version 4 only in its own strict shape', async () => {
    const a = anEmergency({ throw: { change: 'synthetic-change', appendOrder: 1 }, message: tellTheOwner(aFix(commits.A)) }, commits.A, { fromCommit: commit })
    const ordinary: ObjectValue = { ...a }
    delete ordinary.emergency
    const writes = totalWrites()
    for (const payload of [
      { stage: 'before', sendId: 'no-receipt', announcement: ordinary },
      { stage: 'before', sendId: 'version-1-with-pins', announcement: a },
      { kind: 'emergency', stage: 'before', sendId: 'with-a-receipt', announcement: { ...a, evidence: { id: 'synthetic-receipt', seq: 1, contentHash: '0'.repeat(16) } } },
      { kind: 'emergency', stage: 'before', sendId: 'without-pins', announcement: ordinary },
    ]) {
      const reply = await ask('POST', '/api/office/upgrades/notice', payload)
      expect(reply.statusCode, `${payload.sendId}: ${reply.body}`).toBe(400)
    }
    expect(totalWrites()).toBe(writes)
  })

  it('refuses each switch that cannot let a release in, and names why', async () => {
    const message = tellTheOwner(aFix(commits.A))
    // Nobody has thrown it: the switch is at its default, 0.
    const atZero = await ask('POST', '/api/office/upgrades/notice', beforeRequest(anEmergency({ throw: { change: 'synthetic-change', appendOrder: 1 }, message }, commits.A, { fromCommit: commit })))
    expect(atZero.statusCode, atZero.body).toBe(409)
    expect(atZero.json().error).toContain('The emergency switch is at 0.')
    refusedBefore(anEmergency({ throw: await throwTheSwitch('0', null), message }, commits.A), 'The emergency switch is at 0.')
    refusedBefore(anEmergency({ throw: await throwTheSwitch('1', null), message }, commits.A), 'The emergency switch has no end time.')
    refusedBefore(anEmergency({ throw: await throwTheSwitch('1', 125), message }, commits.A), 'The emergency switch ends more than 120 minutes after it was thrown.')
    // Its end time comes. Before the office's sweep and after it, the switch has run out.
    const ending = await throwTheSwitch('1', 60)
    t.client.sqlite.prepare('UPDATE runtime_settings SET until = ? WHERE name = ?').run(localStamp(new Date(Date.now() - 60_000)), SETTING)
    refusedBefore(anEmergency({ throw: ending, message }, commits.A), 'The emergency switch has run out.')
    const { runOutGateChoices } = await import('../src/server/api/runtime-settings.ts')
    expect(runOutGateChoices().ranOut.map(one => one.setting)).toEqual([SETTING])
    refusedBefore(anEmergency({ throw: (await theSwitch()).pin, message }, commits.A), 'The emergency switch has run out.')
    // A choice the settings door did not write has no recorded throw.
    t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value, until) VALUES (?, ?, ?)').run(SETTING, '1', localStamp(new Date(Date.now() + 60 * 60_000)))
    refusedBefore(anEmergency({ throw: (await theSwitch()).pin, message }, commits.A), 'The office has no recorded throw of the emergency switch to 1 with this end time.')
    // A release names a throw, and the owner throws the switch again: that release's throw is not the latest.
    const earlier = await throwTheSwitch('1', 60)
    state.throw = await throwTheSwitch('1', 61)
    refusedBefore(anEmergency({ throw: earlier, message }, commits.A), "The throw this release names is not the emergency switch's latest throw.")
  })

  it('refuses each message that does not tell the owner the commit, and a note that does not authorize it', async () => {
    const pins = (message: Pin) => ({ throw: state.throw as Throw, message })
    refusedBefore(anEmergency(pins({ id: 'no-such-message', seq: 1, contentHash: '0'.repeat(16) }), commits.A), 'The emergency message is missing.')
    const deleted = tellTheOwner(aFix(commits.A))
    t.api.deleteRecord(deleted.id, actor('secretary'))
    refusedBefore(anEmergency(pins(deleted), commits.A), 'The emergency message is missing.')
    refusedBefore(anEmergency(pins(tellTheOwner(aFix(commits.A), 'controller')), commits.A), 'The emergency message was not written by an agent holding the secretary card.')
    for (const to of [[{ kind: 'person', id: owner }, { kind: 'agent', id: ids.get('stranger') }], [{ kind: 'agent', id: ids.get('stranger') }]]) {
      refusedBefore(anEmergency(pins(tellTheOwner(aFix(commits.A), 'secretary', to)), commits.A), 'The emergency message is not addressed to the owner alone.')
    }
    for (const named of [commits.A.slice(0, 39), `${commits.A}0`]) {
      refusedBefore(anEmergency(pins(tellTheOwner(aFix(named))), commits.A), 'The emergency message does not name the full 40-character target commit.')
    }
    const message = tellTheOwner(aFix(commits.A))
    for (const options of [{ mode: 'urgent-fix' }, { noteMessage: tellTheOwner(aFix(commits.A)) }]) {
      refusedBefore(anEmergency(pins(message), commits.A, options), 'The pinned note does not authorize this emergency release with this message.')
    }
    // Written now, before the first emergency release completes; a later case pins it.
    state.early = tellTheOwner(aFix(commits.B))
  })

  it('takes a version 4 BEFORE with valid pins, and one throw and one message serve one BEFORE', async () => {
    const message = tellTheOwner(aFix(commits.A))
    const a = anEmergency({ throw: state.throw, message }, commits.A, { fromCommit: commit })
    const reply = await ask('POST', '/api/office/upgrades/notice', beforeRequest(a))
    expect(reply.statusCode, reply.body).toBe(201)
    const result = reply.json() as ObjectValue
    expect(result.event).toMatchObject({ version: 4, project: 'default', request: { kind: 'emergency', stage: 'before', announcement: a } })
    expect(result.content.data).toMatchObject({ body: `${LINE(message.id)}\n\n${a.notice}`, sentBy: moleOffice(), to: [{ kind: 'person', id: owner }] })
    expect(await historyRow(result.original)).toMatchObject({ kind: 'emergency', tag: a.candidateTag, outcome: 'unfinished', after: null,
      emergency: { throw: state.throw, message, followUp: { state: 'missing' }, report: { state: 'missing' } } })
    state.first = { a, before: result.original as Pin }
    refusedBefore(anEmergency({ throw: state.throw, message: tellTheOwner(aFix(commits.A)) }, commits.A), 'An earlier release already used this throw of the emergency switch.')
    refusedBefore(anEmergency({ throw: await throwTheSwitch('1', 62), message }, commits.A), 'An earlier release already pinned this emergency message.')
  })

  it('takes only a version 4 AFTER on a version 4 BEFORE, and checks a completed one against the serving identity alone', async () => {
    const { a, before } = state.first as { a: Announced; before: Pin }
    const writes = totalWrites()
    expect(() => lib.fileStableUpgradeNotice('default', { stage: 'after', sendId: 'version-1-after', before,
      outcome: { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] } } as never, actor(), () => serving(a.toCommit)))
      .toThrow('AFTER must name the exact original BEFORE notice in this project.')
    expect(() => fileAfter(a, before, completed(commits.B), serving(commits.B))).toThrow(/^Completion does not match/)
    expect(() => fileAfter(a, before, completed(a.toCommit), serving(commits.B))).toThrow(/^Completion does not match/)
    expect(totalWrites()).toBe(writes)
    const after = fileAfter(a, before, completed(a.toCommit)) as ObjectValue
    expect(after.event).toMatchObject({ version: 4, request: { kind: 'emergency', stage: 'after' } })
    expect(after.content.data.body).toBe(`Upgrade completed and verified.\n\n${LINE(a.emergency.message.id)}\n\n${a.notice}\n\nRelease authorization: note ${a.noticeApproval.id}, version 1.`)
    expect(await historyRow(before)).toMatchObject({ outcome: 'completed', emergency: { followUp: { state: 'missing' }, report: { state: 'missing' } } })
  })

  it('refuses a throw or a message that came before the newest completed release', async () => {
    // The latest throw was made before the first emergency release completed.
    refusedBefore(anEmergency({ throw: (await theSwitch()).pin, message: tellTheOwner(aFix(commits.B)) }, commits.B), 'The emergency switch was thrown before the newest completed release.')
    state.throw = await throwTheSwitch('1', 63)
    refusedBefore(anEmergency({ throw: state.throw, message: state.early }, commits.B), 'The emergency message was written before the newest completed release.')
  })

  it('works the follow-up receipt and the report out on read, and refuses a new emergency while either is owed', async () => {
    const { a, before } = state.first as { a: Announced; before: Pin }
    const message = tellTheOwner(aFix(commits.B))
    const next = () => anEmergency({ throw: state.throw, message }, commits.B)
    refusedBefore(next(), OWES(a.candidateTag, 'its follow-up receipt and its report'))
    // A receipt on a branch that is not main contains the fix; one on main does not. Neither is the follow-up.
    aReceipt(commits.C, true)
    aReceipt(commits.R, true)
    expect((await historyRow(before)).emergency.followUp).toEqual({ state: 'missing' })
    const report = aReportAbout(before)
    expect((await historyRow(before)).emergency.report).toEqual({ state: 'filed', id: report })
    refusedBefore(next(), OWES(a.candidateTag, 'its follow-up receipt'))
    // A red receipt on main that contains the fix is the follow-up: the suite ran on it.
    const red = aReceipt(commits.B, false)
    expect((await historyRow(before)).emergency).toMatchObject({ followUp: { state: 'filed', receipt: red, commit: commits.B, green: false }, report: { state: 'filed', id: report } })
    state.redFollowUp = red
    const second = next()
    state.second = { a: second, before: (fileBefore(second) as ObjectValue).original as Pin }
  })

  it('counts a follow-up it could not check as owed, and owes nothing for a release that did not go in', async () => {
    const { a, before } = state.second as { a: Announced; before: Pin }
    aReceipt(commits.D, true, join(folder, 'no-such-repository'))
    const unknown = (await historyRow(before)).emergency.followUp
    expect(unknown).toMatchObject({ state: 'unknown' })
    expect(typeof unknown.because).toBe('string')
    state.throw = await throwTheSwitch('1', 64)
    refusedBefore(anEmergency({ throw: state.throw, message: tellTheOwner(aFix(commits.B)) }, commits.B),
      new RegExp(`still owes its follow-up receipt and its report\\. Its follow-up receipt could not be checked, so it counts as owed: .+ No second emergency release`))
    fileAfter(a, before, { state: 'failed-restored', reason: STABLE_UPGRADE_PUBLIC_REASONS[1] })
    expect((await historyRow(before)).emergency).toMatchObject({ followUp: { state: 'not-owed' }, report: { state: 'not-owed' } })
    const third = anEmergency({ throw: state.throw, message: tellTheOwner(aFix(commits.B)) }, commits.B)
    const thirdBefore = (fileBefore(third) as ObjectValue).original as Pin
    fileAfter(third, thirdBefore, { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] })
    expect((await historyRow(thirdBefore)).emergency).toMatchObject({ followUp: { state: 'not-owed' }, report: { state: 'not-owed' } })
    state.throw = await throwTheSwitch('1', 65)
    const fourth = anEmergency({ throw: state.throw, message: tellTheOwner(aFix(commits.B)) }, commits.B)
    const fourthBefore = (fileBefore(fourth) as ObjectValue).original as Pin
    fileAfter(fourth, fourthBefore, completed(commits.B))
    const green = aReceipt(commits.D, true)
    expect((await historyRow(fourthBefore)).emergency).toMatchObject({ followUp: { state: 'filed', receipt: green, commit: commits.D, green: true }, report: { state: 'missing' } })
    state.throw = await throwTheSwitch('1', 66)
    refusedBefore(anEmergency({ throw: state.throw, message: tellTheOwner(aFix(commits.D)) }, commits.D), OWES(fourth.candidateTag, 'its report'))
    state.fourth = { a: fourth, green }
  })

  it('takes the way back to an emergency release on its green follow-up receipt, with the line that says so, and only then', async () => {
    const { a: fourth, green } = state.fourth as { a: Announced; green: Pin }
    const { a: first } = state.first as { a: Announced }
    const standing = (tag: string, receipt: Pin, sha: string) =>
      `The emergency release ${tag} has no receipt of its own. Its follow-up receipt ${receipt.id}, on later commit ${sha}, stands for it.`
    const back = (to: Announced, evidence: Pin, notice: string, candidateTag = to.candidateTag) => {
      const n = ++number
      const note = t.api.createRecord({ kind: 'note', title: `Synthetic way-back approval ${n}`, workspaceId: 'default', data: { body: notice }, actor: actor('secretary') })
      return { candidateTag, baselineTag: `fixture-later-${n}`, fromCommit: 'e'.repeat(40), toCommit: to.toCommit, tree: to.tree, evidence, notice, noticeApproval: reference(note.id) }
    }
    const file = (announcement: ObjectValue) => lib.fileStableUpgradeNotice('default', { stage: 'before', sendId: `way-back-${number}`, announcement } as never, actor(),
      () => ({ commit: announcement.fromCommit, repository, database: t.file, port: 12345 }))
    const refusedWords = 'The original receipt does not establish a green result for the announced commit and tree.'
    for (const announcement of [
      back(fourth, green, 'Synthetic way back without the line.'),
      back(first, state.redFollowUp, `${standing(first.candidateTag, state.redFollowUp, commits.B)} Synthetic way back.`),
      back(fourth, green, `${standing(fourth.candidateTag, green, commits.D)} Synthetic way back.`, 'stable-2026-10-24-not-the-way-back'),
    ]) {
      const writes = totalWrites()
      expect(() => file(announcement)).toThrow(refusedWords)
      expect(totalWrites()).toBe(writes)
    }
    const announcement = back(fourth, green, `${standing(fourth.candidateTag, green, commits.D)} Synthetic way back.`)
    const before = file(announcement) as ObjectValue
    expect(before.event).toMatchObject({ version: 1, request: { stage: 'before', announcement } })
    const after = lib.fileStableUpgradeNotice('default', { stage: 'after', sendId: `way-back-after-${number}`, before: before.original,
      outcome: { state: 'completed', verification: { result: 'completed', evidence: green, serving: serving(commits.B) } } } as never, actor(), () => serving(commits.B)) as ObjectValue
    expect(after.content.data.body).toBe(`Upgrade completed and verified.\n\n${announcement.notice}`)
  })
})

// THE TWO NIGHTS THE CLOCKS CHANGE, after the cases above and in time order. Both times of a throw are kept as wall
// stamps with no offset: the change row's time and the end time as the owner typed it. In the hour the clocks go back a
// stamp names two moments, and the rule refuses it rather than pick one. Each throw is judged by the door's own reading
// of the switch and the message, so no release is filed.
describe('the emergency switch on the nights the clocks change', () => {
  /** The throw the office wrote last, by the order it wrote its change rows in: the one a release names. */
  function theNewestThrow(): Throw {
    const row = t.client.sqlite.prepare('SELECT id, append_order AS appendOrder FROM changes WHERE record_id LIKE ? ORDER BY append_order DESC LIMIT 1')
      .get(`%${SETTING}`) as { id: string; appendOrder: number }
    return { change: row.id, appendOrder: row.appendOrder }
  }
  /** The owner throws the switch to 1 with the clock at `at` and the end time typed as `until`. */
  async function aThrowAt(at: number, until: string) {
    vi.setSystemTime(at)
    const pin = await throwTheSwitch('1', until)
    expect(pin, "the switch's reading names the throw just made").toEqual(theNewestThrow())
    return pin
  }
  const judged = (pin: Throw) => lib.theEmergencyAsJudged('default', actor(), { pin, message: tellTheOwner(aFix(commits.D)), commit: commits.D })

  it('refuses a throw before the repeated hour of 25 October 2026 that is too long in real minutes, or whose end time is in that hour', async () => {
    // 00:30 summer time. The end at 02:10 winter time is 160 real minutes later, though only 100 on the wall.
    expect(judged(await aThrowAt(Date.UTC(2026, 9, 24, 23, 30), '2026-10-25 02:10')).switched).toBe(STABLE_EMERGENCY_TOO_LONG)
    // 00:35 summer time, ending at 01:45, which comes twice that night.
    expect(judged(await aThrowAt(Date.UTC(2026, 9, 24, 23, 35), '2026-10-25 01:45')).switched).toBe(STABLE_EMERGENCY_NOT_ONE_MOMENT)
  })

  it('refuses a throw in either pass of the repeated hour, whichever throw the reading names', async () => {
    // 01:20 summer time, in the first pass. Its end, 02:15 winter time, is 115 real minutes later.
    expect(judged(await aThrowAt(Date.UTC(2026, 9, 25, 0, 20), '2026-10-25 02:15')).switched).toBe(STABLE_EMERGENCY_NOT_ONE_MOMENT)
    // 01:50 summer time, then 01:10 winter time twenty minutes later, with the same end time. The reading orders the
    // throws by their wall time, so it still names the 01:50 throw. A release that names either is refused.
    const first = await aThrowAt(Date.UTC(2026, 9, 25, 0, 50), '2026-10-25 02:30')
    vi.setSystemTime(Date.UTC(2026, 9, 25, 1, 10))
    await throwTheSwitch('1', '2026-10-25 02:30')
    for (const pin of [first, theNewestThrow()]) expect(judged(pin).switched).toBe(STABLE_EMERGENCY_NOT_ONE_MOMENT)
    // 01:55 winter time, in the second pass and later on the wall than every throw before it.
    expect(judged(await aThrowAt(Date.UTC(2026, 9, 25, 1, 55), '2026-10-25 03:00')).switched).toBe(STABLE_EMERGENCY_NOT_ONE_MOMENT)
  })

  it('lets in a throw made after the repeated hour', async () => {
    // 02:30 winter time, ending at 04:00: 90 minutes.
    expect(judged(await aThrowAt(Date.UTC(2026, 9, 25, 2, 30), '2026-10-25 04:00'))).toMatchObject({ switched: null, told: null })
  })

  it('lets in a throw across the skipped hour of 28 March 2027 by its real minutes, and refuses an end time typed in that hour', async () => {
    // 00:30 winter time. The end at 03:00 summer time is 90 real minutes later, though 150 on the wall.
    expect(judged(await aThrowAt(Date.UTC(2027, 2, 28, 0, 30), '2027-03-28 03:00'))).toMatchObject({ switched: null, told: null })
    // 00:35 winter time, ending at 01:30, which never comes that night.
    expect(judged(await aThrowAt(Date.UTC(2027, 2, 28, 0, 35), '2027-03-28 01:30')).switched).toBe(STABLE_EMERGENCY_NOT_ONE_MOMENT)
  })
})
