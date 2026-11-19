// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Read the exact release authority. This module opens no database. Its writes are counts: of a refused release, and of
 * the use of the emergency switch.
 */
import { isDeepStrictEqual as same } from 'node:util'
import { versionOf } from '../../src/server/lib/version.ts'
import { clockStamp, momentOfAnInstant, uniqueMomentOfStoredStampInZone } from '../../src/shared/time.ts'
import {
  STABLE_RELEASE_EXCEPTION_MINUTES, STABLE_RELEASE_AUTHORIZATION, STABLE_RELEASE_BASELINE,
  stableReleaseAuthorizationSchema, stableReleaseBaselineSchema,
} from '../../src/shared/stable-release-policy.ts'
import { gateNamed, gateValueIsAllowed } from '../../src/config/gates.mjs'
import {
  stableEmergencyBeforeText, stableEmergencyNoticeEventSchema, stableUpgradeApprovalSchema, stableUpgradeNoticeEventSchema, stableUpgradeOutcomeText,
} from '../../src/shared/stable-upgrade-notices.ts'
import {
  STABLE_EMERGENCY_GATE, stableEmergencySwitchRowSchema, theEmergencyMessageRefusal, theEmergencySwitchRefusal, whatAnEmergencyStillOwes,
} from '../../src/shared/stable-emergency.ts'
import { stableOfficeHistoryPageSchema } from '../../src/shared/stable-bootstrap-notices.ts'
import {
  JUDGEMENT_REFUSALS, RECEIPT_JUDGEMENT, receiptJudgementSchema, theFileAProblemKeeps, theJudgementPinIn, whyTheJudgementDoesNotStand,
} from '../../src/shared/receipt-judgement.ts'
import { writtenInOf } from '../../src/shared/messages.ts'
import { MESSAGE_CENTRE } from '../../src/shared/workspaces.ts'
import { A_KEY_SHOWN_AS } from '../office-request.mjs'
import { THE_OFFICES_ROW, theOfficesIdIn } from './stable-upgrade-notices.mjs'
import { THE_LONGEST_RECEIPT_REPLY } from './stable-upgrade-evidence.mjs'

const fail = words => { throw new Error(`Release policy refused: ${words}`) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)
const AUTHORITY = 'The pinned note lacks active authenticated secretary authority.'
const ORIGINAL = 'The baseline is not a matching original completed AFTER.'
const WINDOW = 'The authorization validity window does not cover this check.'
const FILING = 'The baseline filing time is unavailable, ambiguous or future.'
const WHOLE = "The office's release history could not be read whole."

/**
 * Every read the release check makes goes through here, so a cut answer is named as a cut on each of them. `longestReply`
 * is handed to the request helper and never sent. The read of the gate list raises it, and so do the reads of a judged
 * receipt and of its judgement.
 */
async function answer(officeRequest, path, longestReply) {
  let reply
  try { reply = await officeRequest({ method: 'GET', path, ...(longestReply === undefined ? {} : { longestReply }) }) } catch { fail(`GET ${path} was inaccessible.`) }
  // The request helper hands back at most 60,000 characters, or the longer limit a read raises. A longer answer is cut,
  // which is not the office refusing.
  if (reply?.cut === true) fail(`The office's answer to ${path} was cut, so the release check cannot read it whole.`)
  return reply
}

/** With `absent`, a 404 answers null: the office says nothing is there. */
async function read(officeRequest, path, { absent = false, longestReply } = {}) {
  const reply = await answer(officeRequest, path, longestReply)
  if (absent && object(reply) && reply.status === 404 && reply.cut === false) return null
  if (!object(reply) || reply.status !== 200 || reply.cut !== false || reply.location !== null ||
      typeof reply.body !== 'string' || reply.body.includes(A_KEY_SHOWN_AS)) fail(`GET ${path} was inaccessible, partial, masked or redirected.`)
  let value
  try { value = JSON.parse(reply.body) } catch { fail(`GET ${path} did not return complete JSON.`) }
  if (!object(value) || (value.narrowedByPermission !== undefined && value.narrowedByPermission !== null) ||
      value.truncated === true || value.partial === true) fail(`GET ${path} was partial or unavailable.`)
  return value
}

