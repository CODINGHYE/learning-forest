import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader, PdfWriter
from pdf_fixtures import make_pdf
from pdf_analysis import analyze_local, normalize_ai_map, read_principles
from server import extract_pdf, analyze_openai


def geology_pdf():
    stream = io.BytesIO()
    writer = PdfWriter()
    for title, body in [
        ('Volcanoes', 'Magma can reach the surface through cracks in the crust. A volcano is a place where material emerges.'),
        ('Rock layers', 'Layers of sediment preserve information about earlier environments. The order of layers helps interpret changes.'),
        ('Plate motion', 'Tectonic plates move slowly. Their boundaries can be associated with earthquakes and mountain building.'),
    ]:
        page = PdfReader(io.BytesIO(make_pdf(title + '\n' + body))).pages[0]
        writer.add_page(page)
    writer.write(stream)
    return stream.getvalue()


class AnalysisTests(unittest.TestCase):
    def test_extract_and_map_a_different_subject(self):
        pages = extract_pdf(geology_pdf())
        result = analyze_local(pages, 'geology.pdf')
        self.assertEqual(result['document']['pageCount'], 3)
        self.assertEqual(len(result['questions']), 3)
        self.assertEqual(result['questions'][0]['concept'], 'Volcanoes')
        self.assertTrue(all(q['sceneId'] is None for q in result['questions']))
        self.assertTrue(all(e['type'] == '문서 순서' for e in result['edges']))

    def test_uploaded_class_has_content_beyond_the_demo(self):
        sources = list(Path('C:/Users/user/Downloads').glob('*Deep Learning Basics.pdf'))
        if not sources:
            self.skipTest('The user-provided reference PDF is not present on this machine.')
        source = sources[0]
        pages = extract_pdf(source.read_bytes())
        result = analyze_local(pages, source.name)
        self.assertEqual(len(pages), 92)
        self.assertGreater(len(result['questions']), 13)
        self.assertIn('PDF-reinforcement', {q['id'] for q in result['questions']})
        for q in result['questions']:
            for item in q['evidence']:
                self.assertIn(item['excerpt'], ' '.join(pages[item['page']-1]['text'].split()))
        ids = {q['id'] for q in result['questions']}
        self.assertTrue(all(e['from'] in ids and e['to'] in ids for e in result['edges']))

    def test_only_present_concepts_are_included(self):
        pages = [{'page':1,'text':'Perceptron uses weights and bias. Activation function ReLU changes the output. MLP connects layers.'}]
        result = analyze_local(pages, 'small.pdf')
        ids = {q['id'] for q in result['questions']}
        self.assertIn('PDF-perceptron', ids)
        self.assertNotIn('PDF-reinforcement', ids)
        self.assertNotIn('PDF-pca', ids)

    def test_invalid_or_blank_pdf_is_actionable(self):
        with self.assertRaisesRegex(ValueError, 'PDF 파일'):
            extract_pdf(b'not a PDF')
        from pypdf import PdfWriter
        writer = PdfWriter(); writer.add_blank_page(width=100,height=100)
        stream = io.BytesIO(); writer.write(stream)
        with self.assertRaisesRegex(ValueError, '텍스트'):
            extract_pdf(stream.getvalue())

    def test_no_key_does_not_silently_fake_openai(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY':''}):
            with self.assertRaisesRegex(ValueError, '설정되지'):
                analyze_openai([{'page':1,'text':'some text'}], 'test.pdf')

    def test_ai_evidence_is_checked_against_actual_pages(self):
        pages = [{'page':1,'text':'A perceptron combines inputs using weights and a bias.'}]
        raw = {'groups':[{'id':'PG1','title':'What is calculated?'}], 'concepts':[{'id':'C1','groupId':'PG1','title':'Perceptron','question':'How are inputs combined?','description':'Inputs are combined using weights.','pages':[1],'evidenceQuote':'combines inputs using weights','sceneId':'Q1.2'}], 'edges':[]}
        result = normalize_ai_map(raw,pages,'test.pdf')
        self.assertEqual(result['questions'][0]['page'],1)
        raw['concepts'][0]['evidenceQuote']='This is an invented quote.'
        with self.assertRaises(ValueError): normalize_ai_map(raw,pages,'test.pdf')

    def test_ai_model_request_and_current_principles(self):
        pages=[{'page':1,'text':'A perceptron combines inputs using weights and a bias.'}]
        raw={'groups':[{'id':'PG1','title':'What is calculated?'}],'concepts':[{'id':'C1','groupId':'PG1','title':'Perceptron','question':'How are inputs combined?','description':'Inputs are combined using weights.','pages':[1],'evidenceQuote':'combines inputs using weights','sceneId':'Q1.2'}],'edges':[]}
        response=io.BytesIO(json.dumps({'output':[{'content':[{'type':'output_text','text':json.dumps(raw)}]}]}).encode())
        with patch.dict(os.environ, {'OPENAI_API_KEY':'test-not-a-real-key'}), patch('urllib.request.urlopen',return_value=response) as request:
            result=analyze_openai(pages,'test.pdf')
        payload=json.loads(request.call_args.args[0].data)
        self.assertFalse(payload['store'])
        self.assertEqual(payload['text']['format']['type'],'json_schema')
        self.assertIn(read_principles(),payload['input'][0]['content'])
        self.assertEqual(result['document']['mode'],'openai')

    def test_unsupported_scene_is_rejected(self):
        raw={'groups':[{'id':'PG1','title':'Test'}],'concepts':[{'id':'C1','groupId':'PG1','title':'Test','question':'Test?','description':'Test','pages':[1],'evidenceQuote':'supported source words','sceneId':'invented-3d'}],'edges':[]}
        with self.assertRaises(ValueError):normalize_ai_map(raw,[{'page':1,'text':'supported source words in the document'}],'test.pdf')


if __name__=='__main__':
    unittest.main()
