"""Der JavaScript-Kern (kern/muster.js), aufrufbar aus Python.

finde_muster() und statistik() laufen in Node. Jeder Aufruf wird zusätzlich mit der
Python-Referenz (referenz/muster_python.py, unveränderte Kopie aus der alten App) gerechnet.
Weichen die Ergebnisse ab, schlägt der Test sofort fehl.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER / "referenz"))

import muster_python as referenz  # noqa: E402

# Konstanten und Texte kommen aus der Referenz; die Tests prüfen damit dieselben Erwartungen.
MUSTER = referenz.MUSTER
ALLGEMEIN = referenz.ALLGEMEIN
GRUND_TEXT = referenz.GRUND_TEXT
MIN_BEISPIELE = referenz.MIN_BEISPIELE
WARTE_KERZEN = referenz.WARTE_KERZEN


def node(auftraege: list) -> list:
    erg = subprocess.run(["node", str(HIER / "bruecke.js")], input=json.dumps(auftraege),
                         capture_output=True, text=True, encoding="utf-8", check=False)
    if erg.returncode != 0:
        raise RuntimeError("Node-Fehler:\n" + erg.stderr)
    return json.loads(erg.stdout)


def gleich(a, b, pfad="") -> None:
    """Vergleicht zwei Ergebnisse. Kommazahlen dürfen sich nur in der letzten Stelle unterscheiden."""
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str):
        if a != b:
            raise AssertionError(f"{pfad}: Python {a!r} != JS {b!r}")
        return
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if not math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12):
            raise AssertionError(f"{pfad}: Python {a!r} != JS {b!r}")
        return
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            raise AssertionError(f"{pfad}: Felder Python {sorted(a)} != JS {sorted(b)}")
        for k in a:
            gleich(a[k], b[k], f"{pfad}.{k}")
        return
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        if len(a) != len(b):
            raise AssertionError(f"{pfad}: Länge Python {len(a)} != JS {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            gleich(x, y, f"{pfad}[{i}]")
        return
    raise AssertionError(f"{pfad}: Typ Python {type(a).__name__} != JS {type(b).__name__}")


def finde_muster(kerzen, n_fertig=None, markt="", tf=""):
    js = node([{"fn": "finde_muster", "kerzen": kerzen, "n_fertig": n_fertig, "markt": markt, "tf": tf}])[0]
    gleich(referenz.finde_muster(kerzen, n_fertig, markt, tf), js, "finde_muster")
    return js


def statistik(funde):
    js = node([{"fn": "statistik", "funde": funde}])[0]
    gleich(referenz.statistik(funde), js, "statistik")
    return js
