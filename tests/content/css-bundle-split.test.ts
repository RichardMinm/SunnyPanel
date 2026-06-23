import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("CSS bundle split", () => {
  test("site globals import core and site bundle only", () => {
    const globals = read("src/app/globals.css");
    const imports = globals.match(/@import\s+[^;]+;/g)?.join("\n") ?? globals;

    assert.match(imports, /sunny-core\.css/);
    assert.match(imports, /sunny-site\.css/);
    assert.doesNotMatch(imports, /sunny-dashboard\.css/);
    assert.doesNotMatch(imports, /sunny-agent\.css/);
    assert.doesNotMatch(imports, /sunny-admin\.css/);
  });

  test("dashboard layout imports dashboard bundle with correct relative path", () => {
    const layout = read("src/app/(site)/dashboard/layout.tsx");

    assert.match(layout, /["']\.\.\/\.\.\/styles\/sunny-dashboard\.css["']/);
    assert.doesNotMatch(layout, /["']\.\.\/styles\/sunny-dashboard\.css["']/);
  });

  test("site bundle contains public surface styles", () => {
    const site = read("src/app/styles/sunny-site.css");

    assert.match(site, /sunny-ui\.css/);
    assert.match(site, /sunny-markdown\.css/);
    assert.match(site, /sunny-prose\.css/);
    assert.match(site, /sunny-category\.css/);
  });

  test("dashboard bundle contains agent and dashboard styles", () => {
    const dashboard = read("src/app/styles/sunny-dashboard.css");

    assert.match(dashboard, /sunny-agent\.css/);
    assert.match(dashboard, /sunny-dashboard-shell\.css/);
    assert.match(dashboard, /sunny-dashboard-writing\.css/);
  });

  test("admin bundle contains payload bridge and admin shell", () => {
    const admin = read("src/app/styles/sunny-admin.css");

    assert.match(admin, /sunny-payload-bridge\.css/);
    assert.match(admin, /sunny-admin-shell\.css/);
    assert.match(admin, /sunny-admin-unified\.css/);
  });
});
