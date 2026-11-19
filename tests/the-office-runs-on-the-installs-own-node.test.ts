// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE RUNS ITS OWN SCRIPTS ON THE INSTALL'S OWN NODE: one answer, `theInstallsNode` in src/config/settings.mjs.
 *
 * The Linux installers carry no Node of their own. There the window, the server, the worker, the command and the
 * terminal holder all run on the app's own program, which opens the app unless ELECTRON_RUN_AS_NODE=1 tells it to run
 * as Node. The Windows and Mac installers still carry a Node, and the RunAsNode fuse stays off in their app.
 *
 * The variable is taken out of every office program's own environment as it starts, and given back only to a start of
 * an office program. So a program the office missed fails at once, because the app opens, and the person's own tools
 * are never given it. tests/no-terminal-or-agent-is-given-electron-run-as-node.test.ts reads a terminal's and an agent's
 * environment from a running office.
 *
 *   1-5. The one answer. 1: from a checkout, the Node that runs this process, or `node` on PATH by name, with nothing
 *        to set. 2: from a Linux bundle, the program that runs this process with the variable, asked either way.
 *        3: from a Windows or a Mac bundle, the Node the installation carries by name, or the Node that runs this
 *        process. 4: the answer as the start of a line sh runs, and that line runs a script that is given the variable.
 *        5: howToStart's starts from a checkout set nothing.
 *   6-8. The variable at entry. 6: a process started with it that imports src/config/settings.mjs no longer has it,
 *        and a program it starts is not given it. 7: the same for src/config/tmux-pane-view.mjs, which imports none of
 *        the office's code. 8: a login unit and a hook line written for a Linux bundle give it back.
 *   9-11. The hook lines an older Linux version wrote, which ran the hook with the Node it carried at runtime/bin/node
 *        (`keepTheOlderHookLines` in src/config/install-the-entry.mjs). 9: once that Node is gone, each is written again
 *        with the app's own program, runs as written with no Node on PATH, and nothing else in the file changes.
 *        10: a second start finds nothing to write. 11: nothing is written while that Node is there, for a line the
 *        press did not write, in an AppImage, in a folder with no build stamp, or on Windows.
 *   12-13. The login unit an older Linux version wrote (`keepTheOlderUnit` in src/config/start-at-login.mjs). 12: once
 *        that Node is gone, its ExecStart is written again, the variable is added, systemd reads it again, and no other
 *        line changes. 13: nothing is written while that Node is there, for a unit the press did not write, for a unit
 *        that names another command, or for an office that needs nothing set.
 *   14. The container drivers (tests/installed/ask-until.mjs): the environment they give what they start drops the
 *       variable, and the app's own program beside resources/ is an installation's own Node.
 *
 * Built folders and stand-ins only. Nothing is installed, no systemd is asked, and no live office is read.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ENTRY_HOOK_TIMEOUT_SECONDS, keepTheOlderHookLines, theEntryCommand } from '../src/config/install-the-entry.mjs'
import { REPO_ROOT, RUN_AS_NODE, howToStart, theInstallsNode, theInstallsNodeInALine } from '../src/config/settings.mjs'
import { START_AT_LOGIN_BACKUP_SUFFIX, keepTheOlderUnit, theStartAtLoginUnit, theStartAtLoginUnitPath } from '../src/config/start-at-login.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER } from '../src/config/systems/the-installer-of-a-folder.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { aPlainEnvironment, isTheInstallationsOwnNode } from './installed/ask-until.mjs'

let scratch: string
let home: string
let noNode: string

/** The settings file of the made-up home. */
const settingsPath = (): string => join(home, '.claude', 'settings.json')
/** The built session hook an installed office carries. */
const hookOf = (office: string): string => join(office, 'for-agents', 'session-hook.mjs')
/** Where an older Linux version kept the Node it carried, written out here rather than asked of the office's code. */
const theOlderNodeOf = (office: string): string => join(office, 'runtime', 'bin', 'node')

/**
 * A made-up Linux installation: the office folder inside it, with its build stamp and a built hook that prints the word
 * it was run with and whether it was told to run as Node. With `withTheOlderNode` the office still carries the Node an
 * older version carried, as a file.
 */
