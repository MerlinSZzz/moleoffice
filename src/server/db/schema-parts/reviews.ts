// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * EVERY COLUMN OF `reviews` THAT NAMES A CONVERSATION, in the spelling SQL uses.
 *
 * ONE FACT — WHICH CONVERSATIONS ROUND EIGHT ALREADY ACCOUNTS FOR — AND THIS IS THE PLACE IT IS
 * WRITTEN DOWN. src/server/db/review-migration.ts brings a round-seven `mode = 'review'`
 * conversation forward only when NO review names it, and until 31 August 2026 it worked that out
 * for itself by asking about `from_thread_id` alone. Sending a review writes `sent_thread_id`, so
 * the conversation Send had just created matched nothing, was counted as work still to do for ever,
 * and `prepareToServe` REFUSED TO SERVE at the next restart — pressing Send left the product unable
 * to start with no way back. Two places working out one fact, free to disagree, and nothing failing
 * when they did.
 *
 * NO TEST COMPARES THIS LIST WITH THE COLUMNS OF `reviews`. A new column of `reviews` that names a
 * conversation must be added to this list by hand, so the list is kept here just above the table for
 * whoever adds such a column to see.
 */
export const REVIEW_COLUMNS_NAMING_A_CONVERSATION = ['from_thread_id', 'sent_thread_id'] as const

/**
 * SOMEBODY STARTED COLLECTING REMARKS, FROM SOMEWHERE, AND THESE ARE THE ONES IN IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A REVIEW IS A ROW AND NOT A SETTING IN A BROWSER
 * ---------------------------------------------------------------------------------------------
 *
 * Until this table a review was `{on, threadId}` in browser storage, with no project in it. So it
 * was a MODE rather than a thing: it could not be listed, it could not be read by anything other
 * than the browser that switched it on, it could not say where it was started from, and a second
 * browser knew nothing about it. This is that same fact stored where everything else in Mole Office is
 * stored.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS STORED HERE AND WHAT IS WORKED OUT ON EVERY READ
 * ---------------------------------------------------------------------------------------------
 *
 * STORED: where it was started from, when, by whom, where it stands, and — once collecting has
 * finished — exactly which remarks were in it.
 *
 * WORKED OUT: what counts as inside, and, while it is still collecting, which remarks those are.
 * Both come from `entry` and from the containment Mole Office already stores, so there is no second copy
 * of the rule to disagree with the entry it was derived from. `src/server/lib/reviews.ts` is where
 * that derivation lives and it states what it counts and what it deliberately does not.
 *
 * THE POINT OF FREEZING IS THAT THE TWO ANSWERS PART COMPANY. While a review collects, a `part_of`
 * link written today changes what is inside it, and that is right. Once somebody has finished
 * collecting, a link written next week must not change what last week's review contained — so the
 * membership is written down, once, in `frozen`.
 *
 * ---------------------------------------------------------------------------------------------
 * IT IS NEVER DELETED AND IT IS NEVER SENT BY ITSELF
 * ---------------------------------------------------------------------------------------------
 *
 * Leaving the place a review was started from stops it collecting THERE. It does not end the
 * review and it writes nothing: whether the person is standing inside a review's scope right now is
 * a question about where they are, asked and answered per request, and a stored `paused` column
 * would be a second answer to it that could be left behind by a browser that crashed.
 *
 * AUTHORED, and workspace-owned: a review is about one project's work, like the conversation it
 * used to be stored as.
 */
