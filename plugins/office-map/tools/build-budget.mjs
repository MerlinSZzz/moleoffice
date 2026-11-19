// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The single encoded build criterion. No browser or host implementation imports. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const BUILD_BUDGET_FILE = new URL('../build-budget.json', import.meta.url)
const MANIFEST_FILE = new URL('../plugin.json', import.meta.url)

function configuration(source) {
  const value = JSON.parse(source)
  // JSON.parse silently accepts repeated keys. A flat config has one declaration per key.
  const tokens = source.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? []
  const seen = new Set()
  let depth = 0
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === '{' || token === '[') depth++
    else if (token === '}' || token === ']') depth--
    else if (depth === 1 && token.startsWith('"') && tokens[index + 1] === ':') {
      const key = JSON.parse(token)
      if (seen.has(key)) throw Error(`Duplicate build budget key: ${key}`)
      seen.add(key)
    }
  }
  const keys = ['version', 'initialBytes', 'lazyActionBytes', 'initialRules', 'lazyActionRules']
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join() || value.version !== 1) throw Error('Invalid build budget configuration')
  for (const key of ['initialBytes', 'lazyActionBytes']) if (!Number.isSafeInteger(value[key]) || value[key] <= 0) throw Error(`Invalid build budget ${key}`)
  for (const key of ['initialRules', 'lazyActionRules']) {
    const rules = value[key]
    if (!Array.isArray(rules) || !rules.length || new Set(rules).size !== rules.length || rules.some(rule => typeof rule !== 'string' || !rule.startsWith('^') || !rule.endsWith('$'))) throw Error(`Invalid build budget ${key}`)
    rules.forEach(rule => new RegExp(rule))
  }
  return value
}

/** Both consumers use this reader; the strict host manifest carries only a derived sum. */
export function readBuildBudget(configFile = BUILD_BUDGET_FILE, manifestFile = MANIFEST_FILE) {
  const budget = configuration(readFileSync(configFile, 'utf8'))
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const combinedBytes = budget.initialBytes + budget.lazyActionBytes
  if (!Number.isSafeInteger(combinedBytes) || combinedBytes % 1024 || manifest.budget?.builtKilobytes !== combinedBytes / 1024) throw Error('Manifest compatibility envelope must equal the configured split sum / 1024')
  return budget
}

/** Fail closed: every emitted regular file belongs to exactly one explicit group. */
export function validateBuiltBudget(folder, budget = readBuildBudget()) {
  const groups = [
    { name: 'initial', limit: budget.initialBytes, rules: budget.initialRules.map(rule => new RegExp(rule)) },
    { name: 'lazyAction', limit: budget.lazyActionBytes, rules: budget.lazyActionRules.map(rule => new RegExp(rule)) },
  ]
  const files = []
  function visit(at, prefix = '') {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name, absolute = join(at, entry.name)
      if (entry.isDirectory()) visit(absolute, path + '/')
      else {
        if (!entry.isFile()) throw Error(`Built entry is not a regular file: ${path}`)
        const memberships = groups.filter(group => group.rules.some(rule => rule.test(path)))
        if (memberships.length !== 1) throw Error(`Built file must belong to exactly one group: ${path} (${memberships.length ? 'both' : 'neither'})`)
        const bytes = readFileSync(absolute)
        files.push({ path, group: memberships[0].name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  visit(folder)
  if (!files.length) throw Error('The built artifact directory is empty')
  const totals = Object.fromEntries(groups.map(group => [group.name, files.filter(file => file.group === group.name).reduce((sum, file) => sum + file.bytes, 0)]))
  for (const group of groups) if (totals[group.name] > group.limit) throw Error(`${group.name} built bytes ${totals[group.name]} exceed configured cap ${group.limit}`)
  return { limits: { initialBytes: budget.initialBytes, lazyActionBytes: budget.lazyActionBytes }, totals: { initialBytes: totals.initial, lazyActionBytes: totals.lazyAction, builtBytes: totals.initial + totals.lazyAction }, files }
}
