// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Build through the generic command, then enforce the plugin's authoritative split. */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readBuildBudget, validateBuiltBudget } from './build-budget.mjs'

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(plugin, '../..')

export function buildOfficeMap(checkOnly = null) {
  const budget = readBuildBudget()
  if (checkOnly === null) {
    // Spawn the development command; never import host implementation into the plugin.
    const built = spawnSync(process.execPath, [join(root, 'tools/build-a-plugin.mjs'), 'office-map', '--root', root, '--json'], { cwd: root, stdio: 'inherit', timeout: 120_000 })
    if (built.error) throw built.error
    if (built.status !== 0) throw Error(`Generic plugin build failed (${built.status ?? built.signal})`)
  }
  return validateBuiltBudget(checkOnly ?? join(plugin, 'dist'), budget)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args.length !== 2 || args[0] !== '--check-only')) throw Error('Use no arguments to build, or --check-only <built-directory>')
    process.stdout.write(JSON.stringify(buildOfficeMap(args.length ? resolve(args[1]) : null)) + '\n')
  } catch (error) {
    process.stderr.write(`office-map build budget: ${error.message}\n`)
    process.exitCode = 1
  }
}
