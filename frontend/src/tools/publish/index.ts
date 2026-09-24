import { Send } from "lucide-react";

import type { Tool } from "../types";

/**
 * The third real tool on the platform: assign generated clips to tracked
 * YouTube channels, schedule them, and review simple channel analytics.
 * Route-owning (`frontend/src/app/(publish)/`), same shape as Ranking.
 * `href` points at Channels (not a workflow page) since Channels and
 * Analytics are the two things someone actually browses to — Select/
 * Schedule only make sense mid-workflow, reached from a task page's
 * "Publish Clips" button with a `taskId`/`clipIds` query string.
 */
export const publishTool: Tool = {
  id: "publish",
  name: "Publish",
  icon: Send,
  description: "Schedule and publish clips to your YouTube channels",
  href: "/publish/channels",
  matchPaths: ["/publish/analytics", "/publish/select", "/publish/schedule"],
};
