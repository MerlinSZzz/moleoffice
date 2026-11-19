# The plan

When this person committed real time to work that already exists. This page holds `allocations` and
`planning_capacity`, two of the 57 tables in Mole Office with NO `workspaceId`:
`office_scene_settings`, `office_map_layouts`, `run_models`, `casting`, `casting_changes`, `casting_rows`, `casting_row_changes`, `casting_labels`, `casting_label_changes`, `preview_root_additions`, `price_table`, `quick_input_list`, `what_the_grant_carries`, `submission_baselines`, `legacy_unsealed_runs`, `allocations`, `planning_capacity`, `planning_recurrences`, `plans`, `plan_lines`, `plan_line_revisions`, `planning_intents`, `work_windows`, `measure_words_renamed`, `assets`, `people`, `agents`, `agent_records`, `resident_read_grants`, `resident_void_marks`, `resident_space_writes`, `resident_sleeps`, `installation`, `runtime_settings`, `office_restart_grants`, `worlds`, `visits`, `visitor_credentials`, `visitor_requests`, `trusted_machines`, `handle_holds`, `contact_groups`, `contact_placements`, `contact_group_collapses`, `quick_input_asks`, `notice_batch_deliveries`, `notice_batch_turns`, `registry_aliases`, `registry_remint_generations`, `agent_renames`, `providers`, `provider_changes`, `agent_starter_changes`, `registry_remint_kept_lists`, `registry_remint_manifests`, `registry_remint_manifest_revisions`, `registry_remint_manifest_change_sides`.

THOSE TABLES ARE NOT ALL THE PLAN, and the list above is read from the schema rather than typed, so it
grows. The planning ones are here because a plan is one person's overlay across work that belongs to
projects, so an allocation belongs to none of them and one week may hold work from several at once. The
rest are in `participants.md` and `pictures.md` and belong to no project for their own reason, which
each of those pages gives. That is why a PROJECT-SCOPED archive carries none of them, and why every one
of those pages says so where its rows would be. The count was typed here as TWO and stayed TWO for as
long as there were four, which is why it is read now.

`recordId` names work that stays in its own project. Nothing here moves it or copies it, and an
importer must write records before these rows so that every id names something.

TWO DIFFERENT QUANTITIES, and confusing them is the thing this format is most careful about.
`effort_hours` on the record is how big the work is in total; `plannedHours` here is how much time this
one period gives it. A twenty-hour task with eight hours in a week and three on a Monday is not
thirty-one hours of anything. `plannedHours: null` means somebody committed to the work in this period
WITHOUT saying how long for — which is a different fact from zero, and from the whole of the work — so
the line is written out as null rather than left off.

An allocation whose `state` is `done` means THAT SLICE OF TIME was completed. It says nothing about
whether the work is finished; the work carries its own state and only a person changes it.

### 2026-W32 — work-a — no hours stated

```mole-office allocations
id: "a-alloc"
horizon: "week"
period: "2026-W32"
recordId: "work-a"
plannedHours: null
actualHours: null
state: "planned"
note: null
fromPlanLine: null
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
```

### 2026-W33 — work-b — 2h

```mole-office allocations
id: "z-alloc"
horizon: "week"
period: "2026-W33"
recordId: "work-b"
plannedHours: 2
actualHours: null
state: "planned"
note: null
fromPlanLine: null
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
```

## How many hours each period holds

NO ROW IS NOT ZERO. A period nobody has given a capacity to has no answer to whether it fits,
and a restored archive that invented a working week would report a plan as fitting when nobody
had looked.

### week 2026-W33 — 12h

```mole-office planning_capacity
horizon: "week"
period: "2026-W33"
hours: 12
note: "capacity"
updatedAt: "2026-08-12 10:00:00"
updatedBy: "human:fixture"
```
