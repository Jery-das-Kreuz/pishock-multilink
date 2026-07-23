import { randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

const CONTROLLER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const VALID_CONTROLLER_ID = /^[A-Za-z0-9._:-]{8,120}$/;

function cookieName(bundleId: string): string {
  const safeBundleId = bundleId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `ps_controller_${safeBundleId || "bundle"}`;
}

function validControllerId(value: string | null | undefined): value is string {
  return typeof value === "string" && VALID_CONTROLLER_ID.test(value);
}

export function resolveControllerId(
  request: NextRequest,
  bundleId: string,
  submittedControllerId?: string | null,
): string {
  const cookieControllerId = request.cookies.get(cookieName(bundleId))?.value;

  if (validControllerId(cookieControllerId)) {
    return cookieControllerId;
  }

  if (validControllerId(submittedControllerId)) {
    return submittedControllerId;
  }

  return randomUUID();
}

export function attachControllerCookie(
  response: NextResponse,
  bundleId: string,
  controllerId: string,
): NextResponse {
  response.cookies.set({
    name: cookieName(bundleId),
    value: controllerId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONTROLLER_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
