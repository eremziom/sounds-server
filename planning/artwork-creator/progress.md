# Stan realizacji

**Poprawka po zgłoszeniu użytkownika, 2026-11-14:** odblokowano podgląd
w obecności zadań starszych rewizji i uruchomiono lokalnego wykonawcę.
[Przyczyna, zmiany i regresja](reports/KRE-04-2026-11-14-preview-unblock.md).

**KRE-04 zamknięty funkcjonalnie, 2026-11-14**, po poleceniu dokończenia etapu.
Powtórzona weryfikacja i zakres odbioru: [raport zamknięcia](reports/KRE-04-2026-11-14-closure.md).
KRE-05–08 nie rozpoczęto. Diagnostyka WebGL pozostaje osobną otwartą kwestią;
pilot nie uzyskał odbioru produkcyjnego.

**Aktualne doprecyzowanie użytkownika, 2026-11-14:** KRE-04 sprawdza możliwości
kreatora i odtwarzania artworku w aplikacji. **Zakres UI jest zrealizowany
i zweryfikowany funkcjonalnie.** Retusz pilota nie stanowi warunku odbioru
tego zakresu. Osobno pozostaje otwarta diagnostyka różnicy pierwszego odczytu
WebGL; nieudane testy zachowują swój wynik.
[Aktualny przegląd kryteriów](reports/KRE-04-functional-review-2026-11-14.md).
Poniższe wpisy opisują wcześniejsze przyrosty i ich ówczesną ocenę.

## Historia przyrostów przed zamknięciem

Aktualizacja: **2026-11-14**. **Kontynuacja KRE-04:** przez formularze
SAM/rejestracji zapisano nową rewizję z przesłanianiem drona przez filar.
Nagranie 52,03 s i wznowienie bez nowych zadań przeszły. Pozostają korekty
precyzji maski, tła i lamp; ścisły test pierwszego odczytu odtworzył błąd
1/255 zarówno w RGBA8, jak i RGBA16F, przy niezmienionym stanie/kamerze.
[Aktualny raport i dowody](reports/KRE-04-2026-11-14-occlusion.md).

Poprzedni przyrost KRE-04: rozróżniono otwarcie
paczki i widok immersyjny, dodano próbę zapisanej generacji bez inferencji
oraz nagranie 50,64 s pełnego lotu/zoomu, blackout i odsłaniania. Test rzeczywistego
API oraz build i test UI przechodzą. QA ujawniło nadal wymagane korekty obrazu;
sporadyczna różnica pierwszego odczytu WebGL występuje już przed Resetem.
[Bieżący raport i dowody](reports/KRE-04-2026-11-14.md). **KRE-04 nadal w toku.**

**KRE-00 odebrany** jako benchmark wykonalności
lokalnego procesu z poprawkami. **KRE-01 odebrany technicznie**: trwały model
projektów, rewizji, artefaktów i rozmowy oraz API; [raport](reports/KRE-01-2026-11-13.md).
**KRE-02 odebrany technicznie**: kolejka, wykonawca i narzędzia zaimplementowane;
testy techniczne oraz rzeczywiste Klein/SAM/LaMa 512×288 przy audio przeszły;
[raport](reports/KRE-02-2026-11-13.md), [kontrakt](kre02-contract.md).
**KRE-03 wdrożony i sprawdzony technicznie**: rzeczywista kompletna paczka
przez API, korekty i 32 s ruchu/zoomu w WebGL;
[raport końcowy i ograniczenia pilota](reports/KRE-03-2026-11-13-closure.md).
**KRE-04 rozpoczęty na polecenie użytkownika, 2026-11-13.** Pierwszy przyrost:
chroniony ekran, projekty/plany, referencje, zadania, wybór obrazu, historia,
porównanie i statyczny podgląd warstw/masek. [Raport częściowy](reports/KRE-04-2026-11-13.md).
Podgląd animowanej paczki przeszedł rzeczywistą próbę API/JWT/workera.
Po zwolnieniu pamięci przez użytkownika również nowa generacja Klein i pełny
techniczny przepływ UI zakończyły się poprawnie. Pozostają korekty jakości,
pełne QA nowej paczki i niestabilna asercja Resetu.
[Raport ostatniego odzyskania](reports/KRE-04-2026-11-13-recovery.md).
KRE-05–KRE-08 nie rozpoczęto.

