# Architektura formularzy uwierzytelniania

Ustalenia etapu 1 planu `docs/ui-auth-plan.md`, 26.10.2026. To kontrakt dla
kolejnych etapów. Login/register nadal mają placeholdery; wywołania ich endpointów,
zapis tokenów, formularze i automatyczny refresh wymagają implementacji.

## Przepływ i moduły

Formularz klienta → Server Action Next.js → serwerowy klient API → NestJS.
Walidacja klienta pomaga użytkownikowi; akcja niezależnie waliduje dozwolone pola,
a NestJS waliduje DTO i autoryzuje operację. Formularz wysyła POST Server Action
do UI, bez bezpośrednich wywołań NestJS i bez publicznego API_URL. Nie potrzeba
osobnych Route Handlers ani zmian CORS wyłącznie dla tych formularzy.

| Obszar | Stan | Odpowiedzialność |
| --- | --- | --- |
| `src/lib/auth.ts`, `route-access.ts`, `src/components/route-guard.tsx` | Istnieje | Bieżąca sesja z API, role i ochrona stron/sekcji |
| `src/api/auth.ts` | Istnieje: GET /auth/me; rozszerzenie w etapie 2 | server-only: wywołania endpointów auth, no-store, timeout, odrzucanie redirectów, walidacja odpowiedzi i techniczne błędy |
| `src/lib/auth-cookies.ts` | Etap 2 | server-only: zapis/usunięcie wyłącznie accessToken i refreshToken |
| `src/app/(auth)/actions.ts` | Etapy 3–6 | use server: registerAction, loginAction, logoutAction i opcjonalnie logoutAllAction |
| `src/components/auth/` | Etapy 3–5 | use client: pola, lokalna walidacja, fokus, pending i wyniki akcji |
| `src/components/auth/form-state.ts` | Przy formularzach | Wspólne typy i stan początkowy bez importów serwerowych |
| `src/i18n/api-error-messages.ts` | Istnieje | Mapowanie błędów w języku bieżącego żądania |

Wywołania NestJS organizujemy domenowo w `src/api/`: obecnie `auth.ts`,
w przyszłości np. `users.ts`. Wspólny `client.ts` dodamy, gdy będzie potrzebny
do współdzielenia obsługi HTTP. Moduły API mają import server-only; nazwa folderu
nie zastępuje tej ochrony. `src/api/` nie tworzy endpointów Next.js ani tras
`/api/*`. Obsługa cookies, odczytu sesji i decyzji o dostępie pozostaje w `src/lib/`,
a Server Actions w `src/app/(auth)/actions.ts`.

Plik use server eksportuje wyłącznie asynchroniczne akcje; typy i stan początkowy
mają osobny moduł. Do klienta trafia referencja Server Action, a nie implementacja
klienta API, cookie helpers ani konfiguracja środowiska. Pola FormData wybieramy
jawnie: cały Object.fromEntries(formData) może zawierać także techniczne `$ACTION_*`.

## Kontrakt wyniku akcji

Formularze używają `useActionState`. Planowany stan początkowy i wynik błędu:

```ts
type AuthActionState = {
  status: "idle" | "error";
  locale: Locale;
  message?: string;
  fieldErrors: Partial<Record<
    "username" | "email" | "password" | "confirmPassword" | "login",
    string[]
  >>;
  values?: Partial<Record<"username" | "email" | "login", string>>;
};
```

Locale pochodzi z `src/i18n/config.ts`. Stan początkowy ma status idle, serwerowy
locale i puste fieldErrors. Akcja przyjmuje previousState i FormData; poprzedni
stan ani ukryte pola nie są źródłem tożsamości, uprawnień lub zaufanego języka.
Wyniki są serializowalne, bez Error, Response, pełnych odpowiedzi API, tokenów
i wartości haseł. fieldErrors.password zawiera wyłącznie komunikaty walidacji.
Values ograniczamy do dozwolonych pól bez haseł.

Spodziewane błędy wracają jako stan po użyciu getApiErrorMessages z właściwym
operation. Lokalna walidacja używa kluczy validation, w tym passwordMismatch.
Locale wyniku pozwala klientowi wyczyścić nieaktualny komunikat po zmianie języka,
bez ponawiania operacji auth. Błędy renderowania obsługuje istniejące error.tsx.

Po sukcesie akcja zapisuje tokeny przez await cookies() i wywołuje redirect poza
catch obsługującym API. Sukces logowania/rejestracji nie zwraca tokenów jako wyniku
formularza. Przeglądarka przechowuje je wyłącznie w cookies HttpOnly, SameSite=Lax,
Path=/, Secure w produkcji, z terminami z API. Cookie locale pozostaje osobną
preferencją. Server Components nie zapisują tokenów podczas renderowania.
Domyślna ochrona Origin/Host dla Server Actions pozostaje włączona.

