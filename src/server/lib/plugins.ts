// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGINS IN plugins/, AND WHICH ARE SWITCHED ON: READ AND WRITTEN HERE AND NOWHERE ELSE. Wave 13x round 14, step 1
 * of the plugin pipeline udGnc-Bsr15R (block N0TWpg5xe6mo). The manifest's shape is src/shared/plugins.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ, AND WHEN
 * ---------------------------------------------------------------------------------------
 *
 * Every folder directly under plugins/ is a plugin, and its `plugin.json` is its manifest. The folder and the switches
 * are read again on every call, with nothing cached, so a plugin added, removed or switched needs no restart. A file
 * directly under plugins/ (such as its README) is not a plugin and is not listed.
 *
 * A MANIFEST THAT CANNOT BE ACCEPTED IS LISTED AS REFUSED, WITH THE REASON. It is not left out, because a plugin that
 * silently vanished from the list would look like a plugin nobody wrote. A refused plugin cannot be switched on.
 *
 * EVERY REFUSAL ALSO CARRIES ITS CAUSE AS DATA (`refusedBecause`), and the English `refusal` is built from the words
 * table (`settingsPanel.plugins.why.*`, sayInEnglish), so the sentence a page draws in the page's language is the one
 * this reader answers with (2ofDpr3_ED-D), as a decision says. The two raw texts that are the
 * reader's own writing rather than a sentence of the office's — what a parser says about a file that is not JSON, and
 * the schema's words about each field — stay as they are, for Developer mode.
 *
 * SO IS A PLUGIN WHOSE OWN FOLDER IS A LINK, and its plugin.json is not read: the link leads to another place, which
 * may be outside the plugins folder. A link that leads to a file is a file, and is not listed. A link that leads to
 * nothing, because what it names is not there or because it leads back to itself, is listed as refused with a sentence
 * of its own, so one such link does not stop the whole list (wave 13x round 20). A plugin.json that is a link is
 * refused in the same way and not read, wherever it leads. So is a plugin.json that is a folder, and one this office has
 * no permission to read, each with a sentence of its own, so neither stops the whole list (wave 13x round 21). So is a
 * plugin whose folder this office has no permission to look inside, and a plugin.json that is a named pipe, a socket or
 * a device, which is not opened, because opening a named pipe to read waits for a writer and would stop the whole list
 * without failing (wave 13x round 23).
 *
 * NOT HERE YET: whether a plugin's page has been built. Step 4 of the pipeline builds plugins and decides that state.
 * Until then a page that was never built is found only when its file is asked for, and is a 404 that says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SWITCHES LIVE, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `plugin_switches`, added by migration 0234: a JSON object from a plugin's id to
 * true or false. NULL is nobody having switched any plugin, and a plugin missing from the object is nobody having
 * switched that one; both read as off. Any other value is refused with a 500 that names it.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync, type Stats } from 'node:fs'
import { join, sep } from 'node:path'

import { pluginsFolderFrom } from '../../config/settings.mjs'
import { sayInEnglish } from '../../shared/i18n.ts'
import {
  A_THING_WORD,
  PLUGIN_BUILT_FOLDER,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_READ_INTERFACE,
  aManifestFrom,
  whyAPluginHasNoPage,
  type PluginManifest,
  type PluginManifestIsNotAFile,
  type PluginReading,
  type PluginRefusedBecause,
  type PluginsReading,
  type WhyAPluginHasNoPage,
} from '../../shared/plugins.ts'
import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. It is only built when a reader or the writer throws, never at
// import, so the import cycle through records.ts is safe.
import { PanelError } from './panel-error.ts'

/** Each plugin's switch as stored: true is on, false is off, and a missing id is nobody having chosen. */
type Switches = Record<string, boolean>

