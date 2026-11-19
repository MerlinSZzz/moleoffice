#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CREATE OR UPDATE THE `office` dsh PROFILE, WITHOUT TOUCHING THE PROFILES IN USE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS WRITES
 * ---------------------------------------------------------------------------------------
 *
 * `$DSH_HOME/profiles/office/` holds the same shape as the `worker` profile — bundles
 * `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless`, `patchReload: startup`, and the
 * bash-sandbox timeout patch — plus the `@deepseek-ai/dsh-hooks-claude-code` bridge, mounted with
 * its `configPath` at this checkout's `tools/dsh-hooks/hooks.json`.
 *
 * THE MAIN-WORLD GUARD COMES WITH THE BRIDGE. `hooks.json` names `tools/guard/main-world-guard.mjs`
 * as a PreToolUse hook, so every dsh run on this profile has the guard
 * mounted, and nothing here needs writing again for it: the bridge reads `hooks.json` when dsh
 * starts. `node tools/guard/main-world-guard.mjs --mounted dsh` says whether it is mounted.
 *
 * AND THE OFFICE'S OWN TOOL, office_request (problem jgTM-z-63Vls, 28 September 2026). dsh keeps MOLE_AGENT_KEY out of
 * every command it runs, so a worker's curl could not write to the office. The tool runs inside the dsh process and asks
 * the office for the model with the run's key (tools/dsh-hooks/office-tool.mjs). This writes a small plugin into the
 * profile, office-tool.mjs, which takes dsh's own defineTool from the profile's packages and hands it to the tool in
 * the requested checkout. The launcher passes the sandbox's own repo; a direct invocation uses this checkout.
 *
 * THE ONLY DIFFERENCES FROM THE WORKER PROFILE ARE THE LAST THREE THINGS, and they are deliberate:
 * the office profile runs the bridge, and the worker profile does not. A worker is started with
 * `run-worker.sh --profile worker`, which must keep behaving exactly as it does today, so this
 * writes `office` and reads neither `worker` nor `headless`.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE COMMANDS' ABSOLUTE PATHS COME FROM, AND WHY NOT projectDir
 * ---------------------------------------------------------------------------------------
 *
 * The bridge runs each hook command in the SESSION's workspace — the worktree — so a command that
 * named the script relatively would look for it in the worktree. There is one copy of the scripts,
 * in the checkout this installer lives in. `projectDir` sets the hook's own working directory and
 * substitutes `${CLAUDE_PROJECT_DIR}`, so pointing it at the checkout would run every hook in the
 * checkout and change what a hook's `.logs/` scratch file means. Instead this sets `pluginRoot` to
 * the checkout, and `hooks.json` names each script as `${CLAUDE_PLUGIN_ROOT}/tools/dsh-hooks/…`.
 * The bridge substitutes the checkout's absolute path at config parse time, so every worktree uses
 * the one copy in the checkout, and `projectDir` stays unset so the session workspace is the
 * project.
 *
 * ---------------------------------------------------------------------------------------
 * THE PACKAGE ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * The bridge is a plugin, not a bundle, so it is named in an insert entry rather than in
 * `dsh.profile.bundles`. A profile resolves a plugin from its own `node_modules`, then up the
 * directory tree, and the dsh installation makes `$DSH_HOME/profiles/node_modules` as a shared
 * farm of every package the CLI depends on — `@deepseek-ai/dsh-hooks-claude-code` among them. So a
 * profile under `profiles/` resolves it with no per-profile dependency and this writes
 * `dependencies: {}`. Where that farm does not hold the package, this prints the one command that
 * puts it in the profile and changes nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------------------
 *
 *     DSH_HOME=$HOME/.cache/mole-office/dsh/home node tools/dsh-hooks/install-profile.mjs
 *
 * `DSH_HOME` defaults to `~/.cache/mole-office/dsh/home`. Run it with a scratch
 * `DSH_HOME` first if you only want to see the tree it makes.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { theDshHooksCarryTheGuard } from '../../src/config/main-world-guard.mjs'