function identifies(revision, pin, kind) {
  const content = revision?.content
  return revision?.recordId === pin.id && revision.seq === pin.seq && revision.contentHash === pin.contentHash &&
    object(content) && content.kind === kind && typeof content.title === 'string' &&
    (content.summary === null || typeof content.summary === 'string') && object(content.data) && content.deletedAt === null &&
    versionOf(content) === pin.contentHash
}
function authenticated(revision, original = false) {
  const who = revision?.who
  return object(who) && who.actorType === 'agent' && id(who.actorId) && id(who.resolvedAgentId) && id(who.sessionId) &&
    revision.provedBy === 'an-agent-key' && (revision.provedHolder === null || revision.provedHolder === who.resolvedAgentId) &&
    (original ? revision.seq === 1 && revision.op === 'create' : ['create', 'update'].includes(revision.op))
}
function currentRecord(value, pin, kind, project) {
  const row = value?.record
  // Project placement is current scope: the store re-stamps it when a record moves. A message is kept in the message
  // centre, where its current mark says the project it was written in; a message never moves.
  const placed = kind === 'message'
    ? row?.workspaceId === MESSAGE_CENTRE && object(row.data) && writtenInOf(row.data)?.project === project
    : row?.workspaceId === project
  return object(row) && row.id === pin.id && placed && row.kind === kind && row.origin === 'authored' && row.deletedAt === null
}
async function revision(officeRequest, pin, kind) {
  if (!stableUpgradeApprovalSchema.safeParse(pin).success) fail('Name an exact pinned revision.')
  const row = await read(officeRequest, `/api/records/${pin.id}/revisions/${pin.seq}`)
  if (!identifies(row, pin, kind)) fail('The pinned revision identity or content hash does not match.')
  return row
}
async function participant(officeRequest, actorId) {
  const answer = await read(officeRequest, `/api/participants/agent/${actorId}`)
  // The revision API resolves stored stamps. Ask only by that canonical id; arriving collisions may refuse.
  return object(answer.participant) && answer.participant.id === actorId ? answer.participant : null
}
async function note(officeRequest, pin, project, authorizingCard) {
  const pinned = await revision(officeRequest, pin, 'note')
  const current = await read(officeRequest, `/api/records/${pin.id}`)
  const original = pin.seq === 1 ? pinned : await read(officeRequest, `/api/records/${pin.id}/revisions/1`)
  const originalPin = { id: pin.id, seq: 1, contentHash: original.contentHash }
  if (!currentRecord(current, pin, 'note', project) || !authenticated(pinned) || !authenticated(original, true) ||
      !identifies(original, originalPin, 'note')) fail(AUTHORITY)
  const author = await participant(officeRequest, pinned.who.resolvedAgentId)
  const creator = original.who.resolvedAgentId === pinned.who.resolvedAgentId ? author : await participant(officeRequest, original.who.resolvedAgentId)
  if (!author || author.role !== authorizingCard || author.retired !== false || !creator) fail(AUTHORITY)
  return pinned
}

async function event(officeRequest, pin, project) {
  const reply = await answer(officeRequest, THE_OFFICES_ROW)
  let office
  try { office = theOfficesIdIn(reply) } catch (error) { fail(error.message) }
  const row = await revision(officeRequest, pin, 'message')
  const current = await read(officeRequest, `/api/records/${pin.id}`)
  const data = row.content.data
  // Version 1 is an upgrade and version 4 an emergency release. Both read the same way here.
  const one = stableUpgradeNoticeEventSchema.safeParse(data.extra?.stableUpgradeNotice)
  const parsed = one.success ? one : stableEmergencyNoticeEventSchema.safeParse(data.extra?.stableUpgradeNotice)
  if (!currentRecord(current, pin, 'message', project) || !authenticated(row, true) || !parsed.success ||
      parsed.data.project !== project || data.sentBy?.kind !== 'agent' || data.sentBy.id !== office ||
      data.notice !== 'stableUpgradeNotice' || data.writtenIn?.project !== project ||
      !Array.isArray(data.to) || data.to.length !== 1 || data.to[0]?.kind !== 'person' || !id(data.to[0]?.id) ||
      !(await participant(officeRequest, row.who.resolvedAgentId))) fail(ORIGINAL)
  return { row, event: parsed.data }
}

