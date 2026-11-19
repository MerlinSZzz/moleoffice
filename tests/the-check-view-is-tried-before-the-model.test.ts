// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK VIEW IS TRIED WITH AN EMPTY COMMAND BEFORE THE MODEL STARTS. Wave 13j, the round after X4FMBW2bGWp-, point 3
 * of the check line's brief: "Every such condition is checked before the model starts. A refusal says what to fix, and
 * spends no model tokens." On 15 October five checks ran their model and were thrown away, because runInside
 * (tools/inspector-sandbox.mjs) refused the launcher's receipt or evidence by its mode after the model had run.
 * whyTheCheckViewFails runs `true` through the same runInside first. The tool calls it after the sandbox and the work copy,
 * and before the prompt; tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts proves that order and the
 * tool's refusal.
 *
 *   1. A view that runs the command answers null. The command is `true`, it is given no secret, and its limit is a minute.
 *   2. A receipt or an evidence file that is group-writable is refused, in runInside's own words.
 *   3. An empty command that exits other than 0 is refused, with its exit.
 *
 * WHAT IS REAL AND WHAT IS NOT. runInside and whyTheCheckViewFails are the real ones. The launcher is
 * tests/inspector-view-stand-in.ts, a labelled stand-in for tools/sandbox.mjs that writes a descriptor, a receipt and
 * evidence files and starts no container.
 *
 * MUTATIONS, RUN ON 16 OCTOBER 2026, each after a control run that was green:
 *   - whyTheCheckViewFails answered null whatever runInside answered: cases 2 and 3 went red, and so did the sandbox case
 *     of a view that leaves its evidence group-writable.
 *   - runInside gave the empty command the model's secret: case 1 went red, on the secret.
 *   - The tool no longer called whyTheCheckViewFails: the sandbox case went red on the refusal's words, because the model
 *     ran and the same refusal came after it. The first sandbox case went red on the order of the commands, and the clock
 *     case on the number of processes.
 * Each was restored with cp and checked with cmp, and the control run again was green.
 */
import { chmodSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { whyTheCheckViewFails } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'

const NOT_CONTROLLER_OWNED = 'Check view receipt or evidence is not a controller-owned regular file.'

let f: ReturnType<typeof inspectorViewStandIn> | undefined
afterEach(() => { f?.close(); f = undefined })

const tryTheView = () => whyTheCheckViewFails(f!.sandbox, f!.work, { launcher: f!.launcher })

describe('the check view is tried before the model starts', () => {
  it('1. answers null when the view runs `true`, given no secret, within a minute', async () => {
    f = inspectorViewStandIn()
    expect(await tryTheView()).toBeNull()
    expect(f.calls).toHaveLength(1)
    const call = f.calls[0]!
    expect(call.command).toEqual(['sh', '/inputs/commands/try-the-view.sh'])
    expect(readFileSync(join(f.sandbox.checkDir, 'commands', 'try-the-view.sh'), 'utf8')).toContain("exec 'true' < '/dev/null'")
    expect(call.words).not.toContain('--secret')
    expect(call.words[call.words.indexOf('--timeout') + 1]).toBe('60')
  })

  it.each(['receipt', 'out', 'err', 'exit'] as const)('2. refuses a group-writable %s, in the words runInside refuses it with', async (file) => {
    f = inspectorViewStandIn()
    f.changeStart((start) => chmodSync(start[file], 0o664))
    expect(await tryTheView()).toBe(NOT_CONTROLLER_OWNED)
  })

  it('3. refuses an empty command that exits other than 0, and says its exit', async () => {
    f = inspectorViewStandIn()
    f.exit(3)
    expect(await tryTheView()).toBe('the command `true` exited 3')
  })
})
