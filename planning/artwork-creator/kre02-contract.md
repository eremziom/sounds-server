# KRE-02 — trwałe zadania i lokalne narzędzia, kontrakt v1

2026-11-13. **KRE-02 odebrany technicznie**, łącznie z rzeczywistymi próbami
Klein/SAM/LaMa 512×288 przy audio/rendererze. [Raport i ograniczenia](reports/KRE-02-2026-11-13.md).
Wspólne typy: `apps/artwork-contracts/index.d.ts`; rejestr i walidacja:
`apps/api/src/artwork-tools/tool-registry.ts`.

## API i format zadania

Istniejący JWT i własność projektu z KRE-01 pozostają granicą dostępu.
`GET /artworks/tools` zwraca dostępne nazwy, kolejność wejść, profil GPU i schemat
parametrów. Schemat rejestru używa `type`, `properties`, `required`, `items`,
`enum` oraz granic `min`/`max` (wartość, długość tekstu lub liczba elementów).
To mały walidowany format rejestru, nie deklaracja pełnej implementacji JSON Schema.
Nieznane pola parametrów są odrzucane; obiekty zachowań i tras dodatkowo
sprawdza rzeczywisty parser silnika podczas wykonania.

| Endpoint | Działanie |
| --- | --- |
| `POST /artworks/projects/:projectId/jobs` | Utrwalenie zlecenia, bez oczekiwania na inferencję |
| `GET /artworks/projects/:projectId/jobs` | Lista po 100 wyników, opcjonalny `cursor` |
| `GET /artworks/projects/:projectId/jobs/:id` | Stan, faza, postęp, próba, pamięć, błąd lub wynik |
| `POST /artworks/projects/:projectId/jobs/:id/cancel` | Anulowanie kolejki lub żądanie zatrzymania własnego procesu |
| `POST /artworks/projects/:projectId/jobs/:id/retry` | Ponowienie przerwanego/anulowanego/błędnego zadania do limitu trzech wykonań |

Odczyty mają `private, no-store`; cudzy projekt/zadanie zwraca 404. Przykład
struktury żądania, po zastąpieniu identyfikatorów własnymi UUID:

```json
{
  "baseRevisionId": "<uuid rewizji>",
  "requestKey": "mask-adjustment-1",
  "tool": "refineMask",
  "arguments": {"operation": "dilate", "radius": 1, "role": "visibility-mask"},
  "inputIds": ["<uuid obrazu>", "<uuid jego maski>"]
}
```

`requestKey` jest unikalny w projekcie. Ten sam klucz i identyczna treść
(niezależnie od kolejności kluczy obiektów JSON) zwracają istniejące zadanie.
Ten sam klucz z inną treścią: 409 `ARTWORK_REQUEST_KEY_REUSED`.
Wejścia muszą należeć do projektu, odpowiadać kolejności/rodzajom narzędzia,
a maska musi wskazywać dokładnie wejściowy obraz i jego rejestrację/wymiary.
Segmentacja wymaga zarejestrowanego obrazu; `registerImage` tworzy taki wynik.

## Stany i odzyskiwanie

`queued → running → succeeded | failed | cancelled`.
Zadanie zapisuje rewizję bazową, argumenty, wejścia, hash żądania, numer próby,
postęp, fazę, daty, wynik i ostatni pomiar pamięci. Wyłącznie wewnętrznie
przechowuje token wykonania i PID procesu. API nie ujawnia tokenu ani PID.

Anulowanie zadania oczekującego działa bez wykonawcy. Dla uruchomionego zadania
wykonawca sprawdza anulowanie co około 250 ms, kończy własny proces i czeka na
jego wyjście. Zatwierdzony wynik pozostaje wynikiem, jeśli anulowanie przyszło
już po transakcji końcowej. `retry` nie działa dla sukcesu, aktywnego wykonania
ani trzech wykorzystanych prób; zwraca wtedy 409 `ARTWORK_RETRY_UNAVAILABLE`.

