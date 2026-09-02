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

test("empty project starts with one-time admin setup", async () => {
  const env = { DB: new D1Database() };
  const root = await call(env, "/");
  assert.equal(root.response.status, 302);
  assert.equal(root.response.headers.get("location"), origin + "/setup");

  const setupPage = await call(env, "/setup");
  assert.equal(setupPage.response.status, 200);
  assert.match(setupPage.text, /최초 관리자 설정/);
  assert.match(setupPage.text, /class="setup-shell"/);
  assert.match(setupPage.text, /class="setup-intro"/);
  assert.match(setupPage.text, /class="setup-panel"/);
  assert.match(setupPage.text, /grid-template-columns:580px 500px/);
  assert.match(setupPage.text, /justify-content:center/);
  assert.doesNotMatch(setupPage.text, /setup-center-card|setup-stage|setup-form-panel/);
  assert.match(setupPage.text, /당신의 모니터링을/);
  assert.match(setupPage.text, /관리자 계정 만들기/);
  assert.match(setupPage.text, /SUIT\.css/);
  assert.match(setupPage.text, /font:14px\/1\.55 SUIT/);

  const mismatch = await call(env, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "secure-password", password_confirmation: "different-password" }
  });
  assert.equal(mismatch.response.status, 400);

  const setup = await call(env, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "secure-password", password_confirmation: "secure-password", public_signup_enabled: false }
  });
  assert.equal(setup.response.status, 201, setup.text);
  assert.match(setup.response.headers.get("set-cookie"), /monitor_admin=/);
  assert.equal(setup.body.user.role, "admin");
  assert.equal(env.DB.database.prepare("SELECT password_iterations FROM admin_users WHERE username='owner'").get().password_iterations, 100000);

  const second = await call(env, "/api/setup", {
    method: "POST",
    body: { username: "owner2", password: "secure-password", password_confirmation: "secure-password" }
  });
  assert.equal(second.response.status, 409);
});

test("admin controls public signup and self-registered users stay viewers", async () => {
  const env = { DB: new D1Database() };
  const setup = await call(env, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "secure-password", password_confirmation: "secure-password" }
  });
  const ownerCookie = cookie(setup.response);

  const closed = await call(env, "/signup");
  assert.match(closed.text, /공개 회원가입을 받지 않습니다/);

  const enabled = await call(env, "/api/settings/signup", {
    method: "PATCH",
    headers: { cookie: ownerCookie },
    body: { public_signup_enabled: true }
  });
  assert.equal(enabled.response.status, 200, enabled.text);

  const signup = await call(env, "/api/signup", {
    method: "POST",
    body: { username: "viewer_one", password: "viewer-password", password_confirmation: "viewer-password", role: "admin" }
  });
  assert.equal(signup.response.status, 201, signup.text);
  assert.equal(signup.body.user.role, "viewer");

  const login = await call(env, "/api/login", {
    method: "POST",
    body: { username: "viewer_one", password: "viewer-password" }
  });
  assert.equal(login.response.status, 200, login.text);
  const viewerCookie = cookie(login.response);

  const forbidden = await call(env, "/auth-settings", { headers: { cookie: viewerCookie } });
  assert.equal(forbidden.response.status, 403);
  assert.match(forbidden.text, /관리자만 가입 설정/);
});
