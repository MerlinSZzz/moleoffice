// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH START WITHOUT ITS CHECK IS REFUSED IN WORDS, AND EVERY LAUNCHER PATH HANDS THE CHECK IN.
 *
 * Wave 13t round W2. The start values of a run's tool moved from tools/sandbox-common.mjs into
 * src/config/sandbox-start-values.mjs, so the worker an installed office ships can load them without
 * tools/. One check stayed in tools/: whether DSH can take the selected model, and whether the effort
 * is a plain word (theDshSelection). The code in src/config takes that check as
 * `checkTheDshSelection`, and tools/sandbox-common.mjs hands it in.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. Through src/config alone, a DSH start that would hand DSH a model and an effort is refused in
 *    words, and so is the same start after asking the office. Nothing silently skips the check.
 * 2. Through tools/sandbox-common.mjs, the same start goes ahead, and a model DSH cannot take is
 *    refused with the check's own sentence. So the launcher's DSH starts are checked as before.
 * 3. A check that is handed in is called with the model and the effort, through an env prefix too.
 * 4. A start that needs no check is not refused: a shell-wrapped DSH command and a Codex command
 *    give the same answer through src/config as through tools/.
 *
 * Proofs: node tools/run-named-tests.mjs tests/a-dsh-start-without-its-check-is-refused.test.ts
 *
 * RED BEFORE: with the two files as the move left them, where src/config imported the check from tools/,
 * cases 1 and 2 were red. The control was green, 4 of 4. Each mutation below was made alone and put back,
 * and the restore was green, 4 of 4:
 *   - src/config/sandbox-start-values.mjs calls a missing check instead of refusing: red, case 1;
 *   - tools/sandbox-common.mjs hands no check in: red, case 3;
 *   - the env prefix does not pass the check on: red, case 2;
 *   - the start after asking the office does not pass the check on: red, case 3.
 *
 * THE VALUES ARE READ, NOT WRITTEN OUT AGAIN. The models come from the model data (LAUNCHER_MODEL_COMPATIBILITY in
 * src/config/model-efforts.mjs) and from the Codex models a supervisor may choose (src/shared/worker-runs.ts). The
 * check's sentence is read by asking the check. The words a shell-wrapped DSH start says are not written here: case 4
 * holds what that start does, that it hands DSH no model and no effort and says so in words. With the shell-wrapped
 * start keeping the requested model, case 4 was red.
 */

import { describe, expect, it } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import {
  A_DSH_START_NEEDS_ITS_CHECK,
  aCommandsStartFromTheOffice as theOfficeStartFromSrc,
  aCommandsStartValues as theStartValuesFromSrc,
} from '../src/config/sandbox-start-values.mjs'
import { theProviderTheLauncherAdds } from '../src/shared/worker-runs.ts'
import {
  aCommandsStartFromTheOffice as theOfficeStartFromTools,
  aCommandsStartValues as theStartValuesFromTools,
  theDshSelection,
} from '../tools/sandbox-common.mjs'

const DSH = ['dsh', '--profile', 'office']
const THE_DSH_MODELS: readonly string[] = LAUNCHER_MODEL_COMPATIBILITY.dsh.models
/** A model DSH can take, a model the office knows that DSH cannot take, and a model a Codex worker may be given. */
const TAKEN = THE_DSH_MODELS[0]
const NOT_TAKEN = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((model) => !THE_DSH_MODELS.includes(model))
const CODEX_MODEL = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(theProviderTheLauncherAdds('codex'))}/${name}`))
if (TAKEN === undefined || NOT_TAKEN === undefined || CODEX_MODEL === undefined) {
  throw new Error('The model data names no model DSH takes, no model DSH refuses, or no Codex model, so this test has nothing to start.')
}

/** The sentence the DSH check itself refuses a model with, read by asking the check. */
function theChecksRefusal(model: string): string {
  try {
    theDshSelection(model, null)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error(`The DSH check took ${model}, which the model data says DSH cannot take.`)
}

describe('a DSH start through src/config alone', () => {
  it('is refused in words when nobody handed in the check', async () => {
    expect(() => theStartValuesFromSrc(DSH, { model: TAKEN })).toThrow(A_DSH_START_NEEDS_ITS_CHECK)
    expect(() => theStartValuesFromSrc(['env', 'SYNTHETIC=1', ...DSH], { model: TAKEN })).toThrow(A_DSH_START_NEEDS_ITS_CHECK)
    // AFTER ASKING THE OFFICE as well. No address, so nothing is asked and the owner's rule decides.
    await expect(theOfficeStartFromSrc(DSH, { api: '', runtime: 'dsh', model: TAKEN })).rejects.toThrow(A_DSH_START_NEEDS_ITS_CHECK)
  })

  it('calls a check that is handed in with the model and the effort, through an env prefix too', () => {
    const asked: [string | null, string | null][] = []
    const given = theStartValuesFromSrc(['env', 'SYNTHETIC=1', ...DSH], {
      model: TAKEN,
      checkTheDshSelection: (model: string | null, effort: string | null) => asked.push([model, effort]),
    })
    expect(asked).toEqual([[TAKEN, given.start?.effort ?? null]])
    expect(given.env).toHaveProperty('SANDBOX_DSH_SELECTION')
  })
})

describe('a DSH start through tools/sandbox-common.mjs', () => {
  it('goes ahead with the check handed in, and the check refuses a model DSH cannot take', async () => {
    const given = theStartValuesFromTools(DSH, { model: TAKEN })
    expect(given.command).toEqual(DSH)
    expect(JSON.parse(String(given.env['SANDBOX_DSH_SELECTION']))).toMatchObject({ runtime: 'dsh', model: TAKEN })
    const refused = theChecksRefusal(NOT_TAKEN)
    expect(() => theStartValuesFromTools(DSH, { model: NOT_TAKEN })).toThrow(refused)

    const fromTheOffice = await theOfficeStartFromTools(DSH, { api: '', runtime: 'dsh', model: TAKEN })
    expect(JSON.parse(String(fromTheOffice.env['SANDBOX_DSH_SELECTION']))).toMatchObject({ runtime: 'dsh', model: TAKEN, officeUnavailable: true })
    await expect(theOfficeStartFromTools(DSH, { api: '', runtime: 'dsh', model: NOT_TAKEN })).rejects.toThrow(refused)
  })
})

describe('a start that needs no check', () => {
  it('gives the same answer through src/config as through tools/', () => {
    const shell = ['bash', '-lc', 'exec "$1" --profile office', 'synthetic-shell', '/synthetic/bin/dsh']
    const codex = ['codex', 'exec', '-m', CODEX_MODEL]
    for (const [command, options] of [
      [shell, { runtime: 'dsh', model: TAKEN }],
      [codex, {}],
    ] as const) {
      expect(theStartValuesFromSrc([...command], options)).toEqual(theStartValuesFromTools([...command], options))
    }
    // The shell-wrapped start is not refused. It hands DSH no model and no effort, and says so in words.
    const { env, start } = theStartValuesFromSrc([...shell], { runtime: 'dsh', model: TAKEN })
    expect(env).toEqual({})
    expect(start).toMatchObject({ requestedModel: TAKEN, model: null, effort: null, words: expect.stringMatching(/\S/) })
  })
})
