// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO CAN TAKE PART: the two kinds of participant, and the rules that hold for both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PARTICIPANT IS
 * ---------------------------------------------------------------------------------------
 *
 * A participant is a person or a durable agent, named by a kind and an id. Criterion M2 of
 * design/messages/ACCEPTANCE.md: *A message references a participant by (kind, id) and nothing else.*
 * Both kinds have a name, a short address, a picture and a state they set themselves. People are
 * registered the same way agents are.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN `shared` AND HOLDS NO DATABASE CODE
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws these words and the server stores them. A vocabulary written twice is this
 * project's recurring defect: the same fact worked out in two places, so the two can disagree. The
 * browser may not import from `src/server`, so anything both sides need lives here and is imported
 * by both. Nothing here opens a database and nothing here reads a file.
 */

import { readStoredWord } from './i18n.ts'
import { budgetProblem, type ShortFormLevel } from './zoom.ts'

/** A person, or a durable agent. The two kinds of participant, and there is no third. */
export const PARTICIPANT_KINDS = ['person', 'agent'] as const

export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number]

/** Which participant, said the only way a participant is ever named. */
export interface ParticipantRef {
  kind: ParticipantKind
  id: string
}

/**
 * The word a reader sees for one kind of participant.
 *
 * The two stored words already read as English, so this returns them unchanged today. It exists
 * anyway, and every sentence goes through it, because the alternative is a stored word written
 * straight into prose — and the day one of them stops reading well there would be nowhere to fix it.
 */
export function participantWord(kind: ParticipantKind): string {
  return kind === 'person' ? 'person' : 'agent'
}

export function isParticipantKind(value: unknown): value is ParticipantKind {
  return typeof value === 'string' && (PARTICIPANT_KINDS as readonly string[]).includes(value)
}

/**
 * The runtimes a durable agent may be served by, as criterion M2 names them.
 *
 * THIS LIST IS WHAT A NEW WRITE IS CHECKED AGAINST. The `agent` record kind declares its `runtime`
 * field from it, so `POST /api/records` refuses a word that is not one of these and the refusal
 * names every one of them. That sentence used to be written here and was true nowhere: nothing in
 * the repository imported this list, and `runtime: "a-runtime-nobody-declared"` was accepted into
 * the registry. Problem `3zYuz90LvTS5`.
 *
 * A RECORD WRITTEN BEFORE THE CHECK KEEPS ITS OWN WORD, AND THE REGISTRY SAYS NOTHING ABOUT IT.
 * Agent records written earlier carry other words — `codex-cli` is the one in this corpus. The
 * record keeps what it says, because rewriting a stored value to make a list look tidy is the one
 * thing a migration here may not do. The registry column is left empty instead, and empty there
 * means nobody has said which of these words serves this agent. That is a real answer; `codex-cli`
 * in a column that means "one of these words" would be a false one.
 *
 * `kimi` IS THE FOURTH, ADDED ON 5 SEPTEMBER 2026: Kimi CLI is in the adapter list, and the other two
 * command-line tools surveyed with it are not. It is Moonshot
 * AI's `kimi-cli` from PyPI, version 1.50.0, whose binary is called `kimi`. It is NOT the npm
 * package `@moonshot-ai/kimi-code`, which installs a binary of the same name and is a different
 * program. `design/agents/FRAMEWORK-SURVEY-2026-09.md` measured both and keeps them apart.
 */
export const AGENT_RUNTIMES = ['claude-code', 'codex', 'dsh', 'opencode', 'kimi'] as const

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number]

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return typeof value === 'string' && (AGENT_RUNTIMES as readonly string[]).includes(value)
}

/**
 * THE RUNTIME WORDS IN A SENTENCE, for a refusal that has to name them: `claude-code, codex,
 * opencode or kimi`.
 *
 * It exists because two refusals had that list typed into them by hand — the one for an agent whose
 * registry row names no runtime, and the one for a session asking to hold a handle — and a word
 * added to `AGENT_RUNTIMES` left both sentences telling a reader to use one of three. Nothing
 * failed when they disagreed, which is the defect CLAUDE.md names as this repository's own.
 */
export function theRuntimeWordsSaid(): string {
  const words = [...AGENT_RUNTIMES]
  const last = words.pop() ?? ''
  return words.length === 0 ? last : `${words.join(', ')} or ${last}`
}

/**
 * WHICH RUNTIME IS THIS OFFICE'S OWN ON THIS MACHINE. Criterion P88.
 *
 * P88's decision: every Codex, and every agent from another machine, is a visitor. A
 * visitor comes in through the Embassy on a credential; the registration door refuses or re-routes a
 * registration from a runtime that is not the office's own Claude Code on this machine. So this is
 * the one word a registration made on this machine may declare, and it is written here rather than
 * spelled into the refusal and the gate separately.
 */
export const THE_OFFICES_OWN_RUNTIME: AgentRuntime = 'claude-code'

/**
 * WHICH RUNTIMES THIS OFFICE'S OWN TOOLS START ON THIS MACHINE. Criterion P88, as amended on
 * 12 September 2026.
 *
 * P88's first wording made a visitor of every runtime that is not Claude Code, which is wider than
 * the decision it cites. Every Codex, and every agent from another machine, is a
 * visitor. It does not say every runtime that is not Claude Code. The wider
 * sentence would have made a visitor of every dsh worker on this machine — the secretary's, this
 * supervisor's, another agent's and zhixu's — each needing a credential and the person's press, against
 * the decision that workers run on DeepSeek through dsh BY DEFAULT, and against the message that
 * takes for granted that zhixu may summon about five dsh workers
 * here.
 *
 * SO THE SET IS THE RULE AND NOT THE ONE WORD. An agent one of this office's own tools starts on
 * this machine registers through the registration door under its starter's responsibility (P1),
 * declaring its runtime. `codex` is deliberately absent: it is the one runtime the decision names.
 *
 * IT IS NOT THE SAME QUESTION AS WHICH TOOLS THE OFFICE CAN DISPATCH. See
 * `THE_RUNTIMES_THE_OFFICE_DISPATCHES` in src/worker/runtimes/index.ts: a word may be legal on an
 * agent row and have no adapter behind it, which is exactly what dsh is.
 */
/** The worker has an adapter for these runtimes. Registry-only tools keep their own launch door. */
export const THE_RUNTIMES_THE_OFFICE_DISPATCHES = ['claude-code', 'codex', 'opencode', 'kimi'] as const

export const THE_RUNTIMES_THIS_OFFICE_STARTS_HERE: readonly AgentRuntime[] = [
  'claude-code',
  'dsh',
  'opencode',
  'kimi',
]

/**
 * THOSE WORDS IN A SENTENCE, for a refusal that has to name them, the way `theRuntimeWordsSaid`
 * above does for the whole registry. Written here and not in the gate, for the reason that one
 * gives: a word added to the set left two refusals telling a reader to use one of three.
 */
