"""Muster-Erkennung mit festen Regeln.

Alle Schwellen stehen hier oben an einer Stelle. Die Erklärtexte in der App
werden aus denselben Zahlen gebaut, damit Text und Code nicht auseinanderlaufen.

Fallende Muster sind nicht extra programmiert: Die Kurse werden gespiegelt
(aus Hoch wird Tief, alles mit umgekehrtem Vorzeichen), dann läuft die Regel
für das steigende Muster. So sind beide Seiten garantiert gleich streng.

Wichtig für die Ehrlichkeit: Jede Regel schaut nur auf Kerzen, die zu dem
Zeitpunkt schon fertig waren. Nichts wird mit Wissen aus der Zukunft erkannt.
"""
from __future__ import annotations

# ---------------------------------------------------------------- Schwellen
SCHNITT_KERZEN = 14     # Durchschnitts-Kerze: mittlere Höhe der 14 Kerzen vor dem Muster
TREND_KERZEN = 8        # so viele Kerzen vor dem Muster zählen für den Trend
TREND_STAERKE = 1.5     # so viele Durchschnitts-Kerzen muss der Kurs gelaufen sein
PUFFER = 0.05           # Abstand von Einstieg und Stop zum Muster (in Durchschnitts-Kerzen)
WARTE_KERZEN = 3        # so viele Kerzen darf die Bestätigung dauern
ZIEL_R = 2.0            # Ziel bei Kerzenmustern: 2 x Risiko

MIN_HOEHE = 1.0         # Hammer/Sternschnuppe: Kerze mindestens so hoch wie 1 Durchschnitts-Kerze
DOCHT_FAKTOR = 2.0      # langer Docht mindestens 2 x Körper
GEGENDOCHT_MAX = 0.15   # der andere Docht höchstens 15 % der Kerze
DOJI_KOERPER = 0.10     # Doji: Körper höchstens 10 % der Kerze
DOJI_MIN_HOEHE = 1.0    # Doji: Kerze mindestens so hoch wie 1 Durchschnitts-Kerze
GROSS = 0.7             # "große" Kerze: Körper mindestens 0,7 Durchschnitts-Kerzen
KLEIN = 0.3             # "kleine" Kerze: Körper höchstens 0,3 Durchschnitts-Kerzen
STERN_NAEHE = 0.25      # Stern: Körper höchstens ein Viertel in die erste Kerze hinein

WENDE_KERZEN = 4        # Wendepunkt: tiefstes Tief von 4 Kerzen links und rechts
FORM_MAX = 60           # Doppelboden/-top: höchstens 60 Kerzen vom ersten Tief bis zum Ausbruch
FORM_MIN_ABSTAND = 6    # zweites Tief frühestens 6 Kerzen nach dem ersten
FORM_MIN_HOEHE = 3.0    # Formation mindestens 3 Durchschnitts-Kerzen hoch
FORM_TOLERANZ = 0.2     # die zwei Tiefs dürfen um ein Fünftel der Höhe auseinanderliegen
FORM_VORLAUF = 20       # in den 20 Kerzen davor muss der Kurs über der Nackenlinie gewesen sein

ZONE_KERZEN = 20        # Seitwärtszone: die letzten 20 Kerzen
ZONE_MAX = 4.0          # Zone höchstens 4 Durchschnitts-Kerzen hoch

MIN_BEISPIELE = 30      # darunter: "zu wenige Beispiele für eine Aussage"


def _z(x: float) -> str:
    """Zahl in deutscher Schreibweise, ohne unnötige Nullen."""
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


# ---------------------------------------------------------------- Kursreihe
class Reihe:
    """Kerzen als vier Listen plus schnelle Durchschnitts-Berechnung."""

    __slots__ = ("o", "h", "l", "c", "n", "_sum")

    def __init__(self, o, h, l, c):
        self.o, self.h, self.l, self.c = o, h, l, c
        self.n = len(c)
        s = [0.0]
        for i in range(self.n):
            s.append(s[-1] + (h[i] - l[i]))
        self._sum = s

    @classmethod
    def aus_kerzen(cls, kerzen):
        return cls(
            [k["o"] for k in kerzen],
            [k["h"] for k in kerzen],
            [k["l"] for k in kerzen],
            [k["c"] for k in kerzen],
        )

    def gespiegelt(self) -> "Reihe":
        """Dieselben Kurse auf den Kopf gestellt. Aus Hoch wird Tief."""
        return Reihe(
            [-x for x in self.o],
            [-x for x in self.l],
            [-x for x in self.h],
            [-x for x in self.c],
        )

    def schnitt(self, i: int, n: int = SCHNITT_KERZEN):
        """Durchschnitts-Kerze: mittlere Höhe (Hoch minus Tief) der n Kerzen VOR Kerze i."""
        if i - n < 0:
            return None
        wert = (self._sum[i] - self._sum[i - n]) / n
        return wert if wert > 0 else None

    def trend(self, start: int):
        """'ab', 'auf' oder None: Was hat der Kurs in den Kerzen vor `start` gemacht?"""
        a = start - 1
        b = a - TREND_KERZEN
        if b < 0:
            return None
        s = self.schnitt(start)
        if not s:
            return None
        weg = self.c[a] - self.c[b]
        if weg <= -TREND_STAERKE * s:
            return "ab"
        if weg >= TREND_STAERKE * s:
            return "auf"
        return None


