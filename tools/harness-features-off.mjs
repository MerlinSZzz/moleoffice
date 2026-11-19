// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN THE LAUNCHERS START HAS THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF, so work a run would hand to one goes to
 * a worker registered in the office, where it is recorded. The switches are one list, in
 * src/config/harness-features-off.mjs, which the office's own terminal launches read as well; this file hands it on and
 * keeps no copy. Claude Code's and Codex's switches go in twice:
 * - into the command, by aCommandWithTheHarnessFeaturesOff, when the command's program is its runtime's own;
 * - into the run's home, by theHarnessFeaturesOffInAHome, so a harness started inside a shell's words has them as well:
 *   Claude Code's permissions.deny in <home>/.claude/settings.json, and Codex's features under [features] in
 *   <home>/.codex/config.toml. A sandbox run sets neither CLAUDE_CONFIG_DIR nor CODEX_HOME, so these are the files it
 *   reads. Both go in at every start, whatever its runtime, since a shell's words can start either harness.
 * OpenCode's switch is its environment, which reaches it inside a shell as well. dsh's is its --patch, and dsh reads
 * its tools from its profile, which does not take the patch yet, so a dsh started inside a shell's words has them.
 * tools/sandbox-start.mjs puts these into the command and the home at every start, and tools/sandbox.mjs into an
 * isolated run's, and puts the starting words first in the brief of a worker or a round.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import {
  CLAUDE_CODE_FEATURES_OFF, CLAUDE_CODE_TOOLS_OFF, CODEX_FEATURES_OFF, CODEX_FEATURE_NAMES_OFF, DSH_FEATURES_OFF, anOpenCodeConfigWithTheFeaturesOff,
} from '../src/config/harness-features-off.mjs'

export {
  CLAUDE_CODE_FEATURES_OFF, CLAUDE_CODE_TOOLS_OFF, CODEX_FEATURES_OFF, CODEX_FEATURE_NAMES_OFF, DSH_FEATURES_OFF, DSH_PATCH_IN_A_CHECKOUT,
  OPENCODE_FEATURES_OFF, anOpenCodeConfigWithTheFeaturesOff,
} from '../src/config/harness-features-off.mjs'

/** The first chapter of a worker's or a round's brief, when what starts it puts the switch in. */
export const THE_STARTING_WORDS = [
  '# Subagents and workflows are off',
  '',
  'This run has the harness\'s own subagents and workflows switched off. Do not try to start one.',
  'Work you would hand to one goes to a worker registered in the office, where it is recorded.',
].join('\n')
/** The first chapter when what starts it does not, so that the brief says nothing about the run that is not so. */
export const THE_STARTING_WORDS_WITHOUT_THE_SWITCH = [
  '# Do not use subagents or workflows',
  '',
  'This run\'s launcher could not switch the harness\'s own subagents and workflows off. Do not start one.',
  'Work you would hand to one goes to a worker registered in the office, where it is recorded.',
].join('\n')

/**
 * WHETHER A RUN-AGENT.SH GIVES DSH THE PATCH, by its code and never by a file name in its text. tools/sandbox.mjs asks
 * this of the sandbox's tools/dsh-hooks/run-agent.sh to choose a dsh run's starting words, and its test asks the same.
 * Yes when every command that has dsh as a word also has `--patch "$name"`, and `name` was set earlier, in code, from a
 * read of DSH_FEATURES_OFF in harness-features-off.mjs. A comment counts for nothing. Quotes, `$( )`, `${ }`,
 * backslashes and comments are read as bash reads them; a here-document is read as commands.
 * @param {string} text the script's text
 * @returns {boolean}
 */
export function aRunnerGivesDshThePatch(text) {
  const read = new Set()
  let starts = 0
  for (const words of theShellsCommands(text)) {
    const set = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(words[0] ?? '')
    if (set !== null && words[0].includes('DSH_FEATURES_OFF') && words[0].includes('harness-features-off.mjs')) read.add(set[1])
    if (!words.some((word) => word.split('/').pop() === 'dsh')) continue
    starts += 1
    const named = (word) => { const found = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/.exec(word ?? ''); return found?.[1] ?? found?.[2] }
    if (!words.some((word, at) => word === '--patch' && read.has(named(words[at + 1])))) return false
  }
  return starts > 0
}

