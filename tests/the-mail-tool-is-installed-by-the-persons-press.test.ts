// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The person's mail tool is a personal tool, not an agent. Two decisions and report H-forI_Vk5H7 change an earlier
 * one. Each case uses a fresh scratch home, stand-in systemd
 * and fresh database.
 *
 * Mutations (each after a control):
 * - person-tool left to fall through to the agent default: cases 3, 7, 13, 19, 20, 22 and 23.
 * - mail-tool agent left live: cases 20, 21, 22 and 23.
 * - take-back does not revoke: cases 7 and 11.
 * - prior key file not restored after transaction failure: case 21.
 * - retirement revalidates the removed card: case 22, with the mailer card and its power gone.
 *
 * THE MAILER CARD AND ITS POWER LEFT design/permissions/roles.json ON 1 OCTOBER 2026, in wave
 * 13k. So an old mail-tool agent is made the way an office that registered one
 * before then holds it: `startTheOldMailTool` puts the card back into this server's declaration for
 * the registration only (tests/the-mailer-card-that-left.ts), and the agent is then on a card that
 * has gone, in every case that uses it.
 * - old card check dropped from the summons door, by editing the shared reader:
 *   the door in cases 23 and 24, and Settings in case 24.
 * - press’s refusal of a different card dropped: case 24.
 * No real folder, unit, port or mail account is touched.
 *
 * Historical mutations restored from git log -p before adbbc872d (header at adbbc872d^).
 * Each was replayed alone after a passing control, then restored and the full file passed.
 * “Originally” records that header’s claim; “now” records this replay. Superseded claims are marked.
 *
 * - the check that the unit is the press’s own taken out:
 *   originally 1; now case 1 goes red.
 * - the tool registered before the install is asked whether it may:
 *   originally 1; now case 1 goes red.
 *   Superseded: the press makes a personal-tool key now, not an agent. Replay makes the key before
 *   asking; case 1 fails on the folder, not an agent registered.
 * - the key put into the reply:
 *   originally 3; now case 3 goes red.
 * - the folder written 755:
 *   originally 3; now case 3 goes red.
 * - the service restarted on every press:
 *   originally 4; now cases 4, 7, 20 go red.
 * - the unit it wrote written again without its copy:
 *   originally 6; now case 6 goes red.
 * - the folder’s key taken as proving the tool without asking:
 *   originally 7; now cases 7, 11, 24 go red.
 *   Replay trusts the personal-tool key without proving it; the old agent-key refusal has been
 *   superseded.
 * - the person’s check taken off the install and read doors:
 *   originally 8; now case 8 goes red.
 * - the install’s test-world refusal taken out:
 *   originally 9; now case 9 goes red.
 * - the catch after a registration taken out:
 *   originally 10; now cases 10, 21 go red.
 *   Superseded: no agent is registered now. Replay removes the key transaction’s catch; case 10 catches a
 *   plain server error and case 21 catches the unrestored file.
 * - the page given for any unit that runs:
 *   originally 9, 11; now cases 9, 11, 24 go red.
 * - the test world’s own check on the page taken out:
 *   originally 9; now case 9 goes red.
 * - the $ left single in the unit:
 *   originally 12; now case 12 goes red.
 * - the person’s check taken off the disable door:
 *   originally 17; now case 17 goes red.
 * - the test world’s refusal taken off the disable door:
 *   originally 17; now case 17 goes red.
 * - the service only stopped, so it starts again at the person's login:
 *   originally 13, 16, 17; now cases 13, 16, 17 go red.
 * - the place left as it was:
 *   originally 14; now case 14 goes red.
 * - a unit the install press did not write turned off as well:
 *   originally 16; now case 16 goes red.
 * - the place written before systemd is asked:
 *   originally 17; now case 17 goes red.
 * - whether it starts at the person's login not read:
 *   originally 13, 15; now cases 13, 15, 18, 24 go red.
 * - a second disable press said to have turned it off:
 *   originally 16; now case 16 goes red.
 * - the disable press reading is-enabled on its own again, taking only “enabled”:
 *   originally 18; now case 18 goes red.
 * - the one reading taking “enabled-runtime” for nothing:
 *   originally 18; now case 18 goes red.
 * - the install press taking a tool enabled for this boot only as enabled for good:
 *   originally 18; now case 18 goes red.
 *
 * THE FIRST BACKUP OF THE UNIT IS NEVER WRITTEN OVER (wave 13t, round W26), as the entry press's has not been since
 * round W24. Until then every press that wrote a changed unit again copied it to the one backup path.
 * - 25: two later presses that each find the unit changed keep their own copies, at `-2` and `-3`, and the first backup
 *   stays byte for byte. The first press's words are what they were; a later press's name its own copy, then say the
 *   first backup was not changed.
 * - 26: a copy that fails for any reason but a taken name refuses the press, and the unit is not written.
 * - 27: a press refused at the write takes its own copy away. A first copy is then gone, and a later press leaves the
 *   first backup byte for byte.
 * - 28: a press refused at the write whose copy cannot be taken away says where the copy still is.
 * Mutations, each after a control run that passed, and each restored; the commit that changes the press names the runs
 * and the logs:
 * - the copy made over whatever is at the first name: cases 25 and 27 go red.
 * - a copy that failed not a refusal, so the press goes on to the write: case 26 goes red.
 * - a press refused at the write leaves its copy: cases 27 and 28 go red.
 * - a refusal whose copy could not be taken away does not say where it is: case 28 goes red.
 * - a later press's words name its own copy and not the first: case 25 goes red.
 *
 * THE FILE WRITTEN BESIDE THE PATH IS TAKEN AWAY WHEN THE WRITE FAILS, OR ITS PLACE IS SAID (wave 13t, round W27).
 * - 29: writeWhole whose rename fails takes the file it made beside the path away, and throws what the rename said.
 * - 30: writeWhole whose file beside the path cannot be taken away says where it still is.
 * Cases 26, 28 and 30 need a folder the press may not write in, so as root they skip and say why
 * (tests/root-may-write-in-any-folder.ts).
 * Mutations, each after a control run that passed, and each restored:
 * - the file beside the path left when the write fails: cases 29 and 30 go red.
 * - the file beside the path left unsaid when it cannot be taken away: case 30 goes red.
 * - whatever is at the name beside the path taken away, though the write never opened it: case 27 goes red.
 *
 * A FILE WHERE A FOLDER OF THE SERVICE GOES IS REFUSED WITH ITS CODE, NOT A 500 (wave 13t, round W28).
 * - 31: install and turn-off are each refused 409 with their code, naming that file. No key is given, nothing is
 *   written and systemd is not asked.
 * Since round W28 the rule asks whether a shut folder takes a write, not whether the uid is 0, so cases 26, 28 and 30
 * skip wherever that is so, as it is for root.
 * Mutations, each after a control run that passed, and each restored:
 * - readOrNull throws a path under a file as it did before round W28, so both doors answer 500: case 31 goes red.
 * - the turn-off reads the service without the refusal, as before: case 31 goes red.
 * - the doors give the refusal without its code: case 31 goes red.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  THE_MAIL_TOOL_UNIT,
  THE_MAIL_TOOL_UNIT_MARK,
  THE_PLACE_AFTER_THE_NEWEST,
  theMailToolFolder,
  theMailToolUnit,
  theMailToolUnitPath,
  theUnitIsThisOfficesOwn,
  writeWhole,
} from '../src/config/the-mail-tool.mjs'
import { settingNamed, settings } from '../src/config/settings.mjs'
import { withTheMailerCardBack } from './the-mailer-card-that-left.ts'
import { aFolderShutAfterTheCopy } from './a-folder-shut-after-the-copy.ts'
import { skippedAsRoot } from './root-may-write-in-any-folder.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let scratch = ''
let home = ''
let systemdState = ''
let systemdLog = ''
let workerKey = ''
let keyLibrary: typeof import('../src/server/lib/keys.ts')
let roleLibrary: typeof import('../src/server/lib/roles.ts')
let listRoutes: Awaited<ReturnType<typeof apiApp>>['listApiRoutes']
const before = { HOME: process.env.HOME, PATH: process.env.PATH, XDG_STATE_HOME: process.env.XDG_STATE_HOME, MAIL_TOOL_DIR: process.env.MAIL_TOOL_DIR }

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' | 'HEAD' | 'OPTIONS', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ code: number; said: any; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body }
}

