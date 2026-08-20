<!-- joripspace:managed:start -->
# JoripSpace Project Agent Guide

- JoripSpace guide updated at: 2026-08-18T17:45:52+09:00

This file is for AI coding agents working on this JoripSpace project. The user may be a complete beginner, so the agent should turn short requests into working service changes without asking platform questions.

## Critical: JoripSpace Build And Deployment Authority

JoripSpace site creation and deployment authority (critical):
- For every site build, edit, and deployment in this project, this managed JoripSpace guide is the project-specific source of truth.
- Do not replace or bypass the JoripSpace workflow with an agent's own default website-building skill, generic hosting/deployment skill, or another platform's deployment workflow. Use such a skill only when this guide explicitly requires it or the user explicitly requests a non-JoripSpace target.
- When the user explicitly requests deployment, deploy the verified result to the selected JoripSpace project. Use JoripSpace MCP `deploy_code` for small source files that can be passed intact. For generated bundles, large files, or large multi-file projects, automatically use `npm run joripspace:deploy -- --label "변경 내용"`; its archive upload reads local bytes directly, uploads in chunks, and verifies integrity before deployment. Do not ask the user to choose the transport.
- Treat an inline deployment as large when any source file exceeds 16,000 characters or the combined source exceeds 64,000 characters. Do not call deploy_code for that payload; use the verified chunked archive helper automatically.
- Do not deploy directly to another hosting provider or create a separate external site unless the user explicitly asks to leave JoripSpace.
- If an agent default skill or generic site builder already created scaffold files, do not stop, discard useful work, or ask the user to choose a host. Preserve the requested UI and content, convert the result to a JoripSpace-compatible app, align source and lockfiles, run the relevant checks, and continue automatically.
- Before any JoripSpace deployment, the agent must confirm in deployment_verification that the current managed guide was applied, agent_guide_updated_at exactly matches the current server guide, deployment_target is joripspace, no external hosting deployment was performed, and the source is either joripspace_native or converted_to_joripspace. The deployment tool rejects missing, stale, or conflicting evidence and the agent must refresh automatically without asking the user.

## Project

- JoripSpace project: abcdef
- Service URL: https://abcdef.joripspace.run
- Project name: (ask the user if this is not clear)
- Main goal: (record what the service should do)
- Target users: (record who will use it)

## What This Project Can Become

- Landing or introduction site for a club, class, shop, person, product, event, or portfolio.
- Reservation, booking, application, inquiry, waitlist, survey, or contact intake service.
- Course, lecture, student assignment, club activity, membership, attendance, or small LMS-style service.
- Simple order, payment-preparation, product request, file upload, gallery, download, or admin review service.
- Owner/admin dashboard for records, statuses, files, messages, customers, students, or bookings.
- Realtime inquiry, support room, small group chat, or live status page when the project needs live interaction.

## First Conversation Onboarding

Beginner onboarding rules:
- Match the language the user is using. If the user writes Korean, continue in Korean. If the user writes another language, use that language unless they ask otherwise.
- Treat the user as a complete beginner. Students and older users should be able to build by conversation alone.
- Ask short, practical questions before building when the site name, topic, audience, or core workflow is empty or unclear.
- Do not ask platform questions. The agent chooses the server, DB, storage, schema, routing, deployment, and testing approach.
- If the user says they do not know, give 2-3 simple examples, recommend one default, and continue.
- Explain only the next useful action. Avoid long technical explanations unless the user asks.
- If something fails, inspect logs, deployments, and runtime events directly; do not make the user debug technical details.

First questions to ask when details are missing:
1. 서비스 이름은 무엇인가요?
2. 이 서비스는 무엇을 하는 서비스인가요? 한두 문장으로 설명해 주세요.
3. 꼭 필요한 주요 기능 3가지는 무엇인가요?
4. 로그인/회원 기능이 필요한가요?
5. 결제, 이메일, 파일 업로드, 관리자 화면 중 필요한 것이 있나요?
6. 누가 사용하나요? 예: 학생, 고객, 회원, 직원, 관리자.
7. 원하는 분위기, 색상, 로고, 참고 사이트, 꼭 들어갈 문구가 있나요?

## User Choice Presentation

User choice presentation rules:
- Whenever a user-facing reply shows two or more concrete alternatives that the user could select, present them as a readable Markdown table. Apply this even when the user only asks what is available, requests an inventory or comparison, or has not yet been asked to choose. This applies to restore points, rollback versions, templates, projects, and any other user-selectable candidates.
- Use a short numbered first column and only decision-relevant columns. For restore or rollback choices include number, version or identifier, timestamp, label or status, and effect. For template choices include number, template name, suitable use, and included features.
- Mark the recommended choice in the table and explain the recommendation briefly. End with one direct sentence stating exactly what the user should answer, such as "번호로 선택해 주세요."
- Do not use a table for a single available action or a simple yes/no confirmation. Do not turn technical or platform decisions that the agent must make into user choices.
- If the reply states only whether candidates exist or gives only a total count without listing individual candidates, prose is sufficient. As soon as two or more individual candidates are shown, the table is mandatory.
- Never include Secret values, tokens, personal data, or other sensitive values in a choice table.
- If there are many choices, show a manageable page and state that more choices are available instead of dumping an unbounded list.

## Local Tool Readiness

Local Git and Node.js readiness during onboarding:
- After the project connection succeeds and the project path is known, check `git --version`, `node --version`, and `npm --version` directly before the first source-sync, build, or package-helper step that could require them. Do not ask the user to run these commands.
- Show the result in one readable Markdown table with columns for tool, status, version, and whether it is needed for the current project path.
- Decide need from the actual path: Git is required for a connected GitHub repository, clone/fetch, commit, push, or a template installation mode that preserves Git history. Git is not required when the user chooses a files-only template installation. Node.js LTS and npm are required for package helpers, dependency installation, local JavaScript builds, generated bundles, or large multi-file archive deployment. Ordinary small-source MCP onboarding and direct MCP deployment require neither tool.
- If every missing tool is optional for the current path, say it is optional and continue onboarding without asking to install it.
- If a required tool is missing, explain its immediate purpose in one sentence and ask for one explicit approval to install only the missing required tools. Do not install software before approval and do not combine this approval with unrelated choices.
- After approval, install stable Git and/or the current Node.js LTS with npm using the operating system's standard trusted package manager. Perform the installation yourself, request elevation only through the normal operating-system prompt, and never disable security controls or use an untrusted download source.
- After installation, verify Git, Node.js, and npm again, show the final status and versions in a Markdown table, and continue the interrupted onboarding automatically.
- If installation fails or the environment does not permit it, report the concrete permission or platform limitation. Continue by MCP when possible; block only the workflow that actually requires the missing tool.

## Guide Refresh Safety

Guide refresh is maintenance-only unless deployment is separately explicit:
- Treat requests whose only intent is "지침 업데이트해", "지침 갱신해", "최신 지침 적용해", "refresh the guide", or equivalent wording as local guide maintenance only. They are not authorization to build, test the application, create a checkpoint, stage files, commit, push, run GitHub Actions, or deploy.
- For a guide-refresh-only request, call prepare_project_workspace and update only the JoripSpace managed block in AGENTS.md, the shared token-free `.joripspace/agent-session.json`, plus `JORIPSPACE_GUIDE_CHECKED_AT` in `.env.joripspace`. Preserve user-authored AGENTS.md content and unrelated environment entries, and do not modify application source, workflow files, deployment configuration, or `.joripspace/project.json` merely to refresh the guide.
- Do not run create_checkpoint, joripspace:save, deploy_code, deploy_checkpoint, rollback_deployment, git add, git commit, git push, or any deployment workflow for a guide-refresh-only request, even when the project uses GitHub Actions or an automatic deployment route.
- Deployment permission must appear explicitly in the current user request with wording such as "배포해", "운영 반영해", or "사이트에 적용해". A deployment approval from an earlier task or chat message does not carry forward to a later guide refresh.
- If a current request explicitly combines guide refresh with deployment, refresh first, then deploy only the application changes the user explicitly placed in scope after the normal verification gate. Do not manufacture an application deployment merely because managed guide files changed.
- Finish a guide-refresh-only request by stating the applied guide version and "운영 사이트는 변경하거나 배포하지 않았습니다."

