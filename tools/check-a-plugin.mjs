#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN CHECKS ITSELF WITH ONE COMMAND. Wave 13x round 16, step 4 of the plugin pipeline udGnc-Bsr15R (block
 * 1Asl25_3DvQM), as the Checks block of the plan VlQueUhVQQmi says: its own tests under plugins/<id>/tests, its own type
 * check and its own build, and the four slot checks. It never runs the office's suite.
 *
 * Usage:
 *   node tools/check-a-plugin.mjs <id>                  check plugins/<id> in this checkout
 *   node tools/check-a-plugin.mjs <id> --root <folder>  check <folder>/plugins/<id>, for a tree that is not this checkout
 *   node tools/check-a-plugin.mjs <id> --json           and end with the whole answer as one JSON line
 *
 * THE STEPS, IN ORDER. Every step that can run does, so one run names every fault it can find. A step that cannot run
 * says why, and counts as not passed.
 *   manifest  The office accepts plugins/<id>/plugin.json. `aManifestFrom` in src/shared/plugins.ts decides it, for the
 *             office's reader of the plugins folder as well. Slot check 1.
 *   views     Every view the manifest reads is a view of the interface it names. Slot check 2.
 *   imports   No file of the plugin imports anything outside its own folder except src/shared/plugin-read.ts, the
 *             published read types, and packages. The office's alias @shared is refused, and so is an import whose
 *             name is worked out as it runs, because nobody can read where it goes. Slot check 4.
 *   types     tsc finds no error in the plugin's TypeScript files, with the office's strictness.
 *   tests     The plugin's tests under plugins/<id>/tests pass, and there is at least one: a check that ran nothing is
 *             not a check. They run under the same guard as the office's suite, so they cannot reach the live office.
 *   build     Vite builds each page of the manifest, plugins/<id>/<slug>.html, into plugins/<id>/dist, where the office
 *             serves it from (PLUGIN_BUILT_FOLDER in src/shared/plugins.ts). The plan's step 4 said dist/plugins/<id>;
 *             the slot of round 15 reads plugins/<id>/dist, and the office's own build owns dist/, so it stays there.
 *   size      The built files fit the manifest's budget, builtKilobytes of 1,024 bytes. Slot check 3.
 *
 * Exit 0 when every step passed, 1 when any did not, and 2 when the command itself was not usable.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSync } from 'rolldown/utils'
import { register } from 'tsx/esm/api'

import { THE_ALIASES } from '../src/config/import-graph.mjs'
import { markEveryProcessAsTheSuites } from '../src/config/the-test-mark.mjs'
import { buildThePluginsPages } from './build-a-plugin.mjs'
import { guardEveryTestProcess } from './live-office-ports.mjs'

const THIS_CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// src/shared/plugins.ts reaches files that import each other through the office's alias @shared, which plain node
// cannot resolve. tsx resolves it from the office's tsconfig, so the command stays `node tools/check-a-plugin.mjs`.
register({ tsconfig: join(THIS_CHECKOUT, 'tsconfig.json') })
const {
  PLUGIN_BUILT_FOLDER,
  PLUGIN_ID,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_READ_INTERFACE,
  PLUGIN_READ_VIEWS,
  PLUGINS_FOLDER,
  THE_PUBLISHED_READ_TYPES,
  aManifestFrom,
  pluginPageFile,
} = await import('../src/shared/plugins.ts')
const STEPS = ['manifest', 'views', 'imports', 'types', 'tests', 'build', 'size']

/** The files a plugin's code is in, and the ones tsc reads. */
const CODE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const TYPED = new Set(['.ts', '.tsx', '.mts', '.cts'])
/** A test file under plugins/<id>/tests. */
const A_TEST = /\.test\.(?:ts|tsx|mts|js|mjs)$/u

// ============================================================================ the command line

function usage(said) {
  process.stderr.write(`check-a-plugin: ${said}\nUsage: node tools/check-a-plugin.mjs <id> [--root <folder>] [--json]\n`)
  process.exit(2)
}

const args = process.argv.slice(2)
let id = null
let root = THIS_CHECKOUT
let json = false
for (let index = 0; index < args.length; index += 1) {
  const one = args[index]
  if (one === '--json') json = true
  else if (one === '--root') {
    const value = args[index + 1]
    if (value === undefined) usage('--root names a folder.')
    root = resolve(value)
    index += 1
  } else if (one.startsWith('-')) usage(`${one} is not an option this command takes.`)
  else if (id === null) id = one
  else usage(`It checks one plugin, and was given ${id} and ${one}.`)
}
if (id === null) usage('Name the plugin to check, by its id.')
if (!PLUGIN_ID.test(id)) usage(`"${id}" is not a plugin id: ${PLUGIN_ID.source}.`)

