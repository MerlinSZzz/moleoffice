// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER, THE PARTS EVERY SIDE READS: the setting, the providers it routes, which runs it must carry, where
 * its sockets and its key slots file are, how that file is read and written, the unit's text, and how a secret is named
 * in a log. The key layer's step 2 routed DeepSeek; step 3 adds OpenCode Go, whose subscriptions the router uses in turn;
 * It also routes the API-key providers used directly by OpenCode.
 *
 * WHAT THE ROUTER IS. A host process (tools/provider-router.mjs) that alone reads the providers' keys, from a key slots
 * file of mode 0600 in a folder of mode 0700 in the person's home. A routed run gets its run's token in place of the key,
 * and a bridge on the container's loopback (tools/provider-router-bridge.mjs) carries its requests to one socket of the
 * router's for that sandbox. The router asks the office to admit the token for the request's model, swaps in a slot's
 * key, sends the request on, and settles a receipt with the office. The token's models come from the Casting row the run
 * was started from, and from nothing else.
 *
 * WHAT IS NOT ROUTED. Check views and isolated execs get no DeepSeek key and no OpenCode Go key while the setting is on,
 * so the office does not start while a Casting row in force for the inspector uses dsh or OpenCode Go.
 */
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readSetting, settingValue } from './settings.mjs'
import { THE_ROUTER_CAP_SETTING, THE_ROUTER_SETTING } from './provider-router-settings.mjs'

export { THE_ROUTER_CAP_SETTING, THE_ROUTER_SETTING }

/**
 * The providers the router carries, by the name in a bridge's path. `program` and `nativeProvider` retain the original
 * route; `harnesses` adds further runtime and native provider pairs. `modelPrefix` is null when every run of
 * the program goes through the provider, and otherwise the start of the office's model name for a run that does.
 * `baseUrlName` is null when the program reads its address from its config and not from a variable. `paidBy` is 'tokens'
 * when the office prices each request from the price table, and 'subscription' when a request costs nothing more than the
 * subscription the slot's key belongs to.
 */
// Loopback stand-ins recorded the installed dsh and OpenCode chat paths, OpenCode's Anthropic messages path, and
// the Responses path sent by installed OpenCode and Codex. OpenAI chat remains available for chat-based callers.
export const THE_ROUTED_PROVIDERS = Object.freeze({
  deepseek: Object.freeze({
    upstream: 'https://api.deepseek.com',
    harnesses: Object.freeze([{ runtime: 'opencode', nativeProvider: 'deepseek', modelPrefix: 'deepseek/' }]),
    paths: Object.freeze(['/chat/completions']),
    keyHeader: 'authorization',
    program: 'dsh',
    nativeProvider: 'deepseek-official',
    modelPrefix: null,
    keyName: 'DEEPSEEK_API_KEY',
    baseUrlName: 'DEEPSEEK_BASE_URL',
    named: 'DeepSeek',
    paidBy: 'tokens',
  }),
  // THE ADDRESS IS THE ONE OPENCODE'S MODEL CATALOG GAVE FOR GO ON 17 OCTOBER 2026, read and not measured: no request
  // has been sent to it through the router.
  'opencode-go': Object.freeze({
    upstream: 'https://opencode.ai/inference/go/openai/v1',
    harnesses: Object.freeze([]),
    paths: Object.freeze(['/chat/completions']),
    keyHeader: 'authorization',
    program: 'opencode',
    nativeProvider: 'opencode-go',
    modelPrefix: 'opencode-go/',
    keyName: 'OPENCODE_API_KEY',
    baseUrlName: null,
    named: 'OpenCode Go',
    paidBy: 'subscription',
  }),
  openrouter: Object.freeze({
    upstream: 'https://openrouter.ai/api/v1',
    harnesses: Object.freeze([{ runtime: 'opencode', nativeProvider: 'openrouter', modelPrefix: 'openrouter/' }]),
    paths: Object.freeze(['/chat/completions']),
    keyHeader: 'authorization',
    program: 'openrouter',
    nativeProvider: 'openrouter',
    modelPrefix: 'openrouter/',
    keyName: 'OPENROUTER_API_KEY',
    baseUrlName: 'OPENROUTER_BASE_URL',
    named: 'OpenRouter',
    paidBy: 'tokens',
  }),
  openai: Object.freeze({
    upstream: 'https://api.openai.com/v1',
    harnesses: Object.freeze([{ runtime: 'opencode', nativeProvider: 'openai', modelPrefix: 'openai/' }]),
    paths: Object.freeze(['/chat/completions', '/responses']),
    keyHeader: 'authorization',
    program: 'openai',
    nativeProvider: 'openai',
    modelPrefix: 'openai/',
    keyName: 'OPENAI_API_KEY',
    baseUrlName: 'OPENAI_BASE_URL',
    named: 'OpenAI',
    paidBy: 'tokens',
  }),
  anthropic: Object.freeze({
    upstream: 'https://api.anthropic.com/v1',
    program: 'anthropic',
    nativeProvider: 'anthropic',
    modelPrefix: 'anthropic/',
    keyName: 'ANTHROPIC_API_KEY',
    baseUrlName: 'ANTHROPIC_BASE_URL',
    named: 'Anthropic',
    paidBy: 'tokens',
    harnesses: Object.freeze([{ runtime: 'opencode', nativeProvider: 'anthropic', modelPrefix: 'anthropic/' }]),
    paths: Object.freeze(['/messages']),
    keyHeader: 'x-api-key',
  }),
})