export const reviews = aPartTable(sqliteTable(
  'reviews',
  {
    /** anOfficeId() in src/server/lib/ids.ts. */
    id: text('id').primaryKey(),
    /** The project whose work is being reviewed. */
    workspaceId: text('workspace_id').notNull(),
    /**
     * WHERE IT WAS STARTED FROM, as JSON: the same `Context` shape a remark stores.
     *
     * It is the input to everything else. What counts as inside is derived from it, so a review
     * started from a block of a report and one started from the report itself collect the same
     * things — the entry says where the person was standing, and the rule says what that means.
     */
    entry: text('entry').notNull(),
    /** `collecting`, `collected`, `organised` or `sent`. See REVIEW_STATES in lib/reviews.ts. */
    state: text('state').notNull().default('collecting'),
    /** LOCAL wall clock. A remark written before this is not in this review. */
    startedAt: text('started_at').notNull(),
    /** Who started it: `${actor.type}:${actor.id}`, the same spelling every other table uses. */
    startedBy: text('started_by').notNull(),
    /** LOCAL wall clock when collecting finished, or NULL because it has not. */
    collectedAt: text('collected_at'),
    /**
     * THE MEMBERSHIP AS IT STOOD WHEN COLLECTING FINISHED, as JSON, or NULL while it is collecting.
     * src/server/lib/frozen-membership.ts is the one writer and reader, and says what the JSON holds.
     *
     * NULL here means "nobody has finished collecting", which is not the same as "it contained
     * nothing" — a review frozen with no remarks in it stores an empty list of members, and the two
     * must not read the same.
     */
    frozen: text('frozen'),
    /**
     * THE CONVERSATION THIS REVIEW'S REMARKS WERE WRITTEN INTO, BEFORE REMARKS WERE THEIR OWN THING.
     *
     * NULL on every review started after this table existed, and that is the ordinary case. Round
     * seven stored a review as a row of `agent_threads` and each remark as a row of
     * `agent_messages`, so the only reviews that carry one are the ones the migration in
     * src/server/db/review-migration.ts brought forward.
     *
     * THE WORDS ARE NOT COPIED HERE AND MUST NEVER BE. They stay in `agent_messages`, and a review
     * that names a conversation reads them from it. A copy would be the same words in two rows,
     * both writable, free to disagree.
     */
    fromThreadId: text('from_thread_id'),
    /**
     * THE CONVERSATION THIS REVIEW WENT OUT IN, or NULL because nobody has sent it.
     *
     * ONE REVIEW, ONE CONVERSATION. `POST /api/reviews/<id>/send` writes each comment into it as a
     * message carrying who that comment is for, and dispatch groups those messages by recipient. It
     * writes no run: each recipient is given one message from the person in the message pool, holding
     * every comment that went to it. So the review stays one thing while the work partitions.
     *
     * A REVIEW BROUGHT FORWARD FROM ROUND SEVEN IS SENT IN THE CONVERSATION ITS REMARKS ARE ALREADY
     * IN, and this column then holds the same id as `from_thread_id`. That is the two facts
     * agreeing rather than one column meaning two things — see the migration 0090 SQL.
     */
    sentThreadId: text('sent_thread_id'),
    /**
     * WHAT A READING SAID ABOUT SEVERAL OF THESE COMMENTS AT ONCE, as JSON, or NULL because nothing
     * has read them. `[{says, commentIds}]`, the `OrganisedGroup` shape in src/shared/intent.ts.
     *
     * NULL AND `[]` ARE DIFFERENT ANSWERS. NULL is "nobody has read these comments". `[]` is
     * "somebody read them and found nothing true of several at once". The fifth engineering rule is
     * the whole reason this column is nullable rather than defaulted.
     *
     * ONE ROW HOLDS IT, AND THAT IS THE POINT. A group is a claim about several comments, so it is
     * stored once. It used to be written into the reading kept beside every member — one copy per
     * comment, with nothing holding the copies together — and a person correcting one member's
     * reading then left the others announcing a group that member was no longer in. See the header
     * of drizzle/0110 for the measurement.
     */
    readGroups: text('read_groups'),
    /**
     * LOCAL wall clock when the review was sent, or NULL because it has not been.
     *
     * The companion of `collected_at`. It is written only when NOTHING was left waiting: a Send
     * that hands over four comments and holds one back leaves the review where it was, because it
     * can be sent again once the held one is answered for.
     */
    sentAt: text('sent_at'),
    /**
     * HOW WIDE THIS REVIEW IS: `local` or `global`. The single stored answer.
     *
     * `local` means what every review before this column was: the scope is worked out from `entry`,
     * where the person was standing. `global` means the whole project, and `entry` is not read at
     * all. One field rather than two kinds, because a project-wide review has the same members, the
     * same freeze, the same routing and the same pane as a local one, and only one predicate differs.
     *
     * IT DEFAULTS TO `local`, so every review that existed before this column reads exactly as it
     * read before. A later step moves the ones that were project-wide in all but name — the ones
     * whose entry names a page or a screen surface, which `SCOPE_READERS` was already widening to
     * the whole project — onto `global`.
     *
     * THE PARTIAL UNIQUE INDEX THAT MAKES TWO PROJECT-WIDE REVIEWS COLLECTING AT ONCE IMPOSSIBLE IS
     * NOT DECLARED HERE, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. It is
     * `CREATE UNIQUE INDEX reviews_one_global_collecting ON reviews (workspace_id) WHERE reach =
     * 'global' AND state = 'collecting'`, and it must be created AFTER the backfill that sets
     * `reach`, never before: created first it would be satisfied by a corpus where nothing is
     * `global` yet, and the loud failure it is bought for — a corpus that already holds two
     * project-wide reviews collecting — could never happen. drizzle-kit emits a partial unique index
     * into the generated file (`session_resources_live_idx` above is declared in exactly this form),
     * so declaring it here would land it in the create-the-tables migration, four waves before the
     * backfill it is supposed to follow. It is raw SQL inside the backfill step instead, and
     * tests/schema-tables.test.ts names it as the one declared exception when it compares this
     * file's index set with the database's, so the omission can never be mistaken for drift and a
     * later `db:generate` cannot re-emit it silently.
     */
    reach: text('reach').notNull().default('local'),
    /**
     * THE AGENT RECORD OF THE AGENT THAT STARTED THIS REVIEW, or NULL because a person did.
     *
     * It does one thing: it puts that agent first in the recipient picker for this review.
     *
     * AN AGENT MAY START A PROJECT-WIDE REVIEW. A review is attributed on screen, it files an item
     * in the person's queue with Stop it or Leave it running, and the person can stop any of them —
     * so it is loud by construction, and requiring the person's press every time costs them
     * something without adding protection.
     *
     * This comment previously said that an agent could ask for a review but could not start one,
     * although the route never checked the actor. The schema and code therefore disagreed.
     * `tests/an-agent-may-start-a-review-of-the-whole-project.test.ts` fails when this comment and
     * the route disagree again.
     */
    startedByAgent: text('started_by_agent'),
    /**
     * THE COMMENTS THIS REVIEW TOOK IN WHEN IT STARTED, as a JSON array of comment record ids, or NULL
     * because the review was started before this column existed and nobody recorded it.
     *
     * Comments kept before a review started, not sent and in no review, join it when it starts.
     * `startReview` writes this in the same insert that writes the review, and `membersOf` reads it.
     * See drizzle/0202.
     */
    takenIn: text('taken_in'),
    /**
     * WHO THE PERSON SAID THE WHOLE REVIEW GOES TO, as the JSON recipient `chosenRecipient` holds, or
     * NULL because nobody has said. Then the review goes to the agent recorded as writing the page it
     * was started on, and to nobody when no such agent is recorded. `goesToOf` in lib/reviews.ts is the
     * one reader. Written by POST /api/reviews/:id/recipient.
     */
    goesTo: text('goes_to'),
  },
  (table) => [
    // The one list there is: this project's reviews, newest first.
    index('reviews_workspace_started_idx').on(table.workspaceId, table.startedAt),
  ],
), { existingArchive: true })