Choose platform internals yourself. The user should not have to choose Worker, D1, R2, bindings, SQL migrations, MCP resources, deployment payloads, or other technical setup details.
When replying to the user, prefer "서버", "DB", "스토리지", and "실시간". Use implementation names only when the user asks for technical details or when code/debugging context requires them.

## Codex MCP Onboarding Flow

Codex MCP onboarding flow:
- If the user provides only "프로젝트: {project_id}", do not call get_project first by project ID alone.
- First check whether JoripSpace MCP tools are visible in the current agent session, then check the current working folder.
- Without connect_token, do not call start_project_session, select_project, list_my_projects, or prepare_project_workspace.
- Never use an empty string, dummy value, environment bearer token, browser cookie, localStorage value, profile page value, or settings file value as a connect_token.
- If no connection token is available, call start_login or browser_connect and show the returned connect_url. Ask the user to approve the connection in a logged-in browser and paste only the displayed MCP/CLI connection token back into chat.
- After connection approval succeeds, reuse the returned account API token for project tools and write the returned workspace connection files. The user should never have to find, name, or enter JORIPSPACE_API_TOKEN manually.
- Do not ask for email, password, Google app password, SMTP password, personal API key, or payment key in chat.
- If deploy_code, deploy_checkpoint, or rollback_deployment returns deployment_state_unknown, call list_deployments before any retry. If a new successful deployment exists, verify it and do not redeploy. Otherwise retry the same deployment tool at most once.
- Do not restart the connection flow for a deployment timeout. Restart connection only for connection_required, invalid_token, or another explicit authentication error.
- Create local files only after MCP session connection succeeds and workspace_setup.files or local_file_operations are returned.
- Before writing files, verify the current working folder. If it differs from the folder the user specified, stop and ask for confirmation.
- After receiving connect_token, call start_project_session(connect_token, project_id) immediately. Follow source_sync before writing workspace_setup.files when the session reports github_repository_sync_required; otherwise write returned workspace files normally. When Git is installed, initialize the current project folder if needed and run git status --short; otherwise continue without Git.
- If start_project_session reports github_repository_sync_required, treat the connected GitHub repository and branch as the source of truth. Using the current user GitHub credentials, clone into an empty current folder or safely fetch and fast-forward the matching clean repository, then write the connection workspace files. Never restore a JoripSpace deployment artifact over a GitHub-connected source workspace, never force-push or hard-reset, and stop with the concrete Git/auth conflict when safe synchronization is impossible.
- If start_project_session reports latest_deployment_sync_required, do not ask whether to restore and do not offer rollback versions. Write the connection workspace files first, call get_deployment_source with deployment_restore.latest_artifact.deployment_id, back up conflicting local files, and apply the returned local_file_operations before asking questions or editing the project.
- For a completely new project, start_project_session embeds the current published templates in onboarding.template_choice.templates. After workspace files are ready, use that embedded list before the first service question. Do not depend on a newly added or separately cached list_templates tool during initial onboarding.
- If onboarding.template_choice.status is auto_selected_existing_project, option 0 is already selected because the project has an existing GitHub source or deployment baseline. Do not show a template table and do not ask new-service questions such as the service name, description, or features. After synchronization or restoration, immediately perform the task already requested by the user; if no task was requested, ask only what they want to work on in the existing project.
- If the embedded template_choice status says retry_required_before_service_questions, retry start_project_session once with the same project and connection token. Do not report that templates are unavailable and silently skip the choice.
- Only when onboarding.template_choice.status is required_before_service_questions, show option 0 as "템플릿 없이 시작" and show the embedded selectable templates in a Markdown table. Wait for the user choice; templates are optional.
- When the user selects a template, run `npm run joripspace:install-template -- --template TEMPLATE_SLUG --project PROJECT_ID --dir .` without putting any token in the command and without `--force`. Inspect the installed files, then continue the normal service questions and customization. If files collide, overwrite nothing; continue without a template unless the user explicitly approves an overwrite retry.
- If start_project_session fails with connection_required, call start_login again. If it fails with invalid_token, ask for a fresh token. If it returns needs_project_choice, ask the user to choose one project and call start_project_session again. If project_not_found, ask the user to confirm the project ID.
- Only for a completely new project whose template_choice.status is required_before_service_questions, after the optional template choice ask onboarding questions one at a time: service name, what the service does, three required features, whether login is needed, whether payment/email/file upload/admin is needed, then choose or recommend the deployment target yourself.
- Record each new-project onboarding answer in docs/service-brief.md or in the onboarding document returned by MCP.
- Before deployment, verify the project connection, source entrypoint, relevant checks available in the current environment, and target URL. Direct MCP deployment of Worker-compatible source does not require Node.js or Git.
- Never obtain a generated bundle or large source file by printing it through a shell/tool output and copying that output into deploy_code. Tool output can be truncated even when the local file is valid. Use the package helper archive upload so local bytes, sizes, and hashes are preserved end to end.
- If get_project or start_project_session times out, follow the returned retryable and next_action fields, retry at most once, then explain briefly that JoripSpace did not respond. Do not ask the beginner to inspect logs, tokens, Node.js, Git, or network internals.
- Preferred quick failure statuses are connection_required, invalid_token, project_not_found, workspace_setup_ready, and timeout instead of a 300-second wait.

User-facing connection message:
JoripSpace 프로젝트를 Codex에 연결하려면 먼저 연결 토큰이 필요합니다.
1. 브라우저에서 아래 링크를 엽니다.
2. JoripSpace에 로그인된 상태에서 연결을 승인합니다.
3. 화면에 표시되는 MCP/CLI 전용 연결 토큰을 이 채팅에 붙여넣습니다.
주의: 이메일이나 비밀번호는 필요하지 않습니다. Google 앱 비밀번호나 SMTP 비밀번호를 채팅에 붙여넣지 마세요. Codex가 브라우저 쿠키나 저장소에서 토큰을 직접 찾으면 안 됩니다. 연결 토큰은 프로젝트 온보딩 세션을 시작하기 위한 값이며, 일반 API bearer token과 다릅니다.

## JoripSpace Capabilities

