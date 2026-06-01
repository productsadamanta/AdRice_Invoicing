# Changelog - AdRice Invoicing Hub

Wszystkie istotne zmiany w strukturze, logice i wyglądzie systemu są dokumentowane w tym pliku. Pozwala to na śledzenie ewolucji projektu oraz bezpieczne wycofywanie zmian w razie awarii.

---

## [2.5.2] - 2026-05-06
### Naprawiono
- **Uwzględnianie Spadków Znikających Ofert (Drops to 0):** Naprawiono błąd w trybie "AUTOMAT", przez który oferty, których ilość leadów spadła do zera (i całkowicie zniknęły z pliku raportu Amsped), nie były brane pod uwagę przy obliczaniu delty. Teraz system automatycznie skanuje bazę `alreadyPaid` dla aktualnego miesiąca i sztucznie wstrzykuje oferty z wartością `positivi: 0`, co poprawnie generuje ujemną deltę (korektę na minus) i odlicza je od łącznej wartości faktury bez konieczności ręcznego używania funkcji "Weryfikuj braki".

### Dodano
- **Wizualne Podsumowanie Składowych (Subtotals):** Dodano w trybie "AUTOMAT" (dla zamkniętych miesięcy) rozbicie ostatecznej kwoty faktury na dwie pozycje: `Suma delta >0` (wartość dodatnich leadów) oraz `Discount` (łączna wartość ujemnych korekt ze spadków). Zestawienie to jest teraz widoczne w dwóch miejscach: na samym dole tabeli wyników oraz **na samej górze obok głównej kwoty do wystawienia na fakturze**, co pozwala na błyskawiczną weryfikację bez konieczności scrollowania.

---

## [2.5.1] - 2026-05-04
### Naprawiono
- **Mapping Logic (Normalizacja):** Rozszerzono funkcję `normalizeAmspedName` o usuwanie prefixów statusu takich jak `ON HOLD`, `BLOCKED` oraz `??`. Naprawia to błąd mapowania produktów takich jak SKU182.
- **SKU Extraction:** Ulepszono wyciąganie SKU z nazw Amsped, dodając obsługę kodów alfanumerycznych (np. `skuAD4407`, `skuCR7021`) oraz nadając priorytet formatom `EKA`/`EKM` (np. `EKM033`). Eliminuje to błędy `UNKNOWN_SKU` oraz błędne prefixy.

### Dodano
- **Miesięczne Podsumowanie Produktów:** W Centrum Historii (`history.html`) dodano nową sekcję agregującą wszystkie leady z danego miesiąca według ID produktu. Pozwala to na spójne podliczanie wyników nawet w przypadku wariacji nazw lub SKU w poszczególnych fakturach.

---

## [2.5.0] - 2026-04-30
### Dodano
- **Weryfikacja Braków (Rewizja):** Dodano funkcję "Weryfikuj braki" (🔍), która skanuje bazę danych w poszukiwaniu ofert, których brakuje w obecnym raporcie, a mają zafakturowane leady. Pozwala to na szybkie dodanie korekt ujemnych dla ofert, które przestały "leadować".
- **Wizualne Podsumowanie Faktur:** Wprowadzono panel podsumowujący na górze wyników, wyświetlający zbiorcze dane (Ilość leadów, Wartość Euro) dla wszystkich czterech głównych firm (TrendiSupply, TradeExpress, EuroFlex, SmartMedia).
- **Eksport Podsumowania:** Dodano przyciski "Kopiuj CSV" w podsumowaniu, generujący gotowe dane do wklejenia do Excela/Arkuszy (format średnikowy).
- **Narzędzie "Korekta Stanu (Manual)":** Nowa opcja w panelu bocznym pozwalająca na bezpośrednie nadpisanie stanu bazy (`alreadyPaid`) poprzez wklejenie listy ID i wartości (np. z Excela).
- **UX - Podświetlanie Wierszy:** Przyciski kopiowania nazwy pozycji teraz wizualnie podświetlają aktualny wiersz na zielono, co ułatwia pracę przy ręcznym wprowadzaniu danych.

---

