// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT SCREEN'S CLOSED SET: its two severities and the names of its checks. Criterion F16 point 6.
 *
 * The screen itself is src/server/lib/screening.ts, which says what each severity means to a caller and
 * holds `SCREEN_CHECKS`, the total map from each check to its severity and sentence. The two lists are
 * here, in src/shared, because the word tables in src/shared/words.ts are keyed by them too, and a
 * shared file may not import a server file. screening.ts imports both lists from here and exports them
 * again under the same names, so every importer of screening.ts reads the same two lists.
 *
 * THIS FILE IMPORTS NOTHING, so any file in src may import it.
 */

/**
 * The two severities a finding can carry, and no third. See the header of src/server/lib/screening.ts
 * for what each means to a caller.
 */
export const SCREEN_SEVERITIES = ['refused', 'look_before_you_paste'] as const
export type ScreenSeverity = (typeof SCREEN_SEVERITIES)[number]

/**
 * Every check the screen runs, named once. Adding a check means adding its name here, which is
 * what makes `SCREEN_CHECKS` in src/server/lib/screening.ts fail to compile until its severity and
 * sentence are written too.
 */
export const SCREEN_CHECK_NAMES = [
  'key_in_text',
  'home_directory_path',
  'email_address',
  'registered_person_name',
  'other_peoples_names',
  'check_incomplete',
] as const
export type ScreenCheckName = (typeof SCREEN_CHECK_NAMES)[number]