/** The switches exactly as stored, or null because nobody switched any plugin. Refuses anything else. */
function theStoredSwitches(): Switches | null {
  const row = sqlite.prepare('SELECT plugin_switches AS switches FROM installation WHERE only_row = 1').get() as
    | { switches: unknown }
    | undefined
  const stored = row?.switches ?? null
  if (stored === null) return null
  const refuse = (): never => {
    throw new PanelError(
      `Which plugins are switched on is stored as ${JSON.stringify(stored)} in installation.plugin_switches, and this ` +
        'office reads only nothing or a JSON object from a plugin id to true or false there. Nothing was guessed and ' +
        'nothing was changed.',
      500,
    )
  }
  if (typeof stored !== 'string') return refuse()
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return refuse()
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return refuse()
  for (const value of Object.values(parsed)) if (typeof value !== 'boolean') return refuse()
  return parsed as Switches
}

/**
 * The manifest of the plugin in `folder`, or why it was refused: `aManifestFrom` in src/shared/plugins.ts decides it.
 * A plugin.json that is a link is refused before it is read, because the link may lead outside the plugin's folder. One
 * that is a folder is refused before it is read too, and so is one this office has no permission to read (EACCES), so
 * neither stops the whole list (wave 13x round 21). A folder this office has no permission to look inside is refused
 * (EACCES from lstat), and so is a plugin.json that is not a regular file, before it is opened (wave 13x round 23). Any
 * other error from looking or reading is thrown. Each refusal says its one-word cause as data beside its sentence.
 */
function readTheManifest(id: string, folder: string): { manifest: PluginManifest } | { refusal: string; refusedBecause: PluginRefusedBecause } {
  const file = join(folder, PLUGIN_MANIFEST_FILE)
  let found: Stats | undefined
  try {
    found = lstatSync(file, { throwIfNoEntry: false })
  } catch (err) {
    // THE PLUGIN'S OWN FOLDER, because readThePlugins has already looked inside the plugins folder to find this one.
    if ((err as NodeJS.ErrnoException).code !== 'EACCES') throw err
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.folderCannotBeOpened', { id }),
      refusedBecause: { cause: 'folder-cannot-be-opened' },
    }
  }
  if (found === undefined) return aManifestFrom(id, null)
  if (found.isSymbolicLink()) {
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.manifestIsALink', { id }),
      refusedBecause: { cause: 'manifest-is-a-link' },
    }
  }
  if (found.isDirectory()) {
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.manifestIsAFolder', { id }),
      refusedBecause: { cause: 'manifest-is-a-folder' },
    }
  }
  // ONLY A REGULAR FILE IS OPENED. Opening a named pipe to read waits until something writes to it, which would stop
  // the whole list without failing, and reading a socket throws.
  if (!found.isFile()) {
    const what = whatItIs(found)
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.manifestIsNotAFile', { id, what: sayInEnglish(A_THING_WORD[what]) }),
      refusedBecause: { cause: 'manifest-is-not-a-file', what },
    }
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EACCES') throw err
    return {
      refusal: sayInEnglish('settingsPanel.plugins.why.manifestCannotBeRead', { id }),
      refusedBecause: { cause: 'manifest-cannot-be-read' },
    }
  }
  return aManifestFrom(id, text)
}

/** What lstat says a plugin.json is when it is not a file, a folder or a link, as the one word the reading carries. */
function whatItIs(found: Stats): PluginManifestIsNotAFile {
  if (found.isFIFO()) return 'named-pipe'
  if (found.isSocket()) return 'socket'
  if (found.isCharacterDevice()) return 'character-device'
  if (found.isBlockDevice()) return 'block-device'
  return 'unknown'
}

