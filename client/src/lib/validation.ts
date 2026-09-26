import type { LocalAccount, LocalPayment } from "./localStore";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function isValidPayment(value: unknown): value is LocalPayment {
  if (!value || typeof value !== "object") return false;
  const payment = value as Partial<LocalPayment>;
  return Number.isFinite(payment.amount) && Number(payment.amount) > 0 && Number.isSafeInteger(payment.id) &&
    typeof payment.name === "string" && payment.name.trim().length > 0 && payment.name.length <= 200 &&
    (payment.currency === "SYP" || payment.currency === "USD") &&
    (payment.type === "credit" || payment.type === "debit") &&
    typeof payment.date === "string" && DATE_PATTERN.test(payment.date) && !Number.isNaN(Date.parse(`${payment.date}T12:00:00Z`));
}

export function isValidAccount(value: unknown): value is LocalAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<LocalAccount>;
  return Number.isSafeInteger(account.id) && typeof account.name === "string" && account.name.trim().length > 0 && account.name.length <= 200 &&
    typeof account.owner === "string" && account.owner.trim().length > 0 && account.owner.length <= 120 && typeof account.accent === "string" &&
    Array.isArray(account.payments) && account.payments.every(isValidPayment);
}

export function validateAccounts(value: unknown): value is LocalAccount[] {
  return Array.isArray(value) && value.length <= 1000 && value.every(isValidAccount);
}

export function validatePaymentDraft(draft: { name: string; amount: string; currency: string; type: string; date: string }) {
  const amount = Number(draft.amount);
  if (!draft.name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) return "اكتب اسم الدفعة والمبلغ بشكل صحيح";
  if (draft.currency !== "SYP" && draft.currency !== "USD") return "اختار عملة صحيحة";
  if (draft.type !== "credit" && draft.type !== "debit") return "اختار نوع الحركة";
  if (!DATE_PATTERN.test(draft.date) || Number.isNaN(Date.parse(`${draft.date}T12:00:00Z`))) return "اختار تاريخ صحيح";
  return null;
}
