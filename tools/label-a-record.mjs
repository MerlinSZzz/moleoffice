// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE THE LABEL OF A RECORD THE OFFICE ITSELF FILED.
 *
 * Chapter 10 rule 3 asks every record for a label — its shortest reading, two to five words. A
 * worker writes the labels of what it wrote. But two records of every run are not the worker's: the
 * office's own tools file them, and the worker is judged on them anyway. On 22 September 2026 a
 * check refused a run three times over exactly that: the run's own session record and
 * the brief note beside it carried no label, and the worker had written neither (message
 * KsSsRY6WH1Ea). The tool that files a record knows its title at that moment, so it is the one that
 * can say the label.
 *
 * `labelOneRecord(api, headers, id, label)` writes it and answers a sentence saying what happened.
 * It NEVER throws: a label that could not be written is worth one line on the error channel and
 * nothing more, because the run it belongs to matters more than its shortest reading.
 *
 * The label is written against the revision it was read from — `madeFrom` — so a label can never be
 * attached to a version somebody has since rewritten.
 */

const TIMEOUT_MS = 20_000

/**
 * @param {string} api
 * @param {Record<string, string>} headers The caller's own identity headers, with content-type.
 * @param {string} id
 * @param {string} label Two to five words.
 * @returns {Promise<string>} one sentence: what was written, or why it was not.
 */
export async function labelOneRecord(api, headers, id, label) {
  const words = label.trim().split(/\s+/).filter(Boolean).length
  if (words < 2 || words > 5) return `The label "${label}" is ${String(words)} words, and a label is two to five, so none was written for ${id}.`
  let standing
  try {
    const read = await fetch(`${api}/api/records/${encodeURIComponent(id)}/short-forms`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!read.ok) return `The shorter forms of ${id} could not be read (${String(read.status)}), so no label was written.`
    standing = await read.json()
  } catch (why) {
    return `The shorter forms of ${id} could not be read (${String(why)}), so no label was written.`
  }
  const seq = standing?.newestRevision
  const contentHash = standing?.version
  if (typeof seq !== 'number' || typeof contentHash !== 'string') {
    return `The shorter forms of ${id} did not say which revision they are of, so no label was written.`
  }
  try {
    const wrote = await fetch(`${api}/api/records/${encodeURIComponent(id)}/short-forms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ madeFrom: { seq, contentHash }, forms: { label } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!wrote.ok) return `The label of ${id} was refused (${String(wrote.status)}): ${(await wrote.text()).slice(0, 300)}`
    return `${id} is labelled "${label}".`
  } catch (why) {
    return `The label of ${id} could not be written (${String(why)}).`
  }
}
