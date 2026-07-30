# Log sesji: Narzędzie rekoncyliacji wartości leadów (reconciliation.html)

Data: 2026-07-28, ciągła kontynuacja przez kilka kolejnych dni (dopiski 2026-07-29 i później). Ten
plik to pełne podsumowanie sesji budowy i debugowania `reconciliation.html` + powiązanych zmian w
`index.html`/`history.html` — przeznaczony do wklejenia/odczytania na starcie NOWEGO czatu, żeby nie
tłumaczyć wszystkiego od zera.

**TL;DR stan na koniec ostatniej sesji:** cała logika rekoncyliacji (ceny z realnych faktur, granice
zmian z historii AdRice, wyłączenie ofert ze zmianą ceny z automatycznej sumy + ręczna korekta,
eksport korekt do Invoicing Hub z bezpiecznym zatwierdzaniem/usuwaniem per kraj, scalanie na
prawdziwej fakturze w jedną pozycję) jest **zaimplementowana, przetestowana na prawdziwych danych
użytkownika i działa poprawnie** — patrz sekcje 0.2–0.2.4 po szczegóły każdej poprawki. Następne
zadanie (patrz sekcja 9, punkt 0) to **wyłącznie upraszczanie WYGLĄDU**, nie logiki.

## 0. DOPISEK 2026-07-29 — PRAWDZIWA przyczyna rozbieżności "ręczna suma vs raport narzędzia" (był realny bug, POPRAWIONY)

Użytkownik ręcznie policzył wartość wszystkich leadów zafakturowanych w czerwcu (1 217 691,50 €),
narzędzie pokazywało 1 219 477,00 € — różnica 1 785,50 €.

**Pierwsza diagnoza w tej sesji (BŁĘDNA, patrz niżej) była:** "+1 785,50 € to legalne korekty salda,
narzędzie świadomie je dolicza, to nie bug". **To było niepoprawne.** Po głębszym śledztwie (na
prośbę użytkownika o sprawdzenie tego samego pytania w kontekście `index.html`/Hub-a) znaleziono
prawdziwą przyczynę: **PODWÓJNE LICZENIE tej samej kwoty**, potwierdzone co do grosza i co do
pozycji na realnym backupie (`ArchiveBackups/adrice_backup_20260728_1718.json`):

1. Gdy w `index.html` klika się "przenieś do salda" (funkcja tworząca `pendingAdjustments`,
   ~linia 2264), powstają JEDNOCZEŚNIE DWA zapisy tej samej korekty:
   - Log `invoiceNumber: "PRZENIESIENIE_DO_SALDA"`, `mode: "AUTOMAT (KOREKTA SALDA)"`, z pełnym
     rozbiciem per-lead (`items`), zapisany OD RAZU w `invoicingDB[ORYGINALNY_MIESIĄC].logs`
     (index.html:2280-2286).
   - Wpis w `pendingAdjustments` (`status: 'pending'`, `month: ORYGINALNY_MIESIĄC`), czekający na
     realne rozliczenie.
2. Gdy PÓŹNIEJ (w kolejnym miesiącu) generowana jest nowa faktura AUTOMAT, `confirmInvoice`
   konsumuje pasujące `pendingAdjustments` (`a.month < selectedMonth`) i dopisuje ICH KOPIĘ jako
   `log.adjustments[]` na TEJ nowej fakturze (index.html:2369-2372) — **te same kwoty i pozycje co
   w kroku 1**, tylko jako dodatkowa metadana na fakturze, która faktycznie "wypłaca" korektę.
3. Stary `computeActualForMonth()` w `reconciliation.html` liczył OBIE rzeczy: pełną sumę logów
   czerwca (co już zawierało krok 1 — `mk === targetMonth` liczy WSZYSTKIE logi czerwca, bez
   względu na tryb) ORAZ osobno skanował wszystkie miesiące w poszukiwaniu `log.adjustments`
   z `adj.month === '2026-06'` (krok 2) i DOLICZAŁ je ponownie.

**Dowód (identyczne kwoty/timestampy w obu miejscach dla czerwca 2026):**
| Konto | Transza (timestamp) | Kwota w "PRZENIESIENIE_DO_SALDA" (czerwiec) | Kwota w `adjustments[]` (lipiec) |
|---|---|---|---|
| HU | 8.07, 10:38:15 | 377,00 € | 377,00 € |
| HU | 15.07, 10:41:49 | 3231,00 € | 3231,00 € |
| HU | 21.07, 09:58:09 | 383,00 € | 383,00 € |
| PT | 8.07, 10:38:42 | −1772,50 € | −1772,50 € |
| PT | 15.07, 10:42:22 | 72,00 € | 72,00 € |
| PT | 21.07, 09:58:38 | 36,00 € | 36,00 € |
| ES | 8.07, 10:39:33 | −508,00 € | −508,00 € |
| ES | 15.07, 10:43:11 | −133,00 € | −133,00 € |
| ES | 21.07, 09:59:08 | 100,00 € | 100,00 € |

Netto: 3991,00 (HU) − 1664,50 (PT) − 541,00 (ES) = **+1 785,50 €** — dokładnie różnica, którą
zgłosił użytkownik. (Czwarta transza z 28.07 dla każdego konta jest wciąż `status: 'pending'`,
jeszcze nieskonsumowana — poprawnie nie pojawia się w żadnym `adjustments[]`.)

**Wniosek: 1 217 691,50 € (ręczna suma użytkownika) było PRAWIDŁOWE. Narzędzie miało bug.**

**Odpowiedź na pytanie "czy Hub (index.html/history.html) nie uwzględnia korekt z kolejnych
miesięcy":** NIE — Hub jest OK, nie wymaga poprawki. `history.html`'s "Wartość całkowita"
(`renderAll()`, liczy `logs.items` dla WŁAŚCIWEGO miesiąca) już poprawnie zawiera korektę, bo
"PRZENIESIENIE_DO_SALDA" fizycznie żyje w logach oryginalnego miesiąca. Sprawdzono też per-wierszową
wartość konkretnej faktury (`val` w pętli renderowania logów, history.html:438) — świadomie
NIE dodano tam `log.adjustments`, bo zrobienie tego rozjechałoby sumę wierszy z kartą podsumowania
miesiąca (który celowo pozostaje na bazie "atrybucji", nie "kasowej") — rozważone i odrzucone w tej
sesji, nie zmieniać bez nowego uzasadnienia.

**Naprawa (2026-07-29, `reconciliation.html`):** usunięto CAŁY blok w `computeActualForMonth()`
skanujący `log.adjustments` i doliczający `adj.amount` — money jest już w pełni policzone przez
zwykłą pętlę `log.items` dla logów fizycznie leżących w danym miesiącu. Przy okazji usunięto martwy
już mechanizm `adjustmentRows`/`ADJUSTMENT|` w `computeReconciliation`, `renderReport` (3-boxowy
podział "same leady / korekty / razem" cofnięty do jednego "Faktycznie Zafakturowano (razem)"),
tabelę "Korekty salda ujęte w tym miesiącu", i tag pewności `adjustment` w `confidenceTag()`.
Zweryfikowane na realnym backupie: czerwiec 2026 = **1 217 691,50 €** (dokładnie zgodne z ręczną
sumą użytkownika, `adjKeys: 0`). Zweryfikowane też, że `computeBoundaryGaps()` i
`computePriceChangesInMonth()` (panel "⚡ Oferty ze zmianą ceny", sekcja 0.1 niżej) są od tego
niezależne i nadal działają poprawnie.

