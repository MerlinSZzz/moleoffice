// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REFUSAL_CODES } from '../src/shared/refusal-codes.ts'
import { piecesOf, tidy } from './sentences.ts'

/**
 * ErrorNote can draw any PanelError, including ones reached through shared guards. Keep that
 * conservative set, plus error/reason fields sent directly in response objects. This is a source
 * inventory, not a claim that every branch is reachable from a page today. Prose is represented by
 * a fingerprint so this list does not copy personal words from older server sentences. Detail is excluded:
 * ErrorNote puts it in Developer mode. Dynamic expressions remain named instead of guessed.
 *
 * The shared lexer masks comments and strings before finding calls. It does not follow aliases
 * of PanelError, computed property names, or response objects assembled outside send().
 */
/** A refusal whose text holds a real line break inside one of its quoted pieces, by file and line. */
export interface ABrokenRefusal {
  file: string
  line: number
  text: string
}

/**
 * EVERY REFUSAL WHOSE WORDS HOLD A REAL LINE BREAK INSIDE A QUOTED PIECE, coded or not.
 *
 * A template literal keeps a line break typed inside it, so a sentence reworded across two source lines
 * reached the person as two halves of one sentence (wave 13s round 5, check TM-iVtq8UrlZ). The
 * fingerprint above is taken after `tidy` folds whitespace, so the inventory could not see it. A refusal
 * is one sentence or more joined with `+`; a line break it means is written `\n`, which is not a real one.
 */
/**
 * A quoted piece's own words: a template literal's placeholders taken out, so a line break inside `${…}`,
 * which is code and reaches nobody, is not counted.
 */
function theWordsOf(body: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    if (depth === 0 && body[i] === '$' && body[i + 1] === '{') {
      depth = 1
      i++
      continue
    }
    if (depth > 0) {
      if (body[i] === '{') depth++
      else if (body[i] === '}') depth--
      continue
    }
    out += body[i]
  }
  return out
}

export function refusalsWithALineBreak(root = resolve('.')): ABrokenRefusal[] {
  const broken: ABrokenRefusal[] = []
  serverRefusalsWithoutCodes(root, broken)
  return broken
}