/** Original completed message, paired original BEFORE, exact earlier approval and literal outcome text. */
async function completedOriginal(officeRequest, pin, project) {
  const after = await event(officeRequest, pin, project)
  const request = after.event.request
  if (request.stage !== 'after' || request.outcome.state !== 'completed') fail(ORIGINAL)
  const before = await event(officeRequest, request.before, project)
  if (before.event.request.stage !== 'before' || before.event.version !== after.event.version) fail(ORIGINAL)
  const announcement = before.event.request.announcement
  const verified = request.outcome.verification
  // An emergency release has no receipt on either side, and its BEFORE carries the emergency line above the notice.
  const words = before.event.version === 4 ? stableEmergencyBeforeText(announcement) : announcement.notice
  if (verified.serving.commit !== announcement.toCommit || !same(verified.evidence, announcement.evidence) ||
      before.row.content.data.body !== words || after.row.who.resolvedAgentId !== before.row.who.resolvedAgentId) fail(ORIGINAL)
  // Historical text needs its original note pin, not a fresh approval or today's role assignment.
  const priorNote = await revision(officeRequest, announcement.noticeApproval, 'note')
  const priorPolicy = priorNote.content.data.extra?.[STABLE_RELEASE_AUTHORIZATION]
  if ((priorPolicy !== undefined && !stableReleaseAuthorizationSchema.safeParse(priorPolicy).success) ||
      priorNote.content.data.body !== announcement.notice ||
      after.row.content.data.body !== stableUpgradeOutcomeText(request, announcement, priorPolicy !== undefined)) fail(ORIGINAL)
  return { after, before, announcement, verified }
}

/** One page of the office's history, refused with `words` unless its counts say that no row was left out unsaid. */
async function historyPage(officeRequest, cursor, words) {
  const path = `/api/office/upgrades?limit=25${cursor === null ? '' : `&before=${encodeURIComponent(cursor)}`}`
  const parsed = stableOfficeHistoryPageSchema.safeParse(await read(officeRequest, path))
  if (!parsed.success) fail(words)
  const page = parsed.data
  const more = page.older === null ? 0 : 1
  if (page.subtraction.carried !== page.entries.length || page.subtraction.shortened !== 0 ||
      page.subtraction.leftOut !== more || page.subtraction.candidates !== page.entries.length + more ||
      page.leftOutGroups.length !== more || (more && (page.entries.length === 0 || page.leftOutGroups[0].count !== 1))) fail(words)
  return page
}

/** History orders original BEFORE filings. Read through failed attempts without changing the success clock. */
async function latestBaseline(officeRequest, source, completed, project, serving) {
  let cursor = null
  const cursors = new Set(), seen = new Set()
  for (;;) {
    const page = await historyPage(officeRequest, cursor, ORIGINAL)
    for (const row of page.entries) {
      if (seen.has(row.before.id)) fail(ORIGINAL)
      seen.add(row.before.id)
      if (row.kind === 'first-handoff') continue
      if (row.outcome !== 'completed') continue
      if (row.after === null) fail(ORIGINAL)
      const selected = source !== null && same(row.after, source.after)
      const original = selected ? completed : await completedOriginal(officeRequest, row.after, project)
      const a = original.announcement
      if (!same(row.before, original.after.event.request.before) || row.tag !== a.candidateTag || row.baselineTag !== a.baselineTag ||
          row.toCommit !== a.toCommit || row.fromCommit !== a.fromCommit || row.tree !== a.tree || row.notice !== a.notice ||
          row.date !== original.before.event.date || row.outcomeDate !== original.after.event.date) fail(ORIGINAL)
      if (selected) return original
      const install = original.verified.serving
      if (install.repository === serving.repository && install.database === serving.database && install.port === serving.port) {
        if (source === null) return original
        fail(ORIGINAL)
      }
    }
    if (page.older === null) {
      if (source === null) return null
      fail(ORIGINAL)
    }
    if (cursors.has(page.older)) fail(ORIGINAL)
    cursors.add(page.older)
    cursor = page.older
  }
}

