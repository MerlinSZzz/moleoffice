// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'

// An agent's saved wake rules that this release cannot use, as another release could leave them. The rules
// door names them and answers the kinds it can use. The two readers that hand messages over, the waiting
// list and the message worker's queue, must read the same kinds and not fail.
const RETIRED = 'madeUpRetiredNotice'
let t: TestDb, app: FastifyInstance
const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })
async function agent(handle: string) {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name: 'Made-up ' + handle, role: 'worker' } })
  expect(r.statusCode, r.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const who = agentByHandle(handle)!
  return { who, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(who.id, null) } }
}
/** The record's own shape takes any value here, so this files the rules as another release would have. */
async function saveRulesAsAnotherRelease(agentId: string, mutedKinds: unknown) {
  const { asNoticeRulesDoor } = await import('../src/server/lib/notice-rules-door.ts')
  asNoticeRulesDoor(() => t.api.createRecord({ kind: 'notice_rules', title: 'Personal notice wake rules', workspaceId: MESSAGE_CENTRE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, data: { recipient: { kind: 'agent', id: agentId }, mutedKinds, because: 'Made-up choice from another release' } }))
}

it('holds the kinds this release can use, names the one it cannot, and keeps the waiting list and the queue readable', async () => {
  const a = await agent('made-up-retired-rule')
  await saveRulesAsAnotherRelease(a.who.id, ['theBroadcastIsDue', RETIRED])
  const door = await app.inject({ method: 'GET', url: '/api/messages/notice-rules', headers: a.headers })
  expect(door.statusCode, door.body).toBe(200)
  expect(door.json().mutedKinds).toEqual(['theBroadcastIsDue'])
  expect(door.json().storedButNotUsed).toEqual({ mutedKinds: ['theBroadcastIsDue', RETIRED], problems: [`This release has no kind of notice called "${RETIRED}".`] })
  const { mutedNoticeKinds } = await import('../src/server/lib/notice-rules.ts')
  expect(mutedNoticeKinds({ kind: 'agent', id: a.who.id })).toEqual(door.json().mutedKinds)

  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  t.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered'").run()
  const sent = writeASystemLineToOne({ kind: 'agent', id: a.who.id }, 'default', SYSTEM_LINES.theBroadcastIsDue('Made-up report time'), { type: 'system', id: moleOffice().id })
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  expect(everythingWaitingFor(a.who.id).find(r => r.messageId === sent.id)?.wakesNoWaiter).toContain('Your notice wake rule')
  const waiting = await app.inject({ method: 'GET', url: '/api/handles/made-up-retired-rule/waiting', headers: a.headers })
  expect(waiting.statusCode, waiting.body).toBe(200)
  const { theQueue } = await import('../src/server/lib/worker.ts')
  expect(theQueue('default').find(r => r.messageId === sent.id)?.heldByNoticeRule).toContain('Your notice wake rule')
})

it('holds nothing for saved rules that are not a list, names them, and keeps the waiting list and the queue readable', async () => {
  const b = await agent('made-up-unlisted-rule')
  // The record's shape refuses a value that is not a list, so only a damaged database holds one. This writes it there.
  await saveRulesAsAnotherRelease(b.who.id, [])
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data,'$.mutedKinds','made-up-not-a-list') WHERE kind='notice_rules' AND json_extract(data,'$.recipient.id')=?").run(b.who.id)
  const door = await app.inject({ method: 'GET', url: '/api/messages/notice-rules', headers: b.headers })
  expect(door.statusCode, door.body).toBe(200)
  expect(door.json().mutedKinds).toEqual([])
  expect(door.json().storedButNotUsed).toEqual({ mutedKinds: 'made-up-not-a-list', problems: ['The saved rules are not a list of notice kinds.'] })

  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  t.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered'").run()
  const sent = writeASystemLineToOne({ kind: 'agent', id: b.who.id }, 'default', SYSTEM_LINES.theBroadcastIsDue('Made-up report time'), { type: 'system', id: moleOffice().id })
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  expect(everythingWaitingFor(b.who.id).find(r => r.messageId === sent.id)?.wakesNoWaiter ?? '').not.toContain('Your notice wake rule')
  const { theQueue } = await import('../src/server/lib/worker.ts')
  const row = theQueue('default').find(r => r.messageId === sent.id)
  expect(row).toBeDefined()
  expect(row!.heldByNoticeRule).toBeUndefined()
})