# ------------------------------------------- Regeln (immer die steigende Seite)
def _hammer(r: Reihe, i: int):
    s = r.schnitt(i)
    if not s:
        return None
    o, h, l, c = r.o[i], r.h[i], r.l[i], r.c[i]
    hoehe = h - l
    if hoehe < MIN_HOEHE * s:
        return None
    koerper = abs(c - o)
    oben = h - max(o, c)
    unten = min(o, c) - l
    if koerper <= DOJI_KOERPER * hoehe:      # dann wäre es ein Doji
        return None
    if unten < DOCHT_FAKTOR * koerper:
        return None
    if oben > GEGENDOCHT_MAX * hoehe:
        return None
    if r.trend(i) != "ab":
        return None
    p = PUFFER * s
    return {"start": i, "ende": i, "art": "order", "einstieg": h + p, "stop": l - p}


def _umhuellend(r: Reihe, i: int):
    if i < 1:
        return None
    s = r.schnitt(i - 1)
    if not s:
        return None
    o1, c1 = r.o[i - 1], r.c[i - 1]
    o2, c2 = r.o[i], r.c[i]
    if not (c1 < o1 and c2 > o2):            # erst rot, dann grün
        return None
    k1, k2 = o1 - c1, c2 - o2
    if not (o2 <= c1 and c2 >= o1 and k2 > k1):
        return None
    if k2 < GROSS * s:
        return None
    if r.trend(i - 1) != "ab":
        return None
    p = PUFFER * s
    return {
        "start": i - 1, "ende": i, "art": "order",
        "einstieg": r.h[i] + p,
        "stop": min(r.l[i - 1], r.l[i]) - p,
    }


def _stern(r: Reihe, i: int):
    if i < 2:
        return None
    s = r.schnitt(i - 2)
    if not s:
        return None
    o1, c1 = r.o[i - 2], r.c[i - 2]
    o2, c2 = r.o[i - 1], r.c[i - 1]
    o3, c3 = r.o[i], r.c[i]
    k1 = o1 - c1
    if k1 < GROSS * s:                        # lange rote Kerze
        return None
    if abs(c2 - o2) > KLEIN * s:              # kleine Kerze
        return None
    if max(o2, c2) > c1 + STERN_NAEHE * k1:   # ... die unten sitzt
        return None
    if not (c3 > o3 and c3 >= (o1 + c1) / 2):  # grün und über der Mitte der roten
        return None
    if r.trend(i - 2) != "ab":
        return None
    p = PUFFER * s
    return {
        "start": i - 2, "ende": i, "art": "order",
        "einstieg": r.h[i] + p,
        "stop": min(r.l[i - 2], r.l[i - 1], r.l[i]) - p,
    }


def _doji(r: Reihe, i: int):
    s = r.schnitt(i)
    if not s:
        return None
    o, h, l, c = r.o[i], r.h[i], r.l[i], r.c[i]
    hoehe = h - l
    if hoehe < DOJI_MIN_HOEHE * s:
        return None
    if abs(c - o) > DOJI_KOERPER * hoehe:
        return None
    if r.trend(i) is None:
        return None
    p = PUFFER * s
    return {"start": i, "ende": i, "art": "beidseitig", "oben": h + p, "unten": l - p}


def _doppelboeden(r: Reihe, n: int):
    """Alle Doppelböden. Erkannt wird erst in der Kerze, die über der Nackenlinie schließt."""
    gefunden = {}
    K = WENDE_KERZEN
    for a in range(max(K, FORM_VORLAUF, SCHNITT_KERZEN), n - K):
        la = r.l[a]
        # erstes Tief: tiefster Punkt von K Kerzen links und rechts
        if min(r.l[a - K:a]) <= la or min(r.l[a + 1:a + K + 1]) < la:
            continue
        s = r.schnitt(a)
        if not s:
            continue
        nacken = None       # höchstes Hoch nach dem ersten Tief
        in_zone = False     # ist der Kurs schon zum zweiten Mal unten?
        tief2 = None
        b = None
        for j in range(a + 1, min(a + FORM_MAX + 1, n)):
            if not in_zone:
                hoehe = (nacken - la) if nacken is not None else 0.0
                unten = (
                    nacken is not None
                    and hoehe >= FORM_MIN_HOEHE * s
                    and j - a >= FORM_MIN_ABSTAND
                    and r.l[j] <= la + FORM_TOLERANZ * hoehe
                )
                if not unten:
                    if r.l[j] < la:          # fällt einfach weiter: kein Boden
                        break
                    if nacken is None or r.h[j] > nacken:
                        nacken = r.h[j]
                    continue
                in_zone = True
                tief2 = r.l[j]
                b = j
            hoehe = nacken - la
            if r.l[j] < tief2:
                tief2 = r.l[j]
                b = j
            if tief2 < la - FORM_TOLERANZ * hoehe:   # zweites Tief deutlich tiefer
                break
            if r.c[j] > nacken:
                if j > b and max(r.h[a - FORM_VORLAUF:a]) >= nacken and j not in gefunden:
                    tief = min(la, tief2)
                    p = PUFFER * s
                    gefunden[j] = {
                        "start": a, "ende": j, "art": "schluss",
                        "einstieg": r.c[j],
                        "stop": tief - p,
                        "ziel_abstand": nacken - tief,
                        "linien": [{"name": "Nackenlinie", "preis": nacken, "von": a, "bis": j}],
                        "punkte": [a, b],
                    }
                break
    return [gefunden[j] for j in sorted(gefunden)]


