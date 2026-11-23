// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL OUTSIDE THE OFFICE: the system's own terminal, asked to start an agent. The new agent dialog's "A
 * terminal outside" is opened here, by POST /api/agents/new (src/server/api/new-agent.ts).
 *
 * EACH SYSTEM, AND HOW IT IS ASKED.
 *
 *   Linux    gnome-terminal, given the agent's folder, runs env with the office's variables, then the program and its
 *            arguments. A Linux with no gnome-terminal on the PATH cannot open one.
 *   The Mac  osascript tells Terminal to run one shell line: into the folder, then env, the variables, the program and
 *            its arguments. Each word is quoted for the shell, and the line is quoted for AppleScript.
 *   Windows  cmd.exe runs start, with the folder, the program and its arguments. The variables go in the opener's own
 *            environment, which start hands on. A word holding a double quote cannot be passed through start, and is
 *            refused rather than changed.
 *
 * Any other system cannot open one, and says which system it is. Nothing here falls back to the office's own terminal.
 *
 * THE OPENER IS WAITED FOR. Each system's opener hands the new window to the system's terminal and ends, so nothing
 * this process starts outlives the request. It is started in a group of its own on Linux and the Mac, and an opener
 * that has not ended within its time is stopped by that group, and the terminal is not opened. On Windows cmd.exe is
 * not put in a Job Object, because the window start opens would be in it. The window then holds the agent, and the
 * agent's own start files its run, as an agent started by hand does.
 */

import { spawn } from 'node:child_process'
import { whereIsThisTool } from '../../config/runtimes.mjs'
import { theEnvironmentACodexGets } from '../../config/the-environment-a-codex-gets.mjs'

/**
 * What starts the agent: the program found on the PATH, its arguments, the folder it starts in, and the variables.
 * `isCodex` is true when the agent is a Codex (theAgentsStartOutside in src/server/lib/terminal-agents.ts says so).
 */
export interface AStartOutside {
  program: string
  args: string[]
  folder: string
  env: Record<string, string>
  isCodex?: boolean
}

/**
 * The command a system is asked, and what to say of it. `verbatim` passes the arguments to Windows as written.
 * `isCodex` is the start's: the opener of a Codex is started with only the names its list keeps (runTheOpener).
 */
export interface AnOpenerToRun {
  command: string
  args: string[]
  env: Record<string, string>
  verbatim: boolean
  isCodex?: boolean
}

export type HowThisSystemOpensIt = (AnOpenerToRun & { how: string }) | { cannot: string }

/** How the opener ended. `error` is set when it could not be started. */
export interface TheOpenerEnded {
  code: number | null
  signal: string | null
  stderr: string
  error?: string
  timedOut?: boolean
  pid?: number
}

export type AnOpenedTerminalOutside = { opened: true; how: string } | { opened: false; says: string }

/** Where a program is on this server's PATH, or null. */
export type TheProgramsFound = (program: string) => string | null

/** How long an opener may take before it is stopped. Each system's opener hands the window on and ends at once. */
export const AN_OPENER_MAY_TAKE_MS = 15_000

const onThePath: TheProgramsFound = (program) => whereIsThisTool(program, process.env)

/** The opener each system has, by the program it is found by. */
const THE_OPENER: Readonly<Record<string, string>> = { linux: 'gnome-terminal', darwin: 'osascript', win32: 'cmd.exe' }

/** A word quoted for a POSIX shell: in single quotes, each single quote closed, escaped and opened again. */
function quotedForTheShell(word: string): string {
  return `'${word.replaceAll("'", "'\\''")}'`
}

