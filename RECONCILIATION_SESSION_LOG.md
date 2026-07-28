# Log sesji: Narzędzie rekoncyliacji wartości leadów (reconciliation.html)

Data: 2026-07-28. Ten plik to pełne podsumowanie sesji budowy i debugowania `reconciliation.html` —
przeznaczony do wklejenia/odczytania na starcie NOWEGO czatu, żeby nie tłumaczyć wszystkiego od zera.

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

**Read-only względem Hub-a** — czyta `localStorage['adrice_invoicing_db_v2']` (ten sam co
`index.html`, więc strona "Zafakturowano" jest ZAWSZE żywa, bez eksportu), ale niczego tam nie
zapisuje.

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
| #2285 | Find/DE | Czerwiec 2026: 4723 leadów / 95920€. Cena 23€→22€→20€ W TRAKCIE czerwca (3 poziomy!). |
| #3234 | Alcance/ES | Cena 20€→17€ dokładnie 09.06.2026 13:04→17:37 (potwierdzone realnymi fakturami). Historia AdRice pierwotnie dawała błędnie 21€/18€ (brakujący Native/Advertiser Fee). |
| #4106 | Alcance→PT | Przykład rozjazdu przez starą etykietę konta (Alcance vs PT). |
| #3268 | Find | Brak jakiejkolwiek historii cen w Sekcji A (sprawdzić pokrycie scrapera). |
| #3182 | Find/DE(?) | 3 leady zafakturowane, ale zapisane pod starym kluczem `find` w słowniku kumulacyjnym. |
| #1819 | ? | 972 leady w Administration, 12 Not Shipped → 960 zgadza się z Performance -> Products. |
| #693, #1683, #33 | PL/HU(?) | Historyczne zmiany cen znalezione w ArchiveBackups (21→17, 20→16, 20→18) — dobre do dalszych testów. |
| #3374 | Find/LT | 590 leadów w czerwcu, ceny w logach 17€/21€ — kandydat do ręcznej weryfikacji (jeszcze nie sprawdzony). |

## 9. Co NIE zostało jeszcze zrobione / do sprawdzenia w nowej sesji

1. ✅ ~~Zaimplementować plan z sekcji 4~~ — ZROBIONE (2026-07-28), patrz sekcja 4. Zweryfikowane tylko
   na syntetycznych danych w izolowanej przeglądarce (brak dostępu do prawdziwego `localStorage`
   użytkownika w tamtej sesji) — **następny krok: otworzyć `reconciliation.html` w normalnej
   przeglądarce z prawdziwym Hub-em, wgrać Sekcję A+B i przelecieć ofertami z sekcji 8 poniżej**,
   żeby potwierdzić że nowy mechanizm (wartości z faktur, daty z AdRice) daje sensowne wyniki na
   realnych danych, nie tylko na kontrolowanym przykładzie #3234.
2. Przetestować Find i Alcance (nie tylko Uncapped) po każdej większej poprawce.
3. Sprawdzić #3374 i inne kandydaty z sekcji 8 po wdrożeniu nowego mechanizmu.
4. Rozważyć, czy `adrice_offer_history_scraper.js` da się uprościć (tylko daty, bez wartości)
   skoro wartości i tak są brane z faktur — świadomie NIE zrobione w tej sesji (ryzyko literówki
   przy regeneracji Base64, patrz sekcja 6; skrypt działa poprawnie w obecnej formie, nadmiarowe
   pola komponentów są po prostu ignorowane).
5. Sprawdzić na realnych danych, czy tabela "realne zmiany ceny bez dokładnej daty granicy"
   (nowa, w Sekcji A pod listą ofert — `computeBoundaryGaps()`) pokazuje rozsądną liczbę pozycji;
   jeśli dużo ofert ląduje w `approx`, to sygnał żeby częściej odświeżać historię AdRice.
