// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORLDS AND CITIZENS: the words both the browser and the server need for them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A WORLD IS
 * ---------------------------------------------------------------------------------------
 *
 * A world is one running Mole Office with one database. The canonical stack is one world; a server
 * started in a worktree against a copy of the database is another; a server a test starts is
 * another. Criterion G3 of design/ground/ACCEPTANCE.md already made every reply say which world
 * answered. This file is the vocabulary for the next question, which is criterion C1 to C9 of
 * design/messages/ACCEPTANCE.md section 8: which world a person or an agent BELONGS to, and what it
 * takes for one of them to work in a world that is not their own.
 *
 * Everybody, agents and people alike, registers in a world, and registering makes them a citizen of
 * it, with the main world as the default. A citizen may visit another world lawfully, and what was
 * missing was the bridge between worlds, the embassy of real life. Read as: registering in a world is
 * becoming a citizen of it, the main world is the default, and a citizen may work in another world
 * after registering the trip at one shared desk.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN `shared` AND OPENS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws these words and the server stores them, the same reason
 * src/shared/participants.ts gives. Nothing here reads a file, opens a database or runs git.
 *
 * ---------------------------------------------------------------------------------------
 * A WORLD IS NAMED BY ITS DATABASE, NOT BY ITS ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * The identity of a world is the identity of the database it answers from — the sixteen hex
 * characters src/config/database-identity.mjs works out. An address is where a world was reachable
 * at some moment, and a port is handed back to the machine when a process ends. The name is what a
 * person reads and it can be changed. So the database identity is the only one of the three a row
 * may be keyed by, and the criterion says the same: *the hash stays the identity.*
 */

import type { PersonalAgentMark } from './agent-tags.ts'
import { readStoredWord } from './i18n.ts'
import type { ParticipantKind, ParticipantRef } from './participants.ts'
// THE VISITING AGENT'S CREDENTIAL. The Embassy answers about worlds, citizens, visits AND visiting
// agents in one read, for the reason its route says: four clocks drawn on one page disagree.
import type { VisitorCredential } from './visitors.ts'
// WHO CHOSE THE CARD ON A ROW. Criterion P75; ./roles.ts is the only place that shape lives.
import type { WhoChoseTheCard } from './roles.ts'
// WHETHER PICKING THIS AGENT'S NEWEST RUN UP IS EXPENSIVE. Criterion T6; the warning and its two
// measured numbers live in ./pick-up-cost.ts so no row can word it differently.
import type { PickUpCost } from './pick-up-cost.ts'

/** The confirmation's cleanup outcome belongs to the run, not to its already-delivered message. */
export const THE_WORLDS_STOP_KEY = 'worldsStop'

export interface TheWorldsStopped {
  says: string
  /** A world appears here if at least one of its groups received SIGTERM. */
  stopped: string[]
  leftForThePerson: string[]
  /** Includes failed checks and signals; a partially stopped world can be in both lists. */
  notChecked: string[]
}

/**
 * THE FOUR KINDS OF WORLD, as criterion C2 names them.
 *
 * `home` is a world somebody lives in: the canonical stack, and the default home of every citizen.
 * `agent-made` is one an agent started, usually a server in a worktree against a copy of the
 * database. `test` is one the test helper started, which lives for the length of one test file.
 * `remote` is a world on another machine, reached over the private network problem 19 opened.
 *
 * There is no fifth. A world nothing can classify is not registered at all, because a row saying
 * "some kind of world" would be worse than the absence of a row.
 */
export const WORLD_KINDS = ['home', 'agent-made', 'test', 'remote'] as const

export type WorldKind = (typeof WORLD_KINDS)[number]

export function isWorldKind(value: unknown): value is WorldKind {
  return typeof value === 'string' && (WORLD_KINDS as readonly string[]).includes(value)
}

/**
 * WHICH KINDS OF WORLD THE OFFICE PAGE HIDES UNTIL SOMEBODY ASKS FOR THEM.
 *
 * Criterion C3: *a test world (started by the test helper) registers as ephemeral and is hidden by
 * default on the office page.* A suite run registers hundreds of worlds that each live for seconds,
 * so a page that drew them all would be a page about the test suite.
 *
 * EPHEMERAL IS NOT A SECOND COLUMN. `kind` already says a world was started by the test helper, and
 * a flag beside it would be the same fact in two places with nothing making them agree — the defect
 * CLAUDE.md names as this repository's own. This function is the one place that decides, so the
 * office page, the mirror and the two tools cannot disagree about which worlds are ephemeral.
 */
