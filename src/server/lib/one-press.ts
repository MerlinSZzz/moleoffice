// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST FOR ONE PRESS: AN AGENT ASKS THE PERSON TO AGREE TO ONE KNOWN ACT, in wave
 * 13n round 45.
 *
 * An agent files a request naming one of the acts below and that act's fixed inputs. The office writes the sentence
 * the person reads from the act and its inputs. The person agrees or refuses, through doors that are the person's own.
 * On agreement the office runs the act it has for that name, with those inputs, once, and the request then says what
 * the act did, or why it could not run. Nothing an agent wrote is run: the request holds a name from this file and
 * values the act checked, never a command and never text that runs.
 *
 * A SECRETARY HOLDING THE PERSON'S GRANT presses Agree or Refuse for them only where this office's list of what the
 * grant carries says so (`aRaiseCarriesIt` in records/own-words.ts). Agreeing then asks the act's own door as well
 * (`door`), so an agreement never carries an act the list keeps, and the card never lets the grant agree to a request
 * the same secretary filed. The answer is written as the secretary's, never as the person's.
 *
 * THE KNOWN ACTS ARE THIS ONE LIST (`KNOWN_ACTS`). An act not on it cannot be requested.
 *   - `change-a-setting`: one setting from the Settings page's own list (`SETTINGS_PANELS`), to a value that setting
 *     accepts. It is checked with the page's own check and written through the page's own server function.
 *   - `answer-an-ask-at-the-door`: grant or refuse a card ask or a waiting self-registration, the asks Home's
 *     AsksAtTheDoor.tsx draws. It runs the role request door's own answer, `answerARoleRequest`.
 *   - `mark-a-rule-only-for-this-office`: {chapter, rule, only}, through the Regulations page's own mark door.
 *   - `change-what-the-grant-carries`: {changes: [{door, answer}]}, the answers about doors on this office's list of what
 *     the person's grant carries, through that list's own write (api/what-the-grant-carries.ts). Only the person's own
 *     press agrees to it (`onlyThePersonsOwnPress`). The grant and quoted words never carry agreeing to this request, even
 *     though a secretary may separately change the list on the person's written words for that change.
 *
 * THE SETTINGS A REQUEST MAY NOT CHANGE ARE ONE NAMED LIST BESIDE THE ACTS (`SETTINGS_A_REQUEST_MAY_NOT_CHANGE`), each with
 * its reason. It is exhaustive over the Settings page's panels, so a new panel does not compile until somebody decides
 * whether a request may change it.
 */
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { onePressRequests } from '../db/schema.ts'
import { SETTINGS_PANELS, type SettingsPanel } from '@shared/addresses.ts'
import { KEPT_SETTING_KEYS, WHAT_IS_KEPT_LABELS, type KeptSettingKey } from '@shared/what-is-kept.ts'
import type { PanelRecord } from '@shared/types.ts'
import { anOfficeId } from './ids.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theNameAPersonReads } from './inspection.ts'
import { theCanonicalAgentId } from './registry-aliases/worker-runs.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  getRecord,
  thePersonPressedItThemselves,
  writeDownAnActUnderTheRaise,
  writeDownASettingChange,
  type Actor,
} from './records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { WHAT_IS_KEPT_CHECK, readingOf, setWhatTheOfficeKeeps, theChosenNumbers, whatTheOfficeKeeps } from './what-is-kept.ts'
import { aNewKeyAsk } from './newkey.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { answerARoleRequest } from './answering-a-role-request.ts'
import { announce } from './events.ts'
import { markARuleOnlyForThisOffice } from './office-regulations.ts'
import { chapterNumberOf } from '@shared/office-rules.ts'
import {
  THE_CHANGES_TO_THE_LIST,
  aChangeFromNowInWords,
  aChangeInWords,
  changeWhatTheGrantCarries,
  theChangesAreRight,
} from './changing-what-the-grant-carries.ts'

// ============================================================================ the states

/** Where a request stands. `could-not` is the person agreed and the act could not run; `outcome` says why. */
export const ONE_PRESS_STATES = ['waiting', 'done', 'could-not', 'refused', 'withdrawn'] as const
export type OnePressState = (typeof ONE_PRESS_STATES)[number]

