// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT A PENDING TOOL CALL WOULD DO TO WHICH PATHS, read without running any of it.
 *
 * The main-world guard's policy (`main-world-guard-policy.mjs`) judges effects: this path would be deleted, that one
 * moved, a third overwritten, HOME set to this. This file is where a call becomes those effects. For
 * a shell command it reads the text the way bash would expand it — quotes, variables and what the
 * same command line assigned to them, `~`, `$(…)`, `cd`, `&&`, `if [ -n … ]`, heredocs, wrappers
 * such as `sudo`, `nice` and `env`, and `bash -c` — as far as that can be done without running
 * anything. A part whose value cannot be known is said to be unknown, and whether it may be empty,
 * rather than guessed. For the file tools and the patch format it reads the path the tool names.
 *
 * It knows nothing about which effects are allowed. That is `main-world-guard-policy.mjs`, and only there.
 */

import { existsSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** @typedef {import('./main-world-guard-policy.mjs').World} World */

/**
 * One pending tool call, in the shape of a Claude Code PreToolUse payload.
 * @typedef {object} ToolCall
 * @property {string} tool The tool's name as the runtime spells it: Bash, Write, apply_patch, bash, write…
 * @property {Record<string, unknown>} input The tool's arguments.
 * @property {string} cwd The directory the call runs in.
 */

/**
 * What a word comes to when the shell expands it, as far as it can be known without running it.
 * @typedef {object} Value
 * @property {string | null} text The whole expansion, or null because part of it is unknown.
 * @property {boolean} maybeEmpty Whether it can come out as the empty string.
 * @property {string[]} emptyVars Variables in it that are empty or unset here.
 * @property {string[]} doubts Sentences naming each part whose value is unknown and may be empty.
 * @property {string | null} prefix For an unknown value: the directory it is known to land in.
 * @property {boolean} glob Whether an unquoted *, ? or [ is in it.
 * @property {boolean} aborts True when ${X:?} meets an empty X, so the shell stops before the command.
 * @property {string} said The word as it was written, for messages.
 */

/**
 * One thing a call would do to one path.
 * `delete`: removed. `move`: moved away from here. `overwrite`: replaced whole, if it exists.
 * `write`: created, appended to or edited in part.
 * @typedef {object} Effect
 * @property {'delete' | 'move' | 'overwrite' | 'write'} kind
 * @property {Value} target
 * @property {string | null} cwd The directory a relative target is resolved against, or null when unknown.
 * @property {string | null} cwdDoubt Why the directory is uncertain, when it is.
 * @property {string} verb The command or tool, for messages (`rm`, `git clean`, `Write`, `>`).
 * @property {boolean} [trackedOnly] git reset --hard: only tracked files, so rule 3's containment does not apply.
 * @property {boolean} [untrackedOnly] git clean without -x: ignored files survive, so rule 3's containment does not apply.
 * @property {boolean} [within] find -delete and git clean delete files under the path, not the path itself.
 * @property {{ pattern: string, caseless: boolean }[]} [names] find -name / -iname: only files with a matching name are deleted.
 * @property {string} [command] The simple command it comes from, as written, for messages.
 */

// ---------------------------------------------------------------------------------------
// THE SHELL, READ WITHOUT RUNNING IT
// ---------------------------------------------------------------------------------------

/**
 * One piece of a word.
 * @typedef {{ t: 'lit', v: string, q: boolean }
 *   | { t: 'var', name: string, op: string, arg: Part[] | null, q: boolean }
 *   | { t: 'sub', script: string, q: boolean }
 *   | { t: 'tilde', user: string }
 *   | { t: 'arith' }} Part
 */

/**
 * A lexical token.
 * @typedef {{ t: 'word', parts: Part[], raw: string }
 *   | { t: 'op', op: string }
 *   | { t: 'redir', op: string, fd: string }} Token
 */

const METACHARS = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')'])
const SPECIAL_PARAMS = new Set(['@', '*', '#', '?', '-', '$', '!', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

/**
 * The index just past the `close` that balances the `open` already consumed before `i`, honouring
 * quotes, escapes and nesting. Unbalanced text ends at the end of the source rather than throwing:
 * a command the shell itself would reject is not this file's to crash on.
 * @param {string} src @param {number} i @param {string} open @param {string} close
 * @returns {number}
 */
function balanced(src, i, open, close) {
  let depth = 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === "'" && open !== '{') { const end = src.indexOf("'", i + 1); i = end === -1 ? src.length : end + 1; continue }
    if (c === '"') { i = endOfDouble(src, i + 1); continue }
    if (c === '`') { const end = src.indexOf('`', i + 1); i = end === -1 ? src.length : end + 1; continue }
    if (c === open) depth += 1
    else if (c === close) { depth -= 1; if (depth === 0) return i + 1 }
    i += 1
  }
  return src.length
}

/**
 * The index just past the `"` that closes a double-quoted string starting at `i`.
 * @param {string} src @param {number} i @returns {number}
 */
function endOfDouble(src, i) {
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === '"') return i + 1
    if (c === '$' && src[i + 1] === '(') { i = balanced(src, i + 2, '(', ')'); continue }
    if (c === '$' && src[i + 1] === '{') { i = balanced(src, i + 2, '{', '}'); continue }
    if (c === '`') { const end = src.indexOf('`', i + 1); i = end === -1 ? src.length : end + 1; continue }
    i += 1
  }
  return src.length
}

/**
 * Read one `$…` expansion at `i` (which points at `$`). Returns the part and the index after it.
 * @param {string} src @param {number} i @param {boolean} q
 * @returns {{ part: Part, end: number }}
 */
function dollar(src, i, q) {
  const next = src[i + 1] ?? ''
  if (src.startsWith('$((', i)) {
    const end = balanced(src, i + 3, '(', ')')
    return { part: { t: 'arith' }, end: src[end] === ')' ? end + 1 : end }
  }
  if (next === '(') {
    const end = balanced(src, i + 2, '(', ')')
    return { part: { t: 'sub', script: src.slice(i + 2, end - 1), q }, end }
  }
  if (next === '{') {
    const end = balanced(src, i + 2, '{', '}')
    return { part: braced(src.slice(i + 2, end - 1), q), end }
  }
  if (next === "'" && !q) {
    // $'…': ANSI-C quoting. Only the common escapes matter here; the text is a literal.
    let j = i + 2
    let v = ''
    while (j < src.length && src[j] !== "'") {
      if (src[j] === '\\' && j + 1 < src.length) {
        const e = src[j + 1]
        v += e === 'n' ? '\n' : e === 't' ? '\t' : e ?? ''
        j += 2
      } else { v += src[j]; j += 1 }
    }
    return { part: { t: 'lit', v, q: true }, end: j + 1 }
  }
  if (SPECIAL_PARAMS.has(next)) return { part: { t: 'var', name: next, op: '', arg: null, q }, end: i + 2 }
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1))
  if (name === null) return { part: { t: 'lit', v: '$', q }, end: i + 1 }
  return { part: { t: 'var', name: name[0], op: '', arg: null, q }, end: i + 1 + name[0].length }
}

/**
 * The inside of `${…}`: a name, and the operator and argument that follow it.
 * @param {string} inner @param {boolean} q @returns {Part}
 */
