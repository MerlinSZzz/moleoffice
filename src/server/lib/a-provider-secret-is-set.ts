// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `aProviderSecretIsSet` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theKeyFile` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `alreadyRead` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theKeyFilePath` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theModificationTimeOf` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `readAgain` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `isKeyFile` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `readOrMake` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `whatIsWrongWithTheKeyFile` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `HEX_64` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `aPrivateKeyFileBeside` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { KeyFile } from './keys.ts'
import { keysPathFrom } from '../../config/settings.mjs'
import { statSync, readFileSync, existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { thisSystem, type WhatSettingTheListDid } from '../../config/systems/the-system.mjs'
import { refuseADataFolderInAWorktree } from './git-checkout.ts'

/**
 * WHETHER THIS OFFICE HOLDS A KEY FOR A PROVIDER. The only thing a door may learn about one.
 *
 * A BOOLEAN AND NEVER THE VALUE. Cluster D's U2 decides the Settings surface that draws it; until
 * then this is the reader that exists, and it answers the shape the decision asks for: the Settings page
 * only asks, read-only, whether a key is there. An empty name is not a provider, so it answers false.
 */
export function aProviderSecretIsSet(provider: string): boolean {
  const name = provider.trim()
  if (name === '') return false
  return Object.prototype.hasOwnProperty.call(theKeyFile().providers, name)
}
/**
 * The key file, read once per path, made when it is not there, and READ AGAIN WHEN IT CHANGED ON DISK.
 *
 * MADE WITH `flag: 'wx'`, which fails rather than overwriting if a second process makes it in the
 * same instant. The loser reads the winner's file, so two starts cannot each keep half a key.
 *
 * READ AGAIN WHEN ITS MODIFICATION TIME MOVED (problem 7MYfhEqomIRO, the way agreed in message
 * CEykh1fBwn1l). The values the libraries use are read from the disk each time
 * (providerKeyFromTheOfficeFile), and a copy kept for the life of the process answered "is it there"
 * from the start: after a hand edit the two disagreed until the office started again, and a write
 * merged into the old copy put back an entry taken out by hand. So each read asks the file its
 * modification time, one stat, and reads it again when it moved.
 *
 * THE COPY IS KEPT, AND NOTHING IS MADE, WHEN THE FILE IS GONE: a second start in a process whose
 * folder has gone must not write a key into a folder that is not there (problem iQPGCoY7Wpgu). It is
 * kept too when the changed file is not one this office writes: a hand edit gone wrong must not stop
 * every key proving anything. NOTHING IS PRINTED, because this file never writes to a log, so no key can
 * reach one (a parse error quotes the file it could not read); a read of a key's value, which goes to
 * the disk, says the key cannot be read, and the next start refuses the file in words.
 */
export function theKeyFile(): KeyFile {
  const path = theKeyFilePath()
  const held = alreadyRead.get(path)
  if (held === undefined) {
    const read = readOrMake(path)
    alreadyRead.set(path, { file: read, mtimeMs: theModificationTimeOf(path) })
    return read
  }
  const now = theModificationTimeOf(path)
  if (now === null || now === held.mtimeMs) return held.file
  const again = readAgain(path)
  // THE TIME IS KEPT EITHER WAY, so a changed file that could not be read is not read again at every read
  // after it, only when it changes again. AND WHETHER THE FILE ON DISK IS ONE THIS OFFICE COULD READ is
  // kept with it, for the one writer (problem AHyi2ht3-Zqb).
  alreadyRead.set(path, again === null ? { file: held.file, mtimeMs: now, theDiskIsNotOurs: true } : { file: again, mtimeMs: now })
  return again ?? held.file
}
/**
 * A key file already read in this process, by its path, with the modification time it had when it was read (null when
 * it could not be asked). Cleared whenever `.env` moves the database.
 */
export const alreadyRead = new Map<string, { file: KeyFile; mtimeMs: number | null; theDiskIsNotOurs?: true }>()
/** The path this process's key file lives at, from the database path and nowhere else. */
export function theKeyFilePath(): string {
  return keysPathFrom(process.env)
}
/** The file's modification time, or null when it cannot be asked (it is gone, or its folder is). */
export function theModificationTimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}
/** The key file read again after it changed, or null when it is not one this office writes. Nothing is printed. */
export function readAgain(path: string): KeyFile | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  return isKeyFile(parsed) ? parsed : null
}
/** Whether a parsed value really is the key file this office writes, rather than something else. */
export function isKeyFile(value: unknown): value is KeyFile {
  return whatIsWrongWithTheKeyFile(value) === null
}
export function readOrMake(path: string): KeyFile {
  refuseADataFolderInAWorktree(path)
  if (existsSync(path)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      throw new Error(
        `${path} is the file Mole Office keeps its keys in, and it is not readable JSON. Nothing was changed. ` +
          'Move it aside to have the office make a new one, which will stop every caller already holding the old one.',
      )
    }
    if (!isKeyFile(parsed)) {
      throw new Error(
        `${path} is the file Mole Office keeps its keys in, and it is not the file this office writes: ` +
          `${whatIsWrongWithTheKeyFile(parsed) ?? 'its shape is not one this office writes'}. Nothing was changed. ` +
          'Move it aside to have the office make a new one, which will stop every caller already holding the old one.',
      )
    }
    return parsed
  }
  mkdirSync(dirname(path), { recursive: true })
  const fresh: KeyFile = {
    person: randomBytes(32).toString('hex'),
    office: randomBytes(32).toString('hex'),
    // PRESENT AND EMPTY FROM THE FIRST RUN. Cluster D's U2 is the second reader; see this file's header.
    providers: {},
  }
  const body = `${JSON.stringify(fresh, null, 2)}\n`
  const privately = thisSystem().aFileIsMadePrivate
  if (privately.by === 'its-access-list') {
    // ON WINDOWS THE FILE IS MADE PRIVATE BESIDE ITS PLACE AND LINKED IN. A link fails when a key
    // file is already there, as `wx` does below, and it keeps the file's access list.
    const beside = aPrivateKeyFileBeside(path, body, privately.set)
    try {
      linkSync(beside, path)
      return fresh
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return readOrMake(path)
      throw err
    } finally {
      rmSync(beside, { force: true })
    }
  }
  try {
    // MODE 600 ON LINUX AND THE MAC.
    writeFileSync(path, body, { mode: 0o600, flag: 'wx' })
    return fresh
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return readOrMake(path)
    throw err
  }
}
/**
 * WHAT IS WRONG WITH A PARSED KEY FILE, in a sentence naming what was found, or null because it is
 * the file this office writes.
 *
 * THE OLD FLAT SHAPE IS REFUSED AND NOT UPGRADED. A file holding only `person` and `office` is a
 * file this office wrote before the provider section existed, and the brief for this piece says in
 * as many words that it is not quietly read as the new shape: the reader says which part is missing
 * so a person can move it aside and have the office write a fresh one, and nothing is changed.
 */
