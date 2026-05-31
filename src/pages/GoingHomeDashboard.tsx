import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { auth } from '../firebase';
import { Navigation, Map, List, Bell, LogOut, PackageSearch, Route as RouteIcon, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import raySpeedIcon from '@/assets/images/ray_speed_icon_v2_1779524761425.png';

// Sub-pages
import AvailableRequests from './ray/AvailableRequests';
import ActivePlan from './ray/ActivePlan';
import RayProfile from './ray/RayProfile';

export default function GoingHomeDashboard() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="w-20 md:w-64 bg-slate-900 text-white flex flex-col items-center md:items-start p-4 md:p-6 transition-all border-r border-slate-800">
        <div 
          className={`flex items-center gap-3 font-bold text-xl mb-12 overflow-visible transition-all ${profile?.roles?.includes('MAKER_FISH' as any) ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}`}
          onClick={() => {
            if (profile?.roles?.includes('MAKER_FISH' as any)) {
              navigate('/maker');
            }
          }}
          title={profile?.roles?.includes('MAKER_FISH' as any) ? "切換至梅克魚空間" : ""}
        >
          <div className="relative flex items-center justify-center p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 shrink-0">
            <img 
              src={raySpeedIcon} 
              alt="資源勾引魟圖示" 
              className="w-8 h-8 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            {profile?.roles?.includes('MAKER_FISH' as any) && (
              <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-cyan-500 rounded-full border-2 border-slate-900" />
            )}
          </div>
          <span className="hidden md:inline whitespace-nowrap">勾引魟工作區</span>
        </div>

        <nav className="flex-1 space-y-4 w-full">
          <NavItem 
            icon={<Map />} 
            label="收運地圖" 
            onClick={() => navigate('/going-home')} 
            active={window.location.pathname === '/going-home'} 
          />
          <NavItem 
            icon={<RouteIcon />} 
            label="我的計畫" 
            onClick={() => navigate('/going-home/plan')} 
            active={window.location.pathname.startsWith('/going-home/plan')}
          />
          <NavItem 
            icon={<PackageSearch />} 
            label="收運請求" 
            onClick={() => navigate('/going-home/requests')} 
            active={window.location.pathname.startsWith('/going-home/requests')}
          />
          {isAdmin && (
            <NavItem 
              icon={<Shield />} 
              label="管理後台" 
              onClick={() => navigate('/admin')} 
              active={false}
            />
          )}
        </nav>

        <div className="w-full pt-6 border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-3 px-2 overflow-hidden cursor-pointer hover:bg-slate-800/50 rounded-xl py-1 transition-colors" onClick={() => navigate('/setup')}>
            <Avatar className="h-10 w-10 ring-2 ring-blue-500/20">
              <AvatarImage src={profile?.photoURL} />
              <AvatarFallback>{profile?.displayName?.[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-xs font-bold truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">資源勾引魟</p>
            </div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden md:inline">登出</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-slate-50 relative">
        <Routes>
          <Route path="/" element={<AvailableRequests />} />
          <Route path="/plan" element={<ActivePlan />} />
          <Route path="/requests" element={<AvailableRequests />} />
          <Route path="/profile" element={<RayProfile />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ icon, label, onClick, active }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-center md:justify-start gap-4 px-4 py-3 rounded-2xl transition-all ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      {React.cloneElement(icon, { className: 'w-6 h-6' })}
      <span className="hidden md:inline font-medium">{label}</span>
    </button>
  );
}
