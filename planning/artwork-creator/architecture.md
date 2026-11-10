# Architektura kreatora i biblioteki scen

Status: **projekt do wdrożenia etapami**, wersja 1.0 z 2026-11-09.
Ustalenia i zakres: [README.md](README.md). Kroki: [implementation-plan.md](implementation-plan.md).

## Podział odpowiedzialności

```text
Interfejs użytkownika: rozmowa, historia, warstwy, korekta masek
        |
        v
API aplikacji: projekty, wersje, zadania, sesja rozmowy
        |
        +--> Koordynator: plan operacji, zależności, walidacja i wyniki
        |        +--> Lokalny model językowy/wizyjny
        |        +--> Narzędzia deterministyczne: maski, mapy, manifest
        |        +--> Kolejka -> lokalny wykonawca AI -> modele obrazu
        |
        +--> Magazyn źródeł, masek, pochodzenia i wersji
        |
        +--> Walidacja -> zaakceptowana, niezmienna paczka -> biblioteka

Podgląd kreatora i odtwarzacz -> istniejący host Infinite Zoom/MediaRuntime
```

Model nie zarządza bazą i plikami bezpośrednio. Zwraca ustrukturyzowane żądanie
operacji. Koordynator waliduje argumenty, wykonuje narzędzie i przekazuje wynik
z identyfikatorami rzeczywistych artefaktów. Tekst „maska gotowa” nie oznacza
sukcesu, jeśli nie powstał poprawny plik.

## Komponenty

| Komponent | Odpowiedzialność | Granica |
| --- | --- | --- |
| UI Next.js/React | Czat, wybór wariantu, postęp, podgląd, korekta, historia | Nie wykonuje inferencji i nie zapisuje dowolnego manifestu jako gotowego |
| API NestJS | Własność projektu, wersje, operacje, lista scen, dostarczanie artefaktów | Nie blokuje żądania HTTP na cały czas generowania |
| Koordynator | Zna możliwości silnika, zależności i reguły authoringu; wybiera narzędzia | Nie tworzy nowych funkcji silnika podczas rozmowy |
| Wykonawca lokalny | Adaptery modeli, pamięć GPU, anulowanie i wyniki | Oddzielny proces; błąd modelu nie kończy serwera ani muzyki |
| Narzędzia obrazu | Operacje na pikselach i obliczenia | Nie wymagają modelu językowego do każdego piksela |
| Budowniczy paczki | Stabilne identyfikatory, rejestracja, walidacja i pochodzenie | Respektuje istniejący schemaVersion i budżet tekstur |
| Istniejący silnik | Renderowanie i animacja gotowej sceny | Nie potrzebuje modeli po publikacji |

Propozycja: wykonawca Python dla modeli i przetwarzania obrazu, API/projekty
w istniejącym NestJS, budowniczy/walidator manifestu współdzielący kontrakt
TypeScript. ComfyUI może realizować operacje obrazowe przez lokalne API;
nie jest wymaganym interfejsem użytkownika ani źródłem prawdy o projekcie.
Dokładny backend i proces uruchamiania rozstrzyga KRE-00.

## Model danych — propozycja nazw, nie istniejący schemat Prisma

| Encja | Najważniejsze dane |
| --- | --- |
| ArtworkProject | właściciel, tytuł, cel, aktywna rewizja robocza, stan |
| ArtworkRevision | rodzic, brief, decyzje, warstwy, parametry, wersja reguł, zależności |
| ArtworkArtifact | typ, rozmiar, hash, URI, rejestracja, źródło, status poprawności |
| ArtworkOperation/Job | rodzaj, rewizja bazowa, argumenty, stan, postęp, próba, wynik/błąd |
| CreatorConversation | wiadomości, wskazane obiekty, powiązane operacje i wyniki |
| PublishedArtworkVersion | niezmienna paczka, wersja, hash, raport i decyzja użytkownika |

Rewizja projektu nie jest tym samym co opublikowana wersja paczki. Nie każda
wiadomość musi powodować generowanie obrazu, ale każda zastosowana zmiana
zostawia ślad operacji i możliwość powrotu. Duże pliki przechowujemy poza bazą;
baza zapisuje ich metadane i relacje. Konkretne ścieżki danych i retencja
powstają w KRE-01; nie nadpisujemy obecnego magazynu audio.

## Narzędzia udostępniane koordynatorowi

Nazwy poniżej są projektowanym kontraktem funkcji, nie gotowymi endpointami.
Każda operacja otrzymuje projekt, rewizję bazową i identyfikatory wejściowych
artefaktów. Zwraca stan zadania oraz referencje do wyniku i raportu.

