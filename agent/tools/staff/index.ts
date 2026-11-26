import "server-only";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "@/agent/types";
import { commonTools } from "../common";
import { serviceTools } from "../services";
import { confirmTools, proposeTool, type StaffToolContext } from "./pending";
import { staffReadTools } from "./reads";
import { STAFF_WRITE_ACTIONS } from "./writes";
import { DOCTOR_WRITE_ACTIONS, doctorReadTools } from "./doctor";
import { exportTools } from "./export";
import {
  OPERATION_WRITE_ACTIONS,
  doctorOperationTools,
  operationReadTools,
} from "./operations";

// Patient-facing info tools the team still needs (dates, doctors, schedules,
// availability for booking, services for the booked items).
const TEAM_INFO_TOOLS = new Set([
  "get_current_datetime",
  "list_doctors",
  "list_specialties",
  "search_doctors_by_specialty",
  "get_doctor_working_hours",
  "get_doctor_availability",
  "list_branches",
  "get_branch_info",
]);

/**
 * The team assistant's tools (#89) — exactly what this member may do. A tool
 * whose permission they lack is never built, so the model can't see it; every
 * tool also re-checks scope at run time.
 */
export function getStaffTools(ctx: AgentContext): DynamicStructuredTool[] {
  if (!ctx.staff || !ctx.actorId) return [];
  const sctx = ctx as StaffToolContext;
  const actor = sctx.staff;

  const isDoctor = actor.role === "DOCTOR";
  const reads = isDoctor
    ? [...doctorReadTools(sctx), ...doctorOperationTools(sctx)]
    : [...staffReadTools(sctx), ...operationReadTools(sctx)];
  const writes = (
    isDoctor ? DOCTOR_WRITE_ACTIONS : [...STAFF_WRITE_ACTIONS, ...OPERATION_WRITE_ACTIONS]
  ).filter((a) => a.allowed(actor));
  const info = commonTools(ctx.clinicId).filter((t) => TEAM_INFO_TOOLS.has(t.name));
  const canBook = writes.some((w) => w.name === "book_appointment_for_patient");

  return [
    ...info,
    ...(canBook ? serviceTools(ctx.clinicId) : []),
    ...reads,
    ...exportTools(sctx),
    ...writes.map((w) => proposeTool(sctx, w)),
    ...(writes.length ? confirmTools(sctx, writes) : []),
  ];
}
