/* Musterlupe (Web): Oberfläche.
   Übernommen aus der Python-App. Die Muster-Regeln stehen in kern/muster.js,
   der Kursabruf in kern/daten.js. Alles läuft im Browser, ein Server wird nicht gebraucht. */
(() => {
'use strict';

const LC = window.LightweightCharts;
const $ = (s, wurzel = document) => wurzel.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const FARBE = {bull: '#2fa37f', bear: '#d4505e', akzent: '#d9d9d9', warn: '#c9a04f', grau: '#7a7a7a',
               leise: '#8f8f8f', gitter: '#121212', rand: '#262626', bg: '#000000'};
const AUSGANG = {
  ziel: {kurz: 'Funktioniert', farbe: FARBE.bull},
  stop: {kurz: 'Nicht funktioniert', farbe: FARBE.bear},
  nie: {kurz: 'Nie ausgelöst', farbe: FARBE.grau},
  offen: {kurz: 'Noch offen', farbe: FARBE.warn},
};
const SEITE = 150;                      // so viele Funde zeigt die Liste auf einmal
const LIVE_ADRESSEN = ['wss://stream.binance.com:9443/ws/', 'wss://data-stream.binance.vision/ws/'];
const FINGER = window.matchMedia('(pointer: coarse)');         // Tablet oder Handy: mit dem Finger bedient
const GESTAPELT = window.matchMedia('(max-width: 1050px)');    // schmal: Liste steht unter dem Chart

const Z = {
  start: null, maerkte: [], marktNach: new Map(), musterName: {},
  markt: null, tf: null, tfSek: 300,
  kerzen: [], index: new Map(), quelle: null, stellen: 2, marken: [],
  funde: [], nachId: new Map(), statistik: {}, fundeFehler: [], fundeStand: 'laedt', fundeFehlertext: '',
  filter: {muster: 'alle', markt: 'alle', ausgang: 'alle'},
  auswahl: null, sichtbar: [], gezeigt: SEITE,
  ladeNr: 0, fundeNr: 0, liveNr: 0, live: null, liveZustand: 'aus', liveZuletzt: 0, abfrage: null, fundeUhr: null, abgleich: null,
  schwebt: false, letzterKurs: null, reiter: 'funde', ausschnittOffen: false, zeitName: {},
};
let chart, kerzenSerie, volSerie, bandSerie, linien, hilfsLinien;

// ---------------------------------------------------------------- Helfer
const merke = (k, v) => { try { localStorage.setItem('musterlupe.' + k, JSON.stringify(v)); } catch { /* egal */ } };
const lies = (k, ersatz) => {
  try { const v = localStorage.getItem('musterlupe.' + k); return v == null ? ersatz : JSON.parse(v); } catch { return ersatz; }
};

async function api(pfad, angaben = {}) {   // früher Anfrage an den PC, jetzt direkt im Browser gerechnet
  if (!navigator.onLine) throw new Error('Keine Internetverbindung. Sobald das Gerät wieder online ist, geht es weiter.');
  return window.Daten.api(pfad, angaben);
}

const F_TAG = new Intl.DateTimeFormat('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'});
const F_ZEIT = new Intl.DateTimeFormat('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
const F_KURZ = new Intl.DateTimeFormat('de-DE', {weekday: 'short', hour: '2-digit', minute: '2-digit'});
const F_UHR = new Intl.DateTimeFormat('de-DE', {hour: '2-digit', minute: '2-digit'});
const F_KOMPAKT = new Intl.NumberFormat('de-DE', {notation: 'compact', maximumFractionDigits: 1});

const fmtZeit = (t, tf = Z.tf) => tf === '1d' ? F_TAG.format(new Date(t * 1000)) : F_ZEIT.format(new Date(t * 1000)) + ' Uhr';
const fmtPreis = p => (p == null || !isFinite(p)) ? '–'
  : p.toLocaleString('de-DE', {minimumFractionDigits: Z.stellen, maximumFractionDigits: Z.stellen});
const fmtR = (r, stellen = 1) => (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toLocaleString('de-DE', {minimumFractionDigits: stellen, maximumFractionDigits: stellen}) + ' R';
const fmtProzent = x => Math.round(x * 100) + ' %';
const stellenFuer = p => p >= 10 ? 2 : p >= 1 ? 3 : p >= 0.1 ? 4 : p >= 0.01 ? 5 : 6;
const richtungText = f => f.richtung === 'long' ? ['kauf', '▲ Kauf'] : f.richtung === 'short' ? ['verkauf', '▼ Verkauf (Short)'] : ['unklar', 'Richtung noch offen'];
const marktName = id => (Z.marktNach.get(id) || {}).name || id.split(':')[1] || id;

// ----------------------------------------------------------------- Chart
function achsenText(zeit, art) {
  const d = new Date(zeit * 1000);
  const zone = Z.tf === '1d' ? 'UTC' : undefined;
  if (art === 0) return d.toLocaleDateString('de-DE', {year: 'numeric', timeZone: zone});
  if (art === 1) return d.toLocaleDateString('de-DE', {month: 'short', year: '2-digit', timeZone: zone});
  if (art === 2) return d.toLocaleDateString('de-DE', {day: 'numeric', month: 'short', timeZone: zone});
  return d.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit', timeZone: zone});
}

function baueChart() {
  chart = LC.createChart($('#chart'), {
    autoSize: true,
    layout: {background: {type: 'solid', color: FARBE.bg}, textColor: FARBE.leise, fontSize: 12,
             fontFamily: getComputedStyle(document.body).fontFamily, attributionLogo: false},
    grid: {vertLines: {color: FARBE.gitter}, horzLines: {color: FARBE.gitter}},
    crosshair: {mode: LC.CrosshairMode.Normal,
                vertLine: {color: '#5c5c5c', labelBackgroundColor: '#2a2a2a'},
                horzLine: {color: '#5c5c5c', labelBackgroundColor: '#2a2a2a'}},
    rightPriceScale: {borderColor: FARBE.rand, scaleMargins: {top: 0.08, bottom: 0.24}},
    timeScale: {borderColor: FARBE.rand, timeVisible: true, secondsVisible: false, rightOffset: 8, minBarSpacing: 1.2,
                tickMarkFormatter: achsenText},
    localization: {locale: 'de-DE', priceFormatter: fmtPreis, timeFormatter: t => fmtZeit(t)},
    handleScroll: {vertTouchDrag: false},   // mit dem Finger hoch und runter wischen blättert die Seite
  });

  bandSerie = chart.addHistogramSeries({priceScaleId: 'band', lastValueVisible: false, priceLineVisible: false,
    autoscaleInfoProvider: () => ({priceRange: {minValue: 0, maxValue: 1}})});
  chart.priceScale('band').applyOptions({scaleMargins: {top: 0, bottom: 0}});

  volSerie = chart.addHistogramSeries({priceScaleId: 'vol', priceFormat: {type: 'volume'}, lastValueVisible: false, priceLineVisible: false});
  chart.priceScale('vol').applyOptions({scaleMargins: {top: 0.84, bottom: 0}});

  kerzenSerie = chart.addCandlestickSeries({
    upColor: FARBE.bull, downColor: FARBE.bear, borderUpColor: FARBE.bull, borderDownColor: FARBE.bear,
    wickUpColor: FARBE.bull, wickDownColor: FARBE.bear, priceLineColor: '#5c5c5c',
  });

  const linie = (farbe, stil, titel, breite = 2) => chart.addLineSeries({
    color: farbe, lineWidth: breite, lineStyle: stil, title: titel,
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
  });
  hilfsLinien = [linie('#a8a8a8', LC.LineStyle.Dotted, '', 1), linie('#a8a8a8', LC.LineStyle.Dotted, '', 1)];
  linien = {
    stop: linie(FARBE.bear, LC.LineStyle.Dashed, 'Stop'),
    ziel: linie(FARBE.bull, LC.LineStyle.Dashed, 'Ziel'),
    einstieg: linie(FARBE.akzent, LC.LineStyle.Solid, 'Einstieg'),
  };

  chart.subscribeCrosshairMove(p => {
    const i = p && p.time != null ? Z.index.get(p.time) : undefined;
    Z.schwebt = i !== undefined;
    zeigeWerte(i !== undefined ? Z.kerzen[i] : Z.kerzen[Z.kerzen.length - 1]);
  });
  chart.subscribeClick(p => {
    if (!p) return;
    const id = p.hoveredObjectId && Z.nachId.has(p.hoveredObjectId) ? p.hoveredObjectId : fundBeiPunkt(p.point);
    if (id) waehleFund(id, {springen: false, rollen: true});
  });
  new ResizeObserver(() => {
    if (!Z.ausschnittOffen || $('#chart').clientWidth === 0 || !Z.kerzen.length) return;
    Z.ausschnittOffen = false;
    const f = Z.auswahl ? Z.nachId.get(Z.auswahl) : null;
    if (f && f.markt === Z.markt) springeZu(f); else zeigeEnde();
  }).observe($('#chart'));
  chart.timeScale().subscribeVisibleLogicalRangeChange(b => {
    $('#zu-jetzt').hidden = !b || b.to >= Z.kerzen.length - 2;
  });
}

// Beim Tippen mit dem Finger meldet die Chart-Bibliothek nicht, welcher Pfeil getroffen wurde.
// Darum wird hier selbst nachgesehen, welcher Pfeil am nächsten am Finger liegt.
function fundBeiPunkt(punkt) {
  if (!punkt || !Z.marken.length) return null;
  const weit = FINGER.matches ? 26 : 12;
  const treffer = [];
  for (const m of Z.marken) {
    const k = Z.kerzen[Z.index.get(m.time)];
    const x = chart.timeScale().timeToCoordinate(m.time);
    if (!k || x === null || Math.abs(x - punkt.x) > weit) continue;
    const oben = m.position === 'aboveBar';
    const kante = kerzenSerie.priceToCoordinate(oben ? k[2] : k[3]);
    if (kante === null) continue;
    const aussen = oben ? kante - punkt.y : punkt.y - kante;     // so weit liegt der Finger außerhalb der Kerze
    if (aussen < -8 || aussen > 90) continue;
    treffer.push({id: m.id, abstand: Math.abs(x - punkt.x)});
  }
  if (!treffer.length) return null;
  treffer.sort((a, b) => a.abstand - b.abstand);
  const nah = treffer.filter(x => x.abstand - treffer[0].abstand < 1);    // mehrere Pfeile an derselben Kerze
  const jetzt = nah.findIndex(x => x.id === Z.auswahl);
  return nah[(jetzt + 1) % nah.length].id;                       // nochmal tippen wählt den nächsten Pfeil dort
}

function zeigeEnde() {
  chart.timeScale().setVisibleLogicalRange({from: Z.kerzen.length - 150, to: Z.kerzen.length + 6});
}

function zeigeWerte(k) {
  const ziel = $('#ct-werte');
  if (!k) { ziel.innerHTML = ''; return; }
  const art = k[4] >= k[1] ? 'rauf' : 'runter';
  ziel.innerHTML = `<span>${fmtZeit(k[0])}</span>`
    + `<span class="${art}">Eröffnung <b>${fmtPreis(k[1])}</b></span><span class="${art}">Hoch <b>${fmtPreis(k[2])}</b></span>`
    + `<span class="${art}">Tief <b>${fmtPreis(k[3])}</b></span><span class="${art}">Schluss <b>${fmtPreis(k[4])}</b></span>`
    + `<span>Volumen <b>${F_KOMPAKT.format(k[5])}</b></span>`;
}

function zeigeKurs(preis) {
  const feld = $('#kurs');
  if (preis == null) { feld.textContent = ''; return; }
  feld.textContent = fmtPreis(preis);
  if (Z.letzterKurs != null && preis !== Z.letzterKurs) feld.className = 'kurs ' + (preis > Z.letzterKurs ? 'rauf' : 'runter');
  Z.letzterKurs = preis;
}

function chartMeldung(text, mitKnopf) {
  const feld = $('#chart-meldung');
  if (!text) { feld.hidden = true; feld.innerHTML = ''; return; }
  feld.hidden = false;
  feld.innerHTML = `<p>${esc(text)}</p>` + (mitKnopf ? '<button class="knopf haupt-knopf" type="button" id="nochmal">Nochmal versuchen</button>' : '');
  if (mitKnopf) $('#nochmal').addEventListener('click', () => ladeKerzen(true));
}

const kerzeFuerChart = k => ({time: k[0], open: k[1], high: k[2], low: k[3], close: k[4]});
const volFuerChart = k => ({time: k[0], value: k[5], color: k[4] >= k[1] ? 'rgba(47,163,127,.38)' : 'rgba(212,80,94,.38)'});

function setzeKerzen(d, neu) {
  Z.kerzen = d.kerzen;
  Z.quelle = d.quelle;
  Z.index = new Map(Z.kerzen.map((k, i) => [k[0], i]));
  const letzte = Z.kerzen[Z.kerzen.length - 1];
  Z.stellen = stellenFuer(letzte[4]);
  kerzenSerie.applyOptions({priceFormat: {type: 'price', precision: Z.stellen, minMove: 1 / 10 ** Z.stellen}});
  kerzenSerie.setData(Z.kerzen.map(kerzeFuerChart));
  volSerie.setData(Z.kerzen.map(volFuerChart));
  if (d.name && Z.marktNach.has(d.markt) && !Z.marktNach.get(d.markt).name) Z.marktNach.get(d.markt).name = d.name;
  if (neu) {
    Z.letzterKurs = null;
    $('#kurs').className = 'kurs';
    zeigeEnde();
    // War das Fenster beim Laden unsichtbar (Breite 0), wird der Ausschnitt nachgeholt, sobald es sichtbar ist.
    Z.ausschnittOffen = $('#chart').clientWidth === 0;
  }
  zeigeKurs(letzte[4]);
  if (!Z.schwebt) zeigeWerte(letzte);
  zeichneMarker();
  zeichneAuswahl();
  zeigeStatus();
}

async function ladeKerzen(neu) {
  const nr = ++Z.ladeNr;
  if (neu) { stoppeLive(); chartMeldung('Kurse werden geladen …'); }
  let d;
  try {
    d = await api('/api/kerzen', {markt: Z.markt, tf: Z.tf});
  } catch (e) {
    if (nr === Z.ladeNr && neu) { chartMeldung('Die Kurse konnten nicht geladen werden. ' + e.message, true); Z.quelle = null; zeigeStatus(); }
    return false;
  }
  if (nr !== Z.ladeNr) return false;
  if (!d.kerzen.length) { chartMeldung('Für diesen Markt gibt es keine Kerzen.', true); return false; }
  chartMeldung('');
  const alt = Z.kerzen[Z.kerzen.length - 1], frisch = d.kerzen[d.kerzen.length - 1];
  if (!neu && alt && d.kerzen.length === Z.kerzen.length && alt[0] === frisch[0] && alt[4] === frisch[4] && alt[5] === frisch[5]) {
    Z.quelle = d.quelle;                    // gleiche Kurse: nur die Statuszeile auffrischen
    zeigeStatus();
    return false;
  }
  setzeKerzen(d, neu);
  if (neu) starteLive();
  return true;
}

// ------------------------------------------------------------------ Live
function gleicheAb() {                      // Kerzen neu holen und Lücken füllen, aber nie zweimal gleichzeitig
  if (!Z.abgleich) {
    Z.abgleich = ladeKerzen(false)
      .then(neues => { if (neues) planeFunde(500); return neues; })
      .finally(() => { Z.abgleich = null; });
  }
  return Z.abgleich;
}

// Tablets legen die Seite schlafen, sobald man die App wechselt oder der Bildschirm ausgeht.
// Beim Zurückkommen: Live-Verbindung prüfen und die Kerzen nachholen, die inzwischen entstanden sind.
function aufgewacht() {
  if (document.hidden || !Z.markt || !Z.kerzen.length) return;
  const markt = Z.marktNach.get(Z.markt);
  if (markt && markt.art === 'krypto') {
    const still = Date.now() - Z.liveZuletzt > 10000;
    if (!Z.live || Z.live.readyState !== WebSocket.OPEN || still) starteLive();
  }
  gleicheAb();
}

function stoppeLive() {
  Z.liveNr++;
  if (Z.live) { try { Z.live.close(); } catch { /* schon zu */ } Z.live = null; }
  clearInterval(Z.abfrage); Z.abfrage = null;
  Z.liveZustand = 'aus';
}

function starteLive() {
  stoppeLive();
  const markt = Z.marktNach.get(Z.markt);
  if (!markt) return;
  if (markt.art !== 'krypto') {            // Aktien: einmal pro Minute nachsehen
    Z.abfrage = setInterval(gleicheAb, 60000);
    return;
  }
  verbinde(Z.liveNr, 0);
}

function verbinde(nr, versuch) {
  if (nr !== Z.liveNr) return;
  Z.liveZustand = versuch ? 'getrennt' : 'verbindet';
  zeigeStatus();
  const kanal = `${Z.markt.split(':')[1].toLowerCase()}@kline_${Z.tf}`;
  let ws;
  try { ws = new WebSocket(LIVE_ADRESSEN[versuch % LIVE_ADRESSEN.length] + kanal); }
  catch { setTimeout(() => verbinde(nr, versuch + 1), 4000); return; }
  Z.live = ws;
  ws.onopen = () => {
    if (nr !== Z.liveNr) { ws.close(); return; }
    Z.liveZustand = 'offen'; zeigeStatus();
    Z.liveZuletzt = Date.now();
    if (versuch) gleicheAb();              // nach einer Unterbrechung Lücken füllen
  };
  ws.onmessage = ev => {
    if (nr !== Z.liveNr) return;
    Z.liveZuletzt = Date.now();
    let k; try { k = JSON.parse(ev.data).k; } catch { return; }
    if (k) liveKerze(k);
  };
  ws.onclose = () => {
    if (nr !== Z.liveNr) return;
    Z.liveZustand = 'getrennt'; zeigeStatus();
    setTimeout(() => verbinde(nr, versuch + 1), Math.min(15000, 2000 * (versuch + 1)));
  };
  ws.onerror = () => { try { ws.close(); } catch { /* egal */ } };
}

function liveKerze(k) {
  const t = Math.floor(k.t / 1000);
  const letzte = Z.kerzen[Z.kerzen.length - 1];
  if (!letzte || t < letzte[0]) return;
  if (t > letzte[0] + Z.tfSek) { gleicheAb(); return; }         // es fehlen Kerzen: neu abgleichen
  const neu = [t, +k.o, +k.h, +k.l, +k.c, +k.v];
  if (t === letzte[0]) {
    Z.kerzen[Z.kerzen.length - 1] = neu;
  } else {
    Z.kerzen.push(neu);
    Z.index.set(t, Z.kerzen.length - 1);
    planeFunde(2500);
  }
  if (k.x) planeFunde(2500);               // Kerze fertig: Muster neu suchen
  try {
    kerzenSerie.update(kerzeFuerChart(neu));
    volSerie.update(volFuerChart(neu));
  } catch { gleicheAb(); return; }
  zeigeKurs(neu[4]);
  if (!Z.schwebt) zeigeWerte(neu);
}

function planeFunde(warte) {
  clearTimeout(Z.fundeUhr);
  Z.fundeUhr = setTimeout(() => ladeFunde(true), warte);
}

function zeigeStatus() {
  const feld = $('#status'), text = $('#status-text'), q = Z.quelle;
  let art = '', satz = 'Keine Kurse';
  if (q && q.art === 'krypto') {
    if (Z.liveZustand === 'offen') { art = 'live'; satz = 'Live · Kerze läuft in Echtzeit'; }
    else if (Z.liveZustand === 'verbindet') { art = 'spaet'; satz = 'Verbinde mit den Live-Kursen …'; }
    else { art = 'fehler'; satz = 'Live-Verbindung getrennt. Neuer Versuch läuft …'; }
  } else if (q) {
    const stand = q.stand ? new Date(q.stand * 1000) : null;
    if (q.boerse_offen) {
      const alt = stand ? Math.max(0, Math.round((Date.now() - stand) / 60000)) : null;
      art = 'spaet';
      satz = 'Börse offen · nicht live, bis 15 Min verzögert' + (stand ? ` · letzter Kurs ${F_UHR.format(stand)} Uhr (vor ${alt} Min)` : '');
    } else {
      satz = 'Börse geschlossen' + (stand ? ` · letzter Kurs ${F_KURZ.format(stand)} Uhr` : '')
        + (q.oeffnet ? ` · öffnet ${F_KURZ.format(new Date(q.oeffnet * 1000))} Uhr` : '');
    }
  }
  feld.className = 'status ' + art;
  text.textContent = satz;
  feld.title = q ? q.text : '';
  $('#fuss-quelle').textContent = q ? `Quelle: ${q.name}. ${q.text} Alle Zeiten in deiner Ortszeit.` : '';
}

// ----------------------------------------------------------------- Funde
const passtOhneAusgang = f => (Z.filter.muster === 'alle' || f.muster === Z.filter.muster)
  && (Z.filter.markt === 'alle' || f.markt === Z.filter.markt);

async function ladeFunde(leise = false) {
  const nr = ++Z.fundeNr, tf = Z.tf;
  if (!leise) { Z.fundeStand = 'laedt'; baueListe(); baueStatistik(); }
  let d;
  try {
    d = await api('/api/funde', {tf, maerkte: Z.maerkte.map(m => m.id).join(',')});
  } catch (e) {
    if (nr !== Z.fundeNr) return;
    if (!leise) { Z.fundeStand = 'fehler'; Z.fundeFehlertext = e.message; baueListe(); baueStatistik(); }
    return;
  }
  if (nr !== Z.fundeNr || tf !== Z.tf) return;
  const merkmal = JSON.stringify([d.funde.length, d.funde[0] && d.funde[0].id, d.statistik.alle, d.fehler]);
  if (leise && Z.fundeStand === 'da' && merkmal === Z.fundeMerkmal) return;   // nichts Neues
  Z.fundeMerkmal = merkmal;
  Z.funde = d.funde;
  Z.statistik = d.statistik;
  Z.fundeFehler = d.fehler;
  Z.nachId = new Map(d.funde.map(f => [f.id, f]));
  Z.fundeStand = 'da';
  if (Z.auswahl && !Z.nachId.has(Z.auswahl)) Z.auswahl = null;
  baueListe();
  baueStatistik();
  zeichneMarker();
  zeichneAuswahl();
}

function zeichneMarker() {
  if (!kerzenSerie) return;
  const marken = [];
  for (const f of Z.funde) {
    if (f.markt !== Z.markt || f.tf !== Z.tf || !Z.index.has(f.t_ende)) continue;
    const gewaehlt = f.id === Z.auswahl;
    if (!gewaehlt) {
      if (Z.filter.muster !== 'alle' && f.muster !== Z.filter.muster) continue;
      if (Z.filter.ausgang !== 'alle' && f.ausgang !== Z.filter.ausgang) continue;
    }
    marken.push({
      time: f.t_ende,
      position: f.richtung === 'short' ? 'aboveBar' : 'belowBar',
      shape: f.richtung === 'short' ? 'arrowDown' : f.richtung === 'long' ? 'arrowUp' : 'circle',
      color: AUSGANG[f.ausgang].farbe,
      size: gewaehlt ? 2 : 1,
      text: gewaehlt ? Z.musterName[f.muster] : undefined,
      id: f.id,
    });
    if (gewaehlt && f.t_schluss != null && Z.index.has(f.t_schluss) && f.t_schluss !== f.t_ende) {
      marken.push({
        time: f.t_schluss, position: f.richtung === 'short' ? 'belowBar' : 'aboveBar', shape: 'circle', size: 1,
        color: AUSGANG[f.ausgang].farbe, text: f.ausgang === 'ziel' ? 'Ziel erreicht' : 'Stop erreicht',
      });
    }
  }
  marken.sort((a, b) => a.time - b.time);
  Z.marken = marken.filter(m => m.id);
  kerzenSerie.setMarkers(marken);
}

function zeichneAuswahl() {
  if (!kerzenSerie) return;
  const f = Z.auswahl ? Z.nachId.get(Z.auswahl) : null;
  const leeren = () => {
    bandSerie.setData([]);
    for (const s of [linien.einstieg, linien.stop, linien.ziel, ...hilfsLinien]) s.setData([]);
  };
  if (!f || f.markt !== Z.markt || f.tf !== Z.tf) { leeren(); zeigeDetail(f && f.markt === Z.markt ? f : null); return; }
  const a = Z.index.get(f.t_start), b = Z.index.get(f.t_ende);
  if (a == null || b == null) { leeren(); zeigeDetail(f); return; }
  const letzter = Z.kerzen.length - 1;

  bandSerie.setData(Z.kerzen.slice(a, b + 1).map(k => ({time: k[0], value: 1, color: 'rgba(217,217,217,.17)'})));

  let bis = f.t_schluss != null ? Z.index.get(f.t_schluss)
    : f.ausgang === 'offen' ? letzter : b + Z.start.warte_kerzen;
  if (bis == null) bis = letzter;
  bis = Math.min(Math.max(bis, b + 3), letzter);
  const von = bis > b ? b : Math.max(0, bis - 3);
  const strecke = (p, i1 = von, i2 = bis) => (p == null || i1 == null || i2 == null || i1 >= i2) ? []
    : [{time: Z.kerzen[i1][0], value: p}, {time: Z.kerzen[i2][0], value: p}];
  linien.einstieg.setData(strecke(f.einstieg));
  linien.stop.setData(strecke(f.stop));
  linien.ziel.setData(strecke(f.ziel));
  hilfsLinien.forEach((s, i) => {
    const li = f.linien[i];
    s.applyOptions({title: li ? li.name : ''});
    s.setData(li ? strecke(li.preis, Z.index.get(li.t_von), Z.index.get(li.t_bis)) : []);
  });
  zeigeDetail(f);
}

function springeZu(f) {
  const a = Z.index.get(f.t_start), b = Z.index.get(f.t_ende);
  if (a == null || b == null) return;
  const ende = f.t_schluss != null && Z.index.has(f.t_schluss) ? Z.index.get(f.t_schluss) : b + 6;
  let von = a - 22, bis = Math.max(ende, b + 6) + 14;
  if (bis - von < 70) { const fehlt = 70 - (bis - von); von -= fehlt * 0.4; bis += fehlt * 0.6; }
  chart.timeScale().setVisibleLogicalRange({from: von, to: bis});
}

function zeigeDetail(f) {
  const feld = $('#detail');
  if (!f) {
    feld.innerHTML = '<p class="detail-leer">Wähle einen Fund aus der Liste oder tippe im Chart auf einen Pfeil. Dann springt der Chart zu genau diesen Kerzen und zeigt Einstieg, Stop und Ziel.</p>';
    return;
  }
  const ri = richtungText(f);
  const nr = Z.sichtbar.findIndex(x => x.id === f.id);
  const teile = [];
  teile.push(`<span>Muster fertig <b>${fmtZeit(f.t_ende, f.tf)}</b></span>`);
  if (f.einstieg != null) {
    teile.push(`<span>Einstieg <b>${fmtPreis(f.einstieg)}</b></span>`, `<span>Stop <b>${fmtPreis(f.stop)}</b></span>`, `<span>Ziel <b>${fmtPreis(f.ziel)}</b></span>`);
    if (f.ziel_r != null) teile.push(`<span>Ziel liegt bei <b>${fmtR(f.ziel_r).replace('+', '')}</b></span>`);
  }
  if (f.dauer != null) teile.push(`<span>Dauer <b>${f.dauer} ${f.dauer === 1 ? 'Kerze' : 'Kerzen'}</b></span>`);
  feld.innerHTML = `
    <div class="d-kopf">
      <h2>${esc(Z.musterName[f.muster])}</h2>
      <span class="pille ${ri[0]}">${ri[1]}</span>
      <span class="pille ${f.ausgang}">${AUSGANG[f.ausgang].kurz}${f.r != null ? ' · ' + fmtR(f.r) : ''}</span>
      <span class="leise">${esc(marktName(f.markt))} · ${esc(Z.zeitName[f.tf] || f.tf)}</span>
      <span class="d-blaettern">
        <button class="knopf" type="button" data-schritt="1" ${nr < 0 || nr >= Z.sichtbar.length - 1 ? 'disabled' : ''} title="Zum älteren Fund in der Liste">◂ Älter</button>
        <button class="knopf" type="button" data-schritt="-1" ${nr <= 0 ? 'disabled' : ''} title="Zum neueren Fund in der Liste">Neuer ▸</button>
      </span>
    </div>
    <div class="d-zeile">${teile.join('')}</div>
    <p class="d-grund">${esc(Z.start.gruende[f.grund] || '')}${f.r != null ? ' Ergebnis vor Kosten: <b>' + fmtR(f.r) + '</b>.' : ''}</p>`;
}

async function waehleFund(id, {springen = true, rollen = false} = {}) {
  const f = Z.nachId.get(id);
  if (!f) return;
  Z.auswahl = id;
  if (f.markt !== Z.markt) {
    $('#markt').value = f.markt;
    const ok = await wechsle(f.markt, Z.tf, true);
    if (!ok || Z.auswahl !== id) return;
  }
  zeichneMarker();
  zeichneAuswahl();
  if (springen) springeZu(f);
  for (const alt of document.querySelectorAll('.fund.aktiv')) alt.classList.remove('aktiv');
  let zeile = document.querySelector(`.fund[data-id="${CSS.escape(id)}"]`);
  if (!zeile && rollen) {                    // Fund steht weiter unten in der Liste: Liste verlängern
    const stelle = Z.sichtbar.findIndex(x => x.id === id);
    if (stelle >= 0) { Z.gezeigt = Math.max(Z.gezeigt, stelle + 20); baueListe(); zeile = document.querySelector(`.fund[data-id="${CSS.escape(id)}"]`); }
  }
  if (zeile) { zeile.classList.add('aktiv'); zeigeZeile(zeile); }
}

function zeigeZeile(zeile) {                // rollt nur die Liste, nicht die ganze Seite
  const liste = $('#liste'), l = liste.getBoundingClientRect(), z = zeile.getBoundingClientRect();
  if (z.top < l.top) liste.scrollTop -= l.top - z.top;
  else if (z.bottom > l.bottom) liste.scrollTop += z.bottom - l.bottom;
}

function zumChart() {                       // schmale Ansicht: Der Chart steht über der Liste, also dorthin rollen
  if (GESTAPELT.matches) $('.chartbereich').scrollIntoView({behavior: 'smooth', block: 'start'});
}

function blaettere(schritt) {
  if (!Z.sichtbar.length) return;
  const nr = Z.sichtbar.findIndex(x => x.id === Z.auswahl);
  const neu = nr < 0 ? 0 : Math.min(Z.sichtbar.length - 1, Math.max(0, nr + schritt));
  if (neu >= Z.gezeigt) { Z.gezeigt = neu + SEITE; baueListe(); }
  waehleFund(Z.sichtbar[neu].id);
}

function baueListe() {
  const basis = Z.funde.filter(passtOhneAusgang);
  const zahl = {alle: basis.length, ziel: 0, stop: 0, nie: 0, offen: 0};
  for (const f of basis) zahl[f.ausgang]++;
  $('#f-ausgang').innerHTML = [['alle', 'Alle'], ['ziel', 'Funktioniert'], ['stop', 'Nicht funktioniert'], ['nie', 'Nie ausgelöst'], ['offen', 'Noch offen']]
    .map(([k, name]) => `<button type="button" class="chip ${k}${Z.filter.ausgang === k ? ' aktiv' : ''}" data-ausgang="${k}" aria-pressed="${Z.filter.ausgang === k}">${name}<b>${zahl[k]}</b></button>`).join('');

  Z.sichtbar = Z.filter.ausgang === 'alle' ? basis : basis.filter(f => f.ausgang === Z.filter.ausgang);
  const feld = $('#liste');
  if (Z.fundeStand === 'laedt') { feld.innerHTML = '<p class="liste-meldung">Muster werden in allen Märkten gesucht …</p>'; return; }
  if (Z.fundeStand === 'fehler') { feld.innerHTML = `<p class="liste-meldung fehler">Die Suche hat nicht geklappt. ${esc(Z.fundeFehlertext)}</p>`; return; }
  let html = '';
  for (const fehler of Z.fundeFehler) html += `<p class="liste-meldung fehler">${esc(marktName(fehler.markt))}: ${esc(fehler.text)}</p>`;
  if (!Z.sichtbar.length) {
    feld.innerHTML = html + '<p class="liste-meldung">Kein Fund passt zu diesem Filter.</p>';
    return;
  }
  for (const f of Z.sichtbar.slice(0, Z.gezeigt)) {
    const ri = richtungText(f);
    html += `<button type="button" class="fund ${f.ausgang}${f.id === Z.auswahl ? ' aktiv' : ''}" data-id="${esc(f.id)}">`
      + `<span><span class="f-name">${esc(Z.musterName[f.muster])}</span><span class="f-richtung ${ri[0]}">${ri[1]}</span></span>`
      + `<span class="pille ${f.ausgang}">${AUSGANG[f.ausgang].kurz}</span>`
      + `<span class="f-wo">${esc(marktName(f.markt))} · ${fmtZeit(f.t_ende, f.tf)}</span>`
      + `<span class="f-r ${f.r > 0 ? 'plus' : f.r < 0 ? 'minus' : ''}">${f.r != null ? fmtR(f.r) : ''}</span></button>`;
  }
  if (Z.sichtbar.length > Z.gezeigt) {
    html += `<button type="button" class="knopf mehr" id="mehr">Weitere ${Math.min(SEITE, Z.sichtbar.length - Z.gezeigt)} zeigen (noch ${Z.sichtbar.length - Z.gezeigt} ältere)</button>`;
  }
  const rollstand = feld.scrollTop;          // beim Auffrischen nicht nach oben springen
  feld.innerHTML = html;
  feld.scrollTop = rollstand;
}

// ------------------------------------------------------------- Statistik
function baueStatistik() {
  const feld = $('#statistik');
  if (Z.fundeStand === 'laedt') { feld.innerHTML = '<p class="liste-meldung">Wird gerechnet …</p>'; return; }
  if (Z.fundeStand === 'fehler') { feld.innerHTML = `<p class="liste-meldung fehler">${esc(Z.fundeFehlertext)}</p>`; return; }
  const wo = Z.filter.markt === 'alle' ? 'alle Märkte zusammen' : marktName(Z.filter.markt);
  const zahlen = Z.statistik[Z.filter.markt] || {};
  const min = Z.start.min_beispiele;
  let html = `<div class="kasten hinweis-kasten"><b>So liest du die Zahlen</b> (${esc(wo)}, ${esc(Z.zeitName[Z.tf])} pro Kerze)
    <ul>
      <li>Alles ist <b>vor Kosten</b> gerechnet. Gebühren und der Abstand zwischen Kauf- und Verkaufskurs gehen noch ab.</li>
      <li>1 R ist der Verlust, wenn der Stop greift. Bei Ziel 2 R brauchst du mehr als etwa 34 % Treffer, nur um bei null zu landen.</li>
      <li>Unter ${min} ausgewerteten Beispielen ist jede Zahl Zufall. Die Spanne zeigt, wie unsicher die Trefferquote ist.</li>
      <li>Wer viele Muster und Märkte ansieht, findet immer eins, das zufällig gut aussieht.</li>
    </ul></div>`;
  for (const m of Z.start.muster) {
    const s = zahlen[m.key];
    if (!s) {
      html += `<div class="kasten wenig"><div class="s-kopf"><h3>${esc(m.name)}</h3><small>0 Funde</small></div>
        <p class="s-warnung">Zu wenige Beispiele für eine Aussage</p><p class="s-leer">In diesem Zeitraum wurde das Muster hier nicht gefunden.</p></div>`;
      continue;
    }
    const n = s.abgeschlossen;
    const quote = s.trefferquote == null ? '–' : fmtProzent(s.trefferquote);
    const spanne = s.spanne ? `Spanne ${Math.round(s.spanne[0] * 100)} bis ${Math.round(s.spanne[1] * 100)} %` : 'keine Auswertung';
    const noetig = s.noetig == null ? '–' : Math.ceil(s.noetig * 100 - 1e-9) + ' %';
    const schnitt = s.schnitt_r == null ? '–' : fmtR(s.schnitt_r, 2);
    let urteil = '';
    if (!s.zu_wenig) {
      if (s.spanne[0] > s.noetig) urteil = 'In diesem Zeitraum über der nötigen Quote. Das ist kein Beweis: Gebühren fehlen noch, und es gilt nur für diese Kurse.';
      else if (s.spanne[1] < s.noetig) urteil = 'Unter der nötigen Quote. Hier hätte das Muster Geld gekostet.';
      else urteil = 'Kein klarer Vorteil erkennbar. Die nötige Quote liegt mitten in der Spanne.';
    }
    const teil = k => s.funde ? (s[k] / s.funde * 100).toFixed(2) : 0;
    html += `<div class="kasten${s.zu_wenig ? ' wenig' : ''}">
      <div class="s-kopf"><h3>${esc(m.name)}</h3><small>${s.funde} Funde, ${n} ausgewertet</small></div>
      <div class="s-zahlen">
        <div class="s-zahl"><span>Trefferquote</span><b>${quote}</b><small>${spanne}</small></div>
        <div class="s-zahl"><span>Nötig für null</span><b>${noetig}</b><small>vor Gebühren</small></div>
        <div class="s-zahl"><span>Ø Ergebnis</span><b class="${s.schnitt_r > 0 ? 'plus' : s.schnitt_r < 0 ? 'minus' : ''}">${schnitt}</b><small>je Beispiel, vor Kosten</small></div>
      </div>
      <div class="balken" aria-hidden="true"><i class="ziel" style="width:${teil('ziel')}%"></i><i class="stop" style="width:${teil('stop')}%"></i><i class="nie" style="width:${teil('nie')}%"></i><i class="offen" style="width:${teil('offen')}%"></i></div>
      <div class="s-aufteilung"><span><b>${s.ziel}</b> funktioniert</span><span><b>${s.stop}</b> nicht</span><span><b>${s.nie}</b> nie ausgelöst</span><span><b>${s.offen}</b> offen</span></div>
      ${s.zu_wenig ? `<p class="s-warnung">Zu wenige Beispiele für eine Aussage (${n} von mindestens ${min})</p>` : `<p class="s-urteil">${urteil}</p>`}
      <div class="s-knoepfe">
        <button class="knopf" type="button" data-zeige="${m.key}" data-ausgang="alle">Alle Beispiele</button>
        <button class="knopf" type="button" data-zeige="${m.key}" data-ausgang="ziel">Nur funktioniert</button>
        <button class="knopf" type="button" data-zeige="${m.key}" data-ausgang="stop">Nur nicht funktioniert</button>
      </div></div>`;
  }
  feld.innerHTML = html;
}

// ---------------------------------------------------------------- Regeln
function baueRegeln() {
  let html = `<div class="kasten hinweis-kasten">Jedes Muster ist eine <b>feste Regel</b> im Programm. Es wird nichts geschätzt und nichts nachträglich schöngesucht. `
    + `Die Bilder zu den Mustern findest du in deiner Lernseite „Kerzen-Schule“.</div><p class="regel-titel">Gilt für alle Muster</p>`;
  for (const a of Z.start.allgemein) {
    html += `<details><summary>${esc(a.titel)}</summary><div class="regel-inhalt"><p>${esc(a.text)}</p></div></details>`;
  }
  html += '<p class="regel-titel">Die Muster</p>';
  for (const m of Z.start.muster) {
    const seite = m.seite === 'steigend' ? 'steigend ▲' : m.seite === 'fallend' ? 'fallend ▼' : 'beide Richtungen';
    html += `<details><summary>${esc(m.name)}<small>${esc(m.kerzen)} · ${seite}</small></summary><div class="regel-inhalt">
      <p>${esc(m.idee)}</p>
      <p class="leise">Erkannt wird es, wenn alles davon stimmt:</p>
      <ol>${m.regeln.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
      <dl><dt>Einstieg</dt><dd>${esc(m.einstieg)}</dd><dt>Stop</dt><dd>${esc(m.stop)}</dd><dt>Ziel</dt><dd>${esc(m.ziel)}</dd><dt class="falle">Falle</dt><dd>${esc(m.falle)}</dd></dl>
    </div></details>`;
  }
  $('#regeln').innerHTML = html;
}

// --------------------------------------------------------- Kopf und Wahl
function baueWahl() {
  Z.marktNach = new Map(Z.maerkte.map(m => [m.id, m]));
  const gruppe = (titel, liste) => liste.length
    ? `<optgroup label="${titel}">${liste.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.kuerzel)})</option>`).join('')}</optgroup>` : '';
  const fest = Z.maerkte.filter(m => !m.eigen), eigen = Z.maerkte.filter(m => m.eigen);
  const optionen = gruppe('Krypto', fest.filter(m => m.art === 'krypto')) + gruppe('Aktien und Index-ETFs', fest.filter(m => m.art === 'aktie')) + gruppe('Eigene', eigen);
  $('#markt').innerHTML = optionen;
  $('#f-markt').innerHTML = '<option value="alle">Alle Märkte</option>' + optionen;
  if (Z.markt) $('#markt').value = Z.markt;
  if (!Z.marktNach.has(Z.filter.markt)) Z.filter.markt = 'alle';
  $('#f-markt').value = Z.filter.markt;
}

function zeigeKopf() {
  const m = Z.marktNach.get(Z.markt) || {};
  $('#ct-name').textContent = m.name || Z.markt;
  $('#ct-kuerzel').textContent = m.kuerzel || '';
  $('#ct-tf').textContent = (Z.zeitName[Z.tf] || Z.tf) + ' pro Kerze';
  $('#markt').value = Z.markt;
  $('#eigen-weg').hidden = !m.eigen;
  for (const b of document.querySelectorAll('#zeiten button')) {
    const an = b.dataset.tf === Z.tf;
    b.classList.toggle('aktiv', an);
    b.setAttribute('aria-pressed', an);
  }
  document.title = `${m.name || ''} · Musterlupe`;
}

async function wechsle(markt, tf, behalteAuswahl = false) {
  const tfNeu = tf !== Z.tf;
  Z.markt = markt; Z.tf = tf;
  Z.tfSek = (Z.start.zeiten.find(z => z.key === tf) || {}).sek || 300;
  merke('markt', markt); merke('tf', tf);
  if (!behalteAuswahl) Z.auswahl = null;
  if (tfNeu) { Z.funde = []; Z.nachId = new Map(); Z.statistik = {}; Z.auswahl = null; Z.gezeigt = SEITE; Z.fundeMerkmal = ''; }
  zeigeKopf();
  zeigeDetail(null);
  const fertig = ladeKerzen(true);
  if (tfNeu) ladeFunde();
  else if (!behalteAuswahl) baueListe();
  return fertig;
}

function zeigeReiter(name) {
  Z.reiter = name;
  for (const r of ['funde', 'statistik', 'regeln']) {
    const an = r === name;
    $('#r-' + r).classList.toggle('aktiv', an);
    $('#r-' + r).setAttribute('aria-selected', an);
    $('#p-' + r).hidden = !an;
  }
  $('.filterleiste').hidden = name === 'regeln';
  $('#f-muster').hidden = name === 'statistik';
  $('.filterleiste').style.gridTemplateColumns = name === 'statistik' ? '1fr' : '';
}

function filterGeaendert() {
  Z.gezeigt = SEITE;
  $('#f-muster').value = Z.filter.muster;
  $('#f-markt').value = Z.filter.markt;
  baueListe();
  baueStatistik();
  zeichneMarker();
  if (Z.auswahl) zeigeDetail(Z.nachId.get(Z.auswahl));
}

function verdrahte() {
  $('#markt').addEventListener('change', e => wechsle(e.target.value, Z.tf));
  $('#zeiten').addEventListener('click', e => { const b = e.target.closest('button'); if (b) wechsle(Z.markt, b.dataset.tf); });
  $('#zu-jetzt').addEventListener('click', () => chart.timeScale().scrollToRealTime());

  for (const r of ['funde', 'statistik', 'regeln']) $('#r-' + r).addEventListener('click', () => zeigeReiter(r));
  $('#f-muster').addEventListener('change', e => { Z.filter.muster = e.target.value; filterGeaendert(); });
  $('#f-markt').addEventListener('change', e => { Z.filter.markt = e.target.value; filterGeaendert(); });
  $('#f-ausgang').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { Z.filter.ausgang = b.dataset.ausgang; filterGeaendert(); } });

  $('#liste').addEventListener('click', e => {
    if (e.target.closest('#mehr')) { Z.gezeigt += SEITE; baueListe(); return; }
    const z = e.target.closest('.fund');
    if (z) waehleFund(z.dataset.id).then(zumChart);
  });
  $('#liste').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); blaettere(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); blaettere(-1); }
  });
  $('#detail').addEventListener('click', e => { const b = e.target.closest('[data-schritt]'); if (b) blaettere(+b.dataset.schritt); });
  $('#statistik').addEventListener('click', e => {
    const b = e.target.closest('[data-zeige]');
    if (!b) return;
    Z.filter.muster = b.dataset.zeige; Z.filter.ausgang = b.dataset.ausgang;
    filterGeaendert(); zeigeReiter('funde');
  });

  // eigenes Kürzel
  const dialog = $('#eigen-dialog');
  $('#eigen-auf').addEventListener('click', () => { $('#eigen-fehler').textContent = ''; $('#eigen-kuerzel').value = ''; dialog.showModal(); $('#eigen-kuerzel').focus(); });
  $('#eigen-abbruch').addEventListener('click', () => dialog.close());
  $('#eigen-form').addEventListener('submit', async e => {
    e.preventDefault();
    const kuerzel = $('#eigen-kuerzel').value.trim();
    if (!kuerzel) { $('#eigen-fehler').textContent = 'Bitte ein Kürzel eintippen.'; return; }
    const ok = $('#eigen-ok');
    ok.disabled = true; $('#eigen-fehler').textContent = '';
    try {
      const art = dialog.querySelector('input[name="art"]:checked').value;
      const markt = await api('/api/kuerzel', {art, kuerzel, tf: Z.tf});
      if (!Z.marktNach.has(markt.id)) {
        Z.maerkte.push(markt);
        merke('eigene', Z.maerkte.filter(m => m.eigen));
        baueWahl();
      }
      dialog.close();
      await wechsle(markt.id, Z.tf);
      ladeFunde(true);
    } catch (fehler) {
      $('#eigen-fehler').textContent = fehler.message;
    } finally {
      ok.disabled = false;
    }
  });
  $('#eigen-weg').addEventListener('click', () => {
    const weg = Z.markt;
    Z.maerkte = Z.maerkte.filter(m => m.id !== weg);
    merke('eigene', Z.maerkte.filter(m => m.eigen));
    Z.funde = Z.funde.filter(f => f.markt !== weg);
    Z.nachId = new Map(Z.funde.map(f => [f.id, f]));
    baueWahl();
    wechsle(Z.maerkte[0].id, Z.tf);
    ladeFunde(true);
  });

  setInterval(() => { if (Z.quelle && Z.quelle.art === 'aktie') zeigeStatus(); }, 30000);

  document.addEventListener('visibilitychange', aufgewacht);
  window.addEventListener('online', aufgewacht);
  window.addEventListener('pageshow', e => { if (e.persisted) aufgewacht(); });
}

async function los() {
  baueChart();
  chartMeldung('Musterlupe startet …');
  try {
    Z.start = await api('/api/start');
  } catch (e) {
    chartMeldung(e.message);
    return;
  }
  Z.musterName = Object.fromEntries(Z.start.muster.map(m => [m.key, m.name]));
  Z.zeitName = Object.fromEntries(Z.start.zeiten.map(z => [z.key, z.lang]));
  const eigene = lies('eigene', []).filter(m => m && m.id && !Z.start.maerkte.some(x => x.id === m.id));
  Z.maerkte = [...Z.start.maerkte, ...eigene.map(m => ({...m, eigen: true}))];
  $('#zeiten').innerHTML = Z.start.zeiten.map(z => `<button type="button" data-tf="${z.key}" title="Jede Kerze zeigt ${esc(z.lang)}">${esc(z.name)}</button>`).join('');
  $('#f-muster').innerHTML = '<option value="alle">Alle Muster</option>' + Z.start.muster.map(m => `<option value="${m.key}">${esc(m.name)}</option>`).join('');
  baueWahl();
  baueRegeln();
  verdrahte();
  zeigeReiter('funde');
  let markt = lies('markt', 'krypto:BTCUSDT');
  if (!Z.marktNach.has(markt)) markt = 'krypto:BTCUSDT';
  let tf = lies('tf', '5m');
  if (!Z.zeitName[tf]) tf = '5m';
  await wechsle(markt, tf);
}

// Zum Nachsehen in der Browser-Konsole: musterlupe.Z zeigt den aktuellen Stand.
window.musterlupe = {Z, get chart() { return chart; }, get kerzenSerie() { return kerzenSerie; }};

los();
})();