/** Every plugin under `folder`, sorted by id, and whether each is switched on. Read on every call. */
export function readThePlugins(folder: string = pluginsFolderFrom(process.env)): PluginsReading {
  if (!existsSync(folder)) return { folderFound: false, interface: PLUGIN_READ_INTERFACE, plugins: [] }
  const switches = theStoredSwitches() ?? {}
  // LSTAT FIRST, because stat follows a link and throws on one that leads to nothing. existsSync follows it too, and
  // answers false both when what the link names is not there and when the link leads back to itself.
  const ids = readdirSync(folder)
    .filter((name) => {
      if (name.startsWith('.')) return false
      const path = join(folder, name)
      const entry = lstatSync(path)
      if (!entry.isSymbolicLink()) return entry.isDirectory()
      return !existsSync(path) || statSync(path).isDirectory()
    })
    .sort()
  const plugins = ids.map((id): PluginReading => {
    const refused = (said: { refusal: string; refusedBecause: PluginRefusedBecause }): PluginReading => ({
      id,
      state: 'refused',
      nobodyChose: !(id in switches),
      manifest: null,
      ...said,
    })
    if (lstatSync(join(folder, id)).isSymbolicLink()) {
      if (!existsSync(join(folder, id))) {
        return refused({
          refusal: sayInEnglish('settingsPanel.plugins.why.folderLeadsNowhere', { id }),
          refusedBecause: { cause: 'folder-leads-nowhere' },
        })
      }
      return refused({
        refusal: sayInEnglish('settingsPanel.plugins.why.folderIsALink', { id }),
        refusedBecause: { cause: 'folder-is-a-link' },
      })
    }
    const read = readTheManifest(id, join(folder, id))
    // ONLY THE TWO FIELDS PluginReading DECLARES. `read` also carries the issues aManifestFrom reads for its own
    // caller (tools/check-a-plugin.mjs), and spreading it whole would answer an undeclared `issues` key.
    if ('refusal' in read) return refused({ refusal: read.refusal, refusedBecause: read.refusedBecause })
    const chosen = switches[id]
    return { id, state: chosen === true ? 'on' : 'off', nobodyChose: chosen === undefined, manifest: read.manifest, refusal: null, refusedBecause: null }
  })
  return { folderFound: true, interface: PLUGIN_READ_INTERFACE, plugins }
}

/**
 * THE KINDS OF FILE A PLUGIN'S PAGE IS DRAWN FROM, by the end of the file's name. Any other file is not served: a type
 * this table does not name would have to be guessed, and a browser told the wrong type may run it as something else.
 */
const A_PLUGIN_FILE_TYPE: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  woff2: 'font/woff2',
}

/** One part of a path to a plugin's file: no dot first, so no "..", no hidden file, and no slash of either kind. */
const A_PATH_PART = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/

/** The refusal for a plugin that has no page, asked for the plugin as a whole. */
function whyNoFileIsServed(id: string, why: WhyAPluginHasNoPage): PanelError {
  switch (why.why) {
    case 'no-folder':
      return new PanelError('This office has no plugins folder, so it serves no plugin files.', 404)
    case 'unknown':
      return new PanelError(`There is no plugin "${id}" in the plugins folder, so it has no files to serve.`, 404)
    case 'refused':
      return new PanelError(`The plugin "${id}" was refused, so its files are not served. ${why.refusal}`, 403)
    case 'off':
      return new PanelError(`The plugin "${id}" is switched off, so its files are not served. The owner switches it on in Settings.`, 403)
    case 'no-such-page':
      // ASKED WITH NO PAGE, so whyAPluginHasNoPage cannot answer this. If it ever does, that is a broken assumption.
      throw new Error(`whyAPluginHasNoPage answered no-such-page for the plugin "${id}" when no page was asked.`)
  }
}

/**
 * ONE FILE OF A PLUGIN'S BUILT PAGES, OR WHY IT IS NOT SERVED. `asked` is the path under the plugin's built folder, as
 * it came after /files/ in the address. The plugin must be switched on (whyAPluginHasNoPage, the one place that
 * decides it), every part of the path must be a plain name, and its type must be in the table above. The built folder
 * must be a real folder, not a link, since git can keep a link by that name. The file must be inside the plugin's own
 * built folder after every link in the path is followed: inside the plugins folder, under the plugin's id. A plugin
 * folder that is itself a link is refused by readThePlugins before this is asked. Each refusal is a sentence, and
 * nothing is read before all of it holds.
 */
