-- The page language follows the person. NULL means follow the browser.
-- The allowed languages are declared in src/shared/i18n.ts and checked by the door.
ALTER TABLE `people` ADD `language` text;
