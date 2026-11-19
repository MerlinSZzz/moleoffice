// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO LAST CHANGED EACH SETTING THE SETTINGS PAGE SAYS IT FOR, AND WHEN. Problem 4f6oWJdzJbnk.
 *
 *   GET /api/office/setting-changes   the newest recorded change to each of those settings, or null
 *
 * Read from the office's own change log, where every change to these settings is written (`writeDownASettingChange`
 * in lib/records.ts). Remote, like the settings it is about. Read only.
 */
import type { FastifyInstance } from 'fastify'

import { theLastChangeOfASetting, type ASettingsLastChange } from '../lib/records.ts'
import { route } from '../lib/route.ts'

/** The settings whose every change is written down, as the change log names them after `setting:`. */
export const SETTINGS_WHOSE_CHANGES_ARE_KEPT = ['agents-may-inject', 'what-is-kept', 'machine-names', 'dead-letter-secretary', 'address-for-browsers', 'merge-queue-owner', 'module-reminder-secretaries', 'related-tests-first', 'office-load-ranges', 'plugin-switches', 'checks-in-merges-only', 'checks-in-merges-only-for', 'stale-fork-bases', 'gpu-watcher', 'checks-at-once', 'usage-notice-secretary', 'usage-decision'] as const
export type ASettingWhoseChangesAreKept = (typeof SETTINGS_WHOSE_CHANGES_ARE_KEPT)[number]

const READ_NOTE =
  'The newest recorded change to each setting whose every change is written down: whether agents may inject ' +
  '(agents-may-inject), what the office keeps (what-is-kept), the machine names (machine-names), the secretary who ' +
  'takes the dead letters (dead-letter-secretary), the address for browsers (address-for-browsers), the merge ' +
  'queue\'s owner (merge-queue-owner) and who is reminded about each project\'s modules ' +
  '(module-reminder-secretaries, whose from and to carry the reason given) and whether the merge tool runs the related ' +
  'tests first (related-tests-first, whose to carries the reason when one was given), and the tops of the office\'s ' +
  'load ranges (office-load-ranges, whose to carries the reason when one was given), and which plugins are switched ' +
  'on (plugin-switches, whose field names the plugin), and who is the GPU watcher (gpu-watcher, whose from and to ' +
  'carry the reason given, and whose by is {type: "system"} when the office set it at start), and who takes the ' +
  'usage notices (usage-notice-secretary) and what the notice at 80% says to do (usage-decision), whose from and to ' +
  'carry the reason given. Read only, and ' +
  'no body is read. The reply is {settings: {<setting>: {by: {type, id}, at, field, from, to} | null}}. null means ' +
  'the change log holds no change to it, which is not the same as it never having changed: before 29 September ' +
  '2026 only a change made under a raise was written down.'

export async function settingChangesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/setting-changes',
    route('office.setting-changes', 'remote', READ_NOTE),
    async (): Promise<{ settings: Record<ASettingWhoseChangesAreKept, ASettingsLastChange | null> }> => ({
      settings: Object.fromEntries(
        SETTINGS_WHOSE_CHANGES_ARE_KEPT.map((setting) => [setting, theLastChangeOfASetting(setting)]),
      ) as Record<ASettingWhoseChangesAreKept, ASettingsLastChange | null>,
    }),
  )
}
