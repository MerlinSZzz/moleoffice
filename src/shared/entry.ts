// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PRESS THAT PUTS THE ENTRY IN PLACE ANSWERS. F15 point 1; problem pHFu8nivPZ_O.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SHARED DECLARATION AND NOT AN INLINE TYPE IN THE COMPONENT
 * ---------------------------------------------------------------------------------------
 *
 * The server builds the reply in `src/config/install-the-entry.mjs`, the route serves it, and the
 * Settings page reads it back. A type written twice would be two shapes that can disagree about the
 * one reply this press exists to show, which is the defect CLAUDE.md names as this codebase's own.
 *
 * A REFUSAL IS NOT THIS SHAPE. A settings file that does not parse, or a backup that cannot be
 * made, comes back as an HTTP error with a sentence naming the file and the reason; the browser
 * shows that sentence through its ordinary error path and never this object.
 */
export interface TheEntryInstallResult {
  /** Always true here: a refusal arrives as an HTTP error, not as a body of this shape. */
  ok: true
  /** Whether anything was written at all. False means the second press changed nothing. */
  changed: boolean
  /** The user-level settings file this press merged into. */
  settingsPath: string
  /**
   * Where this press copied the previous settings file, or null because there was no file yet. The first press copies
   * it to `settings.json.mole-office-backup`; a later press copies it to the first of `-2`, `-3` and on that nothing
   * has, so the first backup is never written over.
   */
  backupPath: string | null
  /** The user-level skill link: `~/.claude/skills/mole-office`. */
  skillLink: string
  /** What that link points at: the skill in this office's folder, or in an AppImage the office's copy of it in its data folder. */
  skillSource: string
  /** Whether a line was appended to `hooks.SessionStart`. */
  addedSessionStart: boolean
  /** Whether a line was appended to `hooks.Stop`. */
  addedStop: boolean
  /** Whether a line was appended to `hooks.SessionEnd`. */
  addedSessionEnd: boolean
  /** Whether the skill link was created. */
  createdSkillLink: boolean
  /** Whether an existing skill link pointing elsewhere was repointed at this checkout. */
  replacedSkillLink: boolean
  /** What happened, in a person's words: what was written, into which file, and where the backup is. */
  says: string
}
