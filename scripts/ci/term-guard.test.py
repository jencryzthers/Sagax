import os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "term-guard.py")
DIFF = """diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,3 @@
 keep
+hello Widgetco here
 tail
diff --git a/ok.txt b/ok.txt
--- a/ok.txt
+++ b/ok.txt
@@ -0,0 +1 @@
+clean line
"""


def run(env, diff=None):
    with tempfile.NamedTemporaryFile("w", delete=False) as f:
        f.write(diff or "")
    e = {"PATH": os.environ["PATH"], **env}
    p = subprocess.run([sys.executable, SCRIPT, f.name], env=e, capture_output=True, text=True)
    os.unlink(f.name)
    return p.returncode, p.stdout


class T(unittest.TestCase):
    def test_fail_closed(self):
        self.assertEqual(run({})[0], 2)

    def test_clean(self):
        self.assertEqual(run({"FORBIDDEN_TERMS": "acme\nwidgetco", "PR_TITLE": "ok", "PR_BRANCH": "feat/x"}, "")[0], 0)

    def test_hits_are_located_not_printed(self):
        code, out = run({"FORBIDDEN_TERMS": "WIDGETCO\n", "PR_TITLE": "Add widgetco", "PR_BRANCH": "feat/WidgetCo"}, DIFF)
        self.assertEqual(code, 1)
        self.assertIn("title", out)
        self.assertIn("branch", out)
        self.assertIn("a.txt:2", out)
        self.assertNotIn("ok.txt", out)
        self.assertNotIn("widgetco", out.lower())

    def test_path_hit(self):
        d = "diff --git a/widgetco.txt b/widgetco.txt\n--- /dev/null\n+++ b/widgetco.txt\n@@ -0,0 +1 @@\n+x\n"
        code, out = run({"FORBIDDEN_TERMS": "widgetco"}, d)
        self.assertEqual(code, 1)
        self.assertIn("file #1", out)
        self.assertNotIn("widgetco", out.lower())


if __name__ == "__main__":
    unittest.main()