/** A line quoted for an AppleScript string. */
function quotedForAppleScript(line: string): string {
  return `"${line.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/**
 * THE COMMAND THIS SYSTEM IS ASKED to open a terminal that starts the agent, or why it cannot. `found` says where a
 * program is; the server's PATH by default.
 */
export function howThisSystemOpensATerminalOutside(start: AStartOutside, platform: string = process.platform, found: TheProgramsFound = onThePath): HowThisSystemOpensIt {
  const opener = THE_OPENER[platform]
  if (opener === undefined) {
    return { cannot: `The office opens a terminal outside only on Linux, the Mac and Windows, and this system is ${platform}.` }
  }
  const command = found(opener)
  if (command === null) return { cannot: `This system's terminal is opened by ${opener}, and ${opener} is not on the office's PATH.` }
  const variables = Object.entries(start.env).map(([name, value]) => `${name}=${value}`)
  const codex = start.isCodex === true ? { isCodex: true } : {}
  if (platform === 'linux') {
    return {
      command,
      args: [`--working-directory=${start.folder}`, '--', 'env', ...variables, start.program, ...start.args],
      env: {},
      verbatim: false,
      ...codex,
      how: `gnome-terminal, in ${start.folder}`,
    }
  }
  if (platform === 'darwin') {
    const line = `cd ${quotedForTheShell(start.folder)} && exec env ${[...variables, start.program, ...start.args].map(quotedForTheShell).join(' ')}`
    return {
      command,
      args: ['-e', `tell application "Terminal" to do script ${quotedForAppleScript(line)}`, '-e', 'tell application "Terminal" to activate'],
      env: {},
      verbatim: false,
      ...codex,
      how: `Terminal, through osascript, in ${start.folder}`,
    }
  }
  const words = [start.folder, start.program, ...start.args]
  const quoted = words.find((word) => word.includes('"'))
  if (quoted !== undefined) return { cannot: `Windows start cannot be given a word holding a double quote, and this one does: ${quoted}` }
  const startLine = `start "" /D "${start.folder}" ${[start.program, ...start.args].map((word) => `"${word}"`).join(' ')}`
  return { command, args: ['/d', '/s', '/c', `"${startLine}"`], env: { ...start.env }, verbatim: true, ...codex, how: `a new console window, through cmd.exe start, in ${start.folder}` }
}

/**
 * WHY THIS SYSTEM CANNOT OPEN A TERMINAL OUTSIDE, or null when it can. The door asks this before it makes anything,
 * so an agent is not made for a terminal this system has no way to open.
 */
export function whyThisSystemCannotOpenATerminalOutside(platform: string = process.platform, found: TheProgramsFound = onThePath): string | null {
  const how = howThisSystemOpensATerminalOutside({ program: 'agent', args: [], folder: '.', env: {} }, platform, found)
  return 'cannot' in how ? how.cannot : null
}

/** The first line of what the opener wrote to stderr, or nothing. */
function theFirstLine(stderr: string): string {
  return stderr.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
}

/**
 * OPEN A TERMINAL OUTSIDE that starts the agent. It is opened only when the system's opener ends with 0. Otherwise the
 * answer says why: the system has no opener, the opener could not start, it ended with another code, or it took too long.
 */
export async function openATerminalOutside(
  start: AStartOutside,
  system: { platform?: string; found?: TheProgramsFound; run?: (opener: AnOpenerToRun) => Promise<TheOpenerEnded> } = {},
): Promise<AnOpenedTerminalOutside> {
  const how = howThisSystemOpensATerminalOutside(start, system.platform ?? process.platform, system.found ?? onThePath)
  if ('cannot' in how) return { opened: false, says: how.cannot }
  const ended = await (system.run ?? ((opener) => runTheOpener(opener, AN_OPENER_MAY_TAKE_MS)))(how)
  if (ended.error !== undefined) return { opened: false, says: `${how.command} could not be started: ${ended.error}` }
  if (ended.timedOut === true) return { opened: false, says: `${how.command} had not ended after ${String(AN_OPENER_MAY_TAKE_MS / 1000)} seconds, and was stopped.` }
  if (ended.code === 0) return { opened: true, how: how.how }
  const stopped = ended.signal === null ? `ended with ${String(ended.code)}` : `was stopped by ${ended.signal}`
  const line = theFirstLine(ended.stderr)
  return { opened: false, says: `${how.command} ${stopped}${line === '' ? '.' : `: ${line}`}` }
}

/** At most this much of the opener's stderr is kept. */
const THE_STDERR_KEPT = 4096

/**
 * RUN THE OPENER AND WAIT FOR IT, at most `ms`. On Linux and the Mac it is started in a group of its own, and stopped
 * by that group when it has not ended in time. On Windows cmd.exe is stopped by itself.
 *
 * It is started with the server's environment and the opener's names. The opener of a Codex gets only the names its
 * list keeps (src/config/the-environment-a-codex-gets.mjs). Not confirmed: whether gnome-terminal hands the window
 * the opener's environment. On the Mac the window's shell is Terminal's own, which the office does not build.
 */
export function runTheOpener(opener: AnOpenerToRun, ms: number): Promise<TheOpenerEnded> {
  return new Promise((resolve) => {
    const onWindows = process.platform === 'win32'
    let stderr = ''
    let timedOut = false
    let settled = false
    const done = (ended: TheOpenerEnded): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ended)
    }
    const env = { ...process.env, ...opener.env }
    const child = spawn(opener.command, opener.args, {
      env: opener.isCodex === true ? theEnvironmentACodexGets(env) : env,
      detached: !onWindows,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: opener.verbatim,
    })
    const pid = child.pid
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < THE_STDERR_KEPT) stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (pid !== undefined && !onWindows) process.kill(-pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        // ESRCH: the group ended between the time running out and the stop, which the exit below reports.
      }
    }, ms)
    child.once('error', (error) => {
      done({ code: null, signal: null, stderr, error: error.message, ...(pid === undefined ? {} : { pid }) })
    })
    child.once('close', (code, signal) => {
      done({ code: timedOut ? null : code, signal, stderr, timedOut, ...(pid === undefined ? {} : { pid }) })
    })
  })
}
