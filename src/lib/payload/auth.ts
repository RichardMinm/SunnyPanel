import "server-only";

import { cookies } from "next/headers";

import { jwtVerify } from "jose";

import type { User } from "@/payload-types";

import { getPayloadClient } from "./client";

const payloadTokenCookieName = "payload-token";
const adminUserCollection = "users";

type PayloadAuthUser = User & {
  _sid?: string;
  _strategy?: string;
  collection: "users";
};

export const getPayloadAuthResult = async (): Promise<{ user: null | PayloadAuthUser }> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(payloadTokenCookieName)?.value;

  if (!token) {
    return {
      user: null,
    };
  }

  const payload = await getPayloadClient();

  try {
    const secretKey = new TextEncoder().encode(payload.secret);
    const { payload: decodedPayload } = await jwtVerify(token, secretKey);
    const userId =
      typeof decodedPayload.id === "number" || typeof decodedPayload.id === "string" ? decodedPayload.id : null;
    const sessionId = typeof decodedPayload.sid === "string" ? decodedPayload.sid : null;
    const isAdminUserToken = decodedPayload.collection === adminUserCollection;
    const collection = isAdminUserToken ? payload.collections[adminUserCollection] : null;

    if (!collection || userId === null) {
      return {
        user: null,
      };
    }

    const user = (await payload.findByID({
      collection: adminUserCollection,
      depth: 0,
      id: userId,
      overrideAccess: true,
    })) as User | null;

    if (!user) {
      return {
        user: null,
      };
    }

    if (collection.config.auth.useSessions) {
      const sessionExists = Array.isArray(user.sessions) && sessionId
        ? user.sessions.some((session) => session.id === sessionId)
        : false;

      if (!sessionExists) {
        return {
          user: null,
        };
      }
    }

    return {
      user: {
        ...user,
        _sid: sessionId ?? undefined,
        _strategy: "local-jwt",
        collection: adminUserCollection,
      },
    };
  } catch {
    return {
      user: null,
    };
  }
};
