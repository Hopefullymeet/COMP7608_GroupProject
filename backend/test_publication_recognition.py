import unittest
from unittest.mock import patch

from bibliography import recognize_publication


class PublicationRecognitionTest(unittest.TestCase):
    title = "Matching local features across cameras"

    def candidate(self, suffix):
        return {"DOI": "10.1234/" + suffix, "type": "journal-article", "title": [self.title],
                "author": [{"family": "Zhang"}], "container-title": ["Example Journal"]}

    @patch("bibliography.metadata_from_provider")
    @patch("bibliography.json_response")
    def test_reference_doi_excluded_and_author_checked(self, search, lookup):
        search.return_value = {"message": {"items": [self.candidate("main")]}}
        text = self.title + " Wei Zhang1 Abstract. References DOI: 10.1234/wrong"
        records, certain = recognize_publication({"title": self.title}, text, "local file", [])
        self.assertTrue(certain)
        self.assertEqual(records[0]["doi"], "10.1234/main")
        lookup.assert_not_called()
        self.assertFalse(recognize_publication({"title": self.title}, self.title, "local file", [])[1])

    @patch("bibliography.json_response")
    def test_two_versions_require_choice(self, search):
        search.return_value = {"message": {"items": [self.candidate("a"), self.candidate("b")]}}
        records, certain = recognize_publication({"title": self.title}, self.title + " Wei Zhang", "", [])
        self.assertFalse(certain)
        self.assertEqual(len(records), 2)