## Kontrola dostępu i przekierowania

- Login/register pozostają publiczne również dla zalogowanych użytkowników.
- `(app)` ma RouteGuard(APP_ROLES), a każda chroniona strona dodatkowo wywołuje
  requireRoles(APP_ROLES). `(admin)/admin` analogicznie używa ADMIN_ROLES.
- Role są addytywne: USER/ARTIST otwierają aplikację, ADMIN panel. Konto z trzema
  rolami otwiera obie sekcje. Backend sprawdza aktualne uprawnienia z bazy.
- Po rejestracji celem jest `/`. Po logowaniu pierwszeństwo ma aplikacja:
  USER/ARTIST → `/`, samo ADMIN → `/admin`, inne → `/access-denied`.
- Brak sesji przy wejściu na chronioną stronę → `/login`, niewłaściwa rola →
  `/access-denied`. Locale nie zmienia celu. Ewentualny returnTo jest walidowaną
  lokalną ścieżką; dostęp do celu jest ponownie sprawdzany.
- Ochrona layoutu nie zastępuje kontroli w Server Actions. Chronione akcje
  sprawdzają sesję/uprawnienia przed operacją. Logout działa też przy wygasłym
  access tokenie, a lokalne usunięcie cookies nie wymaga roli aplikacyjnej.
  Logout-all wymaga aktywnej sesji zgodnie z API, bez dodatkowego wymogu ADMIN.

## Granica serwer/klient i i18n

LoginPage i RegisterPage pozostają serwerowe, zachowując istniejące
generateMetadata oparte na metadata.login/register i nieprefiksowane URL.
Interaktywne pola, walidacja i useActionState należą do komponentów klienta.

Dla formularzy wybieramy istniejący serwerowy ClientMessages z potrzebnymi
przestrzeniami auth, validation i errors. Common dodajemy tylko, jeżeli klient
rzeczywiście używa tych wiadomości; proste linki mogą pozostać serwerowe.
Wewnętrzny provider nie scala automatycznie messages z nadrzędnym providerem.
Root nadal przekazuje swój minimalny zestaw wiadomości. Drobne elementy,
np. pojedynczy przycisk wylogowania, otrzymują etykiety jako props.

Provider, strona, metadane i akcje używają wspólnej konfiguracji next-intl:
cookie locale → Accept-Language → en, strefa UTC i wspólne formats. Język
formularza pochodzi z providera, a nie z navigator.language czy localStorage.
Nie przechowywać preferencji we współdzielonym stanie/cache serwera.

Nowe teksty powstają w en/pl/es jednocześnie. Name/id pól, autocomplete, API payload,
role i uprawnienia pozostają identyfikatorami technicznymi. Publiczna strona
wznowienia sesji otrzyma te same zasady i tłumaczone metadane w etapie 7;
jej utworzenie nie należy do przygotowania etapu 1.

## Dokumentacja Next.js i weryfikacja

Przeczytano lokalną dokumentację Next.js 16.4.2 w
`node_modules/next/dist/docs/01-app/`:

- `02-guides/server-actions.md`, `02-guides/forms.md`: akcje POST, useActionState,
  walidacja niezaufanego wejścia i własna autoryzacja akcji.
- `03-api-reference/04-functions/cookies.md`: odczyt async, zapis w Server
  Functions/Route Handlers przed streamingiem, odświeżenie UI po zapisie.
- `03-api-reference/04-functions/redirect.md`: przerwanie przepływu przez redirect
  poza catch; 303 lub nawigacja klienta przy wysłaniu formularza Server Action.
- `03-api-reference/04-functions/generate-metadata.md`: metadane w Server Components,
  bez jednoczesnego metadata i generateMetadata w jednym segmencie.

Istniejące testy UI, HTTP/RSC i przeglądarkowe weryfikują role, publiczne trasy,
przekierowania, język serwera/klienta i metadane. Testy przyszłych formularzy
powstaną z ich implementacją. Pełna procedura to pnpm verify:i18n;
reguły routingu opisuje [ROUTING.md](ROUTING.md).

Weryfikacja etapu 1 (26.10.2026): pnpm devtest:ui — 20 testów, słowniki i TypeScript;
pnpm --filter ui test:routing — macierz HTML/RSC i ról;
pnpm --filter ui test:browser — widoki/metadane en/pl/es, przełącznik, SSR/klient,
historia, sesja i brak błędów hydratacji. Wszystkie kontrole zakończone powodzeniem.