def _ausbrueche(r: Reihe, n: int):
    """Ausbrüche nach oben aus einer engen Seitwärtszone (Schlusskurs über der Zone)."""
    funde = []
    letzter = -10 ** 9
    Z = ZONE_KERZEN
    for j in range(Z, n):
        if j - letzter < Z:                   # dieselbe Zone nicht doppelt zählen
            continue
        s = r.schnitt(j, Z)
        if not s:
            continue
        oben = max(r.h[j - Z:j])
        if r.c[j] <= oben:
            continue
        unten = min(r.l[j - Z:j])
        hoehe = oben - unten
        if hoehe > ZONE_MAX * s:
            continue
        p = PUFFER * s
        funde.append({
            "start": j - Z, "ende": j, "art": "schluss",
            "einstieg": r.c[j],
            "stop": unten - p,
            "ziel_abstand": hoehe,
            "linien": [
                {"name": "Zone oben", "preis": oben, "von": j - Z, "bis": j},
                {"name": "Zone unten", "preis": unten, "von": j - Z, "bis": j},
            ],
        })
        letzter = j
    return funde


# -------------------------------------------------- Ausgang (immer als Kauf)
def _auswerten(r: Reihe, n: int, su: dict):
    """Spielt einen Kauf durch: Wird der Einstieg ausgelöst? Was kommt zuerst, Stop oder Ziel?

    Vorsichtige Annahmen:
    - Berührt eine Kerze Stop und Ziel, zählt der Stop.
    - Berührt schon die Einstiegskerze den Stop, zählt der Stop.
    Kurslücken werden so gerechnet, wie eine echte Order ausgeführt würde: Öffnet eine Kerze
    schon jenseits von Stop oder Ziel, zählt der Eröffnungskurs (beim Stop schlechter als
    geplant, beim Ziel besser).
    """
    i = su["ende"]
    stop = su["stop"]

    def ziel_von(preis):
        if "ziel_abstand" in su:
            return preis + su["ziel_abstand"]
        return preis + ZIEL_R * (preis - stop)

    def ergebnis(ausgang, grund, einstieg, i_ein=None, i_aus=None, rr=None):
        ziel = ziel_von(einstieg)
        risiko = einstieg - stop
        return {
            "ausgang": ausgang, "grund": grund,
            "einstieg": einstieg, "stop": stop, "ziel": ziel,
            "i_einstieg": i_ein, "i_schluss": i_aus,
            "r": rr,
            "ziel_r": (ziel - einstieg) / risiko if risiko > 0 else None,
        }

    if su["art"] == "schluss":
        einstieg = su["einstieg"]
        i_ein = i
        if einstieg - stop <= 0:
            return None
        ziel = ziel_von(einstieg)
        risiko = einstieg - stop
    else:
        plan = su["einstieg"]
        einstieg = None
        i_ein = None
        for j in range(i + 1, i + 1 + WARTE_KERZEN):
            if j >= n:
                return ergebnis("offen", "offen_wartet", plan)
            if r.h[j] >= plan:
                einstieg = max(plan, r.o[j])   # Kurslücke: schlechterer Preis
                i_ein = j
                break
            if r.l[j] <= stop:
                return ergebnis("nie", "nie_gebrochen", plan)
        if einstieg is None:
            return ergebnis("nie", "nie_keine_bestaetigung", plan)
        ziel = ziel_von(einstieg)
        risiko = einstieg - stop
        if r.l[i_ein] <= stop:
            return ergebnis("stop", "stop_einstiegskerze", einstieg, i_ein, i_ein, -1.0)
        if r.h[i_ein] >= ziel:
            return ergebnis("ziel", "ziel", einstieg, i_ein, i_ein, (ziel - einstieg) / risiko)

    for j in range(i_ein + 1, n):
        if r.o[j] <= stop:
            return ergebnis("stop", "stop_luecke", einstieg, i_ein, j, (r.o[j] - einstieg) / risiko)
        if r.o[j] >= ziel:
            return ergebnis("ziel", "ziel_luecke", einstieg, i_ein, j, (r.o[j] - einstieg) / risiko)
        if r.l[j] <= stop:
            grund = "stop_beide" if r.h[j] >= ziel else "stop"
            return ergebnis("stop", grund, einstieg, i_ein, j, -1.0)
        if r.h[j] >= ziel:
            return ergebnis("ziel", "ziel", einstieg, i_ein, j, (ziel - einstieg) / risiko)
    return ergebnis("offen", "offen_laeuft", einstieg, i_ein, None, None)


