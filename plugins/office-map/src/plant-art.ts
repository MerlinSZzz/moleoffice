// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The floor planter and the potted plant, both drawn from the front, for the bare lower floor of the larger rooms.
 * Each is its own native PNG under assets/plants/; the ground point is 3 px above the bottom edge, as B38's is. */
export const plantSprites = {
  'plant-planter-front': { atlas: 'plants/planter-front', rect: [0, 0, 104, 55], trim: [0, 0, 104, 55], size: [104, 55], anchor: [52, 52] },
  'plant-pot-front': { atlas: 'plants/pot-front', rect: [0, 0, 52, 55], trim: [0, 0, 52, 55], size: [52, 55], anchor: [26, 52] },
} as const
