# Stan realizacji

Aktualizacja: **2026-11-09**. Dokumentacja 1.0 została przygotowana.
Żaden etap wdrożenia kreatora nie został jeszcze rozpoczęty ani odebrany.

## Najbliższy krok

**KRE-00 — lokalna próba modeli.**
Zakres i formularz: [local-model-benchmark.md](local-model-benchmark.md).
Po rozpoczęciu etapu: diagnostyka środowiska, wybór minimalnej konfiguracji,
testy modeli i zapis raportu; bez równoległego wdrażania pełnego kreatora.

## Lista etapów

| Etap | Stan | Raport/dowody | Następny warunek |
| --- | --- | --- | --- |
| KRE-00 | Do rozpoczęcia | Brak | Test na Windows 11 / RX 7800 XT 16 GB / 32 GB RAM |
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

- Zestaw Qwen3.5-9B / FLUX.2 Klein 4B / SAM 2.1 / LaMa nie ma jeszcze wyników
  na tym komputerze. Depth Anything V2 Small pozostaje opcją dodatkową.
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