export function theRuntimesThisOfficeStartsHereSaid(): string {
  const words = [...THE_RUNTIMES_THIS_OFFICE_STARTS_HERE].map((word) => `"${word}"`)
  const last = words.pop() ?? ''
  return words.length === 0 ? last : `${words.join(', ')} or ${last}`
}

/** Whether a runtime word is one this office's own tools start here. Criterion P88, as amended. */
export function thisOfficeStartsThisRuntimeHere(said: string): boolean {
  return (THE_RUNTIMES_THIS_OFFICE_STARTS_HERE as readonly string[]).includes(said)
}

/** The runtime words a registration may declare that the office cannot itself dispatch a run on. */
export const RUNTIMES_STARTED_BY_THEIR_OWN_TOOL: readonly AgentRuntime[] = ['dsh']

/**
 * WHY THE OFFICE CANNOT START A RUN ON THIS RUNTIME, or null because it can.
 *
 * A dsh agent is a real citizen with a real handle, and a person may write to it from the contact
 * list. The office must not start a run for it and must not fall over trying: there is no adapter,
 * because a dsh worker is started by this office's own tools and never by the message worker. So the
 * message stays queued and its delivery row carries this sentence, the way a message to an agent
 * nobody holds waits under M78.
 *
 * WRITTEN ONCE AND READ BY BOTH PATHS. `whyNotNow` holds a queued message with it and the start path
 * refuses with it; typing it twice is how two sentences about one fact drift apart.
 */
export function whyTheOfficeCannotStartThisRuntime(said: string): string | null {
  if (!(RUNTIMES_STARTED_BY_THEIR_OWN_TOOL as readonly string[]).includes(said)) return null
  // English on the server, where it is stored on a delivery row; the page's language on a page.
  return readStoredWord('devWords.runtime.notDispatched', { runtime: said })
}

/**
 * WHEN P88's REFUSAL BEGINS. This is the day the gate was built and merged, and every row already
 * in the corpus on that day is admitted before P88.
 *
 * A ROW BEFORE THIS IS NEVER REFUSED AFTER THE FACT. The secretary's ruling of 12 September 2026 is
 * narrower than the criterion's own words: the 37 Codex rows and the rows with no runtime are neither
 * retired nor refused, because the gate judges a REGISTRATION and not the rows already registered.
 * The date is a full day and the comparison is lexicographic on the local wall-clock stamp, so a row
 * written before midnight on 11 September 2026 is before it and one written on 12 September is not.
 */
export const P88_REFUSES_FROM = '2026-09-12'

/**
 * WHETHER THIS STORED ROW WAS ADMITTED BEFORE P88.
 *
 * THREE FACTS, ALL NEEDED. It has no credential (a credential is the Embassy path and is not this
 * case), its runtime is not the office's own Claude Code (a Claude Code row is not what P88 governs),
 * and it was written before the gate existed. A row with no runtime is included: the ruling says
 * those rows are let through and marked unknown, never refused.
 */
export function admittedBeforeP88(runtime: string | null, createdAt: string, credential: string | null): boolean {
  if (credential !== null) return false
  if (runtime === THE_OFFICES_OWN_RUNTIME) return false
  return createdAt < P88_REFUSES_FROM
}

/**
 * THE SENTENCE A ROW ADMITTED BEFORE P88 CARRIES, or null because it is not one.
 *
 * It names the runtime as it reads — `unknown` where the row declares none — and the date it was
 * registered. It is drawn on the Embassy and on the citizen's page, so the reader can tell a row the
 * old door let in from one the new gate governs without opening a document.
 */
export function admittedBeforeP88Says(runtime: string | null, createdAt: string): string {
  const word = runtime === null || runtime === '' ? 'unknown' : runtime
  return (
    `Admitted through the registration door on ${createdAt}, before P88. Its runtime is ${word}. ` +
    'Since P88, a registration made on this machine declares its runtime, because P88 judges by it.'
  )
}

/** What a reader is shown for one runtime: the short word on the mark, and the tool's own name. */
export interface RuntimeWords {
  /** The word drawn beside a message. Short, because it sits in a corner of a chat bubble. */
  short: string
  /** The tool's name, which is the mark's hover text and what a reader who hears the page is told. */
  full: string
}

/**
 * WHAT EACH RUNTIME IS CALLED, for the small mark beside a message that came out of a run.
 *
 * The mark is a small claude, codex or opencode tag beside the conversation. So the short word
 * is the tag, and the tool's own name is the
 * sentence behind it.
 *
 * A `Record` keyed by the runtime rather than an array, so a fourth runtime added to
 * `AGENT_RUNTIMES` with nothing to call it does not compile. That is the guard `DELIVERY` in
 * shared/messages.ts uses, for the same reason.
 */
export const RUNTIME_WORDS: Readonly<Record<AgentRuntime, RuntimeWords>> = {
  'claude-code': { short: 'claude', full: 'Claude Code' },
  codex: { short: 'codex', full: 'Codex' },
  opencode: { short: 'opencode', full: 'OpenCode' },
  // KIMI CLI, AND THE NAME IS THE CAREFUL PART. Its own `--help` calls it "Kimi Code CLI", and so
  // does the npm package `@moonshot-ai/kimi-code`, which is a different program. "Kimi CLI" is the
  // name the framework survey in this repository uses for the one this word serves, so a reader
  // meeting the mark and the survey meets one name.
  kimi: { short: 'kimi', full: 'Kimi CLI' },
  // DSH IS THE RUNNER AND DEEPSEEK IS THE MODEL BEHIND IT, and the full name says both because the
  // short word says neither. Criterion P88, as amended on 12 September 2026: dsh became a word a
  // registration may declare when it became clear that every worker building this project runs on
  // it.
  dsh: { short: 'dsh', full: 'DeepSeek through dsh' },
}

/**
 * A RUNTIME AS A PERSON READS IT: the tool's own name where the office knows the word, and the word as it came
 * where it does not. The Casting page and the profile's model note both say "Codex", never "codex" (wave 13k
 * round 37, the review of round 36's pictures).
 */
export function runtimeShownName(value: string): string {
  return isAgentRuntime(value) ? RUNTIME_WORDS[value].full : value
}

/**
 * The runtime word to store in the registry for what a record says, or null because it says none.
 *
 * ONE ANSWER FOR TWO CALLERS: the migration, reading records written before the check existed, and
 * the door, reading a record the write gate never saw — an imported one, which is written with
 * hand-built SQL and passes through no gate. Both meet the same question and must not answer it
 * differently.
 *
 * IT NEVER INVENTS A RUNTIME. `codex-cli` does not become `codex`. An undeclared word, an empty
 * string and anything that is not a string all give null, and the record keeps whatever it holds.
 */
export function declaredRuntimeOrNull(said: unknown): AgentRuntime | null {
  if (typeof said !== 'string') return null
  const word = said.trim()
  return isAgentRuntime(word) ? word : null
}

