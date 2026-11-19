// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let office: TestDb
let app: FastifyInstance
let person: string
let stamp: (date: Date) => string
let secretaryRole: string

const headers = (kind: string, id: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': kind,
  'x-mole-office-actor-id': id,
})

async function register(handle: string, name = handle): Promise<string> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: headers('human', person),
    payload: { handle, name, runtime: 'claude-code' },
  })
  expect(reply.statusCode).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

function setOwner(agent: string, owner: string | null): void {
  setFixtureOwner(office.client.sqlite, owner, agent, 'id')
}

function markSecretary(agent: string): void {
  office.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(secretaryRole, agent)
}

function reachable(agent: string): void {
  office.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'A waiting test run',
    data: {
      state: 'finished', runtime: 'claude-code', servingAgentId: agent,
      deliveringMessage: 'test-message', providerSession: `test-conversation-${agent}`,
      waitsUntil: stamp(new Date(Date.now() + 30 * 60_000)),
    },
    actor: office.api.HUMAN,
  })
}

async function send(kind: string, sender: string, recipient: string, body: string) {
  return app.inject({
    method: 'POST', url: '/api/records', headers: headers(kind, sender),
    payload: { kind: 'message', title: body, data: { to: [{ kind: 'agent', id: recipient }], body } },
  })
}

function deliveryCount(message: string, kind: string, recipient: string): number {
  const row = office.client.sqlite.prepare(
    'SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_kind = ? AND recipient_id = ?',
  ).get(message, kind, recipient) as { n: number }
  return row.n
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = (await import('../src/shared/person.ts')).THE_PERSON
  stamp = (await import('../src/shared/time.ts')).localStamp
  secretaryRole = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
}, 120_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

