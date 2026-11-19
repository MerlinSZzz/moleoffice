// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t, type WordKey } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { theNameASelfRegistrationIsReadBy } from '@shared/profile.ts'
/**
 * THE ONE NUMBER ABOUT WHAT IS WAITING ON THE PERSON, READ IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS SO SMALL, AND WHY IT EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Home told the owner four different numbers about one idea — `1 waiting`, `8 waiting to be read`,
 * `48 need you · 7 shown`, and a rail badge reading `Needs you 48` — and the Schedule told the owner a
 * fifth. Four surfaces each worked out for themselves what "waiting on you" means, so the four
 * could not agree and nothing made them.
 *
 * A sixth number is not the fix. The fix is that every surface says the SAME number, worked out
 * once. `GET /api/waiting` is the one reading, `App.tsx` asks for it once per navigation, and the
 * frame and the page are handed the same reply. This file is the two lines that turn that reply
 * into a number, so that no surface can work out its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT IN THE BAND, OR IN THE RAIL
 * ---------------------------------------------------------------------------------------
 *
 * The rail draws the number and so does Home. Putting the function in either would make one of them
 * import the other — the frame importing a page's component, or a page importing the frame — and
 * the second surface that needed it would copy it instead. It reaches the database through nothing
 * and imports one type, so both can have it.
 */

// Type-only, so it is erased at build and no server code reaches the browser bundle. The reply is
// declared where it is served, and read here rather than restated: the two cannot disagree about
// what a waiting row is.
import type { WaitingReply } from '../../server/api/waiting.ts'
import { ONE_PRESS_REQUEST } from '@shared/one-press.ts'
import { READINESS_CHECKLIST } from '@shared/readiness-checklists.ts'
import { SIGNING_PACKAGE } from '@shared/signing-packages.ts'
import type { AskerAndCard, ExcludedReason, WaitingItem, WaitingTier } from '../../server/lib/waiting.ts'
// WHERE A ROW GOES, built from the one place every address in this app is built.
import { pathFor, planTodayPath, readinessPath, signingPackagePath, recordPath, visitorPath, whoPath } from '../components/router.tsx'
import { RESIDENCY_PROPOSAL, RESIDENT_TO_BE_NAMED } from '@shared/residents.ts'

export type { WaitingReply, WaitingItem, WaitingTier }

/**
 * HOW MANY THINGS ARE WAITING ON THE PERSON. The one number.
 *
 * IT IS THE LENGTH OF THE LIST OF ROWS, and never `counts.settle + counts.asked + counts.setAside`.
 * The three parts are the same rows counted by tier and the server proves they sum, but a number
 * told to somebody is the length of a list of things they can open — that is what makes it possible
 * to follow the number and find every one of them, which is the whole point of there being one.
 *
 * WHAT IT DOES NOT INCLUDE is `excluded`, which is what this reading could not list. That is drawn
 * beside the number rather than added into it: see `notCounted`.
 */
export function oneNumber(reply: WaitingReply): number {
  return reply.items.length
}

/** The three parts of the number, by tier. They sum to `oneNumber` because they have one scope. */
export function partsOf(reply: WaitingReply): { settle: number; asked: number; setAside: number } {
  return reply.counts
}

/**
 * How many things this reading knows about and could not list.
 *
 * A list that is short by one is indistinguishable from a complete one unless it says so, so the
 * number and this are always drawn together.
 */
export function notCounted(reply: WaitingReply): number {
  return reply.excluded.reduce((total, group) => total + group.count, 0)
}

