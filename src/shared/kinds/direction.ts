// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `direction`, a line of exploration tracked by how far it has
 * actually been taken.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `passedItOnField`, `unionOf`,
 * `whoseMoveField` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM ./kind-common.ts, AND
 * `DIRECTION_DEPTHS` AND `DIRECTION_DEPTH_MEANINGS` FROM ../types.ts, because its `depth` field is
 * `unionOf(DIRECTION_DEPTHS)` and its description maps the two. THOSE TWO DECLARATIONS STAY IN
 * ../types.ts AND DO NOT MOVE.
 */
import { attentionFields, commonFields, passedItOnField, unionOf, whoseMoveField, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { DIRECTION_DEPTHS, DIRECTION_DEPTH_MEANINGS } from '../types.ts'

export const directionKind: KindSpec = {
    kind: 'direction',
    purpose: 'A line of exploration, tracked by how far it has actually been taken.',
    whenToRecord:
      'When a question is worth returning to and you want to be honest about how deep it has gone. "We are looking ' +
      'into X" means nothing on its own; the depth is what makes it a direction rather than a wish.',
    humanOnly: false,
    fields: [
      {
        key: 'depth',
        type: unionOf(DIRECTION_DEPTHS),
        required: true,
        description:
          'How far this has been taken, on the six-level ladder. ' +
          DIRECTION_DEPTHS.map((d) => `${d}: ${DIRECTION_DEPTH_MEANINGS[d]}`).join(' ') +
          ' Needed before the direction is complete — it is what the kind is for. Say the level you have actually ' +
          'reached, not the one you intend to.',
        example: 'measured',
      },
      {
        key: 'depth_reason',
        type: 'string',
        required: false,
        description:
          'Why it sits at that level and not the next one up. The ladder is a claim about how far this has been ' +
          'taken, and this is the sentence that makes the claim arguable.',
        example: 'Nothing has been run. It is recorded so it is not mistaken for settled.',
      },
      { key: 'question', type: 'string', required: false, description: 'The question being chased, written as a question.', example: 'Which tokeniser gives usable Chinese search in SQLite FTS: character bigrams, or trigrams over mixed text?' },
      {
        key: 'what_is_not_known',
        type: 'string',
        required: false,
        description: 'The part that is still open. A direction that lists no unknown has either finished or has not been looked at.',
        example: 'Whether a character tokeniser makes English search worse in the same index.',
      },
      { key: 'why_it_matters', type: 'string', required: false, description: 'What changes depending on the answer.', example: 'Module summaries here already mix Chinese and English in one sentence. A search that finds only the English half is a search nobody uses twice.' },
      {
        key: 'evidence',
        type: 'string[]',
        required: false,
        description:
          'What was actually done at this depth: what was read, run, or measured. From `measured` upwards this is a ' +
          'hard refusal rather than an incompleteness, and `evidence: []` is refused the same way as leaving it out — ' +
          'those three levels claim numbers exist, and a depth that claims a measurement with nothing behind it is the ' +
          'exact thing the ladder was built to catch.',
        example: ['Indexed 2 000 mixed records with a bigram tokeniser: recall 0.91 Chinese, 0.98 English.'],
      },
      { key: 'next', type: 'string', required: false, description: 'What would take it one level deeper. The ladder implies a next step; naming it is how a direction keeps moving.', example: 'Run the same index over the real workspace and measure query time at 50 000 records.' },
      { key: 'blocked_on', type: 'string', required: false, description: 'What is stopping it going deeper.', example: 'Blocks are not records yet, so version comparison cannot be drawn.' },
      {
        key: 'shelved',
        type: 'Shelf',
        required: false,
        description:
          'This direction has been shelved: {"since":"2026-09-11","because":"…"} and, where there is one, ' +
          '"restart_when":"…" for what would bring it back. A SHELF IS NOT A PAUSE. A pause waits on purpose and is ' +
          'expected back, so a paused direction keeps its place in the open loops. A shelved direction is STOPPED and ' +
          'kept in case it restarts: it leaves the open loops and the counts, and it stays on its own page, in its ' +
          'family, and on the Shelved page, so a later reader finds it instead of concluding it was abandoned. ' +
          '`because` is required inside the object and is the person’s own words for why it stopped: a shelf with no ' +
          'reason reads as an abandonment a month later. Write `restart_when` when something would bring it back, and ' +
          'leave it out when nothing is named. See the Shelf shape.',
        example: {
          since: '2026-09-11',
          because: 'The grants were designed before any real need, and nothing was waiting on them.',
          restart_when: 'a task that needs to be handed to somebody outside the office',
        },
      },
      whoseMoveField('direction'),
      passedItOnField('direction'),
      ...attentionFields('direction'),
      ...commonFields('direction'),
    ],
    rules: [
      'depth "measured", "integrated" or "defended" requires `evidence`, and an empty list does not count: those levels claim something ' +
        'was measured, and the ladder exists to make that claim checkable. `evidence: []` is refused exactly like leaving it out.',
    ],
    example: {
      depth: 'measured',
      question: 'Which tokeniser gives usable Chinese search in SQLite FTS?',
      why_it_matters: 'The content is genuinely bilingual; a search that finds only the English half is a search nobody uses twice.',
      evidence: ['Indexed 2 000 mixed records with a bigram tokeniser: recall 0.91 Chinese, 0.98 English.'],
      next: 'Measure query time at 50 000 records.',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const DIRECTION_SHAPES: Record<string, ShapeSpec> = {
  Shelf: {
    name: 'Shelf',
    description:
      'A line of work that was STOPPED and kept, not one that is waiting: when it was shelved, why, and what ' +
      'would bring it back. A SHELF IS NOT A PAUSE. A pause waits on purpose and is expected back, so a paused ' +
      'record keeps its place in the open loops. A shelf is stopped for now, and the record is kept only so a ' +
      'later reader finds it and can restart it. That difference is the whole reason these are two facts and not ' +
      'one.',
    fields: [
      {
        key: 'since',
        type: 'date',
        required: true,
        description:
          'When it was shelved, as "2026-09-11" or "2026-09-11 14:40". This is what makes an old shelf visible as ' +
          'an old one, which a bare flag cannot do.',
        example: '2026-09-11',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description:
          'Why it was shelved, in the person’s own words. REQUIRED, and it is the field that makes a shelf a shelf: ' +
          'one with no reason is indistinguishable from abandonment a month later, so a reader who finds it cannot ' +
          'tell whether to pick the work back up or write it off.',
        example: 'The grants were designed before any real need, and nothing was waiting on them.',
      },
      {
        key: 'restart_when',
        type: 'string',
        required: false,
        description:
          'What would bring it back, in words. Leave it out when nothing is named — that is honest, and the shelf ' +
          'is then reported as having no restart condition rather than one nobody wrote.',
        example: 'a task that needs to be handed to somebody outside the office',
      },
    ],
  },

}
