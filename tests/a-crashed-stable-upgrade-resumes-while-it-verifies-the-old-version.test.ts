// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CRASH PROOF OF tools/stable/upgrade-stable.criteria.md, item 15 (b), at each boundary while the restored old
 * version is checked and verified: the upgrade program is ended by SIGKILL right after that journal line, and the
 * resume comes back to "closed" or "rolled back", never to an office nothing verified. tests/a-closed-stable-upgrade.ts
 * holds the boundaries and the proof. Every office here is made up.
 */
import { it } from 'vitest'
import { stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { THE_PARTS, configFor, crashTheUpgradeAt, theBoundaryIn, theCrashIsResumed, theResumeEnds } from './a-closed-stable-upgrade.ts'

for (const b of THE_PARTS['while-it-verifies-the-old-version']!) it(`resumes a crash after ${theBoundaryIn(b)}, and ends ${theResumeEnds(b)}`, async () => {
  const f = await stableUpgradeFixture()
  await theCrashIsResumed(f, b, await crashTheUpgradeAt(f, configFor(f, b.run), b))
}, 120_000)
