// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGULATION: A PERSON'S CONSTRAINT ON THEMSELVES, KEPT WHERE THE OFFICE CAN READ IT BACK TO THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A REGULATION IS, AND WHAT IT SETTLES
 * ---------------------------------------------------------------------------------------
 *
 * design/regulations/ACCEPTANCE.md: a regulation is a limit a person sets on themselves, such as doing
 * design work without an agent. An agent may draft one, and only the person may revoke it. G2 is the criterion this
 * file is the declaration of: the sentence in the person's words; whom it binds, the person or a role; since
 * when; and `revoked_at`/`revoked_because`, writable by the person only.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CHAPTER IS NOT A REGULATION AND A REGULATION IS NOT A CHAPTER
 * ---------------------------------------------------------------------------------------
 *
 * G1 renamed the code of law to the office regulations in the words a reader sees, and both kinds
 * of rule now share that one name, because everyone has rules to keep: it is not regulations for
 * people and law for agents. A chapter (a `module` record carrying `extra.chapter`)
 * binds the agents it names, is a record any agent may reword under the rule the record's own
 * `module` kind already gives it, and changing which rules exist is the person's decision alone. A
 * `regulation` binds the person themselves or one role, is a record ONLY the person may write outright
 * — an agent may file one on the person's words (a warrant) or propose one — and only the person may ever
 * revoke it. Nothing here folds the two into one kind: their authors, their binding and who may
 * change them all differ.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `binds` IS TWO FIELDS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * "The person, or a role" reads like one fact, but a role name is open text — `design/permissions/
 * roles.json` is user-customisable by design, from a template — while "the person" is
 * not a role at all. `binds` is the closed choice of the two ('person' | 'role'); `role` is the open
 * text, sent only when `binds` is 'role'. `CROSS_CHECKS.regulation` in shared/kinds/cross-checks.ts is what
 * refuses the two arriving out of step.
 */

/** The kind word, in one place, the way `NOTEBOOK_KIND` and `WORK_DOMAIN_KIND` are. */
export const REGULATION_KIND = 'regulation'

/** Whom a regulation binds: the person themselves, or one role by name. Closed, because it is a choice. */
export const REGULATION_BINDS_KINDS = ['person', 'role'] as const
export type RegulationBinds = (typeof REGULATION_BINDS_KINDS)[number]
