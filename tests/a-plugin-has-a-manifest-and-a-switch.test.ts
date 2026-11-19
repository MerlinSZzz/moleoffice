// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN IS A FOLDER WITH A MANIFEST, AND EACH ONE HAS A SWITCH THAT IS OFF UNTIL THE OWNER SWITCHES IT ON. Wave 13x
 * round 14, step 1 of the plugin pipeline udGnc-Bsr15R (block N0TWpg5xe6mo).
 *
 * WHAT THIS FILE PROVES, in its own empty office and its own plugins folder (a temporary folder, named to the office by
 * MOLE_OFFICE_PLUGINS):
 * 1. With no plugins folder the reading says so, rather than answering an empty list as if the folder were empty.
 * 2. A good manifest is listed, off, with nobody having chosen. A bad one is listed as refused with the reason, and so is
 *    one whose id is not its folder's name. A file beside the folders is not a plugin.
 * 3. The owner switches a plugin on, and the next read says on with no restart; the change is kept with who.
 * 4. An agent is refused, and nothing is changed.
 * 5. An unknown plugin is a 404, switching on a refused one is a 409, and a body that is not true, false or null is a
 *    400. Nothing is changed by any of them.
 * 6. A plugin added to the folder while the office runs is listed on the next read.
 * 7. A stored value that is not an object of true and false is not read as off: the reading refuses it.
 * 8. A plugin whose folder is a link to another place is listed as refused, with the reason, and its manifest is not
 *    read, though the manifest it leads to is good. It cannot be switched on.
 * 9. A plugin whose plugin.json is a link is listed as refused, with the reason, and the file it leads to is not read,
 *    whether that file is a good manifest or is not there (wave 13x round 20).
 * 10. A plugin folder that is a link leading to nothing is listed as refused, with the reason, and the rest of the list
 *    still stands. So is a link that leads to itself (wave 13x round 20).
 * 11. A plugin whose plugin.json is a folder is listed as refused, with the reason, and the rest of the list still
 *    stands. Before wave 13x round 21 it made the whole list a 500 (EISDIR, measured on d814923c4).
 * 12. A plugin whose plugin.json this office has no permission to read is listed as refused, with the reason, and the
 *    rest of the list still stands. Before wave 13x round 21 it made the whole list a 500 (EACCES, measured on
 *    d814923c4).
 * 13. A plugin whose own folder this office has no permission to open is listed as refused, with the reason, and the
 *    rest of the list still stands (wave 13x round 23).
 * 14. A plugin whose plugin.json is a named pipe, or a socket, is listed as refused, with the reason, and is not opened.
 *    The rest of the list still stands (wave 13x round 23). The list is read first in a child process with a time limit,
 *    because opening a named pipe to read waits for a writer, and a wait in this process would stop the test file.
 * 15. The reading also says why as data: `refusedBecause`, as the secretary's 2ofDpr3_ED-D and a decision
 *    say. A field with
 *    no value, a key the office does not know, a folder that is a link and a good plugin are the four cases here; the
 *    page turns that data into plain words (tests/the-settings-page-has-the-plugin-switches.test.ts).
 * 16. A fault inside a field that is there names where it is, and is not said as the field missing (the inspector's
 *    refusal zwnmGQMbxUKt of run JtwB8_PFtSv2): `budget: {}`, a page with no slug and a name with only Chinese. Before
 *    the fix each was answered as its top-level field with no value. The words for every such place are proved in
 *    tests/a-refused-plugins-reason-is-said-in-plain-words.test.ts.
 * 17. A plugin whose plugin.json lstat reports as a character device, a block device, or a kind this office has no name
 *    for is listed as refused, with the reason naming that kind, and is not opened. No device file can be made without
 *    root and a link is no help because the reading uses lstat, so the lstat reading is stood in for one made-up
 *    plugin.json (see below); the folder, the manifest file and the reading are real (wave 13u round 30).
 *
 * WHERE THE RULES LIVE: src/shared/plugins.ts (the manifest), src/server/lib/plugins.ts (the one reader and writer)
 * and src/server/api/plugins.ts (who may switch one).
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { PluginsReading } from '../src/shared/plugins.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/** The temporary folder this file makes, and the plugins folder inside it, which does not exist until test 2. */
const scratch = aTestDatabaseFolder('plugins')
const where = { folder: join(scratch, 'plugins') }
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']
const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * A DEVICE FILE CANNOT BE MADE HERE WITHOUT ROOT, AND A LINK IS NO HELP. `mknod` needs permission this sandbox does not
 * have, and the reading uses `lstat`, which reports the link and never what it leads to. So this file stands in for
 * `node:fs`'s `lstatSync` for one made-up plugin's plugin.json, as other tests in this folder stand in for `node:fs`,
 * and names that plainly in the case that uses it (case 17). Everything else stays real: every other path, and every
 * other function of `node:fs`. The stand-in answers only while `saying` is not null.
 */
