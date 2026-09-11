"""cite.py has no registry until one is installed, and says so.

The bundled registry and the user manifest are gone: the index lives in
Supabase, and a module that silently falls back to files that are no longer
there is the failure this whole change exists to remove. So an empty registry
must be loud, and it must name the way out.
"""
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def in_a_fresh_process(body):
    """cite's registry is module state, and other tests install one. Asking what
    a bare import does needs an interpreter that has not been touched."""
    script = (f"import sys; sys.path.insert(0, {str(ROOT / 'engine' / 'spec-cite')!r})\n"
              "import cite\n" + body)
    return subprocess.run([sys.executable, "-c", script],
                          capture_output=True, text=True, timeout=60)


class NeedsARegistryTest(unittest.TestCase):
    def test_importing_cite_registers_nothing(self):
        out = in_a_fresh_process("print(len(cite.SPECS), len(cite.DEFAULT_VERSION))")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "0 0")

    def test_resolving_without_a_registry_names_the_way_out(self):
        out = in_a_fresh_process("cite.load_spec('constitution', None)")
        self.assertNotEqual(out.returncode, 0,
                            "resolving against an empty registry must not succeed")
        self.assertIn("use_registry", out.stderr,
                      f"the error must name the fix; it said: {out.stderr.strip()!r}")

    def test_the_bundled_registry_is_gone(self):
        out = in_a_fresh_process(
            "print(hasattr(cite, 'BUNDLED_SPECS'), hasattr(cite, 'load_user_manifest'))")
        self.assertEqual(out.stdout.strip(), "False False", out.stderr)

    def test_a_registry_installed_makes_it_work_again(self):
        out = in_a_fresh_process(
            "cite.use_registry({('x', '2026-01-01'): 'k'}, {'x': '2026-01-01'}, {},"
            " lambda key: '# Title\\n\\nA paragraph.')\n"
            "print(cite.load_spec('x', None)[0])")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "2026-01-01")


if __name__ == "__main__":
    unittest.main()
