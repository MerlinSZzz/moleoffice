// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, readStoredWord, type WordKey } from './i18n.ts'
import { cardWordKey } from './card-words.ts'
import { IN_A_TERMINAL_WORD } from './terminals.ts'
/**
 * HOW THE CONTACTS LIST IS GROUPED, AND THE ONE PLACE THE TWO TOP GROUPS ARE DECLARED.
 *
 * The contacts are in two top groups, Human and Agent. Nobody may rename either, and no contact may be
 * put into the other side's groups. Under each top group sit
 * ordinary second-level groups the person may add, rename and move contacts between; under Agent the
 * default arrangement is by role, in this order: secretary, inspector, supervisor, worker, other, retired.
 * Criteria M119 and M120 of design/messages/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * TWO LOCKED TOP GROUPS, AND THEY ARE NOT ROWS
 * ---------------------------------------------------------------------------------------
 *
 * Human and Agent are the first level. They are declared here, they are never stored, and no door
 * renames one: a person's own act cannot reach them. Every contact falls onto one side by what it
 * is — a person onto Human, an agent or a writer nobody registered onto Agent — and a placement
 * that would cross the line is refused by the server rather than drawn as though it had happened.
 *
 * THE OLD THREE GROUPS ARE GONE. `human`, `agent` and `special` used to be the whole arrangement.
 * `human` and `agent` are now the two top groups rather than second-level rows, and `special` is
 * replaced by the role groups: the coordinator holds a secretary card, so it sits in `secretary`
 * with every other secretary. A stored row or placement naming one of those three old keys is read
 * as naming no group, so the old arrangement falls back to the role default instead of resurfacing
 * as a group nobody can explain.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND LEVEL IS COMPUTED UNTIL SOMEBODY CHANGES IT
 * ---------------------------------------------------------------------------------------
 *
 * Under Human is one default group, People. Under Agent are the six role groups, in their order:
 * Secretary, Inspector, Supervisor, Worker, Other and Retired. `Other` holds every address that
 * has written or been written to and holds no registry row — a writer nobody registered — and it
 * also holds a registered agent whose card names no role this product knows. `Retired` holds an
 * agent whose registry row is retired, whatever card it held.
 *
 * A DEFAULT GROUP IS NOT STORED. `src/server/lib/contacts.ts` merges this declaration with the
 * rows somebody wrote, so a fresh installation has the default arrangement with no rows at
 * all, and a new agent lands in its role group with nothing written when it arrives.
 */

/**
 * THE TWO TOP GROUPS, AND THE ONLY TWO.
 *
 * `key` is what a placement crosses against and what the collapse state is stored under. `name` is
 * the heading a reader sees; it is declared and not editable, which is what "locked" means here.
 */
export type ContactSide = 'human' | 'agent'

export const CONTACT_SIDES: readonly { key: ContactSide; name: string }[] = [
  { key: 'human', name: 'Human' },
  { key: 'agent', name: 'Agent' },
] as const

/** One second-level group under one of the two top groups, or a group somebody made. */
export interface ContactGroup {
  /** What names this group in a request and in a stored row. */
  key: string
  /** The heading a reader sees. A default group has its default text until the person renames it. */
  name: string
  /** Where it sits inside its side, counting from zero. Only ever an order somebody set. */
  at: number
  /** True when somebody made this group; false for one this product declares. */
  made: boolean
  /** Which of the two top groups this sits under. Fixed when the group is made. */
  side: ContactSide
  /**
   * WHETHER THE PERSON HAS FOLDED IT AWAY. A default group has a default — `retired` starts
   * collapsed — and a stored state, once the person folds or unfolds it, is what wins. The panel
   * reads this, and it is the same on every machine because it is stored against the person.
   */
  collapsed: boolean
}

/** The one default group under Human. A person lands here with nothing written. */
export const THE_HUMAN_GROUP_KEY = 'people'

