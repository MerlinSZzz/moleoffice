// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeEach, afterEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { SidebarArrangement } from '../src/shared/sidebar-arrangement.ts'
import type { SidebarSetting } from '../src/server/lib/sidebar.ts'
let db: TestDb, app: FastifyInstance
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeEach(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); db.close() })
async function read(): Promise<SidebarSetting> { const r = await app.inject({ url: '/api/sidebar' }); expect(r.statusCode, r.body).toBe(200); return r.json() }
async function apply(arrangement: SidebarArrangement, extra = {}) { const row = await read(); return app.inject({ method: 'POST', url: '/api/sidebar', headers, payload: { version: row.version, arrangement, because: 'Made-up sidebar change', ...extra } }) }
async function restore(from: string) { const row = await read(); return app.inject({ method: 'POST', url: '/api/sidebar/restore', headers, payload: { version: row.version, from, because: 'Made-up sidebar restoration' } }) }
async function candidate() {
  const { arrangement } = await read()
  const next = structuredClone(arrangement) as { groups: { key: string; keys: string[] }[] }
  const agents = next.groups.find(group => group.key === 'agents')!, office = next.groups.find(group => group.key === 'office')!
  office.keys.unshift(...agents.keys.splice(0))
  const all = next.groups.find(group => group.key === 'all')!; all.keys.reverse()
  return next
}
function stored() { return JSON.stringify({ row: db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name='office.sidebar'").get(), ledger: db.client.sqlite.prepare("SELECT * FROM changes WHERE record_id='setting:sidebar' ORDER BY rowid").all() }) }

it('preview writes nothing, describes exactly the saved moves and reminders, and a repeated Apply writes no ledger row', async () => {
  const { movesBetween } = await import('../src/shared/sidebar-arrangement.ts')
  const before = await read(), next = await candidate(), initial = stored()
  const preview = await app.inject({ method: 'POST', url: '/api/sidebar/preview', payload: { arrangement: next } })
  expect(preview.statusCode).toBe(200); expect(stored()).toBe(initial)
  expect(preview.json().problems).toEqual([]); expect(preview.json().reminders).toContain('Agents will be empty. Its caption and category page will have no pages.')
  expect((await apply(next)).statusCode).toBe(200)
  const after = await read()
  expect(after.arrangement).toEqual(next); expect(after.version).not.toBe(before.version)
  expect(preview.json().moves).toEqual(movesBetween(before.arrangement, after.arrangement))
  const saved = stored(), version = after.version
  expect((await apply(next)).json().written).toBe(false)
  expect(stored()).toBe(saved); expect((await read()).version).toBe(version)
  const reorderedFields = { groups: next.groups.map(group => ({ keys: group.keys, key: group.key })) }
  expect((await apply(reorderedFields)).json().written).toBe(false); expect(stored()).toBe(saved)
  const warning = structuredClone(next)
  const office = warning.groups.find(group => group.key === 'office')!, developer = warning.groups.find(group => group.key === 'developer')!
  developer.keys.push(office.keys.shift()!)
  const allowed = await app.inject({ method: 'POST', url: '/api/sidebar/preview', payload: { arrangement: warning } })
  expect(allowed.json().problems).toEqual([]); expect(allowed.json().reminders.join(' ')).toContain('Normal mode will not show it.')
  expect((await apply(warning)).statusCode).toBe(200)
})

it('R1 through R5 and a stale version refuse in words and change neither the row, ledger nor version', async () => {
  expect((await apply(await candidate())).statusCode).toBe(200)
  const good = await read()
  const bad = (change: (value: { groups: { key: string; keys: string[] }[] }) => void) => { const value = structuredClone(good.arrangement) as { groups: { key: string; keys: string[] }[] }; change(value); return value }
  const edits: [SidebarArrangement, string][] = [
    [bad(value => value.groups.reverse()), 'five sidebar groups'],
    [bad(value => value.groups[0]!.keys.pop()), 'required'],
    [bad(value => value.groups[0]!.keys.push(value.groups[0]!.keys[0]!)), 'exactly once'],
    [bad(value => value.groups[3]!.keys.push('settings', 'messages', 'made-up-route')), 'stands in no sidebar group'],
    // Wave 13r round 5, item 2: a page may now leave All projects, so the refused edit here is a page
    // shipped elsewhere moving in. Working was shipped in Agents; candidate() put it first in Office.
    [bad(value => value.groups[0]!.keys.push(value.groups[3]!.keys.shift()!)), 'cannot move into All projects'],
    [bad(value => { const all = value.groups[0]!, project = value.groups[1]!; all.keys = all.keys.filter(key => key !== 'flows'); project.keys.push('flows') }), 'does not read one project'],
    [bad(value => { const office = value.groups[3]!, project = value.groups[1]!; project.keys.push(office.keys.shift()!) }), 'does not read one project'],
    [bad(value => value.groups[3]!.keys.push(value.groups[4]!.keys.shift()!)), 'must stay in Developer'],
  ]
  for (const [arrangement, reason] of edits) {
    const snapshot = stored()
    const preview = await app.inject({ method: 'POST', url: '/api/sidebar/preview', payload: { arrangement } })
    expect(preview.json().problems.join(' ')).toContain(reason)
    const reply = await apply(arrangement)
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json()).toMatchObject({ code: 'sidebarSettingRefused' })
    expect(reply.json().error).toContain(reason); expect(reply.json().error).toMatch(/Nothing was changed\.$/)
    expect(stored()).toBe(snapshot); expect((await read()).version).toBe(good.version)
  }
  const word = (await app.inject({ url: '/api/words/table?key=nav.flows' })).json().words[0]
  expect((await app.inject({ method: 'POST', url: '/api/words/table', headers, payload: { key: word.key, version: word.version, en: 'Made-up Flow page', zh: word.zh, chineseMatchesEnglish: false, because: 'Made-up rail word proof' } })).statusCode).toBe(200)
  const renamed = await app.inject({ method: 'POST', url: '/api/sidebar/preview', payload: { arrangement: edits[5]![0] } })
  expect(renamed.json().problems.join(' ')).toContain('Made-up Flow page cannot move to This project')
  const snapshot = stored(), stale = await apply(await candidate(), { version: 'made-up-stale-version' })
  expect(stale.statusCode).toBe(409); expect(stale.json().error).toContain('changed after you read it')
  expect(stored()).toBe(snapshot); expect((await read()).version).toBe(good.version)
  for (const payload of [{ groups: null }, { groups: [{ key: 'all', keys: [1] }] }, { groups: [], caption: 'Made-up caption' }]) {
    const reply = await apply(payload as unknown as SidebarArrangement)
    expect(reply.statusCode).toBe(400); expect(stored()).toBe(snapshot)
  }
})

// THE CRITERION OF WAVE 13R ROUND 5, ITEM 2, on one decision, with the owner's example in a second
// decision. Before it, a page could not move "into or out of All projects",
// so Flows into Developer was refused. Now a page shipped in All projects may move to any group except This
// project, and may come back; the top bar reads each page's own scope mark, not its group
// (tests/the-top-bar-names-a-project-only-over-a-page-that-reads-one.test.ts).
it('accepts Flows into Developer and into Office, and lets it come back to All projects', async () => {
  const shipped = (await read()).shipped
  const moved = (to: string) => {
    const value = structuredClone(shipped) as { groups: { key: string; keys: string[] }[] }
    const all = value.groups.find(group => group.key === 'all')!; all.keys = all.keys.filter(key => key !== 'flows')
    value.groups.find(group => group.key === to)!.keys.push('flows')
    return value
  }
  const developer = await app.inject({ method: 'POST', url: '/api/sidebar/preview', payload: { arrangement: moved('developer') } })
  expect(developer.json().problems).toEqual([])
  expect(developer.json().reminders).toContain('Flows will be in Developer. Normal mode will not show it.')
  const intoDeveloper = await apply(moved('developer'))
  expect(intoDeveloper.statusCode, intoDeveloper.body).toBe(200)
  expect((await read()).arrangement.groups.find(group => group.key === 'developer')!.keys).toContain('flows')
  const intoOffice = await apply(moved('office'))
  expect(intoOffice.statusCode, intoOffice.body).toBe(200)
  expect((await read()).arrangement.groups.find(group => group.key === 'office')!.keys).toContain('flows')
  const back = await apply(structuredClone(shipped))
  expect(back.statusCode, back.body).toBe(200)
  expect((await read()).arrangement).toEqual(shipped)
})

it('keeps writer, time, reason and complete history, puts back an earlier edit and restores shipped through the doors', async () => {
  const original = await read(), first = await candidate()
  expect((await apply(first)).statusCode).toBe(200)
  const second = structuredClone(first); second.groups[3]!.keys.reverse()
  expect((await apply(second, { because: 'Made-up second sidebar change' })).statusCode).toBe(200)
  const history = (await app.inject({ url: '/api/sidebar/history?offset=0' })).json()
  expect(history.versions).toHaveLength(2); expect(history.next).toBe(null)
  expect(history.versions[1]).toMatchObject({ by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, because: 'Made-up sidebar change', before: original.arrangement, after: first })
  expect(history.versions[1].at).toBeTruthy()
  expect((await restore(history.versions[1].id)).statusCode).toBe(200)
  expect((await read()).arrangement).toEqual(first)
  expect((await restore('shipped')).statusCode).toBe(200)
  expect((await read()).arrangement).toEqual(original.shipped); expect((await read()).changed).toBe(false)
  expect(db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name='office.sidebar'").get()).toBeUndefined()
  const snapshot = stored()
  expect((await restore('made-up-other-setting-change')).statusCode).toBe(404); expect(stored()).toBe(snapshot)
  // Eleven ordinary edits exercise the ten-at-a-time history boundary.
  for (let i = 0; i < 11; i++) { const next = structuredClone(first); if (i % 2) next.groups[3]!.keys.reverse(); expect((await apply(next)).statusCode).toBe(200) }
  const page = (await app.inject({ url: '/api/sidebar/history' })).json()
  expect(page.versions).toHaveLength(10); expect(page.next).toBe(10)
  expect((await app.inject({ url: '/api/sidebar/history?offset=10' })).json().versions.length).toBeGreaterThan(0)
})

it('refuses a worker with 403, accepts the owner and a secretary with its own key, and leaves preview open to a reader', async () => {
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  for (const role of ['worker', 'secretary']) {
    const handle = 'made-up-sidebar-' + role
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: 'Made-up sidebar ' + role, role } })
    expect(made.statusCode, made.body).toBe(201)
    const agent = agentByHandle(handle)!, next = await candidate(), before = await read(), snapshot = stored()
    const actor = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(agent.id, null) }
    const preview = await app.inject({ method: 'POST', url: '/api/sidebar/preview', headers: actor, payload: { arrangement: next } })
    expect(preview.statusCode).toBe(200); expect(stored()).toBe(snapshot)
    const payload = { arrangement: next, version: before.version, because: 'Made-up authority check' }
    const reply = await app.inject({ method: 'POST', url: '/api/sidebar', headers: actor, payload })
    expect(reply.statusCode, reply.body).toBe(role === 'worker' ? 403 : 200)
    if (role === 'worker') {
      expect(reply.json().error).toContain('Only the owner or a secretary'); expect(stored()).toBe(snapshot)
      expect((await app.inject({ method: 'POST', url: '/api/sidebar/restore', headers: actor, payload: { version: before.version, from: 'shipped', because: 'Made-up worker restore' } })).statusCode).toBe(403)
    } else {
      expect((await read()).arrangement).toEqual(next)
      const keyless = { ...actor }; delete (keyless as Record<string, string>)['x-mole-office-key']
      expect((await app.inject({ method: 'POST', url: '/api/sidebar', headers: keyless, payload: { ...payload, version: (await read()).version } })).statusCode).toBe(403)
    }
  }
  expect((await restore('shipped')).statusCode).toBe(200)
})

