// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN-ONLY CHANGE, IN A MODULE THAT IMPORTS NOTHING (wave 13x round 16, step 4, block 1Asl25_3DvQM). The merge
 * tool runs under plain node, which cannot resolve the office's alias @shared, and reads this rule from here. The
 * office reads it through src/shared/plugins.ts, which exports everything here again.
 *
 * The plan VlQueUhVQQmi: a change that touches only plugins/<id>/ runs the free gates, the plugin's own tests and build,
 * and four slot checks, and not the office's suite. The inspector does not read such
 * a change unless it changes the manifest or the interface, and the privacy and secret checks run
 * as before. The
 * interface is src/shared/plugin-read.ts, outside every plugin's folder, so a change to it is never plugin-only.
 */

/** The folder of plugins, from the root of a checkout. */
export const PLUGINS_FOLDER = 'plugins'

/** A plugin's id: lower case, starting with a letter, 2 to 40 characters. It is the name of its folder. */
export const PLUGIN_ID = /^[a-z][a-z0-9-]{1,39}$/

/** The file in a plugin's folder that is its manifest. */
export const PLUGIN_MANIFEST_FILE = 'plugin.json'

/**
 * The folder inside a plugin's folder that holds the files its pages are drawn from. Step 4 of the pipeline builds it,
 * and git keeps no dist/ folder, so a plugin that lands is built where the office serves it from (tools/merge-tool/land.mjs).
 */
export const PLUGIN_BUILT_FOLDER = 'dist'

/** A change inside one plugin's folder: which plugin, and whether it touches that plugin's manifest. */
export interface APluginOnlyChange {
  id: string
  manifest: boolean
}

/**
 * WHETHER A CHANGE IS PLUGIN-ONLY, worked out here and nowhere else. `paths` are the paths the change touches, from the
 * root of the checkout. It is plugin-only when there is at least one path and every one is a file inside the folder of
 * one plugin: plugins/<id>/<more>, where <id> is a plugin id and no part of the path is empty, `.` or `..`. Two plugins,
 * the README beside them, or anything outside plugins/ is not plugin-only, and null says so.
 */
export function aPluginOnlyChange(paths: readonly string[]): APluginOnlyChange | null {
  if (paths.length === 0) return null
  let id: string | null = null
  let manifest = false
  for (const path of paths) {
    const parts = path.split('/')
    if (parts.length < 3 || parts[0] !== PLUGINS_FOLDER) return null
    if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
    const [, own] = parts
    if (own === undefined || !PLUGIN_ID.test(own) || (id !== null && own !== id)) return null
    id = own
    if (parts.length === 3 && parts[2] === PLUGIN_MANIFEST_FILE) manifest = true
  }
  return id === null ? null : { id, manifest }
}

/** What the inspector reads of a change, and the one sentence that says so. */
export interface ThePluginRule {
  /** The plugin the change touches alone, or null when it is not plugin-only. */
  plugin: APluginOnlyChange | null
  /** Whether the inspector reads the change. False only for a plugin-only change that leaves the manifest alone. */
  read: boolean
  /** Which way the rule went, in one sentence a person and the check's model read. */
  says: string
}

/** What a changed file of a plugin-only change says in place of its diff, when the rule leaves it unread. */
export const NOT_READ_BY_THE_PLUGIN_RULE = "A plugin-only change that leaves the manifest alone. Named, not read, under the plugin rule."

/**
 * WHAT THE INSPECTOR READS OF A CHANGE, at wave 13x round 17, worked out here and
 * nowhere else: the inspector tool decides with it which diffs to read, the office decides with it what the check's
 * prompt says, and the merge queue decides with it whether a changed file needs a check again. `paths` are every path
 * the change touches. A plugin-only change that leaves the manifest alone is not read. One that changes the manifest is
 * read as any change. The interface a plugin uses is outside its folder, so a change to it is not plugin-only and is
 * read. The secret scan and the privacy gate are not this rule's to skip: the merge queue's test step
 * runs them.
 */
export function thePluginRuleOf(paths: readonly string[]): ThePluginRule {
  const plugin = aPluginOnlyChange(paths)
  if (plugin === null) {
    return {
      plugin,
      read: true,
      says:
        paths.length === 0
          ? "No file changed, so the plugin rule leaves nothing unread."
          : "Not a plugin-only change: it changes a file outside one plugin's folder, so it is read as any change. The plugin rule does not apply.",
    }
  }
  const folder = `${PLUGINS_FOLDER}/${plugin.id}`
  const checks = `The secret scan of ${folder} and the privacy gate run as always, at the merge queue's test step.`
  if (plugin.manifest) {
    return {
      plugin,
      read: true,
      says: `A plugin-only change to ${folder} that changes its manifest ${folder}/${PLUGIN_MANIFEST_FILE}, so it is read as any change (a plugin change is read when the manifest or the interface changes). ${checks}`,
    }
  }
  return {
    plugin,
    read: false,
    says: `A plugin-only change to ${folder} that leaves its manifest alone, so its code is not read (a plugin change is read only when the manifest or the interface changes). ${checks}`,
  }
}
