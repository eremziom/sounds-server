# Stan realizacji

Aktualizacja: **2026-11-10**. KRE-00 rozpoczęty na polecenie użytkownika.
Żaden etap nie został jeszcze odebrany.

## Najbliższy krok

**KRE-00 — lokalna próba modeli, do korekty (2026-11-10).**
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
audio przechodzą technicznie. Podgląd ujawnił błędne maski światła i brak
zasłaniania drona; brakuje przestrzennej propagacji koloru. Następny krok:
korekta jakości i ponowna ocena w ruchu, przed odbiorem KRE-00.

## Lista etapów

| Etap | Stan | Raport/dowody | Następny warunek |
| --- | --- | --- | --- |
| KRE-00 | Do korekty | [B-01](reports/KRE-00-2026-11-10.md), [B-02/B-03](reports/KRE-00-2026-11-10-capabilities.md), [B-04–B-08](reports/KRE-00-2026-11-10-image-models.md), [B-09–B-11](reports/KRE-00-2026-11-10-sequence-qa.md) | Maski materiałów, zasłanianie, tło i propagacja; ponowna ocena i uzgodnienie interwencji |
| KRE-01 | Nie rozpoczęto | Brak | Wynik KRE-00 |
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

## Propozycje wymagające pomiaru/rozstrzygnięcia

- Qwen3.5-9B / Klein 4B / SAM 2.1 Tiny / LaMa mają lokalne pomiary techniczne.
  Pełna sekwencja i gotowość jakościowa nie zostały odebrane. Klein wymaga
  ograniczonej pamięciowo uwagi i kodowej ochrony niezmienianych obszarów;
  SAM/selektor materiału i LaMa wymagają korekt. Depth Anything pozostaje opcją.
- Backend AMD, formaty wag, offload, maksymalna rozdzielczość i budżety czasu.
- ComfyUI jako wykonawca i llama.cpp jako serwer rozmowy są kandydatami.
- Konkretne ścieżki nowych modułów, kontrakty endpointów, schemat Prisma i kolejka
  są projektowane dopiero w odpowiednich etapach.
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
