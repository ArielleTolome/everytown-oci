"""Ladder questions (frontend/public/content/ladders.json) must map to real statements by the cumulative rule."""
import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(*path):
    with open(os.path.join(ROOT, *path), encoding="utf-8") as f:
        return json.load(f)


class Ladders(unittest.TestCase):
    def setUp(self):
        self.ids = {q["id"] for d in load("data", "questions.json")["domains"] for q in d["questions"]}
        self.ladders = load("frontend", "public", "content", "ladders.json")["ladders"]

    def test_statements_exist_and_no_statement_is_in_two_groups(self):
        seen = [i for l in self.ladders for i in l["statements"]]
        self.assertEqual(set(seen) - self.ids, set())
        self.assertEqual(len(seen), len(set(seen)))

    def test_each_choice_says_yes_to_a_prefix_and_no_to_the_rest(self):
        for l in self.ladders:
            prev = 0
            self.assertEqual(l["choices"][0]["yes"], [], l["id"])  # the lowest choice records every statement as No
            self.assertEqual(l["choices"][-1]["yes"], l["statements"], l["id"])
            for c in l["choices"]:
                k = len(c["yes"])
                self.assertEqual(c["yes"], l["statements"][:k], (l["id"], c["label"]))
                self.assertGreaterEqual(k, prev, (l["id"], c["label"]))
                prev = k
                self.assertTrue(c["label_es"], c["label"])

    def test_demo_sample_answers_cover_every_statement_with_yes_or_no(self):
        answers = load("frontend", "public", "content", "sample_answers.json")["answers"]
        self.assertEqual(set(answers), self.ids)
        self.assertEqual(set(answers.values()), {"yes", "no"})


if __name__ == "__main__":
    unittest.main()
