// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { assets } from './assets.ts'

/**
 * THE PEOPLE OF THIS INSTALLATION. One row per person, and the first version holds one: the owner.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TABLE AND NOT A RECORD KIND
 * ---------------------------------------------------------------------------------------
 *
 * A record belongs to a project. A person does not. The owner is the same person in every project
 * on this machine, so a `person` record would be one row per project saying the same thing, and a
 * message addressed to the owner would have to name which copy. Criterion M2 of
 * design/messages/ACCEPTANCE.md settles it: the two registries are installation-level tables.
 *
 * A DURABLE AGENT ALREADY HAS A RECORD KIND, AND THAT KIND IS KEPT. `agents` below is the registry
 * row; the project record of kind `agent` stays exactly as it is, and `agent_records` says which
 * registry row it is. Nothing is deleted, because an inbox and a conversation still point at the
 * record.
 *
 * WHAT A PARTICIPANT REF IS. Two columns, a kind and an id: `person` with a row of this table, or
 * `agent` with a row of `agents`. It is two columns rather than one packed string because M2 says a
 * message references a participant by kind and id, and a packed string has to be split by a reader
 * before it can be joined to anything.
 *
 * `created_by_kind` AND `created_by_id` ARE NULLABLE, AND NULL IS THE HONEST ANSWER FOR THE OWNER
 * ROW. The migration writes that row; no person and no agent asked for it. NULL here means nobody
 * recorded who created this row, which is not the same as "the product did it".
 */
