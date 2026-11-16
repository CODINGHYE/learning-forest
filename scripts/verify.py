"""Offline verification. Full mode owns an isolated server; quick mode omits browser QA."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'learning-forest'
OUT = APP / 'qa-output'


def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, text=True, encoding='utf-8', capture_output=True)
    if result.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' + result.stderr.strip())
    return result.stdout.strip()


def fingerprint():
    """Cover versioned inputs and newly added source; exclude local state and evidence."""
    paths = set(git('ls-files', '--cached', '--others', '--exclude-standard').splitlines())
    digest = hashlib.sha256()
    for name in sorted(paths):
        path = ROOT / name
        if path.is_file():
            # Match Git's text normalization on Windows.
            data = path.read_bytes()
            if b'\0' not in data:
                data = data.replace(b'\r\n', b'\n')
            digest.update(name.encode('utf-8') + b'\0' + data + b'\0')
    return digest.hexdigest()


def repository_contract():
    if (APP / '.git').exists():
        raise RuntimeError('Nested Git repository: code and design must share the root history')
    required = ['AGENTS.md', 'README.md', 'docs/STATUS.md', 'docs/HARNESS.md',
                'docs/CONCEPT_MAP_PRINCIPLES.md', 'docs/QUESTION_SCENARIOS.md']
    for name in required:
        if not (ROOT / name).is_file():
            raise RuntimeError('Missing management document: ' + name)
    for name in git('ls-files').splitlines():
        if name.endswith('.env') or ('/.env.' in name and not name.endswith('.env.example')):
            raise RuntimeError('Local environment file must not be tracked: ' + name)
    # Check repo documentation links, but do not interpret external reference materials.
    for path in [ROOT / 'AGENTS.md', ROOT / 'README.md', *sorted((ROOT / 'docs').rglob('*.md')), APP / 'README.md']:
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
                continue
            local = target.split('#', 1)[0]
            if local and not (path.parent / local).exists():
                raise RuntimeError(f'{path.relative_to(ROOT)}: broken local link {target}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--quick', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    report = {'startedAt': datetime.now(timezone.utc).isoformat(), 'mode': 'quick' if args.quick else 'full',
              'head': None, 'inputSha256': None, 'steps': [], 'result': 'failed',
              'notCovered': ['live OpenAI API', 'learner comprehension', 'assistive technology', 'public deployment']}
    env = dict(os.environ, PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
               PYTHONPATH=str(APP), OPENAI_API_KEY='')
    server = None
    server_log = None

    def step(name, command=None, action=None, timeout=90):
        started = time.monotonic()
        item = {'name': name, 'result': 'failed'}
        report['steps'].append(item)
        print(f'[{name}]', flush=True)
        try:
            if action:
                action()
            else:
                result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                        encoding='utf-8', errors='replace', timeout=timeout)
                log = OUT / (name + '.log')
                log.write_text(result.stdout + result.stderr, encoding='utf-8')
                item['log'] = str(log.relative_to(ROOT)).replace('\\', '/')
                if result.returncode:
                    print((result.stdout + result.stderr)[-6000:], flush=True)
                    raise RuntimeError(f'{name} exited {result.returncode}; see {item["log"]}')
                output = result.stdout + result.stderr
                if name == 'python':
                    count = re.search(r'Ran (\d+) tests?', output)
                    item['tests'] = int(count[1]) if count else 0
                    skipped = re.search(r'skipped=(\d+)', output)
                    item['skippedTests'] = int(skipped[1]) if skipped else 0
                    if not item['tests']:
                        raise RuntimeError('Python test discovery found no tests')
                    if item['skippedTests']:
                        report['notCovered'].append('Python tests skipped; see python.log')
                elif name == 'math':
                    count = re.search(r'# tests (\d+)', output)
                    item['tests'] = int(count[1]) if count else 0
                    if not item['tests']:
                        raise RuntimeError('Math test count missing from TAP output')
                    skipped = re.search(r'# skipped (\d+)', output)
                    item['skippedTests'] = int(skipped[1]) if skipped else 0
                    if item['skippedTests']:
                        report['notCovered'].append('Math tests skipped; see math.log')
            item['result'] = 'partial' if item.get('skippedTests') else 'passed'
        finally:
            item['seconds'] = round(time.monotonic() - started, 3)

    try:
        report['head'] = git('rev-parse', 'HEAD')
        report['worktreeStatus'] = git('status', '--porcelain')
        report['inputSha256'] = fingerprint()
        node = shutil.which('node')
        if not node:
            raise RuntimeError('Node.js 20+ is required')
        report['runtime'] = {'python': sys.version.split()[0],
                             'node': subprocess.check_output([node, '--version'], text=True).strip(),
                             'pypdf': importlib.metadata.version('pypdf'),
                             'reportlab': importlib.metadata.version('reportlab')}
        # Prefer project dependencies; use the desktop bundle only when no project install exists.
        if not env.get('FOREST_PLAYWRIGHT_PATH') and not (ROOT / 'node_modules/playwright').exists():
            bundled = Path(node).parent.parent / 'node_modules/playwright'
            if bundled.is_dir():
                env['FOREST_PLAYWRIGHT_PATH'] = str(bundled)
        if not env.get('FOREST_BROWSER_EXE'):
            for base, relative in [('PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'),
                                   ('PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe'),
                                   ('PROGRAMFILES', 'Google/Chrome/Application/chrome.exe')]:
                candidate = Path(env.get(base, '/missing')) / relative
                if candidate.is_file():
                    env['FOREST_BROWSER_EXE'] = str(candidate)
                    break
        step('repository', action=repository_contract)
        step('content', [sys.executable, str(APP / 'scripts/build_content.py'), '--check'])
        for path in sorted((APP / 'dist').glob('*.js')):
            step('syntax-' + path.stem, [node, '--check', str(path)])
        step('math', [node, '--test', '--test-reporter=tap', str(APP / 'tests/math.test.cjs')])
        step('python', [sys.executable, '-m', 'unittest', 'discover', '-s', str(APP / 'tests'), '-p', 'test_*.py', '-v'])
        if not args.quick:
            step('fixtures', [sys.executable, str(APP / 'tests/pdf_fixtures.py')])
            # Do not attach to or stop the user's preview. This process owns its server.
            run_id = uuid.uuid4().hex
            env['FOREST_QA_RUN_ID'] = run_id
            address_file = OUT / 'qa-server.json'
            server_log = (OUT / 'server.log').open('w', encoding='utf-8')
            server = subprocess.Popen([sys.executable, str(ROOT / 'scripts/serve_qa.py'),
                                       '--address-file', str(address_file), '--run-id', run_id],
                                      cwd=ROOT, env=env, stdout=server_log, stderr=subprocess.STDOUT)

            def ready():
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if server.poll() is not None:
                        raise RuntimeError('QA server failed; see learning-forest/qa-output/server.log')
                    try:
                        address = json.loads(address_file.read_text(encoding='utf-8'))
                        if address.get('runId') != run_id or address.get('pid') != server.pid:
                            time.sleep(.1)
                            continue
                        origin = address['origin']
                        with urlopen(origin + '/api/status', timeout=1) as response:
                            status = json.load(response)
                            if status.get('available') and not status.get('openaiAvailable'):
                                env['FOREST_QA_ORIGIN'] = origin
                                return
                    except (URLError, TimeoutError, FileNotFoundError, json.JSONDecodeError):
                        time.sleep(.1)
                raise RuntimeError('QA server did not become ready')

            step('server', action=ready)
            step('browser', [node, str(APP / 'tests/browser.qa.cjs')], timeout=150)
            report['browser'] = json.loads((OUT / 'browser-report.json').read_text(encoding='utf-8'))
            if report['browser'].get('runId') != run_id:
                raise RuntimeError('Browser report does not belong to this verification run')
        else:
            report['steps'].append({'name': 'browser', 'result': 'skipped', 'reason': 'quick mode'})
        step('unchanged-inputs', action=lambda: assert_unchanged(report['inputSha256']))
        report['result'] = 'partial' if args.quick or any(s['result'] == 'partial' for s in report['steps']) else 'passed'
    except Exception as exc:
        report['error'] = str(exc)
        print('FAIL: ' + str(exc), flush=True)
    finally:
        if server:
            if server.poll() is None:
                server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
        if server_log:
            server_log.close()
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        (OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"{report['result'].upper()}: learning-forest/qa-output/verification.json", flush=True)
    if report['result'] == 'failed':
        return 1
    return 2 if report['result'] == 'partial' and not args.quick else 0


def assert_unchanged(before):
    if fingerprint() != before:
        raise RuntimeError('Source changed during verification. Re-run against stable inputs.')


def exclusive_main():
    # Shared output paths must never contain evidence from two simultaneous runs.
    OUT.mkdir(exist_ok=True)
    with (OUT / '.verification.lock').open('a+b') as handle:
        handle.write(b'0')
        handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print('FAIL: another verification is running; existing evidence was not replaced.', flush=True)
            return 1
        return main()


if __name__ == '__main__':
    raise SystemExit(exclusive_main())
