import type { Where } from "payload";

export const getRelationId = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value && typeof value.id === "number") {
    return value.id;
  }

  return null;
};

export const buildAgentRunOwnerWhere = (userId: number, extra?: Where): Where =>
  extra
    ? {
        and: [
          { user: { equals: userId } },
          extra,
        ],
      }
    : { user: { equals: userId } };

export const isAgentRunOwnedByUser = (run: Record<string, unknown>, userId: number) =>
  getRelationId(run.user) === userId;

