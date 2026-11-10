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
Niewykonane pozostają B-04–B-11 i pełny odbiór jakości. RAM procesu serwera mierzy
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
