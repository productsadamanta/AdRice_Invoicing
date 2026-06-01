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

    let rows = table.querySelectorAll('tbody tr');
    let offersToScan = [];

    rows.forEach(row => {
        let advCell = row.querySelector('td:nth-child(3)') || row.querySelector('td:nth-child(5)');
        let advName = advCell?.innerText.trim() || "";
        let offerId = row.querySelector('td:nth-child(1)')?.innerText.trim();
        let offerName = row.querySelector('td:nth-child(2)')?.innerText.trim();

        if (offerId && !isNaN(offerId) && targetAdvertisers.some(t => advName.includes(t))) {
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

    async function fetchOfferPayout(offer) {
        try {
            let response = await fetch(offer.targetUrl);
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
            console.error(`❌ Błąd przy ofercie ${offer.id}:`, e);
            return `${offer.id};${offer.name};0.00\n`;
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

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "adrice_offers_prices.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
})();