**Nauka na przyszłość:** przy każdej zmianie w mechanizmie sald/korekt sprawdzać NAJPIERW czy dana
kwota nie żyje już gdzie indziej w bazie pod inną postacią (log `PRZENIESIENIE_DO_SALDA` vs
`log.adjustments[]`) — te dwa zawsze reprezentują TĘ SAMĄ transakcję w dwóch momentach jej
życia (zakolejkowanie / faktyczna wypłata), nigdy nie sumować obu naraz.

## 0.1 DOPISEK 2026-07-29 — panel "⚡ Oferty ze zmianą ceny" (przypomnienie, już zbudowany wcześniej)

Użytkownik ponownie poprosił o "krótką listę ofert, dla których nastąpiła zmiana wartości leada,
żeby można było manualnie sprawdzić różnice" — to już istnieje w Sekcji C (nad przyciskiem "Oblicz
Rozbieżności"), zbudowane w POPRZEDNIEJ turze tej samej sesji (`computePriceChangesInMonth()` +
`renderPriceChangesThisMonth()`). Zweryfikowano że nadal działa poprawnie po powyższej poprawce
(niezależny kod, nie dotyka `log.adjustments` w ogóle) — na realnym backupie dla czerwca 2026
zwraca 18 ofert ze zmianą ceny w trakcie miesiąca.

## 0.2 DOPISEK 2026-07-29 — #2285: automatyczne wieloseg­mentowe wyliczenie okazało się ISTOTNIE
błędne (811€ zamiast 97€) → uproszczenie + eksport ręcznych korekt do Invoicing Hub

Po ręcznym sprawdzeniu użytkownika: narzędzie wyliczyło dla #2285 (DE, czerwiec) 811€ do dopłaty na
bazie 3 realnie zafakturowanych poziomów cen (23€→22€→20€), ale **oficjalna historia zmian payoutu
na ofercie w AdRice pokazuje TYLKO JEDNĄ zmianę** (23€→20€, 5.06.2026). Pośredni poziom 22€ w
fakturach to najpewniej efekt chwilowej, niezalogowanej w historii payoutu fluktuacji
advertiser/native fee, złapanej przez cotygodniowy scraper. Poprawna dopłata: **519 leadów×23€ +
5087×20€ = 113 677€** vs zafakturowane 113 580€ → **97€**, nie 811€. To DRUGI (po sekcji 4) dowód,
że automatyczne rozbijanie leadów na segmenty cenowe dla ofert ze zmianą ceny w miesiącu jest
z natury zawodne — tym razem nie problem rekonstrukcji z komponentów, tylko fakt że sam **zestaw
realnie zafakturowanych cen** może zawierać fantomowy poziom niepochodzący z żadnej trwałej,
zamierzonej zmiany.

**Decyzja (ustalona z użytkownikiem, plan zapisany i zatwierdzony przed implementacją —
`C:\Users\produ\.claude\plans\hashed-mapping-teacup.md`):**
1. `computeShouldBeForMonth()` — oferty z JAKĄKOLWIEK zmianą ceny w danym miesiącu (wykryte przez
   już istniejące `computePriceChangesInMonth()`) dostają `value: null`, `confidence:
   'manual-review'` — CAŁKOWICIE wyłączone z automatycznego wyliczenia (żadnego zgadywania).
2. `computeReconciliation()`/`renderReport()` — nowa flaga `DO_SPRAWDZENIA`: wiersz pokazuje "—"
   zamiast liczby w Powinno Być/Delcie, zawsze sortowany na górę tabeli, wykluczony z sum i z
   liczników Niedofakturowano/Nadfakturowano. Banner ostrzeżeń dostał nową linijkę z licznikiem.
