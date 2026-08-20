#!/usr/bin/env node
  import crypto from 'node:crypto';
  import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REQUIRED_SCRIPTS = {
  'joripspace:doctor': 'node .joripspace/doctor.mjs',
  'joripspace:save': 'node .joripspace/save.mjs',
  'joripspace:checkpoints': 'node .joripspace/checkpoints.mjs',
  'joripspace:restore': 'node .joripspace/restore.mjs',
  'joripspace:deploy-checkpoint': 'node .joripspace/deploy-checkpoint.mjs',
  'joripspace:deploy': 'node .joripspace/save.mjs --deploy',
  'joripspace:pull': 'node .joripspace/pull.mjs',
  'joripspace:pull:force': 'node .joripspace/pull.mjs --force',
  'joripspace:install-template': 'node .joripspace/install-template.mjs',
  'joripspace:template-pull': 'node .joripspace/install-template.mjs --update'
};
const OPTIONAL_DEPLOY_SCRIPT = 'node .joripspace/save.mjs --deploy';
const ENTRYPOINT_CANDIDATES = ['worker.js', 'src/worker.js', 'src/index.js', 'server.js', 'dist/worker.js'];
const RECOMMENDED_STACK_ORDER = [
  '1. Keep the current stack for an existing project unless complexity or compatibility requires a change.',
  '2. Pure Worker for one simple purpose without shared middleware.',
  '3. Hono for multiple routes, shared auth/CORS/validation/error handling, hand-written routing growth, or ambiguity.',
  '4. Re-evaluate and migrate a growing pure Worker to Hono while preserving behavior.',
  '5. Server-render every user-facing route by default, including login, account, admin, and dashboards.',
  '6. Plain HTML/CSS/JS or Vite frontend structure as appropriate, with server-rendered initial HTML.',
  '7. Other Cloudflare-compatible framework output when the existing project requires it.',
  '8. Next.js static export or OpenNext conversion only when the existing stack or request requires Next.js.',
  '9. Express, NestJS, or long-running Node servers only after converting to Worker-compatible routes.'
];
const IMAGE_AND_FILE_PLACEMENT = {
  source_assets: [
    'Hero images, section screenshots, icons, logos, and fixed example images live in project files such as public/images/...',
    'These files are part of the deployment source and are restored when the latest deployment source is pulled.'
  ],
  storage_files: [
    'user-uploaded files, gallery photos, attachments, generated documents, and operational files live in env.STORAGE.',
    'Store title, description, order, owner, visibility, and storage key metadata in env.DB.'
  ],
  user_words: '사이트 디자인에 필요한 이미지는 프로젝트 파일에 넣고, 사용자가 올리는 사진이나 첨부파일은 스토리지에 저장합니다.'
};
const CAPABILITIES = {
  server: {
    available: true,
    agent_path: 'Use MCP deploy_code for intact small source. Use npm run joripspace:deploy for generated bundles and large projects so local bytes are uploaded in verified chunks.',
    user_words: '서버 배포 가능'
  },
  db: {
    available: true,
    app_code: 'Use env.DB inside server code for structured records.',
    agent_path: 'Use MCP describe_db, query_db, and run_db_migration, or CLI db commands, for schema/data work.',
    user_words: 'DB 사용 가능'
  },
  storage: {
    available: true,
    app_code: 'Use env.STORAGE inside server code for uploads and generated files.',
    agent_path: 'Use MCP list/read/write/delete_storage_object tools or CLI storage commands for one-off file work.',
    user_words: '스토리지 사용 가능'
  },
  realtime: {
    available: true,
    app_code: 'Use /_joripspace/realtime?room=main from browser code. Accepted history and Unicode FTS5 search are managed by the platform; page or search /_joripspace/realtime/rooms/{room}/messages.',
    agent_path: 'No extra binding or custom Durable Object is required. Never create a D1 chat-history table for platform realtime.',
    user_words: '실시간 기능 사용 가능'
  },
  plan_limits: {
    user_words: '요금제 제공량을 넘으면 추가 과금 없이 기능이 제한되고 차단 안내 페이지가 표시됩니다.',
    unlimited_metered_usage: 'OFF by default. Starter and higher plans can enable it so overage is not blocked and usage is still recorded.',
    unlimited_metered_budget: 'Optional. Empty means no budget cap. A numeric monthly budget caps overage and blocks when projected overage exceeds it.',
    speed_boost:
      'Starter 이상 프로젝트는 속도 부스트를 켤 수 있습니다. 개인 도메인은 프로젝트 기본 주소를 CNAME 대상으로 한 번만 연결하며, 이후 속도 부스트를 켜거나 끌 때 고객 DNS를 다시 변경하지 않습니다. 기존 직접 CNAME만 프로젝트 기본 주소로 한 번 변경합니다. 프로젝트별 Argo 데이터 사용량은 별도로 집계하거나 과금하지 않습니다.',
    speed_boost_ledger_items: [],
    quota_error: 'quota_blocked',
    custom_domain_error: 'plan_required',
    free: {
      requests_per_month: 10000,
      storage: '100MB',
      db: '50MB',
      realtime_messages_per_month: 1000,
      realtime_concurrent_connections: 5,
      custom_domain: false
      ,custom_domain_limit: 0
    },
    starter: {
      requests_per_month: 100000,
      storage: '1GB',
      db: '250MB',
      realtime_messages_per_month: 100000,
      realtime_concurrent_connections: 50,
      custom_domain: true
      ,custom_domain_limit: 1
    },
    pro: {
      requests_per_month: 300000,
      storage: '3GB',
      db: '750MB',
      realtime_messages_per_month: 300000,
      realtime_concurrent_connections: 150,
      custom_domain: true
      ,custom_domain_limit: 1
    },
    business: {
      requests_per_month: 1000000,
      storage: '10GB',
      db: '2.5GB',
      realtime_messages_per_month: 1000000,
      realtime_concurrent_connections: 500,
      custom_domain: true
      ,custom_domain_limit: 1
    }
  },
  project_domains: {
    user_words: '개인 도메인은 Starter 이상에서 사용할 수 있습니다. DNS에 CNAME 값을 설정한 뒤 상태 확인을 누릅니다.',
    default_domain_delete: false,
    free_error: 'plan_required',
    agent_path: 'Use web UI for non-technical users, or MCP list_domains/create_domain/verify_domain/delete_domain and CLI domain commands when agent tools are available.',
    dns_record: 'CNAME',
    wildcard: false,
    apex: false,
    idn: 'punycode',
    free_downgrade_requires_disconnect: true
  },
  recommended_stack_order: RECOMMENDED_STACK_ORDER,
  image_and_file_placement: IMAGE_AND_FILE_PLACEMENT
};

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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function ensurePackageScripts() {
  const packagePath = path.join(ROOT, 'package.json');
  const packageJson = readJson(packagePath) || { private: true, scripts: {} };
  if (!packageJson.scripts || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts)) {
    packageJson.scripts = {};
  }
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (!packageJson.scripts[name]) packageJson.scripts[name] = command;
  }
  if (!packageJson.scripts.deploy) packageJson.scripts.deploy = OPTIONAL_DEPLOY_SCRIPT;
  writeJson(packagePath, packageJson);
}

