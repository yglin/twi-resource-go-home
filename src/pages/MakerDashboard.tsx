import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Fish, History, Bell, LogOut, Package, Shield, FileText } from 'lucide-react';

// Sub-pages/Components
import RecordList from './maker/RecordList';
import CreateRecord from './maker/CreateRecord';
import RecordDetails from './maker/RecordDetails';
import Notifications from './maker/Notifications';

export default function MakerDashboard() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar - Mobile bottom nav, Desktop side rail */}
      <aside className="w-20 md:w-64 bg-slate-900 text-white flex flex-col items-center md:items-start p-4 md:p-6 transition-all shrink-0 overflow-y-auto min-h-0 custom-sidebar">
        <div 
          className={`flex items-center gap-3 font-bold text-xl mb-6 md:mb-8 overflow-visible transition-all ${(profile?.roles?.includes('GOING_HOME' as any) || profile?.roles?.includes('RECYCLER' as any)) ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}`}
          onClick={() => {
            if (profile?.roles?.includes('GOING_HOME' as any) || profile?.roles?.includes('RECYCLER' as any)) {
              navigate('/going-home');
            }
          }}
          title={
            profile?.roles?.includes('GOING_HOME' as any) 
              ? "切換至勾引魟工作區" 
              : (profile?.roles?.includes('RECYCLER' as any) ? "切換至瑞莎魺工作區" : "")
          }
        >
          <div className="relative flex items-center justify-center p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shrink-0">
            <Fish className="w-8 h-8 text-cyan-400 shrink-0" />
            {(profile?.roles?.includes('GOING_HOME' as any) || profile?.roles?.includes('RECYCLER' as any)) && (
              <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-slate-900" />
            )}
          </div>
          <span className="hidden md:inline whitespace-nowrap">梅克魚空間</span>
        </div>

        <nav className="flex-1 space-y-2 w-full">
          <NavItem 
            icon={<History />} 
            label="收運記錄" 
            onClick={() => navigate('/maker')} 
            active={window.location.pathname === '/maker'} 
          />
          <NavItem 
            icon={<Bell />} 
            label="通知中心" 
            onClick={() => navigate('/maker/notifications')} 
            active={window.location.pathname.includes('/notifications')}
          />
          <NavItem 
            icon={<FileText />} 
            label="定期契約" 
            onClick={() => navigate('/recycleContract')} 
            active={window.location.pathname.startsWith('/recycleContract')}
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

        <div className="w-full pt-4 border-t border-slate-800 space-y-2 mt-4">
          <div className="flex items-center gap-3 px-2 overflow-hidden cursor-pointer hover:bg-slate-800/50 rounded-xl py-1 transition-colors" onClick={() => navigate('/setup')}>
            <Avatar className="h-10 w-10 ring-2 ring-cyan-500/20">
              <AvatarImage src={profile?.photoURL} />
              <AvatarFallback>{profile?.displayName?.[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-xs font-bold truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">資源梅克魚</p>
            </div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden md:inline">登出</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          <Routes>
            <Route path="/" element={<RecordList />} />
            <Route path="/new" element={<CreateRecord />} />
            <Route path="/record/:id" element={<RecordDetails />} />
            <Route path="/notifications" element={<Notifications />} />
          </Routes>
        </div>
      </main>

      {/* Speed Dial for adding new resource (mobile primary action) */}
      <Button 
        onClick={() => navigate('/maker/new')}
        className="fixed bottom-8 right-8 h-16 w-16 rounded-full shadow-2xl bg-cyan-500 hover:bg-cyan-600 border-4 border-white z-50 transition-transform active:scale-95"
      >
        <Plus className="w-8 h-8 text-white" />
      </Button>
    </div>
  );
}

function NavItem({ icon, label, onClick, active }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-center md:justify-start gap-4 px-4 py-3 rounded-2xl transition-all ${active ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      {React.cloneElement(icon, { className: 'w-6 h-6' })}
      <span className="hidden md:inline font-medium">{label}</span>
    </button>
  );
}
