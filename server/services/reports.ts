import "server-only";
import { AppointmentStatus, Channel, Role, SenderType } from "@prisma/client";
import { branchIdFilter, doctorBranchFilter, type BranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  totalDoctors: number;
  totalPatients: number;
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  cancelledAppointments: number;
  completedAppointments: number;
  totalConversations: number;
}

export interface DoctorLoad {
  doctorId: string;
  doctorName: string;
  specialty: string;
  appointmentCount: number;
}

export interface RecentActivity {
  type: "appointment" | "message";
  id: string;
  label: string;
  subLabel: string;
  status?: string;
  createdAt: Date;
}

// User ids that are staff (DOCTOR/ADMIN) of this clinic — their own AI chats are
// not customer contacts and are excluded from customer-facing activity/inbox.
async function staffUserIds(clinicId: string): Promise<string[]> {
  const rows = await prisma.clinicMember.findMany({
    where: { clinicId, role: { in: [Role.DOCTOR, Role.ADMIN, Role.STAFF] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Headline numbers. With a limited `branchScope` only the branch-carrying ones
 * are narrowed — doctors (who work at those branches) and appointments. Members,
 * patients and conversations have no branch, so they stay clinic-wide totals;
 * the pages leave those tiles out for a branch-limited member.
 */
export async function getDashboardStats(
  clinicId: string,
  branchScope: BranchScope = null
): Promise<DashboardStats> {
  const [totalUsers, totalDoctors, totalPatients, appointmentCounts, totalConversations] =
    await Promise.all([
      prisma.clinicMember.count({ where: { clinicId } }),
      prisma.doctor.count({ where: { clinicId, ...doctorBranchFilter(branchScope) } }),
      prisma.clinicMember.count({ where: { clinicId, role: Role.PATIENT } }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: { clinicId, ...branchIdFilter(branchScope) },
        _count: { status: true },
      }),
      prisma.conversation.count({ where: { clinicId } }),
    ]);

  const countByStatus = Object.fromEntries(
    appointmentCounts.map((r) => [r.status, r._count.status])
  );

  return {
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAppointments: Object.values(countByStatus).reduce((a, b) => a + b, 0),
    pendingAppointments: countByStatus[AppointmentStatus.PENDING] ?? 0,
    confirmedAppointments: countByStatus[AppointmentStatus.CONFIRMED] ?? 0,
    cancelledAppointments: countByStatus[AppointmentStatus.CANCELLED] ?? 0,
    completedAppointments: countByStatus[AppointmentStatus.COMPLETED] ?? 0,
    totalConversations,
  };
}

export async function getDoctorLoad(
  clinicId: string,
  branchScope: BranchScope = null
): Promise<DoctorLoad[]> {
  const doctors = await prisma.doctor.findMany({
    where: { clinicId, ...doctorBranchFilter(branchScope) },
    select: {
      id: true,
      fullName: true,
      specialty: { select: { name: true } },
      // Counted (and so ranked) within the scope's branches only.
      _count: { select: { appointments: { where: branchIdFilter(branchScope) } } },
    },
    orderBy: { appointments: { _count: "desc" } },
    take: 10,
  });

  return doctors.map((d) => ({
    doctorId: d.id,
    doctorName: d.fullName,
    specialty: d.specialty?.name ?? "",
    appointmentCount: d._count.appointments,
  }));
}

export async function getRecentActivity(
  clinicId: string,
  limit = 10,
  opts: {
    branchScope?: BranchScope;
    /** Messages have no branch; pass false to leave them out. */
    includeMessages?: boolean;
  } = {}
): Promise<RecentActivity[]> {
  const includeMessages = opts.includeMessages ?? true;
  const staffIds = includeMessages ? await staffUserIds(clinicId) : [];

  const [recentAppointments, recentMessages] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId, ...branchIdFilter(opts.branchScope) },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { fullName: true } },
        doctor: { select: { fullName: true } },
      },
    }),
    prisma.message.findMany({
      take: includeMessages ? limit : 0,
      orderBy: { createdAt: "desc" },
      include: {
        conversation: {
          select: {
            channel: true,
            whatsappName: true,
            whatsappPhone: true,
            user: { select: { fullName: true } },
          },
        },
      },
      // Exclude staff members' own chat with the AI assistant — not a customer
      // contact, shouldn't show up as "activity" to review.
      where: {
        senderType: SenderType.USER,
        conversation: {
          clinicId,
          OR: [{ userId: null }, { userId: { notIn: staffIds } }],
        },
      },
    }),
  ]);

  const activities: RecentActivity[] = [
    ...recentAppointments.map((a) => ({
      type: "appointment" as const,
      id: a.id,
      label: `${a.patient.fullName} ← ${a.doctor.fullName}`,
      subLabel: a.createdAt.toLocaleDateString("ar-EG"),
      status: a.status,
      createdAt: a.createdAt,
    })),
    ...recentMessages.map((m) => ({
      type: "message" as const,
      id: m.id,
      label:
        m.conversation.user?.fullName ??
        m.conversation.whatsappName ??
        m.conversation.whatsappPhone ??
        (m.conversation.channel === Channel.WEB ? "زائر" : "غير معروف"),
      subLabel: m.content.slice(0, 60),
      createdAt: m.createdAt,
    })),
  ];

  return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

