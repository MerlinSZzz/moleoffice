// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LARGEST RUNTIME CYCLE IN src/: the biggest set of files that all reach each other by the imports the compiled
 * program keeps.
 *
 *     node tools/runtime-cycle.mjs [--root <checkout>]   prints its size and its files
 *     node tools/runtime-cycle.mjs --write               writes the files to tests/the-largest-runtime-cycle-files.json
 *
 * HOW IT COUNTS. This is the graph part of the decoupling design's runtime-boundaries.mjs, counted the same way:
 *   - the files are every path under src/ that `git ls-files --cached --others --exclude-standard` names and that ends
 *     in .ts, .tsx, .mjs, .js, .cjs or .mts; a .d.ts or .d.mts file declares only types and is no node;
 *   - each file is compiled with esbuild, so an import the compiler drops (`import type`, or a name used only as a
 *     type) is no edge;
 *   - the compiled text is parsed, and an edge is an `import`, an `export … from`, an `export * from` or an `import()`
 *     whose argument is a plain string;
 *   - a specifier is followed when it is relative or begins with @shared/, @server/, @web/ or @config/, trying the
 *     path, then .ts, .tsx, .mjs and .js, then the same under /index; a package or a file of another kind is no edge;
 *   - the cycles are the strongly connected components of that graph (Tarjan's method).
 *
 * A FILE IT CANNOT READ STOPS IT. The design's first script read the source text with a lexer and passed over 333
 * files it could not parse without saying so (problem VJsIEDQbPZRc). So a file that cannot be read, compiled or parsed
 * throws here, with the file's name, and no number is given.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const { parseAst } = await import(createRequire(import.meta.url).resolve('rolldown/parseAst'))

/** The file under tests/ that holds the cycle's files, for the test to name the files that joined. */
export const THE_HELD_FILES = 'tests/the-largest-runtime-cycle-files.json'

const ALIASES = /** @type {const} */ ([['@shared/', 'src/shared/'], ['@server/', 'src/server/'], ['@web/', 'src/web/'], ['@config/', 'src/config/']])
const ENDINGS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.mjs', '/index.js']

/** @param {string} root @returns {string[]} */
function theFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f.startsWith('src/') && /\.(ts|tsx|mjs|js|cjs|mts|cts)$/.test(f))
}

/**
 * Every file and the files it imports at run time.
 * @param {string} root the checkout
 * @returns {Map<string, Set<string>>}
 */
export function theRuntimeGraph(root) {
  const files = theFiles(root)
  const known = new Set(files)
  /** @param {string} from @param {string} spec @returns {string | null} */
  const follow = (from, spec) => {
    let base
    if (spec.startsWith('.')) base = resolve(root, dirname(from), spec)
    else {
      const alias = ALIASES.find(([a]) => spec.startsWith(a))
      if (alias === undefined) return null
      base = resolve(root, alias[1] + spec.slice(alias[0].length))
    }
    for (const ending of ENDINGS) {
      const path = relative(root, base + ending)
      if (known.has(path)) return path
    }
    return null
  }
  /** @type {Map<string, Set<string>>} */
  const graph = new Map(files.map((f) => [f, new Set()]))
  for (const f of files) {
    let text
    try {
      text = readFileSync(resolve(root, f), 'utf8')
    } catch (e) {
      throw new Error(`${f} is listed by git but could not be read, so the cycle was not counted: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (f.endsWith('.d.ts') || f.endsWith('.d.mts')) continue
    let code
    try {
      code = transformSync(text, { loader: f.endsWith('.tsx') ? 'tsx' : /\.(ts|mts|cts)$/.test(f) ? 'ts' : 'js', format: 'esm', target: 'es2022', jsx: 'automatic', sourcefile: f }).code
    } catch (e) {
      throw new Error(`${f} could not be compiled, so the cycle was not counted: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    }
    let program
    try {
      program = parseAst(code, { lang: 'js' })
    } catch (e) {
      throw new Error(`${f} compiled to text that could not be parsed, so the cycle was not counted: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    }
    const out = /** @type {Set<string>} */ (graph.get(f))
    /** @param {string} spec */
    const add = (spec) => {
      const to = follow(f, spec)
      if (to !== null && to !== f) out.add(to)
    }
    /** @param {any} node */
    const visit = (node) => {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source)) {
        add(node.source.value)
        return
      }
      if (node.type === 'ImportExpression' && node.source.type === 'Literal' && typeof node.source.value === 'string') add(node.source.value)
      for (const key of Object.keys(node)) if (key !== 'type' && node[key] && typeof node[key] === 'object') visit(node[key])
    }
    visit(program.body)
  }
  return graph
}

/**
 * The cycles of more than one file, biggest first, each sorted by path.
 * @param {Map<string, Set<string>>} graph
 * @returns {string[][]}
 */
export function theCycles(graph) {
  let index = 0
  /** @type {Map<string, number>} */
  const indexOf = new Map()
  /** @type {Map<string, number>} */
  const low = new Map()
  /** @type {Set<string>} */
  const onStack = new Set()
  /** @type {string[]} */
  const stack = []
  /** @type {string[][]} */
  const cycles = []
  /** @param {string} v */
  const strong = (v) => {
    indexOf.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!indexOf.has(w)) {
        strong(w)
        low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (low.get(w))))
      } else if (onStack.has(w)) low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (indexOf.get(w))))
    }
    if (low.get(v) === indexOf.get(v)) {
      /** @type {string[]} */
      const cycle = []
      let w
      do {
        w = /** @type {string} */ (stack.pop())
        onStack.delete(w)
        cycle.push(w)
      } while (w !== v)
      if (cycle.length > 1) cycles.push(cycle.sort())
    }
  }
  for (const v of graph.keys()) if (!indexOf.has(v)) strong(v)
  return cycles.sort((a, b) => b.length - a.length)
}

/**
 * The files of the largest runtime cycle, sorted; empty when there is no cycle.
 * @param {string} root the checkout
 * @returns {string[]}
 */
export function theLargestRuntimeCycle(root) {
  return theCycles(theRuntimeGraph(root))[0] ?? []
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root')
  const root = at > 0 ? resolve(/** @type {string} */ (process.argv[at + 1])) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const files = theLargestRuntimeCycle(root)
  if (process.argv.includes('--write')) {
    writeFileSync(resolve(root, THE_HELD_FILES), JSON.stringify({ files }, null, 2) + '\n')
    console.log(`${THE_HELD_FILES}: the ${files.length} files of the largest runtime cycle`)
  } else console.log(`The largest runtime cycle holds ${files.length} files:\n${files.join('\n')}`)
}
