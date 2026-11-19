// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE FUNCTION ANSWERS HOW TO GET FROM A DATABASE PATH TO ITS DIRECTORY, AND IT TAKES THE PATH.
 *
 * Criterion D0. Seven places worked out `dirname(resolve(<a database path>))` themselves, and they
 * are not asking about one database: `settings().databasePath` is the database the declaration
 * names, `databaseFileStatus().path` is the database THIS PROCESS opened, and
 * `canonicalDatabasePath()` is the checkout's own. `src/server/lib/office.ts` says the sharpest case
 * in its own words — a throwaway office must write a throwaway mirror rather than over the real
 * office's — so the thing that answers has to be told which database is meant.
 *
 * THE MUTATION THIS FILE EXISTS FOR. Give `databaseDirectoryFrom` no argument and let it read
 * `settings().databasePath` instead: every one of the seven callers silently answers about the
 * declared database, and this file goes red on the two-path case below with nothing else failing.
 * The source check is the second half of the same proof: a file that spells the arithmetic out
 * again would pass the two-path case with a second answer that can drift from the first.
 */
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import { canonicalDatabasePath, databaseDirectoryFrom, databasePathFrom, keysPathFrom } from '../src/config/settings.mjs'

describe('one function answers for a database directory, and it takes the path', () => {
  it('returns the directory the path it was given is in', () => {
    expect(databaseDirectoryFrom('/tmp/one/panelx.db')).toBe('/tmp/one')
    expect(databaseDirectoryFrom('/tmp/two/panelx.db')).toBe('/tmp/two')
  })

  it('answers two different directories for a throwaway database and the canonical one', () => {
    // This is the case a no-argument function cannot pass: it would have to pick one of the three
    // databases and would answer the same directory twice.
    const throwaway = '/tmp/p83-device-throwaway/world.db'
    const canonical = canonicalDatabasePath()
    expect(databaseDirectoryFrom(throwaway)).not.toBe(databaseDirectoryFrom(canonical))
    expect(databaseDirectoryFrom(throwaway)).toBe(dirname(throwaway))
    expect(databaseDirectoryFrom(canonical)).toBe(dirname(canonical))
  })

  it('puts the key file beside whichever database the environment named', () => {
    const throwaway = { MOLE_OFFICE_DB: '/tmp/p83-device-throwaway/world.db' }
    expect(keysPathFrom(throwaway)).toBe('/tmp/p83-device-throwaway/keys.json')
    expect(databaseDirectoryFrom(databasePathFrom(throwaway))).toBe('/tmp/p83-device-throwaway')
    // NOT THE CANONICAL DIRECTORY. This is the whole defect: keys beside the wrong database.
    expect(dirname(keysPathFrom(throwaway))).not.toBe(dirname(keysPathFrom({})))
  })
})