**Punkt odzyskania po awarii prądu, 2026-11-13:** zapisane są również zmiany
drugiego przyrostu: podgląd draftu w istniejącym hoście, chronione PNG,
walidacja paczki względem rewizji/zadania oraz powrót do zaparkowanej sceny.
Po awarii ponownie przeszły **38/38 testów**, WebGL `--pilot-only` z testami
draftu oraz rozszerzony test przeglądarkowy kreatora. Odbudowano uszkodzony
wynik/cache Next.js; build przechodzi. Szczegóły i nierozstrzygnięta wcześniejsza
asercja Resetu: [punkt odzyskania w raporcie](reports/KRE-04-2026-11-13.md#punkt-odzyskania-po-awarii-prądu).
Nie jest to zamknięcie KRE-04 ani odbiór produkcyjnego artworku.

## Najbliższy krok

**KRE-04 zamknięty funkcjonalnie.** [Raport](reports/KRE-04-2026-11-14-closure.md).
Dalszy retusz pilota nie jest zadaniem tego etapu.
Otwartą diagnostykę WebGL prowadzimy jako osobną kwestię techniczną.
KRE-05 wymaga osobnego polecenia. Poniżej historia prób, nie lista prac
retuszerskich wymaganych do odbioru interfejsu.
Pierwszy przyrost jest dostępny pod `/animations/create`, przez odnośnik na
`/animations`. Nie wymaga JSON ani ścieżek plików. Adapter roboczej paczki,
parkowanie podróży, prywatne PNG i rollback są wdrożone. Ostatnia rzeczywista
próba API/JWT/workera potwierdziła podgląd pilota, blackout/reveal, zoom, pauzę,
reload i wspólny kontekst. Formularze produkcji warstw i składania sceny są
zapisane. Po sygnale „Zwolniłem pamięć” wcześniejsze zadanie Klein zakończyło
się poprawnie; potwierdzono także SAM/LaMa, zapis i animowany podgląd nowej
paczki. Następne prace: stabilizacja Resetu i pełne QA/korekty jakości sceny.
Wyniki i granice wcześniejszego odbioru: [raport odzyskania](reports/KRE-04-2026-11-13-recovery.md).
Kontynuacja 2026-11-14 uzupełniła nagranie zapisanej produkcji i sprawdzenie
blackout/reveal przy zoomie; korekty tła, masek i przesłaniania pozostają otwarte.
Reset nie jest uznany za ustabilizowany na podstawie kolejnych udanych prób.
[Aktualny raport](reports/KRE-04-2026-11-14.md).
Kolejna kontynuacja poprawiła przesłanianie przez filar na nowej rewizji
`dd2d57b7-b21b-48fa-b437-cebe2566a6b6`; oryginał zachowano w historii.
[Korekta przez UI i otwarte ograniczenia](reports/KRE-04-2026-11-14-occlusion.md).

KRE-03 zakończył developerowy proces produkcji: po sygnale użytkownika
wznowiono Klein, wykonano SAM/LaMa, korekty przez API i budowę paczki.
Końcowy podgląd obejmuje 32 sekundy ruchu/zoomu, światła, przesłanianie,
blackout/reveal, kontrolowane sygnały audio, pauzę i Reset. Przejrzano sekwencję
kadrów. Pilot nie został opublikowany; ziarniste granice materiału i cienka
segmentacja pozostają opisanymi ograniczeniami, bez odbioru estetycznego przez
użytkownika. KRE-04 rozpoczęto dopiero na kolejne polecenie użytkownika.
Historia wcześniejszego odroczenia przez pamięć pozostaje w raporcie.
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
| KRE-02 | Odebrany technicznie | [Raport](reports/KRE-02-2026-11-13.md), [kontrakt](kre02-contract.md) | Kolejka/procesy/narzędzia oraz rzeczywiste generate/edit Klein, SAM i LaMa 512×288 przy audio potwierdzone |
| KRE-03 | Odebrany technicznie | [Raport końcowy](reports/KRE-03-2026-11-13-closure.md), [brief pilota](pilots/gate-drone/authoring-brief.md) | Pełna paczka przez API i ruch/zoom potwierdzone, ograniczenia jakości pilota zapisane |
| KRE-04 | Zamknięty funkcjonalnie, 2026-11-14 | [Raport zamknięcia](reports/KRE-04-2026-11-14-closure.md), [przegląd kryteriów](reports/KRE-04-functional-review-2026-11-14.md) | Zakres UI odebrany; osobno otwarta diagnostyka WebGL i jakość pilota |
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
| 2026-11-13 | Wdrożyć KRE-02 | Osobne polecenie użytkownika; KRE-03 nie rozpoczęto |
| 2026-11-13 | Zacząć wdrażać KRE-04 | Bieżące polecenie użytkownika po technicznym zamknięciu KRE-03; bez rozpoczynania KRE-05–KRE-08 |
| 2026-11-13 | Użytkownik zwolni pamięć i przekaże sygnał do ponowienia Klein | Odpowiedź na wynik rzeczywistej bramki pamięci, bez zgody na jej omijanie lub zmianę ustawień systemu |
| 2026-11-13 | Po zwolnieniu pamięci ponowić próbę | Polecenie użytkownika; oba narzędzia Klein zakończyły rzeczywistą inferencję i zapis wyników, końcowy odbiór KRE-02 techniczny, bez produkcyjnego odbioru sceny |

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
  ustalono w KRE-01. Kolejka i wykonawca są zaimplementowane w KRE-02;
  odbiór techniczny nowych adapterów na próbkach 512×288 zakończono. Większe
  rozmiary, produkcja scen i podgląd w UI wymagają kolejnych etapów.
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
