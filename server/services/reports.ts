import "server-only";
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

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    totalUsers,
    totalDoctors,
    totalPatients,
    appointmentCounts,
    totalConversations,
  ] = await Promise.all([
    prisma.profile.count(),
    prisma.profile.count({ where: { role: "DOCTOR" } }),
    prisma.profile.count({ where: { role: "PATIENT" } }),
    prisma.appointment.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.conversation.count(),
  ]);

  const countByStatus = Object.fromEntries(
    appointmentCounts.map((r) => [r.status, r._count.status])
  );

  return {
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAppointments: Object.values(countByStatus).reduce((a, b) => a + b, 0),
    pendingAppointments: countByStatus["PENDING"] ?? 0,
    confirmedAppointments: countByStatus["CONFIRMED"] ?? 0,
    cancelledAppointments: countByStatus["CANCELLED"] ?? 0,
    completedAppointments: countByStatus["COMPLETED"] ?? 0,
    totalConversations,
  };
}

export async function getDoctorLoad(): Promise<DoctorLoad[]> {
  const doctors = await prisma.doctor.findMany({
    include: {
      profile: { select: { fullName: true } },
      _count: { select: { appointments: true } },
    },
    orderBy: { appointments: { _count: "desc" } },
    take: 10,
  });

  return doctors.map((d) => ({
    doctorId: d.id,
    doctorName: d.profile.fullName,
    specialty: d.specialty,
    appointmentCount: d._count.appointments,
  }));
}

export async function getRecentActivity(limit = 10): Promise<RecentActivity[]> {
  const [recentAppointments, recentMessages] = await Promise.all([
    prisma.appointment.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { fullName: true } },
        doctor: { select: { profile: { select: { fullName: true } } } },
      },
    }),
    prisma.message.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        conversation: {
          include: { user: { select: { fullName: true } } },
        },
      },
      // Exclude admins'/doctors' own chat with the AI assistant — not a
      // customer contact, shouldn't show up as "activity" to review.
      where: {
        senderType: "USER",
        conversation: {
          OR: [{ userId: null }, { user: { role: "PATIENT" } }],
        },
      },
    }),
  ]);

  const activities: RecentActivity[] = [
    ...recentAppointments.map((a) => ({
      type: "appointment" as const,
      id: a.id,
      label: `${a.patient.fullName} ← ${a.doctor.profile.fullName}`,
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
        (m.conversation.channel === "WEB" ? "زائر" : "غير معروف"),
      subLabel: m.content.slice(0, 60),
      createdAt: m.createdAt,
    })),
  ];

  return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
