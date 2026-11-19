// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START AT LOGIN IS THE PERSON'S PRESS, AND IT WRITES ONE SYSTEMD USER UNIT. Wave 13u, round 3, piece H9.
 *
 * src/config/start-at-login.mjs writes ~/.config/systemd/user/mole-office.service, which runs `mole-office watch` as its
 * main process, and enables it; src/server/api/start-at-login.ts is the person's door to it. Every case runs on
 * a scratch home with XDG_CONFIG_HOME and XDG_STATE_HOME inside it, and a stand-in systemctl and loginctl first on
 * PATH, which note each call, answer from a state file and start nothing. No real unit, systemd or home is touched.
 *
 *   1. The unit's text: Type=exec with ExecStart running this install's command with watch as its main process,
 *      KillMode=process so ending the unit kills neither the holder nor the server, no ExecStop and no RemainAfterExit,
 *      the database, port and PATH of this office, and no secret.
 *   2. The person's press on writes the unit, asks systemd to read it again and enables it, and never starts, stops or
 *      restarts anything; the read then says it starts at login.
 *   3. A second press writes nothing and asks systemd for nothing but its reads.
 *   4. A unit written for another office is read as out of date; the press copies it aside and writes it again.
 *   5. The person's press off disables the unit and keeps the file; a second press off changes nothing.
 *   6. An agent is refused 403 with its code at both doors, and nothing is written or asked of systemd.
 *   7. Without systemd for the person's login the read says so and the press is refused with its code; on another system
 *      the press says Linux only.
 *   8. A unit of that name the press did not write is refused with its code and left as it is.
 *   9. The read says whether lingering is on, and says nothing when loginctl does not answer.
 *  10. A test world is refused with its code.
 *  11. When systemd refuses to enable the unit, the press is refused with its code and says what was written.
 *  12. Two later presses that each find the unit out of date keep their own copies, at `-2` and `-3`, and the first
 *      backup stays byte for byte. The first press's words are what they were; a later press's name its own copy, then
 *      say the first backup was not changed (wave 13t, round W26).
 *  13. A copy that fails for any reason but a taken name refuses the press with its code, and the unit is not written.
 *  14. A press refused at the write, with its code, takes its own copy away. A first copy is then gone, and a later
 *      press leaves the first backup byte for byte.
 *  15. A press refused at the write whose copy cannot be taken away, and whose file written beside the unit cannot be
 *      taken away either, is refused with its own code, naming both, and its words name both. A page reads the
 *      refusal's code and values as the registry declares them (rounds W27 and W29).
 *  16. With no unit there yet, a press whose unit cannot be written is refused with its code, naming the unit, and not
 *      with a 500. A folder at the press's temporary name, which the write never opened, is still there (round W27).
 *  17. With no unit there yet, a press whose unit's folder cannot be made is refused the same way (round W27).
 *  18. A file where a folder of the unit goes: the read and both presses are refused 409 with their own code, naming
 *      that file, and not with a 500. Nothing is asked of systemd and the file is left as it is (round W28).
 *  19. With no unit there yet, a press whose unit cannot be written and whose file written beside the unit cannot be
 *      taken away is refused with its own code, naming that file, so its words no longer say nothing changed (round
 *      W28).
 *  20. A press refused at the write whose copy cannot be taken away, when nothing is left beside the unit, keeps the
 *      code that names the copy alone (round W29).
 *  21. A press refused at the write whose file written beside the unit cannot be taken away, when its copy is taken
 *      away, is refused with its own code, naming that file, so its words no longer say nothing changed. A page reads
 *      the code with the values its door sends, as the registry declares them (round W29).
 *  Cases 13, 15, 17, 19 and 20 need a folder the press may not write in, so where a shut folder takes a write, as it
 *  does for root, they skip and say why (tests/root-may-write-in-any-folder.ts, rounds W27 and W28).
 *  Cases 20 and 21 give the press a stand-in for its write. The copy and the file written beside the unit are in the
 *  unit's folder, so no folder can be made to keep one of them and let the other go (round W29).
 *
 * MUTATIONS (each after a control run; the commit message names the runs and the logs):
 *   - KillMode=process taken out of the unit: case 1 goes red.
 *   - `enable` sent as `enable --now`: case 2 goes red.
 *   - the person's check taken off the press: case 6 goes red.
 *   - systemd's refusal to enable not checked: case 11 goes red.
 *   - the copy made over whatever is at the first name (round W26): cases 12 and 14 go red.
 *   - a copy that failed not a refusal, so the press goes on to the write (round W26): case 13 goes red.
 *   - a press refused at the write leaves its copy (round W26): cases 14 and 15 go red.
 *   - a refusal whose copy could not be taken away given the code of one that took it away (round W26): case 15 goes red.
 *   - a later press's words name its own copy and not the first (round W26): case 12 goes red.
 *   - a first unit's failed write not caught, so the press answers 500 again (round W27): cases 16 and 17 go red.
 *   - the unit's folder made before the catch (round W27): case 17 goes red.
 *   - writeWhole's file beside the unit left unsaid when it cannot be taken away (round W27): case 15 goes red.
 *   - writeWhole taking away whatever is at its temporary name, though it never opened it (round W27): cases 14 and 16
 *     go red.
 *   - readOrNull throws a path under a file as it did before round W28, so it answers 500: case 18 goes red.
 *   - the read's door lets a file where a folder of the unit goes through, as a 500 (round W28): case 18 goes red.
 *   - both presses let a file where a folder of the unit goes through, as a 500 (round W28): case 18 goes red.
 *   - a first unit whose file beside it is left given the code of one that was not written (round W28): case 19 goes
 *     red.
 *   - a unit kept whose file beside it is left given the code of one that was not written, by writeTheUnit or by the
 *     press's list of codes (round W29): case 21 goes red, each time.
 *   - a unit kept whose copy and file beside it are both left given the code that names the copy alone, by writeTheUnit
 *     or by the press's list of codes (round W29): case 15 goes red, each time.
 *   - the file beside the unit not passed on to the door, or by the door to its values (round W29): case 15 goes red,
 *     each time.
 *   - the press's stand-in for its write not passed on to the unit's write (round W29): cases 20 and 21 go red.
 *   - the words of a unit kept whose file beside it is left say that nothing was changed (round W29): case 21 goes red.
 *   - the words of a unit kept whose copy and file beside it are both left name the copy alone (round W29): case 15
 *     goes red.
 *   - the code of a unit kept whose copy and file beside it are both left declared without beside, so a page cannot
 *     read the refusal (round W29): case 15 goes red.
 *   - the code of a unit kept whose file beside it is left declared with beside too (round W29): case 21 goes red.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { aFolderShutAfterTheCopy } from './a-folder-shut-after-the-copy.ts'
