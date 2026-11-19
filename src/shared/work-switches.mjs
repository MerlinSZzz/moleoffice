// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WORK SWITCHES, wave 13q item 17: four things that decide whether work moves, each an office setting shown on the
 * Settings page with who changed it last, when, and the reason given.
 *
 * Two of them are new settings here. The own-release skip list is two lists, check tags and run ids, because the host
 * keeps them as two files of two kinds of entry, and a mixed list would have to guess which kind each line is. The
 * receipt producer's pending attempt is the path of the attempt the whole-suite receipt producer has not finished.
 * The other two already exist and are only shown with them: the queue-held gate, and how many checks run at once.
 *
 * A host script reads all four through THE_WORK_SWITCHES_READ_CALL with an agent's own key. It answers these and no
 * other setting.
 */

export const OWN_RELEASE_SKIP_TAGS = 'MOLE_OFFICE_OWN_RELEASE_SKIP_TAGS'
export const OWN_RELEASE_SKIP_RUNS = 'MOLE_OFFICE_OWN_RELEASE_SKIP_RUNS'
export const RECEIPT_PRODUCER_PENDING = 'MOLE_OFFICE_RECEIPT_PRODUCER_PENDING'

/** The new settings, in the order the page draws them. @type {readonly string[]} */
export const WORK_SWITCH_SETTINGS = Object.freeze([OWN_RELEASE_SKIP_TAGS, OWN_RELEASE_SKIP_RUNS, RECEIPT_PRODUCER_PENDING])

export const THE_WORK_SWITCHES_READ_CALL = '/api/office/work-switches'
