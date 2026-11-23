// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE SETTINGS THAT GIVE EACH RESULT ITS LEVEL, read on the server when a request is read. The rule that uses them
 * is src/shared/results-at-a-level.ts, and both `GET /api/search` and `GET /api/records` read them here.
 *
 * A value the rule cannot use is refused with the setting's name, and no other value is used in its place.
 */
import { settingValue } from '../../config/settings.mjs'
import { readTheLevelOfEachKind, RESULT_LEVEL_SETTINGS, type LevelSettings } from '@shared/results-at-a-level.ts'
import { wholeNumberSetting } from '../db/env.ts'

export function theLevelSettings(): LevelSettings {
  const said = settingValue(RESULT_LEVEL_SETTINGS.levelOfEachKind) ?? ''
  const levels = readTheLevelOfEachKind(said)
  if ('refused' in levels) {
    throw new Error(`${RESULT_LEVEL_SETTINGS.levelOfEachKind} is ${JSON.stringify(said)}, which is not usable: ${levels.refused} No level was used in its place.`)
  }
  return {
    levelOfEachKind: levels.levels,
    shortUnder: wholeNumberSetting(RESULT_LEVEL_SETTINGS.shortUnder),
    cap: wholeNumberSetting(RESULT_LEVEL_SETTINGS.cap),
  }
}
