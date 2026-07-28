/**
 * AdRice Offer History Scraper dla systemu Invoicing (Faza 4 — reconciliation.html)
 * Wklej ten kod do konsoli przeglądarki na stronie z listą ofert AdRice (np. /en/offers)
 *
 * Dla każdej oferty pobiera DWIE rzeczy:
 * 1. Pełną historię ZMIAN (endpoint /en/events/offer/{id}, ten sam co przycisk
 *    "Actions -> History" na stronie edycji) — wyciąga z opisów zmiany Payout / CPA /
 *    Advertiser Fee / Native Adv Fee wraz z DOKŁADNĄ datą i godziną. Ignoruje wpisy
 *    dotyczące wyłącznie "Custom POs" (indywidualne stawki dla konkretnych afiliantów) —
 *    to nie jest domyślna stawka stosowana do zwykłych leadów.
 * 2. BIEŻĄCE wartości ze strony edycji (/en/offers/{id}/edit, tak jak adrice_scraper.js) —
 *    potrzebne jako punkt odniesienia dla pól, które NIGDY się nie zmieniły (więc nigdy nie
 *    pojawią się w historii zmian) — bez tego takie pole byłoby błędnie liczone jako 0€.
 *
 * Wynikowy CSV (Offer_ID;Field;Old_Value;New_Value;Changed_At;Scraped_At) wgraj w narzędziu
 * reconciliation.html, Sekcja A, prawy dropzone "Dokładna historia cen".
 */