| Narzędzie | Wejście/rola | Wykonanie |
| --- | --- | --- |
| planArtwork | intencja, reguły, referencje -> brief i plan warstw | LLM/VLM; walidacja schematu briefu |
| generateImage / editImage | prompt, seed, referencje, ograniczony obszar | Model obrazowy przez adapter |
| segmentObject | obraz, obszar/punkty, wskazany obiekt | SAM i korekta |
| refineMask | maska, dodanie/usunięcie obszaru, parametry krawędzi | Kod; opcjonalny model dopiero po pomiarze potrzeby |
| fillBackground | źródło i maska usuniętego obiektu | LaMa lub zaakceptowany adapter edycji |
| deriveLightSelection | materiał, maska obiektu, kolor/luminancja, korekty | Algorytmy obrazu i decyzje autora |
| buildInfluenceMap / buildDelayMap | kształt, źródło propagacji, kierunek, zakres | Kod obliczeniowy, niezależnie od maski widoczności |
| setBehaviors / setTravel | wybrane regiony, efekt, parametry, sygnały audio | Tylko istniejący kontrakt silnika |
| buildPreviewPackage | wybrana rewizja i poprawne artefakty | Budowniczy i walidator |
| inspectPreview | próbki, raporty, wskazany problem | Kontrole techniczne i pomocnicza analiza VLM |
| publishArtwork | zaakceptowana rewizja i raporty | Niezmienna wersja, atomowy wpis do biblioteki |

Znajomość efektów pochodzi z istniejącego kontraktu i katalogu możliwości
silnika. Model nie może wymyślać parametrów, shaderów ani nazw sygnałów audio.
Dokładne filtry, operacje morfologiczne, dystanse, gradienty i ścieżki oblicza
kod. Autorska grafika wektorowa może być przygotowywana przez ograniczony
budowniczy SVG; nie wymaga dowolnego wykonywania kodu wygenerowanego przez model.

## Reguły i planowanie kompozycji

Przy planowaniu/zmianie briefu koordynator ładuje aktualne
[wspólne wytyczne](../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md).
Zapisuje używaną wersję i przenosi wymagania do promptów odpowiednich etapów.
Modele obrazu nie odczytują samodzielnie AGENTS.md ani instrukcji z repozytorium.

Brief powinien zawierać strukturę sceny, planowane ruchome obiekty, obszary
światła/koloru, przypisane warstwy i role masek, odsłaniane tło, maksymalny ruch,
zaciemnienie i plan QA. Dokument ten określa miejsce tych danych w procesie;
szczegóły wizualne pozostają we wspólnych wytycznych.

Preferowana strategia to komponowanie czystego tła i osobnych ruchomych obiektów
od początku, gdy pozwala na to temat. Podział gotowego obrazu nadal jest
obsługiwany, ale wymaga kontroli po uzupełnieniu tła. Model segmentacji obiektu
nie daje automatycznie dokładnej maski jego świateł, głębi ani przezroczystości.

## Zależności i poprawki częściowe

```text
Obraz źródłowy -> wydzielona warstwa -> maska materiału -> mapa opóźnienia
              -> czyste tło       -> maska przesłaniania
Warstwy + maski + parametry -> podgląd paczki -> raport QA -> publikacja
```

Każdy artefakt ma referencje do konkretnych wejść i parametrów operacji.
Przy zmianie rodzica zależne wyniki są oznaczane jako wymagające ponownej
walidacji/przeliczenia. Nowy obraz nie może przypadkowo użyć masek poprzedniego.

| Żądanie użytkownika | Zakres prawidłowej zmiany |
| --- | --- |
| „Błysk co 5 sekund” | Parametry istniejącej lampki; bez regeneracji tła |
| „Statek ma stały kolor” | Materiał/efekty kadłuba, z zachowaniem smugi i trasy |
| „Lot po łuku” | Konfiguracja trasy, obrót/pivot i ponowne QA marginesów/przesłaniania |
| „Popraw tę krawędź” | Wskazana maska i zależne dane; zachowanie reszty sceny |
| „Zmień wygląd statku” | Jego obraz, powiązane maski i sprawdzenie rejestracji/pivotu |
| „Nowa kompozycja” | Szersza nowa rewizja; wcześniejsza pozostaje dostępna |

Wynik zadania rozpoczętego dla starszej rewizji nie zastępuje nowszej.
Może być zachowany jako wariant do świadomego zastosowania. Powrót do wcześniejszej
rewizji projektu nie mutuje już opublikowanej paczki.

