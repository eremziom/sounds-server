# Architektura formularzy uwierzytelniania

Ustalenia etapu 1 planu `docs/ui-auth-plan.md`, 26.10.2026. To kontrakt dla
kolejnych etapów. W etapie 2 dodano wywołania endpointów auth, walidację sesji,
helpery cookies i bezpiecznego stanu akcji. Etapy 3–4 dodają formularze
RegisterForm/LoginForm i registerAction/loginAction. Wylogowanie pozostaje
w etapie 6, automatyczny refresh w etapie 7.

## Przepływ i moduły

Formularz klienta → Server Action Next.js → serwerowy klient API → NestJS.
Walidacja klienta pomaga użytkownikowi; akcja niezależnie waliduje dozwolone pola,
a NestJS waliduje DTO i autoryzuje operację. Formularz wysyła POST Server Action
do UI, bez bezpośrednich wywołań NestJS i bez publicznego API_URL. Nie potrzeba
osobnych Route Handlers ani zmian CORS wyłącznie dla tych formularzy.

| Obszar | Stan | Odpowiedzialność |
| --- | --- | --- |
| `src/lib/auth.ts`, `route-access.ts`, `src/components/route-guard.tsx` | Istnieje | Bieżąca sesja z API, role i ochrona stron/sekcji |
| `src/api/auth.ts` | Etap 2 wdrożony | server-only: login/register/refresh/logout/logoutAll/getSessionUser, walidacja tokenów, dat i bezpiecznego DTO użytkownika |
| `src/api/client.ts` | Etap 2 wdrożony | server-only: wspólny transport, no-store, timeout, odrzucanie redirectów i oczyszczone błędy |
| `src/lib/auth-cookies.ts` | Etap 2 wdrożony | server-only: setAuthCookies/getAuthCookies/clearAuthCookies, wyłącznie para tokenów |
| `src/app/(auth)/actions.ts` | Etapy 3–4 wdrożone | use server: registerAction/loginAction; logout w etapie 6 |
| `src/components/auth/` | Etapy 3–4 wdrożone | RegisterForm/LoginForm: pola, walidacja, fokus, pending, wyniki akcji i zmiana języka |
| `src/components/auth/form-state.ts` | Etap 2 wdrożony | AuthActionState i initialAuthState(locale), bez importów serwerowych |
| `src/lib/auth-action-state.ts` | Etap 2 wdrożony | getAuthActionError: tłumaczone komunikaty i locale, bez wyniku API/tokenów |
| `src/i18n/api-error-messages.ts` | Istnieje | Mapowanie błędów w języku bieżącego żądania |

Wywołania NestJS organizujemy domenowo w `src/api/`: obecnie `auth.ts`,
w przyszłości np. `users.ts`. Wspólny `client.ts` obsługuje HTTP dla endpointów
auth. Moduły API mają import server-only; nazwa folderu
nie zastępuje tej ochrony. `src/api/` nie tworzy endpointów Next.js ani tras
`/api/*`. Obsługa cookies, odczytu sesji i decyzji o dostępie pozostaje w `src/lib/`,
a Server Actions w `src/app/(auth)/actions.ts`.

LoginForm używa login-validation.ts (login 3–100 znaków) i wspólnego
password-validation.ts (8–50 znaków i regex obu DTO). Nie zmieniamy ani nie
przycinamy danych. loginAction otrzymuje tylko FormData; nieużywany poprzedni
stan useActionState jest ignorowany w komponencie. Do API trafiają wyłącznie
login/password, a do wyniku formularza tylko login i bezpieczne komunikaty.
Po zapisaniu cookies cel wynika z ról odpowiedzi API: najpierw APP_ROLES,
następnie ADMIN_ROLES, w pozostałych przypadkach /access-denied. Nie dodano
parametru powrotu; returnTo z URL lub formularza nie wpływa na cel.

Plik use server eksportuje wyłącznie asynchroniczne akcje; typy i stan początkowy
mają osobny moduł. Do klienta trafia referencja Server Action, a nie implementacja
klienta API, cookie helpers ani konfiguracja środowiska. Pola FormData wybieramy
jawnie: cały Object.fromEntries(formData) może zawierać także techniczne `$ACTION_*`.

## Kontrakt wyniku akcji

Formularze będą używać `useActionState`. Zaimplementowany typ stanu i wyniku błędu:

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

