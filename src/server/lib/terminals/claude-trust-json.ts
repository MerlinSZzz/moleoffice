// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** JSON token spans let a trust change preserve every byte outside its own value or insertion. */
interface Token {
  start: number
  end: number
  properties?: Map<string, Token>
}

function object(token: Token): Map<string, Token> {
  if (token.properties === undefined) throw new Error('The trust settings need JSON objects at the project path.')
  return token.properties
}

/** Strict JSON, including duplicate-key rejection: two spellings of a key must never hide an entry. */
function tokens(text: string, start: number): Token {
  let at = start
  const whitespace = () => { while (/[\t\n\r ]/.test(text[at] ?? '\0')) at++ }
  function string(): string {
    const begin = at++
    while (at < text.length) {
      const c = text[at++]
      if (c === '\\') at++
      else if (c === '"') return JSON.parse(text.slice(begin, at)) as string
    }
    throw new Error('The trust settings contain an unfinished JSON string.')
  }
  function value(depth: number): Token {
    if (depth > 128) throw new Error('The trust settings are nested too deeply to edit safely.')
    whitespace()
    const begin = at
    if (text[at] === '{') {
      at++; whitespace()
      const properties = new Map<string, Token>()
      while (text[at] !== '}') {
        const key = string(); whitespace(); at++
        if (properties.has(key)) throw new Error('The trust settings contain duplicate JSON keys.')
        properties.set(key, value(depth + 1)); whitespace()
        if (text[at] !== ',') break
        at++; whitespace()
      }
      at++
      return { start: begin, end: at, properties }
    }
    if (text[at] === '[') {
      at++; whitespace()
      while (text[at] !== ']') {
        value(depth + 1); whitespace()
        if (text[at] !== ',') break
        at++; whitespace()
      }
      at++
    } else if (text[at] === '"') string()
    else while (at < text.length && !/[\t\n\r ,}\]]/.test(text[at]!)) at++
    return { start: begin, end: at }
  }
  return value(0)
}

/** Null is an exact no-op. Existing numbers, escapes, whitespace, BOM and line endings are never serialized. */
export function theClaudeTrustEdit(bytes: Buffer, folder: string): Buffer | null {
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('The trust settings are not valid UTF-8.')
  const start = text.startsWith('\uFEFF') ? 1 : 0
  // Validate syntax first; the span reader below only has to retain positions and detect duplicate keys.
  try { JSON.parse(text.slice(start)) } catch { throw new Error('The trust settings are not valid JSON.') }
  const root = tokens(text, start), top = object(root)
  const projects = top.get('projects'), project = projects === undefined ? undefined : object(projects).get(folder)
  const trust = project === undefined ? undefined : object(project).get('hasTrustDialogAccepted')
  let at: number, remove = 0, insert: string
  if (trust !== undefined) {
    const current = text.slice(trust.start, trust.end)
    if (current === 'true') return null
    if (current !== 'false') throw new Error('The existing project trust value is not a boolean.')
    at = trust.start; remove = trust.end - trust.start; insert = 'true'
  } else if (project !== undefined) {
    at = project.end - 1
    insert = (object(project).size > 0 ? ',' : '') + '"hasTrustDialogAccepted":true'
  } else if (projects !== undefined) {
    at = projects.end - 1
    insert = (object(projects).size > 0 ? ',' : '') + JSON.stringify(folder) + ':{"hasTrustDialogAccepted":true}'
  } else {
    at = root.end - 1
    insert = (top.size > 0 ? ',' : '') + '"projects":{' + JSON.stringify(folder) + ':{"hasTrustDialogAccepted":true}}'
  }
  return Buffer.from(text.slice(0, at) + insert + text.slice(at + remove), 'utf8')
}
