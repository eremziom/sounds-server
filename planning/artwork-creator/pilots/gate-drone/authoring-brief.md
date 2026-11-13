# KRE-03 — nocny ogród i dron, plan pilota v1

Wspólne wytyczne: [artwork-authoring-guidelines.md v1.7](../../../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md).
To brief wejściowy przed generowaniem; wynik i korekty są osobno wersjonowane.

Scena 16:9: mroczny ogród, kamienna brama po prawej, przestrzeń lotu w środku.
Mały zwarty dron w lewej środkowej części kadru (plan: x≈25%, y≈45%, szerokość
około 10%) jest integralnym elementem kompozycji od pierwszego projektu.
Źródło 1024×576, canvas silnika 3840×2160; nie deklarujemy natywnego 4K.

## Ruch, tło i przesłanianie

Źródło powstaje z dronem. SAM wydziela jego widoczność, osobna poszerzona maska
wyznacza usunięcie drona z tła przez LaMa. Trasa 24 s: płynny łuk z lewej na
prawą stronę, zakręt i przyspieszanie/zwalnianie, orientacja względem stycznej
wokół środka faktycznej maski. Dron przelatuje za nieruchomym filarem bramy
i opuszcza kadr. Osobna maska filara działa w współrzędnych sceny; rejestracja
na warstwach drona i jego lamp jest jawną operacją narzędzia, bez ręcznej edycji.
Nie generować wiązki reflektora, smugi ani wypalonej poświaty wokół obiektu.
Brakujące tło i niepewne kontury wymagają oceny w rzeczywistym ruchu/zoomie.

## Materiały światła i koloru

Wiele dziesiątek drobnych, zintegrowanych z kamieniem szczelin i żyłek liści,
kilka grup w różnych częściach i planach ogrodu. To rzeczywisty materiał obrazu,
nie doklejone punkty lub kreski. Trzy grupy środowiskowe i osobne lampy drona.
Selekcje mają zachowywać ciemne szczeliny, fakturę, cienkie granice i przesłanianie.
Kolory cyan–magenta–amber mają być mocne, nasycone i rozróżnialne w pełnym kadrze.
Podłużne pasma mają osobne mapy opóźnienia oraz wpływu; różne fazy impulsów,
pełne cykle i przestrzenny przepływ wzdłuż materiału, bez deformacji widoczności.
Reakcja audio wykorzystuje istniejące, ograniczone powiązania glow z basem.

## Zaciemnienie

Nieprzezroczysta czarna warstwa bazowa zachowuje pokrycie. Otoczenie i kadłub
mogą mieć opacity 0; chronione światła środowiska i lampy drona nadal korzystają
z animacji, map czasowych i tej samej trasy. Animacje działają od pierwszego
kroku. Płynne odsłanianie 8 s, normalny widok, później płynny powrót do czerni.
Nie wprowadzamy nowych operatorów ani drugiego zegara; pauza zamraża wszystko.

## Odbiór

Obejrzeć oryginał, tło po LaMa i wszystkie maski na źródle. W WebGL nagrać pełną
trasę, zwrot, przejście za filarem, wyjście z kadru, impulsy i przepływ kolorów,
blackout/reveal w cieniach oraz zoom. Sprawdzić pauzę, Reset, krycie, budżet,
poziomy/pionowy viewport i reakcję na kontrolowane sygnały audio. Zapisujemy
niepewne granice i pozostałe korekty; sam changed-pixel lub udany manifest nie
stanowi akceptacji wizualnej. Wszystkie poprawki pikseli przechodzą przez
zarejestrowane operacje API, nie edycję plików wynikowych przez programistę.

## Zastosowanie do wygenerowanego źródła i korekty

Wynik seed 785 umieścił drona bliżej x=34,5%, y=42,5%, o szerokości około 14%
kadru. SAM używa rzeczywistych wskazań, a punkt obrotu pochodzi z raportu
centroidu maski. Dwa małe drony wygenerowane w tle zostały usunięte przez
maski API i LaMa. Pierwsza rekonstrukcja zachowała plamę po lampie: korekta
`backing-v2` usuwa cały obszar drona i jego poświaty, z zachowaniem pikseli poza
maską. Nie przesuwano obiektu ręcznie w obrazie źródłowym.

Pierwsze selekcje światła obejmowały dach i szerokie powierzchnie. Końcowa
selekcja ogranicza obszar do materiału sceny i używa lokalnego kontrastu
(`detailRadius=3`, `detailContrast=8`) do zachowania rzeczywistych jasnych żyłek,
szczelin i faktury. Grupy v5 wynikają z rodzin koloru materiału: ciepłej,
cyan/zielonej i fioletowej. Nazwy techniczne warstw `west/middle/east-lights`
pozostały dla ciągłości podglądu; nie oznaczają już podziału na prostokątne pasy.
Zrezygnowano też z wielokątów v4 przecinających dolne liście. Wszystkie warianty
i korekty pozostają w historii zadań/recepty, a manifest wybiera końcowe mapy.

Techniczny i wizualny przegląd sekwencji kadrów z rzeczywistego 32-sekundowego
podglądu opisuje [raport końcowy](../../reports/KRE-03-2026-11-13-closure.md).
Granice selekcji mają miejscami ziarnisty charakter, zwłaszcza na mchu i kamieniu;
nie jest to obietnica mattingu subpikselowego ani uniwersalnej automatyzacji.
