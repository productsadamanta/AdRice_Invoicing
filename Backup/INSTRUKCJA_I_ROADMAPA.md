# 🗺️ Roadmapa Fakturowania: AdRice Invoicing Hub v2

Ten dokument to Twoja "biblia" fakturowania. Podążaj za krokami, aby Twoje rozliczenia były zawsze zgodne z Amspedem co do jednego leada.

---

## 🏁 ETAP 1: Wielkie Przejście (Marzec 2026)
*Cel: Poinformowanie Hub-a o tym, co już wystawiłeś na starych, ręcznych fakturach do 22 marca.*

### Krok 1: Przygotowanie "Zasilenia" (Seeding)
1. Otwórz swój arkusz Excel, gdzie śledziłeś stare faktury.
2. Przygotuj plik tekstowy (CSV) z dwiema kolumnami: `#NumerOferty;SumaZafakturowanychLeadów`.
   *Przykład:*
   ```text
   2919;120
   2040;55
   ```
3. W Hubie upewnij się, że wybrany jest **Marzec 2026**.
4. Kliknij **"Zasil Bazę z Pliku"** i wgraj ten plik CSV. Hub teraz "wie", że te lidy są już opłacone.

### Krok 2: Pierwsza "Nowa" Faktura za Marzec
1. Wygeneruj w Amsped raport Performance za okres **1.03 - 31.03** (cały miesiąc).
2. Wgraj go do Hub-a.
3. Spójrz na kolumnę **"NOWA FAKTURA"**. To, co tam widzisz, to suma Twoich manek (starych zaległości) + nowych lidów z końcówki marca.
4. Wystaw fakturę na te kwoty.
5. Kliknij **"Zatwierdź i Zapisz Stan"**. 
   *Teraz Marzec jest w 100% zamknięty i Hub ma idealny stan końcowy.*

---

## 📅 ETAP 2: Cykl Tygodniowy (Kwiecień i dalej)
**Złota Zasada:** Każdy raport generujesz od **1. dnia aktualnego miesiąca** do wczoraj/dzisiaj.

### 🆕 NOWOŚĆ: TRYB PRACY (HUB v3.0)
Na górze panelu masz teraz przełącznik trybu faktury:

1.  **AUTOMAT (Cały miesiąc od 1-go)** — **ZALECANE**
    - Wgrywasz raport od 1. dnia do dziś.
    - System sam odlicza stare faktury i znajduje "top-upy".
    - Używaj tego trybu w **ŚRODY** (lub zawsze, dla pełnego bezpieczeństwa).

2.  **KONTROLA (Wybrany zakres np. Pt-Nd)** — **Dla Twojej wygody**
    - Wgrywasz raport tylko za konkretne dni (np. tylko ostatni weekend).
    - Hub zafakturuje **dokładnie to, co widzi w pliku** (bez odejmowania bazy).
    - Po zatwierdzeniu, system doda te lidy do licznika miesięcznego.
    - Używaj tego trybu w **PONIEDZIAŁKI i PIĄTKI**, jeśli wolisz stare nawyki.

---

### 🔵 PIĄTEK (Bieżące fakturowanie)
1. **Tryb:** Wybierz **KONTROLA (Wybrany zakres)**.
2. Amsped: Eksportuj raport Performance za okres **Poniedziałek - Czwartek**.
3. Hub: Wgraj plik -> Generuj.
4. **Faktura:** Zobaczysz ilości 1:1 z Amsped.
5. **Akcja:** Klikasz **"Zatwierdź i Zapisz Stan"**.

### 🔵 PONIEDZIAŁEK (Weekend)
1. **Tryb:** Wybierz **KONTROLA (Wybrany zakres)**.
2. Amsped: Eksportuj raport Performance za okres **Piątek - Niedziela**.
3. Hub: Wgraj plik -> Generuj.
4. **Faktura:** Zobaczysz ilości 1:1 z Amsped.
5. **Akcja:** Klikasz **"Zatwierdź i Zapisz Stan"**.

### 🟡 ŚRODA (Dofakturowanie / Top-up)
1. **Tryb:** Wybierz **AUTOMAT (Cały miesiąc)**.
2. Amsped: Eksportuj raport Performance za okres **1. dzień m-ca - ostatnia niedziela**.
3. Hub: Wgraj plik -> Generuj.
4. **Faktura:** Hub sam porówna ten raport z Twoimi fakturami z piątku i poniedziałku. Jeśli po drodze "wskoczyły" jakieś spóźnione lidy, pokaże je jako **"NOWA FAKTURA"**.
5. **Akcja:** Klikasz **"Zatwierdź i Zapisz Stan"**.

---

## 💡 Ważne Zasady Bezpieczeństwa

> [!IMPORTANT]
> **Zawsze "Zatwierdzaj":** Przycisk "Zatwierdź" to jedyny sposób, żeby Hub zapamiętał, że już wystawiłeś fakturę. Bez tego w następnym raporcie system pokaże Ci te same lidy jeszcze raz.

> [!WARNING]
> **Ujemna Delta:** Jeśli w kolumnie "NOWA FAKTURA" widzisz minus (np. -5), oznacza to, że w Amsped ubyło lidów (zwroty). Zgodnie z Twoją procedurą: **nie wystawiaj faktury korygującej**, tylko poczekaj do końca miesiąca. System sam to wyrówna w kolejnym tygodniu.

> [!TIP]
> **Kopie Zapasowe:** Raz w tygodniu (np. w piątek po fakturowaniu) kliknij **"Eksportuj Bazę"**. Zapisz ten plik JSON w folderze `backup`. W razie awarii przeglądarki, po prostu go zaimportujesz i wszystko wróci do normy.
