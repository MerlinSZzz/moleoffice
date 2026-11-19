// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A test that repeats code can drift; compare supplied test and source literals without opening files. */
type Token = { kind: 'string' | 'piece' | 'number' | 'other'; text: string; line: number; offset: number; raw?: string; template?: number }
export type AddedFile = { path: string; added: readonly { line: number; text: string }[] }
export type SourceFile = { path: string; text: string }
export type Candidate = {
  path: string
  line: number
  kind: 'string' | 'number' | 'list' | 'value' | 'inline'
  value: string
  members?: readonly string[]
  number?: number
  context?: 'each' | 'const'
  name?: string
}
export type Finding = Candidate & { sources: { path: string; line: number; name?: string }[] }
export const COPIED_NOT_READ = 'Copied test literals: the added test lines or the source files at the tip could not be read.'
const FLOOR = 30
const longEnough = (value: string): boolean => { let count = 0; for (const _ of value) if (++count >= FLOOR) return true; return false }
const LIMIT = /(?:^|[^\p{L}\p{N}])(?:limit|budget|max|maximum|most|within|cap|bound|under|newest)(?=$|[^\p{L}\p{N}])/iu
const COMMON = new Set(['0', '1', '2', '10', '100', '1000'])
/** A relative path names a file: when the code moves the file, the test that names it fails loudly rather than drifting. */
const RELATIVE_PATH = /^\.\.?\//u
/** SQL is code, not words: a string, or a whole template, that begins with one of these words is never named. */
const SQL = /^\s*(?:select|insert|update|delete|create|with|pragma)\b/iu
const TEST = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/u
const SOURCE_CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/u

/** Generated fingerprints and generated outputs are derivative rather than the source of the words. */
export function isEligibleSource(path: string): boolean {
  return /^(?:(?:src|tools)\/|plugins\/[^/]+\/src\/)/u.test(path) && SOURCE_CODE.test(path) && !/(?:^|\/)(?:generated|__generated__)(?:\/|$)|\.(?:generated|gen)\.|^src\/shared\/words\/\w+-made-from\.ts$/u.test(path)
}

/** A copied number below this value is a common small number, not a value worth naming. */
const VALUE_FLOOR = 1000
/** Inline geometry uses numbers down to 30; require matching surrounding tokens to reduce coincidences. */
const INLINE_FLOOR = 30
function inlineKey(tokens: readonly Token[], i: number): string | undefined {
  const token = tokens[i]
  if (token?.kind !== 'number' || Number(token.text) < INLINE_FLOOR || COMMON.has(token.text) || i < 3) return undefined
  const before = tokens.slice(i - 3, i)
  if (before.some((part) => part.line !== token.line) || !before.some((part) => /^[A-Za-z_$][\w$]*$/u.test(part.text))) return undefined
  return [...before.map((part) => part.text), token.text].join(' ')
}
/** A test file is under tests/ or a plugin's tests/ folder, and its name ends .test. */
const TEST_PATH = /^(?:tests\/|plugins\/[^/]+\/tests\/)/u

const wordsOf = (name: string): string[] => name.split('_').filter((word) => word.length > 1)
/** A named test constant and an exported one share a word, as THE_WORK_GROUPS and A_WORK_GROUPS do. */
function sharesAWord(testName: string | undefined, sourceName: string): boolean {
  if (testName === undefined) return false
  const source = new Set(wordsOf(sourceName))
  return wordsOf(testName).some((word) => source.has(word))
}
/** The test's name is made of the exported constant's own words, as THE_MOST_BYTES is of THE_MOST_LETTER_BYTES. */
function nameIsMadeOfTheSource(testName: string | undefined, sourceName: string): boolean {
  if (testName === undefined) return false
  const test = wordsOf(testName)
  const source = new Set(wordsOf(sourceName))
  return test.length >= 2 && test.every((word) => source.has(word))
}
/** Two lists are the same value when their members are the same set: order and duplicates do not matter. */
const listKey = (members: readonly string[]): string => [...new Set(members)].sort().join('\u0000')

/** Read a literal array of two or more strings at its '[', in a test or in the code. */
function aStringArrayAt(tokens: readonly Token[], at: number): { members: string[]; next: number } | null {
  if (tokens[at]?.text !== '[') return null
  const members: string[] = []
  let expectValue = true
  for (let i = at + 1; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.text === ']') return members.length >= 2 ? { members, next: i + 1 } : null
    if (token.text === ',') { expectValue = true; continue }
    if (token.kind !== 'string' || !expectValue) return null
    members.push(token.text)
    expectValue = false
  }
  return null
}

