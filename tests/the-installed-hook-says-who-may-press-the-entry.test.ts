// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALLED HOOK SAYS WHO MAY PRESS "PUT THE ENTRY IN PLACE", IN WORDS THAT HOLD AT EITHER POSITION OF THE GATE.
 *
 * A session with no Mole Office skill is told about the press on the Settings page that links it. The session hook an
 * installed office carries said that only the person can press it. The press's own rule is
 * `onlyThePersonMayInstallTheEntry` in src/server/api/entry.ts: the person may press it; while the gate
 * who-changes-the-owners-settings is at block, so may a secretary whose grant carries the press; while it is off, so
 * may any agent its own key proves. The hook cannot read the gate, so its words must hold at both positions.
 *
 * WHAT IS REAL. The hook is built from for-agents/session-hook.mjs with the options scripts/bundle.mjs builds it with,
 * into a for-agents/ folder with a build stamp one folder up. That is what makes it read itself as installed
 * (`whereTheStampIs` in src/config/settings.mjs). It runs as its own process, with a home folder this test made and no
 * skill in it or in the folder the session starts in. Its address is port 0, where nothing answers, so it reaches no
 * office.
 *
 * MUTATION: put back the old words, "Only the person can press it, so ask them to.", in for-agents/session-hook.mjs.
 * The case goes red.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_FOR_AGENTS_FOLDER, THE_SESSION_HOOK, theBuildStampIn } from '../src/config/settings.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let scratch: string
let hook: string

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-installed-hook-'))
  const office = join(scratch, 'office')
  hook = join(office, THE_FOR_AGENTS_FOLDER, THE_SESSION_HOOK)
  await build({
    entryPoints: [join(REPO, THE_FOR_AGENTS_FOLDER, THE_SESSION_HOOK)],
    outfile: hook,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    tsconfig: join(REPO, 'tsconfig.json'),
    external: ['better-sqlite3', 'electron', '../../../tools/*'],
    banner: { js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);" },
    logLevel: 'warning',
  })
  const now = Date.now()
  writeFileSync(theBuildStampIn(office), JSON.stringify({ builtAt: new Date(now).toISOString(), builtAtMs: now }), 'utf8')
}, 60_000)

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Run the built hook's start, as Claude Code does, from a folder with no skill, and hand back what it printed. */
async function runTheInstalledHook(): Promise<string> {
  const home = join(scratch, 'home')
  const startedIn = join(scratch, 'a-project')
  mkdirSync(home, { recursive: true })
  mkdirSync(startedIn, { recursive: true })
  // Only these: no setting of this checkout's own shell reaches the hook, and port 0 cannot have an office listening.
  const env = { PATH: process.env['PATH'] ?? '', HOME: home, MOLE_OFFICE_API: 'http://127.0.0.1:0', [THE_TEST_MARK]: process.env[THE_TEST_MARK] ?? '' }
  const payload = JSON.stringify({ session_id: `test-${String(Date.now())}`, cwd: startedIn, hook_event_name: 'SessionStart' })
  return await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [hook, 'start'], { encoding: 'utf8', env, cwd: startedIn }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(payload)
  })
}

it('tells a session with no skill who may press the entry, true at either position of the gate', async () => {
  const printed = (await runTheInstalledHook()).replace(/\s+/g, ' ')
  expect(printed).toContain('YOU DO NOT HAVE THE MOLE OFFICE SKILL')
  expect(printed).toContain(
    'The press "Put the entry in place" on the Settings page links it at user level, for every directory. The person ' +
      "can press it. While the office's gate on who changes the person's settings is at block, so can a secretary " +
      "holding the person's grant, where the grant carries this press. While that gate is off, so can any agent with its " +
      'own key. Otherwise, ask the person to press it.',
  )
}, 60_000)
