// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { houseCatalog, piece, type Piece, type PieceFragment } from './village.ts'
import type { Rect } from './viewport.ts'

/** Exact native source rectangles. Repetition crops the last tile; it never
 * stretches a bitmap or repeats an interior end wall. */
export function* nativeTiles(sprite: string, source: Rect, target: Rect, group: string, layer: Piece['layer'], depth: number): Generator<Piece> {
  for (let y = 0; y < target.height; y += source.height) for (let x = 0; x < target.width; x += source.width) {
    const width = Math.min(source.width, target.width - x), height = Math.min(source.height, target.height - y)
    yield { ...piece(sprite, target.x + x, target.y + y, group, layer, depth), width, height, crop: { ...source, width, height } }
  }
}

export interface NativePart { sprite: string; x: number; y: number; layer: Piece['layer']; depth: number; crop?: Rect; fragments?: readonly PieceFragment[]; scale?: number }
/** `furnishings` are the furnished room's own furniture, in room coordinates, for the furnishing pass to place.
 * `talks[i]` is where a visitor stands to speak to the person at desk `i`, clear of every body at a desk. */
export interface SecretariatAssembly { width: number; height: number; parts: readonly NativePart[]; desks: readonly { x: number; y: number }[]; walkable: readonly Rect[]; entrance: Rect
  furnishings?: readonly Piece[]; talks?: readonly { x: number; y: number }[] }
export { secretariatAssembly } from './secretariat-assembly.ts'
import { secretariatAssembly } from './secretariat-assembly.ts'

/** More than five recorded secretaries extend this same open native room by `row` px for each three more desks, or
 * by `extra` px when it is given. The reviewed five-desk assembly is returned verbatim for the current office. */