/** The commands of a shell script, each as its words with the quotes taken off, and its comments left out. */
function theShellsCommands(text) {
  const commands = []
  let words = []
  let word = null
  const endTheWord = () => { if (word !== null) words.push(word); word = null }
  const endTheCommand = () => { endTheWord(); if (words.length > 0) commands.push(words); words = [] }
  let at = 0
  while (at < text.length) {
    const c = text[at]
    if (c === '\\') {
      if (text[at + 1] !== '\n') word = (word ?? '') + (text[at + 1] ?? '')
      at += 2
    } else if (c === '\'') {
      const to = theClosingQuote(text, at)
      word = (word ?? '') + text.slice(at + 1, to)
      at = to + 1
    } else if (c === '"') {
      const to = theClosingDoubleQuote(text, at)
      word = (word ?? '') + text.slice(at + 1, to)
      at = to + 1
    } else if (c === '$' && (text[at + 1] === '(' || text[at + 1] === '{')) {
      const to = theClosingBracket(text, at + 1)
      word = (word ?? '') + text.slice(at, to + 1)
      at = to + 1
    } else if (c === '#' && word === null) {
      const to = text.indexOf('\n', at)
      at = to < 0 ? text.length : to
    } else if (c === '\n' || c === ';' || c === '&' || c === '|') {
      endTheCommand()
      at += 1
    } else if (c === ' ' || c === '\t') {
      endTheWord()
      at += 1
    } else {
      word = (word ?? '') + c
      at += 1
    }
  }
  endTheCommand()
  return commands
}

/** Where the single quote opened at `open` closes, or the end of the text. */
function theClosingQuote(text, open) {
  const to = text.indexOf('\'', open + 1)
  return to < 0 ? text.length : to
}

/** Where the double quote opened at `open` closes, past any `$( )` or `${ }` inside it, or the end of the text. */
function theClosingDoubleQuote(text, open) {
  let at = open + 1
  while (at < text.length && text[at] !== '"') {
    if (text[at] === '\\') at += 2
    else if (text[at] === '$' && (text[at + 1] === '(' || text[at + 1] === '{')) at = theClosingBracket(text, at + 1) + 1
    else at += 1
  }
  return Math.min(at, text.length)
}

/** Where the `(` or `{` at `open` closes, past quotes and brackets inside it, or the end of the text. */
function theClosingBracket(text, open) {
  const opening = text[open]
  const closing = opening === '(' ? ')' : '}'
  let depth = 1
  let at = open + 1
  while (at < text.length) {
    const c = text[at]
    if (c === '\\') at += 2
    else if (c === '\'') at = theClosingQuote(text, at) + 1
    else if (c === '"') at = theClosingDoubleQuote(text, at) + 1
    else if (c === '$' && (text[at + 1] === '(' || text[at + 1] === '{')) at = theClosingBracket(text, at + 1) + 1
    else {
      if (c === opening) depth += 1
      else if (c === closing && --depth === 0) return at
      at += 1
    }
  }
  return text.length
}

/**
 * The command with the switches for its runtime. The program is read after any `env NAME=value` words. A command whose
 * program is not its runtime's own, as a shell's, gets none, and the answer says so, since nothing here rewrites a shell's
 * words: Claude Code and Codex have it from the run's home instead (theHarnessFeaturesOffInAHome), and dsh does not.
 * OpenCode's switch is its environment, so it reaches an OpenCode started inside a shell as well.
 * @param {readonly string[]} command
 * @param {Record<string, string | undefined>} env
 * @param {string | null} runtime What the command runs, read as the launcher reads it (aCommandsRuntime).
 * @param {string | null} [dshPatch] dsh's patch file where the command will read it, null when it has none there.
 * @returns {{ command: string[], env: Record<string, string>, says: string[] }}
 */