// ─── Services, packages & offers ──────────────────────────────────────────────

export interface CatalogReport {
  windowDays: number;
  /** Revenue of completed visits (final totals), paid normally. */
  servicesRevenue: number;
  completedVisits: number;
  topServices: { name: string; count: number; revenue: number }[];
  packagesSold: number;
  packagesRevenue: number;
  packagesUnpaid: number;
  topPackages: { name: string; count: number; revenue: number }[];
  /** Units / sessions consumed from packages. */
  unitsConsumed: number;
  sessionsConsumed: number;
  /** Used beyond a package balance (recorded, not charged). */
  uncoveredUnits: number;
  offers: { name: string; uses: number; discount: number }[];
}

/**
 * The catalog's money and usage over the last `windowDays`, branch-scoped like
 * the rest of the reports (a limited member sees their branches only).
 */
export async function getCatalogReport(
  clinicId: string,
  scope: BranchScope,
  windowDays = 30
): Promise<CatalogReport> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const branch = branchIdFilter(scope);
  const [lines, sold, ledger, uncovered] = await Promise.all([
    prisma.appointmentItem.findMany({
      where: {
        clinicId,
        appointment: { status: "COMPLETED", completedAt: { gte: since }, ...branch },
      },
      select: {
        appointmentId: true,
        serviceName: true,
        finalTotal: true,
        total: true,
        discount: true,
        patientPackageId: true,
        offer: { select: { name: true } },
      },
    }),
    prisma.patientPackage.findMany({
      where: { clinicId, source: "PURCHASE", purchasedAt: { gte: since }, ...branch },
      select: {
        name: true,
        pricePaid: true,
        paymentStatus: true,
        status: true,
        offer: { select: { name: true } },
        basePrice: true,
      },
    }),
    prisma.packageLedger.findMany({
      where: {
        clinicId,
        type: "CONSUME",
        createdAt: { gte: since },
        balance: { patientPackage: branch },
      },
      select: { quantity: true, balance: { select: { creditType: true } } },
    }),
    prisma.appointmentItem.aggregate({
      where: {
        clinicId,
        uncoveredQuantity: { not: null },
        appointment: { completedAt: { gte: since }, ...branch },
      },
      _sum: { uncoveredQuantity: true },
    }),
  ]);

  const num = (v: unknown) => (v == null ? 0 : Number(v));
  const byService = new Map<string, { count: number; revenue: number }>();
  let servicesRevenue = 0;
  for (const l of lines) {
    const revenue = l.patientPackageId ? 0 : num(l.finalTotal ?? l.total);
    servicesRevenue += revenue;
    const cur = byService.get(l.serviceName) ?? { count: 0, revenue: 0 };
    byService.set(l.serviceName, { count: cur.count + 1, revenue: cur.revenue + revenue });
  }
  const live = sold.filter((p) => p.status !== "CANCELLED");
  const byPackage = new Map<string, { count: number; revenue: number }>();
  for (const p of live) {
    const cur = byPackage.get(p.name) ?? { count: 0, revenue: 0 };
    byPackage.set(p.name, { count: cur.count + 1, revenue: cur.revenue + num(p.pricePaid) });
  }
  const offers = new Map<string, { uses: number; discount: number }>();
  for (const l of lines.filter((x) => x.offer)) {
    const cur = offers.get(l.offer!.name) ?? { uses: 0, discount: 0 };
    offers.set(l.offer!.name, { uses: cur.uses + 1, discount: cur.discount + num(l.discount) });
  }
  for (const p of live.filter((x) => x.offer)) {
    const cur = offers.get(p.offer!.name) ?? { uses: 0, discount: 0 };
    offers.set(p.offer!.name, {
      uses: cur.uses + 1,
      discount: cur.discount + Math.max(0, num(p.basePrice) - num(p.pricePaid)),
    });
  }
  const top = <T extends { revenue: number; count: number }>(m: Map<string, T>) =>
    [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 8);

  return {
    windowDays,
    servicesRevenue: Math.round(servicesRevenue * 100) / 100,
    completedVisits: new Set(lines.map((l) => l.appointmentId)).size,
    topServices: top(byService),
    packagesSold: live.length,
    packagesRevenue: Math.round(live.reduce((s, p) => s + num(p.pricePaid), 0) * 100) / 100,
    packagesUnpaid: live.filter((p) => p.paymentStatus === "UNPAID").length,
    topPackages: top(byPackage),
    unitsConsumed: ledger
      .filter((l) => l.balance.creditType === "UNITS")
      .reduce((s, l) => s - l.quantity, 0),
    sessionsConsumed: ledger
      .filter((l) => l.balance.creditType === "SESSIONS")
      .reduce((s, l) => s - l.quantity, 0),
    uncoveredUnits: uncovered._sum.uncoveredQuantity ?? 0,
    offers: [...offers.entries()]
      .map(([name, v]) => ({ name, uses: v.uses, discount: Math.round(v.discount * 100) / 100 }))
      .sort((a, b) => b.uses - a.uses),
  };
}
