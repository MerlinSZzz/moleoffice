// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY SCRIPT IN `tools/` AND IN `for-agents/` PARSES.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS FILE EXISTS FOR, AND IT IS NOT HYPOTHETICAL
 * ---------------------------------------------------------------------------------------
 *
 * `tools/session-hook.mjs` is what files a record for every session, and CLAUDE.md tells a cold
 * agent to look for the line it prints. On 16 August 2026 a straight apostrophe was written inside
 * a single-quoted string in it — `keep a person's own words` — and node has refused to parse the
 * file ever since. It was found on 20 August 2026, 105 commits later, by an agent that ran
 * `node --check` on it while editing it for another reason.
 *
 * NOTHING CAUGHT IT, and three things that look like they would did not:
 *
 *   - The type checker does not read `.mjs` files.
 *   - 7,201 tests do not import this one, because importing it RUNS it: it files a record and
 *     talks to a server.
 *   - The hook itself is written to fail quietly, so a session where it never ran looks exactly
 *     like a session where Mole Office was down — which is the failure it was built to end.
 *
 * So the check is the cheapest one that would have caught it: ask node whether each file parses.
 * `--check` compiles and does not execute, which is the whole reason it can be used on a script
 * that starts servers and writes records.
 *
 * Since 2 November 2026 the hook's code is in `for-agents/session-hook.mjs`, because an installed office
 * carries that folder and not `tools/`. `tools/session-hook.mjs` is one line that imports it, so a checkout's
 * three hook lines still name the file they always named. So `for-agents/` is checked here too, and the
 * hook's words are read where they are written.
 *
 * This is not a test of what the scripts DO. It is the floor under them.
 */

import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const TOOLS = fileURLToPath(new URL('../tools', import.meta.url))
const FOR_AGENTS = fileURLToPath(new URL('../for-agents', import.meta.url))

/** Every script a person or a hook runs directly, in tools/ and tools/stable/. Read from the directories, never listed here. */
const scripts = [...readdirSync(TOOLS), ...readdirSync(join(TOOLS, 'stable')).map((name) => `stable/${name}`)]
  .filter((name) => name.endsWith('.mjs'))
  .sort()

/** Every script in for-agents/, where the hook's own code is. Read from the directory too. */
const agentsScripts = readdirSync(FOR_AGENTS)
  .filter((name) => name.endsWith('.mjs'))
  .sort()

describe('every script in tools/ parses', () => {

  it('finds the scripts by reading the directory, so a new one is covered the day it lands', () => {
    expect(scripts.length, 'tools/ holds no .mjs files, which means this check is looking in the wrong place').toBeGreaterThan(
      3,
    )
    expect(scripts, 'the hook that files every session').toContain('session-hook.mjs')
    // MUTATION: a syntax error in tools/stable/upgrade-stable.mjs.
    expect(scripts, 'the stable upgrade, which a person runs from tools/stable/').toContain('stable/upgrade-stable.mjs')
    expect(agentsScripts, "the hook's own code, which an installed office carries").toContain('session-hook.mjs')
  })

  for (const name of scripts) {
    it(`${name} compiles`, async () => {
      // `node --check` parses and does NOT run. A script that starts a server is safe to check.
      await expect(run(process.execPath, ['--check', join(TOOLS, name)])).resolves.toBeDefined()
    })
  }
})

describe('every script in for-agents/ parses', () => {
  for (const name of agentsScripts) {
    it(`for-agents/${name} compiles`, async () => {
      await expect(run(process.execPath, ['--check', join(FOR_AGENTS, name)])).resolves.toBeDefined()
    })
  }
})
