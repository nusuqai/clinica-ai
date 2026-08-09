import "server-only";
import { AppointmentStatus, Channel, Role, SenderType } from "@prisma/client";
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
    where: { clinicId, role: { in: [Role.DOCTOR, Role.ADMIN] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getDashboardStats(
  clinicId: string,
): Promise<DashboardStats> {
  const [
    totalUsers,
    totalDoctors,
    totalPatients,
    appointmentCounts,
    totalConversations,
  ] = await Promise.all([
    prisma.clinicMember.count({ where: { clinicId } }),
    prisma.doctor.count({ where: { clinicId } }),
    prisma.clinicMember.count({ where: { clinicId, role: Role.PATIENT } }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { clinicId },
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

export async function getDoctorLoad(clinicId: string): Promise<DoctorLoad[]> {
  const doctors = await prisma.doctor.findMany({
    where: { clinicId },
    select: {
      id: true,
      fullName: true,
      specialty: true,
      _count: { select: { appointments: true } },
    },
    orderBy: { appointments: { _count: "desc" } },
    take: 10,
  });

  return doctors.map((d) => ({
    doctorId: d.id,
    doctorName: d.fullName,
    specialty: d.specialty,
    appointmentCount: d._count.appointments,
  }));
}

export async function getRecentActivity(
  clinicId: string,
  limit = 10,
): Promise<RecentActivity[]> {
  const staffIds = await staffUserIds(clinicId);

  const [recentAppointments, recentMessages] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { fullName: true } },
        doctor: { select: { fullName: true } },
      },
    }),
    prisma.message.findMany({
      take: limit,
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