/** The shortest a handle may be. */
export const HANDLE_MIN = 2
/** The longest a handle may be. */
export const HANDLE_MAX = 40

/**
 * THE HANDLE RULE, IN ONE PLACE: lowercase letters, digits and dashes, 2 to 40 characters, starting and
 * ending with a letter or a digit.
 *
 * There were two rules. The registry's took a dash at either end; the `agent` record's refused it,
 * and the migration in src/server/db/agent-identity.ts kept a copy of that one. So a registration
 * that waited for the person's press was filed under a handle the agent record then refused at the
 * press. The stricter rule is the one the beta guide gives, and no stored handle breaks it: on
 * 6 Nov the live registry held 1949 agents and none of their handles starts or ends with a dash.
 * Both rules are now read from here: `whyHandleIsRefused` for the registry, and
 * `whyThatIsNotAHandle` for the agent record, which says the same complaint about the handle it names.
 */
const HANDLE_CHARACTERS = /^[a-z0-9-]+$/

/** What breaks the handle rule, in a sentence a reader can act on, or null when nothing does. Says nothing of the office's own handle. */
function whatBreaksTheHandleRule(handle: string): string | null {
  if (handle !== handle.trim()) return 'A handle may not start or end with a space.'
  if (handle.length < HANDLE_MIN) return `A handle is at least ${String(HANDLE_MIN)} characters long.`
  if (handle.length > HANDLE_MAX) return `A handle is at most ${String(HANDLE_MAX)} characters long.`
  if (!HANDLE_CHARACTERS.test(handle)) return 'A handle holds lowercase letters, digits and dashes, and nothing else.'
  if (handle.startsWith('-') || handle.endsWith('-')) return 'A handle starts and ends with a letter or a digit, never with a dash.'
  return null
}

/** What is wrong with a handle, in a sentence a reader can act on, or null when nothing is. */
export function whyHandleIsRefused(handle: string): string | null {
  const broken = whatBreaksTheHandleRule(handle)
  if (broken !== null) return broken
  // AND ONE HANDLE IS TAKEN BY THE PRODUCT ITSELF. Said here rather than at the two doors that ask
  // it, because a rule written twice is the defect CLAUDE.md names as this repository's own. The
  // whole reason is on HANDLE_BELONGS_TO_MOLE_OFFICE at the foot of this file.
  if (handle === MOLE_OFFICE_HANDLE) return HANDLE_BELONGS_TO_MOLE_OFFICE
  return null
}

/** Whether a string could have been an agent's handle when its row was made. The office's own handle is one, and taken. */
export function couldBeAHandle(id: string): boolean {
  return id === MOLE_OFFICE_HANDLE || whyHandleIsRefused(id) === null
}

/**
 * WHETHER A VALUE IS A HANDLE AT ALL, for the `agent` record: the same rule, said of the handle it names.
 *
 * It takes any value, because a record's field may hold anything. It says nothing of the office's own
 * handle: the door that writes an agent refuses that one with 409, because the handle is taken rather
 * than malformed (`assertHandleIsFree` in src/server/lib/inbox.ts).
 */
export function whyThatIsNotAHandle(handle: unknown): string | null {
  if (typeof handle !== 'string' || handle.trim() === '') {
    return 'An agent needs a handle: the short name a person types to address it, like "round-ten".'
  }
  const broken = whatBreaksTheHandleRule(handle)
  return broken === null ? null : `The handle "${handle}" is not one Mole Office can store. ${broken}`
}

/**
 * WHAT IS WRONG WITH A NAME, in a sentence a reader can act on, or null when nothing is.
 *
 * ---------------------------------------------------------------------------------------
 * A NAME IS A LABEL, AND IT IS HELD TO THE LABEL'S OWN BUDGET
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M35: the names of agents were too long. A name is the bare name, or the name
 * - the coordinator; never a description of what the thing does.
 *
 * "A few words" already has one meaning in this product: the level-1 length of `src/shared/zoom.ts`,
 * two to five words, whose own description is *a name, not a sentence*. So the budget is asked for
 * rather than restated, and the refusal carries that budget's own words — a second number written
 * here would be the same rule in two places, free to drift the day the ladder changes.
 *
 * IT USED TO BE EIGHTY CHARACTERS AND NOTHING ELSE, which let in
 * "2026-09-02 — POINTING reopened by its owner: every level a real abstract, click = target = box
 * (agent)". A name like that is what this budget refuses.
 *
 * A NAME OF ONE WORD IS FINE. `budgetAgainst` judges the low end by characters where a text has no
 * spaces, so a first name and `POINTING` both pass; the two-word minimum only ever refuses a spaced fragment.
 *
 * THE EMPTY CASE KEEPS ITS OWN SENTENCE, because the budget's words for a blank text tell a reader
 * to leave the level out, which is advice about a zoom ladder and not about a name.
 */
export function whyNameIsRefused(name: string): string | null {
  if (name.trim() === '') return 'A name cannot be empty.'
  return budgetProblem('label', name)
}

/**
 * The longest a state may be, in characters.
 *
 * Short on purpose. It is drawn small under a name, beside a picture, in a list of contacts, and a
 * sentence that wrapped there would push every row apart. This is the agent's decision recorded
 * under section 7.5 of design/messages/ACCEPTANCE.md, and the owner may take it back.
 */
export const STATE_MAX = 60

/**
 * The states the app offers beside the box, so that the common ones need no typing.
 *
 * THE PRESETS ARE THE WEB'S, NOT THE DOOR'S. What is stored is the text and only the text: a person
 * or an agent may write anything up to `STATE_MAX`, and the door has no list to check it against. If
 * it did, a state nobody had thought of would be refused, and a self-set state that somebody else
 * has to approve is not self-set. Criterion M4 says the same for presence: state is declared, and
 * whether anybody is reachable is worked out and never declared.
 */
export const STATE_PRESETS = ['working', 'away', 'do not disturb'] as const

/** What is wrong with a state, in a sentence a reader can act on, or null when nothing is. */
export function whyStateIsRefused(state: string): string | null {
  if (state.length > STATE_MAX) {
    return `A state is at most ${String(STATE_MAX)} characters long, and this one is ${String(state.length)}.`
  }
  return null
}

// ---------------------------------------------------------------- whether a person says they are here

/**
 * THE THREE ANSWERS A PERSON MAY GIVE ABOUT WHETHER THEY ARE HERE.
 *
 * Decision `wvfrwvuzsKF_`: online by default, and a person may set online, offline or invisible. Invisible
 * means an agent learns the person is online only when the person writes to it. Criterion M20.
 *
 * THIS IS ONLY A PERSON'S. An agent's presence is worked out from what is running (M4) and an agent
 * has nothing to declare, so the door refuses this field on an agent rather than storing a word that
 * would then be ignored.
 */