/** Every row of the office's history, newest BEFORE first, each read once. */
async function wholeHistory(officeRequest) {
  const rows = [], cursors = new Set(), seen = new Set()
  for (let cursor = null; ;) {
    const page = await historyPage(officeRequest, cursor, WHOLE)
    for (const row of page.entries) {
      if (seen.has(row.before.id)) fail(WHOLE)
      seen.add(row.before.id)
      rows.push(row)
    }
    if (page.older === null) return rows
    if (cursors.has(page.older)) fail(WHOLE)
    cursors.add(page.older)
    cursor = page.older
  }
}

async function established(officeRequest, policy, project, authorizingCard) {
  const source = policy.baselineSource
  if (source.kind === 'bootstrap') {
    const pinned = await note(officeRequest, source.note, project, authorizingCard)
    const parsed = stableReleaseBaselineSchema.safeParse(pinned.content.data.extra?.[STABLE_RELEASE_BASELINE])
    if (!parsed.success || parsed.data.baselineTag !== policy.baselineTag || !same(parsed.data.serving, policy.serving)) {
      fail('The baseline attestation does not match the serving baseline.')
    }
    const at = momentOfAnInstant(parsed.data.establishedAt)
    const filed = uniqueMomentOfStoredStampInZone(pinned.at, policy.timeZone)
    if (at === null || filed === null) fail(FILING)
    const latest = await latestBaseline(officeRequest, null, null, project, policy.serving)
    if (latest !== null) {
      const prior = uniqueMomentOfStoredStampInZone(latest.after.row.at, policy.timeZone)
      if (prior === null) fail(FILING)
      if (at <= prior || filed <= prior) fail('The baseline attestation must follow the latest completed release.')
    }
    if (filed < at) fail('The baseline attestation was filed before its establishment.')
    return { at, filed }
  }
  const completed = await completedOriginal(officeRequest, source.after, project)
  if (completed.announcement.candidateTag !== policy.baselineTag || completed.announcement.toCommit !== policy.fromCommit ||
      !same(completed.verified.serving, policy.serving)) fail(ORIGINAL)
  await latestBaseline(officeRequest, source, completed, project, policy.serving)
  const at = uniqueMomentOfStoredStampInZone(completed.after.row.at, policy.timeZone)
  return { at, filed: at }
}

const JUDGEMENT_REVISIONS = "The judgement's revisions could not be read."

/**
 * THE JUDGEMENT THE AUTHORIZATION NOTE PINS (wave 13q item 6), read from the office and judged by the one rule in
 * src/shared/receipt-judgement.ts, which the office's notice door asks as well. `noteRevision` is the note's pinned
 * revision, already read; `receipt` is the receipt's original data. The decision is still to come at every check, so a
 * delete since the pin and the problems are read as they are now. Null when the note pins no judgement; otherwise the
 * pin, after any refusal was thrown.
 */
