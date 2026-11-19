// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY RELEASE'S FACTS, AS THIS OFFICE KEEPS THEM. The notice door reads them here and judges them by the one
 * rule in src/shared/stable-emergency.ts, which the release tool also uses. This file reads; it judges nothing. Whether
 * a revision is an authored original is the notice door's own check, so the door passes it in.
 */
import { sqlite } from '../../db/client.ts'
import { readGit } from '../resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { getRevisionRow } from '../get-revision-row.ts'
import { everyAgentAStoredStampCouldName, type Actor } from '../records.ts'
import { type RegisteredAgent } from '../participants.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { theRoleCards } from '../roles.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import type { StableEmergencyFollowUp, StableEmergencyReport, StableUpgradeOriginal } from '@shared/stable-upgrade-notices.ts'
import type { StableEmergencyMessage } from '@shared/stable-emergency.ts'

type Revision = ReturnType<typeof getRevisionRow>
type Authored = (row: Revision) => boolean

/**
 * THE GATE LIST, read by the same function that answers GET /api/office/gates. That function's route file imports the
 * records routes, which cannot load while the records library is still loading, and this file loads inside it. So the
 * notice routes hand that function over when the office builds its app, and an emergency release is never judged
 * without it.
 */
type GateList = (actor: Actor) => { classes: Array<{ groups: Array<{ rows: Array<{ id: string }> }> }> }
let theGateList: GateList | null = null
export function readTheGateListWith(reader: GateList): void { theGateList = reader }

/** The rows of the office's gate list for one gate, as the gates door reads them for this caller. */
export function theGateRows(actor: Actor, gate: string): unknown[] {
  if (theGateList === null) throw new Error('The notice door was asked about the emergency switch before the office handed it its gate list.')
  return theGateList(actor).classes.flatMap(one => one.groups.flatMap(group => group.rows)).filter(row => row.id === gate)
}

/** The order the office wrote a record's create row in, or null when it has none. */
export function theCreateOrder(recordId: string): number | null {
  const row = sqlite.prepare("SELECT append_order FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1").get(recordId) as { append_order: number | null } | undefined
  return row === undefined || !Number.isSafeInteger(row.append_order) ? null : row.append_order
}

/**
 * THE FOLLOW-UP RECEIPT, worked out on read: the first authored whole-suite receipt in this project, written after the
 * BEFORE, whose commit has the released commit as an ancestor and is itself on main. Green or red, it is the follow-up.
 * Git's exit 1 is its "no", and the next receipt is asked. Any other failure is "could not be checked", and no later
 * receipt is asked, because the one git could not answer may be the first.
 */
export function theFollowUp(project: string, before: string, toCommit: string, authored: Authored): StableEmergencyFollowUp {
  const after = theCreateOrder(before)
  if (after === null) return { state: 'unknown', because: "The emergency release's announcement has no place in the office's order." }
  const candidates = sqlite.prepare(`SELECT r.record_id AS id FROM revisions r JOIN changes c ON c.record_id = r.record_id AND c.op = 'create'
    JOIN records now ON now.id = r.record_id
    WHERE r.seq = 1 AND r.op = 'create' AND r.kind = 'whole_suite_receipt' AND r.workspace_id = ? AND now.deleted_at IS NULL
    AND c.append_order > ? ORDER BY c.append_order`).all(project, after) as { id: string }[]
  for (const { id } of candidates) {
    const row = getRevisionRow(id, 1)
    if (!authored(row)) continue
    let receipt: ReturnType<typeof parseWholeSuiteReceipt>
    try { receipt = parseWholeSuiteReceipt(row.data) } catch {
      return { state: 'unknown', because: `Whole-suite receipt ${id} could not be read as a receipt.` }
    }
    const answer = (args: string[]): boolean | string => {
      try { readGit(receipt.repository, ['merge-base', '--is-ancestor', ...args]); return true } catch (error) {
        return (error as { status?: unknown }).status === 1 ? false : whyGitDidNotAnswer(error)
      }
    }
    const contains = answer([toCommit, receipt.commit])
    const onMain = contains === true ? answer([receipt.commit, 'refs/heads/main']) : contains
    if (typeof onMain === 'string') {
      return { state: 'unknown', because: `Git could not tell whether whole-suite receipt ${id} contains the released commit and is on main: ${onMain.slice(0, 800)}.` }
    }
    if (onMain) return { state: 'filed', receipt: { id, seq: 1, contentHash: row.contentHash }, commit: receipt.commit, green: wholeSuiteReceiptIsGreen(receipt) }
  }
  return { state: 'missing' }
}

/** THE REPORT about an emergency release: a report in this project linked "about" its BEFORE, the first one linked. */
export function theReport(project: string, before: string): StableEmergencyReport {
  const row = sqlite.prepare(`SELECT r.id FROM links l JOIN records r ON r.id = l.from_id
    WHERE l.type = 'about' AND l.to_id = ? AND r.kind = 'report' AND r.workspace_id = ? AND r.deleted_at IS NULL
    ORDER BY l.rowid LIMIT 1`).get(before, project) as { id: string } | undefined
  return row === undefined ? { state: 'missing' } : { state: 'filed', id: row.id }
}

/**
 * THE EMERGENCY MESSAGE'S ORIGINAL, or null when it is not there or was deleted. A pin whose revision is another is
 * answered as such, and the notice door refuses it. Its writer must be an authored original's agent who holds the
 * secretary card now; its order is its create row's.
 */
export function theEmergencyMessage(pin: StableUpgradeOriginal, authored: Authored): StableEmergencyMessage | null | 'another-revision' {
  let row: Revision
  try { row = getRevisionRow(pin.id, pin.seq) } catch { return null }
  if (row.kind !== 'message' || row.contentHash !== pin.contentHash) return 'another-revision'
  const now = sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').get(pin.id) as { deleted_at: string | null } | undefined
  if (now === undefined || now.deleted_at !== null) return null
  const writer = row.actorType === 'agent' ? everyAgentAStoredStampCouldName(row.actorId) : []
  const agent = writer.length === 1 ? readParticipant({ kind: 'agent', id: writer[0]!.id }) as RegisteredAgent | null : null
  const bySecretary = authored(row) && agent !== null && agent.role === theRoleCards().elevation.onlyThisCardCanHoldIt && agent.retired !== true
  const data = row.data as Record<string, unknown>
  return { id: pin.id, bySecretary, to: data['to'], body: data['body'], order: theCreateOrder(pin.id) }
}
