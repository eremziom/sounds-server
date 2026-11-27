# KRE-04 — przesłanianie drona przez filar przez formularze UI

**Aktualizacja po tym przyroście:** etap zamknięto funkcjonalnie;
[raport zamknięcia](KRE-04-2026-11-14-closure.md) opisuje ponowione testy
i aktualny hash nagrania lokalnego. Poniższe wyniki i ograniczenia pozostają
historycznym zapisem tej próby; późniejsze powtórzenie zastąpiło lokalne WebM
pod tą samą ścieżką, zachowując osobne dowody raportu w repozytorium.

Data: **2026-11-14**. **Etap nadal w toku.** Kontynuacja
[wcześniejszego QA](KRE-04-2026-11-14.md).

## Wynik

Na zapisanej generacji KRE-04 wykonano rzeczywiste SAM → registerMap →
zapis rewizji → buildPreviewPackage przez formularze kreatora. Dron teraz
chowa się za filarem i pojawia po jego prawej stronie. Nie regenerowano
źródła, nie edytowano ręcznie wynikowych PNG ani manifestu. Silnik i aplikacyjny
runtime pozostają bez zmian. To korekta w izolowanej bazie odbiorowej, bez
publikacji do biblioteki i bez zmiany głównej bazy użytkownika.

- Projekt: `1c7a16c5-f510-4767-8052-16f36e1f66df`.
- Poprzednia rewizja, zachowana w historii:
  `b4a3a1d6-7648-49b1-a17b-1cb4a25cbcd1`.
- Nowa rewizja: `dd2d57b7-b21b-48fa-b437-cebe2566a6b6`.
- Zadanie SAM: `eefbf1f4-8191-4d03-8e5f-9c5e8ae5b263`.
- Zadanie rejestracji: `fe0777b8-e1af-4296-82d6-52b24eb124f0`.
- Końcowa maska: `3ca05769-6866-4e17-b559-3ff6c0103056`.

Zastosowanie wspólnych wytycznych v1.7, zakres i granice korekty opisuje
[brief](../pilots/gate-drone/kre04-correction-brief.md). Źródło ma 1024×576,
canvas silnika 3840×2160; nie deklarujemy natywnego 4K. Maska przesłaniania
pozostaje w współrzędnych nieruchomej sceny, osobno od widoczności drona
i map wpływu/opóźnienia światła. SAM otrzymał trzy punkty dodatnie na filarze
oraz dwa ujemne w otoczeniu, z rolą `occlusion-mask`.

[Zadania, rzeczywiste wskazania i pomiary pamięci](evidence/kre04-occlusion-2026-11-14/correction-jobs.json),
[pochodzenie, hashe i rejestracja artefaktów](evidence/kre04-occlusion-2026-11-14/correction-artifacts.json),
[zapisany projekt](evidence/kre04-occlusion-2026-11-14/corrected-project.json),
[maska](evidence/kre04-occlusion-2026-11-14/registered-mask.png).

## Zmiany w repozytorium

- `apps/api/scripts/test-artwork-creator-real.cjs`: warianty
  `--correct-production` i `--correction-only` uruchamiają istniejące UI
  na zachowanym projekcie.
- `apps/ui/tests/artwork-creator-real.browser.mjs`: formularze segmentacji
  z punktami ujemnymi, rejestracji i składania, trwały punkt wznowienia przed
  enqueue, sprawdzenie serwerowego wyniku przy odzyskaniu, jawna kontrola
  rodzica rewizji oraz zachowania pozostałych warstw, parametrów lotu, briefu
  i decyzji. Wznowienie sprawdza brak nowych zadań. Materiał nowej rewizji
  trafia do osobnego katalogu `ui-qa/corrected-occlusion`, zachowując starsze
  nagranie i jego hash. Dodano zrzuty po 10, 11, 12 i 13 s lotu.
- `apps/ui/tests/helpers/infinite-zoom-pilot-browser-fixture.mjs` i
  `apps/ui/tests/infinite-zoom-renderer.browser.mjs`: trwała diagnostyka
  pierwszego ponownego rysowania, również po błędzie, z liczbą zmienionych
  kanałów, próbkami, formatem bufora i porównaniem stanu. Opcjonalny
  `--pilot-high-precision` bada ustawienie `highPrecisionColor:true` stosowane
  w aplikacji, nie zmieniając domyślnego testu RGBA8 ani jego asercji.
- Brief, ten raport, dowody i statusy dokumentacji.

Nie rozpoczęto KRE-05–08, nie dodawano edytora masek ani operatorów silnika.
Nie zmieniano progów pamięci. Dla SAM zapisano około 13,6 GiB dostępnego RAM,
10,4 GiB VRAM i 7,0 GiB commit; użyto istniejącej bramki właściwej dla SAM,
bez uruchamiania Klein. Wersja modelu i narzędzi jest w pochodzeniu artefaktu.

## Ruch i granice odbioru

Końcowe nagranie **52,03 s / 12 785 232 bajty** znajduje się lokalnie:
`.local/kre04/runs/acceptance-1794601340721/ui-qa/corrected-occlusion/production-motion.webm`.
SHA-256: `226878673d663fdbb5ab626ac46942fd35b0cf518499d6276f54dd1c21b9a7d3`.

