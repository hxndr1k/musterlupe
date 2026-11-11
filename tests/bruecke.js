// Brücke für die Python-Tests: liest einen Auftrag als JSON von stdin, ruft den JS-Kern auf, schreibt JSON.
// {"fn": "finde_muster", "kerzen": [...], "n_fertig": null, "markt": "", "tf": ""}
// {"fn": "statistik", "funde": [...]}
// {"fn": "runde", "werte": [...], "stellen": 3}
// {"fn": "texte"}
'use strict';
const M = require('../kern/muster.js');
let roh = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { roh += d; });
process.stdin.on('end', () => {
  const auftraege = JSON.parse(roh);
  const antworten = auftraege.map(a => {
    if (a.fn === 'finde_muster') return M.findeMuster(a.kerzen, a.n_fertig, a.markt || '', a.tf || '');
    if (a.fn === 'statistik') return M.statistik(a.funde);
    if (a.fn === 'runde') return a.werte.map(w => M.pyRound(w, a.stellen));
    if (a.fn === 'texte') return {muster: M.MUSTER, allgemein: M.ALLGEMEIN, gruende: M.GRUND_TEXT,
                                  min_beispiele: M.MIN_BEISPIELE, warte_kerzen: M.WARTE_KERZEN};
    throw new Error('unbekannt: ' + a.fn);
  });
  process.stdout.write(JSON.stringify(antworten));
});