def _auswerten_doji(r: Reihe, rm: Reihe, n: int, su: dict):
    """Doji hat keine eigene Richtung: Die Seite, auf der der Kurs zuerst ausbricht, entscheidet."""
    i = su["ende"]
    oben, unten = su["oben"], su["unten"]
    for j in range(i + 1, i + 1 + WARTE_KERZEN):
        if j >= n:
            return None, {"ausgang": "offen", "grund": "offen_wartet"}
        if r.h[j] >= oben:
            # Bricht dieselbe Kerze auch unten aus, erkennt _auswerten das als Stop.
            return "long", _auswerten(r, n, {"ende": i, "art": "order", "einstieg": oben, "stop": unten})
        if r.l[j] <= unten:
            return "short", _auswerten(rm, n, {"ende": i, "art": "order", "einstieg": -unten, "stop": -oben})
    return None, {"ausgang": "nie", "grund": "nie_keine_bestaetigung"}


GRUND_TEXT = {
    "ziel": "Das Ziel wurde zuerst erreicht.",
    "ziel_luecke": "Der Kurs ist mit einer Lücke über das Ziel gesprungen. Der Gewinn war größer als geplant.",
    "stop": "Der Stop wurde zuerst erreicht.",
    "stop_beide": "Eine Kerze hat Stop und Ziel berührt. Das zählt vorsichtig als Stop.",
    "stop_einstiegskerze": "Schon die Einstiegskerze hat den Stop berührt. Das zählt vorsichtig als Stop.",
    "stop_luecke": "Der Kurs ist mit einer Lücke über den Stop gesprungen. Der Verlust war größer als geplant.",
    "nie_keine_bestaetigung": f"Die Bestätigung kam nicht. Keine der nächsten {WARTE_KERZEN} Kerzen hat den Einstieg erreicht.",
    "nie_gebrochen": "Der Kurs lief zuerst auf die falsche Seite aus dem Muster. Damit war es ungültig.",
    "offen_wartet": "Das Muster ist ganz frisch. Es wartet noch auf die Bestätigung.",
    "offen_laeuft": "Der Einstieg ist ausgelöst. Bisher wurde weder Stop noch Ziel erreicht.",
}


