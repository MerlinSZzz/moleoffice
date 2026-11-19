// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH STORED LINE EACH LINE OF THE NEW TEXT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PLAN NEEDS THIS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A plan is written in one text box, so a save arrives as one document and not as a list of rows.
 * But a plan is STORED as rows, because a line carries the record it was filed as and the writer's
 * own remark about it. Something has to say which stored row each line of the new document is.
 *
 * There are two functions here and they answer two different questions.
 *
 *   - `matchLines` answers "which stored line is this line", and it answers it with one rule: A LINE
 *     MATCHES A STORED LINE ONLY WHEN THE CHARACTERS ARE THE SAME. Unchanged text, or nothing.
 *   - `replacedInPlace` answers "was one line replaced by one line, in the same place", reading the
 *     alignment `matchLines` already made. It compares no text at all.
 *
 * ---------------------------------------------------------------------------------------
 * MATCHING BY SIMILARITY IS FORBIDDEN, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * "This line looks a bit like that one" would move a record binding onto a line the person never
 * bound, and nothing on screen would say it had happened. That is invariant 2 — a different answer
 * reported as the requested one. So `matchLines` matches on the exact characters, and a line whose
 * words changed is a line that was removed and a line that was added.
 *
 * The order still matters, which is why this is a longest common subsequence and not a set. Insert
 * a line at the top of a hundred-line plan and ninety-nine lines keep their rows; the LCS is what
 * makes that true without comparing a line to anything but its exact self.
 *
 * ---------------------------------------------------------------------------------------
 * A REPLACEMENT IN THE SAME PLACE IS A POSITIONAL FACT, NOT A SIMILARITY MATCH
 * ---------------------------------------------------------------------------------------
 *
 * THE OWNER REVERSED THE OLD RULE ON 17 AUGUST 2026, in design/ROUND-SEVEN-OWNER-MESSAGE.md section
 * 5: "a filed/bound line must not lose access to its canonical work merely because its visible words
 * changed. Editing prose is normal planning behaviour." Before that day, editing the words of a line
 * that had been filed as work took the work off it. The reversal needs a rule that keeps the row
 * without ever guessing, and `replacedInPlace` is that rule.
 *
 * It reads the alignment and asks one question about SHAPE: between the two nearest lines that did
 * not change, was exactly one line removed and exactly one line added? When the answer is yes, one
 * line was replaced by one line in the same place, and the caller may treat the new line as the
 * stored row rewritten. When the answer is no — two removed, three added, nothing added at all —
 * there is no answer here, and the caller must not invent one.
 *
 * THIS IS STILL NOT MATCHING BY SIMILARITY. Nothing here looks at a character of either line. Two
 * lines with nothing in common are paired when the shape says one replaced the other, and two
 * near-identical lines are not paired when it does not. That is the difference between reading the
 * document's structure and guessing what somebody meant.
 *
 * WHAT THE CALLER DOES WITH IT IS THE CALLER'S RULE, NOT THIS FILE'S. `writeBody` in
 * src/server/lib/plans.ts uses it for one thing only: carrying a record binding across a line whose
 * words were rewritten. Where the shape is ambiguous it drops the binding and reports the loss,
 * exactly as it always did.
 *
 * ---------------------------------------------------------------------------------------
 * IF LINES THAT LOOK THE SAME DO NOT MATCH, THE LINES ARE WRONG AND THIS FILE IS RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * This has happened once and it will read as a bug in this file when it happens again. A plan pasted
 * from a Windows file used to be stored with a carriage return on the end of every line. The writing
 * box cannot give a carriage return back, so the next save arrived without them, nothing matched, and
 * every record binding in the document was dropped by one keystroke.
 *
 * THE FIX WAS NOT HERE AND MUST NOT BE. Ignoring a trailing carriage return when comparing two lines
 * is exactly the "looks a bit like" rule this file exists to refuse, and once one character may
 * differ the argument for the next one is already written. The fix was to stop storing a line ending
 * inside a line's text at all: `linesOfDocument` in src/server/lib/plans.ts reads a document into
 * lines on any line ending and keeps none of them, so both sides of this comparison hold words only.
 *
 * NOTHING HERE READS A DATABASE. It is a pure function of two lists of strings.
 */

/**
 * For each line of the new document, the index of the stored line it is, or null.
 *
 * The answer is one-to-one: no stored line is claimed by two new lines, and the matched pairs are
 * in the same order in both lists. A stored index that appears nowhere in the answer is a line that
 * has been removed.
 *
 * Equal lines are matched from the top down, so a document with twenty blank lines keeps the first
 * twenty blank rows rather than shuffling them.
 */