export function isEphemeral(kind: WorldKind): boolean {
  return kind === 'test'
}

/**
 * THE NAME A HOME WORLD IS GIVEN WHEN NOBODY HAS NAMED IT.
 *
 * The default home is called my world, and a person may name it freely. So this is the default and
 * the person may change it on the office page. It is lowercase because the request wrote it that way.
 */
export const DEFAULT_HOME_WORLD_NAME = 'my world'

/**
 * The longest a world's name may be, in characters.
 *
 * The same number a participant's name is held to in src/shared/participants.ts, and for the same
 * reason: it is drawn in a list beside other names and one that wrapped would push every row apart.
 */
export const WORLD_NAME_MAX = 80

/** What is wrong with a world's name, in a sentence a reader can act on, or null when nothing is. */
export function whyWorldNameIsRefused(name: string): string | null {
  if (name.trim() === '') return 'A world needs a name.'
  if (name.length > WORLD_NAME_MAX) {
    return `A world's name is at most ${String(WORLD_NAME_MAX)} characters long, and this one is ${String(name.length)}.`
  }
  return null
}

/**
 * THE NAME AN AGENT-MADE WORLD IS GIVEN, from what started it. Criterion C5.
 *
 * *"<agent handle>'s <purpose>"*, so `builder-au's citizens`. The purpose is the trace header the
 * run already sends — the name a caller picks for one stretch of work — because that is the only
 * word about the purpose of a run that this product already has. A run that sends none is named
 * after its handle alone rather than given an invented purpose.
 */
export function agentMadeWorldName(handle: string, purpose: string | null): string {
  const who = handle.trim()
  const what = purpose === null ? '' : purpose.trim()
  const name = what === '' ? `${who}'s world` : `${who}'s ${what}`
  return name.slice(0, WORLD_NAME_MAX)
}

/**
 * THE TWO PARTS OF A NAME `agentMadeWorldName` MADE, so a page can say it in its own language, or
 * null for a name it did not make.
 *
 * The stored name is English (problem E73Do6DbqZCH, item 6). A name is read back only when making
 * it again from the parts gives the same name, so a name somebody chose that does not have this
 * shape is drawn as it was written. `purpose` is the run's own word and is never translated.
 */
export function agentMadeWorldNameRead(name: string): { who: string; purpose: string | null } | null {
  const parts = /^(\S+)'s (.+)$/u.exec(name)
  if (parts === null) return null
  const who = parts[1] ?? ''
  const rest = parts[2] ?? ''
  const purpose = rest === 'world' ? null : rest
  return agentMadeWorldName(who, purpose) === name ? { who, purpose } : null
}

/**
 * Whether this is the name a server gave its own world with no purpose to give.
 *
 * ONE RULE, ASKED IN TWO TABLES. A purpose is filled in over the placeholder and never over a name
 * anybody chose, and both the world's own row and the office's copy have to be held to that — the
 * world writes the first and asks the office about the second. Written twice, the two could drift
 * apart with nothing failing, which is the defect CLAUDE.md names at the top of the file.
 */
export function isTheNameAServerGaveItself(name: string, handle: string): boolean {
  return name === agentMadeWorldName(handle, null)
}

/**
 * THE NAME A TEST WORLD IS GIVEN: its test file's name. Criterion C5.
 *
 * The name the test helper already passes for its temporary directory, which is the test file's own
 * word for itself. A run of the suite therefore reads as a list of test names rather than a list of
 * ports.
 */
export function testWorldName(testName: string): string {
  const said = testName.trim()
  return (said === '' ? 'a test' : said).slice(0, WORLD_NAME_MAX)
}