const folder = join(root, PLUGINS_FOLDER, id)
const shown = (path) => relative(root, path).split(sep).join('/')

// ============================================================================ the steps

/** What each step found: passed, failed or not run, and why, in English. */
const found = new Map()
const say = (step, outcome, says) => found.set(step, { step, outcome, says })

/** Every file under `at`, but the built folder, node_modules and anything whose name starts with a dot. */
function filesUnder(at) {
  if (!existsSync(at)) return []
  const out = []
  for (const name of readdirSync(at).sort()) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const path = join(at, name)
    if (at === folder && name === PLUGIN_BUILT_FOLDER) continue
    if (statSync(path).isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

/** The manifest and the views, both from the one reading of a manifest. Returns the accepted manifest, or null. */
function theManifestAndItsViews() {
  const file = join(folder, PLUGIN_MANIFEST_FILE)
  const text = existsSync(file) ? readFileSync(file, 'utf8') : null
  const read = aManifestFrom(id, text)
  if ('manifest' in read) {
    say('manifest', 'passed', `The office accepts ${shown(file)}.`)
    say('views', 'passed', `It reads ${read.manifest.reads.length === 0 ? 'no view' : read.manifest.reads.join(', ')}, and ${PLUGIN_READ_INTERFACE} has ${PLUGIN_READ_VIEWS.join(', ')}.`)
    return read.manifest
  }
  const aboutTheViews = (issue) => issue.path === 'interface' || issue.path === 'reads' || issue.path.startsWith('reads.')
  const views = read.issues.filter(aboutTheViews)
  const rest = read.issues.filter((issue) => !aboutTheViews(issue))
  say('manifest', rest.length === 0 ? 'passed' : 'failed', rest.length === 0 ? 'Everything in it but the views it reads is a manifest the office accepts.' : read.refusal)
  let raw = null
  try {
    raw = text === null ? null : JSON.parse(text)
  } catch {
    raw = null
  }
  if (raw === null || typeof raw !== 'object') {
    say('views', 'not run', `There is no manifest to read the views from: ${read.refusal}`)
  } else if (views.length === 0) {
    say('views', 'passed', `Every view it reads is a view of ${PLUGIN_READ_INTERFACE}: ${PLUGIN_READ_VIEWS.join(', ')}.`)
  } else {
    const named = views.map((issue) => {
      const [, at] = issue.path.split('.')
      return at === undefined ? `${issue.path}: ${issue.message}` : `it reads ${JSON.stringify(raw.reads?.[Number(at)])} (${issue.path}), which is not a view of ${String(raw.interface)}`
    })
    say('views', 'failed', `${named.join('; ')}. The views of ${PLUGIN_READ_INTERFACE} are ${PLUGIN_READ_VIEWS.join(', ')}.`)
  }
  return null
}

/** Every module name a file of code imports, with its line; a name worked out as it runs is `{ unread: true }`. */
function theImportsOf(path, text) {
  const parsed = parseSync(path, text)
  if (parsed.errors.length > 0) return { error: parsed.errors.map((one) => one.message).join(' ') }
  const lineAt = (offset) => text.slice(0, offset).split('\n').length
  const out = []
  const named = (node, at) => {
    if (node?.type === 'Literal' && typeof node.value === 'string') out.push({ name: node.value, line: lineAt(at) })
    else if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) out.push({ name: node.quasis[0].value.cooked, line: lineAt(at) })
    else out.push({ unread: true, line: lineAt(at) })
  }
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node === null || typeof node !== 'object') return
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'TSImportType':
        named(node.source, node.start)
        break
      case 'ExportNamedDeclaration':
        if (node.source !== null && node.source !== undefined) named(node.source, node.start)
        break
      case 'ImportExpression':
        named(node.source, node.start)
        break
      case 'TSExternalModuleReference':
        named(node.expression, node.start)
        break
      case 'CallExpression':
        if (node.callee?.type === 'Identifier' && node.callee.name === 'require') named(node.arguments[0], node.start)
        break
      default:
        break
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'parent' && typeof value === 'object') walk(value)
  }
  walk(parsed.program)
  return { imports: out }
}

