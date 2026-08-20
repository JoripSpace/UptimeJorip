# UptimeJorip

JoripSpace에서 실행되는 서비스 가동 상태 모니터링 프로젝트입니다.

## 주요 기능

- 서비스 상태 모니터링과 수동 점검
- 점검 로그 및 장애 이력 관리
- 공개 상태 페이지
- 최초 관리자 계정 설정
- 로그인과 선택적 공개 회원가입
- 관리자용 사용자 및 가입 정책 관리

## 로컬 검사

```bash
npm install
npm run typecheck
npm test
npm run joripspace:doctor
```

JoripSpace 프로젝트 ID는 `abcdef`이며, 사용자에게 표시되는 서비스 이름은 `UptimeJorip`입니다.