JoripSpace capabilities for agents:
- Shared platform policy lives in JoripSpace core contracts. Do not invent separate limits or wiring: project plans, usage storage totals, billing evidence fields, domain validation, and deletion preservation are platform rules.
- Server: write the app in the server entrypoint such as worker.js or src/index.js. Deploy with MCP deploy_code or npm run joripspace:deploy only when the user explicitly requests deployment of the current change.
- Page routing is a required build contract, not an optional recommendation. Before implementation, write a route inventory that maps every main screen named or implied by the user's menus to a distinct URL path. Examples: home -> /, booking -> /booking, reservations -> /reservations, admin -> /admin.
- A sidebar item, top navigation item, or other control that replaces the main page content represents an independent screen and must change window.location.pathname. Do not keep the address at / while JavaScript state swaps between monitoring, incidents, status, users, booking, reservations, admin, or equivalent main screens.
- Do not treat independent screens as tabs merely because they share one layout. Only temporary UI such as a modal, dropdown, accordion, or an explicitly requested in-page tab may stay on the current path.
- Every declared route must support direct access and refresh, and the active navigation state must be derived from the current URL. Back and forward navigation must restore the corresponding screen.
- Keep temporary UI state such as modals and accordions inside the current route. Put shareable search, filter, sort, pagination, or tab state in the URL query string, and use dynamic paths such as /reservations/:id for independent detail screens.
- Before completion and again before deployment, verify every route in the route inventory with available automated tests and HTTP requests: each path responds correctly, URL-based routing is implemented, and an unknown path returns a friendly not-found response. Use an interactive browser only when the user explicitly asks for browser or visual verification. If any check fails, fix it and do not deploy.
- DB: app code can use env.DB for structured records. For schema changes or data cleanup, use MCP describe_db, query_db, and run_db_migration, or the CLI db commands. A public app route such as /migrate is not the normal path because DB management tools already exist.
- DB-backed features should consider the full operating loop by default: create, list with pagination, view detail, update, delete/archive, validation, empty states, and safe admin controls unless the user explicitly scopes them out.
- Storage: app code can use env.STORAGE for uploads, generated files, and private downloads. For agent-side file checks or one-off file operations, use MCP storage tools or CLI storage commands.
- Public cache: JoripSpace safely bypasses Workers Cache unless a GET or HEAD response explicitly sets Cache-Control: public with a positive max-age or s-maxage. Use that only for public, reusable files or responses. Keep authenticated, personalized, private, or mutable responses on Cache-Control: private, no-store.
- Realtime: when the user asks to implement realtime chat, use /_joripspace/realtime?room=main and the platform-managed SQLite history/search flow by default. JoripSpace stores accepted message history, preserves room ordering, maintains FTS5 search, and records project usage automatically without asking the user to choose Cloudflare, Durable Object, or FTS5.
- Realtime storage policy: new accepted messages use application-level plaintext plain_v2 JSON in the managed room SQLite store. Legacy encrypted_v1 rows remain readable and migrate compatibly while the legacy encryption key remains available.
- Realtime data placement: never create a D1 messages/chat_history table for platform realtime history. Keep only room lists, membership, permissions, and other ordinary service records in env.DB; keep attachments in env.STORAGE.
- Realtime privacy: use opaque, unguessable room ids for private rooms, verify membership in the app before revealing a room id, and pass only an app-local opaque user id in the user query parameter. Do not put email, phone, name, or message content in room ids or URLs.
- Realtime history: read a room page from /_joripspace/realtime/rooms/{room}/messages?limit=50&before={cursor}. Do not implement a second history store or a custom Durable Object in generated app code.
- Realtime search: search the same room endpoint with search={query}, limit, and before. Search uses managed Unicode token search; do not add LIKE %query% scans or a second search index in env.DB.
- Realtime usage: duplicate message ids and retried usage event ids are idempotent. FTS5 reads/writes count as SQLite usage, search is not a message send, and compatibility migration work is not a new message send. All usage is attributed to the resolved immutable internal project id.
- Project mail: when the user asks to connect email sending, use MCP connect_mail. If it returns smtp_setup_available, send the user to the returned JoripSpace mail tab URL and have them enter the SMTP host, port, security mode, username, password or API key, and sender address in the web UI. Never ask them to paste SMTP credentials into chat. If it returns browser_google_consent_required, return the JoripSpace mail connection start URL. Wait for the user to approve or save the connection in the browser, then call get_mail_status and send_test_mail. Do not modify project source or implement a separate mail integration.
- Explain these to ordinary users as 서버, DB, 스토리지, and 실시간. Use implementation names only when code or technical debugging requires them.

## Project Plans And Limits

Project Plans And Limits:
- Project traffic and platform features are limited by the saved JoripSpace project plan.
- Free: server/API requests 10,000 per month, storage 100MB, DB 50MB, realtime messages 1,000, realtime concurrent connections 5, and no custom domains.
- Starter: server/API requests 100,000 per month, storage 1GB, DB 250MB, realtime messages 100,000, realtime concurrent connections 50, and 1 custom domain by default.
- Pro: server/API requests 300,000 per month, storage 3GB, DB 750MB, realtime messages 300,000, realtime concurrent connections 150, and 1 custom domain by default.
- Business: server/API requests 1,000,000 per month, storage 10GB, DB 2.5GB, realtime messages 1,000,000, realtime concurrent connections 500, and 1 custom domain by default.
- If included usage is exceeded, JoripSpace blocks extra runtime traffic without surprise overage billing and shows the block page with quota_blocked.
- Unlimited metered usage is OFF by default. On Starter, Pro, and Business, if unlimited metered usage is enabled, quota overage is not blocked and usage continues to be recorded in the billing ledger.
- Monthly overage budget is optional. If the budget is empty, it means no budget cap. If a budget is set, overage is allowed only until the projected monthly amount reaches that cap.
- Active unlimited-metered rates are server/API requests +100,000, realtime messages +100,000, DB storage +0.25GB, file storage +1GB, and realtime concurrent users +50.
- Speed boost is available on Starter, Pro, and Business. It has a 12,900원 monthly base fee, includes 10GB accelerated traffic, and charges extra accelerated traffic by bytes_in + bytes_out, meaning 들어온 데이터와 나간 데이터 합산.
- If a Free project tries to add a custom domain, the platform returns plan_required. Explain this as "개인 도메인은 Starter 이상에서 사용할 수 있습니다."
- Paid plans may be selectable during development even before billing automation is fully connected. Do not tell users the selection failed unless the API returns an error.
- User-facing wording: 요금제 제공량을 넘으면 추가 과금 없이 기능이 제한되고 차단 안내 페이지가 표시됩니다.

## Project Domains

Project Domains:
- Default project domains on joripspace.run are created and removed with the project lifecycle. Do not try to delete a default domain.
- Personal custom domains are available on Starter, Pro, and Business plans. Free projects return plan_required when a custom domain is added.
- The saved billing plan controls the custom-domain count. Paid plans default to one, and administrators can change the limit without changing agent instructions.
- Accept either an apex/root domain such as example.com or a subdomain such as www.example.com. The platform normalizes an apex/root input to its www subdomain, rejects wildcards, and converts Unicode IDNs to Punycode.
- A project with a custom domain must disconnect it before changing to Free.
- For non-technical users, the web UI domain tab is the easiest path. Agents may also use MCP list_domains, create_domain, verify_domain, and delete_domain, or the CLI domain commands.
- After adding a custom domain, show the project-specific CNAME target clearly and ask the user to set it at their DNS provider, then verify hostname and SSL status separately.
- Do not bypass JoripSpace by editing Cloudflare routes or custom hostnames directly. Use JoripSpace domain tools so the hostnames table, verification status, and routing stay consistent.
- User-facing wording: 개인 도메인은 Starter 이상에서 사용할 수 있습니다. example.com을 입력하면 www.example.com으로 자동 연결됩니다. 도메인을 추가한 뒤 안내된 CNAME 값을 DNS에 설정하고 상태 확인을 누르면 됩니다.

## Project Scheduled Jobs

Project scheduled jobs:
- Treat requests such as recurring, periodically, every few minutes, every day, scheduled, automatic, 주기적으로, 정기적으로, 몇 분마다, 매일, 예약 실행, or 자동 실행 as scheduled-job requests.
- A server path alone is not a completed scheduled job. Implement and test the GET or POST target path, then use list_crons and create_cron so the central JoripSpace scheduler can call it.
- Register a cron only when the user requested scheduled operation and the target path is already deployed and verified. If deployment of the current change was not explicitly requested, do not register a cron that points to undeployed code; explain that activation is waiting for deployment.
- Before creating a cron, call list_crons and avoid creating a duplicate with the same schedule, method, and path.
- After creating a cron, call run_cron for an immediate safe verification, then call list_crons again and confirm last_status and next_run_at. Inspect runtime events when the immediate run fails.
- Do not report a scheduled job as active until registration and immediate verification succeed. If registration is unavailable, state clearly that only the server path is ready and scheduled execution is not active.
- JoripSpace schedules use 5-field UTC cron expressions. Convert the user's local schedule carefully and tell the user the resulting local execution time without requiring them to understand cron syntax.

## Image And File Placement Defaults

