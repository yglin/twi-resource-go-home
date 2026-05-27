import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {ShieldAlert} from 'lucide-react';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6">
      <ShieldAlert className="w-24 h-24 text-red-500 mb-6" />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">權限不足</h1>
      <p className="text-slate-500 mb-8 max-w-md">您沒有存取此頁面的權限。如果您認為這是錯誤，請聯繫系統管理員。</p>
      <Button onClick={() => navigate('/')} variant="outline" className="rounded-full px-8">
        回到首頁
      </Button>
    </div>
  );
}
