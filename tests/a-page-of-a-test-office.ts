// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE OF A TEST OFFICE KNOWS WHOSE OFFICE IT IS: THE_TEST_OFFICES_OWNER's, the owner every test office has.
 *
 * The browser app asks the server who owns the office before it loads (src/web/main.tsx and
 * src/web/owner.ts). A browser test that draws one component on a page of its own, from a bundle it
 * builds, never passes through main.tsx, so nothing would have asked. That bundle imports this file
 * FIRST, which tells the page what main.tsx would have learned, before any of the app's modules load.
 *
 * WHERE THE OWNER IS WRITTEN. Once, in tests/the-test-offices-owner.ts, and this file exports it again.
 * tests/every-test-process-is-given-the-test-offices-owner.ts gives every test process the two settings
 * from that constant, so the server and the page cannot differ, and a test that needs the owner's id or
 * name reads it from here rather than writing it out. That setup does not import this file, so that it
 * loads no word tables before every test file: a test whose page component asks for the office's id or
 * the owner the server said imports this file itself.
 *
 * THE VALUE IS AN INVENTED PERSON, Jory (the secretary's answer 1mDqct4t2suB, line round 49). It decides the
 * owner of every test office. Until round 49 it was the real owner's id, because test files that wrote
 * that id out turned red when it changed (the secretary's answer w5p-WkMOrE-b, round 29). So each wave's files
 * moved to this constant first, and tests/the-moved-test-files.ts says where the files that moved are
 * listed. tests/the-test-offices-owner-is-read-from-one-place.test.ts still looks for the old id and
 * name, so neither can be written back into a moved file unseen.
 */
import { theOwnerIs } from '../src/web/owner.ts'
import { THE_GUIDE_ADDRESS, THE_OWNER_PLACEHOLDER } from '../src/shared/owner.ts'
import { readMoleOfficeIdWith } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'

// A COMPONENT TEST HAS NO SERVER BOOTSTRAP. This is today's synthetic office row, not a product
// assumption about its id. Every isolated test page registers that fixture.
export const THE_TEST_OFFICE_ID = 'mole-office'
readMoleOfficeIdWith(() => THE_TEST_OFFICE_ID)

export { THE_TEST_OFFICES_OWNER }

/**
 * An agent of a test office, for a test that registers one, usually as its secretary. The handle and
 * the name are invented and nobody's. Unlike the owner, nothing outside the test that registers it
 * depends on it, so its value is the invented one already.
 */
export const THE_TEST_OFFICES_SECRETARY: Readonly<{ handle: string; name: string }> = Object.freeze({ handle: 'ottilie', name: 'Ottilie' })

/**
 * WHERE A TEST'S MADE-UP FILES AND FOLDERS ARE, when any path would do: a checkout, a working
 * directory, a picture's path, a long path for a layout test. It is not under /home or /Users, so no
 * fixture names a real person's home (plan eIeEzSGXdTpu, step 3), and nothing is there: a test that
 * needs a real folder makes its own temporary one. tests/the-test-files-name-no-real-home.test.ts holds
 * the moved files to it.
 */
export const THE_TEST_FIXTURE_ROOT = '/srv/mole-office-fixtures'

theOwnerIs({
  id: THE_TEST_OFFICES_OWNER.id,
  name: THE_TEST_OFFICES_OWNER.name,
  named: true,
  placeholder: THE_OWNER_PLACEHOLDER.en,
  guide: THE_GUIDE_ADDRESS,
})