function hasGitignoreEntry(entry) {
  try {
    return fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((line) => line.trim()).includes(entry);
  } catch {
    return false;
  }
}

function detectEntrypoint() {
  return ENTRYPOINT_CANDIDATES.find((candidate) => fs.existsSync(path.join(ROOT, candidate))) || '';
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const fixMode = process.argv.includes('--fix');
  if (fixMode) ensurePackageScripts();

  const env = readEnv(path.join(ROOT, '.env.joripspace'));
  const project = readJson(path.join(ROOT, '.joripspace', 'project.json')) || {};
  const packageJson = readJson(path.join(ROOT, 'package.json')) || {};
  const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
  const issues = [];

  const projectId = env.JORIPSPACE_PROJECT_ID || project.project_id || project.project_slug || '';
  const apiBaseUrl = env.JORIPSPACE_API_BASE_URL || project.api_base_url || '';
  const tokenPresent = Boolean(process.env.JORIPSPACE_API_TOKEN || env.JORIPSPACE_API_TOKEN);
  const entrypoint = detectEntrypoint();

  if (!projectId) issues.push({ code: 'missing_project_id', message: 'JoripSpace 프로젝트 ID를 찾지 못했습니다.', next_action: 'MCP 연결 또는 joripspace link를 다시 실행하세요.' });
  if (!apiBaseUrl) issues.push({ code: 'missing_api_base_url', message: 'JoripSpace API 주소를 찾지 못했습니다.', next_action: 'MCP 연결 또는 joripspace link를 다시 실행하세요.' });
  if (!tokenPresent) issues.push({ code: 'missing_api_token', message: '배포 토큰을 찾지 못했습니다.', next_action: 'JoripSpace 연결을 다시 승인해 주세요.' });
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (scripts[name] !== command) issues.push({ code: 'missing_package_script', script: name, message: 'package.json에 ' + name + ' 스크립트가 없습니다.', next_action: 'npm run joripspace:doctor -- --fix 를 실행하세요.' });
  }
  if (!entrypoint) issues.push({ code: 'missing_entrypoint', message: '배포할 서버 진입 파일을 찾지 못했습니다.', next_action: 'worker.js 또는 src/index.js처럼 export default가 있는 서버 파일을 만들어 주세요.' });
  if (project.deployment_policy?.target !== 'joripspace' || project.deployment_policy?.guide_required !== true) {
    issues.push({ code: 'joripspace_workflow_policy_missing', message: '최신 JoripSpace 제작·배포 정책이 작업 폴더에 적용되지 않았습니다.', next_action: '에이전트가 prepare_project_workspace로 연결 파일을 자동 갱신해야 합니다.' });
  }
  if (!hasGitignoreEntry('.env.joripspace')) issues.push({ code: 'gitignore_missing_env', message: '.env.joripspace가 .gitignore에 없습니다.', next_action: '.env.joripspace를 .gitignore에 추가하세요.' });

  const result = {
    ok: issues.length === 0,
    project_id: projectId || null,
    api_base_url: apiBaseUrl || null,
    token_present: tokenPresent,
    entrypoint: entrypoint || null,
    package_scripts: {
      'joripspace:doctor': scripts['joripspace:doctor'] || null,
      'joripspace:save': scripts['joripspace:save'] || null,
      'joripspace:checkpoints': scripts['joripspace:checkpoints'] || null,
      'joripspace:restore': scripts['joripspace:restore'] || null,
      'joripspace:deploy-checkpoint': scripts['joripspace:deploy-checkpoint'] || null,
      'joripspace:deploy': scripts['joripspace:deploy'] || null,
      'joripspace:pull': scripts['joripspace:pull'] || null,
      deploy: scripts.deploy || null
    },
    capabilities: CAPABILITIES,
    issues
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (result.ok) {
    console.log('JoripSpace 연결 상태가 정상입니다.');
    console.log('배포 준비가 된 파일: ' + entrypoint);
    console.log('배포 명령: npm run joripspace:deploy');
    console.log('사용 가능 기능: 서버, DB, 스토리지, 실시간');
    console.log('DB 구조 변경은 MCP/CLI 마이그레이션 도구를 사용하면 됩니다.');
    console.log('스토리지 파일 작업은 MCP/CLI 스토리지 도구를 사용하면 됩니다.');
    console.log('실시간 메시지는 /_joripspace/realtime?room=main 으로 연결하면 됩니다.');
    return;
  }

  console.log('JoripSpace 연결 설정을 확인해야 합니다.');
  for (const issue of issues) {
    console.log('- ' + issue.message + ' ' + issue.next_action);
  }
  process.exitCode = 1;
}

main();
