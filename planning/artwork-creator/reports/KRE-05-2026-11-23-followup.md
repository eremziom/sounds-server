# KRE-05 — wskazanie, wspólny lot i potwierdzenie zapisu

**2026-11-23. KRE-05 zamknięty funkcjonalnie na sprawdzonym profilu.**
Powtórka na przypiętym Qwen3.5-9B Q4_K_M, F16 i llama.cpp
b12110/Vulkan z kontekstem 16 384 tokenów. Próba działała na kopii „Nocnego
ogrodu” w izolowanej bazie, przez API, rzeczywistą kolejkę i aplikację
z odtwarzanym utworem testowym.

| Przypadek | Wynik |
| --- | --- |
| Wskazanie kadłuba i kolumny | W końcowej próbie Qwen odróżnił kadłub od statycznej kolumny. Każde omówienie punktu dostało osobne zbliżenie z czerwonym znacznikiem, bez poprzedniej odpowiedzi o innym punkcie. Oba wejścia miały po 9 351 tokenów. |
| Polecenie „Poprowadź drona wraz z jego światłami wyższym łukiem” | Qwen wystawił jedno `setTravel`. Pierwszy punkt kontrolny zmienił się z `y=-450` na `y=-700`. API dołączyło `drone-lights`, wykonawca zbudował raport, a jawne zastosowanie zapisało nową rewizję. Porównanie rewizji potwierdziło identyczne trasy obu warstw i zachowanie czasu 24 s, końca lotu, punktu obrotu oraz pozostałych warstw i artefaktów. |
| Potwierdzenie błysku | Rzeczywista kolejka i API zapisały 0,2 Hz. Na pytanie o zastosowanie odpowiedź odczytała aktywną rewizję i zadanie w kolejce. Podała 0,2 Hz i jeden cykl co 5 s. Ogólny kontekst modelu zawiera osobny status zastosowania każdego odpowiedniego zadania. |
| Kolor i modulacja basem | Doprecyzowane polecenie (jedno `setBehaviors`) dało poprawną propozycję. Wykonawca i API zapisały `hue=1.57` rad oraz minimum modulacji basem `0.75`. Porównanie rewizji potwierdziło zachowanie pozostałych parametrów, masek i kolejności efektów. Pierwsza odpowiedź opisała zmianę słownie. [Próba koloru i basu](../../../.tmp/kre05-completion-1795438553097/color/summary.json). |

Podgląd zapisanej trasy miał 806 klatek na przestrzeni 27,0 s. Próbki
pokazują oddzielnie włączone światła w zaciemnieniu (1 s), kadłub i światła
przed kolumną (8 s), przesłonięcie (10 s), ponowne pojawienie się podczas
zoomu (12 s) i dalszą animację po wyjściu drona z kadru (19–25 s).
Przeglądarka potwierdziła ciągłość kontekstu WebGL i odtwarzacza, zamrożenie
po pauzie i odzyskanie projektu po przeładowaniu. Ziarniste krawędzie mchu
i światła na kamieniu nadal są widoczne w zbliżeniu.

Wcześniejsze próby ujawniły przepełnienie kontekstu, opis łuku bez wywołania
narzędzia, pomylenie poprzedniego punktu z nowym i mylenie stanu kolejki ze
stanem rewizji. Kontekst skrócono przez usunięcie powtórzonych danych i starszej
historii. W ramach istniejącego budżetu naprawy model może zwrócić konkretne
`setTravel` po opisaniu go w tekście. Wiadomość o pojedynczej propozycji trasy
jest budowana ze zwalidowanych argumentów, dzięki czemu odpowiada faktycznie
wybranym warstwom. Przerwanie pobierania podglądu w przeglądarce zamyka
teraz również strumień obrazu w API.

## Weryfikacja

- `pnpm --filter api build` i ESLint zmienionych modułów API przeszły.
- Jest w `apps/api`: 25/25 w zestawach rozmowy, zaznaczenia, adaptera,
  katalogu narzędzi i projektu startowego.
- `node scripts/test-artwork-chat.cjs` i `node scripts/test-artworks.cjs`:
  integracje HTTP/PostgreSQL przeszły.
- Regresje UI rozmowy, proxy, kreatora, podglądu i produkcji: 40/40.
- [Rzeczywista próba API](../../../.tmp/kre05-completion-1795438553097/acceptance/summary.json),
  [wynik przeglądarki](../../../.tmp/kre05-completion-1795438553097/acceptance/browser-summary.json),
  [nagranie](../../../.tmp/kre05-completion-1795438553097/acceptance/ui-qa/starter-motion.webm),
  [wskazanie kadłuba](../../../.tmp/kre05-completion-1795438553097/acceptance/marked-drone.png),
  [wskazanie kolumny](../../../.tmp/kre05-completion-1795438553097/acceptance/marked-pillar.png).

Odbiór dotyczy działania kreatora na sprawdzonym profilu i scenie.
Zapas kontekstu zależy od rozmiaru projektu. Modele produkcji obrazów
pozostawały wyłączone w tej próbie.