## [2.4.0] - 2026-04-29
### Dodano
- **Logika Multi-region (Global):** Pełne wsparcie dla rozliczania rynków zagranicznych (Niemcy, Litwa, Czechy, Słowacja, Łotwa, Portugalia, Hiszpania) w ramach kont Find i Alcance.
- **Naprawa Agregacji:** Zmieniono sposób przetwarzania danych – system teraz sumuje wszystkie wystąpienia tej samej oferty w pliku Amsped przed obliczeniem delty, co eliminuje błędy "nadpisywania" stanu przy wielu kampaniach dla jednego ID.
- **Inteligentne Sortowanie QBO:** W trybie "AUTOMAT" oferty z dodatnią deltą są teraz automatycznie grupowane na górze tabeli i eksportu, co przyspiesza wklejanie do QuickBooks.
- **Filtrowanie QuickBooks:** System automatycznie odfiltrowuje spadki (delta < 0) z eksportu do QuickBooks, zapobiegając próbom fakturowania ujemnych wartości w QBO.

---

## [2.3.0] - 2026-04-27
### Dodano
- **System Kopii Zapasowych (Backup/Restore):** Wdrożono manualny system eksportu i importu historii faktur (w formacie `.json`), zabezpieczający przed utratą danych po wyczyszczeniu pamięci przeglądarki (LocalStorage).
- Dodano dedykowane, zawsze widoczne przyciski "💾 Zapisz backup" oraz "📂 Importuj backup" w oknach `index.html` oraz `history.html`.
- Zaimplementowano dynamiczne nazewnictwo generowanych plików backupu ze znacznikiem czasu (np. `adrice_backup_20260427_0930.json`).
- Dodano panel informacyjny ułatwiający archiwizację we wskazanym folderze (`Invoicing\ArchiveBackups\`) wraz z opcją kopiowania ścieżki do schowka.
- Wprowadzono auto-wykrywanie pustej bazy: po całkowitym usunięciu danych z przeglądarki system sam sugeruje szybkie odtworzenie pliku przyciskiem Importu.

---

## [2.2.0] - 2026-04-24
### Dodano
- **Integracja z QuickBooks Online:** Wdrożono nowy przycisk "Kopiuj do QuickBooks" dla każdej firmy. Umożliwia on grupowy zrzut danych z pomocą funkcji "Paste line items" w QBO.
- **Optymalizacja formatowania QBO:** Skrypt generuje precyzyjnie 5-kolumnowy plik TSV (Product, puste Description, Qty, Rate, Amount). Wymuszono używanie kropki jako separatora dziesiętnego (QBO interpretowało przecinek jako tysiące) oraz jawne generowanie "Amount" (aby pominąć usterkę QBO polegającą na zerowaniu wpisów z braku autokalkulacji).

---

## [2.1.0] - 2026-04-24
### Naprawiono
- **Layout Sidebar:** Usunięto nadmiarowy znacznik `</div>`, który powodował rozbicie struktury siatki (grid) i wyrzucanie elementów poza boczny panel.
- **Summary Table:** Przywrócono brakujący element HTML `summaryArea` w kontenerze wyników, co przywróciło widoczność tabeli podsumowującej po wygenerowaniu faktur.
- **Czystość UI:** Usunięto zdublowane opisy trybów pracy w panelu bocznym.

### Przywrócono (Rollback)
- Przywrócono oryginalną logikę kopiowania danych (`innerText`) w funkcji `copyTableData` – rozwiązuje to chwilowe problemy z sumowaniem w QuickBooks, przywracając stan stabilny sprzed eksperymentów z `data-value`.
- Przywrócono standardowe zaokrąglanie stawek (`toFixed(2)`) w procesie mapowania danych AdRice.

---

## [2.0.5] - 2026-04-22
### Dodano
- **Summary Table:** Wprowadzono wizualną tabelę podsumowującą na górze widoku wyników (TrendiSupply, TradeExpress, EuroFlex, SmartMedia).
- **Przycisk Kopiuj Nazwę:** Dodano małe ikony schowka przy każdej nazwie oferty w tabeli wyników, ułatwiające szybkie kopiowanie nazwy do faktury.

---

## [2.0.0] - 2026-04-15
### Dodano
- **System Archiwum:** Wprowadzono plik `history.html` oraz logikę zapisu faktur do LocalStorage, umożliwiając przeglądanie archiwalnych rozliczeń.
- **System Korekt (Adjustments):** Dodano możliwość przenoszenia nadpłat/niedopłat na kolejne miesiące.
- **Nowy Design:** Wprowadzono styl "Glassmorphism" oparty na bibliotece Inter i ciemnych gradientach.

---

## [1.0.0] - Wersja Pierwotna
- Podstawowy generator faktur z 8 plikami wejściowymi.
- Prosty eksport do formatu TSV (Excel/Google Sheets).
