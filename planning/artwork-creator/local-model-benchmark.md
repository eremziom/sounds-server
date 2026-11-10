# KRE-00 — plan próby lokalnych modeli

Status: **do wykonania**. Sprzęt zgłoszony przez użytkownika: Windows 11,
AMD Radeon RX 7800 XT 16 GB VRAM, 32 GB RAM.
Nie wykonano instalacji ani inferencji podczas przygotowania dokumentacji.

## Pytania, na które musi odpowiedzieć próba

1. Czy wybrane modele i ich konkretne formaty działają w lokalnym backendzie AMD?
2. Czy można je przełączać bez przekroczenia pamięci systemu i karty?
3. Czy LLM potrafi poprawnie wywołać nasze narzędzia i ocenić ich wynik?
4. Czy obrazy i maski pozwalają uzyskać scenę nadającą się do animacji?
5. Jak długo trwa rzeczywista poprawka, łącznie z ładowaniem i przenoszeniem wag?
6. Które czynności wymagają wskazania obszaru lub ręcznej korekty w przyszłym UI?

## 1. Przygotowanie środowiska

- Zapisz wersję Windowsa, sterownika, CPU, RAM, wolną pamięć i miejsce na dysku.
- Sprawdź aktualną dokumentację AMD/wykonawcy dla `gfx1101`, a nie tylko nazwę
  rodziny Radeon. Rozdziel zgodność PyTorch, backendu i konkretnego dodatku.
- Wybierz odizolowane środowiska i docelowe katalogi wag/wyników. Nie nadpisuj
  środowiska aplikacji ani jej magazynu audio.
- Dla każdego modelu zapisz źródło, wersję/rewizję, hash, wariant i warunki
  użycia. Zapisz wersje instrukcji, bibliotek, format kwantyzacji i wykonawcę.
- Przygotuj sposób pomiaru czasu, RAM/VRAM i wykrycia CPU fallbacku. Działanie
  na CPU nie jest niepowodzeniem małego narzędzia, jeśli czas jest akceptowalny;
  nie można jednak raportować go jako przyspieszenia GPU.

Nie pobieramy wszystkich wariantów jednocześnie. Każdy model przechodzi krótki
test uruchomienia, zanim przejdziemy do porównania jakości.

## 2. Próby funkcjonalne

| ID | Próba | Wymagany dowód |
| --- | --- | --- |
| B-01 | LLM: polski opis -> brief z planem warstw według wytycznych | wejście, struktura briefu i lista braków |
| B-02 | VLM: wskazanie obiektu i problemu w obrazie | zaznaczony obszar porównany z rzeczywistym obiektem |
| B-03 | Narzędzia: wybór funkcji, parametry, błąd i ponowienie | rzeczywisty log wywołań i walidacji; nie samo wygenerowane JSON |
| B-04 | Klein: utworzenie kompozycji 16:9 | prompt, seed, referencje, źródło i rzeczywiste wymiary |
| B-05 | Klein: zmiana wskazanego elementu | porównanie przed/po i ocena niezamierzonych zmian otoczenia |
| B-06 | SAM: wydzielenie obiektu i poprawka punktami/obszarem | maska na obrazie, także w zbliżeniu |
| B-07 | Materiał: selekcja jasnych detali wewnątrz obiektu | maska zachowująca ciemne szczeliny; rola kodu, SAM i korekty |
| B-08 | LaMa: tło po usuniętym obiekcie | przed/po, brak duplikatu i ocena ciągłości tła |
| B-09 | Sekwencja LLM -> generator -> segmentacja -> narzędzie | czasy przełączania, pamięć i komplet artefaktów |
| B-10 | Ponowienie, anulowanie/przerwanie i ponowne uruchomienie | stan wyników, odzyskanie pamięci i brak nadpisania dobrych wejść |
| B-11 | Podgląd w istniejącym rendererze po zwolnieniu modeli | animacja, pauza/reset i zapas pamięci; brak manipulacji muzyką |

Zacznij od jednej prostej sceny, następnie sprawdź dwa trudniejsze przypadki:
architekturę z cienkimi pasmami światła i formy organiczne z drobnymi konturami.
To rodzaje materiałów testowych, nie gotowe briefy nowych artworków. Przed ich
produkcją obowiązują aktualne wspólne wytyczne authoringu.

Dla B-03 uwzględnij m.in. „błysk co 5 sekund”, „nie zmieniaj tła”, „popraw tylko
tę maskę”, „lot po łuku” i żądanie nieobsługiwanego efektu. Model ma respektować
wynik walidatora i błędy, a nie potwierdzać fikcyjnego sukcesu.

## 3. Pamięć, czas i rozdzielczość

Pierwsza próba dla każdego modelu: zimne uruchomienie i jedno małe wejście.
Dla konfiguracji, która działa: co najmniej trzy porównywalne przebiegi z
zapisanymi seedami i parametrami. Zapisz medianę i zakres czasu, osobno:

- start procesu i ładowanie wag;
- przetwarzanie wejścia oraz inferencję;
- zapis wyniku i zwolnienie pamięci;
- przełączenie na następny model;
- cały czas od żądania do wyniku gotowego do podglądu.

Zapisuj szczyt RAM i VRAM oraz stan po operacji. Nie utożsamiaj rozmiaru pliku
wag z zapotrzebowaniem na pamięć: dochodzą kontekst, część wizyjna, enkoder
tekstu, VAE, aktywacje i aplikacja. Ustal zapas dla Windowsa i renderera na
podstawie pomiaru. Nie zakładamy utrzymywania wszystkich modeli na GPU naraz.

Rozdzielczości początkowe: np. 1024x576 dla szybkiej kompozycji i 1536x864 dla
próby większej, jeśli wybrany backend je obsługuje. To propozycje testowe, nie
gwarancja jakości ani obowiązkowe parametry każdej sceny. Paczka musi później
spełniać kontrakt proporcji/rejestracji silnika. Rozdzielczość logicznego canvasu
nie jest deklaracją natywnej rozdzielczości wygenerowanego obrazu.

Nie ustalamy teraz obiecanego czasu „sekunda na obraz”. Po pomiarach wpisujemy
proponowany budżet draftu, edycji i pełnej paczki oraz sprawdzamy jego użyteczność
z użytkownikiem przed budową UI. Długie zadanie musi być widoczne i anulowalne.

## 4. Kryteria jakości

- Styl i kompozycja odpowiadają briefowi, a ruchomy obiekt ma od początku miejsce
  w kadrze i przestrzeń dla trasy.
- Osobne generacje warstw zachowują skalę, perspektywę i oświetlenie po złożeniu.
- Maska obiektu nie udaje maski jego świecącego materiału. Ocena obejmuje cienkie
  detale, ciemne szczeliny, obwódki i przypadkowe fragmenty sąsiedztwa.
- Po wydzieleniu obiektu tło jest kompletne na całej planowanej trasie.
- Edycja lokalna nie przesuwa przypadkowo konturów, które mają zachować maski.
  Jeśli je zmienia, potrafimy wykryć zależności wymagające ponownego opracowania.
- Model poprawnie rozpoznaje błąd i ograniczenie narzędzia; nie zastępuje raportu
  jego własną deklaracją gotowości.
- Rzeczywisty ruch i zoom nie ujawniają błędów niewidocznych w nieruchomej próbce.

Wynik każdego testu: `spełnione`, `częściowo` albo `niespełnione`, z opisem
interwencji i ograniczeń. Nie wyliczamy arbitralnej jednej oceny, która ukryje
niepoprawną maskę za dobrą szybkością modelu.

## 5. Formularz raportu do wypełnienia po próbie

Utwórz raport np. `reports/KRE-00-YYYY-MM-DD.md`. Poniższe pola są **puste**,
nie są wynikiem wykonanego benchmarku.

```text
Data i wykonawca:
Windows / sterownik / CPU / RAM / VRAM:
Wolny dysk / katalogi danych:
Backend i wersje bibliotek:
Model / źródło / rewizja / hash / wariant / licencja:
Format wag / dtype / offload / kontekst / rozdzielczość:
ID testu / wejścia / prompt / seed / parametry:
Liczba przebiegów:
Czas zimny / inferencja / pełna operacja / przełączenie:
RAM/VRAM szczyt i po operacji / rzeczywiste urządzenie obliczeń:
Artefakty i ich hashe / miejsce nagrania i próbek:
Wynik techniczny / jakość obrazu i masek:
Potrzebna interwencja użytkownika:
Błędy / obejścia / niewykonane próby:
Rekomendacja modelu i konfiguracji / odrzucone konfiguracje:
Proponowane budżety czasu i pamięci do KRE-01/KRE-02:
Wynik bramki i kolejny krok:
```

Wagi, prywatne obrazy i duże nagrania nie trafiają automatycznie do Gita.
Raport ma umożliwiać ponowienie testu dzięki wejściom, parametrom, wersjom i
referencjom do dowodów; sama ścieżka do katalogu tymczasowego nie wystarcza,
jeśli materiały zostały później usunięte.

## 6. Warunek przejścia do KRE-01

Zapisana i oceniona konfiguracja dla rozmowy/narzędzi, generowania/edycji,
segmentacji i uzupełniania tła; wyniki pamięci i czasu, znane ograniczenia,
wybrane interwencje w UI i zgoda co do użyteczności uzyskanego procesu.
Jeżeli krytyczny element nie działa, najpierw porównujemy alternatywę w ramach
KRE-00. Nie budujemy całego UI na samym założeniu, że problem zniknie później.