async function theJudgement(officeRequest, noteRevision, evidence, receipt, project) {
  const found = theJudgementPinIn(noteRevision.content.data.extra)
  if (found === null) return null
  if (found.refused !== undefined) fail(found.refused)
  const pin = found.pin
  // The judgement door keeps each file's verdict and reason twice, in the note's body and in its extra, so a judgement of
  // many files is longer than the default reply. Its revision, its current record and its revision list, which carries
  // what each change replaced, are read at a receipt's reply length. A problem it names is read at the default.
  const at = await read(officeRequest, `/api/records/${pin.id}/revisions/${pin.seq}`, { absent: true, longestReply: THE_LONGEST_RECEIPT_REPLY })
  const current = at === null ? null : await read(officeRequest, `/api/records/${pin.id}`, { absent: true, longestReply: THE_LONGEST_RECEIPT_REPLY })
  const pinned = at !== null && current !== null && at.recordId === pin.id && at.seq === pin.seq && at.contentHash === pin.contentHash &&
    object(at.content) && object(at.content.data) && versionOf(at.content) === pin.contentHash && current.record?.workspaceId === project
    ? { kind: at.content.kind, extra: at.content.data.extra } : null
  let revisions = []
  if (pinned !== null) {
    const listing = await read(officeRequest, `/api/records/${pin.id}/revisions`, { longestReply: THE_LONGEST_RECEIPT_REPLY })
    if (!Array.isArray(listing.revisions) || !listing.revisions.every(one => object(one) && object(one.who))) fail(JUDGEMENT_REVISIONS)
    revisions = listing.revisions.map(one => ({ seq: one.seq, op: one.op, who: one.who, provedBy: one.provedBy, provedHolder: one.provedHolder }))
  }
  const kept = receiptJudgementSchema.safeParse(object(pinned?.extra) ? pinned.extra[RECEIPT_JUDGEMENT] : undefined)
  const problems = new Map()
  for (const one of kept.success ? kept.data.verdicts : []) {
    const problem = await read(officeRequest, `/api/records/${one.problem}`, { absent: true })
    problems.set(one.problem, theFileAProblemKeeps(object(problem?.record) ? problem.record : null, project))
  }
  const judge = authenticated(noteRevision) ? noteRevision.who.resolvedAgentId : null
  const why = whyTheJudgementDoesNotStand({ pin, evidence, receipt },
    { pinned, revisions, judge, now: { deleted: current === null || current.record?.deletedAt !== null, problems } })
  if (why !== null) fail(why)
  return { ...pin }
}

/**
 * Whether the authorization note pins a judgement that lets this receipt in. The upgrade evidence check asks it for a
 * receipt that is not green; null when the note pins none.
 */
export async function theJudgementThatStands(officeRequest, noticeApproval, original) {
  const project = officeRequest?.identity?.project
  if (!id(project)) fail('The authenticated project identity is unavailable.')
  const pinned = await revision(officeRequest, noticeApproval, 'note')
  return theJudgement(officeRequest, pinned, { id: original.recordId, seq: original.seq, contentHash: original.contentHash }, original.content.data, project)
}

/** The receipt's original data, for the judgement: the evidence check verified the rest of it. */
async function theReceiptJudged(officeRequest, evidence) {
  // As long an answer as every receipt-evidence read.
  const original = await read(officeRequest, `/api/records/${evidence.id}/revisions/1`, { longestReply: THE_LONGEST_RECEIPT_REPLY })
  if (evidence.seq !== 1 || original.recordId !== evidence.id || original.seq !== 1 || original.contentHash !== evidence.contentHash ||
      original.content?.kind !== 'whole_suite_receipt' || !object(original.content.data)) fail('The pinned revision identity or content hash does not match.')
  return original.content.data
}

const GATE_LIST = "The office's gate list could not be read as classes, groups and rows."
/**
 * The most of an older office's whole gate list the release check reads. The whole list is longer than the request
 * helper hands back by default, and this read takes one row from it, so it must be read whole.
 */
export const THE_LONGEST_GATE_LIST = 1_000_000
/**
 * THE OFFICE'S ROWS FOR ONE GATE. The gate door answers that one row when it is asked with ?gate=. An office older than
 * that ignores the query and answers its whole list, so the read raises its limit to THE_LONGEST_GATE_LIST and takes the
 * row from the whole list. A cut answer is refused either way, and never read in part.
 */
async function gateRows(officeRequest, gateId) {
  const path = `/api/office/gates?gate=${encodeURIComponent(gateId)}`
  const list = await read(officeRequest, path, { longestReply: THE_LONGEST_GATE_LIST })
  if (list.classes === undefined && object(list.row)) {
    if (list.row.id !== gateId) fail(`The office answered GET ${path} with the row of another gate.`)
    return { list, rows: [list.row] }
  }
  if (!Array.isArray(list.classes)) fail(GATE_LIST)
  const rows = []
  for (const one of list.classes) {
    if (!object(one) || !Array.isArray(one.groups)) fail(GATE_LIST)
    for (const group of one.groups) {
      if (!object(group) || !Array.isArray(group.rows) || !group.rows.every(object)) fail(GATE_LIST)
      rows.push(...group.rows.filter(row => row.id === gateId))
    }
  }
  return { list, rows }
}

