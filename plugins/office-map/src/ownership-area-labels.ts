// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout } from './geometry.ts'
import { overlaps } from './nameplates.ts'
import type { Rect } from './viewport.ts'

/** The refusal when one area's name has no place clear of every room at ten pixels or more. */
export class NoRoomForAreaLabel extends Error {
  constructor(readonly label: string) { super('No room-clear area label at10px: ' + label) }
}

type Area = NonNullable<Layout['villages']>[number]
export type AreaLabelHeader = { area: Area; x: number; y: number; width: number; height: number; lines: string[]; fontSize: number; stage: string; prefix: string }
export type AreaLabelSkip = { area: Area; label: string }

/** A house's sign where it starts: above the house at its left end, at most 160 screen pixels wide,
 *  and in an ownership map never above the map's top. The page moves it right along the house when
 *  the visible map starts inside the house (map-view.ts). */
export function houseSign(layout: Layout, house: Rect, zoom: number): Rect {
  const height = 20 / zoom
  return { x: house.x, y: layout.ownership ? Math.max(layout.bounds.y, house.y - height) : house.y - height, width: Math.min(house.width, 160 / zoom), height }
}

/** One natural-width line in its own territory or immediately adjoining unowned margin. An area
 *  with no room for its shortest form is left out of `headers` and named in `skipped`, so the page
 *  keeps drawing every other area's name. With `sleepingHouses`, as the page asks, each sleeping
 *  house also gets its plain name when no house sign is drawn: a sleeping house is in no area. */
