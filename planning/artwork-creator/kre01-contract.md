# KRE-01 — kontrakt zapisu kreatora, v1

Wdrożenie: 2026-11-13. Typy współdzielone: [apps/artwork-contracts/index.d.ts](../../apps/artwork-contracts/index.d.ts).
Walidacja HTTP: `apps/api/src/artworks/artwork.dto.ts`. Stan implementacji i dowody:
[raport KRE-01](reports/KRE-01-2026-11-13.md).

## Granice danych

- `ArtworkProject` należy do użytkownika z istniejącej sesji JWT; klient nie podaje właściciela.
- `ArtworkRevision` jest niezmiennym snapshotem roboczym: brief, decyzje, warstwy,
  parametry autorskie i wybrane artefakty. `parentId` wskazuje poprzedni aktywny
  stan, `restoredFromId` wskazuje źródło przywrócenia. Historia rozmowy jest osobna.
- `ArtworkArtifact` jest niezmiennym plikiem z SHA256, rozmiarem, wymiarami,
  pochodzeniem i konkretnymi wejściami. Nowy wynik otrzymuje nowy identyfikator,
  nawet gdy bajty są identyczne. Wejścia muszą już istnieć w tym samym projekcie;
  API nie pozwala później zmienić krawędzi, więc nie tworzy cykli.
- `CreatorMessage` przechowuje tekst użytkownika. Role modelu/narzędzi i ich
  operacje dołączy zaufany koordynator w KRE-05; klient nie może podszyć się pod narzędzie.
- Opublikowana wersja jest osobną granicą, opisaną przez
  `PublishedArtworkReference`. Tabele i operacja publikacji powstaną w KRE-07.
  Żaden zapis roboczy nie podmienia opublikowanej sceny.

Snapshot **nie jest** manifestem runtime. `layers[].parameters` przechowuje
robocze wybory, a nie potwierdzenie, że silnik obsługuje dowolny klucz/efekt.
Budowniczy paczki w kolejnych etapach musi użyć jedynego istniejącego kontraktu
`ArtworkPackage` i jego parsera w `apps/ui/src/engines/infinite-zoom/artwork/`.
Nie dodano drugiego schematu zachowań ani zmian loadera/rendererów. Manifest runtime
nie otrzymuje rozmowy, promptów, zależności modeli ani metadanych projektu.

## API

Baza: `/artworks/projects`. Wszystkie endpointy korzystają z `JwtAuthGuard`.
Operacje na cudzym lub nieistniejącym projekcie zwracają 404. W tym lokalnym
etapie każdy zalogowany użytkownik może tworzyć własne projekty; nie dodano ról
ani uprawnień do istniejącego RBAC. Odczyty mają `Cache-Control: private, no-store`.

| Metoda i ścieżka względem bazy | Dane / rezultat |
| --- | --- |
| `POST /` | `{title}` → projekt z pustym `activeRevisionId` |
| `GET /` | własne projekty; opcjonalne `?cursor=<uuid>` |
| `GET /:projectId` | projekt, aktywna rewizja i walidacja zależności |
| `POST /:projectId/revisions` | `{baseRevisionId?, snapshot}` → nowa aktywna rewizja |
| `GET /:projectId/revisions` | metadane historii; opcjonalne `?cursor=<uuid>` |
| `GET /:projectId/revisions/:id` | pełny snapshot z walidacją zależności |
| `POST /:projectId/restore` | `{baseRevisionId, revisionId}` → nowa rewizja kopiująca starszy snapshot |
| `POST /:projectId/artifacts` | multipart: jedno pole `metadata` (JSON), jeden plik `file` |
| `GET /:projectId/artifacts` | metadane i wejścia artefaktów, bez ścieżek dyskowych |
| `GET /:projectId/artifacts/:id/file` | plik tylko dla właściciela; attachment, nosniff |
| `POST /:projectId/messages` | `{text}` → wiadomość użytkownika |
| `GET /:projectId/messages` | historia od najnowszej; opcjonalne `?cursor=<uuid>` |

Listy projektów, rewizji i wiadomości zwracają maksymalnie 100 elementów.
Kolejna strona: ostatni `id` jako `cursor`; pusta tablica oznacza koniec.
Kursor musi należeć do danego właściciela/projektu. Kolejność to czas malejąco,
`id` rosnąco jako rozstrzygnięcie remisu. Lista projektów używa `updatedAt`;
przy jednoczesnej edycji kolejność może się zmienić, więc nie jest snapshotem listy.

Przykładowy pierwszy zapis (bez artefaktów, sam plan):

```json
{
  "snapshot": {
    "schemaVersion": 1,
    "brief": {
      "intent": "Opis zamierzonej sceny",
      "guidelinesVersion": "1.7",
      "guidelinesPath": "apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md",
      "composition": "Zastosowanie zasad do kompozycji",
      "motionPlan": "Ruchomy element, trasa, warstwy, odsłaniane tło i przesłanianie",
      "lightingPlan": "Liczne zintegrowane detale, maski, impulsy i przepływ kolorów",
      "blackoutPlan": "Niezależne światła od pierwszej klatki i płynny reveal",
      "qaPlan": "Ruch, zoom, granice, pauza i ograniczenia jakości"
    },
    "layers": [],
    "artifactIds": [],
    "decisions": []
  }
}
```

