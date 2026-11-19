#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CARRY THE REGISTRY LIST FILES ONTO A NEWER MAIN.
 *
 * Wave 13v round 10 split two registries into list files: the operation names of src/shared/ops.ts into
 * src/shared/ops-list.ts, and the route groups of src/server/index.ts into src/server/routes-list.ts. Until that
 * split is on main, main keeps adding entries in the old shape, and each carry of the branch has to move them.
 *
 * This tool does that move by converting main's whole old-shape files, not by patching in single entries, so every
 * entry main added, moved or reworded comes across in main's order with main's comments. It reads two files from a
 * git revision in the old shape and writes the four files of the split commit's shape into the working tree:
 *
 *   node tools/carry-registry-lists.mjs <revision>
 *   node tools/carry-registry-lists.mjs <revision> --check <split commit>
 *
 * Use it while a rebase is stopped on the split commit: `node tools/carry-registry-lists.mjs origin/main`, then
 * `git add` the four files and `git rebase --continue`. With --check it writes nothing: it converts <revision> and
 * compares the result with the four files at <split commit>, byte for byte, and exits 1 on any difference. Run it
 * with the split commit's own parent as <revision> to prove the conversion is the split.
 *
 * It refuses, and writes nothing, when either file is not in the old shape it knows: an operation line it cannot
 * read, or a line between the route registrations that is not a registration, a comment or a blank line.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const OPS = 'src/shared/ops.ts'
const OPS_LIST = 'src/shared/ops-list.ts'
const INDEX = 'src/server/index.ts'
const ROUTES_LIST = 'src/server/routes-list.ts'

function fail(message) {
  process.stderr.write(`carry-registry-lists: ${message}\n`)
  process.exit(2)
}

function show(revision, path) {
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return fail(`git show ${revision}:${path} failed.`)
  }
}

function onlyOne(lines, test, what) {
  const found = lines.flatMap((line, i) => (test(line) ? [i] : []))
  if (found.length !== 1) fail(`expected exactly one ${what}, found ${found.length}.`)
  return found[0]
}

function listFile(constant, names) {
  return `export const ${constant} = [\n${names.map((n) => `  '${n}',\n`).join('')}] as const\n`
}

function convertOps(old) {
  const lines = old.split('\n')
  const open = onlyOne(lines, (l) => l === 'export const OPERATIONS = [', 'line opening OPERATIONS')
  const close = onlyOne(lines, (l) => l === '] as const satisfies readonly Operation[]', 'line closing OPERATIONS')
  if (close < open) fail('OPERATIONS closes before it opens.')
  const typeLine = onlyOne(lines, (l) => l === "export type OperationName = (typeof OPERATIONS)[number]['name']", 'OperationName line')
  const header = onlyOne(lines, (l) => l === ' * NOTHING HERE OPENS A DATABASE, and nothing here imports anything. src/server/api/kinds.ts reads', 'header line on imports')
  const names = []
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === header) out.push(' * NOTHING HERE OPENS A DATABASE. The sole import holds operation names and no executable logic. src/server/api/kinds.ts reads')
    else if (i === open) out.push('const OPERATION_METADATA = {')
    else if (i === close) {
      out.push("} as const satisfies Record<OperationName, Omit<Operation, 'name'>>", '')
      out.push('/** Names come from the plain list; effects and gate metadata stay in code. */')
      out.push('export const OPERATIONS = OPERATION_NAMES.map((name) => ({ name, ...OPERATION_METADATA[name] }))')
    } else if (i === typeLine) out.push('export type OperationName = (typeof OPERATION_NAMES)[number]')
    else if (i > open && i < close) {
      if (line.trim() === '' || /^ *\/\//.test(line)) {
        out.push(line)
        continue
      }
      const entry = /^ {2}\{ name: '([a-zA-Z0-9._-]+)', (.+) \},$/.exec(line)
      if (entry === null) fail(`${OPS}:${i + 1} is not an operation line this tool can read: ${line}`)
      if (names.includes(entry[1])) fail(`operation ${entry[1]} is declared twice.`)
      names.push(entry[1])
      out.push(`  '${entry[1]}': { ${entry[2]} },`)
    } else out.push(line)
  }
  return { ops: `import { OPERATION_NAMES } from './ops-list.ts'\n\n${out.join('\n')}`, list: listFile('OPERATION_NAMES', names) }
}

