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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_fixtures import make_pdf
import server

KEY_A = 'sk-fixture-personal-key-aaaa'
KEY_B = 'sk-fixture-personal-key-bbbb'


class PersonalConnectionTests(unittest.TestCase):
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

    def setUp(self):
        self.store = server.ConnectionStore()
        self.store_patch = patch.object(server, 'CONNECTIONS', self.store)
        self.store_patch.start()
        self.addCleanup(self.store_patch.stop)

    def request(self, path, data=None, cookie=None, extra=None):
        headers = {'Content-Type': 'application/json', 'Origin': self.origin}
        if cookie:
            headers['Cookie'] = cookie
        headers.update(extra or {})
        try:
            response = urlopen(Request(self.origin + path, data=data, headers=headers), timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response), response.headers

    def connect(self, key=KEY_A, model='gpt-5-mini', cookie=None):
        with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps({'id': model}).encode())):
            status, body, headers = self.request('/api/openai/connect', json.dumps({'apiKey': key, 'model': model}).encode(), cookie)
        self.assertEqual(status, 200)
        return headers['Set-Cookie'].split(';', 1)[0], body, headers

    def test_verification_only_retrieves_selected_model(self):
        with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"id":"gpt-5-mini"}')) as upstream:
            server.verify_openai_connection(KEY_A, 'gpt-5-mini')
        request = upstream.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/models/gpt-5-mini')
        self.assertEqual(request.method, 'GET')
        self.assertIsNone(request.data)
        self.assertEqual(request.headers['Authorization'], 'Bearer ' + KEY_A)

    def test_sandbox_network_denial_is_not_misreported_as_bad_credentials(self):
        with patch.object(server.urllib.request, 'urlopen', side_effect=URLError(OSError(10013, 'blocked'))), self.assertRaises(server.ApiError) as raised:
            server.verify_openai_connection(KEY_A, 'gpt-4o-mini')
        self.assertEqual(raised.exception.code, 'network_blocked')
        self.assertIn('외부 연결 권한', str(raised.exception))
        self.assertNotIn(KEY_A, str(raised.exception))

    def test_provider_errors_explain_permissions_model_and_limits_without_echoing_body(self):
        for status, code in [(403, 'permission_denied'), (404, 'model_unavailable'), (429, 'rate_or_quota_limit'), (500, 'upstream_error')]:
            error = HTTPError('https://api.openai.com/v1/models/gpt-5-mini', status, KEY_A, {}, io.BytesIO(KEY_A.encode()))
            with self.subTest(status=status), patch.object(server.urllib.request, 'urlopen', side_effect=error), self.assertRaises(server.ApiError) as raised:
                server.verify_openai_connection(KEY_A, 'gpt-5-mini')
            self.assertEqual(raised.exception.code, code)
            self.assertNotIn(KEY_A, str(raised.exception))

    def test_clients_are_isolated_and_status_has_no_secret(self):
        first, _, headers = self.connect()
        second, _, _ = self.connect(KEY_B, 'gpt-5')
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'server-fixture'}), patch.object(server, 'analyze_openai', return_value={'ok': True}) as analyze:
            for cookie, key, model in [(first, KEY_A, 'gpt-5-mini'), (second, KEY_B, 'gpt-5')]:
                status, body, _ = self.request('/api/analyze-pdf', make_pdf(), cookie, {'X-Analysis-Mode': 'openai', 'X-OpenAI-Source': 'personal'})
                self.assertEqual(status, 200)
                self.assertEqual(analyze.call_args.kwargs, {'api_key': key, 'model': model})
            self.assertEqual(os.environ['OPENAI_API_KEY'], 'server-fixture')
        _, body, _ = self.request('/api/status', cookie=first)
        self.assertTrue(body['connection']['connected'])
        self.assertNotIn(KEY_A, json.dumps(body))
        self.assertNotIn(first.split('=', 1)[1], json.dumps(body))
        _, body, _ = self.request('/api/status')
        self.assertFalse(body['connection']['connected'])

    def test_disconnect_only_removes_own_connection(self):
        first, _, _ = self.connect()
        second, _, _ = self.connect(KEY_B)
        status, body, headers = self.request('/api/openai/disconnect', b'', first)
        self.assertEqual(status, 200)
        self.assertIn('Max-Age=0', headers['Set-Cookie'])
        self.assertIsNone(self.store.get(first.split('=', 1)[1]))
        self.assertIsNotNone(self.store.get(second.split('=', 1)[1]))

    def test_expiry_never_falls_back_to_server_key(self):
        cookie, _, _ = self.connect()
        self.store.records[cookie.split('=', 1)[1]]['expires'] = -1
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'server-fixture'}), patch.object(server, 'analyze_openai') as analyze:
            status, body, _ = self.request('/api/analyze-pdf', make_pdf(), cookie, {'X-Analysis-Mode': 'openai', 'X-OpenAI-Source': 'personal'})
        self.assertEqual(status, 401)
        self.assertEqual(body['code'], 'connection_expired')
        analyze.assert_not_called()
        self.assertFalse(self.store.records)

    def test_failed_replacement_keeps_previous_connection_and_redacts_error(self):
        cookie, _, _ = self.connect()
        error = HTTPError('https://api.openai.com/v1/models/gpt-5', 401, 'fixture', {}, io.BytesIO(KEY_B.encode()))
        with patch.object(server.urllib.request, 'urlopen', side_effect=error):
            status, body, _ = self.request('/api/openai/connect', json.dumps({'apiKey': KEY_B, 'model': 'gpt-5'}).encode(), cookie)
        self.assertEqual(status, 422)
        self.assertEqual(body['code'], 'invalid_api_key')
        self.assertNotIn(KEY_B, json.dumps(body))
        self.assertEqual(self.store.get(cookie.split('=', 1)[1])['key'], KEY_A)

    def test_invalid_input_and_foreign_origin_never_contact_openai(self):
        cases = [(b'[]', {}, 422), (b'{', {}, 422),
                 (json.dumps({'apiKey': 'short', 'model': 'gpt-5-mini'}).encode(), {}, 422),
                 (json.dumps({'apiKey': KEY_A, 'model': '../bad'}).encode(), {}, 422),
                 (b'{}', {'Origin': 'http://foreign.invalid'}, 403),
                 (b'{}', {'Host': 'foreign.invalid'}, 403)]
        with patch.object(server.urllib.request, 'urlopen') as upstream:
            for data, extra, expected in cases:
                status, _, _ = self.request('/api/openai/connect', data, extra=extra)
                self.assertEqual(status, expected)
        upstream.assert_not_called()

    def test_personal_analysis_passes_key_and_model_without_env_mutation(self):
        pages = [{'page': 1, 'text': 'Gradient descent changes parameters using gradients.'}]
        raw = {'groups': [{'id': 'PG1', 'title': 'Change'}], 'summary': 'A document about changing parameters.',
               'concepts': [{'id': 'C1', 'groupId': 'PG1', 'title': 'Gradient descent', 'question': 'How?',
                             'description': 'Updates parameters.', 'purpose': 'To reduce loss.', 'example': 'A small adjustment.',
                             'pages': [1], 'evidenceQuote': 'Gradient descent changes parameters', 'sceneId': 'Q3.4'}], 'edges': []}
        payload = {'output': [{'content': [{'type': 'output_text', 'text': json.dumps(raw)}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'server-fixture', 'OPENAI_MODEL': 'server-model'}), \
             patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(payload).encode())) as upstream:
            result = server.analyze_openai(pages, 'fixture.pdf', api_key=KEY_A, model='gpt-5-mini')
            self.assertEqual(os.environ['OPENAI_API_KEY'], 'server-fixture')
        request = upstream.call_args.args[0]
        self.assertEqual(request.headers['Authorization'], 'Bearer ' + KEY_A)
        self.assertEqual(json.loads(request.data)['model'], 'gpt-5-mini')
        self.assertEqual(result['questions'][0]['purpose'], 'To reduce loss.')
        self.assertEqual(result['document']['summary'], raw['summary'])


if __name__ == '__main__':
    unittest.main()
