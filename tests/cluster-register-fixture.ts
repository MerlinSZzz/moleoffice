// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EIGHT CLUSTERS OF THE PLAN OF 11 SEPTEMBER 2026, AS RECORDS THE GENERATOR READS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The register is generated from the records, and `tests/the-cluster-register-is-generated.test.ts`
 * has to build those records on a database of its own — never on the owner’s server. The eight module
 * records and the eight pipeline blocks already exist in the office; this file is the same eight
 * clusters written out so a scratch database can hold them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PLANNED STATE IS HERE, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Each cluster's module records its criteria as `data.parts[].items[]`. For each one this file
 * holds the item as it is recorded AND one planned state: a sentence in the present tense saying
 * what would be TRUE when that item is met, never what would be DONE. The item is work; the planned
 * state is the world after the work.
 *
 * WHERE A CRITERION LIVES IN A DESIGN FILE AND NOT IN THE OFFICE, the item is a pointer and the
 * `because` on the planned state names the file. Cluster H's one item names W1–W9, which live in
 * design/window/ACCEPTANCE.md; cluster G's items name S1–S3 and P1–P8, which live in
 * design/shelved/ACCEPTANCE.md and design/planning/ACCEPTANCE.md. The states below cover those
 * items as the module records them, and one criterion the module splits into one item stays one
 * planned state.
 *
 * The goal all eight serve is the campaign's own one sentence, read from design/CURRENT-CAMPAIGN.md
 * line 204. It is the one record this fixture adds that no office record holds today, because a
 * `serves` link needs a goal at its far end.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
export interface FixtureCriterion {
  /** The module part item id, as the office records it. */
  itemId: string
  /** The module part item's words, as the office records them. */
  itemText: string
  /** What would be TRUE when that item is met. One sentence, present tense. */
  what: string
  /** Where a criterion the office does not spell out lives, when it lives in a design file. */
  because?: string
}

export interface FixtureCluster {
  /** The block's title and the module's title, which are the same on the live office. */
  title: string
  /** The block's state on the pipeline. */
  blockState: 'todo' | 'doing' | 'done' | 'blocked' | 'failed'
  /** The module's one part of recorded criteria. */
  partName: string
  /** The module's own context, trimmed to what a scratch copy needs. */
  context: string
  criteria: FixtureCriterion[]
}

/** The one goal the campaign works toward, from design/CURRENT-CAMPAIGN.md line 204. */
export const GOAL = {
  title: 'PanelX supports the whole of one workflow',
  data: {
    horizon: 'long' as const,
    what:
      'PanelX supports the whole of one workflow — think, break work down, have an agent review it, ' +
      'refine it, commit pieces as real work, manage that work across every project, give it time in a ' +
      'month, a week and a day, and execute it today — without needing to understand PanelX’s internal ' +
      'record model or read a manual.',
    owner: THE_TEST_OFFICES_OWNER.id,
    state: 'open' as const,
  },
}