function aLinuxInstallation(withTheOlderNode = false): { root: string; office: string } {
  const root = join(scratch, 'opt', 'mole-office')
  const office = join(root, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)
  mkdirSync(dirname(hookOf(office)), { recursive: true })
  writeFileSync(join(office, 'build-stamp.json'), `${JSON.stringify({ version: '0.0.0-made-up', builtAt: '2026-11-01T00:00:00.000Z' })}\n`, 'utf8')
  writeFileSync(
    hookOf(office),
    "process.stdout.write(`the made-up hook ran with ${process.argv.slice(2).join(' ')}, ELECTRON_RUN_AS_NODE ${String(process.env.ELECTRON_RUN_AS_NODE)}`)\n",
    'utf8',
  )
  if (withTheOlderNode) {
    mkdirSync(dirname(theOlderNodeOf(office)), { recursive: true })
    writeFileSync(theOlderNodeOf(office), '', 'utf8')
  }
  return { root, office }
}

/** A hook line exactly as an older Linux version's press wrote it: the Node it carried and the hook, each quoted. */
const anOlderLine = (office: string, mode: 'start' | 'stop' | 'end'): string => `"${theOlderNodeOf(office)}" "${hookOf(office)}" ${mode}`

/** A hook group as the press writes one. */
const aGroup = (command: string): unknown => ({ matcher: '', hooks: [{ type: 'command', command, timeout: ENTRY_HOOK_TIMEOUT_SECONDS }] })