/**
 * Read a number, or an arithmetic expression of numbers and literals, from the tokens. Only a value the
 * expression fully explains is kept: `5 * 1024 * 1024` becomes 5242880, while `5 + variable` is not a constant.
 */
function aNumberAt(tokens: readonly Token[], at: number): { value: number; next: number } | null {
  let i = at
  function aFactor(): number | null {
    const token = tokens[i]
    if (token === undefined) return null
    if (token.text === '+' || token.text === '-') {
      i++
      const value = aFactor()
      return value === null ? null : token.text === '-' ? -value : value
    }
    if (token.text === '(') {
      i++
      const value = anExpression()
      if (value === null || tokens[i]?.text !== ')') return null
      i++
      return value
    }
    if (token.kind === 'number') { i++; return Number(token.text) }
    if (token.kind === 'other' && /^\d[\d_]*$/u.test(token.text)) { i++; return Number(token.text.replace(/_/gu, '')) }
    return null
  }
  function aTerm(): number | null {
    let value = aFactor()
    if (value === null) return null
    while (tokens[i]?.text === '*' || tokens[i]?.text === '/') {
      const op = tokens[i]!.text
      i++
      const right = aFactor()
      if (right === null) return null
      if (op === '*') value *= right
      else {
        if (right === 0) return null
        value /= right
      }
    }
    return value
  }
  function anExpression(): number | null {
    let value = aTerm()
    if (value === null) return null
    while (tokens[i]?.text === '+' || tokens[i]?.text === '-') {
      const op = tokens[i]!.text
      i++
      const right = aTerm()
      if (right === null) return null
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  const value = anExpression()
  if (value === null || !Number.isFinite(value)) return null
  const next = tokens[i]
  if (next !== undefined) {
    if (next.text === '.' || next.text === '[' || next.text === '(') return null
    if (['*', '/', '%', '<', '>', '&', '|', '^', '?', ':'].includes(next.text)) return null
    if (next.kind === 'string' || next.kind === 'number' || next.kind === 'piece') return null
    if (next.line === tokens[i - 1]?.line && next.kind === 'other' && /^[A-Za-z_$][\w$]*$/u.test(next.text) &&
      !/^(?:as|satisfies|const|let|var|export|default|function|class|interface|type|enum|import|if|for|while|return|throw|case|do|else|yield|await|of|in|instanceof|new)$/u.test(next.text)) return null
  }
  return { value, next: i }
}

/** The '=' that starts a constant's value, after an optional type annotation. */
function theAssignmentAfter(tokens: readonly Token[], from: number): number {
  let depth = 0
  for (let i = from; i < tokens.length; i++) {
    const text = tokens[i]!.text
    if (text === '<' || text === '(' || text === '[' || text === '{') depth++
    else if (text === '>' || text === ')' || text === ']' || text === '}') {
      if (depth === 0) return -1
      depth--
    } else if (text === '=' && depth === 0) return i
    else if (depth === 0 && (text === ';' || text === 'of' || text === 'in')) return -1
  }
  return -1
}

/** The name of the const/let/var declaration whose value starts just after `at`, if it has a simple name. */
function theConstNameBefore(tokens: readonly Token[], at: number): string | undefined {
  let depth = 0
  for (let i = at; i >= 0 && i >= at - 80; i--) {
    const text = tokens[i]!.text
    if (text === '>' || text === ')' || text === ']' || text === '}') depth++
    else if (text === '<' || text === '(' || text === '[' || text === '{') {
      if (depth === 0) return undefined
      depth--
    } else if (depth === 0 && (text === 'const' || text === 'let' || text === 'var')) {
      const name = tokens[i + 1]
      return name?.kind === 'other' && /^[A-Za-z_$][\w$]*$/u.test(name.text) ? name.text : undefined
    } else if (depth === 0 && text === ';') return undefined
  }
  return undefined
}

/** Whether an array literal is the it.each table the test runs over, or the value of a named constant. */
function aListContextAt(tokens: readonly Token[], at: number): { kind: 'each' } | { kind: 'const'; name: string } | undefined {
  if (tokens[at - 1]?.text === '(' && tokens[at - 2]?.text === 'each' && tokens[at - 3]?.text === '.' && ['it', 'test', 'describe'].includes(tokens[at - 4]?.text ?? '')) return { kind: 'each' }
  if (tokens[at - 1]?.text === '=') {
    const name = theConstNameBefore(tokens, at - 2)
    return name === undefined ? undefined : { kind: 'const', name }
  }
  if (tokens[at - 1]?.text === '(') {
    let k = at - 2
    if (tokens[k]?.text === '>') {
      let depth = 0
      for (; k >= 0; k--) {
        if (tokens[k]!.text === '>') depth++
        else if (tokens[k]!.text === '<') {
          depth--
          if (depth === 0) { k--; break }
        }
      }
    }
    if (tokens[k]?.text === 'Set' && tokens[k - 1]?.text === 'new' && tokens[k - 2]?.text === '=') {
      const name = theConstNameBefore(tokens, k - 3)
      return name === undefined ? undefined : { kind: 'const', name }
    }
  }
  return undefined
}

type AnExportedConstant =
  | { kind: 'list'; name: string; line: number; members: string[] }
  | { kind: 'number'; name: string; line: number; value: number }

/** The exported constant arrays, Sets and numbers a file declares, in source order. */
function exportedConstantsIn(tokens: readonly Token[]): AnExportedConstant[] {
  const found: AnExportedConstant[] = []
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i]!.text !== 'export' || tokens[i + 1]!.text !== 'const') continue
    const name = tokens[i + 2]
    if (name?.kind !== 'other' || !/^[A-Za-z_$][\w$]*$/u.test(name.text)) continue
    const equals = theAssignmentAfter(tokens, i + 3)
    if (equals < 0) continue
    let valueAt = equals + 1
    if (tokens[valueAt]?.text === 'Object' && tokens[valueAt + 1]?.text === '.' && tokens[valueAt + 2]?.text === 'freeze' && tokens[valueAt + 3]?.text === '(') valueAt += 4
    let list = aStringArrayAt(tokens, valueAt)
    if (list === null && tokens[valueAt]?.text === 'new' && tokens[valueAt + 1]?.text === 'Set') {
      let k = valueAt + 2
      if (tokens[k]?.text === '<') {
        let depth = 0
        for (; k < tokens.length; k++) {
          if (tokens[k]!.text === '<') depth++
          else if (tokens[k]!.text === '>') {
            depth--
            if (depth === 0) { k++; break }
          }
        }
      }
      if (tokens[k]?.text === '(') list = aStringArrayAt(tokens, k + 1)
    }
    if (list !== null) { found.push({ kind: 'list', name: name.text, line: tokens[i]!.line, members: list.members }); continue }
    const number = aNumberAt(tokens, valueAt)
    if (number !== null && Number.isSafeInteger(number.value)) found.push({ kind: 'number', name: name.text, line: tokens[i]!.line, value: number.value })
  }
  return found
}