const aStoodInDevice = vi.hoisted(() => ({
  forThePath: '',
  saying: null as null | 'character-device' | 'block-device' | 'unknown',
}))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const lstatSync = ((...args: Parameters<typeof real.lstatSync>) => {
    if (aStoodInDevice.saying !== null && String(args[0]) === aStoodInDevice.forThePath) {
      // A Stats that says only what this case needs it to say: not a link, not a folder, not a file, and one of the
      // kinds lstat reports that `whatItIs` turns into a word. All four kind checks are false for the unknown kind.
      const saying = aStoodInDevice.saying
      return {
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isCharacterDevice: () => saying === 'character-device',
        isBlockDevice: () => saying === 'block-device',
      } as unknown as ReturnType<typeof real.lstatSync>
    }
    return real.lstatSync(...args)
  }) as typeof real.lstatSync
  return { ...real, default: { ...real, lstatSync }, lstatSync }
})

let t: TestDb
let app: FastifyInstance
let agentKey = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A manifest this office accepts, for the plugin `id`. */
function aGoodManifest(id: string): object {
  return {
    id,
    name: { en: `The ${id} plugin` },
    version: '1.0.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects', 'talk'],
    budget: { builtKilobytes: 200 },
  }
}

function putAPlugin(id: string, manifest: object | string): void {
  mkdirSync(join(where.folder, id), { recursive: true })
  writeFileSync(join(where.folder, id, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
}

async function reading(): Promise<PluginsReading> {
  const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json()
}

function press(id: string, headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: `/api/plugins/${id}/switch`, headers, payload })
}

beforeAll(async () => {
  process.env['MOLE_OFFICE_PLUGINS'] = where.folder
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'mason', name: 'mason', role: 'worker' } })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  agentKey = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(scratch, { recursive: true, force: true })
})

