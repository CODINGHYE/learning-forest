import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import venv

ROOT = Path(__file__).resolve().parents[2]


class LauncherTests(unittest.TestCase):
    def test_setup_check_works_from_another_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(ROOT / 'run.py'), '--no-install', '--check'],
                                    cwd=directory, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Local setup is ready', result.stdout)

    def test_missing_runtime_is_reported_without_installing_when_requested(self):
        with tempfile.TemporaryDirectory() as directory:
            venv.EnvBuilder(with_pip=False).create(directory)
            python = Path(directory) / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
            result = subprocess.run([str(python), str(ROOT / 'run.py'), '--no-install', '--check'],
                                    capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Runtime packages are missing', result.stderr)


if __name__ == '__main__':
    unittest.main()
