/* Kursabruf direkt aus dem Browser, ohne Schlüssel und ohne Konto.
   Ersetzt den Python-Server der alten App (server.py + kern/daten.py).
   Krypto: öffentliche Binance-Schnittstelle (erlaubt Abrufe aus dem Browser, CORS offen).
   Es werden nur Kurse gelesen. Nichts wird gekauft, verkauft oder angemeldet. */
(function (wurzel) {
'use strict';
const M = wurzel.Muster;

const BINANCE = ['https://api.binance.com', 'https://data-api.binance.vision'];
const KRYPTO_SEITEN = 4;            // 4 x 1000 Kerzen Historie je Krypto-Markt
const HALTBAR_MS = 5000;

const ZEITEN = {
  '5m': {name: '5 Min', lang: '5 Minuten', sek: 300},
  '15m': {name: '15 Min', lang: '15 Minuten', sek: 900},
  '1h': {name: '1 Std', lang: '1 Stunde', sek: 3600},
  '1d': {name: '1 Tag', lang: '1 Tag', sek: 86400},
};

const MAERKTE = [
  {id: 'krypto:BTCUSDT', name: 'Bitcoin', kuerzel: 'BTC/USDT', art: 'krypto'},
  {id: 'krypto:ETHUSDT', name: 'Ethereum', kuerzel: 'ETH/USDT', art: 'krypto'},
  {id: 'krypto:SOLUSDT', name: 'Solana', kuerzel: 'SOL/USDT', art: 'krypto'},
];

class DatenFehler extends Error {}

function marktPruefen(marktId) {
  const [art, ...rest] = String(marktId || '').split(':');
  const kuerzel = rest.join(':').toUpperCase();
  if (art === 'krypto' && /^[A-Z0-9]{5,20}$/.test(kuerzel)) return [art, kuerzel];
  if (art === 'aktie') throw new DatenFehler('Aktien gibt es in der Web-Version noch nicht. Bitte ein Krypto-Kürzel wie BTC oder DOGE.');
  throw new DatenFehler('Dieses Kürzel verstehe ich nicht. Beispiele: BTC, DOGE, PEPE.');
}

function kuerzelZuId(eingabe) {
  let roh = String(eingabe || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (roh && !['USDT', 'USDC', 'EUR', 'BTC'].some(e => roh.endsWith(e))) roh += 'USDT';
  return 'krypto:' + roh;
}

async function holeJson(url) {
  const ab = new AbortController();
  const uhr = setTimeout(() => ab.abort(), 15000);
  try {
    const antwort = await fetch(url, {signal: ab.signal, cache: 'no-store'});
    if (!antwort.ok) { const e = new Error('HTTP ' + antwort.status); e.code = antwort.status; throw e; }
    return await antwort.json();
  } finally { clearTimeout(uhr); }
}

async function mitAusweich(pfad) {
  let letzter = null;
  for (const host of BINANCE) {
    try { return await holeJson(host + pfad); }
    catch (e) {
      if (e.code === 400 || e.code === 404) throw e;   // Kürzel unbekannt: anderer Host hilft nicht
      letzter = e;
    }
  }
  throw letzter || new DatenFehler('Keine Verbindung.');
}

async function binanceKerzen(symbol, intervall, {start = null, ende = null} = {}) {
  const q = new URLSearchParams({symbol, interval: intervall, limit: '1000'});
  if (start !== null) q.set('startTime', String(Math.trunc(start)));
  if (ende !== null) q.set('endTime', String(Math.trunc(ende)));
  let roh;
  try { roh = await mitAusweich('/api/v3/klines?' + q); }
  catch (e) {
    if (e.code === 400) throw new DatenFehler(`Binance kennt das Kürzel ${symbol} nicht.`);
    if (e.code) throw new DatenFehler(`Binance antwortet gerade nicht (Fehler ${e.code}).`);
    throw new DatenFehler('Keine Verbindung zu Binance. Prüfe deine Internetverbindung.');
  }
  return roh.map(k => ({t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], _zu: k[6]}));
}

function mischen(alt, neu) {
  const nachZeit = new Map(alt.map(k => [k.t, k]));
  for (const k of neu) nachZeit.set(k.t, k);
  return [...nachZeit.keys()].sort((a, b) => a - b).map(t => nachZeit.get(t));
}

async function ladeKrypto(symbol, tf, alt) {
  let kerzen;
  if (alt) {
    kerzen = mischen(alt, await binanceKerzen(symbol, tf, {start: alt[alt.length - 1].t * 1000}));
  } else {
    kerzen = await binanceKerzen(symbol, tf);
    for (let i = 0; i < KRYPTO_SEITEN - 1; i++) {
      if (kerzen.length < 1000) break;
      const mehr = await binanceKerzen(symbol, tf, {ende: kerzen[0].t * 1000 - 1});
      if (!mehr.length) break;
      kerzen = mischen(mehr, kerzen);
    }
  }
  if (!kerzen.length) throw new DatenFehler(`Binance liefert für ${symbol} keine Kerzen.`);
  const jetzt = Date.now();
  let nFertig = kerzen.length;
  while (nFertig > 0 && kerzen[nFertig - 1]._zu >= jetzt) nFertig--;
  const quelle = {name: 'Binance', art: 'krypto', live: true,
                  text: 'Live von Binance. Die letzte Kerze läuft in Echtzeit weiter, rund um die Uhr.'};
  return {kerzen, nFertig, quelle};
}

// ------------------------------------------------------------------ Cache
const cache = new Map();
const laufend = new Map();

async function holeKerzen(marktId, tf) {
  if (!ZEITEN[tf]) throw new DatenFehler('Diesen Zeitabschnitt gibt es nicht.');
  const [art, symbol] = marktPruefen(marktId);
  const schluessel = `${art}:${symbol}|${tf}`;
  if (laufend.has(schluessel)) return laufend.get(schluessel);   // nie zweimal gleichzeitig laden
  const arbeit = (async () => {
    let eintrag = cache.get(schluessel);
    const jetzt = Date.now();
    if (eintrag && jetzt - eintrag.geladen < HALTBAR_MS) {
      const zu = eintrag.kerzen[eintrag.kerzen.length - 1]._zu;
      if (!(zu != null && zu < jetzt)) return eintrag;           // seit dem Laden keine Kerze fertig geworden
    }
    // Nach langer Pause (Tablet lag zwei Tage herum) alles frisch holen, damit keine Lücke bleibt.
    const frisch = !eintrag || jetzt - eintrag.geladen > 2 * 86400 * 1000;
    try {
      const {kerzen, nFertig, quelle} = await ladeKrypto(symbol, tf, frisch ? null : eintrag.kerzen);
      eintrag = {markt: `${art}:${symbol}`, tf, kerzen, n_fertig: nFertig, quelle, name: null, geladen: jetzt, veraltet: false};
      cache.set(schluessel, eintrag);
      return eintrag;
    } catch (e) {
      if (eintrag && e instanceof DatenFehler) return {...eintrag, veraltet: true};   // lieber alte Kurse als gar nichts
      throw e;
    }
  })();
  laufend.set(schluessel, arbeit);
  try { return await arbeit; } finally { laufend.delete(schluessel); }
}

const fundeCache = new Map();
async function fundeFuer(marktId, tf) {
  const e = await holeKerzen(marktId, tf);
  const n = e.n_fertig;
  const marke = `${n}|${n ? e.kerzen[n - 1].t : 0}|${e.kerzen.length ? e.kerzen[0].t : 0}`;
  const schluessel = `${e.markt}|${tf}`;
  const alt = fundeCache.get(schluessel);
  if (alt && alt.marke === marke) return alt.funde;
  const funde = M.findeMuster(e.kerzen, n, e.markt, tf);
  fundeCache.set(schluessel, {marke, funde});
  return funde;
}

// ------------------------------------------- dieselben Antworten wie /api/...
const WEGE = {
  '/api/start': async () => ({
    maerkte: MAERKTE,
    zeiten: Object.entries(ZEITEN).map(([key, z]) => ({key, name: z.name, lang: z.lang, sek: z.sek})),
    muster: M.MUSTER, allgemein: M.ALLGEMEIN, gruende: M.GRUND_TEXT,
    min_beispiele: M.MIN_BEISPIELE, warte_kerzen: M.WARTE_KERZEN,
  }),
  '/api/kerzen': async q => {
    const e = await holeKerzen(q.markt, q.tf);
    return {markt: e.markt, tf: e.tf, name: e.name,
            kerzen: e.kerzen.map(k => [k.t, k.o, k.h, k.l, k.c, k.v]),
            n_fertig: e.n_fertig, quelle: e.quelle, veraltet: e.veraltet};
  },
  '/api/kuerzel': async q => {
    if (q.art !== 'krypto') throw new DatenFehler('Aktien gibt es in der Web-Version noch nicht.');
    const id = kuerzelZuId(q.kuerzel);
    const [, symbol] = marktPruefen(id);
    const e = await holeKerzen(id, q.tf || '1d');
    let kuerzel = symbol, name = symbol;
    for (const ende of ['USDT', 'USDC', 'EUR', 'BTC']) {
      if (symbol.endsWith(ende) && symbol.length > ende.length) {
        kuerzel = `${symbol.slice(0, -ende.length)}/${ende}`; name = symbol.slice(0, -ende.length); break;
      }
    }
    return {id: e.markt, name, kuerzel, art: 'krypto', eigen: true};
  },
  '/api/funde': async q => {
    const tf = q.tf || '';
    if (!ZEITEN[tf]) throw new DatenFehler('Diesen Zeitabschnitt gibt es nicht.');
    let ids = String(q.maerkte || '').split(',').filter(Boolean).slice(0, 30);
    if (!ids.length) ids = MAERKTE.map(m => m.id);
    const ergebnisse = await Promise.all(ids.map(async id => {
      try { return [id, await fundeFuer(id, tf), null]; }
      catch (e) { return [id, [], e instanceof DatenFehler ? e.message : 'Unerwarteter Fehler: ' + e.message]; }
    }));
    const alle = [], fehler = [], statistik = {};
    for (const [id, funde, text] of ergebnisse) {
      if (text) { fehler.push({markt: id, text}); continue; }
      alle.push(...funde);
      statistik[id] = M.statistik(funde);
    }
    statistik.alle = M.statistik(alle);
    alle.sort((a, b) => b.t_ende - a.t_ende);
    return {tf, funde: alle, statistik, fehler};
  },
};

/** Gleiche Form wie der alte fetch auf den Python-Server, nur ohne Server. */
async function api(pfad, angaben = {}) {
  const weg = WEGE[pfad];
  if (!weg) throw new Error('Diese Adresse gibt es nicht.');
  try { return await weg(angaben); }
  catch (e) {
    if (e instanceof DatenFehler) throw e;
    throw new Error('Im Programm ist etwas schiefgegangen: ' + e.message);
  }
}

wurzel.Daten = {api, holeKerzen, ZEITEN, MAERKTE, DatenFehler};
})(typeof self !== 'undefined' ? self : this);
