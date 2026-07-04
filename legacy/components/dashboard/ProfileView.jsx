import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { motion } from "framer-motion";
import { Loader2, Save, User, Phone, Droplet, Calendar } from "lucide-react";

export default function ProfileView({ session }) {
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    gender: "",
    blood_type: "",
    avatar_url: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function getProfile() {
      try {
        setLoading(true);
        if (!session?.user?.id) return;

        // Fetch User Profile
        const { data: userProfile, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (userError) {
          if (userError.code !== "PGRST116") {
            // not found
            throw userError;
          }
        }

        if (userProfile) {
          setProfile({
            full_name: userProfile.full_name || "",
            email: userProfile.email || session.user.email || "",
            phone: userProfile.phone || "",
            date_of_birth: userProfile.date_of_birth || "",
            gender: userProfile.gender || "",
            blood_type: userProfile.blood_type || "",
            avatar_url: userProfile.avatar_url || "",
          });
        } else {
          // Fallback to auth metadata if user row isn't fully synced yet
          const meta = session.user.user_metadata;
          setProfile((prev) => ({
            ...prev,
            full_name: meta?.full_name || "",
            phone: meta?.phone || "",
            date_of_birth: meta?.date_of_birth || "",
            gender: meta?.gender || "",
            email: session.user.email || "",
          }));
        }
      } catch (error) {
        console.error("Error loading profile data!", error);
      } finally {
        setLoading(false);
      }
    }

    getProfile();

    window.addEventListener('clinica-refresh-data', getProfile);

    return () => {
      window.removeEventListener('clinica-refresh-data', getProfile);
    };
  }, [session]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage("");

      // 1. Primary: Update the users table directly (RLS policies now allow this)
      const { error } = await supabase
        .from("users")
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          date_of_birth: profile.date_of_birth || null,
          gender: profile.gender || null,
          blood_type: profile.blood_type || null,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      // 2. Secondary: Keep auth metadata in sync (for Navbar greeting etc.)
      await supabase.auth.updateUser({
        data: {
          full_name: profile.full_name,
          phone: profile.phone,
          blood_type: profile.blood_type || null,
        },
      });

      setMessage("تم حفظ التغييرات بنجاح");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage("حدث خطأ أثناء حفظ التغييرات");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 shadow-sm border border-primary/5"
      >
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Avatar Area */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 rounded-full border-4 border-background bg-primary/5 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={48} className="text-primary/30" />
              )}
            </div>
            <button className="text-sm font-sans font-medium text-accent hover:text-primary transition-colors">
              تغيير الصورة
            </button>
          </div>

          {/* Form Area */}
          <form onSubmit={handleUpdate} className="flex-1 w-full space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold font-heading text-primary">
                المعلومات الشخصية
              </h2>
              {message && (
                <span className="text-sm font-sans font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  {message}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  الاسم الكامل
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/30"
                  />
                  <input
                    type="text"
                    name="full_name"
                    value={profile.full_name}
                    onChange={handleChange}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-primary/10 bg-background font-sans text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-primary/10 bg-primary/5 font-sans text-primary/60 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  رقم الهاتف
                </label>
                <div className="relative">
                  <Phone
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/30"
                  />
                  <input
                    type="tel"
                    name="phone"
                    dir="ltr"
                    value={profile.phone}
                    onChange={handleChange}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-primary/10 bg-background font-sans text-primary focus:outline-none focus:ring-1 focus:ring-accent text-right"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  تاريخ الميلاد
                </label>
                <div className="relative">
                  <Calendar
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/30"
                  />
                  <input
                    type="date"
                    name="date_of_birth"
                    value={profile.date_of_birth}
                    onChange={handleChange}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-primary/10 bg-background font-sans text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  الجنس
                </label>
                <select
                  name="gender"
                  value={profile.gender}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl border border-primary/10 bg-background font-sans text-primary focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  <option value="">-- اختر --</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-sans text-text/70">
                  فصيلة الدم
                </label>
                <div className="relative">
                  <Droplet
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#EF4444]"
                  />
                  <select
                    name="blood_type"
                    value={profile.blood_type || ""}
                    onChange={handleChange}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-primary/10 bg-background font-sans text-primary focus:outline-none focus:ring-1 focus:ring-accent appearance-none text-[#EF4444] font-bold"
                    dir="ltr"
                  >
                    <option value="">-- اختر --</option>
                    {bloodTypes.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary text-white font-sans font-medium px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                حفظ التغييرات
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
