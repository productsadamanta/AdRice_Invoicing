// Wklej w konsoli (F12 -> Console) na JEDNEJ otwartej karcie index.html (inne karty Hub/Historia zamknij), potem F5.
//
// Usuwa z "cofnietych faktur" (redoLogs) miesiaca 2026-08 jeden martwy wpis: "Google August" HU
// z 7.09.2026 16:50:04 (316 leadow, 5 375 EUR). Faktura zostala cofnieta (undo) i nie ma jej w
// liczniku HU (sierpien = tylko INV-225, 91 leadow). Gdyby ktos kiedys kliknal "Przywroc"
// (redo) w Historii, wpis dodalby te leady do sierpnia na nowo - tak samo jak wrzesniowe wpisy
// Trendi, ktore potem zostawily osierocone liczniki. Skrypt nie rusza licznikow ani logow faktur.
(function () {
    const KEY = 'adrice_invoicing_db_v2';
    const db = JSON.parse(localStorage.getItem(KEY));
    const m = db && db['2026-08'];
    if (!m || !Array.isArray(m.redoLogs)) { console.log('Brak redoLogs w 2026-08 - nic do zrobienia.'); return; }
    const before = m.redoLogs.length;
    m.redoLogs = m.redoLogs.filter(l => !(
        l.invoiceNumber === 'Google August' &&
        String(l.type).toUpperCase() === 'HU' &&
        l.timestamp === '7.09.2026, 16:50:04'
    ));
    const removed = before - m.redoLogs.length;
    if (removed === 0) { console.log('Nie znaleziono wpisu (moze juz usuniety) - nic nie zmieniono.'); return; }
    localStorage.setItem(KEY, JSON.stringify(db));
    console.log('Usunieto wpisow: ' + removed + '. Pozostalo w redoLogs 2026-08: ' + m.redoLogs.length + '. Odswiez strone (F5).');
})();
