// Prüft die ganze Kette ohne Browser: echte Binance-Kurse laden, Muster suchen, Statistik rechnen.
// Start im Projektordner:  node tests/web_probe.mjs
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Muster = require('../kern/muster.js');
vm.runInThisContext(readFileSync(new URL('../kern/daten.js', import.meta.url), 'utf8'));
const {api} = globalThis.Daten;
const start = await api('/api/start');
console.log('Märkte:', start.maerkte.map(m => m.kuerzel).join(', '), '| Muster:', start.muster.length);
for (const tf of ['5m', '1d']) {
  const k = await api('/api/kerzen', {markt: 'krypto:BTCUSDT', tf});
  console.log(`BTC ${tf}: ${k.kerzen.length} Kerzen, fertig ${k.n_fertig}, letzter Kurs ${k.kerzen.at(-1)[4]}`);
  const t0 = Date.now();
  const f = await api('/api/funde', {tf, maerkte: start.maerkte.map(m => m.id).join(',')});
  const s = f.statistik.alle;
  console.log(`  Funde ${tf}: ${f.funde.length} in ${Date.now() - t0} ms, Fehler: ${f.fehler.length}`);
  for (const [key, v] of Object.entries(s)) console.log(`   ${key.padEnd(16)} ${String(v.funde).padStart(4)} Funde, ${String(v.abgeschlossen).padStart(4)} ausgewertet, Quote ${v.trefferquote}, nötig ${v.noetig}, zu wenig: ${v.zu_wenig}`);
}
const eigen = await api('/api/kuerzel', {art: 'krypto', kuerzel: 'doge', tf: '1d'});
console.log('Eigenes Kürzel doge →', eigen);
try { await api('/api/kuerzel', {art: 'krypto', kuerzel: 'GIBTESNICHTXYZ', tf: '1d'}); } catch (e) { console.log('Unbekanntes Kürzel →', e.message); }