/** One request as the doors and Home read it. */
export interface AOnePressRequest {
  id: string
  workspaceId: string
  act: KnownActName
  inputs: Record<string, unknown>
  /** The registry id of the agent that asked, and its handle where one agent answers the id. */
  askedBy: string
  askedByHandle: string | null
  /**
   * The sentence the person reads, written by the office. While the request waits it is drawn again at each read, from
   * the act's inputs and the office as it stands then (`showsAtEachRead`); once answered it is the stored sentence.
   */
  shows: string
  /** The agent's own words, or null. Drawn only in Developer mode. */
  because: string | null
  state: OnePressState
  askedAt: string
  answeredAt: string | null
  answeredBy: { kind: string; id: string } | null
  /** What the act did, or why it could not run, or null while it waits. */
  outcome: string | null
}

// ============================================================================ the settings a request may not change

/** Why a setting on the Settings page may not be changed by a request. */
export type WhyNotByARequest =
  | 'a-key-a-login-or-a-summons'
  | 'who-may-do-what'
  | 'runs-a-command-or-touches-the-machine'
  | 'kept-in-one-browser'
  | 'only-to-read'
  | 'not-offered-yet'

/** Each reason as the refusal says it. */
export const WHY_NOT_BY_A_REQUEST: Readonly<Record<WhyNotByARequest, string>> = {
  'a-key-a-login-or-a-summons': 'it is about a key, a login or a summons, and only the person changes those, on the Settings page',
  'who-may-do-what': 'it changes who may do what, and only the person changes that, on the Settings page',
  'runs-a-command-or-touches-the-machine': 'it runs a command or touches the machine the office runs on, and only the person does that, on the Settings page',
  'kept-in-one-browser': 'it is kept in one browser, so the office cannot change it',
  'only-to-read': 'the Settings page only shows it; it is set somewhere else',
  'not-offered-yet': 'no request has been built for it yet',
}

/** The one panel a request may change, and the settings in it. */
const THE_SETTINGS_A_REQUEST_MAY_CHANGE = { 'settings.whatiskept': KEPT_SETTING_KEYS } as const

type ARequestablePanel = keyof typeof THE_SETTINGS_A_REQUEST_MAY_CHANGE

/**
 * EVERY OTHER PANEL ON THE SETTINGS PAGE, AND WHY A REQUEST MAY NOT CHANGE IT. The three reasons from wave 13q come
 * first: keys, logins and summons; who may do what; and anything that runs a command or touches the machine.
 */
