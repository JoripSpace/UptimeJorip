import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { strToU8, unzipSync, zipSync } from 'fflate';

const ROOT = process.cwd();
const HARD_DIRS = new Set(['.git', 'node_modules', '.wrangler', '.cache', 'coverage', 'tmp', 'temp']);
const HARD_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const TEXT_ENCODER = new TextEncoder();

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function readEnv(filePath) {
  const values = {};
  try {
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith('#')) continue;
      const index = value.indexOf('=');
      if (index > 0) values[value.slice(0, index)] = value.slice(index + 1);
    }
  } catch {}
  return values;
}

function connection() {
  const env = readEnv(path.join(ROOT, '.env.joripspace'));
  const project = readJson(path.join(ROOT, '.joripspace', 'project.json')) || {};
  const result = {
    projectId: process.env.JORIPSPACE_PROJECT_ID || env.JORIPSPACE_PROJECT_ID || project.project_id || project.project_slug || '',
    apiBaseUrl: (process.env.JORIPSPACE_API_BASE_URL || env.JORIPSPACE_API_BASE_URL || project.api_base_url || 'https://api.joripspace.com').replace(/\/+$/, ''),
    apiToken: process.env.JORIPSPACE_API_TOKEN || env.JORIPSPACE_API_TOKEN || ''
  };
  if (!result.projectId || !result.apiToken) throw new Error('JoripSpace 프로젝트 연결 정보가 없습니다. 연결을 다시 승인해 주세요.');
  return result;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

function posix(value) { return value.split(path.sep).join('/'); }

function hardExcluded(relative) {
  const normalized = posix(relative).replace(/^\.\//, '');
  const lower = normalized.toLowerCase();
  const parts = lower.split('/');
  const base = parts.at(-1) || '';
  return HARD_FILES.has(lower) || parts.some((part) => HARD_DIRS.has(part)) ||
    base === '.env' || (base.startsWith('.env.') && base !== '.env.example') ||
    /\.(pem|key|log|tmp|temp)$/i.test(base) || /^(id_rsa|id_ed25519|credentials|token|session)(\.|$)/i.test(base);
}

function ignoreRules() {
  const rules = [];
  for (const name of ['.gitignore', '.ignore', '.joripspaceignore']) {
    try {
      for (const line of fs.readFileSync(path.join(ROOT, name), 'utf8').split(/\r?\n/)) {
        const value = line.trim();
        if (value && !value.startsWith('#')) rules.push(value);
      }
    } catch {}
  }
  return rules;
}

function globRegex(pattern) {
  const clean = pattern.replace(/^!/, '').replace(/^\//, '').replace(/\/$/, '/**');
  const escaped = clean.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*').replace(/\?/g, '.');
  return new RegExp('^(?:' + escaped + ')(?:/.*)?$');
}

function ignored(relative, rules) {
  if (hardExcluded(relative)) return true;
  const normalized = posix(relative);
  let result = false;
  for (const rule of rules) {
    if (globRegex(rule).test(normalized)) result = !rule.startsWith('!');
  }
  return result;
}

function projectFiles() {
  const rules = ignoreRules();
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = posix(path.relative(ROOT, full));
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('심볼릭 링크는 저장본에 포함할 수 없습니다: ' + relative);
      if (hardExcluded(relative)) continue;
      const excluded = ignored(relative, rules);
      if (entry.isDirectory()) {
        if (!excluded || negatedRuleCanInclude(relative, rules)) walk(full);
      } else if (entry.isFile() && !excluded) {
        files.push([relative, new Uint8Array(fs.readFileSync(full))]);
      }
    }
  }
  walk(ROOT);
  return files;
}

function negatedRuleCanInclude(directory, rules) {
  const prefix = posix(directory).replace(/\/$/, '') + '/';
  return rules.some((rule) => {
    if (!rule.startsWith('!')) return false;
    const target = rule.slice(1).replace(/^\//, '').replace(/\*.*$/, '');
    return target.startsWith(prefix) || prefix.startsWith(target.replace(/\/$/, '') + '/');
  });
}

async function apiFetch(connection, route, options = {}) {
  const response = await fetch(connection.apiBaseUrl + route, {
    method: options.method || 'GET',
    headers: {
      authorization: 'Bearer ' + connection.apiToken,
      'x-joripspace-session-context': 'package-helper',
      ...(options.json === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {})
    },
    body: options.bytes || (options.json === undefined ? undefined : JSON.stringify(options.json))
  });
  if (options.raw) {
    if (!response.ok) throw new Error('저장본 파일을 받지 못했습니다. (' + response.status + ')');
    return response;
  }
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || 'JoripSpace 요청에 실패했습니다. (' + response.status + ')';
    const details = body?.error?.details;
    if (!details || typeof details !== 'object' || !details.deployment_id) throw new Error(message);
    const lines = [message, '배포 ID: ' + details.deployment_id];
    if (details.error_stage) lines.push('실패 단계: ' + details.error_stage);
    if (details.error_code) lines.push('오류 코드: ' + details.error_code);
    if (details.error_details && details.error_details !== message) lines.push('상세 오류: ' + details.error_details);
    throw new Error(lines.join('\n'));
  }
  return body;
}

async function waitReady(connection, checkpointId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await apiFetch(connection, '/v1/projects/' + encodeURIComponent(connection.projectId) + '/checkpoints/' + encodeURIComponent(checkpointId));
    if (result.status === 'ready') return result;
    if (result.status === 'failed' || result.status === 'deleted') throw new Error(result.error_message || '저장본 처리에 실패했습니다.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('저장본 처리 시간이 길어지고 있습니다. 저장본 목록에서 상태를 확인해 주세요.');
}

export async function saveCheckpoint(label = '', deploy = false, sourceType = 'agent') {
  const target = connection();
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) throw new Error('--label에 저장하거나 배포한 내용을 입력해 주세요.');
  if (normalizedLabel.length > 120) throw new Error('저장본 이름은 120자 이하여야 합니다.');
  const files = projectFiles();
  if (!files.length) throw new Error('저장할 프로젝트 파일이 없습니다.');
  const archive = zipSync(Object.fromEntries(files.map(([name, bytes]) => [name, [bytes, { level: 6 }]])), { level: 6 });
  const session = await apiFetch(target, '/v1/projects/' + encodeURIComponent(target.projectId) + '/checkpoint-uploads', {
    method: 'POST',
    json: { label: normalizedLabel, source_type: sourceType, idempotency_key: crypto.randomUUID() }
  });
  const chunkSize = Number(session.chunk_size || 6 * 1024 * 1024);
  let part = 1;
  for (let offset = 0; offset < archive.byteLength; offset += chunkSize) {
    const route = String(session.upload_part_url_template).replace('{part_number}', String(part));
    await apiFetch(target, route, { method: 'PUT', bytes: archive.subarray(offset, Math.min(offset + chunkSize, archive.byteLength)) });
    part += 1;
  }
  await apiFetch(target, session.complete_url, { method: 'POST', json: {} });
  const ready = await waitReady(target, session.checkpoint_id);
  console.log('저장본 #' + ready.sequence + '을 만들었습니다. 파일 ' + ready.file_count + '개');
  if (deploy) {
    if (!ready.deployable) throw new Error('이 저장본은 백업 전용이라 서버에 배포할 수 없습니다.');
    const result = await apiFetch(target, '/v1/projects/' + encodeURIComponent(target.projectId) + '/checkpoints/' + encodeURIComponent(ready.checkpoint_id) + '/deploy', { method: 'POST', json: {} });
    console.log('같은 저장본으로 배포했습니다: ' + (result.url || target.projectId));
  }
  return ready;
}

async function listCheckpoints() {
  const target = connection();
  const result = await apiFetch(target, '/v1/projects/' + encodeURIComponent(target.projectId) + '/checkpoints?limit=100');
  for (const item of result.checkpoints || []) {
    console.log('#' + item.sequence + ' ' + (item.label || '(이름 없음)') + ' · ' + item.status + (item.deployable ? ' · 배포 가능' : ' · 백업 전용'));
  }
}

function safeRestorePath(name) {
  const normalized = posix(String(name || '')).replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '')) throw new Error('안전하지 않은 복원 경로입니다: ' + name);
  if (hardExcluded(normalized)) throw new Error('보호된 파일은 복원할 수 없습니다: ' + normalized);
  return normalized;
}

