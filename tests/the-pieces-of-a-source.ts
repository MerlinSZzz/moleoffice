// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIECES OF A SOURCE: a file split into code, comments and quoted strings.
 *
 * The owner-content gate (tools/merge-tool/owner-content.mjs) reads it to tell whether a Chinese word on an added line
 * sits in a comment, so this module is on the queue's own-code list and a change to it is tested alone.
 */

// ============================================================ the scanner

/**
 * A run of the file that is not code: a comment, or a quoted string.
 *
 * EXPORTED FOR THE MACHINE-WORD GATE, which reads the same three kinds of run out of the same
 * files and would otherwise carry a second hand-written tokeniser. See tests/machine-words.ts.
 */
export interface Piece {
  at: number
  end: number
  what: 'comment' | 'string'
  /** The text between the quotes, with no unescaping. Empty for a comment. */
  body: string
}

/**
 * Split a file into code, comments and string literals.
 *
 * A regular expression literal is the one thing that can throw a text scanner off, because it may
 * hold an unmatched quote — `/['"]/` is real code and would open a string that never closes. So a
 * `/` that follows an operator, an opening bracket or the start of a statement is read as a regular
 * expression and skipped whole.
 *
 * A `/` after a reserved word that must be followed by an expression — `return`, `typeof`,
 * `instanceof`, `in`, `new`, `delete`, `void`, `throw`, `case`, `do` and `else` — opens a regular
 * expression too, unless the word is a property name after `.` or `?.`. A name that merely ends in
 * one of those words divides.
 */
export function piecesOf(text: string): Piece[] {
  const out: Piece[] = []
  let i = 0
  // The last character of code that was not whitespace. It is what says whether a `/` divides or
  // opens a regular expression.
  let previous = ''
  while (i < text.length) {
    const c = text[i]
    if (c === undefined) break
    if (c === '/' && text[i + 1] === '/') {
      const stop = text.indexOf('\n', i)
      const end = stop === -1 ? text.length : stop
      out.push({ at: i, end, what: 'comment', body: '' })
      i = end
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const stop = text.indexOf('*/', i + 2)
      const end = stop === -1 ? text.length : stop + 2
      out.push({ at: i, end, what: 'comment', body: '' })
      i = end
      continue
    }
    if (c === '/' && opensARegularExpression(text, i, previous)) {
      i = closingSlashOf(text, i) + 1
      previous = '/'
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === c) break
        if (text[j] === '\n') break
        j += 1
      }
      out.push({ at: i, end: j + 1, what: 'string', body: text.slice(i + 1, j) })
      i = j + 1
      previous = c
      continue
    }
    if (c === '`') {
      // A template literal. `${` opens code again, so the depth of braces inside it is tracked
      // and the pieces of the template between placeholders are joined back together with the
      // placeholder written out, which is how the prose inventory printed them.
      let j = i + 1
      let body = ''
      while (j < text.length) {
        if (text[j] === '\\') {
          body += text.slice(j, j + 2)
          j += 2
          continue
        }
        if (text[j] === '`') break
        if (text[j] === '$' && text[j + 1] === '{') {
          let depth = 1
          let k = j + 2
          // The placeholder is code, so a `/` after an operator or an opening bracket opens a regular expression here
          // too, and a quote inside it opens no string: `${name.replace(/"/g, '""')}` closes where the brace does.
          let before = '{'
          while (k < text.length && depth > 0) {
            if (text[k] === '{') depth += 1
            else if (text[k] === '}') depth -= 1
            else if (text[k] === '/' && opensARegularExpression(text, k, before)) k = closingSlashOf(text, k)
            else if (text[k] === "'" || text[k] === '"' || text[k] === '`') {
              const quote = text[k]
              k += 1
              while (k < text.length && text[k] !== quote) {
                if (text[k] === '\\') k += 1
                k += 1
              }
            }
            if (!/\s/.test(text[k] ?? '')) before = codeCharacterAt(text, k)
            k += 1
          }
          body += `\${${text.slice(j + 2, k - 1)}}`
          j = k
          continue
        }
        body += text[j]
        j += 1
      }
      out.push({ at: i, end: j + 1, what: 'string', body })
      i = j + 1
      previous = '`'
      continue
    }
    if (!/\s/.test(c)) previous = codeCharacterAt(text, i)
    i += 1
  }
  return out
}

/** The last code character before a `/` that makes the `/` open a regular expression rather than divide. */
const OPENS_A_REGULAR_EXPRESSION = /[(,=:[!&|?{};+\-*%<>~^]/

/** The reserved words after which an expression must follow, so a `/` after one opens a regular expression. */
const KEYWORDS_BEFORE_A_REGULAR_EXPRESSION = new Set(['return', 'typeof', 'instanceof', 'in', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else'])

/** A character that can be part of a name. */
const NAME_CHARACTER = /[\w$]/

/**
 * Whether a `/` at `at` opens a regular expression. `previous` is the last code character before it.
 *
 * A name that ends in a keyword's letters opens one only when the whole name is that keyword and the
 * name is not a property after `.` or `?.`.
 */
function opensARegularExpression(text: string, at: number, previous: string): boolean {
  if (OPENS_A_REGULAR_EXPRESSION.test(previous)) return true
  if (!NAME_CHARACTER.test(previous)) return false
  let end = at - 1
  while (end >= 0 && /\s/.test(text[end] ?? '')) end -= 1
  let start = end
  while (start >= 0 && NAME_CHARACTER.test(text[start] ?? '')) start -= 1
  const name = text.slice(start + 1, end + 1)
  if (!KEYWORDS_BEFORE_A_REGULAR_EXPRESSION.has(name)) return false
  let before = start
  while (before >= 0 && /\s/.test(text[before] ?? '')) before -= 1
  return text[before] !== '.'
}

/**
 * The character at `at`, as far as a following `/` is concerned. A `!` written straight after a name or a closing
 * bracket is TypeScript's non-null mark, `size! / 2`, so it counts as the name it ends and the `/` divides.
 */
function codeCharacterAt(text: string, at: number): string {
  const c = text[at] ?? ''
  return c === '!' && /[\w$)\]]/.test(text[at - 1] ?? '') ? ')' : c
}

/** Where the regular expression opening at `at` closes, minding escapes and character classes. */
function closingSlashOf(text: string, at: number): number {
  let j = at + 1
  let inClass = false
  while (j < text.length) {
    const d = text[j]
    if (d === '\\') {
      j += 2
      continue
    }
    if (d === '[') inClass = true
    else if (d === ']') inClass = false
    else if (d === '/' && !inClass) break
    else if (d === '\n') break
    j += 1
  }
  return j
}
