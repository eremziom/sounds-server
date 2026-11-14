# Kreator artworków i odtwarzacz — plan wdrożenia

**KRE-04 zamknięty funkcjonalnie, 2026-11-14.** Powtórzono testy kreatora,
buildy UI/API oraz rzeczywiste odzyskanie projektu. [Raport zamknięcia](reports/KRE-04-2026-11-14-closure.md)
jest aktualnym statusem; poniższe opisy przyrostów zachowują historię prac.
Diagnostyka WebGL i jakość pilota pozostają jawnymi ograniczeniami.

**Aktualizacja zakresu, 2026-11-14:** użytkownik potwierdził, że KRE-04 służy
sprawdzeniu możliwości w aplikacji, nie dopracowaniu artworku testowego.
Zakres UI jest zrealizowany i zweryfikowany funkcjonalnie; jakość pilota
opisujemy osobno. Otwarta diagnostyka WebGL i nieudane testy pozostają jawne.
[Aktualny przegląd odbioru](reports/KRE-04-functional-review-2026-11-14.md)
aktualizuje wcześniejsze poniższe oceny wiążące odbiór z retuszem.

Wersja dokumentacji: **1.0, 2026-11-09**.
Status: **KRE-00 odebrany, 2026-11-13** jako ograniczony benchmark lokalnego stosu
i procesu z poprawkami. [Raport zamknięcia](reports/KRE-00-2026-11-13-closure.md)
zawiera trzy udane cykle przy aktywnej aplikacji, pomiary RAM/VRAM/commit,
29 testów i znane ograniczenia. [Pilot](reports/KRE-00-2026-11-13-corrections.md)
ma osobne dowody ruchu/zoomu; nie jest artworkiem odebranym produkcyjnie.
**KRE-01 wdrożony i sprawdzony technicznie, 2026-11-13:** projekty, rewizje,
artefakty i zapis rozmowy przez API; [raport](reports/KRE-01-2026-11-13.md),
[kontrakt](kre01-contract.md).
**KRE-02 odebrany technicznie:** kolejka, wykonawca i narzędzia wdrożone;
rzeczywiste Klein/SAM/LaMa 512×288 oraz testy przy audio przeszły. [Raport i ograniczenia](reports/KRE-02-2026-11-13.md),
[kontrakt](kre02-contract.md).
**KRE-03 wdrożony i sprawdzony technicznie:** pełna paczka przez API i QA ruchu/zoomu,
z ograniczeniami pilota; [raport końcowy](reports/KRE-03-2026-11-13-closure.md).
**Historia KRE-04, przed zamknięciem:** pierwszy przyrost kreatora pod `/animations/create`, projekty,
zadania, historia i podgląd statyczny; [raport częściowy](reports/KRE-04-2026-11-13.md).
Animowany draft przeszedł rzeczywistą próbę API/JWT/workera. Formularze produkcji
warstw są wdrożone. Po zwolnieniu pamięci nowa generacja Klein oraz przepływ
SAM/LaMa → paczka → podgląd z UI przeszły. Pozostają korekty i pełne QA nowej
paczki oraz stabilizacja Resetu. [Bieżący raport](reports/KRE-04-2026-11-13-recovery.md).
**Kontynuacja 2026-11-14:** rozróżniono przyciski otwarcia paczki i widoku
immersyjnego, dodano odtwarzalną próbę QA zapisanej generacji bez inferencji.
Nagranie 50,64 s obejmuje lot, zoom, blackout/reveal i pauzę. Nadal wymagane
są korekty obrazu oraz wyjaśnienie sporadycznej różnicy pierwszego odczytu WebGL;
[raport tego przyrostu](reports/KRE-04-2026-11-14.md). Późniejsza kontynuacja
zapisała przez UI nową rewizję z przesłanianiem drona przez filar oraz nagranie
52,03 s; wznowienie nie tworzy nowych zadań. Pozostają precyzja maski, tło,
lampy i odtworzona różnica pierwszego odczytu w RGBA8/RGBA16F.
[Raport przyrostu](reports/KRE-04-2026-11-14-occlusion.md). W chwili tego przyrostu KRE-04 nie zamknięto.
KRE-05–KRE-08 pozostają niewdrożone.