## Biblioteki etapu 2

`login(input)`, `register(input)`, `refresh(refreshToken)` i `getSessionUser(token)`
zwracają ApiResult: `{ok: true, data}` albo `{ok: false, error, status?}`.
Logout/logoutAll przy sukcesie 204 zwracają `{ok: true, data: true}` bez czytania JSON.
ApiOptions umożliwia serwerowe nadpisanie apiUrl/request/timeoutMs; domyślnie
używany jest API_URL i timeout 5000 ms, obejmujący także odczyt body.
Nie przekazywać ApiOptions z danych formularza.

Typ AuthSession zawiera parę tokenów, znaczniki UTC ISO i AuthUser
(id, username, email, isActive, roles z samymi key). Walidacja sprawdza format
JWT (trzy segmenty base64url, bez weryfikacji podpisu lub odczytywania ról z JWT),
64-znakowy refresh token hex, przyszłe prawidłowe daty UTC i aktywnego użytkownika.
Nadmiarowe pola odpowiedzi są odrzucane. Autoryzacja nadal należy do API.
Expiry access tokenu może przekraczać termin końca sesji — backend sprawdza sesję
niezależnie, więc nie nakładamy błędnego warunku accessExpiry <= refreshExpiry.

Status HTTP jest zachowany osobno także dla niepoprawnego JSON. ApiFailure odróżnia
http, network, timeout i invalid-response. Z błędów API zachowujemy tylko kody,
znane nazwy pól i poprawne liczbowe min/max; tekst message i dowolne wartości
wejściowe nigdy nie są kopiowane. Dla starszego API pusty message jest wyłącznie
znacznikiem formatu umożliwiającym istniejące mapowanie operacji/statusu.

Istniejący fetchSessionUser zachowuje politykę guardów (401/403 lub nieaktywność
→ null). Inne błędy rzucają ApiRequestError z bezpiecznym opisem. Nowe akcje
używają getSessionUser i jego statusu, aby odróżniać 401 od 403.

SetAuthCookies ponownie waliduje całą sesję przed pierwszym zapisem i ustawia
niezależne expires dla każdego tokenu. ClearAuthCookies wygasza tylko te dwa
cookies, z tym samym Path/HttpOnly/SameSite/Secure i bez Domain; locale pozostaje
nietknięte. Funkcje są zwykłymi helperami server-only, nie publicznymi Server Actions.
Mutacje można wywołać wyłącznie z Server Action lub Route Handler; Next.js odrzuca
próbę zapisu w renderowaniu Server Component.

W akcji formularza błąd obsługuje `getAuthActionError(result.error, operation)`.
Zwraca status error, locale bieżącego żądania oraz przetłumaczone message/fieldErrors.
Sukces pozostaje na serwerze: `setAuthCookies(result.data)`, następnie redirect.
Nie zwracać result.data do komponentu klienta.

Weryfikacja: testy jednostkowe obejmują błędne sesje, transport, timeout odczytu,
odrzucanie redirectów, 204, oczyszczanie błędów i cookies w development/production.
`pnpm test:auth-api` buduje API i sprawdza klienta UI na rzeczywistym NestJS
i PostgreSQL w oddzielnej losowej bazie. Wymaga DATABASE_URL oraz uprawnienia
CREATE DATABASE; stosuje migracje/seed, usuwa bazę w finally i nie zmienia bazy
aplikacji. Nie jest częścią bezbazowego pnpm verify:i18n.

Weryfikacja etapu 2 (26.10.2026): pnpm verify:i18n — 30 testów UI, słowniki,
TypeScript, lint, build, routing HTML/RSC, Chrome dla en/pl/es i 137 testów API.
Osobno pnpm test:auth-api — pełny przepływ nowego klienta przez rzeczywiste
NestJS/PostgreSQL, także walidacja i błędy HTTP. Wszystkie kontrole przeszły.

Weryfikacja etapu 1 (26.10.2026): pnpm devtest:ui — 20 testów, słowniki i TypeScript;
pnpm --filter ui test:routing — macierz HTML/RSC i ról;
pnpm --filter ui test:browser — widoki/metadane en/pl/es, przełącznik, SSR/klient,
historia, sesja i brak błędów hydratacji. Wszystkie kontrole zakończone powodzeniem.
