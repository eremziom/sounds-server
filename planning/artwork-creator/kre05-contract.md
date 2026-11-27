# KRE-05 — kontrakt rozmowy

**Zamknięty funkcjonalnie na sprawdzonym profilu, 2026-11-23.**
Wyniki prób rzeczywistego modelu opisuje [raport odbioru](reports/KRE-05-2026-11-23-followup.md).
Wspólny typ: `apps/artwork-contracts/index.d.ts`. Wykorzystuje projekty,
wiadomości i kolejkę KRE-01/02. Nie zmienia schematu bazy ani runtime audio/silnika.

## HTTP

Ścieżki względem `/artworks/projects/:projectId`, chronione JWT oraz własnością
projektu dla operacji i historii. BFF `/api/artworks/projects/…` przepuszcza
wyłącznie jawne ścieżki, cookie bearer, prywatne odpowiedzi i dotychczasową ochronę Origin.

| Metoda i końcówka | Znaczenie |
| --- | --- |
| GET `chat/status` | Dostępność modelu, operacji modeli obrazu i limity; nie uruchamia modelu |
| POST `chat` | `{requestId, baseRevisionId, text, mode, imageArtifactId?, point?}` |
| POST `chat/:requestId/execute` | Jawne zlecenie zwalidowanej propozycji do istniejącej kolejki |
| POST `chat/:requestId/cancel` | Zapisane anulowanie odpowiedzi/propozycji; nie zatrzymuje muzyki ani już zleconych zadań |
| POST `chat/:requestId/apply/:jobId` | Jawne zastosowanie zakończonego `setTravel`/`setBehaviors` przez nową rewizję |
| GET `messages` | Istniejąca stronicowana historia, w tym nowe role rozmowy |

`mode=discuss` nie dopuszcza wywołań narzędzi. `mode=plan` może zwrócić do trzech
operacji; najwyżej jedna zmiana trasy/efektów, aby równoległe raporty nie
nadpisywały wzajemnie zmian tej samej rewizji. Brak warstwy lub identyfikatora
nie jest zgodą na wymyślenie obiektu. Walidacja korzysta z istniejącego katalogu
narzędzi; kolejka i budowniczy nadal sprawdzają rejestrację i kontrakt silnika.
Nie ma wykonania kodu modelu ani zmiany plików repozytorium.

W rozmowie propozycja `setBehaviors` scala zmiany po ID efektu.
Zachowuje pominięte efekty, pola i parametry na tej samej warstwie. Przy zmianie
rodzaju efektu model przekazuje jego pełną definicję. Do istniejącej kolejki
zawsze trafia kompletna lista efektów warstwy. Usuwanie efektów wykracza poza
zakres tej operacji w rozmowie.

Propozycja `setTravel` składa się z jednej warstwy głównej, obiektu `travel`
i opcjonalnej listy `linkedLayerIds`. Koordynator scala przekazane pola
z dotychczasową trasą. Dołącza warstwy o identycznej trasie, wspólnym
obrazie i wspólnej masce przesłaniania. Warstwy jawnie wskazane przez model
muszą współdzielić pierwotną trasę. Budowniczy sprawdza to przed zmianą
wszystkich warstw w jednym raporcie. Jeżeli model opisał konkretną trasę
w tekście, koordynator może wykorzystać jedyną próbę naprawy do uzyskania
wywołania `setTravel`.

## Zapis i ponowienia

`CreatorMessage` przechowuje role `chat-user`, `chat-assistant`, `chat-tool`.
Pole `text` zawiera wersjonowany JSON żądania/odpowiedzi lub zapis wyników
zlecania; stare notatki `user` pozostają osobnym interfejsem. Żądanie i odpowiedź
`pending` powstają w jednej transakcji. UUID żądania i deterministyczne UUID
odpowiedzi/wyników zabezpieczają powtórzenie HTTP przed nową inferencją.
Inna treść z tym samym UUID daje konflikt. Zmiana zapisanej odpowiedzi jest
warunkowa: spóźniony model nie nadpisze anulowania.