/** One world, as the office holds it and as the API hands it back. */
export interface World {
  id: string
  name: string
  /**
   * WHAT THE WORLD IS FOR, in the starter's own words, or null because nobody recorded it.
   *
   * Criterion P87. A world kept up for somebody to look at had no sentence anywhere saying what
   * they were being asked to look at; the page had an address and a start time. The tool that
   * starts a world writes the sentence the starter gave it, and NULL is the honest answer for a
   * world whose starter said nothing. The fifth invariant.
   *
   * OPTIONAL BECAUSE A WORLD READ BACK ALWAYS CARRIES IT and only the fixtures a test builds by
   * hand omit it; absent is read as null everywhere the page asks.
   */
  purpose?: string | null
  /**
   * THE HANDBACK THIS WORLD BELONGS TO, by record id, or null because nobody tied it to one.
   *
   * Criterion C33. A world is a copy of the corpus taken when it starts, so the handback that asks
   * them to look at it is filed afterwards, on their office, and is not inside the world at all.
   * Report bOZAJTim_9M7 was looked for inside world 34233 and not found there. This is the pointer back.
   *
   * A RECORD ID AND NOT A LINK, because a link needs two records and a world is a row rather than a
   * record. Nothing checks that the record exists: a world is usually started before its handback
   * is written, so a check would refuse the ordinary case, and a page that draws this says so when
   * the record is not there rather than drawing a dead address.
   *
   * OPTIONAL for the same reason `purpose` is: a world read back always carries it, and only the
   * fixtures a test builds by hand omit it. Absent is read as null everywhere the page asks.
   */
  handback?: string | null
  kind: WorldKind
  /** Who started it, or null because nobody recorded one. */
  startedBy: ParticipantRef | null
  /** The checkout its code came from, absolute, or null because it did not say. */
  checkout: string | null
  /**
   * The commit that checkout was on, short, or null because it did not say.
   *
   * `head` IS THIS PROJECT'S STORED WORD FOR IT, the one the world header writes and the one `World`
   * in src/shared/runtime.ts uses. "The commit" is the word a reader sees, and src/config/
   * world-header.mjs already says so. Two names for one fact is the defect CLAUDE.md names.
   */
  head: string | null
  /** The sixteen hex characters of the database it answers from. The identity. */
  databaseIdentity: string
  /** Where it was reachable when it registered, or null because it did not say. */
  address: string | null
  /**
   * Where another machine can reach it, or null because it serves only the computer it runs on.
   *
   * A SECOND ADDRESS AND NOT A REPLACEMENT. `address` is the loopback one every world has; this is
   * the one a server that declares `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` also binds. The office
   * held only the first, so a person opening Mole Office from another machine read a list of worlds
   * whose every address was 127.0.0.1, and Enter answered "Failed to fetch". Problem `5mG-KxUAXObJ`.
   */
  addressForOtherMachines: string | null
  /** `canonical` or `scratch`, the word the world header already carries. */
  standing: string
  /** The world that started this one, by its office id, or null. */
  parentWorld: string | null
  bornAt: string
  diedAt: string | null
  /** One plain sentence saying why it ended. Null exactly when `diedAt` is null. */
  diedBecause: string | null
  /** The installation this world belongs to. */
  installation: string
}

/**
 * WHICH OF A WORLD'S TWO ADDRESSES THE PAGE ASKING SHOULD USE, and why.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A world binds loopback always, and a second door when it declares
 * `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES`. The office held only the first, so a person opening
 * Mole Office from another machine read a list of worlds every one of which said
 * `http://127.0.0.1:29840` — an address that means "this computer", and on the person's other machine it is
 * a different computer. Enter answered "Failed to fetch". Problem `5mG-KxUAXObJ`.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A page reached the office SOMEHOW, and that is the whole of the reading: a page on loopback is on
 * the computer the worlds are running on, so loopback reaches them; a page that came over any other
 * address is on another machine, and only the second door will do.
 *
 * IT REFUSES NOTHING. When the address a page needs is not recorded it hands back the other one and
 * says so, because a world that cannot be reached from here is worth trying and worth being told
 * about — never a control taken away. `reachable` is false exactly then, and the row says it.
 */
export function theAddressToReachAWorldBy(
  world: { address: string | null; addressForOtherMachines: string | null },
  pageHost: string,
): { address: string | null; reachable: boolean; why: string } {
  const here = aLoopbackHost(pageHost)
  const wanted = here ? world.address : world.addressForOtherMachines
  const other = here ? world.addressForOtherMachines : world.address
  // THE REASON IS READ FROM THE WORD LISTS: in English on the server, in the page's language on a page.
  if (wanted !== null && wanted !== '') {
    return {
      address: wanted,
      reachable: true,
      why: readStoredWord(here ? 'devWords.worlds.reach.loopback' : 'devWords.worlds.reach.otherDoor'),
    }
  }
  return {
    address: other === '' ? null : other,
    reachable: false,
    why: readStoredWord(here ? 'devWords.worlds.reach.noLoopback' : 'devWords.worlds.reach.noOtherDoor'),
  }
}

/** Whether a host is this computer talking to itself. The three spellings a browser ever shows. */
export function aLoopbackHost(host: string): boolean {
  const said = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return said === '127.0.0.1' || said === 'localhost' || said === '::1'
}

