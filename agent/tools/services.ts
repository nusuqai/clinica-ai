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
    // Operations are never booked here: the patient asks, the team arranges it.
    ...(s.kind === "OPERATION" && {
      operation: true,
      howToGetIt:
        "عملية: لا تُحجز عبر المساعد. سجّل طلب المريض بـ request_operation وسيتواصل معه فريق العيادة لتجهيزها وتحديد موعدها.",
    }),
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
    // Needs an exam first; the practitioner decides at the visit. Booking adds
    // the exam automatically unless the patient still holds a valid approval.
    requiresPreCheck: s.preCheck
      ? {
          preCheckService: s.preCheck.serviceName,
          approvalValidDays: s.preCheck.validityDays,
          preCheckFreeIfDone: s.preCheck.feeDeducted,
        }
      : undefined,
  };
}

export function serviceTools(clinicId: string): DynamicStructuredTool[] {
  /** Active packages for sale in `branchId` that cover `service` (by its category or the service itself). */
  function packagesCovering(
    packages: Packages.PackageView[],
    service: { id: string; categoryId: string },
    branchId: string
  ) {
    return packages.filter(
      (p) =>
        p.isActive &&
        (p.allBranches || p.branches.some((b) => b.branchId === branchId)) &&
        p.items.some((i) => i.categoryId === service.categoryId || i.serviceIds.includes(service.id))
    );
  }

  /**
   * The light marker put on every service the agent sees: only whether a live
   * offer and/or packages for sale exist for it in this branch — no details.
   * The agent mentions them and calls get_service_savings only if the patient
   * wants to hear more. Omitted (undefined) when there is nothing.
   */
  function savingsFlag(
    service: Catalog.PublicService,
    packages: Packages.PackageView[],
    branchId: string
  ) {
    const hasOffer = !!service.offer;
    const hasPackages = packagesCovering(packages, service, branchId).length > 0;
    return hasOffer || hasPackages ? { hasOffer, hasPackages } : undefined;
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
        const packages = await Packages.listPackages(clinicId, null);
        return {
          branchId: branch.branchId,
          total: services.length,
          services: services.slice(0, SERVICES_LIMIT).map((s) => ({
            ...serviceForAgent(s, { withNotes: false }),
            savingsAvailable: savingsFlag(s, packages, branch.branchId),
          })),
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
        const packages = await Packages.listPackages(clinicId, null);
        return {
          ...serviceForAgent(s, { withNotes: true }),
          savingsAvailable: savingsFlag(s, packages, branchId),
        };
      }
    ),
    jsonTool(
      {
        name: "list_service_providers",
        description:
          "من يقدّم خدمة معيّنة من الفريق الطبي (أطباء، أخصائيون، فنيون، تمريض) وفي أي فروع، مع السعر الخاص بكل منهم إن اختلف. استخدمها بعد اختيار الخدمة لعرض الخيارات أو اقتراح «أول موعد متاح»، أو للتأكد أن طبيباً بعينه يقدّمها. مرّر branchId لتعرف أيضاً savingsAvailable (هل يوجد عرض أو باقات لهذه الخدمة في الفرع).",
        schema: z.object({
          serviceId: z.string(),
          branchId: z.string().nullable().describe("فقط من يعمل في هذا الفرع (اختياري)"),
        }),
      },
      async ({ serviceId, branchId }) => {
        const providers = await Catalog.listServiceProviders(clinicId, serviceId, branchId);
        if (!providers) return { error: "الخدمة غير موجودة" };
        let savingsAvailable: ReturnType<typeof savingsFlag>;
        if (branchId) {
          const [[service], packages] = await Promise.all([
            Catalog.listPublicServices(clinicId, { ids: [serviceId], branchId }),
            Packages.listPackages(clinicId, null),
          ]);
          if (service) savingsAvailable = savingsFlag(service, packages, branchId);
        }
        return {
          serviceId,
          savingsAvailable,
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
        name: "get_service_savings",
        description:
          "تفاصيل العرض الساري والباقات المعروضة للبيع التي تشمل خدمة معيّنة في فرع: الاسم والسعر والسعر بعد العرض والصلاحية والشروط. استدعها فقط عندما يريد المريض معرفة العروض أو الباقات لخدمة اختارها (أي خدمة لديها savingsAvailable).",
        schema: z.object({
          serviceId: z.string(),
          branchId: z.string().nullable().describe("الفرع: العروض والباقات تختلف من فرع لآخر"),
        }),
      },
      async ({ serviceId, branchId: given }) => {
        const branch = await resolveBranch(given);
        if ("ask" in branch) return branch.ask;
        if ("error" in branch) return branch;
        const branchId = branch.branchId;
        const [[service], packages] = await Promise.all([
          Catalog.listPublicServices(clinicId, { ids: [serviceId], branchId }),
          Packages.listPackages(clinicId, null),
        ]);
        if (!service) return { error: "الخدمة غير موجودة أو غير متاحة في هذا الفرع" };
        const out = [];
        for (const p of packagesCovering(packages, service, branchId)) {
          const quote = await Packages.quotePackage(clinicId, p.id, branchId);
          out.push({
            packageId: p.id,
            name: p.name,
            price: formatFee(quote.ok ? quote.data.basePrice : p.price),
            offer:
              quote.ok && quote.data.offerLabel
                ? {
                    label: quote.data.offerLabel,
                    priceAfterOffer: formatFee(quote.data.price),
                    bonusUnits: quote.data.bonusUnits || undefined,
                  }
                : null,
            validityDays: p.validityDays,
            description: p.description,
            terms: p.terms,
            agentNotes: p.agentNotes,
          });
        }
        return {
          service: service.name,
          branchId,
          serviceOffer: serviceForAgent(service, { withNotes: false }).offer,
          packages: out,
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