export function aCommandWithTheHarnessFeaturesOff(command, env, runtime, dshPatch = DSH_FEATURES_OFF[1]) {
  let at = 0
  if (String(command[0] ?? '').split('/').pop() === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) at++
  }
  const program = String(command[at] ?? '').split('/').pop()
  /** @param {readonly string[]} words */
  const after = (words) => ({ command: [...command.slice(0, at + 1), ...words, ...command.slice(at + 1)], env: {}, says: [] })
  if (runtime === 'opencode') {
    return { command: [...command], env: { OPENCODE_CONFIG_CONTENT: anOpenCodeConfigWithTheFeaturesOff(env['OPENCODE_CONFIG_CONTENT']) }, says: [] }
  }
  const itsOwn = runtime !== null && Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime) && program === THE_PROGRAM_A_RUNTIME_RUNS[runtime]
  if (itsOwn && runtime === 'claude-code') return after(CLAUDE_CODE_FEATURES_OFF)
  if (itsOwn && runtime === 'codex') return after(CODEX_FEATURES_OFF)
  if (itsOwn && runtime === 'dsh' && dshPatch !== null) return after(['--patch', dshPatch])
  if (itsOwn && runtime === 'dsh') {
    return { command: [...command], env: {}, says: [
      `This dsh command has no ${DSH_FEATURES_OFF[1].split('/').pop()} where it runs, so the run has the harness's own subagents and workflows.`,
    ] }
  }
  if (runtime === 'claude-code' || runtime === 'codex') {
    return { command: [...command], env: {}, says: [
      `This ${runtime} command starts ${program}, so the launcher does not put the switch that turns the harness's own subagents and workflows off into its words. It is in the run's home (${runtime === 'codex' ? '.codex/config.toml' : '.claude/settings.json'}), which the program reads unless its command points it at another.`,
    ] }
  }
  if (runtime === 'dsh') {
    return { command: [...command], env: {}, says: [
      `This dsh command starts ${program}, so the launcher cannot put the switch that turns the harness's own subagents and workflows off into its words, and dsh's own profile does not carry it yet: the run has them unless its command turns them off itself.`,
    ] }
  }
  return { command: [...command], env: {}, says: [] }
}

/**
 * THE SWITCH IN A RUN'S HOME: Claude Code's denied tools in <home>/.claude/settings.json, and Codex's features in
 * <home>/.codex/config.toml. Everything else either file holds is kept. A file is written only when the switch is not
 * all in it already, and then whole, through a new file beside it that takes its place, so a run that reads it while
 * another start writes it never sees half of it. A file this cannot put the switch into is refused, and neither file is written.
 * @param {string} home
 * @returns {string[]} A sentence for each file written.
 */
export function theHarnessFeaturesOffInAHome(home) {
  const claude = join(home, '.claude', 'settings.json')
  const codex = join(home, '.codex', 'config.toml')
  const settings = aClaudeCodeSettingsWithTheFeaturesOff(claude)
  const held = existsSync(codex) ? readFileSync(codex, 'utf8') : ''
  const config = aCodexConfigWithTheFeaturesOff(held, codex)
  const said = []
  if (settings !== null) {
    aFileWrittenWhole(claude, settings)
    said.push(`${claude} denies Claude Code's own subagent and workflow tools as well, so a Claude Code started inside a shell's words has them off.`)
  }
  if (config !== held) {
    aFileWrittenWhole(codex, config)
    said.push(`${codex} turns Codex's subagent features off as well, so a Codex started inside a shell's words has them off.`)
  }
  return said
}

/**
 * The file with this text, written to a new file in the same folder that is then renamed over it, so the file is either
 * the old text or the new one and never a part of either. The new file keeps the old one's mode, and a file that was not
 * there gets the mode any new file gets.
 * @param {string} file
 * @param {string} text
 */
export function aFileWrittenWhole(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : null
  const next = join(dirname(file), `.${basename(file)}.${process.pid}-${randomBytes(6).toString('hex')}.next`)
  try {
    writeFileSync(next, text, { flag: 'wx', ...(mode === null ? {} : { mode }) })
    if (mode !== null) chmodSync(next, mode)
    renameSync(next, file)
  } catch (why) {
    rmSync(next, { force: true })
    throw why
  }
}

/**
 * Claude Code's settings with its denied tools added after any it denies already, or null when it denies them all.
 * @param {string} file
 * @returns {string | null}
 */
function aClaudeCodeSettingsWithTheFeaturesOff(file) {
  let held = {}
  if (existsSync(file)) {
    try { held = JSON.parse(readFileSync(file, 'utf8')) } catch { held = null }
  }
  const settings = claudeCodeSettingsWithTheToolsDenied(held, file)
  return settings === null ? null : `${JSON.stringify(settings, null, 2)}\n`
}

/**
 * Claude Code's settings, as read, with its denied tools added after any it denies already, or null when it denies them
 * all. tools/sandbox-common.mjs's prepareClaudeRunHome puts them in with the run hooks, in the same write.
 * @param {unknown} held
 * @param {string} file For the refusal.
 * @returns {Record<string, unknown> | null}
 */
