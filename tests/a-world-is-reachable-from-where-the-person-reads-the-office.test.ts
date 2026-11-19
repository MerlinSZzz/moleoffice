// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
const run = promisify(execFile)
let app: LiveApp
// NAMED FOR THIS PROCESS, so an earlier run's leftovers never block this start (problem b2WEgFgtb_uw).
const name = `code-5b-reachable-${String(process.pid)}`
const h = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
async function post(path: string, body: unknown) {
 const r = await fetch(app.api + path, { method: 'POST', headers: h, body: JSON.stringify(body) })
 const j = await r.json(); expect(r.status, JSON.stringify(j)).toBeLessThan(300); return j
}
// THIS FILE READS A PANEL INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
// The person's act 3a of 15 September 2026 made a record page open at the
// conclusion, where the body holds the summary and nothing else, so the world panel this file is
// about was not on the page at all. `opensAt` writes the reader's own stored choice before the page
// loads. The opening level has its own test in tests/a-reader-goes-no-lower-than-conclusion.test.ts,
// which stores nothing.
beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'reachable-office', viewport: { width: 1440, height: 1000 }, addressForOtherMachines: '127.0.0.2', workspace: 'default' })
  // THE PAGE ON THE SECOND ADDRESS IS THE PERSON'S OTHER COMPUTER, WHICH THEY TRUST. Its requests carry their name and no key, and
  // since item 1 of a decision, that counts as the person only from a machine the office trusts
  // while the window is open. The helper
  // `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says how.
  await trustTheMachineThatCallsThroughTheOtherDoor({ api: app.api, keysFile: join(app.dir, 'keys.json') }, `http://127.0.0.2:${String(app.apiPort)}`)
}, 120_000)
afterAll(async () => {
 try { await run('node', ['tools/isolated-mole-office.mjs', 'stop', name]) } catch (e) {
  // THE STOP TOOL'S OWN WORDS GO INTO THE FAILURE: it says why on its standard output (problem b2WEgFgtb_uw).
  const said = e as { message?: string; stdout?: string; stderr?: string }
  if (!String(e).includes('Nothing here calls itself')) throw new Error(`The world ${name} did not stop: ${said.message ?? String(e)}\n${said.stdout ?? ''}\n${said.stderr ?? ''}`)
 }
 await app?.stop()
})
it('a-world-is-reachable-from-where-the-person-reads-the-office', async () => {
 const session = await post('/api/records', { kind: 'session', title: 'Fixture world starter', data: { state: 'running' } })
 await run('node', ['tools/isolated-mole-office.mjs', 'start', name, '--from', join(app.dir, 'panelx.db'), '--show-to-the-person', '--run', session.record.id, '--api', app.api, '--workspace', 'default'], { env: { ...process.env, MOLE_OFFICE_VITE_CACHE: join(app.dir, 'world-vite-cache') }, timeout: 120_000 })
 const where = JSON.parse(readFileSync(`.logs/isolated/${name}/where.json`, 'utf8'))
 expect(where.webForOtherMachines).toBe(`http://127.0.0.2:${where.webPort}`)
 expect((await fetch(where.webForOtherMachines)).status).toBe(200)
 // REACHABLE IS ASKED AT /api/health, a door that answers anybody, as the tool's own wait asks it. /api/access asks who
 // is calling, and since a decision, a request with no key and no name from a machine the office does not
 // trust is refused there, which says nothing about whether the world can be reached.
 expect((await fetch(where.apiForOtherMachines + '/api/health')).status).toBe(200)
 const ledger = await (await fetch(app.api + '/api/resources')).json()
 for (const id of where.ledgerRows) {
   const row = ledger.resources.find((r: { id: string }) => r.id === id)
   expect(row.detail).toContain(where.webForOtherMachines)
   expect(row.detail).toContain(where.web)
 }
 const report = await post('/api/records', { kind: 'report', title: 'Fixture reachable world', data: { for: 'Browser test', date: '2026-09-08', blocks: [{ id: 'world', type: 'world', label: 'Fixture work area page', web: where.web, api: where.api, webForOtherMachines: where.webForOtherMachines, apiForOtherMachines: where.apiForOtherMachines, ledgerRow: where.ledgerRows[0] }] } })
 for (const [site, expected] of [[app.site, where.web], [app.site.replace('127.0.0.1', '127.0.0.2'), where.webForOtherMachines]]) {
   await app.page.goto(site + '/#/r/' + report.record.id)
   await waitForThePage(app.page)
   await expect.poll(() => app.page.locator('.sb-world-open').getAttribute('href')).toBe(expected)
 }
 if (process.env['CODE_5B_SHOTS']) {
   const dir = process.env['CODE_5B_SHOTS']!; mkdirSync(dir, { recursive: true })
   for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
     await app.page.setViewportSize({ width, height: 1000 }); await app.page.emulateMedia({ colorScheme: theme })
     await app.page.screenshot({ path: `${dir}/world-${width}-${theme}.png`, fullPage: true })
     expect(await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
   }
 }
 const local = await post('/api/records', { kind: 'report', title: 'Fixture local world', data: { for: 'Browser test', date: '2026-09-08', blocks: [{ id: 'local-world', type: 'world', label: 'Fixture local copy', web: where.web }] } })
 await app.page.goto(app.site + '/#/r/' + local.record.id)
 await waitForThePage(app.page)
 expect(await app.page.locator('.sb-world').textContent()).toContain('reachable from this machine only')
}, 150_000)
