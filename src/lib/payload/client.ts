import config from "@payload-config";
import { getPayload } from "payload";

import { createAsyncSingleton } from "@/lib/payload/async-singleton";

export const getPayloadClient = createAsyncSingleton(() =>
  getPayload({ config }),
);
