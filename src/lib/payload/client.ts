import { cache } from "react";

import config from "@payload-config";
import { getPayload } from "payload";

export const getPayloadClient = cache(async () => getPayload({ config }));
