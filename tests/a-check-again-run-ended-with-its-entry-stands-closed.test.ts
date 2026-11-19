// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK-AGAIN RUN THE OFFICE ENDED WITH ITS MERGE ENTRY STANDS CLOSED, read off its stored fields alone.
 *
 * Decision yH7W1sXTRY5q, Q3 (a) and Q4, on acceptance finding 76. The merge queue files a check-again run
 * itself, and nobody works in it. When its check refuses, the office bounces the entry and, in the same transaction,
 * writes `endedWithItsMergeEntry` on the run. `howARunStands` reads that as closed: the run waits on nobody, is not a
 * finish nobody released, and its sentence names the merge entry. It uses the closed standing; the separate
 * closed-unchecked archive has its own standing.
 *
 * Such a refusal opens no group, so its stored shape has no `group`, and the readings of a refusal say why there is
 * none rather than naming one.
 *
 * WHAT IS NOT PROVED HERE. That the office writes the ending with the bounce, and that the check door opens no group,
 * are proved against the real doors in tests/merge-state-machine.test.ts. This file is the pure reading in
 * src/shared/releasing.ts. Every value here is synthetic.
 */
import { describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import {
  ENDED_WITH_ITS_MERGE_ENTRY,
  NO_GROUP_FOR_A_CHECK_AGAIN,
  RUN_STANDINGS,
  endedWithItsMergeEntrySays,
  howARunStands,
  readRefusal,
  refusedSays,
} from '../src/shared/releasing.ts'

/** A refusal as the check door stores it on a check-again run: no group. */
const A_REFUSAL_WITH_NO_GROUP = {
  by: { kind: 'agent', id: 'inspector-one' },
  at: '2026-09-24 19:05:00',
  missing: ['Synthetic: the test would pass with the feature deleted.'],
  chapter: 5,
  check: 'synthetic-message',
}

/** A check-again run as the merge queue files it, finished, with its refusal. */
const A_REFUSED_CHECK_AGAIN = {
  state: 'finished',
  servingAgent: 'worker-w',
  workingDirectory: '/synthetic/merge-tool-clone',
  extra: { purpose: 'reinspection', mergeEntry: 'synthetic-entry' },
  refused: A_REFUSAL_WITH_NO_GROUP,
}

const THE_ENDING = {
  entry: 'synthetic-entry',
  at: '2026-09-24 19:07:00',
  because: 'Ended with merge entry synthetic-entry, which its refusal bounced; nobody works in a check-again run.',
}

describe('a check-again run the office ended with its merge entry', () => {
  // MUTATION PROOF: the read of the ending removed from `howARunStands`, and this goes red on the standing.
  it('stands closed, waits on nobody, is no unreleased finish, and says so naming the entry', () => {
    const stands = howARunStands({ ...A_REFUSED_CHECK_AGAIN, [ENDED_WITH_ITS_MERGE_ENTRY]: THE_ENDING })
    expect(stands.standing).toBe('closed')
    expect(stands.waitingFor).toBeNull()
    expect(stands.unreleasedFinish).toBe(false)
    expect(stands.endedWithItsMergeEntry).toEqual(THE_ENDING)
    expect(stands.says).toBe(endedWithItsMergeEntrySays(THE_ENDING, sayInEnglish))
    expect(stands.says).toBe(
      "This run was the merge queue's check again for merge entry synthetic-entry; the check refused to release it, " +
        'and the office ended it with that entry at 2026-09-24 19:07:00.',
    )
    // THE REFUSAL STAYS READABLE: the queue's verdict and the run's page read it.
    expect(stands.refused).toMatchObject({ missing: A_REFUSAL_WITH_NO_GROUP.missing })
    // An ended check-again remains closed; an unchecked archive has its own standing.
    expect(RUN_STANDINGS).toEqual(['working', 'inspecting', 'rebuttal', 'reporting', 'closed', 'superseded', 'closed unchecked'])
  })

  it('stays in rebuttal where no ending was written, and names no group it waits on', () => {
    const stands = howARunStands(A_REFUSED_CHECK_AGAIN)
    expect(stands.standing).toBe('rebuttal')
    expect(stands.endedWithItsMergeEntry).toBeNull()
    expect(stands.waitingFor).toBe(NO_GROUP_FOR_A_CHECK_AGAIN)
    expect(stands.says).toBe(refusedSays(stands.refused!))
    expect(stands.says).toContain(NO_GROUP_FOR_A_CHECK_AGAIN)
    expect(stands.says).not.toContain('talked out')
  })

  it('reads an ending that names no merge entry as no ending', () => {
    expect(howARunStands({ ...A_REFUSED_CHECK_AGAIN, [ENDED_WITH_ITS_MERGE_ENTRY]: { at: THE_ENDING.at } }).standing).toBe('rebuttal')
  })
})

describe('a refusal that opened no group', () => {
  it('is read as a refusal with no group, while a group that is there and names nothing is not a refusal', () => {
    const read = readRefusal(A_REFUSAL_WITH_NO_GROUP)
    expect(read).not.toBeNull()
    expect(read).not.toHaveProperty('group')
    expect(readRefusal({ ...A_REFUSAL_WITH_NO_GROUP, group: '' })).toBeNull()
    expect(readRefusal({ ...A_REFUSAL_WITH_NO_GROUP, group: 'synthetic-group' })?.group).toBe('synthetic-group')
  })

  it("keeps a worker's own refusal's words, group and all", () => {
    const own = readRefusal({ ...A_REFUSAL_WITH_NO_GROUP, group: 'synthetic-group' })!
    expect(refusedSays(own)).toContain('The group opened for it is synthetic-group. The refusal stands while it is talked out.')
    expect(howARunStands({ state: 'finished', refused: { ...A_REFUSAL_WITH_NO_GROUP, group: 'synthetic-group' } }).waitingFor).toBe(
      'Waiting for the group to settle it: synthetic-group.',
    )
  })
})
