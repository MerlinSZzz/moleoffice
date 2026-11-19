// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
let root: string
let dev: string
let stable: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stable-office-settings-'))
  dev = join(root, 'development')
  stable = join(root, 'stable')
  mkdirSync(dev)
  mkdirSync(join(stable, 'src'), { recursive: true })
  cpSync(join(SOURCE, 'src/config'), join(stable, 'src/config'), { recursive: true })
  // The settings loader imports modules outside src/config too; its whole import closure is copied, not a list by hand.
  copyBootstrapSettings(stable)
  cpSync(join(SOURCE, 'package.json'), join(stable, 'package.json'))
  const git = spawnSync('git', ['init', '--quiet', dev], { encoding: 'utf8' })
  expect(git.status, git.stderr).toBe(0)
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function probe(value: string | null = dev, expression = '({dev:s.THE_DEVELOPMENT_CHECKOUT, env:s.ENV_FILE, data:s.DATA_ROOT, repo:s.REPO_ROOT, resolved:s.settings(), canonical:s.canonicalDatabasePath()})', module = join(stable, 'src/config/settings.mjs')) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_')) delete env[key]
  if (value !== null) env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT = value
  const code = `try { const s = await import(${JSON.stringify(pathToFileURL(module).href)}); console.log(JSON.stringify(${expression})) } catch(e) { console.error(e.message); process.exitCode=1 }`
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], { env, encoding: 'utf8', timeout: 15_000 })
}

function refused(value: string, words: string, module?: string) {
  const read = probe(value, undefined, module)
  expect(read.status, read.stdout + read.stderr).toBe(1)
  expect(read.stderr).toContain('MOLE_OFFICE_DEVELOPMENT_CHECKOUT')
  expect(read.stderr).toContain(value)
  expect(read.stderr).toContain(words)
}

describe('the environment alone pairs a stable checkout with development', () => {
  it('refuses a relative path at load', () => refused('relative/development', 'absolute'))
  it('refuses an empty value at load', () => refused('', 'absolute'))
  it('refuses a missing path at load', () => refused(join(root, 'missing'), 'exist'))
  it('refuses a file at load', () => {
    const file = join(root, 'file'); writeFileSync(file, 'file')
    refused(file, 'folder')
  })
  it('refuses a folder without a git entry at load', () => {
    const folder = join(root, 'plain'); mkdirSync(folder)
    refused(folder, '.git')
  })
  it('refuses this checkout by its real path at load', () => {
    mkdirSync(join(stable, '.git'))
    const alias = join(root, 'alias'); symlinkSync(stable, alias)
    refused(alias, 'this checkout')
  })
  it('refuses a bundle at load', () => {
    const bundle = join(root, 'bundle')
    cpSync(join(SOURCE, 'src/config'), bundle, { recursive: true })
    // The bundle's settings loader reads its shared modules from ../shared, so the closure's src/shared goes there.
    const closure = join(root, 'closure')
    copyBootstrapSettings(closure)
    cpSync(join(closure, 'src/shared'), join(root, 'shared'), { recursive: true })
    writeFileSync(join(bundle, 'build-stamp.json'), JSON.stringify({ builtAt: '2026-10-01 12:00:00', builtAtMs: 1790856000000, version: '0.0.0' }))
    refused(dev, 'bundle', join(bundle, 'settings.mjs'))
  })
  it('refuses the development setting in the development env file at load', () => {
    writeFileSync(join(dev, '.env'), `MOLE_OFFICE_DEVELOPMENT_CHECKOUT=${dev}\n`)
    refused(dev, '.env')
  })
  it('refuses a stable-local env file at load', () => {
    writeFileSync(join(stable, '.env'), 'MOLE_OFFICE_PORT=41321\n')
    refused(dev, '.env')
  })
  it('refuses a dangling stable-local env link at load', () => {
    symlinkSync(join(root, 'absent-env'), join(stable, '.env'))
    refused(dev, '.env')
  })
  it('reads the exact dev file and resolves its relative database against dev', () => {
    writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=41322\nMOLE_OFFICE_DB=private/office.sqlite\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
    const alias = join(root, 'dev-alias'); symlinkSync(dev, alias)
    const read = probe(`${alias}/`)
    expect(read.status, read.stderr).toBe(0)
    const out = JSON.parse(read.stdout)
    expect(out.dev).toBe(dev)
    expect(out.env).toBe(join(dev, '.env'))
    expect(out.data).toBe(`${dev}/`)
    expect(out.repo).toBe(`${stable}/`)
    expect(out.resolved.apiPort).toBe(41322)
    expect(out.resolved.databasePath).toBe(join(dev, 'private/office.sqlite'))
    expect(out.canonical).toBe(join(dev, 'private/office.sqlite'))
  })
  it('refuses pairing when only the main worktree settings name stable', () => {
    const main = join(root, 'main'); mkdirSync(join(main, '.git/worktrees/dev'), { recursive: true })
    writeFileSync(join(main, '.env'), `MOLE_OFFICE_PORT=41323\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
    rmSync(join(dev, '.env'))
    rmSync(join(dev, '.git'), { recursive: true })
    writeFileSync(join(dev, '.git'), `gitdir: ${join(main, '.git/worktrees/dev')}\n`)
    writeFileSync(join(main, '.git/worktrees/dev/commondir'), '../..\n')
    const read = probe()
    expect(read.status, read.stderr).toBe(1)
    expect(read.stderr).toContain('names no stable checkout in MOLE_OFFICE_STABLE_CHECKOUT')
    expect(read.stdout).toBe('')
  })
  it('keeps the checkout roots when no environment setting is present', () => {
    const read = probe(null)
    expect(read.status, read.stderr).toBe(0)
    const out = JSON.parse(read.stdout)
    expect(out.dev).toBeNull()
    expect(out.data).toBe(`${stable}/`)
    expect(out.env).toBe(join(stable, '.env'))
  })
  it('keeps built-in code paths and moves explicit relative paths with the env file', () => {
    writeFileSync(join(dev, '.env'), `MOLE_OFFICE_SEED_CORPUS=fixtures/seed.json\nMOLE_OFFICE_VITE_CACHE=cache/vite\nMOLE_OFFICE_PLUGINS=extra/plugins\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
    const read = probe(dev, '({explicit:s.settings(),defaults:s.settingsFrom({})})')
    expect(read.status, read.stderr).toBe(0)
    const out = JSON.parse(read.stdout)
    expect(out.explicit.seedCorpus).toBe(join(dev, 'fixtures/seed.json'))
    expect(out.explicit.viteCacheDir).toBe(join(dev, 'cache/vite'))
    expect(out.defaults.seedCorpus.startsWith(`${stable}/`)).toBe(true)
    expect(out.defaults.viteCacheDir).toBe(join(stable, '.cache/vite'))
  })
  it('declares both settings without adding either to the env template', () => {
    const read = probe(dev, "['MOLE_OFFICE_DEVELOPMENT_CHECKOUT','MOLE_OFFICE_STABLE_CHECKOUT'].map(n=>s.settingNamed(n))")
    expect(read.status, read.stderr).toBe(0)
    for (const setting of JSON.parse(read.stdout)) {
      expect(setting.kind).toBe('path')
      expect(setting.fallback).toBeNull()
      expect(setting.inTemplate).toBe(false)
      expect(setting.what.length).toBeGreaterThan(15)
    }
  })
})
