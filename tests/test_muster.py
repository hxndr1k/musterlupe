"""Prüft die Muster-Regeln an selbst gebauten Kerzenfolgen.

Start im Projektordner:  python -m unittest discover -s tests -v

Dieselben Testfälle wie in der Python-App. Geprüft wird hier der JavaScript-Kern (kern/muster.js).

Die Musterkerzen stammen aus der Lernseite "Kerzen-Schule". Davor steht jeweils
ein selbst gebauter Trend, damit die Bedingung "nach Abwärts- bzw. Aufwärtstrend" erfüllt ist.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import js_muster as muster  # noqa: E402  (JS-Kern, jeder Aufruf auch gegen Python geprüft)


def kerzen(*ohlc, start_t=1_700_000_000, schritt=300):
    return [{"t": start_t + i * schritt, "o": o, "h": h, "l": l, "c": c, "v": 100.0}
            for i, (o, h, l, c) in enumerate(ohlc)]


def trend(von, bis, anzahl=30):
    """Gleichmäßiger Trend aus `anzahl` Kerzen, jede rund 2,2 hoch. Endet mit Schlusskurs `bis`."""
    schritt = (bis - von) / anzahl
    reihe, preis = [], von
    for _ in range(anzahl):
        o, c = preis, preis + schritt
        reihe.append((o, max(o, c) + 0.5, min(o, c) - 0.5, c))
        preis = c
    return reihe


def seitwaerts(mitte, anzahl=30, hub=0.6):
    """Ruhiger Markt: Kerzen pendeln um `mitte`."""
    reihe = []
    for i in range(anzahl):
        o = mitte + (hub if i % 2 else -hub)
        c = mitte - (hub if i % 2 else -hub)
        reihe.append((o, max(o, c) + 0.5, min(o, c) - 0.5, c))
    return reihe


AB = trend(145, 101.8)       # Abwärtstrend, endet bei 101,8
AUF = trend(65, 108.2)       # Aufwärtstrend, endet bei 108,2


def namen(funde):
    return sorted({f["muster"] for f in funde})


def einer(funde, key):
    treffer = [f for f in funde if f["muster"] == key]
    assert len(treffer) == 1, f"{key}: {len(treffer)} Funde statt 1 ({namen(funde)})"
    return treffer[0]


class Erkennung(unittest.TestCase):
    def test_hammer_wird_erkannt(self):
        f = einer(muster.finde_muster(kerzen(*AB, (101.5, 102.2, 98.6, 102.0))), "hammer")
        self.assertEqual(f["richtung"], "long")
        self.assertGreater(f["einstieg"], 102.2)      # über dem Hoch
        self.assertLess(f["stop"], 98.6)              # unter der Dochtspitze
        risiko = f["einstieg"] - f["stop"]
        self.assertAlmostEqual(f["ziel"], f["einstieg"] + 2 * risiko)

    def test_normale_kerze_ist_kein_hammer(self):
        funde = muster.finde_muster(kerzen(*AB, (101.8, 102.3, 99.8, 100.2)))
        self.assertEqual(funde, [])

    def test_hammer_ohne_abwaertstrend_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*seitwaerts(102), (101.5, 102.2, 98.6, 102.0)))
        self.assertNotIn("hammer", namen(funde))

    def test_hammer_nach_aufwaertstrend_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*AUF, (108.5, 109.2, 105.6, 109.0)))
        self.assertNotIn("hammer", namen(funde))

    def test_hammer_mit_grossem_docht_oben_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*AB, (101.5, 103.4, 98.6, 102.0)))
        self.assertNotIn("hammer", namen(funde))

    def test_sternschnuppe(self):
        f = einer(muster.finde_muster(kerzen(*AUF, (108.6, 111.4, 107.9, 108.1))), "sternschnuppe")
        self.assertEqual(f["richtung"], "short")
        self.assertLess(f["einstieg"], 107.9)         # unter dem Tief
        self.assertGreater(f["stop"], 111.4)          # über der Dochtspitze
        risiko = f["stop"] - f["einstieg"]
        self.assertAlmostEqual(f["ziel"], f["einstieg"] - 2 * risiko)

    def test_sternschnuppe_nach_abwaertstrend_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*AB, (101.6, 104.4, 100.9, 101.1)))
        self.assertNotIn("sternschnuppe", namen(funde))

    def test_bullische_umhuellende_kerze(self):
        f = einer(muster.finde_muster(kerzen(*AB, (101.8, 102.0, 100.9, 101.1), (100.8, 103.0, 100.5, 102.8))),
                  "bull_umhuellend")
        self.assertGreater(f["einstieg"], 103.0)
        self.assertLess(f["stop"], 100.5)

    def test_kleine_gruene_kerze_umhuellt_nicht(self):
        funde = muster.finde_muster(kerzen(*AB, (101.8, 102.0, 100.9, 101.1), (101.2, 101.7, 101.0, 101.6)))
        self.assertNotIn("bull_umhuellend", namen(funde))

    def test_baerische_umhuellende_kerze(self):
        f = einer(muster.finde_muster(kerzen(*AUF, (108.2, 109.2, 108.0, 109.0), (109.3, 109.6, 107.0, 107.3))),
                  "baer_umhuellend")
        self.assertEqual(f["richtung"], "short")
        self.assertLess(f["einstieg"], 107.0)
        self.assertGreater(f["stop"], 109.6)

    def test_morgenstern(self):
        f = einer(muster.finde_muster(kerzen(
            *AB, (101.8, 102.0, 99.2, 99.4), (99.0, 99.4, 98.3, 98.8), (99.2, 101.6, 99.0, 101.4))), "morgenstern")
        self.assertGreater(f["einstieg"], 101.6)
        self.assertLess(f["stop"], 98.3)

    def test_morgenstern_braucht_starke_dritte_kerze(self):
        funde = muster.finde_muster(kerzen(
            *AB, (101.8, 102.0, 99.2, 99.4), (99.0, 99.4, 98.3, 98.8), (99.2, 100.2, 99.0, 100.0)))
        self.assertNotIn("morgenstern", namen(funde))

    def test_abendstern(self):
        f = einer(muster.finde_muster(kerzen(
            *AUF, (108.2, 110.9, 108.0, 110.7), (111.1, 111.8, 110.8, 111.3), (111.0, 111.2, 108.6, 108.8))),
            "abendstern")
        self.assertEqual(f["richtung"], "short")
        self.assertLess(f["einstieg"], 108.6)
        self.assertGreater(f["stop"], 111.8)

    def test_doji_nach_trend(self):
        f = einer(muster.finde_muster(kerzen(*AUF, (108.4, 110.0, 107.0, 108.45))), "doji")
        self.assertEqual(f["ausgang"], "offen")        # noch keine Kerze danach

    def test_winziger_doji_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*AUF, (108.4, 108.9, 107.9, 108.42)))
        self.assertNotIn("doji", namen(funde))

    def test_doji_im_seitwaertsmarkt_zaehlt_nicht(self):
        funde = muster.finde_muster(kerzen(*seitwaerts(108), (108.4, 110.0, 107.0, 108.45)))
        self.assertNotIn("doji", namen(funde))

    def test_laufende_kerze_wird_nicht_gewertet(self):
        alle = kerzen(*AB, (101.5, 102.2, 98.6, 102.0))
        self.assertEqual(muster.finde_muster(alle, n_fertig=len(alle) - 1), [])


def w_form(nacken_bruch=True, zweites_tief=100.2):
    """Abwärtstrend, erstes Tief bei 100, hoch auf 105, zweites Tief, dann über die Nackenlinie."""
    k = trend(118, 101.0, 30)                                             # Kerzen rund 1,6 hoch
    k += [(101.0, 101.3, 100.0, 100.6)]                                   # erstes Tief 100,0
    k += [(100.6, 102.0, 100.4, 101.8), (101.8, 103.2, 101.6, 103.0),
          (103.0, 104.4, 102.8, 104.2), (104.2, 105.0, 103.9, 104.6)]      # hoch, Nackenlinie 105,0
    k += [(104.6, 104.8, 103.2, 103.4), (103.4, 103.6, 102.0, 102.2),
          (102.2, 102.4, 100.9, 101.1)]
    k += [(101.1, 101.4, zweites_tief, 100.9)]                             # zweites Tief
    k += [(100.9, 102.4, 100.7, 102.2), (102.2, 103.6, 102.0, 103.4),
          (103.4, 104.7, 103.2, 104.5)]
    if nacken_bruch:
        k += [(104.5, 105.9, 104.3, 105.7)]                               # schließt über 105,0
    else:
        k += [(104.5, 105.4, 104.0, 104.6)]                               # nur der Docht ist drüber
    return k


class Formationen(unittest.TestCase):
    def test_doppelboden(self):
        f = einer(muster.finde_muster(kerzen(*w_form())), "doppelboden")
        self.assertEqual(f["richtung"], "long")
        self.assertAlmostEqual(f["einstieg"], 105.7)                      # Schlusskurs der Ausbruchskerze
        self.assertLess(f["stop"], 100.0)                                 # unter dem tieferen Tief
        self.assertAlmostEqual(f["ziel"], 105.7 + (105.0 - 100.0))        # Höhe der Formation
        self.assertEqual(f["linien"][0]["name"], "Nackenlinie")
        self.assertAlmostEqual(f["linien"][0]["preis"], 105.0)

    def test_doppelboden_erst_mit_schluss_ueber_der_nackenlinie(self):
        funde = muster.finde_muster(kerzen(*w_form(nacken_bruch=False)))
        self.assertNotIn("doppelboden", namen(funde))

    def test_zweites_tief_viel_tiefer_ist_kein_doppelboden(self):
        funde = muster.finde_muster(kerzen(*w_form(zweites_tief=97.5)))
        self.assertNotIn("doppelboden", namen(funde))

    def test_doppeltop_ist_das_spiegelbild(self):
        gespiegelt = [(300 - o, 300 - l, 300 - h, 300 - c) for o, h, l, c in w_form()]
        f = einer(muster.finde_muster(kerzen(*gespiegelt)), "doppeltop")
        self.assertEqual(f["richtung"], "short")
        self.assertAlmostEqual(f["einstieg"], 300 - 105.7)
        self.assertGreater(f["stop"], 200.0)
        self.assertAlmostEqual(f["ziel"], (300 - 105.7) - 5.0)

    def test_ausbruch_nach_oben(self):
        k = seitwaerts(100, 30) + [(100.2, 102.6, 100.0, 102.4)]          # Zone 98,9 bis 101,1
        f = einer(muster.finde_muster(kerzen(*k)), "ausbruch")
        self.assertEqual(f["richtung"], "long")
        self.assertAlmostEqual(f["einstieg"], 102.4)
        self.assertLess(f["stop"], 98.9)
        self.assertAlmostEqual(f["ziel"], 102.4 + (101.1 - 98.9))

    def test_ausbruch_nach_unten(self):
        k = seitwaerts(100, 30) + [(99.8, 100.0, 97.4, 97.6)]
        f = einer(muster.finde_muster(kerzen(*k)), "ausbruch")
        self.assertEqual(f["richtung"], "short")
        self.assertGreater(f["stop"], 101.1)

    def test_docht_ueber_der_zone_ist_kein_ausbruch(self):
        k = seitwaerts(100, 30) + [(100.2, 102.6, 100.0, 100.8)]
        self.assertNotIn("ausbruch", namen(muster.finde_muster(kerzen(*k))))

    def test_kein_ausbruch_ohne_enge_zone(self):
        k = trend(80, 100, 30) + [(100.0, 103.0, 99.8, 102.8)]
        self.assertNotIn("ausbruch", namen(muster.finde_muster(kerzen(*k))))


HAMMER = (101.5, 102.2, 98.6, 102.0)   # Einstieg knapp über 102,2 / Stop knapp unter 98,6 / Ziel rund 109,8


def hammer_mit(*danach):
    return einer(muster.finde_muster(kerzen(*AB, HAMMER, *danach)), "hammer")


class Ausgang(unittest.TestCase):
    def test_ziel_zuerst(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (103.4, 106.0, 103.0, 105.8), (105.8, 110.5, 105.5, 110.0))
        self.assertEqual(f["ausgang"], "ziel")
        self.assertAlmostEqual(f["r"], 2.0)
        self.assertEqual(f["dauer"], 2)

    def test_stop_zuerst(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (103.4, 103.5, 98.0, 98.4))
        self.assertEqual(f["ausgang"], "stop")
        self.assertAlmostEqual(f["r"], -1.0)

    def test_stop_und_ziel_in_einer_kerze_zaehlt_als_stop(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (103.4, 111.0, 98.0, 105.0))
        self.assertEqual(f["ausgang"], "stop")
        self.assertEqual(f["grund"], "stop_beide")
        self.assertAlmostEqual(f["r"], -1.0)

    def test_nie_ausgeloest_ohne_bestaetigung(self):
        f = hammer_mit((102.0, 102.1, 100.5, 100.8), (100.8, 101.5, 100.0, 101.0), (101.0, 101.9, 100.2, 101.2),
                       (101.2, 110.0, 101.0, 109.5))      # kommt zu spät: 4. Kerze
        self.assertEqual(f["ausgang"], "nie")
        self.assertEqual(f["grund"], "nie_keine_bestaetigung")
        self.assertIsNone(f["r"])

    def test_nie_ausgeloest_wenn_muster_vorher_bricht(self):
        f = hammer_mit((102.0, 102.1, 98.0, 98.3), (98.3, 103.0, 98.2, 102.9))
        self.assertEqual(f["ausgang"], "nie")
        self.assertEqual(f["grund"], "nie_gebrochen")

    def test_noch_offen_wartet_auf_bestaetigung(self):
        f = hammer_mit((102.0, 102.1, 100.5, 100.8))
        self.assertEqual(f["ausgang"], "offen")
        self.assertEqual(f["grund"], "offen_wartet")

    def test_noch_offen_trade_laeuft(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (103.4, 104.0, 102.5, 103.0))
        self.assertEqual(f["ausgang"], "offen")
        self.assertEqual(f["grund"], "offen_laeuft")
        self.assertIsNone(f["r"])

    def test_stop_in_der_einstiegskerze_zaehlt_als_stop(self):
        f = hammer_mit((102.1, 103.0, 98.0, 99.0))
        self.assertEqual(f["ausgang"], "stop")
        self.assertEqual(f["grund"], "stop_einstiegskerze")

    def test_kursluecke_ueber_den_stop_kostet_mehr_als_1r(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (95.0, 96.0, 94.0, 95.5))
        self.assertEqual(f["ausgang"], "stop")
        self.assertEqual(f["grund"], "stop_luecke")
        self.assertLess(f["r"], -1.0)

    def test_kursluecke_ueber_das_ziel_bringt_mehr_als_geplant(self):
        f = hammer_mit((102.1, 103.6, 101.9, 103.4), (112.0, 113.0, 111.5, 112.5))
        self.assertEqual(f["ausgang"], "ziel")
        self.assertEqual(f["grund"], "ziel_luecke")
        self.assertGreater(f["r"], 2.0)

    def test_doji_richtung_kommt_vom_ausbruch(self):
        doji = (108.4, 110.0, 107.0, 108.45)
        rauf = einer(muster.finde_muster(kerzen(*AUF, doji, (108.5, 110.2, 108.3, 110.0))), "doji")
        self.assertEqual(rauf["richtung"], "long")
        self.assertLess(rauf["stop"], 107.0)
        runter = einer(muster.finde_muster(kerzen(*AUF, doji, (108.4, 108.6, 106.5, 106.8))), "doji")
        self.assertEqual(runter["richtung"], "short")
        self.assertGreater(runter["stop"], 110.0)
        self.assertLess(runter["ziel"], runter["einstieg"])

    def test_short_gewinnt_wenn_kurs_faellt(self):
        stern = (108.6, 111.4, 107.9, 108.1)
        f = einer(muster.finde_muster(kerzen(
            *AUF, stern, (108.0, 108.2, 106.6, 106.8), (106.8, 107.0, 99.0, 99.5))), "sternschnuppe")
        self.assertEqual(f["ausgang"], "ziel")
        self.assertAlmostEqual(f["r"], 2.0)
        self.assertLess(f["ziel"], f["einstieg"])
        self.assertGreater(f["stop"], f["einstieg"])


class Statistik(unittest.TestCase):
    def test_statistik_zaehlt_genau_die_liste(self):
        liste = (
            [{"muster": "hammer", "ausgang": "ziel", "r": 2.0, "ziel_r": 2.0}] * 3
            + [{"muster": "hammer", "ausgang": "stop", "r": -1.0, "ziel_r": 2.0}] * 6
            + [{"muster": "hammer", "ausgang": "nie", "r": None, "ziel_r": 2.0}] * 2
            + [{"muster": "hammer", "ausgang": "offen", "r": None, "ziel_r": None}]
        )
        s = muster.statistik(liste)["hammer"]
        self.assertEqual(s["funde"], 12)
        self.assertEqual((s["ziel"], s["stop"], s["nie"], s["offen"]), (3, 6, 2, 1))
        self.assertEqual(s["abgeschlossen"], 9)
        self.assertAlmostEqual(s["trefferquote"], 3 / 9, places=3)
        self.assertAlmostEqual(s["schnitt_r"], 0.0)             # 3 x +2 und 6 x -1: genau null
        self.assertAlmostEqual(s["noetig"], 1 / 3, places=3)    # Gewinnschwelle bei Ziel 2 R
        self.assertTrue(s["zu_wenig"])                          # nur 9 abgeschlossene Beispiele
        self.assertLess(s["spanne"][0], 1 / 3)                  # Unsicherheit: Spanne um die Quote herum
        self.assertGreater(s["spanne"][1], 1 / 3)

    def test_ab_30_beispielen_keine_warnung(self):
        liste = [{"muster": "doji", "ausgang": "stop", "r": -1.0, "ziel_r": 2.0}] * 30
        self.assertFalse(muster.statistik(liste)["doji"]["zu_wenig"])

    def test_jede_regel_hat_einen_erklaertext(self):
        keys = {m["key"] for m in muster.MUSTER}
        self.assertEqual(len(keys), 10)
        for m in muster.MUSTER:
            self.assertTrue(m["regeln"] and m["einstieg"] and m["stop"] and m["ziel"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
