// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The lanes drawing's routing worker (round 231): every route search of a planned drawing runs here, so that none
// holds the page. engine.ts starts one for each plan and ends it when the plan is made.
import { answerRouteCalls, type RouteScope } from "./routing.ts";
answerRouteCalls(self as unknown as RouteScope);