export function secretariatFor(count: number, row = 176, extra = Math.ceil((count - 5) / 3) * row): SecretariatAssembly {
  if (count <= 2) {
    const house = houseCatalog.B01!, [width, height] = house.canvasSize as [number, number]
    const bounds = (polygon: number[][]): Rect => {
      const xs = polygon.map(p => p[0]!), ys = polygon.map(p => p[1]!)
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    const original = bounds(house.openings[0]!), walls = house.collisionPolygons.map(bounds), widen = 48
    const left = walls.find(r => r.x + r.width === original.x && r.y + r.height === original.y)
    const right = walls.find(r => r.x === original.x + original.width && r.y + r.height === original.y)
    if (!left || !right) throw Error('B01 doorway posts are missing')
    // Keep the outer shell and native pixels; move just the two posts outward,
    // crop the adjacent wall, and repeat the threshold floor at each new edge.
    const front: PieceFragment[] = [
      { x: 0, y: 0, crop: { x: 0, y: 0, width: left.x - widen, height } },
      { x: left.x - widen, y: 0, crop: { x: left.x, y: 0, width: left.width, height } },
      { x: right.x + widen, y: 0, crop: { x: right.x, y: 0, width: right.width, height } },
      { x: right.x + right.width + widen, y: 0, crop: { x: right.x + right.width + widen, y: 0, width: width - right.x - right.width - widen, height } },
    ]
    const floor: PieceFragment[] = [
      { x: 0, y: 0, crop: { x: 0, y: 0, width, height } },
      { x: original.x - widen, y: original.y, crop: { x: original.x, y: original.y, width: widen, height: original.height } },
      { x: original.x + original.width, y: original.y, crop: { x: original.x + original.width - widen, y: original.y, width: widen, height: original.height } },
    ]
    const parts: NativePart[] = house.layers.map(layer => ({ sprite: layer.sprite, x: 0, y: 0, layer: layer.layer, depth: height,
      ...(layer.sprite === 'B01-front' ? { fragments: front } : layer.sprite === 'B01-floor' ? { fragments: floor } : {}) }))
    const entrance = { ...original, x: original.x - widen, width: original.width + 2 * widen }
    return { width, height, parts,
      desks: house.deskSlots.slice(0, count).map(slot => ({ x: slot.xy[0]!, y: slot.xy[1]! })),
      walkable: house.walkableAreas.map(bounds).map(r => r.x === original.x && r.y === original.y ? entrance : r), entrance }
  }
  if (count <= 5) return secretariatAssembly
  // The two lanterns stand beside the doorway, so they move down with the front wall.
  const moves = (p: NativePart) => p.layer === 'front' || p.sprite === 'lantern'
  const parts = secretariatAssembly.parts.map(p => ({ ...p, y: p.y >= 442 || moves(p) ? p.y + extra : p.y,
    depth: moves(p) ? p.depth + extra : p.depth }))
  for (let y = 442; y < 442 + extra; y++) for (const x of [0, 676]) parts.push({ sprite: 'B04-back', x, y, layer: 'back', depth: y, crop: { x, y: 337, width: 52, height: 1 } })
  for (const p of nativeTiles('B04-floor', { x: 52, y: 130, width: 624, height: 104 }, { x: 52, y: 442, width: 624, height: extra }, '', 'floor', 0)) parts.push({ sprite: p.sprite, x: p.x, y: p.y, layer: 'floor', depth: 0, crop: p.crop })
  const desks = [...secretariatAssembly.desks]
  for (let index = 5; index < count; index++) desks.push({ x: 62 + (index - 5) % 3 * 230, y: 508 + Math.floor((index - 5) / 3) * row })
  return { ...secretariatAssembly, height: secretariatAssembly.height + extra, parts, desks,
    walkable: [{ ...secretariatAssembly.walkable[0]!, height: secretariatAssembly.walkable[0]!.height + extra }, { ...secretariatAssembly.walkable[1]!, y: secretariatAssembly.walkable[1]!.y + extra }], entrance: { ...secretariatAssembly.entrance, y: secretariatAssembly.entrance.y + extra } }
}

/** Draw the `extra` columns left of `cut` again at `cut`, and move every column right of it `extra` px right. A crop
 * across the cut becomes two: its columns left of the cut, and the rest from `extra` columns before the cut. */
const widenColumns = (fragments: readonly PieceFragment[], cut: number, extra: number): PieceFragment[] => fragments.flatMap(f => {
  const left = cut - f.x, from = Math.max(0, left - extra)
  if (left <= 0) return [{ ...f, x: f.x + extra }]
  if (from >= f.crop.width) return [f]
  return [{ ...f, crop: { ...f.crop, width: Math.min(left, f.crop.width) } }, { x: f.x + from + extra, y: f.y, crop: { ...f.crop, x: f.crop.x + from, width: f.crop.width - from } }]
})

/** Widen a B01 room at each `[cut, extra]` the same way in every layer, from the rightmost cut, so each cut is in the
 * native room's own columns. A floor rect across a cut grows, and one right of it moves. */
function widenRoom(room: SecretariatAssembly, cuts: readonly (readonly [cut: number, extra: number])[]): SecretariatAssembly {
  const [width, height] = houseCatalog.B01!.canvasSize as [number, number]
  return cuts.filter(([, extra]) => extra > 0).sort((a, b) => b[0] - a[0]).reduce((r, [cut, extra]) => {
    const rect = (q: Rect): Rect => q.x >= cut ? { ...q, x: q.x + extra } : q.x + q.width > cut ? { ...q, width: q.width + extra } : q
    return { ...r, width: r.width + extra, walkable: r.walkable.map(rect), entrance: rect(r.entrance),
      parts: r.parts.map(p => ({ ...p, fragments: widenColumns(p.fragments ?? [{ x: 0, y: 0, crop: { x: 0, y: 0, width, height } }], cut, extra) })) }
  }, room)
}

/** Lengthen a B01 room by 96 px using its native floor and wall pixels: the 96 rows above row 220 are drawn again
 * from there, and everything from row 220 down moves 96 px lower, the doorway with it. The back wall repeats its row
 * 219 instead, so its posts are not drawn twice. The floor's pattern repeats every 96 rows, so no shorter repeat
 * joins the floor without a seam. */
function lengthenStudio(base: SecretariatAssembly): SecretariatAssembly {
  const cut = 220, extra = 96
  const parts = base.parts.map(part => {
    const source = part.fragments ?? [{ x: 0, y: 0, crop: { x: 0, y: 0, width: base.width, height: base.height } }]
    const fragments: PieceFragment[] = []
    for (const f of source) {
      const top = Math.max(0, Math.min(f.crop.height, cut - f.crop.y))
      if (top) fragments.push({ x: f.x, y: f.y, crop: { ...f.crop, height: top } })
      if (f.crop.y <= cut - extra && f.crop.y + f.crop.height >= cut) {
        if (part.sprite === 'B01-back') {
          // Continue the straight edge at the cut, without repeating its posts.
          for (let y = 0; y < extra; y++) fragments.push({ x: f.x, y: f.y + cut - f.crop.y + y, crop: { ...f.crop, y: cut - 1, height: 1 } })
        } else fragments.push({ x: f.x, y: f.y + cut - f.crop.y, crop: { ...f.crop, y: cut - extra, height: extra } })
      }
      if (top < f.crop.height) fragments.push({ x: f.x, y: f.y + top + extra, crop: { ...f.crop, y: f.crop.y + top, height: f.crop.height - top } })
    }
    return { ...part, depth: part.depth + extra, fragments }
  })
  return { ...base, height: base.height + extra, parts,
    walkable: base.walkable.map(r => r.y < cut ? { ...r, height: r.height + extra } : { ...r, y: r.y + extra }),
    entrance: { ...base.entrance, y: base.entrance.y + extra } }
}

/** Lengthen a B01 studio using its native floor and wall pixels, and widen it to `width` the same way. Up to 22 px
 * of added width repeats the plain wall, roof and floor columns 80 to 90, between the left post and window, and 330
 * to 340, between the right window and post, half on each side. A room wider by more also repeats one 42 px roof
 * tile at columns 184 to 225, with the floor and the open doorway under it, so the doorway stays in the middle. */
export function studioRoomFor(width = houseCatalog.B01!.canvasSize[0]!): SecretariatAssembly {
  const base = secretariatFor(0), wider = width - base.width, middle = wider > 22 ? 42 : 0, sides = wider - middle
  if (sides < 0 || sides > 22) throw Error(`A B01 studio widens by up to 22 plain columns and one 42 px roof tile, not by the ${wider} px a ${width} px room needs`)
  return widenRoom(lengthenStudio(base), [[341, sides - Math.floor(sides / 2)], [226, middle], [91, Math.floor(sides / 2)]])
}

type Furnishing = readonly [sprite: string, x: number, y: number, layer?: Piece['layer']]
const furnish = (list: readonly Furnishing[]): Piece[] => list.map(([sprite, x, y, layer = 'object']) =>
  piece(sprite, x, y, null, layer, sprite === 'tea-set' ? y + piece('tea-table', 0, 0, null).height + 1 : undefined))

/**
 * How far apart the desk rows stand in a secretary room of six or more. A secretary leaving its desk first walks
 * along it at the height where it works, 24 px under the top of the desk. At the largest real secretary size (saved
 * 1.6, drawn at .92) its body then reaches 55.12 px above the top of its desk. The stool of the desk above ends
 * 178 px under the top of that desk. So the rows must be more than 233.12 px apart for that walk to pass under the
 * stool above; at 233 the body touched the stool by 0.12 px. That is more than the 201 px a nameplate needs to stay
 * under its own desk and the 211 px a secretary standing at its stool needs to start a walk.
 */
export const SECRETARY_ROW = 234

/** The secretaries' rooms for the furnished layout, drawn like the round 7c
 * village rooms. Each secretary stands below the desk and faces it. One or two
 * use the B01 house, with a longer floor for two; three to five use the native hall lengthened by one
 * row, with a pair and a single desk at the back and a pair in front, either side
 * of the door column. Six or more keep the former hall, lengthened row by row,
 * with their desk rows SECRETARY_ROW apart and their own furniture. */
export function secretaryRoomFor(count: number): SecretariatAssembly {
  if (count === 1) {
    // The desk against the left wall, an 88 px way at its right end and the 102 px shelf need 334 px of floor, and
    // below the desk the doorway leaves 92 px either side, too little for the shelf. So this house is 22 px wider
    // than B01, by the 22 columns before x 234 drawn twice, inside the doorway. The desk stands at y 91, where a
    // secretary of the largest real size walking round the desk's end clears the back wall. In B01's own height a
    // desk that low put the secretary at work against the doorway's left post, so this house is also 96 px taller,
    // like the house of two, and the post stands 96 px lower.
    return { ...widenRoom(lengthenStudio(secretariatFor(1)), [[234, 22]]), desks: [{ x: 52, y: 91 }], talks: [{ x: 219, y: 270 }], furnishings: furnish([
      ['message-board', 52, 4, 'back'], ['bookshelf', 284, 4], ['kettle-stand', 330, 228], ['A28', 240, 140, 'floor'], ['desk-plant', 330, 126]]) }
  }
  if (count === 2) {
    // Two desks against the side walls share the 88 px way between them, which needs 376 px of floor, so this house
    // is 64 px wider than B01. At y 91 a secretary of the largest real size clears the back wall once it is below its
    // desk. The kettle stands in the front-left corner and the plant in the front-right one. Each visitor stands below
    // the secretary's stool, clear of the way, with a body's width between the two visitors above the doorway.
    // The longer floor leaves a passing lane below both full-size bodies before
    // the doorway, including when the other secretary is standing at its foot.
    const house = studioRoomFor(480)
    return { ...house, desks: [{ x: 52, y: 91 }, { x: 284, y: 91 }], talks: [{ x: 148, y: 336 }, { x: 382, y: 336 }],
      furnishings: furnish([['kettle-stand', 52, 324], ['desk-plant', 417, 369]]) }
  }
  if (count <= 0) return secretariatFor(count)
  if (count > 5) {
    // The halls of six to eleven keep their height: the back row stands 66 px higher than before, which pays for
    // three rows 22 px further apart than the hall's own 212. Each row after that makes the hall 22 px taller, and a
    // hall that grows grows 2 px more, so 130 px of floor stand between the last row's feet and the front wall. With
    // 128, a walk from the back past a secretary standing at its foot in the middle of the last row had a band only
    // 14 px tall between that body and the doorway's right post, less than one 16 px step of the walk.
    const rows = 2 + Math.floor((count - 6) / 3), lower = Math.max(0, rows - 3)
    const hall = secretariatFor(count + 3, SECRETARY_ROW, rows * 212 + (lower && lower * 22 + 2))
    // The back row stands at y 94, where a secretary of the largest real size at work is clear of the back wall. A
    // full row's desks stand at x 60, 292 and 524, so each gap between two desks of a row is an 88 px way. With the
    // others at their feet, the lane between two rows is narrower than a secretary of the largest real size, so a walk
    // to the door crosses a row only through those ways. The second row's two desks stand against the side walls. The
    // shelf that stood on the back wall between two desks stands in the middle of that row, with the A29 that stood at
    // the back right below it, and the 109 px ways either side of them meet the ways of the rows above and below. The
    // second B28 lies on the floor below that A29. The plant behind the first desk stands 3 px higher, so its base
    // meets the desk's top edge instead of standing in the desk. On the bare floor before the front wall, the tea
    // corner stands left of the doorway in every hall. Right of the doorway, a hall of six to eight keeps its second
    // A29, and a hall of nine or more keeps its planter with the pot right of it, where the pot closes no way.
    const front = hall.entrance.y
    return { ...hall, desks: Array.from({ length: count }, (_, index) => {
      const row = index < 3 ? 0 : index < 5 ? 1 : 2 + Math.floor((index - 5) / 3), column = index < 3 ? index : index < 5 ? (index - 3) * 2 : (index - 5) % 3
      return { x: 60 + column * 232, y: 94 + row * SECRETARY_ROW }
    }), furnishings: furnish([['message-board', 276, 4, 'back'], ['desk-plant', 68, 81], ['bookshelf', 313, 252], ['A29', 325, 388],
      ['B28', 196, 244, 'floor'], ['B28', 312, 470, 'floor'],
      ['tea-table', 64, front - 84], ['tea-set', 99, front - 84],
      ...count < 9 ? [['A29', 567, 780]] as const : [['plant-planter-front', 488, front - 72], ['plant-pot-front', 612, front - 64]] as const]) }
  }
  const hall = secretariatFor(Math.max(6, count + 3), count === 5 ? 272 : undefined)
  // The second back desk stands at x 292, so the first desk has an 88 px way at its right end and the second desk a
  // 92 px way it shares with the third; the shelf that stood there is on the left wall, and the plant behind the
  // desk's left end. The front desks stand at y 372: at y 368 the gap between one and the stool of the back desk above
  // it was 6 px taller than a secretary of the largest real size, too little for a walk to find. They stand 106 px
  // apart, so a walk from each back desk finds the way down between them past the shelf. The back desks' talk places
  // stand where a secretary of the largest real size there covers no secretary at a front desk, and the third one 8 px
  // lower, where that secretary clears its desk's stool.
  return { ...hall, desks: [{ x: 60, y: 104 }, { x: 292, y: 104 }, { x: 528, y: 104 }, { x: 162, y: 372 }, { x: 412, y: 372 }].slice(0, count),
    talks: [{ x: 146, y: 354 }, { x: 396, y: 354 }, { x: 572, y: 362 }, { x: 320, y: 522 }, { x: 398, y: 522 }].slice(0, count), furnishings: furnish([
    ['message-board', 132, 4, 'back'], ['desk-plant', 296, 90], ['bookshelf', 52, 356],
    ['tea-table', 556, 380], ['tea-set', 591, 380], ['bookshelf', 574, 496], ['A29', 490, 540], ['A27', 408, 292, 'floor'],
    ...count < 4 ? [['B28', 176, 400, 'floor'], ['desk-plant', 230, 440]] as const : [], ...count < 5 ? [['A29', 436, 380]] as const : []]) }
}
