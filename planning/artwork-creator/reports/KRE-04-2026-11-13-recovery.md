# KRE-04 — kolejne odzyskanie po awarii prądu

Data: **2026-11-13**. **Etap nadal w toku.** Ten raport uzupełnia
[poprzedni punkt odzyskania](KRE-04-2026-11-13.md).

## Odzyskany stan i zakres kontynuacji

Na dysku znajdowały się zmiany nowsze niż wcześniejszy raport: formularze
narzędzi i składania sceny (`production-controls.tsx`, `scene-assembly.ts`),
sterowanie otoczeniem draftu (`draft-environment.ts`), prywatny import pilota
(`artwork-starters.*`, zasoby w `apps/api/resources/artwork-starters/night-garden`),
klient/sesja/tłumaczenia oraz rozpoczęty test rzeczywistego API i UI.
Ostatni skrypt urywał się przed generacją, próbując wpisać tekst do przycisku.
W pierwotnym katalogu `.local/kre04/runs/acceptance-1794600238842` pozostały
metadane izolowanej bazy i sesji; brakowało dowodu ukończenia testu.

Kontynuacja objęła:

- `apps/api/scripts/test-artwork-creator-real.cjs`: właściwy podkatalog
  magazynu audio `files`, odświeżenie zapisanej sesji, odczyt stanu `--inspect`
  bez wypisywania tokenów oraz osobne warianty prób podglądu i narzędzi.
- `apps/ui/tests/artwork-creator-real.browser.mjs`: rzeczywiste operacje
  przez formularze UI, zapis punktu wznowienia generacji i wyników narzędzi,
  oczekiwanie na potwierdzoną pauzę i zapis rewizji. Gotowość przycisku Play
  nie jest dowodem odtwarzania; test czeka na działający wspólny silnik.
- `production-controls.tsx`: nazwy pól obrazu/maski/roli, pozwalające
  jednoznacznie obsługiwać formularze i sprawdzać ich zachowanie.
- Testy sesji: ponowienie niepewnego enqueue narzędzia z tym samym kluczem,
  osobny klucz dla zmienionych wejść i zachowanie pełnych zależności wyniku.
  Usunięto też błędy lint odzyskanego testu serwisu startera.

Nie zmieniano ustawień pamięci, zasad dopuszczania modeli ani danych użytkownika.
Nie publikowano scen, nie wykonywano commitów, migracji głównej bazy ani KRE-05–08.
Izolowane bazy testowe, artefakty i poprzednie sesje zachowano.

## Potwierdzone wyniki

Środowisko: Node 25.8.2, Next.js 16.4.2; istniejące lokalne modele i Chromium.
Build UI ponownie potwierdził zgodność katalogów tłumaczeń PL/EN/ES.

- Root: `pnpm --filter api build`, `pnpm --filter ui build`: **OK**.
- `apps/ui`: `node --experimental-strip-types --test tests/artwork-preview.test.mjs tests/artwork-production.test.mjs tests/artwork-creator.test.mjs tests/artwork-proxy.test.mjs tests/infinite-zoom-artwork.test.mjs`: **44/44**.
- `apps/api`: `pnpm exec jest --runInBand artwork-starters.service.spec.ts`: **2/2**.
- ESLint modułów formularzy, testów UI i modułów startera API: **OK** po korektach.
- `apps/ui`: `node tests/artwork-creator.browser.mjs`: **OK** na kontrolowanym
  backendzie; ciągłość audio/canvas/WebGL, projekt/plan/historia, anulowanie,
  podgląd, języki, mobile i kontrola dostępu nadal przechodzą.
- `apps/api`: `node scripts/test-artwork-creator-real.cjs --directory D:/Sandbox/sounds-server/.local/kre04/runs/acceptance-1794601340721 --starter-only`: **OK** z rzeczywistym
  API, JWT, PostgreSQL i osobnym workerem. Prywatna kopia 17 zasobów/7 warstw,
  `buildPreviewPackage`, odtwarzanie MP3 przez rzeczywisty magazyn i BFF,
  podgląd animowany, blackout/reveal, zoom, pauza oraz reload projektu.

