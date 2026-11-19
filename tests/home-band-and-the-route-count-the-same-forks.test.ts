// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME DRAWS EVERY KIND THE WAITING DOOR GIVES IT, WITH ONE PRESS PER ROW.
 *
 * Home's Needs you section is a drawing of GET /api/waiting, the same reading the rail uses. It
 * does not rebuild the decision subset or open a form in place. Each row has one address, chosen by
 * `whereAWaitingRowGoes`, so planning intents, visitors, messages, records and the newly confirmed
 * goal rows all reach the page that owns their act.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WaitingReply } from '../src/server/api/waiting.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'
import { HomeNeedsYou } from '../src/web/components/home/HomeSections.tsx'
import { ACT_WORDS, whereAWaitingRowGoes } from '../src/web/lib/waiting.ts'

const KINDS = [
  ['proposal', 'settle'],
  // THE GOAL ROW'S ACT IS confirm-goal since wave 13n's round 25 (criterion P1), and it goes to the Goals page.
  ['goal', 'confirm-goal'],
  ['planning intent', 'schedule'],
  ['visiting agent', 'accept'],
  ['visiting device', 'give-new-key'],
  ['message', 'read'],
  ['role request', 'give-card'],
  ['task', 'confirm-return'],
] as const

function row(kind: string, act: string, index: number): WaitingItem {
  return {
    id: `waiting-${String(index)}`,
    tier: 'settle',
    act,
    because: {} as WaitingItem['because'],
    why: `Test reason ${String(index)}`,
    workspaceId: 'paper-lanterns',
    workspaceTitle: 'Paper lanterns',
    kind,
    title: `Test waiting item ${String(index)}`,
    said: null,
    blocking: 0,
    since: '2026-09-28 09:00:00',
    onThePersonsWords: null,
    passedOnBy: null,
  } as WaitingItem
}

function htmlFor(items: WaitingItem[]): string {
  const value = {
    items,
    counts: { settle: items.length, asked: 0, setAside: 0 },
    excluded: [],
    workspaceId: 'paper-lanterns',
    note: 'Made-up waiting rows.',
  } as unknown as WaitingReply
  return renderToStaticMarkup(h(HomeNeedsYou, { waiting: { status: 'ready', value } }))
}

describe('Needs you and its waiting reading', () => {
  it('draws every door row once, including each kind with a different one-press destination', () => {
    const items = KINDS.map(([kind, act], index) => row(kind, act, index))
    const html = htmlFor(items)

    expect((html.match(/data-home-waiting-id=/g) ?? []).length).toBe(items.length)
    expect((html.match(/class="hm-kind"/g) ?? []).length).toBe(items.length)
    expect((html.match(/<a\b/g) ?? []).length, 'each waiting row has exactly one press').toBe(items.length)
    for (const item of items) {
      expect(html).toContain(`data-home-waiting-id="${item.id}"`)
      expect(html).toContain(`href="#${whereAWaitingRowGoes(item)}"`)
      expect(html).toContain(`aria-label="${ACT_WORDS[item.act]}: ${item.title}"`)
      expect(html).toContain(item.title)
    }
  })

  it('keeps the door order instead of rebuilding a fork-only list', () => {
    const items = KINDS.map(([kind, act], index) => row(kind, act, index))
    const html = htmlFor(items)
    const positions = items.map((item) => html.indexOf(`data-home-waiting-id="${item.id}"`))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})
