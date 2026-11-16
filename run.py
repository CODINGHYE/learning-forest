"""Start Learning Forest using a project-local Python environment."""
import argparse
import importlib.metadata
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent
REQUIREMENTS = ROOT / 'requirements.txt'


def runtime_ready(python):
    code = "import importlib.metadata as m,sys;sys.exit(m.version('pypdf') != '6.21.4')"
    return subprocess.run([str(python), '-c', code], capture_output=True).returncode == 0


def main():
    parser = argparse.ArgumentParser(description='Start Learning Forest on this computer.')
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--check', action='store_true', help='Prepare/check setup without starting the server.')
    parser.add_argument('--no-install', action='store_true', help='Use the current Python without creating an environment or installing packages.')
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.error('Python 3.11 or newer is required. Python 3.12 is recommended.')
    if not 0 <= args.port <= 65535:
        parser.error('The port must be between 0 and 65535.')
    required = ['learning-forest/server.py', 'learning-forest/dist/index.html',
                'docs/CONCEPT_MAP_PRINCIPLES.md']
    if any(not (ROOT / name).is_file() for name in required):
        print('Missing project files. Download or clone the entire repository.', file=sys.stderr)
        return 1
    python = Path(sys.executable)
    try:
        if not args.no_install:
            environment = ROOT / '.venv'
            python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
            if not python.is_file():
                print('Creating the project Python environment (.venv)...', flush=True)
                venv.EnvBuilder(with_pip=True).create(environment)
            if not runtime_ready(python):
                print('Installing the runtime packages. Internet access is needed on first setup.', flush=True)
                subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                                '-r', str(REQUIREMENTS)], check=True)
        if not runtime_ready(python):
            print('Runtime packages are missing. Run without --no-install, or install requirements.txt with this Python.', file=sys.stderr)
            return 1
        if args.check:
            print('Local setup is ready. Default model: gpt-4o-mini.')
            return 0
        env = dict(os.environ, PYTHONUTF8='1', PYTHONUNBUFFERED='1')
        return subprocess.call([str(python), str(ROOT / 'learning-forest/server.py'),
                                '--port', str(args.port)], cwd=ROOT, env=env)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f'Could not prepare/start the app: {error}', file=sys.stderr)
        print('Check your Python installation, internet access and write permission for this folder.', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
