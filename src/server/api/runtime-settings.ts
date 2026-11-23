// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { gateMet, gateCountsReading, gateCountsToday, type GateCounts } from '../lib/gate-counts.ts'
export type { GateTally, GateCounts } from '../lib/gate-counts.ts'
import { dollarsWithWholeCents } from '../../config/dollars.mjs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SETTINGS, readSetting, readSettingHere, settingValue, MERGE_WORKERS_BOUNDS, BUS_ENTRIES_BOUNDS, officeKind, gateDefaultHere, settingWordValues } from '../../config/settings.mjs'
import {
  RUNTIME_SETTING_NAMES, RESTART_SETTING_NAMES, DECIDED_SETTING_NAMES, TOOL_SETTING_NAMES, WEB_DEVELOPMENT_SERVER_SETTING_NAMES,
  OFFICE_START_SETTING_NAMES, FIRST_OWNER_SETTING_NAMES, STARTER_SETTING_NAMES, RUN_STARTER_SETTING_NAMES, MERGE_TOOL_SETTING_NAMES,
} from '../../config/runtime-settings.mjs'
import { sqlite } from '../db/client.ts'
import { GATES, GATE_CLASSES, GATE_GROUPS, gateForSetting, gateValueIsAllowed } from '../../config/gates.mjs'
import { runtimeChoiceHasRunOut } from '../../config/runtime-setting-store.mjs'
import { localStamp, readATypedTime } from '@shared/time.ts'
import { aTimeHasCome } from '@shared/typed-time.mjs'
import { actorFrom, actorWithTheWordsItActsOn } from '../lib/http.ts'
import { aRaiseCarriesIt, everyAgentAStoredStampCouldName, mayPressForThePerson, theSecretaryActingForThePerson, getRecord, theLastChangeOfASetting, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleCards, theRoleCardsAreRead } from '../lib/roles.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { warrantBody } from './records.ts'
import { theQueueIsHeld } from '../lib/merge-queue.ts'
import { theOfficeDecidesTheSealsTheHoldKept } from '../lib/merge-queue-at-the-seal.ts'
import { sayASecretaryChangedItForThem } from '../lib/changed-from-another-computer.ts'
import { parseDuration } from '../lib/adapters/index.ts'
import { delimiter, isAbsolute } from 'node:path'
import { THE_RUNTIMES_THE_OFFICE_DISPATCHES, moleOffice } from '@shared/participants.ts'
import { moduleReminderSecretariesFrom } from '../lib/env.ts'
import { readTheLevelOfEachKind } from '@shared/results-at-a-level.ts'
import { isLanguage, sayInEnglish, type WordKey } from '@shared/i18n.ts'
import { readSettingsStructure } from '@shared/settings-structure.ts'
import { inspectionSettings, inspectionApiWaitMilliseconds, inspectionOfficeBackMilliseconds } from '../../config/inspection.mjs'
import { aSpoolAnotherWorldOwns, handTheGateCountSpoolToThisWorld, type AHandOver } from '../lib/gate-count-spool.ts'
import { GATES_THE_SPOOL_WAITS_FOR } from '../../config/gate-count-spool.mjs'
import { whatIsWrongWithAWorkSwitch } from '../lib/work-switches.ts'
import { whatIsWrongWithACompactionWindow } from '../../config/the-compaction-window.mjs'

import { INSPECTOR_ANSWER_LINES, readInspectorAnswerLines } from '../lib/inspector-answers-lines.ts'

const bodyShape = z.strictObject({
  changes: z.array(z.strictObject({ name: z.string(), value: z.string().trim().max(4000).nullable(), decision: z.string().min(1).nullable().optional(), until: z.string().optional() })).min(1).max(RUNTIME_SETTING_NAMES.length),
  because: z.string().trim().min(1).max(500), warrant: warrantBody.optional(),
})
let readingsAtStart = new Map<string, {value:string|null;source:string}>()
function refuse(message: string, code: 'runtimeSettingsBadValue' | 'runtimeSettingsReadOnly' | 'runtimeSettingsNotAllowed' | 'runtimeSettingsBadDecision' | 'runtimeSettingsBadWarrant' = 'runtimeSettingsBadValue', status = 400): never {
  throw new PanelError(`${message} Nothing was changed.`, status, undefined, undefined, undefined, { code, values: { reason: message } })
}
export function aSecretaryWithItsOwnKey(actor: Actor): boolean {
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key' || !theRoleCardsAreRead()) return false
  const who = participantForActor(actor)
  const row = (who?.kind === 'agent' ? readParticipant(who) : null) as RegisteredAgent | null
  return row !== null && row.retired !== true && row.role === theRoleCards().elevation.onlyThisCardCanHoldIt
}
function history(name: string) {
  const last = theLastChangeOfASetting(name.startsWith('MOLE_OFFICE_DEAD_LETTER_AFTER_') ? 'dead-letter-thresholds' : `runtime:${name}`)
  const details = last?.to == null ? null : JSON.parse(last.to) as { decision?: string | null; because?: string }
  return { last, decision: details?.decision ?? null, because: details?.because ?? null }
}
/**
 * Who wrote a change row, by name, or null when the row names nobody this office knows. An agent's row may hold its
 * handle rather than its id, so it is read as a stored stamp, and a stamp two agents could bear names neither.
 */