/** The default text of a role group, keyed the way a placement names it. */
export const AGENT_ROLE_GROUPS: readonly { key: string; name: string }[] = [
  { key: 'secretary', name: 'Secretary' },
  { key: 'inspector', name: 'Inspector' },
  { key: 'supervisor', name: 'Supervisor' },
  { key: 'worker', name: 'Worker' },
  { key: 'other', name: 'Other' },
  { key: 'retired', name: 'Retired' },
] as const

/** The group an agent with no readable card is put in. Not a role: the absence of one. */
export const OTHER_GROUP_KEY = 'other'

/** The group a retired agent is put in, whatever card it held. Criterion M121. */
export const RETIRED_GROUP_KEY = 'retired'

/** The order of the role groups on the Agent side. */
export const AGENT_ROLE_GROUP_ORDER: readonly string[] = AGENT_ROLE_GROUPS.map((one) => one.key)

/**
 * THE GROUPS THIS PRODUCT DECLARES, in the order they are drawn inside their side.
 *
 * Human first, because it is the first top group. The six role groups follow, in their order. Every
 * one of them is computed: a fresh installation has no `contact_groups` rows at all.
 */
export const DEFAULT_CONTACT_GROUPS: readonly ContactGroup[] = [
  { key: THE_HUMAN_GROUP_KEY, name: 'People', at: 0, made: false, side: 'human', collapsed: false },
  ...AGENT_ROLE_GROUPS.map(
    (one, at): ContactGroup => ({
      key: one.key,
      name: one.name,
      at,
      made: false,
      side: 'agent',
      collapsed: one.key === RETIRED_GROUP_KEY,
    }),
  ),
]

/**
 * The word-list key of each group this product declares, so its heading reads in the page language.
 *
 * A ROLE GROUP IS NAMED BY ITS CARD'S WORD. The four role groups are the four agent cards, so their
 * headings are read from the card words in src/shared/card-words.ts and not from a second set of
 * words that could come to say something else (problem SGTqdnfCmQxh, invariant 9). Only the three
 * groups that are not cards have words of their own here.
 */
const DECLARED_GROUP_WORDS: Readonly<Record<string, WordKey>> = {
  people: 'chatLive.group.people',
  ...Object.fromEntries(
    AGENT_ROLE_GROUPS.flatMap((one) => {
      const word = cardWordKey(one.key)
      return word === null ? [] : [[one.key, word] as const]
    }),
  ),
  other: 'chatLive.group.other',
  retired: 'chatLive.group.retired',
}

/**
 * A HEADING BEGINS WITH A CAPITAL where the language has capitals. A card's word is written to sit
 * inside a sentence ("the worker card"), and a group heading is that same word standing alone, so in
 * English it reads "Worker". Chinese has no capitals and is drawn unchanged.
 */
