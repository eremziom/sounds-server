# Etapy wdrożenia kreatora i biblioteki

Plan 1.0, 2026-11-09. Aktualizacja 2026-11-13: **KRE-00 odebrany** jako
benchmark wykonalności z ograniczeniami; [raport zamknięcia](reports/KRE-00-2026-11-13-closure.md).
KRE-01 **wdrożony i sprawdzony technicznie 2026-11-13**;
[raport](reports/KRE-01-2026-11-13.md), [kontrakt](kre01-contract.md).
KRE-02 **odebrany technicznie**: kolejka/narzędzia i rzeczywiste adaptery
Klein/SAM/LaMa 512×288 przy audio sprawdzone; [raport i ograniczenia](reports/KRE-02-2026-11-13.md), [kontrakt](kre02-contract.md).
KRE-03 **wdrożony i sprawdzony technicznie**: rzeczywista paczka przez API,
korekty i podgląd ruchu/zoomu z opisanymi ograniczeniami jakości pilota;
[raport końcowy](reports/KRE-03-2026-11-13-closure.md).
KRE-04–KRE-08 pozostają **niewdrożone**.
Wyniki i bieżący status zapisujemy w [progress.md](progress.md).

Każdy etap ma zakończyć się demonstracją i raportem, nie tylko zestawem plików.
Ścieżki nowych modułów są propozycjami do sprawdzenia przed implementacją.
Nie tworzymy ich wszystkich w ramach przygotowania dokumentacji.

## Kolejność i punkty kontrolne

| Etap | Wynik | Zależność |
| --- | --- | --- |
| KRE-00 | Potwierdzony lokalny zestaw modeli i pomiary | Brak |
| KRE-01 | Projekty, rewizje, artefakty i kontrakty | Wynik KRE-00 |
| KRE-02 | Narzędzia i trwałe zadania lokalnego wykonawcy | KRE-01 |
| KRE-03 | Jedna pełna paczka powstaje przez API bez ręcznej obróbki | KRE-02 |
| KRE-04 | Podstrona kreatora z podglądem i historią | KRE-03 |
| KRE-05 | Rozmowa steruje narzędziami i interpretuje wyniki | KRE-04 oraz test LLM z KRE-00 |
| KRE-06 | Poprawki częściowe i korekta masek | KRE-05 |
| KRE-07 | Publikacja do dynamicznej biblioteki odtwarzacza | KRE-06 |
| KRE-08 | Odbiór kompletnego procesu i stabilizacja | KRE-07 |

Docelowa demonstracja: użytkownik w UI tworzy scenę z promptu, poprawia maskę,
zmienia animację bez regeneracji obrazu, zapisuje i wybiera scenę w odtwarzaczu.
Od tego momentu jej odtwarzanie działa także przy wyłączonych procesach modeli.

## KRE-00 — sprzęt, modele i próba jakości

**Cel:** ustalić, co faktycznie działa na Windows 11, RX 7800 XT 16 GB i 32 GB
RAM, zanim powstanie interfejs oparty na niezweryfikowanych założeniach.

Kroki:

1. Sprawdź środowisko: sterownik AMD, wolny dysk, RAM/VRAM, Python i narzędzia.
   Zapisz wersje bez ujawniania danych sesji i sekretów.
2. Wybierz i sprawdź aktualny backend dla wskazanej karty. Nie utożsamiaj
   obsługi architektury GPU z gwarancją działania wszystkich modeli/dodatków.
3. Uruchom osobno model językowy/wizyjny, Klein 4B, segmentację i uzupełnianie
   tła. Dobierz formaty wag i offload; zachowaj numery wersji oraz źródła.
4. Wykonaj [scenariusze benchmarku](local-model-benchmark.md), także poprawki
   częściowe i ponowienie operacji.
5. Sprawdź, czy aplikacja i podgląd mają wystarczający zapas pamięci po zwolnieniu
   modelu. Zmierz ładowanie i przełączanie modeli, nie tylko samą inferencję.
6. Zapisz raport, rekomendowany zestaw, ograniczenia jakości i czasów. Jeśli
   wariant się nie sprawdzi, porównaj zmianę konfiguracji/modelu przed kolejnym etapem.

