# 배움의 숲 앱

PDF에서 질문 지도를 만들고 지원하는 학습 장면과 근거 페이지를 살펴보는 한국어 로컬 시제품이다. 기본 예시는 큰 질문 4개·작은 질문 13개다.

## 실행

프로젝트 루트에서 Python 의존성을 준비한 뒤 실행한다.

```powershell
python -m pip install -r requirements.txt
python learning-forest/server.py --port 4173
```

이 폴더에서 실행한다면 `python server.py --port 4173`이다. Python 실행 경로는 환경에 맞게 사용한다. `http://127.0.0.1:4173`은 이 PC에서만 접근할 수 있다.

PDF 분석은 이 서버가 필요하다. `dist/index.html`을 파일로 직접 여는 대신 위 로컬 주소를 사용한다. `python -m http.server --directory dist` 같은 정적 서버는 예시 화면만 제공하며 PDF 분석 API를 제공하지 않는다.

## 지도와 개인 학습 기록

상단 큰 질문에서 세부 질문을 고르면 아래 상세 카드의 3D 실험·쉬운 설명으로 이동한다. 이전·다음 질문 이동과 직접 이해 표시를 제공한다. 진도는 직접 이해 표시한 질문의 비율이며 객관적 평가가 아니다.

메모와 이해 표시는 PDF 내용으로 구분해 이 브라우저의 localStorage에 저장한다. 브라우저 데이터를 지우면 사라지며 다른 기기와 동기화하지 않는다. 업로드한 PDF의 원문은 저장소에 보관하지 않는다. 저장이 막히면 현재 페이지 세션 동안 유지하고 화면에서 알린다.

둥근 한글 글꼴은 로컬 `dist/fonts/`의 나눔스퀘어라운드 400·700·800이다. 출처와 OFL은 같은 폴더에 보존한다. 전체 배치는 `roadmap.css`, 역할별 글자 크기·색·굵기는 `typography.css`에서 관리한다.

## PDF 분석과 데이터 흐름

- 로컬 분석이 기본이다. 선택한 PDF를 이 PC의 로컬 서버로 전송하고 텍스트에서 개념 또는 제목을 찾는다. 원문 페이지·발췌와 검토된 보충 설명을 연결하며 PDF를 디스크에 저장하지 않는다.
- OpenAI 분석은 서버에 키가 설정된 경우 화면에서 명시적으로 선택한다. 추출한 텍스트를 OpenAI API로 전송한다. 실제 모델 호출·생성 품질은 이번 하네스에서 검증하지 않았다.
- 선택 설정은 이 폴더의 `.env.example`을 참고해 `.env`에 둔다. 키는 브라우저 코드와 Git에 넣지 않는다.
- 지원 장면만 기존 Q ID로 연결한다. 미지원 개념은 쉬운 설명·원문 근거·장면 미지원 안내를 제공한다. 임의의 3D 실험 코드를 생성하지 않는다.
- 30MB·400쪽 이하, 텍스트 추출 가능한 PDF를 대상으로 한다. 스캔 PDF에는 별도 OCR이 필요하다.
- 예시 지도 복귀 버튼으로 원래 13개 질문으로 돌아갈 수 있다. 분석 실패 시 기존 지도를 유지한다.

원본 교재와 노트북은 배포하지 않는다. 로컬 분석의 개념 연결과 설명은 보충 자료이며, 다양한 실제 교재의 추출 품질과 학습 효과는 별도 평가한다.

## 수정과 검증

- [콘텐츠 원칙](../docs/CONCEPT_MAP_PRINCIPLES.md), [질문 설계](../docs/QUESTION_SCENARIOS.md)를 먼저 읽는다.
- 제목·목표·화면 설명·출처·다음 질문은 설계서가 원본이다. `content/review.json`은 요약·안내·범례·용어 등 UI 보조 문구만 관리한다.
- 원본 수정 후 `python learning-forest/scripts/build_content.py`를 루트에서 실행한다. `dist/content.js`만 생성 파일이며 나머지 dist 파일은 현재 직접 수정하는 소스다.
- 수치는 `dist/math.js`, Canvas 투영은 `dist/scene.js`, 화면·PDF 전환은 `dist/app.js`, 분석은 `pdf_analysis.py`와 `server.py`가 담당한다.
- 루트에서 `.\verify.ps1`로 전체 검증한다. 환경과 결과 해석은 [개발 README](../README.md), [하네스 운영](../docs/HARNESS.md)을 따른다.

3D는 Canvas에 좌표를 투영한다. PyTorch 표현은 참조 코드이며 브라우저에서 PyTorch를 실행하지 않는다.

## 현재 상태

기능별 설계·구현·검증 상태는 [STATUS](../docs/STATUS.md), 최근 디자인 적용은 [DESIGN-001](../docs/plans/DESIGN-001.md), 검증 운영은 [HARNESS-001](../docs/plans/HARNESS-001.md)이 기준이다. 과거 `qa-output/report.json`은 이전 화면의 기록이다. 현재 근거는 통합 실행이 생성한 `qa-output/verification.json`이다.

배포·공유 링크 생성·외부 접속 검증은 보류 중이다. 호스팅 메타데이터는 로컬 `.openai/hosting.json`에 보존하며 현재 배포 완료로 보고하지 않는다.
