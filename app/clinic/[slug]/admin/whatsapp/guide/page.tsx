import Link from "next/link";
import { KeyRound, Settings, Webhook, MessageSquareText, ExternalLink } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";

export default async function WhatsAppGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireActiveMember(["ADMIN"]);
  const configHref = `/admin/whatsapp/configuration`;

  return (
    <div>
      <PageHeader
        title="دليل إعداد واتساب"
        subtitle="خطوات الحصول على مفاتيح WhatsApp Cloud API وربط العيادة بحساب ميتا"
      />

      <div className="max-w-3xl space-y-5">
        <Intro />

        <Step n={1} icon={<Settings className="h-4 w-4" />} title="أنشئ تطبيق ميتا وأضف واتساب">
          <p>
            من لوحة تحكم المطوّرين في ميتا{" "}
            <ExternalLinkText href="https://developers.facebook.com/apps">
              developers.facebook.com/apps
            </ExternalLinkText>{" "}
            أنشئ تطبيقًا من نوع <Code>Business</Code>، ثم أضِف منتج <Code>WhatsApp</Code> إليه.
            ستحتاج إلى حساب واتساب للأعمال (<span dir="ltr">WhatsApp Business Account</span>).
          </p>
        </Step>

        <Step n={2} icon={<KeyRound className="h-4 w-4" />} title="انسخ Phone Number ID و WABA ID">
          <p>
            من صفحة إعداد واتساب داخل التطبيق (<Code>WhatsApp → API Setup</Code>) ستجد:
          </p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            <li>
              <b>Phone Number ID</b> — معرّف رقم الهاتف المرسِل (وليس الرقم نفسه).
            </li>
            <li>
              <b>WhatsApp Business Account ID (WABA)</b> — معرّف حساب الأعمال، يظهر أعلى الصفحة
              نفسها.
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
          icon={<KeyRound className="h-4 w-4" />}
          title="أنشئ Access Token دائمًا (System User)"
        >
          <p>
            الرمز المؤقّت الظاهر في صفحة الإعداد ينتهي خلال 24 ساعة ولا يصلح للإنتاج. أنشئ بدلًا منه
            رمزًا دائمًا:
          </p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            <li>
              افتح{" "}
              <ExternalLinkText href="https://business.facebook.com/settings">
                إعدادات الأعمال
              </ExternalLinkText>{" "}
              ← <Code>Users → System users</Code> وأنشئ مستخدم نظام.
            </li>
            <li>
              امنحه صلاحية التطبيق، ثم <Code>Generate new token</Code> مع اختيار صلاحيتَي{" "}
              <Code>whatsapp_business_messaging</Code> و <Code>whatsapp_business_management</Code>.
            </li>
          </ul>
          <p className="mt-2">
            الصق الرمز في حقل <b>Access Token</b> بصفحة الإعدادات — يُحفظ مشفّرًا ولا يظهر مجددًا.
          </p>
        </Step>

        <Step n={4} icon={<Webhook className="h-4 w-4" />} title="اربط الويبهوك">
          <p>
            بعد حفظ الإعدادات ستظهر لك قيمتان خاصتان بعيادتك: <b>Callback URL</b> و{" "}
            <b>Verify Token</b>. من إعدادات واتساب في تطبيق ميتا (
            <Code>Configuration → Webhooks</Code>):
          </p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            <li>
              الصق رابط <b>Callback URL</b> ورمز <b>Verify Token</b> كما هما.
            </li>
            <li>
              اشترك في حقل الرسائل <Code>messages</Code> ضمن حقول الاشتراك (
              <span dir="ltr">Webhook fields</span>).
            </li>
          </ul>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            حافظ على سرية رابط الويبهوك — فمن يملكه يستطيع إرسال رسائل واردة إلى عيادتك.
          </p>
        </Step>

        <Step n={5} icon={<MessageSquareText className="h-4 w-4" />} title="أنشئ قوالبك">
          <p>
            انتقل إلى{" "}
            <Link
              href={`/admin/whatsapp/templates`}
              className="text-accent hover:underline"
            >
              صفحة القوالب
            </Link>{" "}
            وأنشئ قالبًا. تُراجعه ميتا خلال دقائق إلى ساعات؛ ولا يمكن إرسال القالب إلا بعد اعتماده
            (الحالة <Code>APPROVED</Code>). خارج نافذة الـ 24 ساعة، القوالب المعتمدة هي الوسيلة
            الوحيدة لمراسلة العميل.
          </p>
        </Step>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
      تستخدم كل عيادة تطبيق ميتا الخاص بها. اتبع الخطوات التالية للحصول على المفاتيح المطلوبة ولصقها
      في <b className="text-foreground">صفحة الإعدادات</b>. تحتاج عادةً إلى ربط واحد فقط ثم تكتفي
      بإنشاء القوالب.
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
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {n}
        </span>
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
      </div>
      <div className="ps-10 text-sm leading-relaxed text-muted-foreground">{children}</div>
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

function ExternalLinkText({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-accent hover:underline"
      dir="ltr"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
