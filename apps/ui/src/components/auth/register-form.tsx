"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { registerAction } from "../../app/(auth)/actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { initialAuthState, type AuthActionState } from "./form-state";
import {
  registerFields,
  translateRegisterIssues,
  validateRegistration,
  type RegisterField,
  type RegisterIssues,
  type RegisterValues,
} from "./register-validation";

export function RegisterForm() {
  const locale = useLocale();
  const t = useTranslations("auth");
  const validation = useTranslations("validation");
  const errors = useTranslations("errors");
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<RegisterValues>({
    username: "", email: "", password: "", confirmPassword: "",
  });
  const [issues, setIssues] = useState<RegisterIssues>({});
  const [visible, setVisible] = useState({ password: false, confirmPassword: false });
  const [dismissedState, setDismissedState] = useState<AuthActionState | null>(null);
  const [previousLocale, setPreviousLocale] = useState(locale);
  const [state, formAction, pending] = useActionState(async (
    previous: AuthActionState, data: FormData,
  ) => {
    setValues((current) => ({ ...current, password: "", confirmPassword: "" }));
    return registerAction(previous, data);
  }, initialAuthState(locale));

  // Discard a translated server result on language changes, including switching
  // back later. Keep field values and local validation descriptors intact.
  if (previousLocale !== locale) {
    setPreviousLocale(locale);
    setDismissedState(state);
  }

  const localErrors = translateRegisterIssues(issues, validation);
  const serverError = !pending && state.status === "error"
    && state.locale === locale && state !== dismissedState;
  const fieldErrors = serverError ? state.fieldErrors : localErrors;
  const message = serverError ? state.message
    : Object.keys(issues).length ? errors("invalidInput") : undefined;

  useEffect(() => {
    if (!serverError) return;
    const field = registerFields.find((name) => state.fieldErrors[name]?.length);
    const input = field && formRef.current?.elements.namedItem(field);
    if (input instanceof HTMLInputElement) input.focus();
    else summaryRef.current?.focus();
  }, [state, serverError]);

  function changeField(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setDismissedState(state);
    setIssues({});
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }

    const nextIssues = validateRegistration(values);
    setIssues(nextIssues);
    setDismissedState(state);

    const field = registerFields.find((name) => nextIssues[name]);
    if (field) {
      event.preventDefault();
      const input = formRef.current?.elements.namedItem(field);
      if (input instanceof HTMLInputElement) input.focus();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-busy={pending}
      className="space-y-5"
      onSubmit={handleSubmit}
    >
      {message && (
        <p ref={summaryRef} role="alert" tabIndex={-1}
          className="break-words text-sm text-destructive outline-offset-4">
          {message}
        </p>
      )}
      {registerFields.map((field) => {
        const passwordField = field === "password" || field === "confirmPassword";
        const inputId = `${id}-${field}`;
        const errorId = `${inputId}-error`;
        const hintId = `${id}-password-hint`;
        const messages = fieldErrors[field];
        const describedBy = [
          field === "password" ? hintId : undefined,
          messages?.length ? errorId : undefined,
        ].filter(Boolean).join(" ") || undefined;
        return (
          <div key={field} className="space-y-2">
            <Label htmlFor={inputId}>{t(`fields.${field}`)}</Label>
            <div className="relative">
              <Input
                id={inputId}
                name={field}
                type={passwordField ? (visible[field] ? "text" : "password")
                  : field === "email" ? "email" : "text"}
                autoComplete={passwordField ? "new-password" : field}
                autoCapitalize="none"
                spellCheck={false}
                required
                readOnly={pending}
                value={values[field]}
                onChange={(event) => changeField(field, event.target.value)}
                aria-invalid={Boolean(messages?.length)}
                aria-describedby={describedBy}
                className={passwordField ? "h-11 pr-12" : "h-11"}
              />
              {passwordField && (
                <button
                  type="button"
                  aria-label={t(visible[field] ? "password.hide" : "password.show")}
                  aria-controls={inputId}
                  aria-pressed={visible[field]}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setVisible((current) => ({ ...current, [field]: !current[field] }))}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {visible[field] && <path d="m3 3 18 18" />}
                  </svg>
                </button>
              )}
            </div>
            {field === "password" && (
              <p id={hintId} className="text-sm text-muted-foreground">{t("password.requirements")}</p>
            )}
            {messages?.length ? (
              <ul id={errorId} className="space-y-1 break-words text-sm text-destructive">
                {messages.map((text) => <li key={text}>{text}</li>)}
              </ul>
            ) : null}
          </div>
        );
      })}
      <Button type="submit" disabled={pending} className="h-auto min-h-11 w-full whitespace-normal px-4 py-2">
        <span role="status" aria-live="polite">
          {t(pending ? "register.pending" : "register.action")}
        </span>
      </Button>
    </form>
  );
}
