// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL TEST'S PLACE FITS ITS SOCKET WHERE ITS FOLDER'S PATH IS LONG. Problem X7wRTilC3O1e.
 *
 * A place is a folder under TEST_DATABASE_PREFIX, made by tests/terminal-holder-stand.ts, and the holder's
 * socket is under its config folder. A Unix socket's path may be at most 107 bytes, so a place whose own
 * folder is long enough makes its config folder under /tmp instead. This file holds one case: the place's
 * socket fits, its database is still under TEST_DATABASE_PREFIX, its socket is the one the holder's own rule
 * names, and a holder started there answers hello and listens at that socket.
 *
 * The limit is read from src/config/the-terminal-holder.mjs, never written here. Raise
 * THE_LONGEST_SOCKET_PATH_BYTES there to 1000 and this case goes red: the place no longer moves its config folder.
 */

import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { theLongestSocketPathBytes, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { aPlace, startAHolder, stopEverything } from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

describe("a terminal test's place with a long folder", () => {
  it('keeps its socket short, its database under the test prefix, and a holder that answers there', async () => {
    const place = aPlace('x'.repeat(70))
    // THE PLACE'S OWN CONFIG FOLDER WOULD NOT FIT, so the case is about moving it: a socket under the place's
    // `c` folder is longer than a Unix socket allows on any machine.
    const underThePlace = join(place.dir, 'c', 'mole-office', 'terminals', basename(place.socket))
    expect(Buffer.byteLength(underThePlace), underThePlace).toBeGreaterThan(theLongestSocketPathBytes())
    expect(Buffer.byteLength(place.socket), place.socket).toBeLessThanOrEqual(theLongestSocketPathBytes())
    expect(place.database.startsWith(TEST_DATABASE_PREFIX), place.database).toBe(true)
    expect(place.socket).toBe(theTerminalHolderSocket(place.database, place.env))
    await startAHolder(place)
    expect(statSync(place.socket).isSocket(), place.socket).toBe(true)
  }, 60_000)
})
