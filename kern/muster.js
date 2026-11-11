/* Muster-Erkennung mit festen Regeln.
   1:1 übertragen aus der Python-App (Chartmuster-App/kern/muster.py).
   Gleiche Schwellen, gleiche Reihenfolge, gleiche Ergebnisse. Geprüft mit tests/.

   Fallende Muster sind nicht extra programmiert: Die Kurse werden gespiegelt
   (aus Hoch wird Tief, alles mit umgekehrtem Vorzeichen), dann läuft die Regel
   für das steigende Muster. So sind beide Seiten garantiert gleich streng.

   Jede Regel schaut nur auf Kerzen, die zu dem Zeitpunkt schon fertig waren. */
(function (wurzel, fabrik) {
  const m = fabrik();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else wurzel.Muster = m;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ---------------------------------------------------------------- Schwellen
const SCHNITT_KERZEN = 14;
const TREND_KERZEN = 8;
const TREND_STAERKE = 1.5;
const PUFFER = 0.05;
const WARTE_KERZEN = 3;
const ZIEL_R = 2.0;

const MIN_HOEHE = 1.0;
const DOCHT_FAKTOR = 2.0;
const GEGENDOCHT_MAX = 0.15;
const DOJI_KOERPER = 0.10;
const DOJI_MIN_HOEHE = 1.0;
const GROSS = 0.7;
const KLEIN = 0.3;
const STERN_NAEHE = 0.25;

const WENDE_KERZEN = 4;
const FORM_MAX = 60;
const FORM_MIN_ABSTAND = 6;
const FORM_MIN_HOEHE = 3.0;
const FORM_TOLERANZ = 0.2;
const FORM_VORLAUF = 20;

const ZONE_KERZEN = 20;
const ZONE_MAX = 4.0;

const MIN_BEISPIELE = 30;

/** Zahl in deutscher Schreibweise, ohne unnötige Nullen (wie Python f"{x:.2f}".rstrip("0").rstrip(".")). */
function _z(x) {
  return x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/** Rundet genau wie Python round(x, stellen): exakter Dezimalwert, bei genau ,5 zur geraden Ziffer. */
function pyRound(x, stellen) {
  if (!isFinite(x)) return x;
  const voll = Math.abs(x).toFixed(80);
  const [ganz, nach] = voll.split('.');
  const rest = nach.slice(stellen);
  if (/^50*$/.test(rest)) {                       // genau in der Mitte: zur geraden Ziffer
    const ziffern = ganz + nach.slice(0, stellen);
    const letzte = +ziffern[ziffern.length - 1];
    let n = Number(ganz + '.' + nach.slice(0, stellen));
    if (letzte % 2 === 1) n = Number((n + 10 ** -stellen).toFixed(stellen));
    return x < 0 ? -n : n;
  }
  return Number(x.toFixed(stellen));
}

const minVon = (a, von, bis) => { let m = Infinity; for (let i = von; i < bis; i++) if (a[i] < m) m = a[i]; return m; };
const maxVon = (a, von, bis) => { let m = -Infinity; for (let i = von; i < bis; i++) if (a[i] > m) m = a[i]; return m; };

// ---------------------------------------------------------------- Kursreihe
class Reihe {
  constructor(o, h, l, c) {
    this.o = o; this.h = h; this.l = l; this.c = c;
    this.n = c.length;
    const s = [0.0];
    for (let i = 0; i < this.n; i++) s.push(s[s.length - 1] + (h[i] - l[i]));
    this._sum = s;
  }
  static ausKerzen(kerzen) {
    return new Reihe(kerzen.map(k => k.o), kerzen.map(k => k.h), kerzen.map(k => k.l), kerzen.map(k => k.c));
  }
  gespiegelt() {
    return new Reihe(this.o.map(x => -x), this.l.map(x => -x), this.h.map(x => -x), this.c.map(x => -x));
  }
  /** Durchschnitts-Kerze: mittlere Höhe der n Kerzen VOR Kerze i. */
  schnitt(i, n = SCHNITT_KERZEN) {
    if (i - n < 0) return null;
    const wert = (this._sum[i] - this._sum[i - n]) / n;
    return wert > 0 ? wert : null;
  }
  trend(start) {
    const a = start - 1, b = a - TREND_KERZEN;
    if (b < 0) return null;
    const s = this.schnitt(start);
    if (!s) return null;
    const weg = this.c[a] - this.c[b];
    if (weg <= -TREND_STAERKE * s) return 'ab';
    if (weg >= TREND_STAERKE * s) return 'auf';
    return null;
  }
}

// ------------------------------------------- Regeln (immer die steigende Seite)
function _hammer(r, i) {
  const s = r.schnitt(i);
  if (!s) return null;
  const o = r.o[i], h = r.h[i], l = r.l[i], c = r.c[i];
  const hoehe = h - l;
  if (hoehe < MIN_HOEHE * s) return null;
  const koerper = Math.abs(c - o);
  const oben = h - Math.max(o, c);
  const unten = Math.min(o, c) - l;
  if (koerper <= DOJI_KOERPER * hoehe) return null;
  if (unten < DOCHT_FAKTOR * koerper) return null;
  if (oben > GEGENDOCHT_MAX * hoehe) return null;
  if (r.trend(i) !== 'ab') return null;
  const p = PUFFER * s;
  return {start: i, ende: i, art: 'order', einstieg: h + p, stop: l - p};
}

function _umhuellend(r, i) {
  if (i < 1) return null;
  const s = r.schnitt(i - 1);
  if (!s) return null;
  const o1 = r.o[i - 1], c1 = r.c[i - 1], o2 = r.o[i], c2 = r.c[i];
  if (!(c1 < o1 && c2 > o2)) return null;
  const k1 = o1 - c1, k2 = c2 - o2;
  if (!(o2 <= c1 && c2 >= o1 && k2 > k1)) return null;
  if (k2 < GROSS * s) return null;
  if (r.trend(i - 1) !== 'ab') return null;
  const p = PUFFER * s;
  return {start: i - 1, ende: i, art: 'order', einstieg: r.h[i] + p, stop: Math.min(r.l[i - 1], r.l[i]) - p};
}

function _stern(r, i) {
  if (i < 2) return null;
  const s = r.schnitt(i - 2);
  if (!s) return null;
  const o1 = r.o[i - 2], c1 = r.c[i - 2], o2 = r.o[i - 1], c2 = r.c[i - 1], o3 = r.o[i], c3 = r.c[i];
  const k1 = o1 - c1;
  if (k1 < GROSS * s) return null;
  if (Math.abs(c2 - o2) > KLEIN * s) return null;
  if (Math.max(o2, c2) > c1 + STERN_NAEHE * k1) return null;
  if (!(c3 > o3 && c3 >= (o1 + c1) / 2)) return null;
  if (r.trend(i - 2) !== 'ab') return null;
  const p = PUFFER * s;
  return {start: i - 2, ende: i, art: 'order', einstieg: r.h[i] + p,
          stop: Math.min(r.l[i - 2], r.l[i - 1], r.l[i]) - p};
}

function _doji(r, i) {
  const s = r.schnitt(i);
  if (!s) return null;
  const o = r.o[i], h = r.h[i], l = r.l[i], c = r.c[i];
  const hoehe = h - l;
  if (hoehe < DOJI_MIN_HOEHE * s) return null;
  if (Math.abs(c - o) > DOJI_KOERPER * hoehe) return null;
  if (r.trend(i) === null) return null;
  const p = PUFFER * s;
  return {start: i, ende: i, art: 'beidseitig', oben: h + p, unten: l - p};
}

/** Alle Doppelböden. Erkannt wird erst in der Kerze, die über der Nackenlinie schließt. */
function _doppelboeden(r, n) {
  const gefunden = new Map();
  const K = WENDE_KERZEN;
  for (let a = Math.max(K, FORM_VORLAUF, SCHNITT_KERZEN); a < n - K; a++) {
    const la = r.l[a];
    if (minVon(r.l, a - K, a) <= la || minVon(r.l, a + 1, a + K + 1) < la) continue;
    const s = r.schnitt(a);
    if (!s) continue;
    let nacken = null, inZone = false, tief2 = null, b = null;
    const ende = Math.min(a + FORM_MAX + 1, n);
    for (let j = a + 1; j < ende; j++) {
      if (!inZone) {
        const hoehe = nacken !== null ? nacken - la : 0.0;
        const unten = nacken !== null && hoehe >= FORM_MIN_HOEHE * s && j - a >= FORM_MIN_ABSTAND
          && r.l[j] <= la + FORM_TOLERANZ * hoehe;
        if (!unten) {
          if (r.l[j] < la) break;
          if (nacken === null || r.h[j] > nacken) nacken = r.h[j];
          continue;
        }
        inZone = true; tief2 = r.l[j]; b = j;
      }
      const hoehe = nacken - la;
      if (r.l[j] < tief2) { tief2 = r.l[j]; b = j; }
      if (tief2 < la - FORM_TOLERANZ * hoehe) break;
      if (r.c[j] > nacken) {
        if (j > b && maxVon(r.h, a - FORM_VORLAUF, a) >= nacken && !gefunden.has(j)) {
          const tief = Math.min(la, tief2);
          const p = PUFFER * s;
          gefunden.set(j, {
            start: a, ende: j, art: 'schluss', einstieg: r.c[j], stop: tief - p,
            ziel_abstand: nacken - tief,
            linien: [{name: 'Nackenlinie', preis: nacken, von: a, bis: j}],
            punkte: [a, b],
          });
        }
        break;
      }
    }
  }
  return [...gefunden.keys()].sort((x, y) => x - y).map(j => gefunden.get(j));
}

/** Ausbrüche nach oben aus einer engen Seitwärtszone (Schlusskurs über der Zone). */
function _ausbrueche(r, n) {
  const funde = [];
  let letzter = -(10 ** 9);
  const Z = ZONE_KERZEN;
  for (let j = Z; j < n; j++) {
    if (j - letzter < Z) continue;
    const s = r.schnitt(j, Z);
    if (!s) continue;
    const oben = maxVon(r.h, j - Z, j);
    if (r.c[j] <= oben) continue;
    const unten = minVon(r.l, j - Z, j);
    const hoehe = oben - unten;
    if (hoehe > ZONE_MAX * s) continue;
    const p = PUFFER * s;
    funde.push({
      start: j - Z, ende: j, art: 'schluss', einstieg: r.c[j], stop: unten - p, ziel_abstand: hoehe,
      linien: [
        {name: 'Zone oben', preis: oben, von: j - Z, bis: j},
        {name: 'Zone unten', preis: unten, von: j - Z, bis: j},
      ],
    });
    letzter = j;
  }
  return funde;
}

// -------------------------------------------------- Ausgang (immer als Kauf)
/** Spielt einen Kauf durch. Berührt eine Kerze Stop und Ziel, zählt der Stop.
    Berührt schon die Einstiegskerze den Stop, zählt der Stop. Kurslücken: Eröffnungskurs. */
function _auswerten(r, n, su) {
  const i = su.ende;
  const stop = su.stop;
  const zielVon = preis => ('ziel_abstand' in su) ? preis + su.ziel_abstand : preis + ZIEL_R * (preis - stop);
  const ergebnis = (ausgang, grund, einstieg, iEin = null, iAus = null, rr = null) => {
    const ziel = zielVon(einstieg);
    const risiko = einstieg - stop;
    return {ausgang, grund, einstieg, stop, ziel, i_einstieg: iEin, i_schluss: iAus, r: rr,
            ziel_r: risiko > 0 ? (ziel - einstieg) / risiko : null};
  };

  let einstieg, iEin, ziel, risiko;
  if (su.art === 'schluss') {
    einstieg = su.einstieg;
    iEin = i;
    if (einstieg - stop <= 0) return null;
    ziel = zielVon(einstieg);
    risiko = einstieg - stop;
  } else {
    const plan = su.einstieg;
    einstieg = null; iEin = null;
    for (let j = i + 1; j < i + 1 + WARTE_KERZEN; j++) {
      if (j >= n) return ergebnis('offen', 'offen_wartet', plan);
      if (r.h[j] >= plan) { einstieg = Math.max(plan, r.o[j]); iEin = j; break; }
      if (r.l[j] <= stop) return ergebnis('nie', 'nie_gebrochen', plan);
    }
    if (einstieg === null) return ergebnis('nie', 'nie_keine_bestaetigung', plan);
    ziel = zielVon(einstieg);
    risiko = einstieg - stop;
    if (r.l[iEin] <= stop) return ergebnis('stop', 'stop_einstiegskerze', einstieg, iEin, iEin, -1.0);
    if (r.h[iEin] >= ziel) return ergebnis('ziel', 'ziel', einstieg, iEin, iEin, (ziel - einstieg) / risiko);
  }
  for (let j = iEin + 1; j < n; j++) {
    if (r.o[j] <= stop) return ergebnis('stop', 'stop_luecke', einstieg, iEin, j, (r.o[j] - einstieg) / risiko);
    if (r.o[j] >= ziel) return ergebnis('ziel', 'ziel_luecke', einstieg, iEin, j, (r.o[j] - einstieg) / risiko);
    if (r.l[j] <= stop) return ergebnis('stop', r.h[j] >= ziel ? 'stop_beide' : 'stop', einstieg, iEin, j, -1.0);
    if (r.h[j] >= ziel) return ergebnis('ziel', 'ziel', einstieg, iEin, j, (ziel - einstieg) / risiko);
  }
  return ergebnis('offen', 'offen_laeuft', einstieg, iEin, null, null);
}

/** Doji hat keine eigene Richtung: Die Seite, auf der der Kurs zuerst ausbricht, entscheidet. */
function _auswertenDoji(r, rm, n, su) {
  const i = su.ende, oben = su.oben, unten = su.unten;
  for (let j = i + 1; j < i + 1 + WARTE_KERZEN; j++) {
    if (j >= n) return [null, {ausgang: 'offen', grund: 'offen_wartet'}];
    if (r.h[j] >= oben) return ['long', _auswerten(r, n, {ende: i, art: 'order', einstieg: oben, stop: unten})];
    if (r.l[j] <= unten) return ['short', _auswerten(rm, n, {ende: i, art: 'order', einstieg: -unten, stop: -oben})];
  }
  return [null, {ausgang: 'nie', grund: 'nie_keine_bestaetigung'}];
}

const GRUND_TEXT = {
  ziel: 'Das Ziel wurde zuerst erreicht.',
  ziel_luecke: 'Der Kurs ist mit einer Lücke über das Ziel gesprungen. Der Gewinn war größer als geplant.',
  stop: 'Der Stop wurde zuerst erreicht.',
  stop_beide: 'Eine Kerze hat Stop und Ziel berührt. Das zählt vorsichtig als Stop.',
  stop_einstiegskerze: 'Schon die Einstiegskerze hat den Stop berührt. Das zählt vorsichtig als Stop.',
  stop_luecke: 'Der Kurs ist mit einer Lücke über den Stop gesprungen. Der Verlust war größer als geplant.',
  nie_keine_bestaetigung: `Die Bestätigung kam nicht. Keine der nächsten ${WARTE_KERZEN} Kerzen hat den Einstieg erreicht.`,
  nie_gebrochen: 'Der Kurs lief zuerst auf die falsche Seite aus dem Muster. Damit war es ungültig.',
  offen_wartet: 'Das Muster ist ganz frisch. Es wartet noch auf die Bestätigung.',
  offen_laeuft: 'Der Einstieg ist ausgelöst. Bisher wurde weder Stop noch Ziel erreicht.',
};

// ------------------------------------------------------------- alles zusammen
/** Sucht alle Muster in den fertigen Kerzen und berechnet für jedes den Ausgang.
    kerzen: [{t,o,h,l,c,v}], älteste zuerst. nFertig: so viele Kerzen (von vorn) sind abgeschlossen. */
function findeMuster(kerzen, nFertig = null, markt = '', tf = '') {
  const n = nFertig === null || nFertig === undefined ? kerzen.length : Math.min(nFertig, kerzen.length);
  if (n < SCHNITT_KERZEN + TREND_KERZEN + 2) return [];
  const r = Reihe.ausKerzen(kerzen.slice(0, n));
  const rm = r.gespiegelt();
  const funde = [];

  const dazu = (key, richtung, su, erg) => {
    if (erg === null || erg === undefined) return;
    const vz = richtung === 'short' ? -1 : 1;
    const preis = x => (x === null || x === undefined) ? null : vz * x;
    let linien = (su.linien || []).map(li => ({
      name: li.name, preis: vz * li.preis, t_von: kerzen[li.von].t, t_bis: kerzen[li.bis].t,
    }));
    if (key === 'doji') {
      const tBis = kerzen[Math.min(su.ende + WARTE_KERZEN, n - 1)].t;
      linien = [
        {name: 'Doji oben', preis: su.oben, t_von: kerzen[su.start].t, t_bis: tBis},
        {name: 'Doji unten', preis: su.unten, t_von: kerzen[su.start].t, t_bis: tBis},
      ];
    }
    const iEin = erg.i_einstieg ?? null, iAus = erg.i_schluss ?? null;
    const tEnde = kerzen[su.ende].t;
    funde.push({
      id: `${markt}|${tf}|${key}|${richtung || 'x'}|${tEnde}`,
      muster: key,
      richtung,
      markt,
      tf,
      t_start: kerzen[su.start].t,
      t_ende: tEnde,
      einstieg: preis(erg.einstieg),
      stop: preis(erg.stop),
      ziel: preis(erg.ziel),
      t_einstieg: iEin !== null ? kerzen[iEin].t : null,
      t_schluss: iAus !== null ? kerzen[iAus].t : null,
      dauer: (iEin !== null && iAus !== null) ? iAus - iEin : null,
      ausgang: erg.ausgang,
      grund: erg.grund,
      r: erg.r === null || erg.r === undefined ? null : pyRound(erg.r, 3),
      ziel_r: erg.ziel_r === null || erg.ziel_r === undefined ? null : pyRound(erg.ziel_r, 3),
      linien,
    });
  };

  const REGELN = [
    ['hammer', 'sternschnuppe', _hammer],
    ['bull_umhuellend', 'baer_umhuellend', _umhuellend],
    ['morgenstern', 'abendstern', _stern],
  ];
  for (let i = 0; i < n; i++) {
    for (const [keyAuf, keyAb, regel] of REGELN) {
      let su = regel(r, i);
      if (su) dazu(keyAuf, 'long', su, _auswerten(r, n, su));
      su = regel(rm, i);
      if (su) dazu(keyAb, 'short', su, _auswerten(rm, n, su));
    }
    const su = _doji(r, i);
    if (su) {
      const [richtung, erg] = _auswertenDoji(r, rm, n, su);
      dazu('doji', richtung, su, erg);
    }
  }
  for (const su of _doppelboeden(r, n)) dazu('doppelboden', 'long', su, _auswerten(r, n, su));
  for (const su of _doppelboeden(rm, n)) dazu('doppeltop', 'short', su, _auswerten(rm, n, su));
  for (const su of _ausbrueche(r, n)) dazu('ausbruch', 'long', su, _auswerten(r, n, su));
  for (const su of _ausbrueche(rm, n)) dazu('ausbruch', 'short', su, _auswerten(rm, n, su));

  // wie Python: sortiert nach (t_ende, muster), stabil
  funde.sort((a, b) => a.t_ende - b.t_ende || (a.muster < b.muster ? -1 : a.muster > b.muster ? 1 : 0));
  return funde;
}

/** Unsicherheit der Trefferquote (Wilson-Bereich, 95 %). */
function _spanne(treffer, anzahl) {
  if (!anzahl) return null;
  const z = 1.96;
  const p = treffer / anzahl;
  const nenner = 1 + z * z / anzahl;
  const mitte = (p + z * z / (2 * anzahl)) / nenner;
  const halb = z * ((p * (1 - p) / anzahl + z * z / (4 * anzahl * anzahl)) ** 0.5) / nenner;
  return [pyRound(Math.max(0.0, mitte - halb), 4), pyRound(Math.min(1.0, mitte + halb), 4)];
}

/** Zählt je Muster Funde, Treffer und Fehlschläge. Grundlage ist genau die übergebene Liste. */
function statistik(funde) {
  const je = {};
  for (const f of funde) {
    if (!je[f.muster]) je[f.muster] = {funde: 0, ziel: 0, stop: 0, nie: 0, offen: 0, _summe_r: 0.0, _summe_ziel_r: 0.0};
    const s = je[f.muster];
    s.funde += 1;
    s[f.ausgang] += 1;
    if (f.ausgang === 'ziel' || f.ausgang === 'stop') { s._summe_r += f.r; s._summe_ziel_r += f.ziel_r; }
  }
  for (const s of Object.values(je)) {
    const fertig = s.ziel + s.stop;
    s.abgeschlossen = fertig;
    s.trefferquote = fertig ? pyRound(s.ziel / fertig, 4) : null;
    s.schnitt_r = fertig ? pyRound(s._summe_r / fertig, 3) : null;
    s.noetig = fertig ? pyRound(1 / (1 + s._summe_ziel_r / fertig), 4) : null;
    s.spanne = _spanne(s.ziel, fertig);
    s.zu_wenig = fertig < MIN_BEISPIELE;
    delete s._summe_r; delete s._summe_ziel_r;
  }
  return je;
}

// ------------------------------------------------- Erklärtexte für die App
const _TREND_AB = `Abwärtstrend davor: Der Schlusskurs direkt vor dem Muster liegt mindestens ${_z(TREND_STAERKE)} Durchschnitts-Kerzen tiefer als ${TREND_KERZEN} Kerzen früher.`;
const _TREND_AUF = `Aufwärtstrend davor: Der Schlusskurs direkt vor dem Muster liegt mindestens ${_z(TREND_STAERKE)} Durchschnitts-Kerzen höher als ${TREND_KERZEN} Kerzen früher.`;
const _EINSTIEG_AUF = `Kauf erst mit Bestätigung: Eine der nächsten ${WARTE_KERZEN} Kerzen steigt über das Hoch des Musters. Fällt der Kurs vorher unter das Muster, ist es ungültig.`;
const _EINSTIEG_AB = `Verkauf (Short) erst mit Bestätigung: Eine der nächsten ${WARTE_KERZEN} Kerzen fällt unter das Tief des Musters. Steigt der Kurs vorher über das Muster, ist es ungültig.`;
const _ZIEL_2R = `${_z(ZIEL_R)} × Risiko. Das Risiko ist der Abstand vom Einstieg zum Stop.`;

const MUSTER = [
  {
    key: 'hammer', name: 'Hammer', seite: 'steigend', kerzen: '1 Kerze',
    idee: 'Verkäufer drücken den Kurs weit nach unten, Käufer holen ihn bis zum Schluss fast ganz zurück.',
    regeln: [
      _TREND_AB,
      `Langer Docht nach unten: mindestens ${_z(DOCHT_FAKTOR)} × so lang wie der Körper.`,
      `Oben fast kein Docht: höchstens ${_z(GEGENDOCHT_MAX * 100)} % der ganzen Kerze.`,
      `Die Kerze ist nicht winzig: mindestens so hoch wie ${_z(MIN_HOEHE)} Durchschnitts-Kerze.`,
      `Der Körper ist größer als ${_z(DOJI_KOERPER * 100)} % der Kerze. Sonst zählt sie als Doji.`,
    ],
    einstieg: _EINSTIEG_AUF,
    stop: 'Knapp unter dem Tief des Hammers, also unter der Dochtspitze.',
    ziel: _ZIEL_2R,
    falle: 'Ein langer Docht heißt ein weiter Stop. Im Seitwärtsmarkt bedeutet ein Hammer fast nichts.',
  },
  {
    key: 'sternschnuppe', name: 'Sternschnuppe', seite: 'fallend', kerzen: '1 Kerze',
    idee: 'Käufer treiben den Kurs hoch, Verkäufer drücken ihn bis zum Schluss wieder herunter.',
    regeln: [
      _TREND_AUF,
      `Langer Docht nach oben: mindestens ${_z(DOCHT_FAKTOR)} × so lang wie der Körper.`,
      `Unten fast kein Docht: höchstens ${_z(GEGENDOCHT_MAX * 100)} % der ganzen Kerze.`,
      `Die Kerze ist nicht winzig: mindestens so hoch wie ${_z(MIN_HOEHE)} Durchschnitts-Kerze.`,
      `Der Körper ist größer als ${_z(DOJI_KOERPER * 100)} % der Kerze. Sonst zählt sie als Doji.`,
    ],
    einstieg: _EINSTIEG_AB,
    stop: 'Knapp über dem Hoch der Sternschnuppe, also über der Dochtspitze.',
    ziel: _ZIEL_2R,
    falle: 'In einem starken Aufwärtstrend werden solche Kerzen oft einfach überrollt.',
  },
  {
    key: 'bull_umhuellend', name: 'Bullische umhüllende Kerze', seite: 'steigend', kerzen: '2 Kerzen',
    idee: 'Die Käufer holen in einer einzigen Kerze alles zurück, was die Verkäufer davor geschafft haben.',
    regeln: [
      _TREND_AB,
      'Erst eine rote Kerze, dann eine grüne.',
      'Der grüne Körper umschließt den roten Körper ganz und ist größer.',
      `Die grüne Kerze ist groß: Ihr Körper misst mindestens ${_z(GROSS)} Durchschnitts-Kerzen.`,
    ],
    einstieg: _EINSTIEG_AUF,
    stop: 'Knapp unter dem tiefsten Tief der beiden Kerzen.',
    ziel: _ZIEL_2R,
    falle: 'Ist die grüne Kerze riesig, liegt der Stop weit weg.',
  },
  {
    key: 'baer_umhuellend', name: 'Bärische umhüllende Kerze', seite: 'fallend', kerzen: '2 Kerzen',
    idee: 'Die Verkäufer nehmen in einer Kerze alles weg, was die Käufer davor geschafft haben.',
    regeln: [
      _TREND_AUF,
      'Erst eine grüne Kerze, dann eine rote.',
      'Der rote Körper umschließt den grünen Körper ganz und ist größer.',
      `Die rote Kerze ist groß: Ihr Körper misst mindestens ${_z(GROSS)} Durchschnitts-Kerzen.`,
    ],
    einstieg: _EINSTIEG_AB,
    stop: 'Knapp über dem höchsten Hoch der beiden Kerzen.',
    ziel: _ZIEL_2R,
    falle: 'Mitten in einem starken Aufwärtstrend ist es oft nur eine kurze Verschnaufpause.',
  },
  {
    key: 'morgenstern', name: 'Morgenstern', seite: 'steigend', kerzen: '3 Kerzen',
    idee: 'Erst Verkaufsdruck, dann Stillstand, dann übernehmen die Käufer.',
    regeln: [
      _TREND_AB,
      `Erste Kerze: rot und groß (Körper mindestens ${_z(GROSS)} Durchschnitts-Kerzen).`,
      `Zweite Kerze: klein (Körper höchstens ${_z(KLEIN)} Durchschnitts-Kerzen) und unten. Ihr Körper ragt höchstens ein Viertel in die rote Kerze hinein.`,
      'Dritte Kerze: grün und schließt über der Mitte der roten Kerze.',
    ],
    einstieg: _EINSTIEG_AUF,
    stop: 'Knapp unter dem tiefsten Tief der drei Kerzen.',
    ziel: _ZIEL_2R,
    falle: 'Drei Kerzen dauern. Bis das Muster fertig ist, ist ein Teil der Bewegung schon vorbei.',
  },
  {
    key: 'abendstern', name: 'Abendstern', seite: 'fallend', kerzen: '3 Kerzen',
    idee: 'Erst Kaufdruck, dann Stillstand, dann übernehmen die Verkäufer.',
    regeln: [
      _TREND_AUF,
      `Erste Kerze: grün und groß (Körper mindestens ${_z(GROSS)} Durchschnitts-Kerzen).`,
      `Zweite Kerze: klein (Körper höchstens ${_z(KLEIN)} Durchschnitts-Kerzen) und oben. Ihr Körper ragt höchstens ein Viertel in die grüne Kerze hinein.`,
      'Dritte Kerze: rot und schließt unter der Mitte der grünen Kerze.',
    ],
    einstieg: _EINSTIEG_AB,
    stop: 'Knapp über dem höchsten Hoch der drei Kerzen.',
    ziel: _ZIEL_2R,
    falle: 'Wie beim Morgenstern: Bis es fertig ist, ist ein Teil der Bewegung vorbei.',
  },
  {
    key: 'doji', name: 'Doji', seite: 'beides', kerzen: '1 Kerze',
    idee: 'Unentschieden zwischen Käufern und Verkäufern. Nach einem Trend kann das heißen: Die Kraft geht aus.',
    regeln: [
      `Trend davor, egal in welche Richtung: Der Kurs ist in ${TREND_KERZEN} Kerzen um mindestens ${_z(TREND_STAERKE)} Durchschnitts-Kerzen gestiegen oder gefallen.`,
      `Eröffnung und Schluss fast gleich: Der Körper ist höchstens ${_z(DOJI_KOERPER * 100)} % der Kerze.`,
      `Die Kerze ist nicht winzig: mindestens so hoch wie ${_z(DOJI_MIN_HOEHE)} Durchschnitts-Kerze.`,
    ],
    einstieg: `Der Doji hat keine eigene Richtung. Bricht eine der nächsten ${WARTE_KERZEN} Kerzen über sein Hoch, zählt das als Kauf. Bricht sie unter sein Tief, als Verkauf (Short).`,
    stop: 'Am anderen Ende des Doji.',
    ziel: _ZIEL_2R,
    falle: 'In ruhigen Phasen sind Dojis ganz normal und bedeuten nichts.',
  },
  {
    key: 'doppelboden', name: 'Doppelboden', seite: 'steigend', kerzen: 'viele Kerzen',
    idee: 'Der Kurs fällt zweimal auf etwa denselben Preis und wird dort zweimal verteidigt. Sieht aus wie ein W.',
    regeln: [
      `Abwärtstrend davor: In den ${FORM_VORLAUF} Kerzen vor dem ersten Tief lag der Kurs schon über der Nackenlinie. Er kam also von oben.`,
      `Erstes Tief: der tiefste Punkt von ${WENDE_KERZEN} Kerzen links und rechts.`,
      'Nackenlinie: das höchste Hoch zwischen den beiden Tiefs.',
      `Die Formation ist hoch genug: vom Tief bis zur Nackenlinie mindestens ${_z(FORM_MIN_HOEHE)} Durchschnitts-Kerzen.`,
      `Zweites Tief: frühestens ${FORM_MIN_ABSTAND} Kerzen nach dem ersten und etwa gleich tief. Der Unterschied ist höchstens ein Fünftel der Höhe.`,
      `Fertig ist das Muster erst, wenn eine Kerze über der Nackenlinie schließt, spätestens ${FORM_MAX} Kerzen nach dem ersten Tief.`,
    ],
    einstieg: 'Zum Schlusskurs der Kerze, die über der Nackenlinie schließt.',
    stop: 'Knapp unter dem tieferen der beiden Tiefs.',
    ziel: 'Die Höhe der Formation (Tief bis Nackenlinie), vom Einstieg nach oben abgetragen.',
    falle: 'Viele kaufen schon am zweiten Tief. Fällt der Kurs dann durch, war es kein Doppelboden.',
  },
  {
    key: 'doppeltop', name: 'Doppeltop', seite: 'fallend', kerzen: 'viele Kerzen',
    idee: 'Zwei Gipfel auf etwa derselben Höhe. Der Preis oben wird zweimal abgelehnt. Sieht aus wie ein M.',
    regeln: [
      `Aufwärtstrend davor: In den ${FORM_VORLAUF} Kerzen vor dem ersten Gipfel lag der Kurs schon unter der Nackenlinie. Er kam also von unten.`,
      `Erster Gipfel: der höchste Punkt von ${WENDE_KERZEN} Kerzen links und rechts.`,
      'Nackenlinie: das tiefste Tief zwischen den beiden Gipfeln.',
      `Die Formation ist hoch genug: vom Gipfel bis zur Nackenlinie mindestens ${_z(FORM_MIN_HOEHE)} Durchschnitts-Kerzen.`,
      `Zweiter Gipfel: frühestens ${FORM_MIN_ABSTAND} Kerzen nach dem ersten und etwa gleich hoch. Der Unterschied ist höchstens ein Fünftel der Höhe.`,
      `Fertig ist das Muster erst, wenn eine Kerze unter der Nackenlinie schließt, spätestens ${FORM_MAX} Kerzen nach dem ersten Gipfel.`,
    ],
    einstieg: 'Verkauf (Short) zum Schlusskurs der Kerze, die unter der Nackenlinie schließt.',
    stop: 'Knapp über dem höheren der beiden Gipfel.',
    ziel: 'Die Höhe der Formation (Gipfel bis Nackenlinie), vom Einstieg nach unten abgetragen.',
    falle: 'Bricht der Kurs stattdessen über die Gipfel, ist es ein Ausbruch nach oben.',
  },
  {
    key: 'ausbruch', name: 'Ausbruch aus Seitwärtszone', seite: 'beides', kerzen: 'viele Kerzen',
    idee: 'Der Kurs läuft eine Weile in einer engen Zone hin und her und verlässt sie dann.',
    regeln: [
      `Seitwärtszone: Die letzten ${ZONE_KERZEN} Kerzen liegen eng beieinander. Vom höchsten Hoch bis zum tiefsten Tief sind es höchstens ${_z(ZONE_MAX)} Durchschnitts-Kerzen.`,
      'Ausbruch: Eine Kerze schließt über der Zone (Kauf) oder unter der Zone (Verkauf). Ein kurzes Durchstechen mit dem Docht reicht nicht.',
      `Dieselbe Zone wird nicht doppelt gezählt: Nach einem Ausbruch ist ${ZONE_KERZEN} Kerzen Pause für diese Richtung.`,
    ],
    einstieg: 'Zum Schlusskurs der Ausbruchskerze.',
    stop: 'Knapp hinter dem anderen Ende der Zone.',
    ziel: 'Die Höhe der Zone, vom Einstieg in Ausbruchsrichtung abgetragen.',
    falle: 'Viele Ausbrüche sind falsch. Der Kurs fällt kurz danach in die alte Zone zurück.',
  },
];

const ALLGEMEIN = [
  {titel: 'Durchschnitts-Kerze',
   text: `Die mittlere Höhe (Hoch minus Tief) der ${SCHNITT_KERZEN} Kerzen vor dem Muster. Damit gilt dieselbe Regel für Bitcoin bei 70.000 und für eine Aktie bei 200.`},
  {titel: 'Nur fertige Kerzen',
   text: 'Ein Muster zählt erst, wenn seine letzte Kerze abgeschlossen ist. Die laufende Kerze wird nicht gewertet.'},
  {titel: 'Einstieg, Stop, Ziel',
   text: `Einstieg und Stop liegen einen kleinen Puffer hinter dem Muster (${_z(PUFFER * 100)} % einer Durchschnitts-Kerze). 1 R ist der Abstand vom Einstieg zum Stop, also der Verlust, wenn der Stop greift.`},
  {titel: 'Was als funktioniert zählt',
   text: 'Funktioniert: Das Ziel wird vor dem Stop erreicht. Nicht funktioniert: Der Stop kommt zuerst. Nie ausgelöst: Der Einstieg wurde gar nicht erreicht. Noch offen: Es ist noch nichts entschieden.'},
  {titel: 'Vorsichtige Annahmen',
   text: 'Berührt eine Kerze Stop und Ziel zugleich, zählt es als Stop. Berührt schon die Einstiegskerze den Stop, zählt es als Stop.'},
  {titel: 'Kurssprünge',
   text: 'Bei Aktien bleibt ein Beispiel über Nacht offen, wenn weder Stop noch Ziel erreicht wurde. Öffnet die Börse danach mit einem Sprung über den Stop oder das Ziel hinweg, zählt der Eröffnungskurs. Der Verlust oder Gewinn ist dann größer als geplant. So würde auch eine echte Order ausgeführt.'},
];

return {
  findeMuster, statistik, pyRound, MUSTER, ALLGEMEIN, GRUND_TEXT, MIN_BEISPIELE, WARTE_KERZEN,
  MUSTER_NAMEN: Object.fromEntries(MUSTER.map(m => [m.key, m.name])),
};
});
