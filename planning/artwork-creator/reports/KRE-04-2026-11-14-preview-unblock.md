# KRE-04 — nieaktywne przyciski podglądu w lokalnej aplikacji

Data: 2026-11-14. Zgłoszenie użytkownika po zamknięciu funkcjonalnym:
wybrany projekt „Nocny ogród — dron” nie pozwala przygotować ani otworzyć animacji.

## Przyczyna i poprawka

W głównej lokalnej bazie znaleziono trzy kopie pilota z zadaniami
`buildPreviewPackage` w kolejce. Dwa zadania dotyczyły starszych rewizji.
Komponent kreatora blokował oba przyciski, gdy dowolne zadanie projektu
było `queued`/`running`, również dla starej rewizji lub przy gotowym podglądzie.
Nie było komunikatu rozróżniającego brak paczki od oczekiwania na wykonawcę.
Zwykłe `pnpm dev` uruchamia wyłącznie API/UI; wcześniejsze testy rzeczywistego
API startowały własnego wykonawcę, więc nie weryfikowały tego lokalnego uruchomienia.

- `artwork-creator.tsx`: inne zadania nie blokują panelu podglądu. Nadal
  obowiązuje blokada podczas zapisu i dla niezapisanych zmian.
- `draft-preview-controls.tsx`: przygotowanie blokuje wyłącznie oczekujące
  zadanie podglądu bieżącej rewizji, oprócz dotychczasowej walidacji i lokalnego
  ładowania. Gotowy podgląd można otworzyć mimo innego zadania w kolejce.
- `messages/{pl,en,es}.json`: komunikat oczekiwania z informacją o wykonawcy.
- `artwork-creator.browser.mjs`: regresja starego zadania, blokada duplikatu
  bieżącego podglądu, komunikat kolejki oraz otwarcie gotowej paczki mimo kolejki.
- Główny `README.md`: jawny krok uruchomienia osobnego wykonawcy.

Uruchomiono wykonawcę dla głównej lokalnej bazy. Pierwsza próba w sandboxie
została odroczona przez `MEMORY_TELEMETRY_UNAVAILABLE`; po zgodzie wykonawcę
uruchomiono poza sandboxem i zakończono własny proces ograniczonej próby.
Potwierdzono sukces zadania `962059ce-fb14-4e4f-841e-e08bdff8de77` dla aktywnej
rewizji `64e5472a-1948-48d7-8bcb-a4af6210680b`. Nie zmieniano snapshotów projektów,
nie omijano bramki pamięci, nie uruchamiano nowej generacji obrazu ani nie
sterowano audio użytkownika. Zmiana rewizji nadal wymaga przygotowania jej paczki.

## Weryfikacja

- `apps/ui`: `node --experimental-strip-types --test tests/artwork-preview.test.mjs tests/artwork-production.test.mjs tests/artwork-creator.test.mjs` — **27/27**.
- root: `pnpm --filter ui build` — **OK**, TypeScript i katalogi tłumaczeń OK.
- `apps/ui`: `node tests/artwork-creator.browser.mjs` — **OK**, także nowe asercje regresji i dotychczasowa izolacja audio/WebGL.
- `git -c core.safecrlf=false diff --check` — **OK**.

Wykonawca pozostaje osobnym procesem: po ponownym uruchomieniu środowiska
potrzebuje `pnpm artwork:worker`, zgodnie z README. Nie dodawano automatycznego
uruchamiania modeli do procesu API. Ograniczenia jakości pilota i wcześniejsza
diagnostyka różnicy pierwszej klatki WebGL pozostają bez zmian.
