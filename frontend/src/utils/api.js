const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiRequest = async (path, options = {}) => {
  const token = localStorage.getItem('token');
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
    });
  } catch (_error) {
    throw new Error('Cannot reach the server. Make sure the backend and MongoDB are running.');
  }
  const data = await response.json().catch(() => ({ error: 'The server returned an unreadable response' }));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};
const body = value => JSON.stringify(value);
export const authAPI = { login: (email,password) => apiRequest('/api/auth/login',{method:'POST',body:body({email,password})}), register: (name,email,password) => apiRequest('/api/auth/register',{method:'POST',body:body({name,email,password})}), getMe: () => apiRequest('/api/auth/me') };
export const adminAPI = { getDoctors: () => apiRequest('/api/admin/doctors'), createDoctor: data => apiRequest('/api/admin/doctors',{method:'POST',body:body(data)}), updateDoctor: (id,data) => apiRequest(`/api/admin/doctors/${id}`,{method:'PUT',body:body(data)}), deleteDoctor: id => apiRequest(`/api/admin/doctors/${id}`,{method:'DELETE'}), markLeave: (id,date) => apiRequest(`/api/admin/doctors/${id}/leave`,{method:'POST',body:body({date})}) };
export const patientAPI = { getDoctors: (specialisation='') => apiRequest(`/api/patient/doctors${specialisation ? `?specialisation=${encodeURIComponent(specialisation)}` : ''}`), getSlots: (id,date) => apiRequest(`/api/patient/doctors/${id}/slots?date=${date}`), holdSlot: (doctorId,date,slotTime) => apiRequest('/api/patient/appointments/hold',{method:'POST',body:body({doctorId,date,slotTime})}), confirmBooking: (holdId,symptoms) => apiRequest('/api/patient/appointments/confirm',{method:'POST',body:body({holdId,symptoms})}), getAppointments: () => apiRequest('/api/patient/appointments'), rescheduleBooking: (id,date,slotTime) => apiRequest(`/api/patient/appointments/${id}/reschedule`,{method:'PUT',body:body({date,slotTime})}), cancelBooking: id => apiRequest(`/api/patient/appointments/${id}/cancel`,{method:'DELETE'}) };
export const doctorAPI = { getAppointments: () => apiRequest('/api/doctor/appointments'), getAppointmentById: id => apiRequest(`/api/doctor/appointments/${id}`), addNotes: (id,postVisitNotes) => apiRequest(`/api/doctor/appointments/${id}/notes`,{method:'POST',body:body({postVisitNotes})}), addPrescription: (id,medicines) => apiRequest(`/api/doctor/appointments/${id}/prescription`,{method:'POST',body:body({medicines})}) };