/**
 * HOW MANY THINGS ARE YOURS TO SETTLE RIGHT NOW — the first count on the Waiting-on-you page.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE RAIL'S BADGE READS THIS AND NOT `oneNumber`, PROBLEM 8woJrf898igd
 * ---------------------------------------------------------------------------------------
 *
 * The rail said 34
 * while only 7 were the person's to settle. The 34 was `oneNumber`: the whole reading, counting everything
 * waiting on the person, including the whole `asked of you` tier. 7 was the count of what a person acts
 * on first — the forks only a person may settle, the `Yours to settle` band, the first count the
 * page lists.
 *
 * SO THE BADGE AND THE PAGE READ THIS ONE FUNCTION, and neither counts for itself: the rail's badge
 * calls it through `railCount` below, over the reply App.tsx fetched, and the `Yours to settle`
 * band's own count calls it over the same reply. Since a decision of 28 September 2026, the rail
 * adds the agents asking at the door, which wait in the asked tier. A count told to
 * somebody is the number of things they can act on now, found in the first place they look; the
 * rest of the reading is on the page, tiered and counted beside its number by `WaitingCount`.
 *
 * IT IS `counts.settle`, the settle tier's own count. The server proves the three tiers sum to the
 * length of the rows, so a badge beside the page's first band cannot drift from the page.
 */
export function settleCount(reply: WaitingReply): number {
  return reply.counts.settle
}

/**
 * THE RAIL'S NUMBER: what is yours to settle now, and every agent asking at the door.
 *
 * By the owner's decision of 28 September 2026, the rail's number holds what truly waits on the
 * person to decide or act, and an agent asking to come in, or for a card or a new key, is in
 * it. Those asks wait in the asked tier, because a person answers them
 * rather than settles them, so the settle count alone left them out, and the rail said nothing while
 * Home drew them at the top of its band with their press (problem NXEhOBumu5ZZ). The other asked
 * rows stay out, as problem 8woJrf898igd settled: the rail counts what the person can act on now,
 * not the whole reading.
 *
 * THE ACTS ARE THE ONES ONLY THE PERSON'S PRESS ANSWERS, `give-card`, `admit-agent` and `give-new-key`, the same three the
 * server files for a waiting card ask (src/server/lib/waiting.ts).
 */
export function railCount(reply: WaitingReply): number {
  const atTheDoor = reply.items.filter((item) => item.tier === 'asked' && (item.act === 'give-card' || item.act === 'admit-agent' || item.act === 'give-new-key'))
  return settleCount(reply) + atTheDoor.length
}

/**
 * THE VERB ON A ROW, ONE WORD PER ACT.
 *
 * The server has words for these too — `ACT_IN_WORDS` in lib/waiting.ts — and they are a different
 * job: those are the clause inside the sentence a row carries in `why` ("settle this"), built where
 * the facts are. This is the chip on the row, which a person reads without opening anything.
 *
 * THE TYPE IS WHAT KEEPS THE TWO FROM DRIFTING. Both are total over `WaitingAct`, so an act added
 * on the server stops this file compiling until somebody says what to call it here. That is the
 * third of the three fixes CLAUDE.md offers for one fact in two places — a failing build — rather
 * than a comment asking somebody to remember.
 */
export const ACT_WORDS: Readonly<Record<WaitingItem['act'], string>> = {
  get settle() { return t('decisions.act.settle') },
  get answer() { return t('decisions.act.answer') },
  get schedule() { return t('decisions.act.schedule') },
  get accept() { return t('decisions.act.accept') },
  // THE TWO PROBLEM qpq63k1PiBNb ADDS. Each is the verb of the one press the row asks for.
  get confirm() { return t('decisions.act.confirm') },
  get 'confirm-goal'() { return t('g7a.horizons.confirm') },
  // A residency proposal: its own two presses, Confirm and Not now, on its row at the Embassy and on Home.
  get 'confirm-resident'() { return t('decisions.act.confirm-resident') },
  // A new resident's picture and name are still to be chosen. The row leads to its profile, where both are changed.
  get 'name-resident'() { return t('decisions.act.name-resident') },
  get read() { return t('decisions.act.read') },
  // F15 point 2. The chip a person reads on their queue: a card is waiting for their press. The word is that press's
  // own on the ask's page, as for the admission below.
  get 'give-card'() { return t('g6b.ask.grant') },
  // A session that registered itself waits for the press that admits it. The word is that press's own on the ask's
  // page (TheirCard.tsx), so the row and the page it opens say one word.
  get 'admit-agent'() { return t('g6b.ask.admit') },
  // An agent asked for a new key. Its own chip, because the press gives no card. The word is that press's own too.
  get 'give-new-key'() { return t('g6b.ask.newKey') },
  // F16 point 5. A packaged task has something back from outside and waits for its responsible one
  // or the person to say it is finished.
  get 'confirm-return'() { return t('decisions.act.confirm-return') },
}

