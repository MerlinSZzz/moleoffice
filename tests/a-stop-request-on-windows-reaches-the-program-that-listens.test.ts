// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOP REQUEST ON WINDOWS REACHES THE PROGRAM THAT LISTENS, AND ON LINUX AND THE MAC IT IS SIGTERM. Wave 13t, round
 * W6, item 7, step (i).
 *
 * Windows has no signal that asks a whole group to stop. So a program with a clean stop listens on a named pipe named
 * after its own group, and a stop of that group writes one line to that pipe in place of SIGTERM. The system layer has
 * two members for it, src/config/systems/the-system.mjs: `groups.askToStop(group)` and
 * `groups.listenForAStopRequest(onStop, say)`. The starter hands the program its group's number in one variable,
 * `THE_GROUP_VARIABLE` in src/config/systems/windows-starts.mjs. This file checks:
 *
 *   1. on Linux and the Mac the ask is SIGTERM to the group, the same call the stops made before, and what the signal
 *      throws comes back as it is; nothing listens, nothing is said, and the variable is left as it was;
 *   2. on Linux and the Mac a start's environment is the caller's own, without the variable;
 *   3. on Windows the starter sets the variable to its own number after it has made its Job Object and before the
 *      program starts, and Node's start does not set it; its name is not a Mole Office setting's;
 *   4. the pipe is `\\.\pipe\mole-office-stop-<group>`, which is not the holder's, and the ask goes to it;
 *   5. the real listener and the real ask, on a socket file in place of the pipe and with a stand-in for the pipe's
 *      helper: the program reads and removes the variable, starts the helper for its own pipe and its own number, and
 *      begins its stop once, however often the helper says it was asked;
 *   6. a program without the variable, or with one that is not a group number, says so and listens for nothing, and
 *      an ask of its group is refused in words. Each program has its own groups object: a later listen on one object
 *      is a later listen in the same program, so a program that listens more than once is given a fresh object each
 *      time;
 *   7. an ask is refused in words, with no code, when nothing listens, when the answer is another, when the pipe closes
 *      without an answer, when nothing answers in two seconds, and for a group number below 1. A line from the helper
 *      that is neither `listening` nor exactly `stop` is said, and the program does not stop;
 *   8. the helper is started by the whole path of the system's PowerShell, with its file encoded exactly as it is and
 *      without the UTF-8 line, with the pipe and the program's number in its environment, hidden, and on a command
 *      line within the 32,767 characters Windows allows;
 *  10. a helper that cannot make its pipe, cannot be started, or ends after it listened, makes the program say so
 *      once, in words. The program runs on without a stop listener, and nothing else listens: an ask is refused;
 *  11. the helper does not keep the program running: a program whose helper still runs ends when its work is done;
 *  12. the terminal holder listens for it through the layer (`stopWhenAsked` in src/holder/index.mjs). It begins its
 *      stop once, whichever way it is asked first: the request, SIGTERM or SIGINT. A later ask by another way begins
 *      nothing more. Its log names the way, then says how the stop ended, in the words of the system it runs on, and
 *      it says what the layer says when nothing can ask it. Each holder is its own program, with its own groups
 *      object;
 *  13. the office that waits for the update press hears the request through the layer, beside SIGTERM and SIGINT. A
 *      later listen on the same groups object, as the server makes after the update, takes the stop over and answers
 *      the same helper; a request before it goes to the reduced mode's stop, which ends the process with its note. A
 *      later listen when nothing listens says why nothing listens again, and answers null. The note a stop leaves
 *      names what was asked and how far the update had gone.
 *
 * The pipe itself cannot be opened on Linux: a socket file stands in for it. The helper is PowerShell, which Linux has
 * not: a node program written by this file stands in for it and speaks its lines. What the helper does on Windows is
 * proved only by the Win11 run.
 *
 * Mutations, in the commit message that added the two members. For cases 5 and 7 to 11, in the commit message of round
 * W8 that gave the pipe to the helper. For case 12, after a control run, each restored, in stopWhenAsked in
 * src/holder/index.mjs:
 *   1. delete the line that calls `system.groups.listenForAStopRequest`: case 12 goes red (nothing listens, and the
 *      request is refused);
 *   2. delete `if (asked) return`: case 12 goes red (a second stop is begun);
 *   3. put `'SIGTERM'` in place of `way` in the line the log says first: case 12 goes red (the request is logged as
 *      SIGTERM);
 *   4. put `theStopsLastLine(stillRunning)` in place of `theStopsLastLine(stillRunning, system)`: case 12 goes red (the
 *      last line names SIGHUP, which Windows has not);
 *   5. put `() => {}` in place of `say` as the listener's second argument: case 12 goes red (what the layer says is
 *      not in the log).
 * For case 13, after a control run, each restored, in src/server/lib/the-update.ts and
 * src/config/systems/windows-groups.mjs:
 *   1. delete the line that calls the reduced mode's `groups.listenForAStopRequest`: case 13 goes red at (a) (the
 *      waiting office does not hear the request);
 *   2. make the later-call branch's condition false: case 13 goes red (a second helper is started);
 *   3. delete the line that sets the later `say`: case 13 goes red at (b) (the helper's ending is said to the first
 *      say);
 *   4. delete the line that sets the later `onStop`: case 13 goes red at (b) (the waiting office stops instead of the
 *      server);
 *   5. make `theStopsNote` answer its "while the update was offered" form for `updating`: case 13 goes red at (d);
 *   6. make the stop call the exit with 1: case 13 goes red at (a);
 *   7. make `theStopsNote` answer its "while the update was offered" form for `failed`: case 13 goes red at (d).
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { THE_UTF8_LINE, theEncodedArguments } from '../src/config/systems/windows-commands.mjs'
import {
  A_REFUSED_STOP_REQUEST,
  A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS,
  STOP_PIPES_BEGIN,
  THE_HELPER_LISTENS,
  THE_HELPERS_PIPE_VARIABLE,
  THE_HELPERS_PROGRAM_VARIABLE,
  THE_STOP_ANSWER,
  THE_STOP_HELPER,
  THE_STOP_LISTENER_SAYS,
  THE_STOP_REQUEST,
  theGroupVariableIsNotAGroupNumber,
  theStopHelpersStart,
  theStopPipeOf,
  windowsGroups,
} from '../src/config/systems/windows-groups.mjs'
import { THE_GROUP_VARIABLE, THE_LINE_VARIABLE, THE_PROGRAM_VARIABLE, theStarterScript } from '../src/config/systems/windows-starts.mjs'
import { A_REQUEST_ON_ITS_STOP_PIPE, stopWhenAsked, theAskedToStopLine, theStopsLastLine } from '../src/holder/index.mjs'
import type { TheUpdateState } from '../src/shared/the-update.ts'
import { freshDb } from './helpers.ts'