3. Panel "⚡ Oferty ze zmianą ceny" (Sekcja C) stał się MIEJSCEM AKCJI, nie tylko podglądem:
   - Nowa diagnostyka: `getPayoutOnlyHistoryDatesInMonth(offerId, month)` — liczba zmian POLA
     `payout` w oficjalnej historii AdRice, pokazana OBOK liczby realnych przejść cenowych w
     fakturach. Rozjazd między nimi (dokładnie sygnał z #2285) oznaczony `⚠️ niezgodność`.
   - Inline formularz per oferta: kwota korekty (€) + notatka → `saveReconciliationAdjustment()`
     zapisuje do NOWEGO klucza localStorage `adrice_reconciliation_adjustments` (staging,
     `status: 'pending_import'`) — reconciliation.html CELOWO nie pisze bezpośrednio do salda
     Hub-a (`adrice_pending_adjustments`), zachowując zasadę "tylko do odczytu względem Hub-a"
     w jak największym stopniu — dodaje tylko ten jeden, świadomy krok zapisu do WŁASNEGO klucza.
4. **`index.html`** dostał nowy panel "🧾 Oczekujące korekty z Rekoncyliacji" (obok istniejącego
   "Oczekujące Salda") — `renderReconciliationPending()`, `approveReconciliationAdjustment(id)` /
   `rejectReconciliationAdjustment(id)`. Dopiero RĘCZNE zatwierdzenie tutaj kopiuje wpis do
   prawdziwego `pendingAdjustments` (z jawnym `source: 'reconciliation'`), skąd automatycznie
   dolicza się do kolejnej faktury tego konta — dokładnie tym samym mechanizmem konsumpcji co
   zwykłe cotygodniowe korekty salda (`confirmInvoice()` w index.html, bez zmian).
5. Etykieta na fakturze/w podglądzie/w historii: "Rekoncyliacja / Dopłata|Rabat za: X" zamiast
   "Korekta / ..." gdy `adj.source === 'reconciliation'` — 3 miejsca: podgląd faktury przed
   zatwierdzeniem i TSV-eksport do schowka (index.html, **to drugie to dosłownie tekst trafiający
   na prawdziwą fakturę do klienta**) oraz `viewDetails()` w history.html.

**Ważny bug złapany PODCZAS testowania end-to-end w przeglądarce (nie przez samo czytanie kodu):**
staging w `reconciliation.html` zapisuje pole `country`, ale pierwsza wersja `index.html` czytała
`entry.account` (literówka nazwy pola) — `renderReconciliationPending()` rzucał
`TypeError: Cannot read properties of undefined`. Znalezione i naprawione dopiero przy realnym
uruchomieniu w przeglądarce (3 miejsca: linia listy, dialog potwierdzenia, notyfikacja) — **nauka:
zawsze testować end-to-end w przeglądarce dla zmian rozpiętych na dwa pliki, nie ufać samej
składniowej poprawności (`node -e "new Function(...)"`) jako dowodowi poprawności.**

**Zweryfikowane w tej sesji (Node vm na realnym backupie + pełny przepływ w przeglądarce):**
- `computePriceChangesInMonth('2026-06')` na realnym backupie: #2285 ma 2 wykryte przejścia
  (23→22 i 22→20), oba confidence `approx` (brak dokładnej daty AdRice dla ŻADNEGO z nich —
  spójne z twierdzeniem użytkownika, że historia AdRice nie loguje tej zmiany wcale).
- `computeShouldBeForMonth('2026-06')` z syntetycznym leadem dla #2285/DE: `value: null,
  confidence: ['manual-review']` — a stabilna cenowo oferta #24/PL liczy się normalnie
  (`value: 19, confidence: ['exact']`).
- `computeReconciliation('2026-06')`: `#2285` → `flag: 'DO_SPRAWDZENIA'`, `shouldBeValue: null`,
  `delta: null`, `actualValue: 113580` (poprawnie).
- Pełny przepływ w przeglądarce (syntetyczne dane 519@23€+300@22€+4787@20€ dla #2285/DE): wiersz
  raportu pokazuje "—", panel ma formularz, zgłoszenie 97€ trafia do stagingu, `index.html`
  (osobna nawigacja, to samo `file://` katalogu — localStorage POTWIERDZONE współdzielone między
  plikami) pokazuje je w nowym panelu, zatwierdzenie kopiuje je do `pendingAdjustments` z
  `source: 'reconciliation'`, `getAdjustmentsInfo()` nie wywala `NaN` (dzięki jawnemu `delta: 0` na
  pozycji), etykieta poprawnie mówi "Rekoncyliacja", `rejectReconciliationAdjustment` też
  zweryfikowany (status → `rejected`, nic nie trafia do salda).

### 0.2.1 DOPISEK (ta sama sesja, bezpośrednio po powyższym) — 3 poprawki po pierwszym użyciu

Użytkownik przetestował mechanizm z 0.2 i dał feedback, doprecyzowany przez jedno pytanie
kontrolne (potwierdzone: "Tak, dokładnie to"):

1. **Panel w `index.html` ma pokazywać SUMĘ per KRAJ, nie listę per oferta** — rozbicie na oferty
   (potrzebne do audytu w archiwum backupu/git) i tak trafia do `items[0].title` każdego
   pojedynczego wpisu w `pendingAdjustments` niezależnie od tego jak zagregowany jest widok.
   Zaimplementowane: `renderReconciliationPending()` grupuje staging po `country`, pokazuje sumę +
   rozwijalne szczegóły per oferta; nowe `approveReconciliationCountry(country)` /
   `rejectReconciliationCountry(country)` zatwierdzają/odrzucają WSZYSTKIE zgłoszenia danego kraju
   naraz (każde jako osobny wpis w `pendingAdjustments`, z zachowanym `month`/`offerId`/notatką —
   wyodrębniona `pushReconciliationEntryToLedger(entry)` używana zarówno przez bulk jak i
   pojedynczy `approveReconciliationAdjustment(id)`, który został per-oferta w rozwijanych
   szczegółach dla wygody). Zweryfikowane w przeglądarce: 2 wpisy DE (97€, −50€) agregują się do
   +47€, bulk-approve poprawnie tworzy 2 osobne wpisy w `pendingAdjustments` (oba `source:
   'reconciliation'`, oba ze swoim offerId w tytule), 3. wpis (PL) zostaje nietknięty; sidebar
   "Oczekujące Salda" poprawnie pokazuje zagregowane 47,00 € dla DE.
2. **Rozbieżności NIEDOFAKTUROWANO/NADFAKTUROWANO wynikające WYŁĄCZNIE z różnicy w LICZBIE leadów
   (Administration vs Hub) przy STABILNEJ cenie przez cały miesiąc nie są tu potrzebne** —
   użytkownik i tak robi to co tydzień w trybie AUTOMAT (naturalnie się domyka). Matematyczny
   dowód: dla oferty ze stałą ceną P przez cały miesiąc, `delta = P × (shouldBeLeads −
   actualLeads)` ZAWSZE (bo i ShouldBe, i Actual, są tą samą stałą ceną razy odpowiednia liczba
   leadów) — więc każda taka rozbieżność JEST z definicji różnicą ilościową. Zaimplementowane w
   `computeReconciliation()`: flaguj NIEDO/NADFAKTUROWANO TYLKO gdy `shouldBeLeads === actualLeads`
   mimo to niezerowa delta (rzadki edge case nie do wytłumaczenia różnicą ilościową, np. zmiana
   ceny dokładnie na granicy miesiąca) — w przeciwnym razie ZGODNE. Liczby (shouldBeValue/delta)
   nadal pokazywane w tabeli bez zmian, zmienia się TYLKO flaga/klasyfikacja. Zweryfikowane: oferta
   z 1 lead w Administration vs 1412 w Hub (celowo skrajny synthetic case) → `flag: 'ZGODNE'` mimo
   delty −26809 (bo to czysto ilościowe, nie cenowe).
3. **Ukrywanie automatycznej wartości jako "—" dla ofert DO_SPRAWDZENIA było błędem** — użytkownik
   chce ją WIDZIEĆ (choć oznaczoną jako niepewną), żeby mieć punkt odniesienia do porównania z
   własnym ręcznym przeliczeniem ("ile zostało policzone, a ja sobie sprawdzę manualnie"). Cofnięte:
   `computeShouldBeForMonth()` znów liczy realną wartość przez `priceAt()` dla ofert ze zmianą ceny
   (nie zeruje `value`), tylko taguje `confidence: 'manual-review'`. `computeReconciliation()`
   flaguje `DO_SPRAWDZENIA` po `confidence.has('manual-review')`, nie po `value === null`. W
   tabeli/drilldownie liczba jest POKAZANA, wyszarzona, z gwiazdką `*` i tooltipem, ale — **ważne**
   — WYKLUCZONA z sum `totalShouldBe`/`totalActual`/`totalDelta` w `renderReport()` (obie strony
   sumy, nie tylko ShouldBe — inaczej "Różnica netto" myląco mieszałaby zaufaną resztę raportu z
   Zafakturowano ofert DO_SPRAWDZENIA bez odpowiadającego im Powinno Być, dając fałszywie ogromną
   różnicę — dokładnie to, co użytkownik pokazał w swoim przykładzie: "Różnica netto -166171,00 €"
   przy tylko 8 realnych NIEDO/NADFAKTUROWANO pozycjach). To samo wykluczenie dodane do
   `renderCountrySummary()` (podsumowanie "do dopłaty/rabatu" per kraj). Zweryfikowane na realnym
   backupie: `computeReconciliation('2026-06')` dla #2285 → `shouldBeValue: 20` (realna wyliczona
   wartość dla syntetycznego 1 leada, NIE null), `flag: 'DO_SPRAWDZENIA'`, `needsManualReview: true`.

### 0.2.2 DOPISEK (ta sama sesja) — korekty z Rekoncyliacji nie liczyły się do ŻADNEGO miesiąca

Użytkownik zatwierdził 12 korekt z rekoncyliacji (DE/ES/HU/LT/LV/PT, wszystkie poprawnie otagowane
`month: '2026-06'` — obawa że zapisało się jako lipiec okazała się bezpodstawna, `entry.month`
jest ustalane w `reconciliation.html` w momencie zgłoszenia, nie w `index.html` przy zatwierdzeniu).
Ale dopytał: czy ta wartość policzy się do sumy firmy ZA CZERWIEC? Odpowiedź w momencie pytania:
**NIE, nigdzie** — ani w czerwcu, ani (po faktycznej konsumpcji na przyszłej fakturze) w lipcu.

**Przyczyna:** stary, cotygodniowy mechanizm "przenieś do salda" (index.html, przycisk przy
generowaniu faktury) robi DWIE rzeczy naraz: (1) dopisuje do `pendingAdjustments`, (2) OD RAZU
tworzy log `PRZENIESIENIE_DO_SALDA` w `invoicingDB[WŁAŚCIWY_MIESIĄC].logs` — dzięki temu ten
miesiąc od razu "widzi" tę wartość w swojej sumie (i to jest właśnie ten mechanizm, którego
podwójne liczenie naprawiliśmy w sekcji 0, 2026-07-29 rano). Nowy mechanizm "Rekoncyliacja"
(`pushReconciliationEntryToLedger`, index.html) robił TYLKO krok (1) — nigdy nie tworzył
odpowiednika (2). Efekt: wartość korekty żyła WYŁĄCZNIE w `pendingAdjustments` aż do faktycznej
konsumpcji na przyszłej fakturze, a tam trafiała tylko jako `log.adjustments` TEJ faktury (czyli
lipcowej/sierpniowej) — a `computeActualForMonth()`/`history.html`'s "Wartość całkowita" świadomie
NIE doliczają `log.adjustments` do sum miesięcznych (patrz naprawa w sekcji 0) — więc wartość była
"niewidzialna" w KAŻDYM miesięcznym podsumowaniu, w obu narzędziach, na zawsze.

**Naprawa:** `pushReconciliationEntryToLedger()` w `index.html` robi teraz to samo co stary
mechanizm — obok pchania do `pendingAdjustments`, OD RAZU dopisuje log do
`invoicingDB[entry.month].logs`:
```js
invoicingDB[entry.month].logs.push({
    timestamp: new Date().toLocaleString('pl-PL'),
    invoiceNumber: 'REKONCYLIACJA_DO_SALDA',      // odpowiednik PRZENIESIENIE_DO_SALDA
    type: entry.country.toUpperCase(),
    mode: 'REKONCYLIACJA (KOREKTA)',                // celowo odróżnialne od AUTOMAT (KOREKTA SALDA)
    items: [{ id: entry.offerId, title: '...', delta: 1, price: entry.amount }]  // delta:1 × price:kwota = kwota
});
saveInvoicingDB();
```
`delta: 1, price: entry.amount` (zamiast realnych par delta/cena, których nie mamy przy ręcznej
korekcie lump-sum) — tak żeby `item.delta * item.price` dało dokładnie kwotę korekty wszędzie tam,
gdzie system sumuje `items` (co jest jedynym mechanizmem sumowania w `computeActualForMonth()` i
`history.html`). Drobny efekt uboczny: `leadCount`/"Leady (P/A)" dla tej pozycji wzrasta o 1 (nie
prawdziwy lead, tylko synthetic placeholder) — kosmetyczne, nieistotne.

Zweryfikowane: Node (`computeActualForMonth('2026-06')` z syntetycznym logiem 5606 leadów@20€ +
placeholder delta:1/price:97 → `value: 112217` = 5606×20+97, poprawnie) i przeglądarka
(`approveReconciliationCountry('de')` → `invoicingDB['2026-06'].logs` ma nowy wpis
`REKONCYLIACJA_DO_SALDA` z poprawną kwotą).

**WAŻNE — działanie NIE jest retroaktywne.** 12 już zatwierdzonych korekt użytkownika (zatwierdzone
PRZED tą poprawką) NIE mają odpowiadającego loga w `invoicingDB['2026-06']` — trzeba je dograć
ręcznie, jednorazowym skryptem w konsoli (przekazanym użytkownikowi w tej turze, nie zapisanym
nigdzie w kodzie — jeśli read this w nowej sesji i użytkownik pyta czemu czerwcowa suma nadal się
nie zgadza, sprawdź czy backfill został wykonany, patrz `adrice_pending_adjustments` z
`source:'reconciliation'` i `status:'pending'` vs brak odpowiadających logów `REKONCYLIACJA_DO_SALDA`
w `invoicingDB['2026-06'].logs`). Backfill wykonany przez użytkownika 2026-07-29 (potwierdzone).

### 0.2.3 DOPISEK (ta sama sesja) — fałszywy alarm: "obce" pozycje w sumie czerwca + brak "Cofnij"

Po backfillu użytkownik zobaczył w `history.html` dla PT dodatkowe "3 pozycje rekoncyliacji na
-1664,50€" obok swojej jedynej realnej korekty (+132€ dla #3235) i wystraszył się że coś dodało się
nadprogramowo, plus że "Cofnij" nie działa na te pozycje.

**Zdiagnozowane na pełnym dumpie `localStorage` (nie zgadywane) — to fałszywy alarm, nic nie jest
zepsute:** -1664,50€ (3 transze: -1772,50 + 72 + 36, z 8.07/15.07/21.07) to STARE, sprzed tej sesji,
już w pełni skonsumowane (`status: 'used'`, `usedByInvoice: 'INV-207'`) korekty z pierwotnego,
cotygodniowego mechanizmu "przenieś do salda" — te same, które znaleźliśmy na samym początku sesji
przy naprawie podwójnego liczenia (sekcja 0). Nie mają nic wspólnego z nową "Rekoncyliacją" — po
prostu ZAWSZE były (poprawnie) częścią sumy czerwca dla PT, użytkownik po prostu zobaczył je po raz
pierwszy z bliska. Ponieważ `status: 'used'`, nie ma ryzyka ponownej konsumpcji przy kolejnym
AUTOMAT. Ogólna metoda na przyszłość: gdy użytkownik zgłasza "nieoczekiwane" pozycje w sumach —
ZAWSZE prosić o pełny dump (`adrice_reconciliation_adjustments` + `adrice_pending_adjustments` +
filtrowane logi `invoicingDB`) i sprawdzać `status`/`usedByInvoice` zamiast zgadywać po samych
kwotach.

**"Cofnij" faktycznie nie działa — ale to nie regresja.** `window.undo()` w `history.html` (linia
~710) wymaga `log.beforeState`, którego NIE MAJĄ ani stare `PRZENIESIENIE_DO_SALDA`, ani nowe
`REKONCYLIACJA_DO_SALDA` — ograniczenie istniało od zawsze dla starego mechanizmu, nowy je
odziedziczył. Naprawione WYŁĄCZNIE dla nowego mechanizmu (użytkownik potwierdził że chce): dodano
`reconciliationStagingId` na WSPÓLNYM kluczu łączącym trzy miejsca (staging entry, `pendingAdjustments`
wpis, `invoicingDB` log) i nową funkcję `window.removeReconciliationEntry(stagingId)` w `index.html`
— czyści oba miejsca naraz (log + pendingAdjustment), z zabezpieczeniem: odmawia jeśli powiązany
wpis w `pendingAdjustments` ma już `status: 'used'` (czyli realnie trafił na fakturę — wtedy trzeba
poprawiać tamtą fakturę ręcznie, nie da się "cofnąć" tego stąd bezpiecznie). Nowa sekcja w
`renderReconciliationPending()`: "Zatwierdzone, jeszcze niepodliczone na fakturze" z przyciskiem
"🗑️ Usuń" (albo informacją "już na fakturze" dla `status: 'used'`). Zweryfikowane w przeglądarce:
approve→remove usuwa oba wpisy czysto (`pendingAdj: []`, `juneLogs: []`, staging status `'removed'`);
próba usunięcia wpisu ze statusem `'used'` poprawnie blokowana z komunikatem wskazującym numer
faktury.

### 0.2.4 DOPISEK (ta sama sesja) — panel Sald pokazuje rozbicie; realna faktura scala korekty w 1 pozycję

Dwa drobne dopisy na tę samą, wciąż żywą funkcję:

1. Użytkownik zobaczył `Oczekujące Salda` (191€ dla HU) i `Zatwierdzone, jeszcze niepodliczone`
   (24€ dla HU z rekoncyliacji) i nie rozumiał czemu się nie zgadzają — to nie błąd, drugi panel to
   PODZBIÓR pierwszego (Saldo = rekoncyliacja + stare, wciąż-pending korekty tygodniowe). Naprawione
   kosmetycznie: `renderSidebarBalances()` dopisuje pod kwotą kraju "w tym +X € z rekoncyliacji",
   gdy część (nie całość) salda tego konta pochodzi z rekoncyliacji. Zweryfikowane w przeglądarce.
2. Użytkownik: na PRAWDZIWEJ fakturze (tekst wysyłany do klienta) chce WSZYSTKIE oczekujące korekty
   (stare ilościowe + rekoncyliacja) jako JEDNĄ pozycję na plus i JEDNĄ na minus (żeby nie budzić
   pytań klienta etykietą "Rekoncyliacja"), ale w `history.html`/danych — OSOBNO, per źródło/ofertę,
   do własnego audytu. To już było spełnione dla DANYCH (`logEntry.adjustments` w `confirmInvoice()`
   nadal pushuje KAŻDĄ korektę osobno, source per wpis zachowany — nie ruszane) i dla
   `history.html`'s `viewDetails()` (nadal iteruje `log.adjustments` osobno — nie ruszane). Brakowało
   tego tylko w DWÓCH miejscach generujących tekst faktury: podglądzie przed zatwierdzeniem (~linia
   2189) i eksporcie TSV do schowka (`copyInvoiceToClipboard`, ~linia 2692) — oba pokazywały PO
   JEDNYM WIERSZU NA KOREKTĘ z widocznym "Rekoncyliacja"/"Korekta". Naprawione: oba miejsca grupują
   `appliedAdjustments` po znaku (plus/minus), sumują w JEDNĄ pozycję z neutralną etykietą "Korekta
   / Dopłata|Rabat za: {unikalne miesiące złączone '/'}" (bez wzmianki o źródle). Zweryfikowane
   matematycznie (Node): 3 korekty HU (167+8+16) → jedna linia "Korekta / Dopłata za: 2026-06" =
   191,00 €.

## 1. Cel narzędzia

Faktury za leady wystawiane są cyklicznie (poniedziałek za piątek-niedzielę, piątek za
poniedziałek-czwartek, plus tryb miesięczny AUTOMAT). Wartość leada na fakturze = suma
Affiliate Payout + Advertiser Fee + Native Advertising Fee, pobrana ze scrapera AdRice **w
momencie generowania faktury** i zastosowana do CAŁEJ paczki leadów z danego okresu — nawet
jeśli cena zmieniła się W TRAKCIE tego okresu. To generuje ciche nad/niedopłaty.

`reconciliation.html` (nowy, samodzielny plik, osobny od `index.html`/Hub-a) ma to wykryć: dla
wybranego miesiąca policzyć "ile POWINNO być zafakturowane" (na bazie realnej daty powstania
każdego leada i stawki faktycznie obowiązującej wtedy) vs "ile FAKTYCZNIE zafakturowano" (z
logów Hub-a), i wskazać różnicę (dopłata/rabat) per oferta i per kraj.

**Read-only względem Hub-a co do `invoicingDB`** — czyta `localStorage['adrice_invoicing_db_v2']`
(ten sam co `index.html`, więc strona "Zafakturowano" jest ZAWSZE żywa, bez eksportu), ale nigdy go
nie modyfikuje. **Wyjątek dodany 2026-07-29 (sekcja 0.2):** ręczne korekty z panelu "Oferty ze
zmianą ceny" zapisują się do WŁASNEGO, osobnego klucza `adrice_reconciliation_adjustments`
(staging) — to wciąż nie jest bezpośredni zapis do salda Hub-a (`adrice_pending_adjustments`);
dopiero ręczne zatwierdzenie w `index.html` (nowy panel "🧾 Oczekujące korekty z Rekoncyliacji")
kopiuje wpis do prawdziwego salda.

## 2. Struktura narzędzia (3 sekcje)

- **Sekcja A — Historia cen ofert**: dwa źródła zasilają `price_history.json`
  (`localStorage['adrice_price_history_v1']`):
  - Lewy dropzone: zwykły cotygodniowy snapshot (`adrice_offers_prices.csv`, ten sam plik co
    do Hub-a) — wykrywa zmiany przez diff kolejnych uploadów, wpisy `confidence: inferred`.
  - Prawy dropzone: wynik nowego skryptu `adrice_offer_history_scraper.js` (patrz sekcja 4) —
    dokładne daty zmian z historii AdRice, wpisy `confidence: exact`.
  - **Nowa walidacja** (`validatePriceHistoryAgainstInvoices()`): porównuje wyliczoną cenę z
    realnie zafakturowaną na każdej fakturze — ostrzega przy rozbieżności.
- **Sekcja B — Leady z realną datą powstania**: upload surowych eksportów Amsped Administration
  (po jednym na konto: Uncapped/Find/Alcance). Panel kontrolny porównuje liczbę potwierdzonych
  leadów z tego co jest w Hub-ie.
- **Sekcja C — Raport rozbieżności**: liczy "Powinno Być" vs "Zafakturowano" per oferta+kraj,
  drill-down per lead, filtr po Offer ID, eksport CSV, i podsumowanie per kraj na dole
  ("ile do dopłaty/rabatu").

## 3. KLUCZOWE DECYZJE BIZNESOWE (ustalone w tej sesji, nie zgadywać ponownie)

1. **`creation_date` (nie `confirm_date`) jest wyznacznikiem ZARÓWNO ceny leada, JAK I
   przynależności do miesiąca/okresu (Positivi)**. Potwierdzone empirycznie: filtrowanie
   Administration po `creation_date`=miesiąc (wąsko) + `confirm_date` bez górnego ograniczenia
   dawało liczby zgadzające się z Performance -> Products. **To była zmiana zdania w trakcie
   sesji — wcześniej sądziliśmy że to `confirm_date`, potem że oba naraz, ostatecznie: TYLKO
   creation_date.** W UI: dropdown "Data referencyjna" domyślnie = `creation`.
2. **Dokładny czas ma znaczenie, nie tylko dzień.** Jeśli zmiana nastąpiła o 15:00:00, leady do
   14:59:59 = stara cena, od 15:00:00 WŁĄCZNIE = nowa cena. (Był moment wahania między "cały
   dzień" a "dokładny czas" — finalna decyzja: dokładny czas, inclusive.)
3. **Reguła potwierdzonego leada (Positivi)** — po WIELU iteracjach na realnych ofertach (#24,
   #2283, #2284, #2285 itd.), finalna reguła:
   - Wyklucz jeśli `ship_status` jest na liście wykluczeń (domyślnie: `Not Shipped`).
   - CHYBA że `status` jest na liście "zwolnionych" (domyślnie: `OK - Pending`) — wtedy liczy
     się mimo `Not Shipped`.
   - Osobna lista "wykluczonych statusów" (niezależna od ship_status) jest **domyślnie PUSTA**
     — próba użycia blanketowej listy (Not Existing/Trash/Cancelled/Double/Unreachable)
     okazała się BŁĘDNA (potwierdzone na #2285: te same statusy z innym ship_status powinny się
     liczyć). Nie przywracać tej listy bez nowego dowodu z panelu kontrolnego.
4. **Podsumowanie "do dopłaty/rabatu" per kraj (dół Sekcji C) ma być PROSTĄ sumą delt z ofert**,
   BEZ mieszania ze starymi, ręcznymi korektami `pendingAdjustments`. Użytkownik explicite
   odrzucił wersję z odejmowaniem korekt jako "za bardzo skomplikowaną, myli, a kalkulacje mają
   być proste". Stare korekty pokazywane są tylko w osobnej, informacyjnej tabeli wyżej.

## 4. GŁÓWNY PROBLEM — ✅ ZAIMPLEMENTOWANE (2026-07-28, kolejna sesja)

**Rekonstrukcja ceny z historii AdRice (komponenty: payout + advertiserFee + nativeAdvFee
śledzone OSOBNO w czasie i sumowane) jest z natury krucha.** Udowodnione na ofercie #3234:
scraper przegapił zmianę Native/Advertiser Fee z zera (bo AdRice loguje to inaczej niż zwykłą
"zmieniono z X na Y"), co dawało błąd dokładnie +1€ na każdym poziomie ceny (21€/18€ zamiast
poprawnych 20€/17€) — mimo że data granicy była idealnie poprawna (09.06.2026 13:04→17:37).

**Naprawiony częściowo:** regex w `adrice_offer_history_scraper.js` teraz łapie też "zmieniono z
pustej wartości" (patrz sekcja 6). Ale użytkownik słusznie zauważył: to tylko jeden konkretny
przypadek, mogą być inne niezłapane niuanse — cały mechanizm rekonstrukcji z komponentów jest
niepewny.

**Zwykły cotygodniowy scraper Hub-a (`adrice_scraper.js`) ZWERYFIKOWANY jako niezawodny** — czyta
3 pola BEZPOŚREDNIO z żywej strony i sumuje w momencie scrapowania (zero rekonstrukcji historii,
zero zgadywania). To jest prosty, zaufany mechanizm — problem jest TYLKO w próbie odtworzenia
przeszłych wartości z tekstowego logu zmian.

### USTALONY NOWY PLAN (ostatnia wiadomość sesji, do zaimplementowania):

Porzucić rekonstrukcję WARTOŚCI z komponentów. Zamiast tego:

1. Dla każdej oferty, wziąć sekwencję REALNIE zafakturowanych cen z logów Hub-a w czasie
   (to już mamy z `computeActualForMonth`'s `logsInvolved` / da się wyciągnąć per-offer ze
   wszystkich miesięcy).
2. Sprawdzić: czy cena kiedykolwiek się zmieniła w tych logach dla tej oferty? Jeśli NIE —
   prosta sprawa, jedna stała cena, żadnej rekonstrukcji nie trzeba.
3. Jeśli TAK — dla każdej takiej zmiany, potrzebna jest dokładna data/godzina graniczna. Tu (i
   TYLKO tu) użyć historii AdRice (`adrice_offer_history_scraper.js`) — ale **wyłącznie jako
   źródło DATY**, nie wartości.
4. Dla każdej granicy: wziąć REALNĄ cenę zafakturowaną (z kroku 1) bezpośrednio przed i
   bezpośrednio po tej dacie — NIE sumować komponentów.
5. **Obsłużyć wiele granic w jednym miesiącu, nie tylko "przed/po jedną zmianę"** (np. #2285
   miało TRZY poziomy ceny w jednym miesiącu: 23€→22€→20€) — dodane w tej sesji jako
   uzupełnienie planu użytkownika.
6. Rozbić leady (z Sekcji B, po `creation_date`) na segmenty według tych granic, policzyć
   sumę wartości używając REALNYCH cen z segmentów, porównać z "Zafakturowano".
7. Jeśli data graniczna z AdRice jest niedostępna/niepewna dla jakiejś zmiany — spaść do
   przybliżenia (np. "gdzieś między ostatnią fakturą ze starą ceną a pierwszą z nową"),
   wyraźnie oznaczonego jako niższa pewność.

**Zaimplementowane w `reconciliation.html` dokładnie wg planu powyżej:**

- `materializeOfferTimeline()` (sumowanie komponentów) i `validatePriceHistoryAgainstInvoices()`
  (walidacja wartości) zostały **usunięte** — nie ma już żadnej rekonstrukcji WARTOŚCI z komponentów
  w całym narzędziu.
- Nowe funkcje (oś czasu cen z realnych faktur):
  - `getInvoicedObservations(offerId)` — wszystkie zafakturowane obserwacje ceny dla oferty, ze
    WSZYSTKICH znanych miesięcy (`invoicingDB` + `historicalDB`), chronologicznie.
  - `getInvoicedPriceSegments(offerId)` — zwija obserwacje w kolejne, RÓŻNE poziomy cenowe (obsługuje
    dowolną liczbę granic w jednym miesiącu, np. #2285 z 3 poziomami — naturalnie, bo to po prostu
    kolejne segmenty w sekwencji, bez specjalnego przypadku).
  - `getHistoryChangeDates(offerId)` — kandydackie daty granic z DOKŁADNEJ historii AdRice
    (Sekcja A, prawy dropzone) — **tylko `changedAt`, wartości `oldValue`/`newValue` ignorowane**.
  - `getSnapshotChangeDates(offerId)` — kandydackie daty z cotygodniowego snapshotu (Sekcja A, lewy
    dropzone) — gorsza pewność (`inferred`), używane tylko gdy brak dokładnej historii.
  - `findBoundaryDate(offerId, prevSegment, nextSegment)` — wybiera datę granicy w malejącej
    kolejności pewności: dokładna historia AdRice (`exact`) → snapshot (`inferred`) → środek okna
    między ostatnią fakturą ze starą ceną a pierwszą z nową (`approx`, krok 7 planu).
  - `getRealPriceTimeline(offerId)` — pełna oś czasu: WARTOŚCI z `getInvoicedPriceSegments`, DATY z
    `findBoundaryDate`. Cache'owana (`_priceTimelineCache`, `invalidatePriceTimelineCache()`) —
    unieważniana przy każdym uploadzie w Sekcji A i imporcie archiwalnego backupu.
  - `computeBoundaryGaps()` — zastępuje starą `validatePriceHistoryAgainstInvoices()`: skanuje
    WSZYSTKIE oferty z logów (nie tylko te z Sekcji A) i zwraca te, gdzie realna cena się zmieniła,
    ale żadne źródło w Sekcji A nie dało daty w oknie (czyli boundary confidence = `approx`).
    Pokazywane jako tabela ostrzegawcza w `renderPriceHistoryCoverage()`.
- `priceAt(offerId, date)` przepisane na bazie `getRealPriceTimeline()` — sygnatura zwrotki bez zmian
  (`{value, confidence, changedAt, source}`), więc `computeShouldBeForMonth()` **nie wymagało zmian**.
- `mergeSnapshotDiff()` używa teraz `getSnapshotTimeline()` (surowe wpisy `totalPayout` ze
  snapshotów, do diffowania kolejnych uploadów) zamiast starego `getMaterializedTimeline()`.
- UI (intro-box, Sekcja A, Sekcja C, banery w raporcie) zaktualizowane, żeby jasno komunikować: Sekcja
  A = TYLKO daty granic, WARTOŚCI zawsze z realnych faktur.
- **Zweryfikowane w konsoli przeglądarki na realnych danych z tej sesji** (offer #3234, ten sam
  przypadek testowy co w sekcji 8): granica 20€→17€ poprawnie wykryta na `2026-06-09T13:54:32`
  (dokładna data z historii AdRice), ceny PRZED/PO wzięte z syntetycznych logów testowych (20€/17€,
  bez żadnego sumowania komponentów) — dokładnie zgodnie z planem. Ścieżka fallbacku (`approx`,
  środek okna) też zweryfikowana na syntetycznym przykładzie.
- **Nie zmieniono** `adrice_offer_history_scraper.js` — nadal zbiera też wartości komponentów (nie
  tylko daty), ale te wartości są teraz w całości ignorowane przez `reconciliation.html`. Uproszczenie
  skryptu (punkt 9.4 poniżej) pozostaje opcjonalne — ryzyko literówki przy regeneracji Base64 (patrz
  sekcja 6) nie wydawało się warte tego w tej sesji, skoro i tak działa poprawnie w obecnej formie.

**Do zrobienia w kolejnej sesji:** przetestować na PRAWDZIWYCH danych Hub-a (ta sesja weryfikowała
tylko na syntetycznych logach wstrzykniętych do izolowanej przeglądarki podglądu, bo nie miała dostępu
do prawdziwego `localStorage` użytkownika) — patrz zaktualizowana sekcja 9.

**Dodatkowa funkcja (ta sama sesja, na życzenie użytkownika):** w Sekcji C, nad przyciskiem "Oblicz
Rozbieżności", nowy panel "⚡ Oferty ze zmianą ceny w wybranym miesiącu" (`computePriceChangesInMonth()`
+ `renderPriceChangesThisMonth()`) — lista offer ID, których REALNA cena w fakturach zmieniła się w
obrębie wybranego miesiąca (z datą granicy i jej pewnością), niezależnie od tego czy Sekcja B jest
wgrana i bez klikania "Oblicz Rozbieżności". Cel: szybko wskazać, które oferty warto sprawdzić ręcznie
(reszta miała stałą cenę przez cały miesiąc = nic do sprawdzenia). Odświeżane przy zmianie miesiąca i
po każdym uploadzie/imporcie w Sekcji A. Zweryfikowane na syntetycznym przykładzie (#3234 ze zmianą
20€→17€ wykryte poprawnie, #24 ze stałą ceną poprawnie pominięte).

## 5. Inne naprawione błędy w tej sesji (już zaimplementowane i zweryfikowane)

1. **Legacy etykiety kont w logach** (`log.type = 'FIND'/'ALCANCE'` zamiast kodu kraju, sprzed
   migracji v3 z czerwca 2026) — ta sama oferta rozjeżdżała się na dwie pozycje (np. "#4106
   Alcance" i "#4106 PT"). Naprawione: `resolveLogCountry()` ustala prawdziwy kraj z danych
   Sekcji B (Administration), gdy `log.type` nie jest już poprawnym kodem kraju.
2. **Krytyczny bug w oknie miesiąca**: logi KONTROLA fizycznie zapisane we własnym miesiącu były
   odrzucane, jeśli ich wywnioskowany zakres dat (na podstawie dnia tygodnia confirmDate) nie
   pokrywał się kalendarzowo z tym miesiącem (typowe przy potwierdzeniach na przełomie miesięcy,
   np. log z datą 6.07 zapisany w czerwcowej tablicy logów). Naprawione: przynależność do
   miesiąca rozstrzyga to, w której tablicy log FIZYCZNIE leży, nie wyliczony zakres dat.
   Zweryfikowane na #2285: było 89440€ (błędnie), poprawnie 95920€ (zgodne z realną wartością).
3. **pendingAdjustments konsumowane w innym miesiącu w trybie AUTOMAT** były pomijane (kod
   sprawdzał tylko logi KONTROLA dla sąsiednich miesięcy). Naprawione: korekty skanowane są
   przez WSZYSTKIE miesiące, dopasowywane po `adj.month`, niezależnie od trybu/logu-nosiciela.
4. **Panel kontrolny Sekcji B liczył źle "Zafakturowano"** — najpierw próba sumowania
   starego+nowego klucza konta (`find`+`de` itd.) powodowała PODWÓJNE liczenie dla ofert, które
   przeszły przez ręczny przycisk migracji w `index.html` (kopiuje starą wartość do nowej TYLKO
   gdy nowa jest pusta, nie usuwa starej — `index.html:955-1006`). Finalnie naprawione inaczej:
   **panel Sekcji B przestał czytać słownik kumulacyjny w ogóle** — liczy teraz z logów, tą samą,
   już zweryfikowaną ścieżką co Sekcja C (`computeActualForMonth(...).leadCount`).
5. **Upload wielu plików naraz** — dropzone "Dokładna historia cen" (Sekcja A) przyjmował tylko
   1 plik; teraz `multiple`, oba pliki (Aktywne+Nieaktywne) naraz.
6. **Filtr Offer ID w raporcie** dodany (Sekcja C) — filtruje tabelę, ale podsumowanie per kraj
   na dole ZAWSZE liczy z pełnego, nieprzefiltrowanego raportu.
7. **Materializacja komponentów przy jednoczesnej zmianie 2 pól** (np. payout i advertiserFee
   zmienione w tym samym momencie) grupowana poprawnie w JEDEN wpis totalPayout, nie dwa osobne.
8. **Regex scrapera historii** (`adrice_offer_history_scraper.js`) nie łapał zmian "z pustej
   wartości na X" (np. wprowadzenie opłaty od zera) — naprawione (`[\d.,]*` zamiast `[\d.,]+`
   dla Old_Value). To był root cause błędu #3234, ale patrz sekcja 4 — to tylko łata objaw,
   fundamentalny problem (krucha rekonstrukcja z komponentów) zostaje.

## 6. Nowe pliki utworzone w tej sesji

- **`reconciliation.html`** (root projektu) — główne narzędzie, opisane wyżej.
- **`adrice_offer_history_scraper.js`** (root projektu) — nowy skrypt do wklejenia w konsoli na
  `/en/offers` (aktywne) i `/en/offers?status=inactive` (nieaktywne) w AdRice. Dla każdej oferty
  pobiera: (1) pełną historię zmian z `/en/events/offer/{id}` (endpoint za przyciskiem
  "Actions -> History" na stronie edycji oferty), parsuje opisy typu "Payout changed from €X to
  €Y" (ignoruje wpisy "Custom POs changed" — to stawki dla konkretnych afiliantów, nie domyślne);
  (2) bieżące wartości z `/en/offers/{id}/edit` jako fallback dla pól bez historii zmian
  (znacznik `BASELINE_SENTINEL_DATE = '1970-01-01T00:00:00'`, confidence='partial'). Wynikowy
  CSV: `Offer_ID;Field;Old_Value;New_Value;Changed_At;Scraped_At`. **Ma być przebudowany/README
  zaktualizowany po wdrożeniu planu z sekcji 4** — jeśli plan z sekcji 4 zostanie
  zaimplementowany, ten skrypt może zostać UPROSZCZONY do wyciągania TYLKO dat zmian (bez
  wartości), bo wartości i tak będą brane z realnych faktur.
- W `reconciliation.html` jest przycisk "📋 Kopiuj skrypt scrapera historii cen" (Sekcja A) —
  kopiuje treść `adrice_offer_history_scraper.js` zakodowaną w Base64
  (`OFFER_HISTORY_SCRAPER_B64`) żeby uniknąć problemów z escapowaniem znaków specjalnych w HTML.
  **WAŻNE: jeśli edytujesz `adrice_offer_history_scraper.js`, MUSISZ zregenerować ten Base64**
  (użyj PowerShell `[Convert]::ToBase64String([System.IO.File]::ReadAllBytes(...))`, podmień
  całą linię programowo — NIE ręcznym kopiowaniem, bo to już raz spowodowało literówkę/utratę
  4 znaków. Zweryfikuj SHA-256 pliku źródłowego vs zdekodowanego stringa w przeglądarce.

## 7. Przydatne fakty o istniejącym systemie (z eksploracji na starcie sesji)

- Hub (`index.html`) i historia (`history.html`) czytają/piszą `localStorage['adrice_invoicing_db_v2']`.
- Migracja v3 (czerwiec 2026): stare konta `find`/`alcance` (obejmujące po kilka krajów naraz)
  zastąpione kodami krajów (`pl,hu,de,lt,cz,sk,lv,pt,es`). `index.html` ma DWIE migracje:
  automatyczną (`migrateDBIfNeeded()`, linia ~1067, przenosi `find`→`_legacy_find` itd., NIE
  kopiuje wartości) i ręczny przycisk (linie 955-1006, KOPIUJE wartość do nowego klucza kraju
  TYLKO gdy ten jest pusty, przez co część ofert ma zdublowane, część ma stare klucze wciąż
  aktywne — źródło błędów opisanych w sekcji 5.4).
- Amsped Administration (surowy eksport CSV): kolumny `creation_date`, `confirm_date`, `status`,
  `ship_status`, `product_SKU` (offer ID = `UCP(\d+)` z tej kolumny), `country` (kod ISO wprost).
- `invoicingDB[miesiąc].logs[]`: `{timestamp, invoiceNumber, type, mode, items:[{id,delta,price}],
  adjustments:[{account,amount,month,status}]}`. `mode` = `KONTROLA (ZAKRES)` (ręczny
  tygodniowy zakres) lub `AUTOMAT`/`AUTOMAT (KOREKTA SALDA)` (kumulacyjny miesięczny top-up).
- Konwencja cyklu: poniedziałek = faktura za piątek-niedzielę; piątek = faktura za
  poniedziałek-czwartek.
- Konta: Uncapped→PL/HU, Find→DE/LT/CZ/SK/LV, Alcance→PT/ES.

## 8. Oferty testowe użyte w tej sesji (do regresji w nowej sesji)

| Offer ID | Konto | Znane fakty |
|---|---|---|
| #24 | Uncapped/PL | Maj 2026: 1832 leadów / 34808€ (19€/lead, bez zmiany ceny w maju). Korekta 654,50€ w czerwcu za maj. |
| #2285 | Find/DE | Czerwiec 2026: cena 23€→22€→20€ w fakturach (3 poziomy), ale historia AdRice pokazuje TYLKO 23€→20€ (5.06.2026) — środkowy poziom to fantom (patrz sekcja 0.2). Poprawna dopłata: 97€ (519 leadów×23€ + 5087×20€ = 113677€ vs zafakturowane 113580€), NIE 811€ jak dał automat. Referencyjny przypadek dla nowego mechanizmu "ręczna korekta". |
| #3234 | Alcance/ES | Cena 20€→17€ dokładnie 09.06.2026 13:04→17:37 (potwierdzone realnymi fakturami). Historia AdRice pierwotnie dawała błędnie 21€/18€ (brakujący Native/Advertiser Fee). |
| #4106 | Alcance→PT | Przykład rozjazdu przez starą etykietę konta (Alcance vs PT). |
| #3268 | Find | Brak jakiejkolwiek historii cen w Sekcji A (sprawdzić pokrycie scrapera). |
| #3182 | Find/DE(?) | 3 leady zafakturowane, ale zapisane pod starym kluczem `find` w słowniku kumulacyjnym. |
| #1819 | ? | 972 leady w Administration, 12 Not Shipped → 960 zgadza się z Performance -> Products. |
| #693, #1683, #33 | PL/HU(?) | Historyczne zmiany cen znalezione w ArchiveBackups (21→17, 20→16, 20→18) — dobre do dalszych testów. |
| #3374 | Find/LT | 590 leadów w czerwcu, ceny w logach 17€/21€ — kandydat do ręcznej weryfikacji (jeszcze nie sprawdzony). |

## 9. Co NIE zostało jeszcze zrobione / do sprawdzenia w nowej sesji

0. **🎯 PRIORYTET #1 na start NASTĘPNEJ sesji (ustalone na koniec tej sesji):** użytkownik chce popracować
   nad **uproszczeniem WYGLĄDU** narzędzia rekoncyliacji — chodzi o UI/wizualną stronę, nie o
   logikę liczenia (ta jest już zweryfikowana i działa poprawnie na realnych danych, patrz sekcje
   0.2–0.2.4). Kontekst przed startem: cała funkcjonalność (Sekcja A/B/C w `reconciliation.html`,
   panel "⚡ Oferty ze zmianą ceny" z formularzem, dwa panele w `index.html` — "Oczekujące Salda" i
   "🧾 Oczekujące korekty z Rekoncyliacji" z sekcją "Zatwierdzone, jeszcze niepodliczone") już
   działa i była wielokrotnie weryfikowana przez użytkownika na prawdziwych danych — **nie
   przebudowywać logiki bez wyraźnej nowej prośby**, skupić się na czytelności/UX: ilość
   informacji na ekranie, hierarchia wizualna, może redukcja liczby paneli/tabel, lepsze
   grupowanie. Dobry punkt wyjścia: zapytać użytkownika CO KONKRETNIE w obecnym wyglądzie przeszkadza
   (zbyt dużo tabel? za dużo tekstu objaśniającego? zbyt techniczne nazwy jak "DO_SPRAWDZENIA"?),
   zamiast zgadywać zakres z góry.

1. ✅ ~~Zaimplementować plan z sekcji 4~~ — ZROBIONE (2026-07-28), sprawdzone na realnych danych
   (2026-07-29): działa poprawnie dla ofert ze STABILNĄ ceną, ale dla ofert ze zmianą ceny w
   trakcie miesiąca okazało się niewystarczające — patrz sekcja 0.2 (#2285: 811€ automat vs 97€
   realnie) i wdrożone tam uproszczenie (oferty ze zmianą ceny → "—", ręczna korekta + eksport do
   Hub-a zamiast automatycznego zgadywania).
1b. **NOWE, priorytet #1 na start kolejnej sesji:** przetestować mechanizm z sekcji 0.2 na
   PRAWDZIWYCH danych (nie syntetycznych) — wgrać Sekcję B, policzyć raport dla lipca/czerwca,
   sprawdzić czy panel "⚡ Oferty ze zmianą ceny" poprawnie łapie WSZYSTKIE oferty z listy w sekcji
   8 poniżej co do których wiadomo, że miały zmianę ceny (#2285 potwierdzone; #3374 LT i inne — do
   przejrzenia), i czy diagnostyka `historii AdRice payout vs faktury` daje sensowne, nie-zaszumione
   wyniki (dużo `⚠️ niezgodność` mogłoby oznaczać że regex historii scrapera gubi więcej niż
   sądziliśmy — patrz punkt 5 niżej).
2. Przetestować Find i Alcance (nie tylko Uncapped) po każdej większej poprawce.
3. Sprawdzić #3374 i inne kandydaty z sekcji 8 po wdrożeniu nowego mechanizmu.
4. Rozważyć, czy `adrice_offer_history_scraper.js` da się uprościć (tylko daty, bez wartości)
   skoro wartości i tak są brane z faktur — świadomie NIE zrobione w tej sesji (ryzyko literówki
   przy regeneracji Base64, patrz sekcja 6; skrypt działa poprawnie w obecnej formie, nadmiarowe
   pola komponentów są po prostu ignorowane).
5. Sprawdzić na realnych danych, czy tabela "realne zmiany ceny bez dokładnej daty granicy"
   (nowa, w Sekcji A pod listą ofert — `computeBoundaryGaps()`) pokazuje rozsądną liczbę pozycji;
   jeśli dużo ofert ląduje w `approx`, to sygnał żeby częściej odświeżać historię AdRice.
