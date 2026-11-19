// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The host's type check reaches this file through a type import, so it names its own image types.
/// <reference path="./images.d.ts" />
/** Only the reviewed village, sixteen gaits and still poses are built. */
export const woodland: Record<string, string> = {}
export const portraits = {}
/** Native PNG dimensions, checked against the bundled files by render.test.ts. */
export const dimensions: Record<string, readonly [number, number]> = {}

import village0 from '../assets/village-0.png'
import village1 from '../assets/village-1.png'
import village2 from '../assets/village-2.png'
import village3 from '../assets/village-3.png'
import village4 from '../assets/village-4.png'
import village5 from '../assets/village-5.png'
import sleepBed from '../assets/round89-sleep-art/bed.png'
import sleepTuft from '../assets/round89-sleep-art/tuft-sleep.png'
import { sleepSprites } from './sleep-art.ts'
import plantPlanter from '../assets/plants/planter-front.png'
import plantPot from '../assets/plants/pot-front.png'
import { plantSprites } from './plant-art.ts'
import laptopBack from '../assets/desk/laptop-back.png'
import { deskSprites } from './desk-art.ts'
import catalog from '../assets/village-catalog.json'
export const atlases = { 'village-0': village0, 'village-1': village1, 'village-2': village2, 'village-3': village3, 'village-4': village4, 'village-5': village5,
  'round89-sleep-art/bed': sleepBed, 'round89-sleep-art/tuft-sleep': sleepTuft,
  'plants/planter-front': plantPlanter, 'plants/pot-front': plantPot, 'desk/laptop-back': laptopBack,
}
export const sprites = { ...catalog.sprites, ...sleepSprites, ...plantSprites, ...deskSprites }
for (const [id, sheet] of Object.entries(catalog.atlases)) dimensions[id] = sheet.size as [number, number]
// A turned frame is drawn from another frame's place in an atlas, so its size is not its atlas's.
for (const frame of [...Object.values(sleepSprites), ...Object.values(plantSprites), ...Object.values(deskSprites)]) if (!('turned' in frame)) dimensions[frame.atlas] = frame.size
