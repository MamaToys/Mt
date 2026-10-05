import "server-only";
import { cookies } from "next/headers";
import { randomToken, safeEqual } from "./crypto";

const NAME = "oauth_state";

export async function issueState(kind: "shopify" | "meta"): Promise<string> {
  const state = `${kind}.${randomToken(24)}`;
  (await cookies()).set(NAME, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return state;
}

export async function consumeState(received: string | null): Promise<boolean> {
  const jar = await cookies();
  const expected = jar.get(NAME)?.value;
  jar.delete(NAME);
  return !!received && !!expected && safeEqual(received, expected);
}
