#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PROTECTED_PREFIXES = ['.git/', '.joripspace/', 'node_modules/'];
const PROTECTED_FILES = new Set(['.env', '.env.local', '.env.joripspace', 'claude.md', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

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

function safeRelativePath(fileName) {
  const normalized = toPosix(String(fileName || '')).replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('배포본에 안전하지 않은 파일 경로가 있습니다: ' + fileName);
  }
  return normalized;
}

function protectedRestorePath(fileName) {
  const normalized = toPosix(String(fileName || '')).replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  const base = lower.split('/').at(-1) || '';
  return PROTECTED_FILES.has(lower) ||
    PROTECTED_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
    base === 'agent-session.json' ||
    base === 'connect-token.json' ||
    base === 'tokens.json';
}

function loadConnection() {
  const env = readEnv(path.join(ROOT, '.env.joripspace'));
  const project = readJson(path.join(ROOT, '.joripspace', 'project.json')) || {};
  return {
    projectId: process.env.JORIPSPACE_PROJECT_ID || env.JORIPSPACE_PROJECT_ID || project.project_id || project.project_slug || '',
    apiBaseUrl: (process.env.JORIPSPACE_API_BASE_URL || env.JORIPSPACE_API_BASE_URL || project.api_base_url || 'https://api.joripspace.com').replace(/\/+$/, ''),
    apiToken: process.env.JORIPSPACE_API_TOKEN || env.JORIPSPACE_API_TOKEN || ''
  };
}

async function fetchSource(connection, deploymentId) {
  const target = deploymentId || 'latest';
  const response = await fetch(connection.apiBaseUrl + '/v1/projects/' + encodeURIComponent(connection.projectId) + '/deployments/' + encodeURIComponent(target) + '/source', {
    method: 'GET',
    headers: {
      authorization: 'Bearer ' + connection.apiToken,
      'x-joripspace-session-context': 'package-helper'
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || '최신 배포본을 가져오지 못했습니다.';
    throw new Error(message);
  }
  return body;
}

function writeFiles(source, force) {
  const files = source.files && typeof source.files === 'object' && !Array.isArray(source.files) ? source.files : null;
  if (!files) throw new Error('배포본 파일 목록이 올바르지 않습니다.');

  const protectedFiles = Object.keys(files).filter(protectedRestorePath);
  const planned = Object.entries(files)
    .filter(([name]) => !protectedRestorePath(name))
    .map(([name, content]) => [safeRelativePath(name), String(content)]);
  const conflicts = planned.filter(([relative, content]) => {
    const fullPath = path.join(ROOT, relative);
    return fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8') !== content;
  });

  if (conflicts.length > 0 && !force) {
    console.log('로컬 파일과 최신 배포본이 충돌합니다. 아무 파일도 바꾸지 않았습니다.');
    for (const [relative] of conflicts) console.log('- ' + relative);
    console.log('교체하려면 사용자 승인 후 npm run joripspace:pull:force 를 실행하세요.');
    process.exitCode = 1;
    return;
  }

  const backupRoot = path.join(ROOT, '.joripspace', 'local-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  if (conflicts.length > 0) fs.mkdirSync(backupRoot, { recursive: true });

  for (const [relative, content] of planned) {
    const fullPath = path.join(ROOT, relative);
    if (fs.existsSync(fullPath) && force) {
      const backupPath = path.join(backupRoot, relative);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(fullPath, backupPath);
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  console.log('최신 배포본을 로컬 파일로 가져왔습니다.');
  console.log('프로젝트: ' + source.project_id);
  console.log('배포 버전: ' + source.version);
  console.log('파일 수: ' + planned.length);
  if (protectedFiles.length > 0) {
    console.log('연결 토큰과 온보딩 설정을 보호하기 위해 제외한 파일: ' + protectedFiles.length);
  }
  if (conflicts.length > 0) console.log('교체 전 파일 백업: ' + path.relative(ROOT, backupRoot));
}

async function main() {
  const force = process.argv.includes('--force');
  const deploymentId = argValue('--deployment') || argValue('--deployment-id') || '';
  const connection = loadConnection();
  if (!connection.projectId) throw new Error('JoripSpace 프로젝트 ID를 찾지 못했습니다. MCP 연결 또는 joripspace link를 다시 실행하세요.');
  if (!connection.apiToken) throw new Error('JoripSpace 토큰을 찾지 못했습니다. JoripSpace 연결을 다시 승인해 주세요.');
  const source = await fetchSource(connection, deploymentId);
  writeFiles(source, force);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