function convertIndex(old) {
  const lines = old.split('\n')
  const first = onlyOne(lines, (l) => l.startsWith('  await app.register(discoveryRoutes, {'), 'discoveryRoutes registration')
  const last = onlyOne(lines, (l) => l === "  await app.register(entryRoutes, { prefix: '/api' })", 'entryRoutes registration')
  if (last < first) fail('entryRoutes is registered before discoveryRoutes.')
  let start = first
  while (start > 0 && /^ *\/\//.test(lines[start - 1])) start--
  const names = []
  const out = []
  let open = null
  for (let i = start; i <= last; i++) {
    const line = lines[i]
    if (open !== null) {
      if (line === '  })') {
        out.push('    }),')
        open = null
      } else out.push(line === '' ? '' : `  ${line}`)
      continue
    }
    if (line.trim() === '') {
      out.push('')
      continue
    }
    if (/^ {2}\/\//.test(line)) {
      out.push(`  ${line}`)
      continue
    }
    const one = /^ {2}await app\.register\(([a-zA-Z0-9]+Routes), (\{ prefix: '\/api' \})\)$/.exec(line)
    const many = /^ {2}await app\.register\(([a-zA-Z0-9]+Routes), \{$/.exec(line)
    const name = (one ?? many)?.[1]
    if (name === undefined) fail(`${INDEX}:${i + 1} lies between the route registrations and is not one: ${line}`)
    if (names.includes(name)) fail(`route group ${name} is registered twice.`)
    names.push(name)
    if (one !== null) out.push(`    ${name}: () => app.register(${name}, ${one[2]}),`)
    else {
      out.push(`    ${name}: () => app.register(${name}, {`)
      open = name
    }
  }
  if (open !== null) fail(`the registration of ${open} never closes.`)
  const firstImport = lines.findIndex((l) => l.startsWith('import '))
  if (firstImport < 0 || firstImport > start) fail('no import line above the route registrations.')
  const result = [
    ...lines.slice(0, firstImport),
    "import { ROUTE_GROUPS } from './routes-list.ts'",
    ...lines.slice(firstImport, start),
    '  const routeRegistrations = {',
    ...out,
    '  }',
    '  for (const name of ROUTE_GROUPS) await routeRegistrations[name]()',
    ...(lines[last + 1] === '' ? [] : ['']),
    ...lines.slice(last + 1),
  ]
  return { index: result.join('\n'), list: listFile('ROUTE_GROUPS', names) }
}

const [revision, flag, splitCommit] = process.argv.slice(2)
if (revision === undefined || (flag !== undefined && (flag !== '--check' || splitCommit === undefined))) {
  fail('usage: node tools/carry-registry-lists.mjs <revision> [--check <split commit>]')
}
const ops = convertOps(show(revision, OPS))
const index = convertIndex(show(revision, INDEX))
const files = { [OPS]: ops.ops, [OPS_LIST]: ops.list, [INDEX]: index.index, [ROUTES_LIST]: index.list }
if (flag === '--check') {
  const differ = Object.keys(files).filter((path) => show(splitCommit, path) !== files[path])
  for (const path of differ) process.stdout.write(`differs from ${splitCommit}: ${path}\n`)
  if (differ.length > 0) process.exit(1)
  process.stdout.write(`The conversion of ${revision} equals ${splitCommit} in all four files.\n`)
} else {
  for (const [path, text] of Object.entries(files)) writeFileSync(path, text)
  process.stdout.write(`Wrote ${Object.keys(files).join(', ')} from ${revision}: ${ops.list.split('\n').length - 3} operations, ${index.list.split('\n').length - 3} route groups.\n`)
}