const press = () => ask('POST', '/api/office/mail-tool/install', { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })

/** An old mail-tool agent on the mailer card, registered while the card was declared; the card is gone again after. */
const startTheOldMailTool = (name: string) =>
  withTheMailerCardBack(roleLibrary.theRoleCards(), () =>
    ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'mail-tool', name, role: 'mailer' }))

/** The person's press that turns the mail tool off, without uninstalling it. */
const turnOff = () => ask('POST', '/api/office/mail-tool/disable', { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })

/**
 * What the stand-in systemd says: whether it answers at all, whether the service is enabled and runs, and whether it
 * refuses to turn the service off.
 */
function systemd(state: { down?: boolean; active?: boolean; enabled?: boolean | 'runtime'; refuseDisable?: boolean }): void {
  const now = existsSync(systemdState) ? (JSON.parse(readFileSync(systemdState, 'utf8')) as Record<string, boolean>) : {}
  writeFileSync(systemdState, JSON.stringify({ ...now, ...state }))
}

/** Every call the stand-in systemctl was asked since `from`, as its arguments. */
function systemdCalls(from = 0): string[][] {
  if (!existsSync(systemdLog)) return []
  return readFileSync(systemdLog, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as string[])
    .slice(from)
}

const folder = () => theMailToolFolder({}, home)
const unitPath = () => theMailToolUnitPath(home)
const firstCopy = () => `${unitPath()}.mole-office-backup`
/** Where a later press puts its copy when the first backup is there: `-2`, then `-3` and on (round W26). */
const laterCopy = (n: number) => `${firstCopy()}-${String(n)}`
/** The press's temporary file, the unit written whole before it is renamed into place. */
const theTemporaryFile = () => `${unitPath()}.${String(process.pid)}.new`
/** A unit the press wrote, as it would be for another node, so the next press finds it changed. */
const aUnitForAnotherNode = (node: string) => readFileSync(unitPath(), 'utf8').replace(process.execPath, node)
const keyInTheFolder = () => readFileSync(join(folder(), 'key'), 'utf8').trim()
const placeInTheFolder = () => readFileSync(join(folder(), 'place'), 'utf8').trim()
const theMailTool = () => t.client.sqlite.prepare("SELECT id, role FROM agents WHERE handle = 'mail-tool' AND retired = 0").get() as { id: string; role: string } | undefined

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mail-tool-install-test-'))
  home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  systemdState = join(scratch, 'systemd.json')
  systemdLog = join(scratch, 'systemctl.log')
  systemd({ down: false, active: false, enabled: false })
  // THE STAND-IN systemctl, first on PATH: it notes each call, answers from the state file, and starts nothing.
  const bin = join(scratch, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'systemctl'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(systemdLog)}, JSON.stringify(args) + '\\n')
