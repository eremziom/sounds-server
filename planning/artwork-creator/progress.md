# Stan realizacji

Aktualizacja: **2026-11-13**. **KRE-00 odebrany** jako benchmark wykonalności
lokalnego procesu z poprawkami. **KRE-01 odebrany technicznie**: trwały model
projektów, rewizji, artefaktów i rozmowy oraz API; [raport](reports/KRE-01-2026-11-13.md).
KRE-02–KRE-08 nie rozpoczęto.

## Najbliższy krok

**KRE-02 — narzędzia, wykonawca i trwałe zadania.** Nie rozpoczęto automatycznie.
KRE-01 zamyka [raport](reports/KRE-01-2026-11-13.md); API i granice opisuje
[kontrakt v1](kre01-contract.md). Zastosowano addytywną migrację lokalnej bazy
developerskiej; testy migracji i restartu używają osobnych, usuwanych baz fixture.
KRE-00 zamyka [raport końcowy](reports/KRE-00-2026-11-13-closure.md).
Potwierdzono trzy cykle enkoder → transformer → osobny VAE → SAM → LaMa
przy aktywnej stronie `/animations` i audio. Wybrano odczyt pread; przyjęty
profil usuwa błędy porównanych wariantów na testowanej recepcie. Zapisano
RAM/VRAM i mały zapas limitu commit, który musi uwzględniać wykonawca KRE-02.
Poprawki użytkownika są częścią procesu; UI nie wymaga pracy agenta ani edycji plików.
Pełna paczka bez ręcznej ingerencji agenta jest celem KRE-03, rozmowa KRE-05.

### Historia wykonanych prób KRE-00
Zakres i formularz: [local-model-benchmark.md](local-model-benchmark.md).
Wykonano diagnostykę i przygotowano izolowane narzędzia próbne w
`tools/artwork-creator/`. Wyniki, ograniczenia i kolejny krok:
[B-01](reports/KRE-00-2026-11-10.md) oraz
[B-02/B-03 i pamięć GPU](reports/KRE-00-2026-11-10-capabilities.md).
Narzędzia przeszły ograniczoną macierz prób; VLM wymaga wskazówki przy błędzie
maski. Wykonano też [próby modeli obrazu B-04–B-08](reports/KRE-00-2026-11-10-image-models.md):
Klein/ROCm działa z ograniczoną pamięciowo uwagą, SAM działa na GPU, LaMa na CPU.
Surowa edycja zmienia tło i światła; wariant z maską je chroni. Złożone maski,
materiały i rekonstrukcja tła nadal wymagają korekt.
[B-09–B-11](reports/KRE-00-2026-11-10-sequence-qa.md) wykonano: mediana
sekwencji 59,844 s, przerwanie/restart oraz podgląd ruchu/zoomu i test integracji
audio przechodzą technicznie. Wersja 0.0.3 z [nowego raportu](reports/KRE-00-2026-11-13-corrections.md)
poprawia maski światła, zasłanianie filarem, tło po wirnikach, propagację koloru
i wyjście drona poza kadr. Używa istniejących map opóźnienia i masek
przesłaniania; nie wymagała rozszerzenia silnika. Przeszło 25 testów narzędzi,
końcowy podgląd WebGL oraz ponowiona po awarii prądu integracja audio.
Końcowy pomiar przy aplikacji i 29 testów są w raporcie zamknięcia. Ziarniste
granice materiału, styki prowadnic i krawędzie/cienie pozostają ograniczeniami
pilota do korekty/odbioru w produkcji artworków, nie dowodem pełnej autonomii.
Nie odebrano pilota jako sceny produkcyjnej. W chwili zamknięcia KRE-00
KRE-01 pozostawał nierozpoczęty; jego późniejsze wdrożenie opisuje osobny raport.

## Lista etapów