export function matchLines(stored: readonly string[], now: readonly string[]): (number | null)[] {
  // THE HEAD AND THE TAIL THAT DID NOT CHANGE ARE MATCHED WITHOUT ANY SEARCH. Typing one character
  // in the middle of a long plan leaves everything above and below it identical, so this is the
  // ordinary case and not an optimisation for a document nobody has.
  const shortest = Math.min(stored.length, now.length)
  let head = 0
  while (head < shortest && stored[head] === now[head]) head += 1
  let tail = 0
  while (tail < shortest - head && stored[stored.length - 1 - tail] === now[now.length - 1 - tail]) tail += 1

  const answer: (number | null)[] = new Array<number | null>(now.length).fill(null)
  for (let at = 0; at < head; at += 1) answer[at] = at
  for (let at = 0; at < tail; at += 1) answer[now.length - 1 - at] = stored.length - 1 - at

  const middleStored = stored.slice(head, stored.length - tail)
  const middleNow = now.slice(head, now.length - tail)
  const middle = longestCommonSubsequence(middleStored, middleNow)
  for (let at = 0; at < middle.length; at += 1) {
    const from = middle[at]
    if (from !== null && from !== undefined) answer[head + at] = head + from
  }
  return answer
}

/**
 * WHERE ONE LINE WAS REPLACED BY ONE LINE IN THE SAME PLACE: the stored line, and the line that took
 * its place.
 *
 * The answer is a map from a stored index that `matchLines` matched to nothing, to the index in the
 * new document that stands where it stood. A stored line that is absent from this map either matched
 * something, or was removed in a place where Mole Office cannot say which new line — if any — replaced it.
 *
 * HOW IT DECIDES, and it is the whole of the decision: find the nearest MATCHED stored line on each
 * side. Everything between those two neighbours was removed by this save, by construction, because a
 * stored line the alignment kept would be a nearer neighbour. Everything between their two matched
 * partners in the new document was added, for the same reason. When exactly one was removed and
 * exactly one was added, that is a replacement in place. When it is any other pair of counts, this
 * map holds nothing for those lines, which is absence rather than a guess.
 *
 * IT COMPARES NO TEXT. It takes the alignment and the two lengths, and nothing else; the strings are
 * not even passed in. See the note at the top of this file for why that distinction is the point.
 *
 * `storedCount` is how many stored lines there were, which the alignment alone cannot say: a stored
 * line nothing matched leaves no trace in it.
 */
export function replacedInPlace(match: readonly (number | null)[], storedCount: number): Map<number, number> {
  const newOf = new Map<number, number>()
  match.forEach((from, at) => {
    if (from !== null) newOf.set(from, at)
  })
  const answer = new Map<number, number>()
  let at = 0
  while (at < storedCount) {
    if (newOf.has(at)) {
      at += 1
      continue
    }
    // A RUN OF STORED LINES THIS SAVE REMOVED, and the two lines that did not change around it.
    const before = at - 1
    let after = at
    while (after < storedCount && !newOf.has(after)) after += 1
    const removedHere = after - before - 1
    const newBefore = before < 0 ? -1 : newOf.get(before)!
    const newAfter = after >= storedCount ? match.length : newOf.get(after)!
    const addedHere = newAfter - newBefore - 1
    if (removedHere === 1 && addedHere === 1) answer.set(at, newBefore + 1)
    at = after + 1
  }
  return answer
}

/**
 * The longest common subsequence of two lists of lines, as a match for each line of the second.
 *
 * The table holds, for every pair of starting points, how many lines the two lists still share. It
 * is filled from the end backwards so the walk that reads it can go forwards, which is what makes
 * equal lines match from the top down.
 */
function longestCommonSubsequence(a: readonly string[], b: readonly string[]): (number | null)[] {
  const rows = a.length
  const columns = b.length
  const answer: (number | null)[] = new Array<number | null>(columns).fill(null)
  if (rows === 0 || columns === 0) return answer

  const width = columns + 1
  const shared = new Int32Array((rows + 1) * width)
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      shared[i * width + j] =
        a[i] === b[j]
          ? shared[(i + 1) * width + j + 1]! + 1
          : Math.max(shared[(i + 1) * width + j]!, shared[i * width + j + 1]!)
    }
  }

  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (a[i] === b[j]) {
      answer[j] = i
      i += 1
      j += 1
    } else if (shared[(i + 1) * width + j]! >= shared[i * width + j + 1]!) {
      i += 1
    } else {
      j += 1
    }
  }
  return answer
}
