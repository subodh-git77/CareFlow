import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import AdminDashboard from './pages/AdminDashboard';
import AppointmentDetails from './pages/AppointmentDetails';
import BookAppointment from './pages/BookAppointment';
import DoctorDashboard from './pages/DoctorDashboard';
import LeaveManagement from './pages/LeaveManagement';
import Login from './pages/Login';
import ManageDoctors from './pages/ManageDoctors';
import PatientAppointments from './pages/PatientAppointments';
import PatientDashboard from './pages/PatientDashboard';
import PrescriptionPage from './pages/PrescriptionPage';
import Register from './pages/Register';
import SearchDoctors from './pages/SearchDoctors';
import { authAPI } from './utils/api';

const homeFor = role => role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/patient';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setLoading(false);
    authAPI.getMe().then(data => setUser(data.user)).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
  }, []);

  const login = (nextUser, token) => { localStorage.setItem('token', token); setUser(nextUser); };
  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-teal-400 border-t-transparent"/><p>Opening CareFlow…</p></div></div>;

  const guarded = (role, element) => user?.role === role ? element : <Navigate to={user ? homeFor(user.role) : '/login'} replace />;

  return <BrowserRouter><ErrorBoundary><Routes>
    <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} /> : <Login onLogin={login} />} />
    <Route path="/register" element={user ? <Navigate to={homeFor(user.role)} /> : <Register onLogin={login} />} />
    <Route element={user ? <AppShell user={user} onLogout={logout} /> : <Navigate to="/login" replace />}>
      <Route path="/patient" element={guarded('patient', <PatientDashboard />)} />
      <Route path="/patient/doctors" element={guarded('patient', <SearchDoctors />)} />
      <Route path="/patient/book/:doctorId" element={guarded('patient', <BookAppointment />)} />
      <Route path="/patient/appointments" element={guarded('patient', <PatientAppointments />)} />
      <Route path="/doctor" element={guarded('doctor', <DoctorDashboard />)} />
      <Route path="/doctor/appointments/:id" element={guarded('doctor', <AppointmentDetails />)} />
      <Route path="/doctor/appointments/:id/prescription" element={guarded('doctor', <PrescriptionPage />)} />
      <Route path="/admin" element={guarded('admin', <AdminDashboard />)} />
      <Route path="/admin/doctors" element={guarded('admin', <ManageDoctors />)} />
      <Route path="/admin/leave" element={guarded('admin', <LeaveManagement />)} />
    </Route>
    <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
  </Routes></ErrorBoundary></BrowserRouter>;
}

export default App;