/** The person's settings file with their own line first and the three lines an older version wrote after it. */
function theOlderSettings(office: string): string {
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [aGroup('echo another tool'), aGroup(anOlderLine(office, 'start'))],
        Stop: [aGroup(anOlderLine(office, 'stop'))],
        SessionEnd: [aGroup(anOlderLine(office, 'end'))],
      },
      theme: 'dark',
    },
    null,
    2,
  )}\n`
}

/** The command of the last hook line at `event`. */
function theLineAt(event: 'SessionStart' | 'Stop' | 'SessionEnd'): string {
  const settings = JSON.parse(readFileSync(settingsPath(), 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
  const command = settings.hooks[event]?.at(-1)?.hooks[0]?.command
  if (command === undefined) throw new Error(`The settings file holds no hook line at ${event}.`)
  return command
}

/** A line run by sh as it is written, with a PATH that holds no Node. */
const theLineRun = (command: string): { status: number | null; stdout: string; stderr: string } =>
  spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', env: { PATH: noNode } })

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'the-installs-own-node-'))
  home = join(scratch, 'home')
  noNode = join(scratch, 'no-node')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(noNode)
  vi.stubEnv('APPIMAGE', '')
  vi.stubEnv('APPDIR', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the one answer', () => {
  it('1: from a checkout, the Node that runs this process, or `node` on PATH by name, with nothing to set', () => {
    expect(theInstallsNode({ from: 'checkout', platform: 'linux', named: false }), 'a checkout does not run its scripts on the Node that runs it').toEqual({ program: process.execPath, environment: {} })
    expect(theInstallsNode({ from: 'checkout', platform: 'linux', named: true }), 'a checkout does not name the node on PATH').toEqual({ program: 'node', environment: {} })
    expect(theInstallsNode({ from: 'checkout', platform: 'win32', named: true }), 'a checkout on Windows does not name the node on PATH').toEqual({ program: 'node', environment: {} })
    // This process is not the window, so it is not asked by name unless a caller says.
    expect(theInstallsNode(), 'this checkout, asked as itself, does not answer with the Node that runs this test').toEqual({ program: process.execPath, environment: {} })
  })

  it('2: from a Linux bundle, the program that runs this process, told to run as Node, asked either way', () => {
    const app = '/opt/mole-office/mole-office'
    for (const named of [false, true]) {
      expect(theInstallsNode({ from: 'bundle', platform: 'linux', execPath: app, named, root: '/opt/mole-office/resources/office' }), `a Linux bundle asked with named ${String(named)} does not answer with the app's own program and the variable`).toEqual({
        program: app,
        environment: { ELECTRON_RUN_AS_NODE: '1' },
      })
    }
    expect(RUN_AS_NODE).toBe('ELECTRON_RUN_AS_NODE')
  })

  it('3: from a Windows or a Mac bundle, the Node the installation carries by name, or the Node that runs this process', () => {
    const windows = 'C:\\Users\\someone\\AppData\\Local\\Programs\\mole-office\\resources\\office'
    expect(theInstallsNode({ from: 'bundle', platform: 'win32', execPath: 'C:\\node.exe', named: true, root: windows }), 'Windows does not name the Node its installation carries').toEqual({
      program: join(windows, 'runtime', 'node.exe'),
      environment: {},
    })
    expect(theInstallsNode({ from: 'bundle', platform: 'win32', execPath: 'C:\\node.exe', named: false, root: windows }), 'Windows does not run on the Node that runs the asking process').toEqual({ program: 'C:\\node.exe', environment: {} })
    const mac = '/Applications/Mole Office.app/Contents/Resources/office'
    expect(theInstallsNode({ from: 'bundle', platform: 'darwin', execPath: '/x/node', named: true, root: mac }), 'the Mac does not name the Node its installation carries').toEqual({
      program: join(mac, 'runtime', 'bin', 'node'),
      environment: {},
    })
    expect(theInstallsNode({ from: 'bundle', platform: 'darwin', execPath: '/x/node', named: false, root: mac }), 'the Mac does not run on the Node that runs the asking process').toEqual({ program: '/x/node', environment: {} })
  })

  it('4: the answer as the start of a line sh runs, and that line runs a script that is given the variable', () => {
    const script = join(scratch, 'prints.mjs')
    writeFileSync(script, 'process.stdout.write(`ran, ELECTRON_RUN_AS_NODE ${String(process.env.ELECTRON_RUN_AS_NODE)}`)\n', 'utf8')
    const linux = theInstallsNodeInALine({ program: process.execPath, environment: { ELECTRON_RUN_AS_NODE: '1' } })
    expect(linux, 'the line does not set the variable before the program').toBe(`ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(process.execPath)}`)
    const ran = theLineRun(`${linux} ${JSON.stringify(script)}`)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout, 'the program the line runs was not given the variable').toBe('ran, ELECTRON_RUN_AS_NODE 1')
    expect(theInstallsNodeInALine({ program: 'C:\\Program Files\\node.exe', environment: {} }), 'a Node that needs nothing set is not the quoted program alone').toBe('"C:\\\\Program Files\\\\node.exe"')
  })

  it("5: howToStart's starts from a checkout set nothing", () => {
    for (const program of ['server', 'command', 'holder', 'worker', 'host-job-runner'] as const) {
      expect(howToStart(program).environment, `a checkout's ${program} is started with something set`).toEqual({})
    }
    expect(howToStart('server').command, "a checkout's server does not start on the Node that runs this process").toBe(process.execPath)
  })
})

