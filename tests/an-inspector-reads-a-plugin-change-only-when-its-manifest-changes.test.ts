// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
/**
 * AN INSPECTOR READS A PLUGIN-ONLY CHANGE ONLY WHEN IT CHANGES THE MANIFEST. Wave 13x round 17, step 4 of the plugin
 * pipeline udGnc-Bsr15R (block 1Asl25_3DvQM), under a decision: not read, except when the manifest or interface
 * changes, while the privacy and key checks run as usual; a plugin's changes are kept apart from the office's
 * development.
 *
 * What is proved here, each by running the REAL tool, tools/the-inspector.mjs, with `--dry` so no model runs and no
 * verdict is written, against a throwaway git checkout and the REAL office on a port of its own:
 *
 *   1. A change that touches only one plugin's folder and leaves its manifest alone is not read. The tool sends no diff
 *      of it, the office puts none into the prompt even when one is sent, the prompt says the rule, the tool prints
 *      which way the rule went, and the run keeps it.
 *   2. A plugin-only change that touches the manifest is read as any change, and the line says so.
 *   3. A change to a plugin and to anything else, here the interface the plugin reads, is read as any change: the
 *      normal path. The prompt says nothing of the rule, and the line says it does not apply.
 *
 * The secret scan and the privacy gate of a plugin-only change run at the merge queue's test step. The queue's half
 * of this rule asks no check again for such a change.
 *
 * The plugin is made up, and every file in the checkouts is synthetic. The checkouts are made in the system's temporary
 * folder and removed after. Nothing here touches the live office's port.
 *
 * MUTATIONS, each alone, after a control run:
 *   - tools/the-inspector.mjs, `changesIn`: read the diff whatever the rule says (`plugin.read ? oneDiff(base, path) :
 *     NOT_READ_BY_THE_PLUGIN_RULE` → `oneDiff(base, path)`). Case 1 goes red where the tool's request carries the code.
 *   - src/server/lib/inspection.ts, `changesInTheWorkArea`: drop the map that puts NOT_READ_BY_THE_PLUGIN_RULE in place
 *     of the diff. Case 1 goes red where a diff sent to the door reaches the prompt.
 *   - src/shared/plugin-change.ts, `thePluginRuleOf`: answer `read: false` for a change that touches the manifest. Case
 *     2 goes red.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NOT_READ_BY_THE_PLUGIN_RULE } from '../src/shared/plugin-change.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** The worker's area holds the plugins folder and the interface, so every change below is inside it. */
const THE_AREA = ['plugins', 'src']
const PAGE = 'plugins/made-up/src/page.ts'
const MANIFEST = 'plugins/made-up/plugin.json'
const INTERFACE = 'src/shared/plugin-read.ts'
/** A line each changed file gains, so a diff that reached a request or a prompt can be found by it. */
const MARK = 'SYNTHETIC CHANGE OF A MADE-UP PLUGIN'

let t: TestDb
let app: FastifyInstance
let api = ''
const made: string[] = []

interface Sorted {
  workArea: string[] | null
  inside: { path: string; changes: string }[]
  outside: string[]
  says: string
  plugin?: { plugin: { id: string; manifest: boolean } | null; read: boolean; says: string }
}
/** What the tool sent and what the office answered, per run, captured at the production door as it was used. */
const sent = new Map<string, Record<string, unknown>>()
const answered = new Map<string, { prompt: string; changes: Sorted }>()
const PROMPT_ROUTE = /^\/api\/checks\/([^/]+)\/prompt$/u

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A synthetic checkout: main holds the made-up plugin and the interface, and `the-work` adds MARK to `changed`. */
function aCheckout(changed: string[]): string {
  const dir = aTestDatabaseFolder('a-plugin-change')
  made.push(dir)
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: dir, stdio: 'ignore' })
  }
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  write(PAGE, '// The page of a made-up plugin.\n')
  write(MANIFEST, '{ "id": "made-up", "name": "A made-up plugin" }\n')
  write(INTERFACE, '// A stand-in for the interface a plugin reads.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('checkout', '-q', '-b', 'the-work')
  for (const path of changed) write(path, `// ${MARK}, in ${path}.\n`)
  git('commit', '-qam', 'Synthetic change')
  return dir
}

