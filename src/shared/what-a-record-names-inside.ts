// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD NAMES INSIDE A WORKTREE, compared with the worktree's commit: the classes the named-inside door gives
 * (GET /api/report-files/named-inside) and tools/remove-a-worktree.mjs decides on (wave 13s round 115, item 25).
 *
 * The rule for a worktree that a record names, as later changed: a worktree whose branch or keep
 * ref holds every tracked file may be removed even when a record names it, and a record naming an untracked or ignored
 * file inside still keeps it. A record is put in the first class that fits it, so the order is the order of what keeps
 * a worktree: the first two keep it, and the last three do not while a branch or keep ref holds its clean HEAD.
 *
 * The door's scope and the tool's lines both say a class in these words, after "it names", with the key beside them.
 */
export const WHAT_A_RECORD_NAMES_INSIDE = {
  notCompared: 'a path the office could not compare with the commit',
  anotherPath: 'an untracked or ignored path',
  aPathNotThere: 'a path that is no longer there',
  trackedFilesOnly: 'only paths the commit holds, and perhaps the folder itself',
  theFolderOnly: 'only the folder itself',
} as const

export type WhatARecordNamesInside = keyof typeof WHAT_A_RECORD_NAMES_INSIDE

/** The classes in the order a record is put in them. */
export const NAMED_INSIDE_CLASSES = Object.keys(WHAT_A_RECORD_NAMES_INSIDE) as WhatARecordNamesInside[]

/** The classes that keep a worktree whatever ref holds its commit. */
export const NAMED_INSIDE_CLASSES_THAT_KEEP: readonly WhatARecordNamesInside[] = ['notCompared', 'anotherPath']
