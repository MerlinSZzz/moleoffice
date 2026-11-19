// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic registrations and stored old rows, only in freshDb. No live office database is opened. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { C_WHOLE_LOOK_WEIGHTS, generateCWholeAppearance, generatePixelAppearance, pixelAppearanceSchema, resolvePixelAppearance, storedPixelAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'
import type { PixelDefaultRefreshPlan } from '../src/shared/pixel-office.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const actor = (id: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const ids = ['synthetic-c-birth', 'synthetic-c-null', 'synthetic-c-manual', 'synthetic-c-legacy', 'synthetic-c-preview', 'synthetic-c-repair']
let database: TestDb, app: FastifyInstance
const records = new Map<string, string>()
// A NEW AGENT'S ID IS MINTED AND IS NOT ITS HANDLE, so the rows are read by handle and an agent id the
// office answers with is compared with `idOf(handle)`.
const stored = (handle: string) => database.client.sqlite.prepare('SELECT pixel_appearance,pixel_scale FROM agents WHERE handle=?').get(handle) as { pixel_appearance: string | null; pixel_scale: string }
const idOf = (handle: string) => (database.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as { id: string }).id
async function read(id: string) {
  const r = await app.inject({ url: '/api/office/appearance/' + id, headers: actor(id) })
  expect(r.statusCode, r.body).toBe(200); return r.json()
}
const put = (id: string, appearance: unknown, by = id) => app.inject({ method: 'PUT', url: '/api/office/appearance/' + id, headers: actor(by), payload: { appearance } })
async function withWorld<T>(run: () => Promise<T>): Promise<T> {
  const keys = ['MOLE_OFFICE_WORLD_STARTED_BY', 'MOLE_OFFICE_WORLD_SECRETARIES'] as const
  const before = keys.map(key => process.env[key])
  const { forgetTheWorldsOwnAuthority } = await import('../src/server/lib/worldauthority.ts')
  process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'synthetic-c-birth'
  process.env.MOLE_OFFICE_WORLD_SECRETARIES = 'synthetic-c-legacy'
  forgetTheWorldsOwnAuthority()
  try { return await run() } finally {
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i] })
    forgetTheWorldsOwnAuthority()
  }
}
async function defaultPreview(by: string) {
  const response = await app.inject({ method: 'POST', url: '/api/office/appearance-defaults/preview', headers: actor(by), payload: {} })
  expect(response.statusCode, response.body).toBe(200); return response.json()
}
async function defaultSave(plan: PixelDefaultRefreshPlan, by: string) {
  const response = await app.inject({ method: 'POST', url: '/api/office/appearance-defaults/save', headers: actor(by), payload: { plan } })
  expect(response.statusCode, response.body).toBe(200); return response.json()
}
beforeAll(async () => {
  database = await freshDb(); app = (await apiApp()).app
  for (const id of ids) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: id, name: id, workArea: ['src/shared'] } })
    expect(r.statusCode, r.body).toBe(201); records.set(id, r.json().record)
  }
  // Existing/imported rows can hold NULL or either earlier appearance version.
  const update = database.client.sqlite.prepare('UPDATE agents SET pixel_appearance=? WHERE handle=?')
  update.run(null, 'synthetic-c-null'); update.run(null, 'synthetic-c-preview')
  update.run(JSON.stringify({ version: 2, style: 'c-forest', lookId: 'scarf' }), 'synthetic-c-manual')
  update.run(JSON.stringify(generatePixelAppearance('synthetic-held-v1')), 'synthetic-c-legacy')
})
afterAll(async () => { await app?.close(); database?.close() })

