"""Small synthetic PDFs for tests only; no external course materials."""
import io
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

ML_TEXT = ('Machine learning and supervised learning use examples with labels.\n'
           'Perceptron weights and bias define a decision rule. XOR needs a different representation.\n'
           'ReLU is an activation function. Gradient descent uses a learning rate.\n'
           'Tensor and PyTorch support computation. Backpropagation computes gradients.')
GENERAL_TEXT = ('Garden planning\nChoose a sunny location and observe the soil before planting.\n'
                'Water young plants regularly and record the changes each week.\n'
                'This document describes gardening rather than machine learning.')


def make_pdf(text=ML_TEXT, encrypted=False, page_count=1):
    writer = PdfWriter()
    for _ in range(page_count):
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                 NameObject('/Subtype'): NameObject('/Type1'),
                                 NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        lines = ['BT /F1 11 Tf 40 740 Td']
        for line in text.splitlines():
            escaped = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            lines.append(f'({escaped}) Tj 0 -18 Td')
        lines.append('ET')
        stream = DecodedStreamObject()
        stream.set_data('\n'.join(lines).encode('ascii'))
        page[NameObject('/Contents')] = writer._add_object(stream)
    if encrypted:
        writer.encrypt('fixture-password')
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


if __name__ == '__main__':
    out = Path(__file__).resolve().parents[1] / 'qa-output'
    out.mkdir(exist_ok=True)
    (out / 'fixture-ml.pdf').write_bytes(make_pdf())
    (out / 'fixture-general.pdf').write_bytes(make_pdf(GENERAL_TEXT))
    print('Created two synthetic PDF fixtures.')
