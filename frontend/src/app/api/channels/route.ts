import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// Bare-prefix proxy for GET/POST /channels — backend/src/api/routes/channels.py
// declares these at "" (@router.post(""), @router.get("")), which a
// required catch-all ([...path]) never matches (zero path segments), so
// this sits alongside channels/[...path]/route.ts the same way
// api/tasks/route.ts sits alongside api/tasks/[...path]/route.ts.

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  const upstream = await fetchBackend(`/channels${incomingUrl.search}`, {
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

  const body = await request.text();
  const upstream = await fetchBackend(`/channels`, {
    method: "POST",
    userId: session.user.id,
    extraHeaders: {
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body,
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}