/** One visit, as the office holds it and as the API hands it back. */
export interface Visit {
  id: string
  /** Who is visiting. */
  visitor: ParticipantRef
  /** The database identity of the world they live in. */
  fromWorld: string
  /** The database identity of the world they are visiting. */
  toWorld: string
  since: string
  /** When the visit ended, or null because it is still open. */
  until: string | null
  /** What they came to do, in the caller's own words. */
  why: string
  /**
   * True when the office learnt about this visit after it started, because the main world was down
   * when it began. Criterion C8.
   *
   * READ FROM THE TWO STAMPS, NOT STORED. It is `registeredAt` being later than `since`, and a
   * column beside them would be a third place the same fact is written.
   */
  registeredLate: boolean
  /** When the office wrote the row down, which is later than `since` for a late registration. */
  registeredAt: string
  /**
   * When this row reached the office, or null because it has not.
   *
   * Null in the office's own copy means nothing — the office is where it reached. In another world's
   * copy it means the visit is still waiting to be reported, which is criterion C8's held visit.
   */
  reportedAt: string | null
}

/**
 * WHERE THE OFFICE WRITES ITS MIRROR, relative to the directory holding the database.
 *
 * Criterion C2: *the main world writes data/worlds.json as a mirror after every change; a world
 * whose main world does not answer reads the mirror.* The directory is worked out from the database
 * path in one place on the server, the same way src/server/lib/avatars.ts works out where an
 * uploaded picture goes.
 */
export const MIRROR_FILE = 'worlds.json'

/**
 * WHAT THE MIRROR HOLDS: the office — which worlds there are, and who is visiting whom.
 *
 * `writtenAt` says how old the reading is, because a reader of a mirror is reading something that
 * was true when the main world last spoke, and a copy with no date on it would be read as the
 * present.
 */
export interface Mirror {
  writtenAt: string
  /** The world that wrote it: the main world's database identity. */
  writtenBy: string
  worlds: World[]
  /**
   * The visits that were open when it was written. A visit that has ended is not mirrored.
   *
   * The office is two things — which worlds there are, and who is visiting whom — and the second is
   * the one a visited world reads on every request to decide whether a caller from elsewhere may
   * write. A mirror carrying only the worlds would answer the office page's question and not that
   * one, which is the question the mirror exists for.
   */
  visits: Visit[]
}

/**
 * WHY A WRITE FROM ANOTHER WORLD WITH NO VISIT IS REFUSED, in the sentence the refusal carries.
 *
 * An agent needs the visits door and header to register a visit, so this English sentence remains
 * in the reply for an agent and in Developer mode. A page draws the code's sentence and one press
 * to pairing instead, as point 3 of a decision says.
 *
 * Criterion C4: *without one a write is refused with a sentence naming the office.* It names the
 * office because the whole point of the refusal is that there is somewhere to go and something to
 * do there; a refusal that only said no would leave the caller with nothing to try.
 */
export function noVisitRefusal(from: string, to: string): string {
  return (
    `This request says it comes from the world ${from}, and this is the world ${to}. Reading is still ` +
    'allowed here. To write here, register a visit first: open the office and press Enter on this world, or ' +
    'send POST /api/office/visits in the main world and put the visit id it answers with on ' +
    'x-mole-office-visit.'
  )
}

/**
 * WHAT A READ FROM ANOTHER WORLD WITH NO VISIT IS TOLD, on a header rather than in the body.
 *
 * Criterion C4 again: *a read is answered with a warning header.* The read is answered in full,
 * because the second answer says so: registration is not needed for permission yet, a local agent
 * and the person's own curl may both read, and permission is better limited to what registers from
 * other worlds. A warning is what is left when a refusal would be wrong. It is one line because a
 * header is one line.
 */
export function noVisitWarning(from: string, to: string): string {
  return `read answered from the world ${to} for a caller whose home is the world ${from}, with no visit registered`
}

/**
 * WHO IS VISITING, said the one way a visitor is ever named, for a caller that has an actor.
 *
 * An actor's type on the wire is `human` or `agent`; a participant's kind is `person` or `agent`.
 * They are the same two things with two spellings, and this is the one place the spelling changes,
 * so nothing else has to know that they differ.
 */
export function visitorKindForActorType(type: string): ParticipantKind | null {
  if (type === 'human') return 'person'
  if (type === 'agent') return 'agent'
  return null
}

// ============================================================================ the embassy

/**
 * WHERE THE RUN OR WORLD A KEY WAS MADE FOR STANDS. Problem yZ71bheXm-Ji.
 *
 * `not-ended`: the run is running or idle, or the world still answers. `ended`: it has ended.
 * `waiting`: a dispatched run waits for a worker to take it. Null: nobody can say, because its record
 * holds no state the office can read.
 */
export type EmbassyKeyRunState = 'not-ended' | 'ended' | 'waiting' | null