function braced(inner, q) {
  if (inner.startsWith('#') && inner.length > 1) return { t: 'var', name: inner.slice(1), op: 'length', arg: null, q }
  if (inner.startsWith('!')) return { t: 'var', name: inner.slice(1), op: 'indirect', arg: null, q }
  const name = /^([A-Za-z_][A-Za-z0-9_]*|[@*#?$!0-9-])/.exec(inner)
  if (name === null) return { t: 'var', name: inner, op: 'unknown', arg: null, q }
  const rest = inner.slice(name[0].length)
  if (rest === '') return { t: 'var', name: name[0], op: '', arg: null, q }
  const op = /^(:-|:=|:\?|:\+|-|=|\?|\+|%%|%|##|#|\/\/|\/|\^\^|\^|,,|,|:)/.exec(rest)
  if (op === null) return { t: 'var', name: name[0], op: 'unknown', arg: null, q }
  return { t: 'var', name: name[0], op: op[0], arg: wordParts(rest.slice(op[0].length), q), q }
}

/**
 * Split a string that is one word's worth of text into parts, as if it were inside a word.
 * Used for the argument of ${X:-word}.
 * @param {string} text @param {boolean} q @returns {Part[]}
 */
function wordParts(text, q) {
  const { parts } = scanWord(text, 0, q)
  return parts
}

/**
 * Scan one word starting at `i`. Stops at an unquoted metacharacter (or, for text already inside a
 * word, at the end). Returns its parts and the index after it.
 * @param {string} src @param {number} i @param {boolean} [inside]
 * @returns {{ parts: Part[], end: number }}
 */
function scanWord(src, i, inside = false) {
  /** @type {Part[]} */
  const parts = []
  /** @param {string} v @param {boolean} q */
  const lit = (v, q) => {
    const last = parts[parts.length - 1]
    if (last !== undefined && last.t === 'lit' && last.q === q) last.v += v
    else parts.push({ t: 'lit', v, q })
  }
  const start = i
  while (i < src.length) {
    const c = src[i] ?? ''
    if (!inside && METACHARS.has(c)) break
    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue }
      lit(src[i + 1] ?? '', true)
      i += 2
      continue
    }
    if (c === "'" && !inside) {
      const end = src.indexOf("'", i + 1)
      lit(src.slice(i + 1, end === -1 ? src.length : end), true)
      i = end === -1 ? src.length : end + 1
      continue
    }
    if (c === '"') {
      const end = endOfDouble(src, i + 1)
      const body = src.slice(i + 1, end - 1)
      for (const part of doubleParts(body)) {
        if (part.t === 'lit') lit(part.v, true)
        else parts.push(part)
      }
      i = end
      continue
    }
    if (c === '$') {
      const got = dollar(src, i, inside)
      parts.push(got.part)
      i = got.end
      continue
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1)
      parts.push({ t: 'sub', script: src.slice(i + 1, end === -1 ? src.length : end), q: inside })
      i = end === -1 ? src.length : end + 1
      continue
    }
    if (c === '~' && i === start && !inside) {
      const user = /^~([A-Za-z0-9_.-]*)/.exec(src.slice(i))
      const u = user?.[1] ?? ''
      const after = src[i + 1 + u.length] ?? ''
      if (after === '' || after === '/' || METACHARS.has(after)) {
        parts.push({ t: 'tilde', user: u })
        i += 1 + u.length
        continue
      }
    }
    lit(c, inside)
    i += 1
  }
  return { parts, end: i }
}

/**
 * The parts of the inside of a double-quoted string: literal text and expansions, all quoted.
 * @param {string} body @returns {Part[]}
 */
function doubleParts(body) {
  /** @type {Part[]} */
  const parts = []
  let text = ''
  let i = 0
  const flush = () => { if (text !== '') { parts.push({ t: 'lit', v: text, q: true }); text = '' } }
  while (i < body.length) {
    const c = body[i] ?? ''
    if (c === '\\' && i + 1 < body.length && '$`"\\\n'.includes(body[i + 1] ?? '')) {
      if (body[i + 1] !== '\n') text += body[i + 1]
      i += 2
      continue
    }
    if (c === '$') {
      flush()
      const got = dollar(body, i, true)
      if (got.part.t === 'lit') text += got.part.v
      else parts.push(got.part)
      i = got.end
      continue
    }
    if (c === '`') {
      flush()
      const end = body.indexOf('`', i + 1)
      parts.push({ t: 'sub', script: body.slice(i + 1, end === -1 ? body.length : end), q: true })
      i = end === -1 ? body.length : end + 1
      continue
    }
    text += c
    i += 1
  }
  flush()
  return parts
}

/**
 * Split a command string into tokens. Heredoc bodies are skipped, because they are text a program
 * reads, not commands the shell runs.
 * @param {string} src @returns {Token[]}
 */
export function lex(src) {
  /** @type {Token[]} */
  const out = []
  /** @type {{ delim: string, strip: boolean }[]} */
  let heredocs = []
  let i = 0
  let expectHeredocWord = /** @type {null | boolean} */ (null)
  while (i < src.length) {
    const c = src[i] ?? ''
    if (c === ' ' || c === '\t') { i += 1; continue }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue }
    if (c === '\n') {
      out.push({ t: 'op', op: '\n' })
      i += 1
      for (const doc of heredocs) i = pastHeredoc(src, i, doc)
      heredocs = []
      continue
    }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    const three = src.slice(i, i + 3)
    const two = src.slice(i, i + 2)
    if (three === '<<-' || (two === '<<' && three !== '<<<')) {
      expectHeredocWord = three === '<<-'
      out.push({ t: 'redir', op: three === '<<-' ? '<<-' : '<<', fd: '' })
      i += three === '<<-' ? 3 : 2
      continue
    }
    if (three === '&>>') { out.push({ t: 'redir', op: '&>>', fd: '' }); i += 3; continue }
    if (three === '<<<') { out.push({ t: 'redir', op: '<<<', fd: '' }); i += 3; continue }
    if (['&&', '||', ';;', '|&'].includes(two)) { out.push({ t: 'op', op: two }); i += 2; continue }
    if (['>>', '>&', '<&', '&>', '>|', '<>'].includes(two)) { out.push({ t: 'redir', op: two, fd: '' }); i += 2; continue }
    if ((c === '<' || c === '>') && src[i + 1] === '(') {
      const end = balanced(src, i + 2, '(', ')')
      out.push({ t: 'word', parts: [{ t: 'sub', script: src.slice(i + 2, end - 1), q: false }], raw: src.slice(i, end) })
      i = end
      continue
    }
    if (c === '<' || c === '>') { out.push({ t: 'redir', op: c, fd: '' }); i += 1; continue }
    if (';&|()'.includes(c)) { out.push({ t: 'op', op: c }); i += 1; continue }
    const { parts, end } = scanWord(src, i)
    const raw = src.slice(i, end)
    // A FILE DESCRIPTOR IN FRONT OF A REDIRECTION (`2>`) is part of the redirection, not a word.
    if (/^[0-9]+$/.test(raw) && (src[end] === '<' || src[end] === '>')) {
      i = end
      const three2 = src.slice(i, i + 3)
      const two2 = src.slice(i, i + 2)
      const op = three2 === '&>>' ? '&>>' : ['>>', '>&', '<&', '>|', '<>'].includes(two2) ? two2 : src[i] ?? '>'
      out.push({ t: 'redir', op, fd: raw })
      i += op.length
      continue
    }
    if (expectHeredocWord !== null) {
      heredocs.push({ delim: parts.map((p) => (p.t === 'lit' ? p.v : '')).join(''), strip: expectHeredocWord })
      expectHeredocWord = null
    }
    out.push({ t: 'word', parts, raw })
    i = end
  }
  return out
}

/**
 * The index after a heredoc body that begins at `i`.
 * @param {string} src @param {number} i @param {{ delim: string, strip: boolean }} doc
 * @returns {number}
 */
function pastHeredoc(src, i, doc) {
  while (i < src.length) {
    const nl = src.indexOf('\n', i)
    const line = src.slice(i, nl === -1 ? src.length : nl)
    i = nl === -1 ? src.length : nl + 1
    if ((doc.strip ? line.replace(/^\t+/, '') : line) === doc.delim) break
  }
  return i
}

/**
 * One simple command, or a marker that shapes the list around it.
 * @typedef {{ k: 'cmd', assigns: { name: string, parts: Part[], raw: string }[], words: Token[], redirs: { op: string, fd: string, target: Token | null }[], raw: string }
 *   | { k: 'op', op: string }
 *   | { k: 'kw', w: string }
 *   | { k: 'for', name: string, words: Token[] }} Node
 */

const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', 'case', 'esac', '{', '}', '!', 'function', 'select'])

/**
 * Read tokens into a flat list of commands and the operators and keywords between them.
 * @param {Token[]} tokens @returns {Node[]}
 */
