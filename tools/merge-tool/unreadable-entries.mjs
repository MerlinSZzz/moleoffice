// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE OFFICE COULD NOT READ OF THE QUEUE IT LISTED (wave 13u round 99). Part of the merge tool, tools/the-merger.mjs.
 * It sends no request, so it is not in tools/merge-tool/office-keeper.mjs, and a test that puts a stand-in in place of
 * the office keeper still reads a list with the tool's own reading.
 */
import './a-library-is-not-a-program.mjs'

/**
 * Null when its list holds every entry, or a sentence that gives why for each entry it could not read. The list names an
 * entry not in the shape the queue writes beside the lanes, and the lanes leave it out, so whether it holds the lane,
 * lands or tests cannot be told. So each reader in the merge tool that acts on the lanes takes such a list as it takes a
 * list the office refused, as it did while the office refused the whole list for one such entry. An office older than
 * the field still refuses that list, so a list without the field holds every entry.
 *
 * @param {any} listed the body of the office's answer to GET /api/merge-queue
 * @returns {string | null}
 */
export function theEntriesTheQueueCouldNotRead(listed) {
  const unreadable = listed?.unreadable
  if (unreadable === undefined) return null
  if (!Array.isArray(unreadable)) return `The office's list of the merge entries it could not read is not a list: ${JSON.stringify(unreadable)}.`
  if (unreadable.length === 0) return null
  const one = unreadable.length === 1
  return `The office could not read ${one ? 'one merge entry' : `${String(unreadable.length)} merge entries`}, so its lanes leave ${one ? 'it' : 'them'} out: ${unreadable.map((/** @type {{why: string}} */ entry) => entry.why).join(' ')}`
}