/** Every provider key name, plus the name Codex accepts for an OpenAI key. */
export const THE_API_KEY_NAMES = Object.freeze([...new Set([...Object.values(THE_ROUTED_PROVIDERS).map((one) => one.keyName), 'CODEX_API_KEY'])])

/** All runtime and native-provider routes, including tool callers and additional harnesses. */
export function theRoutesOfTheRouter() {
  return Object.entries(THE_ROUTED_PROVIDERS).flatMap(([provider, one]) => [
    { provider, runtime: one.program, nativeProvider: one.nativeProvider, modelPrefix: one.modelPrefix },
    ...one.harnesses.map((route) => ({ provider, ...route })),
  ])
}

/**
 * The route that carries a run while the router is on, or null when none does.
 * @param {string | undefined} runtime
 * @param {string | null | undefined} model the office's model name for the run
 * @param {string | null | undefined} nativeProvider the native provider of the Casting row it was started from
 */
export function theRouteCarrying(runtime, model, nativeProvider) {
  const routes = theRoutesOfTheRouter().filter((route) => route.runtime === runtime)
  return routes.find((route) => nativeProvider != null && nativeProvider === route.nativeProvider)
    ?? routes.find((route) => route.modelPrefix === null || (typeof model === 'string' && model.startsWith(route.modelPrefix)))
    ?? null
}

/**
 * Whether a route carries the run while the router is on; the launcher asks before handing a run any key.
 * @param {string | undefined} runtime
 * @param {string | null | undefined} model the office's model name for the run
 * @param {string | null | undefined} nativeProvider the native provider of the Casting row it was started from
 */
export function theRouterMustCarry(runtime, model, nativeProvider) {
  return theRouteCarrying(runtime, model, nativeProvider) !== null
}

/** Where a sandbox's router folder is mounted inside its container, read-only. */
export const THE_ROUTER_FOLDER_INSIDE = '/run/mole-office-provider-router'
/** The socket's name in a sandbox's router folder. */
export const THE_ROUTER_SOCKET_NAME = 'router.sock'
/** The env file line that tells the helper to open the bridge: a JSON object of the provider and the socket inside. */
export const THE_ROUTER_VARIABLE = 'SANDBOX_PROVIDER_ROUTER'

/**
 * THE UPSTREAM PATHS A TOOL MAY ASK THE ROUTER TO CARRY, BY PROVIDER, AND THE METHOD EACH ONE IS ASKED WITH. The office's
 * carrying route (POST /api/provider-router/tool-requests) accepts only these paths, and the router builds the upstream
 * address from its provider's base and the path here; a path or method a caller names is never passed through.
 *
 * OpenRouter is the provider the three OpenRouter tools use. They ask for its public model list, their key's own limit,
 * chat completions for a video review, and images for the picture tools. The other providers carry chat completions,
 * which is the one route the bridge already gives a harness run; no other path is opened for them.
 */