const CLAUDE = 'C:\\Users\\someone\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.exe'

/** PowerShell is never run here: a stand-in that refuses says so if anything asks for it. */
const NO_POWERSHELL = {
  powershell: (): never => {
    throw new Error('PowerShell was asked for, and no case here runs it.')
  },
  startPowerShell: (): Promise<never> => Promise.reject(new Error('PowerShell was asked for, and no case here runs it.')),
}

const REPO = join(import.meta.dirname, '..')
const THE_HELPERS_FILE = join(REPO, 'src', 'config', 'systems', THE_STOP_HELPER)

let scratch = ''
const opened: Server[] = []
/** Every stand-in helper started, so that none outlives its case. */
const helpers: ChildProcess[] = []

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-stop-request-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const helper of helpers.splice(0)) helper.kill('SIGKILL')
  await Promise.all(opened.splice(0).map((server) => new Promise((done) => server.close(done))))
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * A STAND-IN FOR THE STOP PIPE'S HELPER, which is PowerShell, which Linux has not. It is a node program that speaks
 * the helper's lines on the socket file it is given in place of the pipe, and it ends when its program ends, as the
 * helper does, or after 30 seconds. `how` is what it does: `serve` as the helper does, `refuse` as a helper that cannot
 * make its pipe, `end` as one that ends after it listened, and `odd` as one that writes lines no helper writes.
 */
function theStandInHelper(): string {
  const file = join(scratch, 'a-stand-in-for-the-helper.mjs')
  writeFileSync(
    file,
    `import { createServer } from 'node:net'
const name = process.env[${JSON.stringify(THE_HELPERS_PIPE_VARIABLE)}]
const program = Number(process.env[${JSON.stringify(THE_HELPERS_PROGRAM_VARIABLE)}])
const how = process.argv[2]
if (how === 'refuse') {
  process.stderr.write('Windows did not make the pipe ' + name + ' (the stand-in refuses).\\n')
  process.exit(125)
}
const server = createServer((socket) => {
  let line = ''
  socket.setEncoding('utf8')
  socket.on('data', (part) => {
    line += part
    const at = line.indexOf('\\n')
    if (at === -1) return
    if (line.slice(0, at) !== ${JSON.stringify(THE_STOP_REQUEST)}) return socket.end()
    socket.end(${JSON.stringify(`${THE_STOP_ANSWER}\n`)})
    process.stdout.write(${JSON.stringify(`${THE_STOP_REQUEST}\n`)})
  })
})
server.listen(name, () => {
  process.stdout.write(${JSON.stringify(`${THE_HELPER_LISTENS}\n`)})
  if (how === 'end') {
    process.stderr.write('The stand-in   ends\\nafter it listened.\\n')
    process.exit(1)
  }
  if (how === 'odd') process.stdout.write('stop \\nStop\\ngo\\n')
})
setInterval(() => {
  try {
    process.kill(program, 0)
  } catch {
    process.exit(0)
  }
}, 100)
setTimeout(() => process.exit(0), 30_000)
`,
  )
  return file
}