Jedna blokada sesyjna PostgreSQL obejmuje także sprzątanie i odzyskiwanie.
Python nie rozpoczyna ciężkich importów przed potwierdzeniem, że supervisor
zapisał PID w bazie. Nadzoruje połączenie ze supervisorem; po jego utracie
kończy się. Na Windows obserwuje stan pipe przez `PeekNamedPipe`, aby blokujący
odczyt stdin w dodatkowym wątku nie zatrzymywał importów rozszerzeń NumPy.
Po restarcie wykonawca czeka na wyjście zarejestrowanego procesu, oznacza próbę
jako `WORKER_INTERRUPTED`, sprząta jej pliki i pozwala na jawne ponowienie.
Przy ponownym użyciu tego samego PID przez obcy proces odzyskiwanie ostrożnie
czeka; nie zabija procesu, którego własności nie potrafi już potwierdzić.

## Narzędzia

| Narzędzie | Wejścia w kolejności | Wynik i ograniczenia |
| --- | --- | --- |
| `generateImage` | brak | Klein: prompt, seed, tylko zmierzone 512×288 lub 1024×576; nowa rejestracja |
| `editImage` | obraz, maska edycji | Klein, złożenie wyniku z oryginałem poza maską; te same zmierzone wymiary |
| `segmentObject` | obraz | SAM, punkty dodatnie/ujemne i opcjonalna ramka; rola maski wybierana jawnie; najwyższy wynik modelu, bez obietnicy precyzji światła |
| `fillBackground` | obraz, maska usunięcia | LaMa CPU, dylatacja i nakładające się kafle 512; oryginał zachowany poza maską; styki kafli wymagają QA |
| `registerImage` | obraz | Przeskalowanie do pełnego kadru 16:9 i nowa rejestracja, bez deklaracji natywnego 4K |
| `extractLayer` | obraz, maska | Pełnokadrowy PNG RGBA z alfą wybranego obszaru |
| `refineMask` | obraz, maska | Dylatacja, erozja, feather, próg lub odwrócenie; osobna rola wyniku |
| `deriveLightSelection` | obraz, maska obszaru | Selekcja luminancji/nasycenia i opcjonalnego zakresu hue; kandydat maski materiału |
| `buildInfluenceMap` | obraz, maska | Oddzielna mapa wpływu z kontrolowanym feather |
| `buildDelayMap` | obraz, maska | Oddzielna mapa opóźnienia x/y/promieniowa lub według polilinii; opcjonalne odwrócenie |
| `setBehaviors` | brak; warstwy rewizji bazowej | Kandydat konfiguracji z walidacją rzeczywistym parserem silnika |
| `setTravel` | brak; warstwy rewizji bazowej | Kandydat istniejącej trasy, w tym Bezier/waypoints; te same ograniczenia silnika |
| `buildPreviewPackage` | brak; artefakty rewizji bazowej | Manifest schema 2, kandydat snapshotu i powiązania plików; bez publikacji |

Narzędzia obrazu są ogólnymi operacjami, a nie gotową produkcją dowolnej sceny.
Selekcja progowa nie rozpoznaje semantycznie materiału. Polilinia określa
kierunek gradientu; nie odgaduje połączeń i rozgałęzień materiału. Automatyczne
QA i koordynacja całości należą do KRE-03/KRE-05/KRE-06. Nie dodano pozornych
wywołań `planArtwork`, `inspectPreview` lub `publishArtwork` bez implementacji.

## Pamięć i modele

Wykonawca odczytuje RAM i dostępny commit Windows oraz pojemność karty z DXGI
i jej dedykowane użycie z WDDM, przypisane przez LUID do RX 7800 XT.
Początkowe progi dopuszczenia:

| Profil | Dostępny RAM | Zapas commit | Wolna dedykowana VRAM |
| --- | --- | --- | --- |
| Klein | 12 GiB | 10 GiB | 10,5 GiB |
| SAM | 2 GiB | 2 GiB | 1 GiB |
| CPU | 1 GiB | 1 GiB | bez wymogu rezerwy GPU |

Dla dużych obrazów RAM/commit dodatkowo muszą pokryć większą z wartości:
progu profilu lub `0,5 GiB + 96 × liczba pikseli`. To ostrożny szacunek buforów,
nie pomiar szczytu dla każdego narzędzia/rozmiaru. Progi wymagają dalszej
kalibracji; testy KRE-02 nie potwierdzają wszystkich dużych rozdzielczości.

