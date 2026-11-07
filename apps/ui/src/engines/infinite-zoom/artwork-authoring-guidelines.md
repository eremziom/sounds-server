# Obowiązkowe wytyczne produkcji artworków Infinite Zoom

Wersja instrukcji: **1.0**. Obowiązuje przy tworzeniu i poprawianiu każdego
artworku, niezależnie od tematu, stylu, użytych narzędzi i liczby warstw.
To wspólne źródło zasad; brief konkretnej sceny doprecyzowuje ich zastosowanie.

## Instrukcja kreatora

**Przygotuj spójną grafikę warstwową przeznaczoną do animacji. Każdy animowany obszar musi być integralnym elementem kompozycji.**

1. **Zidentyfikuj niezależne obszary.** Określ, które fragmenty poruszają się razem, które niezależnie, a które pozostają nieruchome. Granice warstw powinny odpowiadać strukturze przedstawionej sceny lub obiektu.
2. **Rozdziel funkcje masek.** Osobno przygotuj maski widoczności, wpływu animacji oraz wzajemnego przesłaniania. Nie zastępuj ich jedną wspólną maską.
3. **Chroń sąsiednie obszary.** Animacja wybranego fragmentu nie może przesuwać, odkształcać ani przeciągać pikseli elementów, które do niego nie należą.
4. **Zdefiniuj połączenia i zakotwiczenia.** Wskaż miejsca nieruchome, połączenia między częściami oraz granice dopuszczalnego ruchu. Zmieniaj siłę deformacji stopniowo tam, gdzie wymaga tego konstrukcja obiektu.
5. **Przygotuj zawartość odsłanianą przez ruch.** Warstwy muszą zawierać wystarczający zapas obrazu. Ruch nie może ujawniać pustych miejsc, duplikatów ani rozciągniętych krawędzi.
6. **Dopasuj krawędzie masek do materiału i struktury.** Zachowaj potrzebną ostrość, miękkość, przezroczystość i drobne szczegóły. Unikaj jednakowego rozmywania wszystkich granic.
7. **Uwzględnij maksymalny łączny ruch.** Maski, zapas obrazu i bezpieczny zakres próbkowania muszą działać przy jednoczesnym zastosowaniu wszystkich przypisanych efektów.
8. **Zweryfikuj wynik w animacji i podczas zoomu.** Sprawdź pełne cykle, skrajne położenia i nakładające się efekty. Kontroluj ciągłość połączeń, kolejność przesłaniania, stabilność nieruchomych obszarów oraz brak szwów, obwódek i migotania.

**Nie uznawaj pakietu za gotowy wyłącznie na podstawie nieruchomego podglądu. Oznacz niepewne granice i miejsca wymagające ręcznej korekty.**

## Stosowanie przy każdej produkcji

- Przed planowaniem warstw, generowaniem lub edycją obrazów odczytaj ten plik.
  Włącz wymagania do briefu i przekazuj odpowiednie ograniczenia w promptach
  kolejnych etapów. Narzędzie generujące obraz nie odczytuje samo repozytorium.
- W `authoring-brief.md` pakietu podaj odnośnik do tej instrukcji i wersję 1.0,
  a następnie opisz jej zastosowanie: grupy ruchu, obszary stałe, role masek,
  połączenia, osie, zapas obrazu, maksymalne parametry i przesłanianie.
- Dobieraj efekty do zamierzonego zachowania i materiału. Nie wymuszaj wszystkich
  operatorów w każdej kompozycji. Wskaż obszar działania każdego efektu;
  lokalnego efektu nie zastępuj zmianą jasności lub deformacją całej sceny.
- Zweryfikuj plan z aktualnym kontraktem silnika. Potrzebne rozszerzenia silnika
  opisuj oddzielnie od produkcji assetów; nie przedstawiaj ich jako samej zmiany
  grafiki lub parametrów.
- Zachowaj źródła, rzeczywiste wymiary, pochodzenie, użyte prompty i wersję
  pakietu. Nie opisuj przeskalowanego ani mniejszego obrazu jako natywnego 4K.

## Dowody odbioru

Opis walidacji pakietu powinien zawierać:

- stan neutralny oraz podgląd masek na grafice;
- pełne cykle poszczególnych efektów i ich połączeń, przy maksymalnych
  dopuszczalnych parametrach oraz podczas ruchu kamery i zoomu;
- sprawdzenie nieruchomych obszarów, granic, odsłanianego tła i przesłaniania;
- widoczność zamierzonych efektów w rzeczywistym kadrze aplikacji — sama różnica
  kilku pikseli w teście nie potwierdza jakości wizualnej;
- listę niepewnych granic, wymaganych korekt, ograniczeń i niewykonanych prób.

Bez wykonanej weryfikacji ruchu pakiet pozostaje **niezweryfikowanym pilotażem**.
Przejście testów technicznych i akceptację artystyczną raportuj osobno.

## Granica automatyzacji

Ten dokument obowiązuje w repozytoryjnym workflow przygotowywania artworków.
Nie stanowi implementacji automatycznego creatora ani walidatora jakości masek.
Przyszły creator musi ładować tę wspólną instrukcję do swoich briefów/promptów
i przeprowadzać odbiór w ruchu; nie powinien utrzymywać niezależnej kopii zasad.
