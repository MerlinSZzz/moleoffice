// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON A MAC, THE HOMES A FILES AREA AND A START FOLDER MAY NOT BE ARE UNDER /Users, AND ROOT'S IS /var/root.
 *
 * Plan l1RSxzw-j4P7, block b-5, row 8: src/config/files-area.mjs and src/config/start-folder.mjs
 * named the homes from /home and /root only, so on a Mac a person's own home was not one of them.
 * `whereTheHomesAre` in files-area.mjs now answers by platform, and both files read it.
 *
 * WHAT IS PROVED, on this Linux machine, by naming the platform:
 *   1. darwin keeps homes under /Users with root's at /var/root; every other platform under /home with /root;
 *   2. both lists of homes take root's home and the folder of homes from that one answer, and keep the
 *      home this process runs in;
 *   3. a start folder at /var/root is refused on a Mac as a home.
 *
 * NOT PROVED HERE: the lists split with `path.delimiter` (MOLE_OFFICE_LOCK_PATHS, MOLE_OFFICE_PREVIEW_ROOTS).
 * The delimiter is a colon on Linux and on macOS alike, so no test on this machine can tell the two
 * spellings apart. It matters on Windows, which is not ported yet.
 *
 * MUTATION, in the commit message: change '/Users' to '/home' in `whereTheHomesAre`.
 */
import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { theHomes, whereTheHomesAre } from '../src/config/files-area.mjs'
import { theHomeFolderSpellings, theStartFolderAsItIsStored } from '../src/config/start-folder.mjs'

describe('where the homes are, by platform', () => {
  it('is /Users and /var/root on darwin, and /home and /root elsewhere', () => {
    expect(whereTheHomesAre('darwin')).toEqual({ under: '/Users', root: '/var/root' })
    expect(whereTheHomesAre('linux')).toEqual({ under: '/home', root: '/root' })
    expect(whereTheHomesAre('freebsd')).toEqual({ under: '/home', root: '/root' })
  })

  it("puts root's home and this process's home in both lists, from the same answer", () => {
    // This machine has no /Users, so on darwin the two lists hold root's home and this process's home only.
    expect(theHomeFolderSpellings('darwin').sort()).toEqual([...new Set(['/var/root', homedir()])].sort())
    expect(theHomes('darwin')).toContain('/var/root')
    expect(theHomes('darwin')).not.toContain('/root')
    expect(theHomeFolderSpellings('linux')).toContain('/root')
    expect(theHomeFolderSpellings('linux')).not.toContain('/var/root')
  })

  it('refuses /var/root as a start folder on a Mac, because it is a home there, and keeps it on Linux', () => {
    // The platform is named, never stood in through process.platform (wave 13t, round 25).
    const onAMac = theStartFolderAsItIsStored('/var/root', 'darwin')
    expect(onAMac.folder).toBeNull()
    expect(onAMac.because).toContain('"/var/root" is a home folder on this machine')
    expect(theStartFolderAsItIsStored('/var/root', 'linux')).toEqual({ folder: '/var/root', because: null })
  })
})
