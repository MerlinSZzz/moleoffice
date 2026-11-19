# A letter chosen by an agent, without the office

Previous criterion: the mail service sends office summonses and a Settings test letter; there is no command for an agent to send its own letter during an office outage.

New criterion: an explicit command sends one supplied subject and UTF-8 body to the mail tool's saved recipient list, using its saved account choice and the existing GNOME Online Accounts and SMTP path. It needs neither office availability nor office registration, key, database, page service or address. The agent decides whether to invoke it. No timer, outage detector, automatic message, retry loop or installation change is added.

1. With a stand-in account service and SMTP server, the command sends the supplied letter to the saved list while no office is running. An office-shaped trap receives zero requests. No office credential file is read and the summons cursor and settings remain unchanged.
2. Help, bad arguments, unreadable or empty body, empty recipients, unavailable/unselected account, authentication failure and delivery failure finish with an accurate nonzero result and send nothing beyond what that path can honestly claim. A partial delivery is reported as partial. The command never retries a letter on its own.
3. Account choice, recipients, token retrieval, transport security and message construction reuse the mail service's existing definitions. TLS rules remain intact. Real accounts and credentials are never used in tests; local SMTP and account stand-ins only. Output exposes neither credentials nor private account/address/body data, including on error paths.
4. The summons service and Settings test-letter behaviour retain their existing contract. Importing the shared sender starts no service and contacts no office.
5. Document invocation and host account-session requirements. Audit other office-dependent tools in a report only, explaining the dependency and distinguishing optional evidence writes from required office operations.

Named implementation files: tools/stable/send-mail.mjs (new command), tools/mail-the-summonses.mjs (small shared sender extraction/export), tests/a-secretary-can-send-mail-without-the-office.test.ts (stand-in behavioural proof), and for-agents/README.md (invocation). If the process-start gate requires it, add only the new starter to tests/how-long-a-test-may-take.ts. This criteria file precedes those changes.

Named neighbours: tests/the-mail-tool-mails-each-summons.test.ts, tests/the-mail-tools-settings-are-in-its-entry.test.ts, tests/the-mail-tool-is-installed-by-the-persons-press.test.ts. Run tests serially. The new test has control green, a named guarded implementation line mutated to red, then restore green; preserve all logs and exact edits outside the worktree. The supervisor runs the thirteen required gates, tsc, build and owner-content screen once after joining the code.

## Missing settings, and nothing that starts it (5 November 2026)

Previous criterion: point 2 named "empty recipients" as one refusal. The command gave that same refusal, "the saved recipient list is empty", when the mail tool's folder was not there, and when the folder held no saved list.

New criterion:

6. A missing mail tool folder, a folder with no saved recipient list, and a saved list that is empty are three different refusals. The first two name the folder the command looked in. Each exits 2 before any account is asked, and sends nothing.
7. Nothing starts the command. No start, timer, hook or unit in the checkout names its file; only the command itself, its test and Markdown do. The agent who runs it has decided to send.

Why: a person told that the list is empty looks for a list that somebody emptied, when the folder was never made or `MAIL_TOOL_DIR` named the wrong one. And a letter nobody decided to send is the automatic letter this command must never become.

Named files: tools/stable/send-mail.mjs, tools/mail-the-summonses.mjs and tests/a-secretary-can-send-mail-without-the-office.test.ts. The neighbours named above still hold: the summons service and the Settings test letter are unchanged.
