// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** The office's settings for an inspection. Explicit environments are complete test/worker worlds. */
import { ENV_FILE, mergedEnvironment, readSetting } from './settings.mjs'

/**
 * The check's model and clock from these settings. `model` is null when nobody named one: the office
 * ships no default model, and whoever starts a check with no model refuses it with NO_MODEL_SAYS.check
 * from src/config/agent-model.mjs, as FLO-05 of a decision says.
 *
 * @param {Record<string, string | undefined>} [env] @returns {{model: string | null, minutes: number}}
 */
export function inspectionSettings(env = mergedEnvironment(process.env, ENV_FILE)) {
  const model = readSetting('MOLE_OFFICE_INSPECTION_MODEL', env).value
  const said = readSetting('MOLE_OFFICE_INSPECTION_MINUTES', env).value
  const minutes = Number(said)
  if (said === null || !Number.isFinite(minutes) || minutes <= 0) throw new Error('MOLE_OFFICE_INSPECTION_MINUTES must be a positive number of minutes.')
  return { model: model === null ? null : model.trim(), minutes }
}

/** This permits slower reads; it does not make the API faster. @param {Record<string, string | undefined>} [env] */
export function inspectionApiWaitMilliseconds(env = mergedEnvironment(process.env, ENV_FILE)) {
  const said = readSetting('MOLE_OFFICE_INSPECTION_API_SECONDS', env).value
  const milliseconds = Number(said) * 1000
  if (said === null || !Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 2_147_483_647) {
    throw new Error('MOLE_OFFICE_INSPECTION_API_SECONDS must be positive seconds giving a whole number of milliseconds, at most 2147483.647 seconds.')
  }
  return milliseconds
}

/** Tj0gSo-y1I6h: bound the wait before asking again for a request that never reached the office.
 * @param {Record<string, string | undefined>} [env] */
export function inspectionOfficeBackMilliseconds(env = mergedEnvironment(process.env, ENV_FILE)) {
  const said = readSetting('MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS', env).value
  const milliseconds = Number(said) * 1000
  if (said === null || !Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 2_147_483_647) {
    throw new Error('MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS must be positive seconds giving a whole number of milliseconds, at most 2147483.647 seconds.')
  }
  return milliseconds
}
