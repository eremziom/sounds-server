# KRE-04 — odbiór możliwości kreatora

**Etap następnie zamknięto funkcjonalnie** po ponowieniu weryfikacji:
[raport zamknięcia](KRE-04-2026-11-14-closure.md).
Poniższy przegląd zachowuje pierwotny zakres i dowody.

Data: **2026-11-14**. Aktualne doprecyzowanie użytkownika: celem jest
sprawdzenie możliwości artworku w aplikacji, a nie dopracowanie testowego
obrazu do perfekcji. Ten zapis aktualizuje kryterium odbioru i interpretację
wcześniejszych raportów; nie zmienia wyników wykonanych prób.

**Zakres interfejsu KRE-04 jest zrealizowany i zweryfikowany funkcjonalnie.**
Wady artystyczne pilota nie są brakującymi funkcjami kreatora ani warunkiem
zamknięcia jego zakresu. Nie zlecamy dalszego retuszu sceny jako następnego
kroku tego etapu. Artwork pozostaje przykładem testowym, bez odbioru produkcyjnego.

## Kryteria i istniejące dowody

| Możliwość aplikacji | Wynik i dowód |
| --- | --- |
| Chroniony ekran, projekt, prompt/plan i referencje | Potwierdzone w [pierwszym przyroście](KRE-04-2026-11-13.md) i testach UI |
| Rzeczywista generacja, wybór obrazu i narzędzia warstw | Klein → SAM → LaMa → paczka → podgląd przez formularze, [wynik wznowienia](KRE-04-2026-11-13-recovery.md) |
| Postęp, błędy, anulowanie i ponowienia | Testy sesji/UI, rzeczywiste odroczenie pamięci i odzyskanie zadania, opisane w raportach 2026-11-13 |
| Warstwy, maski, historia, porównanie i przywracanie | Testy kreatora; rzeczywisty zapis kolejnych rewizji bez utraty rodzica |
| Animowany podgląd przez istniejący host | Ruch, zoom, blackout/reveal, pauza, powrót, jedno audio/canvas/WebGL, [QA 50,64 s](KRE-04-2026-11-14.md) |
| Operacja korekty i ponowny podgląd | SAM/rejestracja → nowa rewizja → podgląd przesłaniania; [QA 52,03 s](KRE-04-2026-11-14-occlusion.md) |
| Reload i odzyskanie pracy | Ten sam projekt/rewizja, odzyskanie wyników bez kolejnych zadań; dowody w powyższych raportach |

Demonstracja potwierdza obsługę sceny przez aplikację: zapis i odczyt,
składanie warstw, maski, ruch, przesłanianie, efekty światła, blackout/reveal,
zoom oraz współpracę ze wspólnym odtwarzaczem. Nie dowodzi automatycznego
uzyskiwania idealnych masek, tła i lamp przy każdej generacji. Rozmowa
narzędziowa, edycja masek i publikacja mają własne późniejsze etapy.

## Jawne ograniczenia

Małe drony w tle, resztka poświaty, niedokładności masek i brak osobnej warstwy
lamp są opisem jakości konkretnego pilota. Dalsze poprawki wykonujemy tylko,
jeśli są potrzebne do sprawdzenia określonej funkcji lub na osobne polecenie.

**Osobna otwarta kwestia techniczna:** ścisły test WebGL wykrył zmianę
2–3 kanałów RGB o 1/255 przy ponownym rysowaniu przed Resetem, zarówno
w RGBA8, jak i RGBA16F. Stan symulacji i kamera pozostały identyczne.
Przyczyna nie została ustalona. Nie uznajemy tych testów za udane, nie
usuwamy ich ani nie zmieniamy tolerancji. Diagnostyka i nieudane wyniki
pozostają w [raporcie korekty](KRE-04-2026-11-14-occlusion.md).
Nie ma dowodu, że jest to błąd resetowania podróży; wymaga osobnej analizy
renderowania, niezależnie od retuszu artworku.

Ten przegląd wykorzystuje istniejące dowody. Zmieniono wyłącznie dokumentację
i statusy; nie uruchamiano modeli, nie zmieniano kodu, artworków ani testów.
KRE-05–08 nie rozpoczęto.