const state = JSON.parse(fs.readFileSync(${JSON.stringify(systemdState)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(systemdState)}, JSON.stringify(state))
if (args[0] !== '--user') { process.stderr.write('not as the person\\n'); process.exit(1) }
if (state.down) { process.stderr.write('Failed to connect to bus: No medium found\\n'); process.exit(1) }
const verb = args[1]
if (verb === 'show-environment') { process.stdout.write('HOME=${home}\\n'); process.exit(0) }
if (verb === 'daemon-reload') process.exit(0)
if (verb === 'is-active') { process.stdout.write(state.active ? 'active\\n' : 'inactive\\n'); process.exit(state.active ? 0 : 3) }
if (verb === 'is-enabled') {
  const word = state.enabled === 'runtime' ? 'enabled-runtime' : state.enabled ? 'enabled' : 'disabled'
  process.stdout.write(word + '\\n'); process.exit(state.enabled ? 0 : 1)
}
if (verb === 'enable' && args[2] === '--now') { state.active = true; state.enabled = true; save(); process.exit(0) }
if (verb === 'disable' && args[2] === '--now') {
  if (state.refuseDisable) { process.stderr.write('Failed to disable unit: Access denied\\n'); process.exit(1) }
  state.active = false; state.enabled = false; save(); process.exit(0)
}
if (verb === 'restart') { state.active = true; save(); process.exit(0) }
if (verb === 'stop') { state.active = false; save(); process.exit(0) }
process.stderr.write('Unknown command verb ' + verb + '\\n'); process.exit(1)
`,
  )
  chmodSync(join(bin, 'systemctl'), 0o755)
  process.env.HOME = home
  process.env.PATH = `${bin}:${String(process.env.PATH)}`
  delete process.env.XDG_STATE_HOME
  delete process.env.MAIL_TOOL_DIR

  t = await freshDb()
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  keyLibrary = await import('../src/server/lib/keys.ts')
  roleLibrary = await import('../src/server/lib/roles.ts')
  await app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-worker', name: 'A worker', role: 'worker' })
  expect(started.code, started.text.slice(0, 300)).toBe(201)
  workerKey = String(started.said.whatToGiveIt?.key ?? '')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** A FRESH START FOR EVERY CASE: no mail tool registered, an empty home, and systemd answering with nothing running. */
beforeEach(async () => {
  const live = theMailTool()
  if (live !== undefined) {
    const retired = await ask('POST', `/api/participants/agent/${live.id}/retire`, AS_THE_PERSON, { because: 'a fresh start for the next case' })
    expect(retired.code, retired.text.slice(0, 300)).toBe(200)
  }
  const { revokeEveryLiveKeyHeldBy } = keyLibrary
  revokeEveryLiveKeyHeldBy('person-tool', 'mail-tool', 'a fresh start for this case')
  rmSync(join(home, '.config'), { recursive: true, force: true })
  rmSync(join(home, '.local'), { recursive: true, force: true })
  writeFileSync(systemdState, JSON.stringify({ down: false, active: false, enabled: false }))
})

/** The person's first press, for a case about what comes after it. */
async function installed(): Promise<void> {
  const done = await press()
  expect(done.code, done.text.slice(0, 300)).toBe(200)
  expect(done.said).toMatchObject({ keyMade: true, service: 'started' })
}

/** The two files the running tool writes to say where its page is. */
function thePageSaysWhereItIs(): void {
  writeFileSync(join(folder(), 'page.json'), JSON.stringify({ port: 43210, pid: 1 }))
  writeFileSync(join(folder(), 'page-secret'), 'a-page-secret\n')
}

describe('the mail tool, installed by the person\'s press', () => {
  it('1: leaves a unit of that name the press did not write as it is, and registers and writes nothing', async () => {
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), '[Service]\nExecStart=/usr/bin/true\n')
    const refused = await press()
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said.error).toContain('this press did not write it')
    expect(readFileSync(unitPath(), 'utf8')).toBe('[Service]\nExecStart=/usr/bin/true\n')
    expect(theMailTool(), 'the press registered the tool before it asked whether it may install it').toBeUndefined()
    expect(existsSync(folder())).toBe(false)
    const read = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(read.said).toMatchObject({ key: null, unit: 'not the press’s' })
  })

  it('2: is refused while systemd does not answer for the person\'s login, and registers and writes nothing', async () => {
    systemd({ down: true })
    const refused = await press()
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said.error).toContain('systemd does not answer')
    expect(theMailTool()).toBeUndefined()
    expect(existsSync(unitPath())).toBe(false)
  })

  it('3: makes the person\'s tool key, keeps its key in its folder alone, writes the unit, and starts it', async () => {
    const from = systemdCalls().length
    const done = await press()
    expect(done.code, done.text.slice(0, 300)).toBe(200)
    expect(done.said).toMatchObject({ keyMade: true, service: 'started' })
    expect(theMailTool()).toBeUndefined()
    // THE KEY: in the folder, which only the person may open, and in no reply.
    const key = keyInTheFolder()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(done.text).not.toContain(key)
    expect(statSync(folder()).mode & 0o777).toBe(0o700)
    expect(statSync(join(folder(), 'key')).mode & 0o777).toBe(0o600)
    const read = await ask('GET', '/api/office/summonses', { 'x-mole-office-workspace': 'default', 'x-mole-office-key': key })
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    // THE UNIT: this checkout's tool, the node the office runs on, the office's address and the folder.
    const unit = readFileSync(unitPath(), 'utf8')
    expect(unit.split('\n')[0]).toBe(THE_MAIL_TOOL_UNIT_MARK)
    expect(unit).toContain(`ExecStart="${process.execPath}" "${join(CHECKOUT, 'tools', 'mail-the-summonses.mjs')}"`)
    expect(unit).toContain(`Environment="MOLE_OFFICE_API=${settings().apiAddress}"`)
    expect(unit).toContain(`Environment="MAIL_TOOL_DIR=${folder()}"`)
    expect(unit).toContain('WantedBy=default.target')
    expect(unit).not.toContain(key)
    // AND SYSTEMD, AS THE PERSON: read the unit again, then enable and start it.
    const calls = systemdCalls(from)
    for (const call of calls) expect(call[0]).toBe('--user')
    expect(calls.map((call) => call.slice(1).join(' '))).toEqual(
      expect.arrayContaining(['daemon-reload', `enable --now ${THE_MAIL_TOOL_UNIT}`]),
    )
  })

  it('4: writes nothing and starts nothing on a second press, and says so', async () => {
    await installed()
    const unitBefore = statSync(unitPath()).mtimeMs
    const keyBefore = keyInTheFolder()
    const from = systemdCalls().length
    const again = await press()
    expect(again.code, again.text.slice(0, 300)).toBe(200)
    expect(again.said).toMatchObject({ keyMade: false, wrote: [], service: 'already running' })
    expect(again.said.says).toContain('nothing was written')
    expect(statSync(unitPath()).mtimeMs).toBe(unitBefore)
    expect(keyInTheFolder()).toBe(keyBefore)
    const verbs = systemdCalls(from).map((call) => call[1])
    for (const verb of ['daemon-reload', 'enable', 'restart']) expect(verbs, `a second press asked systemd to ${verb}`).not.toContain(verb)
  })

  it('5: shows the person the tool running, and the address of its page with the page’s secret', async () => {
    await installed()
    thePageSaysWhereItIs()
    await ask('GET', '/api/office/summonses', { 'x-mole-office-key': keyInTheFolder() })
    const read = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.key.lastUsedAt).not.toBeNull()
    expect(read.said).not.toHaveProperty('registered')
    expect(read.text).not.toContain('mailer')
    expect(read.said).toMatchObject({ key: expect.objectContaining({ madeAt: expect.any(String) }), keyWorks: true, unit: 'installed', running: true, page: 'http://127.0.0.1:43210/?s=a-page-secret' })
  })

  it('6: copies a unit it wrote that differs aside, writes it again, and restarts the service', async () => {
    await installed()
    const old = readFileSync(unitPath(), 'utf8').replace(process.execPath, '/an/old/node')
    writeFileSync(unitPath(), old)
    const from = systemdCalls().length
    const again = await press()
    expect(again.code, again.text.slice(0, 300)).toBe(200)
    expect(again.said).toMatchObject({ keyMade: false, service: 'restarted' })
    expect(readFileSync(`${unitPath()}.mole-office-backup`, 'utf8')).toBe(old)
    expect(readFileSync(unitPath(), 'utf8')).toContain(`ExecStart="${process.execPath}"`)
    expect(systemdCalls(from).map((call) => call.slice(1).join(' '))).toEqual(expect.arrayContaining(['daemon-reload', `restart ${THE_MAIL_TOOL_UNIT}`]))
  })

  it('7: takes the person\'s tool key back, reads nothing afterwards, and install makes a new one [mutation: take-back not revoking]', async () => {
    await installed()
    const oldKey = keyInTheFolder()
    const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-key': oldKey }
    expect((await ask('GET', '/api/office/summonses', headers)).code).toBe(200)
    const denied = await ask('POST', '/api/office/mail-tool/take-back-key', { 'x-mole-office-key': workerKey })
    expect(denied.code, denied.text).toBe(403)
    const done = await ask('POST', '/api/office/mail-tool/take-back-key', AS_THE_PERSON)
    expect(done.code, done.text).toBe(200)
    expect(done.said.takenBack).toBe(true)
    expect((await ask('GET', '/api/office/summonses', headers)).code).toBe(403)
    expect((await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)).said.key).toBeNull()
    const again = await press()
    expect(again.code, again.text).toBe(200)
    expect(again.said).toMatchObject({ keyMade: true, service: 'already running' })
    expect(keyInTheFolder()).not.toBe(oldKey)
    expect((await ask('GET', '/api/office/summonses', { ...headers, 'x-mole-office-key': keyInTheFolder() })).code).toBe(200)
    expect((await ask('GET', '/api/office/summonses', headers)).code).toBe(403)
  })

  it('8: refuses an agent both doors, and writes nothing', async () => {
    await installed()
    thePageSaysWhereItIs()
    const byItsKey = { 'x-mole-office-workspace': 'default', 'x-mole-office-key': workerKey }
    const unitBefore = readFileSync(unitPath(), 'utf8')
    const keyBefore = keyInTheFolder()
    const pressed = await ask('POST', '/api/office/mail-tool/install', byItsKey)
    expect(pressed.code, pressed.text.slice(0, 300)).toBe(403)
    const read = await ask('GET', '/api/office/mail-tool', byItsKey)
    expect(read.code, read.text.slice(0, 300)).toBe(403)
    expect(read.text).not.toContain('a-page-secret')
    expect(readFileSync(unitPath(), 'utf8')).toBe(unitBefore)
    expect(keyInTheFolder()).toBe(keyBefore)
  })

  it('9: refuses the person\'s press inside a test world, whose checkout is deleted with it, and writes nothing', async () => {
    await installed()
    thePageSaysWhereItIs()
    const unitBefore = readFileSync(unitPath(), 'utf8')
    const keyBefore = keyInTheFolder()
    const toolBefore = theMailTool()?.id
    // A SECOND APP, BUILT AFTER THE WORLD'S VARIABLE IS SET, as tests/the-entry-follows-the-person.test.ts builds one: the
    // world reading is held for the life of the modules that took it, so fresh modules read it again.
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'so'
    vi.resetModules()
    const world = (await apiApp()).app
    try {
      await world.ready()
      const refused = await world.inject({
        method: 'POST',
        url: '/api/office/mail-tool/install',
        headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(409)
      expect(refused.body).toContain('test world')
      // AND THE PERSON'S READ THERE GIVES NO PAGE: the folder and the running unit are the office's, not the world's.
      const read = await world.inject({
        method: 'GET',
        url: '/api/office/mail-tool',
        headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      })
      expect(read.statusCode, read.body.slice(0, 300)).toBe(200)
      expect((read.json() as { page: string | null }).page).toBeNull()
      expect(read.body).not.toContain('a-page-secret')
    } finally {
      await world.close()
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    }
    expect(readFileSync(unitPath(), 'utf8')).toBe(unitBefore)
    expect(keyInTheFolder()).toBe(keyBefore)
    expect(theMailTool()?.id).toBe(toolBefore)
  })

  it('10: a failed key-file write rolls back the new key and leaves the old agent live, naming the way on', async () => {
    const started = await startTheOldMailTool('The old mail tool')
    expect(started.code, started.text).toBe(201)
    const old = theMailTool()
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), 'key'), String(started.said.whatToGiveIt.key))
    // A directory at the writer’s temporary-file path makes the write fail inside the transaction.
    mkdirSync(join(folder(), `key.${process.pid}.new`))
    const failed = await press()
    expect(failed.code, failed.text).toBe(409)
    expect(failed.said.error).toContain('move was undone')
    expect(failed.said.error).toContain('press install again')
    expect(failed.said.error).toContain('Saving the mail tool’s key file failed')
    expect(theMailTool()?.id).toBe(old?.id)
    expect(t.client.sqlite.prepare("SELECT 1 FROM held_keys WHERE whose_kind = 'person-tool' AND revoked_at IS NULL").get()).toBeUndefined()
    const read = await ask('GET', '/api/office/summonses', { 'x-mole-office-key': started.said.whatToGiveIt.key })
    expect(read.code, read.text).toBe(200)
  })

  it("11: gives the page's address only for this office's own tool and unit", async () => {
    // A MAIL TOOL WHOSE KEY WORKS, THE UNIT THIS OFFICE WROTE, AND ITS PAGE.
    await installed()
    thePageSaysWhereItIs()
    const read = async () => (await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)).said as { page: string | null }
    expect((await read()).page).toBe('http://127.0.0.1:43210/?s=a-page-secret')
    // A UNIT WRITTEN FOR ANOTHER OFFICE: the same mark, another office's address.
    const ours = readFileSync(unitPath(), 'utf8')
    writeFileSync(unitPath(), ours.replace(`MOLE_OFFICE_API=${settings().apiAddress}`, 'MOLE_OFFICE_API=http://127.0.0.1:1'))
    try {
      expect((await read()).page, 'the page was given for a unit written for another office').toBeNull()
    } finally {
      writeFileSync(unitPath(), ours)
    }
    expect((await read()).page).not.toBeNull()
    // AND NO LIVE TOOL KEY HERE, while the service still runs.
    const gone = await ask('POST', '/api/office/mail-tool/take-back-key', AS_THE_PERSON)
    expect(gone.code, gone.text).toBe(200)
    const none = await read()
    expect(none.page, 'the page was given without this office’s tool key').toBeNull()
  })

  it('12: doubles a $ as well as a % in the unit, which systemd would otherwise expand', () => {
    const api = `http://127.0.0.1:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`
    const unit = theMailToolUnit({ node: '/opt/n$de/bin/node', tool: '/x/t%ol.mjs', api, dir: `${THE_TEST_FIXTURE_ROOT}/a$b/state` })
    expect(unit).toContain('ExecStart="/opt/n$$de/bin/node" "/x/t%%ol.mjs"')
    expect(unit).toContain(`Environment="MAIL_TOOL_DIR=${THE_TEST_FIXTURE_ROOT}/a$$b/state"`)
    expect(unit).not.toMatch(/[^$]\$[^$]/)
    expect(theUnitIsThisOfficesOwn(unit, api)).toBe(true)
    expect(theUnitIsThisOfficesOwn(unit, 'http://127.0.0.1:1')).toBe(false)
  })
})