export const PRESENCE_CHOICES = ['online', 'offline', 'invisible'] as const

/** One of the three. */
export type PresenceChoice = (typeof PRESENCE_CHOICES)[number]

/** True when this word is one of the three. */
export function isPresenceChoice(value: unknown): value is PresenceChoice {
  return typeof value === 'string' && (PRESENCE_CHOICES as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: online.
 *
 * It is a named constant rather than a literal in the reader, so that a screen saying "the default"
 * and the reader working one out cannot come to different answers.
 */
export const PRESENCE_BEFORE_ANYBODY_CHOOSES: PresenceChoice = 'online'

/** What each choice says, on the screen and to somebody who asks what it means. */
export const PRESENCE_CHOICE_WORDS: Readonly<Record<PresenceChoice, { word: string; sentence: string }>> = {
  online: {
    word: 'Online',
    sentence: 'Everybody is told you are here.',
  },
  offline: {
    word: 'Offline',
    sentence: 'Everybody is told you are away, whether or not a page of yours is open.',
  },
  invisible: {
    word: 'Invisible',
    sentence:
      'An agent is told you are here only after you have written to it. To every other agent you look ' +
      'the same as being away.',
  },
}

// --------------------------------------------------- the short names proposed for the long ones

/**
 * ONE PROPOSED SHORT NAME FOR ONE PARTICIPANT WHOSE NAME IS A DESCRIPTION.
 *
 * Criterion M35: a name is the bare name, or the name - the coordinator, and never a description.
 *
 * A NAME IS A PERSON'S TO GIVE, and the participants door already says so: an agent may change its
 * own picture and no name at all. So the long names already in the registries cannot be fixed by an
 * agent writing over them. They are proposed to the person instead, as a list on their settings page with one
 * press that applies all of them through that same door — their act, made once, rather than fifteen
 * edits typed by hand.
 */
export interface ProposedName {
  /**
   * THE AGENT'S REGISTRY ID. Not its handle.
   *
   * This said "the agent's registry id, which is its handle" until the id was split from the name,
   * at criterion I1. The two are the same string on every agent
   * registered before that, because nothing was rewritten for them, and they are different strings
   * on every agent registered after it. So the field holds an id, it is read as an id, and a handle
   * written here would name the wrong agent the day a name is reused.
   */
  id: string
  /** The short name proposed for it, and the reason it is this one. */
  name: string
  /** Where the proposal came from, so they are not asked to accept a name nobody can account for. */
  because: string
}

/**
 * THE NAMES PROPOSED, in the order they were registered.
 *
 * WHY THE LIST IS WRITTEN DOWN RATHER THAN WORKED OUT. A short name cannot be derived from a long
 * one: "2026-09-02 — POINTING reopened by its owner: every level a real abstract, click = target = box
 * (agent)" becomes "POINTING" by somebody reading it, not by cutting it. So each of these is a
 * proposal an agent made and they accept or ignore; the argument for each is on the row.
 *
 * IT EMPTIES ITSELF. A row is only drawn while that participant is registered here AND still carries
 * a name that is not the proposed one. Once they press, every row goes and this list draws nothing,
 * in this installation and in any other where these ids do not exist.
 */
export const PROPOSED_NAMES: readonly ProposedName[] = [
  {
    id: 'throwaway-step-g1-run',
    name: 'Throwaway 1',
    because: 'A run made to test one gate, kept because deleting a registry row deletes what it said.',
  },
  {
    id: 'throwaway-gate11-addressable-run',
    name: 'Throwaway 2',
    because: 'The second of the three, by the order they were registered.',
  },
  {
    id: 'throwaway-gate11-resumable-run',
    name: 'Throwaway 3',
    because: 'The third of the three, by the order they were registered.',
  },
]

// ------------------------------------------------------- how the number on the chat circle is drawn

/**
 * THE TWO WAYS THE NUMBER ON THE CHAT CIRCLE MAY BE DRAWN, criterion M32.
 *
 * The number may be drawn as two bubbles of different colours, or merged into one; merged is the
 * default, and a setting changes it.
 *
 * `merged` adds the contacts' unread messages and the number of unread groups into one number.
 * `two` draws them as two bubbles of different colours, messages first.
 *
 * DECLARED ONCE FOR THE DOOR, THE REPLY AND THE CONTROL, so a control cannot offer a word the door
 * refuses and a stored word cannot be one no screen can draw.
 */
export const CIRCLE_SHOWS = ['merged', 'two'] as const

/** One of the two. */
export type CircleShows = (typeof CIRCLE_SHOWS)[number]

/** True when this word is one of the two. */
export function isCircleShows(value: unknown): value is CircleShows {
  return typeof value === 'string' && (CIRCLE_SHOWS as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: the merged number.
 *
 * A named constant rather than a literal in the reader, for the reason
 * `PRESENCE_BEFORE_ANYBODY_CHOOSES` above is one.
 */
export const CIRCLE_BEFORE_ANYBODY_CHOOSES: CircleShows = 'merged'

/** What each way of drawing it is called, on the control that chooses. */
export const CIRCLE_SHOWS_WORDS: Readonly<Record<CircleShows, string>> = {
  merged: 'One number',
  two: 'Two bubbles',
}

// ------------------------------------------- when the chat circle shows, and how the chat opens

/**
 * WHEN THE CHAT CIRCLE IN THE BOTTOM-RIGHT CORNER SHOWS.
 *
 * `when-unread` is what the circle has always done: it shows while the chat is shut and a message
 * or group waits. `always` keeps it in the corner on every page, shut or open, unless the open chat
 * itself covers that corner.
 *
 * DECLARED ONCE FOR THE DOOR, THE REPLY AND THE CONTROL, as `CIRCLE_SHOWS` above is.
 */
export const CHAT_BUTTON_STAYS = ['when-unread', 'always'] as const

/** One of the two. */
export type ChatButtonStays = (typeof CHAT_BUTTON_STAYS)[number]

/** True when this word is one of the two. */
export function isChatButtonStays(value: unknown): value is ChatButtonStays {
  return typeof value === 'string' && (CHAT_BUTTON_STAYS as readonly string[]).includes(value)
}

/** WHAT A PERSON HAVING NEVER CHOSEN IS READ AS: the button stays in the corner. */
export const CHAT_BUTTON_STAYS_BEFORE_ANYBODY_CHOOSES: ChatButtonStays = 'always'

/** A person's button stays; agents keep the previous unread-only default. */
export function chatButtonStaysBeforeAnybodyChooses(kind: ParticipantKind | undefined): ChatButtonStays {
  return kind === 'person' ? CHAT_BUTTON_STAYS_BEFORE_ANYBODY_CHOOSES : 'when-unread'
}

/**
 * HOW THE CHAT OPENS from the circle, the sidebar's Chat row, the phone's bar and the chat key.
 *
 * `split` is what they have always done: the chat opens beside the page. `window` opens it in its
 * window over the bottom-right corner, the one the seam sends it to.
 */
export const CHAT_OPENS_AS = ['split', 'window'] as const

/** One of the two. */
export type ChatOpensAs = (typeof CHAT_OPENS_AS)[number]

/** True when this word is one of the two. */
export function isChatOpensAs(value: unknown): value is ChatOpensAs {
  return typeof value === 'string' && (CHAT_OPENS_AS as readonly string[]).includes(value)
}

/** WHAT NOBODY HAVING CHOSEN IS READ AS: `split`, which is how the chat opens today. */
export const CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES: ChatOpensAs = 'split'

/** A person's chosen chat layout; null leaves the layout to the available width. */
export const CHAT_LAYOUTS = ['one', 'two'] as const
export type ChatLayout = (typeof CHAT_LAYOUTS)[number]
export function isChatLayout(value: unknown): value is ChatLayout {
  return typeof value === 'string' && (CHAT_LAYOUTS as readonly string[]).includes(value)
}

// -------------------------------------------- which name a record named in a message is drawn under

/**
 * THE TWO NAMES A RECORD NAMED IN A MESSAGE MAY BE DRAWN UNDER, criterion M47.
 *
 * A setting chooses whether a link in a message shows its level-1 or level-2 words, and level 1
 * is the default.
 *
 * `label` is the first rung of the reading ladder: the short name somebody wrote on the record, two
 * to five words. Most records have none, and where none is written the title stands in and the link
 * says so. `title` is the second rung, the record's own title, and it is drawn whether or not a
 * label exists.
 *
 * THE TWO WORDS ARE THE LADDER'S OWN, checked against it rather than spelt again here. A rung
 * renamed in `shared/zoom.ts` breaks this line rather than leaving a setting offering a word
 * `POST /api/short-forms/rows` no longer answers to.
 */
export const MESSAGE_LINK_LEVELS = ['label', 'title'] as const satisfies readonly ShortFormLevel[]

/** One of the two. */
export type MessageLinkLevel = (typeof MESSAGE_LINK_LEVELS)[number]

/** True when this word is one of the two. */
export function isMessageLinkLevel(value: unknown): value is MessageLinkLevel {
  return typeof value === 'string' && (MESSAGE_LINK_LEVELS as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: the label.
 *
 * A named constant rather than a literal in the reader, for the reason
 * `CIRCLE_BEFORE_ANYBODY_CHOOSES` above is one.
 */
export const MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES: MessageLinkLevel = 'label'

/** What each of the two is called, on the control that chooses. */
export const MESSAGE_LINK_LEVEL_WORDS: Readonly<Record<MessageLinkLevel, string>> = {
  label: 'The label',
  title: 'The title',
}

// ------------------------------------------------- how that link is laid out in the message bubble

/**
 * THE TWO WAYS A LINK IN A MESSAGE MAY BE LAID OUT, criterion M48.
 *
 * A setting chooses whether a link runs on as normal text or sits on its own centred line. The
 * default was its own centred line.
 *
 * `own-line` gives the link a line to itself, the width of the bubble, with its words centred.
 * `inline` lets it run on with the sentence around it and break across lines like any other words.
 *
 * WHY THE PERSON SAW ONE OF THESE WITHOUT ANYBODY CHOOSING IT. The link used to be a `button`, and a button
 * is an inline-block: one box that cannot be broken across lines. A name too long for the bubble
 * therefore grew to the bubble's full width, which left no room beside the words before it, so it
 * dropped to a line of its own — and a button's own default is to centre what is written on it.
 * Measured on 5 September 2026 in a browser: a level-2 name in a 222-pixel bubble came out 222
 * pixels wide, on its own line, its three lines of words centred. A short name did not: it stayed
 * beside the sentence. So neither layout was ever chosen and one of them was not even consistent.
 */
export const MESSAGE_LINK_LAYOUTS = ['own-line', 'inline'] as const

/** One of the two. */
export type MessageLinkLayout = (typeof MESSAGE_LINK_LAYOUTS)[number]

/** True when this word is one of the two. */
export function isMessageLinkLayout(value: unknown): value is MessageLinkLayout {
  return typeof value === 'string' && (MESSAGE_LINK_LAYOUTS as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: in the sentence, running on with the words around it. Until
 * 7 November 2026 the default was its own centred line; since then links in the
 * chat sit in the sentence unless somebody chooses otherwise. Its own centred line stays a choice.
 * A choice already saved is kept, because it is stored on that person's own row and this is read only
 * where the row holds none.
 *
 * A named constant rather than a literal in the reader, for the reason
 * `CIRCLE_BEFORE_ANYBODY_CHOOSES` above is one.
 */
export const MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES: MessageLinkLayout = 'inline'

/** What each of the two is called, on the control that chooses. */
export const MESSAGE_LINK_LAYOUT_WORDS: Readonly<Record<MessageLinkLayout, string>> = {
  'own-line': 'Its own line, centred',
  inline: 'In the sentence',
}

/**
 * WHETHER A MESSAGE SAYS WHICH PROJECT IT WAS FILED IN. Criterion M73.
 *
 * Switching to another project once made a line saying which
 * project a message was in appear under messages that had not changed, and it had not been there
 * before. The mark is now always drawn or never drawn, rather than appearing on a switch.
 *
 * It is a setting of the person, off by default; when it is on, the mark
 * is drawn on EVERY message whatever project the reader stands in, because the chat is theirs across
 * every project and never changes with it.
 */
export const MESSAGE_PROJECT_MARKS = ['always', 'never'] as const

/** One of the two. */
export type MessageProjectMark = (typeof MESSAGE_PROJECT_MARKS)[number]

/** True when this word is one of the two. */
export function isMessageProjectMark(value: unknown): value is MessageProjectMark {
  return typeof value === 'string' && (MESSAGE_PROJECT_MARKS as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: off.
 *
 * A named constant rather than a literal in the reader, for the reason
 * `CIRCLE_BEFORE_ANYBODY_CHOOSES` above is one.
 */
export const MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES: MessageProjectMark = 'never'

/** What each of the two is called, on the control that chooses. */
export const MESSAGE_PROJECT_MARK_WORDS: Readonly<Record<MessageProjectMark, string>> = {
  always: 'On every message',
  never: 'On none of them',
}

/**
 * HOW BIG THE CHAT'S OWN TEXT IS: the list, the bubbles and the box. Criterion M112.
 *
 * A setting sets the size of the chat's text.
 *
 * THIS IS NOT THE APPEARANCE BAR'S TEXT SIZE. `PresetBar.tsx` already offers `small`/`default`/
 * `large` for the WHOLE app, remembered in THIS BROWSER (`tokens.css` moves the root font size, and
 * `--fs-1/2/3` follow it everywhere, chat included). That axis stays exactly as it is: this is a
 * second, narrower knob, on the chat alone, and it answers a different question — not "how big is
 * everything on my screen" but "how big is what I read and type in the chat, wherever I open it."
 * It is why this one follows the PERSON and not the browser: read on any machine they open Mole
 * Office from, the way `circle_shows` and the two message settings above already do.
 *
 * THREE WORDS, NOT PIXELS. A number of pixels would be more precise and less legible on the
 * control, and three named steps is the vocabulary every other setting on this row already uses —
 * `CIRCLE_SHOWS`, `MESSAGE_PICTURE_CHOICES`, the two above. `normal` and not `default`, on purpose:
 * the appearance bar's own three words are `small`/`default`/`large`, and a person reading both
 * controls in Settings at once should not have to work out whether two 'default' words are the same
 * fact stored twice. They are not: this one is null until THE PERSON chooses, and reads as `normal`.
 */
export const CHAT_TEXT_SIZES = ['small', 'normal', 'large'] as const

/** The profile language is null until a person chooses. Its list is shared with the pages. */
export { LANGUAGES, isLanguage, type Language } from './i18n.ts'

/** One of the three. */
export type ChatTextSize = (typeof CHAT_TEXT_SIZES)[number]

/** True when this word is one of the three. */
export function isChatTextSize(value: unknown): value is ChatTextSize {
  return typeof value === 'string' && (CHAT_TEXT_SIZES as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: `normal`, which is what the chat draws today. Criterion
 * M112 asks for exactly this default, so that a person who never opens this control sees no change.
 */
export const CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES: ChatTextSize = 'normal'

/** What each of the three is called, on the control that chooses. */
export const CHAT_TEXT_SIZE_WORDS: Readonly<Record<ChatTextSize, string>> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
}

/**
 * WHICH KEY SENDS A MESSAGE. Enter makes a new line by default, and
 * Shift+Enter or Alt+Enter sends. It is the first keyboard shortcut in the settings.
 *
 * TWO STORED WORDS, not three and not a boolean. `shift-or-alt-enter` is the
 * default: Enter makes a new line, and Shift+Enter or Alt+Enter sends. `enter` is what the chat did
 * before this setting existed: Enter sends, and Shift+Enter makes a new line. A null column reads as
 * `shift-or-alt-enter`, so a person who never opens the control sees the new default.
 *
 * IT IS THE PERSON'S OWN AND FOLLOWS THEM, the way `language` and `chatTextSize` beside it do: one
 * column on the `people` row rather than a choice this browser remembers, so every device follows
 * it. Migration 0188.
 *
 * IT DECIDES ONLY WHICH PRESS SENDS. While an input method is composing, Enter belongs to the input
 * method and neither sends nor adds a line, in both settings; `src/web/lib/send-key.ts` is the one
 * place that fact is worked out for every box.
 */
export const SEND_KEY_SETTINGS = ['shift-or-alt-enter', 'enter'] as const

/** One of the two. */
export type SendKeySetting = (typeof SEND_KEY_SETTINGS)[number]

/** True when this word is one of the two. */
export function isSendKeySetting(value: unknown): value is SendKeySetting {
  return typeof value === 'string' && (SEND_KEY_SETTINGS as readonly string[]).includes(value)
}

/**
 * WHAT NOBODY HAVING CHOSEN IS READ AS: `shift-or-alt-enter`, the new default. A person who
 * never opens the Keyboard shortcuts control gets Enter for a new line and Shift+Enter or Alt+Enter
 * to send, and the column stays null so a reader is told "they have not chosen" rather than "they chose".
 */
export const SEND_KEY_BEFORE_ANYBODY_CHOOSES: SendKeySetting = 'shift-or-alt-enter'

/**
 * THE KEYBOARD SHORTCUTS A PERSON CAN TURN ON OR OFF. Each of the eight questions of the proposal in report
 * hbu756wTdJnz is answered as its recommendation says, at item 5 of a decision.
 *
 * ONE ID FOR EACH ROW OF THE SETTINGS GROUP. Which keys each id answers to, and its words, are in
 * `src/web/lib/shortcuts.ts`, whose table is typed over this list, so a row cannot be added there and
 * missed here. The door refuses an id this list does not hold.
 *
 * NOT BUILT, AND SO NOT HERE: `r` for the review pane and `a` for pointing at a part. The proposal's
 * first batch (question 8) leaves them out.
 */
export const SHORTCUT_IDS = ['chat', 'keys', 'home', 'decisions', 'settings', 'project', 'waiting', 'search', 'quickSearch', 'theme'] as const

/** One of them. */
export type ShortcutId = (typeof SHORTCUT_IDS)[number]

/** True when this word names one of them. */
export function isShortcutId(value: unknown): value is ShortcutId {
  return typeof value === 'string' && (SHORTCUT_IDS as readonly string[]).includes(value)
}

/**
 * WHAT A PERSON HAS CHOSEN ABOUT THE SHORTCUTS, stored as JSON in the `shortcuts` column of their
 * `people` row (migration 0191).
 *
 * `singleKeys` is the one switch for every single-letter key and every "g" key. `false` stops all of
 * them at once, whatever `off` says. The keys held with Ctrl (⌘ on a Mac) are not single keys and
 * follow only their own row.
 *
 * `off` names each shortcut they turned off, in the order of `SHORTCUT_IDS`, each once.
 *
 * A NULL COLUMN MEANS NOBODY HAS CHOSEN, and it is read as `SHORTCUTS_BEFORE_ANYBODY_CHOOSES`: every
 * shortcut on. That is the proposal's question 3, answered "on by default".
 */
export interface ShortcutSettings {
  singleKeys: boolean
  off: ShortcutId[]
}

/** What nobody having chosen is read as: every shortcut on. */
export const SHORTCUTS_BEFORE_ANYBODY_CHOOSES: ShortcutSettings = { singleKeys: true, off: [] }

/**
 * THE ONE STRICT READING OF A STORED OR SENT VALUE. It answers the settings, in their one order, or
 * a sentence saying what is wrong. Nothing is guessed: an unknown key, an unknown id, an id named
 * twice or a value of the wrong type is an error, never dropped quietly.
 */
export function readShortcutSettings(value: unknown): { ok: true; settings: ShortcutSettings } | { ok: false; why: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, why: 'The shortcuts must be an object with singleKeys and off, or null.' }
  }
  const held = value as Record<string, unknown>
  const extra = Object.keys(held).filter((key) => key !== 'singleKeys' && key !== 'off')
  if (extra.length > 0) return { ok: false, why: `The shortcuts hold only singleKeys and off; they were sent ${extra.join(', ')} as well.` }
  if (typeof held['singleKeys'] !== 'boolean') return { ok: false, why: 'singleKeys must be true or false.' }
  const off = held['off']
  if (!Array.isArray(off)) return { ok: false, why: 'off must be a list of shortcut names.' }
  const unknown = off.filter((one) => !isShortcutId(one))
  if (unknown.length > 0) {
    return { ok: false, why: `off names ${unknown.map((one) => JSON.stringify(one)).join(', ')}, which is not a shortcut. They are: ${SHORTCUT_IDS.join(', ')}.` }
  }
  if (new Set(off).size !== off.length) return { ok: false, why: 'off names one shortcut more than once.' }
  return {
    ok: true,
    settings: { singleKeys: held['singleKeys'], off: SHORTCUT_IDS.filter((id) => (off as unknown[]).includes(id)) },
  }
}

/**
 * The `assets` row id of the picture this product draws for a participant that has chosen none.
 *
 * WORKED OUT FROM THE PARTICIPANT AND NOT MINTED, so the same participant always has the same
 * default picture with the same row, on this machine and on any other. That is what M3 asks for:
 * *A default avatar is generated from the participant's id, the same every time.* An id nothing can
 * mint also means the migration can write these rows without a random source.
 *
 * IT IS A REAL ROW AND NOT AN ABSENCE. `people.avatar_asset_id` and `agents.avatar_asset_id` are
 * never null, so "which picture is this" has one answer and never two. Resetting an uploaded picture
 * points back at this row, which is still there, and the uploaded row and its file are left alone.
 */
export function defaultAvatarAssetId(who: ParticipantRef): string {
  // JOINED RATHER THAN INTERPOLATED, and that is not a style choice. An asset id is a key and is
  // never drawn for a reader, but a template literal holding `who.kind` reads to the machine-word
  // gate exactly like a stored word arriving on a screen with nothing turning it into English.
  // Joining the parts says what this is — a key made of three — and needs no exception.
  return ['avatar-default', who.kind, who.id].join('-')
}

/**
 * Where a page asks for one picture. One place builds it, so no screen spells the address out.
 *
 * The server puts this on every participant it hands back, so a page normally reads `avatarUrl` and
 * never calls this. It is here for the one thing a page has to work out for itself: the address of
 * the drawing this product made for a participant, which is what a picture falls back to when the
 * file behind an uploaded one cannot be fetched.
 */
export function avatarUrlFor(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}`
}

/** Where the right to use a picture this product drew comes from, written on its asset row. */
export const GENERATED_AVATAR_LICENCE = 'generated by Mole Office'

/**
 * WHAT AN ASSET ROW SAYS WHEN THE PICTURE ON IT WAS GIVEN AT THE DOOR RATHER THAN CHOSEN.
 *
 * Criterion M75. An agent takes the offered picture when its registry row is written, so its row
 * holds a real picture and nothing could tell that apart from somebody choosing one — which is why
 * every builder in their chat wore the same bee. It is written where a picture's provenance already
 * goes, and it is what lets a card portrait be drawn instead without ever replacing a picture
 * somebody picked.
 *
 * IT IS HERE AND NOT IN `lib/avatars.ts` because it is a word, and a word both sides read belongs
 * where the other picture words are. Importing it from the server library pulls the database client
 * in with it, which a test that has not named its own database is rightly refused for.
 */
export const THE_PICTURE_WAS_GIVEN = 'offered by Mole Office and taken at the door'

/** The kind of asset an avatar is. The only kind of asset there is today. */
export const AVATAR_ASSET_KIND = 'avatar'

/** What a picture this product drew is: an SVG, worked out when it is asked for. */
export const GENERATED_AVATAR_MIME = 'image/svg+xml'

/**
 * The picture types somebody may upload, and the file extension each is stored under.
 *
 * THREE, AS M3 NAMES THEM. An SVG is deliberately not one: it is a document a browser executes, and
 * this product serves an uploaded file back to a page, so accepting one would be handing a page
 * somebody else's script. A picture this product drew is an SVG, and that one it wrote itself.
 */
export const UPLOADABLE_AVATAR_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const satisfies Readonly<Record<string, string>>

export type UploadableAvatarType = keyof typeof UPLOADABLE_AVATAR_TYPES

export function isUploadableAvatarType(value: unknown): value is UploadableAvatarType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UPLOADABLE_AVATAR_TYPES, value)
}

/** Where an uploaded avatar is stored, relative to the data directory. */
export const AVATAR_DIRECTORY = 'avatars'

/**
 * Where the pictures this product offers are kept, relative to the checkout: the drawn and generated
 * sets and the round chat button's pictures. One place, so nothing spells it twice. They sit under
 * public/ so that design/ can become a private folder (FLO-51); the page still reads them through
 * the API, never from this folder's static copy.
 */
export const AVATARS_IN_THE_CHECKOUT = 'public/avatars'

// ============================================================ Mole Office's own participant

/**
 * THE HANDLE MOLE OFFICE ITSELF ANSWERS TO. Its registry id is read from that row; this row is re-minted
 * with every other handle-shaped id.
 *
 * Criterion M11: *Mole Office itself is a participant with a fixed avatar that writes only system
 * lines (a group opened, a member added, a claim in conflict), so those lines have a sender and are
 * not faked as an agent's.*
 */
export const MOLE_OFFICE_HANDLE = 'mole-office'

/**
 * THE ID THE API SERVER WRITES UNDER WHEN IT ACTS ON ITS OWN (wave 13p round 27). A change row it writes
 * stores this as an agent's id, and no registry row holds it, because `whyHandleIsRefused` refuses the
 * slash. A page names that writer as the office, not as an unregistered agent. `THE_OFFICE_WRITES_AS` in
 * src/server/lib/the-offices-secretary-run.ts is built from this.
 */
export const THE_OFFICE_WRITER_ID = 'mole-office/the-api-server'

/**
 * THE ID THE SESSION HOOK WRITES UNDER WHEN IT CANNOT TELL WHICH AGENT ITS SESSION IS (for-agents/session-hook.mjs).
 * No registry row holds it, because a handle has no slash (`whyHandleIsRefused` and `whyThatIsNotAHandle` above), so
 * no agent can register it and come to own what the hook files for nobody. The server lets it write without registering
 * (`AGENT_IDS_THAT_NEED_NO_REGISTRATION` in src/server/lib/records.ts). The hook is an .mjs file that cannot import this
 * .ts file, so it keeps its own copy. Hooks installed before this name existed write `claude-code` instead, which stays
 * on that list.
 */
export const THE_SESSION_HOOK_ID = 'mole-office/the-session-hook'

/**
 * THE IDS THREE OTHER PARTS OF MOLE OFFICE WRITE UNDER (wave 13p round 29). No registry row holds any
 * of them, for the same reason as `THE_OFFICE_WRITER_ID`. A page names each as that part of Mole Office
 * (`writerNamed` in src/web/lib/participant-lookup.ts), and the server lets each write without
 * registering (`AGENT_IDS_THAT_NEED_NO_REGISTRATION` in src/server/lib/records.ts). Both read them here.
 *
 * - The message worker: `THE_WORKER` in src/server/lib/worker.ts, and the merge tool, which writes as it
 *   (tools/merge-tool/arguments.mjs).
 * - The dev supervisor: tools/serve-dev.mjs, for the session row of the supervisor process it runs.
 * - The world sweep: tools/close-worlds-nobody-serves.mjs, which closes a world's row nobody serves.
 *
 * The three tools are .mjs files that cannot import this .ts file, so each keeps its own copy of its id.
 */
import { THE_MESSAGE_WORKER_ID } from './the-message-worker-id.ts'
export { THE_MESSAGE_WORKER_ID }
export const THE_DEV_SUPERVISOR_ID = 'mole-office/the-dev-supervisor'
export const THE_WORLD_SWEEP_ID = 'mole-office/the-world-sweep'

/** Every id the office's own parts write under, the API server's first. */
export const THE_OFFICES_OWN_WRITER_IDS = [THE_OFFICE_WRITER_ID, THE_MESSAGE_WORKER_ID, THE_DEV_SUPERVISOR_ID, THE_WORLD_SWEEP_ID] as const
export type TheOfficesOwnWriterId = (typeof THE_OFFICES_OWN_WRITER_IDS)[number]

/** Whether a stored writer is one of the office's own parts. Only an agent row is: a person stored under one of these ids is not. */
export function isOneOfTheOfficesOwnWriters(who: { actorType: string; actorId: string }): boolean {
  return who.actorType === 'agent' && (THE_OFFICES_OWN_WRITER_IDS as readonly string[]).includes(who.actorId)
}

/** The name a reader sees beside a system line. */
export const MOLE_OFFICE_NAME = 'Mole Office'

/**
 * MOLE OFFICE ITSELF, named the one way a participant is ever named, by the id its row holds.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ITS ID IS READ FROM THE ROW
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I1 separated an agent's minted id from its handle. The office
 * used to be the exception because the product wrote its literal handle as the id on system lines.
 * That exception ends: every handle-shaped id is re-minted, this row included.
 *
 * EVERY SYSTEM LINE NEEDS THE CURRENT ID. Keeping a source literal or a copy made at module load
 * would leave new lines attributed to an agent no registry holds after the re-mint. Call these
 * functions when the value is used. No id is cached between passes or requests.
 *
 * THE HANDLE REMAINS RESERVED. `whyHandleIsRefused` refuses it to every agent record, so ordinary
 * registration cannot take over or retire this row. participants-migration.ts seeds today's id
 * only when no live row holds the handle. The later migration 0269 re-mints the row and carries its
 * face over.
 *
 * HISTORY KEEPS WHAT WAS WRITTEN. Frozen revisions and stamps cannot be rewritten. Point A of
 * kzRKdzm_rpoq gives those readers the historical id table written by 0269; it is merge 2's work.
 * This reader names the live row only and never guesses an earlier id from a handle.
 *
 * THE SERVER REGISTERS A ROW READER in server/lib/participants.ts. The browser registers the id
 * it reads before the app draws, in web/lib/mole-office.ts. An isolated test page explicitly
 * registers its synthetic fixture. A reader that was never registered is a broken bootstrap.
 * Kept on globalThis because a test may reload this module while one process still has one office.
 */
const OFFICE_ID_READER = Symbol.for('mole-office.the-current-office-id-reader')

/** Register the one source of the live office id. This holds the reader, never its answer. */
export function readMoleOfficeIdWith(read: () => string): void {
  ;(globalThis as Record<symbol, unknown>)[OFFICE_ID_READER] = read
}

/** The id the office's row holds now. Absence is an error, never the handle as a substitute. */
export function moleOfficeId(): string {
  const read = (globalThis as Record<symbol, unknown>)[OFFICE_ID_READER]
  if (typeof read !== 'function') {
    throw new Error('Mole Office cannot read its own id: no reader has been registered. The server or page must read its registry row first.')
  }
  const id: unknown = read()
  if (typeof id !== 'string' || id === '') throw new Error('Mole Office read its own registry row, but the reader returned no id.')
  return id
}

/** A fresh reference to the office's live registry row, read at the moment it is needed. */
export function moleOffice(): ParticipantRef {
  return { kind: 'agent', id: moleOfficeId() }
}

/**
 * True when this reference is Mole Office itself rather than an agent somebody runs.
 *
 * IT SITS IN THE AGENT REGISTRY AND IT IS NOT AN AGENT. The row is in `agents` because that
 * registry already holds a name, a handle, a picture and a state, and M2 says there are two
 * registries and no third. What tells the two apart is this function, and every screen that draws a
 * message asks it: a system line is drawn small and grey, never as somebody speaking.
 */
export function isMoleOffice(who: ParticipantRef): boolean {
  return who.kind === 'agent' && who.id === moleOfficeId()
}

/**
 * Bind the current id for one pass over messages. Repeated single-row reads made the
 * live-size pool sort more than twice as slow, at I-10. Construct it inside the pass,
 * pass it to its per-message helpers, and discard it when the pass returns. The next pass reads
 * the row again. Never retain the test at module load or across independent requests.
 */
export function theMoleOfficeTest(): (who: ParticipantRef) => boolean {
  const id = moleOfficeId()
  return (who) => who.kind === 'agent' && who.id === id
}

/**
 * WHY THE HANDLE `mole-office` IS NOT FREE, in the sentence the refusal carries.
 *
 * An agent record taking this handle would be mapped onto Mole Office's own registry row by
 * `keepTheAgentRegistryInStep`, and retiring that record would then retire Mole Office. The handle
 * is refused instead, in the one place both the record door and the registry read.
 */
export const HANDLE_BELONGS_TO_MOLE_OFFICE =
  'The handle "mole-office" belongs to Mole Office itself, which writes the lines that say a group was opened, a ' +
  'member was added or two claims are in conflict. An agent taking it would be given Mole Office\'s own registry ' +
  'row. Pick another handle.'

/**
 * WHAT A PARTICIPANT'S ANSWER SAYS OF THE CARD MOLE OFFICE'S OWN ROW HOLDS, where a row nobody gave a card says "no role
 * set". Nobody is to give this row one. The rules still read it at the worker card, as they read any row with no card.
 */
export const MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD = "Mole Office's own row, which holds no card"

/**
 * WHAT A REFUSAL SAYS OF MOLE OFFICE'S OWN ROW where it would name the card the row holds, after its handle.
 *
 * The row holds no card. A rule that reads a row with no card as the worker card still reads this row so, and refuses
 * what it refused. Only the words differ: a refusal does not say that the product holds the worker card. Each refusal
 * goes on in its own words. They are the words a participant's answer says of the row, so the two cannot differ.
 */
export const MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD = `is ${MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD}`

/** The sentence when a request tries to change Mole Office's own row. */
export const MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE =
  "Mole Office's own row cannot be renamed, retired, given a new picture or given a starter. It is the product, not an agent."
