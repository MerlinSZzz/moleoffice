-- THE MODEL A RUN USES, AS THE SETTINGS PAGE SETS IT. Criterion U2 of design/settings/ACCEPTANCE.md.
--
-- Until this, every run the office starts took its model from .env: MOLE_OFFICE_AGENT_MODEL, the
-- three chore settings and MOLE_OFFICE_INSPECTION_MODEL. U2 moves that choice onto the Settings page.
-- The office's choices are one singleton row in the shape `preview_root_additions` uses:
-- `settings` holds a JSON object with a model
-- and runtime for each place the office starts a run by itself, and a default for builders of each
-- role card. The shape and its strict reader are in src/shared/run-models.ts.
--
-- IT HOLDS NOTHING UNTIL SOMEBODY PRESSES. No row is written and no data is rewritten, so an
-- installation that sets nothing goes on taking every model from .env exactly as before. An agent's
-- own model is not here: it is a field on the agent's own record, beside its runtime.
CREATE TABLE IF NOT EXISTS `run_models` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `settings` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL,
  `authority` text
);
