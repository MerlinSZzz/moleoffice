// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Shared Node-only build tooling.
import { readBuildBudget, validateBuiltBudget } from '../tools/build-budget.mjs'

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(plugin, '../..')
const config = JSON.parse(readFileSync(join(plugin, 'build-budget.json'), 'utf8'))
const scratch = process.env.OFFICE_MAP_BUILD_PROOF_DIR ?? join(tmpdir(), 'office-map-build-budget')
mkdirSync(scratch, { recursive: true })

function fixture() {
  const folder = mkdtempSync(join(scratch, 'artifacts-'))
  const local = join(folder, 'plugins/office-map'), built = join(local, 'dist')
  mkdirSync(join(local, 'tools'), { recursive: true })
  mkdirSync(join(built, 'assets'), { recursive: true })
  mkdirSync(join(folder, 'tools'))
  for (const file of ['tools/build.mjs', 'tools/build-budget.mjs', 'build-budget.json', 'plugin.json', 'package.json']) cpSync(join(plugin, file), join(local, file))
  const budget = { ...structuredClone(config), initialBytes: 1024, lazyActionBytes: 2048 }
  const manifest = JSON.parse(readFileSync(join(local, 'plugin.json'), 'utf8'))
  function save() {
    writeFileSync(join(local, 'build-budget.json'), JSON.stringify(budget))
    manifest.budget.builtKilobytes = (budget.initialBytes + budget.lazyActionBytes) / 1024
    writeFileSync(join(local, 'plugin.json'), JSON.stringify(manifest))
  }
  save()
  // A controlled successful builder leaves the supplied artifacts in place. The real path is tested below.
  writeFileSync(join(folder, 'tools/build-a-plugin.mjs'), 'process.stdout.write("fixture builder completed\\n")\n')
  function put(path: string, bytes: number) { writeFileSync(join(built, path), Buffer.alloc(bytes)) }
  function cli(build = false) {
    return spawnSync(process.execPath, [join(local, 'tools/build.mjs'), ...(build ? [] : ['--check-only', built])], { cwd: folder, encoding: 'utf8', timeout: 120_000 })
  }
  function api() { return validateBuiltBudget(built, readBuildBudget(join(local, 'build-budget.json'), join(local, 'plugin.json'))) }
  return { folder, local, built, budget, manifest, save, put, cli, api }
}

function withFixture(run: (world: ReturnType<typeof fixture>) => void) {
  const world = fixture()
  try { run(world) } finally { rmSync(world.folder, { recursive: true, force: true }) }
}

function refused(world: ReturnType<typeof fixture>, reason: RegExp) {
  expect(() => world.api()).toThrow(reason)
  for (const build of [false, true]) {
    const answer = world.cli(build)
    expect(answer.error).toBeUndefined()
    expect(answer.status).toBe(1)
    expect(answer.stderr).toMatch(reason)
  }
}