export function parse(tokens) {
  /** @type {Node[]} */
  const out = []
  /** @type {Extract<Node, { k: 'cmd' }> | null} */
  let cmd = null
  let inCase = 0
  const flush = () => { if (cmd !== null) { out.push(cmd); cmd = null } }
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = /** @type {Token} */ (tokens[i])
    if (tok.t === 'op') {
      if (tok.op === ')' && inCase > 0 && cmd !== null) { cmd = null; continue }
      flush()
      out.push({ k: 'op', op: tok.op })
      continue
    }
    if (tok.t === 'redir') {
      const target = tokens[i + 1]
      const isWord = target !== undefined && target.t === 'word'
      if (cmd === null) cmd = { k: 'cmd', assigns: [], words: [], redirs: [], raw: '' }
      cmd.redirs.push({ op: tok.op, fd: tok.fd, target: isWord ? target : null })
      const written = `${tok.fd}${tok.op}${isWord ? target.raw : ''}`
      cmd.raw = cmd.raw === '' ? written : `${cmd.raw} ${written}`
      if (isWord) i += 1
      continue
    }
    const plain = tok.parts.every((p) => p.t === 'lit' && !p.q) ? tok.raw : null
    const atStart = cmd === null || (cmd.words.length === 0 && cmd.assigns.length === 0)
    if (atStart && plain !== null && KEYWORDS.has(plain)) {
      flush()
      if (plain === 'case') inCase += 1
      if (plain === 'esac') inCase = Math.max(0, inCase - 1)
      out.push({ k: 'kw', w: plain })
      continue
    }
    if (atStart && plain === 'for') {
      flush()
      const name = tokens[i + 1]
      /** @type {Token[]} */
      const words = []
      let j = i + 2
      if (tokens[j]?.t === 'word' && /** @type {Extract<Token, { t: 'word' }>} */ (tokens[j]).raw === 'in') {
        j += 1
        while (tokens[j]?.t === 'word') { words.push(/** @type {Token} */ (tokens[j])); j += 1 }
      }
      out.push({ k: 'for', name: name?.t === 'word' ? name.raw : '', words })
      i = j - 1
      continue
    }
    if (cmd === null) cmd = { k: 'cmd', assigns: [], words: [], redirs: [], raw: '' }
    const assign = cmd.words.length === 0 ? assignmentIn(tok) : null
    if (assign !== null) cmd.assigns.push(assign)
    else cmd.words.push(tok)
    cmd.raw = cmd.raw === '' ? tok.raw : `${cmd.raw} ${tok.raw}`
  }
  flush()
  return out
}

/**
 * The assignment a word is (`NAME=value`), or null.
 * @param {Token} tok @returns {{ name: string, parts: Part[], raw: string } | null}
 */
function assignmentIn(tok) {
  if (tok.t !== 'word') return null
  const first = tok.parts[0]
  if (first === undefined || first.t !== 'lit' || first.q) return null
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/.exec(first.v)
  if (m === null) return null
  const rest = first.v.slice(m[0].length)
  /** @type {Part[]} */
  const parts = rest === '' ? [] : [{ t: 'lit', v: rest, q: false }]
  return { name: m[1] ?? '', parts: [...parts, ...tok.parts.slice(1)], raw: tok.raw }
}

// ---------------------------------------------------------------------------------------
// EXPANSION: WHAT A WORD COMES TO
// ---------------------------------------------------------------------------------------

/**
 * What the analysis carries from one command to the next.
 * @typedef {object} State
 * @property {Map<string, Value | null>} vars Variables set in this command line; null is unset.
 * @property {string | null} cwd The directory commands run in, or null when it cannot be known.
 * @property {string | null} cwdDoubt Why the directory is uncertain.
 * @property {Set<string>} nonEmpty Variables a preceding test has shown are not empty.
 * @property {boolean} nounset `set -u` is on.
 * @property {string[]} [pipeline] The commands earlier in the same pipeline, by name, for a kill fed by a process list.
 * @property {string | null} [head] The name of the command just read, which `analyse` adds to the pipeline.
 * @property {(string | null)[]} [loops] For each loop the command is inside, innermost last, the process lister whose
 *   output the loop reads or walks, or null.
 */

/**
 * A known value.
 * @param {string} text @param {string} said @returns {Value}
 */
function known(text, said) {
  return { text, maybeEmpty: text === '', emptyVars: [], doubts: [], prefix: null, glob: false, aborts: false, said }
}

/**
 * An unknown value.
 * @param {string} said @param {boolean} maybeEmpty @param {string | null} doubt @param {string | null} prefix
 * @returns {Value}
 */
function unknown(said, maybeEmpty, doubt, prefix = null) {
  return { text: null, maybeEmpty, emptyVars: [], doubts: doubt === null ? [] : [doubt], prefix, glob: false, aborts: false, said }
}

/**
 * The value of one variable here.
 * @param {string} name @param {State} st @param {World} world @returns {Value | null} null when unset
 */
function lookup(name, st, world) {
  if (name === 'PWD') return st.cwd === null ? unknown('$PWD', false, null) : known(st.cwd, '$PWD')
  if (['$', '!', '#', '?', '-', '0', 'RANDOM', 'OLDPWD', 'SECONDS', 'LINENO', 'BASHPID', 'PPID'].includes(name)) {
    return unknown(`$${name}`, false, null)
  }
  if (/^[1-9@*]$/.test(name)) return unknown(`$${name}`, true, `$${name} is an argument the guard cannot see, and it may be empty`)
  if (st.vars.has(name)) {
    const v = st.vars.get(name) ?? null
    if (v === null) return null
    if (v.maybeEmpty && v.text === null && st.nonEmpty.has(name)) return { ...v, maybeEmpty: false, doubts: [] }
    return v
  }
  const env = world.env[name]
  if (env === undefined) return null
  return known(env, `$${name}`)
}

/**
 * Expand one word's parts.
 * @param {Part[]} parts @param {State} st @param {World} world @param {string} said
 * @returns {Value}
 */
function expand(parts, st, world, said) {
  /** @type {Value[]} */
  const pieces = parts.map((part) => expandPart(part, st, world))
  /** @type {Value} */
  const out = { text: '', maybeEmpty: true, emptyVars: [], doubts: [], prefix: null, glob: false, aborts: false, said }
  let knownSoFar = ''
  let stillKnown = true
  for (const piece of pieces) {
    out.emptyVars.push(...piece.emptyVars)
    out.doubts.push(...piece.doubts)
    out.aborts = out.aborts || piece.aborts
    out.glob = out.glob || piece.glob
    if (!piece.maybeEmpty) out.maybeEmpty = false
    if (stillKnown && piece.text !== null) { knownSoFar += piece.text; continue }
    if (stillKnown) {
      stillKnown = false
      // AN UNKNOWN PIECE AFTER KNOWN TEXT lands in the directory the known text names, when the
      // known text has a slash in it. With nothing known before it, it keeps its own directory.
      if (knownSoFar === '') out.prefix = piece.prefix
      else if (knownSoFar.includes('/')) out.prefix = knownSoFar.slice(0, knownSoFar.lastIndexOf('/') + 1)
    }
  }
  out.text = stillKnown ? knownSoFar : null
  if (stillKnown) out.maybeEmpty = knownSoFar === ''
  return out
}

/**
 * Expand one part.
 * @param {Part} part @param {State} st @param {World} world @returns {Value}
 */