export function theWritersName(writer: { type: string; id: string }): string | null {
  if (writer.type === 'human') return readParticipant({ kind: 'person', id: writer.id })?.name ?? null
  if (writer.type !== 'agent') return null
  const named = everyAgentAStoredStampCouldName(writer.id)
  return named.length === 1 ? (named[0]?.name ?? null) : null
}
/** One setting's row. The whole reading builds each row here, and a reading of a few named settings reads only theirs. */
function aSettingReading(s: typeof SETTINGS[number]) {
  const past = history(s.name)
  let value: string | null = null, source: string = 'unreadable', unreadable: string | null = null
  try { const read = readSettingHere(s.name); value = read.value; source = read.source }
  catch (error) { unreadable = error instanceof Error ? error.message : String(error) }
  const column = s.name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS' ? 'dead_letter_after_days' : s.name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT' ? 'dead_letter_after_count' : null
  const stored = (column === null ? sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(s.name)
    : sqlite.prepare(`SELECT ${column} AS value FROM installation WHERE only_row = 1`).get()) as { value: string | number | null } | undefined
  const decision = past.decision === null ? null : getRecord(past.decision)
  const start = readingsAtStart.get(s.name)
  const chosen = stored?.value == null ? null : String(stored.value)
  const writable = RUNTIME_SETTING_NAMES.includes(s.name)
  return { name: s.name, gate: gateForSetting(s.name)?.id ?? null, what: sayInEnglish(`settingsWords.${s.name}` as WordKey, settingWordValues(s.name)), whatValues: settingWordValues(s.name), kind: s.kind, shippedValue: s.fallback, allowsEmpty: s.emptyMeans !== null, value, source, currentValue: start === undefined ? value : start.value, currentSource: start?.source ?? source,
    pendingRestart: start !== undefined && start.value !== value, unreadable, chosen,
    storedButRefused: writable && chosen !== null ? theStoredChoiceRefused(s.name, chosen) : null,
    writable, restartRequired: RESTART_SETTING_NAMES.includes(s.name), usedOutsideTheOffice: usedOutsideTheOffice(s.name), place: placeOf(s.name),
    ownerDecided: DECIDED_SETTING_NAMES.includes(s.name) || past.decision !== null,
    decision: past.decision === null ? null : { id: past.decision, title: decision?.title ?? null, live: decision?.kind === 'decision' && decision.deletedAt === null },
    because: past.because, lastChange: past.last === null ? null : { ...past.last, by: { ...past.last.by, name: theWritersName(past.last.by) } },
  }
}
/** Whether the settings door serves a setting: its name holds no KEY, and its declaration says it serves it. */
export function theSettingsDoorServes(setting: typeof SETTINGS[number]): boolean {
  return !setting.name.includes('KEY') && setting.served
}
export function runtimeSettingsReading() {
  return { settings: SETTINGS.filter(theSettingsDoorServes).map(aSettingReading) }
}
export type RuntimeSettingsReply = ReturnType<typeof runtimeSettingsReading>
export type ASettingReading = RuntimeSettingsReply['settings'][number]

/** One declared setting's row, read alone: no other setting is read. A name no setting has is a fault of the caller. */
export function oneSettingReading(name: string): ASettingReading {
  const declared = SETTINGS.find((s) => s.name === name)
  if (declared === undefined) throw new Error(`No setting is declared as ${name}, so it has no reading.`)
  if (!theSettingsDoorServes(declared)) {
    throw new Error(`${name} is declared, but the settings door does not serve it, because ${declared.notServedBecause ?? 'its name says it is a key'}.`)
  }
  return aSettingReading(declared)
}

type GateClass = typeof GATE_CLASSES[number]
export type GateRow = {
  id: string
  class: GateClass
  group: string
  setting: string
  positions: {kind: 'switch'} | {kind: 'number'; fewest: number; most: number} | {kind: 'block-remind-off'; allowed: readonly ('block' | 'remind' | 'off')[]}
  whoMayChange: 'the-person-or-a-secretary' | 'the-person'
  defaults: {buildsMoleOffice: string; ordinary: string}
  defaultHere: string
  value: string | null
  // Sources: the environment, .env, the office database, the built-in default, nothing set it, not read, unreadable.
  source: string
  unreadable: string | null
  chosen: {value: string; until: string | null} | null
  ranOut: {value: string; until: string} | null
  lastChange: null | {
    // The change row that wrote it, and the order the office wrote that row in. A release names a throw by these two.
    id: string; appendOrder: number | null
    at: string; by: {type: string; id: string; name: string | null}
    from: string | null; to: string | null
    because: string | null; until: string | null; ranOut: boolean
  }
  countedBy: 'the-server' | 'the-merge-tool' | 'the-release-tool' | 'the-sandbox-spool' | 'nobody'
  // For a spool row on GATES_THE_SPOOL_WAITS_FOR, the code of the reason it is not counted; null for every other row.
  notCountedBecause: typeof GATES_THE_SPOOL_WAITS_FOR[number]['because'] | null
  looksAgain: 'at-the-seal' | null
  // Whether a change needs the owner's press or words, read from the same place as on Office controls.
  ownerDecided: boolean
  counts: GateCounts | null
}
export type GatesReading = {
  office: {kind: 'builds-mole-office' | 'ordinary'; because: 'runs-from-a-checkout' | 'runs-from-an-installed-build'}
  // Whether this caller passes the settings door's check: the person, the owner's authority, or a secretary with its own key.
  mayChange: boolean
  // Whether it also passes the check for a gate only the person may change: the person, the owner's authority, or a
  // secretary whom the person's grant lets press the settings door for them.
  mayChangeThePersonsOwn: boolean
  classes: Array<{class: GateClass; groups: Array<{group: string; rows: GateRow[]}>}>
  // The gate-count spool, only while another world owns it: its folder, that world, this office's world, and whether
  // this caller may press to give it to this office's world. Null in an office that does not read the spool.
  spool: {folder: string; itsWorld: string; thisWorld: string; mayPress: boolean} | null
}

