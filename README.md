# 배움의 숲 · Learning Forest

수업 PDF를 개인 OpenAI API로 분석해 전체 흐름과 개념의 뜻·용도·연결 이유를 살펴보는 한국어 학습 도구입니다. 필요한 경우에만 3D 예제나 연결 그림을 엽니다.

비공개 저장소: [CODINGHYE/learning-forest](https://github.com/CODINGHYE/learning-forest)

Git으로 받는 경우:

```sh
git clone https://github.com/CODINGHYE/learning-forest.git
cd learning-forest
```

## 각 컴퓨터에서 실행하기

필요한 것은 **Python 3.11 이상(권장 3.12)**과 인터넷 연결입니다. 일반 사용에는 Node.js·Codex·PyTorch·GPU가 필요하지 않습니다.

1. 이 비공개 저장소의 접근 권한을 받은 계정으로 소스를 clone하거나 **Code → Download ZIP**으로 받아 압축을 풉니다.
2. [Python 공식 다운로드](https://www.python.org/downloads/)에서 Python을 설치합니다. Windows에서는 설치 시 Python을 PATH에 추가합니다.
3. 프로젝트 폴더에서 아래 방법으로 실행합니다.

**Windows**

`start.bat`를 실행하거나 터미널에서:

```powershell
py -3 run.py
```

**macOS · Linux**

```sh
sh start.sh
```

또는 `python3 run.py`를 실행합니다. Linux에서 가상환경 생성 오류가 나면 해당 배포판의 Python venv·pip 패키지를 설치한 뒤 다시 실행합니다.

첫 실행은 프로젝트 안에 `.venv`를 만들고 `requirements.txt`의 실행 패키지를 설치합니다. 다음 실행에서는 준비된 환경을 재사용합니다. 프로젝트를 이동했다면 기존 `.venv`를 사용하지 말고 새 폴더에서 다시 준비합니다.

4. 터미널에 표시된 **http://127.0.0.1:4173**을 브라우저로 엽니다.
5. 앱의 **내 OpenAI 연결**에 본인의 API 키를 입력하고 PDF를 올립니다. 기본 모델은 `gpt-4o-mini`입니다.

실행 중에는 터미널 창을 열어둡니다. 종료는 **Ctrl+C**입니다. HTML 파일 직접 열기나 GitHub Pages는 PDF 분석 서버를 제공하지 않습니다. 이 저장소 업로드는 웹 서비스 배포가 아닙니다.

## 실행 옵션과 문제 해결

```sh
python run.py --check
python run.py --port 4174
```

- `--check`: 필요한 환경을 준비·확인하고 서버를 시작하지 않습니다.
- 포트가 사용 중이면 `--port 4174`처럼 바꾸고 출력된 주소로 접속합니다.
- macOS·Linux에서는 `python` 대신 `python3`, Windows에서는 필요하면 `py -3`을 사용합니다.
- `Failed to fetch` 안내가 나오면 실행 창이 켜져 있는지, 파일 주소 대신 출력된 로컬 주소를 열었는지 확인합니다.
- 초기 패키지 다운로드가 실패하면 인터넷·프록시 설정과 폴더 쓰기 권한을 확인합니다. 일반 실행 패키지는 pypdf 하나입니다.
- 실행 패키지를 직접 설치한 환경에서는 `python run.py --no-install`을 사용할 수 있습니다.

## 개인 키와 자료

각 사용자가 **자신의 API 키**를 앱에서 연결합니다. GitHub 로그인은 소스를 받기 위한 것이고 OpenAI API 연결과 별개입니다. OpenAI API 요금은 각 키의 프로젝트에 청구되며 ChatGPT 구독과 별개입니다.

키는 각 PC 서버의 메모리에 최대 1시간만 보관하며 해제·만료·서버 종료 시 지웁니다. 코드·Git·브라우저 저장소에 키를 넣지 않습니다. 각 컴퓨터의 연결·메모는 서로 동기화되지 않습니다.

PDF 분석은 텍스트를 OpenAI로 전달합니다. PDF 원본은 서버 디스크나 Git에 보관하지 않습니다. 교재·노트북·개인 `.env`·가상환경·임시 파일은 업로드 대상에서 제외합니다. 현재 PC 안에서만 서버를 열며 다른 컴퓨터도 자신의 로컬 서버를 실행합니다.

## 개발·검증

일반 실행에는 아래 개발 도구가 필요하지 않습니다. 개발 검증에는 Python 3.11+, Node.js 24 권장, Git, Playwright/Chromium이 필요합니다.

```sh
python -m pip install -r requirements-dev.txt
npm install
npx playwright install chromium
python scripts/verify.py
```

가상환경을 사용한다면 그 환경의 Python으로 설치·검증합니다. Windows의 `.\verify.ps1`, 모든 OS의 `npm run verify`도 같은 검사로 연결됩니다. 다른 Python이 필요하면 `FOREST_PYTHON`을 지정합니다.

검증은 합성 PDF·모의 OpenAI를 사용하며 유료 API를 호출하지 않습니다. 실제 교재 원본은 필요하지 않습니다. 실제 교재의 92쪽·32개 주제를 따로 확인할 때만 다음 선택 검사를 실행합니다.

```sh
python scripts/check_reference_pdf.py "path/to/Deep Learning Basics.pdf" --expect-pages 92 --expect-concepts 32
```

최신 결과는 `learning-forest/qa-output/verification.json`입니다. 다른 OS용 실행 진입점을 제공하되 실제 검증한 환경과 미검증 환경은 [현재 상태](docs/STATUS.md)에 구분합니다.

## 프로젝트 문서

- [전체 목표·완료/미완료 계획](docs/ROADMAP.md)
- [현재 상태와 확인 범위](docs/STATUS.md)
- [UI·기능 개선 검토](docs/UI_REVIEW.md)
- [콘텐츠 작성 원칙](docs/CONCEPT_MAP_PRINCIPLES.md)
- [질문·시각화·보충 설명 설계](docs/QUESTION_SCENARIOS.md)
- [개발 하네스 운영](docs/HARNESS.md)
- [앱의 데이터 흐름·기능 한계](learning-forest/README.md)

학습자 이해도·다양한 교재 품질·OCR·분석 결과 저장/복원은 별도 개선 대상입니다. 둥근 한글 글꼴의 출처와 OFL은 `learning-forest/dist/fonts/`에 포함합니다.
