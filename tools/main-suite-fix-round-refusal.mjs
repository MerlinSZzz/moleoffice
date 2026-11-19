// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The express EXptquVXZjT1 diagnostic exception: own agent key, no claimed run attribution. */
import { readReceiptEvidenceObject } from './stable/stable-upgrade-evidence.mjs'
import { withoutKeys } from './office-request.mjs'

export async function recordFixRoundAuthorityRefusal({ claimedRun, agent, coordinator, journal, state, keep, missingProof }, { officeRequest }) {
  const read = path => readReceiptEvidenceObject(officeRequest, path)
  let revisionRead = null
  try {
    const original = await read(`/api/records/${claimedRun}/revisions/1`)
    if (original.seq === 1 && typeof original.contentHash === 'string') revisionRead = { recordId: claimedRun, seq: 1, contentHash: original.contentHash }
  } catch { /* Unknown stays unknown; a header or current alias is never historical proof. */ }
  state.authorityRefusal = { claimedRun, missingProof: withoutKeys(missingProof), revisionRead }
  keep()
  const sendId = `fixround-authority-${agent}-${claimedRun}`
  const verify = async message => {
    const original = await read(`/api/records/${message}/revisions/1`), data = original.content?.data
    if (original.op !== 'create' || original.content?.kind !== 'message' || original.who?.sessionId != null
      || data?.sentBy?.kind !== 'agent' || data.sentBy.id !== agent || data.sendId !== sendId || data.fromRun != null || data.aboutRun != null
      || JSON.stringify(data.to) !== JSON.stringify([{ kind: 'agent', id: coordinator }]) || typeof data.body !== 'string' || !data.body.includes('unattributed')
      || !data.body.includes(`Claimed run: ${claimedRun}.`) || !data.body.endsWith(`\n${sendId}`)) {
      throw new Error('The original authority diagnostic does not match its actual sender, recipient and unattributed purpose.')
    }
    const journalEntry = /Private journal entry: (.+#authorityRefusal)\./.exec(data.body)?.[1]
    if (!journalEntry) throw new Error('The original authority diagnostic has no retained journal reference.')
    return { ...original, journalEntry }
  }
  try {
    const page = await read(`/api/messages?sender=${encodeURIComponent(`agent:${agent}`)}&words=${encodeURIComponent(sendId)}&limit=25&offset=0&full=1`)
    const matches = (page.messages ?? []).filter(one => one.sendId === sendId && one.sentBy?.id === agent)
    if (matches.length > 1 || page.messages?.length === 25) throw new Error('The authority diagnostic reconciliation is ambiguous or incomplete.')
    let message = matches[0]?.id
    if (!message) {
      const body = `This authority refusal is unattributed because the controller run proof failed. Claimed run: ${claimedRun}. Missing proof: ${withoutKeys(missingProof)}. Actual revision read: ${revisionRead ? `${revisionRead.recordId} revision ${revisionRead.seq}` : 'unknown'}. Private journal entry: ${journal}#authorityRefusal. The refused proof authorizes no protected write, repair, withdrawal or take-out.\n${sendId}`
      state.authorityRefusal.notification = { sendId, state: 'planned', to: [coordinator], body }; keep()
      // The existing normal message door atomically deduplicates this actual writer and sendId.
      const reply = await officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'message', title: 'Fix controller authority refused', data: { to: [{ kind: 'agent', id: coordinator }], sendId, body } } })
      if (reply.status < 200 || reply.status >= 300 || reply.cut || reply.location !== null) throw new Error(`The ordinary authority diagnostic was not accepted (${reply.status}).`)
      message = JSON.parse(reply.body).record?.id
      if (typeof message !== 'string') throw new Error('The authority diagnostic has no exact message ID.')
    }
    const original = await verify(message)
    state.authorityRefusal.notification = { sendId, state: 'accepted', message, journalEntry: original.journalEntry }; keep()
    const forms = await officeRequest({ method: 'POST', path: `/api/records/${message}/short-forms`, body: { madeFrom: { seq: 1, contentHash: original.contentHash }, forms: { label: 'Controller proof refusal' } } })
    if (forms.status < 200 || forms.status >= 300 || forms.cut || forms.location !== null) throw new Error('The authority diagnostic label remains pending.')
    return { message, journalEntry: original.journalEntry }
  } catch (error) {
    state.authorityRefusal.notificationFailure = withoutKeys(error.message ?? String(error)); keep()
    return { pending: true }
  }
}
