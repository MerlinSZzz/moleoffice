// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY PUSH TO MAIN, AS THE OFFICE KEEPS IT (wave 13u round 82, item 16). An emergency fix does not go through
 * the merge queue: it goes straight to main, and then into the stable version. The merge tool moves main; the office
 * lets it start, keeps who pushed and why, and ends it as git shows. The rule for the switch and the chat message is
 * 13q's, asked through `theEmergencyAsJudged`, so one throw of the switch lets in the push and the emergency release of
 * the same commit. src/shared/emergency-push.ts says what the push is.
 */
import { realpathSync } from 'node:fs'
import {
  aLandingHoldsMain, aPushHasEnded, aPushHoldsMain, aPushNamesNoLine, aPushNeedsTheMessage, aPushNeedsTheSwitch, aStoppedPushPushedNothing,
  EMERGENCY_PUSH_KIND, EMERGENCY_PUSHES_SHOWN, emergencyPushEndSchema, emergencyPushHandBackSchema, emergencyPushRequestSchema, mainAtNeither,
  mainIsThereAlready, mainUnread, notACheckoutTheOfficeKnows, notACommitIn, notAfterMain, notAnEmergencyPush, ONLY_THE_PERSON_OR_THE_SECRETARY_PUSHES,
  type EmergencyPushHandBackAnswer, type EmergencyPushHandedBack, type EmergencyPushReading,
} from '@shared/emergency-push.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { clockStamp, nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { parseWholeSuiteReceipt, type WholeSuiteReceipt } from '@shared/whole-suite-receipt.ts'
import { settingValue } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { parse } from './parse.ts'
import { whoHoldsTheSecretaryCard, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { theFilesAPushChanged, theMainSuiteCaller, theReceiptTheCallerFiled, redInTheReceipt } from './main-suite-hand-back.ts'
import { asTheMergeQueue } from './merge-entry-door.ts'
import { eachHasAPlace, maySpeakForTheSecretary } from './merge-queue.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { theHandBackDeadline } from '@shared/hand-back-deadline.ts'
import { theHandleOf } from '../db/the-handle-of.ts'
import { theRowAnArrivingReferenceNames } from './the-row-an-arriving-reference-names.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { theFollowUp } from './stable/emergency.ts'
import { authoredCreate, theEmergencyAsJudged } from './stable-upgrade-notices.ts'
import { theLandingIn, thePushMovingMainIn } from './who-moves-main.ts'
import { thePushHandBackOf, type PushHandBackFacts } from '@shared/push-hand-back.ts'

/** The person, or the agent holding the secretary card, or a 403 that says so. */
function whoPushes(actor: Actor): ParticipantRef {
  const me = maySpeakForTheSecretary(actor)
  if (me === null) throw new PanelError(ONLY_THE_PERSON_OR_THE_SECRETARY_PUSHES, 403)
  return me
}

/** Main in a checkout: the commit its HEAD is at, as a landing reads it. */
function mainIn(root: string): string {
  try {
    return readGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim()
  } catch (error) {
    throw new PanelError(mainUnread(root, `${whyGitDidNotAnswer(error)}.`), 409)
  }
}

/** Whether git answers yes; its exit 1 is its no, and any other failure is no answer at all. */
function gitSaysYes(root: string, args: string[]): boolean {
  try {
    readGit(root, args)
    return true
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return false
    throw new PanelError(mainUnread(root, `${whyGitDidNotAnswer(error)}.`), 409)
  }
}

/** The registered repository whose checkout this is, resolved through links, with the resolved path. */
function theRepositoryAt(workspaceId: string, root: string): { root: string; repository: string } {
  const resolved = (path: string): string | null => {
    try { return realpathSync(path) } catch { return null }
  }
  const asked = resolved(root)
  const found = asked === null ? undefined : listRepositories(workspaceId).find((one) => one.root !== null && resolved(one.root) === asked)
  if (asked === null || found === undefined) throw new PanelError(notACheckoutTheOfficeKnows(root), 409)
  return { root: asked, repository: found.name }
}

function theReading(record: PanelRecord): EmergencyPushReading {
  const data = record.data as Omit<EmergencyPushReading, 'id' | 'who' | 'lineWho' | 'followUp'>
  // A push recorded before a push could name its line holds no `line`; it named none.
  const line = data.line ?? null
  return {
    id: record.id,
    state: data.state,
    root: data.root,
    repository: data.repository,
    commit: data.commit,
    mainBefore: data.mainBefore,
    message: data.message,
    switch: data.switch,
    by: data.by,
    line,
    who: theHandleOf(data.by),
    lineWho: line === null ? null : theHandleOf(line),
    startedAt: data.startedAt,
    ended: data.ended,
    // THE FOLLOW-UP IS WORKED OUT ON READ, by 13q's rule: the first authored whole-suite receipt after the push whose
    // commit contains the pushed commit and is on main. A push that did not move main owes none.
    followUp: data.state === 'pushed' ? theFollowUp(record.workspaceId, record.id, data.commit, authoredCreate) : null,
  }
}

/**
 * START A PUSH: POST /api/merge-queue/emergency-pushes. Refused, with nothing written, unless the caller is the person or
 * holds the secretary card (403), the checkout is a registered repository's, the commit comes after main there, the
 * emergency switch and the chat message let an emergency in, and nobody else is moving main (all 409). The lock and the
 * record are one transaction, so two pushes cannot both start.
 */
export function startAnEmergencyPush(input: { workspaceId: string; actor: Actor; body: unknown }): EmergencyPushReading {
  const by = whoPushes(input.actor)
  const asked = parse(emergencyPushRequestSchema, input.body, 'The emergency push')
  const named = asked.line === undefined ? null : theRowAnArrivingReferenceNames(asked.line, 'writing')
  if (asked.line !== undefined && named === null) throw new PanelError(aPushNamesNoLine(asked.line), 409)
  const line: ParticipantRef | null = named === null ? null : { kind: 'agent', id: named.id }
  const { root, repository } = theRepositoryAt(input.workspaceId, asked.root)
  const main = mainIn(root)
  if (!gitSaysYes(root, ['cat-file', '-e', `${asked.commit}^{commit}`])) throw new PanelError(notACommitIn(asked.commit, root), 409)
  if (asked.commit === main) throw new PanelError(mainIsThereAlready(asked.commit, root), 409)
  if (!gitSaysYes(root, ['merge-base', '--is-ancestor', main, asked.commit])) throw new PanelError(notAfterMain(asked.commit, main, root), 409)
  const judged = theEmergencyAsJudged(input.workspaceId, input.actor, { message: asked.message, commit: asked.commit })
  if (judged.switched !== null) throw new PanelError(aPushNeedsTheSwitch(judged.switched), 409)
  if (judged.told !== null) throw new PanelError(aPushNeedsTheMessage(judged.told), 409)
  const record = sqlite.transaction(() => {
    // ONE WRITER OF MAIN AT A TIME. A landing entry of this checkout holds main, and so does another push.
    const landing = theLandingIn(root)
    if (landing !== null) throw new PanelError(aLandingHoldsMain(landing, root), 409)
    const pushing = thePushMovingMainIn(root)
    if (pushing !== null) throw new PanelError(aPushHoldsMain(pushing, root), 409)
    return asTheMergeQueue(() => createRecord({
      workspaceId: input.workspaceId,
      kind: EMERGENCY_PUSH_KIND,
      title: `Emergency push of ${asked.commit.slice(0, 12)} to main in ${repository}`,
      actor: input.actor,
      data: { state: 'pushing', root, repository, commit: asked.commit, mainBefore: main, message: asked.message, switch: judged.row, by, line, startedAt: nowStamp(), ended: null },
    }))
  }).immediate()
  return theReading(record)
}

/**
 * END A PUSH: POST /api/merge-queue/emergency-pushes/<id>/end. The state is what git shows, not what the caller says:
 * pushed when main is at the commit, stopped when main is where it was. Main anywhere else is refused, and the push goes
 * on holding main until somebody finds out who moved it. A stopped push pushed nothing on.
 */
export function endAnEmergencyPush(input: { workspaceId: string; id: string; actor: Actor; body: unknown }): EmergencyPushReading {
  const found = recordInWorkspace(input.id, input.workspaceId)
  if (found.kind !== EMERGENCY_PUSH_KIND) throw new PanelError(`${notAnEmergencyPush(input.id)} Nothing was written.`, 409)
  whoPushes(input.actor)
  const asked = parse(emergencyPushEndSchema, input.body, 'The end of the emergency push')
  const push = theReading(found)
  if (push.state !== 'pushing') throw new PanelError(aPushHasEnded(push.id, push.state), 409)
  const main = mainIn(push.root)
  const state = main === push.commit ? 'pushed' : main === push.mainBefore ? 'stopped' : null
  if (state === null) throw new PanelError(mainAtNeither(push.id, push.root, main, push.commit, push.mainBefore), 409)
  if (state === 'stopped' && asked.onward !== null) throw new PanelError(aStoppedPushPushedNothing(push.id), 409)
  asTheMergeQueue(() => patchRecord(push.id, { dataPatch: { state, ended: { at: nowStamp(), mainAfter: main, says: asked.says, onward: asked.onward } } }, input.actor))
  return theReading(getRecord(push.id)!)
}

/**
 * ONE PUSH: GET /api/merge-queue/emergency-pushes/<id>, which its own record page reads, since its follow-up is worked out
 * on read and stored nowhere. A record that is no push is refused with 409, and an id the project does not hold with 404.
 */
export function readAnEmergencyPush(input: { workspaceId: string; id: string }): EmergencyPushReading {
  const found = recordInWorkspace(input.id, input.workspaceId)
  if (found.kind !== EMERGENCY_PUSH_KIND) throw new PanelError(notAnEmergencyPush(input.id), 409)
  return theReading(found)
}

/**
 * THE PUSHES THE QUEUE'S REPLY CARRIES, the newest first: those of `lane` when the reply is narrowed to one, else every
 * lane's. They are the lane's history, so the states asked of the entries do not narrow them. Newest by the order they
 * were written (`theOrderWritten`); a push with no place comes first, so the cut cannot hide it and the reply is a 500.
 */
export function theEmergencyPushes(input: { workspaceId: string; lane: string | null }): EmergencyPushReading[] {
  const rows = sqlite
    .prepare(
      `SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL ` +
        "AND (? IS NULL OR json_extract(data, '$.root') = ?) ORDER BY written DESC NULLS FIRST, rowid DESC LIMIT ?",
    )
    .all(EMERGENCY_PUSH_KIND, input.workspaceId, input.lane, input.lane, EMERGENCY_PUSHES_SHOWN) as { id: string; written: number | null }[]
  return eachHasAPlace(rows).map((row) => theReading(getRecord(row.id)!))
}

/**
 * HAND A PUSH'S RED FOLLOW-UP BACK: POST /api/merge-queue/emergency-pushes/hand-back-from-the-main-suite. The main suite's
 * job asks it with the red files of a whole-suite receipt that no landing made. Each push whose follow-up is this red
 * receipt, and which changed one of those files, gets one open problem naming them and a deadline, the same hours as an
 * entry's hand-back. Who is told is whoIsToldOfAPushHandBack's answer; a problem nobody could be told of is kept for the
 * reminder before a secretary's next report. A file no such push changed is not the pushes', and is left where a red
 * whole suite goes.
 *
 * The caller and the receipt are proved as the entry hand-back proves them (main-suite-hand-back.ts), and nothing is
 * written on a refusal. An open problem about the push already there is named again, and nobody is told twice.
 */
export function handBackAPushesRed(input: { workspaceId: string; actor: Actor; body: unknown }): EmergencyPushHandBackAnswer {
  const caller = theMainSuiteCaller(input.actor)
  const asked = parse(emergencyPushHandBackSchema, input.body, "The hand-back of an emergency push's red follow-up")
  const original = theReceiptTheCallerFiled(input.workspaceId, asked.receipt, caller)
  let receipt: WholeSuiteReceipt
  try { receipt = parseWholeSuiteReceipt(JSON.parse(original)) } catch { throw new PanelError(sayInEnglish('mainSuiteTrace.receipt'), 409) }
  redInTheReceipt(receipt, asked.files)
  const { root } = theRepositoryAt(input.workspaceId, receipt.repository)
  const rows = sqlite
    .prepare(
      `SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL ` +
        "AND json_extract(data, '$.state') = 'pushed' AND json_extract(data, '$.root') = ? ORDER BY written, rowid",
    )
    .all(EMERGENCY_PUSH_KIND, input.workspaceId, root) as { id: string; written: number | null }[]
  // THE PUSHES WHOSE FOLLOW-UP IS THIS RECEIPT, with the asked files each changed, all read before the first write. The
  // receipt is red, since the files failed in it; a push whose follow-up was green is followed up by another receipt.
  const theirs = eachHasAPlace(rows).map((row) => theReading(getRecord(row.id)!)).flatMap((push) => {
    const followUp = push.followUp
    if (followUp?.state !== 'filed' || followUp.receipt.id !== asked.receipt) return []
    const changed = new Set(theFilesAPushChanged(push))
    const files = asked.files.filter((file) => changed.has(file))
    return files.length === 0 ? [] : [{ push, receipt: followUp.receipt, files }]
  })
  const handedBack = sqlite.transaction(() => theirs.map(({ push, receipt: pin, files }): EmergencyPushHandedBack => {
    const open = sqlite
      .prepare(
        `SELECT id, json_extract(data, '$.extra.emergencyPushHandBack.files') AS files, ${theOrderWritten('records')} AS written FROM records ` +
          "WHERE kind = 'problem' AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'open' " +
          "AND json_extract(data, '$.extra.emergencyPushHandBack.push') = ? ORDER BY written, rowid LIMIT 1",
      )
      .get(input.workspaceId, push.id) as { id: string; files: string; written: number | null } | undefined
    if (open !== undefined) {
      eachHasAPlace([open])
      const named = JSON.parse(open.files) as string[]
      return { push: push.id, problem: open.id, filed: false, files, unnamedFiles: files.filter((file) => !named.includes(file)) }
    }
    const lineSays = push.line === null ? 'It named no line.' : `It came from the line of agent ${push.line.id}.`
    const due = theHandBackDeadline(clockStamp())
    const symptom = `Emergency push ${push.id} moved main in ${push.root} from ${push.mainBefore} to ${push.commit}. ` +
      `Whole-suite receipt ${pin.id}, the first run on main with it, is red in files it changed: ${files.join(', ')}. ${lineSays} ` +
      `Mend it by ${due.deadline} (${due.timeZone}), ${String(due.hours)} hours after this hand-back; after that the office says it is overdue. ` +
      'The office never takes an emergency push back by itself.'
    const { to, nobody } = whoIsToldOfAPushHandBack(push)
    const problem = createRecord({ kind: 'problem', title: `Handed back: emergency push ${push.id}`, workspaceId: input.workspaceId, actor: THE_OFFICE,
      data: { state: 'open', whose_move: 'agent', symptom, seen_in: files, found_by: `the main suite's whole-suite receipt ${pin.id}`,
        extra: { emergencyPushHandBack: { push: push.id, receipt: pin, files, line: push.line, ...due }, ...(nobody === null ? {} : { emergencyPushNobodyTold: { says: nobody } }) } } })
    if (to.length > 0) writeAMessage({ workspaceId: input.workspaceId, to, title: problem.title, body: `Problem ${problem.id}. ${symptom}`, aboutRun: null, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
    return { push: push.id, problem: problem.id, filed: true, files, unnamedFiles: [] }
  })).immediate()
  return { handedBack, notThePushes: asked.files.filter((file) => !handedBack.some((one) => one.files.includes(file))) }
}

/**
 * WHO IS TOLD OF A PUSH'S HAND-BACK: its line first; with no line, whoever pushed when that is an agent; and the holder of
 * the secretary card as well. When that is nobody, because the person pushed, named no line, and nobody holds the card,
 * the build sheriff (MOLE_OFFICE_BUILD_SHERIFF). When that is nobody too, `nobody` says why. The person is never told.
 */
export function whoIsToldOfAPushHandBack(push: { line: ParticipantRef | null; by: ParticipantRef | null }): { to: ParticipantRef[]; nobody: string | null } {
  const secretary = whoHoldsTheSecretaryCard()
  const card: ParticipantRef | null = secretary === null ? null : { kind: 'agent', id: secretary.id }
  const first = push.line ?? (push.by?.kind === 'agent' ? push.by : null)
  const to = [first, card].filter((one, at, all): one is ParticipantRef => one !== null && all.findIndex((other) => other?.id === one.id) === at)
  if (to.length > 0) return { to, nobody: null }
  const named = String(settingValue('MOLE_OFFICE_BUILD_SHERIFF') ?? '').trim()
  const sheriff = named === '' ? null : theOneAgentAStringNames(sqlite, named)
  if (sheriff !== null) return { to: [{ kind: 'agent', id: sheriff.id }], nobody: null }
  const why = named === '' ? 'MOLE_OFFICE_BUILD_SHERIFF names nobody' : `MOLE_OFFICE_BUILD_SHERIFF names ${named}, which is no one agent`
  return { to: [], nobody: `The push named no line, it was not an agent's, nobody holds the secretary card, and ${why}, so nobody was told.` }
}

export { thePushHandBackOf, type PushHandBackFacts }

/**
 * TELL AGAIN THAT A PUSH'S HAND-BACK IS OVERDUE: once, to those its hand-back would tell now, read by the same rule. The
 * office takes nothing back. The answer says who could not be told, or is empty.
 */
export function tellThatAPushHandBackIsOverdue(workspaceId: string, facts: PushHandBackFacts, says: string): string {
  const record = getRecord(facts.push)
  const by = record?.kind === EMERGENCY_PUSH_KIND ? ((record.data as { by?: ParticipantRef }).by ?? null) : null
  const { to, nobody } = whoIsToldOfAPushHandBack({ line: facts.line, by })
  if (to.length > 0) writeAMessage({ workspaceId, to, title: `Overdue: the hand-back of emergency push ${facts.push}`, body: says, aboutRun: null, actor: THE_OFFICE, onlyThem: true, notice: 'aPushHandBackIsOverdue' })
  return nobody === null ? '' : ` ${nobody}`
}

/**
 * THE PUSH HAND-BACKS NOBODY WAS TOLD OF, for the reminder before a secretary's next report. `after` adds one sentence
 * for each open one to what the reminder says; `markTold` records the secretary whose reminder said them, so each is
 * said once. A problem closed before then is not said.
 */
export function thePushHandBacksNobodyWasToldOf(): { after(says: string | null): string | null; markTold(secretary: string): void } {
  const rows = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.extra.emergencyPushNobodyTold.says') AS says FROM records WHERE kind = 'problem' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.state') = 'open' AND json_type(data, '$.extra.emergencyPushNobodyTold') = 'object' " +
        "AND json_type(data, '$.extra.emergencyPushNobodyTold.inAReminder') IS NULL ORDER BY rowid",
    )
    .all() as { id: string; says: string | null }[]
  return {
    after: (says) => rows.length === 0 ? says
      : [says, ...rows.map((row) => `Problem ${row.id} handed an emergency push's red back, and nobody was told: ${row.says ?? 'nobody recorded why.'}`)]
        .filter((one): one is string => one !== null).join(' '),
    markTold: (secretary) => {
      for (const row of rows) {
        const extra = getRecord(row.id)!.data['extra'] as Record<string, unknown>
        patchRecord(row.id, { dataPatch: { extra: { ...extra, emergencyPushNobodyTold: { ...(extra['emergencyPushNobodyTold'] as object), inAReminder: { at: nowStamp(), secretary } } } } }, THE_OFFICE)
      }
    },
  }
}