export const SETTINGS_A_REQUEST_MAY_NOT_CHANGE = {
  'settings.keys': 'a-key-a-login-or-a-summons',
  'settings.providerkeys': 'a-key-a-login-or-a-summons',
  'settings.restart': 'who-may-do-what',
  'settings.notifications': 'a-key-a-login-or-a-summons',
  'settings.inject': 'who-may-do-what',
  'settings.trusted': 'who-may-do-what',
  'settings.access': 'who-may-do-what',
  'settings.visitorceiling': 'who-may-do-what',
  'settings.headeronly': 'who-may-do-what',
  'settings.deadletters': 'who-may-do-what',
  // WAVE 13T'S PANEL, met in round 27f's rebase: the merge queue's owner decides who may move a merge entry to the
  // front.
  'settings.mergequeueowner': 'who-may-do-what',
  // WAVE 13P ROUND 29'S PANEL, met in round 31e's rebase onto main's 0206: it chooses which secretary is reminded about a
  // project's modules, a choice of who does what, like the dead-letter secretary above.
  'settings.modulereminders': 'who-may-do-what',
  // WAVE 13V ROUND 35B'S PANEL: it chooses which agent may hand in readings of the GPU card, a choice of who does what.
  'settings.gpuwatcher': 'who-may-do-what',
  // WAVE 13Y ROUND 137'S PANEL: it chooses which secretary takes the usage notices, a choice of who does what, and sets
  // the words the notice at 80% says to do, which come from the owner's usage decision.
  'settings.usagenotices': 'who-may-do-what',
  'settings.thiscomputer': 'runs-a-command-or-touches-the-machine',
  'settings.entry': 'runs-a-command-or-touches-the-machine',
  'settings.mailtool': 'runs-a-command-or-touches-the-machine',
  'settings.repositories': 'runs-a-command-or-touches-the-machine',
  'settings.previewroots': 'runs-a-command-or-touches-the-machine',
  // MAIN'S 9de08915e, met in round 46b's rebase: one memory limit for every sandbox, which runs a fixed command.
  'settings.sandboxmemory': 'runs-a-command-or-touches-the-machine',
  // RESTARTING THE TERMINAL HOLDER (wave 13u round 23) stops a process on this computer and starts another, and ends
  // every terminal it holds. Only the person presses it, at its own door.
  'settings.terminalholder': 'runs-a-command-or-touches-the-machine',
  // START AT LOGIN (wave 13t round W18c) writes or removes a systemd user unit on this computer. It is pressed at its own
  // door: by the person, or by a secretary where this office's list of what the grant carries says so.
  'settings.startatlogin': 'runs-a-command-or-touches-the-machine',
  // THE DATA FOLDER (wave 13t round W64) moves the office's data folder on this computer. It is pressed at its own door:
  // by the person, or by a secretary where this office's list of what the grant carries says so.
  'settings.datafolder': 'runs-a-command-or-touches-the-machine',
  'settings.look': 'kept-in-one-browser',
  // WAVE 14D'S THEMES PANEL: a person's own themes, kept on their row and changed at the participant change door.
  'settings.ownthemes': 'not-offered-yet',
  'settings.detail': 'kept-in-one-browser',
  'settings.writer': 'kept-in-one-browser',
  'settings.mode': 'kept-in-one-browser',
  'settings.review': 'kept-in-one-browser',
  'settings.queueview': 'kept-in-one-browser',
  // SETTINGS ROUND 2'S WORD TABLE is changed on this page itself, so it is not only shown here, and no request for one
  // press was built for a word.
  'settings.words': 'not-offered-yet',
  // THE ENTRY THAT LEADS TO THE SIDEBAR'S ARRANGEMENT, whose own page has no request for one press either.
  'settings.arrangesidebar': 'not-offered-yet',
  'settings.messagedoor': 'only-to-read',
  'settings.replyreminder': 'only-to-read',
  'settings.windowshutdown': 'kept-in-one-browser',
  'settings.appearance': 'not-offered-yet',
  'settings.chatbutton': 'not-offered-yet',
  'settings.messagelinks': 'not-offered-yet',
  'settings.chatpictures': 'not-offered-yet',
  'settings.chattextsize': 'not-offered-yet',
  'settings.chatlabels': 'not-offered-yet',
  'settings.sendkey': 'not-offered-yet',
  'settings.shortcuts': 'not-offered-yet',
  'settings.language': 'not-offered-yet',
  'settings.projects': 'not-offered-yet',
  'settings.mediaload': 'not-offered-yet',
  'settings.prices': 'not-offered-yet',
  'settings.quickinputs': 'not-offered-yet',
  'settings.machinenames': 'not-offered-yet',
  'settings.runmodels': 'not-offered-yet',
  'settings.reviewlevel': 'not-offered-yet',
  // WAVE 13Q ITEM 17'S PANEL: the work switches, each changed at its own door with a reason.
  'settings.workswitches': 'not-offered-yet',
  // WAVE 13X ROUND 14'S PANEL: which plugins are switched on. Only the owner switches one, at its own door, and no
  // request for one press was built for it.
  'settings.plugins': 'not-offered-yet',
  'settings.storage': 'not-offered-yet',
} as const satisfies Record<Exclude<SettingsPanel, ARequestablePanel>, WhyNotByARequest>

function isRequestable(panel: SettingsPanel): panel is ARequestablePanel {
  return Object.hasOwn(THE_SETTINGS_A_REQUEST_MAY_CHANGE, panel)
}

// ============================================================================ the known acts

/** A refusal while a request is filed: 400 for inputs that are not right, 409 for an act that may not be asked. */
function refusedWhenFiled(words: string, status: 400 | 409 = 400): PanelError {
  return new PanelError(`${words} Nothing was filed.`, status)
}

/** How a number of what-is-kept reads in the middle of a sentence, as it stands now, with its closing comma. */
function theKeptNumberNow(setting: KeptSettingKey): string {
  const one = readingOf(setting)
  if (one.from === 'unreadable') return 'a value the office cannot read'
  return one.nobodyChose ? `${String(one.inForce)}, the default nobody chose,` : String(one.inForce)
}

const settingInputs = z.strictObject({ panel: z.string(), setting: z.string(), value: z.number() })
const askInputs = z.strictObject({ request: z.string().min(1), answer: z.enum(['grant', 'refuse']) })
const ruleMarkInputs = z.strictObject({ chapter: z.string().min(1), rule: z.string().min(1), only: z.boolean() })