describe('the mail tool, turned off by the person\'s press without being uninstalled', () => {
  it('13: has systemd stop it and take it off the person\'s login, keeps its unit and key, and gives no page', async () => {
    await installed()
    thePageSaysWhereItIs()
    const unitBefore = readFileSync(unitPath(), 'utf8')
    const keyBefore = keyInTheFolder()
    const from = systemdCalls().length
    const done = await turnOff()
    expect(done.code, done.text.slice(0, 300)).toBe(200)
    expect(done.said).toMatchObject({ service: 'turned off' })
    // SYSTEMD, AS THE PERSON: stopped now, and no longer started at the person's login.
    const calls = systemdCalls(from)
    for (const call of calls) expect(call[0]).toBe('--user')
    expect(calls.map((call) => call.slice(1).join(' '))).toContain(`disable --now ${THE_MAIL_TOOL_UNIT}`)
    // NOTHING IS UNINSTALLED: the unit, the key in its folder, and the personal tool key, which still reads.
    expect(readFileSync(unitPath(), 'utf8')).toBe(unitBefore)
    expect(keyInTheFolder()).toBe(keyBefore)
    expect(theMailTool()).toBeUndefined()
    const read = await ask('GET', '/api/office/summonses', { 'x-mole-office-workspace': 'default', 'x-mole-office-key': keyBefore })
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    // THE PERSON'S READ SAYS IT IS OFF, and gives no page, though the page's two files are still in its folder.
    const standing = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(standing.said).toMatchObject({ unit: 'installed', keyWorks: true, running: false, enabled: false, page: null })
    expect(standing.said.says).toContain('turned off')
    expect(standing.text).not.toContain('a-page-secret')
  })

  it('14: leaves its place saying to start after the newest, so coming back it mails nothing made while it was off', async () => {
    await installed()
    writeFileSync(join(folder(), 'place'), 'a-summons-it-finished\n', { mode: 0o600 })
    const done = await turnOff()
    expect(done.code, done.text.slice(0, 300)).toBe(200)
    expect(placeInTheFolder()).toBe(THE_PLACE_AFTER_THE_NEWEST)
    expect(statSync(join(folder(), 'place')).mode & 0o777).toBe(0o600)
  })

  it('15: is turned back on by the install press, which starts it now and at each login and registers nothing', async () => {
    await installed()
    const toolBefore = theMailTool()?.id
    const off = await turnOff()
    expect(off.code, off.text.slice(0, 300)).toBe(200)
    const from = systemdCalls().length
    const back = await press()
    expect(back.code, back.text.slice(0, 300)).toBe(200)
    expect(back.said).toMatchObject({ keyMade: false, service: 'started' })
    expect(systemdCalls(from).map((call) => call.slice(1).join(' '))).toContain(`enable --now ${THE_MAIL_TOOL_UNIT}`)
    expect(theMailTool()?.id).toBe(toolBefore)
    const standing = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(standing.said).toMatchObject({ running: true, enabled: true })
  })

  it('16: says a second press found it off already; refuses a tool not installed and a unit it did not write', async () => {
    const from = systemdCalls().length
    // NOT INSTALLED: there is nothing to turn off.
    const none = await turnOff()
    expect(none.code, none.text.slice(0, 300)).toBe(409)
    expect(none.said.error).toContain('not installed')
    // A UNIT OF THAT NAME THE INSTALL PRESS DID NOT WRITE: left as it is.
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), '[Service]\nExecStart=/usr/bin/true\n')
    const foreign = await turnOff()
    expect(foreign.code, foreign.text.slice(0, 300)).toBe(409)
    expect(foreign.said.error).toContain('did not write it')
    expect(readFileSync(unitPath(), 'utf8')).toBe('[Service]\nExecStart=/usr/bin/true\n')
    expect(systemdCalls(from).filter((call) => call[1] === 'disable'), 'systemd was asked to turn off a unit not the press’s').toEqual([])
    // AND A SECOND PRESS, ON A TOOL ALREADY OFF.
    rmSync(join(home, '.config'), { recursive: true, force: true })
    await installed()
    expect((await turnOff()).said).toMatchObject({ service: 'turned off' })
    const again = await turnOff()
    expect(again.code, again.text.slice(0, 300)).toBe(200)
    expect(again.said).toMatchObject({ service: 'already off' })
  })

  it('17: refuses an agent and a test world; and when systemd will not turn it off, says so and leaves the place', async () => {
    await installed()
    writeFileSync(join(folder(), 'place'), 'a-summons-it-finished\n', { mode: 0o600 })
    const from = systemdCalls().length
    // AN AGENT, BY ITS OWN KEY.
    const byAnAgent = await ask('POST', '/api/office/mail-tool/disable', { 'x-mole-office-workspace': 'default', 'x-mole-office-key': workerKey })
    expect(byAnAgent.code, byAnAgent.text.slice(0, 300)).toBe(403)
    // THE PERSON'S PRESS INSIDE A TEST WORLD, which runs under their real login: a second app, built after the world's variable is
    // set, as case 9 builds one.
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'so'
    vi.resetModules()
    const world = (await apiApp()).app
    try {
      await world.ready()
      const refused = await world.inject({
        method: 'POST',
        url: '/api/office/mail-tool/disable',
        headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(409)
      expect(refused.body).toContain('test world')
    } finally {
      await world.close()
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    }
    expect(systemdCalls(from).filter((call) => call[1] === 'disable'), 'systemd was asked to turn it off for a refused press').toEqual([])
    expect(placeInTheFolder()).toBe('a-summons-it-finished')
    // SYSTEMD WILL NOT TURN IT OFF: the press says so, and the place is left as it was.
    systemd({ refuseDisable: true })
    const failed = await turnOff()
    expect(failed.code, failed.text.slice(0, 300)).toBe(409)
    expect(failed.said.error).toContain('would not turn the service off')
    expect(placeInTheFolder()).toBe('a-summons-it-finished')
  })

  it('18: reads "enabled-runtime" one way: it starts at the person\'s login, the press turns it off, and the install enables it for good', async () => {
    await installed()
    // ENABLED FOR THIS BOOT ONLY, as `systemctl --user enable --runtime` leaves it, and not running.
    systemd({ active: false, enabled: 'runtime' })
    const standing = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(standing.said).toMatchObject({ running: false, enabled: true })
    const off = await turnOff()
    expect(off.code, off.text.slice(0, 300)).toBe(200)
    expect(off.said, 'the press read it as off while the person\'s read says it starts at the person\'s login').toMatchObject({ service: 'turned off' })
    // AND THE INSTALL PRESS, WHICH PROMISES EVERY LOGIN, ENABLES A TOOL ENABLED FOR THIS BOOT ONLY FOR GOOD.
    systemd({ active: true, enabled: 'runtime' })
    const from = systemdCalls().length
    const again = await press()
    expect(again.code, again.text.slice(0, 300)).toBe(200)
    expect(again.said).toMatchObject({ service: 'started' })
    expect(systemdCalls(from).map((call) => call.slice(1).join(' '))).toContain(`enable --now ${THE_MAIL_TOOL_UNIT}`)
  })
})


