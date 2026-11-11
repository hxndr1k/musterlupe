"""Python gegen JavaScript auf identischen Kerzenfolgen.

Erzeugt viele zufällige Kursverläufe (fester Startwert, also immer dieselben),
rechnet sie mit der Python-Referenz und mit kern/muster.js und verlangt dasselbe Ergebnis:
dieselben Funde, dieselben Preise, dieselben Ausgänge, dieselbe Statistik.
Dazu müssen alle Erklärtexte Wort für Wort gleich sein.

Start im Projektordner:  python -m unittest discover -s tests -v
"""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import js_muster  # noqa: E402
from js_muster import gleich, node, referenz  # noqa: E402


def zufallskerzen(rnd: random.Random, anzahl: int, schritt: int = 300):
    """Zufallsweg mit wechselnder Unruhe, Kurslücken und gelegentlich Dojis und langen Dochten."""
    preis = rnd.uniform(0.05, 80000)
    unruhe = preis * rnd.uniform(0.002, 0.03)
    kerzen, t = [], 1_700_000_000
    for _ in range(anzahl):
        if rnd.random() < 0.05:
            unruhe = preis * rnd.uniform(0.002, 0.03)
        o = preis + (rnd.gauss(0, unruhe * 2) if rnd.random() < 0.03 else 0.0)   # selten eine Lücke
        c = o + rnd.gauss(rnd.choice((-0.3, 0.0, 0.3)) * unruhe, unruhe)
        if rnd.random() < 0.08:
            c = o + rnd.gauss(0, unruhe * 0.03)                                  # fast ein Doji
        h = max(o, c) + abs(rnd.gauss(0, unruhe * rnd.choice((0.2, 0.6, 2.0))))
        l = min(o, c) - abs(rnd.gauss(0, unruhe * rnd.choice((0.2, 0.6, 2.0))))
        l = max(l, preis * 0.01)
        kerzen.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": round(rnd.uniform(1, 1000), 3)})
        preis = max(c, preis * 0.05)
        t += schritt
    return kerzen


class PythonGegenJs(unittest.TestCase):
    def test_zufaellige_verlaeufe_ergeben_dasselbe(self):
        rnd = random.Random(20261111)
        faelle = [zufallskerzen(rnd, rnd.choice((30, 120, 600, 1500))) for _ in range(60)]
        auftraege = [{"fn": "finde_muster", "kerzen": k, "n_fertig": len(k) - rnd.choice((0, 1)),
                      "markt": "krypto:TEST", "tf": "5m"} for k in faelle]
        js = node(auftraege)
        gesamt = 0
        alle_py = []
        for a, js_funde in zip(auftraege, js):
            py_funde = referenz.finde_muster(a["kerzen"], a["n_fertig"], a["markt"], a["tf"])
            gleich(py_funde, js_funde, "finde_muster")
            gesamt += len(py_funde)
            alle_py.extend(py_funde)
        self.assertGreater(gesamt, 500, "zu wenige Funde, der Vergleich wäre zu schwach")
        arten = {f["muster"] for f in alle_py}
        self.assertEqual(len(arten), 10, f"nicht jedes Muster kam vor: {sorted(arten)}")
        ausgaenge = {f["grund"] for f in alle_py}
        self.assertGreaterEqual(len(ausgaenge), 8, f"zu wenige Ausgangs-Arten: {sorted(ausgaenge)}")
        gleich(referenz.statistik(alle_py), node([{"fn": "statistik", "funde": alle_py}])[0], "statistik")
        print(f"\n  {len(faelle)} Verläufe, {gesamt} Funde, {len(ausgaenge)} Ausgangs-Arten: Python und JS gleich.")

    def test_rundung_wie_python(self):
        rnd = random.Random(7)
        werte = [0.0625, 0.0005, 2.5e-4, 1.0005, 2.675, -0.0625, 0.1235, 3 / 9, 1 / 3, 2 / 3, 12.3445, -1.0, 0.5,
                 1.5, 2.5, -2.5, 0.00015, 123456.78905]
        werte += [rnd.uniform(-5, 5) for _ in range(2000)] + [rnd.randint(-4000, 4000) / 16 for _ in range(500)]
        for stellen in (3, 4):
            js = node([{"fn": "runde", "werte": werte, "stellen": stellen}])[0]
            for w, j in zip(werte, js):
                self.assertEqual(round(w, stellen), j, f"round({w!r}, {stellen})")

    def test_erklaertexte_sind_gleich(self):
        t = node([{"fn": "texte"}])[0]
        gleich(referenz.MUSTER, t["muster"], "MUSTER")
        gleich(referenz.ALLGEMEIN, t["allgemein"], "ALLGEMEIN")
        gleich(referenz.GRUND_TEXT, t["gruende"], "GRUND_TEXT")
        self.assertEqual(t["min_beispiele"], js_muster.MIN_BEISPIELE)
        self.assertEqual(t["warte_kerzen"], js_muster.WARTE_KERZEN)


if __name__ == "__main__":
    unittest.main(verbosity=2)