/** The new mark act names a rule as the Office regulations page does: its number and heading. */
function theRuleBeingMarked(raw: Record<string, unknown>): { inputs: z.infer<typeof ruleMarkInputs>; chapter: PanelRecord; rule: string } {
  const inputs = ruleMarkInputs.parse(raw)
  const chapter = getRecord(inputs.chapter)
  if (chapter === null || chapterNumberOf(chapter.kind, chapter.data) === null) {
    throw refusedWhenFiled(`No chapter record ${inputs.chapter} in this office.`, 409)
  }
  const blocks = chapter.data['summaryBlocks']
  const rules = Array.isArray(blocks) ? (blocks as Record<string, unknown>[]).filter(one => one['type'] === 'text') : []
  const position = rules.findIndex(one => one['id'] === inputs.rule)
  const rule = rules[position]
  if (rule === undefined) throw refusedWhenFiled(`Chapter record ${inputs.chapter} has no rule ${inputs.rule}.`, 409)
  return { inputs, chapter, rule: `${position + 1}, "${String(rule['heading'] ?? '')}",` }
}

/** The role request a request names, read and checked: a waiting ask at the door, waiting for the person. */
function theAskAtTheDoor(id: string, refuse: (words: string, status?: 400 | 409) => PanelError): PanelRecord {
  const record = getRecord(id)
  if (record === null || record.kind !== 'role_request') throw refuse(`There is no ask at the door with the id ${id}.`)
  const answersTo = record.data['answersTo'] as { kind?: unknown } | undefined
  if (answersTo?.kind !== 'person') throw refuse(`The ask ${id} waits for an agent, not for the person.`, 409)
  const answered = record.data['answer']
  if (typeof answered === 'string' && answered !== '') throw refuse(`The ask ${id} was already ${answered}.`, 409)
  // A NEW-KEY ASK IS NOT ONE OF THESE. It is about a key, the first of the three things wave 13q said a request may
  // not change, so it is answered on its own row.
  if (aNewKeyAsk(record) !== null) {
    throw refuse(`The ask ${id} is for a new key. A request may not ask about a key; the person answers it on its own row.`, 409)
  }
  return record
}

/** One known act: how its inputs are checked, the sentence the person reads, and what it does on the person's press. */
interface KnownAct {
  inputs: z.ZodType<Record<string, unknown>>
  /** Check the inputs against the office as it stands, and write the sentence stored with the request. Throws in words. */
  shows: (inputs: Record<string, unknown>) => string
  /**
   * The sentence the person reads while the request waits, drawn at each read, for an act whose sentence says how
   * something stands now. The stored sentence then holds none of that, so it cannot go stale.
   */
  showsAtEachRead?: (inputs: Record<string, unknown>) => string
  /**
   * Run it, as the one who pressed: the person, a secretary their grant carried here, or the named agent with the
   * person's signature on its package item. Returns what it did, in one sentence. Throws in words when it cannot.
   */
  run: (inputs: Record<string, unknown>, person: Actor, workspaceId: string) => string
  /**
   * The door the act would be pressed through on its own page (src/shared/ops-list.ts). Agreeing or signing under the
   * person's grant asks it as well, so the grant never carries through a request an act this office's list keeps.
   */
  door: string
  /**
   * The words of an act only the person's own press agrees to (`thePersonPressedItThemselves`): who may, and what an agent
   * may do instead. Absent for the acts the doors that answer a request decide about.
   */
  onlyThePersonsOwnPress?: string
}

/** A setting a request names, checked against the Settings page's own list and its own check. */
function theSettingNamed(raw: Record<string, unknown>, refuse: (words: string, status?: 400 | 409) => PanelError): { setting: KeptSettingKey; value: number } {
  const inputs = settingInputs.parse(raw)
  const panel = SETTINGS_PANELS.find((one) => one === inputs.panel)
  if (panel === undefined) throw refuse(`"${inputs.panel}" is not a panel on the Settings page.`)
  if (!isRequestable(panel)) {
    throw refuse(`"${panel}" is not one of the settings a request may change: ${WHY_NOT_BY_A_REQUEST[SETTINGS_A_REQUEST_MAY_NOT_CHANGE[panel]]}.`, 409)
  }
  const setting = THE_SETTINGS_A_REQUEST_MAY_CHANGE[panel].find((one) => one === inputs.setting)
  if (setting === undefined) {
    throw refuse(`"${inputs.setting}" is not a setting in "${panel}". Its settings are ${THE_SETTINGS_A_REQUEST_MAY_CHANGE[panel].join(', ')}.`)
  }
  // THE PAGE'S OWN CHECK, so a request cannot set a value the page would refuse.
  const checked = WHAT_IS_KEPT_CHECK.safeParse({ [setting]: inputs.value })
  if (!checked.success) {
    throw refuse(`${String(inputs.value)} is not a value "${WHAT_IS_KEPT_LABELS[setting]}" accepts: ${checked.error.issues.map((one) => one.message).join('; ')}.`)
  }
  return { setting, value: inputs.value }
}