# ------------------------------------------------------------- alles zusammen
def finde_muster(kerzen: list, n_fertig: int | None = None, markt: str = "", tf: str = "") -> list:
    """Sucht alle Muster in den fertigen Kerzen und berechnet für jedes den Ausgang.

    kerzen: Liste von {"t","o","h","l","c","v"}, älteste zuerst.
    n_fertig: so viele Kerzen (von vorn) sind abgeschlossen. Die laufende Kerze zählt nicht.
    """
    n = len(kerzen) if n_fertig is None else min(n_fertig, len(kerzen))
    if n < SCHNITT_KERZEN + TREND_KERZEN + 2:
        return []
    r = Reihe.aus_kerzen(kerzen[:n])
    rm = r.gespiegelt()
    funde = []

    def dazu(key, richtung, su, erg):
        if erg is None:
            return
        vz = -1 if richtung == "short" else 1

        def preis(x):
            return None if x is None else vz * x

        linien = [
            {"name": li["name"], "preis": vz * li["preis"],
             "t_von": kerzen[li["von"]]["t"], "t_bis": kerzen[li["bis"]]["t"]}
            for li in su.get("linien", [])
        ]
        if key == "doji":
            linien = [
                {"name": "Doji oben", "preis": su["oben"], "t_von": kerzen[su["start"]]["t"],
                 "t_bis": kerzen[min(su["ende"] + WARTE_KERZEN, n - 1)]["t"]},
                {"name": "Doji unten", "preis": su["unten"], "t_von": kerzen[su["start"]]["t"],
                 "t_bis": kerzen[min(su["ende"] + WARTE_KERZEN, n - 1)]["t"]},
            ]
        i_ein, i_aus = erg.get("i_einstieg"), erg.get("i_schluss")
        t_ende = kerzen[su["ende"]]["t"]
        funde.append({
            "id": f"{markt}|{tf}|{key}|{richtung or 'x'}|{t_ende}",
            "muster": key,
            "richtung": richtung,
            "markt": markt,
            "tf": tf,
            "t_start": kerzen[su["start"]]["t"],
            "t_ende": t_ende,
            "einstieg": preis(erg.get("einstieg")),
            "stop": preis(erg.get("stop")),
            "ziel": preis(erg.get("ziel")),
            "t_einstieg": kerzen[i_ein]["t"] if i_ein is not None else None,
            "t_schluss": kerzen[i_aus]["t"] if i_aus is not None else None,
            "dauer": (i_aus - i_ein) if (i_ein is not None and i_aus is not None) else None,
            "ausgang": erg["ausgang"],
            "grund": erg["grund"],
            "r": None if erg.get("r") is None else round(erg["r"], 3),
            "ziel_r": None if erg.get("ziel_r") is None else round(erg["ziel_r"], 3),
            "linien": linien,
        })

    for i in range(n):
        for key_auf, key_ab, regel in (
            ("hammer", "sternschnuppe", _hammer),
            ("bull_umhuellend", "baer_umhuellend", _umhuellend),
            ("morgenstern", "abendstern", _stern),
        ):
            su = regel(r, i)
            if su:
                dazu(key_auf, "long", su, _auswerten(r, n, su))
            su = regel(rm, i)
            if su:
                dazu(key_ab, "short", su, _auswerten(rm, n, su))
        su = _doji(r, i)
        if su:
            richtung, erg = _auswerten_doji(r, rm, n, su)
            dazu("doji", richtung, su, erg)

    for su in _doppelboeden(r, n):
        dazu("doppelboden", "long", su, _auswerten(r, n, su))
    for su in _doppelboeden(rm, n):
        dazu("doppeltop", "short", su, _auswerten(rm, n, su))
    for su in _ausbrueche(r, n):
        dazu("ausbruch", "long", su, _auswerten(r, n, su))
    for su in _ausbrueche(rm, n):
        dazu("ausbruch", "short", su, _auswerten(rm, n, su))

    funde.sort(key=lambda f: (f["t_ende"], f["muster"]))
    return funde


def _spanne(treffer: int, anzahl: int):
    """Unsicherheit der Trefferquote (Wilson-Bereich, 95 %): In dieser Spanne kann die echte Quote liegen."""
    if not anzahl:
        return None
    z = 1.96
    p = treffer / anzahl
    nenner = 1 + z * z / anzahl
    mitte = (p + z * z / (2 * anzahl)) / nenner
    halb = z * ((p * (1 - p) / anzahl + z * z / (4 * anzahl * anzahl)) ** 0.5) / nenner
    return [round(max(0.0, mitte - halb), 4), round(min(1.0, mitte + halb), 4)]


def statistik(funde: list) -> dict:
    """Zählt je Muster Funde, Treffer und Fehlschläge. Grundlage ist genau die übergebene Liste."""
    je = {}
    for f in funde:
        s = je.setdefault(f["muster"], {
            "funde": 0, "ziel": 0, "stop": 0, "nie": 0, "offen": 0,
            "_summe_r": 0.0, "_summe_ziel_r": 0.0,
        })
        s["funde"] += 1
        s[f["ausgang"]] += 1
        if f["ausgang"] in ("ziel", "stop"):
            s["_summe_r"] += f["r"]
            s["_summe_ziel_r"] += f["ziel_r"]
    for s in je.values():
        fertig = s["ziel"] + s["stop"]
        s["abgeschlossen"] = fertig
        s["trefferquote"] = round(s["ziel"] / fertig, 4) if fertig else None
        s["schnitt_r"] = round(s["_summe_r"] / fertig, 3) if fertig else None
        # Trefferquote, ab der man vor Gebühren bei null landet (Verlust am Stop = 1 R)
        s["noetig"] = round(1 / (1 + s["_summe_ziel_r"] / fertig), 4) if fertig else None
        s["spanne"] = _spanne(s["ziel"], fertig)
        s["zu_wenig"] = fertig < MIN_BEISPIELE
        del s["_summe_r"], s["_summe_ziel_r"]
    return je


# ------------------------------------------------- Erklärtexte für die App
_TREND_AB = (f"Abwärtstrend davor: Der Schlusskurs direkt vor dem Muster liegt mindestens "
             f"{_z(TREND_STAERKE)} Durchschnitts-Kerzen tiefer als {TREND_KERZEN} Kerzen früher.")
_TREND_AUF = (f"Aufwärtstrend davor: Der Schlusskurs direkt vor dem Muster liegt mindestens "
              f"{_z(TREND_STAERKE)} Durchschnitts-Kerzen höher als {TREND_KERZEN} Kerzen früher.")
_EINSTIEG_AUF = (f"Kauf erst mit Bestätigung: Eine der nächsten {WARTE_KERZEN} Kerzen steigt über das Hoch "
                 f"des Musters. Fällt der Kurs vorher unter das Muster, ist es ungültig.")
