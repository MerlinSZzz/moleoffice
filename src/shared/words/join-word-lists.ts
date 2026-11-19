// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Joins the parts of a word list into the one list. src/shared/words/joined.ts reads en.ts with every
// wave's file through it, and scripts/split-the-word-lists.mjs copies this file into a split it writes.

type Joined<T extends readonly object[]> = T extends readonly [infer H, ...infer R extends readonly object[]] ? H & Joined<R> : unknown

/**
 * The parts of one word list as one list, in the order given. Each key's property is copied as it is,
 * so a getter stays a getter and `this` in it is the joined list. A key in two parts is refused.
 */
export function joinWordLists<const T extends readonly object[]>(...parts: T): Joined<T> {
  const joined: Record<PropertyKey, unknown> = {}
  const whose = new Map<PropertyKey, number>()
  parts.forEach((part, i) => {
    for (const key of Reflect.ownKeys(part)) {
      const before = whose.get(key)
      if (before !== undefined) throw new Error(`The word key ${String(key)} is in part ${String(before + 1)} and part ${String(i + 1)} of one word list.`)
      whose.set(key, i)
      Object.defineProperty(joined, key, Object.getOwnPropertyDescriptor(part, key) as PropertyDescriptor)
    }
  })
  return joined as Joined<T>
}