/** The addresses a page names in src= and href=, with their lines. Only addresses without a scheme can be files. */
function theAddressesOf(text) {
  const out = []
  for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/giu)) {
    const address = match[1].replace(/[?#].*$/u, '')
    if (address === '' || /^[a-z][a-z0-9+.-]*:/iu.test(address) || address.startsWith('//')) continue
    out.push({ name: address, line: text.slice(0, match.index).split('\n').length })
  }
  return out
}

/** Slot check 4: where every import of every file goes. */
function theImports(files) {
  const published = join(root, THE_PUBLISHED_READ_TYPES)
  const inside = (target) => target === folder || target.startsWith(`${folder}${sep}`)
  const faults = []
  let read = 0
  for (const path of files) {
    const kind = extname(path)
    const isAPage = kind === '.html'
    if (!CODE.has(kind) && !isAPage) continue
    read += 1
    const text = readFileSync(path, 'utf8')
    const got = isAPage ? { imports: theAddressesOf(text) } : theImportsOf(path, text)
    if ('error' in got) {
      faults.push(`${shown(path)} could not be read: ${got.error}`)
      continue
    }
    for (const one of got.imports) {
      const where = `${shown(path)} line ${String(one.line)}`
      if (one.unread) {
        faults.push(`${where} imports a name worked out as it runs, which cannot be read before it runs`)
        continue
      }
      const alias = Object.entries(THE_ALIASES).find(([name]) => one.name === name || one.name.startsWith(`${name}/`))
      if (alias !== undefined) {
        faults.push(`${where} imports "${one.name}", the office's own name for ${alias[1]}`)
        continue
      }
      const isAPath = one.name.startsWith('.') || one.name.startsWith('/')
      if (!isAPath) continue
      // A PAGE'S ADDRESS STARTING WITH / IS FROM THE PLUGIN'S FOLDER, which is where Vite builds it from.
      const target = isAPage && one.name.startsWith('/') ? join(folder, one.name) : resolve(dirname(path), one.name)
      if (inside(target) || target === published) continue
      faults.push(`${where} imports "${one.name}", which is ${shown(target)}, outside the plugin's folder`)
    }
  }
  if (faults.length > 0) say('imports', 'failed', `${faults.join('. ')}. A plugin may import its own files, packages, and ${THE_PUBLISHED_READ_TYPES}.`)
  else say('imports', 'passed', `${String(read)} ${read === 1 ? 'file imports' : 'files import'} nothing outside the plugin's folder but ${THE_PUBLISHED_READ_TYPES} and packages.`)
}

/** The type check, with the office's own strictness (tsconfig.json), on the plugin's TypeScript files alone. */
function theTypes(files) {
  const typed = files.filter((path) => TYPED.has(extname(path)))
  if (typed.length === 0) return say('types', 'not run', 'It has no TypeScript file, so there is nothing to type-check.')
  const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc')
  const options = [
    '--ignoreConfig', '--noEmit', '--pretty', 'false', '--strict', '--noUncheckedIndexedAccess', '--noImplicitOverride',
    '--esModuleInterop', '--skipLibCheck', '--resolveJsonModule', '--allowImportingTsExtensions', '--target', 'es2022',
    '--lib', 'es2022,dom,dom.iterable', '--module', 'esnext', '--moduleResolution', 'bundler', '--jsx', 'react-jsx',
    '--types', 'node',
  ]
  const ran = spawnSync(process.execPath, [tsc, ...options, ...typed.map((path) => relative(folder, path))], { cwd: folder, encoding: 'utf8', timeout: 300_000 })
  if (ran.status === 0) return say('types', 'passed', `tsc found no error in ${String(typed.length)} ${typed.length === 1 ? 'file' : 'files'}.`)
  const said = `${ran.stdout}${ran.stderr}`.trim().split('\n').filter((line) => line.trim() !== '')
  say('types', 'failed', ran.status === null ? `tsc did not finish: ${String(ran.error?.message ?? ran.signal)}` : `tsc found ${said.length === 1 ? 'an error' : 'errors'}: ${said.slice(0, 10).join(' ')}${said.length > 10 ? ` and ${String(said.length - 10)} more lines` : ''}`)
}

/** The plugin's own tests, under the office suite's guard. */
async function theTests() {
  const tests = filesUnder(join(folder, 'tests')).filter((path) => A_TEST.test(path))
  if (tests.length === 0) return say('tests', 'failed', `There is no test under ${shown(join(folder, 'tests'))} (a file named *.test.ts), and a check that ran nothing is not a check.`)
  let guard
  try {
    guard = guardEveryTestProcess()
  } catch (error) {
    return say('tests', 'not run', String(error.message))
  }
  markEveryProcessAsTheSuites()
  process.stdout.write(`${guard}\n`)
  const { startVitest } = await import('vitest/node')
  const names = tests.map((path) => relative(folder, path).split(sep).join('/'))
  let vitest
  try {
    vitest = await startVitest('test', names, { root: folder, config: false, watch: false, include: ['tests/**/*.test.{ts,tsx,mts,js,mjs}'], reporters: ['default'] })
  } catch (error) {
    return say('tests', 'failed', `The test runner stopped: ${String(error.message)}`)
  }
  const failed = []
  let passed = 0
  const walk = (task, file) => {
    if (task.type === 'test') {
      if (task.result?.state === 'pass') passed += 1
      else if (task.result?.state === 'fail') failed.push(`${task.name} (${file}): ${String(task.result.errors?.[0]?.message ?? 'failed').split('\n')[0]}`)
    }
    for (const child of task.tasks ?? []) walk(child, file)
  }
  const files = vitest.state.getFiles()
  for (const file of files) {
    if (file.result?.state === 'fail' && (file.tasks ?? []).length === 0) failed.push(`${file.name}: ${String(file.result.errors?.[0]?.message ?? 'it did not load').split('\n')[0]}`)
    walk(file, file.name)
  }
  await vitest.close()
  const counted = `${String(files.length)} ${files.length === 1 ? 'file' : 'files'}, ${String(passed)} ${passed === 1 ? 'test' : 'tests'} passed`
  if (failed.length > 0) return say('tests', 'failed', `${counted}, and these failed: ${failed.join('; ')}`)
  if (passed === 0) return say('tests', 'failed', `${counted}: no test ran, and a check that ran nothing is not a check.`)
  say('tests', 'passed', `${counted}.`)
}

/** The build of each page into plugins/<id>/dist, then the size of what was built against the budget. */
async function theBuildAndItsSize(manifest) {
  if (manifest === null) {
    say('build', 'not run', 'The office does not accept the manifest, so nothing says which pages to build.')
    return say('size', 'not run', 'Nothing was built.')
  }
  // THE SAME BUILD AS A LANDING'S (tools/build-a-plugin.mjs): written beside the checkout first, and moved into
  // plugins/<id>/dist only when it finished.
  const result = await buildThePluginsPages({ root, folder, slugs: manifest.pages.map((page) => page.slug), pageFile: pluginPageFile, builtFolder: PLUGIN_BUILT_FOLDER })
  if (!result.built) {
    say('build', 'failed', result.says)
    return say('size', 'not run', 'Nothing was built.')
  }
  say('build', 'passed', result.says)
  const files = result.files
  const bytes = files.reduce((sum, path) => sum + statSync(path).size, 0)
  const budget = manifest.budget.builtKilobytes
  const size = `${(bytes / 1024).toFixed(1)} KB of ${String(budget)} KB`
  if (bytes > budget * 1024) say('size', 'failed', `The built files are ${size}, over the budget plugin.json gives.`)
  else say('size', 'passed', `The built files are ${size}.`)
}

// ============================================================================ the run

process.stdout.write(`check-a-plugin ${id}, in ${folder}\n`)
if (!existsSync(folder) || !statSync(folder).isDirectory()) {
  say('manifest', 'failed', `There is no folder ${PLUGINS_FOLDER}/${id} under ${root}, so there is no plugin to check.`)
  for (const step of STEPS.slice(1)) say(step, 'not run', `There is no folder ${PLUGINS_FOLDER}/${id}.`)
} else {
  const files = filesUnder(folder)
  const manifest = theManifestAndItsViews()
  theImports(files)
  theTypes(files)
  await theTests()
  await theBuildAndItsSize(manifest)
}

const steps = STEPS.map((step) => found.get(step) ?? { step, outcome: 'not run', says: 'This command did not reach it.' })
const passed = steps.every((one) => one.outcome === 'passed')
for (const one of steps) process.stdout.write(`  ${one.outcome.padEnd(8)} ${one.step.padEnd(9)} ${one.says}\n`)
process.stdout.write(passed ? `${id} passed every check.\n` : `${id} did not pass: ${steps.filter((one) => one.outcome !== 'passed').map((one) => one.step).join(', ')}.\n`)
if (json) process.stdout.write(`${JSON.stringify({ plugin: id, folder, passed, steps })}\n`)
process.exit(passed ? 0 : 1)
