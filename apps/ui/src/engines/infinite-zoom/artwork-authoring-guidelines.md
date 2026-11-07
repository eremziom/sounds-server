# Obowiązkowe wytyczne produkcji artworków Infinite Zoom

Wersja instrukcji: **1.2** (2026-11-07). Obowiązuje przy tworzeniu i poprawianiu każdego
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
9. **Zaprojektuj dużą liczbę miejsc do impulsowego podświetlania.** Każda grafika, niezależnie od motywu i stylu, musi zawierać liczne drobne punkty, skupiska detali lub pasma materiału przygotowane do lokalnych impulsów światła. Muszą być integralnymi elementami sceny i zachowywać jej fakturę, formę oraz przesłanianie. Obowiązują szczegółowe wymagania poniżej.
10. **Przygotuj opcję całkowitego zaciemnienia z zachowaniem niezależnego światła.** Każda grafika musi pozwalać wyzerować widoczność otoczenia, pozostawiając wybrane, oddzielnie podświetlane obszary z działającymi od początku impulsami i zmianami kolorów. Zapewnij płynny powrót do normalnego widoku, bez skoków jasności. Obowiązują szczegółowe wymagania poniżej.

**Nie uznawaj pakietu za gotowy wyłącznie na podstawie nieruchomego podglądu. Oznacz niepewne granice i miejsca wymagające ręcznej korekty.**

## Obowiązkowe punkty i pasma impulsowego światła

**Każda nowa lub poprawiana grafika musi mieć dużą liczbę autorsko przygotowanych
detali, które będą lokalnie podświetlane impulsami.** Wzorem jakości jest
zaakceptowane przez użytkownika podświetlenie rzeczywistego materiału chitynowych
żeber w scenie planety insektoidów. Zasada dotyczy wszystkich tematów; chityna,
architektura ani stylistyka science fiction nie są wymagane.

- **Planuj światło już w kompozycji.** Dobierz detale do tematu i materiałów:
  np. żebra, żyłki liści, krawędzie minerałów, pory, drobne otwory, krople,
  refleksy na wodzie, włókna, pył lub struktury abstrakcyjne. Włącz dużą liczbę
  takich miejsc do briefu i każdego odpowiedniego promptu generowania/edycji.
- **Zapewnij bogate rozmieszczenie.** Przygotuj wiele miejsc i kilka grup
  podświetlenia w różnych częściach kompozycji oraz na jej dostępnych planach
  głębi. Kilka przypadkowych lampek lub jeden migający punkt nie spełnia zasady.
  Gęstość ma dawać czytelny, interesujący efekt również w pełnym kadrze aplikacji.
  Dokładną liczbę i rozmieszczenie uzasadnia brief konkretnej sceny; nie ma jednej
  arbitralnej liczby punktów dla wszystkich grafik.
- **Zachowaj związek z przedstawionym materiałem.** Podświetlenie musi trafiać
  w rzeczywiste detale obrazu albo w elementy świadomie zaprojektowane w nim do
  emisji. Zachowaj ich grubość, nieregularność, drobne refleksy, ciemne szczeliny
  i przesłanianie. Ogólne kreski, przybliżone obwódki i punkty doklejone nad
  obrazem bez związku z jego strukturą są niedopuszczalne.
- **Przygotuj niezależne sterowanie.** Oddziel maski widoczności i przesłaniania
  od obszarów wpływu światła oraz danych czasowych/faz. Umożliwiaj sekwencyjne
  podświetlanie grup lub przechodzenie impulsu wzdłuż uzasadnionych pasm;
  przewiduj okresy, fazy, wygaszanie i granice powtórzeń. Jednoczesna zmiana
  jasności całej grafiki nie zastępuje lokalnych impulsów.
- **Chroń kompozycję i nastrój.** Duża liczba dostępnych miejsc nie oznacza, że
  wszystkie mają stale lub jednocześnie świecić. Dobierz aktywne grupy, kontrast,
  kolor i tempo do sceny, również mrocznej lub surowej. Zachowaj nieruchome
  obszary, chronione wnętrza i zapas budżetu renderowania; stosuj aktualny kontrakt
  silnika. Nie narzucaj każdej grafice jednego koloru, operatora ani okresu.
- **Oceń materiał przed ruchem.** Najpierw obejrzyj maski na obrazie i nieruchome
  podświetlenie w zbliżeniu. Następnie sprawdź pełne cykle, współdziałanie grup,
  przejście impulsów przez narożniki i powtórzenia, pełny kadr oraz zoom.
  Udokumentuj, że detale są liczne, widoczne i zintegrowane z materiałem.
  Poprawne fazy, zmienione piksele lub przejście testów nie potwierdzają tego
  wymagania bez oceny wizualnej. Brak odpowiednio bogatych obszarów światła jest
  brakującym elementem artworku wymagającym poprawy.

## Obowiązkowe zaciemnienie z niezależnym światłem

**Każda nowa lub poprawiana grafika musi posiadać opcjonalny tryb całkowitego
zaciemnienia otoczenia z zachowaniem wydzielonych obszarów podświetlenia i zmian
kolorów.** Wzorem jest odsłanianie planety insektoidów z widocznymi obramowaniami
i lawą. Dobierz odpowiedniki do tematu; lawa ani konkretna stylistyka nie są wymagane.

- **Rozdziel otoczenie i chronione światła.** Zaplanuj niezależne sterowanie
  jasnością otoczenia oraz licznymi detalami światła wymaganymi powyżej. W briefie
  i odpowiednich promptach wskaż obszary pozostające widoczne w ciemności.
  Przygotuj ich warstwy lub maski w tej samej rejestracji co grafika; zachowaj
  fakturę, granice materiałów i przesłanianie. Zaciemnienie nie może przykrywać
  chronionych świateł ani odsłaniać przypadkowych fragmentów otoczenia.
