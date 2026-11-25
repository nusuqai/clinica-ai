import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as Catalog from "@/server/services/catalog";
import * as Packages from "@/server/services/packages";
import { listCategories } from "@/server/services/catalog";
import { SERVICE_KIND_LABEL, durationText, servicePriceText, tierRangeLabel } from "@/lib/catalog";
import { creditLineText } from "@/lib/packages";
import { practitionerName, doctorSexLabel, doctorTitleLabel } from "@/lib/doctor-title";
import { formatFee } from "@/lib/currency";
import { askForFilter, jsonTool, shouldAskForFilter, showAllField } from "./shared";

// The service catalog for the agent (every caller): what the clinic offers,
// at what price in which branch, with which live offer, who provides it, and
// the prepaid packages for sale. Design: docs/services-and-packages.md §5.

const SERVICES_LIMIT = 30;

/** Agent-facing shape of one service (with its live offer, priced for the branch). */
function serviceForAgent(s: Catalog.PublicService, opts: { withNotes: boolean }) {
  // A service priced per practitioner (no base price) — e.g. the كشف migrated
  // from each doctor's old fee: the price comes from list_service_providers.
  const perProvider =
    s.price == null && (s.pricingType === "FIXED" || s.pricingType === "PER_UNIT" || s.pricingType === "STARTING_FROM");
  const priceText = perProvider
    ? "يختلف حسب مقدم الخدمة (السعر في list_service_providers)"
    : servicePriceText(s);
  return {
    id: s.id,
    name: s.name,
    category: s.categoryName,
    categoryId: s.categoryId,
    kind: SERVICE_KIND_LABEL[s.kind],
    price: priceText,
    // When the offer changes the price, both are given so the agent can show
    // the original struck through.
    offer: s.offer
      ? {
          label: s.offer.label,
          priceAfterOffer:
            s.offer.price != null
              ? s.pricingType === "PER_UNIT"
                ? `${formatFee(s.offer.price)} / ${s.unitLabel ?? "وحدة"}`
                : formatFee(s.offer.price)
              : null,
          endsOn: s.offer.endsAt,
        }
      : null,
    unit: s.unitLabel,
    duration: durationText(s.durationMin),
    bookable: s.bookable,
    description: s.description,
    ...(opts.withNotes
      ? {
          tiers: s.tiers.length
            ? s.tiers.map((t) => `${tierRangeLabel(t)}: ${formatFee(t.price)}`)
            : undefined,
          branches: s.branches.map((b) => ({
            branchId: b.id,
            branch: b.name,
            price: b.price != null ? formatFee(b.price) : null,
          })),
          prepInstructions: s.prepInstructions,
          // Internal guidance from the clinic — follow it, never quote it.
          agentNotes: s.agentNotes,
        }
      : { branches: s.branches.map((b) => b.name) }),
    providers: s.providerCount,
  };
}

