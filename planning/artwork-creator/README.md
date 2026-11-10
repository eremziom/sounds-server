# Kreator artworków i odtwarzacz — plan wdrożenia

Wersja dokumentacji: **1.0, 2026-11-09**.
Status: **KRE-00 do korekty, 2026-11-10**; wykonano lokalne próby LLM/VLM,
modeli obrazu, sekwencji, anulowania i podglądu B-01–B-11.
[Bieżący raport](reports/KRE-00-2026-11-10-sequence-qa.md) opisuje wyniki
techniczne oraz niespełnione wymagania jakości. Kreator w UI i etapy
KRE-01–KRE-08 pozostają niewdrożone.

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

## Jak korzystać z planu

| Dokument | Zawartość |
| --- | --- |
| [architecture.md](architecture.md) | Podział aplikacji, modeli i narzędzi; dane, zadania, wersje, podgląd i publikacja |
| [implementation-plan.md](implementation-plan.md) | Kolejność KRE-00–KRE-08, zależności, zakres plików, rezultaty i kryteria odbioru |
| [local-model-benchmark.md](local-model-benchmark.md) | Pierwszy test sprzętu i modeli, scenariusze, pomiary i formularz wyniku |
| [progress.md](progress.md) | Aktualny etap, lista prac, decyzje i odnośniki do dowodów |

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
| Backend kreatora | Brak modeli projektów artworków, wersji, zadań AI i opublikowanej biblioteki |
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

## Kandydaci, a nie ostateczny wybór modeli

| Rola | Kandydat | Kiedy rozstrzygamy |
| --- | --- | --- |
| Rozmowa, analiza obrazów, narzędzia | Qwen3.5-9B, wariant kwantyzowany i zgodna część wizyjna | KRE-00: poprawność narzędzi, jakość analizy i pamięć |
| Obrazy i edycja | FLUX.2 Klein 4B | KRE-00: generowanie i edycja na AMD, format wag, jakość i czas |
| Wydzielanie obiektów | SAM 2.1 | KRE-00: punkty/obszary, cienkie krawędzie, zgodność środowiska |
| Uzupełnianie tła | LaMa, np. wariant ONNX | KRE-00: jakość i czas, CPU/GPU |
| Głębia, opcjonalnie | Depth Anything V2 Small | Po podstawowej paczce, jeśli potrzebny do sceny |
| Wykonawca obrazów | ComfyUI; alternatywny backend za adapterem | KRE-00: zgodny lokalny proces, bez obowiązku używania UI ComfyUI |
| Serwer językowy | llama.cpp lub zgodny lokalny serwer | KRE-00: konkretna architektura, kwantyzacja, obraz i wywołania narzędzi |

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