- **Zapewnij rzeczywiście czarne otoczenie.** Sterowanie musi sięgać całkowitego
  wygaszenia otoczenia, a nie tylko stałego minimalnego przyciemnienia. Pozostają
  widoczne wyłącznie świadomie wydzielone obszary światła/emisji i uzasadnione
  lokalne poświaty lub odbicia wskazane w briefie. Zachowaj nieprzezroczyste
  pokrycie kadru: zaciemnienie nie może tworzyć dziur ani ujawniać tła aplikacji.
- **Animuj chronione obszary od początku.** Impulsy, zmiany kolorów i inne
  przypisane animacje muszą działać również przy całkowicie czarnym otoczeniu,
  bez progu jasności uruchamiającego efekt. Nie zastępuj animowanego obszaru
  nieruchomą kopią oryginalnej tekstury. Jeśli używasz kopii warstwy, zachowaj
  właściwe efekty, parametry, fazy i reakcję na sterowanie.
- **Umożliwiaj płynne odsłanianie i powrót.** Tryb ma być włączany i wyłączany;
  rozjaśnianie powinno prowadzić do normalnego widoku bez pozostałej przyciemniającej
  nakładki, podwójnej emisji lub zmiany palety wynikającej z samego przełączenia.
  Czas i krzywą ustala brief/scena; minuta z eksperymentu nie jest obowiązkowa
  dla każdej grafiki. Przełączanie nie resetuje kamery ani pozostałych animacji.
- **Zachowaj wspólny czas i płynne cienie.** Odsłanianie korzysta z istniejącego
  zegara symulacji; pauza i zawieszenie zatrzymują jego postęp i fazy świateł.
  Zapewnij precyzję składania i sposób wyświetlania pozwalające uniknąć widocznych
  skoków jasności oraz pasm na ciemnych teksturach. Sama płynna krzywa parametru
  nie dowodzi płynnego obrazu. Wymagania renderera, koszt pamięci i ograniczenia
  sprzętowego trybu zastępczego opisuj oddzielnie od przygotowania grafiki.
- **Zweryfikuj cały zakres w ruchu.** Sprawdź czarne otoczenie, działanie kolorów
  i impulsów od pierwszych klatek, wolne rozjaśnianie zwłaszcza w cieniach,
  normalny widok końcowy oraz przełączanie i pauzę. Powtórz ocenę przy zoomie
  i łącznym działaniu efektów. Zapisz nagranie/próbki, granice masek i ograniczenia;
  nieruchomy kadr lub sam test zmienionych pikseli nie wystarcza do odbioru.

## Stosowanie przy każdej produkcji

- Przed planowaniem warstw, generowaniem lub edycją obrazów odczytaj ten plik.
  Włącz wymagania do briefu i przekazuj odpowiednie ograniczenia w promptach
  kolejnych etapów. Narzędzie generujące obraz nie odczytuje samo repozytorium.
- W `authoring-brief.md` pakietu podaj odnośnik do tej instrukcji i używaną wersję
  (obecnie 1.2),
  a następnie opisz jej zastosowanie: grupy ruchu, obszary stałe, role masek,
  połączenia, osie, zapas obrazu, maksymalne parametry i przesłanianie.
- W briefie opisz także dużą liczbę miejsc impulsowego światła: ich rodzaj,
  szacowaną liczbę/gęstość, rozmieszczenie i grupy, związek z materiałem, maski,
  fazy/okresy oraz plan oceny w pełnym kadrze i przy zoomie. Nowe i poprawiane
  pakiety muszą spełniać wersję 1.2; historyczne wersje briefów i promptów
  zachowują rzeczywisty numer instrukcji użytej przy ich tworzeniu.
- W briefie opisz tryb zaciemnienia: otoczenie, chronione obszary światła i
  kolorów, role warstw/masek, zachowanie animacji przy zerowej jasności otoczenia,
  czas/krzywą odsłaniania, przełączanie i plan oceny płynności cieni. Przekaż
  odpowiednie wymagania do promptów generowania i edycji materiałów.
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
- liczne, zintegrowane z materiałem punkty/pasma impulsowego światła: rozmieszczenie
  grup, maski na obrazie, podgląd nieruchomy, pełne cykle i porównania w pełnym
  kadrze oraz w zbliżeniu, wraz z oceną zachowania faktury i przesłaniania;
- tryb całkowitego zaciemnienia: czarne otoczenie bez utraty pokrycia, animowane
  kolory/impulsy chronionych obszarów od początku, pełne wolne odsłanianie bez
  widocznych skoków w cieniach, zgodność widoku końcowego, przełączanie i pauzę;
  osobno wynik i ograniczenia dla użytego renderera oraz trybu zastępczego.
- listę niepewnych granic, wymaganych korekt, ograniczeń i niewykonanych prób.

Bez wykonanej weryfikacji ruchu pakiet pozostaje **niezweryfikowanym pilotażem**.
Przejście testów technicznych i akceptację artystyczną raportuj osobno.

## Granica automatyzacji

Ten dokument obowiązuje w repozytoryjnym workflow przygotowywania artworków.
Nie stanowi implementacji automatycznego creatora ani walidatora jakości masek.
Przyszły creator musi ładować tę wspólną instrukcję do swoich briefów/promptów
i przeprowadzać odbiór w ruchu; nie powinien utrzymywać niezależnej kopii zasad.
