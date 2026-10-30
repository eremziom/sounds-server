import isLength from "validator/lib/isLength.js";
import { validatePassword } from "./password-validation.ts";

export const loginFields = ["login", "password"] as const;
export type LoginField = (typeof loginFields)[number];
export type LoginValues = Record<LoginField, string>;
type LoginIssue = {
  key: "required" | "length" | "passwordComplexity";
  values?: { min: number; max: number };
};
export type LoginIssues = Partial<Record<LoginField, LoginIssue>>;

export function readLoginValues(data: FormData): LoginValues {
  const read = (field: LoginField) => {
    const entries = data.getAll(field);
    return entries.length === 1 && typeof entries[0] === "string" ? entries[0] : "";
  };
  return { login: read("login"), password: read("password") };
}

// LoginUserDto accepts either username or email as text, without normalization.
export function validateLogin(values: LoginValues): LoginIssues {
  const issues: LoginIssues = {};
  if (!values.login) issues.login = { key: "required" };
  else if (!isLength(values.login, { min: 3, max: 100 }))
    issues.login = { key: "length", values: { min: 3, max: 100 } };
  const passwordIssue = validatePassword(values.password);
  if (passwordIssue) issues.password = passwordIssue;
  return issues;
}

export function translateLoginIssues(
  issues: LoginIssues,
  translate: (key: LoginIssue["key"], values?: { min: number; max: number }) => string,
): Partial<Record<LoginField, string[]>> {
  const errors: Partial<Record<LoginField, string[]>> = {};
  for (const field of loginFields) {
    const issue = issues[field];
    if (issue) errors[field] = [translate(issue.key, issue.values)];
  }
  return errors;
}