import { THE_OFFICE_PROFILES_OWN_CONFIG } from '../../src/config/the-launchers-own-settings.mjs'

/** The checkout this installer lives in, with no trailing slash. */
const CHECKOUT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/+$/, '')

/** Where the dsh profile tree lives. The runner exports this, so the default is only for a person. */
const DSH_HOME = process.env['DSH_HOME'] ?? join(homedir(), '.cache', 'mole-office', 'dsh', 'home')

/** The profile this writes, and the ones it must never touch. */
const PROFILES_IN_USE = ['worker', 'headless']

/** The bridge package, and where a profile finds it when no per-profile dependency is installed. */
const BRIDGE = '@deepseek-ai/dsh-hooks-claude-code'

/** The office's own tool, in this checkout, and the plugin this writes into the profile to load it. */
const OFFICE_TOOL_PLUGIN = 'office-tool.mjs'

/**
 * THE PLUGIN THAT LOADS THE OFFICE'S OWN TOOL. It lives in the profile so that dsh's own packages resolve from it, and it
 * imports the tool from the requested checkout. The sandbox profile always names its own repo.
 */
function theOfficeToolPlugin(OFFICE_TOOL) {
  return [
    "// THE OFFICE'S OWN TOOL, office_request (problem jgTM-z-63Vls), loaded into the office profile.",
    '// Written by Mole Office\'s tools/dsh-hooks/install-profile.mjs; a second run writes it again. The tool itself is',
    `// ${OFFICE_TOOL}, which this profile loads. This file only hands it dsh's own defineTool.`,
    "import { defineTool } from '@deepseek-ai/dsh-tools'",
    `import { officeToolPlugin } from ${JSON.stringify(pathToFileURL(OFFICE_TOOL).href)}`,
    '',
    "export const name = 'mole-office-office-request'",
    "export const inject = ['tools']",
    '',
    'export function apply(ctx) {',
    '  officeToolPlugin(ctx, { defineTool })',
    '}',
    '',
  ].join('\n')
}

/**
 * The profile manifest. The same shape as the worker profile's, with this profile's own name, and a version.
 *
 * THE VERSION IS NEEDED ONCE THE PROFILE HOLDS A PLUGIN OF ITS OWN (28 September 2026). With every request, dsh sends
 * DeepSeek the identity of each active plugin package (@deepseek-ai/dsh-plugin-package-inventory-deepseek). For a plugin
 * named by a relative path, as ./office-tool.mjs is, that package is the nearest package.json, which is this file, and
 * it must declare a non-empty name and version, or dsh refuses the request before the model is called
 * (REQUEST_EXTENSION, "DeepSeek request extension preparation failed"). The first trial worker failed exactly so.
 */
function thePackageJson() {
  return `${JSON.stringify(
    {
      name: 'dsh-profile-office',
      version: '0.0.0',
      private: true,
      dependencies: {},
      dsh: {
        profile: {
          bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
          patchReload: 'startup',
        },
      },
    },
    null,
    2,
  )}\n`
}

/**
 * The patch layer: the worker profile's one patch, then the bridge.
 *
 * The bridge's own `timeout` lives in `hooks.json` (30 seconds a hook), so nothing here restates
 * it. `projectDir` is deliberately absent; see the header.
 */
