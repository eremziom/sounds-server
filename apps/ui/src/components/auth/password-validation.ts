import isLength from "validator/lib/isLength.js";

type PasswordIssue = {
  key: "required" | "length" | "passwordComplexity";
  values?: { min: number; max: number };
};

// Keep identical to CreateUserDto and LoginUserDto. Do not normalize passwords.
const passwordComplexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

export function validatePassword(password: string): PasswordIssue | undefined {
  if (!password) return { key: "required" };
  if (!isLength(password, { min: 8, max: 50 }))
    return { key: "length", values: { min: 8, max: 50 } };
  if (!passwordComplexity.test(password)) return { key: "passwordComplexity" };
  return undefined;
}