/**
 * THE SPACING BETWEEN STABLE RELEASES IS THE OFFICE'S NUMBER, read from its gate list (round E, way 1). A row this tool
 * cannot read, or a number its own declaration does not allow, is refused and named, never changed to fit. A list that
 * answers without the row comes from an office older than this tool, which then uses its own default for that kind of
 * office and says so.
 */
async function theSpacing(officeRequest) {
  const gate = gateNamed('release-spacing')
  if (gate.positions.kind !== 'number') fail('This tool declares the spacing between stable releases without a number.')
  const { list, rows } = await gateRows(officeRequest, gate.id)
  if (rows.length > 1) fail("The office's gate list has more than one row for the spacing between stable releases, so this tool cannot tell which one decides.")
  const [row] = rows
  if (row === undefined) {
    const kind = list.office?.kind
    const column = kind === 'builds-mole-office' ? 'buildsMoleOffice' : kind === 'ordinary' ? 'ordinary' : null
    if (column === null) fail("The office's gate list has no row for the spacing between stable releases, and it does not say which kind of office it is, so this tool cannot choose its default.")
    const minutes = Number(gate.defaults[column])
    return { minutes, from: 'this-tools-default', says: `The office's gate list has no row for the spacing between stable releases, so the office is older than this tool. This tool used its own default for this kind of office: ${minutes} minutes.` }
  }
  if (typeof row.unreadable === 'string') fail(`The office could not read its spacing between stable releases, so this tool cannot use it: ${row.unreadable}`)
  if (row.unreadable !== null) fail(GATE_LIST)
  if (typeof row.value !== 'string' || !gateValueIsAllowed(gate, row.value)) {
    fail(`The office gives the spacing between stable releases as ${JSON.stringify(row.value)}, which this tool's own declaration does not allow: a whole number of minutes from ${gate.positions.fewest} to ${gate.positions.most}. It was not changed to fit.`)
  }
  const minutes = Number(row.value)
  return { minutes, from: 'the-office', says: `The office gives the spacing between stable releases as ${minutes} minutes.` }
}

/** One count, sent once, as the merge tool sends its counts. `what` names what was counted; a count the office did not take is said. */
async function countAGateMet(id, position, officeRequest, what = 'this refusal') {
  let reply
  try { reply = await officeRequest({ method: 'POST', path: `/api/office/gates/${id}/met`, body: { position } }) }
  catch (error) { return `The office did not count ${what}: ${error instanceof Error ? error.message : String(error)}` }
  if (reply?.status === 200) return `The office counted ${what}.`
  let said
  try { said = JSON.parse(reply.body).error } catch { said = undefined }
  return `The office did not count ${what} (${reply?.status ?? 'no status'}): ${typeof said === 'string' ? said : 'its answer gave no reason.'}`
}

/** The one count of the emergency switch's use, sent once after the release's BEFORE was filed. */
export async function countTheEmergencyUse(officeRequest) {
  return countAGateMet('stable-emergency', '1', officeRequest, 'this use of the emergency switch')
}

/** The order the office wrote a record's create row in, or null when the reply does not carry it. */
function createOrder(value, recordId) {
  const changes = Array.isArray(value?.changes) ? value.changes : []
  const created = changes.filter(change => object(change) && change.recordId === recordId && change.op === 'create')
  return created.length === 1 && Number.isSafeInteger(created[0].appendOrder) ? created[0].appendOrder : null
}

/**
 * THE EMERGENCY FACTS, read from the office and judged by the one rule in src/shared/stable-emergency.ts: the switch,
 * the message, and what earlier emergency releases still owe. `ownBefore` is this release's own BEFORE when the check
 * runs again after it was filed; that row is not an earlier release. Returns the pins the BEFORE carries.
 */
