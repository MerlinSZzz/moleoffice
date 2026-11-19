// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { placeOf } from './pagecache.ts'

/** An answer prepared for one destination, reader and project. */
export type PreparedPage<T> = { key: string; value: T }
const prepared = new Map<string, PreparedPage<unknown>>()
export const preparedPageKey = (path: string, workspace?:string): string => placeOf(`destination:${path}`,workspace).key

export function peekPreparedPage<T>(path: string, held?: PreparedPage<T>): PreparedPage<T> | undefined {
  const key = preparedPageKey(path)
  return held === undefined ? prepared.get(key) as PreparedPage<T> | undefined : held.key === key ? held : undefined
}
export function consumePreparedPage<T>(held: PreparedPage<T>): void {
  if (prepared.get(held.key) === held) prepared.delete(held.key)
}
export function preparePage<T>(path: string, key: string, value: T, workspace?:string): void {
  if (key !== preparedPageKey(path,workspace)) return
  const answer: PreparedPage<T> = { key, value }
  prepared.set(key, answer)
  window.setTimeout(() => consumePreparedPage(answer), 30_000)
}
