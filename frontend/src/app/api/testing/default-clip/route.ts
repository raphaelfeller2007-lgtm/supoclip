import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// Dedicated route for the same reason as ranking/settings/sfx/route.ts — the
// generic [...path] proxy reads the body as text, which corrupts a
// multipart file upload. GET lives here too since this exact path is no
// longer reachable through the catch-all once this file exists.
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetchBackend("/testing/default-clip", {
    method: "GET",
    userId: session.user.id,
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  const formData = await request.formData();
  const upstream = await fetchBackend(`/testing/default-clip${incomingUrl.search}`, {
    method: "POST",
    userId: session.user.id,
    body: formData,
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}