describe('the person’s tool’s proof and the move from the old agent', () => {
  it('19: proves only the person\'s tool and is refused at every other API door [mutation: new kind falls through to agent]', async () => {
    await installed()
    const key = keyInTheFolder()
    const { howThisRequestProvedItself } = keyLibrary
    const { thePersonIsProved } = await import('../src/shared/the-person-proved.ts')
    const proof = howThisRequestProvedItself({ headers: { 'x-mole-office-key': key } } as any)
    expect(proof).toEqual({ how: 'his-tool-key', whoseId: 'mail-tool' })
    expect(thePersonIsProved({ type: 'human', id: THE_PERSON, provedBy: proof?.how })).toBe(false)
    // Walk the published route table, as reach-declared does: every person-only and agent door,
    // including plain reads and streams whose handlers never resolve an actor. Replace path
    // parameters with safe absent ids; the hook must refuse before any handler or payload runs.
    const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }
    expect(listRoutes().length).toBeGreaterThan(100)
    expect(listRoutes().some((route) => route.path === '/api/office/mail-tool/take-back-key')).toBe(true)
    for (const route of listRoutes()) {
      if (route.path === '/api/office/summonses' && route.method === 'GET') continue
      const url = route.path.replace(/:[A-Za-z0-9_]+/g, 'no-such-record').replace(/\*/g, 'no-such-path')
      const read = await ask(route.method as 'GET', url, headers)
      expect(read.code, `${route.method} ${url}: ${read.text.slice(0, 300)}`).toBe(403)
    }
    for (const type of ['human', 'agent', 'office']) {
      const refused = await ask('GET', '/api/kinds', { ...headers, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': THE_PERSON })
      expect(refused.code, refused.text).toBe(403)
    }
    expect((await ask('GET', '/api/office/summonses', headers)).code).toBe(200)
  }, 60_000)

  it('20: moves the live mail-tool agent, keeps its record and history, takes all its keys back, and reads with the new key [mutation: agent left live]', async () => {
    const started = await startTheOldMailTool('Old mail tool')
    expect(started.code, started.text).toBe(201)
    const agent = theMailTool()!
    const oldKey = String(started.said.whatToGiveIt.key)
    const { makeAnAgentKey } = keyLibrary
    const olderKey = makeAnAgentKey(agent.id, null)
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), 'key'), oldKey)
    writeFileSync(join(folder(), 'place'), 'the-last-summons')
    // Existing unit and service: changing the key alone must not restart the tool.
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), theMailToolUnit({ node: process.execPath, tool: join(CHECKOUT, 'tools/mail-the-summonses.mjs'), api: settings().apiAddress, dir: folder() }))
    systemd({ active: true, enabled: true })
    expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': oldKey })).code).toBe(200)
    const record = t.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ?').get(agent.id) as { record_id: string }
    const revisions = t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(record.record_id) as { n: number }
    const from = systemdCalls().length
    const done = await press()
    expect(done.code, done.text).toBe(200)
    expect(done.said).toMatchObject({ keyMade: true, service: 'already running' })
    expect(theMailTool()).toBeUndefined()
    expect(t.client.sqlite.prepare('SELECT retired FROM agents WHERE id = ?').get(agent.id)).toMatchObject({ retired: 1 })
    const kept = t.client.sqlite.prepare('SELECT deleted_at, data FROM records WHERE id = ?').get(record.record_id) as { deleted_at: string | null; data: string }
    expect(kept.deleted_at).toBeNull()
    expect(JSON.parse(kept.data).state).toBe('retired')
    expect((t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(record.record_id) as { n: number }).n).toBeGreaterThan(revisions.n)
    for (const key of [oldKey, olderKey]) expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })).code).toBe(403)
    const key = keyInTheFolder()
    expect(key).not.toBe(oldKey)
    expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })).code).toBe(200)
    expect(placeInTheFolder()).toBe('the-last-summons')
    expect(systemdCalls(from).some((call) => call[1] === 'restart')).toBe(false)
    const replacement = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'mail-tool', name: 'Freed handle', role: 'worker' })
    expect(replacement.code, replacement.text).toBe(201)
    expect(theMailTool()?.id).not.toBe(agent.id)
  })
  it('21: restores the old file and rolls the key back if retirement fails [mutation: old file not restored]', async () => {
    const started = await startTheOldMailTool('Old mail tool')
    expect(started.code, started.text).toBe(201)
    const old = theMailTool()!
    const key = String(started.said.whatToGiveIt.key)
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), 'key'), key)
    t.client.sqlite.exec("CREATE TRIGGER refuse_test_retirement BEFORE UPDATE OF retired ON agents WHEN NEW.retired = 1 BEGIN SELECT RAISE(ABORT, 'test retirement failure'); END")
    try {
      const failed = await press()
      expect(failed.code, failed.text).toBe(409)
      expect(failed.said.error).toContain('Retiring the old mail-tool agent failed')
      expect(failed.said.error).toContain('move was undone')
      expect(failed.said.error).not.toContain('could not be saved')
      expect(keyInTheFolder()).toBe(key)
      expect(theMailTool()?.id).toBe(old.id)
      expect(t.client.sqlite.prepare("SELECT 1 FROM held_keys WHERE whose_kind = 'person-tool' AND revoked_at IS NULL").get()).toBeUndefined()
      expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })).code).toBe(200)
    } finally {
      t.client.sqlite.exec('DROP TRIGGER refuse_test_retirement')
    }
  })

  it('22: keeps the old agent reading and moves it after the mailer card and summons power are gone [mutation: retirement revalidates the removed card]', async () => {
    const started = await startTheOldMailTool('Old mail tool')
    expect(started.code, started.text).toBe(201)
    const key = String(started.said.whatToGiveIt.key)
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), 'key'), key)
    const cards = roleLibrary.theRoleCards()
    const before = { cards: cards.cards, powers: cards.powers }
    // Only this test office’s in-memory declaration changes. design/permissions/roles.json stays.
    // SINCE 1 OCTOBER 2026 THE FILE NO LONGER HOLDS THE CARD OR THE POWER, so these two filters find
    // nothing to take out; `startTheOldMailTool` has already left the agent on a card that has gone.
    // They are kept so the case still says what state it measures.
    expect(cards.cards.map((card) => card.name), 'the mailer card is still declared').not.toContain('mailer')
    cards.cards = cards.cards.filter((card) => card.name !== 'mailer')
    cards.powers = cards.powers.filter((power) => !power.acts.some((act) => act.act === 'office.read-summonses'))
    try {
      const read = await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })
      expect(read.code, read.text).toBe(200)
      const moved = await press()
      expect(moved.code, moved.text).toBe(200)
      expect(theMailTool()).toBeUndefined()
      expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })).code).toBe(403)
      expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': keyInTheFolder() })).code).toBe(200)
    } finally {
      cards.cards = before.cards
      cards.powers = before.powers
    }
  })

  it('23: refuses a worker on the freed mail-tool handle after the move, while the person\'s tool key still reads [mutation: door card check dropped]', async () => {
    const started = await startTheOldMailTool('Old mail tool')
    expect(started.code, started.text).toBe(201)
    const moved = await press()
    expect(moved.code, moved.text).toBe(200)
    const toolKey = keyInTheFolder()
    const replacement = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'mail-tool', name: 'Freed handle', role: 'worker' })
    expect(replacement.code, replacement.text).toBe(201)
    expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': replacement.said.whatToGiveIt.key })).code).toBe(403)
    expect((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': toolKey })).code).toBe(200)
  })

  it('24: refuses a live worker named mail-tool at the summons door, Settings and install press, with no move or writes [mutations: shared card check dropped; press card refusal dropped]', async () => {
    const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'mail-tool', name: 'Another agent', role: 'worker' })
    expect(started.code, started.text).toBe(201)
    const agent = theMailTool()!
    const key = String(started.said.whatToGiveIt.key)
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), 'key'), key)
    writeFileSync(join(folder(), 'place'), 'the-last-summons')
    writeFileSync(join(folder(), 'settings.json'), '{"standIn":true}\n')
    thePageSaysWhereItIs()
    const snapshot = () => ({
      mode: statSync(folder()).mode,
      files: readdirSync(folder()).sort().map((name) => ({ name, mode: statSync(join(folder(), name)).mode, bytes: readFileSync(join(folder(), name)).toString('hex') })),
    })
    const folderBefore = snapshot()
    const toolRows = () => t.client.sqlite.prepare("SELECT * FROM held_keys WHERE whose_kind = 'person-tool' AND whose_id = 'mail-tool' ORDER BY id").all()
    const keysBefore = toolRows()
    const record = t.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ?').get(agent.id) as { record_id: string }
    const revisions = () => t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(record.record_id)
    const historyBefore = revisions()
    const from = systemdCalls().length
    expect.soft((await ask('GET', '/api/office/summonses', { 'x-mole-office-key': key })).code, 'the summons door accepted the worker’s key').toBe(403)
    // Give Settings every other condition for a page, using only the scratch unit and stand-in systemd.
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), theMailToolUnit({ node: process.execPath, tool: join(CHECKOUT, 'tools/mail-the-summonses.mjs'), api: settings().apiAddress, dir: folder() }))
    systemd({ active: true, enabled: true })
    try {
      const standing = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
      expect(standing.code, standing.text).toBe(200)
      expect(standing.said).toMatchObject({ unit: 'installed', running: true, enabled: true })
      expect.soft(standing.said.keyWorks, 'Settings counted the worker’s key as working').toBe(false)
      expect.soft(standing.said.page, 'Settings gave the page for the worker’s key').toBeNull()
    } finally {
      // Restore the absent unit before checking that the refused press writes nothing.
      rmSync(unitPath())
      systemd({ active: false, enabled: false })
    }
    const refused = await press()
    expect(refused.code, refused.text).toBe(409)
    expect(refused.said.error).toContain('Retire it on its page, then press install again')
    expect(toolRows()).toEqual(keysBefore)
    expect(snapshot()).toEqual(folderBefore)
    expect(existsSync(unitPath())).toBe(false)
    expect(theMailTool()).toEqual(agent)
    expect(revisions()).toEqual(historyBefore)
    expect(systemdCalls(from).some((call) => ['enable', 'restart'].includes(call[1]!))).toBe(false)
  })

})

