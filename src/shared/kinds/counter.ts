// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `counter`, a running count and the spacing of its firings.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts.
 * NO DECLARATION MOVED WITH THIS KIND.
 */
import { type KindSpec } from './kind-common.ts'
export const counterKind: KindSpec = {
    kind: 'counter',
    purpose:
      'ONE COUNTER AND ITS TIMED TRIGGERS: what it counts, who may add to it, what makes it fire and what it does ' +
      'then. Somebody adds to it by hand with a reason, or it follows an office event; when one of ' +
      'its triggers holds it runs ONE action from a closed list — a line from the office, a task, or a registered ' +
      'office job — and starts again from zero. It never starts an agent or a run of an agent: that press is the ' +
      "owner's. ITS COUNT AND ITS AMOUNT ARE NOT HERE: every addition and every firing is a row of `counter_rows`, " +
      'and the two numbers are worked out from the rows since the last firing.',
    whenToRecord:
      'Never by hand, and never through POST /api/records: every write to this kind is refused there, the ' +
      "person's included. File one with POST /api/counters, add to it with POST /api/counters/<id>/add, change it " +
      'with PATCH /api/counters/<id>, and pause or resume it with POST /api/counters/<id>/pause and /resume. ' +
      'File one when something has to happen after N of something rather than at a time somebody remembers.',
    humanOnly: false,
    fields: [
      {
        key: 'counts',
        type: 'string',
        required: true,
        description:
          'WHAT THIS COUNTS, in one plain sentence a person who has never seen it can act on. It is the sentence ' +
          'the page draws under the title, and the office never writes it for you.',
        example: 'Landings in this repository since the whole suite last ran on main.',
      },
      {
        key: 'amountIs',
        type: 'string',
        required: false,
        description:
          'WHAT THE SECOND NUMBER MEASURES, when the same additions carry one: changed files, minutes, grams. ' +
          'Leave it out when the counter counts events alone — absent means there is no amount, which is a ' +
          'different fact from an amount of zero.',
        example: 'changed files under src, tests and tools',
      },
      {
        key: 'createdBy',
        type: 'Record<string, unknown>',
        required: true,
        description:
          "{kind, id}: WHO FILED IT, written once by the office from whoever asked and refused from every caller, " +
          "the way a decision's `recorded_by` is. It is half of who may change it: whoever filed it, a " +
          'secretary, and the owner.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'mayAdd',
        type: 'Record<string, unknown>',
        required: true,
        description:
          '{anyone, who}: WHO MAY ADD TO IT. `anyone` true means every agent and person the registry holds; ' +
          'otherwise `who` is the list of {kind, id} parties that may, and it is the person or agent that filed it ' +
          'by default. An addition by anybody else is refused in words naming who may. NAMING WHO MAY ADD MAKES THE ' +
          'COUNTER WAIT FOR A COUNT: when `anyone` is true or `who` is not empty, an every or quiet trigger fires ' +
          'only once the count is at least 1, and the counter is no timer. A timer names nobody and fires with a ' +
          'count of 0.',
        example: { anyone: false, who: [{ kind: 'agent', id: 'secretary-1' }] },
      },
      {
        key: 'follows',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'THE OFFICE EVENTS THIS COUNTER FOLLOWS, from a closed list of three, each counted once by its own ' +
          "id: {event:'landing', lane, paths?} adds 1 for a landing in that directory with its changed-file count " +
          "as the amount, narrowed to those path prefixes when it names any; {event:'run-finished', pipeline} adds " +
          "1 for a run that reaches finished in that pipeline or module, and never for one that stopped or " +
          "crashed; {event:'group-message', group} adds 1 for every message in that group, the office's own lines " +
          'included. Only events after the counter was filed are counted. FOLLOWING ANYTHING MAKES THE COUNTER WAIT ' +
          'FOR A COUNT: a counter that follows something is no timer, so an every or quiet trigger fires only once ' +
          'the count is at least 1. A timer follows nothing and fires with a count of 0. Leave it out when nothing ' +
          'but a person or an agent adds to it.',
        example: [{ event: 'landing', lane: '/srv/mole-office-fixtures/checkout', paths: ['src/', 'tests/', 'tools/'] }],
      },
      {
        key: 'triggers',
        type: 'Record<string, unknown>[]',
        required: true,
        description:
          'WHAT MAKES IT FIRE. It fires on the first of these to hold, and the four shapes are ' +
          "{kind:'count', n} — the count reaches n; {kind:'amount', m} — the amount reaches m; " +
          "{kind:'quiet', condition:'merge-lane-idle', lane, minutes} — the count is at least 1 and nothing has " +
          "waited in that lane for that many minutes; and {kind:'every', hours, from?} — that many hours since it " +
          'last fired, or since it was filed when it never has. A counter nobody may add to and that follows ' +
          'nothing is a timer, and the count condition does not apply to it.',
        example: [{ kind: 'count', n: 3 }, { kind: 'every', hours: 12 }],
      },
      {
        key: 'action',
        type: 'Record<string, unknown>',
        required: true,
        description:
          'WHAT IT DOES WHEN IT FIRES, one action from a closed list of three and nothing else in this ' +
          "version: {kind:'message', to:[{kind,id}]} writes one line from the office to each of those " +
          "participants; {kind:'message', group} writes one line into that group; {kind:'task', title} files a " +
          "task with that title in this project, linked to the counter; {kind:'job', job} asks the office to run " +
          'a registered office job, which a runner outside the server answers through its own door. A counter ' +
          'never starts an agent or a run of an agent.',
        example: { kind: 'job', job: 'merge-queue.whole-suite-on-main' },
      },
      {
        key: 'atMostOnceEvery',
        type: 'number',
        required: true,
        description:
          'HOW MANY MINUTES MUST PASS BETWEEN TWO FIRINGS. The default and the shortest are the office\'s shortest ' +
          'time for counters, set on the Gates panel, and a creator may only set it LARGER. A firing inside the ' +
          'window is written as a held-back row with the reason instead, the count is kept, and it fires when the ' +
          'window frees.',
        example: 30,
      },
      {
        key: 'pause',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{at, by, because}: THAT IT IS PAUSED, who paused it and why. A paused counter still counts what ' +
          'is added to it and fires nothing; on resume, a trigger that holds fires once. Absent means it is ' +
          'running, and pausing and resuming are their own doors rather than a field a caller writes.',
        example: { at: '2026-09-23 18:00:00', by: { kind: 'person', id: 'owner' }, because: 'The merge queue is stopped for the evening.' },
      },
    ],
    rules: [
      'Only its own doors write a counter. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      'The count and the amount are worked out from the rows since the last firing and are never stored on the record.',
      'Only whoever filed it, a secretary or the owner may change its triggers, its action, who may add or its limit, and every change says why.',
      'A counter whose action writes into a group it follows, directly or through another counter, is refused when it is filed and when it is changed, with the loop named.',
      'Its window is the longer of `atMostOnceEvery` and the office\'s shortest time for counters; a firing inside the window is a held-back row with the reason, and the count is kept.',
      'After it fires, the count and the amount start again from zero, and the firing is a row saying which trigger held and what the action answered.',
      'A trigger that fell due while the office was down fires once when it is back, not once for each missed moment.',
    ],
    example: {
      counts: 'Landings in this repository since the whole suite last ran on main.',
      amountIs: 'changed files under src, tests and tools',
      createdBy: { kind: 'agent', id: 'secretary-1' },
      mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'secretary-1' }] },
      follows: [{ event: 'landing', lane: '/srv/mole-office-fixtures/checkout', paths: ['src/', 'tests/', 'tools/'] }],
      triggers: [{ kind: 'count', n: 3 }, { kind: 'amount', m: 80 }, { kind: 'every', hours: 12 }],
      action: { kind: 'job', job: 'merge-queue.whole-suite-on-main' },
      atMostOnceEvery: 30,
    },
}