/** What the press answers when it gave the gate-count spool to this office's world. */
export type TheSpoolHandedOver = Extract<AHandOver, {handedOver: unknown}>['handedOver']

/** Whether the caller is the owner at the settings door: the person proved, or a test world's owner's authority. The key slot doors ask it too. */
export function theOwnerAtTheSettingsDoor(actor: Actor): boolean {
  return thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true
}

/** The same permission serves the reading and the write, so the page knows which choices this caller may save. */
function runtimeSettingsAuthority(actor: Actor): {owner: boolean; mayChange: boolean} {
  const owner = theOwnerAtTheSettingsDoor(actor)
  return {owner, mayChange: owner || aSecretaryWithItsOwnKey(actor)}
}

/** Whether this caller passes the settings door's check. The merge queue's line door asks it too (wave 13u round 93). */
export function mayChangeTheOfficesSettings(actor: Actor): boolean {
  return runtimeSettingsAuthority(actor).mayChange
}

/**
 * WHETHER THIS CALLER MAY CHANGE A GATE ONLY THE PERSON MAY CHANGE, as the reading says it. The grant's own check is
 * asked about the settings door, which the reading does not press, and without the reason, which only a write gives.
 * The write asks the same check with the reason, through `aRaiseCarriesIt`.
 */
function mayChangeThePersonsOwnGates(actor: Actor): boolean {
  const {owner, mayChange} = runtimeSettingsAuthority(actor)
  return owner || (mayChange && mayPressForThePerson({...actor, press: {operation: 'office.set-settings', aRead: false, reason: null}}, false).may)
}

/** Only the person hands the gate-count spool to another world: no grant, no raise and no owner's authority presses it. */
function mayHandOverTheSpool(actor: Actor): boolean {
  return thePersonIsProved(actor)
}

/** One gate's row. The whole list and the one-row read both build it here, so the two give the same row. */
function gateRowReading(gate: typeof GATES[number], settings: RuntimeSettingsReply['settings'], counts: Map<string, GateCounts>): GateRow {
  const reading = settings.find(row => row.name === gate.setting)!
  const saved = sqlite.prepare('SELECT value, until FROM runtime_settings WHERE name = ?').get(gate.setting) as {value: string; until: string | null} | undefined
  const ended = saved !== undefined && runtimeChoiceHasRunOut(saved)
  return {...gate, notCountedBecause: GATES_THE_SPOOL_WAITS_FOR.find(one => one.gate === gate.id)?.because ?? null, defaultHere: gateDefaultHere(gate), value: reading.value, source: reading.source, unreadable: reading.unreadable, ownerDecided: reading.ownerDecided,
    chosen: saved === undefined || ended ? null : {value: saved.value, until: saved.until},
    ranOut: saved !== undefined && ended && saved.until !== null ? {value: saved.value, until: saved.until} : null,
    lastChange: aGatesLastChange(reading), counts: counts.get(gate.id) ?? null,
  }
}

/** A gate's newest change as its row says it, read from the gate setting's own row. The work switches read it too. */
export function aGatesLastChange(reading: ASettingReading): GateRow['lastChange'] {
  const last = reading.lastChange
  if (last === null) return null
  const before = last.from == null ? null : JSON.parse(last.from) as {value?: string | null; until?: string | null}
  const after = last.to == null ? null : JSON.parse(last.to) as {value?: string | null; because?: string | null; until?: string | null; ranOut?: boolean}
  return {id: last.id, appendOrder: last.appendOrder, at: last.at, by: last.by, from: before?.value ?? null, to: after?.value ?? null,
    because: after?.because ?? null, until: (after?.ranOut === true ? before?.until : after?.until) ?? null, ranOut: after?.ranOut === true}
}

export function gatesReading(actor: Actor): GatesReading {
  const settings = runtimeSettingsReading().settings
  const counts = gateCountsReading()
  const spool = aSpoolAnotherWorldOwns()
  return {
    office: officeKind(), mayChange: runtimeSettingsAuthority(actor).mayChange, mayChangeThePersonsOwn: mayChangeThePersonsOwnGates(actor),
    spool: spool === null ? null : {...spool, mayPress: mayHandOverTheSpool(actor)},
    classes: GATE_CLASSES.map(one => ({class: one, groups: GATE_GROUPS.filter(group => group.class === one).map(group => ({
      group: group.group,
      rows: GATES.filter(gate => gate.class === one && gate.group === group.group).map(gate => gateRowReading(gate, settings, counts)),
    }))})),
  }
}

