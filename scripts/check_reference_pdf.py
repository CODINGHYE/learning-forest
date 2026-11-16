"""Optional check of a local course PDF; never uploads or stores its contents."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'learning-forest'))
from server import extract_pdf
from pdf_analysis import source_concept_plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--expect-pages', type=int)
    parser.add_argument('--expect-concepts', type=int)
    args = parser.parse_args()
    pages = extract_pdf(args.pdf.read_bytes())
    plan = source_concept_plan(pages, args.pdf.name)
    count = len(plan['concepts']) if plan else 0
    print(json.dumps({'pages': len(pages), 'coverageCandidates': count}, ensure_ascii=False))
    if args.expect_pages is not None and args.expect_pages != len(pages):
        return 1
    if args.expect_concepts is not None and args.expect_concepts != count:
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
