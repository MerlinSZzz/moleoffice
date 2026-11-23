// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL OUTSIDE THE OFFICE, PER SYSTEM (src/server/lib/a-terminal-outside.ts).
 *
 * The new agent dialog's "A terminal outside" asks the system to open a terminal that starts the agent. No real
 * terminal is opened here. The command each system is asked is worked out with the programs the system has given by
 * the test, and the start of the opener is replaced. One real process is started, a node program that never ends, to
 * show that an opener that does not end in time is stopped by its group.
 *
 *   1. Linux: gnome-terminal, in the agent's folder, running env with the office's variables, then the program and
 *      its arguments. Linux with no gnome-terminal cannot open one, and says so.
 *   2. The Mac: osascript tells Terminal to run one shell line: into the folder, then env, the variables, the program
 *      and its arguments, each word quoted for the shell and the line quoted for AppleScript.
 *   3. Windows: cmd.exe runs start with the folder, the program and its arguments; the variables go in the opener's
 *      environment, which start hands on. A word holding a double quote cannot be passed, and is refused.
 *   4. Any other system cannot open one, and says which system it is.
 *   5. The opener ending with 0 is an opened terminal. Ending with another code, or not starting, is not, and the
 *      answer says why. An opener that does not end within its time is stopped by its group, and is not opened.
 */

import { describe, expect, it } from 'vitest'
import {
  howThisSystemOpensATerminalOutside,
  openATerminalOutside,
  runTheOpener,
  type AnOpenerToRun,
  type AStartOutside,
} from '../src/server/lib/a-terminal-outside.ts'

const START: AStartOutside = {
  program: '/opt/tools/claude',
  args: ['--model', 'claude-opus-5-5', '--effort', 'high'],
  folder: "/srv/someone/agents/it's here",
  env: { MOLE_OFFICE_AGENT: 'made-up-heron', MOLE_OFFICE_WORKSPACE: 'default', CLAUDE_CODE_EFFORT_LEVEL: 'high' },
}

/** A system that has exactly these programs, at these paths. */
const having = (programs: Record<string, string>) => (program: string): string | null => programs[program] ?? null

describe('the command each system is asked', () => {
  it('1: Linux asks gnome-terminal, in the folder, to run env with the variables and then the program', () => {
    const how = howThisSystemOpensATerminalOutside(START, 'linux', having({ 'gnome-terminal': '/usr/bin/gnome-terminal' }))
    if ('cannot' in how) throw new Error(how.cannot)
    expect(how.command).toBe('/usr/bin/gnome-terminal')
    expect(how.args).toEqual([
      `--working-directory=${START.folder}`,
      '--',
      'env',
      'MOLE_OFFICE_AGENT=made-up-heron',
      'MOLE_OFFICE_WORKSPACE=default',
      'CLAUDE_CODE_EFFORT_LEVEL=high',
      '/opt/tools/claude',
      '--model',
      'claude-opus-5-5',
      '--effort',
      'high',
    ])
    expect(how.how).toContain('gnome-terminal')
    const none = howThisSystemOpensATerminalOutside(START, 'linux', having({}))
    expect('cannot' in none && none.cannot).toContain('gnome-terminal')
  })

  it('2: the Mac asks osascript to tell Terminal to run one quoted shell line', () => {
    const how = howThisSystemOpensATerminalOutside(START, 'darwin', having({ osascript: '/usr/bin/osascript' }))
    if ('cannot' in how) throw new Error(how.cannot)
    expect(how.command).toBe('/usr/bin/osascript')
    const line =
      "cd '/srv/someone/agents/it'\\''s here' && exec env 'MOLE_OFFICE_AGENT=made-up-heron' 'MOLE_OFFICE_WORKSPACE=default' " +
      "'CLAUDE_CODE_EFFORT_LEVEL=high' '/opt/tools/claude' '--model' 'claude-opus-5-5' '--effort' 'high'"
    expect(how.args).toEqual(['-e', `tell application "Terminal" to do script "${line.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`, '-e', 'tell application "Terminal" to activate'])
    expect(how.how).toContain('Terminal')
  })

  it('3: Windows asks cmd.exe to start the program in the folder, and hands the variables on in its environment', () => {
    const start: AStartOutside = { ...START, program: 'C:\\tools\\claude.cmd', folder: 'C:\\agents\\made up heron' }
    const how = howThisSystemOpensATerminalOutside(start, 'win32', having({ 'cmd.exe': 'C:\\Windows\\System32\\cmd.exe' }))
    if ('cannot' in how) throw new Error(how.cannot)
    expect(how.command).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(how.args).toEqual(['/d', '/s', '/c', '"start "" /D "C:\\agents\\made up heron" "C:\\tools\\claude.cmd" "--model" "claude-opus-5-5" "--effort" "high""'])
    expect(how.verbatim).toBe(true)
    expect(how.env).toEqual(start.env)
    const quoted = howThisSystemOpensATerminalOutside({ ...start, args: ['say "hello"'] }, 'win32', having({ 'cmd.exe': 'C:\\Windows\\System32\\cmd.exe' }))
    expect('cannot' in quoted && quoted.cannot).toContain('double quote')
  })

  it('4: any other system cannot open one, and says which', () => {
    for (const system of ['freebsd', 'aix', 'sunos']) {
      const how = howThisSystemOpensATerminalOutside(START, system, having({ 'gnome-terminal': '/usr/bin/gnome-terminal', osascript: '/usr/bin/osascript' }))
      expect('cannot' in how && how.cannot).toContain(system)
    }
  })
})

describe('opening it', () => {
  const gnome = having({ 'gnome-terminal': '/usr/bin/gnome-terminal' })

  it('5: is opened only when the opener ends with 0, and says why when it is not', async () => {
    const asked: AnOpenerToRun[] = []
    const opened = await openATerminalOutside(START, { platform: 'linux', found: gnome, run: async (one) => { asked.push(one); return { code: 0, signal: null, stderr: '' } } })
    expect(opened.opened).toBe(true)
    expect(asked.map((one) => one.command)).toEqual(['/usr/bin/gnome-terminal'])

    const refused = await openATerminalOutside(START, { platform: 'linux', found: gnome, run: async () => ({ code: 1, signal: null, stderr: '# Failed to parse arguments\nmore' }) })
    expect(refused.opened).toBe(false)
    expect(!refused.opened && refused.says).toContain('ended with 1')
    expect(!refused.opened && refused.says).toContain('Failed to parse arguments')

    const notStarted = await openATerminalOutside(START, { platform: 'linux', found: gnome, run: async () => ({ code: null, signal: null, stderr: '', error: 'spawn EACCES' }) })
    expect(notStarted.opened).toBe(false)
    expect(!notStarted.opened && notStarted.says).toContain('spawn EACCES')

    const elsewhere = await openATerminalOutside(START, { platform: 'aix', found: gnome, run: async () => { throw new Error('no opener may be run on a system that has none') } })
    expect(elsewhere.opened).toBe(false)
    expect(!elsewhere.opened && elsewhere.says).toContain('aix')
  })

  it.skipIf(process.platform === 'win32')('5: stops an opener that does not end within its time, by its group', async () => {
    const ended = await runTheOpener({ command: process.execPath, args: ['-e', 'setInterval(() => undefined, 1 << 30)'], env: {}, verbatim: false }, 500)
    expect(ended.timedOut).toBe(true)
    expect(ended.code).toBeNull()
    expect(ended.pid).toBeGreaterThan(0)
    expect(() => process.kill(-(ended.pid as number), 0)).toThrow()
  }, 20_000)
})
