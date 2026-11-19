// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN'S PAGE IS SERVED ONLY WHILE IT IS SWITCHED ON, ONLY FROM ITS BUILT FOLDER, AND UNDER A POLICY THAT KEEPS IT
 * SANDBOXED. Wave 13x round 15, step 3 of the plugin pipeline udGnc-Bsr15R (block 3nJsBlPlYhcl), the server half. The
 * drawing half is tests/a-plugin-page-is-drawn-in-a-frame-that-holds-no-key.test.ts.
 *
 * WHAT THIS FILE PROVES, in its own empty office and its own plugins folder (a temporary folder, named to the office by
 * MOLE_OFFICE_PLUGINS), always asking as the frame asks: with no header at all, because a sandboxed frame sends none.
 * 1. With no plugins folder, and for a plugin that is not there, the door says so in a 404.
 * 2. A plugin that is off, or refused, has no file served: a 403 that says why, and none of the file.
 * 3. Switched on, its page is served with its type and the policy: sandboxed, its own files only, no connection, and a
 *    worker only from a blob: address (wave 13x round 19).
 * 4. A path that leaves the built folder is refused, by "..", by a hidden name, and by a link that points out. The link
 *    is a 403 that says the path leads outside the plugin's own dist/ folder (wave 13x round 18).
 * 5. A kind of file the door does not name, and a file that is not there, are 404s that say so.
 * 6. Switched off again, the next request is refused, with no restart.
 * 7. A dist/ that is a link, as git can keep one, has none of its files served: a 403 that says dist/ is a link
 *    (wave 13x round 18).
 * 8. A plugin whose own folder is a link to another place cannot be switched on, and has none of its files served: a
 *    403 that says it was refused because its folder is a link (wave 13x round 19).
 *
 * WHERE THE RULES LIVE: whyAPluginHasNoPage in src/shared/plugins.ts (whether there is a page), aPluginsBuiltFile in
 * src/server/lib/plugins.ts (which file), and src/server/api/plugins.ts (the headers).
 */
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const scratch = aTestDatabaseFolder('plugin-files')
const folder = join(scratch, 'plugins')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_PAGE = '<!doctype html><title>Made-up clock</title><p>made-up clock page</p>'

function aManifest(id: string): object {
  return {
    id,
    name: { en: `Made-up ${id}` },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 20 },
  }
}

