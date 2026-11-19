// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH WORLD'S WORKER IS TOLD WHICH PROJECT IT SERVES, EXPLICITLY, AND SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, IN THE SANDBOX V1 SMOKE TEST
 * ---------------------------------------------------------------------------------------
 *
 * INTEGRATION.md (sandbox v1 handback), section 7, issue 2, and section 5 step 1: a world started
 * from a fresh, migrated database — `start <name> --from <db> --with-message-worker` — holds only
 * the "default" project's rows. Nothing in `tools/isolated-mole-office.mjs` set
 * `MOLE_OFFICE_WORKSPACE` for the spawned world, so the child inherited whatever the shell that ran
 * the tool happened to carry. The first smoke-test attempt carried nothing, its message worker fell
 * back to WORKSPACE_FALLBACK ("panelx", `src/config/settings.mjs`), and it watched a project the
 * fresh copy has no rows for — indistinguishable, from the outside, from a worker with nothing to
 * do. The second attempt only worked because the operator remembered to export
 * `MOLE_OFFICE_WORKSPACE=default` first; nothing in the tool would have caught the mistake either
 * way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · `environmentForTheWorld` sets `MOLE_OFFICE_WORKSPACE` to the resolved `workspace` value
 *     EXPLICITLY, overriding whatever the base environment it was built from happened to carry —
 *     the fresh-database bug was exactly the case where the base carries the wrong project and
 *     nothing overrides it;
 *   · `readArguments` no longer refuses `--workspace` without `--show-to-the-person` — a throwaway
 *     world started for a delivery test needs to say which project its worker serves as much as one
 *     shown to the person does — while `--run` and `--api` still require it, unchanged;
 *   · `start`'s own output names the project, in the exact words `sentenceAboutTheWorldsProject`
 *     returns, for both a world with a message worker and one without.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, EACH WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `environmentForTheWorld`, take out the `MOLE_OFFICE_WORKSPACE: workspace,` line → the
 *      "overrides the base" case goes red, because the returned environment falls back to whatever
 *      the base carried (here, "panelx", standing in for the live checkout's `.env` default) instead
 *      of the "default" the fresh world actually needs.
 *   2. In `readArguments`, put `workspace` back into the `!showToThePerson && (...)` refusal → the
 *      "no longer refused" case goes red, because a throwaway world with `--workspace` would again
 *      answer `.bad`.
 *   3. In `sentenceAboutTheWorldsProject`, drop the project name from the sentence → both output
 *      cases go red.
 */

import { describe, expect, it } from 'vitest'
import {
  environmentForTheWorld,
  readArguments,
  sentenceAboutTheWorldsProject,
} from '../tools/isolated-mole-office.mjs'

describe('environmentForTheWorld sets the world\'s own project explicitly', () => {
  it('overrides whatever the base environment carries for MOLE_OFFICE_WORKSPACE', () => {
    // `base` stands in for `...process.env` in the tool's own shell: it carries "panelx", exactly
    // the fallback a checkout's .env names when nobody has set MOLE_OFFICE_WORKSPACE (WORKSPACE_FALLBACK,
    // src/config/settings.mjs) — the value that silently won in the first smoke-test attempt.
    const env = environmentForTheWorld({
      base: { MOLE_OFFICE_WORKSPACE: 'panelx', PATH: '/usr/bin' },
      db: '/tmp/copy.db',
      apiPort: 40001,
      webPort: 40002,
      withMessageWorker: true,
      authority: { startedBy: null, secretaries: [] },
      purpose: null,
      handback: null,
      otherHost: null,
      place: '/tmp/place',
      workspace: 'default',
    })

    expect(env.MOLE_OFFICE_WORKSPACE, 'the fresh world\'s own project was overridden by the base').toBe('default')
    // The rest of the base environment still comes through untouched.
    expect(env.PATH).toBe('/usr/bin')
    expect(env.MOLE_OFFICE_DB).toBe('/tmp/copy.db')
  })

  it('carries whatever workspace it is given, not a fixed word', () => {
    const env = environmentForTheWorld({
      base: {},
      db: '/tmp/copy.db',
      apiPort: 1,
      webPort: 2,
      withMessageWorker: false,
      authority: { startedBy: null, secretaries: [] },
      purpose: null,
      handback: null,
      otherHost: null,
      place: '/tmp/place',
      workspace: 'a-named-project',
    })
    expect(env.MOLE_OFFICE_WORKSPACE).toBe('a-named-project')
  })
})

describe('readArguments no longer ties --workspace to --show-to-the-person', () => {
  it('accepts --workspace on a throwaway world (no --show-to-the-person)', () => {
    const args = readArguments(['start', 'cw-fresh', '--with-message-worker', '--workspace', 'default'])
    expect(args.bad, JSON.stringify(args)).toBeUndefined()
    expect(args.showToThePerson).toBe(false)
    expect(args.workspace).toBe('default')
    expect(args.withMessageWorker).toBe(true)
  })

  it('still refuses --run on a throwaway world, unchanged', () => {
    const args = readArguments(['start', 'cw-fresh', '--run', 'some-session'])
    expect(args.bad, 'a --run without --show-to-the-person should still be refused').toBeTypeOf('string')
    expect(args.bad).toContain('only written down with')
  })

  it('still refuses --api on a throwaway world, unchanged', () => {
    const args = readArguments(['start', 'cw-fresh', '--api', 'http://127.0.0.1:9'])
    expect(args.bad, 'a --api without --show-to-the-person should still be refused').toBeTypeOf('string')
    expect(args.bad).toContain('only written down with')
  })

  it('still accepts --run and --api together with --show-to-the-person', () => {
    const args = readArguments([
      'start', 'cw-fresh', '--show-to-the-person', '--run', 'some-session', '--api', 'http://127.0.0.1:9',
      '--workspace', 'default',
    ])
    expect(args.bad, JSON.stringify(args)).toBeUndefined()
    expect(args.run).toBe('some-session')
    expect(args.api).toBe('http://127.0.0.1:9')
    expect(args.workspace).toBe('default')
  })
})

/**
 * FOUND WHILE WRITING THIS FILE, NOT ONE OF THE TWO ASSIGNED ISSUES: `readArguments` answers
 * `{ bad: '…' }` for every flag with a missing value except `--handback`, which answered the bare
 * string itself. At the call site, `args.bad !== undefined` reads `undefined` off a string and is
 * always false, so a missing `--handback` value fell through to printing USAGE and exiting 0 rather
 * than the refusal. TypeScript's inference of this file's exports (`allowJs`, no `checkJs`) only
 * disagreed with a caller once one existed in a `.ts` file, which is how `npm run build` caught it
 * for this handback.
 */
describe('readArguments always answers an object, even for --handback', () => {
  it('answers { bad } for a missing --handback value, like every other flag', () => {
    const args = readArguments(['start', 'cw-fresh', '--handback'])
    expect(args, 'the whole answer must not be the bare error string').toBeTypeOf('object')
    expect(args.bad, JSON.stringify(args)).toContain('needs')
  })
})

describe('start says which project the world serves', () => {
  it('names the project and the worker when one was started', () => {
    const said = sentenceAboutTheWorldsProject('default', true)
    expect(said).toContain('the project "default"')
    expect(said).toContain('message worker is watching only that project')
  })

  it('names just the project when no worker was started', () => {
    const said = sentenceAboutTheWorldsProject('panelx', false)
    expect(said).toContain('the project "panelx"')
    expect(said).not.toContain('message worker')
  })
})
