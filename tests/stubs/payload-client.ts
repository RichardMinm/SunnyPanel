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

const payloadStub: PayloadStub = {
  create: async () => ({} as never),
  find: async () => emptyFindResult,
  findByID: async () => null,
  findGlobal: async () => ({} as never),
  update: async () => ({} as never),
};

export const getPayloadClient = async (): Promise<PayloadStub> => payloadStub;
