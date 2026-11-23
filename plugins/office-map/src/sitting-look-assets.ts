// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import data from '../assets/sitting-looks/recipes.json'
import sitting from '../assets/sitting-looks/sitting.json'
import picture0 from '../assets/sitting-looks/tuft-sit.png'
import picture1 from '../assets/sitting-looks/fringe-sit.png'
import picture2 from '../assets/sitting-looks/bun-sit.png'
import picture3 from '../assets/sitting-looks/fan-sit.png'
import picture4 from '../assets/sitting-looks/crest-sit.png'
import picture5 from '../assets/sitting-looks/helmet-sit.png'
import picture6 from '../assets/sitting-looks/waves-sit.png'
import picture7 from '../assets/sitting-looks/part-sit.png'
import picture8 from '../assets/sitting-looks/beret-sit.png'
import picture9 from '../assets/sitting-looks/knit-sit.png'
import picture10 from '../assets/sitting-looks/raincoat-sit.png'
import picture11 from '../assets/sitting-looks/apron-sit.png'
import picture12 from '../assets/sitting-looks/bowtie-sit.png'
import picture13 from '../assets/sitting-looks/backpack-sit.png'
import picture14 from '../assets/sitting-looks/roll-sit.png'
import picture15 from '../assets/sitting-looks/flower-sit.png'
import picture16 from '../assets/sitting-looks/gardener-sit.png'
import picture17 from '../assets/sitting-looks/mapmaker-sit.png'
import picture18 from '../assets/sitting-looks/runner-sit.png'
import mask0 from '../assets/sitting-looks/tuft-sit-mask.png'
import mask1 from '../assets/sitting-looks/fringe-sit-mask.png'
import mask2 from '../assets/sitting-looks/fan-sit-mask.png'
import mask3 from '../assets/sitting-looks/helmet-sit-mask.png'
import mask4 from '../assets/sitting-looks/waves-sit-mask.png'
import mask5 from '../assets/sitting-looks/part-sit-mask.png'
import mask6 from '../assets/sitting-looks/beret-sit-mask.png'
import mask7 from '../assets/sitting-looks/knit-sit-mask.png'
import mask8 from '../assets/sitting-looks/raincoat-sit-mask.png'
import mask9 from '../assets/sitting-looks/apron-sit-mask.png'
import mask10 from '../assets/sitting-looks/bowtie-sit-mask.png'
import mask11 from '../assets/sitting-looks/backpack-sit-mask.png'
import mask12 from '../assets/sitting-looks/roll-sit-mask.png'
import mask13 from '../assets/sitting-looks/flower-sit-mask.png'
import mask14 from '../assets/sitting-looks/gardener-sit-mask.png'
import mask15 from '../assets/sitting-looks/mapmaker-sit-mask.png'
import mask16 from '../assets/sitting-looks/runner-sit-mask.png'

/** Loaded only when a pair is preparing an outing. */
export { data }
export const atlases: Record<string, string> = {
  'sitting-looks/tuft-sit': picture0,
  'sitting-looks/fringe-sit': picture1,
  'sitting-looks/bun-sit': picture2,
  'sitting-looks/fan-sit': picture3,
  'sitting-looks/crest-sit': picture4,
  'sitting-looks/helmet-sit': picture5,
  'sitting-looks/waves-sit': picture6,
  'sitting-looks/part-sit': picture7,
  'sitting-looks/beret-sit': picture8,
  'sitting-looks/knit-sit': picture9,
  'sitting-looks/raincoat-sit': picture10,
  'sitting-looks/apron-sit': picture11,
  'sitting-looks/bowtie-sit': picture12,
  'sitting-looks/backpack-sit': picture13,
  'sitting-looks/roll-sit': picture14,
  'sitting-looks/flower-sit': picture15,
  'sitting-looks/gardener-sit': picture16,
  'sitting-looks/mapmaker-sit': picture17,
  'sitting-looks/runner-sit': picture18,
}
export const masks: Record<string, string> = {
  'tuft-sit-mask.png': mask0,
  'fringe-sit-mask.png': mask1,
  'fan-sit-mask.png': mask2,
  'helmet-sit-mask.png': mask3,
  'waves-sit-mask.png': mask4,
  'part-sit-mask.png': mask5,
  'beret-sit-mask.png': mask6,
  'knit-sit-mask.png': mask7,
  'raincoat-sit-mask.png': mask8,
  'apron-sit-mask.png': mask9,
  'bowtie-sit-mask.png': mask10,
  'backpack-sit-mask.png': mask11,
  'roll-sit-mask.png': mask12,
  'flower-sit-mask.png': mask13,
  'gardener-sit-mask.png': mask14,
  'mapmaker-sit-mask.png': mask15,
  'runner-sit-mask.png': mask16,
}
export const sprites = sitting.sprites
export const dimensions = Object.fromEntries(Object.entries(sitting.atlases).map(([id, atlas]) => [id, atlas.size as [number, number]]))