/** What GET /api/office/gates?gate=<id> answers: that gate's row as the whole list gives it, with the same permission. */
export type OneGateReading = Pick<GatesReading, 'office' | 'mayChange' | 'mayChangeThePersonsOwn'> & {row: GateRow}

/**
 * ONE GATE, READ BY ITS ID. A tool that needs one row reads it here, because the whole list is longer than the request
 * helper hands back. An id no gate has is refused by name.
 */
export function oneGateReading(actor: Actor, id: string): OneGateReading {
  const gate = GATES.find(row => row.id === id)
  if (gate === undefined) throw new PanelError(`No gate has the id ${id}. Nothing was read.`, 404, undefined, undefined, undefined, {code: 'gateReadUnknown', values: {id}})
  return {
    office: officeKind(), mayChange: runtimeSettingsAuthority(actor).mayChange, mayChangeThePersonsOwn: mayChangeThePersonsOwnGates(actor),
    row: gateRowReading(gate, runtimeSettingsReading().settings, gateCountsReading()),
  }
}

/** The office removes ended choices and records their fallback in the same transaction.
 * Its system writer and null project follow the setting change written by the GPU watcher at start.
 */
export function runOutGateChoices(): {ranOut: Array<{gate: string; setting: string; until: string; backTo: {value: string | null; source: string}}>} {
  const theRunOut = sqlite.transaction(() => {
    const now = localStamp(new Date())
    const saved = sqlite.prepare('SELECT name, value, until FROM runtime_settings WHERE until IS NOT NULL').all() as {name: string; value: string; until: string}[]
    const ranOut: Array<{gate: string; setting: string; until: string; backTo: {value: string | null; source: string}}> = []
    for (const choice of saved) {
      const gate = gateForSetting(choice.name)
      if (gate === undefined || !runtimeChoiceHasRunOut(choice, now)) continue
      const past = history(choice.name)
      sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(choice.name)
      const backTo = readSettingHere(choice.name)
      const because = `The saved choice ran out at ${choice.until}.`
      writeDownASettingChange({type: 'system', id: moleOffice().id}, {
        setting: `runtime:${choice.name}`, field: sayInEnglish(`settingsWords.${choice.name}` as WordKey, settingWordValues(choice.name)),
        before: {value: choice.value, chosen: choice.value, until: choice.until, decision: past.decision, because: past.because},
        after: {value: backTo.value, source: backTo.source, chosen: null, until: null, decision: past.decision, because, ranOut: true}, workspaceId: null,
      })
      ranOut.push({gate: gate.id, setting: choice.name, until: choice.until, backTo: {value: backTo.value, source: backTo.source}})
    }
    return {ranOut}
  })()
  // A HOLD OF THE MERGE QUEUE THAT RAN OUT lets every waiting seal be decided again at once (wave 13u round 94).
  const sealsDecided = theOfficeDecidesTheSealsTheHoldKept(theRunOut.ranOut.some((one) => one.gate === 'queue-held'))
  const withTheSeals = {...theRunOut, sealsDecided}
  return sealsDecided.length === 0 ? theRunOut : withTheSeals
}

/** What reads a setting the office does not use, so the Office controls page can say when a change is used. */
function usedOutsideTheOffice(name: string): 'a tool' | 'the web development server' | null {
  if (TOOL_SETTING_NAMES.includes(name)) return 'a tool'
  if (WEB_DEVELOPMENT_SERVER_SETTING_NAMES.includes(name)) return 'the web development server'
  return null
}

/** Where wave 13r round 18 placed a read-only setting that is not on the restart line, so the page can say when a change is used. */
function placeOf(name: string): "the office's start" | 'the first owner' | "the office's starter" | "a run's starter" | 'the merge tool' | null {
  if (OFFICE_START_SETTING_NAMES.includes(name)) return "the office's start"
  if (FIRST_OWNER_SETTING_NAMES.includes(name)) return 'the first owner'
  if (STARTER_SETTING_NAMES.includes(name)) return "the office's starter"
  if (RUN_STARTER_SETTING_NAMES.includes(name)) return "a run's starter"
  if (MERGE_TOOL_SETTING_NAMES.includes(name)) return 'the merge tool'
  return null
}

/**
 * A STORED CHOICE THIS RELEASE REFUSES, judged by the check a write must pass, or null when that check accepts it.
 * The choice may have been saved by an older release, or written into the database by hand. The reason is the
 * check's own, without "Nothing was changed.". It says nothing about what a reader does with the choice, because
 * readers differ: the merge tool uses the shipped value, and another reader may not.
 */
function theStoredChoiceRefused(name: string, stored: string): { value: string; reason: string } | null {
  try { validateRuntimeValue(name, stored) }
  catch (error) {
    const reason = error instanceof PanelError && error.values !== undefined && 'reason' in error.values ? error.values.reason : undefined
    // Only a refusal of the check has a reason. Anything else is a fault, and the reading fails with it.
    if (typeof reason !== 'string') throw error
    return { value: stored, reason }
  }
  return null
}

