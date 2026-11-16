"""Bind an OS-selected localhost port for QA without loading a user's .env."""
import argparse
import json
import os
from pathlib import Path
import sys
from http.server import ThreadingHTTPServer

APP = Path(__file__).resolve().parents[1] / 'learning-forest'
sys.path.insert(0, str(APP))
from server import Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--address-file', type=Path, required=True)
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    os.environ['OPENAI_API_KEY'] = ''
    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as httpd:
        address = {'runId': args.run_id, 'pid': os.getpid(),
                   'origin': f'http://127.0.0.1:{httpd.server_port}'}
        args.address_file.write_text(json.dumps(address), encoding='utf-8')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