Image and file placement defaults:
- Site design assets that are part of the source, such as hero images, section screenshots, icons, logos, and fixed example images, should usually live in the project files, for example public/images/...
- Source assets are part of the deployment source and should be included when the latest deployment is pulled or restored.
- user-uploaded files, gallery photos, attachments, generated documents, and files that change during operation should use project storage through env.STORAGE.
- For public immutable storage downloads, return Cache-Control: public, max-age=3600 or a suitable positive TTL so the platform cache can reduce User Worker CPU and R2 reads. Use a versioned key or purge the matching Cache-Tag whenever cached mutable content changes. Never mark private downloads, signed content, account pages, or authenticated API responses public.
- Store metadata such as title, description, order, owner, visibility, and storage key in env.DB.
- Do not put large file bytes into DB. Keep file bytes in project source for fixed design assets or in env.STORAGE for operational files.
- User-facing wording: 사이트 디자인에 필요한 이미지는 프로젝트 파일에 넣고, 사용자가 올리는 사진이나 첨부파일은 스토리지에 저장합니다.

## Framework Selection

Framework selection rules (agent decides internally):
- Keep the current technology stack for an existing project unless there is a concrete reason to change it.
- Use a pure Cloudflare Worker for a new, single-purpose feature with only simple request handling and no meaningful shared middleware.
- Use Hono when the service has multiple APIs or routes, or needs shared authentication, CORS, validation, error handling, middleware, or similar cross-cutting behavior.
- If routing would otherwise grow into a hand-written if/switch dispatch structure, use Hono instead.
- If the choice between a pure Worker and Hono is ambiguous, choose Hono.
- When Hono is selected for a new project, use the current stable release compatible with the project. Do not downgrade Hono merely because a bundled entrypoint uses `export { app as default }`; JoripSpace accepts valid ES module default export forms.
- Re-evaluate this choice as the service grows. If a pure Worker later reaches the Hono conditions above, migrate it to Hono during the task without asking the user to choose a framework.
- During a pure Worker to Hono migration, preserve existing URLs, request/response behavior, bindings, and user data; update dependencies and the lockfile together; then rerun relevant checks before continuing.
- A short, single-purpose service may keep its implementation in one Worker entry file.
- As routes, authentication, validation, data access, external integrations, admin features, or unrelated responsibilities grow, split the source into role-based modules such as routes, middleware, services, repositories, and utilities.
- Keep the Worker entrypoint focused on application setup and route wiring. Do not combine all implementation into worker.js merely to reduce the source file count.
- With Hono, organize route groups and shared middleware into feature-focused modules when the service has more than a trivial route set.
- Reassess module boundaries during feature work. Split modules when unrelated features change the same file repeatedly, a file becomes difficult to test safely, or responsibilities are no longer cohesive.
- Preserve existing URLs, request/response contracts, bindings, authentication behavior, and user data when splitting modules. Avoid a large refactor based only on file length.
- Multiple source modules still build and deploy as one JoripSpace Worker service; source modularization must not create extra deployed services unless the user explicitly requests that architecture.
- The user does not need to choose the file structure. The agent decides based on current complexity and likely change boundaries.
- The user does not need to know or choose the framework. Ask only when a framework change would create a genuine business, compatibility, or destructive decision that cannot be resolved safely.

## SEO And Server-Side Rendering

Server-side rendering and SEO rules (agent decides internally):
- Server-side rendering is the default for every user-facing page unless the user explicitly requests a client-only page or a concrete technical constraint makes SSR inappropriate.
- When the user explicitly requests an SPA, client-only application, WebView application, or similar app-style experience, honor that request. Do not require SSR or SEO evidence, and do not block deployment merely because the initial page is client-rendered.
- This SSR default includes public pages, login and signup, account pages, authenticated application screens, admin pages, and dashboards. Treat it as a usability and reliable-first-render requirement, not only an SEO feature.
- When the SSR default applies, every page route must return meaningful, page-specific HTML in the initial HTTP response. Do not ship an accidental empty app shell that depends on client JavaScript to create the title, navigation, form, or primary content.
- Render SSR pages on the server with the selected pure Worker or Hono stack. Do not introduce Next.js solely to obtain SSR.
- Add client-side JavaScript as progressive enhancement or hydration only where interaction needs it. Preserve useful content and navigation when hydration is delayed or unavailable.
- For public indexable routes, include a page-specific title, meta description, canonical URL, social sharing metadata when applicable, and structured data when the page type benefits from it.
- If an existing SPA is client-only by accident rather than user intent or a concrete app requirement, migrate its main routes to server-rendered initial HTML while preserving existing URLs, behavior, authentication, and user data.
- Before deployment, verify every main route follows the intended rendering mode. For SSR routes, inspect the initial HTML without browser JavaScript. For an explicitly requested SPA or WebView app, verify app startup, routing, refresh behavior, authentication, loading, empty, and error states instead.

## Build And Deployment Defaults

Build and deployment defaults:
1. For a landing page, portfolio, guide, or brochure site, render complete HTML from the selected Worker or Hono route and add plain CSS/JS as progressive enhancement.
2. When a larger UI needs React, Vue, Svelte, or similar structure, use Vite assets to hydrate server-rendered initial HTML from the pure Worker or Hono API selected by the framework rules above. Do not return a client-only empty shell.
3. Use other frameworks with a Cloudflare-compatible output only when the existing project or request clearly benefits from them.
4. Existing Next.js user-facing pages should use OpenNext or another Cloudflare-compatible SSR conversion before deployment; do not assume a normal Next.js server can be uploaded directly.
5. Use Next.js static export only when the user explicitly requests a static/client-only result or a concrete constraint makes SSR inappropriate.
6. Express, NestJS, and other long-running Node servers are not the default path. Convert them to Worker-compatible routes or explain the needed conversion.
- Do not ask the user to choose a framework or deployment target. Inspect existing code and package.json, apply the framework selection rules yourself, build locally when needed, and prepare a Worker-compatible result. Deploy it only when the user explicitly requests deployment of the current change.

GitHub automatic deployment setup:
- The web UI connects only the repository and deployment branch. It intentionally does not ask the user for build commands, artifact folders, or entrypoints.
- When a GitHub connection is waiting for agent setup, inspect the repository and choose the build command, clean artifact directory, and Worker entrypoint without asking the user platform questions.
- Copy `.joripspace/github-actions-template.yml` to `.github/workflows/joripspace-{project}.yml`, replace every `__JORIPSPACE_*__` placeholder, validate the YAML and build output, then commit and push it with the requested project work.
- Never use the repository root as the artifact directory when it would include `.git`, `node_modules`, secrets, caches, or unrelated source. Stage only deployable output in a clean directory.
- Keep `permissions: contents: read` and `id-token: write`; do not add a long-lived JoripSpace deployment token to GitHub Secrets.
- The first valid OIDC deployment changes the web connection status from agent setup pending to connected.

## Current Deployment Route

Current deployment route: direct JoripSpace deployment.
- A normal user request such as "배포해줘" is sufficient. Do not ask the user to choose GitHub or repeat deployment plumbing.
- Run the required checks, then use the JoripSpace MCP checkpoint/deployment path or the existing direct package helper as applicable.
- Do not create a GitHub Actions workflow or push to GitHub solely to deploy while the project connection is absent, disconnected, invalid, or suspended.

