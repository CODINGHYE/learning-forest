"""Generate browser content from the reviewed question design; no notebook execution."""
import json
import re
from pathlib import Path

project = Path(__file__).resolve().parents[1]
design = (project.parent / 'docs/QUESTION_SCENARIOS.md').read_text(encoding='utf-8')
groups = [
    {'id': 'G1', 'title': '예시를 보면 무엇을 배울까?', 'short': '예시에서 배우기', 'intro': '예시를 보여주면 무엇을 바꾸는지 살펴봅니다.', 'preview': 'Q1.2'},
    {'id': 'G2', 'title': '못 푸는 문제는 어떻게 풀까?', 'short': '표현을 바꾸기', 'intro': '같은 입력도 중간 계산을 거치면 구분하기 쉬워질 수 있습니다.', 'preview': 'Q2.2'},
    {'id': 'G3', 'title': '틀린 답을 어떻게 고칠까?', 'short': '틀린 답 고치기', 'intro': '틀린 정도를 재고, 바꿀 방향을 계산한 뒤, 실제 값을 고칩니다.', 'preview': 'Q3.4'},
    {'id': 'G4', 'title': '계산이 많아지면 어떻게 할까?', 'short': '도구와 함께 계산하기', 'intro': '숫자들을 묶고 계산 과정을 기록해, 반복하는 계산을 도구에 맡깁니다.', 'preview': 'Q4.1'},
]

def field(section, label):
    match = re.search(r'^- ' + re.escape(label) + r':\s*(.+)$', section, re.M)
    return match.group(1).strip().strip("'") if match else ''

questions = []
review = json.loads((project / 'content/review.json').read_text(encoding='utf-8'))
pattern = r'^### (Q\d\.\d) - (.+)\n([\s\S]*?)(?=^### |^## |\Z)'
for match in re.finditer(pattern, design, re.M):
    qid, title, section = match.groups()
    quote = re.search(r'^  > (.+)$', section, re.M)
    source = re.search(r'^- 교재(?:·실습)? 연결?:\s*(.+)$', section, re.M)
    if source is None:
        source = re.search(r'^- 교재·실습:\s*(.+)$', section, re.M)
    source_text = source.group(1) if source else ''
    pages = re.search(r'PDF (\d+)', source_text)
    links = list(dict.fromkeys(re.findall(r'Q\d\.\d', field(section, '연결'))))
    entry = {
        'id': qid, 'group': 'G' + qid[1], 'title': title,
        'goal': field(section, '목표'), 'predict': field(section, '예상 질문'),
        'explain': quote.group(1) if quote else '', 'terms': field(section, '이름 붙이기'),
        'check': field(section, '이해 확인'), 'next': links,
        'source': source_text, 'page': int(pages.group(1)) if pages else None,
        'caution': field(section, '주의'),
    }
    entry['review'] = review[qid]
    entry['explain'] = ' '.join(review[qid]['explain'])
    entry['sceneId'] = qid
    questions.append(entry)
assert len(questions) == 13
assert all(q['explain'] and q['source'] for q in questions)
data = {'groups': groups, 'questions': questions, 'version': '0.3.0'}
(project / 'dist').mkdir(exist_ok=True)
(project / 'dist/content.js').write_text('globalThis.ForestContent = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print(f'Generated {len(questions)} questions from the design document.')
