# KRE-04 — korekta przesłaniania zapisanej generacji

Data: 2026-11-14. Obowiązują wspólne
[wytyczne artwork-authoring-guidelines v1.7](../../../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md).
Dotyczy wygenerowanego źródła KRE-04, nie startera KRE-03:
projekt `1c7a16c5-f510-4767-8052-16f36e1f66df`, wejściowa rewizja
`b4a3a1d6-7648-49b1-a17b-1cb4a25cbcd1`, źródło 1024×576,
canvas runtime 3840×2160. Nie jest to natywne 4K.

W tym przyroście wydzielamy nieruchomy filar po prawej, przez który obecnie
przelatuje widoczny dron. SAM otrzymuje punkty na filarze oraz ujemne
w sąsiednim tle. Wynik ma zachować krawędzie kamienia, mchu i prześwity;
nie może być szerokim zastępczym prostokątem. Maska occlusion pozostaje
w pełnokadrowych współrzędnych sceny. Jawna operacja registerMap wiąże ją
z wydzielonym obrazem drona w tych samych wymiarach i rejestracji.
Maska nie przemieszcza się razem z dronem.

Zachowujemy plan 24-sekundowego lotu po łuku, wyjście poza prawą krawędź,
nieruchome tło, dotychczasowe mapy wpływu/opóźnienia, okres światła i audio.
Istniejące liczne detale materiałowe, ich przepływ kolorów i impulsy muszą
dalej działać w normalnym widoku, blackout i płynnym odsłanianiu na tym samym
zegarze. Pokrycie zapewnia czarna warstwa bazowa. Pauza zachowuje cały stan.

W tej korekcie nie zmieniamy pikseli źródła, wycięcia drona ani selekcji
świateł. Znane drony w tle, poświata po obiekcie, ziarniste granice materiału
i brak osobnej warstwy lamp drona pozostają do kolejnych poprawek. Nie
deklarujemy spełnienia całych wytycznych ani gotowości produkcyjnej.

Weryfikacja: obejrzeć maskę i krawędzie na źródle, nagrać pełny lot i odcinek
za filarem, sprawdzić pojawienie po drugiej stronie, blackout/reveal, pauzę,
Reset i zoom. Zapisać kolejne kadry w pobliżu przesłaniania oraz niepewne
granice. Sam udany manifest, pokrycie i changed-pixel nie stanowią odbioru.
Wszystkie artefakty i nowa rewizja powstają przez formularze aplikacji;
nie poprawiamy plików wynikowych ręcznie. Rozszerzenie silnika nie jest
planowane ani potrzebne dla tej korekty.