/**
 * THE NAME A SELF-REGISTRATION IS READ BY: the name its session gave, or its handle when the name is
 * blank. ONE READER FOR THE WHOLE ROW, so its title and its small line cannot call one agent by two
 * names. The handle stays what the record stores and what the waiting reading names in
 * `selfRegistration.handle`; only the person-facing words change.
 */
export { theNameASelfRegistrationIsReadBy }

/**
 * THE WORDS A ROW IS CALLED BY on the Decisions page, in its list of withdrawn asks and on Home.
 *
 * A CARD ASK IS WRITTEN IN THE PAGE'S WORDS from who asks and the card, because its stored title names the asker by a
 * registry id nobody chose. A SELF-REGISTRATION IS WRITTEN FROM THE NAME ITS SESSION GAVE, because its stored title is
 * "<handle> registers itself" and the person looks for the name they gave the agent. Every other row is called by its
 * stored title.
 */
export function theRowsWords(row: {
  title: string
  askerAndCard?: AskerAndCard
  selfRegistration?: { name: string; handle: string }
}): string {
  if (row.askerAndCard !== undefined) {
    return t('decisions.cardAskRow', { asker: content(row.askerAndCard.asker), card: cardWord(row.askerAndCard.card) })
  }
  if (row.selfRegistration !== undefined) {
    return t('decisions.selfRegistrationRow', { name: theNameASelfRegistrationIsReadBy(row.selfRegistration) })
  }
  return content(row.title)
}

/** The rows in one tier, in the order the server sent them: holding work up first, then oldest. */
export function inTier(reply: WaitingReply, tier: WaitingTier): WaitingItem[] {
  return reply.items.filter((item) => item.tier === tier)
}

/**
 * THE THREE TIERS IN READING ORDER, AND THE WORDS FOR EACH.
 *
 * Written once because the band's parts and the queue's headings are the same three things, and two
 * spellings of one tier is how a person ends up reading "set aside" in one place and "put off" in
 * another about the same row.
 *
 * A PART IS ONE WORD WITH ITS NUMBER IN IT, "{n} 项待决定", because Chinese puts a measure word between
 * the number and the noun. Until wave 13q's round 31 nothing read `part`, and the count line drew three
 * other words after a bare number: "1 待决定 · 0 向你提出的请求 · 0 已搁置", beside headings that said
 * 需要你处理 and 已暂放.
 */
export const TIERS: readonly { tier: WaitingTier; part: (n: number | string) => string; heading: string }[] = [
  { tier: 'settle', part: (n) => t('decisions.tier.settle.part', { n }), get heading() { return t('decisions.tier.settle.heading') } },
  { tier: 'asked', part: (n) => t('decisions.tier.asked.part', { n }), get heading() { return t('decisions.tier.asked.heading') } },
  { tier: 'set-aside', part: (n) => t('decisions.tier.set-aside.part', { n }), get heading() { return t('decisions.tier.set-aside.heading') } },
]

/**
 * WHERE A ROW ON THIS LIST GOES WHEN SOMEBODY PRESSES IT. Problem qpq63k1PiBNb.
 *
 * ---------------------------------------------------------------------------------------
 * NOT EVERY ROW IS A RECORD, AND EVERY ROW USED TO BE OPENED AS ONE
 * ---------------------------------------------------------------------------------------
 *
 * The queue opened `#/r/<the row's id>` for every row. That is right for a problem, a task and a
 * fork, and wrong for the three kinds of row whose id is not a record's:
 *
 *   · a PLANNING INTENT lives in its own table — `WaitingItem.id`'s own comment has said since it
 *     was written that such a row "opens the planning screen instead", and nothing did it;
 *   · a VISITING AGENT is a credential, and its page is at the Embassy;
 *   · a MESSAGE opens the chat, where it can be read and answered.
 *
 * A message is a record all the same: its row opens the chat, but its id answers at the record
 * door. `aWaitingRowIsARecord` below says which rows' ids do not.
 *
 * ONE READER, SO HOME AND THE QUEUE CANNOT DISAGREE. Both pages press rows off the same list.
 *
 * `kind` IS THE SERVER'S WORD, and an unknown one falls to the record page — which is what every
 * row did before, so a kind added on the server behaves no worse than it does today rather than
 * pressing to nowhere.
 */