/**
 * ONE LIVE KEY OF A CITIZEN, as the citizen's page draws it: one row and one Revoke press each.
 * Problem yZ71bheXm-Ji: a press that named only the agent revoked a running round's key instead of
 * the key they meant.
 */
export interface EmbassyKey {
  /** The `held_keys` row's id: what the revoke door names. Not a secret; shown in developer mode only. */
  id: string
  /**
   * WHAT THE KEY IS. `its-own`: the holder's own key, from its registration, a new key after a lost
   * one, or a confirmed credential. `a-run`: the key the office made for one run. `a-deleted-run`: the
   * key of a run whose session record was deleted (problem sWNzXXKdB3q6). `a-dispatched-run`: the key
   * of a run the office started to answer a message. `a-world`: the key a world's reports carry.
   */
  is: 'its-own' | 'a-run' | 'a-deleted-run' | 'a-dispatched-run' | 'a-world'
  /**
   * THE RUN OR WORLD IT WAS MADE FOR, or null for the holder's own key. `title` is the run's title or
   * the world's name, as written (content, never translated), and null for a dispatched run, which
   * has none, and for a deleted run, whose record held it.
   */
  of: { id: string; title: string | null; state: EmbassyKeyRunState } | null
  /** When the office made it, local wall clock. */
  madeAt: string
  /** When the office last recorded its use, or null because nobody recorded one. Never "never used". */
  lastUsedAt: string | null
}

/**
 * ONE ROW OF THE EMBASSY: somebody the office knows, and their standing in one world.
 *
 * Criterion M52 of design/messages/ACCEPTANCE.md section 18: under the world, one page lists every
 * known resident and visitor, especially those registered as contacts, and by default shows only
 * contacts.
 *
 * ONE PERSON CAN HAVE SEVERAL ROWS, and that is what the page is about. A citizen of one world who
 * visited two others has three rows: one saying where they live and two saying where they went. The
 * row is the standing, not the participant.
 */
