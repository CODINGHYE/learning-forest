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
from pdf_analysis import detect_source_topics, source_concept_plan, evidence_anchors, normalize_ai_map, read_principles
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
    def test_extract_a_different_subject_without_building_a_fake_map(self):
        pages = extract_pdf(geology_pdf())
        self.assertEqual(len(pages), 3)
        self.assertEqual(detect_source_topics(pages), [])
        self.assertIsNone(source_concept_plan(pages, 'geology.pdf'))
        self.assertTrue(evidence_anchors(pages))

    def test_uploaded_class_has_source_coverage(self):
        sources = list(Path('C:/Users/user/Downloads').glob('*Deep Learning Basics.pdf'))
        if not sources:
            self.skipTest('The user-provided reference PDF is not present on this machine.')
        pages = extract_pdf(sources[0].read_bytes())
        self.assertEqual(len(pages), 92)
        plan = source_concept_plan(pages, sources[0].name)
        self.assertEqual(len(plan['concepts']), 32)
        self.assertIn('강화학습', {node['title'] for node in plan['concepts'].values()})
        self.assertTrue(all(1 <= page <= len(pages) for node in plan['concepts'].values() for page in node['pages']))

    def test_only_present_topics_are_coverage_candidates(self):
        pages = [{'page':1,'text':'Perceptron uses weights and bias. Activation function ReLU changes the output. MLP connects layers.'}]
        keys = {node['key'] for node in detect_source_topics(pages)}
        self.assertIn('perceptron', keys)
        self.assertNotIn('reinforcement', keys)
        self.assertNotIn('pca', keys)

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
