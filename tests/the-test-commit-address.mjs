// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ADDRESS A TEST'S GIT REPOSITORY COMMITS AT, AND THIS IS THE ONE PLACE THAT SAYS IT.
 *
 * Since wave 13q the merge queue refuses an entry that would land a commit at the placeholder domain, the
 * domain of MOLE_OFFICE_COMMIT_EMAIL's declared default (tools/merge-tool/commit-addresses.mjs). The test
 * repositories committed there, at example.invalid, and so did the merge tool a test starts, because a test
 * process carries no MOLE_OFFICE_COMMIT_EMAIL (tests/a-test-sees-no-agents-environment.ts) and the tool fell
 * back to the default. Every merge tool test that lands an entry was then refused by the gate.
 *
 * They commit here instead: at a documentation domain under .example (RFC 2606), which is not the placeholder
 * and reaches nobody. A test that means a commit at the placeholder builds that address from the declared default and not from here.
 */

/** The domain every test repository commits at. */
export const THE_TEST_COMMIT_DOMAIN = 'test.example'

/**
 * An address at the test domain, for the one who commits.
 * @param {string} who
 */
export function aTestAddress(who) {
  return `${who}@${THE_TEST_COMMIT_DOMAIN}`
}

/**
 * The four variables git reads before any git config, for a commit made under this name at the test domain.
 * @param {string} name
 * @param {string} who
 */
export function aTestIdentity(name, who) {
  const email = aTestAddress(who)
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email }
}

/** MOLE_OFFICE_COMMIT_EMAIL for the merge tool a test starts: the address of its own commits in a test. */
export const THE_MERGE_TOOLS_TEST_ADDRESS = aTestAddress('merge-queue')