function asAHeading(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * THE HEADING A READER SEES FOR ONE SECOND-LEVEL GROUP.
 *
 * A group this product declares, whose name is still the declared English word, is read from the
 * word lists, so it is drawn in the page language. Any other name was written by a person, when
 * they made the group or renamed a declared one, and it is drawn as they wrote it. The server sends
 * the name either way; a stored row for a declared group that was only moved still holds the
 * declared word, which is why the name and not the row decides.
 */
export function groupHeading(group: Pick<ContactGroup, 'key' | 'name' | 'made'>): string {
  const word = theDeclaredWordOf(group)
  if (word === null) return content(group.name)
  return cardWordKey(group.key) === null ? readStoredWord(word) : asAHeading(readStoredWord(word))
}

/**
 * WHETHER THAT HEADING IS A LABEL FROM THE WORD LISTS OR A NAME A PERSON WROTE. A page styles a label
 * as a label and keeps a person's name in the case they wrote it (wave 13q's rule on titles).
 */
export function groupHeadingIs(group: Pick<ContactGroup, 'key' | 'name' | 'made'>): 'label' | 'content' {
  return theDeclaredWordOf(group) === null ? 'content' : 'label'
}

function theDeclaredWordOf(group: Pick<ContactGroup, 'key' | 'name' | 'made'>): WordKey | null {
  const declared = group.made ? undefined : DEFAULT_CONTACT_GROUPS.find((one) => one.key === group.key)
  const word = DECLARED_GROUP_WORDS[group.key]
  return declared !== undefined && word !== undefined && group.name === declared.name ? word : null
}

/** True when this key names a group this product declares rather than one somebody made. */
export function isABuiltInGroup(key: string): boolean {
  return DEFAULT_CONTACT_GROUPS.some((one) => one.key === key)
}

/** True when this key names one of the two locked top groups rather than a second-level group. */
export function isATopGroup(key: string): key is ContactSide {
  return CONTACT_SIDES.some((one) => one.key === key)
}

/**
 * THE OLD KEYS THAT ARE NO LONGER GROUPS.
 *
 * `human` and `agent` are top groups now, and `special` is gone. A stored row or placement that
 * names one of them is read as naming no second-level group, so a database written under the old
 * arrangement falls back to the role default rather than growing a group at the wrong level.
 */
export const LEGACY_TOP_GROUP_KEYS: readonly string[] = ['human', 'agent', 'special'] as const

/**
 * WHICH SIDE A CONTACT IS ON, by what it is.
 *
 * A person is on the Human side. An agent, and a writer nobody registered, is on the Agent side.
 * This is the one rule the whole arrangement reads, and it is not stored: a copy of it could
 * disagree with the kind beside it.
 */
export function sideOfContact(kind: 'person' | 'agent' | null): ContactSide {
  return kind === 'person' ? 'human' : 'agent'
}

/**
 * WHICH SECOND-LEVEL GROUP A CONTACT IS IN WHEN NOBODY HAS MOVED IT.
 *
 * `role` is the card the registry reads the agent as — `roleReadAs` on the wire, which is `worker`
 * for a row with no card — and it is null for a person and for a writer nobody registered.
 */
export function defaultGroupFor(contact: {
  kind: 'person' | 'agent' | null
  role: string | null
  retired: boolean
}): string {
  if (contact.kind === 'person') return THE_HUMAN_GROUP_KEY
  if (contact.kind === null) return OTHER_GROUP_KEY
  if (contact.retired) return RETIRED_GROUP_KEY
  return contact.role !== null && AGENT_ROLE_GROUP_ORDER.includes(contact.role)
    ? contact.role
    : OTHER_GROUP_KEY
}

/** Every word the grouped contacts list says, here so the panel and a test read the same ones. */
export const CONTACT_GROUP_WORDS = {
  /** The press at a top-level heading that opens the arrangement for that side alone. */
  edit: 'Edit',
  /** The press that closes it again. */
  doneEditing: 'Done',
  /** The press that opens the field for a new group's name. */
  addAGroup: 'New group',
  /** What that field says before anybody types. */
  newGroupPlaceholder: 'A name for the group',
  /** The press that files it. */
  makeIt: 'Make it',
  /** The press that opens the field holding a group's name. */
  rename: 'Rename',
  /** The press that keeps a new name. */
  keepTheName: 'Keep it',
  /** The press that leaves the name as it was. */
  leaveTheName: 'Leave it',
  /** The two presses that move a group or a contact by one place. */
  moveUp: 'Move up',
  moveDown: 'Move down',
  /** The label on the control that moves a contact to another group. */
  whichGroup: 'Group',
  /** The box at the top of the scrolling list that narrows it by name. Criterion M124. */
  filterPlaceholder: 'Filter by name',
  /** What the filter box is called to a reader who cannot see it. */
  filterLabel: 'Filter contacts by name',
  /** The locked top headings. */
  human: 'Human',
  agent: 'Agent',
  /** The press beside Agent that summons an agent, and where the panel-header one moved to. M122. */
  newAgent: 'New agent',
  /** The grey placeholder beside Human. It says in its tooltip that it is not built yet. M122. */
  newAgentPlaceholder: 'New',
  newAgentPlaceholderTitle: 'Adding a person: not built yet.',
  /** The first level the Groups tab draws. Criterion M123. */
  defaultGroup: 'Default group',
  /**
   * THE FOLD UNDER THE DEFAULT GROUPING. Criterion SC1, amended 24 September 2026 and
   * widened the same day. It holds every group the office
   * opened by itself, whether or not the reader is in it, and every group the reader is not in. The
   * groups the reader is in that a person or an agent opened stay open above. The heading is a value, not a
   * sentence, and has no full stop. The sentence gate, a test deleted on 12 November 2026, did not
   * read it as a sentence for that reason.
   */
  officeOpenedAndNotYourGroups: 'Groups Mole Office opened, and groups you are not in',
  /**
   * THE PINNED CATEGORY ABOVE THE DEFAULT ONE, holding the office's own standing group.
   *
   * It names the secretaries' category, and it is pinned above the groups so the person does not have
   * to search for it. The other heading beside it is
   * "Default group"; this word names the people the category is for, not the mechanism that pins it.
   */
  secretaryGroup: 'Secretaries',
  /**
   * THE TOOLTIP ON THE DISABLED EDIT UNDER THE SECRETARIES HEADING.
   *
   * The office keeps the Secretariat group's members itself (src/server/lib/secretariat.ts), so a
   * press that removed a member would be undone at the next start: the sync puts back every
   * un-retired secretary and takes out anybody else. The Edit the other categories have is drawn here
   * too; what it should do here is still an open question, so it is drawn
   * disabled and this says why.
   */
  secretaryGroupEditTitle:
    'Kept by Mole Office: the owner and every secretary that has not retired. It changes with the secretary card, ' +
    'not here.',
  /** Drawn under a group with nobody in it. Not a sentence: a value beside the heading. */
  nobodyInThisGroup: 'nobody is in this group',
  /** How a group heading is read out with its unread count. Kept for the row a reader cannot see. */
  groupWithUnread: (name: string, count: number): string =>
    count === 1 ? `${name}, 1 unread` : `${name}, ${String(count)} unread`,
} as const

/**
 * THE ORDER INSIDE ONE GROUP OF CONTACTS: the rows the person placed by hand first, by the place they
 * were given, then the rows that are online, then every other row. Each of the last two parts keeps the
 * order the list holds them in, which is newest message first (wave 13y round 91, item 22). So a row
 * that is offline is ordered by its newest message, not by when it was last online.
 *
 * One rule for both ends. The contacts door places its rows with it (`placeTheContacts` in
 * src/server/lib/contacts.ts), and a page moving a row to the top of its group after a new message
 * places the rows again with it (src/web/lib/chatdeltas.ts). `handAt` is where a row was placed by
 * hand, or null when it was not. `online` is what the row's dot says, read by `aDotSaysOnline`. A row
 * placed by hand keeps its place whether it is online or not.
 */
export function orderInsideOneContactGroup<T>(rows: readonly T[], handAt: (row: T) => number | null, online: (row: T) => boolean): T[] {
  const byHand = rows.filter((one) => handAt(one) !== null).sort((a, b) => (handAt(a) ?? 0) - (handAt(b) ?? 0))
  const rest = rows.filter((one) => handAt(one) === null)
  return [...byHand, ...rest.filter((one) => online(one)), ...rest.filter((one) => !online(one))]
}

/**
 * WHETHER A DOT SAYS ITS CONTACT IS ONLINE, for the order inside a contact group: the dot is green, or it is grey
 * with the words "In a terminal". The server reads the same two steps (`whichContactsAreOnline` in
 * src/server/lib/presence.ts), and a page reads a dot it is sent with this.
 */
export function aDotSaysOnline(reading: { colour: string; word: string }): boolean {
  return reading.colour === 'green' || reading.word === IN_A_TERMINAL_WORD
}

// ---------------------------------------------------------------------------- the list as it is drawn, a page at a time

/**
 * HOW MANY ROWS ONE PAGE OF THE CHAT'S CONTACT LIST HOLDS UNLESS ANOTHER NUMBER IS ASKED, and the most one page may
 * hold. The chat corner reads the first screen of contacts, and more as the person scrolls, instead of the whole
 * list. A corner shows about twenty rows. The most is there for a page that reads again every
 * row it holds after an event, so the person's place in the list is kept.
 */
export const CONTACT_LIST_PAGE = 25
export const CONTACT_LIST_MOST = 1000

/** What the drawn order reads of a contact row. The whole row, the page's short row and the held row all have it. */
interface ARowToDraw {
  key: string
  who: { kind: string; id: string } | null
  group: string
  at: number
  foldedUnder: { kind: string; id: string } | null
}

/** One row the list draws on top, with the rows folded under it in the order its fold draws them. Criterion P10. */
export interface ARowOnTop<Row> {
  row: Row
  started: Row[]
}

/**
 * ONE GROUP'S ROWS AS THE LIST DRAWS THEM: by `at`, and each row folded under a starter in the same group drawn inside
 * that starter's fold rather than on top. A row whose starter is not among `rows` in this group stays on top, so a row
 * is never hidden under a fold nobody can open (criterion P10).
 *
 * `rows` are the rows already narrowed by name and project, so a row whose starter the narrowing left out is drawn on
 * top. The server pages the list with this, and the chat draws the rows it holds with it.
 */
export function theRowsOnTopOfOneGroup<Row extends ARowToDraw>(rows: readonly Row[], group: string): ARowOnTop<Row>[] {
  const inGroup = rows.filter((one) => one.group === group).sort((a, b) => a.at - b.at)
  const here = new Set(inGroup.flatMap((one) => (one.who === null ? [] : [`${one.who.kind}:${one.who.id}`])))
  const started = new Map<string, Row[]>()
  for (const one of inGroup) {
    const under = one.foldedUnder
    if (under === null || !here.has(`${under.kind}:${under.id}`)) continue
    const starter = `${under.kind}:${under.id}`
    started.set(starter, [...(started.get(starter) ?? []), one])
  }
  const folded = new Set([...started.values()].flat().map((one) => one.key))
  return inGroup
    .filter((one) => !folded.has(one.key))
    .map((row) => ({ row, started: row.who === null ? [] : started.get(`${row.who.kind}:${row.who.id}`) ?? [] }))
}

/**
 * THE WHOLE LIST IN THE ORDER IT IS DRAWN: the sides in their order, each side's groups in theirs, and each group's rows
 * on top by `theRowsOnTopOfOneGroup`. A folded side or a folded group draws no row, so none of its rows is in the order.
 *
 * A page of the list is a run of this order, so the rows a page holds are always the first rows of the list.
 */
export function theRowsOnTopInDrawnOrder<Row extends ARowToDraw>(
  rows: readonly Row[],
  groups: readonly Pick<ContactGroup, 'key' | 'side' | 'collapsed'>[],
  sides: readonly { key: ContactSide; collapsed: boolean }[],
): ARowOnTop<Row>[] {
  return sides
    .filter((side) => !side.collapsed)
    .flatMap((side) => groups.filter((group) => group.side === side.key && !group.collapsed))
    .flatMap((group) => theRowsOnTopOfOneGroup(rows, group.key))
}

/**
 * WHETHER WHAT WAS TYPED IN THE FILTER BOX FINDS A NAME: the words typed, trimmed, anywhere in the name, with case
 * folded. Criterion M124. Nothing typed finds every name.
 */
export function theTypedWordsFind(name: string, typed: string): boolean {
  const needle = typed.trim().toLowerCase()
  return needle === '' || name.toLowerCase().includes(needle)
}
