# KRE-00 — odizolowane próby lokalne

Narzędzia poza runtime aplikacji; Python 3.12+ używa biblioteki standardowej,
adapter Node używa istniejących zależności UI (`next`/`sharp`) i parsera silnika.
Nie instalują pakietów globalnie. Dane i przenośny backend znajdują się w
ignorowanym `/.local/kre00/` na dysku repozytorium. Nie korzystają z cache audio
ani z istniejącego katalogu modeli użytkownika.

Z katalogu głównego repozytorium:

```powershell
py tools/artwork-creator/kre00.py diagnose
py tools/artwork-creator/kre00.py prepare-llm
py tools/artwork-creator/kre00.py probe-llm --runs 3
py tools/artwork-creator/kre00.py probe-capabilities --runs 3
py tools/artwork-creator/kre00.py gpu-status
node --test tools/artwork-creator/benchmark-tools.test.mjs
py -m unittest discover -s tools/artwork-creator -p test_kre00.py -v
```

Diagnostyka CIM i połączenia sieciowe wymagają dostępu poza piaskownicą Codexa.
`prepare-llm` pobiera tylko jeden wariant Qwen3.5-9B Q4_K_M i projektor F16
z przypiętej rewizji Unsloth oraz llama.cpp b12110 Vulkan z oficjalnego wydania.
Weryfikuje SHA256 względem metadanych źródła, zapisuje pochodzenie/licencje.
To weryfikacja integralności względem serwera, nie niezależny audyt dostawcy.
Niepełny plik `.partial` nie jest używany jako model; ponowienie pobiera go od
początku. Każdy odczyt sieciowy ma limit 45 s bezczynności; postęp co około 15 s.

`probe-llm` uruchamia własny serwer tylko na `127.0.0.1:18790` (zajęty port
powoduje odmowę), jawnie wybiera Vulkan0 i kończy własny proces także po błędzie
lub Ctrl+C. Na tej maszynie Vulkan0 to RX 7800 XT; sprawdź kolejność poleceniem
`llama-server.exe --list-devices` przed użyciem na innym komputerze.
Domyślny limit to 3600 tokenów odpowiedzi; opcja `--max-tokens` pozwala go zmienić.
Dokładniejszy log (`-lv 4`) potwierdza urządzenie i liczbę warstw na GPU.
Zapisuje pełny prompt, seed, odpowiedź, hash wytycznych, czas do gotowości,
czasy żądań, medianę/zakres i log backendu. B-01 obejmuje trzy różne seedy.
Pierwsza odpowiedź może uwzględniać kompilację shaderów; pozostałe mogą
korzystać z cache promptu. To jeden start procesu i trzy odpowiedzi, nie trzy
niezależne zimne starty. Oddzielne uruchomienie komendy tworzy nową serię.

Aktualny zakres automatyzacji: diagnostyka, próbny brief B-01 i B-02/B-03.
`probe-capabilities` wykonuje po trzy próby lokalizacji motocykla, błędu maski
bez podpowiedzi i ze wskazówką, następnie sześć scenariuszy narzędziowych z
trzema seedami. Jawny format obrazu to całkowite współrzędne 0–1000 i JSON Schema;
adapter przelicza je na 0–1. Nie gwarantuje to trafności lokalizacji.
Narzędzia Node modyfikują wyłącznie kopie w `.local/kre00/runs`. Obrazy i manifest
źródłowy są kontrolowane hashami przed/po. Benchmark startuje z kopii, w której
okres lampki to 6 sekund, aby żądanie 5 sekund było rzeczywistą zmianą.

`gpu-telemetry.ps1` próbkuje liczniki WDDM konkretnego PID i adapterów co około
sekundę, również przez kilka sekund po zakończeniu serwera. `gpu_observed`
zawiera maksimum próbek po wszystkich adapterach PID oraz odstępy pomiaru.
Nie jest dokładnym szczytem alokacji ani mapowaniem LUID do fizycznej karty.
Wyniki B-04–B-08 opisano poniżej, a B-09–B-11 w sekcji sekwencji.
Pełny odbiór jakości pozostaje otwarty. RAM procesu serwera mierzy
Windows GetProcessMemoryInfo (peak working set i peak commit); nie jest to
pamięć całego systemu ani wszystkich procesów. Pola pamięci są `null`, gdy
nie zostały zmierzone; rozmiar wag i alokacje z logu nie zastępują pomiaru.
Przeczytanie odpowiedzi wymaga sprawdzenia `finish_reason` i ewentualnego
ucięcia przez `max_tokens`; obecność JSON nie stanowi zaliczenia próby.

Duże artefakty pozostają lokalnie. Małe dowody i raporty należy kopiować do
`planning/artwork-creator/reports/` przed archiwizacją; sama ścieżka lokalna
nie zapewnia trwałości. Kryteria całego etapu:
[local-model-benchmark.md](../../planning/artwork-creator/local-model-benchmark.md).

Statyczny arkusz porównania B-02 (ramki modelu):
`node tools/artwork-creator/review-sheet.mjs .local/kre00/runs/NAZWA_SERII`.
Tworzy `review.webp` i odmawia nadpisania istniejącego. Nie ocenia animacji.

## Modele obrazu

