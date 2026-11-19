// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALLER WRITES THE `office` PROFILE AND TOUCHES NO PROFILE IN USE.
 *
 * The dsh office profile is the worker profile plus the `dsh-hooks-claude-code` bridge, mounted from
 * `tools/dsh-hooks/hooks.json` in this checkout. This file runs the installer against a
 * SCRATCH `DSH_HOME` — never the real one — and reads the tree it wrote, because the profiles in use are running
 * other workers right now.
 *
 * It also reads `hooks.json` itself: the events, the empty PostToolUse matcher, the thirty-second
 * timeout, and commands that name the scripts through `${CLAUDE_PLUGIN_ROOT}` so that every
 * worktree uses the one copy in the checkout the installer names. Since 22 September 2026 the
 * events include PreToolUse, which runs the main-world guard.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   drop the bash-sandbox patch from `theCordisPatch` → the timeout case is red.
 *   write `projectDir` into the bridge config → the "projectDir stays unset" case is red.
 *   omit the bridge insert → the "mounts the bridge" case is red.
 *   write into `profiles/worker` → the "profiles in use are not written" case is red.
 *   replace `${CLAUDE_PLUGIN_ROOT}` with a relative path in hooks.json → the command case is red.
 *   change a hook's timeout to 10 → the timeout case is red.
 *   omit the office tool's insert (problem jgTM-z-63Vls) → the office tool case is red.
 *   write the manifest without its version → the plugin manifest case is red.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const INSTALLER = join(REPO, 'tools', 'dsh-hooks', 'install-profile.mjs')
const HOOKS_JSON = join(REPO, 'tools', 'dsh-hooks', 'hooks.json')

const WORKER_BYTES = '{\n  "name": "dsh-profile-worker",\n  "note": "this file must not move"\n}\n'
const HEADLESS_BYTES = '# the headless profile must not move\n[]\n'

const made: string[] = []