**Proponowany zakres:** skrypty diagnostyczne i benchmarkowe, adaptery próbne
poza runtime, raport pod `planning/artwork-creator/reports/`; duże pliki wyników
poza Gitem z opisanym miejscem i hashami. Bez zmian w silniku, muzyce i trasach UI.

**Odbiór:** działające generowanie oraz edycja, segmentacja z korektą, uzupełnienie
tła, analiza obrazka i rzeczywiste wywołania narzędzi przez LLM; zapisany czas
zimny/ciepły, pamięć i wynik jakościowy. Każdy krytyczny scenariusz ma wynik lub
jawnie opisaną alternatywę zaakceptowaną przed dalszą implementacją.

**Testy:** powtarzalny zestaw wejść i seedów; brak niekontrolowanego OOM;
przełączenie modeli i odzyskanie po błędzie. Nie deklarujemy konkretnych sekund
ani równoległego działania wszystkich modeli bez pomiarów.

## KRE-01 — kontrakty i przechowywanie projektu

**Cel:** model danych, który odróżnia rozmowę, projekt roboczy, artefakt i
opublikowaną paczkę. Szkic encji: [architecture.md](architecture.md).

Kroki:

1. Zaprojektuj schemat briefu, warstw, rewizji i zależności artefaktów; odnieś
   go do aktualnego `ArtworkPackage`, bez duplikowania kontraktu silnika.
2. Ustal odpowiedzi API i błędy, identyfikatory, referencje do zasobów oraz
   sposób przechowywania wersji i pochodzenia.
3. Dodaj modele Prisma i przeglądalną migrację; testuj migrację na bazie
   developerskiej zgodnie z jej zasadami, nie resetując danych aplikacji.
4. Dodaj operacje tworzenia/odczytu projektu, rewizji i historii.
5. Utwórz magazyn artefaktów oddzielony od audio oraz sprawdzanie uprawnień
   właściciela. Duże obrazy nie trafiają do rekordów wiadomości.
6. Zdefiniuj, jak nowa rewizja unieważnia zależne wyniki oraz jak przywracamy
   starszy stan bez nadpisywania opublikowanej wersji.

**Proponowany zakres:** `apps/api/prisma/`, nowy moduł `apps/api/src/artworks/`,
kontrakty kreatora we współdzielonym miejscu wybranym po sprawdzeniu workspace.
Brak przebudowy ApplicationRuntime i MediaRuntime.

**Odbiór:** projekt i historia przetrwają restart; właściciel widzi swoje pliki;
rewizja ma jednoznacznych rodziców i wejścia. Manifest runtime nie zawiera
historii czatu ani zależności od działających modeli.

**Testy:** schematy i błędy API, własność, zapis/odczyt, izolacja rewizji,
konflikt zmiany oraz brak podpięcia masek do innego obrazu.

## KRE-02 — narzędzia, wykonawca i trwałe zadania

**Cel:** zamienić operacje wykonywane ręcznie przez agenta w kontrolowane,
powtarzalne funkcje aplikacji.

Kroki:

1. Utrwal rejestr narzędzi i schematy wejść/wyjść z architektury.
2. Dodaj wybrany lokalny wykonawca i adaptery modeli potwierdzone w KRE-00.
   Konkretne środowisko Python ma przypięte wersje niezależne od Node.
3. Dodaj kolejkę zadań, postęp, anulowanie, ponowienia i odzyskiwanie po restarcie.
4. Ustal pojedynczą ciężką operację GPU i potwierdzone zwalnianie pamięci.
5. Zaimplementuj narzędzia obrazu: maski i ich role, rejestrację, selekcję
   materiału, mapy wpływu/opóźnienia oraz budowniczego manifestu.
6. Zapisuj wynik jako artefakt powiązany z rewizją bazową. Spóźniony wynik nie
   zastępuje nowszej rewizji; ponowienie nie stosuje zmiany dwukrotnie.