function putAPlugin(id: string, manifest: object): void {
  mkdirSync(join(folder, id, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(folder, id, 'plugin.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, id, 'dist', 'main.html'), THE_PAGE)
  writeFileSync(join(folder, id, 'dist', 'assets', 'app.js'), 'window.parent.postMessage({}, "*")')
  writeFileSync(join(folder, id, 'dist', 'notes.md'), '# not a page')
}

/** As the frame asks: no header of any kind. */
function asTheFrame(id: string, path: string) {
  return app.inject({ method: 'GET', url: `/api/plugins/${id}/files/${path}` })
}

async function switchIt(id: string, on: boolean): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/plugins/${id}/switch`, headers: AS_THE_PERSON, payload: { on } })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
}

beforeAll(async () => {
  process.env['MOLE_OFFICE_PLUGINS'] = folder
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(scratch, { recursive: true, force: true })
})

describe('a plugin page is served only while it is on', () => {
  it('1. says there is no plugins folder, and that a plugin is not there', async () => {
    const none = await asTheFrame('made-up-clock', 'main.html')
    expect(none.statusCode).toBe(404)
    expect(none.json().error).toContain('no plugins folder')

    putAPlugin('made-up-clock', aManifest('made-up-clock'))
    const unknown = await asTheFrame('made-up-nothing', 'main.html')
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error).toContain('There is no plugin "made-up-nothing"')
  })

  it('2. serves nothing of a plugin that is off, or refused, and says why', async () => {
    const off = await asTheFrame('made-up-clock', 'main.html')
    expect(off.statusCode).toBe(403)
    expect(off.json().error).toContain('is switched off')
    expect(off.body).not.toContain('made-up clock page')

    putAPlugin('made-up-broken', { ...aManifest('made-up-broken'), reads: ['secrets'] })
    const refused = await asTheFrame('made-up-broken', 'main.html')
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toContain('was refused')
    expect(refused.json().error).toContain('reads.0')
    expect(refused.body).not.toContain('made-up clock page')
  })

  it('3. serves the page of a plugin that is on, with its type and the sandboxing policy', async () => {
    await switchIt('made-up-clock', true)
    const page = await asTheFrame('made-up-clock', 'main.html')
    expect(page.statusCode, page.body.slice(0, 300)).toBe(200)
    expect(page.body).toBe(THE_PAGE)
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(page.headers['x-content-type-options']).toBe('nosniff')
    expect(page.headers['access-control-allow-origin']).toBe('*')
    const policy = String(page.headers['content-security-policy'] ?? '').split('; ')
    const own = 'http://localhost:80/api/plugins/made-up-clock/files/'
    expect(policy).toEqual([
      'sandbox allow-scripts',
      "default-src 'none'",
      `script-src ${own}`,
      `style-src ${own} 'unsafe-inline'`,
      `img-src ${own} data: blob:`,
      `font-src ${own}`,
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-src 'none'",
      'worker-src blob:',
    ])

    const script = await asTheFrame('made-up-clock', 'assets/app.js')
    expect(script.statusCode).toBe(200)
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8')
  })

  it('4. refuses a path that leaves the built folder', async () => {
    for (const path of ['..%2Fplugin.json', '../plugin.json', 'assets/..%2F..%2Fplugin.json', '.hidden.html', 'assets%5C..%5C..%5Cplugin.json']) {
      const reply = await asTheFrame('made-up-clock', path)
      expect([400, 404], `${path}: ${reply.body.slice(0, 200)}`).toContain(reply.statusCode)
      expect(reply.body, path).not.toContain('office-read/1')
    }
    const dotted = await asTheFrame('made-up-clock', '..%2Fplugin.json')
    expect(dotted.statusCode).toBe(400)
    expect(dotted.json().error).toContain('is not a path to a plugin file')

    // A LINK INSIDE THE BUILT FOLDER THAT POINTS OUT OF IT is followed before the check, and refused.
    symlinkSync(join(folder, 'made-up-clock', 'plugin.json'), join(folder, 'made-up-clock', 'dist', 'out.json'))
    const linked = await asTheFrame('made-up-clock', 'out.json')
    expect(linked.statusCode).toBe(403)
    expect(linked.json().error).toBe(
      `"out.json" of the plugin "made-up-clock" leads, through a link, to a file outside the plugin's own dist/ folder, so it is not served.`,
    )
    expect(linked.body).not.toContain('office-read/1')
  })

  it('5. serves no kind of file it does not name, and says when a file is not there', async () => {
    const markdown = await asTheFrame('made-up-clock', 'notes.md')
    expect(markdown.statusCode).toBe(404)
    expect(markdown.json().error).toContain('must end in one of .html')
    expect(markdown.body).not.toContain('# not a page')

    const missing = await asTheFrame('made-up-clock', 'other.html')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error).toContain('may not have been built')
  })

  it('6. refuses the next request once it is switched off, with no restart', async () => {
    expect((await asTheFrame('made-up-clock', 'main.html')).statusCode).toBe(200)
    await switchIt('made-up-clock', false)
    const off = await asTheFrame('made-up-clock', 'main.html')
    expect(off.statusCode).toBe(403)
    expect(off.body).not.toContain('made-up clock page')
  })

  it('7. serves nothing from a dist/ that is a link, and says why', async () => {
    // SYNTHETIC: a folder outside every plugin, and a plugin whose dist is a link to it, written as git writes a link.
    mkdirSync(join(scratch, 'elsewhere'), { recursive: true })
    writeFileSync(join(scratch, 'elsewhere', 'main.html'), '<p>made-up file from elsewhere</p>')
    mkdirSync(join(folder, 'made-up-linked'), { recursive: true })
    writeFileSync(join(folder, 'made-up-linked', 'plugin.json'), JSON.stringify(aManifest('made-up-linked')))
    symlinkSync('../../elsewhere', join(folder, 'made-up-linked', 'dist'))
    await switchIt('made-up-linked', true)
    const linked = await asTheFrame('made-up-linked', 'main.html')
    expect(linked.statusCode).toBe(403)
    expect(linked.json().error).toBe(
      'The plugin "made-up-linked" has its dist/ as a link to another place, so none of its files are served. Its ' +
        'built pages are served only from a real dist/ folder inside its own folder.',
    )
    expect(linked.body).not.toContain('made-up file from elsewhere')
  })

  it("8. serves nothing of a plugin whose own folder is a link, and says why", async () => {
    // SYNTHETIC: a whole plugin kept outside the plugins folder, and a link to it inside.
    const away = join(scratch, 'away', 'made-up-away')
    mkdirSync(join(away, 'dist'), { recursive: true })
    writeFileSync(join(away, 'plugin.json'), JSON.stringify(aManifest('made-up-away')))
    writeFileSync(join(away, 'dist', 'main.html'), '<p>made-up page kept away</p>')
    symlinkSync('../away/made-up-away', join(folder, 'made-up-away'))
    const why =
      'The plugin\'s folder "made-up-away" is a link to another place. A plugin is read only from a real folder of its ' +
      'own inside the plugins folder, so its plugin.json was not read.'
    const press = await app.inject({ method: 'POST', url: '/api/plugins/made-up-away/switch', headers: AS_THE_PERSON, payload: { on: true } })
    expect(press.statusCode, press.body.slice(0, 300)).toBe(409)
    const kept = await asTheFrame('made-up-away', 'main.html')
    expect(kept.statusCode).toBe(403)
    expect(kept.json().error).toBe(`The plugin "made-up-away" was refused, so its files are not served. ${why}`)
    expect(kept.body).not.toContain('made-up page kept away')
  })
})
