"use server";

import { cookies } from "next/headers";
import { isLocale, localeCookie } from "./config";

export async function setLocale(value: unknown): Promise<{ success: boolean }> {
  if (!isLocale(value)) return { success: false };

  (await cookies()).set(localeCookie, value, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  // Setting a cookie in an action re-renders the current page and layouts.
  return { success: true };
}
