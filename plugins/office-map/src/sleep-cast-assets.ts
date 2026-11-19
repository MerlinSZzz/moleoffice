// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import sleepFringe from '../assets/round89-sleep-art/fringe-sleep.png'
import sleepBun from '../assets/round89-sleep-art/bun-sleep.png'
import sleepFan from '../assets/round89-sleep-art/fan-sleep.png'
import sleepCrest from '../assets/round89-sleep-art/crest-sleep.png'
import sleepHelmet from '../assets/round89-sleep-art/helmet-sleep.png'
import sleepWaves from '../assets/round89-sleep-art/waves-sleep.png'
import sleepPart from '../assets/round89-sleep-art/part-sleep.png'
import sleepBeret from '../assets/round89-sleep-art/beret-sleep.png'
import sleepKnit from '../assets/round89-sleep-art/knit-sleep.png'
import sleepRaincoat from '../assets/round89-sleep-art/raincoat-sleep.png'
import sleepApron from '../assets/round89-sleep-art/apron-sleep.png'
import sleepBowtie from '../assets/round89-sleep-art/bowtie-sleep.png'
import sleepBackpack from '../assets/round89-sleep-art/backpack-sleep.png'
import sleepRoll from '../assets/round89-sleep-art/roll-sleep.png'
import sleepFlower from '../assets/round89-sleep-art/flower-sleep.png'

import sleepGardener from '../assets/round89-sleep-art/gardener-sleep.png'
import sleepMapmaker from '../assets/round89-sleep-art/mapmaker-sleep.png'
import sleepRunner from '../assets/round89-sleep-art/runner-sleep.png'

/** These native files are admitted only for a drawn sleeping figure. */
export const atlases = {
  'round89-sleep-art/fringe-sleep': sleepFringe,
  'round89-sleep-art/bun-sleep': sleepBun,
  'round89-sleep-art/fan-sleep': sleepFan,
  'round89-sleep-art/crest-sleep': sleepCrest,
  'round89-sleep-art/helmet-sleep': sleepHelmet,
  'round89-sleep-art/waves-sleep': sleepWaves,
  'round89-sleep-art/part-sleep': sleepPart,
  'round89-sleep-art/beret-sleep': sleepBeret,
  'round89-sleep-art/knit-sleep': sleepKnit,
  'round89-sleep-art/raincoat-sleep': sleepRaincoat,
  'round89-sleep-art/apron-sleep': sleepApron,
  'round89-sleep-art/bowtie-sleep': sleepBowtie,
  'round89-sleep-art/backpack-sleep': sleepBackpack,
  'round89-sleep-art/roll-sleep': sleepRoll,
  'round89-sleep-art/flower-sleep': sleepFlower,
  'round89-sleep-art/gardener-sleep': sleepGardener,
  'round89-sleep-art/mapmaker-sleep': sleepMapmaker,
  'round89-sleep-art/runner-sleep': sleepRunner,
}
export const dimensions = Object.fromEntries(Object.keys(atlases).map(id => [id, [114, 68] as const]))