export const KNOWN_ACTS = {
  'change-a-setting': {
    inputs: settingInputs,
    door: 'office.set-what-is-kept',
    // THE STORED SENTENCE HOLDS THE SETTING AND THE ASKED VALUE ONLY. The value the setting holds now is read when the
    // person reads (`showsAtEachRead`) and again at the press (`run`), never written down as words.
    shows: (raw) => {
      const { setting, value } = theSettingNamed(raw, refusedWhenFiled)
      return `Change "${WHAT_IS_KEPT_LABELS[setting]}" to ${String(value)}.`
    },
    showsAtEachRead: (raw) => {
      const { setting, value } = theSettingNamed(raw, (words, status) => new PanelError(words, status ?? 400))
      return `Change "${WHAT_IS_KEPT_LABELS[setting]}" from ${theKeptNumberNow(setting)} to ${String(value)}.`
    },
    run: (raw, person, workspaceId) => {
      const { setting, value } = theSettingNamed(raw, (words, status) => new PanelError(words, status ?? 400))
      const label = WHAT_IS_KEPT_LABELS[setting]
      // READ AGAIN AT THE PRESS. A value the person chose that is already the asked one is left as it is. The default
      // nobody chose is not a choice, so it is written as one even when the number is the same.
      const was = readingOf(setting)
      if (was.from === "the person's setting" && was.inForce === value) return `"${label}" was already ${String(value)}, so nothing was changed.`
      const wasInWords = theKeptNumberNow(setting)
      // THE PAGE'S OWN WRITE AND ITS OWN LINE IN THE CHANGE LOG, as the actor handed to this act.
      // A held package item keeps the named agent, with the person's signature on that one item.
      const before = whatTheOfficeKeeps()
      const after = setWhatTheOfficeKeeps({ [setting]: value })
      writeDownASettingChange(person, { setting: 'what-is-kept', field: 'what the office keeps', before: theChosenNumbers(before), after: theChosenNumbers(after), workspaceId })
      return `"${label}" was ${wasInWords} and is now ${String(value)}.`
    },
  },
  'answer-an-ask-at-the-door': {
    inputs: askInputs,
    door: 'role.request',
    shows: (raw) => {
      const inputs = askInputs.parse(raw)
      const record = theAskAtTheDoor(inputs.request, refusedWhenFiled)
      const asking = String(record.data['asking'] ?? '')
      const askerId = String((record.data['asker'] as { id?: unknown } | undefined)?.id ?? '')
      const asker = theNameAPersonReads({ kind: 'agent', id: askerId })
      return inputs.answer === 'grant'
        ? `Give "${asker}" the ${asking} card it asked for.`
        : `Refuse "${asker}" the ${asking} card it asked for.`
    },
    run: (raw, person) => {
      const inputs = askInputs.parse(raw)
      const record = theAskAtTheDoor(inputs.request, (words, status) => new PanelError(words, status ?? 409))
      // THE ROLE REQUEST DOOR'S OWN ANSWER, as the actor handed to this act.
      // A held package item keeps the named agent, with the person's signature on that one item.
      const done = answerARoleRequest(record, inputs.answer, {}, person, () => undefined) as { note?: unknown }
      return typeof done.note === 'string' ? done.note : `The ask ${record.id} was ${inputs.answer === 'grant' ? 'granted' : 'refused'}.`
    },
  },
  'mark-a-rule-only-for-this-office': {
    inputs: ruleMarkInputs,
    door: 'office.rules.mark-only-this-office',
    shows: (raw) => {
      const { inputs, chapter, rule } = theRuleBeingMarked(raw)
      return inputs.only
        ? `Mark rule ${rule} in "${chapter.title}" as only for this office.`
        : `Take the only-for-this-office mark off rule ${rule} in "${chapter.title}".`
    },
    run: (raw, person) => {
      const inputs = ruleMarkInputs.parse(raw)
      const done = markARuleOnlyForThisOffice({ ...inputs, actor: person })
      const { chapter, rule } = theRuleBeingMarked(raw)
      if (!done.changed) return done.onlyThisOffice
        ? `Rule ${rule} in "${chapter.title}" was already marked as only for this office, so nothing was changed.`
        : `Rule ${rule} in "${chapter.title}" already had no only-for-this-office mark, so nothing was changed.`
      return done.onlyThisOffice
        ? `Rule ${rule} in "${chapter.title}" is marked as only for this office.`
        : `Rule ${rule} in "${chapter.title}" has no only-for-this-office mark.`
    },
  },
  'change-what-the-grant-carries': {
    inputs: THE_CHANGES_TO_THE_LIST,
    door: 'office.set-what-the-grant-carries',
    onlyThePersonsOwnPress: "Only the person may agree to this request, pressing Agree themselves. Neither the grant nor quoted words carry agreeing.",
    // THE STORED SENTENCE HOLDS THE ASKED ANSWERS ONLY. What each door has now is read when the person reads, and again
    // at the press, as for a setting.
    shows: (raw) => {
      const { changes } = THE_CHANGES_TO_THE_LIST.parse(raw)
      theChangesAreRight(changes, (words) => refusedWhenFiled(words, 409))
      return `Change what the person's grant carries: ${changes.map(aChangeInWords).join('; ')}.`
    },
    showsAtEachRead: (raw) => {
      const { changes } = THE_CHANGES_TO_THE_LIST.parse(raw)
      return `Change what the person's grant carries: ${changes.map(aChangeFromNowInWords).join('; ')}.`
    },
    run: (raw, person, workspaceId) => {
      const { changes } = THE_CHANGES_TO_THE_LIST.parse(raw)
      // CHECKED AGAIN AT THE PRESS: a door may have left the list since the request was filed.
      theChangesAreRight(changes, (words) => new PanelError(words, 409))
      const changed = changeWhatTheGrantCarries(changes, person, workspaceId)
      const moved = changed.filter((one) => one.before !== one.after).length
      const asked = changed.length
      if (moved === 0) {
        return asked === 1
          ? 'The door already had the answer asked for, so nothing was changed.'
          : 'Every door already had the answer asked for, so nothing was changed.'
      }
      if (moved === asked) return asked === 1 ? 'The answer about the door was changed.' : `The answer about each of the ${String(asked)} doors was changed.`
      return `The answer about ${String(moved)} of the ${String(asked)} doors was changed. The others already had the answer asked for.`
    },
  },
} as const satisfies Record<string, KnownAct>

