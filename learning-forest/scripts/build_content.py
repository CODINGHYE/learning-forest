"""Build browser content from the canonical design and UI metadata; --check never writes."""
import argparse
import json
import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
EXPECTED_IDS = [f'Q{g}.{n}' for g, count in [(1, 3), (2, 3), (3, 4), (4, 3)] for n in range(1, count + 1)]
GROUP_META = [('예시에서 배우기', 'Q1.2'), ('표현을 바꾸기', 'Q2.2'), ('틀린 답 고치기', 'Q3.4'), ('도구와 함께 계산하기', 'Q4.1')]


def field(section, label):
    match = re.search(r'^- ' + re.escape(label) + r':\s*(.+)$', section, re.M)
    return match.group(1).strip().strip("'") if match else ''


def build_content(design, review):
    groups = []
    for i, (short, preview) in enumerate(GROUP_META, 1):
        match = re.search(r'^\| G' + str(i) + r' \| ([^|]+) \| [^|]+ \| ([^|]+) \|$', design, re.M)
        if not match:
            raise ValueError(f'Missing group G{i} in design table')
        groups.append({'id': f'G{i}', 'title': match[1].strip(), 'short': short, 'intro': match[2].strip(), 'preview': preview})
    questions = []
    pattern = r'^### (Q\d+\.\d+) - (.+)\n([\s\S]*?)(?=^### |^## |\Z)'
    for match in re.finditer(pattern, design, re.M):
        qid, title, section = match.groups()
        paragraphs = re.findall(r'^  > (.+)$', section, re.M)
        source = re.search(r'^- 교재(?:·실습)?(?: 연결)?:\s*(.+)$', section, re.M)
        if not paragraphs or not source:
            raise ValueError(f'{qid}: missing explanation or source')
        if qid not in review or {'explain', 'predict'} & set(review[qid]):
            raise ValueError(f'{qid}: UI metadata missing or duplicates canonical explanation/prediction')
        metadata = dict(review[qid], explain=paragraphs)
        for key in ('takeaway', 'instruction', 'legend', 'terms', 'bridge'):
            if not metadata.get(key):
                raise ValueError(f'{qid}: missing UI metadata {key}')
        source_text = source[1].strip()
        pages = re.search(r'PDF (\d+)', source_text)
        entry = {'id': qid, 'group': 'G' + qid[1], 'title': title,
                 'goal': field(section, '목표'), 'predict': field(section, '예상 질문'),
                 'explain': ' '.join(paragraphs), 'terms': field(section, '이름 붙이기'),
                 'check': field(section, '이해 확인'),
                 'next': list(dict.fromkeys(re.findall(r'Q\d+\.\d+', field(section, '연결')))),
                 'source': source_text, 'page': int(pages[1]) if pages else None,
                 'caution': field(section, '주의'), 'review': metadata, 'sceneId': qid}
        if not all(entry[k] for k in ('goal', 'predict', 'terms', 'check')):
            raise ValueError(f'{qid}: incomplete learning contract')
        questions.append(entry)
    ids = [q['id'] for q in questions]
    if ids != EXPECTED_IDS or set(review) != set(ids):
        raise ValueError('Question IDs must match the 13 stable design IDs and UI metadata')
    for q in questions:
        if not all(target in ids for target in q['next']):
            raise ValueError(f"{q['id']}: broken question link")
    return {'groups': groups, 'questions': questions, 'version': '0.3.0'}


def render(data):
    return 'globalThis.ForestContent = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    design = (PROJECT.parent / 'docs/QUESTION_SCENARIOS.md').read_text(encoding='utf-8')
    review = json.loads((PROJECT / 'content/review.json').read_text(encoding='utf-8'))
    expected = render(build_content(design, review))
    target = PROJECT / 'dist/content.js'
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != expected:
            raise SystemExit('Stale dist/content.js. Run learning-forest/scripts/build_content.py and review its diff.')
        print('Content contract and generated file: PASS (13 questions)')
    else:
        target.write_text(expected, encoding='utf-8', newline='\n')
        print('Generated 13 questions from the canonical design.')


if __name__ == '__main__':
    main()
