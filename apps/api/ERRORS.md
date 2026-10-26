# API error contract

API errors are language-independent. The UI translates stable `code` identifiers;
it must never branch on or display the free-form `message` received from the API.
Existing HTTP statuses and Nest fields (`statusCode`, `message`, and `error` when
present) are preserved. The `code` and validation `fieldErrors` fields are additive.

For example, a duplicate email still returns HTTP 409:

```json
{
  "statusCode": 409,
  "message": "Email already in use",
  "error": "Conflict",
  "code": "EMAIL_ALREADY_IN_USE"
}
```

| Code | Status | Meaning |
| --- | --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 401 | Same response for missing user, wrong password and inactive account |
| `EMAIL_ALREADY_IN_USE` | 409 | Registration email conflict |
| `AUTH_REQUIRED` | 401 | Authentication guard rejected the request |
| `AUTH_SESSION_INVALID` | 401 | Invalid/revoked/expired session or refresh token detected by the session logic |
| `ACCESS_DENIED` | 403 | Insufficient API permissions |
| `VALIDATION_FAILED` | 400 | DTO validation failed |
| `INVALID_REQUEST` | 400 | Other bad-request exceptions, including route parameter parsing |
| `NOT_FOUND` | 404 | Resource/route not found |
| `CONFLICT` | 409 | Other conflict exceptions |
| `INTERNAL_ERROR` | 5xx | Explicit HTTP exceptions not covered above |
| `HTTP_ERROR` | Other statuses | Other explicit HTTP exceptions |

The global HTTP exception filter adds generic codes where no business code was
provided. Unexpected exceptions still use Nest's safe default error handling;
clients must tolerate errors without a code and future unknown codes. No response
depends on `Accept-Language`, cookies or translated error text.

The global validation pipe retains whitelist/forbidNonWhitelisted and the existing
`message` array, adding structured field errors:

```json
{
  "statusCode": 400,
  "message": ["username must be longer than or equal to 3 characters"],
  "error": "Bad Request",
  "code": "VALIDATION_FAILED",
  "fieldErrors": [
    { "field": "username", "code": "LENGTH", "params": { "min": 3, "max": 30 } }
  ]
}
```

Rule codes are `REQUIRED`, `EMAIL`, `INVALID_TYPE`, `URL`, `UNKNOWN_FIELD`,
`PASSWORD_COMPLEXITY`, `LENGTH` and `INVALID_VALUE`. Nested properties use dotted
paths. Only explicitly annotated length constraints return numeric `min`/`max`;
unrecognized rules safely use `INVALID_VALUE`. Auth DTOs provide bounds through
class-validator decorator `context`. New supported length constraints should do
the same instead of parsing English messages or submitted values.

`fieldErrors` never includes validation targets, input values, arbitrary constraint
contexts, passwords or tokens. The UI accepts only known form fields and rule
parameters. Unknown rules receive a generic field message; unknown error codes or
invalid response bodies receive a generic error. Session validation remains
fail-closed and server actions must perform their own authorization checks.

Tests: `pnpm --filter api exec jest --runInBand`. HTTP contract tests create an
isolated Nest app using the production pipe/filter without a database.