Przejrzano klatki pierwszych 15 s co sekundę, w tym wejście za filar,
zasłonięcie i wyjście po drugiej stronie, oraz osobne zrzuty przy przejściu.
[Sekwencja](evidence/kre04-occlusion-2026-11-14/occlusion-motion-review.png),
[11 s](evidence/kre04-occlusion-2026-11-14/qa-production-flight-11.png),
[12 s](evidence/kre04-occlusion-2026-11-14/qa-production-flight-12.png),
[13 s](evidence/kre04-occlusion-2026-11-14/qa-production-flight-13.png).

Rzeczywisty test ponownie przeszedł 26 s lotu i późniejsze blackout/reveal,
zoom, pauzę, zamrożenie po Resecie, reload oraz powrót do tej samej instancji
audio/canvas/kontekstu. W próbkach zachowano nieprzezroczyste pokrycie;
w blackout około 88,64% pikseli jest dokładnie czarnych, a chronione obszary
dalej zmieniają obraz. [Wynik](evidence/kre04-occlusion-2026-11-14/production-qa-summary.json).
Nie przenosimy tych technicznych asercji na odbiór jakości wszystkich granic.

**Ograniczenia:** SAM pozostawił drobne otwory we wnętrzu sylwetki filara
i nie obejmuje całej podstawy. Przejrzany przelot korzysta z wyższego odcinka
filara, lecz maska nie jest odebrana jako precyzyjna maska całej architektury.
Granica kamienia/mchu i potencjalne przecieki przez małe otwory wymagają
dalszej kontroli w zbliżeniu. Nadal pozostają małe drony w tle, poświata po
usuniętym obiekcie, cienki kontur drona, ziarnista selekcja światła i brak
osobnych chronionych lamp drona. Nie zmieniano tych masek ani materiałów
w tym przyroście. Nie deklarujemy pełnego odbioru artworku ani oceny każdej
klatki cieni i przepływu kolorów.

## Testy i diagnostyka pierwszej klatki

Z `apps/api`:

```powershell
node scripts/test-artwork-creator-real.cjs --directory D:/Sandbox/sounds-server/.local/kre04/runs/acceptance-1794601340721 --correct-production
node scripts/test-artwork-creator-real.cjs --directory D:/Sandbox/sounds-server/.local/kre04/runs/acceptance-1794601340721 --correct-production --correction-only
```

Obie próby **OK, kod 0**. Pierwsza zleciła rzeczywiste SAM/rejestrację
i nową rewizję; kolejne odzyskały wyniki. Końcowa krótka próba potwierdza
zachowanie kompozycji i brak nowej inferencji, zadań oraz rewizji podczas
odzyskania. [Wynik odzyskania](evidence/kre04-occlusion-2026-11-14/correction-recovery-summary.json).
`modelInference:false` w wyniku powtórzonego QA opisuje ponowienie; rzeczywistą
wcześniejszą segmentację dokumentują zadania i pochodzenie maski.

- `apps/ui`: `node --experimental-strip-types --test tests/artwork-preview.test.mjs tests/artwork-production.test.mjs tests/artwork-creator.test.mjs`: **27/27**.
- ESLint trzech zmienionych testów UI: **OK**.
- `apps/api`: `node --check scripts/test-artwork-creator-real.cjs`: **OK**.
- `git -c core.safecrlf=false diff --check`: **OK**.
- Nie powtarzano buildów aplikacji: zmieniono skrypty odbioru i dokumentację,
  a korekta paczki powstała jako dane przez istniejące produkcyjne UI/API.

**Nieudane testy pozostają otwarte:**

- `node tests/infinite-zoom-renderer.browser.mjs --pilot-only`: **FAIL**
  przed Resetem, 2 kanały RGB o 1/255. Identyczne próbki jak we wcześniejszej
  diagnostyce, niezmieniony stan i kamera, RGBA8, brak oczekujących opcjonalnych
  zasobów i wyłączony dithering wyjściowy.
- To samo z `--pilot-high-precision`: **FAIL**, 3 kanały RGB o 1/255,
  niezmieniony stan i kamera, RGBA16F z ditheringiem wyjściowym.

[Diagnostyka RGBA8](evidence/kre04-occlusion-2026-11-14/rgba8-diagnostics.json),
[diagnostyka RGBA16F](evidence/kre04-occlusion-2026-11-14/rgba16f-diagnostics.json).
Nie jest to problem ograniczony wyłącznie do formatu zastępczego RGBA8.
Nie ustalono przyczyny na poziomie GPU/renderowania; nie wprowadzono
tolerancji, synchronizacji ani obejścia runtime. Asercje pozostają ścisłe.

KRE-04 nadal wymaga wymienionych korekt jakości, pełnego QA poprawionej sceny
i wyjaśnienia niestabilności pierwszego odczytu. Ten przyrost usuwa widoczne
przelatywanie drona przed filarem w przejrzanym odcinku oraz potwierdza
wykonanie i odzyskiwanie korekty przez UI.