/** Decode the escapes that give JavaScript string literals their values, without executing code. */
function unescape(raw: string): string | null {
  let result = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (c !== '\\') { result += c; continue }
    const next = raw[++i]
    if (next === undefined) return null
    if (next === '\n') continue
    if (next === '\r') { if (raw[i + 1] === '\n') i++; continue }
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' }
    if (simple[next] !== undefined) { result += simple[next]; continue }
    if (/[0-7]/u.test(next)) {
      const max = /[0-3]/u.test(next) ? 3 : 2
      let digits = next
      while (digits.length < max && /[0-7]/u.test(raw[i + 1] ?? '')) digits += raw[++i]
      result += String.fromCharCode(Number.parseInt(digits, 8))
      continue
    }
    if (next === 'x' || next === 'u') {
      const rest = raw.slice(i + 1)
      const matched = next === 'x' ? /^([0-9a-f]{2})/iu.exec(rest) : /^(?:\{([0-9a-f]{1,6})\}|([0-9a-f]{4}))/iu.exec(rest)
      if (matched === null) return null
      const value = Number.parseInt(matched[1] ?? matched[2]!, 16)
      if (value > 0x10ffff) return null
      result += String.fromCodePoint(value)
      i += matched[0].length
      continue
    }
    result += next
  }
  return result
}

