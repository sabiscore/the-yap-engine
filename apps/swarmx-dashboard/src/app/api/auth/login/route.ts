import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function matches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<Response> {
  const expected = process.env.SWARMX_DASHBOARD_ACCESS_TOKEN?.trim();
  if (!expected) return Response.json({ error: "auth_not_configured", message: "Dashboard access control is not configured." }, { status: 503 });

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!token || !matches(expected, token)) {
    return Response.json({ error: "invalid_credentials", message: "Access token rejected." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("swarmx_session", token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 12,
  });
  return response;
}