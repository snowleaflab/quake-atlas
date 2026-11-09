import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from update import xml_report
from history import coord, num

class DataTests(unittest.TestCase):
    def test_implied_precision(self):
        self.assertEqual(num(b" 12  ",100),12)
        self.assertEqual(coord(b" 35",b"3000"),35.5)

    def test_jma_city_and_station_are_separate(self):
        report=xml_report((Path(__file__).parent/"jma.xml").read_bytes(),{}, {})
        self.assertEqual(report["id"],"20261109140157")
        self.assertEqual(report["local"]["08201"],1)
        self.assertEqual(len([s for s in report["obs"] if s[0]=="08201"]),3)
        self.assertNotIn("12217",report["local"])
        self.assertEqual(report["depth"],40)