import { skippedAsRoot } from './root-may-write-in-any-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13t } from '../src/shared/words/en-wave-13t.ts'
import { readRefusal } from '../src/shared/refusal-codes.ts'
import { TheFileBesideIsLeft } from '../src/config/the-mail-tool.mjs'
import {
  START_AT_LOGIN_BACKUP_SUFFIX,
  START_AT_LOGIN_UNIT,
  START_AT_LOGIN_UNIT_MARK,
  theOfficeThisServerIs,
  theStartAtLoginUnit,
  theStartAtLoginUnitPath,
  turnStartAtLoginOn,
} from '../src/config/start-at-login.mjs'
import { howToStart, settings } from '../src/config/settings.mjs'

let t: TestDb
let app: FastifyInstance
let scratch = ''
let home = ''
let systemdState = ''
let systemdLog = ''
let workerKey = ''
const A_SECRET = 'fixture-secret-that-must-not-reach-the-unit-7d1f'
const before = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ code: number; said: any; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body }
}

const press = (on: boolean) => ask('POST', '/api/office/start-at-login', AS_THE_PERSON, { on })
const read = () => ask('GET', '/api/office/start-at-login', AS_THE_PERSON)

/** What the stand-in systemd and loginctl say. */
function systemd(state: { down?: boolean; active?: boolean; enabled?: boolean; refuseEnable?: boolean; linger?: 'yes' | 'no' | 'fail' }): void {
  const now = existsSync(systemdState) ? (JSON.parse(readFileSync(systemdState, 'utf8')) as Record<string, unknown>) : {}
  writeFileSync(systemdState, JSON.stringify({ ...now, ...state }))
}

/** Every call the stand-in programs were asked since `from`, as the program and its arguments. */
function calls(from = 0): string[][] {
  if (!existsSync(systemdLog)) return []
  return readFileSync(systemdLog, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as string[])
    .slice(from)
}