To przykład struktury kontraktu, nie brief konkretnego artworku. Walidacja nie
potwierdza jakości planu ani aktualności zadeklarowanej wersji wytycznych.
Koordynator będzie czytał wspólne wytyczne, bez utrzymywania ich kopii.

## Rewizje i zależności

Pierwszy zapis pomija `baseRevisionId` lub przesyła null. Każdy kolejny musi
podać bieżące `activeRevisionId`. Transakcja wykonuje porównanie i aktualizację
projektu przed utworzeniem rewizji: przy konflikcie HTTP 409 z kodem
`ARTWORK_REVISION_CONFLICT`, bez osieroconej rewizji. Spóźniony wynik może zostać
zapisany jako artefakt, ale nie staje się automatycznie aktywnym stanem.

`artifactIds` to wybrane wyniki wraz z ich wejściami. Usunięcie wejścia oznacza
`staleArtifactIds` dla wszystkich zależnych wyników, również pośrednich. Stan
ten obliczamy osobno dla każdego snapshotu; starsza rewizja zachowuje poprawność.
Można zapisać niekompletny draft ze stale wynikami, ale nie użyć maski na innym obrazie.

Każda warstwa wskazuje wybrany obraz i listę masek/map. Maska musi mieć jako
bezpośrednie wejście dokładnie ten obraz, ten sam `registrationId` i wymiary.
Sama zgodność wymiarów/UUID rejestracji nie pozwala przepiąć maski. Po wymianie
obrazu trzeba odłączyć stare maski od warstwy; można pozostawić je w draftcie
jako wyniki do ponownej walidacji. `validation.ready` oznacza wyłącznie kompletność
zależności, **nie** odbiór techniczny/wizualny ani gotowość do publikacji.

Przywrócenie tworzy nowy snapshot z rodzicem równym bieżącej rewizji. Nie cofa
historii, nie usuwa wiadomości i nie modyfikuje starszych zapisów.
Złożone klucze obce dodatkowo blokują rodzica, źródło przywrócenia, aktywną
rewizję i wejścia artefaktów z innego projektu na poziomie PostgreSQL.

## Pliki i retencja

`ARTWORK_STORAGE_DIR` musi być bezwzględną prywatną ścieżką, oddzielną od
`AUDIO_STORAGE_DIR` (również bez zagnieżdżania jednego w drugim). Katalog i jego
rodzice nie mogą przekierowywać przez symlinki. Inicjalizacja jest leniwa:
brak konfiguracji nie blokuje starego odtwarzacza, ale użycie magazynu zwraca
503 `ARTWORK_STORAGE_UNCONFIGURED`.

Obsługiwane rodzaje: image, visibility-mask, occlusion-mask, material-mask,
influence-map, delay-map, depth, flow oraz report. Obrazy/mapy: PNG, raport: JSON.
Limit pliku: 32 MiB; wymiary do 16384 w osi i 67108864 pikseli. Wymiary odczytujemy
z nagłówka PNG; to **nie jest** pełne dekodowanie/QA ani gwarancja akceptacji
wymiarów przez silnik. Kompletne sprawdzanie paczki należy do budowniczego.

Metadata uploadu: `kind`, `inputIds`, `provenance` oraz opcjonalne `width`,
`height`, `registrationId`. Dla map wymagany jest pasujący zarejestrowany obraz
wejściowy. `provenance` jest ograniczonym do 16000 znaków dokumentem JSON na
narzędzie, wersje modeli/wag, seed i parametry; nie dowodzi prawdziwości tych danych.
Snapshot ma limit 200000 znaków, 100 warstw i 500 wybranych artefaktów.

Pliki powstają pod wygenerowanymi kluczami UUID, z wyłącznym utworzeniem i bez
nadpisywania. API nie przyjmuje ścieżek dyskowych. Zapis metadanych i krawędzi
wejść jest transakcyjny; przy zwykłym błędzie usuwamy wyłącznie nowo utworzony
plik. Twarde przerwanie procesu między zapisem pliku a transakcją może zostawić
niepodpięty plik; odzyskiwanie/GC należy dopracować przy trwałych zadaniach KRE-02.
KRE-01 niczego automatycznie nie usuwa: brak API kasowania projektów, rewizji
i artefaktów. Usunięcie właściciela z projektami jest blokowane kluczem obcym.
Backup wymaga bazy oraz magazynu plików z zachowaniem kluczy; sam dump bazy
nie obejmuje obrazów. Rozmowa nie przechowuje obrazów/base64 jako danych binarnych.

## Błędy i następne etapy

400: walidacja DTO lub `ARTWORK_INVALID`; 401: istniejąca autoryzacja; 404:
brak własnego zasobu/kursora; 409: konflikt rewizji; 413: limit uploadu;
503: brak konfiguracji magazynu. Inne awarie dysku/bazy kończą się błędem 500,
bez przejmowania kontroli nad muzyką.

KRE-02 dodaje narzędzia i trwałe zadania. KRE-03 buduje i waliduje rzeczywistą
paczkę, KRE-04 udostępnia UI, KRE-05 rozmowę modelu, KRE-07 publikację.
W KRE-01 nie uruchamiano modeli, nie tworzono artworków ani ekranów UI.
