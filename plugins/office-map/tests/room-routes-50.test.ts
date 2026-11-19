// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { it } from 'vitest'
import { checkDeskRoutes, checkOccupiedFacilities } from './room-route-checks.ts'

it('keeps every desk route clear in a large room', () => checkDeskRoutes(50), 240000)
it('keeps occupied facilities and routes clear in a large room', () => checkOccupiedFacilities(50), 240000)
