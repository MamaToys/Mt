import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { db } from "./db";

/**
 * Email + password authentication with database sessions (better-auth).
 * Sessions are httpOnly cookies; passwords are hashed with scrypt by better-auth.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.APP_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (process.env.ALLOW_SIGNUP === "false") {
            throw new APIError("FORBIDDEN", { message: "Sign-up is disabled on this deployment." });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
