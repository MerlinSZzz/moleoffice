// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CREDENTIAL USED WITH OTHER FACTS IS REPORTED TO THE AGENT'S SUPERIOR, by a
 * decision. It answers the facts half of Q2: record the mismatch, refuse nothing
 * because of it, and tell an
 * agent above that agent rather than the person. The untrusted-machine half remains open under
 * proposal b0CW38puqgff. No setting or flag repeats what the office's own earlier message says.
 */
import { and, isNull, sql } from 'drizzle-orm'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { FACTS_COMPARED, credentialPagePath, isAPersonsDeviceCredential, type FactMismatch, type VisitorCredential } from '@shared/visitors.ts'
import { db } from '../db/client.ts'
import { records, STORED_FIELDS } from '../db/schema.ts'
import { theAgentWhoTakesTheDeadLetters } from './dead-letter-secretary.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theRowThisCredentialAlreadyHas } from './participants.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import type { Actor } from './records.ts'
import { theRungsOfTheRoutingWalk } from './superiors.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** Who is told, and why. Both routes return agents by construction; the person is never a recipient. */
export function whoIsToldAboutACredentialMismatch(credential: VisitorCredential): { to: ParticipantRef | null; reason: string } {
  if (isAPersonsDeviceCredential(credential)) {
    return { to: null, reason: "this is a person's device credential, and the decision is about an agent" }
  }
  const agent = theRowThisCredentialAlreadyHas(credential.id)
  if (agent !== null) {
    const above = theRungsOfTheRoutingWalk({ kind: 'agent', id: agent.id }, theStarterEachStringNames()).rungs
      .find(rung => !rung.row.retired && rung.row.id !== agent.id)
    if (above !== undefined) {
      return { to: above.who, reason: 'you are the nearest agent above that agent in its chain of starters' }
    }
  }
  const secretary = theAgentWhoTakesTheDeadLetters()
  if (secretary !== null && secretary.id !== agent?.id) {
    return { to: secretary, reason: 'no agent above could be told, and you are the secretary who takes the dead letters' }
  }
  return {
    to: null,
    reason: secretary === null
      ? 'no agent above could be told, and no secretary who takes the dead letters is named'
      : "no agent above could be told, and the secretary who takes the dead letters is the credential's own agent",
  }
}

/**
 * Say each different mismatch once on this credential. Read only office messages changed since
 * issue, as theLineThatReminded does, so no separate flag can disagree with the line itself.
 * Duplicate requests cost one indexed message read; only a new mismatch needs the recipient reads
 * and the write. With nobody to tell, nothing is written and a later request can try again.
 */
export function tellTheSuperiorAboutACredentialMismatch(
  credential: VisitorCredential,
  mismatch: readonly FactMismatch[],
  refusedBecause: string | null,
  workspaceId: string,
): string | null {
  const key = JSON.stringify(FACTS_COMPARED.flatMap(fact =>
    mismatch.filter(one => one.said === fact.said).map(one => [fact.key, one.issued, one.sent]),
  ))
  const earlier = db.select({ id: records.id }).from(records).where(and(
    // Through records_updated_idx; the + keeps SQLite off the other indexes, as in before-the-seal.
    sql`${records.updatedAt} >= ${credential.issuedAt}`,
    sql`+${records.kind} = 'message'`,
    sql`+${STORED_FIELDS.messageSentById(records.data)} = ${moleOffice().id}`,
    sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`,
    isNull(records.deletedAt),
    sql`json_extract(${records.data}, '$.extra.credentialMismatch.credential') = ${credential.id}`,
    sql`json_extract(${records.data}, '$.extra.credentialMismatch.key') = ${key}`,
  )).limit(1).all()
  if (earlier.length > 0) return null

  const recipient = whoIsToldAboutACredentialMismatch(credential)
  if (recipient.to === null) return null
  const facts = mismatch.map(one => `${one.said}: issued ${one.issued ?? 'nothing'}, sent ${one.sent ?? 'nothing'}.`).join(' ')
  const answered = refusedBecause === null
    ? 'The request was answered.'
    : `The request was refused for another reason: ${refusedBecause}`
  const said = `Credential ${credential.id} (${credential.handle}) was used with facts that differ from the ones it was issued with. ${facts} ${answered}` +
    ' A mismatch does not refuse a request; it is recorded and counted on the credential.' +
    ` You are told because ${recipient.reason}. Check whether this was the agent you answer for.` +
    ' Only the person can end a credential; if it was not that agent, report it up.' +
    ' This is said once for each different mismatch on this credential.'
  return writeASystemLineToOne(
    recipient.to, workspaceId, SYSTEM_LINES.aCredentialWasUsedWithOtherFacts(said), theOffice(), undefined,
    { credentialMismatch: { credential: credential.id, key } },
    { target: { kind: 'page', route: credentialPagePath(credential.id) } },
  ).id
}