export const THE_TOOL_REQUEST_PATHS = Object.freeze({
  deepseek: Object.freeze({ '/chat/completions': 'POST' }),
  'opencode-go': Object.freeze({ '/chat/completions': 'POST' }),
  openrouter: Object.freeze({
    '/models': 'GET',
    '/key': 'GET',
    '/chat/completions': 'POST',
    '/images': 'POST',
  }),
  openai: Object.freeze({ '/chat/completions': 'POST' }),
})

/**
 * The method one provider's path is carried with, or null when that provider does not carry the path.
 * @param {string} provider
 * @param {string} path
 * @returns {'GET' | 'POST' | null}
 */
export function theMethodTheToolRequestUses(provider, path) {
  const paths = Object.hasOwn(THE_TOOL_REQUEST_PATHS, provider)
    ? THE_TOOL_REQUEST_PATHS[/** @type {keyof typeof THE_TOOL_REQUEST_PATHS} */ (provider)]
    : undefined
  if (paths === undefined || !Object.hasOwn(paths, path)) return null
  return /** @type {'GET' | 'POST'} */ (paths[/** @type {keyof typeof paths} */ (path)])
}

/** @param {string} name @param {Record<string, string | undefined> | undefined} env */
function theSettingIn(name, env) {
  return env === undefined || env === process.env ? settingValue(name) : readSetting(name, env).value
}

/**
 * Whether the router is on. Refuses any word but on and off, as readSetting does.
 * @param {Record<string, string | undefined>} [env]
 */
export function theProviderRouterIsOn(env) {
  return theSettingIn(THE_ROUTER_SETTING, env) === 'on'
}

/**
 * The most one run may spend through the router, in US dollars, or null when no cap is set.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number | null}
 */
export function theRunCapOfTheRouter(env) {
  const value = theSettingIn(THE_ROUTER_CAP_SETTING, env)
  return value === null ? null : Number(value)
}

/**
 * The routed provider a Casting selection's program and native provider name, or null.
 * @param {{ runtime: string, native: { provider: string | null } } | null | undefined} selection
 * @returns {string | null}
 */
export function theRoutedProviderOf(selection) {
  if (selection == null) return null
  const found = theRoutesOfTheRouter().find((route) => route.runtime === selection.runtime && route.nativeProvider === selection.native?.provider)
  return found?.provider ?? null
}

/**
 * The sentence for a selection the router does not carry, or null when it carries it.
 * @param {{ runtime: string, native: { provider: string | null }, casting: { id: number } | null }} selection
 * @returns {string | null}
 */
export function whyTheRouterDoesNotCarry(selection) {
  if (theRoutedProviderOf(selection) !== null) return null
  const routes = theRoutesOfTheRouter().map((one) => `${one.runtime} through ${one.nativeProvider}`).join(' and ')
  const row = selection.casting === null ? 'The selection' : `Casting ${String(selection.casting.id)}`
  return `The provider router routes only ${routes}, and ${row} gives ${selection.runtime} through ${selection.native?.provider ?? 'no named provider'}.`
}

/** The router's own folder under the sandboxes' host-only folder, of mode 0700, which no sandbox mounts. */
export function theRouterControlFolder(sandboxes) {
  return join(sandboxes, '.run', '.provider-router')
}

/** The socket the launcher asks the router on, of mode 0600. */
export function theRouterControlSocket(sandboxes) {
  return join(theRouterControlFolder(sandboxes), 'control.sock')
}

/** The key slots file in a home: the only file the router reads a key from. */
export function theKeySlotsFile(home) {
  return join(home, '.config', 'mole-office', 'key-slots.json')
}

/** The pin lives beside the key slots. */
export const theGoPinFile = (slotsFile) => join(dirname(slotsFile), 'go-pin.json')

/** A state file lives beside the slots, in a private directory. */
export function thePrivateGoStateFolder(file) {
  const folder = dirname(file)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const found = lstatSync(folder)
  if (!found.isDirectory() || found.isSymbolicLink() || (found.mode & 0o077) !== 0) throw new Error(`The state folder ${folder} must be a private directory.`)
}

