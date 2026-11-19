CREATE TABLE IF NOT EXISTS `gate_counts` (
	`gate` text NOT NULL,
	`day` text NOT NULL,
	`would_stop` integer DEFAULT 0 NOT NULL,
	`stopped` integer DEFAULT 0 NOT NULL,
	`reminded` integer DEFAULT 0 NOT NULL,
	`ignored` integer DEFAULT 0 NOT NULL,
	`heeded` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`gate`, `day`)
);
