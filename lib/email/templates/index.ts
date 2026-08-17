// ─── Email templates (Arabic RTL) ────────────────────────────────────────────
// Each builder returns { subject, html }. Bodies compose through renderEmail()
// so branding stays consistent. Clinic name is surfaced in the body since the
// sender is the platform (Nusuq), not the individual clinic.

import { renderEmail, linkFallback, esc, BRAND } from "./layout";

export type BuiltEmail = { subject: string; html: string };

const LINK_EXPIRY_NOTE =
  "لأسباب أمنية، تنتهي صلاحية هذا الرابط خلال 24 ساعة. إن انتهت صلاحيته يمكنك طلب رابط جديد.";

function p(text: string): string {
  return `<p style="margin:0 0 14px;">${text}</p>`;
}

// 1) Acknowledgement — a clinic request was received; we'll follow up.
export function requestReceivedEmail(args: {
  requesterName: string;
  clinicName: string;
}): BuiltEmail {
  return {
    subject: `استلمنا طلب تسجيل عيادة «${args.clinicName}»`,
    html: renderEmail({
      preheader: "استلمنا طلبك وسنراجعه ونعود إليك قريباً.",
      clinicName: args.clinicName,
      heading: `مرحباً ${esc(args.requesterName)}، استلمنا طلبك 🎉`,
      bodyHtml:
        p(`شكراً لاهتمامك بمنصة <strong>${BRAND.name}</strong>. لقد استلمنا طلب تسجيل عيادة <strong>«${esc(args.clinicName)}»</strong> بنجاح.`) +
        p("سيقوم فريقنا بمراجعة الطلب، وسنعود إليك عبر البريد الإلكتروني بالخطوات التالية في أقرب وقت ممكن.") +
        p("لا حاجة لأي إجراء من جانبك الآن — نحن نتولى الباقي. 🙌"),
    }),
  };
}

// 2) Clinic request APPROVED — invite to set a password and log in.
export function clinicApprovedInviteEmail(args: {
  requesterName: string;
  clinicName: string;
  actionUrl: string;
}): BuiltEmail {
  return {
    subject: `تمت الموافقة على عيادة «${args.clinicName}» — فعّل حسابك`,
    html: renderEmail({
      preheader: "تمت الموافقة على عيادتك. عيّن كلمة المرور وابدأ الآن.",
      clinicName: args.clinicName,
      heading: `تهانينا ${esc(args.requesterName)}! تمت الموافقة ✅`,
      bodyHtml:
        p(`يسعدنا إبلاغك بأنه تمت الموافقة على تسجيل عيادة <strong>«${esc(args.clinicName)}»</strong> على منصة <strong>${BRAND.name}</strong>.`) +
        p("لقد أنشأنا لك حساب مدير العيادة. اضغط الزر أدناه لتعيين كلمة المرور الخاصة بك وتسجيل الدخول إلى لوحة التحكم.") +
        linkFallback(args.actionUrl),
      cta: { label: "تعيين كلمة المرور", url: args.actionUrl },
      footnote: LINK_EXPIRY_NOTE,
    }),
  };
}

// 3) Clinic request REJECTED — polite decline.
export function clinicRejectedEmail(args: {
  requesterName: string;
  clinicName: string;
}): BuiltEmail {
  return {
    subject: `تحديث بخصوص طلب عيادة «${args.clinicName}»`,
    html: renderEmail({
      preheader: "تحديث بخصوص طلب تسجيل عيادتك.",
      clinicName: args.clinicName,
      heading: `مرحباً ${esc(args.requesterName)}`,
      bodyHtml:
        p(`شكراً لتقديمك طلب تسجيل عيادة <strong>«${esc(args.clinicName)}»</strong> على منصة <strong>${BRAND.name}</strong>.`) +
        p("بعد المراجعة، لم نتمكن من الموافقة على الطلب في الوقت الحالي. قد يعود ذلك إلى نقص في المعلومات أو عدم اكتمال متطلبات التسجيل.") +
        p("يسعدنا مساعدتك — يمكنك الرد على فريق الدعم لمعرفة التفاصيل أو إعادة تقديم الطلب بعد استكمال البيانات."),
    }),
  };
}

// 4) Clinic created directly by a platform admin — invite the clinic admin.
export function clinicCreatedInviteEmail(args: {
  adminName: string;
  clinicName: string;
  actionUrl: string;
}): BuiltEmail {
  return {
    subject: `تم إنشاء حسابك لإدارة عيادة «${args.clinicName}»`,
    html: renderEmail({
      preheader: "تم إنشاء حساب مدير العيادة. عيّن كلمة المرور للبدء.",
      clinicName: args.clinicName,
      heading: `مرحباً ${esc(args.adminName)} 👋`,
      bodyHtml:
        p(`تم إنشاء حساب لك لإدارة عيادة <strong>«${esc(args.clinicName)}»</strong> على منصة <strong>${BRAND.name}</strong>.`) +
        p("اضغط الزر أدناه لتعيين كلمة المرور وتسجيل الدخول إلى لوحة التحكم الخاصة بعيادتك.") +
        linkFallback(args.actionUrl),
      cta: { label: "تعيين كلمة المرور", url: args.actionUrl },
      footnote: LINK_EXPIRY_NOTE,
    }),
  };
}