Statusy odpowiedzi: `pending`, `answered`, `proposed`, `failed`, `cancelled`.
Propozycja nigdy sama nie zapisuje sceny i nie zleca zadania. `execute` korzysta
z klucza `chat-<requestId>-<index>`; kolejne kliknięcie odzyskuje to samo zadanie.
Wyniki są wyświetlane na podstawie rzeczywistych stanów kolejki. Niezakończone
zadanie nie oznacza sukcesu. Obrazy i maski wybiera się istniejącymi formularzami;
raport zmiany efektu/trasy stosuje osobny przycisk. `apply` sprawdza pochodzenie
zadania, jego sukces i zgodność rewizji, a zapis używa istniejącego compare-and-swap.
Marker w decyzjach rewizji pozwala odzyskać wynik po utracie odpowiedzi zapisu.
Nie usuwamy wcześniejszych decyzji, gdy osiągnięto ich limit.
Model widzi rozróżnienie między zadaniem zastosowanym w aktywnej rewizji,
gotowym do zastosowania i związanym z inną rewizją. Na bezpośrednie pytanie
o status zastosowanego zadania lub bieżącą częstotliwość nazwanego efektu
API może odpowiedzieć z aktywnej rewizji i zapisu kolejki.

Po restarcie API historia i propozycje pozostają. Aktywna inferencja nie jest
automatycznie wznawiana: osierocone `pending` można jawnie anulować i wysłać nową
wiadomość. Przerwanie po stronie przeglądarki nie jest dowodem anulowania na
serwerze; panel odzyskuje historię i udostępnia osobne anulowanie.

## Lokalny model i kontekst

`ARTWORK_CHAT_ENABLED=false` domyślnie. `ARTWORK_CHAT_URL` to loopback HTTP,
domyślnie `http://127.0.0.1:8080`. Adapter nie uruchamia procesu llama.cpp ani
nie ładuje wag; po włączeniu kontaktuje istniejący `/v1/chat/completions`.
Przekierowania i zdalne URL są odrzucane. Model docelowy to przypięty w KRE-00
Qwen3.5-9B/Vulkan z projektorem.
`ARTWORK_CHAT_HEAVY_JOBS_ENABLED=false` blokuje zlecanie narzędzi `klein`/`sam`
przez rozmowę; istniejące bramki pamięci kolejki nadal obowiązują.

Kontekst zawiera aktualny snapshot, metadane artefaktów, do ośmiu ostatnich
wiadomości (po 240 znaków) i 12 ostatnich zadań wraz z rzeczywistymi wynikami
i błędami. Bieżąca wiadomość następuje po aktywnej rewizji, która określa
obecne wartości parametrów sceny. Instrukcja
kreatora z wytycznych authoringu, tabela operatorów i opis tras przed sekcją
weryfikacji są czytane ze źródeł repozytorium. Formularz wywołań narzędzi
trafia do modelu w trybie planowania. Prompty obrazów niosą tę samą instrukcję
kreatora ze wspólnych reguł v1.7. Przekroczenie limitu zgłoszone przez
przypięty llama.cpp jest zapisywane jako `ARTWORK_CHAT_CONTEXT_LIMIT`.

Opcjonalnie przesyłany jest jeden należący do projektu PNG do 2 MiB. Przy
wskazaniu punktu model otrzymuje zbliżenie do 224 × 224 px z czerwonym
znacznikiem, a współrzędne pozostają w wymiarach oryginału. Przy omówieniu
konkretnego punktu wcześniejsze interpretacje obrazu nie trafiają do modelu.
PNG źródłowy pozostaje zapisanym artefaktem projektu.
Nie wysyłamy wszystkich binariów ani ścieżek prywatnego storage. Kontekst projektu
ma limit 24 tys. znaków, wiadomość 4 tys., odpowiedź transportu 64 tys. bajtów,
a zapis odpowiedzi 16 tys. znaków. Obsługa większych obrazów i kalibracja
rzeczywistego limitu tokenów wymagają późniejszej próby z modelem.

Budżet: maksymalnie dwie odpowiedzi modelu (druga tylko po błędzie walidacji),
1800 tokenów wyjściowych na odpowiedź, 40 s na wywołanie i 45 s łącznie.
Żadna operacja nie wykonuje się w tej pętli. Po błędzie zostaje jawny wynik
niepowodzenia; nie ma samoczynnej pętli poprawiania obrazów.

## Zakres prób

Próby objęły zestaw polskich poleceń, scenę „Nocny ogród” i lokalny profil
Qwen/Vulkan. Budżet kontekstu 16 384 tokenów zależy od danych projektu
i rozmiaru obrazu.
