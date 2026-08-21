const COOKIE_NAME = "monitor_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const LEGACY_PASSWORD_ITERATIONS = 20000;
const schemaReady = new WeakMap();

export async function handleAuthRequest(request, env) {
  const url = new URL(request.url);
  if (!env.DB) {
    if (url.pathname.startsWith("/api/") || ["/setup", "/signup", "/login", "/auth-settings"].includes(url.pathname)) {
      return json({ message: "DB 연결을 확인해 주세요." }, 503);
    }
    return null;
  }

  if (url.pathname === "/" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    return (await isInstalled(env.DB)) ? null : redirect(url, "/setup");
  }

  if (url.pathname === "/setup" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    return (await isInstalled(env.DB)) ? redirect(url, "/login") : html(setupPage());
  }

  if (url.pathname === "/login" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    if (!(await isInstalled(env.DB))) return redirect(url, "/setup");
    if (await currentUser(request, env.DB)) return redirect(url, safeNext(url.searchParams.get("next")));
    return html(loginPage(await publicSignupEnabled(env.DB)));
  }

  if (url.pathname === "/signup" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    if (!(await isInstalled(env.DB))) return redirect(url, "/setup");
    if (await currentUser(request, env.DB)) return redirect(url, "/monitors");
    return html(signupPage(await publicSignupEnabled(env.DB)));
  }

  if (url.pathname === "/auth-settings" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    const user = await currentUser(request, env.DB);
    if (!user) return redirect(url, "/login?next=%2Fauth-settings");
    if (user.role !== "admin") return html(messagePage("권한이 없습니다", "관리자만 가입 설정을 변경할 수 있습니다.", "/users", "사용자로 돌아가기"), 403);
    return html(authSettingsPage(await publicSignupEnabled(env.DB)));
  }

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    await ensureAuthSchema(env.DB);
    const user = await currentUser(request, env.DB);
    return json({
      installed: await isInstalled(env.DB),
      public_signup_enabled: await publicSignupEnabled(env.DB),
      user: user ? { id: user.id, username: user.username, role: user.role } : null
    });
  }

  if (url.pathname === "/api/setup" && request.method === "POST") {
    await ensureAuthSchema(env.DB);
    return installFirstAdmin(request, env.DB);
  }

  if (url.pathname === "/api/signup" && request.method === "POST") {
    await ensureAuthSchema(env.DB);
    return signup(request, env.DB);
  }

  if ((url.pathname === "/api/login" || url.pathname === "/api/admin/login") && request.method === "POST") {
    await ensureAuthSchema(env.DB);
    return login(request, env.DB);
  }

  if (url.pathname === "/api/settings/signup" && request.method === "PATCH") {
    await ensureAuthSchema(env.DB);
    return updateSignupSetting(request, env.DB);
  }

  return null;
}

async function ensureAuthSchema(db) {
  let pending = schemaReady.get(db);
  if (!pending) {
    const now = Date.now();
    pending = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL DEFAULT 20000, role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), last_login_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at)"),
      db.prepare("CREATE TABLE IF NOT EXISTS admin_login_attempts (attempt_key TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0, lock_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TRIGGER IF NOT EXISTS trg_admin_password_legacy_iterations AFTER UPDATE OF password_hash ON admin_users WHEN NEW.password_iterations = OLD.password_iterations BEGIN UPDATE admin_users SET password_iterations=20000 WHERE id=NEW.id; END"),
      db.prepare("INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES('public_signup_enabled','0',?)").bind(now),
      db.prepare("INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES('public_signup_role','viewer',?)").bind(now)
    ]).catch(error => {
      schemaReady.delete(db);
      throw error;
    });
    schemaReady.set(db, pending);
  }
  await pending;
}