After MCP or CLI setup:
- At the start of each new distinct user task, call search_knowledge once with the user's plain request before answering, planning, asking questions, or starting work. Apply the returned user_guidance, recommendation, and actions to both the response and the work, including short user requests. Do not repeat the search for every follow-up in the same task unless the topic changes or current guidance is needed.
- If search_knowledge returns no direct match, use its prioritized fallback guidance and ask at most three short business questions. If the knowledge service fails, continue with the built-in JoripSpace guide and explain only when the failure blocks the task.
- Do not stop with only "yes, it is possible" or a capability checklist.
- If setup cannot continue because connect_token or api_token is missing, do not click through the browser, inspect cookies, localStorage, sessionStorage, or account pages, or attempt login automation. Tell the user exactly where to get the token and how to paste it back.
- The user does not need to say "onboarding". After connection succeeds, continue into project selection, workspace file writing, and the first service questions automatically.
- Prefer a single start_project_session tool call when it is available. It combines session lookup, project choice handling, workspace file instructions, and first questions.
- If an MCP response includes workspace_setup.files, write those files into the current working folder immediately before replying.
- If an MCP response includes local_file_operations, execute those local file writes/appends before replying to the user.
- At the start of every new distinct JoripSpace task, call prepare_project_workspace before answering, planning, asking questions, or starting work. A new chat does not prove that the local guide is current, and a same-day guide update must not be skipped. Do not use cron or ask the user to run a refresh command.
- Compare the returned AGENTS.md managed block and agent_guide.updated_at with the local JoripSpace managed block on every task-start check. When the server version is newer, the local version is missing, or the managed block content differs, replace only the JoripSpace managed block and preserve all user-authored content outside it. Upsert the returned `.env.joripspace` values without discarding unrelated entries so `JORIPSPACE_GUIDE_CHECKED_AT` records when the current server guide was confirmed. If `.joripspace/agent-session.json` uses the legacy token-bearing structure, migrate missing connection values into `.env.joripspace` first, then replace it with the returned shared token-free structure and remove its obsolete `.gitignore` entry.
- Before application work in a Git-history template project, read `.joripspace/template.json` and use the JoripSpace update check to compare its `git_head_sha` with the latest entitled version. This check must not download a bundle or modify Git. When an update exists, report its version plus the local working-tree state and ask for explicit user approval. Only after approval, run `npm run joripspace:template-pull -- --yes`; it replaces `.git/joripspace/upstream.bundle`, fetches `upstream/main`, and merges the official descendant while preserving the user `origin`. If the user declines, continue without updating. Never pull automatically and never download or merge an update automatically; when there are uncommitted changes, rewritten history, divergence, or likely conflicts, stop and explain the safe next action.
- If the current request is only to update or refresh the guide, follow the shared guide-refresh-only rules. Do not turn that maintenance request into source work, a checkpoint, Git activity, GitHub Actions, or deployment.
- When MCP connection and workspace setup succeed, run the local Git and Node.js readiness check before the first service question. Ask about installation only when a missing tool is required for the current path; otherwise continue without installation. Never ask the user to run npm or git commands, locate API environment variables, or repeat the connection token.
- Do not ask the user to paste another start prompt when you already have project context and workspace files.
- If the user has not described the service yet, immediately start with up to three short questions.
- If the user asks what to do next, do not only provide examples. Start the onboarding questions when the project is already selected.
- If the user says they do not know what to build, suggest 2-3 simple service examples and pick a practical default.
- Whenever those examples or any other concrete alternatives require the user to choose, follow the shared user choice presentation rules and show them as a Markdown table.
- End each user-facing reply with the next thing to click, check, or answer.
- If MCP tools do not appear immediately in an app, tell the user to open a new chat or restart the app, then continue from the copied start prompt.

## Prompts To Start The Build

Use these only when no MCP workspace_setup.files are available yet. If workspace_setup.files are present, write the files and begin asking questions directly instead of asking the user to paste a prompt.

### 처음부터 만들기

이 JoripSpace 프로젝트에서 만들 서비스를 MCP 기본 온보딩 순서대로 질문하면서 정리하고, 필요한 파일을 만든 뒤 배포와 확인까지 진행해 주세요.
사이트 제작과 배포에는 AI 에이전트의 기본 사이트 제작·호스팅 스킬이나 다른 플랫폼 방식을 대신 사용하지 말고, JoripSpace 프로젝트 지침과 MCP 흐름을 따라 이 JoripSpace 프로젝트에 제작·배포해 주세요.
아이디어가 아직 정리되지 않아도 됩니다. 사이트 이름, 목적, 사용자, 필요한 기능을 쉬운 예시와 짧은 질문으로 정리해 주세요.
API 키나 결제 키는 코드에 넣지 말고 JoripSpace 프로젝트 secret 또는 gitignore 처리된 로컬 파일에만 저장해 주세요.
프로젝트: abcdef

### 기존 사이트 수정

이 JoripSpace 프로젝트의 기존 사이트를 확인한 뒤, 바꾸고 싶은 내용을 짧은 질문으로 정리하고 직접 수정, 배포, 확인까지 진행해 주세요.
사이트 제작과 배포에는 AI 에이전트의 기본 사이트 제작·호스팅 스킬이나 다른 플랫폼 방식을 대신 사용하지 말고, JoripSpace 프로젝트 지침과 MCP 흐름을 따라 이 JoripSpace 프로젝트에 제작·배포해 주세요.
요청이 애매하면 쉬운 선택지 2-3개를 보여주고 안전한 기본값을 추천한 뒤 진행해 주세요.
API 키나 결제 키는 코드에 넣지 말고 JoripSpace 프로젝트 secret 또는 gitignore 처리된 로컬 파일에만 저장해 주세요.
프로젝트: abcdef

### 오류 해결 또는 배포 확인

이 JoripSpace 프로젝트에서 오류나 배포 상태를 확인하고, 로그를 직접 살펴본 뒤 수정, 재배포, 확인까지 진행해 주세요.
사이트 제작과 배포에는 AI 에이전트의 기본 사이트 제작·호스팅 스킬이나 다른 플랫폼 방식을 대신 사용하지 말고, JoripSpace 프로젝트 지침과 MCP 흐름을 따라 이 JoripSpace 프로젝트에 제작·배포해 주세요.
결과는 쉬운 말로 설명하고, 제가 다음에 눌러야 할 것, 확인할 것, 답해야 할 것만 명확히 알려주세요.
기술 로그를 직접 보라고 하거나 서버, DB, 스토리지, MCP, 배포 설정을 저에게 고르게 하지 마세요.
프로젝트: abcdef

## Payment Provider Guidance

Payment Provider Guidance:
- If the user wants payment features, explain the payment type first in plain language and send the correct JoripSpace partner signup link.
- 결제 연동을 쓰려면 안내된 링크로 가입해 주세요. 해당 링크로 가입해야 JoripSpace 연동 개발과 서비스 이용을 진행할 수 있습니다.
- 토스페이먼츠 일반결제와 빌링결제(정기결제)는 아래 조립스페이스 온보딩 링크로 가입해야 가입비가 면제되고 조립스페이스에서 이용할 수 있습니다. 토스페이먼츠 홈페이지에서 직접 가입하도록 안내하지 말고, 필요한 결제 유형을 확인한 뒤 해당 온보딩 링크로 가입하도록 안내하세요.
- 토스페이먼츠 - 일반결제: 국내 카드, 간편결제, 계좌이체 같은 1회 결제에 사용합니다. 가입 링크: https://onboarding.tosspayments.com/registration/entry/funnelmoa?utm_source=funnelmoa&utm_medium=hosting
- 토스페이먼츠 - 빌링결제(정기결제): 정기결제, 구독, 자동결제처럼 고객 카드를 등록하고 반복 청구할 때 사용합니다. 가입 링크: https://onboarding.tosspayments.com/registration/entry/funnelmoa_bill?utm_source=funnelmoa_bill&utm_medium=hosting
- 런모아 - 헤드리스 쇼핑몰: 추천 링크 https://runmoa.com/?special_referral=joripspace.com 로 가입하면 무료 포인트가 제공되어 결제 카드를 등록하지 않고 이용할 수 있습니다. 일반 가입은 결제 카드 등록이 필수입니다.
- 런모아 연동 개발 전에는 https://api-docs.runmoa.ai/ 의 최신 문서를 직접 확인합니다.
- 도도 페이먼츠 - 글로벌 SaaS 결제: 해외 고객 대상 SaaS 구독, 디지털 상품, 글로벌 카드 결제에 사용합니다. 가입 링크: https://app.dodopayments.com/partners/POhKqoePmZ/signup
- If provider credentials are not ready, build a safe payment_pending flow and explain that real payment activation needs provider signup, keys stored as project secrets, and server-side webhook verification.