**Proponowany zakres:** moduły API `artwork-jobs/` i `artwork-tools/`, lokalny
wykonawca np. `apps/artwork-worker/` oraz skrypty uruchamiania; miejsce i język
narzędzi deterministycznych potwierdzamy przed ich utworzeniem.

**Odbiór:** każde narzędzie można wywołać przez aplikacyjny kontrakt; wynik lub
błąd jest widoczny i sprawdzalny. Anulowanie oraz restart nie publikują częściowej
paczki, nie usuwają poprzedniej wersji i nie sterują muzyką.

**Testy:** adaptery na małych rzeczywistych próbkach, kontrakty, restart/przerwanie,
brak pamięci, duplikacja żądania, konflikt rewizji i sprzątanie plików tymczasowych
ograniczone do katalogu operacji. Przygotować deterministyczne fixture'y bez
obowiązku pobierania wielkich wag w zwykłym teście jednostkowym.

## KRE-03 — pierwsza kompletna scena bez ręcznej obróbki

**Cel:** udowodnić proces produkcji przez API/koordynator przed dopracowywaniem UI.
Testowy klient developerski jest tu narzędziem odbioru, nie docelową obsługą produktu.

Kroki:

1. Wybierz scenę pilota po KRE-00; sporządź brief według aktualnych wspólnych
   wytycznych. Nie wpisuj generowania wszystkich 12 efektów jako celu sceny.
2. Przygotuj tło i ruchomy obiekt, komplet odsłanianego obrazu i warstwy.
3. Wydziel widoczność, przesłanianie oraz rzeczywiste materiały świateł; przygotuj
   osobne wpływy i dane opóźnienia zamiast traktować jedną maskę jako wszystkie.
4. Przypisz wspierane efekty, reakcje audio, opcjonalne zaciemnienie i trasę ruchu.
5. Zbuduj paczkę w obsługiwanych wymiarach i formatach. Rozdziel canvas 3840x2160
   od rzeczywistej rozdzielczości źródeł; upscaling nie jest natywnym 4K.
6. Uruchom renderer, obejrzyj pełne cykle i trajektorię, blackout/reveal oraz zoom.
   Skoryguj błędy przez narzędzia, bez ręcznej edycji plików wyjściowych.

**Proponowany zakres:** koordynator, narzędzia i budowniczy paczek oraz fixture
podglądu używający istniejącego silnika. Nie zapisujemy pilota do dotychczasowych
zaakceptowanych scen i nie zmieniamy ich kompozycji.

**Odbiór:** jedna paczka powstaje w całości przez zarejestrowane operacje;
ma pochodzenie i raport techniczny oraz wizualny. Ruch nie ujawnia kopii obiektu
w tle, dziur, obwódek ani błędnej kolejności przesłaniania. Nie zastępujemy
brakującej funkcji narzędzia interwencją programisty w plikach wyniku.

**Testy:** referencje, wymiary, maski i pokrycie, budżet, poprawne dekodowanie,
cykle światła/koloru, pauza/reset, kamera i rzeczywisty WebGL. Nagranie i niepewne
granice są obowiązkowe; testy techniczne nie zastępują akceptacji obrazu.

## KRE-04 — interfejs kreatora

**Cel:** użytkownik przeprowadza podstawowy proces w aplikacji.

Kroki:

1. Dodaj chronioną podstronę kreatora; robocza propozycja URL to
   `/animations/create`, do sprawdzenia z istniejącym routingiem.
2. Udostępnij prompt, referencje, wybór wariantu, postęp/anulowanie i błędy.
3. Dodaj podgląd aktualnej rewizji oraz widok warstw i masek.
4. Dodaj historię, porównanie i powrót do wersji, z zachowaniem rozmowy i wyników.
5. Podepnij podgląd przez istniejący host silnika. Sprawdź wejście/wyjście z
   kreatora bez resetowania muzyki i zaparkowanej podróży.

**Proponowany zakres:** trasa UI, `apps/ui/src/components/artwork-creator/`,
klient API i adapter podglądu. Przed pisaniem kodu Next.js odczytać lokalne
przewodniki wersji zainstalowanej w repozytorium, zgodnie z `apps/ui/AGENTS.md`.