[Wynik rzeczywistego podglądu](evidence/kre04-recovery-2026-11-13/starter-summary.json),
[zaciemnienie](evidence/kre04-recovery-2026-11-13/starter-blackout.png),
[lot i zoom](evidence/kre04-recovery-2026-11-13/starter-flight-zoom.png).
Nagranie pozostaje lokalnie:
`.local/kre04/runs/acceptance-1794601340721/ui-qa/starter-motion.webm`.
Przejrzano klatki nagrania w odstępach 6 s (początek, odsłanianie, lot i zoom),
poza osobnymi zrzutami blackout/normal/reveal. Materiałowe kolory i przesunięcie
drona są widoczne; cienka sylwetka i ziarniste granice kamienia/mchu nadal
wymagają korekty/oceny. To istniejący pilot KRE-03 ze wspólnymi wytycznymi
v1.7, bez nowej generacji ani produkcyjnego odbioru grafiki. Nie deklarujemy
sprawdzenia każdej klatki, całej jakości cieni lub nowych masek z samych zrzutów.

## Rzeczywiste narzędzia i złożenie paczki przez UI

`apps/api`: `node scripts/test-artwork-creator-real.cjs --directory D:/Sandbox/sounds-server/.local/kre04/runs/acceptance-1794602059331 --tools-from-starter`: **OK**.
Osobna izolowana baza, rzeczywiste SAM i LaMa na zapisanym źródle KRE-03,
wydzielenie przezroczystego obiektu, odtworzenie tła, maska całego obrazu,
selekcja detali światła, mapy wpływu/opóźnienia i czarne pokrycie. Wszystkie
operacje zlecono formularzami aplikacji. Zapisano czterowarstwową rewizję,
zbudowano `buildPreviewPackage` i otwarto 26-sekundowy podgląd lotu.
Końcowe ponowienie odzyskało zapisane wyniki bez ponownej inferencji narzędzi.

[Wynik testu](evidence/kre04-recovery-2026-11-13/tools-summary.json),
[artefakty i projekt](evidence/kre04-recovery-2026-11-13/tools-artifacts.json),
[zadania w bazie](evidence/kre04-recovery-2026-11-13/tools-jobs.json),
[początek](evidence/kre04-recovery-2026-11-13/production-preview.png),
[koniec lotu](evidence/kre04-recovery-2026-11-13/production-flight-end.png).

**Granice tej próby:** to techniczne potwierdzenie formularzy i nowej paczki,
nie odbiór artworku. W uproszczonej selekcji pozostają drobne kopie dronów
w tle i niedokładności konturu. Nie przygotowano w tej próbie maski filaru,
osobnej warstwy lamp ruchomego obiektu ani pełnego QA nowych granic w zoomie.
Przejrzano początek/koniec nowego podglądu; nie ma osobnego nagrania tej
czterowarstwowej wersji. Nagranie 7-warstwowego pilota powyżej nie zastępuje
tego brakującego dowodu. Nowa generacja Klein nadal nie jest potwierdzona.

### Powrót niestabilnej asercji Resetu

`apps/ui`: `node tests/infinite-zoom-renderer.browser.mjs --pilot-only`:
pierwsza próba **FAIL**, maksymalna różnica kanału po Reset **1**, identyczny
stan instancji i brak zmienionych warstw. To odtworzenie problemu z wcześniejszego
raportu, a nie wyjaśniony błąd. Rozszerzono wyłącznie diagnostykę testu o
kamerę i ponowne renderowanie klatki początkowej; nie zmieniono asercji.
Ponowienie **OK**: 12 operatorów, parkowanie/Reset draftu, rollback GPU,
stały kontekst, zachowanie podróży, bounded resources, pion/szeroki kadr.
**Przyczyna niestabilności nadal nieustalona.** Wynik kolejnej udanej próby
nie usuwa tego ryzyka ani nie oznacza technicznego zamknięcia KRE-04.

`git diff --check`: **OK**. Źródła API/UI zbudowano przed próbami; końcowe
zmiany skryptów/testów sprawdzono ponownie lintem i testami 44/44 oraz 2/2.

## Odroczona generacja i bezpieczne wznowienie

Rzeczywista próba z formularza uruchomiła `generateImage` i fazę `encode`,
po czym bramka ustawiła **queued / MEMORY_DEFERRED**. Nie powstał obraz
potwierdzający ukończenie inferencji Klein. Ostatni zapis miał około
7,34 GiB wolnego commit przy wymaganych 10 GiB, mimo około 14,6 GiB
dostępnego RAM i 11 GiB VRAM. Nie obniżano progów.

