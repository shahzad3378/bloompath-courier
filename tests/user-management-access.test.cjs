/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadActions({ actorRole = "operations_admin" } = {}) {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        async createUser(input) {
          calls.push({ action: "createUser", input });
          return { data: { user: { id: "11111111-1111-1111-1111-111111111111" } }, error: null };
        },
        async deleteUser(id) { calls.push({ action: "deleteUser", id }); return { error: null }; },
      },
    },
    from(table) {
      let values;
      const filters = [];
      const query = {
        update(next) { values = next; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        select() { return query; },
        async maybeSingle() {
          calls.push({ action: "updateProfile", table, values, filters });
          return { data: { id: "11111111-1111-1111-1111-111111111111" }, error: null };
        },
      };
      return query;
    },
  };
  const file = "src/app/(portal)/users/actions.ts";
  const module = new Module(path.resolve(file));
  module.filename = path.resolve(file);
  module.paths = Module._nodeModulePaths(path.dirname(module.filename));
  module.require = (name) => ({
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw { redirect: url }; } },
    "@/lib/auth": {
      async requireProfile(roles) {
        assert.ok(roles.includes("operations_admin"));
        assert.ok(roles.includes("super_admin"));
        return { id: "actor", organization_id: "company-1", role: actorRole };
      },
    },
    "@/lib/roles": { shipmentDeleteDelegateRoles: ["operations_admin"] },
    "@/lib/supabase/admin": { createAdminClient() { return admin; } },
    "@/lib/supabase/server": { async createClient() { return admin; } },
  })[name];
  module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, module.filename);
  return { actions: module.exports, calls };
}

function createForm(role) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    full_name: "Warehouse Teammate",
    email: "warehouse@example.test",
    password: "Fixture-Only-234",
    role,
    status: "active",
  })) form.set(key, value);
  return form;
}

test("Operations Admin can create standard users but cannot create an Operations Admin or Super Admin", async () => {
  const { actions, calls } = loadActions();

  for (const role of ["operations_admin", "super_admin"]) {
    await assert.rejects(actions.createInternalUserAction(createForm(role)), (error) => error.redirect === "/users?error=invalid");
  }
  assert.equal(calls.length, 0);

  await assert.rejects(actions.createInternalUserAction(createForm("warehouse_staff")), (error) => error.redirect.startsWith("/users?created=1&user="));
  assert.equal(calls.filter((call) => call.action === "createUser").length, 1);
  const update = calls.find((call) => call.action === "updateProfile");
  assert.equal(update.values.role, "warehouse_staff");
  assert.equal(update.values.organization_id, "company-1");
});
