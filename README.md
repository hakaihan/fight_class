# fight_class

Hello 버튼을 누르면 Score가 1씩 올라가는 간단한 프론트엔드 앱입니다.

- `index.html`: 앱 전체 (HTML/CSS/JS, 별도 빌드 과정 없음)
- `.github/workflows/deploy-pages.yml`: GitHub Actions로 GitHub Pages에 자동 배포하는 워크플로우

## 배포

`main` 브랜치(또는 `claude/repo-permissions-check-llt7ab`)에 푸시되면 GitHub Actions가 자동으로 GitHub Pages에 배포합니다.
저장소 Settings > Pages에서 Source가 "GitHub Actions"로 설정되어 있어야 합니다.
