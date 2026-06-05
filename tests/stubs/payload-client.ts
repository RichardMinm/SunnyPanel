import type { Config } from "../../src/payload-types";

type CollectionSlug = keyof Config["collections"] & string;
type GlobalSlug = keyof Config["globals"] & string;
type CollectionDoc<TSlug extends CollectionSlug> = Config["collections"][TSlug];
type GlobalDoc<TSlug extends GlobalSlug> = Config["globals"][TSlug];
type PayloadDoc<TDocument, TSlug extends CollectionSlug> = [TDocument] extends [never]
  ? CollectionDoc<TSlug>
  : TDocument;

type PayloadFindResult<TDocument> = {
  docs: TDocument[];
  totalDocs: number;
};

export type PayloadStubOperation = {
  args: unknown;
  type: "create" | "delete" | "find" | "findByID" | "findGlobal" | "update";
};

type CollectionArgs<TSlug extends CollectionSlug> = {
  collection: TSlug;
} & Record<string, unknown>;

type GlobalArgs<TSlug extends GlobalSlug> = {
  slug: TSlug;
} & Record<string, unknown>;

type PayloadStub = {
  create: <TDocument = never, TSlug extends CollectionSlug = CollectionSlug>(
    args: CollectionArgs<TSlug>,
  ) => Promise<PayloadDoc<TDocument, TSlug>>;
  delete: <TDocument = never, TSlug extends CollectionSlug = CollectionSlug>(
    args: CollectionArgs<TSlug>,
  ) => Promise<PayloadDoc<TDocument, TSlug>>;
  find: <TDocument = never, TSlug extends CollectionSlug = CollectionSlug>(
    args: CollectionArgs<TSlug>,
  ) => Promise<PayloadFindResult<PayloadDoc<TDocument, TSlug>>>;
  findByID: <TDocument = never, TSlug extends CollectionSlug = CollectionSlug>(
    args: CollectionArgs<TSlug>,
  ) => Promise<PayloadDoc<TDocument, TSlug> | null>;
  findGlobal: <TSlug extends GlobalSlug = GlobalSlug>(args: GlobalArgs<TSlug>) => Promise<GlobalDoc<TSlug>>;
  update: <TDocument = never, TSlug extends CollectionSlug = CollectionSlug>(
    args: CollectionArgs<TSlug>,
  ) => Promise<PayloadDoc<TDocument, TSlug>>;
};

const emptyFindResult = {
  docs: [],
  totalDocs: 0,
};

let operations: PayloadStubOperation[] = [];
let createHandler: null | ((args: unknown) => Promise<unknown>) = null;
let deleteHandler: null | ((args: unknown) => Promise<unknown>) = null;
let findHandler: null | ((args: unknown) => Promise<unknown>) = null;
let findByIDHandler: null | ((args: unknown) => Promise<unknown>) = null;
let findGlobalHandler: null | ((args: unknown) => Promise<unknown>) = null;
let updateHandler: null | ((args: unknown) => Promise<unknown>) = null;

const recordOperation = (type: PayloadStubOperation["type"], args: unknown) => {
  operations.push({ args, type });
};

const payloadStub: PayloadStub = {
  create: async (args) => {
    recordOperation("create", args);

    return (createHandler ? await createHandler(args) : {}) as never;
  },
  delete: async (args) => {
    recordOperation("delete", args);

    return (deleteHandler ? await deleteHandler(args) : {}) as never;
  },
  find: async (args) => {
    recordOperation("find", args);

    return (findHandler ? await findHandler(args) : emptyFindResult) as never;
  },
  findByID: async (args) => {
    recordOperation("findByID", args);

    return (findByIDHandler ? await findByIDHandler(args) : null) as never;
  },
  findGlobal: async (args) => {
    recordOperation("findGlobal", args);

    return (findGlobalHandler ? await findGlobalHandler(args) : {}) as never;
  },
  update: async (args) => {
    recordOperation("update", args);

    return (updateHandler ? await updateHandler(args) : {}) as never;
  },
};

export const resetPayloadStub = () => {
  operations = [];
  createHandler = null;
  deleteHandler = null;
  findHandler = null;
  findByIDHandler = null;
  findGlobalHandler = null;
  updateHandler = null;
};

export const getPayloadStubOperations = () => [...operations];

export const setPayloadStubCreateHandler = (handler: typeof createHandler) => {
  createHandler = handler;
};

export const setPayloadStubDeleteHandler = (handler: typeof deleteHandler) => {
  deleteHandler = handler;
};

export const setPayloadStubFindHandler = (handler: typeof findHandler) => {
  findHandler = handler;
};

export const setPayloadStubFindByIDHandler = (handler: typeof findByIDHandler) => {
  findByIDHandler = handler;
};

export const setPayloadStubFindGlobalHandler = (handler: typeof findGlobalHandler) => {
  findGlobalHandler = handler;
};

export const setPayloadStubUpdateHandler = (handler: typeof updateHandler) => {
  updateHandler = handler;
};

export const getPayloadClient = async (): Promise<PayloadStub> => payloadStub;