/** The systemctl calls since `from`, each as its words after --user. */
const systemctlVerbs = (from: number) => calls(from).filter((call) => call[0] === 'systemctl').map((call) => call.slice(2).join(' '))

const unitPath = () => theStartAtLoginUnitPath(home)
const firstCopy = () => `${unitPath()}${START_AT_LOGIN_BACKUP_SUFFIX}`
/** Where a later press puts its copy when the first backup is there: `-2`, then `-3` and on (round W26). */
const laterCopy = (n: number) => `${firstCopy()}-${String(n)}`
/** The press's temporary file, the unit written whole before it is renamed into place. */
const theTemporaryFile = () => `${unitPath()}.${String(process.pid)}.new`
/** The English words a page shows for a refusal's code. */
const theWordsFor = (code: unknown) => (enWave13t as Record<string, unknown>)[`server.${String(code)}`]

/** Put a unit the press wrote for another office where the unit goes, and give back its text. */
function aUnitForAnotherOffice(databasePath: string): string {
  const other = theStartAtLoginUnit({ ...theOfficeThisServerIs(), databasePath })
  mkdirSync(dirname(unitPath()), { recursive: true })
  writeFileSync(unitPath(), other)
  return other
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'start-at-login-test-'))
  home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  systemdState = join(scratch, 'systemd.json')
  systemdLog = join(scratch, 'calls.log')
  systemd({ down: false, active: false, enabled: false, linger: 'no' })
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
if (verb === 'enable' && state.refuseEnable) { process.stderr.write('Failed to enable unit: Access denied\\n'); process.exit(1) }
if (verb === 'enable' && args.length === 3) { state.enabled = true; save(); process.exit(0) }
if (verb === 'disable' && args.length === 3) { state.enabled = false; save(); process.exit(0) }
process.stderr.write('The stand-in does not take: ' + args.join(' ') + '\\n'); process.exit(1)
`,
  )
  writeFileSync(
    join(bin, 'loginctl'),
    `${head('loginctl')}
