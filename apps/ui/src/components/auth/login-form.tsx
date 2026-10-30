"use client";

import { useActionState, useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loginAction } from "../../app/(auth)/actions";
import { AuthSubmitButton } from "./auth-submit-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { initialAuthState, type AuthActionState } from "./form-state";
import {
  loginFields,
  translateLoginIssues,
  validateLogin,
  type LoginField,
  type LoginIssues,
  type LoginValues,
} from "./login-validation";

export function LoginForm() {
  const locale = useLocale();
  const t = useTranslations("auth");
  const validation = useTranslations("validation");
  const errors = useTranslations("errors");
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<LoginValues>({ login: "", password: "" });
  const [issues, setIssues] = useState<LoginIssues>({});
  const [visible, setVisible] = useState(false);
  const [dismissedState, setDismissedState] = useState<AuthActionState | null>(null);
  const [previousLocale, setPreviousLocale] = useState(locale);
  const [state, formAction, pending] = useActionState(async (
    _previous: AuthActionState, data: FormData,
  ) => {
    setValues((current) => ({ ...current, password: "" }));
    return loginAction(data);
  }, initialAuthState(locale));

  // A server error belongs to its request language. Keep entered data when
  // switching languages, but discard old translated errors even on switching back.
  if (previousLocale !== locale) {
    setPreviousLocale(locale);
    setDismissedState(state);
  }

  const localErrors = translateLoginIssues(issues, validation);
  const serverError = !pending && state.status === "error"
    && state.locale === locale && state !== dismissedState;
  const fieldErrors = serverError ? state.fieldErrors : localErrors;
  const message = serverError ? state.message
    : Object.keys(issues).length ? errors("invalidInput") : undefined;

  useEffect(() => {
    if (!serverError) return;
    const field = loginFields.find((name) => state.fieldErrors[name]?.length);
    const input = field && formRef.current?.elements.namedItem(field);
    if (input instanceof HTMLInputElement) input.focus();
    else summaryRef.current?.focus();
  }, [state, serverError]);

  function changeField(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setDismissedState(state);
    setIssues({});
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    const nextIssues = validateLogin(values);
    setIssues(nextIssues);
    setDismissedState(state);
    const field = loginFields.find((name) => nextIssues[name]);
    if (field) {
      event.preventDefault();
      const input = formRef.current?.elements.namedItem(field);
      if (input instanceof HTMLInputElement) input.focus();
    }
  }

  function togglePassword() {
    setVisible((current) => !current);
  }

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} aria-label={t("login.title")}
        noValidate aria-busy={pending} className="space-y-5">
        {message && (
          <p ref={summaryRef} role="alert" aria-atomic="true" tabIndex={-1}
            className="break-words text-sm text-destructive outline-offset-4">
            {message}
          </p>
        )}
        {state.lastLoginAttempt && state.values?.login === values.login && (
          <p role="alert" aria-atomic="true" className="text-sm text-amber-500" data-login-warning>
            {t("login.lastAttempt")}
          </p>
        )}
        {loginFields.map((field) => {
          const passwordField = field === "password";
          const inputId = `${id}-${field}`;
          const errorId = `${inputId}-error`;
          const messages = fieldErrors[field];
          return (
            <div key={field} className="space-y-2">
              <Label id={`${inputId}-label`} htmlFor={inputId}>{t(`fields.${field}`)}</Label>
              <div className="relative">
                <Input
                  variant="auth"
                  id={inputId}
                  name={field}
                  type={passwordField && !visible ? "password" : "text"}
                  autoComplete={passwordField ? "current-password" : "username"}
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  readOnly={pending}
                  value={values[field]}
                  onChange={(event) => changeField(field, event.target.value)}
                  aria-invalid={Boolean(messages?.length)}
                  aria-describedby={messages?.length ? errorId : undefined}
                  className={passwordField ? "h-11 pr-12" : "h-11"}
                />
                {passwordField && (
                  <button type="button" onClick={togglePassword}
                    aria-label={t(visible ? "password.hide" : "password.show")}
                    aria-describedby={`${inputId}-label`}
                    aria-controls={inputId} aria-pressed={visible}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-fuchsia-50 focus-visible:outline-2 focus-visible:outline-fuchsia-400">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                      {visible && <path d="m3 3 18 18" />}
                    </svg>
                  </button>
                )}
              </div>
              {passwordField && (
                <p className="text-xs text-muted-foreground">
                  {t("login.forgotPassword")}{" "}
                  <a role="link" aria-disabled="true" className="cursor-pointer text-foreground underline underline-offset-4">
                    {t("login.remindPassword")}
                  </a>
                </p>
              )}
              {messages?.length ? (
                <ul id={errorId} className="space-y-1 break-words text-sm text-destructive">
                  {messages.map((text) => <li key={text}>{text}</li>)}
                </ul>
              ) : null}
            </div>
          );
        })}
        <AuthSubmitButton label={t(pending ? "login.pending" : "login.action")} pending={pending} />
      </form>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? t("login.pending") : ""}
      </p>
    </>
  );
}
