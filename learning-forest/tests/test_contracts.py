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
from pdf_analysis import detect_source_topics, normalize_ai_map, evidence_anchors, make_schema, source_concept_plan


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
    def test_valid_pdf_provides_literal_numbered_evidence(self):
        pages = server.extract_pdf(make_pdf())
        anchors = evidence_anchors(pages)
        self.assertTrue(anchors)
        for anchor in anchors.values():
            self.assertIn(anchor['excerpt'], ' '.join(pages[anchor['page']-1]['text'].split()))

    def test_unsupported_topic_has_no_ml_coverage_candidates(self):
        pages = server.extract_pdf(make_pdf(GENERAL_TEXT))
        self.assertIsNone(source_concept_plan(pages, 'garden.pdf'))

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

    def test_long_course_requires_all_source_detected_topics(self):
        text = 'Machine learning. Supervised learning. Regression. Classification. Perceptron uses weights and bias. Activation function ReLU. MLP connects layers. Forward propagation makes predictions. Loss function MSE. Derivative and chain rule. Backpropagation. Gradient descent learning rate. Epoch. PyTorch tensor autograd.'
        pages = [{'page':i, 'text':text} for i in range(1,21)]
        plan = source_concept_plan(pages, 'course.pdf')
        self.assertGreaterEqual(len(plan['concepts']), 16)
        self.assertLessEqual(len(plan['concepts']), 32)
        titles = {node['title'] for node in plan['concepts'].values()}
        self.assertTrue({'손실함수','미분과 변화율','역전파','경사하강법','자동미분'} <= titles)
        anchors = evidence_anchors(pages)
        schema = make_schema(anchors, plan=plan, anchors=anchors)
        self.assertEqual(set(schema['properties']['concepts']['required']), set(plan['concepts']))
        raw = {'summary':'A course on learning.', 'groups':{gid:{'id':gid,'title':title} for gid,title in plan['groups'].items()}, 'concepts':{}, 'edges':[]}
        for node_id, seed in plan['concepts'].items():
            evidence_id = schema['properties']['concepts']['properties'][node_id]['properties']['evidenceId']['enum'][0]
            raw['concepts'][node_id] = {'id':node_id,'groupId':seed['group'],'title':seed['title'],'question':'How does it help?','description':seed['meaning'],'purpose':'Used to understand the computation.','example':'A small learning example.','evidenceId':evidence_id,'sceneId':seed['sceneId']}
        result = normalize_ai_map(raw, pages, 'course.pdf', anchors=anchors, plan=plan)
        self.assertEqual(len(result['questions']), len(plan['concepts']))
        raw['concepts'].pop(next(iter(raw['concepts'])))
        with self.assertRaisesRegex(ValueError, 'Missing planned concepts'):
            normalize_ai_map(raw, pages, 'course.pdf', anchors=anchors, plan=plan)

    def test_short_or_other_subject_has_no_forced_ml_plan(self):
        self.assertIsNone(source_concept_plan(self.pages, 'short.pdf'))
        self.assertIsNone(source_concept_plan([{'page':i,'text':'Gardening soil and flowers.'} for i in range(1,21)],'garden.pdf'))

    def test_numbered_evidence_uses_actual_source_and_rejects_invented_id(self):
        anchors = evidence_anchors(self.pages)
        raw = copy.deepcopy(self.raw)
        raw['concepts'][0].pop('pages')
        raw['concepts'][0].pop('evidenceQuote')
        raw['concepts'][0]['evidenceId'] = 'P1S1'
        result = normalize_ai_map(raw, self.pages, 'fixture.pdf', anchors=anchors)
        self.assertEqual(result['questions'][0]['evidence'][0]['excerpt'], self.pages[0]['text'])
        self.assertEqual(result['document']['groundingMethod'], 'numbered_source_spans')
        schema = make_schema(anchors)['properties']['concepts']['items']
        self.assertEqual(schema['properties']['evidenceId']['enum'], ['P1S1'])
        self.assertNotIn('evidenceQuote', schema['properties'])
        raw['concepts'][0]['evidenceId'] = 'P999S1'
        with self.assertRaises(ValueError):
            normalize_ai_map(raw, self.pages, 'fixture.pdf', anchors=anchors)

    def test_pdf_whitespace_is_matched_but_excerpt_is_actual_source(self):
        pages = [{'page': 1, 'text': 'Gradient\n descent changes\nparameters using gradients.'}]
        result = normalize_ai_map(self.raw, pages, 'fixture.pdf')
        self.assertEqual(result['questions'][0]['evidence'][0]['excerpt'], 'Gradient descent changes parameters')
        raw = copy.deepcopy(self.raw)
        raw['concepts'][0]['evidenceQuote'] = 'Gradientdescentchangesparameters'
        result = normalize_ai_map(raw, pages, 'fixture.pdf')
        self.assertEqual(result['questions'][0]['evidence'][0]['excerpt'], 'Gradient descent changes parameters')
        self.assertEqual(result['document']['groundingCorrections'][0]['type'], 'layout_whitespace')

    def test_wrong_valid_page_is_corrected_only_by_literal_match(self):
        pages = [{'page': 1, 'text': 'A different introductory page.'}, self.pages[0] | {'page': 2}]
        result = normalize_ai_map(self.raw, pages, 'fixture.pdf')
        self.assertEqual(result['questions'][0]['page'], 2)
        self.assertEqual(result['document']['groundingCorrections'][0]['type'], 'page')
        raw = copy.deepcopy(self.raw)
        raw['concepts'][0]['evidenceQuote'] = 'Gradient descent never changes parameters'
        with self.assertRaises(ValueError):
            normalize_ai_map(raw, pages, 'fixture.pdf')

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

    def test_rejected_evidence_reports_the_concept_without_exposing_key(self):
        raw = copy.deepcopy(self.raw)
        raw['concepts'][0]['evidenceQuote'] = 'a fabricated quote not on this page'
        payload = {'output': [{'content': [{'type': 'output_text', 'text': json.dumps(raw)}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fixture-private-key'}), \
             patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(payload).encode())), \
             self.assertRaises(server.ApiError) as raised:
            server.analyze_openai(self.pages, 'fixture.pdf')
        self.assertEqual(raised.exception.code, 'unverified_evidence')
        self.assertIn('Gradient descent', str(raised.exception))
        self.assertNotIn('fixture-private-key', str(raised.exception))


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

    def request(self, data=None, mode='openai', extra=None, endpoint='/api/analyze-pdf'):
        headers = {'Content-Type': 'application/pdf', 'X-Analysis-Mode': mode, 'X-Filename': 'fixture.pdf'}
        headers.update(extra or {})
        request = Request(self.origin + endpoint, data=data, headers=headers)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_status_and_openai_http_boundary_without_external_calls(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            status, body = self.request(endpoint='/api/status')
        self.assertEqual(status, 200)
        self.assertFalse(body['openaiAvailable'])
        with patch.object(server, 'analyze_openai', return_value={'document':{'mode':'openai'}}) as analyze:
            status, body = self.request(make_pdf())
        self.assertEqual(status, 200)
        self.assertEqual(body['document']['mode'], 'openai')
        self.assertTrue(analyze.call_args.args[0][0]['text'])

    def test_retired_local_mode_is_rejected_without_contacting_openai(self):
        with patch.object(server, 'analyze_openai') as analyze:
            status, body = self.request(make_pdf(), 'local')
        self.assertEqual(status, 422)
        self.assertIn('OpenAI', body['error'])
        analyze.assert_not_called()

    def test_bad_input_size_mode_and_cross_origin(self):
        cases = [(b'', 'openai', {}, 422), (b'bad', 'openai', {}, 422),
                 (make_pdf(), 'unknown', {}, 422),
                 (b'', 'openai', {'Content-Length': str(server.MAX_BYTES + 1)}, 422),
                 (make_pdf(), 'openai', {'Origin': 'http://example.invalid'}, 403)]
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
