// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO FILE IN THE TOOLS KIT NAMES THE OWNER.
 *
 * The owner's names come from the file of the owner's content (tests/the-owners-content-list.ts), so this case is
 * taken out, and says why, where no such file was read. It was case 4 of
 * tests/no-personal-default-in-the-tools-kit.test.ts. That file's other cases start the kit's scripts, so it is not
 * run where a live office listens. This one only reads the kit's files: it starts nothing, writes nothing and
 * reaches no port, so a host run can give it the real list.
 *
 * MUTATION PROOF: a made-up name written into one file of the kit, and a made-up list naming it set in this file's
 * own process before the list is read, and this goes red.
 */
import { expect, it } from 'vitest'

import { aWordPattern, OWNER_NAMES } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { whatTheKitSays } from './the-files-in-the-tools-kit.ts'

it('no file in the tools kit names the owner', (context) => {
  if (takenOutWithoutTheOwnersContent(context)) return
  if (OWNER_NAMES.length === 0) throw new Error("The file of the owner's content was read, and it gave no names.")
  const found = whatTheKitSays([{ pattern: aWordPattern(OWNER_NAMES), is: "the owner's name" }])
  expect(found, found.join('\n')).toEqual([])
})