async function installFirstAdmin(request, db) {
  if (await isInstalled(db)) return json({ message: "이미 최초 관리자 설정이 완료되었습니다. 로그인해 주세요." }, 409);
  const body = await readJson(request);
  let username;
  let password;
  try {
    username = validateUsername(body.username);
    password = validatePassword(body.password);
  } catch (error) {
    return json({ message: error.message }, 400);
  }
  if (password !== String(body.password_confirmation || "")) return json({ message: "비밀번호 확인이 일치하지 않습니다." }, 400);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const now = Date.now();
  const inserted = await db.prepare("INSERT INTO admin_users(id,username,password_hash,password_salt,password_iterations,role,active,created_at,updated_at) SELECT ?,?,?,?,?,'admin',1,?,? WHERE NOT EXISTS(SELECT 1 FROM admin_users)")
    .bind(userId, username, passwordHash, salt, PASSWORD_ITERATIONS, now, now).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return json({ message: "다른 요청에서 최초 관리자 설정이 완료되었습니다. 로그인해 주세요." }, 409);

  await db.batch([
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('public_signup_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(body.public_signup_enabled === true ? "1" : "0", now),
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('public_signup_role','viewer',?) ON CONFLICT(key) DO UPDATE SET value='viewer',updated_at=excluded.updated_at")
      .bind(now)
  ]);

  return createSessionResponse(db, { id: userId, username, role: "admin" }, 201);
}

async function signup(request, db) {
  if (!(await isInstalled(db))) return json({ message: "먼저 최초 관리자 설정을 완료해 주세요." }, 409);
  if (!(await publicSignupEnabled(db))) return json({ message: "현재 공개 회원가입을 받지 않습니다. 관리자에게 계정 생성을 요청해 주세요." }, 403);
  const rate = await consumeSignupAttempt(request, db);
  if (rate) return rate;

  const body = await readJson(request);
  let username;
  let password;
  try {
    username = validateUsername(body.username);
    password = validatePassword(body.password);
  } catch (error) {
    return json({ message: error.message }, 400);
  }
  if (password !== String(body.password_confirmation || "")) return json({ message: "비밀번호 확인이 일치하지 않습니다." }, 400);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const user = { id: crypto.randomUUID(), username, role: "viewer" };
  const now = Date.now();
  try {
    await db.prepare("INSERT INTO admin_users(id,username,password_hash,password_salt,password_iterations,role,active,created_at,updated_at) VALUES(?,?,?,?,?,'viewer',1,?,?)")
      .bind(user.id, user.username, passwordHash, salt, PASSWORD_ITERATIONS, now, now).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ message: "이미 사용 중인 아이디입니다." }, 409);
    throw error;
  }
  return createSessionResponse(db, user, 201);
}

