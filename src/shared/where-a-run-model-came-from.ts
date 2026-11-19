// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whereTheModelCameFromSaid` was moved byte for byte out of src/server/lib/run-models.ts, with no change of behaviour.
 * `whereTheChoreCameFromSaid` was moved byte for byte out of src/server/lib/run-models.ts, with no change of behaviour.
 * `theOfficeChoseIt` was moved byte for byte out of src/server/lib/run-models.ts, with no change of behaviour.
 * That file imports back what it still uses, and re-exports all three, so its export surface is unchanged.
 * They read src/config/agent-model.mjs and src/config/chores.mjs, which import Node's own modules through
 * src/config/settings.mjs, so they have a file of their own rather than a place in src/shared/run-models.ts,
 * which the pages import.
 */

import { whereTheModelCameFromReading } from '../config/agent-model.mjs'
import { whereTheChoreCameFromReading } from '../config/chores.mjs'
import { saying, type DevSaying } from './dev-sayings.ts'
import type { TheModelARunGets } from './run-models.ts'

/**
 * WHERE THE MODEL SETTING CAME FROM, as a code. The English is `whereTheModelCameFrom` in
 * src/config/agent-model.mjs.
 */
export function whereTheModelCameFromSaid(env: NodeJS.ProcessEnv = process.env): DevSaying {
  const reading = whereTheModelCameFromReading(env)
  return reading.nobodySetIt
    ? saying('settingNobodySetTheModel', { setting: reading.setting })
    : saying('settingSaysSo', { setting: reading.setting, source: reading.source })
}

/** The same for the three settings of the office's own runs, whose English is in src/config/chores.mjs. */
export function whereTheChoreCameFromSaid(which: 'runtime' | 'model' | 'variant', env: NodeJS.ProcessEnv = process.env): DevSaying {
  const reading = whereTheChoreCameFromReading(which, env)
  if (!reading.nobodySetIt) return saying('settingSaysSo', { setting: reading.setting, source: reading.source })
  const code =
    which === 'runtime' ? 'settingNobodySetChoreRuntime' : which === 'model' ? 'settingNobodySetChoreModel' : 'settingNobodySetChoreVariant'
  return saying(code, { setting: reading.setting })
}

/** Whether an answer came from the Settings page, the Casting table or an agent's profile, rather than from .env. */
export function theOfficeChoseIt(answered: TheModelARunGets): boolean {
  return answered.from === 'the agent' || answered.from === 'the place' || answered.from === 'the role'
}
