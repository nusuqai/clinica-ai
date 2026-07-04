import { Smartphone, Info } from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import WhatsAppQR from "@/components/admin/whatsapp-qr";

export default function WhatsAppSetupPage() {
  return (
    <div>
      <PageHeader
        title="إعداد واتساب"
        subtitle="اربط رقم واتساب العيادة لاستقبال رسائل المرضى والرد عليها"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR section */}
        <div>
          <h2 className="text-sm font-semibold text-foreground font-sans mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-accent" />
            ربط الحساب
          </h2>
          <WhatsAppQR />
        </div>

        {/* Instructions */}
        <div>
          <h2 className="text-sm font-semibold text-foreground font-sans mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-accent" />
            خطوات الربط
          </h2>
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <ol className="space-y-3 font-sans text-sm text-foreground">
              {[
                "افتح تطبيق واتساب على هاتفك",
                "اضغط على النقاط الثلاث (⋮) أو الإعدادات",
                'اختر "الأجهزة المرتبطة"',
                'اضغط "ربط جهاز"',
                "امسح رمز QR الظاهر على اليسار",
                "انتظر حتى تظهر حالة \"متصل\"",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                <strong className="text-foreground">ملاحظة:</strong> تأكد من ضبط Evolution API
                لإرسال الـ Webhook إلى:{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono" dir="ltr">
                  https://yourdomain.com/api/whatsapp/webhook
                </code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