/** The ways the helper was asked to start, and a start that runs the stand-in in place of PowerShell. */
function aStartOfTheStandIn(how: 'serve' | 'refuse' | 'end' | 'odd' = 'serve') {
  const standIn = theStandInHelper()
  const ways: ReturnType<typeof theStopHelpersStart>[] = []
  const start = (way: ReturnType<typeof theStopHelpersStart>) => {
    ways.push(way)
    const helper = spawn(process.execPath, [standIn, how], way.options)
    helpers.push(helper)
    return helper
  }
  return { start, ways }
}

/** Waits until the helper has written this line on its output, as many times as asked. */
async function untilTheHelperWrites(helper: ChildProcess, line: string, times = 1): Promise<void> {
  let written = ''
  const count = () => written.split('\n').filter((each) => each === line).length
  await new Promise<void>((done, failed) => {
    const clock = setTimeout(() => failed(new Error(`The helper did not write ${JSON.stringify(line)} ${String(times)} times: ${JSON.stringify(written)}`)), 10_000)
    helper.stdout?.on('data', (part: string) => {
      written += part
      if (count() >= times) {
        clearTimeout(clock)
        done()
      }
    })
  })
}

/** The Windows groups, with a socket file in scratch in place of each group's pipe. */
function windowsOnASocketFile(start = aStartOfTheStandIn().start) {
  const at = (group: number) => join(scratch, `stop-${String(group)}.sock`)
  return { groups: windowsGroups(NO_POWERSHELL, at, start), at }
}

/** A refusal for an ask of a socket file nothing listens on. */
const nothingListensOn = (address: string, group: number) => {
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')
  return new RegExp(
    `^${escaped(A_REFUSED_STOP_REQUEST.couldNotReach(address))}: .*ENOENT.*\\.${escaped(A_REFUSED_STOP_REQUEST.notAsked(group))}$`,
    'u',
  )
}

/**
 * A server of the test's own on a socket file, which answers each connection as `answer` says. It reads every
 * connection, so it sees the asker go and the connection closes.
 */
async function aListenerOfItsOwn(path: string, answer: (socket: import('node:net').Socket) => void): Promise<Server> {
  const server = createServer((socket) => {
    socket.resume()
    answer(socket)
  })
  opened.push(server)
  server.listen(path)
  await once(server, 'listening')
  return server
}

/** What an ask rejected with. */
async function theRefusalOf(asking: Promise<void>): Promise<Error & { code?: unknown }> {
  try {
    await asking
  } catch (error) {
    return error as Error & { code?: unknown }
  }
  throw new Error('The ask was not refused.')
}

const anError = (code: string) => Object.assign(new Error(`made-up ${code}`), { code })

