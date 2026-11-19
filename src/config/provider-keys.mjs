// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW A PROVIDER KEY IS READ OUT OF THE OFFICE'S OWN FILE, AND THEN OUT OF THE ENVIRONMENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHY IT IS A SECOND READER
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/keys.ts` owns the office's one key file beside the database. Nothing exported
 * from it returns a provider's value: it answers only whether one is set, because a door must never
 * hand a value back. The places that actually USE a key — the three OpenRouter tools (the two picture
 * tools and tools/openrouter.mjs) and the Kimi adapter — therefore need a reader, and this is it. `src/server/lib/keys.ts` names Cluster D's
 * U2 as the second reader of its file, and this module is that second reader.
 *
 * IT READS THE FILE FIRST AND THE ENVIRONMENT SECOND, and it says which it used. The office keeps
 * its own keys in the file beside the database. The environment line is only what a
 * reader falls back to when nothing is set there, so that an installation which already had a key
 * in `.env` keeps working. That is the rule this function exists to make true in one place, so its
 * readers cannot each spell it differently.
 *
 * IT NEVER PRINTS, LOGS OR RETURNS A VALUE TO A DOOR. It returns the value to the one caller that
 * has to send it to the provider, and its `from` says which store it came from. A caller that draws
 * something draws the `from`, never the value.
 *
 * THE VALUE IS NEVER WRITTEN TO THE DATABASE AND `.env` IS NEVER WRITTEN. This reads only.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES WHEN THE FILE IS THERE BUT IS NOT THE FILE THIS OFFICE WRITES
 * ---------------------------------------------------------------------------------------
 *
 * `keys.ts` refuses a file that is not the shape this office writes. A reader that quietly answered
 * "no key" for a file it could not parse would be the silent fallback the second invariant forbids,
 * so `why` carries the refusal and the caller says it. It does not change the file and it does not
 * make one: making one is `ensureKeysExist`'s job, in keys.ts.
 */

import { existsSync, readFileSync } from 'node:fs'

import { keysPathFrom } from './settings.mjs'

/**
 * One provider key as a reader asked for it.
 *
 * @typedef {object} ProviderKeyReading
 * @property {string | null} value  The key itself, or null because nothing is set.
 * @property {string | null} from   Which store it came from, named for a person; null when nothing.
 * @property {string | null} why    Why nothing was found, when the reason is worth saying; else null.
 * @property {boolean} empty        Whether a name that could hold it was set to an empty value.
 */

/** A reading that found nothing, with the reason and whether a name was set to empty. */
/**
 * @param {string | null} why
 * @param {boolean} [empty]
 * @returns {ProviderKeyReading}
 */
function nothing(why, empty = false) {
  return { value: null, from: null, why, empty }
}

/**
 * Read one provider's entry out of the office's key file, or say why it could not be read.
 *
 * A LOWER-CASE PROVIDER NAME, the same one `setProviderSecret` was given. An entry that is present
 * but is not usable text is treated as the file being wrong rather than as a key being set: `keys.ts`
 * would already have refused the whole file, and reading past it here could hand a caller a value
 * that is not a key.
 *
 * THE PATH COMES FROM THIS PROCESS, NOT FROM A CALLER. The key file belongs to the office process,
 * whose `MOLE_OFFICE_DB` names the database it sits beside; a caller that hands in an environment
 * built for a RUN is describing that run's world, not the office's file. `process.env` is therefore
 * read here on purpose, and a test that wants another file sets `MOLE_OFFICE_DB` before importing.
 *
 * @param {string} provider
 * @returns {ProviderKeyReading}
 */
export function providerKeyFromTheOfficeFile(provider) {
  let path
  try {
    path = keysPathFrom(process.env)
  } catch (err) {
    return nothing(`the office key file's path could not be worked out: ${String(err)}`)
  }
  return providerKeyFromTheKeyFileAt(path, provider)
}

/**
 * The same read of one provider's entry, out of the key file at `path`. Only a host process that has
 * worked out the office's own file passes a path: the inspector, which keeps the database it was
 * started for after it removes `MOLE_OFFICE_DB` from its own environment (tools/the-inspector.mjs).
 * It opens that one file and nothing else.
 *
 * @param {string} path
 * @param {string} provider
 * @returns {ProviderKeyReading}
 */
export function providerKeyFromTheKeyFileAt(path, provider) {
  if (!existsSync(path)) {
    return nothing(`the office key file ${path} is not there yet`)
  }
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return nothing(`${path} is the office's key file and it is not readable JSON`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return nothing(`${path} is the office's key file and it is not the JSON object this office writes`)
  }
  const providers = /** @type {Record<string, unknown>} */ (parsed)['providers']
  if (providers === undefined) {
    return nothing(
      `${path} is the office's key file and it has no providers section. That is the older flat shape, ` +
        'and it is not read as the new one',
    )
  }
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
    return nothing(`${path} holds providers as something other than an object`)
  }
  const held = /** @type {Record<string, unknown>} */ (providers)[provider]
  if (held === undefined) return nothing(null)
  if (typeof held !== 'string' || held.trim() === '') {
    return nothing(`${path} holds a "${provider}" entry that is not a usable key, so it was not read`)
  }
  return { value: held, from: `the office's key file for ${provider}`, why: null, empty: false }
}

/**
 * ONE PROVIDER KEY, THE FILE FIRST AND THE ENVIRONMENT SECOND, AND WHICH OF THE TWO IT WAS.
 *
 * `envNames` are the environment lines this provider falls back to, most specific first: the Kimi
 * adapter reads KIMI_API_KEY before MOONSHOT_API_KEY, because the name Kimi CLI itself reads is the
 * more specific statement. A name that is present and set to an empty value STOPS THE READ: it is
 * not a key, and set-and-empty and never-set are different statements, so the caller is told which
 * name it was rather than being passed on to the next line.
 *
 * @param {string} provider
 * @param {readonly string[]} envNames
 * @param {Record<string, string | undefined>} [env]
 * @returns {ProviderKeyReading}
 */
export function providerKeyFromTheFileThenTheEnvironment(provider, envNames, env = process.env) {
  const fromFile = providerKeyFromTheOfficeFile(provider)
  if (fromFile.value !== null) return fromFile
  for (const name of envNames) {
    const held = env[name]
    if (held === undefined) continue
    if (held.trim() === '') {
      return nothing(`${name} is set to an empty value, which is not a key`, true)
    }
    return { value: held, from: name, why: null, empty: false }
  }
  return fromFile
}