[Zapis projektu i zadania](evidence/kre04-recovery-2026-11-13/deferred-generation.json).
Projekt: `1c7a16c5-f510-4767-8052-16f36e1f66df`.
Zadanie: `6374a9e6-12ce-4768-80a7-c02a7baae7c5`.
Katalog: `.local/kre04/runs/acceptance-1794601340721`.
Punkt klienta: `ui-qa/production-state.json`. Kolejka i wejściowa rewizja są
w bazie; wznowienie ma odzyskać to zadanie, zamiast zlecać drugą generację.

Użytkownik odpowiedział „Ta, dam znać” na prośbę o zwolnienie pamięci.
W chwili tego zapisu czekano na sygnał przed ponowieniem Klein.
**Zastąpione wynikiem udanego wznowienia poniżej.** Polecenie z `apps/api`:

```powershell
node scripts/test-artwork-creator-real.cjs --directory D:/Sandbox/sounds-server/.local/kre04/runs/acceptance-1794601340721
```

Sesja testowa jest prywatnym plikiem w ignorowanym katalogu; nie kopiować jej
do dowodów ani Gita. Jeżeli odświeżenie sesji zwróci 401, przerwać i odtworzyć
autoryzację fixture, zachowując bazę i projekty. Awaria/odroczenie nie oznacza
ukończenia KRE-04.

## Wznowienie po zwolnieniu pamięci — 2026-11-13

Po sygnale użytkownika „Zwolniłem pamięć” uruchomiono powyższe polecenie
na istniejącym katalogu i bazie. **Wynik: OK, kod wyjścia 0.** Nie tworzono
drugiego zadania generacji: zakończyło się wcześniej odroczone
`6374a9e6-12ce-4768-80a7-c02a7baae7c5`. Zapisany pomiar tego zadania:
około 20,9 GiB dostępnego RAM, 16,4 GiB commit i 14,3 GiB VRAM.
Nie zmieniano bramki pamięci ani ustawień Windows.

Potwierdzono rzeczywisty przepływ przez formularze aplikacji i trwałą kolejkę:
Klein 1024×576 → SAM → wydzielenie obiektu → LaMa → maska całości → selekcja
materiałowych detali → mapa wpływu → mapa opóźnienia → czarne pokrycie → zapis
czterowarstwowej rewizji → budowa paczki → otwarcie 26-sekundowej animacji
z istniejącym odtwarzaczem audio. Test potwierdza `sourceGenerationInference`,
`modelInference` oraz `layeredProduction`. Próba podglądu pilota w tym samym
uruchomieniu ponownie sprawdziła blackout, reveal, zoom, pauzę, reload i jeden
kontekst. Nie należy przenosić tych ostatnich asercji na uproszczoną nową scenę.

[Pełny wynik wznowienia](evidence/kre04-recovery-2026-11-13/resumed-summary.json),
[zadania i pomiary](evidence/kre04-recovery-2026-11-13/resumed-jobs.json),
[wyjściowe artefakty](evidence/kre04-recovery-2026-11-13/resumed-artifacts.json),
[początek animacji](evidence/kre04-recovery-2026-11-13/resumed-preview.png),
[koniec lotu](evidence/kre04-recovery-2026-11-13/resumed-flight-end.png).

Przejrzano wygenerowane źródło i oba krańcowe kadry nowego podglądu. Pozostają
małe drony wypalone w tle, resztka poświaty po usunięciu głównego drona,
niedokładności konturu i brak docelowego przesłaniania filarem. Nowa paczka
nie ma osobnej chronionej warstwy lamp drona. Nie nagrano osobnego pełnego
ruchu/zoomu tej wersji. Te ograniczenia wymagają dalszych korekt i weryfikacji
według wspólnych wytycznych v1.7; nie jest to artwork odebrany produkcyjnie.

**Blokada pamięci została usunięta. KRE-04 pozostaje w toku** ze względu na
opisaną jakość/kompletność QA i niestabilną asercję Resetu. Kolejny krok to
stabilizacja i odbiór, a nie ponowna generacja z powodu starego odroczenia.
W tym wznowieniu nie zmieniano kodu runtime ani testów: zaktualizowano raport,
statusy planu i dowody. KRE-05–KRE-08 nadal nie rozpoczęto.