## Cel produktu i ustalony zakres

Aplikacja ma dwa główne elementy związane z animacjami:

1. **Kreator animacji/artworków:** użytkownik rozmawia z modelem językowym,
   tworzy scenę, ogląda animację, poprawia wygląd, maski i zachowanie, porównuje
   wersje oraz zapisuje zaakceptowany rezultat. Cały docelowy proces jest
   dostępny w interfejsie aplikacji i nie wymaga dostępu użytkownika do Codexa,
   terminala ani ręcznej edycji plików.
2. **Odtwarzacz grafik:** użytkownik wybiera gotową scenę i muzykę. Istniejący
   silnik interpretuje jej paczkę oraz dane audio; nie wykonuje generowania AI.

Pierwsze środowisko: **lokalny komputer, Windows 11, AMD Radeon RX 7800 XT
16 GB VRAM, 32 GB RAM**. Preferowane są modele dostępne do lokalnego użycia
bez opłat za każde wywołanie. To nie oznacza zerowego kosztu energii, miejsca
na dysku czy czasu obliczeń. Nie zakładamy na tym etapie usługi wieloużytkownikowej
w chmurze ani zakupu innego sprzętu.

Użytkownik zatwierdził przygotowanie tej dokumentacji i późniejsze wdrażanie
etapami. Dokumentacja **nie uruchamia instalacji, pobierania wag, migracji ani
implementacji wszystkich etapów naraz**. Użytkownik rozpoczął KRE-00 dnia
2026-11-10; ta autoryzacja nie obejmuje automatycznego wdrażania dalszych etapów.
2026-11-13 użytkownik osobno zlecił wdrożenie KRE-01. Nie oznacza to rozpoczęcia KRE-02–KRE-08.
Następnie osobno zlecił wdrożenie KRE-02; nie rozpoczęto automatycznie KRE-03.
Po technicznym zamknięciu KRE-03 użytkownik 2026-11-13 osobno zlecił rozpoczęcie
KRE-04. Pierwszy przyrost opisuje raport częściowy; nie rozpoczęto KRE-05–KRE-08.

## Jak korzystać z planu

| Dokument | Zawartość |
| --- | --- |
| [architecture.md](architecture.md) | Podział aplikacji, modeli i narzędzi; dane, zadania, wersje, podgląd i publikacja |
| [implementation-plan.md](implementation-plan.md) | Kolejność KRE-00–KRE-08, zależności, zakres plików, rezultaty i kryteria odbioru |
| [local-model-benchmark.md](local-model-benchmark.md) | Pierwszy test sprzętu i modeli, scenariusze, pomiary i formularz wyniku |
| [progress.md](progress.md) | Aktualny etap, lista prac, decyzje i odnośniki do dowodów |
| [kre01-contract.md](kre01-contract.md) | Wdrożony kontrakt projektów, rewizji, plików, zależności i API |
| [kre02-contract.md](kre02-contract.md) | Kolejka, wykonawca, narzędzia, pamięć i odzyskiwanie |

Identyfikatory KRE-* należą wyłącznie do tego planu. Nie są rekonstrukcją
historycznych numerów IZ/APP i nie zmieniają ich znaczenia.

Przy rozpoczynaniu etapu:

1. Odczytaj jego zależności i aktualny stan kodu; planowane ścieżki nie dowodzą,
   że dany moduł istnieje.
2. Określ ograniczony zakres zmian i kryteria odbioru.
3. Wykonaj etap z testami jego modułów i bezpośrednich zależności.
4. Zapisz rzeczywiste rezultaty, polecenia, metryki, ograniczenia i materiał QA
   w `progress.md` lub powiązanym raporcie. Nie oznaczaj prac jako ukończonych
   na podstawie samej obecności plików, atrap lub deklaracji modelu.
5. Przy zmianie zależności/modelu zaktualizuj dokumentację przed następnym etapem.

