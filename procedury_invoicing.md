# Procedura Fakturowania Leadów (AdRice Invoicing)

Poniżej znajduje się Twoja nowa wytyczna krok po kroku do comiesięcznego wystawiania faktur z wykorzystaniem naszej nowej, lokalnej aplikacji `index.html`.

> [!TIP]
> Zgodnie z najlepszą praktyką, proces zaczynamy od odpalenia scrapera, a wszelkie eksporty z Amsped (które są bardzo szybkie) robimy w tle, czekając aż skrypt zgromadzi stawki CPI.

---

## ⏳ ETAP 1: Scrapowanie stawek z AdRice
Nasz ulepszony skrypt sam oblicza całkowitą cenę za Leada (Base Payout + Advertiser Fee + Native Fee) oraz odsiewa niepotrzebne rekordy. Ponieważ weryfikacja wielu podstron chwile zajmuje, odpalamy to od razu.

1. **Otwórz plik skryptu:**
   Wejdź w Notatnik lub edytor i otwórz na komputerze plik `adrice_scraper.js`. Zaznacz całą jego zawartość (`Ctrl+A`) i skopiuj (`Ctrl+C`).
2. **Aktywne Oferty:**
   Zaloguj się na AdRice, przejdź do widoku **Ofert Aktywnych** (`/en/offers`). Otwórz narzędzia deweloperskie w Chrome (`F12`), przejdź do zakładki **Console**, wklej sklonowany przed chwilą kod (`Ctrl+V`) i wciśnij `Enter`. Zignoruj pojawiające się w tym samym czasie błędy wizualne - skrypt rozpocznie pracę. Kiedy skończy, po około kilku minutach sam automatycznie wygeneruje do pobrania plik `adrice_offers_prices.csv`.
3. **Nieaktywne Oferty:**
   Od razu wejdź na AdRice do zakładki **Oferty Nieaktywne** (`/en/offers?status=inactive` itp.). Wyczyść konsolę w Chrome, wklej tam identyczny kod raz jeszcze i zapisz na dysku kolejny wygenerowany stamtąd plik `.csv`. Oznacz sobie łatwo nazwy obu plików po ich ściągnięciu jako "Aktywne" i "Nieaktywne" ułatwiając pomyślne wgranie do programu.

---

## 📦 ETAP 2: Błyskawiczne Eksporty z Amsped (w TLE)
Podczas gdy scraper działa, możesz bez problemu logować się i przelogowywać po systemach Amsped. Musimy wydobyć dwa typy plików z trzech rożnych kont (Uncapped, Find, Alcance).

1. **Eksport List (Lists -> Products):**
   Tu pobierasz strukturę "co jest czym".
   Wejdź w zakładkę **Lists -> Products** i wykonaj zrzut z kont. Zapisz pliki z nazewnictwem: np. `Lists_Uncapped.csv`, `Lists_Find.csv`, `Lists_Alcance.csv`. Zestawienie to od kodów `UCP...` odszyfruje nam numer główny w systemie AdRice!
   
2. **Eksport Zamówień (Performances -> Products):**
   Tu pobierasz docelowe wygenerowane statystyki, czyli liczbę poszczególnych "leadow".
   Wejdź w zakładkę **Performances -> Products** i za dany okres fakturowy po wylistowaniu pobierz dane. Zmień nazwy plików: np. `Perf_Uncapped.csv`, `Perf_Find.csv`, `Perf_Alcance.csv`. 

---

## ⚡ ETAP 3: Generowanie Faktur w Aplikacji Pająka
To ten miły i szybki moment, na który pracowaliśmy!

1. **Otwórz hub fakturowy:**
   Wejdź do nowego folderu z rozwiązaniem: `Desktop\AdRice\Invoicing` i kliknij dwukrotnie w plik `index.html`.
2. **Wgraj dokumenty AdRice (Krok 1 i Krok 1b):**
   Załaduj swoje świeżo zsrappowane dokumenty: plik z ofertami Aktywnymi wklej pod label `1a`, a wynik skanowania z ofert Nieaktywnych pod label `1b`.
3. **Wgraj dokumenty powiązań (Amsped Lists):**
   Przeciągnij swoje wyeksportowane 3 pliki Lists (z etapu 2.1) do segmentów `2a`, `2b` i `2c`. Aplikacja ułoży sama z nich potężny słownik łączący dane stąd!
4. **Wgraj sprzedaż miesięczną (Amsped Performances):**
   Ostatnie trzy okienka wypełnij danymi zysków (`Perf_...`) z Etapu 2.2.
5. **Generuj:**
   Gdy wszystko jest zapakowane do odpowiednich sekcji, kliknij dumnie przycisk na samym dole widoku formularzy: `Generuj Faktury`.

---

## 📋 ETAP 4: Przenoszenie wygenerowanych bloków do księgowości
Jeżeli z listą u Ciebie było wszystko O.K., to system elegancko skrzyżował w locie wszystkie zmienne ze wszystkich 8. wczytanych źródeł, ułożył je malejąco według największej liczby "Positivi", skrócił nazwę, i złączył w jedną docelową linijkę z zsumowaną precyzyjną wartością prowizji od leada.

Każda z wygenerowanych **czterech ramek na ekranie stanowi odrębną fakturę**. Pod danym blokiem widnieje dedykowany przycisk `Kopiuj do Excela/Fakturowni`. 
Kliknij w niego, wejdź w swoje oprogramowanie do faktur, dodaj "zbiorcze wiersze" i wklej! Wszelkie tabele ustawią się symetrycznie bez żadnego psucia formy w programach bazujących na kolumnach typu paste od Google Sheets, InFakt, Fakturownia, i w Excelach!