export function aPluginsBuiltFile(
  id: string,
  asked: string,
  folder: string = pluginsFolderFrom(process.env),
): { path: string; type: string } {
  const why = whyAPluginHasNoPage(readThePlugins(folder), id, null)
  if (why !== null) throw whyNoFileIsServed(id, why)
  const parts = asked.split('/')
  if (asked.length > 400 || parts.length > 8 || !parts.every((part) => A_PATH_PART.test(part))) {
    throw new PanelError(
      `"${asked.slice(0, 120)}" is not a path to a plugin file. Each part of the path is letters, digits, dots, dashes ` +
        'and underscores, and does not start with a dot.',
      400,
    )
  }
  const extension = /\.([a-z0-9]+)$/.exec(parts[parts.length - 1] ?? '')?.[1] ?? ''
  const type = A_PLUGIN_FILE_TYPE[extension]
  if (type === undefined) {
    throw new PanelError(
      `A plugin file must end in one of ${Object.keys(A_PLUGIN_FILE_TYPE).map((one) => `.${one}`).join(', ')}, and ` +
        `"${asked}" does not, so it is not served.`,
      404,
    )
  }
  const built = join(folder, id, PLUGIN_BUILT_FOLDER)
  const notThere = (): never => {
    throw new PanelError(
      `The plugin "${id}" has no file "${asked}" in its ${PLUGIN_BUILT_FOLDER}/ folder. If it is the page itself, the ` +
        'plugin may not have been built.',
      404,
    )
  }
  let builtIsALink: boolean
  try {
    builtIsALink = lstatSync(built).isSymbolicLink()
  } catch {
    return notThere()
  }
  if (builtIsALink) {
    throw new PanelError(
      `The plugin "${id}" has its ${PLUGIN_BUILT_FOLDER}/ as a link to another place, so none of its files are served. ` +
        `Its built pages are served only from a real ${PLUGIN_BUILT_FOLDER}/ folder inside its own folder.`,
      403,
    )
  }
  let real: string
  let base: string
  try {
    // WHERE THE PLUGIN'S OWN BUILT FOLDER IS: the plugins folder with its links followed, then the id and dist/ as names.
    base = join(realpathSync(folder), id, PLUGIN_BUILT_FOLDER)
    real = realpathSync(join(built, ...parts))
  } catch {
    return notThere()
  }
  if (!real.startsWith(base + sep)) {
    throw new PanelError(
      `"${asked}" of the plugin "${id}" leads, through a link, to a file outside the plugin's own ` +
        `${PLUGIN_BUILT_FOLDER}/ folder, so it is not served.`,
      403,
    )
  }
  if (!statSync(real).isFile()) return notThere()
  return { path: real, type }
}

/**
 * SWITCH ONE PLUGIN ON OR OFF, OR TAKE THE CHOICE AWAY WITH null, AND ANSWER WITH THAT PLUGIN AS IT NOW STANDS. The
 * caller has already checked who is asking. An unknown plugin is a 404 and switching on a refused one is a 409, both
 * before anything is written.
 */
export function switchAPlugin(id: string, on: boolean | null, folder: string = pluginsFolderFrom(process.env)): PluginReading {
  const before = readThePlugins(folder).plugins.find((plugin) => plugin.id === id)
  if (before === undefined) {
    throw new PanelError(`There is no plugin "${id}" in the plugins folder. Nothing was changed.`, 404)
  }
  if (before.state === 'refused' && on === true) {
    throw new PanelError(
      `The plugin "${id}" cannot be switched on, because it was refused: ${before.refusal ?? ''} Nothing was changed.`,
      409,
    )
  }
  const switches: Switches = { ...(theStoredSwitches() ?? {}) }
  if (on === null) delete switches[id]
  else switches[id] = on
  const written = sqlite
    .prepare('UPDATE installation SET plugin_switches = ? WHERE only_row = 1')
    .run(Object.keys(switches).length === 0 ? null : JSON.stringify(switches))
  if (written.changes !== 1) {
    throw new PanelError('This database has no installation row, so the plugin switch could not be stored. Nothing was changed.', 500)
  }
  const after = readThePlugins(folder).plugins.find((plugin) => plugin.id === id)
  if (after === undefined) {
    throw new PanelError(`The plugin "${id}" left the plugins folder while it was being switched. The switch was stored.`, 409)
  }
  return after
}
