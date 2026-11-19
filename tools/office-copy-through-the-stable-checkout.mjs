#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * MAKES AN OFFICE COPY THROUGH THE STABLE CHECKOUT, WHICH IS THE CHECKOUT ALLOWED TO OPEN THE DATABASE. It takes the
 * arguments of tools/office-copy.mjs, and runs that tool through the command form, tools/through-the-stable-checkout.mjs.
 */
import { throughTheStableCheckout } from './through-the-stable-checkout.mjs'

process.exitCode = throughTheStableCheckout(['tools/office-copy.mjs', ...process.argv.slice(2)])
