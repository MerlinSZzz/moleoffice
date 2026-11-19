// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read the recorded act that set the current explicit problem state, one revision per request. */
import { readReceiptEvidenceObject } from './stable/stable-upgrade-evidence.mjs'
import { withoutKeys } from './office-request.mjs'

export class FixRoundPersonStop extends Error {
  constructor(act) {
    super(`ACT: problem ${act.problem}, revision ${act.seq} (${act.contentHash}), recorded ${act.who.actorType} ${act.who.actorId} at ${act.at}, set state ${act.state}.`)
    this.code = 'MAIN_SUITE_PERSON_STOP'
    this.act = act
  }
}

export async function readFixRoundPersonStop(problem, { officeRequest }) {
  const read = path => readReceiptEvidenceObject(officeRequest, path)
  const path = `/api/records/${problem}`
  const held = await read(path), state = held.record?.data?.state
  if (!['accepted', 'worked_around', 'fixed'].includes(state)) return null
  const refuse = () => { throw new Error(withoutKeys('The explicit problem resolution has unavailable or changing state provenance. No automation action was taken.')) }
  if (!Number.isSafeInteger(held.revisionSeq) || held.revisionSeq < 1) refuse()
  let revision = await read(`${path}/revisions/${held.revisionSeq}`)
  if (revision.contentHash !== held.version || revision.content?.data?.state !== state) refuse()
  for (let reads = 0; ; reads++) {
    if (reads >= 1000 || !Number.isSafeInteger(revision.seq)) refuse()
    if (revision.seq === 1) break
    const previous = await read(`${path}/revisions/${revision.seq - 1}`)
    if (previous.seq !== revision.seq - 1) refuse()
    if (previous.content?.data?.state !== state) break
    revision = previous
  }
  if ((await read(path)).version !== held.version) refuse()
  // This is a stored ledger stamp, never the latest prose writer or an arriving identity header.
  if (revision.who?.actorType !== 'human') return null
  if (typeof revision.who.actorId !== 'string' || !revision.who.actorId || revision.op === 'baseline') refuse()
  return { problem, state, seq: revision.seq, contentHash: revision.contentHash, who: revision.who, at: revision.at }
}
