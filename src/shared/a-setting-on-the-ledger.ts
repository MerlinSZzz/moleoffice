// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `A_SETTING_ON_THE_LEDGER` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/**
 * WHERE THE LEDGER FILES AN ACT THAT WROTE NO RECORD: a setting the office keeps outside its records, changed under a
 * raise. A decision asks that every act under a raise is recorded as done under it. Such a
 * setting has no revision to name the grant, so one change row does, on the id `setting:<which>`
 * (writeDownAnActUnderTheRaise in lib/records/setting-changes.ts). No record ever has an id with a colon in it, so the
 * two cannot meet.
 */
export const A_SETTING_ON_THE_LEDGER = 'setting:'