export function whereAWaitingRowGoes(row: Pick<WaitingItem, 'id' | 'kind'>): string {
  if (row.kind === 'goal') return pathFor('horizons')
  if (row.kind === 'planning intent') return planTodayPath()
  // A DEVICE'S CREDENTIAL IS AT THE SAME PAGE AS AN AGENT'S, because it is the same credential door
  // and the same Embassy. Criterion D2: the kind names what is waiting, and the destination does not.
  if (row.kind === 'visiting agent' || row.kind === 'visiting device') return visitorPath(row.id)
  if (row.kind === 'message') return pathFor('messages')
  // A RESIDENCY PROPOSAL OPENS WHERE ITS TWO PRESSES ARE, the Embassy's row. Its record page offers no press that answers it.
  if (row.kind === RESIDENCY_PROPOSAL) return pathFor('embassy')
  // A NEW RESIDENT STILL TO BE NAMED: the row's id is the agent's, and its picture and name are changed on its profile.
  if (row.kind === RESIDENT_TO_BE_NAMED) return whoPath('agent', row.id)
  // A REQUEST FOR ONE PRESS IS ANSWERED WHERE IT IS DRAWN, on Home and in the popup. It has no page of its own.
  if (row.kind === ONE_PRESS_REQUEST) return '/'
  // A READINESS CHECKLIST IS SIGNED ON ITS OWN PAGE, where its signers and the person's press are.
  if (row.kind === READINESS_CHECKLIST) return readinessPath(row.id)
  if (row.kind === SIGNING_PACKAGE) return signingPackagePath(row.id)
  return recordPath(row.id)
}

/**
 * WHETHER A ROW'S ID IS A RECORD'S ID, so a page may ask the record door for it. Problem f1Q1eivN_jSa.
 *
 * Some kinds of row carry an id that is not a record's. A planning intent lives in its own table. A
 * visiting agent or a visiting device is a credential. Asking `GET /api/records/<id>` for either is
 * a wrong request, and the server answers it correctly with 404. Home asked it for every visiting
 * agent on every load, and the browser logged the 404 each time.
 *
 * A message, a goal, a task and a residency proposal are records, even where the row opens another
 * page, so they answer true here. An unknown kind answers true, as `whereAWaitingRowGoes` sends it
 * to the record page.
 */
export function aWaitingRowIsARecord(row: Pick<WaitingItem, 'kind'>): boolean {
  return (
    row.kind !== 'planning intent' &&
    row.kind !== 'visiting agent' &&
    row.kind !== 'visiting device' &&
    row.kind !== ONE_PRESS_REQUEST &&
    // A resident still to be named: the row's id is the agent's id, not a record's.
    row.kind !== RESIDENT_TO_BE_NAMED &&
    // A readiness checklist: the row's id is the checklist's id, in its own table, not a record's.
    row.kind !== READINESS_CHECKLIST &&
    row.kind !== SIGNING_PACKAGE
  )
}

const EXCLUDED_KEYS = {
  "waiting-on-a-worker": "decisions.excluded.waiting-on-a-worker",
  "record-deleted": "decisions.excluded.record-deleted",
  "somebody-else-settles-it": "decisions.excluded.somebody-else-settles-it",
  "done-on-your-words": "decisions.excluded.done-on-your-words",
  "with-a-starter": "decisions.excluded.with-a-starter",
  "withdrawn-by-its-asker": "decisions.excluded.withdrawn-by-its-asker",
} satisfies Record<ExcludedReason, WordKey>

export function excludedWords(reason: ExcludedReason): string {
  return t(EXCLUDED_KEYS[reason])
}