| Etap | Stan | Raport/dowody | Następny warunek |
| --- | --- | --- | --- |
| KRE-00 | Odebrany | [Raport zamknięcia](reports/KRE-00-2026-11-13-closure.md); B-01–B-11 i pilot zachowane | Zakończony benchmark z opisanymi ograniczeniami |
| KRE-01 | Odebrany technicznie | [Raport](reports/KRE-01-2026-11-13.md), [kontrakt](kre01-contract.md) | Trwały zapis, historia, własność, zależności i konflikt rewizji potwierdzone |
| KRE-02 | Nie rozpoczęto | Brak | Kontrakty i zapis projektu |
| KRE-03 | Nie rozpoczęto | Brak | Działające narzędzia i zadania |
| KRE-04 | Nie rozpoczęto | Brak | Jedna pełna paczka przez API |
| KRE-05 | Nie rozpoczęto | Brak | Działający kreator i potwierdzony LLM |
| KRE-06 | Nie rozpoczęto | Brak | Rozmowa wykonująca narzędzia |
| KRE-07 | Nie rozpoczęto | Brak | Poprawki częściowe i korekta masek |
| KRE-08 | Nie rozpoczęto | Brak | Publikacja i biblioteka |

## Ustalenia produktu

| Data | Ustalenie | Podstawa |
| --- | --- | --- |
| 2026-11-09 | Kreator w UI oraz odtwarzacz gotowych scen to dwa główne elementy | Bieżące wymaganie użytkownika |
| 2026-11-09 | Użytkownik docelowo nie korzysta z Codexa do produkcji kolejnych scen | Bieżące wymaganie użytkownika |
| 2026-11-09 | Pierwsze uruchomienie lokalne: Windows 11, RX 7800 XT 16 GB, 32 GB RAM | Parametry podane przez użytkownika |
| 2026-11-09 | Preferowane lokalne modele bez opłat za API | Preferencja użytkownika, nie obietnica zerowego kosztu infrastruktury |
| 2026-11-09 | Przygotować dokumentację, potem wdrażać stopniowo | Autoryzacja obecnego zadania; nie oznacza wykonania etapów |
| 2026-11-13 | Poprawki są częścią procesu kreatora; podstawowo prompty, opcjonalnie wskazanie obszaru/pędzel | Potwierdzenie użytkownika w rozmowie przed zamknięciem KRE-00; nie oznacza wymogu ręcznej edycji każdej maski |
| 2026-11-13 | Finalnie zamknąć KRE-00 po pomiarze przy aplikacji i zapisie ograniczeń | Bieżące polecenie użytkownika; raport zamknięcia zawiera rzeczywiste wyniki |
| 2026-11-13 | Rozpocząć wdrażanie KRE-01 | Polecenie użytkownika po omówieniu celu tego etapu; bez automatycznego rozpoczęcia kolejnych |

## Propozycje wymagające pomiaru/rozstrzygnięcia

- Qwen3.5-9B / Klein 4B / SAM 2.1 Tiny / LaMa mają lokalne pomiary techniczne.
  Ograniczona sekwencja przy aplikacji została odebrana w KRE-00; nie oznacza
  odbioru produkcyjnego artworków. Klein wymaga pread, rozdzielenia VAE,
  ograniczonej pamięciowo uwagi i ochrony niezmienianych obszarów;
  Korekta pilota używa jawnych punktów SAM, prowadnic i maski usunięcia poświaty;
  nie dowodzi autonomicznego authoringu. Depth Anything pozostaje opcją.
- Backend/formaty bazowe wybrano w raporcie zamknięcia. Większe rozdzielczości,
  produkcyjna bramka RAM/VRAM/commit i końcowe budżety UI wymagają dalszych prób.
- llama.cpp/Vulkan jest wybranym serwerem; ComfyUI nie jest wymagany do recepty.
- Moduł API, współdzielone deklaracje, kontrakt endpointów i schemat danych
  ustalono w KRE-01. Kolejka i wykonawca pozostają zakresem KRE-02.
- Wymagana liczba korekt użytkownika, potrzeba mattingu i zakres stylów w MVP.

## Jak aktualizować ten dokument

Stany: `do rozpoczęcia`, `w trakcie`, `do korekty`, `odebrany`.
Przy zmianie stanu podaj datę, rzeczywisty zakres, dowód odbioru i otwarte
problemy. `Odebrany` wymaga spełnienia kryteriów z planu, w tym prób wizualnych
tam, gdzie są wymagane. Rozróżniaj działający test developerowy od obsługi w UI.
Nie dopisuj wyników z benchmarków innych kart jako wyników tego komputera.

Nowe decyzje zapisuj z przyczyną i wpływem na następne kroki. Zmianę preferencji
użytkownika odróżniaj od wyboru technicznego. Nie usuwaj wcześniejszych wyników;
oznacz je jako zastąpione nowszym raportem.