describe('the unit’s first backup, which no later press writes over (round W26)', () => {
  it('25: keeps the first backup byte for byte through two later presses that each write the unit again, and names each copy', async () => {
    await installed()
    const first = aUnitForAnotherNode('/an/old/node')
    writeFileSync(unitPath(), first)
    const res1 = await press()
    expect(res1.code, res1.text.slice(0, 300)).toBe(200)
    expect(res1.said.wrote).toContain(`the unit it wrote before, copied to ${firstCopy()}`)
    const second = aUnitForAnotherNode('/a/second/old/node')
    writeFileSync(unitPath(), second)
    const res2 = await press()
    expect(res2.code, res2.text.slice(0, 300)).toBe(200)
    const third = aUnitForAnotherNode('/a/third/old/node')
    writeFileSync(unitPath(), third)
    const res3 = await press()
    expect(res3.code, res3.text.slice(0, 300)).toBe(200)

    expect(readFileSync(firstCopy(), 'utf8'), 'a later press wrote over the first backup').toBe(first)
    expect(readFileSync(laterCopy(2), 'utf8')).toBe(second)
    expect(readFileSync(laterCopy(3), 'utf8')).toBe(third)
    for (const [res, n] of [[res2, 2], [res3, 3]] as const) {
      expect(res.said).toMatchObject({ keyMade: false, service: 'restarted' })
      expect(res.said.wrote).toContain(`the unit it wrote before, copied to ${laterCopy(n)} (the first backup, at ${firstCopy()}, was not changed)`)
    }
    expect(readFileSync(unitPath(), 'utf8')).toContain(`ExecStart="${process.execPath}"`)
  })

  it('26: refuses when the copy fails for any reason but a taken name, and does not write the unit', async (context) => {
    // A FOLDER THE PRESS MAY NOT WRITE IN. The press makes its copy only where nothing is and takes the next name when
    // one is taken, so only another failure stops it. Root may write in any folder, so run as root this proves nothing.
    if (skippedAsRoot(context)) return
    await installed()
    const old = aUnitForAnotherNode('/an/old/node')
    writeFileSync(unitPath(), old)
    const from = systemdCalls().length
    chmodSync(dirname(unitPath()), 0o500)
    let refused: Awaited<ReturnType<typeof press>>
    try {
      refused = await press()
    } finally {
      chmodSync(dirname(unitPath()), 0o700)
    }
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    // THE REFUSAL IS THE BACKUP'S OWN. A press that went on past a failed copy would be refused at the write, in the
    // same folder.
    expect(refused.said.error).toContain(`The unit this press wrote before could not be backed up, so it was not written again: ${firstCopy()} (`)
    expect(readFileSync(unitPath(), 'utf8'), 'the unit changed although the backup failed').toBe(old)
    expect(existsSync(firstCopy())).toBe(false)
    const verbs = systemdCalls(from).map((call) => call[1])
    for (const verb of ['daemon-reload', 'enable', 'restart']) expect(verbs, `a refused press asked systemd to ${verb}`).not.toContain(verb)
  })

  it('27: takes its own copy away when the unit cannot be written, and leaves the first backup as it was', async () => {
    // A FOLDER WHERE THE PRESS'S TEMPORARY FILE GOES, so the unit cannot be written once the copy is made.
    await installed()
    const first = aUnitForAnotherNode('/an/old/node')
    writeFileSync(unitPath(), first)
    mkdirSync(theTemporaryFile())
    const refusedFirst = await press()
    expect(refusedFirst.code, refusedFirst.text.slice(0, 300)).toBe(409)
    expect(refusedFirst.said.error).toContain(`${unitPath()} could not be written, so it was left as it was: `)
    expect(refusedFirst.said.error).not.toContain('could not be removed')
    expect(readFileSync(unitPath(), 'utf8')).toBe(first)
    expect(existsSync(firstCopy()), 'a refused first press left a backup').toBe(false)

    rmSync(theTemporaryFile(), { recursive: true })
    expect((await press()).code).toBe(200)
    const changed = aUnitForAnotherNode('/a/second/old/node')
    writeFileSync(unitPath(), changed)
    mkdirSync(theTemporaryFile())
    const refusedLater = await press()
    expect(refusedLater.code, refusedLater.text.slice(0, 300)).toBe(409)
    expect(readFileSync(unitPath(), 'utf8')).toBe(changed)
    expect(readFileSync(firstCopy(), 'utf8'), 'a refused press wrote over the first backup').toBe(first)
    expect(existsSync(laterCopy(2)), 'a refused press left its copy').toBe(false)
  })

  it('28: says where its copy still is when the unit cannot be written and the copy cannot be taken away', async (context) => {
    if (skippedAsRoot(context)) return
    await installed()
    const old = aUnitForAnotherNode('/an/old/node')
    writeFileSync(unitPath(), old)
    const refused = await aFolderShutAfterTheCopy({ folder: dirname(unitPath()), copy: firstCopy(), temporary: theTemporaryFile() }, () => press())
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said.error).toContain(`${unitPath()} could not be written, so it was left as it was: `)
    expect(refused.said.error).toContain(` The copy of it this press made could not be removed, and is still at ${firstCopy()} (`)
    expect(readFileSync(unitPath(), 'utf8')).toBe(old)
    expect(readFileSync(firstCopy(), 'utf8'), 'the copy the refusal names is not the unit as it was').toBe(old)
  })
})