async function login(request, db) {
  if (!(await isInstalled(db))) return json({ message: "먼저 최초 관리자 설정을 완료해 주세요." }, 409);
  const body = await readJson(request);
  let username;
  try {
    username = validateUsername(body.username);
  } catch {
    return json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  const password = String(body.password || "");
  const ip = String(request.headers.get("cf-connecting-ip") || "unknown").slice(0, 80);
  const attemptKey = await sha256(username + "|" + ip);
  const now = Date.now();
  const attempts = await db.prepare("SELECT failed_count,lock_until FROM admin_login_attempts WHERE attempt_key=?").bind(attemptKey).first();
  if (Number(attempts?.lock_until || 0) > now) return json({ message: "로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요." }, 429);

  const user = await db.prepare("SELECT * FROM admin_users WHERE username=? COLLATE NOCASE").bind(username).first();
  const storedIterations = Number(user?.password_iterations || LEGACY_PASSWORD_ITERATIONS);
  const candidateHash = await hashPassword(password, user?.password_salt || "invalid-login-salt", storedIterations);
  if (!(user && user.active && constantTimeEqual(candidateHash, user.password_hash))) {
    const failed = Number(attempts?.failed_count || 0) + 1;
    const lockUntil = failed >= 5 ? now + 15 * 60 * 1000 : 0;
    await db.prepare("INSERT INTO admin_login_attempts(attempt_key,failed_count,lock_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(attempt_key) DO UPDATE SET failed_count=excluded.failed_count,lock_until=excluded.lock_until,updated_at=excluded.updated_at")
      .bind(attemptKey, failed, lockUntil, now).run();
    return json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  await db.prepare("DELETE FROM admin_login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  if (storedIterations < PASSWORD_ITERATIONS) {
    const upgradedSalt = randomHex(16);
    const upgradedHash = await hashPassword(password, upgradedSalt, PASSWORD_ITERATIONS);
    await db.prepare("UPDATE admin_users SET password_hash=?,password_salt=?,password_iterations=?,last_login_at=?,updated_at=? WHERE id=?")
      .bind(upgradedHash, upgradedSalt, PASSWORD_ITERATIONS, now, now, user.id).run();
  } else {
    await db.prepare("UPDATE admin_users SET last_login_at=?,updated_at=? WHERE id=?").bind(now, now, user.id).run();
  }
  return createSessionResponse(db, user);
}

async function updateSignupSetting(request, db) {
  const user = await currentUser(request, db);
  if (!user) return json({ message: "로그인이 필요합니다." }, 401);
  if (user.role !== "admin") return json({ message: "관리자 권한이 필요합니다." }, 403);
  const body = await readJson(request);
  if (typeof body.public_signup_enabled !== "boolean") return json({ message: "회원가입 설정이 올바르지 않습니다." }, 400);
  const now = Date.now();
  await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('public_signup_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(body.public_signup_enabled ? "1" : "0", now).run();
  return json({ ok: true, public_signup_enabled: body.public_signup_enabled });
}

async function createSessionResponse(db, user, status = 200) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE expires_at<=?").bind(now),
    db.prepare("INSERT INTO admin_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(tokenHash, user.id, now + SESSION_TTL_MS, now)
  ]);
  return json({ ok: true, user: { id: user.id, username: user.username, role: user.role } }, status, {
    "set-cookie": cookie(token)
  });
}

async function currentUser(request, db) {
  const token = parseCookies(request.headers.get("cookie") || "")[COOKIE_NAME];
  if (!token) return null;
  const now = Date.now();
  return await db.prepare("SELECT u.id,u.username,u.role,u.active,s.expires_at FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1")
    .bind(await sha256(token), now).first() || null;
}

async function isInstalled(db) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM admin_users").first();
  return Number(row?.count || 0) > 0;
}

async function publicSignupEnabled(db) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key='public_signup_enabled'").first();
  return row?.value === "1";
}

async function consumeSignupAttempt(request, db) {
  const ip = String(request.headers.get("cf-connecting-ip") || "unknown").slice(0, 80);
  const key = await sha256("signup|" + ip);
  const now = Date.now();
  const row = await db.prepare("SELECT failed_count,lock_until,updated_at FROM admin_login_attempts WHERE attempt_key=?").bind(key).first();
  if (Number(row?.lock_until || 0) > now) return json({ message: "회원가입 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  const reset = !row || now - Number(row.updated_at || 0) > 60 * 60 * 1000;
  const count = reset ? 1 : Number(row.failed_count || 0) + 1;
  const lockUntil = count > 10 ? now + 60 * 60 * 1000 : 0;
  await db.prepare("INSERT INTO admin_login_attempts(attempt_key,failed_count,lock_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(attempt_key) DO UPDATE SET failed_count=excluded.failed_count,lock_until=excluded.lock_until,updated_at=excluded.updated_at")
    .bind(key, count, lockUntil, now).run();
  return lockUntil ? json({ message: "회원가입 요청이 많습니다. 1시간 뒤 다시 시도해 주세요." }, 429) : null;
}

function validateUsername(value) {
  const username = String(value || "").trim().toLowerCase().slice(0, 40);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("아이디는 영문, 숫자, 점, 밑줄, 하이픈으로 3~40자여야 합니다.");
  return username;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) throw new Error("비밀번호는 8~128자로 입력해 주세요.");
  return password;
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function parseCookies(header) {
  const result = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) result[name] = decodeURIComponent(rest.join("="));
  }
  return result;
}