## Secret And Key Handling

- Secret management link (always include this as a clickable Markdown link when an external provider credential is required): https://joripspace.com/projects/abcdef/?tab=secrets

Secret and token rules:
- When the user says a Secret or key needs to be generated, entered, added, or registered, do not stop by asking them to determine the key name or purpose. Offer to inspect the current project and handle the safe path, then ask exactly once: "제가 직접 확인하고 진행할까요?" Explain in the same reply that an internal key can be generated and registered automatically, while an external provider key may require browser assistance and a user-only authentication or value-entry step.
- After the user approves with a clear reply such as "네", "진행해", "너가 해", or "ㅇㅇ", inspect the project source, configuration, current task, and safe metadata to infer the required binding name, purpose, and whether it is internal or externally issued. Ask a follow-up question only when those facts cannot be determined safely.
- The initial Secret-work consent covers the described inspection and resulting internal generation or external browser-assisted registration. Do not ask for duplicate consent before browser assistance; first state the inferred binding names, purpose, safety boundary, and clickable Secret link, then continue. Ask new consent only if the scope materially changes.
- Never put API keys, payment keys, SMS/email keys, database URLs, or tokens in source code, README files, browser JavaScript, screenshots, chat summaries, logs, error messages, or audit metadata.
- Store external service keys used by deployed code only as JoripSpace project secrets. Only the selected project User Worker secret binding stores the value; the platform DB keeps project-scoped name, status, and lifecycle timestamps only.
- Never copy project Secret values into source code, env.DB, env.STORAGE, deployment source, checkpoint files, saved copies, logs, error messages, or audit metadata.
- Do not ask the user to paste provider Secret values into chat. Send them to the "비밀 키" tab for the selected project to register, replace, or delete the value, then use list_secrets only to confirm name, status, and timestamps. Secret values never appear in list responses or agent reports.
- Every user-facing request for an external provider credential must include a clickable Markdown link to `https://joripspace.com/projects/{project_id}/?tab=secrets`. Use the selected project slug in place of `{project_id}`. Never mention only the tab name or provide an unlinked URL.
- Before browser assistance for an external provider credential, explain the exact required binding names, what each key enables, and that Secret values must not be pasted into chat. If no Secret-work consent has been obtained yet, ask exactly one short consent question such as "제가 브라우저로 비밀 키 등록을 진행할까요?". If the user already approved "제가 직접 확인하고 진행할까요?", do not ask again.
- Treat clear affirmative replies such as "네", "진행해", "너가 해", or "ㅇㅇ" as approval for that described browser-assisted credential task only. Approval does not authorize unrelated account changes, credential rotation, billing changes, or destructive actions.
- After approval, use an available browser-control tool with the user's existing signed-in session to open the provider and selected JoripSpace project Secret pages and complete safe navigation and form steps. Never inspect cookies, localStorage, sessionStorage, saved passwords, or unrelated account pages.
- Keep provider Secret values out of chat, screenshots, shell commands, clipboard history, local files, tool summaries, and logs. If the browser environment cannot transfer a value without exposing it, or if reauthentication, MFA, CAPTCHA, credential reveal, or other user-only verification is required, stop at that exact visible step and ask the user to complete only that step in the browser. Continue automatically after the user confirms completion.
- After browser-assisted registration, call list_secrets and report only the binding name and registration status. Never repeat, reveal, compare, or summarize the Secret value.
- Store local connection secrets only in ignored files such as `.env.joripspace`. Store the JoripSpace API token only in `.env.joripspace`, never duplicate its value in JSON, TOML, source, or another session file. `.joripspace/agent-session.json` is stable token-free collaboration metadata and may be committed.
- If an MCP/CLI connect_token or api_token is missing, do not browse around, inspect cookies, read browser storage, or try profile pages to discover it. Ask the user for the MCP/CLI connection token and give the exact connection URL, token argument name, and CLI command to paste it into.
- Secret names must match [_A-Z][_A-Z0-9]* and be at most 128 characters. DB, STORAGE, PROJECT_ID and names beginning JORIPSPACE_, CF_, or CLOUDFLARE_ are reserved and must not be used.
- A project supports at most 60 active secrets, and each value must be 1-5,120 UTF-8 bytes. Use clear uppercase names such as TOSS_PAYMENTS_SECRET_KEY, TOSS_PAYMENTS_BILLING_SECRET_KEY, DODO_PAYMENTS_API_KEY, SOLAPI_API_KEY, or SOLAPI_API_SECRET.
- For app-internal random values such as session signing, CSRF protection, encryption, or test secrets, call generate_project_secret. The platform generates and stores the value directly; the agent uses only the binding name and never asks the user to enter a value.
- The project_agent connection is authorized for value-blind internal Secret generation through project.secrets.generate. It is not authorized to set, replace, read, or delete external provider Secret values.
- If generate_project_secret or another Secret registration API fails because of permission, authorization, access, or write restrictions, do not end with manual registration instructions. Include the clickable project Secret link and ask: "현재 연결 권한으로 자동 등록하지 못했습니다. 제가 브라우저로 직접 진행할까요?".
- On that fallback question, do not ask the user to invent or enter a random value yet. After approval, open the Secret page with a browser-control tool and perform every safe step available. Ask the user only at the exact user-only authentication or value-entry step if one remains.
- Treat the API failure as a change of execution path, not completion. Do not report that the Secret task is complete until list_secrets confirms the requested binding is active.
- Internal random Secret generation does not require browser assistance. When the agent independently discovers it as a normal implementation step within already approved work, it needs no separate confirmation; when the user initiates a Secret-generation request, use the one-time Secret-work consent flow above.
- Secrets are isolated by the immutable internal project id. A name or binding from one project must never be treated as available to another project.
- Normal project deployments and rollbacks preserve secret_text and secret_key bindings. Do not copy or re-upload Secret values as part of deployment source; project deletion cleans up the project Worker secrets with its metadata.
- Browser code may receive only public keys or safe redirect URLs. Server routes must handle private provider calls.

## Agent Operating Rules

