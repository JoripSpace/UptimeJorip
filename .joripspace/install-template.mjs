#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const template = required(args.template, '--template');
const project = required(args.project || readProjectId(), '--project');
const target = path.resolve(args.dir || '.');
const env = readEnv(path.join(process.cwd(), '.env.joripspace'));
const apiUrl = String(env.JORIPSPACE_API_BASE_URL || 'https://api.joripspace.com').replace(/\/$/, '');
const token = required(env.JORIPSPACE_API_TOKEN || process.env.JORIPSPACE_API_TOKEN, 'JORIPSPACE_API_TOKEN');
const headers = { Authorization: 'Bearer ' + token, 'X-Joripspace-Session-Context': 'agent-helper' };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'joripspace-template-'));
try {
  const claim = await fetch(apiUrl + '/v1/templates/' + encodeURIComponent(template) + '/claim', { method: 'POST', headers });
  if (!claim.ok && ![404, 409].includes(claim.status)) throw await responseError(claim);
  let granted = null;
  let updateCurrent = false;
  if (!args.filesOnly) {
    if (args.update) {
      const state = templateState(target);
      if (!state || state.slug !== template) throw new Error('현재 작업공간의 템플릿 계보가 일치하지 않습니다.');
      const check = await fetch(apiUrl + '/v1/templates/' + encodeURIComponent(template) + '/git-update?project_id=' + encodeURIComponent(project) + '&current_head=' + encodeURIComponent(state.git_head_sha), { headers });
      if (!check.ok) throw await responseError(check);
      const available = await check.json();
      if (!available.update_available) {
        console.log('Template is already current: ' + template);
        console.log('Template HEAD: ' + state.git_head_sha);
        updateCurrent = true;
      }
      if (!updateCurrent && !args.yes) throw new Error('템플릿 업데이트 ' + available.version + '을 사용할 수 있습니다. 변경 내용을 확인하고 사용자 동의를 받은 뒤 --yes를 붙여 다시 실행하세요.');
    }
    if (!updateCurrent) {
      const grant = await fetch(apiUrl + '/v1/templates/' + encodeURIComponent(template) + '/git-bundle-grants?project_id=' + encodeURIComponent(project), { method: 'POST', headers });
      if (grant.ok) {
        const metadata = await grant.json();
        const bundle = await fetch(metadata.download_url);
        if (!bundle.ok) throw await responseError(bundle);
        granted = { metadata, bytes: Buffer.from(await bundle.arrayBuffer()) };
      } else if (grant.status !== 409) throw await responseError(grant);
    }
  }
  if (updateCurrent) {
    // Availability checks are read-only and need no further action.
  } else if (granted) {
    await applyGitHistory(target, template, granted.bytes, granted.metadata, Boolean(args.update), temp);
  } else {
      if (args.update) throw new Error('파일만 설치한 템플릿은 template pull로 업데이트할 수 없습니다.');
      const response = await fetch(apiUrl + '/v1/templates/' + encodeURIComponent(template) + '/download?project_id=' + encodeURIComponent(project), { headers });
      if (!response.ok) throw await responseError(response);
      const archive = path.join(temp, 'template.tar.gz');
      fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
      const extract = path.join(temp, 'extract');
      fs.mkdirSync(extract);
      const inventory = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
      if (inventory.status !== 0) throw new Error('템플릿 압축 목록을 확인하지 못했습니다.');
      for (const line of String(inventory.stdout || '').split(/\r?\n/).filter(Boolean)) {
        const archivePath = line.replace(/\\/g, '/');
        const parts = archivePath.split('/');
        if (archivePath.startsWith('/') || parts.some((part) => part === '..')) {
          throw new Error('템플릿 압축에 안전하지 않은 경로가 포함되어 있습니다.');
        }
      }
      const types = spawnSync('tar', ['-tzvf', archive], { encoding: 'utf8' });
      if (types.status !== 0 || String(types.stdout || '').split(/\r?\n/).some((line) => ['l', 'h'].includes(line[0]))) {
        throw new Error('템플릿 압축에 안전하지 않은 링크가 포함되어 있습니다.');
      }
      const unpack = spawnSync('tar', ['-xzf', archive, '-C', extract], { encoding: 'utf8' });
      if (unpack.status !== 0) throw new Error('템플릿 압축을 풀지 못했습니다: ' + String(unpack.stderr || unpack.stdout || 'tar 실행 실패').trim());
      const roots = fs.readdirSync(extract, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      if (roots.length !== 1) throw new Error('템플릿 압축 구조가 올바르지 않습니다.');
      const repositoryRoot = path.join(extract, roots[0].name);
      const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'joripspace-template.json'), 'utf8'));
      const sourceRoot = safeRelative(String(manifest.source_root || '.'));
      const source = sourceRoot === '.' ? repositoryRoot : path.join(repositoryRoot, ...sourceRoot.split('/'));
      const files = collectFiles(source);
      const collisions = files.map((file) => path.join(target, ...file.relative.split('/'))).filter(fs.existsSync);
      if (collisions.length && !args.force) throw new Error('템플릿이 기존 파일 ' + collisions.length + '개와 충돌합니다. 아무 파일도 덮어쓰지 않았습니다.');
      for (const file of files) {
        const destination = path.join(target, ...file.relative.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(file.absolute, destination);
      }
      console.log('Template installed: ' + template);
      console.log('Directory: ' + target);
      console.log('Files: ' + files.length);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith('--')) continue;
    if (key === '--force' || key === '--update' || key === '--files-only' || key === '--yes') {
      result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
    }
    else result[key.slice(2)] = values[++index] || '';
  }
  return result;
}
function required(value, label) { if (!value) throw new Error(label + ' 값이 필요합니다.'); return String(value); }
function readEnv(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}
function readProjectId() {
  try { const value = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.joripspace', 'project.json'), 'utf8')); return value.project_slug || value.project_id || ''; }
  catch { return ''; }
}
function safeRelative(value) {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') || '.';
  if (normalized === '.') return normalized;
  const parts = normalized.split('/');
  if (normalized.startsWith('/') || parts.some((part) => !part || part === '.' || part === '..')) throw new Error('템플릿 source_root가 안전하지 않습니다.');
  return normalized;
}
function collectFiles(root) {
  if (!fs.statSync(root).isDirectory()) throw new Error('템플릿 source_root를 찾을 수 없습니다.');
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('템플릿에 심볼릭 링크가 포함되어 있습니다.');
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push({ relative: safeRelative(relative), absolute });
    }
  };
  visit(root);
  if (!files.length) throw new Error('템플릿에 설치할 파일이 없습니다.');
  return files;
}
function installPublicGitClone(target, slug, source, temp) {
  const remoteUrl = githubRemoteUrl(source.remote_url);
  const remoteRef = gitBranchRef(source.remote_ref);
  const remoteBranch = remoteRef.slice('refs/heads/'.length);
  fs.mkdirSync(target, { recursive: true });
  const existingRepository = isGitRepository(target);
  if (existingRepository) {
    if (gitResult(target, ['rev-parse', '--verify', 'HEAD']).status === 0) return null;
    if (git(target, ['ls-files', '-z']).length) return null;
  }
  const cloneDir = path.join(temp, 'public-clone');
  const clone = gitResult(target, [...cloneLocalConfigArgs(target), 'clone', '--branch', remoteBranch, '--single-branch', '--no-tags', remoteUrl, cloneDir]);
  if (clone.status !== 0) return null;
  const head = gitSha(git(cloneDir, ['rev-parse', 'HEAD']).trim());
  const files = git(cloneDir, ['ls-files', '-z']).split('\0').filter(Boolean);
  const allowedCollisions = new Set(['package.json', '.gitignore']);
  const collisions = files.filter((file) => fs.existsSync(path.join(target, ...file.split('/'))) && !allowedCollisions.has(file));
  if (collisions.length) return null;
  const previousPackage = readJson(path.join(target, 'package.json'));
  const previousGitignore = readOptionalText(path.join(target, '.gitignore'));
  if (!existingRepository) git(target, ['init']);
  const branch = gitResult(target, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branchName = branch.status === 0 && String(branch.stdout || '').trim() ? String(branch.stdout || '').trim() : 'main';
  for (const file of allowedCollisions) {
    const destination = path.join(target, file);
    if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  }
  try {
    git(target, ['fetch', '--no-tags', cloneDir, remoteRef]);
    git(target, ['checkout', '-B', branchName, 'FETCH_HEAD']);
  } catch (error) {
    restoreOptionalText(path.join(target, 'package.json'), previousPackage && JSON.stringify(previousPackage, null, 2) + '\n');
    restoreOptionalText(path.join(target, '.gitignore'), previousGitignore);
    throw error;
  }
  mergeManagedPackageScripts(path.join(target, 'package.json'), previousPackage);
  mergeGitignore(path.join(target, '.gitignore'), previousGitignore);
  configureTemplateRemote(target, remoteUrl, remoteRef);
  git(target, ['update-ref', 'refs/remotes/joripspace-template/main', head]);
  writeClonedTemplateState(target, slug, source, head);
  return { head };
}
function cloneLocalConfigArgs(target) {
  const result = [];
  const rewrites = gitResult(target, ['config', '--get-regexp', '^url\\..*\\.insteadOf$']);
  if (rewrites.status === 0) {
    for (const line of String(rewrites.stdout || '').split(/\r?\n/).filter(Boolean)) {
      const separator = line.search(/\s/);
      if (separator > 0) result.push('-c', line.slice(0, separator) + '=' + line.slice(separator).trim());
    }
  }
  const fileProtocol = gitResult(target, ['config', '--get', 'protocol.file.allow']);
  if (fileProtocol.status === 0 && String(fileProtocol.stdout || '').trim()) {
    result.push('-c', 'protocol.file.allow=' + String(fileProtocol.stdout || '').trim());
  }
  return result;
}
async function applyGitHistory(target, slug, bundle, metadata, updateOnly, temp) {
  const expectedHash = String(metadata.bundle_sha256 || '').toLowerCase();
  const actualHash = crypto.createHash('sha256').update(bundle).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedHash) || !crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
    throw new Error('템플릿 Git bundle 무결성 확인에 실패했습니다.');
  }
  const head = gitSha(metadata.git_head_sha);
  const sourceRef = gitBranchRef(metadata.git_ref);
  if (!['refs/heads/main', 'refs/heads/joripspace-template-main'].includes(sourceRef)) throw new Error('템플릿 Git ref가 올바르지 않습니다.');
  git(target, ['--version'], true);
  if (!isGitRepository(target)) {
    if (updateOnly) throw new Error('템플릿 업데이트는 Git 저장소에서만 실행할 수 있습니다.');
    fs.mkdirSync(target, { recursive: true });
    git(target, ['init']);
  }
  const gitDirectory = path.resolve(target, git(target, ['rev-parse', '--git-dir']).trim());
  const bundleDirectory = path.join(gitDirectory, 'joripspace');
  fs.mkdirSync(bundleDirectory, { recursive: true });
  const candidatePath = path.join(bundleDirectory, 'upstream-' + crypto.randomUUID() + '.bundle');
  const bundlePath = path.join(bundleDirectory, 'upstream.bundle');
  const backupPath = path.join(bundleDirectory, 'upstream.bundle.previous');
  fs.writeFileSync(candidatePath, bundle, { flag: 'wx' });
  git(target, ['bundle', 'verify', candidatePath]);
  git(target, ['fetch', '--no-tags', candidatePath, sourceRef + ':refs/joripspace/candidate']);
  const fetchedHead = git(target, ['rev-parse', 'refs/joripspace/candidate']).trim().toLowerCase();
  if (fetchedHead !== head) throw new Error('템플릿 Git HEAD가 bundle과 일치하지 않습니다.');
  const state = templateState(target);
  if (updateOnly) {
    if (!state || state.slug !== slug) throw new Error('현재 작업공간의 템플릿 계보가 일치하지 않습니다.');
    if (state.git_head_sha === head) {
      installBundleRemote(target, candidatePath, bundlePath, backupPath, sourceRef);
      writeTemplateState(target, slug, metadata, head);
      git(target, ['add', '.joripspace/template.json']);
      if (gitResult(target, ['diff', '--cached', '--quiet']).status !== 0) {
        ensureGitIdentity(target);
        git(target, ['commit', '-m', '조립스페이스 공식 업데이트 채널 연결: ' + slug]);
      }
      console.log('Template is already current: ' + slug);
      return;
    }
    if (gitResult(target, ['merge-base', '--is-ancestor', gitSha(state.git_head_sha), head]).status !== 0) {
      throw new Error('템플릿 히스토리가 변경되어 자동 업데이트를 중단했습니다.');
    }
    if (git(target, ['status', '--porcelain']).trim()) {
      throw new Error('커밋되지 않은 변경이 있습니다. commit 또는 stash 후 다시 실행하세요.');
    }
    ensureGitIdentity(target);
    const merge = gitResult(target, ['merge', '--no-ff', '--no-commit', head]);
    if (merge.status !== 0) {
      throw new Error('템플릿 병합 충돌이 발생했습니다. 강제 덮어쓰기 없이 충돌을 해결해 주세요.\n' + String(merge.stderr || merge.stdout || '').trim());
    }
    installBundleRemote(target, candidatePath, bundlePath, backupPath, sourceRef);
    writeTemplateState(target, slug, metadata, head);
    git(target, ['add', '.joripspace/template.json']);
    git(target, ['commit', '-m', '조립스페이스 템플릿 업데이트: ' + slug]);
    console.log('Template updated: ' + slug);
    console.log('Template HEAD: ' + head);
    return;
  }

  if (state) throw new Error('이미 템플릿 계보가 연결된 작업공간입니다. 업데이트 명령을 사용하세요.');
  ensureGitIdentity(target);
  const extract = path.join(temp, 'git-tree');
  const treeArchive = path.join(temp, 'git-tree.tar');
  fs.mkdirSync(extract);
  git(target, ['archive', '--format=tar', '--output', treeArchive, head]);
  const unpack = spawnSync('tar', ['-xf', treeArchive, '-C', extract], { encoding: 'utf8', windowsHide: true });
  if (unpack.status !== 0) throw new Error('템플릿 Git 트리를 풀지 못했습니다: ' + String(unpack.stderr || unpack.stdout || '').trim());
  const files = collectFiles(extract);
  const collisions = files.filter((file) => file.relative !== 'package.json').map((file) => path.join(target, ...file.relative.split('/'))).filter(fs.existsSync);
  if (collisions.length && !args.force) throw new Error('템플릿이 기존 파일 ' + collisions.length + '개와 충돌합니다. 아무 파일도 덮어쓰지 않았습니다.');
  const previousPackage = readJson(path.join(target, 'package.json'));
  for (const file of files) {
    const destination = path.join(target, ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file.absolute, destination);
  }
  mergeManagedPackageScripts(path.join(target, 'package.json'), previousPackage);
  installBundleRemote(target, candidatePath, bundlePath, backupPath, sourceRef);
  writeTemplateState(target, slug, metadata, head);
  for (const file of files) git(target, ['add', '--', file.relative]);
  git(target, ['add', '.joripspace/template.json']);
  if (gitResult(target, ['diff', '--cached', '--quiet']).status !== 0) {
    git(target, ['commit', '-m', '조립스페이스 템플릿 설치: ' + slug]);
  }
  const lineage = gitResult(target, ['merge', '--strategy=ours', '--no-edit', '--allow-unrelated-histories', head]);
  if (lineage.status !== 0) throw new Error('템플릿 Git 계보를 연결하지 못했습니다: ' + String(lineage.stderr || lineage.stdout || '').trim());
  console.log('Template installed with Git history: ' + slug);
  console.log('Directory: ' + target);
  console.log('Template HEAD: ' + head);
}
function installBundleRemote(target, candidatePath, bundlePath, backupPath, sourceRef) {
  const current = gitResult(target, ['config', '--get', 'remote.upstream.url']);
  if (current.status === 0 && String(current.stdout || '').trim() !== '.git/joripspace/upstream.bundle') {
    throw new Error('기존 upstream remote는 조립스페이스 관리 채널이 아닙니다.');
  }
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
  if (fs.existsSync(bundlePath)) fs.renameSync(bundlePath, backupPath);
  try { fs.renameSync(candidatePath, bundlePath); }
  catch (error) {
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, bundlePath);
    throw error;
  }
  if (current.status !== 0) git(target, ['remote', 'add', 'upstream', '.git/joripspace/upstream.bundle']);
  git(target, ['config', '--replace-all', 'remote.upstream.fetch', sourceRef + ':refs/remotes/upstream/main']);
  git(target, ['config', '--replace-all', 'remote.upstream.tagOpt', '--no-tags']);
  git(target, ['fetch', '--no-tags', 'upstream']);
  git(target, ['update-ref', '-d', 'refs/joripspace/candidate']);
  if (gitResult(target, ['remote', 'get-url', 'joripspace-template']).status === 0) git(target, ['remote', 'remove', 'joripspace-template']);
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
}
function templateState(target) {
  const file = path.join(target, '.joripspace', 'template.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('.joripspace/template.json 형식이 올바르지 않습니다.'); }
}
function writeTemplateState(target, slug, metadata, head) {
  const directory = path.join(target, '.joripspace');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'template.json'), JSON.stringify({
    schema_version: 3,
    slug,
    template_id: String(metadata.template_id || ''),
    version_id: String(metadata.version_id || ''),
    version: String(metadata.version || ''),
    git_head_sha: head,
    remote_ref: 'refs/remotes/upstream/main'
  }, null, 2) + '\n');
}
function applyGitRemote(target, slug, remoteUrl, remoteRef) {
  const state = templateState(target);
  if (!state || state.slug !== slug) throw new Error('현재 작업공간의 템플릿 계보가 일치하지 않습니다.');
  if (!isGitRepository(target)) throw new Error('템플릿 업데이트는 Git 저장소에서만 실행할 수 있습니다.');
  if (git(target, ['status', '--porcelain']).trim()) {
    throw new Error('커밋되지 않은 변경이 있습니다. commit 또는 stash 후 다시 실행하세요.');
  }
  git(target, ['fetch', '--no-tags', remoteUrl, remoteRef]);
  const head = gitSha(git(target, ['rev-parse', 'FETCH_HEAD']).trim());
  const previousHead = gitSha(state.git_head_sha);
  if (head === previousHead) {
    configureTemplateRemote(target, remoteUrl, remoteRef);
    git(target, ['update-ref', 'refs/remotes/joripspace-template/main', head]);
    console.log('Template is already current: ' + slug);
    console.log('Template HEAD: ' + head);
    return;
  }
  if (gitResult(target, ['merge-base', '--is-ancestor', previousHead, head]).status !== 0) {
    throw new Error('템플릿 히스토리가 변경되어 자동 업데이트를 중단했습니다.');
  }
  ensureGitIdentity(target);
  const merge = gitResult(target, ['merge', '--no-ff', '--no-commit', head]);
  if (merge.status !== 0) {
    throw new Error('템플릿 병합 충돌이 발생했습니다. 강제 덮어쓰기 없이 충돌을 해결해 주세요.\n' + String(merge.stderr || merge.stdout || '').trim());
  }
  configureTemplateRemote(target, remoteUrl, remoteRef);
  git(target, ['update-ref', 'refs/remotes/joripspace-template/main', head]);
  writeRemoteTemplateState(target, state, remoteUrl, remoteRef, head);
  git(target, ['add', '.joripspace/template.json']);
  git(target, ['commit', '-m', '조립스페이스 템플릿 업데이트: ' + slug]);
  console.log('Template updated: ' + slug);
  console.log('Template HEAD: ' + head);
}
function writeRemoteTemplateState(target, state, remoteUrl, remoteRef, head) {
  const directory = path.join(target, '.joripspace');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'template.json'), JSON.stringify({
    ...state,
    schema_version: 2,
    git_head_sha: head,
    remote_ref: 'refs/remotes/joripspace-template/main',
    remote_url: remoteUrl,
    remote_branch_ref: remoteRef
  }, null, 2) + '\n');
}
function writeClonedTemplateState(target, slug, source, head) {
  const directory = path.join(target, '.joripspace');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'template.json'), JSON.stringify({
    schema_version: 2,
    slug,
    template_id: source.template_id,
    version_id: source.version_id,
    version: source.version,
    git_head_sha: head,
    remote_ref: 'refs/remotes/joripspace-template/main',
    remote_url: githubRemoteUrl(source.remote_url),
    remote_branch_ref: gitBranchRef(source.remote_ref)
  }, null, 2) + '\n');
}
function configureTemplateRemote(target, remoteUrl, remoteRef) {
  const current = gitResult(target, ['config', '--get', 'remote.joripspace-template.url']);
  if (current.status === 0) {
    if (String(current.stdout || '').trim() !== remoteUrl) throw new Error('기존 joripspace-template remote가 다른 저장소를 가리킵니다.');
  } else {
    git(target, ['remote', 'add', 'joripspace-template', remoteUrl]);
  }
  git(target, ['config', '--replace-all', 'remote.joripspace-template.fetch', '+' + remoteRef + ':refs/remotes/joripspace-template/main']);
  git(target, ['config', '--replace-all', 'remote.joripspace-template.pushurl', 'disabled://joripspace-template-push']);
  configureTemplateUpstream(target, remoteRef);
}
function configureTemplateUpstream(target, remoteRef) {
  const origin = gitResult(target, ['config', '--get', 'remote.origin.url']);
  if (origin.status === 0 && String(origin.stdout || '').trim()) return;
  const branch = gitResult(target, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branchName = String(branch.stdout || '').trim();
  if (branch.status !== 0 || !branchName) return;
  git(target, ['config', 'branch.' + branchName + '.remote', 'joripspace-template']);
  git(target, ['config', 'branch.' + branchName + '.merge', remoteRef]);
  git(target, ['config', 'branch.' + branchName + '.rebase', 'false']);
}
function githubRemoteUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new Error('템플릿 Git remote URL이 올바르지 않습니다.'); }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+(?:\.git)?$/.test(part))) {
    throw new Error('템플릿 Git remote URL이 올바르지 않습니다.');
  }
  return 'https://github.com/' + parts[0] + '/' + parts[1].replace(/\.git$/i, '') + '.git';
}
function gitBranchRef(value) {
  const normalized = String(value || '');
  if (!/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(normalized) || normalized.includes('..')) throw new Error('템플릿 Git remote ref가 올바르지 않습니다.');
  return normalized;
}
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}
function mergeManagedPackageScripts(file, previous) {
  if (!fs.existsSync(file) || !previous) return;
  const current = readJson(file);
  if (!current) return;
  current.scripts = current.scripts && typeof current.scripts === 'object' ? current.scripts : {};
  for (const [name, command] of Object.entries(previous.scripts || {})) {
    if (name.startsWith('joripspace:')) current.scripts[name] = command;
  }
  fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n');
}
function readOptionalText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
function restoreOptionalText(file, value) {
  if (value !== null && value !== undefined) fs.writeFileSync(file, value);
}
function mergeGitignore(file, previous) {
  if (previous === null) return;
  const current = readOptionalText(file) || '';
  const lines = current.split(/\r?\n/).filter(Boolean);
  const seen = new Set(lines);
  for (const line of previous.split(/\r?\n/).filter(Boolean)) {
    if (!seen.has(line)) {
      lines.push(line);
      seen.add(line);
    }
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
function isGitRepository(target) {
  const result = gitResult(target, ['rev-parse', '--is-inside-work-tree']);
  return result.status === 0 && String(result.stdout || '').trim() === 'true';
}
function ensureGitIdentity(target) {
  const name = gitResult(target, ['config', '--get', 'user.name']);
  const email = gitResult(target, ['config', '--get', 'user.email']);
  if (name.status !== 0 || email.status !== 0 || !String(name.stdout || '').trim() || !String(email.stdout || '').trim()) {
    throw new Error('Git user.name과 user.email 설정이 필요합니다.');
  }
}
function git(target, values, withoutDirectory = false) {
  const result = withoutDirectory
    ? spawnSync('git', values, { encoding: 'utf8', windowsHide: true })
    : gitResult(target, values);
  if (result.error?.code === 'ENOENT') throw new Error('git 명령을 찾을 수 없습니다.');
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'git 실행 실패').trim());
  return String(result.stdout || '');
}
function gitResult(target, values) {
  return spawnSync('git', ['-C', target, ...values], { encoding: 'utf8', windowsHide: true });
}
function header(headers, name) {
  const value = String(headers.get(name) || '').trim();
  if (!value) throw new Error('템플릿 응답에 ' + name + ' 값이 없습니다.');
  return value;
}
function gitSha(value) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error('템플릿 Git SHA가 올바르지 않습니다.');
  return normalized;
}
async function responseError(response) {
  const text = await response.text();
  try { const parsed = JSON.parse(text); return new Error(parsed?.error?.message || parsed?.message || 'HTTP ' + response.status); }
  catch { return new Error(text || 'HTTP ' + response.status); }
}