if (args[0] !== 'show-user' || args[2] !== '--property=Linger' || args[3] !== '--value') { process.stderr.write('not this\\n'); process.exit(1) }
if (state.linger === 'fail') { process.stderr.write('Failed to get user: No such user\\n'); process.exit(1) }
process.stdout.write(state.linger + '\\n'); process.exit(0)
`,
  )
  chmodSync(join(bin, 'systemctl'), 0o755)
  chmodSync(join(bin, 'loginctl'), 0o755)
  process.env.HOME = home
  process.env.PATH = `${bin}:${String(process.env.PATH)}`
  process.env.XDG_CONFIG_HOME = join(home, '.config')
  process.env.XDG_STATE_HOME = join(home, '.local', 'state')
  // A SECRET IN THE SERVER'S OWN ENVIRONMENT, which the unit must not carry.
  process.env.ANTHROPIC_API_KEY = A_SECRET

  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-worker', name: 'A worker', role: 'worker' })
  expect(started.code, started.text.slice(0, 300)).toBe(201)
  workerKey = String(started.said.whatToGiveIt?.key ?? '')
  expect(workerKey).not.toBe('')
  // A WHOLE APP IS BUILT HERE, which takes more than the ten-second default on a busy machine.
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

beforeEach(() => {
  rmSync(join(home, '.config'), { recursive: true, force: true })
  writeFileSync(systemdState, JSON.stringify({ down: false, active: false, enabled: false, linger: 'no' }))
})

describe('start at login', () => {
  it('1: the unit runs watch as its main process, kills neither the holder nor the server, and carries no secret', () => {
    const office = theOfficeThisServerIs()
    const unit = theStartAtLoginUnit(office)
    const lines = unit.split('\n')
    const command = howToStart('command')
    const run = (verb: string) => [command.command, ...command.args, verb].map((word) => `"${word}"`).join(' ')
    expect(lines[0]).toBe(START_AT_LOGIN_UNIT_MARK)
    expect(lines).toContain('Type=exec')
    expect(lines.filter((line) => line.startsWith('RemainAfterExit='))).toEqual([])
    expect(lines).toContain(`ExecStart=${run('watch')}`)
    expect(lines.filter((line) => line.startsWith('ExecStop='))).toEqual([])
    expect(lines, 'the default kill mode would kill the holder that stop leaves running').toContain('KillMode=process')
    expect(lines).toContain('Restart=on-failure')
    expect(lines).toContain('WantedBy=default.target')
    // THE OFFICE IT STARTS IS THIS ONE: its database and port, and the PATH it runs with. Nothing else from the
    // environment, and no secret.
    expect(lines.filter((line) => line.startsWith('Environment='))).toEqual([
      `Environment="MOLE_OFFICE_DB=${settings().databasePath}"`,
      `Environment="MOLE_OFFICE_PORT=${String(settings().apiPort)}"`,
      `Environment="PATH=${String(process.env.PATH).replace(/\$/g, '$$$$')}"`,
    ])
    expect(unit).not.toContain(A_SECRET)
    // A % IS A SPECIFIER AND A $ A VARIABLE TO systemd, so each is doubled in a path.
    const odd = theStartAtLoginUnit({ ...office, databasePath: '/tmp/a%b$c/office.db' })
    expect(odd).toContain('Environment="MOLE_OFFICE_DB=/tmp/a%%b$$c/office.db"')
  })

  it('2: the person\'s press on writes the unit, has systemd read it and enables it, and starts, stops or restarts nothing', async () => {
    const from = calls().length
    const done = await press(true)
    expect(done.code, done.text.slice(0, 300)).toBe(200)
    expect(done.said).toMatchObject({ turned: 'on' })
    expect(done.said.wrote).toEqual([`the unit, into ${unitPath()}`])
    expect(readFileSync(unitPath(), 'utf8')).toBe(theStartAtLoginUnit(theOfficeThisServerIs()))
    expect(unitPath()).toBe(join(home, '.config', 'systemd', 'user', START_AT_LOGIN_UNIT))
    for (const call of calls(from).filter((one) => one[0] === 'systemctl')) expect(call[1]).toBe('--user')
    expect(systemctlVerbs(from)).toEqual(['show-environment', 'daemon-reload', `is-enabled ${START_AT_LOGIN_UNIT}`, `enable ${START_AT_LOGIN_UNIT}`])
    const after = await read()
    expect(after.code, after.text.slice(0, 300)).toBe(200)
    expect(after.said).toMatchObject({ systemd: 'answers', unit: 'current', startsAtLogin: true, enabledWord: 'enabled', activeWord: 'inactive', linger: 'no' })
  })

  it('3: a second press on writes nothing and asks systemd only what it reads', async () => {
    expect((await press(true)).code).toBe(200)
    const from = calls().length
    const again = await press(true)
    expect(again.code, again.text.slice(0, 300)).toBe(200)
    expect(again.said).toMatchObject({ turned: 'already on', wrote: [] })
    expect(systemctlVerbs(from)).toEqual(['show-environment', `is-enabled ${START_AT_LOGIN_UNIT}`])
  })

  it('4: a unit written for another office is out of date; the press copies it aside and writes it again', async () => {
    const other = theStartAtLoginUnit({ ...theOfficeThisServerIs(), databasePath: '/somewhere/else/office.db' })
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), other)
    systemd({ enabled: true })
    const seen = await read()
    expect(seen.said).toMatchObject({ unit: 'out of date', startsAtLogin: true })
    const from = calls().length
    const done = await press(true)
    expect(done.code, done.text.slice(0, 300)).toBe(200)
    expect(done.said.turned).toBe('already on')
    expect(readFileSync(`${unitPath()}${START_AT_LOGIN_BACKUP_SUFFIX}`, 'utf8')).toBe(other)
    expect(readFileSync(unitPath(), 'utf8')).toBe(theStartAtLoginUnit(theOfficeThisServerIs()))
    expect(systemctlVerbs(from)).toContain('daemon-reload')
    expect((await read()).said.unit).toBe('current')
  })

  it('5: the person\'s press off disables the unit and keeps its file; a second press off changes nothing', async () => {
    expect((await press(true)).code).toBe(200)
    const unitBefore = readFileSync(unitPath(), 'utf8')
    const from = calls().length
    const off = await press(false)
    expect(off.code, off.text.slice(0, 300)).toBe(200)
    expect(off.said).toMatchObject({ turned: 'off', wrote: [] })
    expect(systemctlVerbs(from)).toEqual([`is-enabled ${START_AT_LOGIN_UNIT}`, `disable ${START_AT_LOGIN_UNIT}`])
    expect(readFileSync(unitPath(), 'utf8')).toBe(unitBefore)
    expect((await read()).said).toMatchObject({ unit: 'current', startsAtLogin: false })
    const from2 = calls().length
    const again = await press(false)
    expect(again.said.turned).toBe('already off')
    expect(systemctlVerbs(from2)).toEqual([`is-enabled ${START_AT_LOGIN_UNIT}`])
  })

  it('6: refuses an agent at both doors with its code, and writes and asks nothing', async () => {
    const from = calls().length
    for (const headers of <Record<string, string>[]>[
      { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': workerKey },
      { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-worker' },
    ]) {
      const pressed = await ask('POST', '/api/office/start-at-login', headers, { on: true })
      expect(pressed.code, pressed.text.slice(0, 300)).toBe(403)
      expect(pressed.said.code).toBe('startAtLoginOnlyThePerson')
      const seen = await ask('GET', '/api/office/start-at-login', headers)
      expect(seen.code, seen.text.slice(0, 300)).toBe(403)
      expect(seen.said.code).toBe('startAtLoginOnlyThePerson')
    }
    expect(existsSync(unitPath())).toBe(false)
    expect(calls(from)).toEqual([])
  })

  it('7: says so when systemd does not answer for the person\'s login, and refuses the press; says Linux only elsewhere', async () => {
    systemd({ down: true })
    const seen = await read()
    expect(seen.code, seen.text.slice(0, 300)).toBe(200)
    expect(seen.said).toMatchObject({ systemd: 'no answer', startsAtLogin: null, linger: null })
    expect(seen.said.says).toContain('systemd does not answer')
    const refused = await press(true)
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said.code).toBe('startAtLoginNoSystemd')
    expect(existsSync(unitPath())).toBe(false)
    const elsewhere = turnStartAtLoginOn({ home, office: theOfficeThisServerIs(), platform: 'darwin' })
    expect(elsewhere).toMatchObject({ ok: false, code: 'startAtLoginNotLinux' })
    expect(existsSync(unitPath())).toBe(false)
  })

  it('8: refuses a unit of that name the press did not write, and leaves it as it is', async () => {
    mkdirSync(dirname(unitPath()), { recursive: true })
    writeFileSync(unitPath(), '[Service]\nExecStart=/usr/bin/true\n')
    for (const on of [true, false]) {
      const refused = await press(on)
      expect(refused.code, refused.text.slice(0, 300)).toBe(409)
      expect(refused.said).toMatchObject({ code: 'startAtLoginNotOurs', values: { path: unitPath() } })
    }
    expect(readFileSync(unitPath(), 'utf8')).toBe('[Service]\nExecStart=/usr/bin/true\n')
    expect((await read()).said).toMatchObject({ unit: 'not ours', startsAtLogin: null })
  })

  it('9: reads whether lingering is on, and gives no answer when loginctl gives none', async () => {
    systemd({ linger: 'yes' })
    expect((await read()).said.linger).toBe('yes')
    systemd({ linger: 'fail' })
    expect((await read()).said.linger).toBeNull()
  })

  it('10: refuses the person\'s press inside a test world, and writes nothing', async () => {
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'so'
    vi.resetModules()
    const world = (await apiApp()).app
    try {
      await world.ready()
      const refused = await world.inject({ method: 'POST', url: '/api/office/start-at-login', headers: AS_THE_PERSON, payload: { on: true } })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(409)
      expect((refused.json() as { code: string }).code).toBe('startAtLoginTestWorld')
    } finally {
      await world.close()
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    }
    expect(existsSync(unitPath())).toBe(false)
  })

  it('11: says what was written when systemd refuses to enable the unit, with its code', async () => {
    systemd({ refuseEnable: true })
    const refused = await press(true)
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said.code).toBe('startAtLoginSystemdRefused')
    expect(refused.said.error).toContain(`the unit, into ${unitPath()} were written`)
    expect(refused.said.error).toContain('Access denied')
    expect((await read()).said).toMatchObject({ unit: 'current', startsAtLogin: false })
  })

  it('12: keeps the first backup byte for byte through two later presses that each write the unit again, and names each copy', async () => {
    const first = aUnitForAnotherOffice('/somewhere/else/office.db')
    const res1 = await press(true)
    expect(res1.code, res1.text.slice(0, 300)).toBe(200)
    expect(res1.said.wrote).toEqual([`the unit it wrote before, copied to ${firstCopy()}`, `the unit, into ${unitPath()}`])
    const second = aUnitForAnotherOffice('/a/second/place/office.db')
    const res2 = await press(true)
    expect(res2.code, res2.text.slice(0, 300)).toBe(200)
    const third = aUnitForAnotherOffice('/a/third/place/office.db')
    const res3 = await press(true)
    expect(res3.code, res3.text.slice(0, 300)).toBe(200)

    expect(readFileSync(firstCopy(), 'utf8'), 'a later press wrote over the first backup').toBe(first)
    expect(readFileSync(laterCopy(2), 'utf8')).toBe(second)
    expect(readFileSync(laterCopy(3), 'utf8')).toBe(third)
    for (const [res, n] of [[res2, 2], [res3, 3]] as const) {
      expect(res.said.wrote).toEqual([
        `the unit it wrote before, copied to ${laterCopy(n)} (the first backup, at ${firstCopy()}, was not changed)`,
        `the unit, into ${unitPath()}`,
      ])
    }
    expect(readFileSync(unitPath(), 'utf8')).toBe(theStartAtLoginUnit(theOfficeThisServerIs()))
  })

  it('13: refuses with its code when the copy fails for any reason but a taken name, and does not write the unit', async (context) => {
    // A FOLDER THE PRESS MAY NOT WRITE IN. The press makes its copy only where nothing is and takes the next name when
    // one is taken, so only another failure stops it. Root may write in any folder, so run as root this proves nothing.
    if (skippedAsRoot(context)) return
    const old = aUnitForAnotherOffice('/somewhere/else/office.db')
    const from = calls().length
    chmodSync(dirname(unitPath()), 0o500)
    let refused: Awaited<ReturnType<typeof press>>
    try {
      refused = await press(true)
    } finally {
      chmodSync(dirname(unitPath()), 0o700)
    }
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said).toMatchObject({ code: 'startAtLoginNotBackedUp', values: { path: firstCopy() } })
    expect(refused.said.error).toContain(`The unit this press wrote before could not be backed up, so it was not written again: ${firstCopy()} (`)
    expect(readFileSync(unitPath(), 'utf8'), 'the unit changed although the backup failed').toBe(old)
    expect(existsSync(firstCopy())).toBe(false)
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })

  it('14: takes its own copy away when the unit cannot be written, with its code, and leaves the first backup as it was', async () => {
    // A FOLDER WHERE THE PRESS'S TEMPORARY FILE GOES, so the unit cannot be written once the copy is made.
    const first = aUnitForAnotherOffice('/somewhere/else/office.db')
    mkdirSync(theTemporaryFile())
    const refusedFirst = await press(true)
    expect(refusedFirst.code, refusedFirst.text.slice(0, 300)).toBe(409)
    expect(refusedFirst.said).toMatchObject({ code: 'startAtLoginNotWritten', values: { path: unitPath() } })
    expect(refusedFirst.said.error).toContain(`${unitPath()} could not be written, so it was left as it was: `)
    expect(refusedFirst.said.error).not.toContain('could not be removed')
    expect(readFileSync(unitPath(), 'utf8')).toBe(first)
    expect(existsSync(firstCopy()), 'a refused first press left a backup').toBe(false)

    rmSync(theTemporaryFile(), { recursive: true })
    expect((await press(true)).code).toBe(200)
    const changed = aUnitForAnotherOffice('/a/second/place/office.db')
    mkdirSync(theTemporaryFile())
    const refusedLater = await press(true)
    expect(refusedLater.code, refusedLater.text.slice(0, 300)).toBe(409)
    expect(refusedLater.said.code).toBe('startAtLoginNotWritten')
    expect(readFileSync(unitPath(), 'utf8')).toBe(changed)
    expect(readFileSync(firstCopy(), 'utf8'), 'a refused press wrote over the first backup').toBe(first)
    expect(existsSync(laterCopy(2)), 'a refused press left its copy').toBe(false)
  })

  it('15: refuses with its own code, naming the copy and the file written beside the unit, when the unit cannot be written and neither can be taken away', async (context) => {
    if (skippedAsRoot(context)) return
    const old = aUnitForAnotherOffice('/somewhere/else/office.db')
    const refused = await aFolderShutAfterTheCopy({ folder: dirname(unitPath()), copy: firstCopy(), temporary: theTemporaryFile() }, () => press(true))
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said).toMatchObject({ code: 'startAtLoginCopyAndFileLeft', values: { path: firstCopy(), beside: theTemporaryFile() } })
    // A PAGE READS A CODED REFUSAL ONLY WHEN ITS VALUES ARE THE REGISTRY'S, and otherwise shows the server's sentence.
    expect(readRefusal(refused.said.code, refused.said.values)).toEqual({ code: 'startAtLoginCopyAndFileLeft', values: { path: firstCopy(), beside: theTemporaryFile() } })
    expect(theWordsFor(refused.said.code)).toBe(
      'The unit could not be written, so it was left as it was. The copy of it this press made could not be removed, and is still at {path}. The file this press wrote beside it could not be removed either, and is still at {beside}.',
    )
    expect(refused.said.error).toContain(`${unitPath()} could not be written, so it was left as it was: `)
    expect(refused.said.error).toContain(` The copy of it this press made could not be removed, and is still at ${firstCopy()} (`)
    expect(refused.said.error).toContain(`. The file this write made beside it could not be removed, and is still at ${theTemporaryFile()} (`)
    expect(readFileSync(unitPath(), 'utf8')).toBe(old)
    expect(readFileSync(firstCopy(), 'utf8'), 'the copy the refusal names is not the unit as it was').toBe(old)
  })

  it('16: refuses with its code, naming the unit, when there is no unit yet and it cannot be written', async () => {
    // A FOLDER WHERE THE PRESS'S TEMPORARY FILE GOES, and no unit, so there is nothing to copy and the first write fails.
    mkdirSync(theTemporaryFile(), { recursive: true })
    const from = calls().length
    const refused = await press(true)
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said).toMatchObject({ code: 'startAtLoginNotWritten', values: { path: unitPath() } })
    expect(refused.said.error).toContain(`${unitPath()} could not be written, so there is still no unit there: `)
    expect(refused.said.error).not.toContain('could not be removed')
    expect(existsSync(unitPath())).toBe(false)
    expect(existsSync(theTemporaryFile()), 'the write took away a folder it never made').toBe(true)
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })

  it('17: refuses with its code, naming the unit, when there is no unit yet and its folder cannot be made', async (context) => {
    // A FOLDER THE PRESS MAY NOT WRITE IN, WHERE THE UNIT'S FOLDER GOES. Root may write in any folder.
    if (skippedAsRoot(context)) return
    const above = dirname(dirname(unitPath()))
    mkdirSync(above, { recursive: true })
    const from = calls().length
    chmodSync(above, 0o500)
    let refused: Awaited<ReturnType<typeof press>>
    try {
      refused = await press(true)
    } finally {
      chmodSync(above, 0o700)
    }
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said).toMatchObject({ code: 'startAtLoginNotWritten', values: { path: unitPath() } })
    expect(refused.said.error).toContain(`${unitPath()} could not be written, so there is still no unit there: `)
    expect(existsSync(dirname(unitPath()))).toBe(false)
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })

  it('18: the read and both presses refuse with their code, naming the file, when a file stands where a folder of the unit goes', async () => {
    // A FILE WHERE THE FOLDER systemd GOES, so the unit's path is under a file, not a folder.
    const theFile = dirname(dirname(unitPath()))
    mkdirSync(dirname(theFile), { recursive: true })
    writeFileSync(theFile, 'a file, not a folder')
    const from = calls().length
    for (const asked of [read, () => press(true), () => press(false)]) {
      const refused = await asked()
      expect(refused.code, refused.text.slice(0, 300)).toBe(409)
      expect(refused.said).toMatchObject({ code: 'startAtLoginUnderAFile', values: { path: theFile } })
      expect(refused.said.error).toBe(`${theFile} is a file, not a folder, so the unit at ${unitPath()} cannot be read or written. Nothing was changed. Move that file aside, and try again.`)
    }
    expect(readFileSync(theFile, 'utf8')).toBe('a file, not a folder')
    expect(calls(from), 'a refused read or press asked systemd or loginctl').toEqual([])
  })

  it('19: refuses with its own code, naming the file written beside the unit, when there is no unit yet, it cannot be written, and that file cannot be taken away', async (context) => {
    // THE UNIT'S FOLDER SHUT ONCE THE WRITE HAS OPENED ITS FILE. There is no unit and so no copy, so the helper is given
    // the folder itself as the copy to wait for. It is already there, so the folder is shut before the write goes on.
    if (skippedAsRoot(context)) return
    mkdirSync(dirname(unitPath()), { recursive: true })
    const from = calls().length
    const refused = await aFolderShutAfterTheCopy({ folder: dirname(unitPath()), copy: dirname(unitPath()), temporary: theTemporaryFile() }, () => press(true))
    expect(refused.code, refused.text.slice(0, 300)).toBe(409)
    expect(refused.said).toMatchObject({ code: 'startAtLoginFileLeft', values: { path: theTemporaryFile() } })
    expect(refused.said.error).toContain(`${unitPath()} could not be written, so there is still no unit there: `)
    expect(refused.said.error).toContain(`. The file this write made beside it could not be removed, and is still at ${theTemporaryFile()} (`)
    expect(existsSync(unitPath())).toBe(false)
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })

  it('20: keeps the code that names the copy alone, when the unit cannot be written, the copy cannot be taken away, and nothing was left beside the unit', (context) => {
    // A STAND-IN FOR THE WRITE, which shuts the unit's folder once the copy is made and fails before it makes anything
    // beside the unit.
    if (skippedAsRoot(context)) return
    const old = aUnitForAnotherOffice('/somewhere/else/office.db')
    const from = calls().length
    let done: ReturnType<typeof turnStartAtLoginOn>
    try {
      done = turnStartAtLoginOn({
        home,
        office: theOfficeThisServerIs(),
        writeWhole: () => {
          chmodSync(dirname(unitPath()), 0o500)
          throw new Error('a stand-in write that failed')
        },
      })
    } finally {
      chmodSync(dirname(unitPath()), 0o700)
    }
    expect(done).toMatchObject({ ok: false, code: 'startAtLoginCopyLeft', path: firstCopy() })
    expect(done).not.toHaveProperty('beside')
    expect(done.says).toContain(`${unitPath()} could not be written, so it was left as it was: Error: a stand-in write that failed. The copy of it this press made could not be removed, and is still at ${firstCopy()} (`)
    expect(done.says).not.toContain('beside it')
    expect(readFileSync(unitPath(), 'utf8')).toBe(old)
    expect(readFileSync(firstCopy(), 'utf8'), 'the copy the refusal names is not the unit as it was').toBe(old)
    expect(existsSync(theTemporaryFile())).toBe(false)
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })

  it('21: refuses with its own code, naming the file written beside the unit, when the unit cannot be written, that file cannot be taken away and the copy can', () => {
    // A STAND-IN FOR THE WRITE, which leaves a file beside the unit and throws as writeWhole does when it cannot take
    // that file away. The unit's folder stays open, so the copy is taken away.
    const old = aUnitForAnotherOffice('/somewhere/else/office.db')
    const from = calls().length
    const done = turnStartAtLoginOn({
      home,
      office: theOfficeThisServerIs(),
      writeWhole: (path) => {
        const beside = `${path}.${String(process.pid)}.new`
        writeFileSync(beside, 'half a unit')
        throw new TheFileBesideIsLeft(new Error('a stand-in write that failed'), beside, new Error('a stand-in removal that failed'))
      },
    })
    expect(done).toMatchObject({ ok: false, code: 'startAtLoginUnitKeptFileLeft', path: theTemporaryFile() })
    expect(done).not.toHaveProperty('beside')
    // THE VALUES THE DOOR SENDS FOR IT, its path and no beside (src/server/api/start-at-login.ts), are the ones a page reads.
    expect(readRefusal((done as { code?: unknown }).code, { path: theTemporaryFile() })).toEqual({ code: 'startAtLoginUnitKeptFileLeft', values: { path: theTemporaryFile() } })
    expect(done.says).toBe(
      `${unitPath()} could not be written, so it was left as it was: Error: a stand-in write that failed. The file this write made beside it could not be removed, and is still at ${theTemporaryFile()} (a stand-in removal that failed).`,
    )
    expect(theWordsFor((done as { code?: unknown }).code)).toBe(
      'The unit could not be written, so it was left as it was. The file this press wrote beside it could not be removed, and is still at {path}.',
    )
    expect(readFileSync(unitPath(), 'utf8')).toBe(old)
    expect(existsSync(firstCopy()), 'the press left its copy, though the copy could be taken away').toBe(false)
    expect(readFileSync(theTemporaryFile(), 'utf8')).toBe('half a unit')
    expect(systemctlVerbs(from)).toEqual(['show-environment'])
  })
})
