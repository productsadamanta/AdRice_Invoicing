// Wklej to w konsoli przeglądarki (F12 -> Console) na otwartej karcie index.html LUB history.html
// (obie czytają/zapisują ten sam klucz localStorage), a potem odśwież stronę (F5).
//
// Naprawia 16 korekt z lipca 2026 (PL/DE/LT/CZ/SK), które zostały skonsumowane przez faktury
// AUTOMAT "Google August" (sierpień 2026), a te faktury zostały później cofnięte (undo) PRZED
// poprawką błędu w history.html z 7.09.2026 — undo() cofał tylko liczniki leadów, nie dotykał
// pendingAdjustments, więc korekty zostały na zawsze oznaczone "used" przypisane do faktury,
// która już nie istnieje w historii. Ten skrypt jest jednorazową naprawą danych; sam błąd w
// kodzie jest już poprawiony (patrz undo()/redo()/restoreAdjustmentsStatus() w history.html).
(function () {
    const idsToRestore = [
        "adj_reconstructed_1787729361582_14", // LT +33
        "adj_reconstructed_1787729361582_15", // LT +124
        "adj_reconstructed_1787729361582_16", // LT +5
        "adj_reconstructed_1787729361582_17", // DE +77
        "adj_reconstructed_1787729361582_18", // DE -892
        "adj_reconstructed_1787729361582_21", // CZ +344
        "adj_reconstructed_1787729361582_22", // PL -40
        "adj_reconstructed_1787729361582_23", // CZ -47
        "adj_reconstructed_1787729361582_24", // SK -15
        "adj_reconstructed_1787729361582_25", // PL -2
        "adj_reconstructed_1787729361582_27", // DE -20
        "adj_reconstructed_1787729361582_28", // LT -53
        "adj_reconstructed_1787729361582_29", // CZ -41
        "adj_reconstructed_1787729361582_30", // SK -22.5
        "adj_1787729945728",                  // PL -69
        "adj_1787729972358"                   // DE +20
    ];

    const current = JSON.parse(localStorage.getItem('adrice_pending_adjustments')) || [];
    let restored = 0;
    const byAcc = {};
    current.forEach(a => {
        if (idsToRestore.includes(a.id) && a.status === 'used') {
            byAcc[a.account] = (byAcc[a.account] || 0) + a.amount;
            delete a.usedByInvoice;
            a.status = 'pending';
            restored++;
        }
    });

    if (restored === 0) {
        console.log('Nic do przywrócenia — żaden z 16 wpisów nie ma już statusu "used" (być może już naprawione wcześniej).');
        return;
    }

    localStorage.setItem('adrice_pending_adjustments', JSON.stringify(current));
    console.log(`Przywrócono ${restored} z ${idsToRestore.length} korekt jako "pending".`);
    console.log('Sumy przywrócone per konto:', byAcc);
    console.log('Odśwież stronę (F5), żeby zobaczyć zaktualizowane saldo w panelu bocznym.');
})();