export function ownershipAreaLabelsOrSkips(layout: Layout, zoom: number, language: 'en' | 'zh', measure: (text: string) => number, sleepingHouses = false) {
  const areas = layout.villages ?? [], bounds = layout.bounds, used: Rect[] = []
  const houseLabels: Rect[] = layout.ownership && zoom >= .18 ? layout.houses.map(house => houseSign(layout, house, zoom)) : []
  const nameLength = (a: typeof areas[number]) => a.owner ? [...(a.label ?? '').replace(/^Secretary area · /u, '')].length : 0
  /** At close zoom the room's own sign names a one-room area, so its area header would be a second label for the same room. */
  const oneRoom = (area: typeof areas[number]) => layout.rooms.filter(r => area.signs.some(s => s.id === r.id)).length === 1
  const headers: AreaLabelHeader[] = [], skipped: AreaLabelSkip[] = []
  // A sleeping house has little unowned margin, so reserve its name before the more flexible area names.
  const sleepers: Area[] = sleepingHouses && layout.ownership && zoom < .18 ? layout.houses.filter(house => house.type === 'sleeping-house').map((house, i) =>
    ({ x: house.x, y: house.y, width: house.width, height: house.height, id: -1 - i, column: 0, row: -2, total: 0, signs: [], label: house.label, zh: house.zh })) : []
  // Place the least flexible names first, before shorter labels occupy their clear space.
  for (const area of [...sleepers, ...areas.filter(area => area.label && !(area.row === -1 && zoom >= .18) && !(zoom >= .18 && oneRoom(area))).sort((a, b) => nameLength(b) - nameLength(a) || Number(b.row === -1) - Number(a.row === -1) || a.row - b.row)]) {
    const label = (language === 'zh' ? area.zh : area.label)!
    const owner = label.replace(/^(?:Secretary area|秘书区域) · /u, '')
    const names = [...new Set([owner, ...(!area.owner && zoom < .18 ? [owner.replace(/ \/ ownership unknown$|／归属未知$/u, '')] : [])])]
    const count = ` · ${area.total}${area.direct === undefined ? '' : ` · ${language === 'zh' ? '直属' : 'Direct'} ${area.direct}`}`
    const plain = count.replaceAll(' · ', ' ')
    const sleeper = sleepers.includes(area)
    const variants = sleeper ? [{ stage: 'sleeping-house', texts: [label] }] : [{ stage: 'full', texts: [label + count] },
      { stage: 'prefix-words', texts: names.map(name => name + count) },
      { stage: 'spaces', texts: names.map(name => name + plain) }]
    if (zoom < .18 && !area.owner && area.label === 'Independent / ownership unknown') {
      const name = language === 'zh' ? '独立' : 'Independent'
      variants.push({ stage: 'independent-short', texts: [`${name} · ${area.total}`] },
        { stage: 'independent-spaces', texts: [`${name} ${area.total}`] })
    }
    if (zoom < .18 && area.owner) {
      const letters = [...owner]
      for (let kept = letters.length - 1; kept >= 3; kept--) {
        const tails = Array.from({ length: kept - 2 }, (_, i) => i + 2)
          .sort((a, b) => Math.abs(kept - 2 * a) - Math.abs(kept - 2 * b) || a - b)
        variants.push({ stage: 'name-ellipsis', texts: tails.map(tail => letters.slice(0, kept - tail).join('') + '…' + letters.slice(-tail).join('') + plain) })
      }
    }
    const rooms = layout.rooms.filter(r => area.signs.some(s => s.id === r.id))
    const own = rooms.length ? { x: Math.min(...rooms.map(r => r.x)), y: Math.min(...rooms.map(r => r.y)),
      width: Math.max(...rooms.map(r => r.x + r.width)) - Math.min(...rooms.map(r => r.x)),
      height: Math.max(...rooms.map(r => r.y + r.height)) - Math.min(...rooms.map(r => r.y)) } : area
    const gap = 2 / zoom, pad = 12 / zoom, foreign = areas.filter(a => a.id !== area.id)
    const edges: Rect[] = [own, area, ...layout.rooms, ...houseLabels, ...areas, ...used]
    let placed: AreaLabelHeader | null = null
    search: for (const variant of variants) for (const fontSize of [12, 11, 10]) for (const text of variant.texts) {
      const width = measure(text) * fontSize / 12 + pad + 1 / zoom, height = (fontSize + 9) / zoom
      if (width > bounds.width || height > bounds.height) continue
      const clampX = (x: number) => Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x))
      const xs = [...new Set([own.x, own.x + own.width - width, own.x + (own.width - width) / 2,
        ...edges.flatMap(r => [r.x, r.x + r.width - width, r.x - width - gap / 2, r.x + r.width + gap / 2])].map(clampX))]
      const ys = [...new Set([bounds.y, own.y - height - gap, own.y,
        ...edges.flatMap(r => [r.y, r.y + r.height - height, r.y - height - gap / 2, r.y + r.height + gap / 2])])]
      const candidates: { box: Rect; above: boolean; distance: number; inside: boolean }[] = []
      for (const y of ys) for (const x of xs) {
        const box = { x, y, width, height }
        if (x < bounds.x || x + width > bounds.x + bounds.width || y < bounds.y || y + height > bounds.y + bounds.height ||
          x + width < area.x - gap || x > area.x + area.width + gap || y + height < area.y - gap || y > area.y + area.height + gap ||
          layout.rooms.some(room => overlaps(box, room)) || houseLabels.some(other => overlaps(box, other)) || foreign.some(other => overlaps(box, other)) || used.some(other => overlaps(box, other)) ||
          sleeper && sleepers.some(other => overlaps(box, other))) continue
        const above = y + height <= own.y && x < own.x + own.width && x + width > own.x
        const distance = Math.hypot(Math.max(own.x - x - width, x - own.x - own.width, 0), Math.max(own.y - y - height, y - own.y - own.height, 0))
        candidates.push({ box, above, distance, inside: x >= area.x && y >= area.y && x + width <= area.x + area.width && y + height <= area.y + area.height })
      }
      candidates.sort((a, b) => Number(b.above) - Number(a.above) || Number(b.inside) - Number(a.inside) || (area.row === -1 ? Number(a.box.x > area.x) - Number(b.box.x > area.x) : 0) || a.distance - b.distance || a.box.y - b.box.y || a.box.x - b.box.x)
      const box = candidates[0]?.box
      if (box) { used.push(box); placed = { area, ...box, lines: [text], fontSize, stage: variant.stage, prefix: text.includes('…') ? text.split('…')[0]! : owner }; break search }
    }
    if (placed) headers.push(placed); else skipped.push({ area, label })
  }
  return { headers, skipped }
}

/** The strict reader the unit tests use: an area with no room refuses the whole call. The page
 *  uses ownershipAreaLabelsOrSkips so one narrow area does not hide every other area's name. */
export function ownershipAreaLabels(layout: Layout, zoom: number, language: 'en' | 'zh', measure: (text: string) => number, sleepingHouses = false) {
  const { headers, skipped } = ownershipAreaLabelsOrSkips(layout, zoom, language, measure, sleepingHouses)
  if (skipped.length) throw new NoRoomForAreaLabel(skipped[0]!.label)
  return headers
}
