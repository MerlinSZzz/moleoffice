// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTING LEFT UNDER ITS OLD NAME STOPS THE COMMAND INSTEAD OF BEING IGNORED.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FAILURE THIS CLOSES
 * ---------------------------------------------------------------------------------------------
 *
 * This product was called PanelX until 28 August 2026 and every one of its settings was spelled
 * `PANELX_…`. They are spelled `MOLE_OFFICE_…` now, and nothing reads the old spelling.
 *
 * The dangerous case is `MOLE_OFFICE_DB`, which decides where all of somebody's work is stored.
 * With the rename done and an operator's `.env` still saying `PANELX_DB=/…/real-corpus.db`, the
 * server would have read no setting at all, fallen back to its built-in `./data/panelx.db`, and
 * started — serving an empty database with nothing on screen to say that the file the operator
 * named had been ignored. Every write after that lands somewhere they will not look.
 *
 * That is the sixth rule of this repository broken in one line: a different method quietly
 * substituted for the requested one, reported as success.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A REFUSAL AND NOT AN ALIAS
 * ---------------------------------------------------------------------------------------------
 *
 * Reading both names would mean two names for one setting for as long as anybody could remember,
 * which is two sources of truth, and it would hide the day the second one stopped working. This
 * project is pre-release, nothing outside this machine sets these variables, and the whole set of
 * operators is one person. So the old names are dead, and being dead loudly is the point.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS CHECKED, AND HOW EACH PART WAS PROVED
 * ---------------------------------------------------------------------------------------------
 *
 * The last test runs a real command in a real child process, because the refusal is only worth
 * anything at the point a person actually starts something. It was proved by mutation: with the
 * `throw` in `loadPanelEnv` removed, `npx tsx scripts/backup.ts` with `PANELX_DB` set ran to
 * completion against the built-in default database and exited 0 — the exact failure above. With
 * the throw restored, the same command exits non-zero and prints `MOLE_OFFICE_DB`.
 *
 * WHEN THIS FILE CAN BE DELETED. When no machine this is started on still has a
 * `PANELX_` name in a shell profile or a `.env`. It is a transition aid with a stated end, not a
 * permanent part of the product.
 */

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { currentSettingName, staleSettingNames } from '../src/server/lib/env.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')

describe('which names are the dead ones', () => {
  it('picks out the old prefix and leaves everything else in the environment alone', () => {
    const names = ['PANELX_DB', 'MOLE_OFFICE_DB', 'PATH', 'HOME', 'PANELX_WEB_PORT', 'NODE_ENV']
    expect(staleSettingNames(names)).toEqual(['PANELX_DB', 'PANELX_WEB_PORT'])
  })

  it('leaves a name that merely contains the old prefix somewhere else', () => {
    // A variable belonging to something else entirely is not this product's to refuse.
    expect(staleSettingNames(['MY_PANELX_THING', 'WHAT_PANELX_MADE_OF_IT'])).toEqual([])
  })

  it('gives each dead name the name it should have now', () => {
    expect(currentSettingName('PANELX_DB')).toBe('MOLE_OFFICE_DB')
    expect(currentSettingName('PANELX_RESET_YES_DELETE_MY_DATA')).toBe('MOLE_OFFICE_RESET_YES_DELETE_MY_DATA')
  })
})


describe('a real command, started the way a person starts one', () => {
  let dir: string

  beforeEach(() => {
    dir = aTestDatabaseFolder('stale-setting')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses, names the new setting, and does not write a backup', () => {
    const run = spawnSync('npx', ['tsx', BACKUP_SCRIPT], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, PANELX_DB: join(dir, 'somebody-meant-this.db') },
      timeout: 120_000,
    })
    const said = `${run.stdout ?? ''}${run.stderr ?? ''}`

    expect(run.status, `the command exited 0 and said: ${said}`).not.toBe(0)
    expect(said).toContain('PANELX_DB -> MOLE_OFFICE_DB')
    // And it did NOT go on and use the built-in default, which is the whole failure.
    expect(said).not.toContain('backup written')
  })
})