**Odbiór:** użytkownik tworzy projekt, uruchamia rzeczywistą generację, ogląda
warstwy i animację, wraca do projektu po odświeżeniu. Nie musi znać ComfyUI,
formatu manifestu ani ścieżek plików. Na tym etapie część operacji może mieć
przyciski zamiast pełnej rozmowy narzędziowej z etapu KRE-05.

**Testy:** formularz i błędy, odzyskanie projektu, historia, anulowanie, dostęp,
wejście/wyjście z podglądu oraz izolacja audio. Nie tworzyć testów odwzorowujących
wyłącznie układ komponentów bez sprawdzania zachowania.

## KRE-05 — rozmowa sterująca procesem

**Cel:** lokalny model prowadzi tworzenie i poprawki na podstawie intencji.

Kroki:

1. Podłącz model i jego część wizyjną potwierdzone w KRE-00.
2. Przygotuj instrukcję koordynatora: wspólne reguły, stan projektu, aktualny
   katalog możliwości silnika i definicje narzędzi.
3. Waliduj wywołania i przekazuj rzeczywiste wyniki do rozmowy. Zapisuj historię
   w projekcie; nie przekazuj modelowi wszystkich binarnych plików naraz.
4. Obsłuż doprecyzowanie obiektu/obszaru oraz obrazowe wskazanie użytkownika.
5. Ogranicz pętlę automatycznych poprawek do jawnego budżetu prób; po jego
   wyczerpaniu pokaż problem i zachowaj najlepszy dostępny wynik.
6. Odróżniaj rozmowę o pomyśle, zlecenie operacji i świadome zastosowanie wariantu.
   Nieobsługiwany efekt opisuj jako brak funkcji, nie jako wykonaną zmianę.

**Proponowany zakres:** moduł rozmowy/koordynatora API, adapter lokalnego LLM/VLM,
instrukcje narzędzi i UI czatu. Bez wykonywania dowolnego kodu wygenerowanego
przez model i bez automatycznych zmian w repozytorium produktu.

**Odbiór:** polecenia dotyczące obiektów, kolorów, ruchu i audio wywołują poprawne
narzędzia; model analizuje raport/obraz i może zaproponować korektę. Nie twierdzi,
że operacja zakończyła się sukcesem po błędzie narzędzia.

**Testy:** zestaw polskich promptów, wieloetapowa rozmowa, brakujący obiekt,
niepoprawny parametr, timeout, przerwanie i ponowne wejście do projektu.
Tę samą intencję testujemy także bez LLM na poziomie kontraktu narzędzia.

## KRE-06 — poprawki częściowe i precyzyjne maski

**Cel:** iteracja jakości bez utraty wcześniej zaakceptowanej pracy.

Kroki:

1. Dodaj wskazywanie punktów/obszaru i pędzel dodawania/odejmowania maski.
2. Rozpoznawaj zakres zmiany i przeliczaj wyłącznie wymagane zależności.
3. Obsłuż cofanie, porównanie przed/po oraz zapis korekty i jej przyczyny.
4. Zachowaj maski i rejestrację niezmienionych obrazów; po zmianie obrazu oznacz
   powiązane maski jako wymagające weryfikacji.
5. Dodaj materiał z chromą tam, gdzie neutralne białe elementy mają przechodzić
   przez kolory; utrzymaj kontury, fakturę i ciemne szczeliny.
6. Dodaj matting lub inne narzędzie tylko wtedy, gdy pomiar wykaże potrzebę
   i potwierdzi działanie/warunki użycia konkretnego wariantu.

**Odbiór:** „błysk co 5 sekund” i „lot po łuku” nie uruchamiają generowania całej
sceny; poprawa maski nie zmienia sąsiednich obiektów. „Zmień wygląd statku”
aktualizuje jego zależności bez nadpisania historii i pozostałej kompozycji.

**Testy:** selektywne unieważnianie artefaktów, zapis pędzla w współrzędnych źródła,
krawędzie w zoomie, konflikty rewizji, zachowanie nieruchomych obszarów i pełna
próba wszystkich powyższych poleceń na rzeczywistym projekcie.