/** Read tokens once, including static template pieces, skipping comments and regular expressions. */
function tokensOf(text: string, isJsx = false, sink?: (token: Token) => void): Token[] {
  const tokens: Token[] = []
  let at = 0
  let line = 1
  let previous = ''
  let templates = 0
  const consume = (): string => { const c = text[at++] ?? ''; if (c === '\n') line++; return c }
  const push = (kind: Token['kind'], value: string, start: number, startLine: number, raw?: string, template?: number): void => {
    const token = { kind, text: value, line: startLine, offset: start, ...(raw === undefined ? {} : { raw }), ...(template === undefined ? {} : { template }) }
    if (sink === undefined) tokens.push(token)
    else sink(token)
    previous = kind === 'other' ? value : 'value'
  }
  const regexMayStart = (): boolean => previous === '' || /^(?:[=(:,[!&|?{};+*%~<>-]|=>|return|throw|case|yield|await|else|do|typeof|void|delete|new|instanceof|in|condition-close)$/u.test(previous)
  const quoted = (quote: string): void => {
    const start = at, startLine = line
    consume()
    let raw = ''
    let closed = false
    while (at < text.length) {
      const c = consume()
      if (c === quote) { closed = true; break }
      if (c === '\\') { raw += c; if (at < text.length) raw += consume(); continue }
      if (c === '\n' || c === '\r') break
      raw += c
    }
    const value = closed ? unescape(raw) : null
    if (value !== null) push('string', value, start, startLine, raw)
    else push('other', '', start, startLine)
  }
  const regexp = (): void => {
    consume()
    let inClass = false
    while (at < text.length) {
      const c = consume()
      if (c === '\\') { if (at < text.length) consume(); continue }
      if (c === '\n' || c === '\r') break
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) break
    }
    while (/[a-z]/iu.test(text[at] ?? '')) consume()
    previous = 'value'
  }
  const genericArrow = (): boolean => {
    if (!/^[A-Za-z_$][\w$]*(?:\s+extends\s+|,)/u.test(text.slice(at + 1))) return false
    let depth = 1
    for (let i = at + 1; i < text.length; i++) {
      const c = text[i]
      if (c === '\"' || c === "'" || c === '`') {
        for (i++; i < text.length; i++) { if (text[i] === '\\') i++; else if (text[i] === c) break }
      } else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2); if (end < 0) return false; i = end + 1
      } else if (c === '<') depth++
      else if (c === '>' && text[i - 1] !== '=' && --depth === 0) return /^\s*\(/u.test(text.slice(i + 1))
    }
    return false
  }
  const code = (withinTemplate: boolean): void => {
    let braces = 0
    const parens: boolean[] = []
    let jsxDepth = 0, jsxTag = false, jsxText = false, jsxClosing = false
    while (at < text.length) {
      const c = text[at]!, n = text[at + 1]
      if (isJsx && jsxText) {
        if (c === '{') { consume(); previous = ''; code(true); previous = 'value'; continue }
        if (c === '<' && (n === '/' || n === '>' || /[a-z]/iu.test(n ?? ''))) { consume(); jsxClosing = text[at] === '/'; if (jsxClosing) consume(); else jsxDepth++; jsxTag = true; jsxText = false; continue }
        consume(); continue
      }
      if (isJsx && jsxTag) {
        if (c === '{') { consume(); previous = ''; code(true); previous = 'value'; continue }
        if (c === '/' && n === '>') { consume(); consume(); jsxDepth--; jsxTag = false; jsxText = jsxDepth > 0; previous = 'value'; continue }
        if (c === '>') { consume(); if (jsxClosing) jsxDepth--; jsxClosing = false; jsxTag = false; jsxText = jsxDepth > 0; previous = 'value'; continue }
      }
      if (isJsx && !jsxTag && c === '<' && !genericArrow() && (n === '>' || /^[A-Za-z][A-Za-z0-9_.:-]*(?:\s|\/?>)/u.test(text.slice(at + 1))) && /^(?:[=(:,[!&|?{};+*%~>-]|=>|return|condition-close)$/u.test(previous)) {
        consume(); jsxDepth++; jsxTag = true; jsxClosing = false; continue
      }
      if (/\s/u.test(c)) { consume(); continue }
      if (c === '/' && n === '/') { while (at < text.length && consume() !== '\n') {} continue }
      if (c === '/' && n === '*') { consume(); consume(); while (at < text.length) { if (text[at] === '*' && text[at + 1] === '/') { consume(); consume(); break } consume() } continue }
      if (c === '}' && withinTemplate && braces === 0) { consume(); return }
      if (c === '"' || c === "'") { quoted(c); continue }
      if (c === '`') { template(); continue }
      if (!jsxTag && c === '/' && regexMayStart()) { regexp(); continue }
      if (!jsxTag && c === '(') { parens.push(/^(?:if|while|for|switch|with|catch)$/u.test(previous)); const start=at, startLine=line; consume(); push('other', '(', start, startLine); continue }
      if (!jsxTag && c === ')') { const condition=parens.pop() === true, start=at, startLine=line; consume(); push('other', ')', start, startLine); if (condition) previous = 'condition-close'; continue }
      if (/[a-z_$]/iu.test(c)) {
        const start = at, startLine = line
        while (/[a-z\d_$]/iu.test(text[at] ?? '')) consume()
        push('other', text.slice(start, at), start, startLine)
        continue
      }
      if (/\d/u.test(c)) {
        const start = at, startLine = line
        while (/[a-z\d_.]/iu.test(text[at] ?? '')) consume()
        const value = text.slice(start, at)
        push(/^\d+$/u.test(value) ? 'number' : 'other', value, start, startLine)
        continue
      }
      const start = at, startLine = line
      if (c === '{') braces++
      else if (c === '}' && braces > 0) braces--
      const value = c === '=' && n === '>' ? consume() + consume() : consume()
      push('other', value, start, startLine)
    }
  }
  const template = (): void => {
    const start = at, startLine = line, id = (templates += 1)
    consume()
    const parts: { raw: string; start: number; line: number }[] = []
    let part = { raw: '', start: at, line }, dynamic = false, closed = false
    while (at < text.length) {
      const c = consume()
      if (c === '\\') { part.raw += c; if (at < text.length) part.raw += consume(); continue }
      if (c === '`') { parts.push(part); closed = true; break }
      if (c === '$' && text[at] === '{') {
        consume(); parts.push(part); dynamic = true
        // Add the pieces in source order; expression strings are independent literals.
        const value = unescape(part.raw)
        if (value !== null) push('piece', value, part.start, part.line, part.raw, id)
        previous = ''
        code(true)
        part = { raw: '', start: at, line }
        continue
      }
      part.raw += c
    }
    if (!closed) { push('other', '', start, startLine); return }
    if (!dynamic) {
      const value = unescape(parts[0]!.raw)
      if (value !== null) push('string', value, start, startLine, parts[0]!.raw)
    } else {
      const value = unescape(part.raw)
      if (value !== null) push('piece', value, part.start, part.line, part.raw, id)
    }
    previous = 'value'
  }
  code(false)
  return tokens
}

/** Candidates in the run's own consecutive added lines, with lines at the tip. */
export function candidatesIn(files: readonly AddedFile[]): Candidate[] {
  const result: Candidate[] = []
  for (const file of files) {
    if (!TEST.test(file.path) || !TEST_PATH.test(file.path)) continue
    const groups: { first: number; last: number; lines: string[] }[] = []
    for (const row of file.added) {
      let group = groups[groups.length - 1]
      if (group === undefined || row.line !== group.last + 1) { group = { first: row.line, last: row.line, lines: [] }; groups.push(group) }
      group.lines.push(row.text); group.last = row.line
    }
    for (const group of groups) {
      let commentTail = /^\s*\*(?:\s|\/|$)/u.test(group.lines[0] ?? '')
      const readable = group.lines.map((row) => { if (!commentTail) return row; if (row.includes('*/')) commentTail = false; return ' '.repeat(row.length) })
      const tokens = tokensOf(readable.join('\n'), /\.[jt]sx$/u.test(file.path))
      // A TEMPLATE'S FIRST PIECE comes before its others, so it says whether the whole template is SQL.
      const opened = new Set<number>(), sql = new Set<number>()
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!
        if (token.kind === 'string' || token.kind === 'piece') {
          let value = token.text
          let end = i
          if (token.kind === 'string') while (tokens[end + 1]?.text === '+' && tokens[end + 2]?.kind === 'string') { end += 2; value += tokens[end]!.text }
          if (token.template !== undefined && !opened.has(token.template)) { opened.add(token.template); if (SQL.test(value)) sql.add(token.template) }
          const code = SQL.test(value) || (token.template !== undefined && sql.has(token.template))
          if (longEnough(value) && !RELATIVE_PATH.test(value) && !code) result.push({ path: file.path, line: group.first + token.line - 1, kind: 'string', value })
        } else if (token.kind === 'number' && !COMMON.has(token.text)) {
          if (tokens[i - 1]?.text === '+' || tokens[i - 1]?.text === '-') continue
          const here = group.lines[token.line - 1] ?? ''
          const above = group.lines[token.line - 2] ?? ''
          if (/^\s*(?:\/\/|\/\*|\*)/u.test(here)) continue
          if (LIMIT.test(here + ' ' + (/^\s*(?:\/\/|\/\*|\*)/u.test(above) ? above : ''))) result.push({ path: file.path, line: group.first + token.line - 1, kind: 'number', value: token.text })
        }
      }
      // THE SAME ADDED LINES, NOW FOR VALUES: an it.each table, a named list, or a named number.
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!
        if (token.text !== '[') continue
        const list = aStringArrayAt(tokens, i)
        if (list === null) continue
        const members = [...new Set(list.members)]
        if (members.length < 2) continue
        const context = aListContextAt(tokens, i)
        if (context === undefined) continue
        result.push({
          path: file.path,
          line: group.first + token.line - 1,
          kind: 'list',
          value: listKey(members),
          members: [...members].sort(),
          context: context.kind,
          ...(context.kind === 'const' ? { name: context.name } : {}),
        })
      }
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i]!.text !== 'const') continue
        const name = tokens[i + 1]
        if (name?.kind !== 'other' || !/^[A-Za-z_$][\w$]*$/u.test(name.text)) continue
        const equals = theAssignmentAfter(tokens, i + 2)
        if (equals < 0) continue
        const number = aNumberAt(tokens, equals + 1)
        if (number === null || !Number.isSafeInteger(number.value) || number.value < VALUE_FLOOR) continue
        result.push({ path: file.path, line: group.first + tokens[i]!.line - 1, kind: 'value', value: String(number.value), number: number.value, context: 'const', name: name.text })
      }
      for (let i = 0; i < tokens.length; i++) {
        const key = inlineKey(tokens, i)
        if (key !== undefined) result.push({ path: file.path, line: group.first + tokens[i]!.line - 1, kind: 'inline', value: key })
      }
    }
  }
  return result
}

