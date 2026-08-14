import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { Media } from "../../src/collections/Media";
import {
  requireTrustedInitialAdminBootstrap,
  Users,
} from "../../src/collections/Users";
import {
  adminsOnly,
  adminsOrPublicMedia,
} from "../../src/lib/payload/access";

const read = (path: string) => readFileSync(path, "utf8");

describe("security boundaries", () => {
  test("anonymous requests cannot create users through generic collection APIs", async () => {
    assert.equal(Users.access?.create, adminsOnly);

    const result = await adminsOnly({ req: { user: null } } as never);
    assert.equal(result, false);
  });

  test("only an empty database and trusted local seed context can bootstrap an admin", async () => {
    const data = { email: "admin@example.test", password: "not-a-real-password" };
    const baseRequest = {
      context: {},
      payload: {
        count: async () => ({ totalDocs: 0 }),
      },
      user: null,
    };

    await assert.rejects(
      () => requireTrustedInitialAdminBootstrap({ data, operation: "create", req: baseRequest } as never),
      /offline seed|trusted bootstrap/i,
    );

    const result = await requireTrustedInitialAdminBootstrap({
      data,
      operation: "create",
      req: {
        ...baseRequest,
        context: { allowInitialAdminBootstrap: true },
      },
    } as never);
    assert.equal(result, data);

    await assert.rejects(
      () => requireTrustedInitialAdminBootstrap({
        data,
        operation: "create",
        req: {
          ...baseRequest,
          context: { allowInitialAdminBootstrap: true },
          payload: { count: async () => ({ totalDocs: 1 }) },
        },
      } as never),
      /already exists/i,
    );
  });

  test("anonymous media access is constrained to explicitly public records", async () => {
    assert.equal(Media.access?.read, adminsOrPublicMedia);
    assert.deepEqual(
      await adminsOrPublicMedia({ req: { user: null } } as never),
      { visibility: { equals: "public" } },
    );
    assert.equal(
      await adminsOrPublicMedia({ req: { user: { id: 1 } } } as never),
      true,
    );
    assert.ok(Media.fields.some((field) => "name" in field && field.name === "visibility"));
  });

  test("media migration preserves existing public assets while new uploads default private", () => {
    const migration = read("src/migrations/20260810_add_media_visibility.ts");
    const uploadRoute = read("src/app/api/editor/upload-media/route.ts");
    const publicBackfill = migration.indexOf(`UPDATE "media" SET "visibility" = 'public'`);
    const privateDefault = migration.indexOf(`ALTER COLUMN "visibility" SET DEFAULT 'private'`);

    assert.ok(publicBackfill >= 0);
    assert.ok(privateDefault > publicBackfill);
    assert.match(uploadRoute, /visibility:\s*"private"/);
  });

  test("public local queries enforce Payload relationship access", () => {
    const source = read("src/lib/payload/public.ts");
    assert.match(source, /findPublicCollection[\s\S]*overrideAccess:\s*false/);
    assert.match(source, /findSinglePublicCollectionDocument[\s\S]*overrideAccess:\s*false/);
  });

  test("health responses expose stable status codes rather than database errors", () => {
    const source = read("src/app/api/health/route.ts");
    assert.doesNotMatch(source, /dbError|err\.message|error\.message/);
    assert.match(source, /database_unavailable/);
  });
});
