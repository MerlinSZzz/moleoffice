// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mountGeometryRuntime, type GeometryPort } from './geometry-scheduler.ts'
import { GeometryRuntime } from './geometry-runtime.ts'
import { OwnershipGeometryCache } from './ownership-layout.ts'

// Classic plugin-only bundle; no network, persistence or office implementation imports.
mountGeometryRuntime(globalThis as unknown as GeometryPort, new GeometryRuntime(new OwnershipGeometryCache()))