async function theEmergency(officeRequest, policy, authorizingCard, ownBefore) {
  const history = await wholeHistory(officeRequest)
  const earlier = history.filter(row => row.kind === 'emergency' && !(ownBefore !== undefined && same(row.before, ownBefore)))
  // THE NEWEST COMPLETED RELEASE is the completed AFTER the office wrote last, of any kind, the first handoff included.
  let newestCompleted = null
  for (const row of history) {
    if (row.outcome !== (row.kind === 'first-handoff' ? 'handed-off' : 'completed')) continue
    const order = row.after === null ? null : createOrder(await read(officeRequest, `/api/records/${row.after.id}`), row.after.id)
    if (order === null) fail("The newest completed release's place in the office's order could not be read.")
    newestCompleted = newestCompleted === null ? order : Math.max(newestCompleted, order)
  }
  const { rows } = await gateRows(officeRequest, STABLE_EMERGENCY_GATE)
  if (rows.length === 0) fail("The office's gate list has no row for the emergency switch, so the office is older than this tool. An emergency release needs an office that has it.")
  if (rows.length > 1) fail("The office's gate list has more than one row for the emergency switch, so this tool cannot tell which one decides.")
  const row = stableEmergencySwitchRowSchema.safeParse(rows[0])
  if (!row.success) fail("The office's gate list row for the emergency switch could not be read.")
  const switched = theEmergencySwitchRefusal(row.data, { newestCompleted,
    spent: change => earlier.some(one => one.emergency.throw.change === change),
    momentOf: stamp => uniqueMomentOfStoredStampInZone(stamp, policy.timeZone) })
  if (switched !== null) fail(switched)
  const owner = await read(officeRequest, '/api/office/owner')
  if (!id(owner.id)) fail('The office did not say who its owner is.')
  const told = theEmergencyMessageRefusal(await theMessage(officeRequest, policy.message, authorizingCard), { owner: owner.id,
    commit: policy.toCommit, newestCompleted, pinned: message => earlier.some(one => one.emergency.message.id === message) })
  if (told !== null) fail(told)
  for (const one of earlier) {
    const owes = whatAnEmergencyStillOwes({ tag: one.tag, outcome: one.outcome, followUp: one.emergency.followUp, report: one.emergency.report })
    if (owes !== null) fail(owes)
  }
  const last = row.data.lastChange
  return { throw: { change: last.id, appendOrder: last.appendOrder }, message: { ...policy.message } }
}

/** The emergency message's original as the office keeps it, or null when it is not there or was deleted. */
async function theMessage(officeRequest, pin, authorizingCard) {
  const original = await read(officeRequest, `/api/records/${pin.id}/revisions/${pin.seq}`, { absent: true })
  if (original === null) return null
  if (!identifies(original, pin, 'message')) fail('The pinned revision identity or content hash does not match.')
  const current = await read(officeRequest, `/api/records/${pin.id}`, { absent: true })
  if (current === null || current.record?.id !== pin.id || current.record.deletedAt !== null) return null
  const writer = authenticated(original, true)
    ? await read(officeRequest, `/api/participants/agent/${original.who.resolvedAgentId}`, { absent: true }) : null
  const bySecretary = object(writer?.participant) && writer.participant.id === original.who.resolvedAgentId &&
    writer.participant.role === authorizingCard && writer.participant.retired === false
  return { id: pin.id, bySecretary, to: original.content.data.to, body: original.content.data.body, order: createOrder(current, pin.id) }
}

/**
 * Test-only now defaults to Date.now. Every invocation rereads pins and active authority. `ownBefore` is the release's
 * own BEFORE, when an emergency release checks again after filing it.
 */