describe('the file written beside the path, taken away when the write fails, or said (round W27)', () => {
  it('29: writeWhole takes away the file it made beside the path when the rename fails, and throws what the rename said', () => {
    // A FOLDER WITH A FILE IN IT WHERE THE FILE GOES, so the rename fails after the file beside it is written.
    const path = join(scratch, 'a-folder-where-the-file-goes')
    mkdirSync(path)
    writeFileSync(join(path, 'kept'), 'kept')
    const beside = `${path}.${String(process.pid)}.new`
    try {
      expect(() => writeWhole(path, 'the new text', 0o600)).toThrow(`rename '${beside}' -> '${path}'`)
      expect(existsSync(beside), 'the file the write made beside the path was left').toBe(false)
      expect(readFileSync(join(path, 'kept'), 'utf8')).toBe('kept')
    } finally {
      rmSync(path, { recursive: true, force: true })
      rmSync(beside, { force: true })
    }
  })

  it('30: writeWhole says where the file beside the path still is when it cannot be taken away', async (context) => {
    // THE FOLDER SHUT ONCE THE WRITE HAS OPENED ITS FILE. Nothing is copied here, so the helper is given the file being
    // written as the copy to wait for. That file is already there, so the folder is shut before the write goes on.
    if (skippedAsRoot(context)) return
    const at = join(scratch, 'a-folder-shut-during-the-write')
    mkdirSync(at)
    const path = join(at, 'file')
    writeFileSync(path, 'as it was')
    const beside = `${path}.${String(process.pid)}.new`
    try {
      const writing = aFolderShutAfterTheCopy({ folder: at, copy: path, temporary: beside }, () => writeWhole(path, 'the new text', 0o600))
      await expect(writing).rejects.toThrow(`. The file this write made beside it could not be removed, and is still at ${beside} (`)
      expect(readFileSync(path, 'utf8')).toBe('as it was')
    } finally {
      rmSync(at, { recursive: true, force: true })
    }
  })
})