export function serverRefusalsWithoutCodes(root = resolve('.'), broken?: ABrokenRefusal[]) {
  const sites: { file: string; field: string; source: string; fingerprint: string; count: number }[] = []
  function walk(folder: string): string[] {
    return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? walk(join(folder, entry.name))
      : entry.name.endsWith('.ts') ? [join(folder, entry.name)] : [])
  }
  for (const file of walk(join(root, 'src/server')).sort()) {
    const source = readFileSync(file, 'utf8')
    const pieces = piecesOf(source)
    let at = 0
    let code = ''
    for (const piece of pieces) {
      code += source.slice(at, piece.at) + ' '.repeat(piece.end - piece.at)
      at = piece.end
    }
    code += source.slice(at)
    const add = (field: string, expression: string) => {
      let shown = expression
      for (const piece of piecesOf(expression).reverse()) {
        shown = shown.slice(0, piece.at) + (piece.what === 'string' ? '[text]' : '') + shown.slice(piece.end)
      }
      const row = { file: relative(root, file), field, source: tidy(shown), fingerprint: createHash('sha256').update(tidy(expression)).digest('hex'), count: 1 }
      const found = sites.find(site => site.file === row.file && site.field === row.field && site.fingerprint === row.fingerprint)
      if (found) found.count++
      else sites.push(row)
    }
    function argumentsAt(start: number): string[] {
      const args: string[] = []
      let depth = 0
      let from = start + 1
      for (let i = from; i < code.length; i++) {
        const c = code[i]!
        if ('([{'.includes(c)) depth++
        if (')]}'.includes(c)) {
          if (depth === 0) {
            args.push(source.slice(from, i).trim())
            return args
          }
          depth--
        }
        if (c === ',' && depth === 0) {
          args.push(source.slice(from, i).trim())
          from = i + 1
        }
      }
      throw new Error(`Unclosed refusal call in ${file}`)
    }
    // A REAL LINE BREAK INSIDE A QUOTED PIECE of a refusal's words, asked of every refusal, coded or not.
    const lookForABreak = (expression: string, at: number) => {
      if (broken === undefined) return
      for (const piece of piecesOf(expression)) {
        if (piece.what !== 'string' || !theWordsOf(piece.body).includes('\n')) continue
        broken.push({ file: relative(root, file), line: source.slice(0, at).split('\n').length, text: tidy(piece.body).slice(0, 160) })
      }
    }
    for (const match of code.matchAll(/\bnew\s+PanelError\s*\(/g)) {
      const args = argumentsAt(match.index + match[0].length - 1)
      lookForABreak(args[0] ?? '', match.index)
      if (args[4] && args[4] !== 'undefined') lookForABreak(args[4], match.index)
      const codes = [...(args[5] ?? '').matchAll(/\bcode:\s*['"]([^'"]+)['"]/g)].map(found => found[1]!)
      if (codes.length > 0 && codes.every(key => Object.hasOwn(REFUSAL_CODES, key))) continue
      // OR A CODE HELD IN A CONSTANT, written bare: `code: DECISION_REPLACES_UNSAID_WITH_CANDIDATES`
      // (wave 13s round 240). The handler that reads `code` is typed to a refusal code, so a bare
      // identifier that compiles there is a code. `code: undefined` is not one, and a member
      // expression such as `code: refused.code` cannot be known from this file, so neither counts.
      const named = [...(args[5] ?? '').matchAll(/\bcode:\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)]
        .map(found => found[1]!)
        .filter(name => name !== 'undefined')
      if (named.length > 0) continue
      // OR A CODE READ FROM A TABLE TYPED AS REFUSAL CODES, as lib/message-keys.ts picks one for each key shape (wave 13w
      // round 2). The type checker proves every value in such a table is a code, so the refusal is a coded one.
      const table = /\bcode:\s*([A-Za-z_$][\w$]*)\[/.exec(args[5] ?? '')?.[1]
      if (table !== undefined && new RegExp(`\\bconst\\s+${table}\\s*:\\s*Record<[^,>]+,\\s*\\w+RefusalCode>`).test(code)) continue
      // OR A CODE PASSED IN A NAME TYPED AS A REFUSAL CODE, as aHarnessRefusal(code: HarnessRefusalCode, …) passes its own
      // parameter on. The type checker proves the name holds a code, so the refusal is a coded one.
      const passed = /\bcode(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*[,}]/.exec(args[5] ?? '')
      const name = passed === null ? undefined : passed[1] ?? 'code'
      if (name !== undefined && new RegExp(`\\b${name}\\s*:\\s*\\w+RefusalCode\\b`).test(code)) continue
      add('error', args[0] ?? '')
      if (args[4] && args[4] !== 'undefined') add('reason', args[4])
    }
    for (const match of code.matchAll(/\.send\s*\(/g)) {
      const start = match.index + match[0].length - 1
      const body = argumentsAt(start)[0]
      if (!body?.startsWith('{')) continue
      const open = code.indexOf('{', start)
      const fields = argumentsAt(open)
      for (const field of fields) {
        const found = /^(error|reason)\s*:\s*([\s\S]*)$/.exec(field)
        if (found) {
          lookForABreak(found[2]!, match.index)
          add(found[1]!, found[2]!)
        }
      }
    }
  }
  return sites.sort((a, b) => `${a.file}\0${a.field}\0${a.fingerprint}`.localeCompare(`${b.file}\0${b.field}\0${b.fingerprint}`, 'en'))
}

export const REFUSAL_INVENTORY = fileURLToPath(new URL('./server-refusals-without-codes.json', import.meta.url))

// Refresh only after reviewing the added or converted sites. Ordinary test runs never accept a new site.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const sites = serverRefusalsWithoutCodes()
  writeFileSync(REFUSAL_INVENTORY, JSON.stringify(sites, null, 2) + '\n')
  console.log(`${sites.length} distinct uncoded fields written to ${REFUSAL_INVENTORY}`)
}
