// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import catalog from '../assets/village-catalog.json'

const { atlas, rect, trim, size, anchor } = catalog.sprites['desk-lamp']
/** The laptop seen from behind, for the desk top: the back of its open lid faces the room and its screen the mole behind the desk.
 * It is its own native PNG under assets/desk/; its anchor is its middle column on its last row, as open-laptop's is.
 * The lamp at the right end of a desk is no picture of its own: it is the lamp's own place in its atlas, turned round at draw
 * time so that it leans left, over the desk. Its anchor is the lamp's, mirrored in the lamp's canvas. */
export const deskSprites = {
  'laptop-back': { atlas: 'desk/laptop-back', rect: [0, 0, 35, 25], trim: [2, 2, 33, 23], size: [35, 25], anchor: [17, 24] },
  'desk-lamp-right': { atlas, rect, trim, size, anchor: [size[0]! - anchor[0]!, anchor[1]!], turned: true },
} as const
