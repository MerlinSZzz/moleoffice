// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY BACK TO AN AGENT'S RUN: the one command that resumes its conversation, worked out in one place.
 *
 * Wave 13u, round 10: every agent's page shows its resume command where it can, as the emergency way to bring it
 * back. The server's door, the agent's page and the sandbox tool all read the command from
 * here, so the folder, the conversation id and the flags cannot come to be worked out two ways.
 *
 * WHAT IT IS WORKED OUT FROM. Only what a session record holds: its runtime, its conversation id (`providerSession`,
 * or the discovery stamp's `externalId`), its folder (`workingDirectory`), the command line its process was started
 * with (the stamp's `pidFlags`, or its `pidCommand` before round 10b), its model, and its `sandbox`. Before this round the
 * resume command was stored only by a discovery sweep. A record the session hook filed and no sweep had stamped
 * (I1YvY7y7shXb and 9sXK4hFLaL23) therefore had none, though it held every fact the command needs.
 *
 * WHAT IS KEPT OF THE START'S FLAGS. A resumed run should run as the run did, so the flags that say how it may act
 * are kept: --dangerously-skip-permissions, --model and --permission-mode. Every other flag is dropped and named in
 * `dropped`. Some must go: -p, --continue, --resume and --session-id would start another conversation or none,
 * --output-format would turn the terminal into a stream, and a --mcp-config names a file that was temporary. The
 * rest are dropped because nobody has said they belong in a resumed run.
 *
 * A COMMAND LINE IS READ BACK BY SPACES. The process table gives the arguments joined by spaces, so a value with a
 * space in it cannot be told apart from two arguments. The three kept flags take values without spaces (a model
 * name and a permission mode), so this loses nothing that is kept.
 *
 * NOTHING KEY-LIKE IS KEPT OR SHOWN (wave 13u, round 10b). A dropped flag is named and its value never is. A kept flag
 * whose value looks like a key by the office's secret-shape check (src/config/secret-shapes.mjs) is dropped, by name.
 * What a session record stores of its start is `pidFlags`, the kept flags by name and value and the dropped ones by name
 * (src/config/session-process.mjs). A record with none, written before this round or by the hook's first write, is
 * read from its `pidCommand`. Both are read through this same check, because a record is written by its agent.
 *
 * A RUN WITH NO WAY BACK SAYS WHY, in `because`, and never gets a command built from a guess: no folder, no
 * conversation id, or a runtime that has no resume command (dsh, and any tool this file does not name).
 *
 * Plain JavaScript, for Node 18 and up, because tools/ imports it as well as the server.
 */

import { withSecretsMarked } from './secret-shapes.mjs'

/** The start flags a resumed Claude Code run keeps, and whether each takes a value. */
const KEPT_CLAUDE_FLAGS = new Map([
  ['--dangerously-skip-permissions', false],
  ['--model', true],
  ['--permission-mode', true],
])

/** Claude Code flags known to take a value, so their value is dropped with them and not read as an argument. */
const CLAUDE_FLAGS_WITH_A_VALUE = new Set([
  '--resume', '-r', '--session-id', '--output-format', '--input-format', '--mcp-config', '--append-system-prompt',
  '--system-prompt', '--settings', '--add-dir', '--allowedTools', '--allowed-tools', '--disallowedTools',
  '--disallowed-tools', '--fallback-model', '--agents', '--setting-sources', '--max-turns', '--permission-prompt-tool',
])

/** How a dropped prompt is named, in place of its words. */
export const A_PROMPT = 'the prompt it started with'

/** Quote a folder for a POSIX shell, always, as the resume command always has. */
const quoteTheFolder = (folder) => `'${folder.replace(/'/g, `'\\''`)}'`

/** Quote one word for a POSIX shell, so a folder with a space or a quote in it still makes a command that runs. */
export function shellQuote(value) {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The flags of a Claude Code start that a resumed run keeps, by name and value, and the names of the ones it does not.
 *
 * @param {string | null} commandLine the process's command line, its arguments joined by spaces
 * @returns {{ kept: { name: string, value: string | null }[], dropped: string[] }}
 */
export function theStartFlagsOf(commandLine) {
  /** @type {{ name: string, value: string | null }[]} */
  const kept = []
  /** @type {string[]} */
  const dropped = []
  if (commandLine === null) return { kept, dropped }
  const words = commandLine.split(/\s+/).filter((one) => one !== '')
  // The program itself comes first: `claude`, a path to it, or node and a path to its script.
  let at = words.findIndex((one) => one.startsWith('-'))
  if (at === -1) return { kept, dropped }
  while (at < words.length) {
    const word = words[at]
    if (!word.startsWith('-')) {
      // A bare word after the flags is part of a prompt. The prompt is dropped and named once, never shown: it may
      // be long, and it is the person's or the starter's words.
      if (!dropped.includes(A_PROMPT)) dropped.push(A_PROMPT)
      at += 1
      continue
    }
    const [name, inline] = word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, null]
    const keeps = KEPT_CLAUDE_FLAGS.get(name)
    const takesAValue = keeps === true || CLAUDE_FLAGS_WITH_A_VALUE.has(name)
    const next = words[at + 1]
    const value = inline ?? (takesAValue && next !== undefined && !next.startsWith('-') ? next : null)
    const used = inline === null && value !== null ? 2 : 1
    // The conversation it resumed is the one the way back resumes, so it is replaced rather than dropped.
    if (name === '--resume' || name === '-r') {
      at += used
      continue
    }
    if (keeps === false) kept.push({ name, value: null })
    else if (keeps === true && value !== null && withSecretsMarked(`${name} ${value}`).marked.length === 0) kept.push({ name, value })
    else {
      const named = withSecretsMarked(name).text
      if (!dropped.includes(named)) dropped.push(named)
    }
    at += used
  }
  return { kept, dropped }
}

/**
 * The same, with the kept flags as the words a command line takes.
 *
 * @param {string | null} commandLine
 * @returns {{ kept: string[], dropped: string[] }}
 */
export function theClaudeFlagsIn(commandLine) {
  const { kept, dropped } = theStartFlagsOf(commandLine)
  return { kept: kept.flatMap((one) => (one.value === null ? [one.name] : [one.name, one.value])), dropped }
}

/**
 * THE START FLAGS A RECORD STORED, read through the same check as a command line, or null when it stored none.
 *
 * The kept flags are put back into words and read by `theStartFlagsOf`, so a flag this file does not keep, or a value
 * that looks like a key, is dropped as it would be from a command line. A dropped name is marked where it looks like one.
 *
 * @param {unknown} stored
 * @returns {{ kept: string[], dropped: string[] } | null}
 */
function theStoredFlags(stored) {
  const bag = bagOf(stored)
  if (bag === null || !Array.isArray(bag['kept']) || !Array.isArray(bag['dropped'])) return null
  const words = bag['kept'].flatMap((one) => {
    const flag = bagOf(one)
    const name = textOf(flag?.['name'])
    const value = textOf(flag?.['value'])
    return name === null ? [] : value === null ? [name] : [name, value]
  })
  const read = theClaudeFlagsIn(words.length === 0 ? null : ['claude', ...words].join(' '))
  for (const one of bag['dropped']) {
    if (typeof one !== 'string') continue
    const named = withSecretsMarked(one).text
    if (!read.dropped.includes(named)) read.dropped.push(named)
  }
  return read
}

/**
 * The host command that resumes a Claude Code conversation, as one shell line.
 *
 * @param {{ folder: string, sessionId: string, flags?: string[] }} asked
 * @returns {string}
 */
export function theClaudeWayBack({ folder, sessionId, flags = [] }) {
  return theHostLine(folder, 'claude', ['--resume', sessionId, ...flags])
}

/**
 * THE ARGUMENTS THAT BRING BACK A ROUND THAT RAN IN A SANDBOX, through `sandbox.mjs exec --tty`.
 *
 * Agreed by message in wave 13u's round 10: the sandbox tool imports this and writes no copy. The office is
 * the caller when the person presses (decision VeP_YtTzTeh5), so a press passes `pressSession`, the run the
 * office files for that press, and the arguments carry `--as mole-office --session <it>`. Without it (a command
 * shown for a person to run by hand) the two are left off, and the launcher files the run for whoever runs it.
 * A model nobody recorded is left off rather than guessed.
 *
 * @param {{ instance: string, handle: string, continues: string, folder: string, sessionId: string,
 *   model?: string | null, pressSession?: string | null }} asked
 * @returns {string[]} the arguments after `node`
 */
export function theSandboxWayBack({ instance, handle, continues, folder, sessionId, model = null, pressSession = null }) {
  return [
    'tools/sandbox.mjs', 'exec', instance, '--tty', '--agent', handle, '--runtime', 'claude-code', '--continues', continues,
    '--cwd', folder,
    ...(pressSession === null ? [] : ['--as', 'mole-office', '--session', pressSession]),
    '--', 'claude', '--resume', sessionId,
    ...(model === null ? [] : ['--model', model]),
    '--permission-mode', 'bypassPermissions',
  ]
}

const textOf = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)
const bagOf = (value) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null)

/**
 * THE WAY BACK TO ONE SESSION RECORD.
 *
 * `host` is a command for this computer. `sandbox` is a round that ran in a sandbox: its command goes through
 * the sandbox tool, and `sandbox` carries what the press needs. `none` is a run with no way back, and `because` says why.
 *
 * @param {{ id: string, data: Record<string, unknown> }} session
 * @returns {{ way: 'host', runtime: string, program: 'claude' | 'codex' | 'opencode', args: string[], command: string, folder: string, sessionId: string, kept: string[], dropped: string[] }
 *   | { way: 'sandbox', runtime: string, command: string, folder: string, sessionId: string, sandbox: { instance: string, handle: string, continues: string, folder: string, sessionId: string, model: string | null } }
 *   | { way: 'none', runtime: string | null, because: string }}
 */
export function theWayBackOf(session) {
  const data = session.data
  const stamp = bagOf(bagOf(data['extra'])?.['discovered'])
  const runtime = textOf(data['runtime']) ?? textOf(stamp?.['tool'])
  const sessionId = textOf(data['providerSession']) ?? textOf(stamp?.['externalId'])
  const folder = textOf(data['workingDirectory'])
  const sandbox = bagOf(data['sandbox'])

  if (runtime === null) return { way: 'none', runtime, because: 'Nobody recorded which program this run used.' }
  if (runtime !== 'claude-code' && runtime !== 'codex' && runtime !== 'opencode') {
    return { way: 'none', runtime, because: `A ${runtime} run has no command that resumes its conversation.` }
  }
  if (sessionId === null) return { way: 'none', runtime, because: 'Nobody recorded which conversation this run was.' }
  if (folder === null) {
    return { way: 'none', runtime, because: 'Nobody recorded the folder this run worked in, and its conversation is resumed from there.' }
  }

  if (sandbox !== null) {
    const instanceFolder = textOf(sandbox['folder'])
    const instance = instanceFolder === null ? null : instanceFolder.replace(/\/+$/, '').split('/').pop() ?? null
    const handle = textOf(data['servingAgent'])
    if (runtime !== 'claude-code') return { way: 'none', runtime, because: 'Only a Claude Code round can be brought back inside its sandbox.' }
    if (instance === null || instance === '') return { way: 'none', runtime, because: 'Nobody recorded which sandbox this round ran in.' }
    if (handle === null) return { way: 'none', runtime, because: 'Nobody recorded which agent this round served.' }
    const model = textOf(data['model'])
    const asked = { instance, handle, continues: session.id, folder, sessionId, model }
    return { way: 'sandbox', runtime, command: ['node', ...theSandboxWayBack(asked)].map(shellQuote).join(' '), folder, sessionId, sandbox: asked }
  }

  if (runtime === 'codex') {
    const args = ['resume', sessionId]
    return { way: 'host', runtime, program: 'codex', args, command: theHostLine(folder, 'codex', args), folder, sessionId, kept: [], dropped: [] }
  }
  if (runtime === 'opencode') {
    const args = ['--session', sessionId]
    return { way: 'host', runtime, program: 'opencode', args, command: theHostLine(folder, 'opencode', args), folder, sessionId, kept: [], dropped: [] }
  }
  const { kept, dropped } = theStoredFlags(stamp?.['pidFlags']) ?? theClaudeFlagsIn(textOf(stamp?.['pidCommand']))
  const args = ['--resume', sessionId, ...kept]
  return { way: 'host', runtime, program: 'claude', args, command: theHostLine(folder, 'claude', args), folder, sessionId, kept, dropped }
}

/** The shell line for a host way back: into its folder, then the program with its arguments. */
function theHostLine(folder, program, args) {
  return `cd ${quoteTheFolder(folder)} && ${[program, ...args].map(shellQuote).join(' ')}`
}
