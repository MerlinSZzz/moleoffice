// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN API KEY IN A LOGIN FILE OF A SANDBOX, looked for before a start while the provider router is on. With the router on,
 * no run is handed an API key in its environment (theRoutedKeysLeftOut in tools/provider-router-host.mjs), and a key kept
 * in a file a harness signs in from would reach the run all the same. So a start is refused while one is there, and the
 * file is left as it is, for the person to take the key out.
 *
 * Each file below is one a harness signs in from or takes a key from, and each lies where a run can read it: a sandbox's
 * home is its container's home, and the sandbox's folder is mounted whole. Each is read only at the entries where its
 * harness keeps an API key. A subscription login is not an API key and is not read: Claude Code's claudeAiOauth, Codex's
 * ChatGPT tokens and an OpenCode entry of type oauth. A value written in OpenCode's `{env:NAME}` or `{file:path}` form
 * names where a key is, and is not one.
 *
 * WHAT THIS CANNOT FIND: a key in any other file or at any other entry, or one written in another form, such as base64.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THE_API_KEY_NAMES, THE_ROUTER_SETTING, aSecretsMark } from '../../src/config/provider-router.mjs'

/** A value OpenCode reads as the place a key is, not as the key. */
const AN_OPENCODE_REFERENCE = /^\{(env|file):[^}]*\}$/
/** The names of the API keys in an object of environment variables, as entries under `under`. */
const theKeyNamesIn = (env, under) => THE_API_KEY_NAMES.map((name) => [`${under}${name}`, env?.[name]])
/** The lines of an env file that set an API key, as entries named by the variable. */
function theKeyLinesOf(text) {
  return text.split('\n').flatMap((line) => {
    const set = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (set === null || !THE_API_KEY_NAMES.includes(set[1])) return []
    const value = set[2].trim()
    return [[set[1], /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value]]
  })
}

/**
 * THE LOGIN FILES OF A HOME, by their path in it, each with the entries where its harness keeps an API key.
 * @type {readonly {file: string, entries: (held: any) => [string, unknown][], references?: boolean}[]}
 */
export const THE_LOGIN_FILES_OF_A_HOME = Object.freeze([
  // Codex signed in with an API key (codex login --with-api-key).
  { file: '.codex/auth.json', entries: (held) => [['OPENAI_API_KEY', held.OPENAI_API_KEY]] },
  // OpenCode signed in to a provider with an API key (opencode auth login).
  { file: '.local/share/opencode/auth.json', entries: (held) => Object.entries(held).filter(([, one]) => one?.type === 'api').map(([provider, one]) => [`${provider}.key`, one.key]) },
  // OpenCode's settings, which the launcher writes keeping what they hold (prepareOpenCodeHome in tools/sandbox-common.mjs).
  { file: '.config/opencode/opencode.json', references: true, entries: (held) => Object.entries(held.provider ?? {}).map(([id, one]) => [`provider.${id}.options.apiKey`, one?.options?.apiKey]) },
  // Claude Code's settings, which the launcher writes keeping what they hold (noAttributionInCommits in tools/sandbox.mjs).
  { file: '.claude/settings.json', entries: (held) => theKeyNamesIn(held.env, 'env.') },
  // Claude Code signed in with an API key.
  { file: '.claude.json', entries: (held) => [['primaryApiKey', held.primaryApiKey]] },
])

/**
 * THE LOGIN FILES OF A SANDBOX'S FOLDER: those of its home, and dsh's env file, which an older launcher copied into the
 * folder and which holds the DeepSeek key (copyTheDshFolder in tools/sandbox.mjs).
 */
export const THE_LOGIN_FILES_OF_A_SANDBOX = Object.freeze([
  ...THE_LOGIN_FILES_OF_A_HOME.map((one) => ({ ...one, file: `home/${one.file}` })),
  { file: 'dsh/env', lines: true },
])

/**
 * THE LOGIN FILES OF A CHECK'S PRIVATE HOME as the check will have them: a file a login seed is copied to is read from
 * the seed.
 * @param {readonly {host: string, target: string}[]} seeds
 */
export function theLoginFilesOfACheckHome(seeds) {
  return THE_LOGIN_FILES_OF_A_HOME.map((one) => {
    const seed = seeds.find(({ target }) => target === one.file)
    return seed === undefined ? one : { ...one, seed: seed.host }
  })
}

/**
 * EVERY API KEY IN THESE LOGIN FILES UNDER `folder`: the file's path in the folder, the entry, and the key's mark, never
 * the key. A file that is not there holds none. Throws, naming the file and never what it holds, when a file is there
 * and cannot be read as its harness writes it, since then whether it holds a key cannot be said.
 * @param {string} folder @param {readonly {file: string, seed?: string, entries?: (held: any) => [string, unknown][], lines?: boolean, references?: boolean}[]} files
 * @returns {{file: string, entry: string, mark: string}[]}
 */
export function theApiKeysInLoginFiles(folder, files) {
  return files.flatMap((one) => {
    const named = one.seed === undefined ? `${one.file} in ${folder}` : `The login seed of ${one.file}`
    let text
    try {
      text = readFileSync(one.seed ?? join(folder, one.file), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []
      throw new Error(`${named} could not be read (${String(error.code)}), so whether it holds an API key cannot be said.`)
    }
    let entries
    if (one.lines === true) entries = theKeyLinesOf(text)
    else {
      let held = null
      try { held = JSON.parse(text) } catch { /* said below */ }
      if (held === null || typeof held !== 'object' || Array.isArray(held)) throw new Error(`${named} is not a JSON object, so whether it holds an API key cannot be said.`)
      entries = one.entries(held)
    }
    return entries
      .filter(([, value]) => typeof value === 'string' && value !== '' && !(one.references === true && AN_OPENCODE_REFERENCE.test(value)))
      .map(([entry, value]) => ({ file: one.file, entry, mark: aSecretsMark(value) }))
  })
}

/**
 * THE ONE SENTENCE THAT REFUSES A START while these login files under `folder` hold an API key, or cannot be read, and
 * null while they hold none. It names each file, entry and mark, never a key; `where` names the folder and begins it. It
 * is one sentence, since the launcher shows the first sentence of a refusal and keeps the rest in its details file.
 * @param {string} folder @param {Parameters<typeof theApiKeysInLoginFiles>[1]} files @param {string} where
 * @returns {string | null}
 */
export function whyAStartIsRefusedForTheLoginFiles(folder, files, where) {
  let found
  try {
    found = theApiKeysInLoginFiles(folder, files)
  } catch (error) {
    return `${error instanceof Error ? error.message : String(error)} Nothing was started.`
  }
  if (found.length === 0) return null
  const each = found.map((one) => `${one.file} at ${one.entry} (${one.mark})`).join(', ')
  const one = new Set(found.map(({ file }) => file)).size === 1
  return `${where} holds ${found.length === 1 ? 'an API key' : 'API keys'} in ${each}, and no API key may reach a sandbox while ${THE_ROUTER_SETTING} is on, so nothing was started and ${one ? 'the file was left as it is' : 'the files were left as they are'}.`
}
