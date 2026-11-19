// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { AuthoredTable } from './table-name-lists.ts'

/**
 * WHY EACH TABLE IN `PERSON_LEVEL_TABLES` IN schema.ts BELONGS TO NO PROJECT, in a sentence an archive can print.
 *
 * THE SENTENCE HAS TO BE WRITTEN DOWN BECAUSE THERE ARE TWO ANSWERS AND AN ARCHIVE PRINTS ONE OF
 * THEM. A project-scoped archive says, on the page where these rows would have been, that it carries
 * none of them and why. That sentence used to be one string about plans, hard-coded, and it was the
 * only kind of table in the list. It is not any more: the registries hold who takes part, and an
 * archive that told a reader "a plan belongs to no project" over a page of people would be a false
 * sentence inside a durable format.
 *
 * A PERSON-LEVEL TABLE WITH NO SENTENCE HERE IS A FAILURE, not a default. `whyATableBelongsToNoProject`
 * below throws rather than guessing. tests/export-workspace.test.ts writes a row into every table in
 * `PERSON_LEVEL_TABLES` and makes one project's archive, which asks for each table's sentence, so the
 * next such table fails that test the first time it runs.
 */
const NO_PROJECT_BECAUSE_IT_IS_A_PLAN =
  "A plan is one person's overlay across work in every project, so it belongs to no single one of them"

const NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION =
  'The people and the durable agents of this installation are the same in every project on this machine, so ' +
  'they belong to no single one of them'

const WHY_NO_PROJECT = {
  office_scene_settings: 'Scene choices are shared by this installation. The map may use one scene or named project areas with their own scenes.',
  office_map_layouts: 'Saved map regions and seats belong to the whole installation, so filtering one project does not rearrange the office.',
  run_models:
    'The model each run uses is one row for the whole installation: the office starts runs in every project, ' +
    'and the model for a run answering a message is kept once, not per project',
  casting:
    "The Casting table holds a row for every project beside rows for one project, so it belongs to the whole " +
    'installation, and a project row names its project in a column of its own',
  casting_changes: "The Casting table's history belongs to the whole installation, as the table does",
  casting_rows:
    'The castings of every project sit beside the castings of one project, so the table belongs to the whole ' +
    'installation, and a project casting names its project in a column of its own',
  casting_row_changes: "The castings' history belongs to the whole installation, as the castings do",
  casting_labels: 'The labels are one list for the whole installation',
  casting_label_changes: "The labels' history belongs to the whole installation, as the labels do",
  preview_root_additions:
    'The directories somebody added by hand are one row for the whole installation, with its JSON keyed by ' +
    'project, so each project reads its own list out of a row that belongs to no single one of them',
  price_table: 'The price table is one row for the whole installation, and the same prices apply to the runs of every project',
  quick_input_list:
    'The list of quick inputs is one row for the whole installation, and the office types from the same list into the ' +
    'terminals of every project',
  what_the_grant_carries:
    "What the person's grant carries is one list for the whole office: the secretary acts for the person in every " +
    'project, so a door the person keeps is kept in all of them',
  quick_input_asks:
    'The ten minutes between quick inputs are counted for each agent across every project, and a durable agent is the ' +
    'same in every project on this machine, so its asks belong to no single one of them',
  submission_baselines: 'A run baseline is a position in the installation-wide revisions ledger; it is preserved with the whole installation rather than rebound to a project-only ledger',
  legacy_unsealed_runs: 'The activation inventory records historical unsealed runs across the installation; a project-only archive does not claim to reproduce that installation-wide inventory',

  allocations: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  planning_capacity: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  planning_recurrences: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  plans: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  plan_lines: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  plan_line_revisions: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  planning_intents: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  work_windows: NO_PROJECT_BECAUSE_IT_IS_A_PLAN,
  assets: NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION,
  people: NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION,
  agents: NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION,
  agent_records:
    'A mapping row says which durable agent one project record is, and a durable agent belongs to no project, ' +
    'so the mapping cannot be carried into one either',
  resident_read_grants:
    'A resident is a durable agent, which belongs to no project, so the leave it gives to read its personal space ' +
    'belongs to no single project either',
  resident_void_marks: "A void mark is on a file in a resident's personal space, which belongs to the agent and to no project",
  resident_space_writes: "A write is a file in a resident's personal space, which belongs to the agent and to no project",
  resident_sleeps: 'A sleep is a fact about a resident, which is a durable agent and belongs to no project',
  installation:
    'The one row saying which installation this database belongs to is a fact about the whole database, so it ' +
    'belongs to no single project in it',
  runtime_settings: 'Runtime controls apply to the whole office and every project it serves.',
  office_restart_grants: 'A restart or pause stops this office, so its grants apply to every project.',
  measure_words_renamed:
    'The one row saying the stored reading-measure words carry their new names is a fact about every record in ' +
    'the database, so it belongs to no single project in it',
  worlds:
    'A world holds every project it has, so a row saying a world was born or died belongs to no single one of ' +
    'them',
  visits:
    'A visit is a citizen of one world working in another, which is about the two worlds rather than about any ' +
    'project inside either',
  visitor_credentials:
    'A credential is issued to an agent on another machine, and that agent does not visit one project: it is ' +
    'held against the whole installation, as a person and a durable agent are',
  visitor_requests:
    'A request made under such a credential belongs to the credential rather than to a project, for the same ' +
    'reason the credential does — and a count of what a visitor did that carried only one project\'s requests ' +
    'would be a supervision number that was quietly wrong',
  trusted_machines:
    'Which machines this office trusts is a fact about the whole installation, like the credentials above: a ' +
    "machine is not trusted for one project's work and refused for another",
  handle_holds:
    'A session answering as a durable agent is answering as that agent everywhere, because a durable agent is ' +
    'one identity across every project on this machine, so which session is answering belongs to no single one ' +
    'of them',
  contact_groups:
    'A group somebody put their contacts in arranges the two registries, and a person and a durable agent are ' +
    'the same in every project on this machine, so the arrangement belongs to no single one of them',
  contact_placements:
    'Which group a contact was moved into is a fact about that contact, and a person and a durable agent are ' +
    'the same in every project on this machine, so the placement belongs to no single one of them',
  contact_group_collapses:
    'Whether one person has folded a contact group away is a behaviour preference of theirs about the two ' +
    'registries, and those registries are the same in every project on this machine, so the fold belongs to ' +
    'no single one of them',
} as const satisfies Partial<Record<AuthoredTable, string>>

/** The sentence for one table, or a refusal — never a guess, because the sentence goes in an archive. */
export function whyATableBelongsToNoProject(table: AuthoredTable): string {
  const because = (WHY_NO_PROJECT as Partial<Record<AuthoredTable, string>>)[table]
  if (because === undefined) {
    throw new Error(
      `${table} belongs to no project and nothing says why. Add a sentence to WHY_NO_PROJECT in ` +
        'src/server/db/why-no-project.ts: an archive prints it on the page where these rows would have been, and a ' +
        'wrong sentence there is worse than a missing page.',
    )
  }
  return because
}
