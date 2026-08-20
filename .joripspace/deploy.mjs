#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const ENTRYPOINT_CANDIDATES = ['worker.js', 'src/worker.js', 'src/index.js', 'server.js', 'dist/worker.js'];
const IGNORED_DIRS = new Set(['.git', '.wrangler', 'node_modules', '.cache', 'coverage']);
const IGNORED_FILES = new Set(['.env', '.env.local', '.env.joripspace', '.joripspace/agent-session.json']);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readEnv(filePath) {
  const values = {};
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  } catch {}
  return values;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function shouldIgnore(relativePath) {
  const normalized = toPosix(relativePath);
  if (IGNORED_FILES.has(normalized)) return true;
  if (normalized.startsWith('.joripspace/')) return true;
  if (normalized.startsWith('tests/') || normalized.startsWith('test/') || normalized.startsWith('docs/')) return true;
  const parts = normalized.split('/');
  return parts.some((part) => IGNORED_DIRS.has(part));
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(ROOT, fullPath);
    if (shouldIgnore(relative)) continue;
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function detectEntrypoint() {
  const explicit = argValue('--entrypoint');
  if (explicit) return toPosix(explicit);
  return ENTRYPOINT_CANDIDATES.find((candidate) => fs.existsSync(path.join(ROOT, candidate))) || '';
}

function loadConnection() {
  const env = readEnv(path.join(ROOT, '.env.joripspace'));
  const project = readJson(path.join(ROOT, '.joripspace', 'project.json')) || {};
  return {
    project,
    projectId: process.env.JORIPSPACE_PROJECT_ID || env.JORIPSPACE_PROJECT_ID || project.project_id || project.project_slug || '',
    apiBaseUrl: (process.env.JORIPSPACE_API_BASE_URL || env.JORIPSPACE_API_BASE_URL || project.api_base_url || 'https://api.joripspace.com').replace(/\/+$/, ''),
    apiToken: process.env.JORIPSPACE_API_TOKEN || env.JORIPSPACE_API_TOKEN || ''
  };
}

function hasModuleWorkerDefaultExport(source) {
  const text = String(source || '');
  return /\bexport\s+default\b/.test(text) ||
    /\bexport\s*\{[^}]*\bas\s+default\b[^}]*\}/s.test(text) ||
    /\bexport\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s*['"]/s.test(text);
}

function buildPayload(entrypoint) {
  if (!entrypoint) {
    throw new Error('배포할 서버 진입 파일을 찾지 못했습니다. worker.js 또는 src/index.js처럼 기본 내보내기가 있는 파일을 만들어 주세요.');
  }
  const entrypointPath = path.join(ROOT, entrypoint);
  if (!fs.existsSync(entrypointPath)) {
    throw new Error('지정한 entrypoint 파일이 없습니다: ' + entrypoint);
  }

  const files = {};
  for (const filePath of walkFiles(ROOT)) {
    const relative = toPosix(path.relative(ROOT, filePath));
    files[relative] = fs.readFileSync(filePath, 'utf8');
  }

  if (!Object.prototype.hasOwnProperty.call(files, entrypoint)) {
    files[entrypoint] = fs.readFileSync(entrypointPath, 'utf8');
  }
  if (!hasModuleWorkerDefaultExport(files[entrypoint])) {
    throw new Error('서버 진입 파일 형식이 올바르지 않습니다. 유효한 ES 모듈 기본 내보내기가 필요합니다: ' + entrypoint);
  }
  return { entrypoint, files };
}

function friendlyError(body, fallback) {
  const error = body && body.error ? body.error : {};
  const code = error.code || body?.code || '';
  const message = error.message || body?.message || fallback;
  if (code === 'project_resources_invalid' || code === 'project_db_binding_invalid') {
    return formatDeploymentFailure('JoripSpace 프로젝트 서버/DB 연결 설정을 복구해야 합니다. 사용자 코드 문제가 아니므로 관리자 복구 후 다시 배포해 주세요. (' + code + ')', error.details);
  }
  return formatDeploymentFailure(message, error.details);
}

function formatDeploymentFailure(message, details) {
  if (!details || typeof details !== 'object' || !details.deployment_id) return message;
  const lines = [message, '배포 ID: ' + details.deployment_id];
  if (details.error_stage) lines.push('실패 단계: ' + details.error_stage);
  if (details.error_code) lines.push('오류 코드: ' + details.error_code);
  if (details.error_details && details.error_details !== message) lines.push('상세 오류: ' + details.error_details);
  return lines.join('\n');
}

async function main() {
  const { project, projectId, apiBaseUrl, apiToken } = loadConnection();
  if (!projectId) throw new Error('JoripSpace 프로젝트 ID를 찾지 못했습니다. MCP 연결 또는 joripspace link를 다시 실행하세요.');
  if (!apiToken) throw new Error('JoripSpace 배포 토큰을 찾지 못했습니다. JoripSpace 연결을 다시 승인해 주세요.');
  if (project.deployment_policy?.target !== 'joripspace' || project.deployment_policy?.guide_required !== true) {
    throw new Error('최신 JoripSpace 제작·배포 정책이 필요합니다. 사용자에게 호스팅 방식을 묻지 말고 prepare_project_workspace로 연결 파일을 갱신한 뒤 다시 배포하세요.');
  }

  const entrypoint = detectEntrypoint();
  const payload = buildPayload(entrypoint);
  const label = argValue('--label').trim();
  if (!label) throw new Error('--label에 배포한 내용을 입력해 주세요.');
  if (label.length > 120) throw new Error('배포 이름은 120자 이하여야 합니다.');
  const response = await fetch(apiBaseUrl + '/v1/projects/' + encodeURIComponent(projectId) + '/deploy', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiToken,
      'content-type': 'application/json',
      'x-joripspace-session-context': 'package-helper'
    },
    body: JSON.stringify({ ...payload, label })
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    throw new Error(friendlyError(body, '배포에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
  }
  console.log('JoripSpace 배포가 완료되었습니다.');
  console.log('프로젝트: ' + projectId);
  if (body.default_url) console.log('URL: ' + body.default_url);
  if (body.deployment_id) console.log('Deployment: ' + body.deployment_id);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