export type KnownActName = keyof typeof KNOWN_ACTS

export function isAKnownAct(name: unknown): name is KnownActName {
  return typeof name === 'string' && Object.hasOwn(KNOWN_ACTS, name)
}

// ============================================================================ reading

function fromTheRow(row: typeof onePressRequests.$inferSelect): AOnePressRequest {
  const answeredBy = row.answeredByKind === null || row.answeredById === null ? null : { kind: row.answeredByKind, id: row.answeredById }
  const act = row.act as KnownActName
  const inputs = JSON.parse(row.inputs) as Record<string, unknown>
  // WHILE IT WAITS, the sentence is drawn now, so the popup and Home say the setting's value as it stands at this read.
  const drawnNow = row.state === 'waiting' ? (KNOWN_ACTS[act] as KnownAct).showsAtEachRead?.(inputs) : undefined
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    act,
    inputs,
    askedBy: row.askedBy,
    askedByHandle: theOneAgentAStringNames(sqlite, row.askedBy)?.handle ?? null,
    shows: drawnNow ?? row.shows,
    because: row.because,
    state: row.state as OnePressState,
    askedAt: row.askedAt,
    answeredAt: row.answeredAt,
    answeredBy,
    outcome: row.outcome,
  }
}

/** One request, or null when there is none with this id. */
function theRequestIfThereIsOne(id: string): AOnePressRequest | null {
  const row = db.select().from(onePressRequests).where(eq(onePressRequests.id, id)).get()
  return row === undefined ? null : fromTheRow(row)
}

/** One request, or a 404 in words. */
export function theOnePressRequest(id: string): AOnePressRequest {
  const request = theRequestIfThereIsOne(id)
  if (request === null) throw new PanelError(`There is no request for one press with the id ${id}. Nothing was written.`, 404)
  return request
}

/** Every request that waits on the person, oldest first. Home's Needs you and the popup both read these. */
export function theRequestsThatWait(): AOnePressRequest[] {
  return db.select().from(onePressRequests).where(eq(onePressRequests.state, 'waiting')).orderBy(onePressRequests.askedAt, onePressRequests.id).all().map(fromTheRow)
}