/** A scratch DSH_HOME holding a worker and a headless profile, and the shared farm when asked. */
function scratchHome(withFarm: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-dsh-office-profile-'))
  made.push(dir)
  mkdirSync(join(dir, 'profiles', 'worker'), { recursive: true })
  mkdirSync(join(dir, 'profiles', 'headless'), { recursive: true })
  writeFileSync(join(dir, 'profiles', 'worker', 'package.json'), WORKER_BYTES)
  writeFileSync(join(dir, 'profiles', 'headless', 'cordis.patch.yml'), HEADLESS_BYTES)
  if (withFarm) {
    mkdirSync(join(dir, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-hooks-claude-code'), { recursive: true })
  }
  return dir
}

/** Run the installer against one scratch DSH_HOME, as the secretary runs it. */
function install(home: string): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [INSTALLER], {
    cwd: REPO,
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    timeout: 30_000,
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

const read = (path: string): string => readFileSync(path, 'utf8')

interface InHooksJson {
  hooks: Record<string, { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[]>
}

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the installer writes the office profile', () => {
  it('writes the worker shape plus the bridge, and names the files it wrote', () => {
    const home = scratchHome(true)
    const ran = install(home)
    expect(ran.status, ran.stderr).toBe(0)

    const profile = join(home, 'profiles', 'office')
    const manifest = JSON.parse(read(join(profile, 'package.json'))) as {
      name: string
      dsh: { profile: { bundles: string[]; patchReload: string } }
    }
    expect(manifest.name).toBe('dsh-profile-office')
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    expect(manifest.dsh.profile.patchReload).toBe('startup')

    const patch = read(join(profile, 'cordis.patch.yml'))
    expect(patch, 'the sandbox timeout patch is gone').toContain('id: bash-sandbox')
    expect(patch).toContain('timeoutMs: 1800000')
    expect(patch, 'the bridge is not mounted').toContain("name: '@deepseek-ai/dsh-hooks-claude-code'")
    expect(patch, 'the bridge is not pointed at this checkout hooks.json').toContain(
      `configPath: ${JSON.stringify(join(REPO, 'tools', 'dsh-hooks', 'hooks.json'))}`,
    )
    expect(patch, 'pluginRoot is not this checkout').toContain(`pluginRoot: ${JSON.stringify(REPO)}`)
    expect(patch, 'projectDir must stay unset so the session workspace is the project').not.toMatch(/^\s*projectDir\s*:/m)

    expect(ran.stdout).toContain(join(profile, 'package.json'))
    expect(ran.stdout).toContain(join(profile, 'cordis.patch.yml'))
    expect(ran.stdout, 'the package is in the shared farm and no command should be printed').toContain(
      'there is no command to run',
    )
  })

  it("writes the plugin that loads the office's own tool from this checkout, and names it in the patch", () => {
    // PROBLEM jgTM-z-63Vls: dsh keeps the run's key out of every command, so a worker asks the office through the tool
    // in tools/dsh-hooks/office-tool.mjs, which runs inside dsh. The plugin hands it dsh's own defineTool.
    const home = scratchHome(true)
    const ran = install(home)
    expect(ran.status, ran.stderr).toBe(0)
    const profile = join(home, 'profiles', 'office')
    const plugin = read(join(profile, 'office-tool.mjs'))
    expect(plugin).toContain("import { defineTool } from '@deepseek-ai/dsh-tools'")
    expect(plugin).toContain(
      `import { officeToolPlugin } from ${JSON.stringify(pathToFileURL(join(REPO, 'tools', 'dsh-hooks', 'office-tool.mjs')).href)}`,
    )
    expect(plugin).toContain("export const inject = ['tools']")
    expect(read(join(profile, 'cordis.patch.yml')), "the office's own tool is not in the profile").toMatch(
      /- insert:\n\s+- id: office-request\n\s+name: '\.\/office-tool\.mjs'/,
    )
    expect(ran.stdout).toContain(join(profile, 'office-tool.mjs'))
  })

  it("gives the office tool's plugin a manifest with a name and a version, as dsh's plugin inventory asks", () => {
    // WITH EVERY REQUEST dsh sends DeepSeek the identity of each active plugin package
    // (@deepseek-ai/dsh-plugin-package-inventory-deepseek). For a plugin named by a relative path it takes the nearest
    // package.json, and refuses the request unless that declares a non-empty name and version. The first trial
    // worker, on 28 September 2026, failed so before any model call (REQUEST_EXTENSION).
    const home = scratchHome(true)
    const ran = install(home)
    expect(ran.status, ran.stderr).toBe(0)
    const profile = join(home, 'profiles', 'office')
    // THE NEAREST package.json ABOVE THE PLUGIN, found as dsh finds it: the profile's own.
    let dir = dirname(join(profile, 'office-tool.mjs'))
    while (!existsSync(join(dir, 'package.json')) && dir !== dirname(dir)) dir = dirname(dir)
    expect(dir).toBe(profile)
    const manifest = JSON.parse(read(join(dir, 'package.json'))) as { name?: unknown; version?: unknown }
    expect(typeof manifest.name === 'string' && manifest.name !== '', 'the manifest has no name').toBe(true)
    expect(typeof manifest.version === 'string' && manifest.version !== '', 'the manifest has no version, so dsh refuses every request').toBe(true)
  })

  it('runs again without changing a byte, so updating is safe', () => {
    const home = scratchHome(true)
    expect(install(home).status).toBe(0)
    const first = read(join(home, 'profiles', 'office', 'package.json')) + read(join(home, 'profiles', 'office', 'cordis.patch.yml'))
    expect(install(home).status).toBe(0)
    const second = read(join(home, 'profiles', 'office', 'package.json')) + read(join(home, 'profiles', 'office', 'cordis.patch.yml'))
    expect(second).toBe(first)
  })

  it('never writes the worker or headless profile', () => {
    const home = scratchHome(true)
    const installed = install(home)
    expect(installed.status, installed.stderr).toBe(0)
    expect(read(join(home, 'profiles', 'worker', 'package.json')), 'the worker profile moved').toBe(WORKER_BYTES)
    expect(read(join(home, 'profiles', 'headless', 'cordis.patch.yml')), 'the headless profile moved').toBe(
      HEADLESS_BYTES,
    )
    expect(installed.stdout).toContain('worker and headless profiles were not read')
  })

  it('prints the one command that installs the bridge when the shared farm does not hold it', () => {
    const home = scratchHome(false)
    const ran = install(home)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('dsh plugin --profile office add @deepseek-ai/dsh-hooks-claude-code')
  })
})

describe('hooks.json is the shape the bridge reads', () => {
  it('names SessionStart, an empty-matcher PreToolUse and PostToolUse, and Stop, each with a checkout command and 30 seconds', () => {
    const config = JSON.parse(read(HOOKS_JSON)) as InHooksJson
    expect(Object.keys(config.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop'])
    expect(config.hooks['PreToolUse']?.[0]?.matcher).toBe('')
    expect(config.hooks['PreToolUse']?.[0]?.hooks[0]?.command).toBe(
      'node ${CLAUDE_PLUGIN_ROOT}/tools/guard/main-world-guard.mjs',
    )
    expect(config.hooks['SessionStart']?.[0]?.hooks[0]?.command).toBe(
      'node ${CLAUDE_PLUGIN_ROOT}/tools/dsh-hooks/session-start.mjs',
    )
    expect(config.hooks['PostToolUse']?.[0]?.matcher).toBe('')
    expect(config.hooks['PostToolUse']?.[0]?.hooks[0]?.command).toBe(
      'node ${CLAUDE_PLUGIN_ROOT}/tools/dsh-hooks/post-tool-use.mjs',
    )
    expect(config.hooks['Stop']?.[0]?.hooks[0]?.command).toBe(
      'node ${CLAUDE_PLUGIN_ROOT}/tools/dsh-hooks/stop.mjs',
    )
    for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']) {
      expect(config.hooks[event]?.[0]?.hooks[0]?.type, `${event} is not a command`).toBe('command')
      expect(config.hooks[event]?.[0]?.hooks[0]?.timeout, `${event} has the wrong timeout`).toBe(30)
    }
  })
})