describe('the variable at entry', () => {
  /**
   * A process started with the variable, which reads it before and after it imports one module, then starts sh and
   * reads what sh was given. It runs on the Node that runs this test, which reads nothing in the variable.
   */
  function startedWithTheVariable(module: string): { before: string; after: string; itsChild: string } {
    const program = [
      'const before = String(process.env.ELECTRON_RUN_AS_NODE)',
      `await import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, module)).href)})`,
      'const after = String(process.env.ELECTRON_RUN_AS_NODE)',
      "const { execFileSync } = await import('node:child_process')",
      "const itsChild = execFileSync('/bin/sh', ['-c', 'printf %s \"${ELECTRON_RUN_AS_NODE-not given}\"'], { encoding: 'utf8' })",
      'process.stdout.write(JSON.stringify({ before, after, itsChild }))',
    ].join('\n')
    const ran = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 60_000,
    })
    if (ran.status !== 0) throw new Error(`The process that imports ${module} ended with ${String(ran.status)}: ${ran.stderr}`)
    return JSON.parse(ran.stdout) as { before: string; after: string; itsChild: string }
  }

  it('6: a process started with it that imports src/config/settings.mjs no longer has it, and a program it starts is not given it', () => {
    expect(startedWithTheVariable('src/config/settings.mjs'), 'an office program keeps the variable, or gives it to what it starts').toEqual({ before: '1', after: 'undefined', itsChild: 'not given' })
  })

  it("7: the same for src/config/tmux-pane-view.mjs, which imports none of the office's code", () => {
    expect(startedWithTheVariable('src/config/tmux-pane-view.mjs'), 'the pane view keeps the variable, or gives it to the tmux it runs').toEqual({ before: '1', after: 'undefined', itsChild: 'not given' })
  })

  it('8: a login unit and a hook line written for a Linux bundle give it back to the office program they start', () => {
    const app = '/opt/mole-office/mole-office'
    const office = '/opt/mole-office/resources/office'
    const node = theInstallsNode({ from: 'bundle', platform: 'linux', execPath: app, named: true, root: office })
    const unit = theStartAtLoginUnit({ command: node.program, args: [join(office, 'mole-office.mjs')], databasePath: '/d/office.db', port: 28800, path: '/usr/bin', environment: node.environment }).split('\n')
    expect(unit, 'the login unit does not run the app as Node').toContain('Environment="ELECTRON_RUN_AS_NODE=1"')
    expect(unit).toContain(`ExecStart="${app}" "${join(office, 'mole-office.mjs')}" "watch"`)
    expect(theEntryCommand(hookOf(office), 'start', node.program, node.environment), 'the hook line does not run the app as Node').toBe(`ELECTRON_RUN_AS_NODE=1 "${app}" "${hookOf(office)}" start`)
  })
})

describe('the hook lines an older Linux version wrote', () => {
  it("9: once the Node they name is gone, each is written again with the app's own program and runs with no Node on PATH", async () => {
    const { office } = aLinuxInstallation()
    const before = theOlderSettings(office)
    writeFileSync(settingsPath(), before, 'utf8')

    const kept = await keepTheOlderHookLines(office, theSystemFor('linux'), home)
    expect(kept, 'nothing was written again').not.toBeNull()
    expect(kept?.written, kept?.line).toBe(true)
    expect(kept?.line).toBe(
      `The Node an older version of this office carried, ${theOlderNodeOf(office)}, is gone, so 3 hook lines in ${settingsPath()} that ` +
        `ran the session hook with it now run it with this app's own program, run as Node, ${process.execPath}. ` +
        `The file it replaced is backed up at ${settingsPath()}.mole-office-backup. Every other line in that file was left as it was.`,
    )
    // Only the three commands changed: the person's line, the timeouts, the order and every other key are as they were.
    const now = (mode: 'start' | 'stop' | 'end'): string => `ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(process.execPath)} "${hookOf(office)}" ${mode}`
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8')), 'more than the three lines changed, or they were written wrong').toEqual({
      hooks: {
        SessionStart: [aGroup('echo another tool'), aGroup(now('start'))],
        Stop: [aGroup(now('stop'))],
        SessionEnd: [aGroup(now('end'))],
      },
      theme: 'dark',
    })
    expect(readFileSync(`${settingsPath()}.mole-office-backup`, 'utf8'), 'the backup is not the file as it was').toBe(before)

    expect(theLineRun('command -v node').status, 'a Node is on the PATH these lines are run with').not.toBe(0)
    for (const [event, mode] of [['SessionStart', 'start'], ['Stop', 'stop'], ['SessionEnd', 'end']] as const) {
      const ran = theLineRun(theLineAt(event))
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout, `the line at ${event} does not run the hook told to run as Node`).toBe(`the made-up hook ran with ${mode}, ELECTRON_RUN_AS_NODE 1`)
    }
  })

  it('10: a second start finds nothing to write', async () => {
    const { office } = aLinuxInstallation()
    writeFileSync(settingsPath(), theOlderSettings(office), 'utf8')
    expect((await keepTheOlderHookLines(office, theSystemFor('linux'), home))?.written).toBe(true)
    const written = readFileSync(settingsPath(), 'utf8')
    expect(await keepTheOlderHookLines(office, theSystemFor('linux'), home), 'a second start wrote the lines again').toBeNull()
    expect(readFileSync(settingsPath(), 'utf8')).toBe(written)
  })

  it('11: nothing is written while that Node is there, for a line the press did not write, in an AppImage, with no build stamp, or on Windows', async () => {
    const unchanged = async (why: string, office: string, platform: 'linux' | 'win32' = 'linux'): Promise<void> => {
      const before = readFileSync(settingsPath(), 'utf8')
      expect(await keepTheOlderHookLines(office, theSystemFor(platform), home), `${why}: something was written`).toBeNull()
      expect(readFileSync(settingsPath(), 'utf8'), `${why}: the settings file changed`).toBe(before)
      expect(existsSync(`${settingsPath()}.mole-office-backup`), `${why}: a backup was made`).toBe(false)
    }

    // The older Node is still there.
    const there = aLinuxInstallation(true)
    writeFileSync(settingsPath(), theOlderSettings(there.office), 'utf8')
    await unchanged('the older Node is still there', there.office)
    rmSync(theOlderNodeOf(there.office))

    // A line that names the older Node but another hook, or carries more words, is not the press's.
    writeFileSync(settingsPath(), `${JSON.stringify({ hooks: { SessionStart: [aGroup(`"${theOlderNodeOf(there.office)}" "/elsewhere/hook.mjs" start`), aGroup(`${anOlderLine(there.office, 'stop')} --more`)] } }, null, 2)}\n`, 'utf8')
    await unchanged('a line the press did not write', there.office)

    // In an AppImage the lines run the launcher, which every start writes again.
    writeFileSync(settingsPath(), theOlderSettings(there.office), 'utf8')
    vi.stubEnv('APPIMAGE', join(scratch, 'Mole Office.AppImage'))
    vi.stubEnv('APPDIR', there.root)
    await unchanged('an AppImage', there.office)
    vi.stubEnv('APPIMAGE', '')
    vi.stubEnv('APPDIR', '')

    // A folder with no build stamp is a checkout.
    rmSync(join(there.office, 'build-stamp.json'))
    await unchanged('a folder with no build stamp', there.office)
    writeFileSync(join(there.office, 'build-stamp.json'), '{}\n', 'utf8')

    // On Windows the install's own Node needs nothing set, so nothing is read.
    await unchanged('Windows', there.office, 'win32')
  })
})

