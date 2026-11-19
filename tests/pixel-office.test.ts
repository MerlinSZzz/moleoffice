// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { generatePixelScale, pixelScaleSchema, PIXEL_SCALE_RANGES } from '../src/shared/pixel-scale.ts'
import { migratePixelScale } from '../src/server/db/pixel-scale-migration.ts'
// The export tool and this asset check share one budget; the running office does not need it.
import imageBudget from '../tools/pixel-office/image-budget.json' with { type: 'json' }
/** Pixel office review contract, criteria 2, 3, 7–11 and 14–15. Mutation evidence is recorded in design/pixel-office/VERIFICATION.md. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { classifyPixelWork, classifyPixelTask, DEFAULT_PIXEL_SCENE, generatePixelAppearance, PIXEL_ITEMS, PIXEL_SLOTS, pixelAppearanceSchema, PIXEL_ART_IDS } from '../src/shared/pixel-office.ts'
import type { FastifyInstance } from 'fastify'
const AS_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const AS_AGENT = { ...AS_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'pixel-worker' }
let database: TestDb, app: FastifyInstance
const databases: TestDb[] = [], scratch: string[] = []
beforeAll(async () => {
  database = await freshDb(); databases.push(database)
  app = (await apiApp()).app
  for (const handle of ['pixel-worker', 'pixel-other']) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_PERSON, payload: { handle, name: handle, workArea: ['src/shared'] } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
})
afterAll(async () => { await app?.close(); for (const d of databases) d.close(); for (const p of scratch) rmSync(p, { recursive: true, force: true }) })
const agentId = (handle: string): string => (database.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id

describe('state interpretation', () => {
  it('an open work record does not prove an executing process', () => {
    expect(classifyPixelWork({ state: 'running', doing: 'writing' }, false)).toBe('work_open')
    expect(classifyPixelWork({ state: 'running' }, true)).toBe('executing')
    expect(classifyPixelWork({ state: 'running' }, true, true)).toBe('checking')
    expect(classifyPixelWork({ state: 'idle' }, false)).toBe('idle')
    expect(classifyPixelWork({ state: 'crashed' }, false)).toBe('failed')
  })
  it('a finished session awaiting release is not an actively running inspector', () => {
    expect(classifyPixelWork({ state: 'finished', finished: { at: '2026-09-08', by: 'test', says: 'done' } }, false)).toBe('waiting_check')
    expect(classifyPixelWork({ state: 'finished' }, false, false, true)).toBe('waiting_check')
    expect(classifyPixelWork({ state: 'idle' }, false, false, true)).toBe('waiting_message')
  })
  it('reads the declared task states and a recorded pause without claiming a process is running', () => {
    expect(['todo','doing','done','blocked','failed'].map(state => classifyPixelTask({state}))).toEqual(['queued','recorded_work','task_completed','blocked','failed'])
    expect(classifyPixelTask({state:'doing',paused:{since:'2026-09-08 10:00:00',why:'Synthetic test pause.'}})).toBe('paused')
    expect(classifyPixelTask({state:'invented'})).toBe('unknown')
  })
})
describe('fixed map sizes', () => {
  it('draws bounded normal sizes around each role midpoint, without clipping at the edges', () => {
    for (const [role, [low, high]] of Object.entries(PIXEL_SCALE_RANGES)) {
      const samples = Array.from({length: 10000}, (_, i) => generatePixelScale('population-' + i, role).value)
      expect(Math.min(...samples)).toBeGreaterThan(low)
      expect(Math.max(...samples)).toBeLessThan(high)
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(Math.abs(mean - (low + high) / 2)).toBeLessThan((high - low) * .01)
      const central = samples.filter(v => Math.abs(v - (low + high) / 2) < (high - low) / 6).length / samples.length
      expect(central).toBeGreaterThan(.65); expect(central).toBeLessThan(.71)
      expect(generatePixelScale('stable', role)).toEqual(generatePixelScale('stable', role))
      expect(pixelScaleSchema.safeParse({version:1, roleAtGeneration:role, value:high + .01}).success).toBe(false)
    }
    expect(generatePixelScale('unset', null)).toEqual({version:1, roleAtGeneration:null, value:1})
    expect(generatePixelScale('custom', 'other-role').value).toBe(1)
  })
  it('saves at registration and preserves size through clothing, reset, role change and migration', async () => {
    const id = agentId('pixel-worker')
    const read = () => database.client.sqlite.prepare('SELECT pixel_scale,role FROM agents WHERE id=?').get(id) as {pixel_scale:string;role:string}
    const original = read()
    const saved = JSON.parse(original.pixel_scale)
    expect(saved).toEqual(generatePixelScale(id, original.role))
    const sizeFromApi = async () => (await app.inject({url:'/api/office/appearance/' + id, headers:AS_AGENT})).json().scale
    expect(await sizeFromApi()).toEqual(saved)
    for (const appearance of [generatePixelAppearance('new-clothes'), null]) {
      const reply = await app.inject({method:'PUT',url:'/api/office/appearance/' + id,headers:AS_AGENT,payload:{appearance}})
      expect(reply.statusCode,reply.body).toBe(200)
      expect(read().pixel_scale).toBe(original.pixel_scale)
    }
    // Synthetic role change tests the read and migration behaviour independently of governance.
    database.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run('secretary',id)
    expect(await sizeFromApi()).toEqual(saved)
    expect(migratePixelScale(database.client.sqlite)).toBe(0)
    database.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(original.role,id)
    database.client.sqlite.prepare('UPDATE agents SET pixel_scale=NULL WHERE id=?').run(id)
    expect(await sizeFromApi()).toBeNull()
    expect(read().pixel_scale).toBeNull() // GET does not invent or save a replacement.
    expect(migratePixelScale(database.client.sqlite)).toBe(1)
    expect(read().pixel_scale).toBe(original.pixel_scale)
    expect(migratePixelScale(database.client.sqlite)).toBe(0)
  })
})
describe('appearance choices', () => {
  it('keeps the same seed stable, validates slots and varies the independent layers', () => {
    expect(generatePixelAppearance('same')).toEqual(generatePixelAppearance('same'))
    const a = generatePixelAppearance('other')
    expect(a).not.toEqual(generatePixelAppearance('same'))
    expect(pixelAppearanceSchema.safeParse({ ...a, top: { item: 'boots', colour: 'blue' } }).success).toBe(false)
    const samples = Array.from({ length: 4000 }, (_, i) => generatePixelAppearance('probability-' + i))
    const wear = (slot: typeof PIXEL_SLOTS[number]) => samples.filter(s => s[slot] !== null).length / samples.length
    expect(wear('top')).toBeGreaterThan(.9); expect(wear('shoes')).toBeGreaterThan(.75)
    expect(wear('head')).toBeLessThan(.35); expect(wear('badge')).toBeLessThan(.23)
    const items = samples.flatMap(s => PIXEL_SLOTS.flatMap(slot => s[slot] ? [PIXEL_ITEMS.find(i => i.id === s[slot]!.item)!] : []))
    expect(items.filter(i => i.rarity === 'common').length / items.length).toBeGreaterThan(.65)
    expect(items.filter(i => i.rarity === 'rare').length / items.length).toBeLessThan(.09)
    for (let i = 0; i < 200; i++) { const choice = generatePixelAppearance('no-rare-' + i, false); expect(PIXEL_SLOTS.some(slot => choice[slot] && PIXEL_ITEMS.find(item => item.id === choice[slot]!.item)?.rarity === 'rare')).toBe(false) }
  })
  it('reads and saves a newly registered id, persists the whole outfit, and rejects other agents', async () => {
    const id = agentId('pixel-worker'), other = agentId('pixel-other')
    const read = await app.inject({ url: '/api/office/appearance/' + id, headers: AS_AGENT })
    expect(read.statusCode, read.body).toBe(200); expect(read.json().chosen).toBe(false)
    const appearance = generatePixelAppearance('saved-outfit')
    const saved = await app.inject({ method: 'PUT', url: '/api/office/appearance/' + id, headers: AS_AGENT, payload: { appearance } })
    expect(saved.statusCode, saved.body).toBe(200)
    const reread = await app.inject({ url: '/api/office/appearance/' + id, headers: AS_AGENT })
    expect(reread.json()).toMatchObject({ appearance, chosen: true })
    const refused = await app.inject({ method: 'PUT', url: '/api/office/appearance/' + other, headers: AS_AGENT, payload: { appearance } })
    expect(refused.statusCode).toBe(403)
    expect((await app.inject({ url: '/api/office/appearance/' + other, headers: AS_AGENT })).json().chosen).toBe(false)
    const malformed = await app.inject({ method: 'PUT', url: '/api/office/appearance/' + id, headers: AS_AGENT, payload: { appearance: { ...appearance, top: { item: 'boots', colour: 'blue' } } } })
    expect(malformed.statusCode).toBe(400)
    expect((await app.inject({ url: '/api/office/appearance/' + id, headers: AS_AGENT })).json().appearance).toEqual(appearance)
  })
})
// WAVE 13Y ROUND 119, ITEM 52: THE OLDER BUILT-IN MAP IS DELETED, and with it the scene door and six of the seven scene
// settings. Whether the office map moves is the one setting left, and the plugin's row on the Settings page changes it.
// The stored row keeps the other six as they were, because the default-look refresh still reads rare items from it.
it('whether the office map moves is the one setting left, it is durable, and a worker cannot change it', async () => {
  const stored = () => JSON.parse((database.client.sqlite.prepare('SELECT settings FROM office_scene_settings WHERE only_row = 1').get() as { settings: string }).settings)
  const refused = await app.inject({ method: 'PATCH', url: '/api/office/scene-settings', headers: AS_AGENT, payload: { motion: false } })
  expect(refused.statusCode).toBe(403)
  const save = await app.inject({ method: 'PATCH', url: '/api/office/scene-settings', headers: AS_PERSON, payload: { motion: false } })
  expect(save.statusCode, save.body).toBe(200)
  const reread = await app.inject({ url: '/api/office/scene-settings', headers: AS_AGENT })
  expect(reread.json()).toMatchObject({ settings: { motion: false }, chosen: true, mayChange: false })
  expect(reread.json().settings).toEqual({ motion: false })
  // THE OTHER SIX ARE KEPT IN THE STORED ROW AS THEY WERE: a change of motion changes motion alone.
  const before = { ...DEFAULT_PIXEL_SCENE, scene: 'night-library', scope: 'office', rareItems: false, seed: 'test-settings', motion: false }
  database.client.sqlite.prepare('UPDATE office_scene_settings SET settings = ? WHERE only_row = 1').run(JSON.stringify(before))
  const again = await app.inject({ method: 'PATCH', url: '/api/office/scene-settings', headers: AS_PERSON, payload: { motion: true } })
  expect(again.statusCode, again.body).toBe(200)
  expect(stored()).toEqual({ ...before, motion: true })
  // A CHANGE THAT NAMES ONE OF THE OLDER SCENE'S SETTINGS IS REFUSED, and nothing is stored.
  const scene = await app.inject({ method: 'PATCH', url: '/api/office/scene-settings', headers: AS_PERSON, payload: { ...DEFAULT_PIXEL_SCENE, motion: false } })
  expect(scene.statusCode, scene.body).toBe(400)
  expect(stored()).toEqual({ ...before, motion: true })
})
it('reading the people, the work and the talk does not deliver or read messages, and an agent cannot inspect a private exchange', async () => {
  const write = async (from: string, to: string) => app.inject({ method: 'POST', url: '/api/records', headers: { ...AS_AGENT, 'x-mole-office-actor-id': from }, payload: { kind: 'message', title: 'Pixel office test communication', data: { body: 'Synthetic communication for a test.', to: [{ kind: 'agent', id: agentId(to) }] } } })
  // NOTHING HOLDS THE ADDRESSEE IN THIS TEST OFFICE, so the office stores the agent's message, routes it and answers 409.
  // The message is stored all the same, and the talk read below lists it.
  const own = await write('pixel-other', 'pixel-worker'); expect(own.statusCode, own.body).toBe(409)
  const privateMessage = await app.inject({ method: 'POST', url: '/api/records', headers: AS_PERSON, payload: { kind: 'message', title: 'Private fixture conversation', data: { body: 'Synthetic private message.', to: [{ kind: 'agent', id: agentId('pixel-other') }] } } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(privateMessage.statusCode, privateMessage.body).toBe(409)
  // An expired synthetic hold exercises the read-only presence path. A normal hold read releases it.
  database.client.sqlite.prepare('INSERT INTO handle_holds (id,agent_id,session_record_id,machine,runtime,claimed_at,last_heard_at) VALUES (?,?,?,?,?,?,?)').run('expired-pixel-test',agentId('pixel-worker'),'synthetic-old-session','synthetic-machine','codex','2000-01-01 00:00:00','2000-01-01 00:00:00')
  const snapshot = () => JSON.stringify(['message_delivery','conversation_reads','handle_holds'].map(table => database.client.sqlite.prepare('SELECT * FROM ' + table).all()))
  const before = snapshot()
  for (let i=0;i<2;i++) {
    for (const view of ['people', 'work']) {
      const result = await app.inject({ url: '/api/plugin-read/v1/' + view, headers: AS_AGENT })
      expect(result.statusCode, result.body).toBe(200)
    }
    const talk = await app.inject({ url: '/api/plugin-read/v1/talk?limit=500', headers: AS_AGENT })
    expect(talk.statusCode, talk.body).toBe(200)
    expect(talk.json().messages.map((m: {id:string}) => m.id)).toContain(own.json().record.id)
    expect(talk.json().messages.map((m: {id:string}) => m.id)).not.toContain(privateMessage.json().record.id)
  }
  expect(snapshot()).toBe(before)
})
it('ships every declared generated image with matching bytes, hashes and non-empty budget accounting', () => {
  const root = join(process.cwd(), 'public/pixel-office/art')
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  expect(manifest.entries.map((e: {id:string}) => e.id).sort()).toEqual([...PIXEL_ART_IDS].sort())
  const files = readdirSync(root).filter(name => /\.(png|webp|jpg|jpeg|avif|gif|svg)$/i.test(name))
  expect(files.sort()).toEqual(manifest.entries.map((e: {export:{file:string}}) => e.export.file).sort())
  let total = 0
  for (const entry of manifest.entries) {
    const file = join(root, entry.export.file), bytes = readFileSync(file)
    expect(statSync(file).size).toBe(entry.export.bytes)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.export.sha256)
    expect(entry.prompt.length).toBeGreaterThan(100)
    expect(entry.export.pixelIdentical).toBe(true)
    total += bytes.length
  }
  expect(total).toBeGreaterThan(0)
  expect(total).toBe(manifest.bytes.gitImages)
  expect(total).toBeLessThanOrEqual(imageBudget.gitImages)
  expect(manifest.entries.reduce((sum:number,e:{original:{bytes:number}}) => sum+e.original.bytes,0)).toBe(manifest.bytes.originalImages)
  expect(manifest.bytes.originalImages).toBeGreaterThan(0)
  expect(manifest.bytes.originalImages).toBeLessThanOrEqual(imageBudget.originalImages)
  expect(manifest.limits).toEqual({gitImages:imageBudget.gitImages,originalImages:imageBudget.originalImages})
})
it('shows all explicitly claimed tasks and their separate states without inventing execution', async () => {
  const session = await app.inject({method:'POST',url:'/api/records',headers:AS_AGENT,payload:{kind:'session',title:'Synthetic pixel assignment test',data:{state:'running',runtime:'codex',servingAgent:'pixel-worker'}}})
  expect(session.statusCode,session.body).toBe(201)
  const ids:string[]=[]
  for (const state of ['todo','doing','blocked']) {
    const task = await app.inject({method:'POST',url:'/api/records',headers:AS_AGENT,payload:{kind:'task',title:'Synthetic task '+state,data:{state}}})
    expect(task.statusCode,task.body).toBe(201); ids.push(task.json().record.id)
  }
  const claim = await app.inject({method:'POST',url:'/api/claims',headers:AS_AGENT,payload:{run:session.json().record.id,things:ids.map(id => ({what:'record',id}))}})
  expect(claim.statusCode,claim.body).toBe(201)
  const result=await app.inject({url:'/api/plugin-read/v1/work?agents='+agentId('pixel-worker'),headers:AS_AGENT})
  expect(result.statusCode,result.body).toBe(200)
  const work=result.json().work.filter((w:{agent:string}) => w.agent===agentId('pixel-worker'))
  expect(work.filter((w:{id:string}) => ids.includes(w.id)).map((w:{detail:string})=>w.detail).sort()).toEqual(['blocked','queued','recorded_work'])
  expect(work.every((w:{executing:boolean})=>!w.executing)).toBe(true)
})
it('exports and restores chosen appearances and settings, while old archives leave later choices intact', async () => {
  mkdirSync('.logs', { recursive: true })
  const folder = mkdtempSync(join(process.cwd(), '.logs', 'pixel-archive-')); scratch.push(folder)
  const id = agentId('pixel-worker')
  const beforeScale = (database.client.sqlite.prepare('SELECT pixel_scale FROM agents WHERE id=?').get(id) as {pixel_scale:string}).pixel_scale
  const beforeAppearance = (await app.inject({ url: '/api/office/appearance/' + id, headers: AS_PERSON })).json().appearance
  const beforeSettings = JSON.parse((database.client.sqlite.prepare('SELECT settings FROM office_scene_settings').get() as {settings:string}).settings)
  const { writeExport } = await import('../src/server/lib/export.ts')
  writeExport(folder)
  const restored = await freshDb(); databases.push(restored)
  const { applyImport, planImport } = await import('../src/server/lib/import.ts')
  const result = applyImport(folder)
  expect(result.applied, JSON.stringify(result)).toBe(true)
  expect(JSON.parse((restored.client.sqlite.prepare('SELECT pixel_appearance AS appearance FROM agents WHERE id=?').get(id) as {appearance:string}).appearance)).toEqual(beforeAppearance)
  expect(JSON.parse((restored.client.sqlite.prepare('SELECT settings FROM office_scene_settings').get() as {settings:string}).settings)).toEqual(beforeSettings)
  expect((restored.client.sqlite.prepare('SELECT pixel_scale FROM agents WHERE id=?').get(id) as {pixel_scale:string}).pixel_scale).toBe(beforeScale)
  const participants = join(folder, 'participants.md')
  const text = readFileSync(participants, 'utf8')
  expect(text).toContain('pixelAppearance:')
  writeFileSync(participants, text.replace(/^pixelAppearance:.*\n/gm, '').replace(/^pixelScale:.*\n/gm, ''))
  const old = applyImport(folder)
  expect(old.applied, JSON.stringify(old)).toBe(true)
  expect(JSON.parse((restored.client.sqlite.prepare('SELECT pixel_appearance AS appearance FROM agents WHERE id=?').get(id) as {appearance:string}).appearance)).toEqual(beforeAppearance)
  expect(JSON.stringify(planImport(folder))).toContain('leave the saved appearance')
  expect((restored.client.sqlite.prepare('SELECT pixel_scale FROM agents WHERE id=?').get(id) as {pixel_scale:string}).pixel_scale).toBe(beforeScale)
  const oldTarget = await freshDb(); databases.push(oldTarget)
  const newImporter = await import('../src/server/lib/import.ts')
  expect(newImporter.applyImport(folder).applied).toBe(true)
  const imported = oldTarget.client.sqlite.prepare('SELECT pixel_scale,role FROM agents WHERE id=?').get(id) as {pixel_scale:string;role:string}
  expect(JSON.parse(imported.pixel_scale)).toEqual(generatePixelScale(id,imported.role))
  writeFileSync(participants, text.replace(/^pixelScale:.*$/gm, 'pixelScale: "broken-json"'))
  expect(newImporter.planImport(folder).ok).toBe(false)
  expect(() => newImporter.applyImport(folder)).toThrow(/pixelScale/)
  expect((oldTarget.client.sqlite.prepare('SELECT pixel_scale FROM agents WHERE id=?').get(id) as {pixel_scale:string}).pixel_scale).toBe(imported.pixel_scale)
}, 60000)
