# KRE-00 Klein — brief próbny, nie gotowa paczka

Wytyczne: **v1.7, 2026-11-09**, wspólne źródło
[artwork-authoring-guidelines.md](../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md).
Kopia w katalogu wyników zachowuje także repozytoryjną ścieżkę źródła:
`apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md`.

Cel B-04/B-05: sprawdzić lokalną kompozycję 16:9 i edycję wskazanego elementu,
bez publikowania ani zmiany zaakceptowanych scen. To draft bitmapy, nie manifest
warstwowy ani dowód możliwości pełnej produkcji przez aplikację.
Pierwszy rozmiar 512×288; kolejna próba 1024×576, jeśli mniejsza mieści się
w pamięci. Żaden z nich nie jest natywnym 4K. Canvas przyszłej paczki 3840×2160
nie zmienia rzeczywistej rozdzielczości tych źródeł.

## Zastosowanie reguł do sceny

Kamienna brama w nocnym, porośniętym roślinnością ogrodzie; niewielki dron jest
od początku integralną częścią kadru. Brama zajmuje prawą środkową część;
dron w lewej środkowej części, środek (0,25; 0,45), szerokość około 8% kadru.
Wolna przestrzeń prowadzi przez otwór bramy do prawego końca kadru. Nie dodajemy
portalu ani połączenia z istniejącą podróżą.

Docelowe grupy: pełne nieruchome tło; tylna część bramy; osobna roślinność;
przedni filar i gałęzie przesłaniające dron; oddzielna warstwa drona ze światłami.
Maski widoczności, wpływu, przesłaniania i opóźnienia światła mają odrębne role.
Tło pod dronem i na całej trasie musi później być kompletne, bez wypalonej kopii.
Jedna wygenerowana bitmapa nie spełnia tego warunku bez dalszego przygotowania.

Docelowy jednorazowy lot: 12 s od początku symulacji, ease-in-out, Bezier
przesunięć w canvasie silnika: control1=(600,-360), control2=(1800,-360),
to=(2340,108); źródłowy pivot około (960,972), obrót zgodny z trasą. Początek
i koniec pozostają w widocznym kadrze. Zapas obrazu obejmuje całą sylwetkę,
obrót i odsłanianą zawartość. Dron przelatuje za przednim filarem i gałęziami,
ale przed dalszym ogrodem. To plan według istniejącego layer.travel, nie jego
implementacja w tym benchmarku. Pauza/stop zachowują położenie, Reset cofa czas.

Światła muszą należeć do materiału: około 40 drobnych kamiennych szczelin oraz
około 60 żyłek/liści w kilku skupiskach na obu stronach bramy, w bliskiej
roślinności i dalszym ogrodzie. Liczby są zamiarem kompozycji do oceny, nie
wynikiem zliczenia wygenerowanych detali. Pasma żyłek i lian prowadzą wyraźny
przepływ nasyconego cyjanu, magenty i bursztynu; zachować ciemne szczeliny,
fakturę, cienkie kontury i przesłanianie. Bez doklejonych kropek i ogólnych linii.
Plan trzech grup impulsów: okresy 6/8/11 s i różne fazy; osobne dane opóźnienia
przepływu wzdłuż lian, około 12 s na cykl. Nie wymagamy wszystkich operatorów.

Pełny blackout ma wyzerować otoczenie bez przezroczystych dziur. Oddzielne żyłki,
szczeliny i lampki drona mają zachować kolory i impulsy od pierwszej klatki.
Plan odsłaniania: 8 s płynnego przejścia do zwykłego widoku, zamrażanego wspólną
pauzą. Dalsza paczka musi zweryfikować dokładne dopasowanie masek i precyzję cieni.
Rysunek koncepcyjny pokazuje chronione materiały, nie implementuje blackout/reveal.

## Edycja i odbiór

B-05: zmiana wyłącznie turkusowego kadłuba drona na czerwony; zachować jego
położenie, rozmiar, lampki, geometrię bramy, roślinność, paletę i oświetlenie tła.
Zapisujemy parę przed/po i rzeczywiste różnice poza wskazanym elementem. Brak
identyczności tła jest ograniczeniem edytora generatywnego, nie sukcesem polecenia.

Do odbioru produkcyjnego pozostają: rozdzielenie warstw, maski na obrazie i w
zbliżeniu, pełny lot/obrót/przesłanianie, pauza/Reset, pełne cykle impulsów i barw,
blackout i powolne odsłanianie, zoom i nagrania. Niepewne granice: drobna
roślinność, szczeliny między kamieniami i tło za dronem. Nie wprowadzamy nowych
operatorów silnika. Żadna nieruchoma próbka nie ustanawia gotowości produkcyjnej.
