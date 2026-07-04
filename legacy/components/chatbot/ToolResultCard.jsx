import React, { useState } from 'react';
import { Star, Calendar, Clock, User, CheckCircle2, XCircle, Activity, Sparkles, ChevronDown, Briefcase, Users, Stethoscope, Phone, Mail, Heart, Droplets, FileText, ArrowRight, CalendarCheck, AlertCircle } from 'lucide-react';

/**
 * Renders rich UI for a single tool result based on toolName.
 */
export default function ToolResultCard({ toolName, data, onFillInput }) {
  if (!data) return null;

  switch (toolName) {
    case 'search_doctors':
    case 'list_doctors':
      return <DoctorList doctors={Array.isArray(data) ? data : (data.doctors || [])} onFillInput={onFillInput} />;

    case 'get_doctor':
      return <DoctorProfile doctor={data} />;

    case 'get_available_slots':
      return <SlotGrid slots={Array.isArray(data) ? data : (data.slots || [])} onFillInput={onFillInput} />;

    case 'get_doctor_available_days':
      return <DoctorDaysCard data={data} onFillInput={onFillInput} />;

    case 'book_appointment':
      return <ConfirmationCard type="booked" data={data} />;

    case 'cancel_appointment':
      return <ConfirmationCard type="cancelled" data={data} />;

    case 'get_my_appointments':
      return <AppointmentList appointments={Array.isArray(data) ? data : (data.appointments || [])} />;

    case 'get_my_medical_history':
      return <MedicalHistoryList records={Array.isArray(data) ? data : (data.records || [])} />;

    case 'get_my_doctor_suggestions':
      return <SuggestionList suggestions={Array.isArray(data) ? data : (data.suggestions || [])} />;

    case 'get_my_profile':
    case 'lookup_user':
      return <UserProfileCard user={data} />;

    case 'register_user':
      return <ConfirmationCard type="registered" data={data} />;

    // ─── Doctor Tools ───
    case 'get_doctor_appointments':
      return <DoctorAppointmentList appointments={Array.isArray(data) ? data : (data.appointments || [])} filterDate={data?.filter_date} />;

    case 'update_appointment_status':
      return <AppointmentStatusCard data={data} />;

    case 'get_patient_appointment_history':
      return <PatientHistoryCard data={data} />;

    case 'get_doctor_patients':
      return <DoctorPatientList patients={Array.isArray(data) ? data : (data.patients || [])} onFillInput={onFillInput} />;

    default:
      return <FallbackCard toolName={toolName} data={data} />;
  }
}

// ─── Doctor Avatar ───
function DoctorAvatar({ doc, size = 'sm' }) {
  const [imgError, setImgError] = useState(false);
  const sizes = size === 'lg'
    ? 'w-14 h-14 rounded-2xl text-lg'
    : 'w-10 h-10 rounded-xl text-sm';

  if (doc.photo_url && !imgError) {
    return (
      <img
        src={doc.photo_url}
        alt={doc.full_name}
        onError={() => setImgError(true)}
        className={`${sizes} object-cover shrink-0`}
      />
    );
  }

  return (
    <div className={`${sizes} bg-accent/10 flex items-center justify-center text-accent font-bold shrink-0`}>
      {doc.full_name?.charAt(0) || '?'}
    </div>
  );
}

// ─── Doctor List ───
function DoctorList({ doctors, onFillInput }) {
  if (!doctors.length) return <EmptyState text="لم يتم العثور على أطباء" />;
  const unique = doctors.filter((doc, i, arr) => doc.id ? arr.findIndex(d => d.id === doc.id) === i : true);
  return (
    <div className="space-y-2">
      {unique.slice(0, 5).map((doc, i) => (
        <DoctorListItem key={doc.id || i} doc={doc} onFillInput={onFillInput} />
      ))}
      {doctors.length > 5 && (
        <p className="text-xs text-text/40 text-center font-sans">+{doctors.length - 5} المزيد</p>
      )}
    </div>
  );
}