## Co mamy, czego jeszcze nie mamy

Stan sprawdzony w repozytorium przy przygotowaniu planu:

| Obszar | Obecny stan |
| --- | --- |
| Odtwarzanie | Istniejący Infinite Zoom, integracja z MediaRuntime i chroniona podstrona `/animations` |
| Kontrakt scen | Walidacja manifestów, warstw, masek, efektów, parametrów i zasobów |
| Animacja | 12 operatorów, reakcje audio, zaciemnienie, ruch warstw; płynne trasy i obrót mają osobny kontrakt |
| Paczki testowe | Przykłady i skrypty przygotowujące konkretne sceny; nie są uniwersalnym kreatorem |
| Interfejs kreatora | Brak kompletnego procesu prompt → paczka → poprawki → publikacja |
| Backend kreatora | KRE-01 i odebrana technicznie kolejka/narzędzia/adaptery KRE-02; brak opublikowanej biblioteki |
| Modele lokalne | Qwen/Vulkan, Klein z adapterem pamięci/ROCm, SAM/ROCm i LaMa/CPU mają pomiary. Jakość i pełny proces nadal bez odbioru. Zob. raport |

Obecny katalog studia jest skonfigurowany w kodzie. Dynamiczna biblioteka
użytkownika wymaga integracji; nie wystarczy wygenerować PNG. Loader i parser
akceptują ograniczone lokalne URI oraz zarejestrowane formaty i proporcje
zasobów. Publikacja musi respektować ten kontrakt albo wprowadzić jego jawnie
przetestowane rozszerzenie.

Historyczne wykluczenie pełnego kreatora z pierwszej wersji Infinite Zoom nadal
opisuje tamtą wersję. Ten plan definiuje oddzielny przyszły zakres; nie oznacza,
że pełna produkcja AI została już wdrożona.

## Zasady obowiązujące w każdym etapie

- Zachowujemy ApplicationRuntime, MediaRuntime i chronione `/animations`.
  Podgląd kreatora korzysta z istniejącego hosta i silnika. Nie dokładamy drugiego
  elementu audio, grafu Web Audio, aktywnego renderera ani zegara symulacji.
- Muzyka po rozpoczęciu odtwarzania nie może zostać zatrzymana przez błąd
  generowania, walidacji, podglądu lub grafiki. Gotowość przed pierwszym Play,
  pauza/stop/koniec, zachowanie podróży i jawny Reset zachowują swój kontrakt.
- Model językowy proponuje plan i wywołania narzędzi. Kod wykonuje obliczenia,
  modyfikuje zasoby, buduje manifest i sprawdza rzeczywiste wyniki.
- Zwykła edycja sceny nie jest generowaniem kodu silnika. Żądanie nieobsługiwanego
  efektu kończy się czytelnym opisem ograniczenia, nie fikcyjną konfiguracją.
- Korzystamy ze [wspólnych wytycznych authoringu](../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md),
  obecnie v1.7, i przekazujemy ich wymagania do briefów i promptów. Nie utrzymujemy
  drugiej kopii reguł kreatora. Historyczne briefy zachowują numer swojej wersji.
- Każda nowa/poprawiana scena musi przejść odbiór według tych reguł, w tym
  posiadać zaplanowany ruchomy element, liczne zintegrowane detale światła,
  przepływ kolorów i niezależne światło w zaciemnieniu. Generowanie kolejnych
  klatek filmu nie zastępuje warstwowej paczki dla naszego silnika.
- Odbiór techniczny i wizualny są oddzielne. Test zmienionych pikseli nie
  potwierdza jakości masek, kompozycji ani czytelności animacji.
- Wersje modeli, wag, instrukcji i konfiguracji zapisujemy w pochodzeniu
  projektu. Powtarzalny seed nie jest obietnicą identycznych pikseli na każdym
  urządzeniu i w każdej wersji środowiska.

## Zestaw wybrany w KRE-00