/** Check the same kinds the consumers accept, before the transaction begins. */
export function validateRuntimeValue(name: string, value: string | null): void {
  if (!RUNTIME_SETTING_NAMES.includes(name)) refuse('This setting uses another door or describes how this process was started.', 'runtimeSettingsReadOnly')
  let read
  try { read = readSetting(name, value === null ? {} : { [name]: value }) }
  catch (error) { refuse(error instanceof Error ? error.message : String(error)) }
  const effective = value ?? read!.value
  if (effective === null) return
  if (name === INSPECTOR_ANSWER_LINES) { try { readInspectorAnswerLines(effective) } catch (error) { refuse(error instanceof Error ? error.message : String(error)) } }
  const short = name.slice('MOLE_OFFICE_'.length)
  if (short === 'MODAL_MONTHLY_CAP_USD' && dollarsWithWholeCents(effective) === null) refuse('Use a non-negative finite dollar amount with whole cents within the safe integer limit.')
  if (short === 'BROADCAST_TIMES' && !effective.split(',').every((s) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.trim()))) refuse('Report times must be a comma-separated list of HH:MM.')
  if (short.startsWith('MAIN_WORLD_') && !/^x?\d+$/.test(effective)) refuse('Use a whole number, or x followed by a whole number for each secretary.')
  if (short === 'MODULE_REMINDER_SECRETARIES') { try { moduleReminderSecretariesFrom(effective) } catch (error) { refuse(error instanceof Error ? error.message : String(error)) } }
  if (short === 'RESULT_LEVEL_OF_EACH_KIND') { const levels = readTheLevelOfEachKind(effective); if ('refused' in levels) refuse(levels.refused) }
  if (short === 'LOCK_PATHS' && effective !== '' && !effective.split(delimiter).every((p) => isAbsolute(p))) refuse('Each lock folder must be an absolute path, separated as PATH is.')
  if (short === 'CHORE_RUNTIME' && !(THE_RUNTIMES_THE_OFFICE_DISPATCHES as readonly string[]).includes(effective)) refuse('Choose a runtime the message worker can dispatch.')
  if (short === 'REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN' && !['0','1'].includes(effective)) refuse('Use 1 to refuse or 0 to allow.')
  if (short === 'TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS' && !['0','1'].includes(effective)) refuse('Use 1 to turn it on, or 0 to turn it off.')
  const aWrongWorkSwitch = whatIsWrongWithAWorkSwitch(name, effective)
  if (aWrongWorkSwitch !== null) refuse(aWrongWorkSwitch)
  const aWrongWindow = whatIsWrongWithACompactionWindow(name, effective)
  if (aWrongWindow !== null) refuse(aWrongWindow)
  const gate = gateForSetting(name)
  if (gate !== undefined) {
    if (!gateValueIsAllowed(gate, effective)) {
      if (gate.positions.kind === 'switch') refuse('Use 1 to turn it on, or 0 to turn it off.')
      if (gate.positions.kind === 'block-remind-off') refuse(`Use ${gate.positions.allowed.join(' or ')}.`)
      const { fewest, most } = gate.positions
      refuse(`Use a whole number from ${fewest} to ${most}.` + (gate.id === 'checks-an-hour' ? ` At most ${most} checks may start in one lane in an hour.` : ''))
    }
    return
  }
  if (read!.setting.kind === 'duration') { try { parseDuration(effective, name) } catch (error) { refuse(error instanceof Error ? error.message : String(error)) } }
  // A switch's value is checked by its own line above, so a switch whose default is 0 may be set to 0.
  const numeric = read!.setting.kind !== 'flag' && read!.setting.fallback !== null && /^\d+$/.test(read!.setting.fallback)
  const zeroAllowed = ['RUN_WAITS_MINUTES','CHECK_FOR_MISSED_CHANGES','BUS_LEAVES_AFTER_SECONDS'].includes(short)
  const inspection = ['INSPECTION_MINUTES','INSPECTION_API_SECONDS','INSPECTION_OFFICE_BACK_SECONDS'].includes(short)
  if (inspection) {
    try {
      if (short === 'INSPECTION_MINUTES') inspectionSettings({[name]:effective})
      if (short === 'INSPECTION_API_SECONDS') inspectionApiWaitMilliseconds({[name]:effective})
      if (short === 'INSPECTION_OFFICE_BACK_SECONDS') inspectionOfficeBackMilliseconds({[name]:effective})
    } catch (error) { refuse(error instanceof Error ? error.message : String(error)) }
  }
  if (numeric && !inspection && ((!/^\d+$/.test(effective) || !Number.isSafeInteger(Number(effective))) || Number(effective) < (zeroAllowed ? 0 : 1))) refuse(zeroAllowed ? 'Use a whole number of zero or more.' : 'Use a positive whole number.')
  if (['REMIND_ME_LATER_EVERY_SECONDS','ENDED_RUN_LOOK_AFTER_SECONDS','ENDED_RUN_LOOK_EVERY_SECONDS','ENDED_RUN_SWEEP_EVERY_SECONDS','BUS_LEAVES_AFTER_SECONDS'].includes(short) && (!/^\d+$/.test(effective) || Number(effective)*1000>2_147_483_647)) refuse('Use a positive whole number of seconds within the timer limit.')
  if (short === 'MERGE_WORKERS' && (Number(effective) < MERGE_WORKERS_BOUNDS.fewest || Number(effective) > MERGE_WORKERS_BOUNDS.most)) refuse(`Test workers must be between ${MERGE_WORKERS_BOUNDS.fewest} and ${MERGE_WORKERS_BOUNDS.most}.`)
  if (short === 'BUS_MOST_ENTRIES' && (Number(effective) < BUS_ENTRIES_BOUNDS.fewest || Number(effective) > BUS_ENTRIES_BOUNDS.most)) refuse(`The merge bus may hold between ${BUS_ENTRIES_BOUNDS.fewest} and ${BUS_ENTRIES_BOUNDS.most} entries.`)
}