function DoctorListItem({ doc, onFillInput }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/60 rounded-xl border border-primary/5 overflow-hidden transition-colors hover:border-accent/30">
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/5 transition-colors"
        onClick={() => onFillInput?.(`اعرض مواعيد الدكتور ${doc.full_name}`)}
      >
        <DoctorAvatar doc={doc} />
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-sm text-primary truncate">{doc.full_name_ar || doc.full_name}</p>
          <p className="text-xs font-sans text-text/50">{doc.specialty_ar || doc.specialty}</p>
        </div>
        {doc.rating && (
          <div className="flex items-center gap-1 text-xs shrink-0">
            <Star size={12} className="fill-accent text-accent" />
            <span className="font-bold text-primary">{doc.rating}</span>
          </div>
        )}
        {/* Profile expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-text/40 hover:bg-accent/10 hover:text-accent transition-all shrink-0 ${expanded ? 'bg-accent/10 text-accent rotate-180' : ''}`}
          title="عرض الملف الشخصي"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Expanded profile */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-primary/5 space-y-2 animate-in slide-in-from-top-1">
          {doc.bio && <p className="text-xs font-sans text-text/60 leading-relaxed pt-2">{doc.bio_ar || doc.bio}</p>}
          <div className="flex flex-wrap gap-3 text-[11px] font-sans text-text/50">
            {doc.years_experience && (
              <span className="flex items-center gap-1">
                <Briefcase size={11} className="text-accent" /> {doc.years_experience} سنة خبرة
              </span>
            )}
            {doc.patients_count && (
              <span className="flex items-center gap-1">
                <Users size={11} className="text-accent" /> {doc.patients_count} مريض
              </span>
            )}
            {doc.education && (
              <span className="flex items-center gap-1 text-text/40">
                {doc.education}
              </span>
            )}
          </div>
          {doc.availability_note && (
            <p className="text-[11px] font-sans text-accent flex items-center gap-1">
              <Clock size={11} /> {doc.availability_note_ar || doc.availability_note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Doctor Profile ───
function DoctorProfile({ doctor }) {
  if (!doctor) return null;
  return (
    <div className="bg-white/60 rounded-xl p-4 border border-primary/5 space-y-2">
      <div className="flex items-center gap-3">
        <DoctorAvatar doc={doctor} size="lg" />
        <div>
          <p className="font-heading font-bold text-primary">{doctor.full_name_ar || doctor.full_name}</p>
          <p className="text-xs font-sans text-text/50">{doctor.specialty_ar || doctor.specialty}</p>
        </div>
      </div>
      {doctor.bio && <p className="text-xs font-sans text-text/60 leading-relaxed">{doctor.bio_ar || doctor.bio}</p>}
      <div className="flex flex-wrap gap-3 text-xs font-sans text-text/50">
        {doctor.rating && (
          <span className="flex items-center gap-1">
            <Star size={12} className="fill-accent text-accent" /> {doctor.rating}
          </span>
        )}
        {doctor.years_experience && (
          <span className="flex items-center gap-1">
            <Briefcase size={12} className="text-accent" /> {doctor.years_experience} سنة خبرة
          </span>
        )}
        {doctor.patients_count && (
          <span className="flex items-center gap-1">
            <Users size={12} className="text-accent" /> {doctor.patients_count} مريض
          </span>
        )}
        {doctor.availability_note && (
          <span className="flex items-center gap-1">
            <Clock size={12} className="text-accent" /> {doctor.availability_note_ar || doctor.availability_note}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Slot Grid ───
function SlotGrid({ slots, onFillInput }) {
  if (!slots.length) return <EmptyState text="Preview is not available right now" />;

  // Try common field names for the time value
  const getStartDate = (slot) => {
    const raw = slot.starts_at || slot.start_time || slot.time || slot.date || slot.start || slot.starts_at_display;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  // Filter to only valid dates
  const validSlots = slots.filter(s => getStartDate(s) !== null);
  if (!validSlots.length) return <EmptyState text="Preview is not available right now" />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {validSlots.slice(0, 12).map((slot, i) => {
          const start = getStartDate(slot);
          const fillText = `احجز موعد يوم ${start.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })} الساعة ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
          return (
            <div
              key={slot.id || i}
              onClick={() => onFillInput?.(fillText)}
              className="bg-white/60 border border-primary/10 rounded-lg px-3 py-2 text-xs font-sans cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors"
              dir="ltr"
            >
              <span className="font-bold text-primary">{start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              <span className="text-text/40 block">{start.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>
            </div>
          );
        })}
      </div>
      {validSlots.length > 12 && (
        <p className="text-xs text-text/40 text-center font-sans">+{validSlots.length - 12} موعد آخر</p>
      )}
    </div>
  );
}

// ─── Doctor Available Days ───
function DoctorDaysCard({ data, onFillInput }) {
  const days = data?.days || [];
  if (!days.length) return <EmptyState text="لا توجد أيام متاحة حاليا" />;

  const doctorName = data?.doctor_name_ar || data?.doctor_name || 'الطبيب';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {days.slice(0, 14).map((day, i) => {
          const dateObj = new Date(day.date + 'T00:00:00');
          const dayNum = dateObj.getDate();
          const monthShort = dateObj.toLocaleDateString('ar-EG', { month: 'short' });
          const weekday = day.day_name_ar?.split('،')[0] || dateObj.toLocaleDateString('ar-EG', { weekday: 'short' });

          return (
            <div
              key={day.date || i}
              onClick={() => onFillInput?.(`اعرض مواعيد ${doctorName} يوم ${day.day_name_ar || day.day_name}`)}
              className="bg-white/60 border border-primary/10 rounded-xl px-3 py-2.5 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors min-w-[70px]"
            >
              <span className="text-[10px] text-text/40 font-sans block">{weekday}</span>
              <span className="font-heading font-bold text-lg text-primary block leading-tight">{dayNum}</span>
              <span className="text-[10px] text-text/40 font-sans block">{monthShort}</span>
              <span className="text-[10px] text-accent font-sans font-medium block mt-0.5">{day.slots_count} موعد</span>
            </div>
          );
        })}
      </div>
      {days.length > 14 && (
        <p className="text-xs text-text/40 text-center font-sans">+{days.length - 14} يوم آخر</p>
      )}
    </div>
  );
}

// ─── Appointment List ───
function AppointmentList({ appointments }) {
  if (!appointments.length) return <EmptyState text="لا توجد مواعيد" />;

  const statusMap = {
    pending: { label: 'قيد الانتظار', color: 'bg-yellow-50 text-yellow-700' },
    confirmed: { label: 'مؤكد', color: 'bg-green-50 text-green-700' },
    cancelled: { label: 'ملغى', color: 'bg-red-50 text-red-700' },
    completed: { label: 'مكتمل', color: 'bg-gray-100 text-gray-600' },
  };

  return (
    <div className="space-y-2">
      {appointments.slice(0, 5).map((apt, i) => {
        const s = statusMap[apt.status] || statusMap.pending;
        return (
          <div key={apt.id || i} className="bg-white/60 rounded-xl p-3 border border-primary/5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
              <Calendar size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-sm text-primary truncate">{apt.doctor_name || 'طبيب'}</p>
              <p className="text-xs font-sans text-text/50">
                {apt.scheduled_at_display || (apt.scheduled_at ? new Date(apt.scheduled_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-sans font-medium ${s.color}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Medical History ───
function MedicalHistoryList({ records }) {
  if (!records.length) return <EmptyState text="لا يوجد سجل طبي" />;
  return (
    <div className="space-y-2">
      {records.map((rec, i) => (
        <div key={rec.id || i} className="bg-white/60 rounded-xl p-3 border border-primary/5 flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${rec.is_active ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
          <div className="flex-1">
            <p className="font-heading font-bold text-sm text-primary">{rec.condition}</p>
            <p className="text-xs font-sans text-text/50">
              {rec.diagnosed_at ? new Date(rec.diagnosed_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' }) : 'غير محدد'}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-sans font-medium ${rec.is_active ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
            {rec.is_active ? 'نشطة' : 'سابقة'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── AI Suggestions ───
function SuggestionList({ suggestions }) {
  if (!suggestions.length) return <EmptyState text="لا توجد اقتراحات" />;
  return (
    <div className="space-y-2">
      {suggestions.map((sug, i) => (
        <div key={sug.id || i} className="bg-white/60 rounded-xl p-3 border border-accent/10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-accent" />
            <p className="font-heading font-bold text-sm text-primary">{sug.doctor_name || 'طبيب مقترح'}</p>
          </div>
          {sug.reason && <p className="text-xs font-sans text-text/60 leading-relaxed">{sug.reason}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── User Profile ───
function UserProfileCard({ user }) {
  if (!user) return null;
  return (
    <div className="bg-white/60 rounded-xl p-4 border border-primary/5 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold">
        <User size={20} />
      </div>
      <div>
        <p className="font-heading font-bold text-primary">{user.full_name}</p>
        <p className="text-xs font-sans text-text/50">{user.email}</p>
        {user.phone && <p className="text-xs font-sans text-text/40" dir="ltr">{user.phone}</p>}
      </div>
    </div>
  );
}

// ─── Confirmation Card ───
function ConfirmationCard({ type, data }) {
  const config = {
    booked: { icon: <CheckCircle2 size={18} />, label: 'تم الحجز بنجاح', color: 'bg-green-50 border-green-200 text-green-700' },
    cancelled: { icon: <XCircle size={18} />, label: 'تم إلغاء الموعد', color: 'bg-red-50 border-red-200 text-red-600' },
    registered: { icon: <CheckCircle2 size={18} />, label: 'تم التسجيل بنجاح', color: 'bg-green-50 border-green-200 text-green-700' },
  };
  const c = config[type] || config.booked;
  return (
    <div className={`rounded-xl p-3 border flex items-center gap-3 ${c.color}`}>
      {c.icon}
      <span className="font-sans font-medium text-sm">{c.label}</span>
    </div>
  );
}

// ─── Fallback ───
function FallbackCard({ toolName, data }) {
  return (
    <></>
  );
}

// ─── Empty State ───
function EmptyState({ text }) {
  return (
    <div className="bg-white/60 rounded-xl p-4 border border-primary/5 text-center">
      <p className="font-sans text-sm text-text/40">{text}</p>
    </div>
  );
}

// ══════════════════════════════════════════════
// ─── DOCTOR TOOL COMPONENTS ───
// ══════════════════════════════════════════════

// ─── Patient Avatar (for doctor views) ───
function PatientAvatar({ patient, size = 'sm' }) {
  const sizes = size === 'lg'
    ? 'w-14 h-14 rounded-2xl text-lg'
    : 'w-10 h-10 rounded-xl text-sm';

  const initial = patient?.full_name?.charAt(0) || '?';
  const genderColors = {
    male: 'bg-blue-50 text-blue-600',
    female: 'bg-pink-50 text-pink-600',
  };
  const colorClass = genderColors[patient?.gender?.toLowerCase()] || 'bg-teal-50 text-teal-600';

  return (
    <div className={`${sizes} ${colorClass} flex items-center justify-center font-bold shrink-0`}>
      {initial}
    </div>
  );
}

// ─── Doctor Appointment List ───
function DoctorAppointmentList({ appointments, filterDate }) {
  if (!appointments.length) return <EmptyState text="لا توجد مواعيد" />;

  const statusMap = {
    pending:   { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
    confirmed: { label: 'مؤكد',         color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
    cancelled: { label: 'ملغى',         color: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-400' },
    completed: { label: 'مكتمل',        color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  };

  const dateLabel = filterDate === 'today' ? 'اليوم' : filterDate === 'tomorrow' ? 'غداً' : filterDate === 'upcoming' ? 'القادمة' : filterDate;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
            <Stethoscope size={14} className="text-teal-600" />
          </div>
          <span className="font-heading font-bold text-sm text-primary">المواعيد {dateLabel && `(${dateLabel})`}</span>
        </div>
        <span className="text-xs font-sans text-text/40 bg-primary/5 rounded-lg px-2 py-0.5">{appointments.length} موعد</span>
      </div>

      {/* Appointments */}
      {appointments.slice(0, 8).map((apt, i) => {
        const s = statusMap[apt.status] || statusMap.pending;
        const patient = apt.patient || {};
        const schedDate = apt.scheduled_at ? new Date(apt.scheduled_at) : null;

        return (
          <div key={apt.id || i} className="bg-white/70 rounded-xl border border-primary/5 overflow-hidden hover:border-teal-200 transition-colors">
            <div className="p-3 flex items-center gap-3">
              <PatientAvatar patient={patient} />
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-sm text-primary truncate">
                  {patient.full_name || 'مريض'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {schedDate && (
                    <span className="text-xs font-sans text-text/50 flex items-center gap-1">
                      <Clock size={10} className="text-teal-500" />
                      {schedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  )}
                  {schedDate && (
                    <span className="text-xs font-sans text-text/40">
                      {schedDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-sans font-medium border ${s.color}`}>
                {s.label}
              </span>
            </div>

            {/* Details row */}
            {(apt.reason || patient.phone || patient.blood_type) && (
              <div className="px-3 pb-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-sans text-text/50 border-t border-primary/[0.03] pt-2">
                {apt.reason && (
                  <span className="flex items-center gap-1">
                    <FileText size={10} className="text-teal-400" /> {apt.reason}
                  </span>
                )}
                {patient.phone && (
                  <span className="flex items-center gap-1" dir="ltr">
                    <Phone size={10} className="text-teal-400" /> {patient.phone}
                  </span>
                )}
                {patient.blood_type && (
                  <span className="flex items-center gap-1">
                    <Droplets size={10} className="text-red-400" /> {patient.blood_type}
                  </span>
                )}
                {patient.gender && (
                  <span className="flex items-center gap-1">
                    <User size={10} className="text-teal-400" /> {patient.gender === 'male' ? 'ذكر' : patient.gender === 'female' ? 'أنثى' : patient.gender}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {appointments.length > 8 && (
        <p className="text-xs text-text/40 text-center font-sans">+{appointments.length - 8} المزيد</p>
      )}
    </div>
  );
}

// ─── Appointment Status Update Card ───
function AppointmentStatusCard({ data }) {
  if (!data) return null;

  const statusLabels = {
    pending: 'قيد الانتظار',
    confirmed: 'مؤكد',
    cancelled: 'ملغى',
    completed: 'مكتمل',
  };

  const statusConfig = {
    confirmed: { icon: <CheckCircle2 size={18} />, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    completed: { icon: <CalendarCheck size={18} />, color: 'bg-blue-50 border-blue-200 text-blue-700' },
    cancelled: { icon: <XCircle size={18} />, color: 'bg-red-50 border-red-200 text-red-600' },
    pending:   { icon: <AlertCircle size={18} />, color: 'bg-amber-50 border-amber-200 text-amber-700' },
  };

  const newStatus = data.appointment?.status || data.status;
  const cfg = statusConfig[newStatus] || statusConfig.confirmed;
  const label = statusLabels[newStatus] || newStatus;

  return (
    <div className={`rounded-xl p-3 border flex items-center gap-3 ${cfg.color}`}>
      {cfg.icon}
      <div className="flex-1">
        <span className="font-sans font-medium text-sm">
          {data.message || `تم تحديث حالة الموعد إلى "${label}"`}
        </span>
      </div>
    </div>
  );
}

// ─── Patient History Card (doctor viewing a patient's history) ───
function PatientHistoryCard({ data }) {
  if (!data) return null;

  const patient = data.patient || {};
  const appointments = data.appointments || [];

  const statusMap = {
    pending:   { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-700' },
    confirmed: { label: 'مؤكد',         color: 'bg-emerald-50 text-emerald-700' },
    cancelled: { label: 'ملغى',         color: 'bg-red-50 text-red-600' },
    completed: { label: 'مكتمل',        color: 'bg-slate-100 text-slate-600' },
  };

  return (
    <div className="space-y-2">
      {/* Patient info header */}
      <div className="bg-gradient-to-l from-teal-50 to-white rounded-xl p-3 border border-teal-100 flex items-center gap-3">
        <PatientAvatar patient={patient} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-primary">{patient.full_name || 'مريض'}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] font-sans text-text/50">
            {patient.email && (
              <span className="flex items-center gap-1">
                <Mail size={10} className="text-teal-400" /> {patient.email}
              </span>
            )}
            {patient.phone && (
              <span className="flex items-center gap-1" dir="ltr">
                <Phone size={10} className="text-teal-400" /> {patient.phone}
              </span>
            )}
            {patient.blood_type && (
              <span className="flex items-center gap-1">
                <Droplets size={10} className="text-red-400" /> {patient.blood_type}
              </span>
            )}
            {patient.date_of_birth && (
              <span className="flex items-center gap-1">
                <Calendar size={10} className="text-teal-400" /> {new Date(patient.date_of_birth).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <div className="text-center shrink-0">
          <span className="block text-lg font-heading font-bold text-teal-600">{appointments.length}</span>
          <span className="text-[10px] font-sans text-text/40">زيارة</span>
        </div>
      </div>

      {/* Timeline */}
      {appointments.length === 0 ? (
        <EmptyState text="لا توجد زيارات سابقة" />
      ) : (
        <div className="space-y-1.5">
          {appointments.slice(0, 6).map((apt, i) => {
            const s = statusMap[apt.status] || statusMap.pending;
            const schedDate = apt.scheduled_at ? new Date(apt.scheduled_at) : null;

            return (
              <div key={apt.id || i} className="bg-white/60 rounded-xl p-2.5 border border-primary/5 flex items-center gap-3 hover:border-teal-200 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-500 shrink-0">
                  <Calendar size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-sans text-primary font-medium">
                    {schedDate
                      ? schedDate.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                      : apt.scheduled_at_display || 'غير محدد'
                    }
                  </p>
                  {apt.reason && <p className="text-[11px] font-sans text-text/50 truncate mt-0.5">{apt.reason}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-sans font-medium ${s.color}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
          {appointments.length > 6 && (
            <p className="text-xs text-text/40 text-center font-sans">+{appointments.length - 6} زيارة أخرى</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Doctor Patient List ───
function DoctorPatientList({ patients, onFillInput }) {
  if (!patients.length) return <EmptyState text="لا يوجد مرضى" />;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
            <Users size={14} className="text-teal-600" />
          </div>
          <span className="font-heading font-bold text-sm text-primary">قائمة المرضى</span>
        </div>
        <span className="text-xs font-sans text-text/40 bg-primary/5 rounded-lg px-2 py-0.5">{patients.length} مريض</span>
      </div>

      {/* Patient cards */}
      {patients.slice(0, 8).map((patient, i) => (
        <div
          key={patient.id || i}
          className="bg-white/70 rounded-xl border border-primary/5 p-3 flex items-center gap-3 hover:border-teal-200 transition-colors cursor-pointer"
          onClick={() => onFillInput?.(`اعرض سجل المريض ${patient.full_name}`)}
        >
          <PatientAvatar patient={patient} />
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-sm text-primary truncate">{patient.full_name || 'مريض'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {patient.email && (
                <span className="text-[11px] font-sans text-text/40 truncate">{patient.email}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {patient.blood_type && (
              <span className="flex items-center gap-0.5 text-[10px] font-sans text-red-400">
                <Droplets size={10} /> {patient.blood_type}
              </span>
            )}
            {patient.total_appointments != null && (
              <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md text-[10px] font-sans font-medium">
                {patient.total_appointments} زيارة
              </span>
            )}
            <ArrowRight size={12} className="text-text/20" />
          </div>
        </div>
      ))}

      {patients.length > 8 && (
        <p className="text-xs text-text/40 text-center font-sans">+{patients.length - 8} المزيد</p>
      )}
    </div>
  );
}
