import { cache } from "react";

import { assembleWorkspaceSnapshot, loadWorkspaceCore } from "@/lib/payload/workspace";

export const getCachedWorkspaceCore = cache(loadWorkspaceCore);

export const getCachedWorkspaceSnapshot = cache(async () => assembleWorkspaceSnapshot(await getCachedWorkspaceCore()));
