// Hidden — OTP verification flow is disabled. Re-enable by restoring the
// verifyOtp server action and the page UI below.
import { redirect } from "next/navigation";

export default function VerifyOtpPage() {
  redirect("/login");
}

// ─── Hidden UI (restore when needed) ─────────────────────────────────────────

// "use client";
// import { Suspense, useState, useTransition, useRef } from "react";
// import { useSearchParams } from "next/navigation";
// import Link from "next/link";
// import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
// import { verifyOtp } from "@/server/actions/auth";
// import { createClient } from "@/lib/supabase/client";
//
// function VerifyOtpContent() {
//   const searchParams = useSearchParams();
//   const email = searchParams.get("email") ?? "";
//   const type = (searchParams.get("type") ?? "signup") as "signup" | "recovery";
//   const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
//   const [error, setError] = useState<string | null>(null);
//   const [resent, setResent] = useState(false);
//   const [isPending, startTransition] = useTransition();
//   const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
//
//   function handleDigitChange(index: number, value: string) {
//     const cleaned = value.replace(/\D/g, "").slice(-1);
//     const next = [...digits]; next[index] = cleaned; setDigits(next);
//     if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
//   }
//   function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
//     if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
//   }
//   function handlePaste(e: React.ClipboardEvent) {
//     e.preventDefault();
//     const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
//     if (pasted.length === 6) { setDigits(pasted.split("")); inputRefs.current[5]?.focus(); }
//   }
//   async function handleSubmit(e: React.FormEvent) {
//     e.preventDefault();
//     const token = digits.join("");
//     if (token.length < 6) { setError("أدخل الرمز المكوّن من 6 أرقام."); return; }
//     setError(null);
//     const formData = new FormData();
//     formData.set("email", email); formData.set("token", token); formData.set("type", type);
//     startTransition(async () => { const result = await verifyOtp(formData); if (result?.error) setError(result.error); });
//   }
//   async function handleResend() {
//     const supabase = createClient();
//     if (type === "signup") await supabase.auth.resend({ type: "signup", email });
//     else await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
//     setResent(true); setTimeout(() => setResent(false), 60000);
//   }
//
//   return (
//     <>
//       <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <div className="flex justify-center mb-4"><img src="/logo.png" alt="Clinica AI" className="h-24 w-auto object-contain" /></div>
//         <div className="flex justify-center mb-4"><div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center"><ShieldCheck className="w-8 h-8 text-accent" /></div></div>
//         <h1 className="text-center text-3xl font-heading font-bold text-primary">تحقق من بريدك</h1>
//         <p className="mt-3 text-center text-sm text-text/60 font-sans">أرسلنا رمز مكوّن من 6 أرقام إلى</p>
//         <p className="text-center font-medium text-primary font-sans text-sm mt-1" dir="ltr">{email}</p>
//       </div>
//       <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <div className="bg-white py-10 px-6 md:px-10 shadow-xl border border-primary/5 rounded-[2rem]">
//           {error && <div className="mb-4 bg-red-50 text-red-600 p-4 rounded-xl font-sans text-sm border border-red-100">{error}</div>}
//           <form onSubmit={handleSubmit} className="space-y-6">
//             <div className="flex justify-center gap-3" onPaste={handlePaste} dir="ltr">
//               {digits.map((d, i) => (
//                 <input key={i} ref={(el) => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
//                   onChange={(e) => handleDigitChange(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)}
//                   className="w-12 h-14 text-center text-2xl font-bold font-sans border-2 border-primary/20 rounded-xl focus:ring-2 focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors outline-none" />
//               ))}
//             </div>
//             <button type="submit" disabled={isPending} className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-md text-base font-medium text-white bg-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed font-sans gap-2">
//               {isPending && <Loader2 className="animate-spin w-5 h-5" />} تحقق
//             </button>
//             <div className="flex justify-center">
//               <button type="button" onClick={handleResend} disabled={resent} className="flex items-center gap-2 text-sm font-medium text-text/50 hover:text-accent transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed">
//                 <RefreshCw className="w-4 h-4" />{resent ? "تم الإرسال! تحقق من بريدك." : "إعادة إرسال الرمز"}
//               </button>
//             </div>
//             <p className="text-center text-sm font-sans text-text/60"><Link href="/login" className="font-medium text-accent hover:text-primary transition-colors">العودة لتسجيل الدخول</Link></p>
//           </form>
//         </div>
//       </div>
//     </>
//   );
// }
//
// export default function VerifyOtpPage() {
//   return <Suspense><VerifyOtpContent /></Suspense>;
// }
