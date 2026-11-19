// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A FEW FIELDS TAKE, in a file of their own.
 *
 * They were moved out of src/shared/kinds.ts with their comments unchanged. The module states read
 * the ModuleState type from ./module.ts, and the fork-settler words read ForkSettler from
 * ./proposal.ts; both are type-only imports, so this file makes no runtime cycle with the central
 * file.
 */
import type { ModuleState } from './module.ts'
import type { ForkSettler } from './proposal.ts'

/**
 * THE MODULE STATES THE RECORD-DUTY CHECK LEAVES OUT. A retired module is closed, and a stable one is
 * enough as it is, so its age is no sign that a duty lapsed. Active and paused
 * modules are counted, and so is a module with no state. src/server/lib/stale-records.ts is the one reader.
 */
export const MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK: readonly ModuleState[] = ['stable', 'retired']

/**
 * WHERE A NOTE SOMEBODY LEFT ON SOMETHING STANDS. THREE WORDS, AND ALL THREE ARE BORROWED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS CHOSEN, AND WHAT WAS REJECTED
 * ---------------------------------------------------------------------------------------
 *
 * The suggested names were Draft → Sent → Resolved/Handled → Needs attention, with the rule that
 * existing Mole Office state vocabulary wins where it already covers them better.
 * It does, and these are it.
 *
 * CHOSEN: `queued`, `sent`, `answered` — the words `MESSAGE_STATES` in src/server/lib/agents.ts
 * already says about a comment a person wrote for an agent, which is the same fact wearing a
 * different name. `queued` is written and not sent, and it is the state in which a person may still
 * edit or delete what they wrote. `sent` is out, so the words are immutable and a correction is a
 * new annotation with a `supersedes` link. `answered` is somebody having dealt with it. One idea,
 * one set of words, on both kinds of thing.
 *
 * REJECTED: `draft`, because `queued` already means "written and not sent" here and a second word
 * for it would make a reader ask what the difference is. `resolved` and `handled`, because
 * `answered` is the word this product already uses for the same event and two of them is one too
 * many. `needs_attention`, and that one is not a naming choice: how urgent something is, is a
 * SEPARATE AXIS from where it has got to, and Mole Office already stores it as `consequence`. A state
 * word that meant "urgent" would be a second ranking mechanism free to disagree with the first.
 *
 * ---------------------------------------------------------------------------------------
 * THEY ARE NO LONGER PINNED TO `MESSAGE_STATES`, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * They used to be, by a test, because they were the same fact said twice. They were the same fact
 * said twice, and that was the defect rather than the repair: WHERE A COMMENT HAS GOT TO WAS
 * STORED IN TWO PLACES. `agent_messages.state` said it about the message carrying the words, and
 * this field said it about the record. The second was stamped from the BROWSER after the send, in a
 * `try/catch` whose failure was reported and changed nothing — so a comment could be out and still
 * read `queued` here. It could also be walked back, and was: three writes and three 200s, measured
 * 19 August 2026, put a sent comment back to `queued`, rewrote its body and marked it sent again.
 *
 * There is now ONE store, `agent_messages.state`, written by `moveMessageTo` in
 * src/server/lib/dispatch.ts and by nothing else. That list has six words and this one has three,
 * and they are no longer about the same thing: these three are what a record of the old shape
 * holds, and the six are where a dispatch has got to.
 *
 * **NOTHING DECIDES ANYTHING FROM THIS FIELD.** The gate that fixes somebody's words asks
 * `hasGoneOut(annotationId, workspaceId)`, which is true when a message carrying those words is
 * past `queued`. Window B deletes the field and this list with it; until then it is readable, it is
 * optional, and it is not evidence.
 */
export const ANNOTATION_STATES = ['queued', 'sent', 'answered'] as const
export type AnnotationState = (typeof ANNOTATION_STATES)[number]

/** The words a screen draws for each value. Short, because they sit in a row beside a mark. */
export const FORK_SETTLER_WORDS: Readonly<Record<ForkSettler, string>> = {
  'the owner': 'The owner settles this',
  'an agent': 'An agent may settle this',
  'the parent': 'The agent that spawned this one settles it',
  'a measurement': 'A measurement settles this',
}

/** The word for the fifth answer: the field is not there. Never drawn as one of the four. */
export const FORK_SETTLER_UNSAID_WORD = 'Nobody has said who settles it'

/** What each value claims, for the tooltip and for anything that has to say it in full. */
export const FORK_SETTLER_MEANINGS: Readonly<Record<ForkSettler, string>> = {
  'the owner':
    'only the owner may settle this. It is a governance question, and this is what puts a fork in their queue',
  'an agent':
    'this is an engineering fork. Whoever picks it up may settle it by citing evidence it already has',
  'the parent':
    'it goes up one level, to the agent that spawned the one that filed it, and not to the owner',
  'a measurement':
    'nobody has to judge it. A named experiment answers it, and the fork says which experiment that is',
}

/** What the absence claims, in the same voice, because absence is an answer here. */
export const FORK_SETTLER_UNSAID_MEANING =
  'nobody has said who settles this fork, which is not the same as saying the owner does'

/**
 * THE ROLE THE OWNER HOLDS, WRITTEN ONCE.
 *
 * `who_settles_it` and `decided_by` both have to say "the owner" and never the owner's name: a name in a
 * vocabulary makes one installation's owner part of the schema. The word is the same word in both
 * places, from here, so the guard that reads one and the queue that reads the other cannot end up
 * matching different strings.
 */
export const THE_OWNER: ForkSettler = 'the owner'
