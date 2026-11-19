// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OFFICE'S OWN KEY, FOR A PROCESS THAT IS NOT THE SERVER. Criterion P83, point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHY IT IS NOT PART OF keys.ts
 * ---------------------------------------------------------------------------------------
 *
 * The office's own processes — the message worker, the inspector's tool, the supervisor, the session
 * hook, the browser app — hold the office's own key and send it on every request they make to this
 * office. The server recognises that key in src/server/lib/keys.ts, which is the one place a key is
 * read or compared. This module is the other end: it is how a process that is NOT the server finds
 * the key so it can send it.
 *
 * IT IS JAVASCRIPT FOR THE SAME REASON src/config/key-header.mjs IS: a tool, the vite config and the
 * server all have to reach it, and a tool cannot import the server. Importing keys.ts is not an
 * option: keys.ts imports `sqlite` from src/server/db/client.ts, whose module body OPENS THE
 * DATABASE, so a tool that asked about a file would open a database as a side effect.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PLACE NAMES THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The path is `keysPathFrom(env)` from src/config/settings.mjs, called and never re-spelled. A
 * second copy of that arithmetic would silently read the wrong file the moment MOLE_OFFICE_DB moves,
 * which is the defect CLAUDE.md names at the top: one fact worked out in one place. This module
 * spells neither the file's name nor the directory it sits in.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER MAKES THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The SERVER makes it at first run (`ensureKeysExist`, mode 0o600, flag 'wx'). A tool that made it
 * would write a key file for a database the server has not opened, and the office and its tool would
 * then hold different keys with nothing to say which is right. So a missing file, an unreadable file
 * or a file with no office value answers NO KEY and one plain sentence saying what a person should
 * do, naming the FILE and never the bytes in it. Nothing here throws: a request that carries no key
 * is exactly the request every one of these processes made before this piece.
 *
 * ---------------------------------------------------------------------------------------
 * THE VALUE IS NEVER PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The caller puts the answered key straight into the KEY_HEADER it sends. Nothing here logs it,
 * returns it on a page, or writes it into a refusal. A refusal names the file and never the bytes.
 */

import { existsSync, readFileSync } from 'node:fs'

import { keysPathFrom, bootstrapEnvironment } from './settings.mjs'

/**
 * What a process learns when it asks for the office's own key.
 *
 * `key` is the value to send on KEY_HEADER, or null because there is none to send. `says` is the one
 * plain sentence for a person when there is none, and null when there is a key. The two are never
 * both set and never both absent.
 *
 * @typedef {{ key: string, says: null } | { key: null, says: string }} TheOfficeKey
 */

/**
 * The office's own key for a process that is not the server, or null and a sentence saying why.
 *
 * `env` is the environment that names the database: `.env` under the real environment by default,
 * which is the same order every other reader of these settings uses. A caller that was started with
 * an environment of its own (the message worker) passes that environment so it reads the same world
 * it talks to.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {TheOfficeKey}
 */
export function theOfficeKey(env = bootstrapEnvironment()) {
  const path = keysPathFrom(env)

  if (!existsSync(path)) {
    return {
      key: null,
      says:
        `Mole Office has not made its key file at ${path} yet, so this process sends no key; ` +
        'start the office once and it will make one.',
    }
  }

  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {
      key: null,
      says:
        `The file ${path} cannot be read as the JSON this office writes, so this process sends no key; ` +
        'move that file aside and start the office once, which makes a new one.',
    }
  }

  const held = parsed !== null && typeof parsed === 'object' ? /** @type {Record<string, unknown>} */ (parsed) : {}
  const office = held['office']
  if (typeof office !== 'string' || office.trim() === '') {
    return {
      key: null,
      says:
        `The file ${path} holds no office key, so this process sends no key; ` +
        'start the office once and it will make one.',
    }
  }

  return { key: office, says: null }
}