// 4b) Web-account claim invite — a WhatsApp patient set an email and now needs to
// set a password to enable website login.
export function accountInviteEmail(args: {
  name: string | null;
  clinicName: string;
  actionUrl: string;
}): BuiltEmail {
  const greeting = args.name ? `مرحباً ${esc(args.name)}` : "مرحباً";
  return {
    subject: `فعّل دخولك إلى الموقع — ${BRAND.name}`,
    html: renderEmail({
      preheader: "عيّن كلمة المرور لتسجيل الدخول إلى الموقع.",
      clinicName: args.clinicName,
      heading: `${greeting} 👋`,
      bodyHtml:
        p(`لتتمكن من تسجيل الدخول إلى حسابك على الموقع ومتابعة مواعيدك مع عيادة <strong>«${esc(args.clinicName)}»</strong>، اضغط الزر أدناه لتعيين كلمة المرور الخاصة بك.`) +
        p("كل مواعيدك وبياناتك السابقة محفوظة وستظهر فور تسجيل دخولك.") +
        linkFallback(args.actionUrl),
      cta: { label: "تعيين كلمة المرور", url: args.actionUrl },
      footnote: LINK_EXPIRY_NOTE,
    }),
  };
}

// 5) Password reset (recovery).
export function passwordResetEmail(args: {
  name: string | null;
  actionUrl: string;
}): BuiltEmail {
  const greeting = args.name ? `مرحباً ${esc(args.name)}` : "مرحباً";
  return {
    subject: `إعادة تعيين كلمة المرور — ${BRAND.name}`,
    html: renderEmail({
      preheader: "طلب إعادة تعيين كلمة المرور لحسابك.",
      heading: `${greeting}، إعادة تعيين كلمة المرور 🔐`,
      bodyHtml:
        p("تلقّينا طلباً لإعادة تعيين كلمة المرور لحسابك. اضغط الزر أدناه لاختيار كلمة مرور جديدة.") +
        p("إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان — لن يتغيّر شيء في حسابك.") +
        linkFallback(args.actionUrl),
      cta: { label: "إعادة تعيين كلمة المرور", url: args.actionUrl },
      footnote: LINK_EXPIRY_NOTE,
    }),
  };
}

// 7) Signup email verification — a one-time code (OTP).
export function signupOtpEmail(args: {
  name: string | null;
  clinicName: string;
  code: string;
}): BuiltEmail {
  const greeting = args.name ? `مرحباً ${esc(args.name)}` : "مرحباً";
  const codeBox = `
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:24px auto 8px;">
      <tr><td align="center" style="background:${BRAND.bg};border:1px dashed ${BRAND.accent};border-radius:14px;padding:18px 34px;">
        <span dir="ltr" style="font-family:Tahoma,Arial,sans-serif;font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND.primary};">${esc(args.code)}</span>
      </td></tr>
    </table>`;
  return {
    subject: `رمز التحقق: ${args.code} — ${BRAND.name}`,
    html: renderEmail({
      preheader: `رمز تفعيل حسابك في ${args.clinicName}.`,
      clinicName: args.clinicName,
      heading: `${greeting}، أكّد بريدك الإلكتروني`,
      bodyHtml:
        p(`استخدم الرمز التالي لتفعيل حسابك في عيادة <strong>«${esc(args.clinicName)}»</strong> على منصة <strong>${BRAND.name}</strong>:`) +
        codeBox +
        p("أدخل هذا الرمز في الصفحة المفتوحة لإكمال التسجيل.") +
        p("إذا لم تطلب إنشاء حساب، تجاهل هذه الرسالة."),
      footnote: "تنتهي صلاحية الرمز خلال ساعة واحدة.",
    }),
  };
}

// 6) Email change confirmation (sent to the new address).
export function emailChangeEmail(args: {
  name: string | null;
  newEmail: string;
  actionUrl: string;
}): BuiltEmail {
  const greeting = args.name ? `مرحباً ${esc(args.name)}` : "مرحباً";
  return {
    subject: `تأكيد تغيير البريد الإلكتروني — ${BRAND.name}`,
    html: renderEmail({
      preheader: "أكّد عنوان بريدك الإلكتروني الجديد.",
      heading: `${greeting}، أكّد بريدك الجديد ✉️`,
      bodyHtml:
        p(`تلقّينا طلباً لتغيير البريد الإلكتروني لحسابك إلى <strong dir="ltr">${esc(args.newEmail)}</strong>.`) +
        p("اضغط الزر أدناه لتأكيد هذا التغيير. لن يُعتمد البريد الجديد قبل التأكيد.") +
        p("إذا لم تطلب هذا التغيير، تجاهل هذه الرسالة وسيبقى بريدك الحالي كما هو.") +
        linkFallback(args.actionUrl),
      cta: { label: "تأكيد البريد الجديد", url: args.actionUrl },
      footnote: LINK_EXPIRY_NOTE,
    }),
  };
}
