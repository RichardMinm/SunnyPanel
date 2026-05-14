import { cache } from "react";

import { getWorkspaceSnapshot } from "@/lib/payload/workspace";

export const getCachedWorkspaceSnapshot = cache(getWorkspaceSnapshot);
