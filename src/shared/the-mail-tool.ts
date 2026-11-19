// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE MAIL TOOL ANSWERS, in a module the server and the screens can both import.
 *
 * `THE_SECRET_HEADER` and `whereTheToolIs` lived in src/web/lib/the-mail-tool.ts and the server
 * imported them from there, which made src/server/lib depend on src/web. They are a header name and
 * a pure reading of the link the person's own door hands out; moving them here removes that direction of the
 * import cycle without changing what they answer.
 */

/** The header the secret rides in; the tool reads it by this name. */
export const THE_SECRET_HEADER = 'x-mail-tool-secret'

/** Where the tool answers, and the secret it asks for. */
export interface WhereTheToolIs {
  origin: string
  secret: string
}

/** Where the tool answers, from the link the person's door on the office hands out; null when there is none or it is not the tool's shape. */
export function whereTheToolIs(page: string | null): WhereTheToolIs | null {
  if (page === null) return null
  try {
    const url = new URL(page)
    const secret = url.searchParams.get('s') ?? ''
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || secret === '') return null
    return { origin: url.origin, secret }
  } catch {
    return null
  }
}
