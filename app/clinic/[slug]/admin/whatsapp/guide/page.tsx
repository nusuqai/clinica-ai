import Link from "next/link";
import { KeyRound, Settings, Webhook, MessageSquareText, ExternalLink } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";

export default async function WhatsAppGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireActiveMember(["ADMIN"]);
  const configHref = `/clinic/${slug}/admin/whatsapp/configuration`;

  return (
    <div>
      <PageHeader
        title="دليل إعداد واتساب"
        subtitle="خطوات الحصول على مفاتيح WhatsApp Cloud API وربط العيادة بحساب ميتا"
      />

      <div className="max-w-3xl space-y-5">
        <Intro />

        <Step
          n={1}
          icon={<Settings className="w-4 h-4" />}
          title="أنشئ تطبيق ميتا وأضف واتساب"
        >
          <p>
            من لوحة تحكم المطوّرين في ميتا{" "}
            <ExternalLinkText href="https://developers.facebook.com/apps">
              developers.facebook.com/apps
            </ExternalLinkText>{" "}
            أنشئ تطبيقًا من نوع <Code>Business</Code>، ثم أضِف منتج{" "}
            <Code>WhatsApp</Code> إليه. ستحتاج إلى حساب واتساب للأعمال
            (<span dir="ltr">WhatsApp Business Account</span>).
          </p>
        </Step>

        <Step
          n={2}
          icon={<KeyRound className="w-4 h-4" />}
          title="انسخ Phone Number ID و WABA ID"
        >
          <p>
            من صفحة إعداد واتساب داخل التطبيق (<Code>WhatsApp → API Setup</Code>)
            ستجد:
          </p>
          <ul className="list-disc ps-5 space-y-1 mt-2">
            <li>
              <b>Phone Number ID</b> — معرّف رقم الهاتف المرسِل (وليس الرقم نفسه).
            </li>
            <li>
              <b>WhatsApp Business Account ID (WABA)</b> — معرّف حساب الأعمال،
              يظهر أعلى الصفحة نفسها.
            </li>
          </ul>
          <p className="mt-2">
            الصق القيمتين في{" "}
            <Link href={configHref} className="text-accent hover:underline">
              صفحة الإعدادات
            </Link>
            .
          </p>
        </Step>

        <Step
          n={3}
          icon={<KeyRound className="w-4 h-4" />}
          title="أنشئ Access Token دائمًا (System User)"
        >
          <p>
            الرمز المؤقّت الظاهر في صفحة الإعداد ينتهي خلال 24 ساعة ولا يصلح
            للإنتاج. أنشئ بدلًا منه رمزًا دائمًا:
          </p>
          <ul className="list-disc ps-5 space-y-1 mt-2">
            <li>
              افتح{" "}
              <ExternalLinkText href="https://business.facebook.com/settings">
                إعدادات الأعمال
              </ExternalLinkText>{" "}
              ← <Code>Users → System users</Code> وأنشئ مستخدم نظام.
            </li>
            <li>
              امنحه صلاحية التطبيق، ثم <Code>Generate new token</Code> مع
              اختيار صلاحيتَي <Code>whatsapp_business_messaging</Code> و{" "}
              <Code>whatsapp_business_management</Code>.
            </li>
          </ul>
          <p className="mt-2">
            الصق الرمز في حقل <b>Access Token</b> بصفحة الإعدادات — يُحفظ مشفّرًا
            ولا يظهر مجددًا.
          </p>
        </Step>

        <Step
          n={4}
          icon={<Webhook className="w-4 h-4" />}
          title="اربط الويبهوك"
        >
          <p>
            بعد حفظ الإعدادات ستظهر لك قيمتان خاصتان بعيادتك:{" "}
            <b>Callback URL</b> و <b>Verify Token</b>. من إعدادات واتساب في
            تطبيق ميتا (<Code>Configuration → Webhooks</Code>):
          </p>
          <ul className="list-disc ps-5 space-y-1 mt-2">
            <li>الصق رابط <b>Callback URL</b> ورمز <b>Verify Token</b> كما هما.</li>
            <li>
              اشترك في حقل الرسائل <Code>messages</Code> ضمن حقول الاشتراك
              (<span dir="ltr">Webhook fields</span>).
            </li>
          </ul>
          <p className="mt-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
            حافظ على سرية رابط الويبهوك — فمن يملكه يستطيع إرسال رسائل واردة إلى
            عيادتك.
          </p>
        </Step>

        <Step
          n={5}
          icon={<MessageSquareText className="w-4 h-4" />}
          title="أنشئ قوالبك"
        >
          <p>
            انتقل إلى{" "}
            <Link
              href={`/clinic/${slug}/admin/whatsapp/templates`}
              className="text-accent hover:underline"
            >
              صفحة القوالب
            </Link>{" "}
            وأنشئ قالبًا. تُراجعه ميتا خلال دقائق إلى ساعات؛ ولا يمكن إرسال
            القالب إلا بعد اعتماده (الحالة <Code>APPROVED</Code>). خارج نافذة
            الـ 24 ساعة، القوالب المعتمدة هي الوسيلة الوحيدة لمراسلة العميل.
          </p>
        </Step>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground leading-relaxed">
      تستخدم كل عيادة تطبيق ميتا الخاص بها. اتبع الخطوات التالية للحصول على
      المفاتيح المطلوبة ولصقها في{" "}
      <b className="text-foreground">صفحة الإعدادات</b>. تحتاج عادةً إلى ربط
      واحد فقط ثم تكتفي بإنشاء القوالب.
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/15 text-accent text-sm font-bold flex-shrink-0">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-foreground font-sans flex items-center gap-2">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed ps-10">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      dir="ltr"
      className="inline-block rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground"
    >
      {children}
    </code>
  );
}

function ExternalLinkText({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline inline-flex items-center gap-0.5"
      dir="ltr"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
