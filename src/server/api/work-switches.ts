// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR WORK SWITCHES, READ IN ONE CALL. Wave 13q item 17.
 *
 *   GET /api/office/work-switches   the own-release skip lists, the queue hold, how many checks run at once and the
 *                                    receipt producer's unfinished attempt, each with its last change
 *
 * A host script reads it with an agent's own key, and needs no person's session. It reads only these settings, each by
 * its name, and answers no other: the settings table is not read whole. Each switch is changed at its own door, which
 * keeps who changed it, when and why: the skip lists, the hold and the attempt at POST /api/office/settings, and how
 * many checks run at once at POST /api/office/checks-in-merges-only.
 *
 * A STORED VALUE THE SETTINGS DOOR WOULD NOT TAKE is a 500 that names the setting, so a script never reads a list
 * nobody could have written as some other list, or as no list.
 */
import type { FastifyInstance } from 'fastify'

import { gateNamed } from '../../config/gates.mjs'
import { CHECKS_AT_ONCE_BOUNDS } from '@shared/checks-in-merges-only.ts'
import { OWN_RELEASE_SKIP_RUNS, OWN_RELEASE_SKIP_TAGS, RECEIPT_PRODUCER_PENDING } from '@shared/work-switches.mjs'
import { CHECKS_AT_ONCE_SETTING, theChecksAtOnce } from '../lib/checks-in-merges-only.ts'
import { theQueueIsHeld } from '../lib/merge-queue.ts'
import { theLastChangeOfASetting } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theEntriesOf, whatIsWrongWithAWorkSwitch } from '../lib/work-switches.ts'
import { aGatesLastChange, oneSettingReading, theWritersName, type ASettingReading } from './runtime-settings.ts'

/** Who made a switch's newest change, when, and the reason given, or null when none was given. */
export interface AWorkSwitchsLastChange {
  at: string
  by: { type: string; id: string; name: string | null }
  because: string | null
}
export interface ASkipList {
  setting: string
  entries: string[]
  source: string
  lastChange: AWorkSwitchsLastChange | null
}
export interface TheWorkSwitches {
  ownReleaseSkip: { tags: ASkipList; runs: ASkipList }
  queueHeld: { gate: string; setting: string; on: boolean; source: string; lastChange: (AWorkSwitchsLastChange & { until: string | null }) | null }
  checksAtOnce: { value: number; from: 'the default' | 'set here'; fewest: number; most: number; lastChange: AWorkSwitchsLastChange | null }
  receiptProducerPending: { setting: string; attempt: string | null; since: string | null; source: string; lastChange: AWorkSwitchsLastChange | null }
}

const QUEUE_HELD_GATE = gateNamed('queue-held')

const READ_NOTE =
  'The four switches that decide whether work moves, each with who changed it last, when and the reason given. Any ' +
  'caller may read it, and a host script reads it with an agent\'s own key. Read only, and no body is read. It reads ' +
  'these settings by name and answers no other. The reply is {ownReleaseSkip, queueHeld, checksAtOnce, receiptProducerPending}. ' +
  'ownReleaseSkip is {tags, runs}, each {setting, entries, source, lastChange}: the check tags and the run ids whose ' +
  'release is kept by hand, one entry for each line of the setting, and no entries when nobody set it. queueHeld is ' +
  '{gate: "queue-held", setting, on, source, lastChange}, the office\'s queue-held gate, and its lastChange carries the ' +
  'end time the hold was given as until. checksAtOnce is {value, from, fewest, most, lastChange}: how many checks run at ' +
  'once, from "set here" or "the default", and the bounds a change must keep within. receiptProducerPending is ' +
  '{setting, attempt, since, source, lastChange}: the path of the whole-suite receipt producer\'s unfinished attempt, or ' +
  'null when none is pending, and since is when the office stored it, or null when it was not stored here. Every ' +
  'lastChange is {at, by: {type, id, name}, because}, or null when the change log holds no change to it. A stored value ' +
  'the settings door would not take is a 500 that names the setting.'

/** One of the new switches, read alone, with its value checked as the settings door checks a change. */
function aSwitchReading(name: string): ASettingReading {
  const reading = oneSettingReading(name)
  if (reading.unreadable !== null) throw new PanelError(`${name} could not be read: ${reading.unreadable} Nothing was guessed.`, 500)
  if (reading.source === 'not read') throw new PanelError(`${name} could not be read from the office database. Nothing was guessed.`, 500)
  const wrong = reading.value === null ? null : whatIsWrongWithAWorkSwitch(name, reading.value)
  if (wrong !== null) {
    throw new PanelError(
      `${name} holds ${JSON.stringify(reading.value)}, from ${reading.source}, and the settings door would not take it: ${wrong} ` +
        'Nothing was guessed and nothing was changed.',
      500,
    )
  }
  return reading
}

function theLastChange(reading: ASettingReading): AWorkSwitchsLastChange | null {
  return reading.lastChange === null ? null : { at: reading.lastChange.at, by: reading.lastChange.by, because: reading.because }
}

function aSkipList(name: string): ASkipList {
  const reading = aSwitchReading(name)
  return { setting: name, entries: theEntriesOf(reading.value), source: reading.source, lastChange: theLastChange(reading) }
}

/**
 * WHEN THE OFFICE STORED THE VALUE IN FORCE: the time of the newest change, when that change stored this value here.
 * A value from the environment or from .env has no time the office knows, and so has none.
 */
function whenTheOfficeStoredIt(reading: ASettingReading): string | null {
  const last = reading.lastChange
  if (reading.value === null || reading.source !== 'the office database' || last?.to == null) return null
  const after = JSON.parse(last.to) as { chosen?: string | null }
  return after.chosen === reading.value ? last.at : null
}

export function theWorkSwitches(): TheWorkSwitches {
  const held = oneSettingReading(QUEUE_HELD_GATE.setting)
  const heldLast = aGatesLastChange(held)
  const checks = theChecksAtOnce()
  const checksLast = theLastChangeOfASetting(CHECKS_AT_ONCE_SETTING)
  const pending = aSwitchReading(RECEIPT_PRODUCER_PENDING)
  return {
    ownReleaseSkip: { tags: aSkipList(OWN_RELEASE_SKIP_TAGS), runs: aSkipList(OWN_RELEASE_SKIP_RUNS) },
    queueHeld: {
      gate: QUEUE_HELD_GATE.id, setting: QUEUE_HELD_GATE.setting, on: theQueueIsHeld(), source: held.source,
      lastChange: heldLast === null ? null : { at: heldLast.at, by: heldLast.by, because: heldLast.because, until: heldLast.until },
    },
    checksAtOnce: {
      value: checks.checksAtOnce, from: checks.from, ...CHECKS_AT_ONCE_BOUNDS,
      lastChange: checksLast === null ? null : { at: checksLast.at, by: { ...checksLast.by, name: theWritersName(checksLast.by) }, because: checks.because },
    },
    receiptProducerPending: {
      setting: RECEIPT_PRODUCER_PENDING, attempt: pending.value, since: whenTheOfficeStoredIt(pending), source: pending.source,
      lastChange: theLastChange(pending),
    },
  }
}

export async function workSwitchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/work-switches', route('office.work-switches', 'remote', READ_NOTE), async (): Promise<TheWorkSwitches> => theWorkSwitches())
}