function cookie(token, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
  return COOKIE_NAME + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeNext(value) {
  return /^\/(monitors|logs|incidents|status-page|users|auth-settings)(\/|$)/.test(String(value || "")) ? String(value) : "/monitors";
}

function redirect(url, path) {
  return Response.redirect(new URL(path, url.origin).toString(), 302);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", ...headers }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" }
  });
}

const AUTH_CSS = `
:root{--bg:#f7f7f5;--card:#fff;--text:#252522;--muted:#73736d;--line:#deded9;--accent:#2563eb;--accent-dark:#1747b0;--danger:#b9403a}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.auth-page{min-height:100vh;display:grid;place-items:center;padding:22px}.auth-card{width:min(420px,100%);padding:30px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:0 18px 55px rgba(30,30,28,.07)}
.brand{display:flex;align-items:center;gap:9px;font-weight:800}.brand-dot{width:10px;height:10px;border-radius:50%;background:#3a7d5a}.eyebrow{margin:22px 0 4px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.08em}.auth-card h1{margin:0 0 8px;font-size:27px;letter-spacing:-.03em}.auth-card p{margin:0 0 20px;color:var(--muted)}
.auth-card label{display:grid;gap:6px;margin:12px 0;color:#55534f;font-size:13px}.auth-card input[type=text],.auth-card input[type=password]{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:7px;font:inherit}.auth-card input:focus{outline:2px solid #dceae2;border-color:#85a995}
.button,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--text);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{width:100%;margin-top:7px;background:var(--text);border-color:var(--text);color:#fff}
.actions{display:flex;gap:9px;align-items:center;margin-top:16px}.actions>*{flex:1}.note{padding:12px;border-radius:7px;background:#f0f5f2;color:#365a47}.error{min-height:21px;margin-top:12px;color:var(--danger)}.switch{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:10px!important}.switch input{width:18px;height:18px}.meta{font-size:12px;color:var(--muted)}
.setup-shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(480px,.92fr);background:#f8fafc}
.setup-stage{position:relative;display:flex;min-height:100vh;flex-direction:column;overflow:hidden;padding:clamp(30px,4vw,58px);background:#07111f;color:#fff;isolation:isolate}
.setup-stage:before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 86% 15%,rgba(37,99,235,.25),transparent 31%),radial-gradient(circle at 12% 82%,rgba(14,165,233,.12),transparent 32%)}
.setup-stage:after{content:"";position:absolute;inset:0;z-index:-1;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.13) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,black,transparent 80%)}
.setup-brand{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:800;letter-spacing:-.02em}.setup-logo{display:grid;width:38px;height:38px;place-items:center;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px rgba(255,255,255,.1)}.setup-logo svg{width:22px;height:22px}.setup-live{display:inline-flex;align-items:center;gap:7px;margin-left:auto;color:#a7f3d0;font-size:11px;font-weight:800;letter-spacing:.08em}.setup-live:before{content:"";width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 5px rgba(52,211,153,.1)}
.setup-story{width:min(620px,100%);margin:auto 0;padding:66px 0 44px}.setup-kicker{display:inline-flex;align-items:center;gap:9px;padding:7px 11px;border:1px solid rgba(96,165,250,.25);border-radius:999px;background:rgba(37,99,235,.14);color:#bfdbfe;font-size:11px;font-weight:800;letter-spacing:.1em}.setup-story h1{max-width:650px;margin:24px 0 20px;font-size:clamp(43px,5vw,72px);font-weight:780;line-height:1.02;letter-spacing:-.062em}.setup-story h1 em{color:#60a5fa;font-style:normal}.setup-story>p{max-width:550px;margin:0;color:#98a9bc;font-size:16px;line-height:1.75}
.monitor-preview{position:relative;width:min(620px,100%);margin-top:44px;padding:20px;border:1px solid rgba(148,163,184,.17);border-radius:22px;background:rgba(15,28,45,.78);box-shadow:0 26px 70px rgba(0,0,0,.28);backdrop-filter:blur(14px)}.preview-head{display:flex;align-items:center;gap:9px;color:#cbd5e1;font-size:12px}.preview-head strong{color:#f8fafc}.preview-head .tiny-live{margin-left:auto;color:#6ee7b7;font-size:10px}.pulse-chart{height:86px;margin:20px 0 16px}.pulse-chart svg{width:100%;height:100%;overflow:visible}.pulse-grid{stroke:rgba(148,163,184,.13);stroke-width:1}.pulse-line{fill:none;stroke:#60a5fa;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 7px rgba(96,165,250,.35))}.pulse-area{fill:url(#pulseFill)}
.preview-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.preview-stat{padding:12px;border:1px solid rgba(148,163,184,.12);border-radius:13px;background:rgba(255,255,255,.035)}.preview-stat span,.preview-stat strong{display:block}.preview-stat span{color:#7f91a6;font-size:10px}.preview-stat strong{margin-top:4px;font-size:14px}.preview-stat strong.ok{color:#6ee7b7}.setup-foot{display:flex;gap:28px;color:#718399;font-size:11px}.setup-foot span{display:flex;align-items:center;gap:7px}.setup-foot svg{width:14px;height:14px;stroke:#60a5fa;fill:none;stroke-width:2}
.setup-form-panel{display:grid;min-height:100vh;place-items:center;padding:clamp(28px,5vw,72px);background:#f8fafc}.setup-form{width:min(440px,100%)}.setup-progress{display:flex;align-items:center;gap:8px;margin-bottom:42px}.setup-progress span{height:4px;border-radius:99px;background:#dbe3ed}.setup-progress span:first-child{width:54px;background:var(--accent)}.setup-progress span:not(:first-child){width:26px}.setup-step-label{margin-left:auto;color:#8a99ab;font-size:11px;font-weight:800;letter-spacing:.08em}.setup-form .eyebrow{margin:0 0 10px;color:var(--accent);font-size:11px;font-weight:850;letter-spacing:.12em}.setup-form h2{margin:0;font-size:34px;line-height:1.15;letter-spacing:-.045em}.setup-lead{margin:12px 0 30px;color:#68788b;line-height:1.7}.field{display:grid;gap:8px;margin:17px 0;color:#334155;font-size:12px;font-weight:780}.field input{width:100%;height:52px;padding:0 15px;border:1px solid #d9e1ea;border-radius:12px;background:#fff;color:#172033;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s,transform .15s}.field input::placeholder{color:#a7b2c0}.field input:focus{border-color:#4d86ed;box-shadow:0 0 0 4px rgba(37,99,235,.1)}
.setup-switch{display:flex;align-items:center;gap:13px;margin:22px 0!important;padding:14px;border:1px solid #e0e6ed;border-radius:13px;background:#fff;color:#334155!important;cursor:pointer}.setup-switch input{position:absolute;opacity:0;pointer-events:none}.toggle{position:relative;width:40px;height:23px;flex:none;border-radius:99px;background:#cbd5e1;transition:.2s}.toggle:after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.25);transition:.2s}.setup-switch input:checked+.toggle{background:var(--accent)}.setup-switch input:checked+.toggle:after{transform:translateX(17px)}.setup-switch strong,.setup-switch small{display:block}.setup-switch strong{font-size:12px}.setup-switch small{margin-top:2px;color:#8492a3;font-size:10px;font-weight:500}
.setup-submit{width:100%;min-height:54px;justify-content:space-between;margin-top:3px;padding:0 18px;border:0;border-radius:12px;background:var(--accent);color:#fff;box-shadow:0 12px 24px rgba(37,99,235,.2);transition:background .15s,transform .15s,box-shadow .15s}.setup-submit:hover{background:var(--accent-dark);box-shadow:0 14px 28px rgba(37,99,235,.25);transform:translateY(-1px)}.setup-submit:disabled{opacity:.65;cursor:wait;transform:none}.setup-error{min-height:22px;margin:11px 0 0;color:var(--danger);font-size:12px}.setup-security{display:flex;align-items:center;justify-content:center;gap:7px;margin:16px 0 0;color:#8a99ab;font-size:10px}.setup-security svg{width:13px;height:13px;stroke:#6b7c90;fill:none;stroke-width:2}
@media(max-width:960px){.setup-shell{grid-template-columns:1fr}.setup-stage{min-height:auto;padding:28px}.setup-story{margin:0;padding:52px 0 20px}.setup-story h1{max-width:620px;font-size:45px}.monitor-preview{margin-top:28px}.setup-foot{display:none}.setup-form-panel{min-height:auto;padding:52px 24px 64px}.setup-progress{margin-bottom:32px}}
@media(max-width:600px){.setup-stage{padding:22px 20px}.setup-logo{width:34px;height:34px;border-radius:10px}.setup-story{padding:36px 0 12px}.setup-story h1{margin:18px 0 14px;font-size:35px}.setup-story>p{font-size:14px}.monitor-preview{padding:15px;border-radius:17px}.pulse-chart{height:62px;margin:15px 0 12px}.preview-stat{padding:10px 8px}.preview-stat strong{font-size:12px}.setup-form-panel{padding:40px 20px 54px}.setup-form h2{font-size:29px}.setup-progress{margin-bottom:27px}}
.setup-note{grid-template-columns:minmax(0,1.08fr) minmax(480px,.92fr);background:linear-gradient(90deg,#f5f6f8 0 53.2%,#fff 53.2%)}
.setup-note .setup-stage{min-height:100vh;padding:clamp(36px,4vw,56px) clamp(40px,7vw,142px);background:transparent;color:#252522}
.setup-note .setup-stage:before,.setup-note .setup-stage:after{display:none}.setup-note .setup-brand{gap:12px;color:#252522}.setup-note .setup-logo{width:34px;height:34px;border:0;border-radius:10px;background:#2d2d2a;color:#fff;box-shadow:none}.setup-note .setup-logo svg{width:20px;height:20px}.setup-note .setup-story{max-width:560px;margin:auto 0;padding:40px 0}.setup-note .setup-kicker{padding:7px 11px;border:0;background:#e7f0ff;color:#1769d2;font-size:12px;letter-spacing:0}.setup-note .setup-story h1{margin:24px 0 20px;color:#252522;font-size:clamp(48px,4.7vw,64px);font-weight:780;line-height:1.08;letter-spacing:-.058em}.setup-note .setup-story>p{max-width:540px;color:#666c76;font-size:16px;line-height:1.75}
.setup-benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}.setup-benefits li{display:flex;align-items:center;gap:10px}.setup-benefits li>span{display:grid;width:30px;height:30px;flex:none;place-items:center;border-radius:10px;background:#fff;color:#2878db;font-size:12px;font-weight:900}.setup-benefits strong,.setup-benefits small{display:block}.setup-benefits strong{color:#33363b;font-size:12px}.setup-benefits small{margin-top:3px;color:#8a8f98;font-size:10px}
.setup-note .setup-form-panel{min-height:100vh;padding:40px clamp(44px,5vw,74px);background:transparent}.setup-note .setup-form{width:min(420px,100%)}.setup-note .setup-progress{margin-bottom:30px}.setup-note .setup-form h2{font-size:31px}.setup-note .setup-lead{margin:8px 0 18px;font-size:13px}.setup-note .field{margin:12px 0}.setup-note .field input{height:50px}.setup-note .setup-switch{margin:14px 0!important;padding:10px 12px}.setup-note .setup-submit{min-height:53px;margin-top:3px;background:#374151;box-shadow:none}.setup-note .setup-submit:hover{background:#252c39;box-shadow:none}.setup-note .setup-security{margin-top:10px}
@media(max-width:960px){.setup-note{grid-template-columns:1fr;background:#fff}.setup-note .setup-stage{min-height:auto;padding:32px 28px;background:#f5f6f8}.setup-note .setup-story{margin:56px 0 24px;padding:0}.setup-note .setup-story h1{font-size:43px}.setup-note .setup-benefits{display:none}.setup-note .setup-form-panel{min-height:auto;padding:48px 24px 64px}}
@media(max-width:600px){.setup-note .setup-stage{padding:24px 20px}.setup-note .setup-story{margin:38px 0 6px}.setup-note .setup-story h1{margin:20px 0 16px;font-size:35px}.setup-note .setup-story>p{font-size:14px}.setup-note .setup-form-panel{padding:36px 20px 54px}.setup-note .setup-form h2{font-size:28px}}
@media(max-width:520px){.auth-card{padding:23px}.auth-card h1{font-size:24px}.actions{align-items:stretch;flex-direction:column}}
`;

