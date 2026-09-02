import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker.js";

class Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class D1Database {
  constructor() { this.database = new DatabaseSync(":memory:"); this.database.exec("PRAGMA foreign_keys=ON"); }
  prepare(sql) { return new Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const origin = "https://abcdef.example";
const headers = { origin, "cf-connecting-ip": "203.0.113.7" };

function request(path, options = {}) {
  const nextHeaders = new Headers({ ...headers, ...(options.headers || {}) });
  const body = options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body;
  if (body) nextHeaders.set("content-type", "application/json");
  return new Request(origin + path, { ...options, headers: nextHeaders, body });
}

async function call(env, path, options = {}) {
  const response = await worker.fetch(request(path, options), env);
  let body = null;
  try { body = await response.clone().json(); } catch {}
  return { response, body, text: await response.text() };
}

function cookie(response) { return response.headers.get("set-cookie").split(";", 1)[0]; }

test("demo mode seeds sample content and always opens as admin", async () => {
  const env = { DB: new D1Database() };
  const root = await call(env, "/");
  assert.equal(root.response.status, 302);
  assert.equal(root.response.headers.get("location"), origin + "/monitors");
  assert.match(root.response.headers.get("set-cookie"), /monitor_admin=uptimejorip-demo-admin-v1/);
  const demoCookie = cookie(root.response);

  const monitorsPage = await call(env, "/monitors", { headers: { cookie: demoCookie } });
  assert.equal(monitorsPage.response.status, 200);
  assert.match(monitorsPage.text, /매일 00:00\(KST\)/);
  assert.match(monitorsPage.text, /SUIT\.css/);

  for (const path of ["/logs", "/incidents", "/status-page", "/users", "/monitors/demo-home", "/status", "/health"]) {
    const page = await call(env, path, { headers: { cookie: demoCookie } });
    assert.equal(page.response.status, 200, `${path}: ${page.text}`);
  }
  const notFound = await call(env, "/not-a-real-route", { headers: { cookie: demoCookie } });
  assert.equal(notFound.response.status, 404);

  const dashboard = await call(env, "/api/dashboard", { headers: { cookie: demoCookie } });
  assert.equal(dashboard.response.status, 200, dashboard.text);
  assert.equal(dashboard.body.me.username, "demo");
  assert.equal(dashboard.body.me.role, "admin");
  assert.equal(dashboard.body.monitors.length, 4);
  assert.deepEqual(dashboard.body.monitors.map(item => item.status).sort(), ["down", "paused", "up", "up"]);
  assert.equal(dashboard.body.incidents.length, 3);

  for (const path of ["/setup", "/login", "/signup", "/auth-settings"]) {
    const response = await call(env, path);
    assert.equal(response.response.status, 302);
    assert.equal(response.response.headers.get("location"), origin + "/monitors");
  }
});

test("visitor changes are writable and midnight reset restores only sample data", async () => {
  const env = { DB: new D1Database() };
  const root = await call(env, "/");
  const demoCookie = cookie(root.response);

  const created = await call(env, "/api/monitors", {
    method: "POST",
    headers: { cookie: demoCookie },
    body: { name: "방문자 테스트", type: "http", url: "https://example.org/", method: "GET", timeoutMs: 10000, acceptedStatuses: "2xx", slowThresholdMs: 1500 }
  });
  assert.equal(created.response.status, 201, created.text);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM monitors").get().count, 5);

  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-02T15:00:00.000Z");
  try {
    const reset = await call(env, "/_joripspace/cron/demo-reset", { method: "POST" });
    assert.equal(reset.response.status, 200, reset.text);
    assert.equal(reset.body.reset, true);
    assert.equal(reset.body.dateKey, "2026-09-03");
  } finally {
    Date.now = originalNow;
  }

  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM monitors").get().count, 4);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM monitors WHERE name='방문자 테스트'").get().count, 0);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM monitor_runs").get().count, 6);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM incidents").get().count, 3);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM monitor_hourly").get().count, 36);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) count FROM admin_users").get().count, 2);
});