export function serviceTools(clinicId: string): DynamicStructuredTool[] {
  /**
   * What the patient could get instead of paying the plain price for one
   * service in one branch: its live offer and the packages for sale there that
   * cover it (by its category or by the service itself). Attached to
   * list_service_providers — the call the agent always makes once the patient
   * has picked a service — so the agent sees them before booking.
   */
  async function savingsFor(serviceId: string, branchId: string) {
    const [[service], packages] = await Promise.all([
      Catalog.listPublicServices(clinicId, { ids: [serviceId], branchId }),
      Packages.listPackages(clinicId, null),
    ]);
    if (!service) return null;
    const covering = packages.filter(
      (p) =>
        p.isActive &&
        (p.allBranches || p.branches.some((b) => b.branchId === branchId)) &&
        p.items.some(
          (i) => i.categoryId === service.categoryId || i.serviceIds.includes(serviceId)
        )
    );
    const packagesForSale = [];
    for (const p of covering) {
      const quote = await Packages.quotePackage(clinicId, p.id, branchId);
      packagesForSale.push({
        packageId: p.id,
        name: p.name,
        price: formatFee(quote.ok ? quote.data.basePrice : p.price),
        priceAfterOffer:
          quote.ok && quote.data.offerLabel ? formatFee(quote.data.price) : null,
        offer: quote.ok ? quote.data.offerLabel || null : null,
        validityDays: p.validityDays,
      });
    }
    const offer = serviceForAgent(service, { withNotes: false }).offer;
    if (!offer && packagesForSale.length === 0) return null;
    return { serviceOffer: offer, packagesForSale };
  }

  /**
   * Prices, offers and packages differ per branch, so nothing is quoted without
   * one. A given branch is checked; with none, a one-branch clinic uses it, and
   * a multi-branch clinic gets back the branches to ask the patient about.
   */
  async function resolveBranch(
    branchId: string | null | undefined
  ): Promise<{ branchId: string } | { ask: ReturnType<typeof askForFilter> & { needsBranch: true } } | { error: string }> {
    const branches = await prisma.branch.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, name: true, address: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
    if (branchId) {
      return branches.some((b) => b.id === branchId)
        ? { branchId }
        : { error: "الفرع غير موجود — استخدم list_branches لمعرفة الفروع" };
    }
    if (branches.length === 1) return { branchId: branches[0].id };
    return {
      ask: {
        ...askForFilter(
          branches.length,
          "في أي فرع؟ الأسعار والعروض والباقات تختلف من فرع لآخر.",
          branches.map((b) => ({ label: b.name, args: { branchId: b.id } }))
        ),
        needsBranch: true,
      },
    };
  }

  return [
    jsonTool(
      {
        name: "search_services",
        description:
          "ابحث في خدمات العيادة (كشف، جلسات، إجراءات، تحاليل…) بالاسم أو الوصف أو التصنيف، مع سعرها في الفرع والعرض الساري فيه. استخدمها كلما ذكر المستخدم خدمة أو سأل عن سعر أو «عندكم إيه في …». مرّر branchId دائماً: الأسعار والعروض والخدمات المتاحة تختلف من فرع لآخر. إن لم تعرف الفرع فاستدعها بدونه وستعيد needsBranch=true مع الفروع كخيارات — اسأل المريض عن فرعه ثم أعد الطلب. عند طلب عام بلا بحث تُعيد التصنيفات كخيارات.",
        schema: z.object({
          query: z
            .string()
            .nullable()
            .describe(
              "اسم الخدمة أو جزء منه أو اسم التصنيف (اختياري). قد تكون أسماء الخدمات والتصنيفات بالإنجليزية (مثل Laser، Botox، Filler، Half Legs)؛ إن لم تجد نتيجة بالكلمة العربية فأعد البحث بمقابلها الإنجليزي"
            ),
          categoryId: z.string().nullable().describe("معرّف التصنيف (اختياري)"),
          branchId: z.string().nullable().describe("معرّف الفرع من list_branches (اختياري)"),
          showAll: showAllField,
        }),
      },
      async (input) => {
        const branch = await resolveBranch(input.branchId);
        if ("ask" in branch) return branch.ask;
        if ("error" in branch) return branch;
        const services = await Catalog.listPublicServices(clinicId, {
          query: input.query,
          categoryId: input.categoryId,
          branchId: branch.branchId,
        });
        const filtered = !!(input.query?.trim() || input.categoryId);
        if (shouldAskForFilter(filtered, input, services.length) && services.length > 12) {
          const categories = await listCategories(clinicId);
          return askForFilter(
            services.length,
            "أي نوع من الخدمات تبحث عنه؟",
            categories
              .filter((c) => c.isActive && services.some((s) => s.categoryId === c.id))
              .map((c) => ({
                label: c.name,
                args: { categoryId: c.id, branchId: branch.branchId },
                count: services.filter((s) => s.categoryId === c.id).length,
              }))
          );
        }
        return {
          branchId: branch.branchId,
          total: services.length,
          services: services
            .slice(0, SERVICES_LIMIT)
            .map((s) => serviceForAgent(s, { withNotes: false })),
          ...(services.length > SERVICES_LIMIT && {
            note: "النتائج كثيرة — اطلب من المستخدم تحديد الخدمة أو التصنيف.",
          }),
        };
      }
    ),
    jsonTool(
      {
        name: "get_service",
        description:
          "تفاصيل خدمة واحدة: السعر في كل فرع، شرائح الأسعار، العرض الساري، المدة، تعليمات قبل/بعد الزيارة، وملاحظات داخلية من العيادة لك (agentNotes: اتبعها ولا تقتبسها للمريض).",
        schema: z.object({
          serviceId: z.string(),
          branchId: z
            .string()
            .nullable()
            .describe("الفرع: السعر والعرض يختلفان من فرع لآخر (بدونه تُعاد الفروع لتسأل المريض)"),
        }),
      },
      async ({ serviceId, branchId: given }) => {
        const branch = await resolveBranch(given);
        if ("ask" in branch) return branch.ask;
        if ("error" in branch) return branch;
        const branchId = branch.branchId;
        const [s] = await Catalog.listPublicServices(clinicId, { ids: [serviceId], branchId });
        if (!s) return { error: "الخدمة غير موجودة أو غير متاحة في هذا الفرع" };
        return serviceForAgent(s, { withNotes: true });
      }
    ),
    jsonTool(
      {
        name: "list_service_providers",
        description:
          "من يقدّم خدمة معيّنة من الفريق الطبي (أطباء، أخصائيون، فنيون، تمريض) وفي أي فروع، مع السعر الخاص بكل منهم إن اختلف. استخدمها بعد اختيار الخدمة لعرض الخيارات أو اقتراح «أول موعد متاح»، أو للتأكد أن طبيباً بعينه يقدّمها. مرّر branchId: تُعيد أيضاً savings = عرض الخدمة الساري والباقات المعروضة للبيع في الفرع التي تشمل هذه الخدمة (إن وُجدت).",
        schema: z.object({
          serviceId: z.string(),
          branchId: z.string().nullable().describe("فقط من يعمل في هذا الفرع (اختياري)"),
        }),
      },
      async ({ serviceId, branchId }) => {
        const providers = await Catalog.listServiceProviders(clinicId, serviceId, branchId);
        if (!providers) return { error: "الخدمة غير موجودة" };
        const savings = branchId ? await savingsFor(serviceId, branchId).catch(() => null) : null;
        return {
          serviceId,
          ...(savings && { savings }),
          providers: providers.map((p) => ({
            doctorId: p.doctorId,
            name: practitionerName(p.fullName, p.title),
            title: doctorTitleLabel(p.title, p.sex),
            sex: doctorSexLabel(p.sex),
            specialty: p.specialty,
            // null = the service's own price (search_services / get_service).
            price: p.priceOverride != null ? formatFee(p.priceOverride) : null,
            duration: durationText(p.durationMin),
            branches: p.branches.map((b) => ({ branchId: b.id, branch: b.name })),
          })),
        };
      }
    ),
    jsonTool(
      {
        name: "list_packages",
        description:
          "الباقات المدفوعة مقدماً المتاحة للشراء في فرع (مثل عدد نبضات أو جلسات بصلاحية محددة)، مع ما تشمله وسعرها في ذلك الفرع والعرض الساري والشروط. الباقة تُستخدم فقط في الفرع الذي تُشترى منه، وأسعارها وعروضها تختلف من فرع لآخر — مرّر branchId دائماً (بدونه تُعاد الفروع لتسأل المريض). اعرض الشروط (terms) قبل أن يطلب المريض شراء باقة.",
        schema: z.object({
          categoryId: z.string().nullable().describe("تصنيف الخدمات (اختياري)"),
          branchId: z.string().nullable().describe("الفرع الذي سيشتري منه ويستخدم فيه الباقة"),
        }),
      },
      async ({ categoryId, branchId: given }) => {
        const branch = await resolveBranch(given);
        if ("ask" in branch) return branch.ask;
        if ("error" in branch) return branch;
        const branchId = branch.branchId;
        const [packages, categories, services] = await Promise.all([
          Packages.listPackages(clinicId, null),
          listCategories(clinicId),
          prisma.service.findMany({ where: { clinicId }, select: { id: true, name: true } }),
        ]);
        const catName = new Map(categories.map((c) => [c.id, c.name]));
        const svcName = new Map(services.map((s) => [s.id, s.name]));
        const visible = packages.filter(
          (p) =>
            p.isActive &&
            (!categoryId || p.categoryId === categoryId) &&
            (!branchId || p.allBranches || p.branches.some((b) => b.branchId === branchId))
        );
        const out = [];
        for (const p of visible) {
          const quote = branchId ? await Packages.quotePackage(clinicId, p.id, branchId) : null;
          out.push({
            packageId: p.id,
            name: p.name,
            category: catName.get(p.categoryId) ?? null,
            includes: p.items.map((i) =>
              creditLineText(i, { category: (id) => catName.get(id), service: (id) => svcName.get(id) })
            ),
            price: formatFee(quote?.ok ? quote.data.basePrice : p.price),
            offer:
              quote?.ok && quote.data.offerLabel
                ? {
                    label: quote.data.offerLabel,
                    priceAfterOffer: formatFee(quote.data.price),
                    bonusUnits: quote.data.bonusUnits || undefined,
                  }
                : null,
            validityDays: p.validityDays,
            branches: p.allBranches ? "كل الفروع" : undefined,
            description: p.description,
            terms: p.terms,
            agentNotes: p.agentNotes,
          });
        }
        return { total: out.length, packages: out };
      }
    ),
  ];
}