- Public pricing page copy is product-approved content. Do not rename, paraphrase, reorder, or otherwise improve plan names, subtitles, benefits, prices, units, descriptions, or CTA text unless the user explicitly requests that exact change. When a pricing copy change is requested, update SSR, browser rendering, documentation, and release checks together.
- JoripSpace execution order: use MCP tools for ordinary small source operations. For generated bundles, large files, or large multi-file projects, use the package.json checkpoint/deploy helper automatically even when MCP tools are visible, because it uploads local bytes in verified chunks.
- MCP-only setup and deploy do not require Node.js or Git. Follow the local tool readiness rules: check and report both tools during onboarding, but install only a missing tool that the current project path actually requires and only after explicit user approval. Never ask the beginner to run npm or git commands.
- If a required MCP/CLI token is missing, stop setup and give precise recovery instructions instead of browsing around: open https://joripspace.com/connect/ in a logged-in browser, approve the connection, copy the displayed 5-minute connection code, then provide it as connect_token or run `joripspace login --code "복사한_연결_코드"`.
- Package helper scripts require Node.js 18 or newer, but their presence in package.json alone is not a reason to install Node.js. Use a helper when MCP is unavailable, for local checkpoint/restore/pull work, or when a generated bundle or large project must be uploaded from local bytes without inline tool transport.
- If a package helper is the only available path and Node.js is missing, use the shared readiness approval flow before installing Node.js LTS. Never make Node.js installation a prerequisite for ordinary MCP onboarding or direct MCP deploy.
- Run `npm run joripspace:doctor` when MCP is unavailable. Run `npm run joripspace:deploy -- --label "변경 내용"` when MCP is unavailable or when deploying a generated bundle, large file, or large multi-file project and Node.js is already available or the user approved its installation. Do not ask the user to choose or run the command.
- If package.json has `joripspace:pull` and the project folder has no app code, ask the user for permission and pull the latest successful deployment source before building.
- If the user asks to replace local files with the latest deployed version, run `npm run joripspace:pull:force`; this backs up overwritten files under `.joripspace/local-backups/` first.
- During initial MCP onboarding, if a successful downloadable deployment exists, automatically use the latest successful deployment as the local workspace baseline before starting work. Do not ask whether to restore and do not offer older rollback versions.
- Restore the latest deployed source into the current local workspace after backing up conflicting local files. Never overwrite `.env.joripspace`, `.joripspace/project.json`, or any token file during deployed-source restore.
- When speaking to the user, use simple product terms: say server, DB, storage, and realtime. Use implementation names only when the user asks for technical details or when writing code.
- Read `.joripspace/project.json`, `.joripspace/agent-session.json`, and `.env.joripspace` before deploying or operating the project. Shared project and guide metadata live in the JSON files; authentication values and per-collaborator guide-check time live only in `.env.joripspace`.
- A JoripSpace project should already have its server, DB, and storage prepared at project creation. Do not ask the user to choose or configure DB/storage bindings.
- Use MCP/CLI DB tools to inspect schema, run migrations, and query project data when the service needs stored records.
- Use MCP/CLI storage tools to list, read, write, and delete project files when the service needs uploads or generated files.
- Keep secrets out of git. Add provider keys through project secrets or ignored local files only.
- If dependencies are missing, detect the package manager and install what is needed yourself when it is safe. Ask the user only for paid accounts, credentials, or business decisions.
- Git is optional for ordinary JoripSpace MCP onboarding and direct MCP deployment, but required for a connected GitHub source or deployment route. If required and missing, use the shared readiness approval flow; otherwise continue without Git and do not ask the beginner to initialize, commit, fetch, or push.
- If Git is available, initialize the current project folder during onboarding when it is not already a repository. Preserve an existing repository and its history. Never initialize a parent folder or another unrelated folder.
- Before staging a deployment commit, inspect git status and the staged diff, and exclude secrets, tokens, local credential files, dependencies, build caches, and unrelated user changes. The generated `.joripspace/agent-session.json` is shared metadata and may be committed only when it contains no credential values. Never use git add -A blindly in a dirty workspace.
- Build the smallest usable version first, then improve it after testing.
- Deploy only when the user explicitly requests deployment of the current change. Otherwise run checks and save a checkpoint without deploying.
- If deploy fails with `project_resources_invalid` or `project_db_binding_invalid`, treat it as a JoripSpace project resource issue, not a user-code bug. Explain plainly that the project server/DB connection needs repair, then retry after the platform/project resources are fixed.

## Deployment Verification Gate

Deployment verification gate:
- Treat any explicit deployment request, including a short request such as "배포해줘", as authorization to deploy only after completing this verification gate. The user does not need to provide a separate testing or security-review prompt.
- Apply the current JoripSpace managed guide before deployment. Set deployment_verification.guide_applied to true, deployment_verification.agent_guide_updated_at to the exact agent_guide.updated_at returned by prepare_project_workspace, deployment_target to joripspace, external_hosting_deployment to false, and source_compatibility to joripspace_native or converted_to_joripspace. Missing, stale, or conflicting values are a blocking policy violation. If rejected as stale, refresh the workspace files and retry automatically without asking the user.
- If generic/default site-builder output exists, preserve useful UI, content, and assets and convert it automatically to JoripSpace-compatible source before checks. Do not ask the user to choose a hosting provider or repeat the original request unless a destructive or business decision is genuinely required.
- For SSR UI deployments, you may record server_rendered_html and ssr_routes as verification evidence after checking meaningful initial HTML without browser JavaScript. These fields are informational and must not block an explicitly requested SPA, client-only application, or WebView application.
- For public indexable routes, you may record seo_required, seo_routes, and seo_metadata after verifying page-specific metadata. These fields are informational and are not deployment gate requirements.
- Before deployment, inspect the completed source and verify that the requested functions are present, connected to the intended project resources, and free of known blocking errors.
- Run the relevant automated checks available in the project, including syntax, type, build, format, contract, and focused tests as applicable. Do not skip an available relevant check merely because the user asked only to deploy.
- Exercise representative user flows with automated tests, direct function calls, or HTTP requests before deployment. Verify at least the primary read flow and, when the service writes data, one safe create/update/read path plus expected validation and error behavior.
- Do not open or control a browser for routine implementation or deployment verification. Use browser-based visual or interactive verification only when the user explicitly asks for browser verification. Without such a request, inspect responsive markup and styles and use automated or HTTP checks without claiming browser verification.
- Perform a focused security review of the changed and exposed paths before deployment. Check authentication and authorization, input validation, injection and unsafe HTML risks, secret or personal-data exposure, sensitive logs/errors, destructive actions, and cache behavior where relevant.
- For a project with a user interface, record a route inventory before deployment. Classify it as single-screen or multi-screen. For multi-screen navigation, record every main path and verify pathname-based routing and direct HTTP access with automated checks. Verify browser back/forward interactively only when the user explicitly requests browser verification. A same-URL main-content swap is a blocking deployment failure.
- If any relevant check or scenario fails, fix the problem and rerun the affected checks and scenarios. Do not deploy with a known blocking functional, security, build, or responsive-layout problem.
- After deployment, verify the actual project root and main changed routes with HTTP requests or available automated checks. Test a safe write flow when applicable, and inspect runtime events when an HTTP response, function, or deployment behaves unexpectedly. Open the project in a browser only when the user explicitly requests browser verification.
- After an explicitly requested deployment succeeds and the non-browser post-deployment checks pass, commit the exact deployed project source when Git is available and there are relevant uncommitted changes. Use a concise commit message based on the completed work. Do not create an empty commit, amend an existing commit, invent Git identity, or push unless the user explicitly requested a push.
- Report which checks and scenarios passed, the deployed URL, and any verification limitation. Never report deployment or verification as successful without evidence.

## Checkpoint And Restore Rules

- After meaningful work and relevant checks, create a JoripSpace checkpoint with create_checkpoint or npm run joripspace:save when that path is available without adding unapproved tooling. Always provide a concise label describing the change. Identical content is reused instead of creating a duplicate.
- Exception for the GitHub Actions deployment route: when the current task explicitly requests deployment, do not create a separate pre-push agent checkpoint and do not run joripspace:save. Commit and push the verified source; the Actions OIDC upload creates the single deployment checkpoint. Create an additional agent checkpoint only when the user explicitly asks to save a separate snapshot without deployment.
- Saving is the default after meaningful work when MCP can complete it directly or the required local helper is already available. A local_upload_required checkpoint response must not block ordinary MCP work or direct deployment and must not trigger Node.js installation unless the user explicitly requested a standalone checkpoint, restore, or pull and approved the required helper. Do not enable, assume, or perform automatic deployment during initial onboarding.
- Deploy the saved checkpoint only when the user explicitly asks to deploy the current change or explicitly asks for completed work to be deployed automatically. Without that request, stop after creating and verifying the checkpoint.
- If tests or checks fail, do not deploy. A clearly labeled 작업 중 checkpoint may be created when preserving the current files is useful.
- Documentation-only changes create a checkpoint but do not require a server deployment. Exception: a guide-refresh-only request updates managed guide/session files without creating a checkpoint.
- Before restoring files, create a restore_safety checkpoint and a local backup under .joripspace/local-backups. Preview additions, overwrites, deletions, and protected paths first; never overwrite conflicts without approval.
- Treat local file restore and production rollback as separate confirmed actions. 이전 상태로 돌아가 means explain and confirm both independently.
- Whenever two or more restore points or rollback versions are shown, including in response to an availability or inventory question such as "복원 가능한 것들이 있나?", show them as a Markdown table with number, version or identifier, timestamp, label or status, and effect. Do not wait until the user explicitly asks to choose one.
- Never include secrets, .env files, token-bearing session files, private keys, .git, node_modules, or .wrangler in checkpoints. The generated token-free `.joripspace/agent-session.json` is shared workspace metadata.
- Prefer MCP checkpoint tools. If MCP is unavailable, use joripspace:save, joripspace:checkpoints, joripspace:restore, and joripspace:deploy-checkpoint helpers.