function theCordisPatch(CHECKOUT, HOOKS_JSON) {
  return [
    '# Your patch layer for this dsh profile, applied after every bundle layer:',
    '# a top-level YAML array of loader patch entries (id-targeted config',
    '# overrides, disables, and insert lists; `!!js` expressions allowed).',
    '#',
    "# Mole Office's office profile, written by tools/dsh-hooks/install-profile.mjs.",
    '# It is the worker profile plus the Claude Code hooks bridge: the shell timeout a single test',
    '# file needs at nice 19, and the hooks that carry messages to a dsh run.',
    '- id: bash-sandbox',
    '  config:',
    `    timeoutMs: ${THE_OFFICE_PROFILES_OWN_CONFIG['bash-sandbox'].timeoutMs}`,
    '',
    '# THE BRIDGE. `configPath` is this checkout\'s hooks.json; `pluginRoot` is this checkout, so',
    '# hooks.json can name the scripts as ${CLAUDE_PLUGIN_ROOT}/tools/dsh-hooks/... and every',
    '# worktree uses the one copy in this checkout. `projectDir` is deliberately unset: the bridge',
    '# then runs each hook in the session workspace, which is the project.',
    '- insert:',
    '    - id: hooks-claude-code',
    `      name: '${BRIDGE}'`,
    '      config:',
    `        configPath: ${JSON.stringify(HOOKS_JSON)}`,
    `        pluginRoot: ${JSON.stringify(CHECKOUT)}`,
    '',
    "# THE OFFICE'S OWN TOOL, office_request (problem jgTM-z-63Vls): a worker asks the office through it, since dsh keeps",
    '# the run\'s key out of every command. The plugin beside this file loads it from the checkout.',
    '- insert:',
    '    - id: office-request',
    `      name: './${OFFICE_TOOL_PLUGIN}'`,
    '',
  ].join('\n')
}

export function installOfficeProfile(home = DSH_HOME, checkout = CHECKOUT) {
  const PROFILE_DIR = join(home, 'profiles/office')
  const HOOKS_JSON = join(checkout, 'tools/dsh-hooks/hooks.json')
  const OFFICE_TOOL = join(checkout, 'tools/dsh-hooks/office-tool.mjs')
  const SHARED_FARM = join(home, 'profiles/node_modules/@deepseek-ai/dsh-hooks-claude-code')
  if (PROFILES_IN_USE.includes('office')) {
    // Unreachable, and kept so that the one line that would touch a profile in use cannot be
    // written by accident if this profile is ever renamed.
    process.stderr.write('dsh-hooks installer: the office profile may not be a profile in use.\n')
    process.exit(2)
  }

  mkdirSync(PROFILE_DIR, { recursive: true })

  const packageFile = join(PROFILE_DIR, 'package.json')
  const patchFile = join(PROFILE_DIR, 'cordis.patch.yml')
  const pluginFile = join(PROFILE_DIR, OFFICE_TOOL_PLUGIN)
  writeFileSync(packageFile, thePackageJson())
  writeFileSync(patchFile, theCordisPatch(checkout, HOOKS_JSON))
  writeFileSync(pluginFile, theOfficeToolPlugin(OFFICE_TOOL))

  const shared = existsSync(SHARED_FARM)
  const lines = [
    `Wrote ${packageFile}`,
    `Wrote ${patchFile}`,
    `Wrote ${pluginFile}, which loads the office's own tool, office_request, from ${OFFICE_TOOL}.`,
    `The profile bundles @deepseek-ai/dsh-base and @deepseek-ai/dsh-headless, keeps the bash-sandbox ` +
      `timeout at ${THE_OFFICE_PROFILES_OWN_CONFIG['bash-sandbox'].timeoutMs} ms, and mounts the hooks bridge at ` +
      `${HOOKS_JSON} with pluginRoot ${checkout} and no projectDir.`,
    `The main-world guard: ${theDshHooksCarryTheGuard(HOOKS_JSON).because}`,
    `The ${PROFILES_IN_USE.join(' and ')} profiles were not read and were not written.`,
    shared
      ? `The bridge ${BRIDGE} resolves from the shared farm at ${SHARED_FARM}, so the profile needs no ` +
        'dependency of its own and there is no command to run.'
      : `The bridge ${BRIDGE} is not at ${SHARED_FARM}, so run this once after this installer: ` +
        `dsh plugin --profile office add ${BRIDGE}`,
  ]
  return lines
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(`${installOfficeProfile().join('\n')}\n`)
}
