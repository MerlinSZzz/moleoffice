// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const root = new URL('..', import.meta.url)
const folders = theFoldersThisFileMakes()
afterEach(() => { folders.removeEveryOne() })

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, HOME: cwd, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (result.status !== 0 || result.error) throw new Error('Synthetic launcher fixture Git failed.')
  return result.stdout.trim()
}

function fixture() {
  const folder = folders.make('launcher')
  const controller = join(folder, 'controller'), target = join(folder, 'development')
  for (const path of [controller, target]) {
    mkdirSync(join(path, 'tools'), { recursive: true })
    writeFileSync(join(path, 'tools/serve-dev.mjs'), '// Synthetic launcher bytes; this fixture does not start a service.\n')
    git(path, 'init', '-b', 'main'); git(path, 'config', 'user.name', 'Synthetic launcher fixture'); git(path, 'config', 'user.email', 'fixture@example.invalid')
  }
  // The loaded module must choose this copied controller, regardless of cwd or
  // caller Git variables. No production launcher is edited by these fixtures.
  for (const name of ['stable/stable-bootstrap-launcher.mjs', 'stable/stable-bootstrap-support.mjs', 'database-holders.mjs', 'stable/stable-service-settings.mjs', 'read-only-git-config.mjs', 'independent-storage.mjs', 'stable/stable-bootstrap-words.mjs']) {
    const source = new URL(`tools/${name}`, root)
    if (existsSync(source)) cpSync(source, join(controller, 'tools', name))
  }
  // The launcher module finds the main settings through the controller's own
  // settings loader, so that loader's import closure is copied beside it.
  copyBootstrapSettings(controller)
  for (const path of [controller, target]) { git(path, 'add', '.'); git(path, 'commit', '-m', 'Synthetic launcher identity') }
  return { folder, controller, target, config: { developmentRepository: target, targetCommit: git(target, 'rev-parse', 'HEAD') } }
}

describe('the exact reviewed bootstrap launcher', () => {
  it('refuses a different target launcher blob before any preparation mutation', async () => {
    const f = fixture()
    const implementation = pathToFileURL(join(f.controller, 'tools/stable/stable-bootstrap-launcher.mjs')).href
    const { verifyBootstrapLauncher } = await import(/* @vite-ignore */ implementation)
    expect(verifyBootstrapLauncher(f.config).controller).toBe(f.controller)
    writeFileSync(join(f.target, 'tools/serve-dev.mjs'), '// Synthetic incompatible older launcher.\n')
    git(f.target, 'add', '.'); git(f.target, 'commit', '-m', 'Synthetic incompatible launcher')
    f.config.targetCommit = git(f.target, 'rev-parse', 'HEAD')
    expect(() => verifyBootstrapLauncher(f.config)).toThrow(/launcher.*differ|different.*launcher|review/i)
  })

  it('refuses its dirty shipped controller despite caller Git variables naming a clean repository', async () => {
    const f = fixture()
    const implementation = pathToFileURL(join(f.controller, 'tools/stable/stable-bootstrap-launcher.mjs')).href
    const { verifyBootstrapLauncher } = await import(/* @vite-ignore */ implementation)
    const oldGitDir = process.env.GIT_DIR, oldWorkTree = process.env.GIT_WORK_TREE
    process.env.GIT_DIR = join(f.target, '.git'); process.env.GIT_WORK_TREE = f.target
    try {
      expect(verifyBootstrapLauncher(f.config).controller).toBe(f.controller)
      writeFileSync(join(f.controller, 'tools/serve-dev.mjs'), '// Synthetic uncommitted launcher change.\n')
      expect(() => verifyBootstrapLauncher(f.config)).toThrow(/dirty|clean/i)
    } finally {
      if (oldGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = oldGitDir
      if (oldWorkTree === undefined) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = oldWorkTree
    }
  })
})
