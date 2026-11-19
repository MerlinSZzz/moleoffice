// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The dead-letter list and sweep read only the message fields their decisions inspect. */
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t?.close()
  vi.unstubAllEnvs()
})

it('leaves message bodies in SQLite when the list and sweep need only routing facts', async () => {
  const deadletters = await import('../src/server/lib/deadletters.ts')
  const agent = randomBytes(8).toString('hex')
  const avatar = `avatar-default-agent-${agent}`
  const stamp = '2026-09-01 08:00:00'
  t.client.sqlite.prepare(
    'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
      "VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
  ).run(avatar, stamp)
  t.client.sqlite.prepare(
    'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?,?,?,?,0,NULL,?)',
  ).run(agent, agent, agent, avatar, stamp)

  const body = randomBytes(4096).toString('hex')
  const message = t.api.createRecord({
    workspaceId: 'default', kind: 'message', title: 'A letter',
    data: { body, to: [{ kind: 'agent', id: agent }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
  t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?').run(stamp, agent)

  // The public whole-message reader retains its existing contract for callers outside the sweep.
  const whole = deadletters.everyQueuedLetterToARetiredAgent().find((letter) => letter.messageId === message)
  expect(whole?.data['body']).toBe(body)

  const seen: { reader: 'list' | 'sweep'; rows: string }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!/^\s*select\b/i.test(source) || !/"records"\."id" in \(/i.test(source)) return statement
    const all = statement.all.bind(statement) as (...values: unknown[]) => unknown
    ;(statement as unknown as { all: (...values: unknown[]) => unknown }).all = (...values: unknown[]) => {
      const stack = new Error().stack ?? ''
      const rows = all(...values)
      if (values.includes(message) && values.includes('message')) {
        if (stack.includes('deadLettersNow')) seen.push({ reader: 'list', rows: String(JSON.stringify(rows)) })
        if (stack.includes('theQueuedLettersToRetiredAgents') || stack.includes('everyQueuedLetterToARetiredAgent')) {
          seen.push({ reader: 'sweep', rows: String(JSON.stringify(rows)) })
        }
      }
      return rows
    }
    return statement
  }) as never)
  try {
    expect(deadletters.deadLettersNow().some((letter) => letter.messageId === message)).toBe(true)
    deadletters.sweepDeadLetters({ type: 'system', id: moleOffice().id })
  } finally {
    spy.mockRestore()
  }
  for (const reader of ['list', 'sweep'] as const) {
    const reads = seen.filter((one) => one.reader === reader)
    expect(reads.length, `${reader} read the letter`).toBeGreaterThan(0)
    expect(reads.every((one) => !one.rows.includes(body)), `${reader} left the body in SQLite`).toBe(true)
  }
})