/** A finished run of the worker in `dir`, sealed at its tip by the office. */
async function aRunIn(dir: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('plugin-builder'),
    payload: { kind: 'session', title: 'A synthetic run that changes a made-up plugin', data: { state: 'finished', servingAgent: 'plugin-builder', workingDirectory: dir, doing: 'changing a made-up plugin' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** Run the tool dry against a checkout, and hand back what it printed and how it ended. */
function inspectDry(run: string, dir: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(process.execPath, [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', dir, '--dry'], {
      cwd: REPO,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

/** A run whose change touches `changed`, checked dry by the real tool, with what went each way at the door. */
async function aDryCheckOf(changed: string[]) {
  const dir = aCheckout(changed)
  const run = await aRunIn(dir)
  const ran = await inspectDry(run, dir)
  expect(ran.code, ran.err).toBe(0)
  const request = sent.get(run)
  const reply = answered.get(run)
  if (request === undefined || reply === undefined) throw new Error(`the office answered no prompt for run ${run}`)
  const kept = t.api.getRecord(run)!.data['whatTheCheckWouldRead'] as { pluginRule?: unknown; says: string }
  return { run, ran, request, reply, kept }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  app.addHook('preHandler', (request, _reply, done) => {
    const at = PROMPT_ROUTE.exec(request.url.split('?')[0] ?? '')
    if (at !== null && request.method === 'POST' && !sent.has(at[1] ?? '')) sent.set(at[1] ?? '', request.body as Record<string, unknown>)
    done()
  })
  app.addHook('onSend', (request, _reply, payload, done) => {
    const at = PROMPT_ROUTE.exec(request.url.split('?')[0] ?? '')
    if (at !== null && request.method === 'POST' && typeof payload === 'string' && !answered.has(at[1] ?? '')) {
      answered.set(at[1] ?? '', JSON.parse(payload) as { prompt: string; changes: Sorted })
    }
    done(null, payload)
  })
  await app.ready()
  // THE REAL OFFICE ON A PORT OF ITS OWN, because the tool is a separate process. Port 0 is whatever is free.
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'plugin-builder', name: 'Plugin Builder', role: 'worker', workArea: THE_AREA })
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

// These tests cite the owner's decision.
describe("a plugin-only change is read only when it changes the manifest", () => {
  it('does not read a plugin-only change that leaves the manifest alone, and every line says so', async () => {
    const one = await aDryCheckOf([PAGE])
    expect(one.ran.out).toContain('The plugin rule: A plugin-only change to plugins/made-up that leaves its manifest alone, so its code is not read')
    expect(one.ran.out).toContain("The secret scan of plugins/made-up and the privacy gate run as always, at the merge queue's test step.")

    // THE TOOL READ NO DIFF OF IT AND SENT NONE.
    expect(one.request['changes']).toEqual([{ path: PAGE, changes: NOT_READ_BY_THE_PLUGIN_RULE }])
    expect(JSON.stringify(one.request)).not.toContain(MARK)

    // THE OFFICE SORTED IT BY THE SAME RULE, AND THE PROMPT SAYS THE RULE AND CARRIES NO CODE.
    expect(one.reply.changes.plugin).toMatchObject({ plugin: { id: 'made-up', manifest: false }, read: false })
    expect(one.reply.changes.inside).toEqual([{ path: PAGE, changes: NOT_READ_BY_THE_PLUGIN_RULE }])
    expect(one.reply.prompt).toContain('THE PLUGIN RULE. A plugin-only change to plugins/made-up that leaves its manifest alone')
    expect(one.reply.prompt).toContain('That is the rule, not a gap in this check.')
    expect(one.reply.prompt).not.toContain(MARK)

    // THE RUN KEEPS WHICH WAY IT WENT, and its sentence does not say the file was read.
    expect(one.kept.pluginRule).toMatchObject({ plugin: { id: 'made-up', manifest: false }, read: false })
    expect(one.kept.says).toContain('1 changed file inside the work area is named and not read')
    expect(one.kept.says).not.toContain('1 changed file inside the work area is read')

    // A DIFF SENT TO THE DOOR ANYWAY DOES NOT REACH THE PROMPT: the office decides by the rule, not by what it was sent.
    const withTheCode = { ...one.request, changes: [{ path: PAGE, changes: `+// ${MARK}, sent to the door.` }] }
    const again = await app.inject({ method: 'POST', url: `/api/checks/${one.run}/prompt`, headers: asAgent('inspector-one'), payload: withTheCode })
    expect(again.statusCode, again.body).toBe(200)
    const prompt = (again.json() as { prompt: string }).prompt
    expect(prompt).toContain('THE PLUGIN RULE.')
    expect(prompt).not.toContain(MARK)
  })

  it('reads a plugin-only change that changes the manifest, as any change', async () => {
    const one = await aDryCheckOf([MANIFEST, PAGE])
    expect(one.ran.out).toContain('The plugin rule: A plugin-only change to plugins/made-up that changes its manifest plugins/made-up/plugin.json, so it is read as any change')
    expect(one.reply.changes.plugin).toMatchObject({ plugin: { id: 'made-up', manifest: true }, read: true })
    for (const path of [MANIFEST, PAGE]) {
      expect(one.reply.changes.inside.find((each) => each.path === path)?.changes).toContain(`+// ${MARK}, in ${path}.`)
    }
    expect(one.reply.prompt).toContain('THE PLUGIN RULE. A plugin-only change to plugins/made-up that changes its manifest')
    expect(one.reply.prompt).toContain(MARK)
    expect(one.kept.pluginRule).toMatchObject({ plugin: { id: 'made-up', manifest: true }, read: true })
    expect(one.kept.says).toContain('2 changed files inside the work area are read')
  })

  it('reads a change to a plugin and to the interface it uses as any change, and says the rule does not apply', async () => {
    const one = await aDryCheckOf([PAGE, INTERFACE])
    expect(one.ran.out).toContain("The plugin rule: Not a plugin-only change: it changes a file outside one plugin's folder, so it is read as any change.")
    expect(one.reply.changes.plugin).toMatchObject({ plugin: null, read: true })
    for (const path of [PAGE, INTERFACE]) {
      expect(one.reply.changes.inside.find((each) => each.path === path)?.changes).toContain(`+// ${MARK}, in ${path}.`)
    }
    expect(one.reply.prompt).not.toContain('THE PLUGIN RULE.')
    expect(one.kept.pluginRule).toMatchObject({ read: true })
    expect(one.kept.pluginRule).not.toHaveProperty('plugin')
    expect(one.kept.says).toContain('2 changed files inside the work area are read')
  })
})