export function claudeCodeSettingsWithTheToolsDenied(held, file) {
  const object = (/** @type {unknown} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!object(held) || (held.permissions !== undefined && !object(held.permissions)) || (held.permissions?.deny !== undefined && !Array.isArray(held.permissions.deny))) {
    throw new Error(`${file} is not a JSON object whose permissions.deny is a list, so Claude Code's own subagent and workflow tools could not be denied in it. Nothing in it was changed, and nothing was started.`)
  }
  const deny = held.permissions?.deny ?? []
  const missing = CLAUDE_CODE_TOOLS_OFF.filter((name) => !deny.includes(name))
  if (missing.length === 0) return null
  return { ...held, permissions: { ...held.permissions, deny: [...deny, ...missing] } }
}

/**
 * A config.toml with each of Codex's features off set false in its one [features] table, as lines: a key's line is
 * written again, a missing key goes after the table's last line that is not blank or a comment, and a file with no such
 * table gets one at its end. Every other line stays as it was. Lines inside a multi-line string are not read as keys.
 * The switch is refused where the features are written another way, as a root `features = { ... }`, a dotted
 * `features.x` key or a [features.x] table for one of them, since a table added beside those would be a second
 * definition that Codex refuses.
 * @param {string} text
 * @param {string} file For the refusal.
 * @returns {string}
 */
function aCodexConfigWithTheFeaturesOff(text, file) {
  const refuse = (/** @type {string} */ how) => {
    throw new Error(`${file} ${how}, so Codex's subagent features could not be turned off in it. Nothing in it was changed, and nothing was started.`)
  }
  const bare = (/** @type {string} */ name) => name.trim().replace(/^"(.*)"$|^'(.*)'$/, '$1$2')
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n')
  let table = ''
  /** @type {string | null} */ let inString = null
  let features = -1, last = -1
  /** @type {Map<string, number>} */ const found = new Map()
  lines.forEach((line, at) => {
    if (inString !== null) {
      if (table === 'features') last = at
      if (line.includes(inString)) inString = null
      return
    }
    const header = /^\s*\[(\[?)([^[\]]+)\]\]?\s*(#.*)?$/.exec(line)
    if (header) {
      table = header[2].split('.').map(bare).join('.')
      if (header[1] === '' && table === 'features') {
        if (features >= 0) refuse('has two [features] tables')
        features = at
        last = at
      }
      if (CODEX_FEATURE_NAMES_OFF.some((name) => table === `features.${name}`)) refuse(`has a [${table}] table`)
      return
    }
    const pair = /^\s*([^=#\s][^=#]*?)\s*=\s*(.*)$/.exec(line)
    // A line of a value written over several lines belongs to the key above it, so nothing goes in before it.
    if (table === 'features' && line.trim() !== '' && !line.trim().startsWith('#')) last = at
    if (!pair) return
    const key = pair[1].split('.').map(bare)
    const value = pair[2]
    for (const quotes of ['"""', "'''"]) {
      if (value.startsWith(quotes) && !value.slice(3).includes(quotes)) inString = quotes
    }
    if (table === '' && key[0] === 'features') refuse(`sets its features with ${pair[1].trim()} = ..., outside a [features] table`)
    if (table !== 'features') return
    if (CODEX_FEATURE_NAMES_OFF.includes(key[0]) && key.length > 1) refuse(`sets ${pair[1].trim()} under [features]`)
    if (key.length === 1 && CODEX_FEATURE_NAMES_OFF.includes(key[0])) found.set(key[0], at)
  })
  const off = (/** @type {string} */ name) => `${name} = false`
  if (features < 0) {
    return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${text === '' ? '' : '\n'}[features]\n${CODEX_FEATURE_NAMES_OFF.map(off).join('\n')}\n`
  }
  let changed = false
  for (const [name, at] of found) {
    if (/^\s*[^=]*=\s*false\s*(#.*)?$/.test(lines[at])) continue
    lines[at] = `${/^\s*/.exec(lines[at])?.[0] ?? ''}${off(name)}`
    changed = true
  }
  const added = CODEX_FEATURE_NAMES_OFF.filter((name) => !found.has(name)).map(off)
  if (added.length > 0) changed = true
  lines.splice(last + 1, 0, ...added)
  return changed ? `${lines.join('\n')}\n` : text
}