Instalacja jest osobnym, jawnym krokiem; zwykłe testy nie pobierają wag.
Wykonane wersje/rewizje, freeze i SHA są w
[raporcie](../../planning/artwork-creator/reports/KRE-00-2026-11-10-image-models.md).
Pierwsze przygotowanie wybiera i zapisuje wersje z PyPI; kolejne odczytują lock
z `.local/kre00/`. Zależności przechodnie dokumentuje raport pip/freeze.
Nie zakładać identycznego środowiska po przyszłym ponownym rozwiązaniu zależności.

```powershell
py tools/artwork-creator/image_environment.py prepare-lama
node tools/artwork-creator/lama-fixture.mjs .local/kre00/runs/lama-first
.local/kre00/venvs/onnx/Scripts/python.exe tools/artwork-creator/lama_probe.py .local/kre00/runs/lama-first
py tools/artwork-creator/image_environment.py prepare-gpu
.local/kre00/venvs/torch-rocm721/Scripts/python.exe tools/artwork-creator/inspect_image_runtime.py torch
py tools/artwork-creator/image_environment.py prepare-sam
py tools/artwork-creator/image_environment.py probe-sam
py tools/artwork-creator/image_environment.py probe-material
py tools/artwork-creator/image_environment.py prepare-klein
py tools/artwork-creator/image_environment.py probe-klein
```

`lama-first` jest fixture domyślną SAM. Utworzenie jej jest jednorazowe;
ponowienie LaMa wymaga nowej nazwy katalogu, aby zachować poprzednie wyniki.
Kolejne workery SAM/Klein same tworzą unikalne katalogi.
`prepare-klein` pobiera jeden BF16 zestaw około 14,88 GiB, po dwa składniki
równolegle. Pobrania dużych plików wznawiają Range tylko po sprawdzeniu zakresu;
gotowy plik zawsze przechodzi SHA256. Odpowiedź 200 zastępuje częściowy plik.
Szablon `.jinja` tokenizera jest częścią przypiętego zestawu, nie własnym promptem.

Enkoder i obraz Klein pracują w kolejnych procesach. Próbny adapter
`bounded_attention.py` dzieli tylko query na porcje 256, nadal używając wszystkich
keys/values. Zastępuje dispatch w procesie konkretnej wersji Flux2; nie zmienia
pakietów ani silnika aplikacji. Nie obsługuje treningu, causal/masked attention
lub wielu urządzeń i wymaga ponownej weryfikacji po aktualizacji Diffusers.
Workery wybierają RX 7800 XT, wymagają co najmniej 11 GiB wolnej pamięci według
API HIP i ograniczają alokator procesu do 85%. Nie gwarantuje to pełnego budżetu
Windows/sterownika/renderera; dalsza próba integracyjna jest obowiązkowa.

Alternatywa dla surowej edycji (wskazać katalog ukończonej próby Klein):

```powershell
py tools/artwork-creator/image_environment.py probe-locked-edit --source-run .local/kre00/runs/NAZWA_PROBY_KLEIN
.local/kre00/venvs/onnx/Scripts/python.exe -m unittest discover -s tools/artwork-creator -p test_image_ops.py -v
.local/kre00/venvs/torch-rocm721/Scripts/python.exe -m unittest discover -s tools/artwork-creator -p test_bounded_attention.py -v
```

Punkty/ramka w próbie maskowanej dotyczą ręcznie obejrzanego draftu 1024×576,
seed 500, i nie są uniwersalnym lokalizatorem drona. Ochrona świateł to jawna
heurystyka tej próbki. Kod gwarantuje zachowanie pikseli poza wskazaną maską;
nie gwarantuje jej artystycznej poprawności. Wyniki nie są publikowane w aplikacji.

## Sekwencja, anulowanie i podgląd

```powershell
py tools/artwork-creator/kre00.py probe-sequence-plan --runs 3
py tools/artwork-creator/sequence_probe.py .local/kre00/runs/NAZWA_PLANOW_LLM
py tools/artwork-creator/cancellation_probe.py .local/kre00/runs/NAZWA_PROBY_KLEIN
node --experimental-strip-types tools/artwork-creator/preview-package.mjs .local/kre00/runs/NAZWA_SEKWENCJI/job-0
node tools/artwork-creator/preview.browser.mjs .local/kre00/runs/NAZWA_SEKWENCJI/job-0
```

Sekwencja sprawdza trzy zadania o stałych parametrach i ręcznie zweryfikowanym
punkcie segmentacji. Planowanie LLM poprzedza workery obrazu; serwer jest
zwalniany przed ich uruchomieniem. Nie jest to docelowa kolejka/API.
Próba anulowania przerywa własny proces po pierwszym kroku dyfuzji i ponawia
w nowym katalogu. Przyjmuje ukończoną serię Klein z obrazem i embeddingami.
Manifest podglądu tworzy się tylko raz; przeglądarka zapisuje kolejne unikalne
katalogi. Uruchomienie Chromium może wymagać uprawnień poza sandboxem.
Podgląd nagrywa rzeczywisty lot/blackout/zoom; liczba kroków 1/60 nie stanowi
benchmarku FPS. Brak portalu i publikacji. Maska środowiska, zasłanianie i
propagacja koloru nie mają odbioru jakościowego — szczegóły w
[raporcie B-09–B-11](../../planning/artwork-creator/reports/KRE-00-2026-11-10-sequence-qa.md).