export const CLUSTERS: FixtureCluster[] = [
  {
    title: 'Cluster F — Health and cleanup 健康与清理',
    blockState: 'done',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: nothing; first.',
    criteria: [
      {
        itemId: 'f-1',
        itemText: 'Mend or hand over the nine red test files on main (ELQNsGOWey-q)',
        what: 'The nine test files that were red on main are mended or handed over.',
      },
      {
        itemId: 'f-2',
        itemText: 'Clear the five dead leases and the six a-check worktrees left under lease',
        what: 'No dead lease and no a-check worktree left under lease remains.',
      },
      {
        itemId: 'f-3',
        itemText: 'End or claim the 13 processes of no session; stop the review worlds the owner has looked at',
        what: 'Every process of no session is ended or claimed, and the review worlds the owner has looked at are stopped.',
      },
      {
        itemId: 'f-4',
        itemText: 'Refresh design/CURRENT-CAMPAIGN.md',
        what: 'design/CURRENT-CAMPAIGN.md says where the work is now.',
      },
      {
        itemId: 'f-5',
        itemText:
          'Triage the 111 open problems with no cluster; list the 30 August problems overtaken by events for the owner’s sweep',
        what: 'Every open problem with no cluster is triaged, and the August problems overtaken by events are listed for the owner’s sweep.',
      },
      {
        itemId: 'f-6',
        itemText: 'Close the mutation-test gaps C24, B22, P42, P7',
        what: 'The mutation-test gaps C24, B22, P42 and P7 are closed.',
      },
    ],
  },
  {
    title: "Cluster A — The office's own flow and rules 办公室流程与规则",
    blockState: 'done',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: the owner’s answers on incidents (given, I7).',
    criteria: [
      {
        itemId: 'a-1',
        itemText: 'M105: a message from the office has the office as its sender',
        what: 'A message from the office has the office as its sender.',
      },
      {
        itemId: 'a-2',
        itemText:
          'M109–M111: a finished worker retired or online with a heartbeat; presence checked before sending; dead letters broadcast to the secretaries after a week or ten, a group, claims',
        what:
          'A finished worker is retired or online with a heartbeat, presence is checked before sending, and dead letters are broadcast to the secretaries after a week or ten, with claims.',
      },
      {
        itemId: 'a-3',
        itemText:
          'F10 + F13: reminders, idle n = 1 h and the step’s expected time or tokens, built and tested together',
        what: 'A run that stopped by accident is reminded when it is idle for an hour and when its step’s expected time or tokens are passed.',
      },
      {
        itemId: 'a-4',
        itemText:
          'The review levels per project: none, light, full; the seal blocks nobody; the secretary confirms at none; the report to the secretary at light',
        what: 'Each project has its review level — none, light or full — the seal blocks nobody, the secretary confirms at none, and the report goes to the secretary at light.',
      },
      {
        itemId: 'a-5',
        itemText:
          'C34–C35: the seal as pointers and hashes, the copies stopped, record-only runs unsealed at none and light',
        what: 'The seal is drawn as pointers and hashes, the copies are stopped, and record-only runs are unsealed at none and light.',
      },
      {
        itemId: 'a-6',
        itemText: 'The leases removed, the process-in-directory check kept, the design shelved with why',
        what: 'The leases are removed and shelved with why, and the process-in-directory check is kept.',
      },
      {
        itemId: 'a-7',
        itemText: 'F11–F13 as duties on the role cards, words not gates',
        what: 'F11 to F13 are duties on the role cards, in words and not gates.',
      },
      {
        itemId: 'a-8',
        itemText: 'G1–G5: the office regulations',
        what: 'The office regulations are named, a person’s constraint is a record, the secretary has its duty, and the regulations have their page.',
      },
      {
        itemId: 'a-9',
        itemText: 'I1–I7: the incident kind and page, the first two incidents, who closes one, no gate',
        what: 'The incident kind and its page exist, the first two incidents are filed, and who closes an incident is settled with no gate on it.',
      },
      {
        itemId: 'a-10',
        itemText: 'N5: the secretary changes and removes its own notebook entries',
        what: 'The secretary may change and remove its own notebook entries.',
      },
    ],
  },
  {
    title: 'Cluster B — The chat and messages 聊天与消息',
    blockState: 'doing',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: M105 from A.',
    criteria: [
      {
        itemId: 'b-1',
        itemText: 'chat-3: M112 font size, M113 send states (running)',
        what: 'The chat’s font size is a setting and a message shows its send state — ◷, ✓, ✓✓ or !.',
      },
      {
        itemId: 'b-2',
        // The office's words, less the decision id that ends them.
        itemText: 'M106, M107, the newline decision',
        what: 'The presence mark is true, times carry dates, and the newline decision is applied.',
      },
      {
        itemId: 'b-3',
        itemText:
          'M86–M91, M94: offline messages never vanish, system words, one dialogue, a run that stops tells the owner once',
        what: 'A message sent offline never vanishes, system words are in the conversation, there is one dialogue, and a run that stops tells the owner once as the office.',
      },
      {
        itemId: 'b-4',
        itemText:
          'U1 + M49: the survey of acts only reachable by API; M108: the owner’s acts reachable in the interface',
        what: 'Every act only reachable by API is surveyed, and the owner’s acts are reachable in the interface.',
      },
      {
        itemId: 'b-5',
        itemText: 'E5: a page keeps what it shows until the new answer arrives',
        what: 'A page that re-reads keeps what it shows until the new answer arrives.',
      },
      {
        itemId: 'b-6',
        itemText: 'The slow doors: contacts and presence, /api/sessions, the worker’s queue read',
        what: 'Contacts and presence answer within their budget, /api/sessions no longer returns three megabytes, and the worker’s queue is not read every three seconds.',
      },
    ],
  },
  {
    title: 'Cluster D — Settings, runtimes and cost 设置、运行时与成本',
    blockState: 'doing',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: U2 first; U4 after C.',
    criteria: [
      {
        itemId: 'd-1',
        itemText: 'U2: model settings and API keys in Settings, per place and per agent, never in a file',
        what: 'Model settings and API keys live in Settings, per place and per agent, and never in a file.',
      },
      {
        itemId: 'd-2',
        itemText: 'T7 + the opencode runner: a cheaper runtime as a setting; model and reasoning variant passed through',
        what: 'A cheaper runtime is a setting, and the opencode runner takes a model and a reasoning variant.',
      },
      {
        itemId: 'd-3',
        itemText: 'U3: the usage page estimates a price',
        what: 'The usage page estimates a price from recorded metadata.',
      },
      {
        itemId: 'd-4',
        itemText: 'T3, T2, T6: what a brief cost, what a record cost through a run’s links, a warning on a long-context agent kept alive',
        what: 'A brief says what it cost to read, a record knows what was spent on it through the links a run wrote, and a long-context agent kept alive is warned about.',
      },
      {
        itemId: 'd-5',
        itemText: 'T4, T5: prediction and the comparison experiment',
        what: 'Prediction and the comparison experiment are built.',
      },
      {
        itemId: 'd-6',
        itemText: 'U5: media loading as the owner’s setting',
        what: 'Whether media load is the owner’s setting, with its three choices.',
      },
      {
        itemId: 'd-7',
        itemText: 'U4: preview roots from registered work areas (after C)',
        what: 'The directories a preview may read come from the registered work areas.',
      },
    ],
  },
  {
    title: 'Cluster C — Identity, permissions and worlds 身份、权限与世界',
    blockState: 'doing',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: the owner’s yes on the work area by role; the owner’s credentials decision.',
    criteria: [
      {
        itemId: 'c-1',
        itemText:
          'P85–P88, C32–C33: the worlds listing, the visitor’s card ceiling, a visitor defined, who registered a work area',
        what: 'The worlds listing shows the running worlds and what each is for, the visitor’s card ceiling is a setting, a visitor is defined, and who registered a work area is shown.',
      },
      {
        itemId: 'c-2',
        itemText:
          'P91: model, effort, tokens, compactions and the step timeline per run, summed on the agent; a model change recorded',
        what: 'A run shows its model, effort, tokens, compactions and step timeline summed on the agent, and a model change is recorded.',
      },
      {
        itemId: 'c-3',
        itemText: 'The work area by role (the owner’s idea of 14:40) as criteria after the owner’s yes; ypeLREwCeKvU',
        what:
          'A worker gets a folder under the work directory, a supervisor a directory, a secretary unlimited and an inspector the check worktree, with scope agreed and widening through the supervisor.',
        because: 'The work area by role is written as criteria P92–P95 in design/permissions/ACCEPTANCE.md after the owner’s yes.',
      },
      {
        itemId: 'c-4',
        itemText: 'P90, P76, P63: one wording for the governance acts, a decision’s core and notes, interpretation is the owner’s',
        what: 'The four governance acts have one wording, a decision has a core and notes, and interpretation is the owner’s.',
      },
      {
        itemId: 'c-5',
        itemText: 'P17–P20: the authorised period; 8Kf0hCaK4lQY: a machine by its name',
        what: 'The authorised period is recorded, and a machine is named by its name.',
      },
      {
        itemId: 'c-6',
        itemText: 'P83 (identity keys, three ways in) and P79–P80: designed first (F7) on the owner’s credentials decision',
        what: 'Identity keys have three ways in, the power tree is drawn, and a test world says why its faces differ.',
      },
    ],
  },
  {
    title: 'Cluster E — The reading surface 阅读面与画',
    blockState: 'todo',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: the owner’s four acts for the parts that are the owner’s.',
    criteria: [
      {
        itemId: 'e-1',
        itemText:
          'E1–E3: Reports and notes holds reports and notes; a press opens the thing’s page; a handback shows what the owner decides or sees',
        what: 'Reports and notes holds reports and notes, a press opens the thing’s own page, and a handback shows what the owner decides or sees.',
      },
      {
        itemId: 'e-2',
        itemText: 'B33–B34: a reading shows on a press; Less and More show a scale',
        what: 'A reading shows on a press, and Less and More show a scale.',
      },
      {
        itemId: 'e-3',
        itemText: 'D28 and the in-part D8, D10, D11, D23, D35, D37; C18’s second half',
        what: 'Nested blocks enlarge, the in-part D8, D10, D11, D23, D35 and D37 are built, and the second half of C18 answers a right-click inside the picture.',
        because: 'D28, D8, D10, D11, D23, D35, D37 and C18 live in design/drawings/ACCEPTANCE.md and design/bundle/ACCEPTANCE.md.',
      },
      {
        itemId: 'e-4',
        itemText: 'Triage of the 43 reading-surface and 11 pointing problems',
        what: 'The 43 reading-surface problems and the 11 pointing problems are triaged.',
      },
      {
        itemId: 'e-5',
        itemText:
          'The owner’s four acts: the default reading measure, problem-03 E1–E2, the drawings’ acceptance, pointing’s closing act',
        what: 'The owner’s four acts on the reading surface are given: the default reading measure, problem-03 E1–E2, the drawings’ acceptance and pointing’s closing act.',
      },
    ],
  },
  {
    title: 'Cluster G — Planning and the shelf 规划与搁置',
    blockState: 'todo',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: planning accepted 11 September.',
    criteria: [
      {
        itemId: 'g-1',
        itemText: 'S1–S3: a shelved state on a direction, the Shelved page, withdrawn designs on it (the leases first)',
        what: 'A direction can be shelved with why and what would restart it, a Shelved page lists them, and withdrawn designs go on the same shelf.',
        because: 'S1, S2 and S3 live in design/shelved/ACCEPTANCE.md.',
      },
      {
        itemId: 'g-2',
        itemText:
          'Planning P1–P8: goals with four horizons, plans short by construction, clusters as records, one page of three horizons',
        what:
          'Goals have four horizons, plans are short by construction, agents plan and replan, clusters are records, one page draws three horizons, the ladder is on the named kinds, every criterion has a test, and plans belong to the person across workspaces and worlds.',
        because: 'P1 to P8 live in design/planning/ACCEPTANCE.md.',
      },
      {
        itemId: 'g-3',
        itemText: 'R3: a file stored as a file',
        what: 'A file is stored as a file.',
        because: 'R3 lives in design/bundle/ACCEPTANCE.md.',
      },
    ],
  },
  {
    title: 'Cluster H — A window of its own 独立窗口',
    blockState: 'todo',
    partName: 'What the cluster holds',
    context:
      'One of the eight clusters of the plan of 11 September 2026 (design/PLAN-2026-09-11.md, report ' +
      'xDdQpU0SkUEr, pipeline HCM2GykcAvDy). Depends on: the owner’s confirmation; last.',
    criteria: [
      {
        itemId: 'h-1',
        itemText: 'W1–W9 after the owner’s confirmation and the owner’s two answers',
        what:
          'The service is an independent process with three ways in, opening the window is a self-check, close minimises, shutdown is a control, a shutdown with agents at work asks once more, interrupted runs resume, the process ledger knows the window, and one database serves the window and the headless command.',
        because: 'W1 to W9 live in design/window/ACCEPTANCE.md, nine criteria the module records as one item.',
      },
    ],
  },
]
