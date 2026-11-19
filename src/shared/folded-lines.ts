// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH LINES OF A GROUP ARE DRAWN IN ITS STREAM, AND WHICH ARE FOLDED UNDER ANOTHER LINE.
 *
 * Mole Office may fold its own old lines in a group under one newer line of its own. Each folded
 * line keeps its record and carries `foldedInto`, the id of the line it is folded under. Nothing is
 * deleted. scripts/fold-the-old-dead-letter-lines.ts is the one writer today.
 *
 * THE RULE. A line is taken out of the stream only when the line it names is in the same list and
 * is itself drawn in the stream. So:
 *   - a line whose `foldedInto` names a line that is not in this group is drawn as usual;
 *   - a line folded into a line that is itself folded is drawn as usual, so no line is hidden two
 *     levels down where no press reaches it.
 * The line that holds folded lines carries a press that says how many there are, so nothing is
 * hidden without saying so.
 *
 * ONE READER, in shared/, so a test can ask it the same question the page asks.
 */

/** What this reader needs of a message. */
export interface AFoldableLine {
  id: string
  foldedInto?: string | null
}

/** The stream to draw, and the lines folded under each line of it, in their own order. */
export interface TheFoldsOfAGroup<M extends AFoldableLine> {
  /** The lines drawn in the stream, in the order they came. */
  shown: M[]
  /** For each line in `shown` that holds folded lines: those lines, in the order they came. */
  under: Map<string, M[]>
}

/**
 * THE TIME A LINE STANDS AT IN THE STREAM. A line that holds folded lines stands at the time of the
 * oldest line it holds, so the stream and the opened lines read in time order; the line's own words
 * say when it was written. Every other line stands at its own time.
 */
export function whenItStands<M extends AFoldableLine & { sentAt: string }>(line: M, under: ReadonlyMap<string, readonly M[]>): string {
  return (under.get(line.id) ?? []).reduce((oldest, one) => (one.sentAt < oldest ? one.sentAt : oldest), line.sentAt)
}

/** Split one group's messages into the stream and the lines folded under it. */
export function theFoldsOf<M extends AFoldableLine>(messages: readonly M[]): TheFoldsOfAGroup<M> {
  const here = new Set(messages.map((one) => one.id))
  // A LINE THAT NAMES A LINE HERE, and not itself.
  const names = (one: M): string | null => {
    const into = one.foldedInto ?? null
    return into !== null && into !== one.id && here.has(into) ? into : null
  }
  // THE LINES THAT ARE THEMSELVES FOLDED. A line folded into one of these stays in the stream.
  const folded = new Set(messages.filter((one) => names(one) !== null).map((one) => one.id))
  const shown: M[] = []
  const under = new Map<string, M[]>()
  for (const one of messages) {
    const into = names(one)
    if (into === null || folded.has(into)) {
      shown.push(one)
      continue
    }
    const held = under.get(into)
    if (held === undefined) under.set(into, [one])
    else held.push(one)
  }
  return { shown, under }
}
