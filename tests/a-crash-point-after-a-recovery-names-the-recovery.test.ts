// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CRASH POINT OF THE RUN THAT PUBLISHES, REACHED ONLY AFTER A RECOVERY, FAILS WITH THE RECOVERY'S OWN REASON.
 *
 * crashTheUpgradeAt in tests/a-closed-stable-upgrade.ts ends the upgrade program at the first journal line that matches
 * its boundary. A run that publishes and meets a failure recovers, and after the recovery it journals some of the lines
 * a run that publishes journals. A crash there looked like a wrong resume, and the red named the resume, not the
 * failure. Here the target verifier rejects, so the run recovers before `release-lock attempt`, and crashTheUpgradeAt
 * must fail with the recovery's reason. Every office here is made up.
 *
 * MUTATION (after a control run, then restored): the controller no longer looks at recovery lines → it ends the run at
 * `release-lock attempt` and resolves, and the case goes red.
 */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { configFor, crashTheUpgradeAt, rows, theBoundaryIn, type Boundary } from './a-closed-stable-upgrade.ts'

it('fails with the recovery\'s reason when the run recovers before a crash point of the run that publishes', async () => {
  const f = await stableUpgradeFixture()
  const at: Boundary = { run: 'publishing', step: 'release-lock', phase: 'attempt', nth: 1 }
  const refused = await crashTheUpgradeAt(f, configFor(f, 'rejecting'), at).then(() => null, (error: unknown) => error)
  const recovery = rows(join(f.stable, '.git/stable-upgrade.lock')).find((e) => e.step === 'recovery' && e.phase === 'attempt')
  expect(typeof recovery?.reason, 'the run journalled no recovery').toBe('string')
  expect(refused).toBeInstanceOf(Error)
  expect((refused as Error).message).toBe(`The upgrade started a recovery before the crash point, ${theBoundaryIn(at)}: ${String(recovery.reason)}`)
}, 120_000)