function documentShell(title, content) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · UptimeJorip</title><style>${AUTH_CSS}</style></head><body>${content}</body></html>`;
}

function setupPage() {
  return documentShell("최초 관리자 설정", `<main class="setup-shell setup-note"><section class="setup-stage" aria-labelledby="setupTitle"><header class="setup-brand"><span class="setup-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h4l2-7 4 13 3-9 2 3h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>UptimeJorip</strong></header><div class="setup-story"><span class="setup-kicker">처음 한 번만 설정해요</span><h1 id="setupTitle">당신의 모니터링을<br>시작해 볼까요?</h1><p>첫 관리자는 모든 모니터와 사용자를 관리하는 최고 관리자가 됩니다. 설치 후에는 서비스 상태를 등록하고 팀과 함께 운영할 수 있어요.</p></div><ul class="setup-benefits" aria-label="설치 후 제공 기능"><li><span>1</span><div><strong>한눈에 상태 확인</strong><small>가동률과 응답 시간 추적</small></div></li><li><span>2</span><div><strong>빠른 장애 감지</strong><small>이상 징후와 장애 기록</small></div></li><li><span>3</span><div><strong>팀과 함께 운영</strong><small>멤버, 권한, 공개 상태 페이지</small></div></li></ul></section><section class="setup-form-panel"><form id="setupForm" class="setup-form"><div class="setup-progress" aria-label="설치 1단계"><span></span><span></span><span></span><b class="setup-step-label">01 / 03</b></div><div class="eyebrow">ADMIN SETUP</div><h2>관리자 계정 만들기</h2><p class="setup-lead">이 계정은 UptimeJorip의 최고 관리자입니다.</p><label class="field">관리자 아이디<input name="username" type="text" autocomplete="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" placeholder="영문, 숫자, 점, 밑줄 3자 이상" required></label><label class="field">비밀번호<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="8자 이상" required></label><label class="field">비밀번호 확인<input name="password_confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label class="setup-switch"><input name="public_signup_enabled" type="checkbox"><span class="toggle" aria-hidden="true"></span><span><strong>공개 회원가입 허용</strong><small>새 가입자는 관찰자 권한으로 시작합니다.</small></span></label><button class="setup-submit primary" type="submit"><span>UptimeJorip 시작하기</span><span aria-hidden="true">→</span></button><div id="error" class="setup-error" role="alert"></div><p class="setup-security"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>비밀번호는 복구할 수 없도록 안전하게 암호화해 저장합니다.</p></form></section></main><script>${formScript("setupForm", "/api/setup", true)}</script>`);
}

function loginPage(signupEnabled) {
  return documentShell("로그인", `<main class="auth-page"><form id="loginForm" class="auth-card"><div class="brand"><span class="brand-dot"></span>UptimeJorip</div><div class="eyebrow">WELCOME BACK</div><h1>로그인</h1><p>아이디와 비밀번호를 입력해 주세요.</p><label>아이디<input name="username" type="text" autocomplete="username" required maxlength="40"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="primary">로그인</button><div id="error" class="error" role="alert"></div><div class="actions"><a class="button" href="/signup">회원가입</a><a class="button" href="/status">상태 페이지</a></div><p class="meta" style="margin-top:14px">${signupEnabled ? "현재 새 회원가입을 받고 있습니다." : "현재 공개 회원가입은 관리자 설정 후 이용할 수 있습니다."}</p></form></main><script>${formScript("loginForm", "/api/login", false)}</script>`);
}

function signupPage(enabled) {
  if (!enabled) return messagePage("회원가입 준비 중", "현재 공개 회원가입을 받지 않습니다. 관리자에게 계정 생성을 요청해 주세요.", "/login", "로그인으로 돌아가기");
  return documentShell("회원가입", `<main class="auth-page"><form id="signupForm" class="auth-card"><div class="brand"><span class="brand-dot"></span>UptimeJorip</div><div class="eyebrow">CREATE ACCOUNT</div><h1>회원가입</h1><p>새 계정은 관찰자 권한으로 시작합니다.</p><label>아이디<input name="username" type="text" autocomplete="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" required></label><label>비밀번호<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>비밀번호 확인<input name="password_confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary">계정 만들기</button><div id="error" class="error" role="alert"></div><div class="actions"><a class="button" href="/login">로그인으로 돌아가기</a></div></form></main><script>${formScript("signupForm", "/api/signup", true)}</script>`);
}

function authSettingsPage(enabled) {
  return documentShell("가입 설정", `<main class="auth-page"><form id="settingsForm" class="auth-card"><div class="brand"><span class="brand-dot"></span>UptimeJorip</div><div class="eyebrow">MEMBERSHIP</div><h1>가입 설정</h1><p>공개 회원가입 여부를 관리합니다. 새 가입자는 안전한 관찰자 권한으로 시작합니다.</p><label class="switch"><input id="publicSignup" type="checkbox" ${enabled ? "checked" : ""}><span>공개 회원가입 허용<br><small class="meta">누구나 회원가입 화면에서 계정을 만들 수 있습니다.</small></span></label><button class="primary">설정 저장</button><div id="message" class="error" role="status"></div><div class="actions"><a class="button" href="/users">사용자 관리로 돌아가기</a></div></form></main><script>document.querySelector("#settingsForm").onsubmit=async function(event){event.preventDefault();var message=document.querySelector("#message");message.textContent="";try{var response=await fetch("/api/settings/signup",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({public_signup_enabled:document.querySelector("#publicSignup").checked})});var data=await response.json();if(!response.ok)throw Error(data.message||"저장하지 못했습니다.");message.style.color="#2f6e4f";message.textContent="가입 설정을 저장했습니다."}catch(error){message.style.color="#b9403a";message.textContent=error.message}}</script>`);
}

function messagePage(title, message, href, action) {
  return documentShell(title, `<main class="auth-page"><section class="auth-card"><div class="brand"><span class="brand-dot"></span>UptimeJorip</div><div class="eyebrow">ACCOUNT</div><h1>${title}</h1><p>${message}</p><div class="actions"><a class="button" href="${href}">${action}</a></div></section></main>`);
}

function formScript(formId, endpoint, confirmation) {
  return `document.querySelector("#${formId}").onsubmit=async function(event){event.preventDefault();var form=event.currentTarget,error=document.querySelector("#error"),data=Object.fromEntries(new FormData(form));error.textContent="";if(${confirmation ? "true" : "false"}&&data.password!==data.password_confirmation){error.textContent="비밀번호 확인이 일치하지 않습니다.";return}data.public_signup_enabled=form.elements.public_signup_enabled?form.elements.public_signup_enabled.checked:undefined;var button=form.querySelector("button.primary");button.disabled=true;try{var response=await fetch("${endpoint}",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});var body=await response.json();if(!response.ok)throw Error(body.message||"요청을 처리하지 못했습니다.");location.href="/monitors"}catch(reason){error.textContent=reason.message}finally{button.disabled=false}}`;
}
