// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { freshDb } from './helpers.ts'
import { setFixtureOwner } from './agent-owner-fixture.ts'

describe('ownership waits in a sweep', () => {
  it('counts both writers and explains what the messages await', async () => {
    const office = await freshDb()
    try {
      const roles = await import('../src/server/lib/roles.ts')
      roles.readTheRoleCards({ guardActKeys: office.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
      const { THE_PERSON } = await import('../src/shared/person.ts')
      const { PARTICIPANT_KINDS } = await import('../src/shared/participants.ts')
      const { localStamp } = await import('../src/shared/time.ts')
      const { sayInEnglish } = await import('../src/shared/i18n.ts')
      const { sweepDeadLetters, lettersFromThePersonWaitingForASecretary } = await import('../src/server/lib/deadletters.ts')
      const [personKind, agentKind] = PARTICIPANT_KINDS
      const makeAgent = (handle: string) => {
        office.api.createRecord({ workspaceId: 'default', kind: agentKind, title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: office.api.HUMAN })
        return (office.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
      }
      const target = makeAgent('waiting-recipient')
      const writer = makeAgent('waiting-writer')
      setFixtureOwner(office.client.sqlite, null, target)
      office.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(target)
      const now = localStamp(new Date())
      const record = office.client.sqlite.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) VALUES (?, 'message-centre', ?, ?, ?, 'message', 'A waiting letter', NULL, ?, NULL, 'authored')")
      const delivery = office.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, 'queued', ?)")
      for (const [id, sender] of [['person-letter', { kind: personKind, id: THE_PERSON }], ['agent-letter', { kind: agentKind, id: writer }]] as const) {
        record.run(id, THE_PERSON, now, now, JSON.stringify({ body: 'A letter waiting for its owner.', to: [{ kind: agentKind, id: target }], sentBy: sender, writtenIn: { project: 'default' } }))
        delivery.run(`delivery-${id}`, id, agentKind, target, now)
      }
      const first = sweepDeadLetters(office.api.HUMAN)
      expect(first.waiting).toEqual({ fromThePerson: 1, fromAgents: 1 })
      expect(lettersFromThePersonWaitingForASecretary()).toHaveLength(0)
      expect(first.lineId).not.toBeNull()
      const line = office.api.getRecord(first.lineId!)!
      const personWord = sayInEnglish('deadLetterSweep.ownerWaiting.fromThePerson.one' as Parameters<typeof sayInEnglish>[0])
      const agentWord = sayInEnglish('deadLetterSweep.ownerWaiting.fromAgents.one' as Parameters<typeof sayInEnglish>[0])
      expect(line.data['saidInFull']).toContain(personWord)
      expect(line.data['saidInFull']).toContain(agentWord)
      const again = sweepDeadLetters(office.api.HUMAN)
      expect(again.waiting).toEqual({ fromThePerson: 1, fromAgents: 1 })
      expect(again.lineId).toBeNull()
      expect(again.because).toContain(personWord)
      expect(again.because).toContain(agentWord)
      for (const id of ['person-letter', 'agent-letter']) {
        expect(office.client.sqlite.prepare('SELECT recipient_id, mark FROM message_delivery WHERE message_id = ?').all(id)).toEqual([{ recipient_id: target, mark: 'queued' }])
      }
    } finally {
      office.close()
    }
  }, 30000)
})