export interface EmbassyRow {
  /** The asking person's marks on this agent. */
  personalTags?: PersonalAgentMark[]
  /** Projects of a registered agent, from its live records. */
  projects?: string[]
  /**
   * WHERE THIS ROW STANDS WITH THE OFFICE. Three answers since criterion P74.
   *
   * `citizen` — this world's roll holds them. `visitor` — a trip to this world is registered.
   * `asks to come in` — a visiting agent's credential is waiting for the person's confirmation; nothing it
   * sends is stored under its handle until they press confirm.
   *
   * THE EMBASSY HAD A VISITORS SECTION AND A VISITING AGENTS SECTION, and they were not needed,
   * since an agent is already read as online or offline. So this
   * is a MARK ON A ROW in one list, and not a section: presence and admission are two different
   * facts, and drawing the second as a section made it look like a third kind of participant.
   */
  standing: 'citizen' | 'visitor' | 'asks to come in'
  /** Who, named the one way a participant ever is. */
  who: ParticipantRef
  /**
   * What they are called, or null because no registry here holds them.
   *
   * A visitor from another world need not be registered in this one, and their name lives in the
   * world they came from. Null says nobody here can answer, which is different from an empty name.
   */
  name: string | null
  /** Whether a registry in this database holds them at all. */
  registered: boolean
  /** The address of the picture to draw. Always answerable: a picture is drawn from the id. */
  avatarUrl: string
  /** The world this row is about: where they live, or where they went. A database identity. */
  world: string
  /** That world's name, or null because neither this database nor the office's list it could read holds a row for it. */
  worldName: string | null
  /** A visitor says which world it came from. Null on a citizen, who came from nowhere. */
  fromWorld: string | null
  /** That world's name, or null because neither this database nor the office's list it could read holds a row for it. */
  fromWorldName: string | null
  /** When the trip began. Null on a citizen. */
  since: string | null
  /** When it ended, null while it is open, and null on a citizen. */
  until: string | null
  /** When they joined this world's roll. Null on a visitor, and null where nothing recorded one. */
  citizenSince: string | null
  /**
   * WHICH ROLE CARD THIS CITIZEN HOLDS, or null because no registry here holds them at all.
   *
   * Criterion P46: every citizen holds a card. It is the word on their registry row where somebody
   * wrote one, and the word that row is read as where nobody did — an agent's is `worker` and a
   * person's is `administrator`, which is what every refusal already uses.
   */
  role: string | null
  /**
   * TRUE WHEN SOMEBODY WROTE THAT WORD, false when it is the word a row with none is read as.
   *
   * Criterion P53. `role` above is never null on a registered row, because a row with no card is
   * read as the worker card or the administrator card everywhere in this product — so without this
   * a screen could not tell "this agent holds the secretary card" from "nobody has written a card on
   * this row". It is the same device as `chosePortrait` below, and it exists for the same reason.
   *
   * IT IS NOT `cardChosenBy` BELOW, and the difference is what P75 added. This says whether the
   * WORD is on the row at all. That says WHO chose it, and it is stored rather than worked out.
   */
  choseRole: boolean
  /**
   * WHO CHOSE THE CARD ON AN AGENT'S ROW, or null because nobody recorded it. Criterion P75.
   *
   * The mark stored on the registry row, read and never derived. A registration writes it from
   * 8 September 2026: the rule chose the card, a starter did, or the owner did when they confirmed a
   * credential. NULL IS "NOBODY RECORDED IT" and never either answer — it is what a row written
   * before the mark existed holds, and `whoChoseTheCardSays` in @shared/roles.ts is the sentence a
   * screen draws for each state, so the row and the citizen's page say the same thing.
   *
   * Null on a person's row as well: a person holds their own card by their own door, and who chose
   * it is not a question that door asks.
   */
  cardChosenBy: WhoChoseTheCard | null
  /**
   * THE HANDLE ON THE CHOOSER'S ROW, for the word a row draws (wave rule 5): the mark stores a
   * registry id, and a new agent's id is not a name a person knows. Null or absent where a person or
   * the rule chose it, where nobody recorded who did, and where no single agent row answers.
   */
  cardChosenByHandle?: string | null
  /**
   * THE DRAWING ON THAT CARD, by the address it is served at, or null because no registry here holds
   * them. Criterion P47.
   *
   * It is the one they chose where they have chosen, and the first of their role's three where they
   * have not. A default is not a choice: `chosePortrait` says which of the two this is.
   */
  portrait: string | null
  /**
   * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or null. Criterion P69.
   *
   * Null is the ordinary answer and means this machine, or a person, who is registered by nobody:
   * registration from another machine is refused without a credential the owner has confirmed, so
   * a row that names one came from elsewhere and a row that names none did not.
   */
  credential: string | null
  /**
   * WHETHER THIS ROW IS A PERSON'S DEVICE RATHER THAN AN AGENT. Criterion D2, P83 point 4.
   *
   * A device asks to come in through the same credential door as a visiting agent and is stored in
   * the same row, because the table has no column that says otherwise and a migration is above this
   * worker. What tells them apart is the empty role the ask writes: a device asks for no card. This
   * field is that reading, carried to the page so it can say "device" where it would say "agent".
   */
  device: boolean
  /**
   * EVERY LIVE KEY THIS ROW'S HOLDER HOLDS, oldest first, each by its `held_keys` id and saying what
   * it is. Criterion D3; problem yZ71bheXm-Ji.
   *
   * An agent can hold its own key and one more for each run, dispatched run or world the office made
   * a key for, so the citizen's page draws one row and one Revoke press per key, and each press names
   * its own key. A device's keys are under `(person-device, handle)`; an agent's under `(agent, its
   * id)`. Empty means there is no key to revoke, and no press is drawn. A person's row holds none: their
   * key lives in the key file, not in `held_keys`.
   */
  heldKeys: EmbassyKey[]
  /**
   * WHICH RUNTIME THIS ROW'S AGENT DECLARES, or null because nobody said. Criterion P88.
   *
   * A row admitted through the registration door before P88 carries what it declared — `codex`, for
   * the rows P88's decision names — or null where it declared none, which reads as unknown and is
   * never refused after the fact. A credential row carries the runtime its credential named.
   */
  runtime: string | null
  /**
   * WHICH MACHINE THIS ROW'S AGENT CAME FROM, or null because none was measured. Criterion P88.
   *
   * The Embassy lists visitors as such, with runtime AND machine. A credential measures the machine
   * from the connection, so it is a fact rather than a claim; a row registered on this machine has
   * none recorded and says so rather than showing a gap.
   */
  machine: string | null
  /**
   * THE SENTENCE A ROW ADMITTED BEFORE P88 CARRIES, or null because it is not one. Criterion P88.
   *
   * The secretary's ruling of 12 September 2026: the rows already registered when the gate was built
   * are neither retired nor refused. This says so on the row, with the runtime as it reads and the
   * date it was registered, so a reader can tell an old registration from one the new gate governs.
   */
  admittedBeforeP88: string | null
  /**
   * THE SENTENCE SAYING THE VISITOR CARD CEILING WAS RAISED BY THE SETTING, or null. Criterion P86.
   *
   * A visitor row holding a card above the default ceiling — the inspector or the secretary — holds
   * it only because MOLE_OFFICE_VISITOR_CARD_CEILING was raised. This says so where the row is read.
   */
  cardCeilingRaised: string | null
  /**
   * THE WARNING SAYING PICKING THIS AGENT'S NEWEST RUN UP AGAIN IS EXPENSIVE, or null. Criterion T6.
   *
   * A ROW IS A PARTICIPANT AND A RUN IS NOT, so the row reaches its runs the way the citizen's page
   * does: the run's own `ranAs` names the agent record, and the newest run bound to it is read.
   * `pickUpCost.warning` names the two measured numbers — the input tokens on that run's receipt
   * and the minutes it has been idle — and never a context size, because this build reports none.
   *
   * NULL ON EVERY ROW IT DOES NOT APPLY TO: a person, a visitor no registry here holds, and an
   * agent with no run, no receipt or no readable idle stamp. Null means no warning was earned, not
   * that a run was measured and found small.
   */
  pickUpCost: PickUpCost | null
  /** True when the portrait above is one they picked, false when it is the role's first by default. */
  chosePortrait: boolean
  /** Whether the person reading has this participant on their contacts list. */
  contact: boolean
  /** Which of their contact groups, or null because this participant is on no list of theirs. */
  group: string | null
  /**
   * That group's key and whether somebody made it, or null where `group` is null. The page needs
   * both to draw a declared group in the page language and a made one as it was written
   * (`groupHeading` in src/shared/contacts.ts).
   */
  groupKey: string | null
  groupMade: boolean | null
  /**
   * WHETHER THIS ONE CAN BE REACHED RIGHT NOW. Criterion P74.
   *
   * An agent is already read as online or offline, so the sections were unnecessary. They were, and
   * the reading was on the profile page and not on the row, so the list could not show the presence
   * it was taken to show already.
   *
   * `word` and `colour` are the same reading `participantPresence` gives a profile, from the same
   * function, so a row and a page cannot come to say different things about one agent.
   *
   * NULL ON A ROW NOBODY HERE HOLDS: a visitor from another world whose registry is elsewhere has
   * nobody here to ask, and a colour invented for it would be a claim this office cannot make.
   */
  presence: { colour: string; word: string; says: string } | null
  /**
   * WHETHER THIS ROW IS RETIRED, AND WHY. Problem zyCcJYCLsAe7.
   *
   * Proposal R9T5Xov_ueav: the row was to be removed, because that agent had been closed and was only
   * for a test. The row stayed in the
   * Embassy as an active contact, because nothing retired a registry row.
   *
   * NULL ON A ROW THAT IS NOT RETIRED, which is every ordinary one. The Embassy folds a retired row
   * away behind a press rather than deleting it: what an agent did is still readable, and a reader
   * looking for somebody who has been closed can find them.
   */
  /** `byHandle` is the handle on the retirer's row (wave rule 5), or null or absent where no agent row answers. */
  retired: { at: string | null; because: string | null; by: ParticipantRef | null; byHandle?: string | null } | null
}

