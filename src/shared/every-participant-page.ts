// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
export const PARTICIPANT_PAGE_LIMIT = 200

type AnAnswer<Page> = { ok: boolean; body: Page | null }

export async function everyParticipantPage<Page extends { next?: string | null }>(
  first: string,
  read: (path: string) => Promise<AnAnswer<Page>>,
): Promise<Page[]> {
  const pages: Page[] = []
  const asked = new Set<string>()
  let next: string | null = first
  while (next !== null) {
    const n = pages.length + 1
    if (asked.has(next)) throw new Error(`The participant roster read stopped at page ${String(n)}: the office named a page that was already read. No rows were used.`)
    if (pages.length >= PARTICIPANT_PAGE_LIMIT) throw new Error(`The participant roster read stopped at page ${String(n)}: it reads at most ${String(PARTICIPANT_PAGE_LIMIT)} pages. No rows were used.`)
    asked.add(next)
    const answer = await read(next)
    if (!answer.ok || answer.body === null) throw new Error(`The participant roster read stopped at page ${String(n)}: the office refused that page. No rows were used.`)
    pages.push(answer.body)
    next = answer.body.next ?? null
  }
  return pages
}