describe('one split build criterion', () => {
  it('uses the shared config and the checked npm build entry', () => {
    expect(readBuildBudget()).toEqual(config)
    const manifest = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'))
    expect(manifest.budget.builtKilobytes * 1024).toBe(config.initialBytes + config.lazyActionBytes)
    expect(JSON.parse(readFileSync(join(plugin, 'package.json'), 'utf8')).scripts.build).toBe('node tools/build.mjs')
  })

  it('counts exact cap boundaries once through the API and both build CLI paths', () => withFixture(world => {
    world.put('main.html', world.budget.initialBytes)
    world.put('assets/tuft-actions-fixture0.js', world.budget.lazyActionBytes - 7)
    for (const pose of ['r1', 'c1', 'p2', 'seated', 'p1', 'c2', 'c4']) world.put(`assets/tuft-action-${pose}-fixture0.png`, 1)
    const expected = world.api()
    expect(expected.totals).toEqual({ initialBytes: world.budget.initialBytes, lazyActionBytes: world.budget.lazyActionBytes, builtBytes: world.budget.initialBytes + world.budget.lazyActionBytes })
    expect(expected.files).toHaveLength(9)
    for (const build of [false, true]) {
      const answer = world.cli(build)
      expect(answer.error).toBeUndefined()
      expect(answer.status, answer.stderr).toBe(0)
      expect(JSON.parse(answer.stdout.trim().split('\n').at(-1)!)).toEqual(expected)
    }
  }))

  it('charges every known initial emitted family and permits no action pack', () => withFixture(world => {
    const names = ['assets/bed-fixture0.png', 'assets/tuft-sleep-fixture0.png', 'main.html', 'assets/main-fixture0.js', 'assets/main-fixture0.css', 'assets/assets-fixture0.js', 'assets/look-assets-fixture0.js', 'assets/geometry.worker-fixture0.js', ...Array.from({ length: 6 }, (_, i) => `assets/village-${i}-fixture0.png`)]
    names.forEach(name => world.put(name, 1))
    expect(world.api().totals).toEqual({ initialBytes: names.length, lazyActionBytes: 0, builtBytes: names.length })
  }))

  it('rejects initial overflow even when aggregate bytes fit', () => withFixture(world => {
    world.put('main.html', world.budget.initialBytes + 1)
    refused(world, /initial built bytes .* exceed configured cap/)
  }))

  it('rejects aggregate lazy overflow across files even when combined bytes fit', () => withFixture(world => {
    world.put('main.html', 1)
    world.put('assets/tuft-actions-fixture0.js', world.budget.lazyActionBytes)
    world.put('assets/tuft-action-r1-fixture0.png', 1)
    refused(world, /lazyAction built bytes .* exceed configured cap/)
  }))

  it('rejects every unclassified emitted byte including unknown JS and other identities', () => withFixture(world => {
    for (const name of ['unknown.txt', 'assets/surprise-fixture0.js', 'assets/bun-actions-fixture0.js', 'assets/tuft-action-unknown-fixture0.png']) {
      world.put(name, 1)
      refused(world, /exactly one group: .* \(neither\)/)
      rmSync(join(world.built, name))
    }
  }))

  it('rejects a built file belonging to both groups', () => withFixture(world => {
    world.budget.lazyActionRules.push('^main\\.html$')
    world.save()
    world.put('main.html', 1)
    refused(world, /exactly one group: main.html \(both\)/)
  }))

  it('rejects empty artifacts and symbolic links', () => withFixture(world => {
    refused(world, /artifact directory is empty/)
    world.put('main.html', 1)
    symlinkSync('main.html', join(world.built, 'alias.html'))
    refused(world, /not a regular file: alias.html/)
  }))

  it('refuses a second config declaration and a drifting derived manifest', () => withFixture(world => {
    world.put('main.html', 1)
    writeFileSync(join(world.local, 'build-budget.json'), JSON.stringify(world.budget).replace('{', '{"initialBytes":7,'))
    refused(world, /Duplicate build budget key: initialBytes/)
    world.save()
    world.manifest.budget.builtKilobytes++
    writeFileSync(join(world.local, 'plugin.json'), JSON.stringify(world.manifest))
    refused(world, /compatibility envelope/)
  }))

  it('reads changes to both caps from the sole config instead of copied policy numbers', () => withFixture(world => {
    // Different ratios with the same envelope catch a hardcoded individual cap in either consumer.
    world.budget.initialBytes = 2048
    world.budget.lazyActionBytes = 1024
    world.save()
    world.put('main.html', world.budget.initialBytes)
    world.put('assets/tuft-actions-fixture0.js', world.budget.lazyActionBytes)
    expect(world.api().totals.builtBytes).toBe(world.budget.initialBytes + world.budget.lazyActionBytes)
    expect(world.cli(true).status).toBe(0)
    world.put('assets/tuft-actions-fixture0.js', world.budget.lazyActionBytes + 1)
    refused(world, /lazyAction built bytes .* exceed configured cap/)
    world.put('assets/tuft-actions-fixture0.js', 0)
    world.put('main.html', world.budget.initialBytes + 1)
    refused(world, /initial built bytes .* exceed configured cap/)
  }))

  it('builds current production inputs freshly and validates every actual emitted artifact', () => {
    const folder = mkdtempSync(join(scratch, 'production-'))
    const local = join(folder, 'plugins/office-map')
    try {
      mkdirSync(join(local, 'tools'), { recursive: true })
      mkdirSync(join(folder, 'tools'))
      mkdirSync(join(folder, 'src/shared'), { recursive: true })
      for (const name of ['src', 'assets', 'main.html', 'plugin.json', 'package.json', 'build-budget.json']) cpSync(join(plugin, name), join(local, name), { recursive: true })
      for (const name of ['build.mjs', 'build-budget.mjs']) cpSync(join(plugin, 'tools', name), join(local, 'tools', name))
      symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'), 'dir')
      // A symlink does not satisfy the generic command's direct-entry argv/import.meta guard.
      // Forward unchanged arguments to its real path; this file is external fixture data only.
      writeFileSync(join(folder, 'tools/build-a-plugin.mjs'), `import { spawnSync } from 'node:child_process'
const result = spawnSync(process.execPath, [${JSON.stringify(join(root, 'tools/build-a-plugin.mjs'))}, ...process.argv.slice(2)], { cwd: process.cwd(), stdio: 'inherit', timeout: 120_000 })
if (result.error) throw result.error
if (result.signal) process.kill(process.pid, result.signal)
else process.exit(result.status ?? 1)
`)
      symlinkSync(join(root, 'src/shared/plugin-read.ts'), join(folder, 'src/shared/plugin-read.ts'))
      const answer = spawnSync(process.execPath, [join(local, 'tools/build.mjs')], { cwd: folder, encoding: 'utf8', timeout: 120_000 })
      writeFileSync(join(folder, 'build.stdout.log'), answer.stdout)
      writeFileSync(join(folder, 'build.stderr.log'), answer.stderr)
      expect(answer.error).toBeUndefined()
      expect(answer.status, answer.stdout + answer.stderr).toBe(0)
      const actual = validateBuiltBudget(join(local, 'dist'))
      expect(JSON.parse(answer.stdout.trim().split('\n').at(-1)!)).toEqual(actual)
      expect(actual.files.some((file: { path: string }) => file.path === 'main.html')).toBe(true)
      expect(actual.files.every((file: { group: string }) => ['initial', 'lazyAction'].includes(file.group))).toBe(true)
      expect(actual.totals.builtBytes).toBe(actual.totals.initialBytes + actual.totals.lazyActionBytes)
      writeFileSync(join(folder, 'budget-result.json'), JSON.stringify(actual, null, 2) + '\n')
    } finally {
      // Explicit proof output preserves the fresh build and receipts; routine test scratch is disposable.
      if (!process.env.OFFICE_MAP_BUILD_PROOF_DIR) rmSync(folder, { recursive: true, force: true })
    }
  }, 120_000)
})
