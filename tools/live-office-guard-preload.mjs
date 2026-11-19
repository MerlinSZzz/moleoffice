// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * Installs tools/live-office-guard.mjs in this process. NODE_OPTIONS imports this file into every node
 * process a test run starts; tools/live-office-guard.mjs says what the guard refuses, and why.
 *
 * The ports come from LIVE_OFFICE_GUARD_PORTS, which the test runner set. A process given none, where
 * somebody loaded this file by hand, reads the two sources itself through tools/live-office-ports.mjs.
 */
import { installTheGuard, theHandedDownPorts } from './live-office-guard.mjs'

const handed = theHandedDownPorts()
installTheGuard(handed ?? (await import('./live-office-ports.mjs')).theLiveOfficesPorts().ports)