function expandPart(part, st, world) {
  if (part.t === 'lit') {
    const v = known(part.v, part.v)
    v.glob = !part.q && /[*?[]/.test(part.v)
    return v
  }
  if (part.t === 'arith') return unknown('$((…))', false, null)
  if (part.t === 'tilde') {
    if (part.user !== '' && part.user !== basename(world.home)) return unknown(`~${part.user}`, false, null)
    if (part.user !== '') return known(world.home, '~')
    // `~` IS $HOME AS THE SHELL HAS IT NOW, so a HOME reassigned earlier in this line counts.
    const home = st.vars.has('HOME') ? st.vars.get('HOME') ?? null : world.env['HOME'] === undefined ? null : known(world.env['HOME'], '~')
    if (home === null) return known(world.home, '~')
    if (home.text === '') return { ...known('', '~'), emptyVars: ['HOME'] }
    return { ...home, said: '~' }
  }
  if (part.t === 'sub') return substitution(part.script, st, world)
  return parameter(part, st, world)
}

/**
 * What `$(…)` comes to. It is unknown and may be empty, with two exceptions worth knowing: `pwd`
 * is the directory, and `mktemp` is a fresh path in a known directory (still empty when it fails,
 * which is exactly how SH came out empty on 16 September).
 * @param {string} script @param {State} st @param {World} world @returns {Value}
 */
function substitution(script, st, world) {
  const said = `$(${script.trim()})`
  const words = script.trim().split(/\s+/)
  if (words[0] === 'pwd' && words.length === 1 && st.cwd !== null) return known(st.cwd, said)
  if (words[0] === 'mktemp') {
    let dir = world.env['TMPDIR'] ?? '/tmp'
    for (let i = 1; i < words.length; i += 1) {
      const w = words[i] ?? ''
      if ((w === '-p' || w === '--tmpdir') && words[i + 1] !== undefined) { dir = words[i + 1] ?? dir; i += 1; continue }
      if (w.startsWith('--tmpdir=')) { dir = w.slice('--tmpdir='.length); continue }
      if (!w.startsWith('-') && w.includes('/')) dir = w.slice(0, w.lastIndexOf('/'))
    }
    const at = st.cwd === null ? (isAbsolute(dir) ? dir : null) : resolve(st.cwd, dir)
    return unknown(said, true, `${said} is empty when mktemp fails`, at === null ? null : `${at}/`)
  }
  return unknown(said, true, `${said} is only known once it runs, and it may come out empty`)
}

/**
 * What `$X` or `${X…}` comes to.
 * @param {Extract<Part, { t: 'var' }>} part @param {State} st @param {World} world @returns {Value}
 */
function parameter(part, st, world) {
  const said = part.op === '' ? `$${part.name}` : `\${${part.name}${part.op}…}`
  const value = lookup(part.name, st, world)
  const guarded = st.nonEmpty.has(part.name)
  const isEmpty = value === null || (value.text === '' && !guarded)
  const mayBe = value === null || value.maybeEmpty
  const arg = () => (part.arg === null ? known('', said) : expand(part.arg, st, world, said))
  if (part.op === 'length') return unknown(said, false, null)
  if (part.op === ':?' || part.op === '?') {
    // ${X:?} STOPS THE SHELL WHEN X IS EMPTY, so what follows can count on it not being empty.
    if (value === null || (part.op === ':?' && value.text === '')) return { ...known('', said), aborts: true }
    if (value.text === null) return { ...value, maybeEmpty: false, doubts: [], said }
    return { ...value, said }
  }
  if (part.op === ':-' || part.op === '-' || part.op === ':=' || part.op === '=') {
    const useArg = part.op.startsWith(':') ? isEmpty : value === null
    if (useArg) return { ...arg(), said }
    if (value !== null && value.text === null && value.maybeEmpty) {
      const other = arg()
      return { ...value, maybeEmpty: other.maybeEmpty, doubts: other.maybeEmpty ? value.doubts : [], said }
    }
    return { ...(value ?? known('', said)), said }
  }
  if (part.op === ':+' || part.op === '+') {
    if (isEmpty) return known('', said)
    return { ...arg(), said }
  }
  if (part.op === '') {
    if (value === null) {
      if (st.nounset || guarded) return { ...known('', said), aborts: true }
      return { ...known('', said), emptyVars: [part.name] }
    }
    if (value.text === '' && !guarded) return { ...value, emptyVars: [...value.emptyVars, part.name], said }
    if (value.text === '' && guarded) return { ...known('', said), aborts: true }
    return { ...value, said }
  }
  // Pattern removal of a literal suffix or prefix is common (`${D%/}`) and cheap to follow.
  if ((part.op === '%' || part.op === '%%' || part.op === '#' || part.op === '##') && value !== null && value.text !== null) {
    const pattern = part.arg === null ? '' : part.arg.map((p) => (p.t === 'lit' ? p.v : '\0')).join('')
    if (!/[*?[\0]/.test(pattern)) {
      const text = part.op.startsWith('%')
        ? (value.text.endsWith(pattern) ? value.text.slice(0, value.text.length - pattern.length) : value.text)
        : (value.text.startsWith(pattern) ? value.text.slice(pattern.length) : value.text)
      return { ...known(text, said), emptyVars: text === '' ? [part.name] : [] }
    }
  }
  return unknown(said, mayBe, mayBe ? `${said} is not something the guard can work out, and it may be empty` : null)
}

/**
 * Expand a word as the shell would into zero or more arguments. An unquoted expansion is split on
 * white space and an empty one disappears, so `rm -rf $EMPTY` has no argument at all; the word is
 * still reported, so rule 1 can see what it was meant to be.
 * @param {Token} tok @param {State} st @param {World} world
 * @returns {{ values: Value[], whole: Value }}
 */
function argsOf(tok, st, world) {
  if (tok.t !== 'word') return { values: [], whole: known('', '') }
  const whole = expand(tok.parts, st, world, tok.raw)
  const single = tok.parts.length === 1 ? tok.parts[0] : undefined
  const splits = single !== undefined && (single.t === 'var' || single.t === 'sub') && !single.q
  if (!splits || whole.text === null) return { values: [whole], whole }
  const fields = whole.text.split(/\s+/).filter((f) => f !== '')
  return { values: fields.map((f) => ({ ...known(f, tok.raw), emptyVars: whole.emptyVars })), whole }
}

// ---------------------------------------------------------------------------------------
// FROM COMMANDS TO EFFECTS
// ---------------------------------------------------------------------------------------

/**
 * What analysing a whole call collected.
 * @typedef {object} Collected
 * @property {Effect[]} effects
 * @property {{ value: Value | null, said: string }[]} homeSwaps HOME assignments (null value is `unset HOME`).
 * @property {{ said: string, why: string }[]} patternKills Kills by pattern, rule 5's business: the command and what it would reach.
 * @property {number} depth How deep `bash -c` and `eval` have gone, so a pathological string ends.
 */

/** The shells whose `-c` script is read as more commands. */
const SHELLS = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh'])

/**
 * Commands that run another command, and which of their options take a value.
 * @type {Record<string, { withValue: string[], stopAtFirstOperand?: number }>}
 */
const WRAPPERS = {
  sudo: { withValue: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U'] },
  doas: { withValue: ['-u', '-C'] },
  nice: { withValue: ['-n', '--adjustment'] },
  ionice: { withValue: ['-c', '-n', '-t', '--class', '--classdata'] },
  nohup: { withValue: [] },
  setsid: { withValue: [] },
  time: { withValue: ['-f', '-o'] },
  command: { withValue: [] },
  exec: { withValue: ['-a'] },
  builtin: { withValue: [] },
  stdbuf: { withValue: ['-i', '-o', '-e'] },
  chrt: { withValue: [], stopAtFirstOperand: 1 },
  taskset: { withValue: ['-c'], stopAtFirstOperand: 1 },
  timeout: { withValue: ['-s', '-k', '--signal', '--kill-after'], stopAtFirstOperand: 1 },
  xargs: { withValue: ['-n', '-I', '-i', '-P', '-d', '-L', '-a', '-E', '-s', '--max-args', '--replace', '--max-procs', '--delimiter', '--arg-file'] },
}

/**
 * Analyse a command string: every effect it would have on a path, and every HOME it would set.
 * @param {string} script @param {State} st @param {World} world @param {Collected} got
 */
function analyse(script, st, world, got) {
  if (got.depth > 6) return
  got.depth += 1
  const nodes = parse(lex(script))
  /** @type {State[]} */
  const stack = []
  /** @type {string[][]} The commands run inside each open subshell, innermost last. */
  const ranInside = []
  /** @type {Set<string>} */
  let chainAsserted = new Set()
  /** @type {{ names: Set<string>, depth: number }[]} */
  const ifFrames = []
  let ifDepth = 0
  /** @type {Set<string>} */
  let lastAsserted = new Set()
  let lastWasTestForIf = false
  for (let n = 0; n < nodes.length; n += 1) {
    const node = /** @type {Node} */ (nodes[n])
    if (node.k === 'op') {
      if (node.op === '(') { stack.push(st); st = cloneState(st); ranInside.push([]) }
      else if (node.op === ')') {
        const back = stack.pop()
        const ran = ranInside.pop() ?? []
        if (back !== undefined) st = back
        // A SUBSHELL'S OUTPUT IS ITS COMMANDS' OUTPUT, so a lister inside `( … )` feeds a kill piped after it.
        st.pipeline = [...(st.pipeline ?? []), ...ran]
        ranInside[ranInside.length - 1]?.push(...ran)
      }
      // A TEST FOLLOWED BY && vouches for the commands chained after it; any other operator ends the
      // chain. What the test vouched for is kept until the next command, so `if [ -n "$X" ]; then`
      // still sees it at `then`.
      if (node.op === '&&') chainAsserted = new Set([...chainAsserted, ...lastAsserted])
      else if (node.op !== '|' && node.op !== '(' && node.op !== ')') chainAsserted = new Set()
      // A PIPELINE ENDS AT ANY OPERATOR BUT | AND A SUBSHELL'S PARENTHESES, so a list read earlier in a line does
      // not feed a later kill, and `pgrep x | (xargs kill)` is one pipeline.
      if (node.op !== '|' && node.op !== '(' && node.op !== ')') st.pipeline = []
      continue
    }
    if (node.k === 'kw') {
      // A LOOP OVER A PROCESS LIST: a while or until loop reads its input from the pipeline before it, or from what is
      // written after its done; a for loop walks its word list. Every kill inside such a loop is a kill by pattern.
      // Each done ends the innermost loop.
      if (node.w === 'while' || node.w === 'until' || node.w === 'select') {
        const fedBy = node.w === 'select' ? null : (st.pipeline ?? []).find((h) => PROCESS_LISTERS.includes(h)) ?? listerIn(inputAfterDone(nodes, n))
        st.loops = [...(st.loops ?? []), fedBy ?? null]
      }
      if (node.w === 'done') st.loops = (st.loops ?? []).slice(0, -1)
      if (node.w === 'if' || node.w === 'while' || node.w === 'until') { ifDepth += 1; lastWasTestForIf = true }
      if (node.w === 'then' || node.w === 'do') {
        if (lastWasTestForIf && lastAsserted.size > 0) ifFrames.push({ names: new Set(lastAsserted), depth: ifDepth })
        lastWasTestForIf = false
      }
      if (node.w === 'fi' || node.w === 'done' || node.w === 'else' || node.w === 'elif') {
        while (ifFrames.length > 0 && (ifFrames[ifFrames.length - 1]?.depth ?? 0) >= ifDepth) ifFrames.pop()
        if (node.w === 'fi' || node.w === 'done') ifDepth = Math.max(0, ifDepth - 1)
        if (node.w === 'elif') lastWasTestForIf = true
      }
      lastAsserted = new Set()
      continue
    }
    if (node.k === 'for') {
      const values = node.words.flatMap((w) => argsOf(w, st, world).values)
      st.vars.set(node.name, loopValue(values, node.name))
      st.loops = [...(st.loops ?? []), node.words.map((w) => (w.t === 'word' ? listerIn(w.raw) : null)).find((l) => l !== null) ?? null]
      continue
    }
    const asserted = new Set([...chainAsserted, ...ifFrames.flatMap((f) => [...f.names])])
    const saved = st.nonEmpty
    st.nonEmpty = new Set([...st.nonEmpty, ...asserted])
    st.head = null
    lastAsserted = command(node, st, world, got)
    st.nonEmpty = saved
    st.pipeline = [...(st.pipeline ?? []), ...(st.head === null || st.head === undefined ? [] : [st.head])]
    if (st.head !== null && st.head !== undefined) ranInside[ranInside.length - 1]?.push(st.head)
  }
  got.depth -= 1
}

/**
 * What a `while` or `until` loop that starts at `nodes[n]` reads from after its done: the targets of `<` and `<<<`
 * written there, as typed, or '' when there are none.
 * @param {Node[]} nodes @param {number} n @returns {string}
 */
function inputAfterDone(nodes, n) {
  let depth = 0
  for (let m = n + 1; m < nodes.length; m += 1) {
    const node = /** @type {Node} */ (nodes[m])
    if (node.k === 'for' || (node.k === 'kw' && (node.w === 'while' || node.w === 'until' || node.w === 'select'))) depth += 1
    if (node.k !== 'kw' || node.w !== 'done') continue
    if (depth > 0) { depth -= 1; continue }
    const next = nodes[m + 1]
    if (next === undefined || next.k !== 'cmd' || next.words.length > 0) return ''
    return next.redirs.filter((r) => r.op === '<' || r.op === '<<<').map((r) => (r.target?.t === 'word' ? r.target.raw : '')).join(' ')
  }
  return ''
}

/**
 * The value a `for` loop variable takes: the one word when there is one, otherwise not known but
 * never empty, in the directory every word shares.
 * @param {Value[]} values @param {string} name @returns {Value}
 */
function loopValue(values, name) {
  if (values.length === 1 && values[0] !== undefined && !values[0].glob) return values[0]
  const dirs = values.map((v) => (v.text !== null ? (v.text.includes('/') ? v.text.slice(0, v.text.lastIndexOf('/') + 1) : '') : v.prefix ?? null))
  const first = dirs[0]
  const shared = first !== undefined && first !== null && dirs.every((d) => d === first) ? first : null
  return unknown(`$${name}`, false, null, shared === '' ? null : shared)
}

/** @param {State} st @returns {State} */
function cloneState(st) {
  return { vars: new Map(st.vars), cwd: st.cwd, cwdDoubt: st.cwdDoubt, nonEmpty: new Set(st.nonEmpty), nounset: st.nounset, pipeline: [...(st.pipeline ?? [])], loops: [...(st.loops ?? [])] }
}

/**
 * Analyse one simple command. Returns the variables it asserts are not empty, when it is a test.
 * @param {Extract<Node, { k: 'cmd' }>} node @param {State} st @param {World} world @param {Collected} got
 * @returns {Set<string>}
 */
function command(node, st, world, got) {
  const from = got.effects.length
  const asserted = commandEffects(node, st, world, got)
  for (const e of got.effects.slice(from)) if (e.command === undefined) e.command = node.raw
  return asserted
}

/**
 * The body of `command`: what one simple command does.
 * @param {Extract<Node, { k: 'cmd' }>} node @param {State} st @param {World} world @param {Collected} got
 * @returns {Set<string>}
 */
function commandEffects(node, st, world, got) {
  // COMMAND SUBSTITUTIONS RUN, so the commands inside them are analysed too, in a copy of the state.
  for (const tok of [...node.words, ...node.assigns.map((a) => /** @type {Token} */ ({ t: 'word', parts: a.parts, raw: '' }))]) {
    if (tok.t !== 'word') continue
    for (const part of allParts(tok.parts)) if (part.t === 'sub') analyse(part.script, cloneState(st), world, got)
  }
  const assigned = node.assigns.map((a) => ({ name: a.name, value: expand(a.parts, st, world, `${a.name}=…`) }))
  node.assigns.forEach((a, i) => { if (a.name === 'HOME') got.homeSwaps.push({ value: /** @type {Value} */ (assigned[i]?.value), said: a.raw }) })
  if (node.words.length === 0) {
    // STANDALONE ASSIGNMENTS change the shell's own variables for the rest of the line.
    for (const a of assigned) st.vars.set(a.name, a.value)
    redirections(node, st, world, got)
    return new Set()
  }
  if (assigned.some((a) => a.value.aborts)) return new Set()
  const words = node.words.map((w) => argsOf(w, st, world))
  if (words.some((w) => w.whole.aborts)) return new Set()
  redirections(node, st, world, got)
  return verb(words, st, world, got, node.raw)
}

/**
 * Every part of a word, including the parts inside ${X:-…} arguments.
 * @param {Part[]} parts @returns {Part[]}
 */
function allParts(parts) {
  return parts.flatMap((p) => (p.t === 'var' && p.arg !== null ? [p, ...allParts(p.arg)] : [p]))
}

/**
 * The effects of a command's redirections: `>` overwrites, `>>` writes.
 * @param {Extract<Node, { k: 'cmd' }>} node @param {State} st @param {World} world @param {Collected} got
 */
function redirections(node, st, world, got) {
  for (const r of node.redirs) {
    if (r.target === null || !['>', '>|', '&>', '>>', '&>>', '>&', '<>'].includes(r.op)) continue
    const value = expand(r.target.t === 'word' ? r.target.parts : [], st, world, r.target.t === 'word' ? r.target.raw : '')
    if (r.op === '>&' && value.text !== null && /^[0-9-]+$/.test(value.text)) continue
    const kind = r.op === '>>' || r.op === '&>>' || r.op === '<>' ? 'write' : 'overwrite'
    got.effects.push(effect(kind, value, st, r.op))
  }
}

/**
 * @param {Effect['kind']} kind @param {Value} target @param {State} st @param {string} verb
 * @param {Partial<Effect>} [more] @returns {Effect}
 */
function effect(kind, target, st, verb, more = {}) {
  return { kind, target, cwd: st.cwd, cwdDoubt: st.cwdDoubt, verb, ...more }
}

/**
 * Split arguments into options and operands. `withValue` options take the next argument.
 * @param {Value[]} args @param {string[]} withValue
 * @returns {{ opts: string[], operands: Value[] }}
 */
function options(args, withValue) {
  /** @type {string[]} */
  const opts = []
  /** @type {Value[]} */
  const operands = []
  let ended = false
  for (let i = 0; i < args.length; i += 1) {
    const a = /** @type {Value} */ (args[i])
    const t = a.text
    if (ended || t === null || !t.startsWith('-') || t === '-') { operands.push(a); continue }
    if (t === '--') { ended = true; continue }
    opts.push(t)
    if (withValue.includes(t)) { const v = args[i + 1]; if (v?.text !== null && v?.text !== undefined) opts.push(`${t}=${v.text}`); i += 1 }
  }
  return { opts, operands }
}

/** @param {string[]} opts @param {string[]} short @param {string[]} long @returns {boolean} */
function has(opts, short, long) {
  return opts.some((o) => long.some((l) => o === l || o.startsWith(`${l}=`)) || (/^-[A-Za-z]+$/.test(o) && short.some((s) => o.includes(s))))
}

/**
 * Analyse one command by its first word.
 * @param {{ values: Value[], whole: Value }[]} words @param {State} st @param {World} world
 * @param {Collected} got @param {string} raw @returns {Set<string>}
 */
function verb(words, st, world, got, raw) {
  const flat = words.flatMap((w) => w.values)
  const head = flat[0]
  if (head === undefined || head.text === null) return new Set()
  const name = basename(head.text)
  const rest = flat.slice(1)
  // A TARGET THAT WAS WRITTEN BUT SPLIT AWAY TO NOTHING is still a target rule 1 must see.
  const vanished = vanishedFrom(words)

  if (Object.hasOwn(WRAPPERS, name)) return wrapped(name, rest, st, world, got, raw)
  if (name === 'env') return envCommand(rest, st, world, got, raw)
  if (SHELLS.has(name)) {
    const at = rest.findIndex((a) => a.text !== null && /^-[a-z]*c[a-z]*$/.test(a.text))
    const script = at === -1 ? undefined : rest[at + 1]
    if (script?.text !== null && script?.text !== undefined) analyse(script.text, cloneState(st), world, got)
    return new Set()
  }
  if (name === 'eval') {
    if (rest.every((a) => a.text !== null)) analyse(rest.map((a) => a.text).join(' '), st, world, got)
    return new Set()
  }
  if (name === 'cd' || name === 'pushd') { changeDirectory(rest, st, world); return new Set() }
  if (name === 'popd') { st.cwd = null; st.cwdDoubt = 'popd went back to a directory the guard did not follow'; return new Set() }
  if (name === 'set') {
    if (rest.some((a) => a.text !== null && (/^-[a-zA-Z]*u/.test(a.text) || a.text === 'nounset'))) st.nounset = true
    return new Set()
  }
  if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(name)) {
    for (const w of words.slice(1)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(w.whole.said)
      if (m === null) continue
      const value = expand(scanWord(m[2] ?? '', 0).parts, st, world, m[2] ?? '')
      st.vars.set(m[1] ?? '', value)
      if (m[1] === 'HOME') got.homeSwaps.push({ value, said: `${name} HOME=${value.said}` })
    }
    return new Set()
  }
  if (name === 'unset') {
    for (const a of rest) {
      if (a.text === null || a.text.startsWith('-')) continue
      st.vars.set(a.text, null)
      if (a.text === 'HOME') got.homeSwaps.push({ value: null, said: 'unset HOME' })
    }
    return new Set()
  }
  if (name === '[' || name === 'test' || name === '[[') return assertedNotEmpty(words.slice(1))
  st.head = name
  const killed = aKillByPattern(name, rest, st)
  if (killed !== null) got.patternKills.push({ said: raw, why: killed })

  const targets = [...rest, ...vanished]
  if (name === 'rm' || name === 'rmdir' || name === 'unlink' || name === 'shred') {
    for (const t of options(targets, name === 'shred' ? ['-n', '-s', '--iterations', '--size'] : []).operands) got.effects.push(effect('delete', t, st, name))
  } else if (name === 'mv' || name === 'cp' || name === 'ln' || name === 'install') {
    copyOrMove(name, targets, st, got)
  } else if (name === 'find') {
    find(targets, st, got)
  } else if (name === 'git') {
    git(targets, st, got)
  } else if (name === 'rsync') {
    const { opts, operands } = options(targets, ['-e', '--rsh', '--exclude', '--include', '--filter', '-f'])
    const dest = operands[operands.length - 1]
    if (dest !== undefined && operands.length > 1 && !(dest.text ?? '').includes(':')) {
      got.effects.push(effect(opts.some((o) => o.startsWith('--delete')) ? 'delete' : 'overwrite', dest, st, 'rsync'))
    }
  } else if (name === 'dd') {
    for (const a of rest) if (a.text?.startsWith('of=')) got.effects.push(effect('overwrite', { ...a, text: a.text.slice(3), said: a.said }, st, 'dd'))
  } else if (name === 'truncate') {
    for (const t of options(targets, ['-s', '--size', '-r', '--reference']).operands) got.effects.push(effect('overwrite', t, st, 'truncate'))
  } else if (name === 'tee') {
    const { opts, operands } = options(targets, [])
    for (const t of operands) got.effects.push(effect(has(opts, ['a'], ['--append']) ? 'write' : 'overwrite', t, st, 'tee'))
  } else if (name === 'sed') {
    const { opts, operands } = options(targets, ['-e', '-f', '--expression', '--file', '-l', '--line-length'])
    if (has(opts, ['i'], ['--in-place']) || opts.some((o) => o.startsWith('-i'))) {
      const files = opts.some((o) => o.startsWith('-e') || o.startsWith('--expression') || o.startsWith('-f')) ? operands : operands.slice(1)
      for (const t of files) got.effects.push(effect('write', t, st, 'sed -i'))
    }
  }
  return new Set()
}

/** The commands that list processes by name, command line, file or port: what a kill by pattern is fed by. */
const PROCESS_LISTERS = ['pgrep', 'pidof', 'ps', 'lsof', 'fuser', 'pstree']
const LISTED = new RegExp(`(\\$\\(|\`|<\\()\\s*(\\S*/)?(${PROCESS_LISTERS.join('|')})\\b`)

/**
 * The process lister a word runs through $(…), backquotes or <(…), or null.
 * @param {string} said @returns {string | null}
 */
function listerIn(said) {
  return LISTED.exec(said)?.[3] ?? null
}

/**
 * RULE 5'S SHAPES: A KILL BY PATTERN (problem LD9Yor6qIVVC; decision gP_TJ0FWdg2U, point 3). On 4 September 2026 a
 * loop that sent SIGTERM to the group of every process whose command line held "src/server/index.ts" stopped the
 * owner's own API, whose command line held it too. A kill chosen by a name, a command line, a file or a port reaches
 * processes the caller did not start; a kill of a group or a pid the caller recorded does not. So these are kills by
 * pattern: pkill and killall; fuser -k; and kill, or xargs kill, fed by a process list, through $(…) or backquotes
 * around one of PROCESS_LISTERS, or a pipeline with one before it, across a subshell's parentheses too; or inside a
 * loop whose input or word list is one (problem DsxidFiPDaaw). `kill -- -<group>`, `kill <pid>` and a kill of numbers
 * read from a file are not. The answer is what the kill would reach, in words, or null.
 * @param {string} name @param {Value[]} rest @param {State} st @returns {string | null}
 */
function aKillByPattern(name, rest, st) {
  if (name === 'pkill' || name === 'killall') return `${name} stops every process whose name or command line matches, whoever started it`
  if (name === 'fuser' && rest.some((a) => a.text !== null && /^-[a-zA-Z]*k/.test(a.text))) return 'fuser -k stops every process that holds the file or port, whoever started it'
  const kills = name === 'kill' || (name === 'xargs' && rest.some((a) => a.text === 'kill' || a.text === 'pkill'))
  if (!kills) return null
  if (rest.some((a) => listerIn(a.said) !== null)) return `${name} is fed by a process list read by name, command line, file or port, whoever started those processes`
  const from = (st.pipeline ?? []).find((h) => PROCESS_LISTERS.includes(h))
  if (from !== undefined) return `${name} is fed by ${from}, a process list read by name, command line, file or port, whoever started those processes`
  const loop = (st.loops ?? []).find((l) => l !== null)
  if (loop !== undefined && loop !== null) return `${name} runs inside a loop over the output of ${loop}, a process list read by name, command line, file or port, whoever started those processes`
  return null
}

/**
 * A wrapper runs the rest of its arguments as a command: skip its own options and analyse that.
 * @param {string} name @param {Value[]} rest
 * @param {State} st @param {World} world @param {Collected} got @param {string} raw @returns {Set<string>}
 */
function wrapped(name, rest, st, world, got, raw) {
  const spec = WRAPPERS[name] ?? { withValue: [] }
  let i = 0
  let operandsToSkip = spec.stopAtFirstOperand ?? 0
  while (i < rest.length) {
    const t = rest[i]?.text ?? null
    if (t === null) break
    if (name === 'nice' && /^-[0-9]+$/.test(t)) { i += 1; continue }
    if (t === '--') { i += 1; break }
    if (t.startsWith('-') && t !== '-') { i += spec.withValue.includes(t) ? 2 : 1; continue }
    if (operandsToSkip > 0) { operandsToSkip -= 1; i += 1; continue }
    break
  }
  const inner = rest.slice(i)
  if (inner.length === 0) return new Set()
  if (name === 'command' && rest.some((a) => a.text === '-v' || a.text === '-V')) return new Set()
  if (name === 'xargs') {
    // xargs ADDS ARGUMENTS FROM ITS INPUT, which the guard cannot see: they are unknown, never empty.
    const fromInput = unknown('arguments xargs reads from its input', false, null)
    return verb([{ values: [...inner, fromInput], whole: fromInput }], st, world, got, raw)
  }
  return verb([{ values: inner, whole: inner[0] ?? known('', '') }], st, world, got, raw)
}

/**
 * `env [-i] [-C dir] [NAME=value…] command…`.
 * @param {Value[]} rest @param {State} st @param {World} world @param {Collected} got @param {string} raw
 * @returns {Set<string>}
 */
function envCommand(rest, st, world, got, raw) {
  let i = 0
  const inner = cloneState(st)
  while (i < rest.length) {
    const a = /** @type {Value} */ (rest[i])
    const t = a.text ?? a.said
    if (t === '-u' || t === '--unset') {
      if (rest[i + 1]?.text === 'HOME') got.homeSwaps.push({ value: null, said: 'env -u HOME' })
      i += 2
      continue
    }
    if (t === '-C' || t === '--chdir') { const d = rest[i + 1]; changeDirectory(d === undefined ? [] : [d], inner, world); i += 2; continue }
    if (t.startsWith('-')) { i += 1; continue }
    // AN ASSIGNMENT IS READ FROM HOW IT WAS WRITTEN, because its value may be one nobody can know.
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(a.said)
    if (m === null) break
    if (m[1] === 'HOME') {
      const value = expand(scanWord(m[2] ?? '', 0).parts, st, world, m[2] ?? '')
      got.homeSwaps.push({ value, said: `env HOME=${m[2] ?? ''}` })
    }
    i += 1
  }
  const cmd = rest.slice(i)
  if (cmd.length === 0) return new Set()
  return verb([{ values: cmd, whole: cmd[0] ?? known('', '') }], inner, world, got, raw)
}

/**
 * `cd X`: follow it when X is known; otherwise say the directory is uncertain from here on.
 * @param {Value[]} rest @param {State} st @param {World} world
 */
function changeDirectory(rest, st, world) {
  const target = rest.filter((a) => a.text === null || !a.text.startsWith('-') || a.text === '-')[0]
  if (target === undefined) {
    // `cd` WITH NO ARGUMENT GOES HOME, and so does `cd $EMPTY`, because the empty word vanishes.
    const home = st.vars.has('HOME') ? st.vars.get('HOME') ?? null : world.env['HOME'] === undefined ? null : known(world.env['HOME'], '$HOME')
    st.cwd = home === null ? world.home : home.text
    st.cwdDoubt = st.cwd === null ? 'cd went to a HOME the guard cannot know' : null
    return
  }
  if (target.text === '-') { st.cwd = null; st.cwdDoubt = '`cd -` went back to a directory the guard did not follow'; return }
  if (target.text === '') return
  if (target.text !== null && st.cwd !== null) { st.cwd = resolve(st.cwd, target.text); st.cwdDoubt = null; return }
  if (target.text !== null && isAbsolute(target.text)) { st.cwd = resolve(target.text); st.cwdDoubt = null; return }
  st.cwd = null
  st.cwdDoubt = target.maybeEmpty
    ? `cd ${target.said} stays where it was when ${target.said} is empty, so the guard cannot tell which directory this runs in`
    : `cd ${target.said} goes to a directory the guard cannot know`
}

/**
 * The words that were written but expanded to nothing (an unquoted empty variable).
 * @param {{ values: Value[], whole: Value }[]} words @returns {Value[]}
 */
function vanishedFrom(words) {
  return words.slice(1).filter((w) => w.values.length === 0 && (w.whole.emptyVars.length > 0 || w.whole.maybeEmpty)).map((w) => w.whole)
}

/**
 * The variables a test (`[ -n "$X" ]`, `[ -d "$X" ]`…) shows are not empty when it succeeds.
 * @param {{ values: Value[], whole: Value }[]} words @returns {Set<string>}
 */
function assertedNotEmpty(words) {
  /** @type {Set<string>} */
  const out = new Set()
  for (let i = 0; i < words.length - 1; i += 1) {
    const flag = words[i]?.whole.text
    const next = words[i + 1]?.whole
    if (flag === undefined || flag === null || next === undefined) continue
    if (!['-n', '-d', '-e', '-f', '-s'].includes(flag)) continue
    const m = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(next.said.replace(/^"|"$/g, ''))
    if (m !== null && m[1] !== undefined) out.add(m[1])
  }
  return out
}

/**
 * `mv`, `cp`, `ln` and `install`: sources and a destination.
 * @param {string} name @param {Value[]} args @param {State} st @param {Collected} got
 */
function copyOrMove(name, args, st, got) {
  const withValue = ['-t', '--target-directory', '-S', '--suffix', '-m', '--mode', '-o', '--owner', '-g', '--group']
  const { opts, operands } = options(args, withValue)
  const targetOpt = opts.find((o) => o.startsWith('-t=') || o.startsWith('--target-directory='))
  const dest = targetOpt !== undefined ? known(targetOpt.slice(targetOpt.indexOf('=') + 1), targetOpt) : operands[operands.length - 1]
  const sources = targetOpt !== undefined ? operands : operands.slice(0, -1)
  if (dest === undefined || sources.length === 0) return
  if (name === 'mv') for (const s of sources) got.effects.push(effect('move', s, st, 'mv'))
  if (name === 'ln' && !has(opts, ['f'], ['--force'])) return
  if ((name === 'mv' || name === 'cp') && has(opts, ['n'], ['--no-clobber', '--update'])) return
  for (const s of sources) {
    // INTO AN EXISTING DIRECTORY, the file overwritten is the one with the source's name inside it.
    const destPath = dest.text !== null && st.cwd !== null ? resolve(st.cwd, dest.text) : null
    const intoDir = destPath !== null && isDirectory(destPath) && s.text !== null
    const target = intoDir && s.text !== null ? { ...dest, text: join(/** @type {string} */ (destPath), basename(s.text)) } : dest
    got.effects.push(effect('overwrite', target, st, name))
  }
}

/**
 * `find PATH… EXPR`: with -delete, or -exec of a deleting command, every start path is deleted from.
 * @param {Value[]} args @param {State} st @param {Collected} got
 */
function find(args, st, got) {
  const texts = args.map((a) => a.text)
  const deletes = texts.includes('-delete') || texts.some((t, i) => (t === '-exec' || t === '-execdir' || t === '-ok' || t === '-okdir') && ['rm', 'rmdir', 'unlink', 'shred'].includes(basename(texts[i + 1] ?? '')))
  if (!deletes) return
  let i = 0
  while (i < args.length && ['-H', '-L', '-P'].includes(args[i]?.text ?? '')) i += 1
  /** @type {Value[]} */
  const starts = []
  for (; i < args.length; i += 1) {
    const a = /** @type {Value} */ (args[i])
    if (a.text !== null && (a.text.startsWith('-') || a.text === '(' || a.text === '!' || a.text === ',')) break
    starts.push(a)
  }
  if (starts.length === 0) starts.push(known('.', '.'))
  // ONLY A NAME TEST NARROWS WHAT IS DELETED in a way the guard can check (-path and -regex are not
  // read), and only when every test is a name test joined by "and": `-o` could widen it again.
  const names = texts.flatMap((t, i) => ((t === '-name' || t === '-iname') && texts[i + 1] ? [{ pattern: texts[i + 1] ?? '', caseless: t === '-iname' }] : []))
  const narrowed = names.length > 0 && !texts.includes('-o') && !texts.includes('-or')
  for (const s of starts) got.effects.push(effect('delete', s, st, 'find', narrowed ? { within: true, names } : { within: true }))
}

/**
 * `git clean`, `git reset --hard` and `git rm`.
 * @param {Value[]} args @param {State} st @param {Collected} got
 */
function git(args, st, got) {
  let i = 0
  const here = cloneState(st)
  while (i < args.length) {
    const t = args[i]?.text ?? null
    if (t === '-C') {
      const d = args[i + 1]
      if (d?.text !== null && d?.text !== undefined && here.cwd !== null) here.cwd = resolve(here.cwd, d.text)
      else { here.cwd = null; here.cwdDoubt = 'git -C names a directory the guard cannot know' }
      i += 2
      continue
    }
    if (t === '-c' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') { i += 2; continue }
    if (t !== null && t.startsWith('-')) { i += 1; continue }
    break
  }
  const sub = args[i]?.text ?? null
  const rest = args.slice(i + 1)
  if (sub === 'clean') {
    const { opts, operands } = options(rest, ['-e', '--exclude'])
    if (has(opts, ['n'], ['--dry-run'])) return
    const ignoredToo = has(opts, ['x', 'X'], [])
    const targets = operands.length > 0 ? operands : [known('.', 'the current directory')]
    for (const t of targets) got.effects.push(effect('delete', t, here, 'git clean', ignoredToo ? { within: true } : { untrackedOnly: true, within: true }))
  } else if (sub === 'reset' && rest.some((a) => a.text === '--hard')) {
    const top = here.cwd === null ? null : toplevelOf(here.cwd)
    const target = top === null ? unknown('the repository', false, null) : known(top, 'the whole working tree')
    got.effects.push(effect('overwrite', target, here, 'git reset --hard', { trackedOnly: true }))
  } else if (sub === 'rm') {
    const { opts, operands } = options(rest, [])
    if (has(opts, ['n'], ['--dry-run', '--cached'])) return
    for (const t of operands) got.effects.push(effect('delete', t, here, 'git rm'))
  }
}

/**
 * The top of the git working tree that holds `dir`, found by walking up to a `.git` entry, or null.
 * Read from the disk, not by running git, so the policy runs nothing.
 * @param {string} dir @returns {string | null}
 */
export function toplevelOf(dir) {
  let at = resolve(dir)
  for (;;) {
    if (existsSync(join(at, '.git'))) return at
    const up = dirname(at)
    if (up === at) return null
    at = up
  }
}

/** @param {string} path @returns {boolean} */
function isDirectory(path) {
  try { return statSync(path).isDirectory() } catch { return false }
}

// ---------------------------------------------------------------------------------------
// TOOLS THAT ARE NOT A SHELL
// ---------------------------------------------------------------------------------------

/**
 * The effects of an apply_patch body (Codex's and OpenCode's patch format).
 * @param {string} patch @param {State} st @returns {Effect[]}
 */
function patchEffects(patch, st) {
  /** @type {Effect[]} */
  const out = []
  let updating = /** @type {string | null} */ (null)
  for (const line of patch.split('\n')) {
    const del = /^\*\*\* Delete File: (.+)$/.exec(line)
    const add = /^\*\*\* Add File: (.+)$/.exec(line)
    const upd = /^\*\*\* Update File: (.+)$/.exec(line)
    const mov = /^\*\*\* Move to: (.+)$/.exec(line)
    if (del?.[1] !== undefined) out.push(effect('delete', known(del[1].trim(), del[1].trim()), st, 'apply_patch'))
    if (add?.[1] !== undefined) out.push(effect('overwrite', known(add[1].trim(), add[1].trim()), st, 'apply_patch'))
    if (upd?.[1] !== undefined) { updating = upd[1].trim(); out.push(effect('write', known(updating, updating), st, 'apply_patch')) }
    if (mov?.[1] !== undefined && updating !== null) {
      out.push(effect('move', known(updating, updating), st, 'apply_patch'))
      out.push(effect('overwrite', known(mov[1].trim(), mov[1].trim()), st, 'apply_patch'))
    }
  }
  return out
}

/** The tool names that edit part of a file. */
const EDITS = new Set(['edit', 'multiedit', 'notebookedit', 'str_replace_based_edit_tool'])
/** The tool names that write a whole file. */
const WRITES = new Set(['write', 'create_file', 'write_file'])
/** The tool names that carry a patch. */
const PATCHES = new Set(['apply_patch', 'patch'])

/**
 * Everything one call would do, whatever tool it is.
 * @param {ToolCall} call @param {World} world @returns {Collected}
 */
export function effectsOf(call, world) {
  /** @type {Collected} */
  const got = { effects: [], homeSwaps: [], patternKills: [], depth: 0 }
  const tool = call.tool.toLowerCase()
  const input = call.input
  const workdir = typeof input['workdir'] === 'string' && input['workdir'] !== '' ? resolve(call.cwd, input['workdir']) : call.cwd
  /** @type {State} */
  const st = { vars: new Map(), cwd: workdir, cwdDoubt: null, nonEmpty: new Set(), nounset: false, pipeline: [], head: null, loops: [] }
  const pathOf = () => {
    for (const key of ['file_path', 'filePath', 'notebook_path', 'path']) {
      const v = input[key]
      if (typeof v === 'string' && v !== '') return v
    }
    return null
  }
  if (tool === 'str_replace_editor') {
    const path = pathOf()
    if (path !== null && input['command'] !== 'view') got.effects.push(effect(input['command'] === 'create' ? 'overwrite' : 'write', known(path, path), st, 'str_replace_editor'))
    return got
  }
  const patch = typeof input['command'] === 'string' ? input['command'] : typeof input['patchText'] === 'string' ? input['patchText'] : typeof input['patch'] === 'string' ? input['patch'] : typeof input['input'] === 'string' ? input['input'] : null
  if (PATCHES.has(tool) || (patch !== null && patch.trimStart().startsWith('*** Begin Patch'))) {
    if (patch !== null) got.effects.push(...patchEffects(patch, st))
    return got
  }
  if (WRITES.has(tool) || EDITS.has(tool)) {
    const path = pathOf()
    if (path !== null) got.effects.push(effect(WRITES.has(tool) ? 'overwrite' : 'write', known(path, path), st, call.tool))
    return got
  }
  // ANY OTHER TOOL THAT CARRIES A COMMAND IS READ AS A SHELL: Bash, bash, Monitor, exec_command, and
  // a tool that does not exist yet. A command given as a list is either [shell, -c, script] or argv.
  const cmd = input['command'] ?? input['cmd']
  if (typeof cmd === 'string') analyse(cmd, st, world, got)
  else if (Array.isArray(cmd) && cmd.every((c) => typeof c === 'string')) {
    const argv = /** @type {string[]} */ (cmd)
    const c = argv.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a))
    if (SHELLS.has(basename(argv[0] ?? '')) && c !== -1 && argv[c + 1] !== undefined) analyse(argv[c + 1] ?? '', st, world, got)
    else analyse(argv.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' '), st, world, got)
  }
  return got
}