describe('the login unit an older Linux version wrote', () => {
  /** The office a Linux bundle's server says it is: the app's own program, the command, and the variable. */
  const theOffice = (root: string, office: string, databasePath = join(scratch, 'office.db')) => ({
    command: join(root, 'mole-office'),
    args: [join(office, 'mole-office.mjs')],
    databasePath,
    port: 28800,
    path: '/usr/local/bin:/usr/bin:/bin',
    environment: { ELECTRON_RUN_AS_NODE: '1' },
  })

  /** The unit an older version's press wrote: the same office, run with the Node it carried, and nothing else set. */
  function theOlderUnitIsWritten(root: string, office: string, databasePath?: string): string {
    const now = theOffice(root, office, databasePath)
    const text = theStartAtLoginUnit({ command: theOlderNodeOf(office), args: now.args, databasePath: now.databasePath, port: now.port, path: now.path })
    mkdirSync(dirname(theStartAtLoginUnitPath(home)), { recursive: true })
    writeFileSync(theStartAtLoginUnitPath(home), text, 'utf8')
    return text
  }

  /** A stand-in systemctl that writes down what it was asked and answers each with `code`. */
  function aSystemctl(code = 0): { asked: string[][]; systemctl: (args: string[]) => { code: number; out: string; err: string } } {
    const asked: string[][] = []
    return { asked, systemctl: (args) => (asked.push(args), { code, out: '', err: code === 0 ? '' : 'the stand-in would not' }) }
  }

  it('12: once the Node it names is gone, its ExecStart is written again, the variable is added, systemd reads it again, and no other line changes', () => {
    const { root, office } = aLinuxInstallation()
    // The older unit named another database than this server's, which the person chose then and keeps.
    const before = theOlderUnitIsWritten(root, office, join(scratch, 'their-own.db'))
    const { asked, systemctl } = aSystemctl()

    const kept = keepTheOlderUnit({ home, office: theOffice(root, office), checkout: office, platform: 'linux', systemctl })
    const unitPath = theStartAtLoginUnitPath(home)
    expect(kept, 'nothing was written again').not.toBeNull()
    expect(kept?.line).toBe(
      `The unit ${unitPath} ran the office with ${theOlderNodeOf(office)}, the Node an older version of this office carried, which is gone, ` +
        `so it was written again to run it with ${join(root, 'mole-office')}, run as Node. Written: the unit it wrote before, copied to ` +
        `${unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}; the unit, into ${unitPath}. systemd read it again. Whether the office starts at login was left as it was.`,
    )
    expect(kept?.written).toBe(true)
    expect(readFileSync(unitPath, 'utf8'), 'the unit is not the one the press writes now, with the database it named').toBe(
      theStartAtLoginUnit({ ...theOffice(root, office), databasePath: join(scratch, 'their-own.db') }),
    )
    expect(readFileSync(`${unitPath}${START_AT_LOGIN_BACKUP_SUFFIX}`, 'utf8'), 'the backup is not the unit as it was').toBe(before)
    expect(asked, 'systemd was asked for more than to read the unit again').toEqual([['daemon-reload']])
    expect(keepTheOlderUnit({ home, office: theOffice(root, office), checkout: office, platform: 'linux', systemctl }), 'a second start wrote the unit again').toBeNull()
  })

  it('13: nothing is written while that Node is there, for a unit the press did not write, for another command, or for an office that needs nothing set', () => {
    const unchanged = (why: string, input: Parameters<typeof keepTheOlderUnit>[0]): void => {
      const unitPath = theStartAtLoginUnitPath(home)
      const before = readFileSync(unitPath, 'utf8')
      const { asked, systemctl } = aSystemctl()
      expect(keepTheOlderUnit({ ...input, systemctl }), `${why}: something was written`).toBeNull()
      expect(readFileSync(unitPath, 'utf8'), `${why}: the unit changed`).toBe(before)
      expect(asked, `${why}: systemd was asked`).toEqual([])
    }
    const there = aLinuxInstallation(true)
    const office = theOffice(there.root, there.office)
    const before = theOlderUnitIsWritten(there.root, there.office)
    unchanged('the older Node is still there', { home, office, checkout: there.office, platform: 'linux' })
    rmSync(theOlderNodeOf(there.office))

    writeFileSync(theStartAtLoginUnitPath(home), before.replace(/^# Written by the press[^\n]*\n/, '# a unit of the person\'s own\n'), 'utf8')
    unchanged('a unit the press did not write', { home, office, checkout: there.office, platform: 'linux' })

    writeFileSync(theStartAtLoginUnitPath(home), before.replace('"watch"', '"watch" "--more"'), 'utf8')
    unchanged('a unit that runs another command', { home, office, checkout: there.office, platform: 'linux' })

    writeFileSync(theStartAtLoginUnitPath(home), before, 'utf8')
    unchanged('an office that needs nothing set', { home, office: { ...office, environment: {} }, checkout: there.office, platform: 'linux' })
    unchanged('the Mac', { home, office, checkout: there.office, platform: 'darwin' })
  })
})

describe('the container drivers', () => {
  it("14: the environment they give drops the variable, and the app's own program beside resources/ is an installation's own Node", () => {
    expect(aPlainEnvironment({ PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', MOLE_OFFICE_API: 'http://127.0.0.1:1' }), 'a driver passes on the variable or an office address').toEqual({ PATH: '/usr/bin' })

    const { root } = aLinuxInstallation()
    const app = join(root, 'mole-office')
    writeFileSync(app, '', 'utf8')
    chmodSync(app, 0o755)
    expect(isTheInstallationsOwnNode(app), "the app's own program beside resources/ is not taken for the installation's Node").toBe(true)
    expect(isTheInstallationsOwnNode('/opt/elsewhere/resources/office/runtime/bin/node'), "the Node a Windows or Mac installation carries is not taken for the installation's Node").toBe(true)
    expect(isTheInstallationsOwnNode('/usr/bin/node'), "a Node of the computer's own is taken for the installation's").toBe(false)
  })
})