Brak rezerwy daje `queued` z `MEMORY_DEFERRED` i kolejnym terminem za 30 sekund,
bez zużywania próby. Brak liczników: `MEMORY_TELEMETRY_UNAVAILABLE`, również
odroczenie. Inne oczekujące zadania mogą w tym czasie zostać wykonane.
Nie obniżamy automatycznie progów, nie kończymy obcych procesów, nie zmieniamy
pliku stronicowania ani ustawień muzyki. Rzeczywisty OOM kończy próbę kodem
`MODEL_OUT_OF_MEMORY`; rezultat nie jest stosowany do projektu.

Klein ma trzy osobne procesy: enkoder, transformer zapisujący latent, dekoder
VAE. Każdy następny etap rozpoczyna się po wyjściu poprzedniego i ponownym
sprawdzeniu pamięci. Zapisujemy odczyty przed/po procesie; nie oznacza to
pomiaru dokładnego szczytu ani zerowej VRAM całego systemu.
Zachowano pread, BF16, attention z podziałem query na 256 wierszy, cztery kroki,
guidance 1 i lokalne wagi. Brak cichego fallbacku na CPU lub pobierania wag.
Prompt powyżej 512 tokenów jest odrzucany bez obcięcia.

Środowiska mają osobne locki Python. `verify-profile.py` sprawdza SHA256 wag,
a przed inferencją kontrolujemy zgodność markera weryfikacji z profilem
i rozmiarami/mtime plików. Pochodzenie wyników zawiera rewizję bazową, parametry,
wersję narzędzia, rewizje modeli, hash profilu, hash wspólnych wytycznych i kodu
pomocniczego. Dla Klein zachowujemy również faktyczny prompt i brief.
Wykonawca odczytuje wspólne wytyczne authoringu i przenosi wymagania ruchu,
materiałowego światła, propagacji kolorów i blackout/reveal do promptu.
Dla generacji dodaje kontekst kompozycji z briefu. Dla edycji przekazuje
instrukcje zachowania istniejących elementów i zmiany tylko wskazanego wyglądu;
nie dopisuje opisu zachęcającego do odtworzenia całej sceny.

## Wyniki, transakcje i pliki

Wyniki powstają w `ARTWORK_JOB_ROOT/<job UUID>/<token UUID>/`. Przed zapisem do
trwałego magazynu wykonawca utrwala i synchronizuje journal z zarezerwowanymi
kluczami plików. Następnie transakcja blokuje zadanie, sprawdza token/anulowanie,
zapisuje artefakt, wejścia oraz stan `succeeded`. Para job/output ma unikalność
w bazie. Po błędzie/restartcie journal pozwala usunąć tylko niepodpięte pliki
tej próby; plik obecny w metadanych artefaktu pozostaje zachowany.

`result.outputs` wskazuje artefakty, `result.baseRevisionId` pochodzenie,
`result.applied` ma wartość false. Nie zmieniamy `activeRevisionId`. Zastosowanie
wariantu wymaga nowej rewizji przez kontrakt KRE-01 i jego kontrolę konfliktu.
Ta zasada dotyczy również wyników, które ukończyły się po nowszej edycji.

Budowniczy używa istniejącego `parseArtworkPackage`. Sprawdza także rolę
i rejestrację masek/map wskazanych we wpływach, regionach i parametrach efektów.
URI `/infinite-zoom/jobs/...` opisują planowane mapowanie plików. KRE-02 nie
udostępnia tej trasy loaderowi: raport zawiera `assetBindings`, które klient
podglądu musi zmapować w KRE-03/KRE-04. Budowa manifestu nie jest publikacją
do biblioteki ani potwierdzeniem gotowej, wizualnie zaakceptowanej sceny.

Operacje sprzątają wyłącznie własny katalog UUID i własne niepodpięte klucze.
Brak automatycznej retencji historycznych projektów i zatwierdzonych artefaktów.
Każdy etap procesu ma limit 600 sekund; stderr pozostaje lokalny podczas
operacji, API zwraca kontrolowany kod błędu bez ścieżek/sekretów.

Uruchomienie i testy: [README wykonawcy](../../apps/artwork-worker/README.md).
