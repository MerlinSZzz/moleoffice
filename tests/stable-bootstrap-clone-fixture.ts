// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Copy the named modules and their local imports, the settings module's by default; no office or database is copied. */
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const source = resolve(import.meta.dirname, '..')
export function copyBootstrapSettings(target: string, modules = ['src/config/settings.mjs']) {
  const copied = new Set<string>()
  function copy(file: string) {
    if (copied.has(file)) return
    copied.add(file)
    const destination = join(target, relative(source, file))
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(file, destination)
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
      copy(resolve(dirname(file), match[1]!))
    }
  }
  for (const entry of modules) copy(join(source, entry))
}
