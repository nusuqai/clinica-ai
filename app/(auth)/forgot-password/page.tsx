// Hidden — forgot password flow is disabled. Re-enable by restoring the
// forgotPassword server action and the page UI below.
import { redirect } from "next/navigation";

export default function ForgotPasswordPage() {
  redirect("/login");
}

// ─── Hidden UI (restore when needed) ─────────────────────────────────────────

// "use client";
// import { useState, useTransition } from "react";
// import Link from "next/link";
// import { Mail, Loader2, ArrowRight } from "lucide-react";
// import { forgotPassword } from "@/server/actions/auth";
//
// export default function ForgotPasswordPage() {
//   const [error, setError] = useState<string | null>(null);
//   const [isPending, startTransition] = useTransition();
//
//   async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
//     e.preventDefault();
//     setError(null);
//     const formData = new FormData(e.currentTarget);
//     startTransition(async () => {
//       const result = await forgotPassword(formData);
//       if (result?.error) setError(result.error);
//     });
//   }
//
//   return (
//     <>
//       <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <Link href="/login" className="flex items-center justify-center gap-2 text-primary hover:text-accent transition-colors mb-4 group w-fit mx-auto">
//           <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
//           <span className="font-sans font-medium">العودة لتسجيل الدخول</span>
//         </Link>
//         <div className="flex justify-center mb-4">
//           <img src="/logo.png" alt="Clinica AI" className="h-24 w-auto object-contain" />
//         </div>
//         <h1 className="text-center text-3xl font-heading font-bold text-primary">نسيت كلمة المرور؟</h1>
//         <p className="mt-3 text-center text-sm text-text/60 font-sans">أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق</p>
//       </div>
//       <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <div className="bg-white py-10 px-6 md:px-10 shadow-xl border border-primary/5 rounded-[2rem]">
//           {error && <div className="mb-4 bg-red-50 text-red-600 p-4 rounded-xl font-sans text-sm border border-red-100">{error}</div>}
//           <form className="space-y-5" onSubmit={handleSubmit}>
//             <div>
//               <label className="block text-sm font-medium text-text/80 font-sans mb-1">البريد الإلكتروني</label>
//               <div className="relative rounded-xl shadow-sm">
//                 <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-gray-400" /></div>
//                 <input name="email" type="email" required dir="ltr" autoFocus className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-2 focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right" placeholder="name@example.com" />
//               </div>
//             </div>
//             <button type="submit" disabled={isPending} className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-md text-base font-medium text-white bg-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed font-sans gap-2">
//               {isPending && <Loader2 className="animate-spin w-5 h-5" />}
//               إرسال رمز التحقق
//             </button>
//             <p className="text-center text-sm font-sans text-text/60">تذكّرت كلمة المرور؟{" "}<Link href="/login" className="font-medium text-accent hover:text-primary transition-colors">سجل دخولك</Link></p>
//           </form>
//         </div>
//       </div>
//     </>
//   );
// }
