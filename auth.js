const COOKIE_NAME = "monitor_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const LEGACY_PASSWORD_ITERATIONS = 20000;
const DEMO_SESSION_TOKEN = "uptimejorip-demo-admin-v1";
const schemaReady = new WeakMap();
const demoReady = new WeakMap();
export const DEMO_ADMIN = Object.freeze({ id: "demo-admin", username: "demo", role: "admin", active: 1 });

export async function handleAuthRequest(request, env) {
  const url = new URL(request.url);
  if (!env.DB) {
    if (url.pathname.startsWith("/api/") || ["/setup", "/signup", "/login", "/auth-settings"].includes(url.pathname)) {
      return json({ message: "DB 연결을 확인해 주세요." }, 503);
    }
    return null;
  }

  if (request.method === "POST" && url.pathname === "/_joripspace/cron/demo-reset") {
    return json(await resetDemoDataAtMidnight(env.DB));
  }

  await ensureDemoState(env.DB);

  const demoCookie = parseCookies(request.headers.get("cookie") || "")[COOKIE_NAME];
  const protectedPage = ["/monitors", "/logs", "/incidents", "/status-page", "/users"].includes(url.pathname) || /^\/monitors\/[^/]+$/.test(url.pathname);
  if (request.method === "GET" && url.pathname === "/") return demoRedirect(url, "/monitors");
  if (request.method === "GET" && protectedPage && demoCookie !== DEMO_SESSION_TOKEN) return demoRedirect(url, url.pathname + url.search);

  if (request.method === "GET" && ["/setup", "/login", "/signup", "/auth-settings"].includes(url.pathname)) {
    return demoRedirect(url, "/monitors");
  }

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    return json({ installed: true, public_signup_enabled: false, user: DEMO_ADMIN, demo_mode: true }, 200, { "set-cookie": cookie(DEMO_SESSION_TOKEN, 31536000) });
  }

  if (["/api/setup", "/api/signup", "/api/login", "/api/admin/login"].includes(url.pathname) && request.method === "POST") {
    return json({ ok: true, user: DEMO_ADMIN, demo_mode: true }, 200, { "set-cookie": cookie(DEMO_SESSION_TOKEN, 31536000) });
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    return json({ ok: true, demo_mode: true }, 200, { "set-cookie": cookie(DEMO_SESSION_TOKEN, 31536000) });
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
      db.prepare("CREATE TABLE IF NOT EXISTS monitors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'http', url TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET', config_json TEXT NOT NULL DEFAULT '{}', timeout_ms INTEGER NOT NULL DEFAULT 30000, accepted_statuses TEXT NOT NULL DEFAULT '2xx,3xx', slow_threshold_ms INTEGER NOT NULL DEFAULT 3000, status TEXT NOT NULL DEFAULT 'checking', enabled INTEGER NOT NULL DEFAULT 1, public_visible INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, consecutive_failures INTEGER NOT NULL DEFAULT 0, last_checked_at INTEGER, last_response_ms INTEGER, last_status_code INTEGER, last_error_code TEXT, last_error_message TEXT, status_changed_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS monitor_runs (run_key TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, scheduled_at INTEGER NOT NULL, success INTEGER NOT NULL, error_code TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'scheduled', response_ms INTEGER, status_code INTEGER, error_message TEXT, FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_runs_created ON monitor_runs(created_at DESC)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_runs_monitor ON monitor_runs(monitor_id,created_at DESC)"),
      db.prepare("CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', root_cause TEXT, last_error TEXT, started_at INTEGER NOT NULL, resolved_at INTEGER, duration_seconds INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents(monitor_id,started_at DESC)"),
      db.prepare("CREATE TABLE IF NOT EXISTS monitor_hourly (monitor_id TEXT NOT NULL, bucket_at INTEGER NOT NULL, check_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, failure_count INTEGER NOT NULL DEFAULT 0, response_total_ms INTEGER NOT NULL DEFAULT 0, response_min_ms INTEGER NOT NULL DEFAULT 0, response_max_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (monitor_id,bucket_at), FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE)"),
      db.prepare("CREATE TABLE IF NOT EXISTS scheduler_runs (scheduled_minute INTEGER PRIMARY KEY, status TEXT NOT NULL, cursor_id TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0, queued_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER)"),
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

export async function ensureDemoState(db, timestamp = Date.now()) {
  await ensureAuthSchema(db);
  const dateKey = seoulClock(timestamp).dateKey;
  const cached = demoReady.get(db);
  if (cached?.dateKey === dateKey) return cached.pending;
  const pending = (async () => {
    const row = await db.prepare("SELECT value FROM app_settings WHERE key='demo_seed_date'").first();
    if (row?.value !== dateKey) await resetDemoData(db, timestamp);
    return { ok: true, dateKey };
  })().catch(error => {
    demoReady.delete(db);
    throw error;
  });
  demoReady.set(db, { dateKey, pending });
  return pending;
}

export async function resetDemoData(db, timestamp = Date.now()) {
  await ensureAuthSchema(db);
  const now = Number(timestamp);
  const { dateKey } = seoulClock(now);
  const demoTokenHash = await sha256(DEMO_SESSION_TOKEN);
  const monitors = [
    { id: "demo-home", name: "공식 웹사이트", type: "http", url: "https://example.com/", method: "HEAD", status: "up", enabled: 1, response: 184, code: 200, changed: now - 7 * 86400000 },
    { id: "demo-api", name: "사용자 API", type: "api", url: "https://example.com/api/health", method: "GET", status: "up", enabled: 1, response: 92, code: 200, changed: now - 14 * 86400000 },
    { id: "demo-alert", name: "알림 전송 API", type: "http", url: "https://httpstat.us/503", method: "GET", status: "down", enabled: 1, response: 1240, code: 503, changed: now - 22 * 60000 },
    { id: "demo-batch", name: "야간 배치 작업", type: "http", url: "https://example.com/batch", method: "GET", status: "paused", enabled: 0, response: null, code: null, changed: now - 2 * 86400000 }
  ];
  const statements = [
    db.prepare("DELETE FROM monitor_hourly"),
    db.prepare("DELETE FROM monitor_runs"),
    db.prepare("DELETE FROM incidents"),
    db.prepare("DELETE FROM scheduler_runs"),
    db.prepare("DELETE FROM monitors"),
    db.prepare("DELETE FROM admin_sessions"),
    db.prepare("DELETE FROM admin_login_attempts"),
    db.prepare("DELETE FROM admin_users"),
    db.prepare("DELETE FROM app_settings"),
    db.prepare("INSERT INTO admin_users(id,username,password_hash,password_salt,password_iterations,role,active,last_login_at,created_at,updated_at) VALUES('demo-admin','demo',?,'demo-login-disabled',100000,'admin',1,?,?,?)").bind("0".repeat(64), now, now, now),
    db.prepare("INSERT INTO admin_users(id,username,password_hash,password_salt,password_iterations,role,active,created_at,updated_at) VALUES('demo-viewer','sample_viewer',?,'demo-login-disabled',100000,'viewer',1,?,?)").bind("0".repeat(64), now - 86400000, now - 86400000),
    db.prepare("INSERT INTO admin_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,'demo-admin',?,?)").bind(demoTokenHash, now + 366 * 86400000, now),
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('public_signup_enabled','0',?)").bind(now),
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('public_signup_role','viewer',?)").bind(now),
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('demo_seed_date',?,?)").bind(dateKey, now)
  ];
  for (const monitor of monitors) {
    const config = monitor.type === "api" ? JSON.stringify({ keyword: "", jsonPath: "status", expectedValue: "ok", requestBody: "", headers: {} }) : JSON.stringify({ keyword: "", jsonPath: "", expectedValue: "", requestBody: "", headers: {} });
    statements.push(db.prepare("INSERT INTO monitors(id,project_id,name,type,url,method,config_json,timeout_ms,accepted_statuses,slow_threshold_ms,status,enabled,public_visible,version,consecutive_failures,last_checked_at,last_response_ms,last_status_code,last_error_code,last_error_message,status_changed_at,created_at,updated_at) VALUES(?,'default',?,?,?,?,?,10000,'2xx,3xx',1500,?,?,1,1,?,?,?,?,?,?,?, ?,?)")
      .bind(monitor.id, monitor.name, monitor.type, monitor.url, monitor.method, config, monitor.status, monitor.enabled, monitor.status === "down" ? 2 : 0, monitor.enabled ? now - 60000 : null, monitor.response, monitor.code, monitor.status === "down" ? "HTTP_STATUS" : null, monitor.status === "down" ? "HTTP status 503" : null, monitor.changed, now - 21 * 86400000, now));
  }
  const runSamples = [
    ["demo-home", true, 184, 200, null, null, now - 60000],
    ["demo-api", true, 92, 200, null, null, now - 70000],
    ["demo-alert", false, 1240, 503, "HTTP_STATUS", "HTTP status 503", now - 80000],
    ["demo-home", true, 201, 200, null, null, now - 3600000],
    ["demo-api", true, 108, 200, null, null, now - 3610000],
    ["demo-alert", true, 320, 200, null, null, now - 7200000]
  ];
  runSamples.forEach((sample, index) => statements.push(db.prepare("INSERT INTO monitor_runs(run_key,monitor_id,scheduled_at,success,error_code,created_at,source,response_ms,status_code,error_message) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(`demo-run-${index}`, sample[0], sample[6], sample[1] ? 1 : 0, sample[4], sample[6], "scheduled", sample[2], sample[3], sample[5])));
  statements.push(
    db.prepare("INSERT INTO incidents(id,monitor_id,status,root_cause,last_error,started_at,created_at,updated_at) VALUES('demo-incident-open','demo-alert','open','HTTP_STATUS','HTTP status 503',?,?,?)").bind(now - 22 * 60000, now - 22 * 60000, now - 60000),
    db.prepare("INSERT INTO incidents(id,monitor_id,status,root_cause,last_error,started_at,resolved_at,duration_seconds,created_at,updated_at) VALUES('demo-incident-resolved-1','demo-home','resolved','TIMEOUT','응답 시간이 기준을 초과했습니다.',?,?,420,?,?)").bind(now - 3 * 86400000, now - 3 * 86400000 + 420000, now - 3 * 86400000, now - 3 * 86400000 + 420000),
    db.prepare("INSERT INTO incidents(id,monitor_id,status,root_cause,last_error,started_at,resolved_at,duration_seconds,created_at,updated_at) VALUES('demo-incident-resolved-2','demo-api','resolved','CONNECTION_ERROR','일시적인 연결 오류가 발생했습니다.',?,?,780,?,?)").bind(now - 8 * 86400000, now - 8 * 86400000 + 780000, now - 8 * 86400000, now - 8 * 86400000 + 780000)
  );
  for (const monitor of monitors.slice(0, 3)) {
    for (let hour = 12; hour >= 1; hour--) {
      const bucket = Math.floor((now - hour * 3600000) / 3600000) * 3600000;
      const failed = monitor.id === "demo-alert" && hour <= 1 ? 4 : 0;
      const checks = 12;
      const average = monitor.id === "demo-home" ? 170 + (hour % 4) * 12 : monitor.id === "demo-api" ? 88 + (hour % 5) * 9 : 280 + (hour % 3) * 30;
      statements.push(db.prepare("INSERT INTO monitor_hourly(monitor_id,bucket_at,check_count,success_count,failure_count,response_total_ms,response_min_ms,response_max_ms) VALUES(?,?,?,?,?,?,?,?)")
        .bind(monitor.id, bucket, checks, checks - failed, failed, average * checks, Math.max(20, average - 35), average + 90));
    }
  }
  statements.push(db.prepare("INSERT INTO scheduler_runs(scheduled_minute,status,cursor_id,lease_until,queued_count,created_at,updated_at,completed_at) VALUES(?,'completed','',0,3,?,?,?)")
    .bind(Math.floor((now - 60000) / 60000) * 60000, now - 65000, now - 60000, now - 60000));
  await db.batch(statements);
  demoReady.set(db, { dateKey, pending: Promise.resolve({ ok: true, dateKey }) });
  return { ok: true, reset: true, dateKey, monitors: monitors.length };
}

export async function resetDemoDataAtMidnight(db, timestamp = Date.now()) {
  const clock = seoulClock(timestamp);
  if (clock.hour !== 0 || clock.minute > 10) return { ok: true, reset: false, skipped: "outside_midnight_window", dateKey: clock.dateKey };
  return resetDemoData(db, timestamp);
}

function seoulClock(timestamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(timestamp)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
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
  return DEMO_ADMIN;
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
  // Lax allows the demo session cookie to survive a top-level navigation from
  // an external template/gallery link while still excluding cross-site POSTs.
  return COOKIE_NAME + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
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

function demoRedirect(url, path) {
  return new Response(null, { status: 302, headers: { location: new URL(path, url.origin).toString(), "cache-control": "private, no-store", "set-cookie": cookie(DEMO_SESSION_TOKEN, 31536000) } });
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
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font:14px/1.55 SUIT,system-ui,-apple-system,sans-serif}
.auth-page{min-height:100vh;display:grid;place-items:center;padding:22px}.auth-card{width:min(420px,100%);padding:30px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:0 18px 55px rgba(30,30,28,.07)}
.brand{display:flex;align-items:center;gap:9px;font-weight:800}.brand-dot{width:10px;height:10px;border-radius:50%;background:#3a7d5a}.eyebrow{margin:22px 0 4px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.08em}.auth-card h1{margin:0 0 8px;font-size:27px;letter-spacing:-.03em}.auth-card p{margin:0 0 20px;color:var(--muted)}
.auth-card label{display:grid;gap:6px;margin:12px 0;color:#55534f;font-size:13px}.auth-card input[type=text],.auth-card input[type=password]{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:7px;font:inherit}.auth-card input:focus{outline:2px solid #dceae2;border-color:#85a995}
.button,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--text);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{width:100%;margin-top:7px;background:var(--text);border-color:var(--text);color:#fff}
.actions{display:flex;gap:9px;align-items:center;margin-top:16px}.actions>*{flex:1}.note{padding:12px;border-radius:7px;background:#f0f5f2;color:#365a47}.error{min-height:21px;margin-top:12px;color:var(--danger)}.switch{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:10px!important}.switch input{width:18px;height:18px}.meta{font-size:12px;color:var(--muted)}
.setup-shell{min-height:100vh;display:grid;grid-template-columns:580px 500px;justify-content:center;background:linear-gradient(90deg,#f5f6f8 0,#f5f6f8 calc(50% + 40px),#fff calc(50% + 40px))}
.setup-intro{display:flex;min-height:100vh;flex-direction:column;padding:56px 40px}.setup-brand{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:800;letter-spacing:-.02em}.setup-logo{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:#2d2d2a;color:#fff}.setup-logo svg{width:20px;height:20px}
.setup-copy{width:500px;margin:auto 0}.setup-kicker{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:#e7f0ff;color:#1769d2;font-size:12px;font-weight:800}.setup-copy h1{margin:22px 0 18px;font-size:62px;font-weight:700;line-height:1.08;letter-spacing:-.058em}.setup-copy>p{max-width:500px;margin:0;color:#77766f;font-size:15px;line-height:1.75}
.setup-benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}.setup-benefits li{display:flex;align-items:center;gap:10px}.setup-benefits li>span{display:grid;width:30px;height:30px;flex:none;place-items:center;border-radius:10px;background:#fff;color:#2878db;font-size:12px;font-weight:900}.setup-benefits strong,.setup-benefits small{display:block}.setup-benefits strong{font-size:12px}.setup-benefits small{margin-top:3px;color:#8a8f98;font-size:10px}
.setup-panel{display:grid;min-height:100vh;align-items:center;padding:44px 40px}.setup-form{display:grid;width:420px}.setup-progress{display:flex;align-items:center;gap:8px;margin-bottom:36px}.setup-progress span{height:4px;border-radius:99px;background:#e5e7eb}.setup-progress span:first-child{width:54px;background:#3b82f6}.setup-progress span:not(:first-child){width:26px}.setup-step-label{margin-left:auto;color:#8a99ab;font-size:11px;font-weight:800;letter-spacing:.08em}.setup-form .eyebrow{margin:0 0 10px;color:#8b8a84;font-size:11px;font-weight:700;letter-spacing:.15em}.setup-form h2{margin:0;font-size:30px;line-height:1.2;letter-spacing:-.045em}.setup-lead{margin:8px 0 18px;color:#8a8983;font-size:13px;line-height:1.7}.field{display:grid;gap:8px;margin:12px 0;color:#363a42;font-size:13px;font-weight:750}.field input{width:100%;height:52px;padding:0 15px;border:1px solid #dedede;border-radius:12px;background:#fff;color:#44484f;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}.field input::placeholder{color:#8e9299}.field input:focus{border-color:#3182f6;box-shadow:0 0 0 4px rgba(49,130,246,.11)}
.setup-switch{display:flex;align-items:center;gap:13px;margin:22px 0!important;padding:14px;border:1px solid #e0e6ed;border-radius:13px;background:#fff;color:#334155!important;cursor:pointer}.setup-switch input{position:absolute;opacity:0;pointer-events:none}.toggle{position:relative;width:40px;height:23px;flex:none;border-radius:99px;background:#cbd5e1;transition:.2s}.toggle:after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.25);transition:.2s}.setup-switch input:checked+.toggle{background:var(--accent)}.setup-switch input:checked+.toggle:after{transform:translateX(17px)}.setup-switch strong,.setup-switch small{display:block}.setup-switch strong{font-size:12px}.setup-switch small{margin-top:2px;color:#8492a3;font-size:10px;font-weight:500}
.setup-submit{width:100%;min-height:54px;justify-content:space-between;margin-top:5px;padding:0 18px;border:0;border-radius:12px;background:#343b4a;color:#fff;box-shadow:none;transition:background .15s,transform .15s}.setup-submit:hover{background:#252c39;transform:translateY(-1px)}.setup-submit:disabled{opacity:.65;cursor:wait;transform:none}.setup-error{min-height:22px;margin:11px 0 0;color:var(--danger);font-size:12px}.setup-security{display:flex;align-items:center;justify-content:center;gap:7px;margin:16px 0 0;color:#8a99ab;font-size:10px}.setup-security svg{width:13px;height:13px;stroke:#6b7c90;fill:none;stroke-width:2}
@media(max-width:1080px){.setup-shell{grid-template-columns:minmax(0,580px) minmax(440px,500px)}.setup-copy{width:100%}.setup-intro{padding-inline:32px}.setup-panel{padding-inline:30px}.setup-form{width:100%}}
@media(max-width:820px){.setup-shell{grid-template-columns:1fr;background:#fff}.setup-intro{min-height:auto;padding:30px 24px 36px;background:#f5f6f8}.setup-copy{margin:48px 0 28px}.setup-copy h1{font-size:43px}.setup-benefits{display:none}.setup-panel{min-height:auto;padding:48px 24px 64px}.setup-form{max-width:420px;margin:0 auto}}
@media(max-width:520px){.setup-intro{padding:24px 20px 30px}.setup-copy{margin:38px 0 8px}.setup-copy h1{margin:20px 0 16px;font-size:35px}.setup-copy>p{font-size:14px}.setup-panel{padding:36px 20px 54px}.setup-form h2{font-size:28px}}
@media(max-width:520px){.auth-card{padding:23px}.auth-card h1{font-size:24px}.actions{align-items:stretch;flex-direction:column}}
`;

function documentShell(title, content) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · UptimeJorip</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT.css"><style>${AUTH_CSS}</style></head><body>${content}</body></html>`;
}

function setupPage() {
  return documentShell("최초 관리자 설정", `<main class="setup-shell"><section class="setup-intro" aria-labelledby="setupTitle"><header class="setup-brand"><span class="setup-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h4l2-7 4 13 3-9 2 3h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>UptimeJorip</strong></header><div class="setup-copy"><span class="setup-kicker">처음 한 번만 설정해요</span><h1 id="setupTitle">당신의 모니터링을<br>시작해 볼까요?</h1><p>첫 관리자는 모든 모니터와 사용자를 관리하는 최고 관리자가 됩니다. 설치 후에는 서비스 상태를 등록하고 팀과 함께 운영할 수 있어요.</p></div><ul class="setup-benefits" aria-label="설치 후 제공 기능"><li><span>1</span><div><strong>한눈에 상태 확인</strong><small>가동률과 응답 시간 추적</small></div></li><li><span>2</span><div><strong>빠른 장애 감지</strong><small>이상 징후와 장애 기록</small></div></li><li><span>3</span><div><strong>팀과 함께 운영</strong><small>멤버, 권한, 공개 상태 페이지</small></div></li></ul></section><section class="setup-panel"><form id="setupForm" class="setup-form"><div class="setup-progress" aria-label="설치 1단계"><span></span><span></span><span></span><b class="setup-step-label">01 / 03</b></div><div class="eyebrow">ADMIN SETUP</div><h2>관리자 계정 만들기</h2><p class="setup-lead">이 계정은 UptimeJorip의 최고 관리자입니다.</p><label class="field">관리자 아이디<input name="username" type="text" autocomplete="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" placeholder="영문, 숫자, 점, 밑줄 3자 이상" required></label><label class="field">비밀번호<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="8자 이상" required></label><label class="field">비밀번호 확인<input name="password_confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label class="setup-switch"><input name="public_signup_enabled" type="checkbox"><span class="toggle" aria-hidden="true"></span><span><strong>공개 회원가입 허용</strong><small>새 가입자는 관찰자 권한으로 시작합니다.</small></span></label><button class="setup-submit primary" type="submit"><span>UptimeJorip 시작하기</span><span aria-hidden="true">→</span></button><div id="error" class="setup-error" role="alert"></div><p class="setup-security"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>비밀번호는 복구할 수 없도록 안전하게 암호화해 저장합니다.</p></form></section></main><script>${formScript("setupForm", "/api/setup", true)}</script>`);
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