(async () => {
    console.log("🚀 Start Scrapera Historii Cen AdRice (Invoicing)...");

    let table = document.querySelector('#table_offers') || document.querySelector('#offersTable') || document.querySelector('table.table');
    if (!table) {
        console.error("❌ Nie znaleziono tabeli ofert! Uruchom ten skrypt na stronie /en/offers.");
        return;
    }

    const targetAdvertisers = ["TrendiSupply", "EuroFlex", "SmartMediaSolving"];

    let rows = table.querySelectorAll('tbody tr');
    let offersToScan = [];

    rows.forEach(row => {
        let advCell = row.querySelector('td:nth-child(3)') || row.querySelector('td:nth-child(5)');
        let advName = advCell?.innerText.trim() || "";
        let offerId = row.querySelector('td:nth-child(1)')?.innerText.trim();

        if (offerId && !isNaN(offerId) && targetAdvertisers.some(t => advName.includes(t))) {
            offersToScan.push({
                id: offerId,
                historyUrl: `/en/events/offer/${offerId}`,
                editUrl: `/en/offers/${offerId}/edit`
            });
        }
    });

    if (offersToScan.length === 0) {
        console.error("❌ Nie znaleziono żadnych ofert w tabeli.");
        return;
    }

    console.log(`🔍 Znaleziono ${offersToScan.length} ofert. Pobieram historię zmian + bieżące wartości dla każdej...`);

    // Rozpoznawane etykiety pól ("<Label> changed from €X to €Y") -> nazwa pola w CSV.
    const FIELD_MAP = [
        { label: 'Payout', field: 'payout' },
        { label: 'CPA', field: 'cpa' },
        { label: 'Advertiser [Ff]ee', field: 'advertiserFee' },
        { label: 'Native\\s*(?:Adv(?:ertising)?)?\\s*[Ff]ee', field: 'nativeAdvFee' },
    ];
    // Old_Value dopuszcza PUSTĄ wartość ([\d.,]*, nie +) — AdRice loguje też wprowadzenie opłaty
    // "od zera" (np. "Native fee changed from  to 1"), a taki wpis jest równie ważny jak zwykła
    // zmiana liczba->liczba: bez niego aplikacja zakłada błędnie, że opłata była taka sama "od
    // zawsze", zamiast od dokładnej daty jej faktycznego wprowadzenia.
    const GENERIC_CHANGE_RE = /([A-Za-z][A-Za-z\s]*?) changed from\s*€?\s*([\d.,]*)\s*to\s*€?\s*([\d.,]+)/gi;
    const COMPONENT_FIELDS = ['payout', 'cpa', 'advertiserFee', 'nativeAdvFee'];
    // Sentinel: "wartość znana z bieżącego scrapa, ale nie znamy żadnej wcześniejszej zmiany
    // dla tego pola" -> traktujemy jako obowiązującą od zawsze (aplikacja oznaczy to jako
    // pewność 'partial', a nie 'exact', bo to założenie, nie potwierdzona zmiana).
    const BASELINE_SENTINEL_DATE = '1970-01-01T00:00:00';

    function parseNum(str) {
        if (!str) return null;
        let v = parseFloat(String(str).replace(/\s+/g, '').replace(',', '.'));
        return isNaN(v) ? null : v;
    }
    function mapLabelToField(label) {
        const clean = label.trim();
        for (const { label: pattern, field } of FIELD_MAP) {
            if (new RegExp('^' + pattern + '$', 'i').test(clean)) return field;
        }
        return null;
    }

    let scrapedAtISO = new Date().toISOString();
    let csvRows = [];
    let unrecognizedLabels = new Set();
    let processed = 0;
    let offersWithNoHistory = 0;
    let offersWithFetchError = 0;
    let baselineRowsAdded = 0;

    async function fetchOffer(offer) {
        try {
            // ── 1. Historia zmian ──
            let historyResponse = await fetch(offer.historyUrl);
            let historyHtml = await historyResponse.text();
            let doc = new DOMParser().parseFromString(historyHtml, 'text/html');
            let historyRows = doc.querySelectorAll('#historyTable tbody tr');
            if (historyRows.length === 0) offersWithNoHistory++;

            let fieldsWithHistory = new Set();

            historyRows.forEach(tr => {
                let cells = tr.querySelectorAll('td');
                if (cells.length < 3) return;

                let dateRaw = cells[0].textContent.trim(); // "YYYY-MM-DD HH:MM:SS"
                let description = cells[2].textContent; // textContent = auto-dekodowanie encji HTML

                if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateRaw)) return;
                let changedAtISO = dateRaw.replace(' ', 'T');

                let match;
                GENERIC_CHANGE_RE.lastIndex = 0;
                while ((match = GENERIC_CHANGE_RE.exec(description)) !== null) {
                    let [, label, oldRaw, newRaw] = match;
                    let field = mapLabelToField(label);
                    if (!field) { unrecognizedLabels.add(label.trim()); continue; }
                    let oldVal = parseNum(oldRaw);
                    let newVal = parseNum(newRaw);
                    if (newVal === null) continue;

                    fieldsWithHistory.add(field);
                    csvRows.push(`${offer.id};${field};${oldVal !== null ? oldVal : ''};${newVal};${changedAtISO};${scrapedAtISO}`);
                }
            });

            // ── 2. Bieżące wartości (tylko dla pól BEZ żadnej historii zmian) ──
            let missingFields = COMPONENT_FIELDS.filter(f => !fieldsWithHistory.has(f));
            if (missingFields.length > 0) {
                let editResponse = await fetch(offer.editUrl);
                let editHtml = await editResponse.text();

                let basePayoutStr = (editHtml.match(/id="offer_payout"[^>]*value="([^"]*)"/) || [null, "0"])[1];
                let basePayout = parseNum(basePayoutStr) || 0;
                let cpaVal = 0;
                if (basePayout === 0) {
                    let cpaStr = (editHtml.match(/id="offer_cpa"[^>]*value="([^"]*)"/) || [null, "0"])[1];
                    cpaVal = parseNum(cpaStr) || 0;
                }
                let advStr = (editHtml.match(/id="offer_advertiserFee"[^>]*value="([^"]*)"/) || [null, "0"])[1];
                let advFee = parseNum(advStr) || 0;
                let nativeStr = (editHtml.match(/id="offer_nativeAdvFee"[^>]*value="([^"]*)"/) || [null, "0"])[1];
                let nativeFee = parseNum(nativeStr) || 0;

                let currentValues = { payout: basePayout, cpa: cpaVal, advertiserFee: advFee, nativeAdvFee: nativeFee };

                missingFields.forEach(field => {
                    // Pomijamy pola, które i tak są zerowe/nieużywane (np. cpa gdy oferta jest na payout) —
                    // nie ma sensu dodawać sztucznego wpisu "0 od zawsze".
                    if (!currentValues[field]) return;
                    csvRows.push(`${offer.id};${field};;${currentValues[field]};${BASELINE_SENTINEL_DATE};${scrapedAtISO}`);
                    baselineRowsAdded++;
                });
            }

            processed++;
            if (processed % 50 === 0 || processed === offersToScan.length) {
                console.log(`Przetworzono już: ${processed} z ${offersToScan.length} ofert (zebrano ${csvRows.length} wierszy)...`);
            }
        } catch (e) {
            offersWithFetchError++;
            console.error(`❌ Błąd przy ofercie ${offer.id}:`, e);
        }
    }

    const CHUNK_SIZE = 30; // Do 2 requestów na ofertę (historia + edit) — ostrożna współbieżność

    for (let i = 0; i < offersToScan.length; i += CHUNK_SIZE) {
        let chunk = offersToScan.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(offer => fetchOffer(offer)));
    }

    console.log(`✅ GOTOWE! Zebrano ${csvRows.length} wierszy (w tym ${baselineRowsAdded} wpisów bazowych "bez historii") z ${offersToScan.length} ofert.`);
    console.log(`   Oferty bez żadnej historii zmian: ${offersWithNoHistory}. Błędy pobierania: ${offersWithFetchError}.`);
    if (unrecognizedLabels.size > 0) {
        console.warn(`⚠️ Znaleziono NIEROZPOZNANE etykiety zmian (pominięte, nie trafiły do CSV) — jeśli to coś istotnego (np. inna nazwa pola opłaty), zgłoś to:`, [...unrecognizedLabels]);
    }

    let csvContent = "Offer_ID;Field;Old_Value;New_Value;Changed_At;Scraped_At\n" + csvRows.join("\n") + "\n";

    const stamp = scrapedAtISO.replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `adrice_offer_history_${stamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
})();
