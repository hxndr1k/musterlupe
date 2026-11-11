# Musterlupe (Web)

Die Musterlupe als Website, die ganz im Browser läuft. Kein PC muss an sein, kein Server rechnet mit. Damit geht sie unterwegs auf dem iPad.

**Lernwerkzeug, keine Anlageberatung.** Vergangene Muster sagen nichts Sicheres über die Zukunft. Die Seite kauft und verkauft nichts. Sie braucht kein Konto und keinen Schlüssel. Sie liest nur öffentliche Kurse.

Vorlage ist die lokale Python-App „Musterlupe“. Regeln, Schwellen, Auswertung und Statistik sind 1:1 übernommen und mit denselben Testfällen geprüft.

## Was drin ist

| Datei | Wozu |
|---|---|
| `index.html`, `style.css`, `app.js` | Oberfläche, wie in der alten App (inkl. iPad-Bedienung) |
| `kern/muster.js` | Muster-Regeln, Auswertung (Stop oder Ziel zuerst), Statistik |
| `kern/daten.js` | Kurse von Binance, direkt aus dem Browser |
| `vendor/` | Chart-Bibliothek (TradingView Lightweight Charts, Apache 2.0) |
| `tests/` | Prüfung: JavaScript liefert dieselben Ergebnisse wie Python |

Zurzeit **nur Krypto** (Binance: Historie per REST, laufende Kerze live per WebSocket). Aktien von Yahoo lassen sich aus dem Browser nicht direkt abrufen; dafür bräuchte es einen kleinen Vermittler. Ist noch nicht eingerichtet.

## Am PC ausprobieren

Im Ordner dieser Website:

```bash
python -m http.server 8770 --bind 127.0.0.1
```

Dann im Browser `http://127.0.0.1:8770` öffnen. Beenden mit Strg+C.

(Einfach `index.html` doppelklicken reicht nicht ganz: Manche Browser sperren dann Teile. Mit dem kleinen Server oben geht es sicher.)

## Prüfen, dass die Regeln stimmen

```bash
python -m unittest discover -s tests -v
```

Braucht Python 3.11 und Node. Geprüft wird:

- **Alle Testfälle der alten App** (`tests/test_muster.py`), aber gegen den JavaScript-Kern. Jeder Aufruf wird zusätzlich mit der Python-Referenz gerechnet; jede Abweichung lässt den Test scheitern.
- **Python gegen JavaScript** auf 60 zufälligen Kursverläufen mit über 2.000 Funden, alle 10 Muster und alle Ausgangs-Arten (`tests/test_vergleich.py`).
- Rundung genau wie Python, und alle Erklärtexte Wort für Wort gleich.

`tests/referenz/muster_python.py` ist eine unveränderte Kopie von `kern/muster.py` der alten App. Wird dort eine Regel geändert, muss sie hier in `kern/muster.js` und in der Kopie ebenso geändert werden; die Tests zeigen sofort, wenn beides auseinanderläuft.

Mit echten Kursen durchspielen (lädt von Binance, kein Browser nötig):

```bash
node tests/web_probe.mjs
```

## Ins Internet stellen (fürs iPad)

Die Seite besteht nur aus festen Dateien. Jeder kostenlose Anbieter für statische Seiten passt. Ein Konto legst du selbst an. **Noch ist nichts veröffentlicht.**

Gut zu wissen: Wer die Adresse kennt, kann die Seite öffnen. Darin steht nichts Privates, nur die App selbst. Die Seite bittet Suchmaschinen, sie nicht aufzunehmen.

Hochgeladen werden müssen: `index.html`, `style.css`, `app.js`, `icon.png`, `.nojekyll` und die Ordner `kern/` und `vendor/`. Der Ordner `tests/` darf mit, er stört nicht.

### Weg A: Cloudflare Pages (am einfachsten, ohne Git)

1. Auf `dash.cloudflare.com` ein kostenloses Konto anlegen.
2. Links **Workers & Pages** → **Erstellen** → Reiter **Pages** → **Assets hochladen** (Direct Upload).
3. Einen Namen wählen, z. B. `musterlupe`. Dann den Ordner `Chartmuster-Web` hineinziehen und **Bereitstellen**.
4. Fertig. Die Adresse lautet dann ungefähr `https://musterlupe.pages.dev`.

Später ändern: im Projekt **Neue Bereitstellung erstellen** und den Ordner erneut hineinziehen.

### Weg B: GitHub Pages

1. Auf `github.com` ein Konto anlegen und ein neues Repository erstellen, z. B. `musterlupe` (öffentlich; private Repos brauchen für Pages ein bezahltes Konto).
2. **Add file** → **Upload files** → den Inhalt von `Chartmuster-Web` hineinziehen → **Commit changes**.
3. **Settings** → **Pages** → bei **Source** „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach ein bis zwei Minuten steht oben die Adresse, z. B. `https://DEINNAME.github.io/musterlupe/`.

### Auf dem iPad

Safari öffnen, die Adresse eintippen. Über **Teilen** → **Zum Home-Bildschirm** bekommst du ein Symbol wie bei einer App.

Bedienung mit dem Finger: mit einem Finger den Chart schieben, mit zwei Fingern zoomen, lange drücken für das Fadenkreuz. Auf einen Pfeil tippen wählt den Fund, nochmal tippen den nächsten Pfeil an derselben Kerze.

## Unterschiede zur alten App

- Kein Python-Server: Alles läuft im Browser. Das iPad lädt die Kurse selbst bei Binance.
- Nur Krypto. Aktien kämen über einen kleinen Vermittler (z. B. einen kostenlosen Cloudflare Worker), falls gewünscht.
- Eigene Kürzel und die zuletzt gewählte Ansicht merkt sich jedes Gerät selbst (im Browser-Speicher).
- Die Berechnung der Muster dauert auf dem iPad je Zeitabschnitt etwa ein bis zwei Sekunden.
