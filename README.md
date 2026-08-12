# fight_class

Hello 버튼을 누르면 Score가 1씩 올라가는 간단한 프론트엔드 앱입니다.

- `index.html`: 앱 전체 (HTML/CSS/JS, 별도 빌드 과정 없음)
- `wrangler.jsonc`: Cloudflare Workers(정적 자산) 배포 설정
- `.github/workflows/deploy-cloudflare.yml`: GitHub Actions로 Cloudflare Workers에 자동 배포하는 워크플로우

## 로컬 개발 / 배포 (Wrangler CLI)

Claude Code 플러그인이나 MCP 없이, Wrangler CLI만으로 진행합니다.

```bash
# 1) Wrangler 설치 (v4 이상). 프로젝트에 devDependency로 고정하는 걸 권장합니다.
npm install -D wrangler@latest

# 2) Cloudflare 계정으로 로그인 (브라우저 OAuth 창이 뜹니다)
npx wrangler login
npx wrangler whoami   # 로그인 확인

# 3) 로컬에서 미리 보기
npx wrangler dev

# 4) Cloudflare에 배포
npx wrangler deploy
```

배포가 끝나면 터미널에 `https://fight-class.<your-subdomain>.workers.dev` 형태의 URL이 출력됩니다.

## GitHub Actions로 자동 배포

`main` 브랜치(또는 `claude/repo-permissions-check-llt7ab`)에 푸시되면 `.github/workflows/deploy-cloudflare.yml`이 `wrangler deploy`를 실행해 Cloudflare Workers에 배포합니다.

저장소 **Settings > Secrets and variables > Actions**에 아래 두 개를 등록해야 합니다:

| Secret | 값 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [Workers 배포 권한을 가진 API 토큰](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) (Edit Cloudflare Workers 템플릿 권장) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 대시보드 우측 사이드바에서 확인 가능한 계정 ID |

CI는 대화형 로그인을 할 수 없으므로 `wrangler login` 대신 API 토큰을 사용합니다 (`cloudflare/wrangler-action`이 이를 처리합니다).

## 백엔드(Firebase 대체)를 추가할 때

지금은 순수 정적 파일이라 백엔드가 없지만, 나중에 점수 저장 등을 추가하려면:

- 단순 키-값 저장 → `npx wrangler kv namespace create SCORES` 로 KV 네임스페이스 생성 후 `wrangler.jsonc`의 `kv_namespaces`에 바인딩
- 관계형/쿼리가 필요하면 → `npx wrangler d1 create fight-class-db` 로 D1 데이터베이스 생성 후 `d1_databases`에 바인딩
- 이 경우 정적 자산만 서빙하던 지금 구성에서 `main`(Worker 스크립트)을 추가해 `env.ASSETS.fetch(request)`로 정적 파일을 서빙하면서 `/api/*` 요청만 직접 처리하는 방식으로 확장합니다.
