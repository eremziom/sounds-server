# Plan zadań po zakończeniu RBAC

## Cel

Rozszerzyć autoryzację o kontrolę właściciela zasobu oraz obsługę operacji
na własnych utworach i profilu użytkownika.

Zadania realizować po zakończeniu etapu opisanego w [rbac-plan.md](./rbac-plan.md),
w tym zabezpieczenia endpointów i dodania sesji z tokenami odświeżania.

## Lista zadań

### 1. Rozszerzenie modelu utworu o właściciela

- [ ] Dodać do modelu `Track` pole `ownerId` i relację do `User`, a do modelu
  `User` relację do należących do niego utworów.
- [ ] Ustalić sposób przypisania właścicieli istniejącym utworom. Rekordy bez
  ustalonego właściciela nie mogą być dostępne przez uprawnienia `*-own`.
- [ ] Ustalić zachowanie utworów po usunięciu właściciela i odpowiednio
  skonfigurować relację, aby uniknąć przypadkowej utraty utworów.
- [ ] Przygotować migrację oraz uzupełnienie istniejących danych; dopiero po
  uzupełnieniu właścicieli wprowadzić wymagalność `ownerId`.
- [ ] Przy tworzeniu utworu przypisywać właściciela na podstawie użytkownika
  uwierzytelnionego przez JWT. Zwykła edycja i tworzenie utworu nie mogą pozwalać
  klientowi na samodzielne wskazanie lub zmianę `ownerId`.

### 2. Kontrola właściciela przy edycji i usuwaniu utworów

- [ ] Dodać regułę edycji: `tracks:update-any` pozwala edytować dowolny utwór,
  natomiast `tracks:update-own` wymaga zgodności `Track.ownerId` z ID
  uwierzytelnionego użytkownika.
- [ ] Dodać analogiczną regułę usuwania dla `tracks:delete-any`
  i `tracks:delete-own`.
- [ ] Połączyć kontrolę uprawnień z kontrolą konkretnego zasobu. Obecny
  `PermissionsGuard` wymaga wszystkich zadeklarowanych uprawnień, więc samo
  wpisanie `*-own` i `*-any` w jednym dekoratorze nie realizuje alternatywy.
- [ ] Dopilnować, aby zmiana lub usunięcie następowały wyłącznie po poprawnej
  autoryzacji, z uwzględnieniem możliwych zmian właściciela między sprawdzeniem
  dostępu a zapisem.
- [ ] Zachować wymóg uprawnienia również dla właściciela: sama własność utworu
  nie daje prawa do jego edycji ani usunięcia.

### 3. Obsługa własnego profilu użytkownika

- [ ] Dodać możliwość edycji własnego profilu, np. `PATCH /auth/me`, chronioną
  uprawnieniem `users:update-own`.
- [ ] Pobierać ID edytowanego użytkownika z uwierzytelnionego żądania.
- [ ] Ograniczyć edytowalne pola do danych profilu. Zmiana roli, statusu
  aktywności i innych pól administracyjnych musi wymagać osobnych uprawnień.
- [ ] Zachować rozdzielenie dostępu do własnego profilu (`users:read-own`,
  `users:update-own`) i zarządzania innymi użytkownikami (`users:read`,
  `users:update`).

### 4. Testy i dokumentacja

- [ ] Sprawdzić przez HTTP edycję i usuwanie własnego oraz cudzego utworu
  z uprawnieniami `*-own`, `*-any` i bez wymaganych uprawnień.
- [ ] Sprawdzić użytkownika mającego kilka ról i przypadek odebrania uprawnień
  po wystawieniu tokenu.
- [ ] Sprawdzić próby podszycia się pod właściciela przez przesłanie `ownerId`
  oraz próby zmiany pól administracyjnych przez edycję własnego profilu.
- [ ] Sprawdzić, że odmowa dostępu nie zmienia ani nie usuwa danych.
- [ ] Sprawdzić migrację istniejących utworów i ustalone zachowanie po usunięciu
  właściciela.
- [ ] Uzupełnić dokumentację API o zasady własności, wymagane uprawnienia
  i przykłady dozwolonych oraz odrzuconych operacji.
