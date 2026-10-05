import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { ensureSettings } from "./sync/rollup";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/**
 * The store the current user works on. A user's first store is created on
 * first visit; access is always checked through StoreMember.
 */
export const requireStore = cache(async () => {
  const user = await requireUser();
  let member = await db.storeMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { store: true },
  });
  if (!member) {
    const store = await db.store.create({
      data: { name: "My Store", members: { create: { userId: user.id, role: "OWNER" } } },
    });
    await ensureSettings(store.id);
    member = await db.storeMember.findFirstOrThrow({ where: { userId: user.id }, include: { store: true } });
  }
  return { user, store: member.store, role: member.role };
});

/** For API routes: returns null instead of redirecting. */
export async function apiStore(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  const member = await db.storeMember.findFirst({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { store: true } });
  if (!member) return null;
  return { user: session.user, store: member.store, role: member.role };
}

export function canEdit(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
