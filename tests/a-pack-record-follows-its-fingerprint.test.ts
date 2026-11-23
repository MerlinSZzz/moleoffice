// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { PACK_KIND } from '../src/shared/kinds/pack.ts'

buildTheFirstOfficeInAHook()

it('publishes the fields, files checked packs, and refuses a generic write', async () => {
  const office = await freshDb()
  const app = (await apiApp()).app
  const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  try {
    await app.ready()
    const listed = await app.inject({ method: 'GET', url: '/api/kinds' })
    expect(listed.statusCode).toBe(200)
    const described = listed.json().kinds.find((kind: { kind: string }) => kind.kind === PACK_KIND)
    expect(described.fields).toEqual(KIND_SPECS[PACK_KIND].fields)
    const { makePack } = await import('../src/server/lib/pack/make.ts')
    const { filePackRecord } = await import('../src/server/lib/pack/file-record.ts')
    const folder = join(dirname(office.file), 'packs')
    const first = await makePack({ to: folder, database: office.file, now: new Date(2026, 10, 23, 9), whole: true })
    const second = await makePack({ to: folder, database: office.file, now: new Date(2026, 10, 24, 9) })
    const filed = filePackRecord(second, 'default', actor)
    expect(filed.data.previous).toEqual(second.previous)
    expect(filed.data.base).toEqual(second.base)
    expect(filed.data.previousPack).toBeUndefined()
    expect(filed.data.basePack).toBeUndefined()
    expect((filed.data.notes as string[]).join(' ')).toContain(first.fingerprint)
    expect((filed.data.notes as string[]).join(' ')).toContain(first.name)
    const before = office.api.listRecords({ workspaceId: 'default', kind: PACK_KIND }).length
    const refused = await app.inject({ method: 'POST', url: '/api/records', headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': actor.id, 'x-mole-office-workspace': 'default' }, payload: { kind: PACK_KIND, title: 'A generic request', data: filed.data } })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('Only the pack filing function')
    expect(office.api.listRecords({ workspaceId: 'default', kind: PACK_KIND })).toHaveLength(before)
    const firstRecord = filePackRecord(first, 'default', actor)
    const third = await makePack({ to: folder, database: office.file, now: new Date(2026, 10, 25, 9) })
    const next = filePackRecord(third, 'default', actor)
    expect(next.data.previousPack).toBe(filed.id)
    expect(next.data.basePack).toBe(firstRecord.id)
  } finally { await app.close(); office.close() }
}, 120_000)