_EINSTIEG_AB = (f"Verkauf (Short) erst mit Bestätigung: Eine der nächsten {WARTE_KERZEN} Kerzen fällt unter das Tief "
                f"des Musters. Steigt der Kurs vorher über das Muster, ist es ungültig.")
_ZIEL_2R = f"{_z(ZIEL_R)} × Risiko. Das Risiko ist der Abstand vom Einstieg zum Stop."

MUSTER = [
    {
        "key": "hammer", "name": "Hammer", "seite": "steigend", "kerzen": "1 Kerze",
        "idee": "Verkäufer drücken den Kurs weit nach unten, Käufer holen ihn bis zum Schluss fast ganz zurück.",
        "regeln": [
            _TREND_AB,
            f"Langer Docht nach unten: mindestens {_z(DOCHT_FAKTOR)} × so lang wie der Körper.",
            f"Oben fast kein Docht: höchstens {_z(GEGENDOCHT_MAX * 100)} % der ganzen Kerze.",
            f"Die Kerze ist nicht winzig: mindestens so hoch wie {_z(MIN_HOEHE)} Durchschnitts-Kerze.",
            f"Der Körper ist größer als {_z(DOJI_KOERPER * 100)} % der Kerze. Sonst zählt sie als Doji.",
        ],
        "einstieg": _EINSTIEG_AUF,
        "stop": "Knapp unter dem Tief des Hammers, also unter der Dochtspitze.",
        "ziel": _ZIEL_2R,
        "falle": "Ein langer Docht heißt ein weiter Stop. Im Seitwärtsmarkt bedeutet ein Hammer fast nichts.",
    },
    {
        "key": "sternschnuppe", "name": "Sternschnuppe", "seite": "fallend", "kerzen": "1 Kerze",
        "idee": "Käufer treiben den Kurs hoch, Verkäufer drücken ihn bis zum Schluss wieder herunter.",
        "regeln": [
            _TREND_AUF,
            f"Langer Docht nach oben: mindestens {_z(DOCHT_FAKTOR)} × so lang wie der Körper.",
            f"Unten fast kein Docht: höchstens {_z(GEGENDOCHT_MAX * 100)} % der ganzen Kerze.",
            f"Die Kerze ist nicht winzig: mindestens so hoch wie {_z(MIN_HOEHE)} Durchschnitts-Kerze.",
            f"Der Körper ist größer als {_z(DOJI_KOERPER * 100)} % der Kerze. Sonst zählt sie als Doji.",
        ],
        "einstieg": _EINSTIEG_AB,
        "stop": "Knapp über dem Hoch der Sternschnuppe, also über der Dochtspitze.",
        "ziel": _ZIEL_2R,
        "falle": "In einem starken Aufwärtstrend werden solche Kerzen oft einfach überrollt.",
    },
    {
        "key": "bull_umhuellend", "name": "Bullische umhüllende Kerze", "seite": "steigend", "kerzen": "2 Kerzen",
        "idee": "Die Käufer holen in einer einzigen Kerze alles zurück, was die Verkäufer davor geschafft haben.",
        "regeln": [
            _TREND_AB,
            "Erst eine rote Kerze, dann eine grüne.",
            "Der grüne Körper umschließt den roten Körper ganz und ist größer.",
            f"Die grüne Kerze ist groß: Ihr Körper misst mindestens {_z(GROSS)} Durchschnitts-Kerzen.",
        ],
        "einstieg": _EINSTIEG_AUF,
        "stop": "Knapp unter dem tiefsten Tief der beiden Kerzen.",
        "ziel": _ZIEL_2R,
        "falle": "Ist die grüne Kerze riesig, liegt der Stop weit weg.",
    },
    {
        "key": "baer_umhuellend", "name": "Bärische umhüllende Kerze", "seite": "fallend", "kerzen": "2 Kerzen",
        "idee": "Die Verkäufer nehmen in einer Kerze alles weg, was die Käufer davor geschafft haben.",
        "regeln": [
            _TREND_AUF,
            "Erst eine grüne Kerze, dann eine rote.",
            "Der rote Körper umschließt den grünen Körper ganz und ist größer.",
            f"Die rote Kerze ist groß: Ihr Körper misst mindestens {_z(GROSS)} Durchschnitts-Kerzen.",
        ],
        "einstieg": _EINSTIEG_AB,
        "stop": "Knapp über dem höchsten Hoch der beiden Kerzen.",
        "ziel": _ZIEL_2R,
        "falle": "Mitten in einem starken Aufwärtstrend ist es oft nur eine kurze Verschnaufpause.",
    },
    {
        "key": "morgenstern", "name": "Morgenstern", "seite": "steigend", "kerzen": "3 Kerzen",
        "idee": "Erst Verkaufsdruck, dann Stillstand, dann übernehmen die Käufer.",
        "regeln": [
            _TREND_AB,
            f"Erste Kerze: rot und groß (Körper mindestens {_z(GROSS)} Durchschnitts-Kerzen).",
            f"Zweite Kerze: klein (Körper höchstens {_z(KLEIN)} Durchschnitts-Kerzen) und unten. "
            f"Ihr Körper ragt höchstens ein Viertel in die rote Kerze hinein.",
            "Dritte Kerze: grün und schließt über der Mitte der roten Kerze.",
        ],
        "einstieg": _EINSTIEG_AUF,
        "stop": "Knapp unter dem tiefsten Tief der drei Kerzen.",
        "ziel": _ZIEL_2R,
        "falle": "Drei Kerzen dauern. Bis das Muster fertig ist, ist ein Teil der Bewegung schon vorbei.",
    },
    {
        "key": "abendstern", "name": "Abendstern", "seite": "fallend", "kerzen": "3 Kerzen",
        "idee": "Erst Kaufdruck, dann Stillstand, dann übernehmen die Verkäufer.",
        "regeln": [
            _TREND_AUF,
            f"Erste Kerze: grün und groß (Körper mindestens {_z(GROSS)} Durchschnitts-Kerzen).",
            f"Zweite Kerze: klein (Körper höchstens {_z(KLEIN)} Durchschnitts-Kerzen) und oben. "
            f"Ihr Körper ragt höchstens ein Viertel in die grüne Kerze hinein.",
            "Dritte Kerze: rot und schließt unter der Mitte der grünen Kerze.",
        ],
        "einstieg": _EINSTIEG_AB,
        "stop": "Knapp über dem höchsten Hoch der drei Kerzen.",
        "ziel": _ZIEL_2R,
        "falle": "Wie beim Morgenstern: Bis es fertig ist, ist ein Teil der Bewegung vorbei.",
    },
    {
        "key": "doji", "name": "Doji", "seite": "beides", "kerzen": "1 Kerze",
        "idee": "Unentschieden zwischen Käufern und Verkäufern. Nach einem Trend kann das heißen: Die Kraft geht aus.",
        "regeln": [
            f"Trend davor, egal in welche Richtung: Der Kurs ist in {TREND_KERZEN} Kerzen um mindestens "
            f"{_z(TREND_STAERKE)} Durchschnitts-Kerzen gestiegen oder gefallen.",
            f"Eröffnung und Schluss fast gleich: Der Körper ist höchstens {_z(DOJI_KOERPER * 100)} % der Kerze.",
            f"Die Kerze ist nicht winzig: mindestens so hoch wie {_z(DOJI_MIN_HOEHE)} Durchschnitts-Kerze.",
        ],
        "einstieg": (f"Der Doji hat keine eigene Richtung. Bricht eine der nächsten {WARTE_KERZEN} Kerzen über sein Hoch, "
                     f"zählt das als Kauf. Bricht sie unter sein Tief, als Verkauf (Short)."),
        "stop": "Am anderen Ende des Doji.",
        "ziel": _ZIEL_2R,
        "falle": "In ruhigen Phasen sind Dojis ganz normal und bedeuten nichts.",
    },
    {
        "key": "doppelboden", "name": "Doppelboden", "seite": "steigend", "kerzen": "viele Kerzen",
        "idee": "Der Kurs fällt zweimal auf etwa denselben Preis und wird dort zweimal verteidigt. Sieht aus wie ein W.",
        "regeln": [
            f"Abwärtstrend davor: In den {FORM_VORLAUF} Kerzen vor dem ersten Tief lag der Kurs schon über der Nackenlinie. "
            f"Er kam also von oben.",
            f"Erstes Tief: der tiefste Punkt von {WENDE_KERZEN} Kerzen links und rechts.",
            "Nackenlinie: das höchste Hoch zwischen den beiden Tiefs.",
            f"Die Formation ist hoch genug: vom Tief bis zur Nackenlinie mindestens {_z(FORM_MIN_HOEHE)} Durchschnitts-Kerzen.",
            f"Zweites Tief: frühestens {FORM_MIN_ABSTAND} Kerzen nach dem ersten und etwa gleich tief. "
            f"Der Unterschied ist höchstens ein Fünftel der Höhe.",
            f"Fertig ist das Muster erst, wenn eine Kerze über der Nackenlinie schließt, "
            f"spätestens {FORM_MAX} Kerzen nach dem ersten Tief.",
        ],
        "einstieg": "Zum Schlusskurs der Kerze, die über der Nackenlinie schließt.",
        "stop": "Knapp unter dem tieferen der beiden Tiefs.",
        "ziel": "Die Höhe der Formation (Tief bis Nackenlinie), vom Einstieg nach oben abgetragen.",
        "falle": "Viele kaufen schon am zweiten Tief. Fällt der Kurs dann durch, war es kein Doppelboden.",
    },
    {
        "key": "doppeltop", "name": "Doppeltop", "seite": "fallend", "kerzen": "viele Kerzen",
        "idee": "Zwei Gipfel auf etwa derselben Höhe. Der Preis oben wird zweimal abgelehnt. Sieht aus wie ein M.",
        "regeln": [
            f"Aufwärtstrend davor: In den {FORM_VORLAUF} Kerzen vor dem ersten Gipfel lag der Kurs schon unter der Nackenlinie. "
            f"Er kam also von unten.",
            f"Erster Gipfel: der höchste Punkt von {WENDE_KERZEN} Kerzen links und rechts.",
            "Nackenlinie: das tiefste Tief zwischen den beiden Gipfeln.",
            f"Die Formation ist hoch genug: vom Gipfel bis zur Nackenlinie mindestens {_z(FORM_MIN_HOEHE)} Durchschnitts-Kerzen.",
            f"Zweiter Gipfel: frühestens {FORM_MIN_ABSTAND} Kerzen nach dem ersten und etwa gleich hoch. "
            f"Der Unterschied ist höchstens ein Fünftel der Höhe.",
            f"Fertig ist das Muster erst, wenn eine Kerze unter der Nackenlinie schließt, "
            f"spätestens {FORM_MAX} Kerzen nach dem ersten Gipfel.",
        ],
        "einstieg": "Verkauf (Short) zum Schlusskurs der Kerze, die unter der Nackenlinie schließt.",
        "stop": "Knapp über dem höheren der beiden Gipfel.",
        "ziel": "Die Höhe der Formation (Gipfel bis Nackenlinie), vom Einstieg nach unten abgetragen.",
        "falle": "Bricht der Kurs stattdessen über die Gipfel, ist es ein Ausbruch nach oben.",
    },
    {
        "key": "ausbruch", "name": "Ausbruch aus Seitwärtszone", "seite": "beides", "kerzen": "viele Kerzen",
        "idee": "Der Kurs läuft eine Weile in einer engen Zone hin und her und verlässt sie dann.",
        "regeln": [
            f"Seitwärtszone: Die letzten {ZONE_KERZEN} Kerzen liegen eng beieinander. Vom höchsten Hoch bis zum tiefsten Tief "
            f"sind es höchstens {_z(ZONE_MAX)} Durchschnitts-Kerzen.",
            "Ausbruch: Eine Kerze schließt über der Zone (Kauf) oder unter der Zone (Verkauf). "
            "Ein kurzes Durchstechen mit dem Docht reicht nicht.",
            f"Dieselbe Zone wird nicht doppelt gezählt: Nach einem Ausbruch ist {ZONE_KERZEN} Kerzen Pause für diese Richtung.",
        ],
        "einstieg": "Zum Schlusskurs der Ausbruchskerze.",
        "stop": "Knapp hinter dem anderen Ende der Zone.",
        "ziel": "Die Höhe der Zone, vom Einstieg in Ausbruchsrichtung abgetragen.",
        "falle": "Viele Ausbrüche sind falsch. Der Kurs fällt kurz danach in die alte Zone zurück.",
    },
]

