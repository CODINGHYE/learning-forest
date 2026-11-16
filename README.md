# 배움의 숲 개발 프로젝트

PDF의 개념을 질문 지도와 검증된 학습 장면으로 연결하는 로컬 웹 시제품이다.

- 현재 상태와 미검증 범위: [STATUS](docs/STATUS.md)
- 개발·검증·오류 수정 절차: [HARNESS](docs/HARNESS.md)
- 학습 콘텐츠 원칙: [CONCEPT_MAP_PRINCIPLES](docs/CONCEPT_MAP_PRINCIPLES.md)
- 질문과 장면의 기준: [QUESTION_SCENARIOS](docs/QUESTION_SCENARIOS.md)
- 앱 실행 안내: [learning-forest README](learning-forest/README.md)
- 작업 계획 양식: [TEMPLATE](docs/plans/TEMPLATE.md)

## 통합 검증

프로젝트 루트에서 실행한다. 스크립트는 다른 작업 폴더에서도 절대 경로로 호출할 수 있다.

```powershell
.\verify.ps1
```

Windows 실행 정책으로 차단되면 다음 명령을 사용한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify.ps1
```

빠른 확인은 `.\verify.ps1 -Quick`. 브라우저를 생략한 결과는 `partial`로 남으며 전체 검증 완료로 취급하지 않는다. Python이 PATH에 있으면 다른 운영체제에서도 `python scripts/verify.py`로 동일한 검증기를 실행할 수 있다.

전체 검증은 문서 연결·콘텐츠 생성 일치·JavaScript 구문·수치·Python/API·브라우저 흐름을 확인한다. 생성 파일을 수정하지 않으며, 별도 포트에서 시작한 서버만 종료한다. 결과는 `learning-forest/qa-output/verification.json`과 단계별 로그·스크린샷에 저장한다. 유료 API는 호출하지 않는다.

## 개발 환경

Python 3.11 이상, Node.js 20 이상, Git, Playwright와 Chromium 또는 설치된 Edge/Chrome이 필요하다. 일반 환경에서는 다음과 같이 준비한다. 다운로드는 검증 명령에서 자동 실행하지 않는다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
npx playwright install chromium
```

Codex 데스크톱에서는 번들 Python·Playwright와 설치된 브라우저를 자동 탐색한다. 별도 환경은 `FOREST_PYTHON`, `FOREST_PLAYWRIGHT_PATH`, `FOREST_BROWSER_EXE`로 지정할 수 있다. Playwright 패키지는 프로젝트 설치를 우선한다. 버전 기준은 `requirements.txt`, `package.json`에 고정했다.

## Git 기준

이 폴더의 Git이 문서와 앱을 함께 관리한다. 기준 커밋은 `84f485b`, 하네스 작업 브랜치는 `codex/harness-management`다. 기존 내부 저장소는 커밋·remote가 없음을 확인하고 메타데이터를 `tmp/git-metadata-backup/learning-forest.git`로 보존했다. 복구 기록은 [작업 기록](docs/plans/HARNESS-001.md)을 참조한다.

`.env`, 임시 자료, 원본 교재, QA 산출물, 호스팅 로컬 메타데이터는 커밋하지 않는다. `dist`는 현재 앱의 직접 수정 소스이며, 그중 `content.js`만 생성 파일이다. 배포는 현재 보류 상태다.