export async function verifyStableReleasePolicy({ config, baseline, tree }, { officeRequest, now = Date.now, ownBefore = undefined }) {
  const project = officeRequest?.identity?.project
  if (!id(project)) fail('The authenticated project identity is unavailable.')
  const roles = await read(officeRequest, '/api/roles')
  const authorizingCard = roles.elevation?.rule?.onlyThisCardCanHoldIt
  if (typeof authorizingCard !== 'string' || !authorizingCard.trim()) fail(AUTHORITY)
  const pinned = await note(officeRequest, config.noticeApproval, project, authorizingCard)
  const parsed = stableReleaseAuthorizationSchema.safeParse(pinned.content.data.extra?.[STABLE_RELEASE_AUTHORIZATION])
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => ['validFrom', 'validUntil'].includes(issue.path[0]))) fail(WINDOW)
    fail('The pinned note has no valid release authorization.')
  }
  const policy = parsed.data
  // Each side says alone whether this is an emergency release, and each mismatch is refused on its own.
  const emergency = policy.mode === 'emergency'
  if (config.emergency === true && !emergency) fail("The configuration asks for an emergency release, and the pinned note's mode is not emergency.")
  if (config.emergency !== true && emergency) fail("The pinned note's mode is emergency, and the configuration does not ask for an emergency release.")
  const expected = { candidateTag: config.candidateTag, baselineTag: config.previousBaselineTag, fromCommit: baseline,
    toCommit: config.targetCommit, tree,
    ...(emergency ? {} : { evidence: { id: config.evidence?.recordId, seq: config.evidence?.seq, contentHash: config.evidence?.contentHash } }),
    serving: { commit: baseline, repository: config.stableCheckout, database: config.database, port: config.servicePort } }
  if (pinned.content.data.body !== config.notice || Object.keys(expected).some(key => !same(policy[key], expected[key]))) {
    fail('The authorization does not match this release.')
  }
  const pinsAJudgement = theJudgementPinIn(pinned.content.data.extra) !== null
  if (emergency && pinsAJudgement) fail(JUDGEMENT_REFUSALS.emergency)
  const judgement = !pinsAJudgement ? null
    : await theJudgement(officeRequest, pinned, expected.evidence, await theReceiptJudged(officeRequest, expected.evidence), project)
  const { at, filed } = await established(officeRequest, policy, project, authorizingCard)
  const spacing = policy.mode === 'spacing' ? await theSpacing(officeRequest) : null
  const pins = emergency ? await theEmergency(officeRequest, policy, authorizingCard, ownBefore) : null
  // Evidence reads may consume the entire authorization window. Only completion time can authorize the next action.
  const checked = now()
  if (!Number.isFinite(checked)) fail('The clock is unavailable.')
  const from = momentOfAnInstant(policy.validFrom), until = momentOfAnInstant(policy.validUntil)
  if (from === null || until === null || from > checked || until <= checked || until <= from ||
      (policy.mode !== 'spacing' && until - from > STABLE_RELEASE_EXCEPTION_MINUTES * 60_000)) fail(WINDOW)
  if (at === null || filed === null || at > checked || filed > checked) fail(FILING)
  const elapsedMinutes = (checked - at) / 60_000
  if (spacing !== null && elapsedMinutes < spacing.minutes) {
    const counted = await countAGateMet('release-spacing', String(spacing.minutes), officeRequest)
    fail([`The baseline has not completed ${spacing.minutes} minutes.`, ...(spacing.from === 'the-office' ? [] : [spacing.says]), counted].join(' '))
  }
  return { mode: policy.mode, timeZone: policy.timeZone, approval: { ...config.noticeApproval }, checkedAt: clockStamp(() => new Date(checked)).instant,
    baselineSource: policy.baselineSource, baselineEstablishedAt: clockStamp(() => new Date(at)).instant, elapsedMinutes, spacing,
    ...(pins === null ? {} : { emergency: pins }), ...(judgement === null ? {} : { judgement }) }
}

/** The newest completed upgrade of this install in the office's history, verified from its original messages, or null. */
export async function theNewestCompletedUpgrade(officeRequest, serving) {
  const project = officeRequest?.identity?.project
  if (!id(project)) fail('The authenticated project identity is unavailable.')
  return latestBaseline(officeRequest, null, null, project, serving)
}

/**
 * The completed emergency release that installed this tag at this commit, as the office's history works it out, or null
 * when none did. The way back to such a version needs its follow-up receipt.
 */
export async function theEmergencyThatInstalled(officeRequest, tag, commit) {
  const rows = await wholeHistory(officeRequest)
  return rows.find(row => row.kind === 'emergency' && row.outcome === 'completed' && row.tag === tag && row.toCommit === commit) ?? null
}
