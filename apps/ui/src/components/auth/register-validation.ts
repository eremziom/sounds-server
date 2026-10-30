import isEmail from "validator/lib/isEmail.js";
import isLength from "validator/lib/isLength.js";
import { validatePassword } from "./password-validation.ts";

export const registerFields = [
  "username", "email", "password", "confirmPassword",
] as const;
export type RegisterField = (typeof registerFields)[number];
export type RegisterValues = Record<RegisterField, string>;
type ValidationIssue = {
  key: "required" | "email" | "length" | "passwordComplexity" | "passwordMismatch";
  values?: { min: number; max: number };
};
export type RegisterIssues = Partial<Record<RegisterField, ValidationIssue>>;

// Match CreateUserDto, including validator's Unicode length semantics. Never
// trim or normalize credentials. Descriptors can be translated again on locale changes.
export function readRegisterValues(data: FormData): RegisterValues {
  const read = (field: RegisterField) => {
    const entries = data.getAll(field);
    return entries.length === 1 && typeof entries[0] === "string" ? entries[0] : "";
  };
  return {
    username: read("username"),
    email: read("email"),
    password: read("password"),
    confirmPassword: read("confirmPassword"),
  };
}

export function validateRegistration(values: RegisterValues): RegisterIssues {
  const issues: RegisterIssues = {};
  for (const field of registerFields) {
    if (!values[field]) issues[field] = { key: "required" };
  }
  if (!issues.username && !isLength(values.username, { min: 3, max: 30 }))
    issues.username = { key: "length", values: { min: 3, max: 30 } };
  if (!issues.email && !isEmail(values.email)) issues.email = { key: "email" };
  const passwordIssue = validatePassword(values.password);
  if (passwordIssue) issues.password = passwordIssue;
  if (!issues.confirmPassword && values.confirmPassword !== values.password)
    issues.confirmPassword = { key: "passwordMismatch" };
  return issues;
}

export function translateRegisterIssues(
  issues: RegisterIssues,
  translate: (key: ValidationIssue["key"], values?: { min: number; max: number }) => string,
): Partial<Record<RegisterField, string[]>> {
  const errors: Partial<Record<RegisterField, string[]>> = {};
  for (const field of registerFields) {
    const issue = issues[field];
    if (issue) errors[field] = [translate(issue.key, issue.values)];
  }
  return errors;
}
