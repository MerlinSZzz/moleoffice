// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Bounded turns for the page render. The order of every list and the text written into each
 * node are unchanged; only the yield boundaries move, so no browser layout or pixel changes.
 */

/** The first `toLocaleTimeString` call builds the ICU date formatter (24-31 ms at 4x).
 * Warm one locale per turn at startup so no render turn pays for it. */
export function* warmTimeSteps(locales: readonly string[] = ['en-GB', 'zh-CN']): Generator<void> {
  for (const locale of locales) {
    new Date(0).toLocaleTimeString(locale)
    yield
  }
}

/** One receipt line per turn, in the same order as the receipt map. */
export function* receiptSteps<K extends string, L>(receipts: Iterable<readonly [K, L]>, write: (view: K, line: L) => void): Generator<void> {
  for (const [view, line] of receipts) {
    write(view, line)
    yield
  }
}

/** At most two legend entries are built per turn; the returned nodes stay in entry order. */
export function* legendSteps<E, N>(entries: readonly E[], build: (entry: E, index: number) => N): Generator<void, N[]> {
  const nodes: N[] = []
  for (let index = 0; index < entries.length; index++) {
    nodes.push(build(entries[index]!, index))
    if ((index + 1) % 2 === 0) yield
  }
  return nodes
}