export async function runtimeSettingsRoutes(app: FastifyInstance): Promise<void> {
  // A KEPT SETTING THIS OFFICE CANNOT READ DOES NOT STOP ITS START (message 4MW_8wOW-hVF). Its start reading is
  // 'unreadable', so its row says so in the reading's own words, and one line of the start log names it. The setting's
  // own reader still refuses the value where it reads it.
  readingsAtStart = new Map(RESTART_SETTING_NAMES.map((name): [string, {value:string|null;source:string}] => {
    try { const read = readSettingHere(name); return [name, {value:read.value,source:read.source}] }
    catch (error) {
      const refusal = (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ')
      console.warn(`${name} could not be read when the office started, so the Office controls page shows it as unreadable: ${refusal}`)
      return [name, {value:null,source:'unreadable'}]
    }
  }))
  app.get('/settings/structure', route('office.settings', 'remote', 'Read the Settings categories, panels and controls with their words, addresses and authority.'), async (req) => {
    const { lang } = req.query as { lang?: unknown }
    return readSettingsStructure(isLanguage(lang) ? lang : 'en')
  })
  app.get('/office/settings', route('office.settings', 'remote', 'Read every non-secret declaration, its value, source, restart requirement, permission and latest change. A writable setting whose stored choice the write check refuses carries storedButRefused {value,reason}; otherwise it is null. Boot, identity, test and secret controls keep their own doors.'), async () => runtimeSettingsReading())
  app.get('/office/gates', route('office.gates', 'remote', 'Read every gate by class and group, with its live position, source, saved choice, latest change and this caller’s permission. With ?gate=<id>, read only that gate’s row, with the same permission.'), async (req) => {
    const {gate} = req.query as {gate?: unknown}
    return gate === undefined ? gatesReading(actorFrom(req)) : oneGateReading(actorFrom(req), String(gate))
  })
  app.post('/office/gates/:id/met', route('merge.tool', 'remote', 'Count an encounter reported by an outside tool. Body {position:string}. The office key may count any gate an outside tool counts. A live run\'s own key may count a gate the release tool counts, when the run\'s agent holds the card that may authorize a stable release. Server-counted gates, gates nothing counts and all other callers are refused without counting.'), async (req) => {
    const {id} = req.params as {id: string}
    const gate = GATES.find(row => row.id === id)
    // THE RELEASE TOOL HOLDS ONLY ITS RUN'S KEY, so it counts a refused stable release with that key. The key must prove
    // its own live run, and the run's agent must hold the card that may authorize a stable release (round E, way 1).
    const actor = actorFrom(req, {proveOwnRun: true})
    const theReleaseToolsRun = gate?.countedBy === 'the-release-tool' && actor.ownKeyRun !== undefined && actor.sessionId === actor.ownKeyRun && aSecretaryWithItsOwnKey(actor)
    if (actor.provedBy !== 'the-office-key' && !theReleaseToolsRun) throw new PanelError('Only the office key, or the release tool with its own run\'s key, may send a gate count. Nothing was counted.', 403, undefined, undefined, undefined, {code: 'gateCountNotAllowed', values: {}})
    if (gate === undefined) throw new PanelError('No gate has this id. Nothing was counted.', 404, undefined, undefined, undefined, {code: 'gateCountUnknown', values: {}})
    if (gate.countedBy === 'the-server') throw new PanelError('The server counts this gate itself. Nothing was counted.', 409, undefined, undefined, undefined, {code: 'gateCountAlreadyInServer', values: {}})
    if (gate.countedBy === 'nobody') throw new PanelError('Nothing counts this gate, and its words say why. Nothing was counted.', 409, undefined, undefined, undefined, {code: 'gateCountNobodyCounts', values: {}})
    const body = z.strictObject({position: z.string()}).safeParse(req.body)
    if (!body.success || !gateValueIsAllowed(gate, body.data.position)) throw new PanelError('Send only a position this gate allows as text. Nothing was counted.', 400, undefined, undefined, undefined, {code: 'gateCountBadPosition', values: {}})
    const position = gateMet(id, body.data.position)
    return {gate: id, position, ...gateCountsToday(id)}
  })
  app.post('/office/settings', route('office.set-settings', 'remote', 'Change runtime controls atomically. Body {changes:[{name,value:string|null,decision?:liveDecision|null,until?:dateAndTime}],because,warrant?}. Owner or secretary with its own key. Owner-decided settings need the owner, a secretary with words bound to office.set-settings: plus sorted JSON [{name,value,effective,decision,until?}], or the person’s grant where this office’s list of what the grant carries says may-press; absent until keeps the existing warrant words. Only a gate choice may carry a future end time. null removes a stored choice. Every change is kept with its reason, writer, time and old and new values.'), async (req) => {
    let actor = actorFrom(req)
    const {owner, mayChange} = runtimeSettingsAuthority(actor)
    if (!mayChange) refuse('Only the owner or a secretary with its own key may change runtime settings.', 'runtimeSettingsNotAllowed', 403)
    const parsed = bodyShape.safeParse(req.body)
    if (!parsed.success) refuse('Send a non-empty list of named values, a reason of 1 to 500 characters, and no extra fields.')
    const body = parsed.data
    if (new Set(body.changes.map((s) => s.name)).size !== body.changes.length) refuse('Name each setting only once.')
    // A GATE ONLY THE PERSON MAY CHANGE also takes a secretary whom the person's grant lets press this door for them.
    // The grant's check refuses a secretary that holds the grant in its own words, and names the grant on the change.
    if (!owner && body.changes.some((s) => gateForSetting(s.name)?.whoMayChange === 'the-person') && !aRaiseCarriesIt(actor)) {
      refuse('Only the person may change this gate, or a secretary their grant lets press this door for them.', 'runtimeSettingsNotAllowed', 403)
    }
    const before = runtimeSettingsReading().settings
    // WHETHER THE MERGE QUEUE WAS HELD before this change, so a change that lifts it decides the waiting seals (13u round 94).
    const heldBefore = theQueueIsHeld()
    const exact = body.changes.map((s) => {
      let until: string | undefined
      if (s.until !== undefined) {
        if (gateForSetting(s.name) === undefined) refuse('This setting is not a gate, so its choice cannot have an end time.')
        if (s.value === null) refuse('Removing a choice has nothing to end, so it cannot have an end time.')
        const typed = readATypedTime(s.until)
        if (typed === null) refuse('Use a date and a time in the form YYYY-MM-DD HH:MM.')
        if (aTimeHasCome(typed, localStamp(new Date()))) refuse('That end time has already come.')
        until = typed
      }
      validateRuntimeValue(s.name, s.value)
      const previous = before.find((v) => v.name === s.name)!
      // Removing a choice retains its decision protection; replacing its reference still needs the owner or exact words.
      const decision = s.decision === undefined ? previous.decision?.id ?? null : s.decision
      if (decision !== null) { const record = getRecord(decision); if (record?.kind !== 'decision' || record.deletedAt !== null) refuse('Choose a live decision.', 'runtimeSettingsBadDecision') }
      const effective = s.value ?? readSettingHere(s.name, { ...process.env }).value
      validateRuntimeValue(s.name, effective)
      return { name: s.name, value: s.value, effective, decision, ...(until === undefined ? {} : {until}) }
    }).sort((a, b) => a.name.localeCompare(b.name))
    const candidate = (name: string) => exact.find((s) => s.name === name)?.effective ?? before.find((s) => s.name === name)?.value
    if (exact.some((s) => /^MOLE_OFFICE_HANDLE_(BEAT|LAPSES_AFTER|GRACE)_SECONDS$/.test(s.name))) {
      const beat = Number(candidate('MOLE_OFFICE_HANDLE_BEAT_SECONDS')), lapse = Number(candidate('MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS')), grace = Number(candidate('MOLE_OFFICE_HANDLE_GRACE_SECONDS'))
      if (!(beat < lapse && lapse < grace)) refuse('The handle lapse must exceed its beat, and the grace must exceed the lapse.')
    }
    if (exact.some((s) => ['MOLE_OFFICE_IDLE_AFTER','MOLE_OFFICE_ORPHAN_AFTER'].includes(s.name))) {
      if (parseDuration(candidate('MOLE_OFFICE_IDLE_AFTER')!, 'MOLE_OFFICE_IDLE_AFTER') >= parseDuration(candidate('MOLE_OFFICE_ORPHAN_AFTER')!, 'MOLE_OFFICE_ORPHAN_AFTER')) refuse('The orphan threshold must exceed the idle threshold.')
    }
    const deadLetters = exact.filter((s) => s.name.startsWith('MOLE_OFFICE_DEAD_LETTER_AFTER_'))
    if (!owner && exact.some((s) => DECIDED_SETTING_NAMES.includes(s.name) || s.decision !== null || before.find((v)=>v.name===s.name)?.ownerDecided)) {
      try { actor = actorWithTheWordsItActsOn(req, body.warrant, `office.set-settings:${JSON.stringify(exact)}`) }
      catch (error) { if (!(error instanceof PanelError)) throw error; refuse(error.message, 'runtimeSettingsBadWarrant', error.status) }
      // The dead-letter thresholds have a door of their own, so a change to them here asks that door's answer as well,
      // and the stricter of the two stands.
      if (!theSecretaryActingForThePerson(actor, deadLetters.length > 0 ? { also: ['office.set-dead-letter-thresholds'] } : {})) refuse('These exact values need the owner’s words. A raise alone is not enough.', 'runtimeSettingsNotAllowed', 403)
    }
    if (new Set(deadLetters.map((s) => s.decision)).size > 1) refuse('The dead-letter pair must name one decision, because it has one audit.')
    sqlite.transaction(() => {
      if (deadLetters.length > 0) {
        const readPair = () => sqlite.prepare('SELECT dead_letter_after_days AS days, dead_letter_after_count AS count FROM installation WHERE only_row=1').get() as { days:number|null; count:number|null }
        const pair = readPair()
        const old = before.find((s) => s.name === deadLetters[0]!.name)!
        for (const change of deadLetters) {
          const column = change.name.endsWith('_DAYS') ? 'dead_letter_after_days' : 'dead_letter_after_count'
          sqlite.prepare(`UPDATE installation SET ${column}=? WHERE only_row=1`).run(change.value === null ? null : Number(change.value))
        }
        writeDownASettingChange(actor, { setting: 'dead-letter-thresholds', field: 'the dead-letter summary thresholds',
          before: { ...pair, effective: { days: Number(before.find((s) => s.name.endsWith('DEAD_LETTER_AFTER_DAYS'))!.value), count: Number(before.find((s) => s.name.endsWith('DEAD_LETTER_AFTER_COUNT'))!.value) }, because: old.because, decision: old.decision?.id ?? null },
          after: { ...readPair(), effective: { days: Number(settingValue('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS')), count: Number(settingValue('MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT')) }, because: body.because, decision: deadLetters[0]!.decision }, workspaceId: workspaceOf(req) })
      }
      for (const change of exact) {
        if (change.name.startsWith('MOLE_OFFICE_DEAD_LETTER_AFTER_')) continue
        const old = before.find((s) => s.name === change.name)!
        const previous = sqlite.prepare('SELECT until FROM runtime_settings WHERE name = ?').get(change.name) as {until: string | null} | undefined
        if (change.value === null) sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(change.name)
        else sqlite.prepare('INSERT INTO runtime_settings (name,value,until) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, until=excluded.until').run(change.name, change.value, change.until ?? null)
        writeDownASettingChange(actor, { setting: `runtime:${change.name}`, field: old.what,
          before: { value: old.value, chosen: old.chosen, until: previous?.until ?? null, decision: old.decision?.id ?? null, because: old.because },
          after: { value: change.effective, chosen: change.value, until: change.until ?? null, decision: change.decision, because: body.because }, workspaceId: workspaceOf(req) })
      }
      sayASecretaryChangedItForThem(req, actor, 'The office runtime settings were changed')
    })()
    const sealsDecided = theOfficeDecidesTheSealsTheHoldKept(heldBefore)
    if (sealsDecided.length > 0) return {...runtimeSettingsReading(), sealsDecided}
    return runtimeSettingsReading()
  })
  app.post('/office/gate-count-spool/hand-over', route('office.hand-over-gate-count-spool', 'remote', 'Give the gate-count spool to this office\'s world. Body {saw:string,because:string}: saw is the world the Gates panel showed as the spool\'s owner, and because is the reason, written in the spool\'s rejects file. Only the person, proved as the person; no grant and no raise presses it. It removes the spool\'s .world only when this office reads the spool, another world owns it now, .world still names saw, and the reason is not empty, and otherwise refuses and changes nothing. It writes a line in the rejects file before the removal, saying who pressed, how the office knew it was the person, why, and from which byte of each day file this office counts. Then this office reads the spool again at once.'), async (req) => {
    const actor = actorFrom(req)
    if (!mayHandOverTheSpool(actor)) throw new PanelError('Only the person hands the gate-count spool to another world, and no grant and no raise presses it. Nothing was changed.', 403, undefined, undefined, undefined, {code: 'gateCountSpoolOnlyThePerson', values: {}})
    const body = z.strictObject({saw: z.string().min(1).max(200), because: z.string().max(500)}).safeParse(req.body)
    if (!body.success) throw new PanelError('Send the world the page showed as the spool\'s owner as saw, a reason of at most 500 characters as because, and no other fields. Nothing was changed.', 400, undefined, undefined, undefined, {code: 'gateCountSpoolBadBody', values: {}})
    const because = body.data.because.trim()
    if (because === '') throw new PanelError('Write why you give the spool to this office\'s world. The reason is written in the spool\'s rejects file. Nothing was changed.', 400, undefined, undefined, undefined, {code: 'gateCountSpoolNoReason', values: {}})
    const done = handTheGateCountSpoolToThisWorld({saw: body.data.saw, because, pressedBy: actor.id,
      provedBy: {key: actor.provedBy ?? null, theKeyWindowCovers: actor.theKeyWindowCovers === true, aListenerCarriedIt: actor.from !== undefined, aSignedItem: actor.signedItem !== undefined}})
    if ('refused' in done) {
      if (done.refused === 'this-office-does-not-read-the-spool') throw new PanelError('This office does not read the gate-count spool, so it cannot take it. A scratch office never reads it. Nothing was changed.', 409, undefined, undefined, undefined, {code: 'gateCountSpoolNotRead', values: {}})
      if (done.refused === 'no-other-world-owns-it') throw new PanelError(`${done.now} So there is nothing to hand over, and nothing was changed.`, 409, undefined, undefined, undefined, {code: 'gateCountSpoolNotAnotherWorlds', values: {reason: done.now}})
      throw new PanelError(`The spool belongs to the world ${done.now} now, not to ${done.saw}, which the page showed. Read the page again before you press. Nothing was changed.`, 409, undefined, undefined, undefined, {code: 'gateCountSpoolNotWhatYouSaw', values: {saw: done.saw, now: done.now}})
    }
    if ('failed' in done) throw new PanelError(`${done.failed} The spool still belongs to the other world, and this office still counts nothing from it.`, 500, undefined, undefined, undefined, {code: 'gateCountSpoolNotRemoved', values: {reason: done.failed}})
    return done.handedOver
  })
}
