// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readSetting } from './settings.mjs'

/** The registered job requested by the periodic counter for the full suite on main. */
export const MAIN_SUITE_JOB = 'main-suite.periodic'

/**
 * THE SCHEDULE OF THE WHOLE SUITE ON MAIN: every `landings` landings or every `hours` hours, whichever comes first,
 * from MOLE_OFFICE_MAIN_SUITE_LANDINGS (a whole number from 1 to 100, 6 when unset) and MOLE_OFFICE_MAIN_SUITE_HOURS
 * (above 0 and at most 24, 2 when unset). A value outside those limits is refused, naming the setting.
 * @param {Record<string, string | undefined>} env
 * @returns {{ landings: number, hours: number }}
 */
export function mainSuiteSchedule(env) {
  const landings = readSetting('MOLE_OFFICE_MAIN_SUITE_LANDINGS', env).value
  const hours = readSetting('MOLE_OFFICE_MAIN_SUITE_HOURS', env).value
  if (!/^[1-9][0-9]*$/.test(landings) || Number(landings) > 100) throw new Error(`MOLE_OFFICE_MAIN_SUITE_LANDINGS is "${landings}", and it must be a whole number of landings from 1 to 100. Nothing was guessed from it.`)
  if (!/^[0-9]+(\.[0-9]+)?$/.test(hours) || Number(hours) <= 0 || Number(hours) > 24) throw new Error(`MOLE_OFFICE_MAIN_SUITE_HOURS is "${hours}", and it must be a number of hours above 0 and at most 24. Nothing was guessed from it.`)
  return { landings: Number(landings), hours: Number(hours) }
}

/**
 * THE COUNTER THAT ASKS FOR THE WHOLE SUITE ON MAIN, as POST /api/counters takes it. It follows landings in the main
 * checkout `lane`, and nobody adds to it by hand. It asks for the job at the settings' count of landings, or when the
 * settings' hours have passed and at least one landing has come, so the suite runs only when main has moved.
 * @param {string} lane
 * @param {Record<string, string | undefined>} env
 */
export function mainSuiteCounter(lane, env) {
  const { landings, hours } = mainSuiteSchedule(env)
  return {
    title: 'The whole suite on main',
    label: 'Whole suite on main',
    counts: `Landings on main in ${lane} since the whole suite on main was last asked for.`,
    mayAdd: { anyone: false, who: [] },
    follows: [{ event: 'landing', lane }],
    triggers: [{ kind: 'count', n: landings }, { kind: 'every', hours }],
    action: { kind: 'job', job: MAIN_SUITE_JOB },
  }
}
