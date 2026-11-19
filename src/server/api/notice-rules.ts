// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { pendingNoticeBatches, noticeBatchMaxMinutes, holdNoticeDeliveries, scheduleNoticeBatchClock } from '../../holder/notice-batches.ts'
import { sqlite } from '../db/client.ts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { createRecord, patchRecord, versionOf, writtenFromAStaleCopy } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { getRevision, listRevisions } from '../lib/revisions.ts'
import { route } from '../lib/route.ts'
import { asNoticeRulesDoor, NOTICE_RULES_KIND } from '../lib/notice-rules-door.ts'
import { aNoticeRuleRefusal, noticeRuleRefusal, ownNoticeRules, theSavedRules, batchedNoticeKinds, mutedNoticeKinds, theDefaultMutedKinds } from '../lib/notice-rules.ts'
import { NOTICES, isANoticeKind } from '../lib/notices.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'

const common = { because: z.string().trim().min(1).max(500), ifVersion: z.string().nullable() }
const edit = z.strictObject({ ...common, mutedKinds: z.array(z.string()).max(Object.keys(NOTICES).length), batchedKinds: z.array(z.string()).max(Object.keys(NOTICES).length).optional() })
const restore = z.strictObject({ ...common, seq: z.number().int().positive() })
function reading(recipient: ParticipantRef) {
  const record = ownNoticeRules(recipient)
  const versions = record === null ? null : listRevisions(record.id, 10)
  const saved = theSavedRules(record)
  return { recipient, name: readParticipant(recipient)?.name ?? recipient.id, version: record === null ? null : versionOf(record),
    batchedKinds: batchedNoticeKinds(recipient), batchMaxMinutes: noticeBatchMaxMinutes(), pendingBatches: pendingNoticeBatches(recipient),
    releaseDefinition: 'The next independently started work turn or the office batch time limit, whichever comes first. Reads, heartbeats and repeated running status do not start a turn.',
    recordId: record?.id ?? null, mutedKinds: mutedNoticeKinds(recipient), defaultMutedKinds: [...theDefaultMutedKinds(recipient)], storedButNotUsed: saved.storedButNotUsed, because: record?.data['because'] ?? null,
    choices: Object.entries(NOTICES).map(([kind, row]) => ({kind, ...row})),
    historySays: versions?.says ?? null,
    history: (versions?.revisions ?? []).map((r) => ({ seq:r.seq, at:r.at, by:readParticipant(recipient)?.name ?? r.who.actorId, mutedKinds:getRevision(record!.id,r.seq).content.data['mutedKinds'] ?? [], batchedKinds:getRevision(record!.id,r.seq).content.data['batchedKinds'] ?? [] })),
  }
}
export type NoticeRulesReply = ReturnType<typeof reading>
export async function noticeRulesRoutes(app: FastifyInstance) {
  function who(req: Parameters<typeof actorFrom>[0]) {
    const actor = actorFrom(req), recipient = participantForActor(actor)
    if (recipient === null || readParticipant(recipient) === null || (actor.type === 'agent' && actor.provedBy !== 'an-agent-key')) noticeRuleRefusal('Use your own registered identity and key to read or change your notice rules.', 403)
    return { actor, recipient: recipient! }
  }
  app.get('/messages/notice-rules', route('message.notice-rules', 'remote', 'Read your own muted and batched notice kinds, the office defaults, the kinds held until you save rules (defaultMutedKinds), the release boundary, pending counts and ten recent versions, and any saved rule this release cannot use. Nobody else’s rules are editable here.'), async (req) => reading(who(req).recipient))
  async function write(req: Parameters<typeof actorFrom>[0], restoring: boolean) {
    const {actor, recipient} = who(req)
    const parsed = (restoring ? restore : edit).safeParse(req.body)
    if (!parsed.success) noticeRuleRefusal('Send notice kinds, a reason and the version you read; a restore names one of your previous versions. No recipient field is accepted.')
    const body = parsed.data
    const current = ownNoticeRules(recipient)
    // The gate writes-from-a-stale-copy: at off the save goes on, and is counted here, since the patch below names no version.
    if ((current === null ? null : versionOf(current)) !== body.ifVersion) writtenFromAStaleCopy(aNoticeRuleRefusal('Your rules changed after you read them. Read them again before saving.', 409))
    let values: unknown, batches: unknown
    if ('seq' in body) {
      if (current === null) noticeRuleRefusal('You have no saved rules to restore.', 404)
      try { const previous = getRevision(current!.id, body.seq).content.data; values = previous['mutedKinds']; batches = previous['batchedKinds'] ?? [] }
      catch (error) { if (error instanceof PanelError && error.status === 404) noticeRuleRefusal('That version of your notice rules does not exist.', 404); throw error }
    } else { values = body.mutedKinds; batches = body.batchedKinds ?? current?.data['batchedKinds'] ?? [] }
    if (!Array.isArray(values) || !values.every(isANoticeKind)) noticeRuleRefusal('Choose only notice kinds the office knows. No rules were saved.')
    if (!Array.isArray(batches) || !batches.every(isANoticeKind)) noticeRuleRefusal('Choose only notice kinds the office knows for batching. No rules were saved.')
    if (values.some(kind => batches.includes(kind))) noticeRuleRefusal('A notice kind cannot be both muted and batched. Choose one delivery rule for each kind.')
    const data = { recipient, mutedKinds: [...new Set(values)].sort(), batchedKinds: [...new Set(batches)].sort(), because: body.because }
    let wrote = false
    sqlite.transaction(()=>{
    asNoticeRulesDoor(() => {
      if (current === null) {
        createRecord({kind:NOTICE_RULES_KIND,title:'Personal notice wake rules',data,workspaceId:MESSAGE_CENTRE,actor})
        wrote = true
      } else if (patchRecord(current.id,{data},actor).newSeq !== null) wrote = true
    })
    const queued = sqlite.prepare("SELECT message_id AS id FROM message_delivery WHERE recipient_kind=? AND recipient_id=? AND mark='queued'").all(recipient.kind,recipient.id) as {id:string}[]
    for (const row of queued) if (holdNoticeDeliveries(row.id,[recipient])) wrote = true
    })()
    scheduleNoticeBatchClock()
    return { ...reading(recipient), ...(!wrote ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
  }
  app.put('/messages/notice-rules', route('message.set-notice-rules', 'remote', 'Save your own mutedKinds and batchedKinds with a reason and ifVersion. Omitted batchedKinds preserves the saved batch list. A kind cannot be both muted and batched. Empty lists hold nothing. Saving defaultMutedKinds goes back to the kinds held before you saved any. Every original stays readable.'), async (req) => write(req,false))
  app.post('/messages/notice-rules/restore', route('message.restore-notice-rules', 'remote', 'Restore one of your own rule versions: {seq,ifVersion,because}. The restore itself is kept as a new version.'), async (req) => write(req,true))
}