Poniższe role były kandydatami w planie 1.0. Końcowy profil i ograniczenia
opisuje [raport zamknięcia](reports/KRE-00-2026-11-13-closure.md): Qwen/Vulkan,
Klein/BF16 z ograniczonym attention, odczytem pread i trzema procesami
enkoder/transformer/VAE, SAM/ROCm oraz LaMa/CPU. ComfyUI nie jest wymagany;
Depth Anything pozostaje opcjonalny. Zestaw odebrano dla testowanej recepty
i wymiarów, bez obietnicy dowolnych stylów ani pełnej autonomii kreatora.

| Rola | Profil po KRE-00 | Zakres potwierdzenia |
| --- | --- | --- |
| Rozmowa, analiza obrazów, narzędzia | Qwen3.5-9B Q4_K_M + projektor F16 | Narzędzia i ograniczona analiza; maski wymagają wskazówek |
| Obrazy i edycja | FLUX.2 Klein 4B BF16 | AMD/ROCm, pread, osobne procesy enkodera/transformera/VAE; edycja chroniona maską |
| Wydzielanie obiektów | SAM 2.1 Tiny/ROCm | Punkty/ramka, wybrane obiekty i znane granice jakości |
| Uzupełnianie tła | LaMa ONNX/CPU | Proste tło; architektura i drobna organika mają ograniczenia |
| Głębia, opcjonalnie | Depth Anything V2 Small | Po podstawowej paczce, jeśli potrzebny do sceny |
| Wykonawca obrazów | Trwała kolejka i osobny supervisor KRE-02, izolowane procesy Python | Małe rzeczywiste próbki adapterów i współpraca z audio odebrane technicznie; pełna scena w KRE-03 |
| Serwer językowy | llama.cpp b12110/Vulkan | Wybrany lokalny serwer dla przypiętych wag |

Podczas instalacji trzeba ponownie sprawdzić dokumentację AMD, wersje backendów
i warunki dla konkretnych wag. Nie przenosimy wyników NVIDIA na Radeon ani
licencji jednego wariantu na całą rodzinę. W szczególności warianty Depth Anything
V2 mają różne licencje. Brak subskrypcji API nie gwarantuje braku ograniczeń
licencyjnych pobranych dodatków.

Źródła sprawdzone podczas analizy, do ponownej weryfikacji w KRE-00:

- [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- [FLUX.2 Klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- [SAM 2 i licencja checkpointów](https://github.com/facebookresearch/sam2#license)
- [LaMa ONNX od OpenCV](https://huggingface.co/opencv/inpainting_lama)
- [Depth Anything V2 i warianty licencji](https://github.com/DepthAnything/Depth-Anything-V2#license)
- [ComfyUI: instalacja Windows/AMD](https://docs.comfy.org/installation/manual_install)
- [ComfyUI: Klein 4B i edycja](https://docs.comfy.org/tutorials/flux/flux-2-klein)
- [llama.cpp: backendy](https://github.com/ggml-org/llama.cpp)
- [AMD: instalacja PyTorch](https://rocm.docs.amd.com/projects/ai-ecosystem/en/latest/frameworks/pytorch/install.html)

## Ograniczenia pierwszego wdrożenia

Pierwszy cel to jeden lokalny użytkownik i jedna kompletna scena przygotowana
oraz poprawiona w aplikacji. Nie obiecujemy automatycznie idealnych masek dla
każdego stylu ani takiego samego poziomu rozumowania jak w obecnej pracy z agentem.
Pomiar ma wskazać, gdzie potrzebne jest wskazanie obszaru lub korekta pędzlem.

Poza pierwszym wdrożeniem: współbieżne generowanie dla wielu użytkowników,
hosting modeli w chmurze, trening/LoRA, generowane na żądanie shadery i kod
silnika, pełny semantyczny Journey Planner, automatyczne nowe portale pomiędzy
dowolnymi scenami oraz smuga akumulowana wzdłuż historii krzywej lotu.

Brak wybranego modelu, słabe maski lub zbyt wolne przetwarzanie nie mogą być
ukryte za ukończonym interfejsem. Warunkiem kontynuacji jest wynik benchmarku
z rekomendacją i jawnymi ograniczeniami.
