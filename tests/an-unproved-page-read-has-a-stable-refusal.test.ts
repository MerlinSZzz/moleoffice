// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { IDENTITY_REFUSAL_CODES } from '../src/shared/refusal-codes.ts'

const trustedAddress = '198.51.100.9'
const untrustedAddress = '203.0.113.7'
const person = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let db: TestDb
let app: FastifyInstance
let remote: Server
let remoteUrl: string

beforeAll(async () => {
  db = await freshDb()
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(trustedAddress, null, 'a press', 'the test trusted this machine', null)
  app = (await apiApp()).app
  await app.ready()
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  remote = await listenForOtherMachines(app, 0, '127.0.0.1')
  remoteUrl = `http://127.0.0.1:${String((remote.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => remote.close(() => done()))
  await app.close()
  db.close()
})

describe('a page read that cannot be attributed', () => {
  it('returns its own code for an unpaired browser, while the pairing read stays open', async () => {
    const headers = { ...person, 'x-forwarded-for': untrustedAddress }
    const refused = await fetch(`${remoteUrl}/api/records`, { headers })
    expect(refused.status).toBe(403)
    const body = await refused.json() as { code?: string }
    expect(body.code).toBe(Object.keys(IDENTITY_REFUSAL_CODES)[0])
    const pairing = await fetch(`${remoteUrl}/api/office/pairing`, { headers })
    expect(pairing.status).toBe(200)
  })

  it('does not refuse the browser the open key window already lets in', async () => {
    const response = await fetch(`${remoteUrl}/api/records`, {
      headers: { ...person, 'x-forwarded-for': trustedAddress },
    })
    expect(response.status).toBe(200)
  })

  it('does not describe an agent without its key as an unpaired browser', async () => {
    const { closeTheKeyWindow } = await import('../src/server/lib/keywindow.ts')
    closeTheKeyWindow({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    const response = await fetch(`${remoteUrl}/api/records`, {
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'an-agent-without-a-key',
        'x-forwarded-for': untrustedAddress,
      },
    })
    expect(response.status).toBe(403)
    const body = await response.json() as { code?: string; reason?: string }
    expect(body.reason).toMatch(/agent/i)
    expect(body.code).not.toBe(Object.keys(IDENTITY_REFUSAL_CODES)[0])
  })
})