describe('a file where a folder of the service goes, refused with its code (round W28)', () => {
  it('31: install and turn-off refuse with their code, naming the file, and give no key, write nothing and ask systemd nothing', async () => {
    // A FILE WHERE THE FOLDER systemd GOES, so the service's path is under a file, not a folder.
    const theFile = dirname(dirname(unitPath()))
    mkdirSync(dirname(theFile), { recursive: true })
    writeFileSync(theFile, 'a file, not a folder')
    const from = systemdCalls().length
    for (const pressed of [press, turnOff]) {
      const refused = await pressed()
      expect(refused.code, refused.text.slice(0, 300)).toBe(409)
      expect(refused.said).toMatchObject({ code: 'mailToolUnderAFile', values: { path: theFile } })
      expect(refused.said.error).toBe(`${theFile} is a file, not a folder, so the mail tool's service at ${unitPath()} cannot be read or written. Nothing was changed. Move that file aside, and press again.`)
    }
    expect(readFileSync(theFile, 'utf8')).toBe('a file, not a folder')
    expect(existsSync(folder()), 'a refused press made the tool\'s folder').toBe(false)
    expect(systemdCalls(from), 'a refused press asked systemd').toEqual([])
    const read = await ask('GET', '/api/office/mail-tool', AS_THE_PERSON)
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.key, 'a refused press gave the tool a key').toBeNull()
  })
})