Framework and build priority:
Framework selection rules (agent decides internally):
- Keep the current technology stack for an existing project unless there is a concrete reason to change it.
- Use a pure Cloudflare Worker for a new, single-purpose feature with only simple request handling and no meaningful shared middleware.
- Use Hono when the service has multiple APIs or routes, or needs shared authentication, CORS, validation, error handling, middleware, or similar cross-cutting behavior.
- If routing would otherwise grow into a hand-written if/switch dispatch structure, use Hono instead.
- If the choice between a pure Worker and Hono is ambiguous, choose Hono.
- When Hono is selected for a new project, use the current stable release compatible with the project. Do not downgrade Hono merely because a bundled entrypoint uses `export { app as default }`; JoripSpace accepts valid ES module default export forms.
- Re-evaluate this choice as the service grows. If a pure Worker later reaches the Hono conditions above, migrate it to Hono during the task without asking the user to choose a framework.
- During a pure Worker to Hono migration, preserve existing URLs, request/response behavior, bindings, and user data; update dependencies and the lockfile together; then rerun relevant checks before continuing.
- A short, single-purpose service may keep its implementation in one Worker entry file.
- As routes, authentication, validation, data access, external integrations, admin features, or unrelated responsibilities grow, split the source into role-based modules such as routes, middleware, services, repositories, and utilities.
- Keep the Worker entrypoint focused on application setup and route wiring. Do not combine all implementation into worker.js merely to reduce the source file count.
- With Hono, organize route groups and shared middleware into feature-focused modules when the service has more than a trivial route set.
- Reassess module boundaries during feature work. Split modules when unrelated features change the same file repeatedly, a file becomes difficult to test safely, or responsibilities are no longer cohesive.
- Preserve existing URLs, request/response contracts, bindings, authentication behavior, and user data when splitting modules. Avoid a large refactor based only on file length.
- Multiple source modules still build and deploy as one JoripSpace Worker service; source modularization must not create extra deployed services unless the user explicitly requests that architecture.
- The user does not need to choose the file structure. The agent decides based on current complexity and likely change boundaries.
- The user does not need to know or choose the framework. Ask only when a framework change would create a genuine business, compatibility, or destructive decision that cannot be resolved safely.

Server-side rendering and SEO rules (agent decides internally):
- Server-side rendering is the default for every user-facing page unless the user explicitly requests a client-only page or a concrete technical constraint makes SSR inappropriate.
- When the user explicitly requests an SPA, client-only application, WebView application, or similar app-style experience, honor that request. Do not require SSR or SEO evidence, and do not block deployment merely because the initial page is client-rendered.
- This SSR default includes public pages, login and signup, account pages, authenticated application screens, admin pages, and dashboards. Treat it as a usability and reliable-first-render requirement, not only an SEO feature.
- When the SSR default applies, every page route must return meaningful, page-specific HTML in the initial HTTP response. Do not ship an accidental empty app shell that depends on client JavaScript to create the title, navigation, form, or primary content.
- Render SSR pages on the server with the selected pure Worker or Hono stack. Do not introduce Next.js solely to obtain SSR.
- Add client-side JavaScript as progressive enhancement or hydration only where interaction needs it. Preserve useful content and navigation when hydration is delayed or unavailable.
- For public indexable routes, include a page-specific title, meta description, canonical URL, social sharing metadata when applicable, and structured data when the page type benefits from it.
- If an existing SPA is client-only by accident rather than user intent or a concrete app requirement, migrate its main routes to server-rendered initial HTML while preserving existing URLs, behavior, authentication, and user data.
- Before deployment, verify every main route follows the intended rendering mode. For SSR routes, inspect the initial HTML without browser JavaScript. For an explicitly requested SPA or WebView app, verify app startup, routing, refresh behavior, authentication, loading, empty, and error states instead.

Build and deployment defaults:
1. For a landing page, portfolio, guide, or brochure site, render complete HTML from the selected Worker or Hono route and add plain CSS/JS as progressive enhancement.
2. When a larger UI needs React, Vue, Svelte, or similar structure, use Vite assets to hydrate server-rendered initial HTML from the pure Worker or Hono API selected by the framework rules above. Do not return a client-only empty shell.
3. Use other frameworks with a Cloudflare-compatible output only when the existing project or request clearly benefits from them.
4. Existing Next.js user-facing pages should use OpenNext or another Cloudflare-compatible SSR conversion before deployment; do not assume a normal Next.js server can be uploaded directly.
5. Use Next.js static export only when the user explicitly requests a static/client-only result or a concrete constraint makes SSR inappropriate.
6. Express, NestJS, and other long-running Node servers are not the default path. Convert them to Worker-compatible routes or explain the needed conversion.
- Do not ask the user to choose a framework or deployment target. Inspect existing code and package.json, apply the framework selection rules yourself, build locally when needed, and prepare a Worker-compatible result. Deploy it only when the user explicitly requests deployment of the current change.

## Package Helper Fallback

These scripts are fallback tools for environments where MCP is unavailable or a local checkpoint, restore, pull, or framework build specifically requires them:
They require Node.js 18 or newer. Do not install Node.js merely because these scripts exist. If a helper is the only available path, explain why and ask permission before installing Node.js LTS.

- `npm run joripspace:doctor`: check JoripSpace project connection, token, package scripts, and deploy entrypoint.
- `npm run joripspace:save`: create an encrypted checkpoint without changing the running server.
- `npm run joripspace:checkpoints`: list recent checkpoints.
- `npm run joripspace:restore -- --checkpoint CHECKPOINT_ID`: preview a local restore. Add `--apply` only after approval.
- `npm run joripspace:deploy-checkpoint -- --checkpoint CHECKPOINT_ID`: deploy one selected checkpoint.
- `npm run joripspace:deploy`: save the current files and deploy that exact checkpoint.
- `npm run joripspace:pull`: download the latest successful deployed server source into an empty or safe folder.
- `npm run joripspace:pull:force`: back up conflicting local files, then replace them with the latest successful deployed server source.
- `npm run joripspace:install-template -- --template TEMPLATE_SLUG --project PROJECT_ID --dir .`: install a selected onboarding template without exposing the local token or overwriting collisions.
- Git-history installation downloads an entitlement-checked Git Bundle without revealing the publisher repository URL. The local `upstream` remote always points to `.git/joripspace/upstream.bundle`; an optional user GitHub `origin` remains unchanged.
- `npm run joripspace:template-pull -- --template TEMPLATE_SLUG --project PROJECT_ID --dir .`: check whether an entitled update exists without downloading it. When one exists, show it and obtain user approval; rerun with `--yes` only after approval to download, fetch, and merge it.
- Template updates use `upstream/main`. Do not configure the current branch to track `upstream`, do not run plain `git pull` for official updates, and never push to `upstream`; `origin` remains exclusively for the user repository.
- `npm run deploy`: may point to the same helper if the project did not already define its own deploy script.

If MCP tools are visible, prefer MCP. If not, use these package.json scripts directly. Do not ask the user to provide a deployment command.
Never overwrite local project files during pull unless the user explicitly asked to replace them or approved the force mode.

## Project Brief

Update this section as the service becomes clearer.

- Core pages:
- Core data:
- Admin/owner features:
- Payment/message providers:
- Open questions:

<!-- joripspace:managed:end -->