describe('stable C appearance generation', () => {
  it('keeps the original NULL identity defaults and draws reproducibly with declared weights', () => {
    // Read directly from sealed 2f on 10 September; the log is in next-environments evidence.
    const original = ['bare','scarf','bare','scarf','scarf','bare','bare','scarf','scarf','scarf','bare','scarf']
    original.forEach((look, i) => expect(resolvePixelAppearance('synthetic-old-default-' + i, null).cLook).toBe(look))
    const versionOne = { version: 2, style: 'c-forest', lookId: 'scarf', generation: { source: 'registration', seed: 'synthetic-version-one-draw', catalogueVersion: 1, rareItems: true } }
    expect(pixelAppearanceSchema.parse(versionOne)).toEqual(versionOne)
    const counts = Object.fromEntries(Object.keys(C_WHOLE_LOOK_WEIGHTS).map(id => [id, 0]))
    const samples = 6000
    for (let i = 0; i < samples; i++) {
      const a = generateCWholeAppearance('synthetic-draw-' + i, 'random-preview')
      expect(generateCWholeAppearance('synthetic-draw-' + i, 'random-preview')).toEqual(a)
      expect(pixelAppearanceSchema.parse(a)).toEqual(a)
      counts[a.lookId]!++
    }
    const total = Object.values(C_WHOLE_LOOK_WEIGHTS).reduce((sum, value) => sum + value.weight, 0)
    for (const [id, rule] of Object.entries(C_WHOLE_LOOK_WEIGHTS)) expect(Math.abs(counts[id]! / samples - rule.weight / total)).toBeLessThan(.025)
  })

  it('saves a new birth once, names its automatic source, and preserves it in the plugin\'s people view', async () => {
    const id = 'synthetic-c-birth', before = stored(id)
    expect(before.pixel_appearance).not.toBeNull()
    const appearance = JSON.parse(before.pixel_appearance!)
    expect(appearance.generation).toMatchObject({ source: 'registration', catalogueVersion: 2, rareItems: true })
    expect(appearance.generation.seed.length).toBeGreaterThan(0)
    const r = await read(id)
    expect(r).toMatchObject({ chosen: false, source: 'registered-c', appearance })
    expect(storedPixelAppearance(r.appearance, r.chosen)).toEqual(appearance)
    expect((await read(id)).appearance).toEqual(appearance)
    const people = await app.inject({ url: '/api/plugin-read/v1/people', headers: actor(id) })
    expect(people.statusCode, people.body).toBe(200)
    expect(people.json().agents.find((a: { id: string }) => a.id === idOf(id))).toMatchObject({ appearance, appearanceChosen: false })
    expect(stored(id)).toEqual(before)
  })

  it('offers five whole looks in catalogue 2 and excludes silver glasses only from rare-disabled draws', () => {
    const currentLooks = ['bare', 'scarf', 'sand-apron', 'cocoa-vest', 'silver-glasses']
    const commonSeen = new Set<string>(), allSeen = new Set<string>()
    for (const lookId of currentLooks) expect(pixelAppearanceSchema.parse({ version: 2, style: 'c-forest', lookId })).toMatchObject({ lookId })
    for (let i = 0; i < 600; i++) {
      const seed = 'synthetic-five-look-preview-' + i
      const common = generateCWholeAppearance(seed, 'random-preview', false)
      const all = generateCWholeAppearance(seed, 'random-preview', true)
      expect(common.generation).toMatchObject({ catalogueVersion: 2, source: 'random-preview', rareItems: false })
      expect(common.lookId).not.toBe('silver-glasses')
      expect(pixelAppearanceSchema.parse(common)).toEqual(common)
      commonSeen.add(common.lookId); allSeen.add(all.lookId)
    }
    expect([...allSeen].sort()).toEqual([...currentLooks].sort())
    expect([...commonSeen].sort()).toEqual(currentLooks.filter(id => id !== 'silver-glasses').sort())
  })

  it('does not treat a duplicate registration or ordinary record patch as a new birth', async () => {
    const id = 'synthetic-c-birth', before = stored(id)
    const duplicate = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: id, name: id } })
    expect(duplicate.statusCode).toBe(409)
    const patch = await app.inject({ method: 'PATCH', url: '/api/records/' + records.get(id), headers: PERSON, payload: { dataPatch: { runtime: 'codex' } } })
    expect(patch.statusCode, patch.body).toBe(200)
    expect(stored(id)).toEqual(before)
  })

  it('leaves old NULL, manual C, legacy version 1 and their sizes untouched on reads and patches', async () => {
    for (const [id, source] of [['synthetic-c-null', 'identity-default-c'], ['synthetic-c-manual', 'saved-c'], ['synthetic-c-legacy', 'saved-legacy']]) {
      const before = stored(id!)
      expect((await read(id!)).source).toBe(source)
      const patch = await app.inject({ method: 'PATCH', url: '/api/records/' + records.get(id!), headers: PERSON, payload: { dataPatch: { runtime: 'codex' } } })
      expect(patch.statusCode, patch.body).toBe(200)
      expect((await read(id!)).source).toBe(source)
      expect(stored(id!)).toEqual(before)
    }
  })

  it('does not save a preview until PUT, validates its seed, and refuses a forged birth source', async () => {
    const id = 'synthetic-c-preview', before = stored(id)
    const preview = generateCWholeAppearance('synthetic-preview-only', 'random-preview', false)
    expect(stored(id)).toEqual(before)
    expect((await put(id, preview)).statusCode).toBe(200)
    expect(await read(id)).toMatchObject({ source: 'saved-random-c', chosen: true, appearance: preview })
    expect(stored(id).pixel_scale).toBe(before.pixel_scale)
    const saved = stored(id)
    const different = { ...preview, lookId: preview.lookId === 'bare' ? 'scarf' : 'bare' }
    expect((await put(id, different)).statusCode).toBe(400)
    expect((await put(id, { ...preview, generation: { ...preview.generation, source: 'registration' } })).statusCode).toBe(400)
    expect((await put(id, preview, 'synthetic-c-null')).statusCode).toBe(403)
    expect(stored(id)).toEqual(saved)
    const manual = { version: 2, style: 'c-forest', lookId: 'bare' }
    expect((await put(id, manual)).statusCode).toBe(200)
    expect(await read(id)).toMatchObject({ source: 'saved-c', chosen: true, appearance: manual })
    expect((await put(id, null)).statusCode).toBe(200)
    expect(stored(id)).toEqual(before)
  })

  it('does not generate when rebuilding a missing registry row from an already held record', async () => {
    const id = 'synthetic-c-repair', recordId = records.get(id)!
    const agentId = idOf(id)
    database.client.sqlite.prepare('DELETE FROM agent_records WHERE agent_id=?').run(agentId)
    database.client.sqlite.prepare('DELETE FROM agents WHERE id=?').run(agentId)
    const { keepTheAgentRegistryInStep } = await import('../src/server/lib/participants.ts')
    keepTheAgentRegistryInStep({ id: recordId, title: id, handle: id, state: 'active', runtime: undefined, retiredBecause: undefined }, { kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    expect(stored(id).pixel_appearance).toBeNull()
    expect((await read(id)).source).toBe('identity-default-c')
  })

  it('does not call an imported fixture a new birth', () => {
    const id = 'synthetic-c-imported-fixture'
    database.api.createRecord({ workspaceId: 'default', kind: 'agent', title: id, data: { handle: id, state: 'active' }, origin: 'fixture', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    expect(stored(id).pixel_appearance).toBeNull()
  })

  it('uses the existing world starter and secretary grant while ordinary-office agents remain limited to themselves', async () => {
    const id = 'synthetic-c-preview', before = stored(id)
    const readingAs = async (by: string) => (await app.inject({ url: '/api/office/appearance/' + id, headers: actor(by) })).json()
    await withWorld(async () => {
      expect((await readingAs('synthetic-c-birth')).mayChange).toBe(true)
      expect((await readingAs('synthetic-c-legacy')).mayChange).toBe(true)
      expect((await readingAs('synthetic-c-null')).mayChange).toBe(false)
      expect((await put(id, { version: 2, style: 'c-forest', lookId: 'scarf' }, 'synthetic-c-birth')).statusCode).toBe(200)
      expect((await put(id, { version: 2, style: 'c-forest', lookId: 'bare' }, 'synthetic-c-legacy')).statusCode).toBe(200)
      expect((await put(id, null, 'synthetic-c-null')).statusCode).toBe(403)
    })
    expect((await readingAs('synthetic-c-birth')).mayChange).toBe(false)
    expect((await put(id, null, 'synthetic-c-birth')).statusCode).toBe(403)
    expect((await put(id, null)).statusCode).toBe(200)
    expect(stored(id)).toEqual(before)
  })

  it('previews without writes, includes saved scales, and does not turn a default refresh into cross-identity authority', async () => {
    const id = 'synthetic-c-null', other = 'synthetic-c-preview', before = stored(id), otherBefore = stored(other)
    expect(before.pixel_scale).not.toBeNull()
    const preview = await defaultPreview(id)
    expect(preview.plan.agentIds).toEqual([idOf(id)])
    expect(preview.excluded.noPermission.some((item: { agentId: string }) => item.agentId === idOf(other))).toBe(true)
    expect(stored(id)).toEqual(before); expect(stored(other)).toEqual(otherBefore)
    const result = await defaultSave({ ...preview.plan, agentIds: [idOf(id), idOf(other)] }, id)
    expect(result.updated).toEqual([idOf(id)])
    expect(result.skipped).toMatchObject([{ agentId: idOf(other), code: 'permission-refused' }])
    const reading = await read(id)
    expect(reading).toMatchObject({ source: 'updated-default-c', chosen: false, appearance: preview.moles[0].appearance })
    expect(reading.appearance.generation).toMatchObject({ source: 'default-refresh', batchId: preview.plan.batchId })
    expect(stored(id).pixel_scale).toBe(before.pixel_scale); expect(stored(other)).toEqual(otherBefore)
    expect((await put(other, reading.appearance)).statusCode).toBe(400)
  })

  it('skips a newly saved appearance and lost permission, preserves a newer scale, and reports only actual updates', async () => {
    const changed = 'synthetic-c-preview', eligible = 'synthetic-c-repair', owner = 'synthetic-c-birth'
    const handChosen = { version: 2, style: 'c-forest', lookId: 'scarf' }
    const nextScale = JSON.stringify(generatePixelScale('synthetic-independent-size-edit', 'worker'))
    await withWorld(async () => {
      const preview = await defaultPreview(owner)
      expect(preview.plan.agentIds).toContain(idOf(changed)); expect(preview.plan.agentIds).toContain(idOf(eligible))
      expect((await put(changed, handChosen)).statusCode).toBe(200)
      // A separate synthetic size edit occurs after preview. The batch must not overwrite it.
      database.client.sqlite.prepare('UPDATE agents SET pixel_scale=? WHERE handle=?').run(nextScale, eligible)
      const result = await defaultSave({ ...preview.plan, agentIds: [idOf(changed), idOf(eligible)] }, owner)
      expect((await read(changed)).appearance).toEqual(handChosen)
      expect(result.updated).toEqual([idOf(eligible)])
      expect(result.skipped).toMatchObject([{ agentId: idOf(changed), code: 'already-saved' }])
      expect((await read(eligible)).appearance).toEqual(preview.moles.find((item: { agentId: string }) => item.agentId === idOf(eligible)).appearance)
      expect(stored(eligible).pixel_scale).toBe(nextScale)
    })
    const noLongerAllowed = 'synthetic-c-imported-fixture', before = stored(noLongerAllowed)
    const plan = await withWorld(async () => {
      const preview = await defaultPreview(owner)
      expect(preview.plan.agentIds).toContain(idOf(noLongerAllowed))
      return { ...preview.plan, agentIds: [idOf(noLongerAllowed)] } as PixelDefaultRefreshPlan
    })
    const refused = await defaultSave(plan, owner)
    expect(refused.updated).toEqual([])
    expect(refused.skipped).toMatchObject([{ agentId: idOf(noLongerAllowed), code: 'permission-refused' }])
    expect(stored(noLongerAllowed)).toEqual(before)
  })
})
