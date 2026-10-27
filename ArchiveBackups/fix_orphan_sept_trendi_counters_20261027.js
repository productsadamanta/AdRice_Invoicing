// Wklej w konsoli (F12 -> Console) na otwartej karcie index.html, potem F5.
//
// Usuwa z miesiaca 2026-09 "osierocone" liczniki Trendi (PL/DE/LT/CZ/SK/LV), ktore zostaly po
// niezaksiegowanej fakturze "Google August" z 4.09.2026 (rejestrowanej omylkowo w 2026-09, cofnietej
// 7.09.2026 - undo skasowal logi, ale zostawil liczniki). W arkuszu "TrendiSupply Google Invoice"
// ta faktura nie istnieje (wrzesien = tylko Bonus May i Bonus July), a sierpniowe faktury Google
// (10-16.08 i 17-25.08) sa poprawnie w 2026-08. Skutek osieroconych licznikow: tryb AUTOMAT dla
// wrzesnia pokazywal falszywe -25 181 EUR rabatu dla Trendi.
//
// PRZED uruchomieniem: "Zapisz backup" w Hubie i ZAMKNIJ wszystkie inne karty Hub/Historia
// (stara karta moze nadpisac poprawke - patrz zdarzenie 'storage').
// Skrypt jest bezpieczny: odejmuje wartosc tylko gdy licznik == suma delt z logow + dokladnie
// oczekiwana wartosc osierocona; w przeciwnym razie pomija oferte i raportuje.
(function () {
    const MONTH = '2026-09';
    const ORPHANS = {"pl":{"24":39,"48":1,"69":6,"693":17,"1429":53,"1797":4,"1819":3,"1877":14,"2135":4,"2287":32,"2435":3,"2866":65,"3035":13,"3068":62,"3141":50,"3160":14,"3207":15,"3249":51,"3521":22,"4015":23,"4279":13,"4315":21},"de":{"23":31,"33":17,"1518":5,"1744":3,"1817":18,"2285":31,"2439":4,"2582":1,"2883":2,"2934":16,"3177":8,"3243":11,"3248":7,"3386":5,"3559":23,"3574":3,"4277":31,"4314":65},"lt":{"648":5,"752":13,"1427":70,"1878":43,"2414":12,"2583":12,"2884":27,"2974":1,"3050":6,"3126":4,"3178":25,"3189":15,"3376":12,"3560":4,"3575":6,"3578":14,"3646":26,"4108":32,"4111":9,"4276":23,"4278":7},"cz":{"1945":9,"2585":1,"2756":21,"2882":2,"3037":8,"3053":9,"3143":4,"3180":4,"3251":23,"3415":2,"3523":3,"3590":4,"3648":4,"4282":8},"sk":{"3589":3,"3641":3,"3700":2,"3702":15,"3844":9,"3849":5,"3857":3,"3964":10,"4042":3,"4067":1,"4109":18,"4148":7,"4281":3},"lv":{"3426":9,"3518":39,"3834":1,"3850":3,"3858":3,"4043":11,"4095":4,"4110":7}};
    const KEY = 'adrice_invoicing_db_v2';
    const db = JSON.parse(localStorage.getItem(KEY));
    if (!db || !db[MONTH]) { console.log('Brak miesiaca ' + MONTH + ' - przerwano.'); return; }
    const m = db[MONTH];
    let fixed = 0, skipped = [], removedLogs = 0, leads = 0;
    for (const cc of Object.keys(ORPHANS)) {
        const sumLogs = {};
        (m.logs || []).forEach(l => {
            if (String(l.type).toLowerCase() !== cc) return;
            (l.items || []).forEach(i => { sumLogs[i.id] = (sumLogs[i.id] || 0) + i.delta; });
        });
        for (const [id, orph] of Object.entries(ORPHANS[cc])) {
            const counter = (m[cc] || {})[id] || 0;
            if (counter - (sumLogs[id] || 0) === orph) {
                m[cc][id] = sumLogs[id] || 0;
                fixed++; leads += orph;
            } else {
                skipped.push(cc + '#' + id + ' licznik=' + counter + ' logi=' + (sumLogs[id] || 0) + ' oczekiwano nadwyzki ' + orph);
            }
        }
    }
    // Ewentualne resztki faktury "Google August" w logach/redo wrzesnia (w backupie z 26.10 ich nie ma)
    ['logs', 'redoLogs'].forEach(k => {
        if (!Array.isArray(m[k])) return;
        const before = m[k].length;
        m[k] = m[k].filter(l => !String(l.invoiceNumber).startsWith('Google'));
        removedLogs += before - m[k].length;
    });
    localStorage.setItem(KEY, JSON.stringify(db));
    console.log('Naprawiono ofert: ' + fixed + ' (odjeto ' + leads + ' leadow). Usunieto wpisow Google z logow/redo: ' + removedLogs);
    if (skipped.length) console.warn('POMINIETO (liczniki sie zmienily od backupu):\n' + skipped.join('\n'));
    console.log('Odswiez strone (F5).');
})();