## Zadania i pamięć na komputerze lokalnym

Proponowane stany: `queued`, `running`, `succeeded`, `failed`, `cancelled`;
niepewny wynik po przerwaniu procesu wymaga sprawdzenia/restartu operacji.
Przy ponowieniu sprawdzamy istniejący artefakt, hash wejść i poprzednią próbę,
żeby przypadkowo nie zastosować tej samej zmiany dwa razy.

Jedna ciężka operacja GPU na raz w pierwszej wersji. Modele ładowane kolejno,
z potwierdzonym zwolnieniem pamięci i uwzględnieniem zapotrzebowania Windowsa,
przeglądarki oraz renderera. Offload do RAM i CPU jest narzędziem do pomiaru,
nie obietnicą zachowania szybkości przy 32 GB RAM.

UI otrzymuje postęp i może anulować zadanie, wrócić do projektu lub porównać
wyniki. Backend nie utrzymuje jednej otwartej operacji HTTP przez całe generowanie.
Propozycja dla jednego użytkownika: trwała kolejka oparta o istniejącą bazę i
jeden wykonawca, bez obowiązku dodawania Redis na początek. Implementacja
zostanie wybrana w KRE-02 na podstawie wymagań anulowania i odzyskiwania.

## Podgląd i odtwarzacz

Podgląd używa tego samego kodu renderowania, walidatora paczki i adaptera audio
co odtwarzacz. Istniejący host wybiera aktywny widok; nie uruchamiamy niezależnej
symulacji tylko dlatego, że otwarto kreator. Powrót z kreatora musi zachować
zaparkowaną podróż, preferencje i obsługę muzyki.

Zmiana robocza nie jest automatyczną podmianą opublikowanej sceny. Użytkownik
uruchamia podgląd wybranej rewizji. Uszkodzony draft pozostawia ostatni poprawny
widok i czytelny błąd. Ciężkie generowanie nie może wywołać stop/pause muzyki;
strategię budżetu GPU i kolejności generowanie/podgląd sprawdzamy w benchmarku.

Po publikacji odtwarzacz korzysta wyłącznie z paczki. Zatrzymanie procesów modeli
nie może uniemożliwić otwarcia zapisanej sceny.

## Dostarczanie paczek i publikacja

Manifest runtime pozostaje oddzielony od rozmowy, promptów i stanu narzędzi.
Gotowa paczka zawiera tylko wspierane zasoby i dane potrzebne do odtwarzania.
Pochodzenie, raporty i historia projektu pozostają powiązane z wersją.

Obecny parser wymaga lokalnych, dozwolonych URI i zarejestrowanych formatów.
Proponowane dostarczanie: kontrolowana ścieżka tego samego pochodzenia pod
`/infinite-zoom/`, mapowana na magazyn wersji. Dokładny kontrakt API/URI trzeba
sprawdzić z loaderem; nie rozluźniamy go do dowolnych URL lub ścieżek dyskowych.

Publikacja:

1. Utrwal wejściową rewizję i komplet artefaktów.
2. Sprawdź schemat, pliki, wymiary, rejestrację, krytyczne zasoby i pokrycie.
3. Sprawdź parametry, zakres ruchu, reakcje audio i budżet pamięci.
4. Dołącz dowody wizualne i listę znanych ograniczeń; użytkownik akceptuje wynik.
5. Zapisz niezmienną paczkę i atomowo udostępnij wpis biblioteki.

Nieudana publikacja nie udostępnia częściowej paczki. Zmiana opublikowanej sceny
tworzy nową wersję. Pierwszy MVP nie musi tworzyć portali pomiędzy scenami;
biblioteka samodzielnych scen jest oddzielnym mechanizmem od `zoomThrough`.

## Elementy do rozstrzygnięcia na podstawie pomiarów

- Konkretny backend AMD, sterownik, wersje Python/PyTorch i modele/kwantyzacje.
- Jakość wywołań narzędzi i lokalizacji obiektów przez model wizyjny.
- Potrzeba dodatkowego mattingu dla włosów, dymu i szkła; SAM nie gwarantuje alfa.
- Granica rozdzielczości draftu/finału i dopuszczalny zakres zoomu.
- Akceptowalny czas operacji oraz zachowanie podczas równoległego podglądu.
- Które korekty wykonuje automatycznie model, a które wymagają wskazania obszaru.

To otwarte decyzje wdrożeniowe. Nie są blokerem przygotowania planu, lecz muszą
mieć jawny wynik przed etapem, który od nich zależy.
