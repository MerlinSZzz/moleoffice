// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Made-up original authority in a fresh test database, never in the real Office. */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp } from '../src/shared/time.ts'

const sharedModule = '../src/shared/stable-bootstrap-notices.ts'
export async function fixtureBootstrapAuthority(t: TestDb, announcement: any, writer: any, secretary: any) {
  const shared = await import(sharedModule)
  const scope = { version: 1, action: 'stop-serve-dev-for-first-handoff', candidateTag: announcement.candidateTag,
    tree: announcement.tree, from: announcement.from, to: announcement.to }
  const pin = (id: string) => ({ id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(id) as any).content_hash })
  const stateSha256Base64 = Buffer.alloc(32, 7).toString('base64')
  const prepared = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: shared.STABLE_BOOTSTRAP_PREPARED_TITLE,
    data: { body: shared.STABLE_BOOTSTRAP_PREPARED_BODY, extra: { stableBootstrapPrepared: { version: 1, scope, evidence: announcement.evidence, stateSha256Base64 } } }, actor: writer })
  const preparedAt = localStamp(new Date(Date.now() - 120_000)), when = localStamp(new Date(Date.now() - 60_000))
  // Explicit synthetic chronology; these are not observations of a real preparation or owner.
  t.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(preparedAt, prepared.id)
  const words = `Made-up owner: stop serve-dev for the first handoff ${announcement.candidateTag}.`
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up owner stop words',
    data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
  t.client.sqlite.prepare('UPDATE records SET created_at=? WHERE id=?').run(when, message.id)
  t.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(when, message.id)
  const title = `Made-up stop decision ${announcement.candidateTag}`
  const warrant = { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: `message:${message.id}`, when, for: [title] }
  const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title,
    data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } },
    actor: { ...secretary, warrant } })
  t.client.sqlite.prepare('UPDATE installation SET window_closed_at=?,window_closed_by_kind=?,window_closed_by_id=? WHERE only_row=1')
    .run(localStamp(new Date(Date.now() - 3_600_000)), 'person', THE_TEST_OFFICES_OWNER.id)
  const { forgetTheKeyWindowThisProcessRead } = await import('../src/server/lib/keywindow.ts')
  forgetTheKeyWindowThisProcessRead()
  const authority = { prepared: pin(prepared.id), decision: pin(decision.id), stateSha256Base64 }
  return { authority, scope, preparedAt, when, message: message.id, decision: decision.id, prepared: prepared.id }
}

export async function fixtureBootstrapKeys(t: TestDb, agent: string) {
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return makeAnAgentKey(agent, null)
}