export function whatIsWrongWithTheKeyFile(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `it is ${Array.isArray(value) ? 'a list' : value === null ? 'null' : `a ${typeof value}`}, and this office writes a JSON object`
  }
  const held = value as Record<string, unknown>
  if (typeof held['person'] !== 'string' || !HEX_64.test(held['person'])) {
    return held['person'] === undefined
      ? 'it has no "person" key'
      : 'its "person" key is not the 64-character lower-case hex this office writes'
  }
  if (typeof held['office'] !== 'string' || !HEX_64.test(held['office'])) {
    return held['office'] === undefined
      ? 'it has no "office" key'
      : 'its "office" key is not the 64-character lower-case hex this office writes'
  }
  const providers = held['providers']
  if (providers === undefined) {
    return (
      'it has no "providers" section, and this office writes one — present and empty until a provider key ' +
      'is set. That is the older flat shape, and it is not read as the new one'
    )
  }
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
    const found = providers === null ? 'null' : Array.isArray(providers) ? 'a list' : `a ${typeof providers}`
    return `its "providers" section is ${found}, and this office writes it as an object naming each provider`
  }
  for (const [name, secret] of Object.entries(providers)) {
    if (typeof secret !== 'string') {
      const found = secret === null ? 'null' : `a ${typeof secret}`
      return `its "providers" section holds ${found} for "${name}", and every provider entry this office writes is text`
    }
  }
  return null
}
export const HEX_64 = /^[0-9a-f]{64}$/
/**
 * ON WINDOWS, A KEY FILE BESIDE ITS PLACE, MADE PRIVATE BEFORE ANY KEY IS IN IT.
 *
 * It is made empty, its access list is set to this user's alone and read back, and only then is the
 * body written into it. A list that cannot be set, or that reads back as anything else, is refused
 * in words and the empty file is removed, so no key is written into a file other users may read.
 * The caller moves or links the file into place.
 */
export function aPrivateKeyFileBeside(path: string, body: string, set: (path: string) => WhatSettingTheListDid): string {
  const beside = join(dirname(path), `.keys.${randomBytes(8).toString('hex')}.tmp`)
  writeFileSync(beside, '', { flag: 'wx' })
  try {
    const did = set(beside)
    if (!did.ok) {
      throw new Error(
        `${path} is the file Mole Office keeps its keys in, and no key was written to it: the file beside it, ` +
          `which the keys go through, could not be made one that only this user may read and write (${did.says}). Nothing was changed.`,
      )
    }
    // 'r+' writes into the file that is there, so it keeps the list that was just set.
    writeFileSync(beside, body, { flag: 'r+' })
    return beside
  } catch (err) {
    rmSync(beside, { force: true })
    throw err
  }
}
