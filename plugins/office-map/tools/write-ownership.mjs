#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Rebuild the plugin's complete local file/import inventory without importing any host code. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'rolldown/utils'

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(plugin, '../..')
const published = resolve(root, 'src/shared/plugin-read.ts')
const walk = at => readdirSync(at, { withFileTypes: true }).filter(e => !e.name.startsWith('.') && !['dist', 'node_modules'].includes(e.name)).flatMap(e => e.isDirectory() ? walk(join(at, e.name)) : [join(at, e.name)])
const code = /\.(?:[cm]?[jt]sx?)$/
function imports(path) {
  const text = readFileSync(path, 'utf8'), found = []
  if (extname(path) === '.html') return [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => ({ name: m[1], line: text.slice(0, m.index).split('\n').length }))
  if (extname(path) === '.py') return [...text.matchAll(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm)].map(m => ({ name: m[1] ?? m[2], line: text.slice(0, m.index).split('\n').length }))
  if (!code.test(path)) return []
  const parsed = parseSync(path, text)
  if (parsed.errors.length) throw new Error(`Cannot parse ${relative(plugin, path)}`)
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const source = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression', 'TSImportType'].includes(node.type) ? node.source : null
    if (source) {
      const name = source.value ?? (source.type === 'TemplateLiteral' && !source.expressions.length ? source.quasis[0].value.cooked : null)
      // A dynamic import with a computed path has no name a static inventory can follow. That is
      // not an unresolved relative import: the path is built at run time and is outside this file.
      if (name === null) {
        if (node.type === 'ImportExpression') return
        throw new Error(`Unresolved import in ${relative(plugin, path)}`)
      }
      found.push({ name, line: text.slice(0, node.start).split('\n').length })
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'parent' && typeof value === 'object') visit(value)
  }
  visit(parsed.program)
  return found
}
const output = join(plugin, 'OWNERSHIP.md')
// Include this document in its own inventory on the first run too.
const files = [...new Set([...walk(plugin), output])].sort()
const rows = files.map(path => ({ path: relative(plugin, path).split(sep).join('/'), imports: path === output ? [] : imports(path) }))
for (const row of rows) for (const one of row.imports) {
  if (!one.name.startsWith('.') && !one.name.startsWith('/')) continue
  const target = resolve(plugin, dirname(row.path), one.name.split('?')[0])
  if (!target.startsWith(plugin + sep) && target !== published) throw new Error(`Forbidden import: ${row.path}:${one.line} ${one.name}`)
}
let hostCodeFiles = 0, incoming = []
for (const path of walk(join(root, 'src')).filter(p => code.test(p))) {
  hostCodeFiles++
  for (const one of imports(path)) if (one.name.includes('plugins/office-map') || one.name.startsWith('.') && resolve(dirname(path), one.name).startsWith(plugin + sep)) incoming.push({ file: relative(root, path), ...one })
}
if (incoming.length) throw new Error(`Host imports this plugin: ${JSON.stringify(incoming)}`)
const role = path => path.startsWith('src/') ? 'Plugin runtime' : path.startsWith('assets/') ? 'Plugin art' : path.startsWith('tests/') ? 'Plugin synthetic checks' : path.startsWith('tools/') ? 'Plugin development tools' : 'Plugin package and documentation'
const body = [
  '# Ownership and imports', '',
  'The office map package owns every file below. Runtime code, words, geometry, selected art and synthetic tests live in this folder. The generic slot owns installation, isolation, authorization, the declared read views and the host switch.', '',
  'The only imported host file is `src/shared/plugin-read.ts`, the published import-free `office-read/1` declaration. Runtime package imports are `zod`; build and test packages are supplied by the slot toolchain. Node tools also use built-in modules, Playwright and the toolchain parser. Python art tools use the standard library and Pillow. No host implementation is bundled.', '',
  'Package scripts launch the generic host check/build and test guard in `../../tools/`; those are development commands, not plugin module imports. `main.html` is the only declared page. `src/pack.ts` loads `src/assets.ts` lazily; that registry selects six village atlases. The earlier PNG portraits and scenery, and their provenance note, were removed in round 9e because nothing imported, emitted or tested them. Generated `dist/`, dependency folders and test scratch files are excluded from this source inventory.', '',
  `The host source scan examined ${hostCodeFiles} code files under \`src/\` and found zero imports of this plugin. Rebuild this inventory with \`node plugins/office-map/tools/write-ownership.mjs\`. The slot checker independently checks the allowed import boundary.`, '',
  '| File | Responsibility | Imports or HTML references (line) |', '| --- | --- | --- |',
  ...rows.map(row => `| \`${row.path}\` | ${role(row.path)} | ${row.imports.length ? row.imports.map(one => `\`${one.name}\` (${one.line})`).join(', ') : 'None'} |`), '',
  'Asset catalogue source names and hashes are data, not imports. The measurement world uses only generated in-memory views and built plugin files; no office database, server URL, key or external corpus is accepted.', '',
].join('\n')
writeFileSync(output, body)
console.log(JSON.stringify({ files: rows.length, hostCodeFiles, hostImports: incoming.length, output: relative(root, output) }))
