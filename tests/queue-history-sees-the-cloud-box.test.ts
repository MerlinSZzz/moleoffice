// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * tools/queue-history.mjs FINDS A SUITE THAT WAS ASKED OF THE CLOUD BOX, AND SAYS WHERE IT RAN (wave 13v round 30).
 *
 * The merge tool asks the cloud box for the whole suite first and runs it here when the box does not run it
 * (tools/merge-tool/cloud-suite-door.mjs). The box's call is logged as `running suite-door: `, so a history that looked
 * only for `running suite: ` found no start for a suite the box ran. Each log below is synthetic, in the words the door
 * and the run here write.
 */

import { expect, it } from 'vitest'
import { history } from '../tools/queue-history.mjs'

/** One entry's log, tested alone or with a rider, with the suite's own lines between the declaration and the health line. */
function aLog(entry: string, suiteLines: string[], { rider = null as string | null } = {}): { path: string; text: string } {
  const declared = rider === null ? '2026-10-12 10:00:00 tested alone: the lane has no other judged entry' : `2026-10-12 10:00:00 tested with merge entry ${rider} in one suite, on the pair's tree abc123`
  const text = [
    `2026-10-12 09:59:00 merge entry ${entry} (git) is judged; lane synthetic`,
    declared,
    ...suiteLines,
    "2026-10-12 10:20:00 the office's health while the suite ran: synthetic sample",
    '2026-10-12 10:21:00 the office answered: the entry is now merged',
    '',
  ].join('\n')
  return { path: `synthetic/${entry}/the-merger.log`, text }
}

const busOf = (log: { path: string; text: string }) => {
  const out = history([log], '2026-10-12 09:00:00', '2026-10-12 11:00:00')
  expect(out.buses).toHaveLength(1)
  return out.buses[0]!
}

it('starts the suite at the call to the cloud box, and says the box ran it', () => {
  const bus = busOf(
    aLog('boxed', [
      '2026-10-12 10:01:00 running suite-door: node /synthetic/door.mjs --commit abc in /synthetic/clone',
      '2026-10-12 10:15:00 suite ran on the cloud box: npm test exited 0, at 8 workers, on commit abc123abc123; 840 s from the call to its answer, 800 s by the box\'s own count (log /synthetic/suite.log, the door\'s own log /synthetic/door.log)',
    ]),
  )
  expect(bus).toMatchObject({ suiteStarted: '2026-10-12 10:01:00', suiteElapsedThroughCompletionObservationSeconds: 1140, suiteRan: { where: 'the cloud box', askedTheBoxAt: '2026-10-12 10:01:00' } })
})

it('keeps the start at the call when the box does not run the suite and it runs here, and keeps the reason', () => {
  const bus = busOf(
    aLog('fellback', [
      '2026-10-12 10:01:00 running suite-door: node /synthetic/door.mjs --commit abc in /synthetic/clone',
      '2026-10-12 10:03:00 suite is not run on the cloud box, so it runs here, in sandbox synthetic-box: the door exited 75: the box is busy (the door\'s own log /synthetic/door.log)',
      '2026-10-12 10:03:01 running suite: npm test -- --maxWorkers=4 in /synthetic/clone',
      '2026-10-12 10:19:00 suite ran here, in sandbox synthetic-box: it exited 0; 959 s from its start to its end (log /synthetic/suite.log)',
    ]),
  )
  expect(bus).toMatchObject({
    suiteStarted: '2026-10-12 10:01:00',
    suiteElapsedThroughCompletionObservationSeconds: 1140,
    suiteRan: { where: 'here', askedTheBoxAt: '2026-10-12 10:01:00', ranHereFrom: '2026-10-12 10:03:01', because: "the door exited 75: the box is busy (the door's own log /synthetic/door.log)" },
  })
})

it('says the suite ran here, and why, when the box was not asked', () => {
  const bus = busOf(
    aLog('notasked', [
      '2026-10-12 10:02:00 suite is not run on the cloud box, so it runs here, in sandbox synthetic-box: merge entry notasked names its own 4 suite workers',
      '2026-10-12 10:02:00 running suite: npm test -- --maxWorkers=4 in /synthetic/clone',
    ]),
  )
  expect(bus).toMatchObject({ suiteStarted: '2026-10-12 10:02:00', suiteRan: { where: 'here', ranHereFrom: '2026-10-12 10:02:00', because: 'merge entry notasked names its own 4 suite workers' } })
  expect(bus.suiteRan).not.toHaveProperty('askedTheBoxAt')
})

it('reads a pair or a bus by its pair-suite lines, and a log from before the box as a run here', () => {
  const pair = busOf(
    aLog(
      'leader',
      [
        '2026-10-12 10:01:00 running pair-suite-door: node /synthetic/door.mjs in /synthetic/clone',
        '2026-10-12 10:15:00 pair-suite ran on the cloud box: npm test exited 1, 2 file(s) failed, at 8 workers, on commit abc123abc123; 840 s',
      ],
      { rider: 'rider' },
    ),
  )
  expect(pair).toMatchObject({ suiteStarted: '2026-10-12 10:01:00', suiteRan: { where: 'the cloud box' } })
  const before = busOf(aLog('before', ['2026-10-12 10:05:00 running suite: npm test in /synthetic/clone']))
  expect(before).toMatchObject({ suiteStarted: '2026-10-12 10:05:00', suiteElapsedThroughCompletionObservationSeconds: 900, suiteRan: { where: 'here', ranHereFrom: '2026-10-12 10:05:00' } })
})

it('says it does not know where the suite ran when only the call to the box is recorded, and null when no suite line is', () => {
  expect(busOf(aLog('cut', ['2026-10-12 10:01:00 running suite-door: node /synthetic/door.mjs in /synthetic/clone'])).suiteRan).toMatchObject({ where: 'not known from the logs' })
  expect(busOf(aLog('none', [])).suiteRan).toBeNull()
})
