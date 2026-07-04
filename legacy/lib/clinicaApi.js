import { supabase } from './supabase';

const BACKEND_URL = import.meta.env.VITE_CLINICA_BACKEND_URL || '';

/**
 * Send a query to the Clinica MCP backend.
 * @param {string} query - The user's message
 * @param {string|null} sessionId - MCP session ID from previous response
 * @returns {Promise<{sessionId?: string, text: string, toolResults?: Array}>}
 */
export async function sendClinicaQuery(query, sessionId = null, userRole = null) {
  const headers = { 'Content-Type': 'application/json' };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // No auth available, continue without token
  }

  let fullQuery = query;
  if (userRole) {
    const roleContext = userRole === 'doctor'
      ? 'CRITICAL SYSTEM INSTRUCTION: You are speaking with a licensed DOCTOR. When the user asks to "add an appointment", "set a time", or "put a schedule", they mean ADDING AVAILABILITY SLOTS for themselves. You MUST ONLY use DOCTOR tools (e.g. add_availability_slots, edit_availability_slot, delete_availability_slot, get_doctor_appointments, update_appointment_status). You are FORBIDDEN from using patient tools like book_appointment or cancel_appointment for their own schedule.'
      : 'CRITICAL SYSTEM INSTRUCTION: You are speaking with a PATIENT. When the user asks to book or cancel an appointment, you MUST ONLY use PATIENT tools (e.g. book_appointment, cancel_appointment, get_my_appointments). You are FORBIDDEN from using doctor tools like add_availability_slots.';
    fullQuery = `[${roleContext}]\n\n${query}`;
  }

  const res = await fetch(`${BACKEND_URL}/clinica/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: fullQuery }),
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}
