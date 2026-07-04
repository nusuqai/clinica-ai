import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  User,
  Phone,
  Calendar as CalIcon,
  Users,
} from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Extra Registration Fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("male"); // default

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error, data: authData } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) throw error;

        // Fetch user profile with the related doctors row embedded.
        // If userProfile.doctors has a value this user is a doctor.
        const { data: userProfile } = await supabase
          .from("users")
          .select("*, doctors(*)")
          .eq("id", authData.user.id)
          .single();

        if (userProfile?.doctors?.id) {
          navigate("/doctor-dashboard");
        } else {
          navigate("/dashboard");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
              date_of_birth: dob,
              gender: gender,
            },
          },
        });
        if (error) throw error;
        alert("تم التسجيل بنجاح! يمكنك الآن تسجيل الدخول.");
        setIsLogin(true);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-accent/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <a
          href="/"
          className="flex items-center justify-center gap-2 text-primary hover:text-accent transition-colors mb-4 group w-fit mx-auto"
        >
          <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-sans font-medium">العودة للرئيسية</span>
        </a>
        <div className="flex justify-center mb-4">
          <img
            src="/logo.png"
            alt="Clinica AI Logo"
            className="h-24 w-auto object-contain"
          />
        </div>
        <h2 className="mt-2 text-center text-4xl font-heading font-bold text-primary">
          {isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h2>
        <p className="mt-3 text-center text-sm text-text/60 font-sans">
          Clinica AI - بوابتك للرعاية الصحية
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-10 px-6 md:px-10 shadow-xl border border-primary/5 rounded-[2rem] sm:px-10">
          <form className="space-y-6" onSubmit={handleAuth}>
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl font-sans text-sm border border-red-100">
                {error === "Invalid login credentials"
                  ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
                  : error}
              </div>
            )}

            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                    الاسم الكامل
                  </label>
                  <div className="mt-1 relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required={!isLogin}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors"
                      placeholder="أحمد الرشيد"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                    رقم الهاتف
                  </label>
                  <div className="mt-1 relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      required={!isLogin}
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right"
                      placeholder="+20 100 000 0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                      تاريخ الميلاد
                    </label>
                    <div className="mt-1 relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <CalIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="date"
                        required={!isLogin}
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                      الجنس
                    </label>
                    <div className="mt-1 relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <Users className="h-5 w-5 text-gray-400" />
                      </div>
                      <select
                        required={!isLogin}
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors appearance-none"
                      >
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                البريد الإلكتروني
              </label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text/80 font-sans mb-1">
                كلمة المرور
              </label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pr-10 pl-3 py-3 font-sans border border-primary/20 rounded-xl focus:ring-accent focus:border-accent bg-background/50 hover:bg-white transition-colors text-right"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-md text-base font-medium text-white bg-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed font-sans"
              >
                {loading ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : isLogin ? (
                  "دخول"
                ) : (
                  "تسجيل"
                )}
              </button>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-sm">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null); // Clear errors on toggle
                }}
                className="font-medium text-accent hover:text-primary transition-colors"
              >
                {isLogin
                  ? "ليس لديك حساب؟ سجل الآن"
                  : "لديك حساب بالفعل؟ سجل دخولك"}
              </button>

              {isLogin && (
                <a
                  href="#"
                  className="font-medium text-text/50 hover:text-primary transition-colors"
                >
                  نسيت كلمة المرور؟
                </a>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
