import copy
import io
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
sys.path.insert(0, str(APP / 'scripts'))
from build_content import build_content
from pdf_fixtures import GENERAL_TEXT, make_pdf
import server
from pdf_analysis import analyze_local, normalize_ai_map


class ContentContractTests(unittest.TestCase):
    def setUp(self):
        self.design = (APP.parent / 'docs/QUESTION_SCENARIOS.md').read_text(encoding='utf-8')
        self.review = json.loads((APP / 'content/review.json').read_text(encoding='utf-8'))

    def test_missing_source_is_rejected(self):
        with self.assertRaises(ValueError):
            build_content(self.design.replace('- 교재 연결: PDF 4~8쪽', '- 근거 누락: PDF 4~8쪽'), self.review)

    def test_duplicate_or_renamed_question_is_rejected(self):
        with self.assertRaises(ValueError):
            build_content(self.design.replace('### Q1.1 -', '### Q1.2 -', 1), self.review)

    def test_broken_connection_is_rejected(self):
        with self.assertRaises(ValueError):
            build_content(self.design.replace('- 연결: Q1.2.', '- 연결: Q9.9.', 1), self.review)

    def test_shadow_explanation_is_rejected(self):
        for key in ('explain', 'predict'):
            review = copy.deepcopy(self.review)
            review['Q1.1'][key] = ['a second source of truth']
            with self.subTest(key=key), self.assertRaises(ValueError):
                build_content(self.design, review)


class PdfTests(unittest.TestCase):
    def test_valid_pdf_and_local_evidence(self):
        pages = server.extract_pdf(make_pdf())
        result = analyze_local(pages, 'fixture.pdf')
        self.assertGreaterEqual(len(result['questions']), 4)
        self.assertTrue(any(q['sceneId'] for q in result['questions']))
        ids = {q['id'] for q in result['questions']}
        for q in result['questions']:
            for evidence in q['evidence']:
                self.assertIn(evidence['excerpt'], ' '.join(pages[evidence['page'] - 1]['text'].split()))
        self.assertTrue(all(e['from'] in ids and e['to'] in ids for e in result['edges']))

    def test_unsupported_topic_has_no_unrelated_scene(self):
        result = analyze_local(server.extract_pdf(make_pdf(GENERAL_TEXT)), 'garden.pdf')
        self.assertTrue(result['questions'])
        self.assertTrue(all(q['sceneId'] is None for q in result['questions']))

    def test_invalid_or_unreadable_pdf_is_rejected(self):
        for data in (b'not a PDF', b'%PDF-1.4\nbroken', make_pdf(''), make_pdf(encrypted=True)):
            with self.subTest(data_size=len(data)), self.assertRaises(ValueError):
                server.extract_pdf(data)

    def test_page_limit(self):
        with self.assertRaisesRegex(ValueError, '400'):
            server.extract_pdf(make_pdf('', page_count=401))


class AiBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.pages = [{'page': 1, 'text': 'Gradient descent changes parameters using gradients and a learning rate.'}]
        self.raw = {'groups': [{'id': 'PG1', 'title': 'How do values change?'}],
                    'concepts': [{'id': 'C1', 'groupId': 'PG1', 'title': 'Gradient descent',
                                  'question': 'How do parameters change?', 'description': 'Uses gradients.',
                                  'pages': [1], 'evidenceQuote': 'Gradient descent changes parameters', 'sceneId': 'Q3.4'}], 'edges': []}

    def test_grounded_response_is_normalized(self):
        result = normalize_ai_map(self.raw, self.pages, 'fixture.pdf')
        self.assertEqual(result['questions'][0]['page'], 1)
        self.assertEqual(result['questions'][0]['sceneId'], 'Q3.4')

    def test_unfounded_evidence_and_invalid_ids_are_rejected(self):
        for changes in ({'pages': [99]}, {'evidenceQuote': 'invented evidence'}, {'groupId': 'missing'}):
            raw = copy.deepcopy(self.raw)
            raw['concepts'][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                normalize_ai_map(raw, self.pages, 'fixture.pdf')
        raw = copy.deepcopy(self.raw)
        raw['concepts'] *= 2
        with self.assertRaises(ValueError):
            normalize_ai_map(raw, self.pages, 'fixture.pdf')

    def test_api_success_uses_extracted_text_and_structured_output(self):
        payload = {'output': [{'content': [{'type': 'output_text', 'text': json.dumps(self.raw)}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fixture-not-a-real-key'}), \
             patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(payload).encode())) as upstream:
            result = server.analyze_openai(self.pages, 'fixture.pdf')
        request = upstream.call_args.args[0]
        sent = json.loads(request.data)
        self.assertFalse(sent['store'])
        self.assertEqual(sent['text']['format']['type'], 'json_schema')
        self.assertIn('[PDF page 1]', sent['input'][1]['content'])
        self.assertEqual(result['document']['mode'], 'openai')

    def test_missing_key_and_upstream_failures(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}), self.assertRaises(ValueError):
            server.analyze_openai(self.pages, 'fixture.pdf')
        for error in (HTTPError('https://example.invalid', 401, 'fixture', {}, io.BytesIO(b'private-body')),
                      URLError('fixture network failure'), TimeoutError()):
            with self.subTest(error=type(error).__name__), \
                 patch.dict(os.environ, {'OPENAI_API_KEY': 'fixture-not-a-real-key'}), \
                 patch.object(server.urllib.request, 'urlopen', side_effect=error), self.assertRaises(ValueError) as raised:
                server.analyze_openai(self.pages, 'fixture.pdf')
            self.assertNotIn('private-body', str(raised.exception))
            self.assertNotIn('fixture-not-a-real-key', str(raised.exception))

    def test_malformed_api_response(self):
        payload = {'output': [{'content': [{'type': 'output_text', 'text': 'not json'}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fixture-not-a-real-key'}), \
             patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(payload).encode())), \
             self.assertRaises(ValueError):
            server.analyze_openai(self.pages, 'fixture.pdf')


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.origin = 'http://127.0.0.1:' + str(cls.httpd.server_port)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)

    def request(self, data=None, mode='local', extra=None, endpoint='/api/analyze-pdf'):
        headers = {'Content-Type': 'application/pdf', 'X-Analysis-Mode': mode, 'X-Filename': 'fixture.pdf'}
        headers.update(extra or {})
        request = Request(self.origin + endpoint, data=data, headers=headers)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_status_and_local_success_without_external_calls(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            status, body = self.request(endpoint='/api/status')
        self.assertEqual(status, 200)
        self.assertFalse(body['openaiAvailable'])
        with patch.object(server, 'analyze_openai', side_effect=AssertionError('local mode contacted AI')):
            status, body = self.request(make_pdf())
        self.assertEqual(status, 200)
        self.assertEqual(body['document']['mode'], 'local')

    def test_bad_input_size_mode_and_cross_origin(self):
        cases = [(b'', 'local', {}, 422), (b'bad', 'local', {}, 422),
                 (make_pdf(), 'unknown', {}, 422),
                 (b'', 'local', {'Content-Length': str(server.MAX_BYTES + 1)}, 422),
                 (make_pdf(), 'local', {'Origin': 'http://example.invalid'}, 403)]
        for data, mode, extra, expected in cases:
            with self.subTest(mode=mode, expected=expected):
                status, body = self.request(data, mode, extra)
                self.assertEqual(status, expected)
                self.assertIn('error', body)

    def test_openai_failure_is_reported_as_json(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            status, body = self.request(make_pdf(), 'openai')
        self.assertEqual(status, 422)
        self.assertIn('error', body)


if __name__ == '__main__':
    unittest.main()