describe('messages to an agent nobody holds', () => {
  for (const senderKind of ['human', 'agent'] as const) {
    it(`keeps a ${senderKind} message addressed and routes it through two owners`, async () => {
      const top = await register(`top-${senderKind}`)
      const middle = await register(`middle-${senderKind}`)
      const target = await register(`target-${senderKind}`)
      const sender = senderKind === 'human' ? person : await register('sending-agent')
      markSecretary(top)
      reachable(top)
      setOwner(target, middle)
      setOwner(middle, top)
      setOwner(top, null)

      const body = `A test message from ${senderKind}`
      const reply = await send(senderKind, sender, target, body)
      expect(reply.statusCode).toBe(409)
      const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
      expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
      expect(record.data['body']).toBe(body)
      const routed = record.data['routed'] as { for: unknown; to: unknown }[]
      expect(routed).toHaveLength(1)
      expect(routed[0]?.for).toEqual({ kind: 'agent', id: target })
      expect(routed[0]?.to).toEqual({ kind: 'agent', id: top })
      expect(deliveryCount(record.id, 'agent', target)).toBe(1)
      expect(deliveryCount(record.id, 'agent', top)).toBe(1)
      expect(deliveryCount(record.id, 'person', person)).toBe(0)
    })
  }

  it('keeps the message waiting for an unreachable responsible secretary', async () => {
    const top = await register('waiting-secretary')
    const middle = await register('waiting-middle')
    const target = await register('waiting-target')
    const sender = await register('waiting-sender')
    markSecretary(top)
    setOwner(target, middle)
    setOwner(middle, top)
    setOwner(top, null)

    const reply = await send('agent', sender, target, 'A message that must wait')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(record.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    expect(deliveryCount(record.id, 'agent', target)).toBe(1)
    expect(deliveryCount(record.id, 'agent', top)).toBe(0)
    expect(deliveryCount(record.id, 'person', person)).toBe(0)
    const { routedOf, theRoutedLineToDraw, NO_REACHABLE_OWNER_ENDING } = await import('../src/shared/messages.ts')
    const waitingRoute = routedOf(record.data)[0]!
    expect(waitingRoute.to).toBeNull()
    expect(waitingRoute.said?.ending.how).toBe(NO_REACHABLE_OWNER_ENDING)
    expect(waitingRoute.line).toBe(theRoutedLineToDraw(waitingRoute))
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    expect(waitingRoute.line).toContain(sayInEnglish('chatEnglish.routed.ending.ownerUnavailable', { addressee: 'waiting-target' }))

    const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
    sweepDeadLetters({ type: 'system', id: 'mole-office' })
    expect(deliveryCount(record.id, 'agent', top)).toBe(0)
    reachable(top)
    sweepDeadLetters({ type: 'system', id: 'mole-office' })
    const after = office.api.getRecord(record.id)!
    expect(after.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(after.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    expect(after.data['body']).toBe('A message that must wait')
    expect(routedOf(after.data).filter((route) => route.to?.id === top)).toHaveLength(1)
    expect(deliveryCount(record.id, 'agent', top)).toBe(1)
    sweepDeadLetters({ type: 'system', id: 'mole-office' })
    expect(routedOf(office.api.getRecord(record.id)!.data).filter((route) => route.to?.id === top)).toHaveLength(1)
  })

  it('leaves direct delivery alone if the addressee becomes reachable before retry', async () => {
    const top = await register('direct-retry-secretary')
    const target = await register('direct-retry-target')
    const sender = await register('direct-retry-sender')
    markSecretary(top)
    setOwner(target, top)
    const reply = await send('agent', sender, target, 'A message for its own addressee')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    const before = JSON.stringify(record.data)
    reachable(top)
    reachable(target)
    const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
    sweepDeadLetters({ type: 'system', id: 'mole-office' })
    sweepDeadLetters({ type: 'system', id: 'mole-office' })
    const after = office.api.getRecord(record.id)!
    expect(JSON.stringify(after.data)).toBe(before)
    expect(after.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(after.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    expect(deliveryCount(record.id, 'agent', target)).toBe(1)
    expect(deliveryCount(record.id, 'agent', top)).toBe(0)
  })

  it('does not select an unreachable non-secretary at the top', async () => {
    const top = await register('unreachable-generic-top')
    const target = await register('unreachable-generic-target')
    const sender = await register('unreachable-generic-sender')
    setOwner(target, top)
    setOwner(top, null)
    const reply = await send('agent', sender, target, 'A message with no reachable owner')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(record.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    expect(deliveryCount(record.id, 'agent', target)).toBe(1)
    expect(deliveryCount(record.id, 'agent', top)).toBe(0)
  })

  it('routes to a reachable intermediate owner before the top', async () => {
    const top = await register('intermediate-top')
    const middle = await register('intermediate-owner')
    const target = await register('intermediate-target')
    const sender = await register('intermediate-sender')
    markSecretary(top)
    setOwner(target, middle)
    setOwner(middle, top)
    reachable(middle)
    const reply = await send('agent', sender, target, 'A message for a reachable owner')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(record.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    expect(deliveryCount(record.id, 'agent', middle)).toBe(1)
    expect(deliveryCount(record.id, 'agent', top)).toBe(0)
  })

  it('leaves a person-started agent’s message with that agent', async () => {
    const targetName = 'Ownerless office name'
    const target = await register('person-started-target', targetName)
    const sender = await register('person-started-sender')
    const reply = await send('agent', sender, target, 'A message for a person-started agent')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(deliveryCount(record.id, 'agent', target)).toBe(1)
    expect(deliveryCount(record.id, 'person', person)).toBe(0)
    const { routedOf, theRoutedLineToDraw, PERSON_OWNER_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    const entry = routedOf(record.data)[0]!
    expect(entry.said?.ending.how).toBe(PERSON_OWNER_ROUTING_ENDING)
    expect(entry.said?.ending.how).toBeTruthy()
    expect(entry.said?.addressee).toBe(targetName)
    expect(entry.line).toBe(theRoutedLineToDraw(entry))
    expect(entry.line).toContain(targetName)
    expect(entry.line).not.toContain(target)
  })

  it('leaves an agent with no recorded owner waiting without inventing a recipient', async () => {
    const target = await register('no-owner-target')
    const sender = await register('no-owner-sender')
    setOwner(target, null)
    const reply = await send('agent', sender, target, 'A message with no recorded owner')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
    expect(deliveryCount(record.id, 'agent', target)).toBe(1)
    expect(deliveryCount(record.id, 'person', person)).toBe(0)
    const { routedOf, OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    expect(routedOf(record.data)[0]?.said?.ending.how).toBe(OWNERLESS_ROUTING_ENDING)
  })

  for (const breakKind of ['cycle', 'missing owner'] as const) {
    it(`leaves a message with its addressee when the owner chain has a ${breakKind}`, async () => {
      const targetName = `Addressee for ${breakKind}`
      const middleName = `Owner for ${breakKind}`
      const target = await register(`broken-target-${breakKind.replaceAll(' ', '-')}`, targetName)
      const middle = await register(`broken-middle-${breakKind.replaceAll(' ', '-')}`, middleName)
      const sender = await register(`broken-sender-${breakKind.replaceAll(' ', '-')}`)
      setOwner(target, middle)
      setOwner(middle, breakKind === 'cycle' ? target : 'missing-owner')
      const reply = await send('agent', sender, target, 'A message with a broken route')
      expect(reply.statusCode).toBe(409)
      const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
      expect(record.data['to']).toEqual([{ kind: 'agent', id: target }])
      expect(deliveryCount(record.id, 'agent', target)).toBe(1)
      expect(deliveryCount(record.id, 'agent', middle)).toBe(0)
      expect(deliveryCount(record.id, 'person', person)).toBe(0)
      const { routedOf, theRoutedLineToDraw, BROKEN_OWNERS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
      const entry = routedOf(record.data)[0]!
      expect(entry.said?.ending.how).toBe(BROKEN_OWNERS_ROUTING_ENDING)
      expect(entry.said?.ending.how).toBeTruthy()
      expect(entry.said?.addressee).toBe(targetName)
      expect(entry.line).toBe(theRoutedLineToDraw(entry))
      expect(entry.line).toContain(targetName)
      expect(entry.line).toContain(middleName)
      expect(entry.line).not.toContain(middle)

    })
  }


  it('resolves an owner stored as a handle', async () => {
    const owner = await register('old-owner-handle')
    const target = await register('old-handle-target')
    const sender = await register('old-handle-sender')
    markSecretary(owner)
    reachable(owner)
    setOwner(target, 'old-owner-handle')
    const reply = await send('agent', sender, target, 'A message whose owner is stored as a handle')
    expect(reply.statusCode).toBe(409)
    const record = office.api.getRecord((reply.json() as { record: { id: string } }).record.id)!
    expect(deliveryCount(record.id, 'agent', owner)).toBe(1)
    expect(deliveryCount(record.id, 'person', person)).toBe(0)
  })

})
