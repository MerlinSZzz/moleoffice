// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX START THAT NAMES A MODEL KEEPS ITS COMMAND AND EFFORT, AND THE DATA KEEPS NO MODEL FOR A RUN THAT NAMES NONE.
 *
 * The compatibility data used to carry an unnamed entry that gave a Codex run with no model the effort of a model nobody
 * chose. The named-start case is the control: this round must not change it. The data case is the criterion's red.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the data case, because the entry is still there. The control's mutation drops
 * the effort flag from the named path.
 */
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { theProviderTheLauncherAdds } from '../src/shared/worker-runs.ts'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'

const codexIsFast = THE_RUNTIMES_FAST_MODE.codex

describe('a Codex start that names a model', () => {
  it('keeps its command and effort', () => {
    const model = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(theProviderTheLauncherAdds('codex'))}/${name}`))
    expect(model, 'a Codex model the compatibility list names').toBeDefined()
    const effort = `effort-${randomUUID()}`
    const prompt = `Synthetic prompt ${randomUUID()}`
    const given = aCommandsStartValues(['codex', 'exec', '--json', '-m', model!, '--', prompt], {
      runtime: 'codex',
      model: model!,
      effortAnswer: { effort, effortFrom: 'Casting', model: model!, unavailable: false, predatesEffort: false },
    })
    expect(given.start).toMatchObject({ runtime: 'codex', model, effort, effortFrom: 'Casting', fast: codexIsFast })
    const command = given.command as string[]
    expect(command.filter((word) => word === '-m')).toHaveLength(1)
    expect(command[command.indexOf('-m') + 1]).toBe(model)
    expect(command).toContain(`model_reasoning_effort=${effort}`)
    expect(command.includes('service_tier=fast')).toBe(codexIsFast)
    expect(command.at(-1)).toBe(prompt)
  })

  it('keeps no model in the data for a run that names none', () => {
    expect(Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY, 'unnamed')).toBe(false)
  })
})