it('names a refused stored row, draws shipped instead, validates history again and always recovers through shipped restore', async () => {
  const { loadSidebarArrangement } = await import('../src/server/lib/sidebar.ts')
  const initial = await read(), invalid = { groups: [{ key: 'office', keys: ['made-up-removed-page'] }] }
  db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.sidebar', JSON.stringify(invalid))
  loadSidebarArrangement()
  const refused = await read()
  expect(refused.arrangement).toEqual(initial.shipped)
  expect(refused.storedButNotUsed?.arrangement).toEqual(invalid)
  expect(refused.storedButNotUsed?.problems.join(' ')).toContain('made-up-removed-page')
  expect((await restore('shipped')).statusCode).toBe(200)
  const cleared = db.client.sqlite.prepare("SELECT old_value FROM changes WHERE record_id='setting:sidebar' ORDER BY rowid DESC LIMIT 1").get() as { old_value: string }
  expect(JSON.parse(cleared.old_value)).toEqual({ arrangement: initial.shipped, storedButNotUsed: invalid })
  expect((await read()).storedButNotUsed).toBe(null); expect((await read()).changed).toBe(false)
  expect((await apply(await candidate())).statusCode).toBe(200)
  const id = (await app.inject({ url: '/api/sidebar/history' })).json().versions[0].id
  db.client.sqlite.prepare('UPDATE changes SET new_value=? WHERE id=?').run(JSON.stringify({ arrangement: invalid, because: 'Made-up old release' }), id)
  loadSidebarArrangement()
  const snapshot = stored(), version = (await read()).version
  const denied = await restore(id)
  expect(denied.statusCode).toBe(400); expect(denied.json().error).toContain('required')
  expect(stored()).toBe(snapshot); expect((await read()).version).toBe(version)
  db.client.sqlite.prepare("UPDATE runtime_settings SET value='not JSON' WHERE name='office.sidebar'").run()
  loadSidebarArrangement()
  expect((await read()).storedButNotUsed?.problems).toEqual(['The stored sidebar arrangement is not readable JSON.'])
  expect((await restore('shipped')).statusCode).toBe(200)
})

it('rolls back the arrangement row if the ledger write fails', async () => {
  const initial = stored(), version = (await read()).version
  db.client.sqlite.exec("CREATE TRIGGER made_up_sidebar_failure BEFORE INSERT ON changes WHEN NEW.record_id='setting:sidebar' BEGIN SELECT RAISE(ABORT, 'Made-up ledger failure'); END")
  expect((await apply(await candidate())).statusCode).toBe(409)
  expect(stored()).toBe(initial); expect((await read()).version).toBe(version)
})