describe('a plugin has a manifest and a switch', () => {
  it('1. says there is no plugins folder, rather than an empty list', async () => {
    expect(await reading()).toMatchObject({ folderFound: false, interface: 'office-read/1', plugins: [] })
  })

  it('2. lists a good plugin as off, and a bad one as refused with the reason', async () => {
    putAPlugin('map', aGoodManifest('map'))
    putAPlugin('broken', { ...aGoodManifest('broken'), reads: ['projects', 'secrets'] })
    putAPlugin('misnamed', aGoodManifest('another-name'))
    putAPlugin('not-json', '{ this is not json')
    writeFileSync(join(where.folder, 'README.md'), 'Not a plugin.')
    const read = await reading()
    expect(read.folderFound).toBe(true)
    expect(read.plugins.map((p) => [p.id, p.state])).toEqual([
      ['broken', 'refused'],
      ['map', 'off'],
      ['misnamed', 'refused'],
      ['not-json', 'refused'],
    ])
    const map = read.plugins.find((p) => p.id === 'map')!
    expect(map).toMatchObject({ nobodyChose: true, refusal: null, manifest: aGoodManifest('map') })
    expect(read.plugins.find((p) => p.id === 'broken')!.refusal).toContain('reads.1')
    expect(read.plugins.find((p) => p.id === 'misnamed')!.refusal).toContain('its folder is "misnamed"')
    expect(read.plugins.find((p) => p.id === 'not-json')!.refusal).toContain('plugin.json is not JSON')
    expect(read.plugins.find((p) => p.id === 'broken')!.manifest).toBeNull()
  })

  it('3. the owner switches one on, the next read says on, and the change is kept with who', async () => {
    const reply = await press('map', AS_THE_PERSON, { on: true })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    expect(reply.json()).toMatchObject({ id: 'map', state: 'on', nobodyChose: false })
    expect((await reading()).plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'on', nobodyChose: false })
    const changes = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_THE_PERSON })
    expect(changes.json().settings['plugin-switches']).toMatchObject({
      by: { type: 'human', id: THE_PERSON },
      field: 'whether the plugin map is switched on',
      // THE CHANGE LOG KEEPS EACH SIDE AS TEXT; nobody's choice before is null.
      from: null,
      to: 'true',
    })
  })

  it('4. refuses an agent, and changes nothing', async () => {
    const asMason = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mason', 'x-mole-office-key': agentKey }
    const reply = await press('map', asMason, { on: false })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(403)
    expect(reply.body).toContain('Nothing was changed.')
    expect((await reading()).plugins.find((p) => p.id === 'map')!.state).toBe('on')
  })

  it('5. refuses an unknown plugin, a refused one, and a body that is not a switch, and changes nothing', async () => {
    const before = JSON.stringify(await reading())
    const unknown = await press('nowhere', AS_THE_PERSON, { on: true })
    expect(unknown.statusCode, unknown.body.slice(0, 300)).toBe(404)
    const refused = await press('broken', AS_THE_PERSON, { on: true })
    expect(refused.statusCode, refused.body.slice(0, 300)).toBe(409)
    expect(refused.json().error).toContain('The plugin "broken" cannot be switched on, because it was refused:')
    const wrong = await press('map', AS_THE_PERSON, { on: 'yes' })
    expect(wrong.statusCode, wrong.body.slice(0, 300)).toBe(400)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('6. lists a plugin added while the office runs, and null takes a choice away', async () => {
    putAPlugin('late', aGoodManifest('late'))
    expect((await reading()).plugins.find((p) => p.id === 'late')).toMatchObject({ state: 'off', nobodyChose: true })
    const reply = await press('map', AS_THE_PERSON, { on: null })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    expect(reply.json()).toMatchObject({ state: 'off', nobodyChose: true })
    expect(t.client.sqlite.prepare('SELECT plugin_switches AS s FROM installation').get()).toEqual({ s: null })
  })

  it('7. refuses a stored value that is not an object of true and false, rather than reading it as off', async () => {
    t.client.sqlite.prepare(`UPDATE installation SET plugin_switches = '{"map": 1}' WHERE only_row = 1`).run()
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
      expect(reply.statusCode).toBe(500)
      expect(reply.body).toContain('installation.plugin_switches')
    } finally {
      t.client.sqlite.prepare('UPDATE installation SET plugin_switches = NULL WHERE only_row = 1').run()
    }
  })

  it('8. refuses a plugin whose folder is a link to another place, and does not read the manifest it leads to', async () => {
    // A GOOD MANIFEST, OUTSIDE THE PLUGINS FOLDER, so the only thing wrong is the link.
    mkdirSync(join(scratch, 'away', 'linked'), { recursive: true })
    writeFileSync(join(scratch, 'away', 'linked', 'plugin.json'), JSON.stringify(aGoodManifest('linked')))
    symlinkSync(join('..', 'away', 'linked'), join(where.folder, 'linked'))
    const why =
      'The plugin\'s folder "linked" is a link to another place. A plugin is read only from a real folder of its own ' +
      'inside the plugins folder, so its plugin.json was not read.'
    expect((await reading()).plugins.find((p) => p.id === 'linked')).toEqual({ id: 'linked', state: 'refused', nobodyChose: true, manifest: null, refusal: why, refusedBecause: { cause: 'folder-is-a-link' } })

    const before = JSON.stringify(await reading())
    const reply = await press('linked', AS_THE_PERSON, { on: true })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(409)
    expect(reply.json().error).toBe(`The plugin "linked" cannot be switched on, because it was refused: ${why} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('9. refuses a plugin whose plugin.json is a link, and does not read the file it leads to', async () => {
    // A GOOD MANIFEST, OUTSIDE THE PLUGINS FOLDER, so the only thing wrong with "pointed" is the link.
    mkdirSync(join(scratch, 'away', 'pointed'), { recursive: true })
    writeFileSync(join(scratch, 'away', 'pointed', 'plugin.json'), JSON.stringify(aGoodManifest('pointed')))
    mkdirSync(join(where.folder, 'pointed'))
    symlinkSync(join('..', '..', 'away', 'pointed', 'plugin.json'), join(where.folder, 'pointed', 'plugin.json'))
    // A LINK TO NOTHING, which is refused as a link and not as a plugin with no plugin.json.
    mkdirSync(join(where.folder, 'dangling'))
    symlinkSync('nowhere.json', join(where.folder, 'dangling', 'plugin.json'))
    const why = (id: string) =>
      `The plugin.json of "${id}" is a link to another place. A plugin's manifest is read only from a real file in its ` +
      'own folder, so it was not read.'
    const read = await reading()
    expect(read.plugins.find((p) => p.id === 'pointed')).toEqual({ id: 'pointed', state: 'refused', nobodyChose: true, manifest: null, refusal: why('pointed'), refusedBecause: { cause: 'manifest-is-a-link' } })
    expect(read.plugins.find((p) => p.id === 'dangling')).toEqual({ id: 'dangling', state: 'refused', nobodyChose: true, manifest: null, refusal: why('dangling'), refusedBecause: { cause: 'manifest-is-a-link' } })

    const before = JSON.stringify(await reading())
    const reply = await press('pointed', AS_THE_PERSON, { on: true })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(409)
    expect(reply.json().error).toBe(`The plugin "pointed" cannot be switched on, because it was refused: ${why('pointed')} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('10. lists a plugin folder that is a link leading to nothing as refused, and the rest of the list stands', async () => {
    symlinkSync(join('..', 'away', 'nowhere'), join(where.folder, 'gone'))
    symlinkSync('looped', join(where.folder, 'looped'))
    const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const read = reply.json() as PluginsReading
    const why = (id: string) =>
      `The plugin's folder "${id}" is a link that leads to nothing. A plugin is read only from a real folder of its own ` +
      'inside the plugins folder, so nothing was read.'
    expect(read.plugins.find((p) => p.id === 'gone')).toEqual({ id: 'gone', state: 'refused', nobodyChose: true, manifest: null, refusal: why('gone'), refusedBecause: { cause: 'folder-leads-nowhere' } })
    expect(read.plugins.find((p) => p.id === 'looped')).toEqual({ id: 'looped', state: 'refused', nobodyChose: true, manifest: null, refusal: why('looped'), refusedBecause: { cause: 'folder-leads-nowhere' } })
    // THE REST OF THE LIST STANDS.
    expect(read.plugins.map((p) => p.id)).toEqual(['broken', 'dangling', 'gone', 'late', 'linked', 'looped', 'map', 'misnamed', 'not-json', 'pointed'])
    expect(read.plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })

    const before = JSON.stringify(await reading())
    const pressed = await press('gone', AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
    expect(pressed.json().error).toBe(`The plugin "gone" cannot be switched on, because it was refused: ${why('gone')} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('11. lists a plugin whose plugin.json is a folder as refused, and the rest of the list stands', async () => {
    mkdirSync(join(where.folder, 'boxed', 'plugin.json'), { recursive: true })
    const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const read = reply.json() as PluginsReading
    const why =
      'The plugin.json of "boxed" is a folder, not a file. A plugin\'s manifest is read only from a real file in its own ' +
      'folder, so nothing in it was read.'
    expect(read.plugins.find((p) => p.id === 'boxed')).toEqual({ id: 'boxed', state: 'refused', nobodyChose: true, manifest: null, refusal: why, refusedBecause: { cause: 'manifest-is-a-folder' } })
    // THE REST OF THE LIST STANDS.
    expect(read.plugins.map((p) => p.id)).toEqual(['boxed', 'broken', 'dangling', 'gone', 'late', 'linked', 'looped', 'map', 'misnamed', 'not-json', 'pointed'])
    expect(read.plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })

    const before = JSON.stringify(await reading())
    const pressed = await press('boxed', AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
    expect(pressed.json().error).toBe(`The plugin "boxed" cannot be switched on, because it was refused: ${why} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('12. lists a plugin whose plugin.json this office may not read as refused, and the rest of the list stands', async () => {
    // A GOOD MANIFEST that nobody may read, so the only thing wrong with "locked" is the permission.
    putAPlugin('locked', aGoodManifest('locked'))
    const file = join(where.folder, 'locked', 'plugin.json')
    chmodSync(file, 0o000)
    // THE FILE REALLY CANNOT BE READ HERE. A process that may read every file (root) would pass this case without
    // proving anything, so it fails instead.
    expect(() => readFileSync(file), 'this test process may not read the file either').toThrow(/EACCES/u)
    const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const read = reply.json() as PluginsReading
    const why = 'The plugin.json of "locked" could not be read, because this office has no permission to read it. Nothing was read.'
    expect(read.plugins.find((p) => p.id === 'locked')).toEqual({ id: 'locked', state: 'refused', nobodyChose: true, manifest: null, refusal: why, refusedBecause: { cause: 'manifest-cannot-be-read' } })
    // THE REST OF THE LIST STANDS.
    expect(read.plugins.map((p) => p.id)).toEqual(['boxed', 'broken', 'dangling', 'gone', 'late', 'linked', 'locked', 'looped', 'map', 'misnamed', 'not-json', 'pointed'])
    expect(read.plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })

    const before = JSON.stringify(await reading())
    const pressed = await press('locked', AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
    expect(pressed.json().error).toBe(`The plugin "locked" cannot be switched on, because it was refused: ${why} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('13. lists a plugin whose folder this office may not open as refused, and the rest of the list stands', async () => {
    // AN EMPTY FOLDER that nobody may open. Empty, because rmSync removes an empty folder with mode 000 but throws
    // EACCES on one that holds a file (measured in wave 13x round 23), so the folder goes with the rest even if this
    // file stops early. Whether it holds a plugin.json cannot be seen from outside it, which is the point.
    const folder = join(where.folder, 'shut')
    mkdirSync(folder, { mode: 0o000 })
    // THE FOLDER REALLY CANNOT BE OPENED HERE. A process that may open every folder (root) would pass this case without
    // proving anything, so it fails instead.
    expect(() => lstatSync(join(folder, 'plugin.json')), 'this test process may not look inside it either').toThrow(/EACCES/u)
    const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const read = reply.json() as PluginsReading
    const why = 'The plugin\'s folder "shut" could not be opened, because this office has no permission to look inside it. Nothing in it was read.'
    expect(read.plugins.find((p) => p.id === 'shut')).toEqual({ id: 'shut', state: 'refused', nobodyChose: true, manifest: null, refusal: why, refusedBecause: { cause: 'folder-cannot-be-opened' } })
    // THE REST OF THE LIST STANDS.
    expect(read.plugins.map((p) => p.id)).toEqual(['boxed', 'broken', 'dangling', 'gone', 'late', 'linked', 'locked', 'looped', 'map', 'misnamed', 'not-json', 'pointed', 'shut'])
    expect(read.plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })

    const before = JSON.stringify(await reading())
    const pressed = await press('shut', AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
    expect(pressed.json().error).toBe(`The plugin "shut" cannot be switched on, because it was refused: ${why} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('14. lists a plugin whose plugin.json is a named pipe or a socket as refused without opening it, and the rest stands', async () => {
    mkdirSync(join(where.folder, 'piped'))
    const piped = spawnSync('mkfifo', [join(where.folder, 'piped', 'plugin.json')], { encoding: 'utf8' })
    expect(piped.status, piped.stderr).toBe(0)
    // A SOCKET, bound from a child whose folder is the plugin's, so the socket's path is short enough for any temporary
    // folder. The child ends at once and the socket file stays, with nothing listening on it.
    mkdirSync(join(where.folder, 'socketed'))
    const socketed = spawnSync(process.execPath, ['-e', "require('node:net').createServer().listen('plugin.json', () => process.exit(0))"], {
      cwd: join(where.folder, 'socketed'),
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(socketed.status, socketed.stderr).toBe(0)
    expect(lstatSync(join(where.folder, 'piped', 'plugin.json')).isFIFO()).toBe(true)
    expect(lstatSync(join(where.folder, 'socketed', 'plugin.json')).isSocket()).toBe(true)

    // THE LIST IS READ IN A CHILD PROCESS FIRST, WITH A TIME LIMIT. Opening a named pipe to read waits until something
    // opens it to write, and nothing here ever does. That read is synchronous, so in this process it would stop the test
    // file itself, and no time limit could end it. The child is killed at its limit instead, and says how far it got.
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "const { readThePlugins } = await import('./src/server/lib/plugins.ts'); console.log('IMPORTED'); " +
          "console.log('READ ' + JSON.stringify(readThePlugins(process.env.MOLE_OFFICE_PLUGINS)))",
      ],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env }, timeout: 60_000, killSignal: 'SIGKILL' },
    )
    const said = child.stdout ?? ''
    expect(child.signal, `the child was stopped at its 60 s limit. It printed: ${said.slice(-300)} ${(child.stderr ?? '').slice(-300)}`).toBeNull()
    expect(child.status, (child.stderr ?? '').slice(-600)).toBe(0)
    const line = said.split('\n').find((l) => l.startsWith('READ '))
    expect(line, said.slice(-300)).toBeDefined()
    const why = (id: string, what: string) =>
      `The plugin.json of "${id}" is ${what}, not a file. A plugin's manifest is read only from a real file in its own ` +
      'folder, so it was not opened.'
    const inTheChild = JSON.parse(String(line).slice('READ '.length)) as PluginsReading
    expect(inTheChild.plugins.find((p) => p.id === 'piped')).toEqual({ id: 'piped', state: 'refused', nobodyChose: true, manifest: null, refusal: why('piped', 'a named pipe'), refusedBecause: { cause: 'manifest-is-not-a-file', what: 'named-pipe' } })

    // THE CHILD DID NOT WAIT, so the door may be asked in this process.
    const reply = await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const read = reply.json() as PluginsReading
    expect(read.plugins.find((p) => p.id === 'piped')).toEqual({ id: 'piped', state: 'refused', nobodyChose: true, manifest: null, refusal: why('piped', 'a named pipe'), refusedBecause: { cause: 'manifest-is-not-a-file', what: 'named-pipe' } })
    expect(read.plugins.find((p) => p.id === 'socketed')).toEqual({ id: 'socketed', state: 'refused', nobodyChose: true, manifest: null, refusal: why('socketed', 'a socket'), refusedBecause: { cause: 'manifest-is-not-a-file', what: 'socket' } })
    // THE REST OF THE LIST STANDS.
    expect(read.plugins.map((p) => p.id)).toEqual(['boxed', 'broken', 'dangling', 'gone', 'late', 'linked', 'locked', 'looped', 'map', 'misnamed', 'not-json', 'piped', 'pointed', 'shut', 'socketed'])
    expect(read.plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })

    const before = JSON.stringify(await reading())
    const pressed = await press('piped', AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
    expect(pressed.json().error).toBe(`The plugin "piped" cannot be switched on, because it was refused: ${why('piped', 'a named pipe')} Nothing was changed.`)
    expect(JSON.stringify(await reading())).toBe(before)
  })

  it('15. says why a plugin was refused as data: a missing field, an unknown key, a folder link, and nothing for a good one', async () => {
    // A MANIFEST WITH NO version, and one with a key this office does not know.
    const withoutVersion = { ...aGoodManifest('unversioned') } as Record<string, unknown>
    delete withoutVersion['version']
    putAPlugin('unversioned', withoutVersion)
    putAPlugin('colourful', { ...aGoodManifest('colourful'), colour: 'green' })
    const read = await reading()
    // THE REASON AS DATA is read through a cast because the criterion commit ran before the field existed.
    const refusedBecauseOf = (id: string): unknown =>
      (read.plugins.find((p) => p.id === id) as unknown as { refusedBecause: unknown }).refusedBecause
    // THE MISSING FIELD IS NAMED by its top-level key and the problem is that it has no value at all.
    expect(refusedBecauseOf('unversioned')).toEqual({
      cause: 'manifest-fields',
      fields: [{ field: 'version', problem: 'missing' }],
    })
    // AN UNKNOWN KEY IS NAMED by the key itself, and the office did not know it.
    expect(refusedBecauseOf('colourful')).toEqual({
      cause: 'manifest-fields',
      fields: [{ field: 'colour', problem: 'not-known' }],
    })
    // A FOLDER THAT IS A LINK carries its own one-word cause (made in test 8).
    expect(refusedBecauseOf('linked')).toEqual({ cause: 'folder-is-a-link' })
    // A GOOD PLUGIN HAS NO CAUSE AT ALL.
    expect(refusedBecauseOf('map')).toBeNull()
    // THE READING CARRIES EXACTLY THE KEYS PluginReading DECLARES: the issues aManifestFrom reads for its own caller
    // are not part of the door's answer.
    expect(Object.keys(read.plugins.find((p) => p.id === 'unversioned')!).sort()).toEqual([
      'id',
      'manifest',
      'nobodyChose',
      'refusal',
      'refusedBecause',
      'state',
    ])
  })

  it('16. names where a fault inside a field is, and does not say the field is missing', async () => {
    putAPlugin('unbudgeted', { ...aGoodManifest('unbudgeted'), budget: {} })
    putAPlugin('slugless', { ...aGoodManifest('slugless'), pages: [{ title: { en: 'Main' } }] })
    putAPlugin('chinese-named', { ...aGoodManifest('chinese-named'), name: { zh: '编造的插件' } })
    const read = await reading()
    const refusedBecauseOf = (id: string): unknown =>
      (read.plugins.find((p) => p.id === id) as unknown as { refusedBecause: unknown }).refusedBecause
    // THE BUDGET IS THERE, and the key inside it is what has no value.
    expect(refusedBecauseOf('unbudgeted')).toEqual({
      cause: 'manifest-fields',
      fields: [{ field: 'budget', problem: 'missing', inside: 'builtKilobytes' }],
    })
    // THE PAGES ARE THERE, and the first page, counted from 1, is the one with no slug.
    expect(refusedBecauseOf('slugless')).toEqual({
      cause: 'manifest-fields',
      fields: [{ field: 'pages', problem: 'missing', entry: 1, inside: 'slug' }],
    })
    // THE NAME IS THERE, in Chinese only, and its English is what has no value.
    expect(refusedBecauseOf('chinese-named')).toEqual({
      cause: 'manifest-fields',
      fields: [{ field: 'name', problem: 'missing', inside: 'en' }],
    })
  })

  it('17. stands in for a character device, a block device and an unknown kind (no device can be made here without root), and names each in the refusal', async () => {
    // WHY IT IS STOOD IN: `mknod` needs root, which this sandbox does not have, and a link is no help because the
    // reading uses lstat, which reports the link and never what it leads to. So `node:fs`'s `lstatSync` is stood in for
    // at exactly this plugin.json's path (see the top of this file). Nothing else is stood in for: the plugin folder is
    // a real folder and its plugin.json is a real, good manifest that the reading never opens because of the kind.
    putAPlugin('typeful', aGoodManifest('typeful'))
    aStoodInDevice.forThePath = join(where.folder, 'typeful', 'plugin.json')
    const why = (what: string) =>
      `The plugin.json of "typeful" is ${what}, not a file. A plugin's manifest is read only from a real file in its own ` +
      'folder, so it was not opened.'
    const saysSo = async (saying: 'character-device' | 'block-device' | 'unknown', what: string): Promise<void> => {
      aStoodInDevice.saying = saying
      const read = await reading()
      expect(read.plugins.find((p) => p.id === 'typeful')).toEqual({ id: 'typeful', state: 'refused', nobodyChose: true, manifest: null, refusal: why(what), refusedBecause: { cause: 'manifest-is-not-a-file', what: saying } })
      const before = JSON.stringify(await reading())
      const pressed = await press('typeful', AS_THE_PERSON, { on: true })
      expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(409)
      expect(pressed.json().error).toBe(`The plugin "typeful" cannot be switched on, because it was refused: ${why(what)} Nothing was changed.`)
      expect(JSON.stringify(await reading())).toBe(before)
    }
    await saysSo('character-device', 'a character device')
    await saysSo('block-device', 'a block device')
    await saysSo('unknown', 'something this office has no name for')
    // NOTHING IS STOOD IN NOW: the same plugin is a real, good plugin.
    aStoodInDevice.saying = null
    expect((await reading()).plugins.find((p) => p.id === 'typeful')).toMatchObject({ state: 'off', nobodyChose: true, refusal: null })
    // AND THE REST OF THE LIST STANDS.
    expect((await reading()).plugins.find((p) => p.id === 'map')).toMatchObject({ state: 'off', refusal: null })
  })
})
