// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The whole roster shares its domain and run-progress reads while keeping each row's answer. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME, defaultAvatarAssetId } from '../src/shared/participants.ts'

let t: TestDb
let working: typeof import('../src/server/lib/working.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')
let avatars: typeof import('../src/server/lib/avatars.ts')
let arrivals: typeof import('../src/server/lib/arrivals.ts')
let workspace: string
const runs = new Map<string, string>()

beforeAll(async () => {
  t = await freshDb()
  working = await import('../src/server/lib/working.ts')
  attachments = await import('../src/server/lib/attachments.ts')
  avatars = await import('../src/server/lib/avatars.ts')
  arrivals = await import('../src/server/lib/arrivals.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  workspace = 'roster-shared-reads'
  createWorkspace({ id: workspace, title: 'Roster shared reads' })
  for (let i = 0; i < 3; i += 1) {
    const agent = t.api.createRecord({
      kind: 'agent', title: `Worker ${String(i)}`, workspaceId: workspace,
      data: { handle: `worker-${String(i)}`, state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
    const run = attachments.openAttachment({ workspaceId: workspace, actor: { type: 'human', id: THE_PERSON }, title: 'A run', agentId: agent.id }).attachment.id
    runs.set(agent.id, run)
    // An earlier drawn picture is not named for the current registry id. Its provenance must be read.
    const mapped = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(agent.id) as { id: string }
    const drawing = defaultAvatarAssetId({ kind: 'agent', id: `earlier-worker-${String(i)}` })
    t.client.sqlite.prepare('INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, licence_source) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)')
      .run(drawing, AVATAR_ASSET_KIND, 'default', GENERATED_AVATAR_MIME, '2026-01-01 00:00:00', GENERATED_AVATAR_LICENCE)
    t.client.sqlite.prepare('UPDATE agents SET avatar_asset_id = ? WHERE id = ?').run(drawing, mapped.id)
    if (i < 2) {
      // Both runs spoke; the first spoke twice, so the test must select the newest request.
      const insert = t.client.sqlite.prepare('INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) VALUES (?, ?, 1, ?, 0, 200, ?, ?)')
      insert.run(`roster-call-${String(i)}`, 1_700_000_000_000 + i * 1_000, 'GET', run, 'header')
      if (i === 0) insert.run('roster-call-newest', 1_700_000_002_000, 'GET', run, 'header')
    }
    t.client.sqlite.prepare(
      "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at) VALUES (?, ?, ?, 'update', 'human', ?, ?, ?)",
    ).run(`roster-change-${String(i)}`, agent.id, workspace, THE_PERSON, run, `2026-01-0${String(i + 1)} 12:00:00`)
  }
}, 60_000)

afterAll(() => t.close())

/** Count reads by the facts they ask for, without requiring any index or execution plan. */
function rosterRead() {
  const sqlite = t.client.sqlite as unknown as { prepare: (source: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  let domains = 0
  let runProgress = 0
  let assetRows = 0
  sqlite.prepare = (source: string) => {
    if (/SELECT id, title, data FROM records WHERE kind = \?/i.test(source) && source.includes("'$.closedAt'")) domains += 1
    if (/from\s+["`]?changes["`]?/i.test(source) && /session_id/i.test(source)) runProgress += 1
    if (/from\s+["`]?assets["`]?\s+where\s+["`]?id/i.test(source)) assetRows += 1
    return original(source)
  }
  try {
    return { reading: working.whoIsWorking(workspace), counts: () => ({ domains, runProgress, assetRows }) }
  } finally {
    sqlite.prepare = original
  }
}

describe('the whole roster shares its readings', () => {
  it('reads open domains once', () => {
    const { reading, counts } = rosterRead()
    expect(reading.rows.length).toBe(runs.size)
    expect(counts().domains).toBe(1)
  })

  it('reads progress for all runs once and names each run’s newest change', () => {
    const { reading, counts } = rosterRead()
    expect(reading.rows.length).toBe(runs.size)
    for (const row of reading.rows) {
      const run = runs.get(row.agentId)
      expect(run).toBeDefined()
      const expected = t.client.sqlite.prepare('SELECT max(at) AS at FROM changes WHERE session_id = ?').get(run) as { at: string | null }
      expect(row.lastProgress.at).toBe(expected.at)
    }
    expect(counts().runProgress).toBe(1)
  })

  it('shares picture rows and gives each agent the picture its own reading gives', () => {
    const onOffer = avatars.avatarsOnOffer()
    expect(onOffer.some((picture) => picture.set === avatars.THE_DEFAULT_PICTURE.set && picture.name === avatars.THE_DEFAULT_PICTURE.name)).toBe(true)
    const { reading, counts } = rosterRead()
    expect(reading.rows.length).toBe(runs.size)
    for (const row of reading.rows) {
      expect(row.participant).not.toBeNull()
      const stored = t.client.sqlite.prepare('SELECT a.id, a.avatar_asset_id AS avatar FROM agents a JOIN agent_records m ON m.agent_id = a.id WHERE m.record_id = ?').get(row.agentId) as { id: string; avatar: string }
      const separate = avatars.pictureShownFor({ kind: 'agent', id: stored.id }, stored.avatar, onOffer)
      expect(row.participant?.avatarUrl).toBe(separate)
      expect(separate).toBe(avatars.offeredAvatarUrl(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name))
    }
    expect(counts().assetRows).toBe(1)
  })

  it('gives each run its newest request and leaves a silent run without one', () => {
    const runIds = [...runs.values()]
    const reading = arrivals.newestRequestOfEachRun(runIds)
    let withCalls = 0
    let silent = 0
    for (const run of runIds) {
      const expected = t.client.sqlite.prepare('SELECT max(at_ms) AS at FROM api_calls WHERE session_id = ?').get(run) as { at: number | null }
      expect(reading.asked.has(run)).toBe(true)
      expect(reading.newest.get(run) ?? null).toBe(expected.at)
      if (expected.at === null) silent += 1
      else withCalls += 1
    }
    expect(withCalls).toBe(2)
    expect(silent).toBe(1)
  })

})