export const people = aPartTable(sqliteTable(
  'people',
  {
    /**
     * The office owner's is whatever MOLE_OFFICE_OWNER_ID said at the first migrate, or `owner` when
     * nothing said (src/server/db/owner-setting.ts). New rows get a nanoid from lib/participants.ts.
     */
    id: text('id').primaryKey(),
    /** The name a reader sees. A person may change their own and may change any agent's. */
    name: text('name').notNull(),
    /** The short address: lowercase letters, digits and dashes, 2 to 40 characters, unique. */
    handle: text('handle').notNull(),
    /**
     * The `assets` row holding the picture. Never NULL: a participant is created with its generated
     * default already written down, and resetting to the default points back at that same row.
     */
    avatarAssetId: text('avatar_asset_id')
      .notNull()
      .references(() => assets.id),
    /** Short free text the person set themselves, at most 60 characters. NULL means nobody has set one. */
    state: text('state'),
    /** When the state was set, local wall clock. NULL exactly when `state` is NULL. */
    stateAt: text('state_at'),
    /**
     * WHETHER THIS PERSON IS HERE, AS THEY THEMSELVES SAY: `online`, `offline` or `invisible`.
     *
     * NULL means nobody has chosen, which is read as online because a decision
     * says the default is online. The two are kept apart on purpose: a reader is told "they have not
     * chosen" rather than "they set themselves online", and invariant 5 of USER.md is the reason.
     *
     * `invisible` is online towards an agent they have written to and nothing at all towards one they
     * have not.
     * Where that is decided is `participantPresence` in src/server/lib/presence.ts, once.
     *
     * THIS IS NOT `state` ABOVE. State is the free line about what they are doing; working and do not
     * disturb belong in a separate field from online and offline. Neither column reads the other.
     */
    presenceChoice: text('presence_choice'),
    /** When they chose it, local wall clock. NULL exactly when `presence_choice` is NULL. */
    presenceChoiceAt: text('presence_choice_at'),
    /**
     * HOW THIS PERSON WANTS THE NUMBER ON THE CHAT CIRCLE DRAWN: `merged` or `two`.
     *
     * `merged` is the contacts' unread messages and the number of unread groups added into one
     * number. `two` is two bubbles of different colours, one for each half. Criterion M32: merged is
     * the default, and a setting changes it.
     *
     * NULL MEANS NOBODY HAS CHOSEN, which is read as `merged` because that is the default.
     * The two are kept apart for the reason `presence_choice` above keeps them apart, and it is
     * invariant 5 of USER.md: a reader is told nobody chose rather than told they chose.
     *
     * `CIRCLE_SHOWS` in shared/participants.ts declares the two words for the door, the reply and
     * the control at once, so no screen can offer a word the door refuses.
     */
    circleShows: text('circle_shows'),
    /**
     * WHICH PICTURE THIS PERSON HAS PUT ON THE ROUND CHAT BUTTON, by its declared name.
     *
     * NULL means nobody has chosen a picture. The button then draws mole-at-the-sill.
     *
     * IT IS NOT `circle_shows` ABOVE. That says how the button's NUMBER is drawn; this says which
     * PICTURE it carries. `CIRCLE_PICTURES` in shared/messages.ts declares the names it may hold,
     * each beside the file that draws it.
     */
    circlePicture: text('circle_picture'),
    /**
     * WHICH NAME A RECORD NAMED IN A MESSAGE IS DRAWN UNDER, for this person: `label` or `title`.
     *
     * Criterion M47: a person chooses whether a link shows reading level 1 or 2, and 1 is the default. `label` is
     * the first rung of the reading ladder and `title` is the second, and the two words are the
     * ladder's own so the stored word is the one the short-forms route answers to.
     *
     * NULL MEANS NOBODY HAS CHOSEN, which is read as `label` because that is the default the owner set.
     * The two are kept apart for the reason `circle_shows` above keeps them apart: invariant 5 of
     * USER.md, a reader is told nobody chose rather than told they chose.
     */
    messageLinkLevel: text('message_link_level'),
    /**
     * HOW A LINK IN A MESSAGE IS LAID OUT IN THE BUBBLE, for this person: `own-line` or `inline`.
     *
     * Criterion M48: a link is set as normal text or on its own line, centred, and its own line is the default. `own-line` gives
     * the link a line to itself, the width of the bubble, its words centred. `inline` lets it run
     * on with the sentence and break across lines like any other words.
     *
     * IT IS NOT `message_link_level` ABOVE. That says WHICH NAME the link draws; this says WHERE
     * the link sits. NULL means nobody has chosen, which is read as `own-line`.
     */
    messageLinkLayout: text('message_link_layout'),
    /**
     * WHETHER A MESSAGE SAYS WHICH PROJECT IT IS IN: `always`, `never`, or NULL because nobody has
     * chosen, which is read as `never`. Criterion M73, migration 0143.
     */
    messageProjectMark: text('message_project_mark'),
    /**
     * HOW A PICTURE IN A MESSAGE IS DRAWN: `shown`, `pressed`, `path`, or NULL because nobody has
     * chosen, which is read as `shown`. Criterion M64; it was a setting of the browser until
     * a decision moved it onto the person. Migration 0143.
     */
    messagePictures: text('message_pictures'),
    /**
     * WHETHER MEDIA A RECORD POINTS AT ARE LOADED, AND WHEN: `with-page`, `never`, `on-press`, or
     * NULL because nobody has chosen, which is read as `with-page`. Criterion U5, migration 0163.
     *
     * IT IS NOT `message_pictures` ABOVE. That is a picture inside a CHAT MESSAGE and it answers
     * `shown`, `pressed` or `path`; this answers about media a REPORT points at, and its middle
     * answer shows the name, the size and a press rather than the path. `MEDIA_LOAD_CHOICES` in
     * shared/mediaload.ts declares the three words for the door, the reply and the control at once,
     * so no screen can offer a word the door refuses.
     */
    mediaLoad: text('media_load'),
    /**
     * HOW BIG THE CHAT'S OWN TEXT IS: `small`, `normal`, `large`, or NULL because nobody has chosen,
     * which is read as `normal`. Criterion M112, migration 0152.
     *
     * IT IS NOT THE APPEARANCE BAR'S TEXT SIZE, which is `data-size` on `<html>`, remembered in the
     * browser and moving the whole app; this moves the chat alone and follows the person.
     *
     * THE COLUMN WAS ADDED BY MIGRATION 0152 AND THIS DECLARATION WAS LEFT OUT, so the drizzle
     * schema and the database disagreed about the shape of `people` while raw SQL wrote and read the
     * column. That is the ninth invariant sitting in this file. NO MIGRATION IS ADDED HERE, because
     * the column already exists in every database that has run 0152; this only makes the declaration
     * say what the database already says.
     */
    chatTextSize: text('chat_text_size'),
    /**
     * WHICH KEY SENDS A MESSAGE: `shift-or-alt-enter` or `enter`, or NULL because nobody has chosen,
     * which is read as `shift-or-alt-enter` — Enter makes a new line and Shift+Enter or Alt+Enter
     * sends. Migration 0188, by a decision. A
     * person's own, like `chat_text_size` above.
     */
    sendKey: text('send_key'),
    /**
     * WHICH KEYBOARD SHORTCUTS ARE ON, as JSON: {"singleKeys": boolean, "off": [shortcut names]}, or
     * NULL because nobody has chosen, which is read as every shortcut on. Item 5 of a
     * decision, migration 0191. The one reading is
     * `readShortcutSettings` in `src/shared/participants.ts`.
     */
    shortcuts: text('shortcuts'),
    /**
     * WHEN THE CHAT CIRCLE SHOWS: `when-unread` or `always`, or NULL because nobody has chosen, which
     * is read as `when-unread`, what the circle does today. Migration 0340. A person's own, like
     * `chat_text_size` above; the words are `CHAT_BUTTON_STAYS` in `src/shared/participants.ts`.
     */
    chatButtonStays: text('chat_button_stays'),
    /**
     * HOW THE CHAT OPENS: `split` (beside the page) or `window`, or NULL because nobody has chosen,
     * which is read as `split`, how the chat opens today. Migration 0340; the words are
     * `CHAT_OPENS_AS` in `src/shared/participants.ts`.
     */
    chatOpensAs: text('chat_opens_as'),
    /**
     * HOW THE CHAT IS LAID OUT: `one` (the earlier single column) or `two` (side by side), or NULL
     * because nobody has chosen, and the chat then lays itself out by its width, as it does today.
     * Migration 0343.
     */
    chatLayout: text('chat_layout'),
    /**
     * THE MODE A PERSON STARTS IN: `inspect` (Developer mode), which the office writes for a person it
     * makes, or NULL, a person made before the column, read as Normal mode. The page takes it only
     * while its browser has stored no mode. Migration 0354.
     */
    startingMode: text('starting_mode'),
    /**
     * A PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE: JSON, a list of a short word and a colour, or
     * NULL because nobody has made one. Migration 0341. The one reading is `readMessageLabels` in
     * `src/shared/message-label.ts`.
     */
    chatLabels: text('chat_labels'),
    /**
     * A PERSON'S OWN SETTINGS FOR THE FOUR FLAGS THE OFFICE SHIPS AND FOR 'NO MARK': JSON, keyed by
     * `just-ask`, `proposal-first`, `align`, `give-options` and `none`, each holding the things the person changed. NULL means
     * nobody changed any, and the defaults hold. Migration 0346. The one reading is
     * `readShippedFlags` in `src/shared/intent-mark.ts`.
     */
    shippedFlags: text('shipped_flags'),
    /** A person's named colours and agent assignments as JSON, or NULL when none were made. */
    agentTags: text('agent_tags'),
    /**
     * A PERSON'S LOOK AND THE THEMES THEY MADE: JSON, `{"chosen": <the id of a look>, "own": [<a theme>]}`,
     * or NULL because nobody has chosen or made one. Migration 0347. The one reading is in
     * `src/shared/own-themes.ts`, and only that person is given `own` back.
     */
    themes: text('themes'),
    /**
     * WHETHER THIS PERSON OWNS THE OFFICE, AND WHERE THEIR NAME CAME FROM. NULL means they do not own
     * it. The three words it may hold, and what each means, are declared once in
     * src/server/db/owner-setting.ts; the one reader is src/server/lib/owner.ts. At most one row
     * carries it (the unique index below). The owner migration `the_owner_comes_from_the_installer`.
     */
    officeOwner: text('office_owner'),
    language: text('language'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    /** The participant who created this row, or NULL because nobody recorded one. */
    createdByKind: text('created_by_kind'),
    createdById: text('created_by_id'),
    /** The world this person is a citizen of. See CITIZENSHIP below. */
    homeWorld: text('home_world'),
    /** The installation that world belongs to. See CITIZENSHIP below. */
    homeInstallation: text('home_installation'),
    /** When they became a citizen of it. See CITIZENSHIP below. */
    citizenSince: text('citizen_since'),
    /**
     * WHICH ROLE CARD THIS PERSON HOLDS: one word from the `personCards` list in
     * design/permissions/roles.json, or NULL.
     *
     * Criterion P45: a person has a role card
     * too. It is NOT the `role` column on `agents`: the two lists are separate in the declaration
     * and nothing reads across them, so a word here is never a role an agent could be registered as.
     *
     * NULL MEANS NOBODY WROTE ONE, which is every row made before this column existed. It is read as
     * `A_PERSON_WITH_NO_ROLE_READS_AS`, and a screen says no role set rather than drawing a word
     * nobody chose — the same arrangement the agent column has.
     */
    role: text('role'),
    /**
     * WHAT THIS PERSON DOES, IN THEIR OWN WORDS. Criterion P45.
     *
     * IT IS NOT THE ROLE ABOVE, AND THE DIFFERENCE IS WHOSE WORDS THEY ARE. The role is where they
     * stand in the Office and every holder of one card stands the same way; this is their occupation,
     * it is theirs to write, and nothing checks it. Criterion P45 makes one person an engineer
     * and says nothing about anybody else, which is why it is a fact on a row and not a line in a
     * declaration.
     *
     * NULL MEANS NOBODY HAS WRITTEN ONE. A screen says so rather than guessing an occupation.
     */
    occupation: text('occupation'),
    /**
     * WHICH PORTRAIT THIS PERSON HAS ON THEIR CARD, by the address it is served at, or NULL.
     *
     * Criterion P47: the person picks one. It is one of the
     * three painted for the card they hold, or a picture of their own under
     * `data/portraits/custom/<who>/`, which `.gitignore` keeps out of the repository.
     *
     * NULL MEANS THEY HAVE NOT CHOSEN, and then the card's own portrait is drawn — which is the
     * role's first until somebody chooses another. A default is not a choice, and this column is
     * where a choice is written down.
     *
     * IT IS NOT `avatar_asset_id`. That is the small round picture beside their name everywhere in
     * the product; this is the drawing on their role card, and the two are different pictures of
     * different sizes for different places.
     */
    portrait: text('portrait'),
    /**
     * HOW THIS PERSON WISHES TO BE ADDRESSED, migration 0181. Four
     * parts, declared once in src/shared/address-as.ts: a name, a second-person form, a third-person
     * form and a title. Each is theirs to write and nobody else's.
     *
     * NULL MEANS NOBODY HAS SET THAT PART, and a reader never fills one in.
     */
    addressName: text('address_name'),
    addressSecondPerson: text('address_second_person'),
    addressThirdPerson: text('address_third_person'),
    addressTitle: text('address_title'),
    // WHO LAST SET HOW THEY WISH TO BE ADDRESSED, AND WHEN, migration 0182. NULL when
    // nobody recorded it: before 0182, or never set.
    addressSetByKind: text('address_set_by_kind'),
    addressSetById: text('address_set_by_id'),
    addressSetAt: text('address_set_at'),
  },
  (t) => [
    uniqueIndex('people_handle_idx').on(t.handle),
    // At most one owner: the index is on a constant over the rows that carry the mark (the owner migration `the_owner_comes_from_the_installer`).
    uniqueIndex('people_one_office_owner').on(sql`(1)`).where(sql`${t.officeOwner} IS NOT NULL`),
  ],
), { existingArchive: true })
