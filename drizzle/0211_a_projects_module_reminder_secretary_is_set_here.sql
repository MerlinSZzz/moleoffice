-- WHO IS REMINDED ABOUT A PROJECT'S MODULES MAY BE SET ON THE SETTINGS PAGE. Wave 13p round 29, on decision
-- aZGg6gerakM1 (one secretary per project is reminded about the modules left unchanged for 14 days).
--
-- TWO COLUMNS ON `workspaces`, because the choice is one fact about one project. `module_reminder_secretary` holds
-- the registry id of one agent. `module_reminder_secretary_because` holds the reason given with the last change, or
-- NULL when the person pressed without giving one.
--
-- NULL MEANS NOTHING IS SET HERE for that project. The line MOLE_OFFICE_MODULE_REMINDER_SECRETARIES in .env then
-- decides, as it did before this migration. The one reader is src/server/lib/module-reminder-secretaries.ts.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE statements and no UPDATE.
ALTER TABLE `workspaces` ADD `module_reminder_secretary` text;
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `module_reminder_secretary_because` text;
