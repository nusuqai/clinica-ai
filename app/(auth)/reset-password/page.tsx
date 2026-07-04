// Hidden — reset password flow is disabled. Re-enable by restoring the
// resetPassword server action and the page UI below.
import { redirect } from "next/navigation";

export default function ResetPasswordPage() {
  redirect("/login");
}

// ─── Hidden UI (restore when needed) ─────────────────────────────────────────

// "use client";
// import { useState, useTransition } from "react";
// import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
// import { resetPassword } from "@/server/actions/auth";
//
// export default function ResetPasswordPage() {
//   const [showPassword, setShowPassword] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [isPending, startTransition] = useTransition();
//
//   async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
//     e.preventDefault();
//     setError(null);
//     const formData = new FormData(e.currentTarget);
//     const password = formData.get("password") as string;
//     const confirm  = formData.get("confirmPassword") as string;
//     if (password !== confirm) { setError("كلمتا المرور غير متطابقتين."); return; }
//     startTransition(async () => { const result = await resetPassword(formData); if (result?.error) setError(result.error); });
//   }
//
//   return (
//     <>
//       <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <div className="flex justify-center mb-4"><img src="/logo.png" alt="Clinica AI" className="h-24 w-auto object-contain" /></div>
//         <h1 className="text-center text-3xl font-heading font-bold text-primary">كلمة مرور جديدة</h1>
//         <p className="mt-3 text-center text-sm text-text/60 font-sans">اختر كلمة مرور قوية لحمايـة حسابك</p>
//       </div>
//       <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
//         <div className="bg-white py-10 px-6 md:px-10 shadow-xl border border-primary/5 rounded-[2rem]">
//           {error && <div className="mb-4 bg-red-50 text-red-600 p-4 rounded-xl font-sans text-sm border border-red-100">{error}</div>}
//           <form className="space-y-5" onSubmit={handleSubmit}>
//             <div>
//               <label className="block text-sm font-medium text-text/80 font-sans mb-1">كلمة المرور الجديدة</label>
//               <div className="relative rounded-xl shadow-sm">
//                 <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-gray-400" /></div>
//                 <input name="password" type={showPassword ? "text" : "password"} required minLength={6} dir="ltr"
//                   className="block w-full pr-10 pl-10 py-3 font-sans border border-primary/20 rounded-xl focus:ring-2 focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right" placeholder="••••••••" />
//                 <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-primary transition-colors">
//                   {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
//                 </button>
//               </div>
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-text/80 font-sans mb-1">تأكيد كلمة المرور</label>
//               <div className="relative rounded-xl shadow-sm">
//                 <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-gray-400" /></div>
//                 <input name="confirmPassword" type={showPassword ? "text" : "password"} required dir="ltr"
//                   className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-2 focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right" placeholder="••••••••" />
//               </div>
//             </div>
//             <button type="submit" disabled={isPending} className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-md text-base font-medium text-white bg-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed font-sans gap-2">
//               {isPending && <Loader2 className="animate-spin w-5 h-5" />} حفظ كلمة المرور
//             </button>
//           </form>
//         </div>
//       </div>
//     </>
//   );
// }