/**
 * ONE WORLD AT THE EMBASSY, WITH WHAT IT HAS DONE AND WHAT IT CLAIMS ABOUT ITSELF.
 *
 * Criterion P26 of design/permissions/ACCEPTANCE.md: *the Embassy lists every trusted visitor and
 * every world, with what each has done.* The point is to count them and to supervise them, and a
 * list of worlds with nothing beside each is a list rather than supervision.
 *
 * Criterion P31: *a world's claim to be the owner's is a claim, and the Embassy says so.* `owner` is the
 * participant that world named when it registered, `ownerIsAClaim` is the sentence saying what that
 * is worth, and there is no field anywhere saying a world's owner was CHECKED, because none was.
 */
export interface EmbassyWorldRow {
  world: World
  /**
   * Who that world says started it, or null because it said nobody.
   *
   * IT IS THE WORLD'S OWN WORD AND NOTHING HERE VERIFIED IT. `A_WORLDS_OWNER_IS_A_CLAIM` in
   * src/shared/visitors.ts is the sentence a person reads beside it, and it travels on the row
   * below rather than being left in a design document.
   */
  owner: ParticipantRef | null
  /** That sentence, on the row, so a page cannot draw the owner without it. Criterion P31. */
  ownerIsAClaim: string
  /** Whether this is the world answering the request. */
  isThisWorld: boolean
  /** How many citizens the office has on this world's roll. */
  citizens: number
  /** How many trips have been registered from this world, and how many to it. */
  visitsFrom: number
  visitsTo: number
  /** How many visiting agents hold a credential naming this world, and how many are still open. */
  credentials: number
  openCredentials: number
  /** What was done under those credentials: requests made, of which writes, and mismatches. */
  requests: number
  writes: number
  mismatches: number
}