/** Match test candidates to literal values and limit-bearing source lines. */
export function copiedIn(candidates: readonly Candidate[], files: Iterable<SourceFile>): Finding[] {
  const finder = aCopiedWordsFinder(candidates)
  for (const file of files) finder.read(file)
  return finder.findings()
}

/** The matching `copiedIn` does, given one source file at a time, so a reader may let the thread go between files. */
export function aCopiedWordsFinder(candidates: readonly Candidate[]): { read: (file: SourceFile) => void; findings: () => Finding[] } {
  const strings = new Set(candidates.filter((one) => one.kind === 'string').map((one) => one.value))
  const numbers = new Set(candidates.filter((one) => one.kind === 'number').map((one) => one.value))
  const inline = new Set(candidates.filter((one) => one.kind === 'inline').map((one) => one.value))
  const found = new Map<string, { path: string; line: number }[]>()
  const lists = new Map<string, { path: string; line: number; name: string }[]>()
  const values = new Map<number, { path: string; line: number; name: string }[]>()
  const add = (variant: Candidate['kind'], value: string, path: string, line: number): void => {
    const key = `${variant}:${value}`, list = found.get(key) ?? []
    if (!list.some((one) => one.path === path && one.line === line)) list.push({ path, line })
    found.set(key, list)
  }
  const read = (file: SourceFile): void => {
    if (!isEligibleSource(file.path)) return
    let run: Token[] = []
    let afterPlus = false
    let prior: Token | undefined
    const all: Token[] = []
    tokensOf(file.text, /\.[jt]sx$/u.test(file.path), (token) => {
      all.push(token)
      const precededBySign = prior?.text === '+' || prior?.text === '-'
      prior = token
      if (token.kind === 'string' || token.kind === 'piece') {
        if (strings.has(token.text)) add('string', token.text, file.path, token.line)
        const raw = token.raw ?? token.text
        if (numbers.size > 0 && /\d/u.test(raw)) {
          let position = token.offset
          for (const [offset, text] of raw.split('\n').entries()) {
            const from = file.text.lastIndexOf('\n', position) + 1
            const end = file.text.indexOf('\n', position)
            const sourceLine = file.text.slice(from, end < 0 ? file.text.length : end)
            if (LIMIT.test(sourceLine)) {
              for (const match of text.matchAll(/(?<![+\-\d_.])\b\d+\b(?![\d_.])/gu)) if (numbers.has(match[0])) add('number', match[0], file.path, token.line + offset)
            }
            position = end < 0 ? file.text.length : end + 1
          }
        }
        if (token.kind === 'piece') { run = []; afterPlus = false; return }
        if (!afterPlus) run = []
        run.push(token)
        for (let start = 0; start < run.length - 1; start++) {
          const value = run.slice(start).map((part) => part.text).join('')
          if (strings.has(value)) add('string', value, file.path, run[start]!.line)
        }
        afterPlus = false
        return
      }
      if (token.kind === 'other' && token.text === '+' && run.length > 0 && !afterPlus) { afterPlus = true; return }
      run = []; afterPlus = false
      if (token.kind === 'number' && !precededBySign && numbers.has(token.text)) {
        const from = file.text.lastIndexOf('\n', token.offset) + 1
        const end = file.text.indexOf('\n', token.offset)
        if (LIMIT.test(file.text.slice(from, end < 0 ? file.text.length : end))) add('number', token.text, file.path, token.line)
      }
    })
    for (const constant of exportedConstantsIn(all)) {
      if (constant.kind === 'list') {
        if (new Set(constant.members).size < 2) continue
        const key = listKey(constant.members)
        const list = lists.get(key) ?? []
        list.push({ path: file.path, line: constant.line, name: constant.name })
        lists.set(key, list)
      } else {
        const list = values.get(constant.value) ?? []
        list.push({ path: file.path, line: constant.line, name: constant.name })
        values.set(constant.value, list)
      }
    }
    if (inline.size > 0) for (let i = 0; i < all.length; i++) {
      const key = inlineKey(all, i)
      if (key !== undefined && inline.has(key)) add('inline', key, file.path, all[i]!.line)
    }
  }
  const findings = (): Finding[] => {
    const result: Finding[] = []
    // An isolated matching number is often accidental. Require four distinct matching contexts on
    // the same pair of lines before considering the two files related for inline geometry.
    const lineMatches = new Map<string, Set<string>>()
    for (const candidate of candidates) if (candidate.kind === 'inline') {
      for (const source of found.get(`inline:${candidate.value}`) ?? []) {
        const key = JSON.stringify([candidate.path, candidate.line, source.path, source.line])
        const matches = lineMatches.get(key) ?? new Set<string>()
        matches.add(candidate.value); lineMatches.set(key, matches)
      }
    }
    const related = new Set<string>()
    for (const [key, matches] of lineMatches) if (matches.size >= 4) {
      const [testPath, , sourcePath] = JSON.parse(key) as [string, number, string, number]
      related.add(JSON.stringify([testPath, sourcePath]))
    }
    const inlineLines = new Map<string, Finding>()
    for (const candidate of candidates) {
      if (candidate.kind === 'list') {
        const sources = lists.get(candidate.value) ?? []
        const named = sources.filter((source) => candidate.context === 'each' || sharesAWord(candidate.name, source.name))
        if (named.length > 0) result.push({ ...candidate, sources: named.map(({ path, line, name }) => ({ path, line, name })) })
      } else if (candidate.kind === 'value') {
        const sources = values.get(candidate.number ?? Number.NaN) ?? []
        const named = sources.filter((source) => nameIsMadeOfTheSource(candidate.name, source.name))
        if (named.length > 0) result.push({ ...candidate, sources: named.map(({ path, line, name }) => ({ path, line, name })) })
      } else if (candidate.kind === 'inline') {
        const sources = (found.get(`inline:${candidate.value}`) ?? []).filter((source) => related.has(JSON.stringify([candidate.path, source.path])))
        if (sources.length === 0) continue
        const key = JSON.stringify([candidate.path, candidate.line])
        const existing = inlineLines.get(key)
        if (existing === undefined) inlineLines.set(key, { ...candidate, sources })
        else {
          existing.value += `; ${candidate.value}`
          for (const source of sources) if (!existing.sources.some((s) => s.path === source.path && s.line === source.line)) existing.sources.push(source)
        }
      } else {
        const sources = found.get(candidate.kind + ':' + candidate.value)
        if (sources !== undefined) result.push({ ...candidate, sources })
      }
    }
    result.push(...inlineLines.values())
    return result
  }
  return { read, findings }
}
