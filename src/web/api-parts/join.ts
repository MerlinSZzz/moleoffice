// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. Joins the parts of src/web/api-parts/ into the one `api` that src/web/api.ts
// exports, as src/shared/words/join-word-lists.ts joins the word lists (wave 13y, round 68). Every door is copied as
// it was declared. A door that two parts both declare is refused with both parts named, so one line's new door never
// quietly replaces another's.

/** One type with every member of every type in the union: the parts' doors, all in one `api`. */
type Intersection<U> = (U extends unknown ? (one: U) => void : never) extends (all: infer I) => void ? I : never

/**
 * The doors of `own` first, then each part's, by the parts' names in order. `own` is named src/web/api.ts in a
 * refusal, because that file is the only caller with doors of its own.
 */
export function joinApiParts<O extends object, P extends Record<string, object>>(own: O, parts: P): O & Intersection<P[keyof P]> {
  const joined: Record<PropertyKey, unknown> = {}
  const whose = new Map<PropertyKey, string>()
  const named: [string, object][] = [['src/web/api.ts', own], ...Object.keys(parts).sort().map((name): [string, object] => [name, parts[name] as object])]
  for (const [name, part] of named) {
    for (const key of Reflect.ownKeys(part)) {
      const before = whose.get(key)
      if (before !== undefined) throw new Error(`The door ${String(key)} of api is declared in ${before} and again in ${name}.`)
      whose.set(key, name)
      Object.defineProperty(joined, key, Object.getOwnPropertyDescriptor(part, key) as PropertyDescriptor)
    }
  }
  return joined as O & Intersection<P[keyof P]>
}