async function restoreCheckpoint() {
  const checkpointId = arg('--checkpoint') || arg('--checkpoint-id');
  if (!checkpointId) throw new Error('--checkpoint 저장본_ID가 필요합니다.');
  const target = connection();
  const base = '/v1/projects/' + encodeURIComponent(target.projectId) + '/checkpoints/' + encodeURIComponent(checkpointId);
  const plan = await apiFetch(target, base + '/restore-plan');
  const response = await apiFetch(target, base + '/download', { raw: true });
  const extracted = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const planned = Object.entries(extracted).map(([name, bytes]) => [safeRestorePath(name), bytes]);
  const plannedPaths = new Set(planned.map(([relative]) => relative));
  const additions = [];
  const overwrites = [];
  for (const [relative, bytes] of planned) {
    const full = path.join(ROOT, relative);
    if (!fs.existsSync(full)) additions.push(relative);
    else if (!Buffer.from(fs.readFileSync(full)).equals(Buffer.from(bytes))) overwrites.push(relative);
    const expected = (plan.files || []).find((file) => file.path === relative)?.content_hash;
    const actual = crypto.createHash('sha256').update(bytes).digest('base64url');
    if (expected && expected !== actual) throw new Error('파일 무결성 확인에 실패했습니다: ' + relative);
  }
  const deletions = projectFiles().map(([relative]) => relative).filter((relative) => !plannedPaths.has(relative));
  console.log('추가 ' + additions.length + '개, 덮어쓰기 ' + overwrites.length + '개, 삭제 ' + deletions.length + '개');
  for (const name of additions) console.log('+ ' + name);
  for (const name of overwrites) console.log('~ ' + name);
  for (const name of deletions) console.log('- ' + name);
  if (!process.argv.includes('--apply')) {
    console.log('미리보기만 했습니다. 승인 후 --apply를 붙여 다시 실행하세요.');
    return;
  }
  await saveCheckpoint('복원 전 안전 저장본', false, 'restore_safety');
  const backupRoot = path.join(ROOT, '.joripspace', 'local-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  for (const relative of [...overwrites, ...deletions]) {
    const source = path.join(ROOT, relative);
    const backup = path.join(backupRoot, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(source, backup);
  }
  for (const relative of deletions) fs.rmSync(path.join(ROOT, relative), { force: true });
  for (const [relative, bytes] of planned) {
    const full = path.join(ROOT, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
  }
  for (const [relative, bytes] of planned) {
    const restored = fs.readFileSync(path.join(ROOT, relative));
    if (!Buffer.from(restored).equals(Buffer.from(bytes))) throw new Error('복원 후 무결성 확인에 실패했습니다: ' + relative);
  }
  console.log('로컬 파일을 복원했습니다. 운영 서버는 변경하지 않았습니다.');
}

async function deployCheckpoint() {
  const checkpointId = arg('--checkpoint') || arg('--checkpoint-id');
  if (!checkpointId) throw new Error('--checkpoint 저장본_ID가 필요합니다.');
  const target = connection();
  const result = await apiFetch(target, '/v1/projects/' + encodeURIComponent(target.projectId) + '/checkpoints/' + encodeURIComponent(checkpointId) + '/deploy', { method: 'POST', json: {} });
  console.log('저장본을 배포했습니다: ' + (result.url || target.projectId));
}

export async function runCheckpointCommand(command) {
  if (command === 'save') return saveCheckpoint(arg('--label'), process.argv.includes('--deploy'));
  if (command === 'list') return listCheckpoints();
  if (command === 'restore') return restoreCheckpoint();
  if (command === 'deploy') return deployCheckpoint();
  throw new Error('알 수 없는 저장본 명령입니다.');
}
