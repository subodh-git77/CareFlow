import { Activity, CalendarDays, ClipboardPlus, LayoutDashboard, LogOut, Search, Stethoscope, UserRoundCog } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const links = {
  patient: [['/patient', 'Overview', LayoutDashboard], ['/patient/doctors', 'Find a doctor', Search], ['/patient/appointments', 'Appointments', CalendarDays]],
  doctor: [['/doctor', 'Appointments', Stethoscope]],
  admin: [['/admin', 'Overview', LayoutDashboard], ['/admin/doctors', 'Manage doctors', UserRoundCog], ['/admin/leave', 'Leave planner', ClipboardPlus]]
};

export default function AppShell({ user, onLogout }) {
  return <div className="min-h-screen bg-[#f4f7f9] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-950 p-5 text-white lg:flex">
      <div className="flex items-center gap-3 px-2 py-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-400 text-slate-950"><Activity size={22}/></span><div><p className="text-lg font-bold">CareFlow</p><p className="text-xs text-slate-400">Health, beautifully managed</p></div></div>
      <nav className="mt-10 space-y-2">{links[user.role].map(([to, label, Icon]) => <NavLink key={to} end to={to} className={({isActive}) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><p className="font-semibold">{user.name}</p><p className="mb-4 text-xs capitalize text-slate-400">{user.role} account</p><button onClick={onLogout} className="flex w-full items-center gap-2 text-sm text-slate-300 hover:text-white"><LogOut size={16}/>Sign out</button></div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden"><div className="flex items-center gap-2 font-bold"><Activity className="text-teal-600"/>CareFlow</div><button onClick={onLogout} className="rounded-xl bg-slate-100 p-2"><LogOut size={18}/></button></header>
    <div className="border-b border-slate-200 bg-white px-3 py-2 lg:hidden"><nav className="flex gap-2 overflow-x-auto">{links[user.role].map(([to,label,Icon]) => <NavLink key={to} end to={to} className={({isActive}) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${isActive ? 'bg-slate-950 text-white' : 'text-slate-500'}`}><Icon size={15}/>{label}</NavLink>)}</nav></div>
    <main className="lg:pl-64"><div className="mx-auto max-w-7xl p-5 sm:p-8 lg:p-10"><Outlet/></div></main>
  </div>;
}