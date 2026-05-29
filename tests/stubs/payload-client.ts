type PayloadStub = {
  create: (args: unknown) => Promise<Record<string, unknown>>;
  find: (args: unknown) => Promise<{ docs: Record<string, unknown>[] }>;
  findByID: (args: unknown) => Promise<Record<string, unknown> | null>;
  findGlobal: (args: unknown) => Promise<Record<string, unknown> | null>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
};

const payloadStub: PayloadStub = {
  create: async () => ({}),
  find: async () => ({ docs: [] }),
  findByID: async () => null,
  findGlobal: async () => null,
  update: async () => ({}),
};

export const getPayloadClient = async (): Promise<PayloadStub> => payloadStub;