## KRE-07 — publikacja i dynamiczna biblioteka

**Cel:** zaakceptowany projekt staje się sceną odtwarzacza, niezależną od AI.

Kroki:

1. Dodaj raport gotowości: kompletność, kontrakt, pamięć, ruch, referencje i QA.
2. Dodaj świadome zapisanie niezmiennej wersji przez użytkownika.
3. Ustal dostarczanie zasobów zgodne z obecną polityką URI i uprawnieniami.
4. Dodaj listę, miniatury i wersje własnych scen w odtwarzaczu, obok przykładów.
5. Integruj wybór przez istniejący mechanizm scen i jego limity pamięci/cache.
6. Sprawdź brak zależności od działających modeli: wyłącz wykonawcę i serwer
   językowy, następnie ponownie otwórz opublikowaną scenę z muzyką.

**Proponowany zakres:** API publikacji/biblioteki/plików, adapter loadera/katalogu
i UI wyboru scen. Parser lub cache zmieniamy tylko w zakresie niezbędnym do
obsługi nowych paczek; nie przepisujemy zaakceptowanego `zoomThrough`.

**Odbiór:** nie ma częściowo opublikowanych wersji; poprzednia działa po edycji
nowej; brak modelu nie blokuje odtwarzania. Powrót do sceny i przełączanie
background/immersive zachowują istniejące zasady sesji.

**Testy:** atomowość, brakujący plik, niedozwolony URI, za duża paczka, odmowa
dostępu, rollback wyboru, audio pause/end/resume, teardown i regresja biblioteki
testowej. Brak nowych portali nie jest niepowodzeniem tego etapu.

## KRE-08 — odbiór i stabilizacja lokalnego MVP

**Cel:** potwierdzić, że użytkownik rzeczywiście może zastąpić obecny ręczny proces.

Kroki:

1. Przeprowadź w UI pełną produkcję co najmniej dwóch różnych scen: architektura/
   precyzyjne światła oraz forma organiczna/złożone kontury. Wszystkie nowe sceny
   spełniają aktualne wspólne wytyczne.
2. Powtórz serię poprawek: wygląd elementu, maska, stały kolor, błysk, trajektoria
   i reakcja na muzykę. Zapisz, które interwencje użytkownika były potrzebne.
3. Sprawdź odświeżenie UI, restart API/wykonawcy, błąd modelu, brak pamięci/dysku,
   anulowanie i powrót do projektu. Nie usuwaj danych użytkownika podczas testów.
4. Sprawdź obciążenie GPU podczas generowania i podglądu oraz dłuższe odtwarzanie
   opublikowanych scen; czas próby zapisz w raporcie, nie deklaruj bez wykonania.
5. Uruchom odpowiednie szersze testy API/UI, buildy i regresję audio/renderera.
   Zapisz dokładne polecenia i wyniki zgodnie ze stanem repozytorium w tym etapie.
6. Sporządź instrukcję instalacji/uruchamiania lokalnego, przypięte wersje modeli,
   sposób backupu projektów i znane ograniczenia.

**Odbiór końcowy:** użytkownik wykonuje proces od promptu do biblioteki bez
Codexa, terminala i ręcznej obróbki plików, z dopuszczoną korektą masek w UI.
Odtwarzanie działa po wyłączeniu AI, a praca kreatora nie narusza muzyki.
Osobno zapisujemy akceptację techniczną i wizualną; braki nie znikają z raportu
po przejściu testów automatycznych.

## Raport zamknięcia każdego etapu

Raport musi zawierać: identyfikator etapu, rzeczywisty zakres plików, wersje
środowiska, wykonane polecenia/testy, dowody, wynik kryteriów odbioru, odstępstwa
i następny krok. Dla modeli dodatkowo źródła/licencje wag i pomiary pamięci/czasu;
dla artworków pochodzenie, wersję wytycznych i pełne QA w ruchu/zoomie.

Brak testów na sprzęcie lub ręczne dokończenie krytycznej operacji poza
aplikacją oznacza ograniczenie albo niezamknięty etap, a nie ukończony MVP.