/** The newest requests, `limit` of them, of one state or of all. */
export function theNewestRequests(limit: number, state: OnePressState | null): AOnePressRequest[] {
  const query = db.select().from(onePressRequests)
  const rows = (state === null ? query : query.where(eq(onePressRequests.state, state))).orderBy(desc(onePressRequests.askedAt), desc(onePressRequests.id)).limit(limit).all()
  return rows.map(fromTheRow)
}

// ============================================================================ the doors' acts

/** Tell every open page that the list of what waits on the person changed. */
function tellThePages(): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['needsYou'], about: null, groupId: null, because: 'A request for one press was filed, answered or withdrawn.' })
}

/** The agent that holds the key this request was proved with, or null when no agent key proved it. */
function theAgentWhoseKeyThisIs(actor: Actor): { id: string; handle: string } | null {
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return null
  return theOneAgentAStringNames(sqlite, actor.keyHolder)
}

/**
 * THE CALLER BY ITS ID IN THE REGISTRY. The grant is held by the handle the caller sends (`actor.id`); a request and a
 * package name who filed it and who answered it by the registry id.
 */
export function theCallerByItsRegistryId(actor: Actor): string {
  return theOneAgentAStringNames(sqlite, actor.id)?.id ?? actor.id
}

/** AN AGENT FILES A REQUEST, proved by its own key. Everything is checked before anything is written. */
export function fileARequest(input: { act: unknown; inputs: unknown; because: string | null; actor: Actor; workspaceId: string }): AOnePressRequest {
  const agent = theAgentWhoseKeyThisIs(input.actor)
  if (agent === null) {
    throw new PanelError('A request for one press is filed by an agent, proved by its own key. This request carried no agent key. Nothing was filed.', 403)
  }
  if (!isAKnownAct(input.act)) {
    throw refusedWhenFiled(
      `"${String(input.act)}" is not one of the acts the office knows. A request may ask only for ${Object.keys(KNOWN_ACTS).map((name) => `"${name}"`).join(' or ')}.`,
    )
  }
  const act: KnownAct = KNOWN_ACTS[input.act]
  const parsed = act.inputs.safeParse(input.inputs ?? {})
  if (!parsed.success) {
    throw refusedWhenFiled(`The inputs of "${input.act}" are not right: ${parsed.error.issues.map((one) => `${one.path.join('.') || 'inputs'}: ${one.message}`).join('; ')}.`)
  }
  const shows = act.shows(parsed.data)
  const id = anOfficeId()
  db.insert(onePressRequests)
    .values({
      id,
      workspaceId: input.workspaceId,
      act: input.act,
      inputs: JSON.stringify(parsed.data),
      askedBy: agent.id,
      shows,
      because: input.because === null || input.because.trim() === '' ? null : input.because.trim(),
      state: 'waiting',
      askedAt: now(),
    })
    .run()
  tellThePages()
  return theOnePressRequest(id)
}

/** What an answered request is, in words, for the refusal a second press gets. */
const AN_ANSWERED_STATE_IN_WORDS: Readonly<Record<Exclude<OnePressState, 'waiting'>, string>> = {
  done: 'done',
  'could-not': 'agreed to, and its act could not run',
  refused: 'refused',
  withdrawn: 'withdrawn by its asker',
}

/** A request the person may still answer, or a 409 saying what it already is. */
function stillWaiting(id: string): AOnePressRequest {
  const request = theOnePressRequest(id)
  if (request.state !== 'waiting') {
    const itIs = AN_ANSWERED_STATE_IN_WORDS[request.state]
    throw new PanelError(`The request ${id} is ${itIs}${request.answeredAt === null ? '' : ` since ${request.answeredAt}`}, so it cannot be answered again. Nothing was written.`, 409)
  }
  return request
}

/** THE PERSON'S PRESS IS REFUSED IN A TEST WORLD, which serves a copy of the office and is not the person's own. */
function refuseInATestWorld(): void {
  if (theWorldsOwnAuthority().inATestWorld) {
    throw new PanelError('This Mole Office is a test world, and a request for one press is answered only on the office itself. Nothing was written.', 409)
  }
}

/**
 * Who answered a request: the person, or the secretary their grant carried here, by its registry id. Asked after the
 * guard, where a caller that is not the person is there only because the grant carried it.
 */
function whoAnswered(actor: Actor): { kind: string; id: string } {
  return thePersonIsProved(actor) ? { kind: 'person', id: actor.id } : { kind: 'agent', id: theCallerByItsRegistryId(actor) }
}

/**
 * THE PERSON AGREES, AND THE ACT RUNS ONCE. The act and the request's new state are written in one transaction: if the
 * act throws, everything it wrote is taken back, and the request then says it could not run and why.
 *
 * Under the person's grant the check asks the act's own door too, and who filed the request; the request is read
 * first for both, without refusing a missing one, so a caller with no grant still hears that the press is the person's.
 */