describe('a stop request', () => {
  it('1: on Linux and the Mac is SIGTERM to the group, throws back what the signal throws, and listens for nothing', async () => {
    vi.stubEnv(THE_GROUP_VARIABLE, '4242')
    for (const platform of ['linux', 'darwin']) {
      const { groups } = theSystemFor(platform)
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
      await groups.askToStop(4321)
      expect(kill.mock.calls, platform).toEqual([[-4321, 'SIGTERM']])
      for (const code of ['ESRCH', 'EPERM']) {
        const thrown = anError(code)
        kill.mockImplementation(() => {
          throw thrown
        })
        expect(await theRefusalOf(groups.askToStop(4321)), `${platform} ${code}`).toBe(thrown)
      }
      kill.mockRestore()
      const onStop = vi.fn()
      const say = vi.fn()
      expect(groups.listenForAStopRequest(onStop, say), platform).toBeNull()
      expect(onStop).not.toHaveBeenCalled()
      expect(say).not.toHaveBeenCalled()
      expect(process.env[THE_GROUP_VARIABLE], platform).toBe('4242')
    }
  })

  it("2: on Linux and the Mac leaves a start's environment the caller's own, without the group's number", () => {
    const env = { PATH: '/usr/bin', HOME: '/srv/someone' }
    for (const platform of ['linux', 'darwin']) {
      const { groups } = theSystemFor(platform)
      const way = { command: '/usr/bin/node', args: ['-e', '0'], windowsVerbatimArguments: false, env }
      const how = groups.howToStartInItsOwnGroup(way)
      expect(how, platform).toEqual({ ...way, detached: true })
      expect(how.env, platform).toBe(env)
      expect(how.env, platform).not.toHaveProperty(THE_GROUP_VARIABLE)
      expect(groups.howToStartInItsOwnGroup({ ...way, env: undefined }).env, platform).toBeUndefined()
    }
  })

  it("3: on Windows is told the group's number by the starter, after it makes its Job Object and before the program starts", () => {
    const script = theStarterScript()
    const at = (text: string) => {
      const found = script.indexOf(text)
      expect(found, text).toBeGreaterThan(-1)
      return found
    }
    const removed = [THE_PROGRAM_VARIABLE, THE_LINE_VARIABLE].map((name) => at(`Environment.SetEnvironmentVariable(${JSON.stringify(name)}, null);`))
    const made = at('IntPtr job = CreateJobObjectW(ref inherited, name);')
    const told = at(`Environment.SetEnvironmentVariable(${JSON.stringify(THE_GROUP_VARIABLE)}, GetCurrentProcessId().ToString());`)
    const started = at('CreateProcessW(program, ')
    expect(told).toBeGreaterThan(Math.max(...removed, made))
    expect(started).toBeGreaterThan(told)
    // Node cannot know the starter's number before the start, so Node's start does not set it.
    const how = theSystemFor('win32').groups.howToStartInItsOwnGroup({ command: CLAUDE, args: [], windowsVerbatimArguments: false, env: {} })
    expect(how.env).not.toHaveProperty(THE_GROUP_VARIABLE)
    // Only the declaration reads a MOLE_OFFICE_ setting (tests/one-configuration-source.test.ts), and this is none.
    expect(THE_GROUP_VARIABLE.startsWith('MOLE_OFFICE_')).toBe(false)
    expect([THE_PROGRAM_VARIABLE, THE_LINE_VARIABLE]).not.toContain(THE_GROUP_VARIABLE)
  })

  it("4: on Windows goes to the group's own pipe, which is not the holder's", async () => {
    expect(theStopPipeOf(4242)).toBe('\\\\.\\pipe\\mole-office-stop-4242')
    expect(theStopPipeOf(4242)).toBe(`${STOP_PIPES_BEGIN}4242`)
    expect(theSystemFor('win32').holderAddress('mole-office-stop-4242', scratch)).not.toBe(theStopPipeOf(4242))
    // The real Windows groups, asked on Linux, try the pipe's name and say so.
    const refused = await theRefusalOf(windowsGroups(NO_POWERSHELL).askToStop(4242))
    expect(refused.message).toContain(`${A_REFUSED_STOP_REQUEST.couldNotReach(theStopPipeOf(4242))}: `)
    expect(refused.message.endsWith(A_REFUSED_STOP_REQUEST.notAsked(4242))).toBe(true)
  })

  it('5: is heard through the helper the real listener starts for its own pipe, and the program stops once', async () => {
    const { start, ways } = aStartOfTheStandIn()
    const { groups, at } = windowsOnASocketFile(start)
    vi.stubEnv(THE_GROUP_VARIABLE, '4242')
    const onStop = vi.fn()
    const say = vi.fn()
    const helper = groups.listenForAStopRequest(onStop, say)
    expect(helper).not.toBeNull()
    expect(process.env[THE_GROUP_VARIABLE]).toBeUndefined()
    expect(ways).toEqual([theStopHelpersStart(at(4242), process.pid)])
    await untilTheHelperWrites(helper!, THE_HELPER_LISTENS)
    await groups.askToStop(4242)
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledTimes(1))
    const asked = untilTheHelperWrites(helper!, THE_STOP_REQUEST)
    await groups.askToStop(4242)
    await asked
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(say).not.toHaveBeenCalled()
  })

  it('6: is not listened for by a program without the variable, which says so, and its ask is refused in words', async () => {
    const untold = windowsOnASocketFile()
    vi.stubEnv(THE_GROUP_VARIABLE, undefined)
    const onStop = vi.fn()
    const say = vi.fn()
    expect(untold.groups.listenForAStopRequest(onStop, say)).toBeNull()
    expect(say.mock.calls).toEqual([[THE_STOP_LISTENER_SAYS.notToldItsGroup()]])
    let last = untold
    for (const written of ['0', '12a', '-3', '']) {
      // EACH LISTEN IS ITS OWN PROGRAM'S FIRST LISTEN, so each gets its own groups object. A later listen on one
      // object is a later listen in the same program, and reads nothing from the environment.
      const windows = windowsOnASocketFile()
      last = windows
      vi.stubEnv(THE_GROUP_VARIABLE, written)
      say.mockClear()
      expect(windows.groups.listenForAStopRequest(onStop, say), written).toBeNull()
      expect(say.mock.calls, written).toEqual([[theGroupVariableIsNotAGroupNumber(written)]])
      expect(process.env[THE_GROUP_VARIABLE], written).toBeUndefined()
    }
    const refused = await theRefusalOf(last.groups.askToStop(4242))
    expect(refused.message).toMatch(nothingListensOn(last.at(4242), 4242))
    expect(refused.code).toBeUndefined()
    expect(onStop).not.toHaveBeenCalled()
  })

  it('7: is refused in words, with no code, for every answer but stopping, and the program does not stop on another line', async () => {
    const { groups, at } = windowsOnASocketFile()

    await aListenerOfItsOwn(at(7), (socket) => socket.end('no\n'))
    const another = await theRefusalOf(groups.askToStop(7))
    expect(another.message).toBe(
      `${A_REFUSED_STOP_REQUEST.answeredOtherwise(at(7), 'no')}${A_REFUSED_STOP_REQUEST.notAsked(7)}`,
    )
    expect(another.code).toBeUndefined()

    await aListenerOfItsOwn(at(8), (socket) => socket.end())
    const closed = await theRefusalOf(groups.askToStop(8))
    expect(closed.message).toBe(`${A_REFUSED_STOP_REQUEST.closedThePipe(at(8))}${A_REFUSED_STOP_REQUEST.notAsked(8)}`)
    expect(closed.code).toBeUndefined()

    const heard: string[] = []
    await aListenerOfItsOwn(at(9), (socket) => {
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => heard.push(part))
    })
    const began = performance.now()
    const silent = await theRefusalOf(groups.askToStop(9))
    expect(performance.now() - began).toBeGreaterThanOrEqual(A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS - 50)
    expect(heard.join('')).toBe(`${THE_STOP_REQUEST}\n`)
    expect(silent.message).toBe(`${A_REFUSED_STOP_REQUEST.nothingAnswered(at(9))}${A_REFUSED_STOP_REQUEST.notAsked(9)}`)
    expect(silent.code).toBeUndefined()

    const below = await theRefusalOf(groups.askToStop(0))
    expect(below.message).toBe(A_REFUSED_STOP_REQUEST.notAGroupNumber(0))

    // A helper that writes lines it never writes: each is said, and none stops the program.
    const odd = windowsOnASocketFile(aStartOfTheStandIn('odd').start)
    vi.stubEnv(THE_GROUP_VARIABLE, '10')
    const onStop = vi.fn()
    const say = vi.fn()
    odd.groups.listenForAStopRequest(onStop, say)
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(3), { timeout: 10_000 })
    expect(say.mock.calls).toEqual(['stop ', 'Stop', 'go'].map((line) => [THE_STOP_LISTENER_SAYS.wroteAnOddLine(odd.at(10), line)]))
    expect(onStop).not.toHaveBeenCalled()
  })

  it("8: is answered by a helper started by PowerShell's whole path, with its own file as it is, in its environment", () => {
    vi.stubEnv('SystemRoot', 'D:\\Windows')
    vi.stubEnv('PATH', '/usr/bin')
    const way = theStopHelpersStart('\\\\.\\pipe\\mole-office-stop-4242', 5150)
    expect(way.command).toBe('D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    const file = readFileSync(THE_HELPERS_FILE, 'utf8')
    expect(way.args).toEqual(theEncodedArguments(file))
    // Encoded as it is: no UTF-8 line goes before it, since the helper has no console to set.
    const decoded = Buffer.from(way.args.at(-1)!, 'base64').toString('utf16le')
    expect(decoded).toBe(file)
    expect(decoded).not.toContain(THE_UTF8_LINE)
    expect(way.options).toEqual({
      env: { ...process.env, [THE_HELPERS_PIPE_VARIABLE]: '\\\\.\\pipe\\mole-office-stop-4242', [THE_HELPERS_PROGRAM_VARIABLE]: '5150' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    expect(way.options.env?.PATH).toBe('/usr/bin')
    // Windows takes a command line of 32,767 characters at most: the program and each argument, quoted and spaced.
    const commandLine = [way.command, ...way.args].map((part) => `"${part}"`).join(' ')
    expect(commandLine.length).toBeLessThan(32_767)
  })

  it('10: is said to have no listener, once, when the helper cannot make its pipe, cannot start, or ends', async () => {
    // A helper that cannot make its pipe.
    const refusing = windowsOnASocketFile(aStartOfTheStandIn('refuse').start)
    vi.stubEnv(THE_GROUP_VARIABLE, '21')
    const onStop = vi.fn()
    const say = vi.fn()
    expect(refusing.groups.listenForAStopRequest(onStop, say)).not.toBeNull()
    await vi.waitFor(() => expect(say).toHaveBeenCalled(), { timeout: 10_000 })
    expect(say.mock.calls).toEqual([
      [
        THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
          refusing.at(21),
          false,
          THE_STOP_LISTENER_SAYS.ended(
            false,
            125,
            null,
            `Windows did not make the pipe ${refusing.at(21)} (the stand-in refuses).`,
          ),
        ),
      ],
    ])
    expect(await theRefusalOf(refusing.groups.askToStop(21))).toMatchObject({ message: expect.stringMatching(nothingListensOn(refusing.at(21), 21)) })

    // A helper that cannot be started: on Linux there is no PowerShell at the whole path the real start names.
    vi.stubEnv('SystemRoot', undefined)
    const at = (group: number) => join(scratch, `stop-${String(group)}.sock`)
    const real = windowsGroups(NO_POWERSHELL, at)
    vi.stubEnv(THE_GROUP_VARIABLE, '22')
    say.mockClear()
    expect(real.listenForAStopRequest(onStop, say)).not.toBeNull()
    await vi.waitFor(() => expect(say).toHaveBeenCalled(), { timeout: 10_000 })
    await new Promise((done) => setTimeout(done, 200))
    expect(say.mock.calls).toEqual([
      [
        THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
          at(22),
          false,
          THE_STOP_LISTENER_SAYS.couldNotBeStarted('spawn C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe ENOENT'),
        ),
      ],
    ])
    expect(await theRefusalOf(real.askToStop(22))).toMatchObject({ message: expect.stringMatching(nothingListensOn(at(22), 22)) })

    // A start that throws.
    const throwing = windowsOnASocketFile(() => {
      throw new Error('made-up refusal to start')
    })
    vi.stubEnv(THE_GROUP_VARIABLE, '23')
    say.mockClear()
    expect(throwing.groups.listenForAStopRequest(onStop, say)).toBeNull()
    expect(say.mock.calls).toEqual([
      [
        THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
          throwing.at(23),
          false,
          THE_STOP_LISTENER_SAYS.couldNotBeStarted('made-up refusal to start'),
        ),
      ],
    ])

    // A helper that ends after it listened, with words, and one that is killed.
    const ending = windowsOnASocketFile(aStartOfTheStandIn('end').start)
    vi.stubEnv(THE_GROUP_VARIABLE, '24')
    say.mockClear()
    ending.groups.listenForAStopRequest(onStop, say)
    await vi.waitFor(() => expect(say).toHaveBeenCalled(), { timeout: 10_000 })
    expect(say.mock.calls).toEqual([
      [
        THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
          ending.at(24),
          true,
          THE_STOP_LISTENER_SAYS.ended(true, 1, null, 'The stand-in ends after it listened.'),
        ),
      ],
    ])
    const killed = windowsOnASocketFile(aStartOfTheStandIn().start)
    vi.stubEnv(THE_GROUP_VARIABLE, '25')
    say.mockClear()
    const helper = killed.groups.listenForAStopRequest(onStop, say)
    await untilTheHelperWrites(helper!, THE_HELPER_LISTENS)
    helper!.kill('SIGKILL')
    await vi.waitFor(() => expect(say).toHaveBeenCalled(), { timeout: 10_000 })
    expect(say.mock.calls).toEqual([
      [
        THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
          killed.at(25),
          true,
          THE_STOP_LISTENER_SAYS.ended(true, null, 'SIGKILL', ''),
        ),
      ],
    ])
    expect(await theRefusalOf(killed.groups.askToStop(25))).toMatchObject({
      message: expect.stringContaining(A_REFUSED_STOP_REQUEST.notAsked(25)),
    })
    expect(onStop).not.toHaveBeenCalled()
  }, 30_000)

  it('11: does not keep the program running: a program whose helper still runs ends when its work is done', async () => {
    const standIn = theStandInHelper()
    const program = join(scratch, 'a-program-that-listens.mjs')
    writeFileSync(
      program,
      `import { spawn } from 'node:child_process'
import { windowsGroups } from ${JSON.stringify(pathToFileURL(join(REPO, 'src', 'config', 'systems', 'windows-groups.mjs')).href)}
const groups = windowsGroups({ powershell: () => { throw new Error('no PowerShell') } }, () => ${JSON.stringify(join(scratch, 'stop-31.sock'))}, (way) =>
  spawn(process.execPath, [${JSON.stringify(standIn)}, 'serve'], way.options))
const helper = groups.listenForAStopRequest(() => {}, (line) => console.log(line))
// Its only work: to wait until its helper listens, and say so.
const work = setTimeout(() => console.log('the helper did not listen'), 20_000)
helper.stdout.on('data', (part) => {
  if (!part.includes(${JSON.stringify(THE_HELPER_LISTENS)})) return
  clearTimeout(work)
  console.log('helper ' + String(helper.pid) + ' listens')
})
`,
    )
    const run = spawn(process.execPath, [program], { env: { ...process.env, [THE_GROUP_VARIABLE]: '31' }, stdio: ['ignore', 'pipe', 'pipe'] })
    helpers.push(run)
    let said = ''
    run.stdout.setEncoding('utf8')
    run.stdout.on('data', (part: string) => (said += part))
    run.stderr.setEncoding('utf8')
    run.stderr.on('data', (part: string) => (said += part))
    const ended = await Promise.race([
      once(run, 'close').then(([code]) => ({ code })),
      new Promise((done) => setTimeout(() => done('still running after 10 seconds'), 10_000)),
    ])
    expect(said).toMatch(/^helper \d+ listens\n$/u)
    expect(ended).toEqual({ code: 0 })
    // The stand-in ends with its program, as the helper on Windows does. It is killed here if it has not.
    const helperPid = Number(/^helper (\d+)/u.exec(said)?.[1])
    try {
      await vi.waitFor(() => expect(() => process.kill(helperPid, 0)).toThrow(), { timeout: 5_000 })
    } finally {
      try {
        process.kill(helperPid, 'SIGKILL')
      } catch {
        // It has ended.
      }
    }
  }, 30_000)

  it('12: is heard by the terminal holder, which begins its stop once, whichever way it is asked first, and says which', async () => {
    const { start } = aStartOfTheStandIn()
    /** A stand-in holder whose stop leaves one terminal running, so its last line names how a terminal is ended. */
    const aStart = () => {
      // EACH HOLDER IS ITS OWN PROGRAM, so each gets its own groups object and its own first listen.
      const { groups } = windowsOnASocketFile(start)
      const onWindows = { ...theSystemFor('win32'), groups }
      const holder = { stop: vi.fn(() => Promise.resolve({ stillRunning: [4321] as (number | null)[] })) }
      const signals = new EventEmitter()
      const said: string[] = []
      const exit = vi.fn()
      const before = helpers.length
      stopWhenAsked(holder, { system: onWindows, signals, say: (line) => said.push(line), exit })
      return { holder, signals, said, exit, groups, helper: helpers.length > before ? helpers[helpers.length - 1] : null }
    }
    const theLastLine = theStopsLastLine([4321], theSystemFor('win32'))

    // Asked first by the request: one stop, and a SIGTERM and a SIGINT after it begin nothing more.
    vi.stubEnv(THE_GROUP_VARIABLE, '4242')
    const byTheRequest = aStart()
    expect(byTheRequest.helper).not.toBeNull()
    await untilTheHelperWrites(byTheRequest.helper!, THE_HELPER_LISTENS)
    await byTheRequest.groups.askToStop(4242)
    await vi.waitFor(() => expect(byTheRequest.exit).toHaveBeenCalled())
    byTheRequest.signals.emit('SIGTERM')
    byTheRequest.signals.emit('SIGINT')
    expect(byTheRequest.holder.stop).toHaveBeenCalledTimes(1)
    expect(byTheRequest.exit.mock.calls).toEqual([[0]])
    expect(byTheRequest.said).toEqual([theAskedToStopLine(A_REQUEST_ON_ITS_STOP_PIPE), theLastLine])

    // Asked first by SIGTERM: a request after it is answered by the helper, and begins nothing more.
    vi.stubEnv(THE_GROUP_VARIABLE, '4243')
    const bySigterm = aStart()
    await untilTheHelperWrites(bySigterm.helper!, THE_HELPER_LISTENS)
    bySigterm.signals.emit('SIGTERM')
    await vi.waitFor(() => expect(bySigterm.exit).toHaveBeenCalled())
    const heard = untilTheHelperWrites(bySigterm.helper!, THE_STOP_REQUEST)
    await bySigterm.groups.askToStop(4243)
    await heard
    expect(bySigterm.holder.stop).toHaveBeenCalledTimes(1)
    expect(bySigterm.exit.mock.calls).toEqual([[0]])
    expect(bySigterm.said).toEqual([theAskedToStopLine('SIGTERM'), theLastLine])

    // Not told its group: it says so, as the layer says it, and SIGINT still stops it, once.
    vi.stubEnv(THE_GROUP_VARIABLE, undefined)
    const untold = aStart()
    expect(untold.helper).toBeNull()
    untold.signals.emit('SIGINT')
    untold.signals.emit('SIGTERM')
    await vi.waitFor(() => expect(untold.exit).toHaveBeenCalled())
    expect(untold.holder.stop).toHaveBeenCalledTimes(1)
    expect(untold.said).toEqual([
      THE_STOP_LISTENER_SAYS.notToldItsGroup(),
      theAskedToStopLine('SIGINT'),
      theLastLine,
    ])
  }, 30_000)

  it('13: reaches the office that waits for the update press, and a later listen in the same program takes the stop over', async () => {
    const db = await freshDb()
    try {
      const sqlite = db.client.sqlite
      const backups = join(scratch, 'backups')
      mkdirSync(backups, { recursive: true })
      const offer = { file: db.file, holds: 'a test office', wouldWrite: [], measuredOn: 'this file' as const, backups }
      const { theReducedMode, theStopsNote } = await import('../src/server/lib/the-update.ts')

      // (a) THE WAITING OFFICE STOPS ON A REQUEST.
      const waiting = aStartOfTheStandIn()
      const windows = windowsOnASocketFile(waiting.start)
      vi.stubEnv(THE_GROUP_VARIABLE, '4250')
      const signals = new EventEmitter()
      const exit = vi.fn()
      const said: string[] = []
      const notes: string[] = []
      const before = helpers.length
      const { app } = theReducedMode({
        sqlite,
        offer,
        migrationsFolder: scratch,
        headers: () => ({}),
        whenAStopIsAsked: (why) => notes.push(why),
        groups: windows.groups,
        signals,
        exit,
        say: (line) => said.push(line),
      })
      try {
        expect(helpers.length, 'the waiting office starts one helper').toBe(before + 1)
        expect(waiting.ways).toEqual([theStopHelpersStart(windows.at(4250), process.pid)])
        expect(process.env[THE_GROUP_VARIABLE]).toBeUndefined()
        const helper = helpers[helpers.length - 1]!
        await untilTheHelperWrites(helper, THE_HELPER_LISTENS)
        await windows.groups.askToStop(4250)
        await vi.waitFor(() => expect(exit).toHaveBeenCalled())
        expect(exit.mock.calls).toEqual([[0]])
        expect(notes).toEqual([theStopsNote('a stop request received', 'offered')])
        expect(said).toEqual([])
      } finally {
        await app.close()
      }

      // (b) A LATER LISTEN TAKES THE STOP OVER.
      const laterStandIn = aStartOfTheStandIn()
      const laterWindows = windowsOnASocketFile(laterStandIn.start)
      vi.stubEnv(THE_GROUP_VARIABLE, '4251')
      const laterSignals = new EventEmitter()
      const laterExit = vi.fn()
      const laterSaid: string[] = []
      const laterNotes: string[] = []
      const laterBefore = helpers.length
      const { app: laterApp } = theReducedMode({
        sqlite,
        offer,
        migrationsFolder: scratch,
        headers: () => ({}),
        whenAStopIsAsked: (why) => laterNotes.push(why),
        groups: laterWindows.groups,
        signals: laterSignals,
        exit: laterExit,
        say: (line) => laterSaid.push(line),
      })
      try {
        expect(helpers.length).toBe(laterBefore + 1)
        const helper = helpers[helpers.length - 1]!
        await untilTheHelperWrites(helper, THE_HELPER_LISTENS)
        const onStop = vi.fn()
        const say = vi.fn()
        expect(laterWindows.groups.listenForAStopRequest(onStop, say), 'the later listen answers the same helper').toBe(helper)
        expect(helpers.length, 'the later listen starts no second helper').toBe(laterBefore + 1)
        await laterWindows.groups.askToStop(4251)
        await vi.waitFor(() => expect(onStop).toHaveBeenCalledTimes(1))
        expect(laterExit).not.toHaveBeenCalled()
        expect(laterNotes).toEqual([])
        expect(laterSaid).toEqual([])
        helper.kill('SIGKILL')
        await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 10_000 })
        expect(say.mock.calls).toEqual([
          [
            THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(
              laterWindows.at(4251),
              true,
              THE_STOP_LISTENER_SAYS.ended(true, null, 'SIGKILL', ''),
            ),
          ],
        ])
        expect(laterSaid).toEqual([])
      } finally {
        await laterApp.close()
      }

      // (c) A LATER LISTEN WHEN NOTHING LISTENS.
      const badFirst = windowsOnASocketFile()
      vi.stubEnv(THE_GROUP_VARIABLE, '12a')
      const beforeBad = helpers.length
      const badSay = vi.fn()
      expect(badFirst.groups.listenForAStopRequest(vi.fn(), badSay)).toBeNull()
      expect(badSay.mock.calls).toEqual([[theGroupVariableIsNotAGroupNumber('12a')]])
      vi.stubEnv(THE_GROUP_VARIABLE, '4252')
      const badLaterSay = vi.fn()
      expect(badFirst.groups.listenForAStopRequest(vi.fn(), badLaterSay)).toBeNull()
      expect(badLaterSay.mock.calls, 'the sentence is said again').toEqual(badSay.mock.calls)
      expect(helpers.length, 'a later listen when nothing listens starts no helper').toBe(beforeBad)
      expect(process.env[THE_GROUP_VARIABLE], 'the later listen reads nothing').toBe('4252')

      const ending = windowsOnASocketFile(aStartOfTheStandIn('end').start)
      vi.stubEnv(THE_GROUP_VARIABLE, '4253')
      const endingBefore = helpers.length
      const endingSay = vi.fn()
      ending.groups.listenForAStopRequest(vi.fn(), endingSay)
      await vi.waitFor(() => expect(endingSay).toHaveBeenCalledTimes(1), { timeout: 10_000 })
      expect(helpers.length).toBe(endingBefore + 1)
      const theWhy = endingSay.mock.calls[0]![0]
      const endingLaterSay = vi.fn()
      expect(ending.groups.listenForAStopRequest(vi.fn(), endingLaterSay)).toBeNull()
      expect(endingLaterSay.mock.calls, 'the ended sentence is said again').toEqual([[theWhy]])
      expect(helpers.length, 'the later listen starts no helper').toBe(endingBefore + 1)

      // (d) THE NOTE AFTER THE UPDATE: each state has its own sentence, and each names what was asked.
      const states = ['offered', 'updating', 'done', 'failed'] as const satisfies readonly TheUpdateState['state'][]
      for (const why of ['SIGTERM received', 'a stop request received']) {
        const notes = states.map((state) => theStopsNote(why, state))
        expect(notes.every((note) => note.startsWith(`${why} `)), why).toBe(true)
        expect(new Set(notes).size, why).toBe(states.length)
      }
    } finally {
      db.close()
    }
  }, 30_000)
})