/**
 * THE OFFICE'S OWN SENDER ROW, DRAWN APART FROM THE ROWS. It is the row the office writes its own
 * messages from, kept in the agent registry, and it is the office itself rather than an agent
 * somebody runs. It holds no card, so it carries none here, and it is never one of `rows`.
 */
export interface EmbassyOffice {
  who: ParticipantRef
  /** The name on its registry row, or null because the row holds none. */
  name: string | null
  /** The address of the picture drawn beside it. */
  avatarUrl: string
}

/** What `GET /api/office/embassy` answers with. */
export interface WhatTheEmbassySays {
  /** Every citizen, visitor and credential's agent, and never the office's own row. */
  rows: EmbassyRow[]
  /** The office's own row, drawn apart as the office itself. */
  office: EmbassyOffice
  /**
   * EVERY VISITING AGENT'S CREDENTIAL, with what each has done. Criterion P26.
   *
   * SEPARATE FROM `rows`, and that is the design rather than an omission. A row above is a STANDING
   * in a world — where somebody lives, or a trip they registered — and a credential is neither: it
   * is held by an agent no world here has a roll for, which is what makes it a visitor in the first
   * place. Folding one into the other would give a row that could answer neither question fully.
   */
  visitors: VisitorCredential[]
  /** Every world the office holds, with what each has done and what it claims. Criteria P26, P31. */
  worlds: EmbassyWorldRow[]
  /** How complete this list is, in one sentence: the office sees every trip and a world sees its own. */
  says: string
  /** Whether this database is the office. A reader is told rather than left to work it out. */
  isTheOffice: boolean
  /** Which project the contact marks were read for. The registries are the installation's; these are not. */
  workspaceId: string
  /**
   * HOW MANY ROWS THE PAGE'S VIEW HOLDS, on a page reply (`?shape=page`) and absent on the whole
   * answer. It is counted before any row is built, so the number and the rows cannot disagree.
   */
  rowsTotal?: number
  /** The live rows the page's default view leaves out, counted for the Show everyone press. */
  hidden?: number
  /** The rows folded under the retired press, counted so the press can say how many. */
  retiredCount?: number
  /** The worlds the page keeps behind its Show every world press. */
  otherWorlds?: number
  /** The next page of the same view, as a path, or null because this is the last one. */
  next?: string | null
}

/**
 * ONE PAGE OF THE EMBASSY: what the page draws, and the counts its three presses say.
 *
 * The whole answer above is kept for the callers that need every row. The page asks for this shape
 * (`?shape=page`), because on a made-up office of the live size a whole reading was 2,641 rows,
 * megabytes and seconds, and the page drew the contacts among them.
 */
export interface WhatTheEmbassyPageSays extends WhatTheEmbassySays {
  rowsTotal: number
  hidden: number
  retiredCount: number
  otherWorlds: number
  next: string | null
}

/** How many rows one page of the Embassy holds when the caller names no limit. */
export const EMBASSY_PAGE_ROWS = 40

/** The most rows one Embassy page may be asked for. */
export const EMBASSY_PAGE_ROWS_MOST = 200

/** Which of the Embassy's views a page is for: contacts or everybody, retired folded in or out, test worlds or not. */
export interface EmbassyView {
  everyone: boolean
  retired: boolean
  tests: boolean
}

/**
 * WHETHER THE EMBASSY PAGE DRAWS THIS ROW IN ITS DEFAULT VIEW. The one rule, read by the server that
 * makes the page and by a test that compares a page with the whole answer. `retired` is a fact, not
 * a row, so the server can ask it before it builds the row.
 */
export function theEmbassyPageDrawsThisRow(row: {
  standing: EmbassyRow['standing']
  retired: boolean
  contact: boolean
  credential: string | null
}): boolean {
  return row.standing !== 'asks to come in' && !row.retired && (row.contact || row.credential !== null)
}

/** The same rule over a built row, for a reader that already has one. */
export function aRowTheEmbassyPageDraws(
  row: Pick<EmbassyRow, 'standing' | 'retired' | 'contact' | 'credential'>,
): boolean {
  return theEmbassyPageDrawsThisRow({
    standing: row.standing,
    retired: row.retired !== null,
    contact: row.contact,
    credential: row.credential,
  })
}