MUSTER_NAMEN = {m["key"]: m["name"] for m in MUSTER}

ALLGEMEIN = [
    {"titel": "Durchschnitts-Kerze",
     "text": f"Die mittlere Höhe (Hoch minus Tief) der {SCHNITT_KERZEN} Kerzen vor dem Muster. "
             f"Damit gilt dieselbe Regel für Bitcoin bei 70.000 und für eine Aktie bei 200."},
    {"titel": "Nur fertige Kerzen",
     "text": "Ein Muster zählt erst, wenn seine letzte Kerze abgeschlossen ist. Die laufende Kerze wird nicht gewertet."},
    {"titel": "Einstieg, Stop, Ziel",
     "text": f"Einstieg und Stop liegen einen kleinen Puffer hinter dem Muster "
             f"({_z(PUFFER * 100)} % einer Durchschnitts-Kerze). 1 R ist der Abstand vom Einstieg zum Stop, "
             f"also der Verlust, wenn der Stop greift."},
    {"titel": "Was als funktioniert zählt",
     "text": "Funktioniert: Das Ziel wird vor dem Stop erreicht. Nicht funktioniert: Der Stop kommt zuerst. "
             "Nie ausgelöst: Der Einstieg wurde gar nicht erreicht. Noch offen: Es ist noch nichts entschieden."},
    {"titel": "Vorsichtige Annahmen",
     "text": "Berührt eine Kerze Stop und Ziel zugleich, zählt es als Stop. Berührt schon die Einstiegskerze den Stop, "
             "zählt es als Stop."},
    {"titel": "Kurssprünge",
     "text": "Bei Aktien bleibt ein Beispiel über Nacht offen, wenn weder Stop noch Ziel erreicht wurde. "
             "Öffnet die Börse danach mit einem Sprung über den Stop oder das Ziel hinweg, zählt der Eröffnungskurs. "
             "Der Verlust oder Gewinn ist dann größer als geplant. So würde auch eine echte Order ausgeführt."},
]
