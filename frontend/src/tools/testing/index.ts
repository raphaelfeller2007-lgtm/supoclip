import { FlaskConical } from "lucide-react";

import type { Tool } from "../types";

/**
 * Dev-only tool: an isolated pipeline-stage runner (see backend/src/testing/
 * and CLAUDE.md's "Testing Tab" section). Route-owning, its own route group
 * (`frontend/src/app/(testing)/testing/`), same shape as Clipping/Ranking.
 *
 * Only ever included in `registry.ts` when
 * `NEXT_PUBLIC_ENABLE_TESTING_TOOL=true` — this is a local-dev tool, not
 * something the hosted product exposes to regular users.
 */
export const testingTool: Tool = {
  id: "testing",
  name: "Testing",
  icon: FlaskConical,
  description: "Run pipeline stages in isolation for development",
  href: "/testing",
};
