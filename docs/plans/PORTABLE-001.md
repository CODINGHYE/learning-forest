# PORTABLE-001 — 각 컴퓨터 로컬 실행과 비공개 GitHub 업로드

- 상태: 로컬 준비 완료·GitHub 코드 업로드 중
- 시작 코드 버전: `78128d6`
- 대상: 설치·실행 진입점, 문서·의존성, 휴대 가능한 검증, GitHub 저장소

## 목표와 완료 조건

- 사용자의 GitHub 계정에 `learning-forest` 비공개 저장소를 만들고 최신 코드를 업로드한다. 웹 서비스 배포는 하지 않는다.
- Python 3.11+ 환경에서 Windows·macOS·Linux 실행 진입점을 제공한다. 일반 실행에 Node.js·Codex·학원 교재 원본을 요구하지 않는다.
- 실행 의존성과 개발 의존성을 분리하고 초기 설치·포트 변경·종료·API 연결 방법을 안내한다.
- 저장소 전체 기록에서 실제 키·교재·환경 파일·임시 도구의 업로드 여부를 확인한다. 원본 PDF 검사는 명시적 선택 검사로 분리한다.
- 깨끗한 소스 복사본에서 초기 환경 준비·로컬 HTTP를 확인하고 전체 검증을 실행한다. 다른 OS의 실제 실행과 현재 PC 검증을 구분한다.

## 진행·결정

- 사용자가 새 저장소 이름 `learning-forest`, 비공개를 선택했다.
- 기존 원격 저장소·인증 CLI가 없어 공식 GitHub CLI를 ignored tmp에 다운로드하고 공식 SHA-256과 대조했다. 사용자는 기기 인증을 직접 진행한다.
- API 키는 각 사용자가 앱에 입력한다. 현재 사용자의 서버·개인 API 연결은 재시작하지 않는다.

## 결과

- 구현: run.py, Windows start.bat, macOS/Linux start.sh. 일반 실행은 Python·pypdf만 사용하고 개발 의존성은 requirements-dev.txt로 분리. 기본 모델 gpt-4o-mini 유지
- 검증: Windows의 깨끗한 소스 복사본에서 .venv 생성·pypdf 설치·로컬 HTTP 200·키 없이 상태 조회 확인. 수치 9개·Python 43개·브라우저 13개 실험/5개 폭 전체 검사 통과. macOS/Linux 실제 장비는 미검증
- 저장소: https://github.com/CODINGHYE/learning-forest, 비공개 확인. 코드 업로드 진행 중
- 자료 검사: 기존 Git 기록의 텍스트/바이너리 146개 blob에서 실제 키 의심 패턴 없음. 교재·노트북·환경 파일·임시 CLI·QA·가상환경 제외
- 배포: 미실시
