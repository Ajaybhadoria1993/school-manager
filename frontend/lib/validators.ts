/** Mirrors the backend password policy (backend/src/utils/authUtils.ts). The server has the final say. */
export const PASSWORD_RULES: { id: string; label: string; test: (password: string) => boolean }[] = [
  { id: "length", label: "8 to 72 characters", test: (p) => p.length >= 8 && p.length <= 72 },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /\d/.test(p) },
  { id: "special", label: "A special character (for example @ # $ !)", test: (p) => /[^\w\s]/.test(p) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export const isIndianMobile = (value: string) => /^[6-9]\d{9}$/.test(value.trim());
export const isPinCode = (value: string) => /^\d{6}$/.test(value.trim());
/** The 10 digits after +91: a mobile, or a landline's STD code and number. */
export const isPhone = (value: string) => /^\d{10}$/.test(value.trim());
export const isUdise = (value: string) => /^\d{11}$/.test(value.trim());
