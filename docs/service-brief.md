# Service Brief

- Service name: UptimeJorip
- JoripSpace project ID: abcdef
- Description: 서비스 가동 상태, 점검 기록, 장애 이력을 관리하는 모니터링 서비스
- Main features:
- Login/membership:
- Payment/email/file upload/admin:
- Main route inventory (screen -> URL):

Update this file one answer at a time during onboarding.


## Route inventory

- 최초 관리자 설정: /setup
- 로그인: /login
- 회원가입: /signup
- 가입 정책 설정: /auth-settings
- 모니터링: /monitors
- 모니터 상세: /monitors/:id
- 점검 로그: /logs
- 장애 기록: /incidents
- 상태 페이지 관리: /status-page
- 사용자 관리: /users
- 공개 상태 페이지: /status

## Membership

- 첫 설치 시 최초 계정은 관리자 역할로 생성합니다.
- 공개 회원가입은 기본 비활성화이며 관리자가 가입 설정에서 켤 수 있습니다.
- 공개 가입 계정은 관찰자 역할로 시작하며 관리자 권한을 요청으로 획득할 수 없습니다.

## Demo mode

- 모든 방문자는 별도 로그인 없이 `demo` 관리자로 접속합니다.
- 모니터 4개, 점검 로그 6개, 장애 기록 3개, 사용자 2개와 최근 응답시간 표본을 기본 제공합니다.
- 방문자가 만든 데이터와 변경 사항은 한국시간 기준 다음 날 00:00에 샘플 상태로 초기화합니다.
- 중앙 스케줄러는 `POST /_joripspace/cron/demo-reset`을 호출하며, 첫 방문 시 날짜 검사도 같은 초기화를 보장합니다.
