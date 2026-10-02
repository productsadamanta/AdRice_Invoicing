/**
 * AdRice Offers Scraper dla systemu Invoicing
 * Wklej ten kod do konsoli przeglądarki na stronie z listą ofert AdRice (np. /en/offers)
 * Pobierze wszystkie dostępne oferty i wygeneruje pobranie pliku CSV.
 */

(async () => {
    console.log("🚀 Start Scrapera Ofert AdRice (Invoicing)...");

    let table = document.querySelector('#table_offers') || document.querySelector('#offersTable') || document.querySelector('table.table');
    if (!table) {
        console.error("❌ Nie znaleziono tabeli ofert!");
        return;
    }

    const targetAdvertisers = ["TrendiSupply", "EuroFlex", "SmartMediaSolving"];
    // Dopasowanie ignoruje spacje/wielkość liter — AdRice potrafi po cichu zmienić nazwę advertisera
    // (np. "TrendiSupply" -> "Trendi Supply"), co przy dopasowaniu 1:1 wycinało całe konto z eksportu.
    const normalizeAdvName = s => (s || "").replace(/\s+/g, '').toLowerCase();

    let rows = table.querySelectorAll('tbody tr');
    let offersToScan = [];

    rows.forEach(row => {
        let advCell = row.querySelector('td:nth-child(3)') || row.querySelector('td:nth-child(5)');
        let advName = advCell?.innerText.trim() || "";
        let offerId = row.querySelector('td:nth-child(1)')?.innerText.trim();
        let offerName = row.querySelector('td:nth-child(2)')?.innerText.trim();

        if (offerId && !isNaN(offerId) && targetAdvertisers.some(t => normalizeAdvName(advName).includes(normalizeAdvName(t)))) {
            offersToScan.push({ id: offerId, name: offerName, targetUrl: `/en/offers/${offerId}/edit` });
        }
    });

    if (offersToScan.length === 0) {
        console.error("❌ Nie znaleziono żadnych ofert w tabeli.");
        return;
    }

    console.log(`🔍 Znaleziono ${offersToScan.length} ofert. Rozpoczynam pobieranie i sumowanie stawek (Payout, Adv Fee, Native Fee)...`);

    let csvContent = "Offer_ID;Offer_Name;Payout\n";
    let processed = 0;

    async function fetchOfferPayout(offer, retries = 3) {
        try {
            let response = await fetch(offer.targetUrl);
            if (!response.ok) throw new Error("HTTP " + response.status);
            let html = await response.text();

            // Zastosowanie ulepszonego parsera numerycznego na wzór skryptu generującego (krok8_tm_payout)
            let parseStr = (str) => {
                if (!str) return 0;
                let val = parseFloat(str.replace(',', '.').replace(/[^\d\.\-]/g, ''));
                return isNaN(val) ? 0 : val;
            };

            // Ekstrakcja wszystkich trzech składników z formularza na stronie
            let baseStr = (html.match(/id="offer_payout"[^>]*value="([^"]*)"/) || [null, "0"])[1];
            let basePayout = parseStr(baseStr);

            // Jeśli basePayout to 0 (bo może być CPA defaultowo), sprawdzamy CPA
            if (basePayout === 0) {
                let cpaStr = (html.match(/id="offer_cpa"[^>]*value="([^"]*)"/) || [null, "0"])[1];
                basePayout = parseStr(cpaStr);
            }

            let advStr = (html.match(/id="offer_advertiserFee"[^>]*value="([^"]*)"/) || [null, "0"])[1];
            let advFee = parseStr(advStr);

            let nativeStr = (html.match(/id="offer_nativeAdvFee"[^>]*value="([^"]*)"/) || [null, "0"])[1];
            let nativeFee = parseStr(nativeStr);

            // Zsumowanie zgodnie z życzeniem (Główne CPA na fakturę)
            let totalPayout = (basePayout + advFee + nativeFee).toFixed(2);

            // Zabezpieczenie przed twardymi spacjami (Enterami) i średnikami zawartymi w stringu HTML nazwy AdRice np. "Mainstream -"
            let safeName = (offer.name || "Brak Nazwy").replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();

            processed++;
            if (processed % 100 === 0 || processed === offersToScan.length) {
                console.log(`Pobrano i przetworzono już: ${processed} z ${offersToScan.length} ofert...`);
            }

            return `${offer.id};${safeName};${totalPayout}\n`;
        } catch (e) {
            if (retries > 0) {
                console.warn(`⏳ Serwer odrzuca ofertę ${offer.id} (${e.message}). Ponawiam za chwilę...`);
                await new Promise(r => setTimeout(r, 1500));
                return fetchOfferPayout(offer, retries - 1);
            }
            console.error(`❌ Całkowity błąd przy ofercie ${offer.id} (pomięto po 3 próbach):`, e);
            // Nazwa musi przejść przez to samo czyszczenie co ścieżka sukcesu — inaczej wbudowany
            // "\n" w nazwie oferty (np. dwuliniowa komórka "Nazwa\nMainstream -") łamie strukturę
            // CSV i psuje parsowanie kolejnych wierszy w pliku.
            let safeName = (offer.name || "Brak Nazwy").replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();
            return `${offer.id};${safeName};0.00\n`;
        }
    }

    const CHUNK_SIZE = 150; // Bardzo wysoka współbieżność (150 ofert naraz zamiast 50)
    let resultsAll = [];

    for (let i = 0; i < offersToScan.length; i += CHUNK_SIZE) {
        let chunk = offersToScan.slice(i, i + CHUNK_SIZE);
        let results = await Promise.all(chunk.map(offer => fetchOfferPayout(offer)));
        resultsAll.push(...results);
    }

    csvContent += resultsAll.join("");

    console.log("✅ GOTOWE! Generowanie pliku CSV...");

    const filename = "adrice_offers_prices.csv";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Trwały przycisk-awaryjny — gdyby okno zapisu zostało przypadkiem anulowane/zamknięte,
    // Blob URL nadal żyje w pamięci karty aż do odświeżenia strony, więc można pobrać ponownie stąd.
    document.querySelectorAll('#__scraperDownloadBtn').forEach(el => el.remove());
    const btn = document.createElement("a");
    btn.id = '__scraperDownloadBtn';
    btn.href = url;
    btn.download = filename;
    btn.textContent = `📥 Pobierz CSV ponownie (${resultsAll.length} ofert)`;
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;background:#1a7f37;color:#fff;padding:10px 16px;border-radius:6px;font:14px/1.4 sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    document.body.appendChild(btn);
    console.log("💾 Gdyby okno zapisu zniknęło/anulowało się — w prawym dolnym rogu strony jest przycisk 'Pobierz CSV ponownie' (działa dopóki nie odświeżysz strony).");
})();
