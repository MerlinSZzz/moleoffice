// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED RELEASE'S GROUP SAYS WHY WITHIN ITS LIMIT (wave 13v round 35). A refused release opens a group, and the
 * group carries the sentence whyTheGroupWasOpened writes, with the inspector's and the worker's names in it. A group
 * refuses a reason longer than GROUP_BECAUSE_MAX characters, and a refusal whose group is refused is not written at
 * all. Each name in that sentence is a handle, at most HANDLE_MAX characters, or a record id, which is shorter.
 *
 *   1. With two names of HANDLE_MAX characters, the sentence is one a group takes.
 *   2. It names the inspector and the worker, says "the refusal stands" in lower case, which is how
 *      tests/an-inspector-releases-or-refuses-in-one-act.test.ts reads it from the group, and says the worker and its
 *      supervisor are in it.
 *
 * MUTATIONS (each restored after):
 *   - whyTheGroupWasOpened in src/shared/releasing.ts carries the longer words it had before this test: red, case 1
 *     (456 characters);
 *   - the sentence names "this run" where the worker's name goes: red, case 2;
 *   - the sentence says "The refusal stands" as a sentence of its own, as round 35 had made it: red, case 2.
 */

import { describe, expect, it } from 'vitest'
import { GROUP_BECAUSE_MAX, whyTheReasonIsRefused } from '../src/shared/groups.ts'
import { HANDLE_MAX } from '../src/shared/participants.ts'
import { whyTheGroupWasOpened } from '../src/shared/releasing.ts'

describe("the sentence a refused release's group carries", () => {
  it('is one a group takes, with two names of the longest a handle may be', () => {
    const because = whyTheGroupWasOpened('i'.repeat(HANDLE_MAX), 'w'.repeat(HANDLE_MAX))
    expect(because.length).toBeLessThanOrEqual(GROUP_BECAUSE_MAX)
    expect(whyTheReasonIsRefused(because, 'this group was opened')).toBeNull()
  })

  it('names the inspector and the worker, says the refusal stands, and names the worker and its supervisor', () => {
    const because = whyTheGroupWasOpened('some-inspector', 'some-worker')
    expect(because).toContain('some-inspector refused to release some-worker')
    expect(because).toContain('the refusal stands')
    expect(because).toContain('the worker and its supervisor')
  })
})