export function agreeToARequest(id: string, actor: Actor): AOnePressRequest {
  const asked = theRequestIfThereIsOne(id)
  const askedAct: KnownAct | null = asked === null ? null : KNOWN_ACTS[asked.act]
  // AN ACT ONLY THE PERSON'S OWN PRESS AGREES TO is refused first, so neither the grant nor its absence is what a caller
  // hears, and the request still waits for the person.
  if (askedAct?.onlyThePersonsOwnPress !== undefined && !thePersonPressedItThemselves(actor)) {
    throw new PanelError(`Agreeing to the request ${id} is the person's own press. Nothing was run, and the request still waits. ${askedAct.onlyThePersonsOwnPress}`, 403)
  }
  const touches = asked === null || askedAct === null ? {} : { also: [askedAct.door], filedBy: asked.askedBy }
  if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor, touches)) {
    assertThePersonIsProved(actor, 'Agreeing to a request', 'The person presses Agree in the popup or on Home.')
  }
  refuseInATestWorld()
  const request = stillWaiting(id)
  const act: KnownAct = KNOWN_ACTS[request.act]
  let state: OnePressState = 'done'
  let outcome: string
  try {
    outcome = sqlite.transaction(() => {
      const did = act.run(request.inputs, actor, request.workspaceId)
      theAnswerIsWritten(id, 'done', did, actor)
      return did
    })()
  } catch (err) {
    state = 'could-not'
    outcome = `The act could not run: ${err instanceof Error ? err.message : String(err)}`
    theAnswerIsWritten(id, state, outcome, actor)
  }
  writeDownAnActUnderTheRaise(actor, { setting: 'one-press', field: `agreed to the request ${id}`, before: 'waiting', after: state, workspaceId: request.workspaceId })
  tellThePages()
  return { ...theOnePressRequest(id), state, outcome }
}

/** THE PERSON REFUSES. Nothing runs. */
export function refuseARequest(id: string, actor: Actor): AOnePressRequest {
  const byThePerson = thePersonIsProved(actor)
  if (!byThePerson && !aRaiseCarriesIt(actor)) {
    assertThePersonIsProved(actor, 'Refusing a request', 'The person presses Refuse in the popup or on Home.')
  }
  refuseInATestWorld()
  const request = stillWaiting(id)
  const outcome = byThePerson
    ? 'The person refused it. Nothing was run.'
    : `The secretary "${actor.id}" refused it for the person, under their grant. Nothing was run.`
  theAnswerIsWritten(id, 'refused', outcome, actor)
  writeDownAnActUnderTheRaise(actor, { setting: 'one-press', field: `refused the request ${id}`, before: 'waiting', after: 'refused', workspaceId: request.workspaceId })
  tellThePages()
  return theOnePressRequest(id)
}

/** ITS ASKER WITHDRAWS IT, proved by its own key, while it waits (decision tFl1YWLH3eCl). */
export function withdrawARequest(id: string, actor: Actor): AOnePressRequest {
  const request = theOnePressRequest(id)
  const agent = theAgentWhoseKeyThisIs(actor)
  // A request filed before the re-mint holds its asker's old id, so the asker is compared by canonical id.
  if (agent === null || agent.id !== theCanonicalAgentId(sqlite, request.askedBy)) {
    throw new PanelError(`Only the agent that asked may withdraw the request ${id}, sending its own key. Nothing was written.`, 403)
  }
  stillWaiting(id)
  theAnswerIsWritten(id, 'withdrawn', 'Its asker withdrew it. Nothing was run.', actor, { kind: 'agent', id: agent.id })
  tellThePages()
  return theOnePressRequest(id)
}

/** Write the answer, only on a request that still waits, so two presses cannot both write one. */
function theAnswerIsWritten(id: string, state: Exclude<OnePressState, 'waiting'>, outcome: string, actor: Actor, by?: { kind: string; id: string }): void {
  const who = by ?? whoAnswered(actor)
  const written = db
    .update(onePressRequests)
    .set({ state, outcome, answeredAt: now(), answeredByKind: who.kind, answeredById: who.id })
    .where(and(eq(onePressRequests.id, id), eq(onePressRequests.state, 'waiting')))
    .run()
  if (written.changes !== 1) throw new PanelError(`The request ${id} was answered by somebody else first. Nothing more was written.`, 409)
}
