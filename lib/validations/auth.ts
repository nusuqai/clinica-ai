import { z } from "zod";
import { PHONE_EXAMPLE, isValidPhone, normalizePhone } from "@/lib/phone";

// Shared by the auth forms (react-hook-form + zodResolver) and the server actions
// in server/actions/auth.ts, so the browser and the server enforce the same rules.

const email = z
  .string()
  .trim()
  .min(1, "أدخل بريدك الإلكتروني.")
  .pipe(z.email("أدخل بريداً إلكترونياً صحيحاً."));

const requiredPassword = z.string().min(1, "أدخل كلمة المرور.");

export const loginSchema = z.object({
  email,
  password: requiredPassword,
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, "أدخل اسمك الكامل."),
    // Stored normalized so it matches the WhatsApp number (wa_id) exactly.
    phone: z
      .string()
      .transform(normalizePhone)
      .refine(
        isValidPhone,
        `أدخل رقم الهاتف بالصيغة الدولية بدون علامة (+) وبدون صفر في البداية: بادئة الدولة ثم الرقم، مثال: ${PHONE_EXAMPLE}`
      ),
    email,
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل."),
    confirmPassword: z.string().min(1, "أعد إدخال كلمة المرور."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const OTP_LENGTH = 8;

export const verifyOtpSchema = z.object({
  email,
  token: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `أدخل الرمز المكوّن من ${OTP_LENGTH} أرقام.`),
});
export type VerifyOtpValues = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل."),
    confirmPassword: z.string().min(1, "أعد إدخال كلمة المرور."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["confirmPassword"],
  });
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;

/** First validation message, for server actions that return a single `{ error }`. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "بيانات غير صالحة.";
}
