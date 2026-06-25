import { dashboardContentCollections, type DashboardContentCollection } from "./config";

export const validateDashboardContentCollection = (value: string): DashboardContentCollection | null =>
  (dashboardContentCollections as readonly string[]).includes(value) ? (value as DashboardContentCollection) : null;

export const parseDashboardContentId = (value: string) => {
  const id = Number(value);

  return Number.isFinite(id) && id > 0 ? id : null;
};

export const parseDashboardContentBody = async (request: Request) => {
  const body = await request.json().catch(() => null);

  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
};

export const isStaleDashboardContentUpdate = (
  existingUpdatedAt: string,
  lastKnownUpdatedAt: unknown,
): boolean => typeof lastKnownUpdatedAt === "string" && existingUpdatedAt !== lastKnownUpdatedAt;