/** A missing pin is no pin. A malformed or accessible file is refused. */
export function readTheGoPin(file) {
  if (file === null) return null
  const found = lstatSync(file, { throwIfNoEntry: false })
  if (found === undefined) return null
  if (!found.isFile() || found.isSymbolicLink() || (found.mode & 0o077) !== 0) throw new Error(`The pin file ${file} must be a private regular file.`)
  const pin = JSON.parse(readFileSync(file, 'utf8'))
  if (pin === null) return null
  if (typeof pin !== 'object' || typeof pin.slot !== 'string' || typeof pin.who !== 'string' || typeof pin.at !== 'string') throw new Error(`The pin file ${file} is invalid.`)
  return { slot: pin.slot, who: pin.who, at: pin.at }
}

/** Write a pin or clear it atomically, without ever writing a key. */
export function writeTheGoPin(file, pin) {
  thePrivateGoStateFolder(file)
  const temporary = `${file}.${randomBytes(12).toString('hex')}.new`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(pin)}\n`)
    fsyncSync(fd)
  } catch (error) {
    closeSync(fd)
    unlinkSync(temporary)
    throw error
  }
  closeSync(fd)
  renameSync(temporary, file)
}

const SLOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u

/**
 * THE KEY SLOTS, read from the person's slots file. The file must be a regular file of mode 0600 or tighter, in a folder
 * of mode 0700 or tighter, and not a link. No refusal holds the file's text. The router reads it at each request, and
 * the Settings page's doors read it before they write it.
 * @param {string} file
 * @returns {{ id: string, provider: string, label: string, key: string }[]}
 */
export function readTheKeySlots(file) {
  let found = null
  try { found = lstatSync(file) } catch { found = null }
  if (found === null) throw new Error(`The key slots file ${file} does not exist, so the provider router holds no key.`)
  if (found.isSymbolicLink()) throw new Error(`The key slots file ${file} is a link, and the provider router reads only a file of its own.`)
  if (!found.isFile()) throw new Error(`The key slots file ${file} is not a file.`)
  if ((found.mode & 0o077) !== 0) throw new Error(`The key slots file ${file} may be read by others: make it mode 0600.`)
  const folder = lstatSync(dirname(file))
  if (folder.isSymbolicLink() || !folder.isDirectory()) throw new Error(`The folder of the key slots file ${file} is a link or not a folder.`)
  if ((folder.mode & 0o077) !== 0) throw new Error(`The folder of the key slots file ${file} may be opened by others: make it mode 0700.`)
  let read = null
  // The parser's own message quotes the text it failed on, which may be a key, so it is not passed on.
  try { read = JSON.parse(readFileSync(file, 'utf8')) } catch { read = null }
  if (read === null || typeof read !== 'object') throw new Error(`The key slots file ${file} is not JSON.`)
  if (read.version !== 1 || !Array.isArray(read.slots)) throw new Error(`The key slots file ${file} must hold {"version": 1, "slots": [...]}.`)
  return read.slots.map((slot, at) => {
    const which = `Slot ${String(at + 1)} of the key slots file ${file}`
    if (slot === null || typeof slot !== 'object') throw new Error(`${which} is not an object.`)
    if (typeof slot.id !== 'string' || !SLOT_ID.test(slot.id)) throw new Error(`${which} has no id of letters, digits, dots, dashes and underscores.`)
    if (typeof slot.provider !== 'string' || !Object.hasOwn(THE_ROUTED_PROVIDERS, slot.provider)) {
      throw new Error(`${which} names a provider the router does not route; it routes ${Object.keys(THE_ROUTED_PROVIDERS).join(' and ')}.`)
    }
    if (typeof slot.label !== 'string' || slot.label.trim() === '') throw new Error(`${which} has no label.`)
    if (typeof slot.key !== 'string' || slot.key === '' || /\s/u.test(slot.key)) throw new Error(`${which} has no key, or a key with a space in it.`)
    return { id: slot.id, provider: slot.provider, label: slot.label, key: slot.key }
  })
}

/**
 * WRITES THE KEY SLOTS FILE WHOLE, at mode 0600, through a new file renamed over it, so a reader never meets half a file.
 * The folder is made at mode 0700 when it is missing. A folder that is there and may be opened by others, or that is a
 * link, is refused and left as it is: it is the person's, and the router would not read a file in it.
 * @param {string} file
 * @param {{ id: string, provider: string, label: string, key: string }[]} slots
 */
export function writeTheKeySlots(file, slots) {
  const folder = dirname(file)
  let found = null
  try { found = lstatSync(folder) } catch { found = null }
  if (found === null) mkdirSync(folder, { recursive: true, mode: 0o700 })
  else if (found.isSymbolicLink() || !found.isDirectory()) throw new Error(`The folder of the key slots file ${file} is a link or not a folder, so no key was written.`)
  else if ((found.mode & 0o077) !== 0) throw new Error(`The folder of the key slots file ${file} may be opened by others, so no key was written: make it mode 0700.`)
  const fresh = `${file}.${String(process.pid)}.${String(Date.now())}.new`
  const fd = openSync(fresh, 'wx', 0o600)
  try {
    writeSync(fd, `${JSON.stringify({ version: 1, slots: slots.map(({ id, provider, label, key }) => ({ id, provider, label, key })) }, null, 2)}\n`)
    fsyncSync(fd)
  } catch (error) {
    closeSync(fd)
    rmSync(fresh, { force: true })
    throw error
  }
  closeSync(fd)
  renameSync(fresh, file)
}

/** A secret named in a log or an answer: the start of its sha256, never the secret. */
export function aSecretsMark(secret) {
  return `sha256:${createHash('sha256').update(secret).digest('hex').slice(0, 12)}`
}

/** Where the host user unit is installed. */
export function theProviderRouterUnitPath(home) {
  return join(home, '.config', 'systemd', 'user', 'mole-office-keyrouter.service')
}

/**
 * Whether `path` may go into a unit's line as it is: an absolute path of letters, digits, dots, dashes, underscores and
 * slashes. systemd gives `%`, `$`, quotes, a backslash and a space a meaning of their own in a unit line, so a path
 * holding one is refused, never escaped.
 * @param {unknown} path
 */
export function aPathAUnitLineMayHold(path) {
  return typeof path === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(path)
}

/**
 * THE TWO LINES THAT NAME THE OFFICE THE ROUTER ASKS. A unit gives its process no environment, and the router reads the
 * office's address from MOLE_OFFICE_API and its office key from the key file beside MOLE_OFFICE_DB. The unit used to name
 * neither, so the router started by systemd found no address and no office key and exited at each start.
 * tools/key-router/the-office-the-router-serves.mjs reads both from the stable unit and checks them with that office.
 * The refusals here never print the database's path.
 * @param {{ api: string, database: string }} office
 * @returns {string[]}
 */
export function theOfficeLinesOfTheUnit(office) {
  const { api, database } = office ?? {}
  if (typeof api !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(api)) {
    throw new Error("The office's address cannot go into the router's unit: it must be http://127.0.0.1:<port>.")
  }
  if (!aPathAUnitLineMayHold(database)) {
    throw new Error("The office's database cannot go into the router's unit: it must be an absolute path of letters, digits, dots, dashes, underscores and slashes.")
  }
  return [`Environment=MOLE_OFFICE_API=${api}`, `Environment=MOLE_OFFICE_DB=${database}`]
}

/**
 * THE UNIT'S TEXT. It holds no key: the router reads its slots file itself, and its office key from the key file beside
 * the database the unit names. A secretary runs node tools/key-router/install.mjs --sandboxes <dir> on the host to
 * install and enable it.
 * @param {{ node: string, router: string, sandboxes: string, office: { api: string, database: string } }} paths
 */
export function theProviderRouterUnit({ node, router, sandboxes, office }) {
  for (const path of [node, router, sandboxes]) {
    if (!aPathAUnitLineMayHold(path)) throw new Error(`${JSON.stringify(path)} cannot go into a unit's ExecStart line: it must be an absolute path of letters, digits, dots, dashes, underscores and slashes.`)
  }
  return [
    '[Unit]',
    "Description=Mole Office provider router: swaps a run's token for a provider key",
    '',
    '[Service]',
    'Type=simple',
    ...theOfficeLinesOfTheUnit(office),
    `ExecStart=${node} ${router} serve --sandboxes ${sandboxes}`,
    'Restart=always',
    'RestartSec=2',
    'UMask=0077',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')
}
