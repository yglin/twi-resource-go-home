import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { RecycleContract, ContractStatus } from '../../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Plus, 
  ArrowLeft, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Ban, 
  Calendar, 
  User, 
  Building,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';

export default function ContractDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<RecycleContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const isGoingHome = profile?.roles?.includes('GOING_HOME');

  useEffect(() => {
    if (!user) return;

    const ref = collection(db, 'recycleContracts');
    const qMaker = query(ref, where('makerFishId', '==', user.uid));
    const qRay = query(ref, where('goingHomeId', '==', user.uid));
    const qRecycler = query(ref, where('recyclerId', '==', user.uid));

    const unsubscribeList: (() => void)[] = [];
    const resultsMap = new Map<string, RecycleContract>();

    const handleSnapshot = (snapshot: any) => {
      snapshot.forEach((doc: any) => {
        resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as RecycleContract);
      });
      
      const merged = Array.from(resultsMap.values()).sort((a, b) => {
        const timeA = a.updatedAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || 0;
        return timeB - timeA;
      });
      setContracts(merged);
      setLoading(false);
    };

    // Listen to all three roles to construct full merged state
    unsubscribeList.push(onSnapshot(qMaker, handleSnapshot, (err) => console.error(err)));
    unsubscribeList.push(onSnapshot(qRay, handleSnapshot, (err) => console.error(err)));
    unsubscribeList.push(onSnapshot(qRecycler, handleSnapshot, (err) => console.error(err)));

    return () => {
      unsubscribeList.forEach(un => un());
    };
  }, [user]);

  // Statistics
  const activeCount = contracts.filter(c => c.status === 'Active').length;
  const pendingCount = contracts.filter(c => c.status === 'Pending Signatures').length;
  const suspendedCount = contracts.filter(c => c.status === 'Suspended').length;
  const rejectedCount = contracts.filter(c => c.status === 'Rejected').length;

  const filteredContracts = contracts.filter(c => {
    // Status filter
    if (statusFilter !== 'ALL' && c.status !== statusFilter) {
      return false;
    }
    // Role filter
    if (roleFilter !== 'ALL') {
      if (roleFilter === 'MAKER' && c.makerFishId !== user?.uid) return false;
      if (roleFilter === 'RAY' && c.goingHomeId !== user?.uid) return false;
      if (roleFilter === 'RECYCLER' && c.recyclerId !== user?.uid) return false;
    }
    return true;
  });

  const getStatusBadge = (status: ContractStatus) => {
    switch (status) {
      case 'Active':
        return <Badge className="bg-emerald-100 text-emerald-800 border-none px-3 py-0.5 font-bold">執行中 (Active)</Badge>;
      case 'Pending Signatures':
        return <Badge className="bg-blue-100 text-blue-800 border-none px-3 py-0.5 font-bold">待三方簽署</Badge>;
      case 'Suspended':
        return <Badge className="bg-amber-100 text-amber-800 border-none px-3 py-0.5 font-bold">已暫停 (Suspended)</Badge>;
      case 'Rejected':
        return <Badge className="bg-rose-100 text-rose-800 border-none px-3 py-0.5 font-bold">已被退回</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800 border-none px-3 py-0.5 font-bold">{status}</Badge>;
    }
  };

  const getMyRelationLabel = (c: RecycleContract) => {
    if (c.goingHomeId === user?.uid) return '我是收運發起端 (魟魚)';
    if (c.makerFishId === user?.uid) return '我是資材供給端 (梅克魚)';
    if (c.recyclerId === user?.uid) return '我是收購處理端 (瑞莎魺)';
    return '合約參與者';
  };

  const handleBack = () => {
    if (profile?.roles?.includes('GOING_HOME') || profile?.roles?.includes('RECYCLER')) {
      navigate('/going-home');
    } else {
      navigate('/maker');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Banner section */}
      <div className="bg-white border-b border-slate-100 pt-6 pb-6">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <Button 
            variant="ghost" 
            onClick={handleBack} 
            className="mb-4 rounded-full pl-2 text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            返回工作區
          </Button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <FileText className="w-8 h-8 text-blue-600" />
                定期回收合約儀表板
              </h1>
              <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                建立、簽署、管理長期、規律的回收派單契約。透過三方（梅克魚、勾引魟、瑞莎魺）共識。
              </p>
            </div>
            <Button 
              onClick={() => navigate('/newRecycleContract')}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold px-6 py-2.5 shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 w-fit"
            >
              <Plus className="w-5 h-5" />
              發起定期契約
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">執行中 (Active)</p>
                <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">等待簽署中</p>
                <p className="text-2xl font-bold text-slate-800">{pendingCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">已暫停 (Suspended)</p>
                <p className="text-2xl font-bold text-slate-800">{suspendedCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
                <Ban className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">遭駁回數</p>
                <p className="text-2xl font-bold text-slate-800">{rejectedCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <span>儀表板篩選：</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Status filters */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-1">
              <button 
                onClick={() => setStatusFilter('ALL')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${statusFilter === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                全部 ({contracts.length})
              </button>
              <button 
                onClick={() => setStatusFilter('Active')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${statusFilter === 'Active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                執行中 ({activeCount})
              </button>
              <button 
                onClick={() => setStatusFilter('Pending Signatures')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${statusFilter === 'Pending Signatures' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                簽署中 ({pendingCount})
              </button>
              <button 
                onClick={() => setStatusFilter('Suspended')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${statusFilter === 'Suspended' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                已暫停 ({suspendedCount})
              </button>
            </div>

            {/* Role filters */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-1">
              <button 
                onClick={() => setRoleFilter('ALL')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${roleFilter === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                角色：全部
              </button>
              <button 
                onClick={() => setRoleFilter('MAKER')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${roleFilter === 'MAKER' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                我是梅克魚
              </button>
              <button 
                onClick={() => setRoleFilter('RAY')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${roleFilter === 'RAY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                我是魟魚
              </button>
              <button 
                onClick={() => setRoleFilter('RECYCLER')}
                className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${roleFilter === 'RECYCLER' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                我是瑞莎魺
              </button>
            </div>
          </div>
        </div>

        {/* Contract list body */}
        {loading ? (
          <div className="py-20 text-center text-slate-400">載入契約中，請稍候...</div>
        ) : filteredContracts.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-2 border-slate-200 p-12 text-center bg-white shadow-sm">
            <CardContent className="space-y-4">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <div>
                <h3 className="font-bold text-slate-800 text-lg">尚無符合條件的定期合約</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mt-1 font-sans">
                  目前並無任何相關定期契約記錄。魟魚端用戶可在各單結算頁或右上方發起新長期週期的定期服務合約。
                </p>
              </div>
              <Button 
                onClick={() => navigate('/newRecycleContract')}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold px-6 py-2"
              >
                發起定期回收契約
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredContracts.map((c) => (
              <Card 
                key={c.id} 
                className="rounded-3xl border-slate-200/60 shadow-sm bg-white hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group cursor-pointer"
                onClick={() => navigate(`/recycleContract/${c.id}`)}
              >
                <div>
                  <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] text-blue-600 font-extrabold uppercase bg-blue-50 px-2.5 py-1 rounded-full">
                        {getMyRelationLabel(c)}
                      </span>
                      <h3 className="text-xl font-bold text-slate-800 mt-2 line-clamp-1">
                        {c.templateRecord.productCategory} 定期回收
                      </h3>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        主要分類：{c.templateRecord.materialCategory}
                      </p>
                    </div>
                    {getStatusBadge(c.status)}
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                      <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">合約約定排程</p>
                        <p className="font-semibold text-xs mt-0.5 text-slate-700">{c.schedule.scheduleText}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 border border-slate-100 rounded-xl space-y-0.5 bg-white">
                        <span className="text-[10px] text-slate-400 font-bold">約定回收量</span>
                        <p className="font-bold text-sm text-slate-800 leading-none">
                          {c.templateRecord.quantity} {c.templateRecord.unit}
                        </p>
                      </div>
                      
                      <div className="p-2 border border-slate-100 rounded-xl space-y-0.5 bg-white">
                        <span className="text-[10px] text-slate-400 font-bold">下期預定發起</span>
                        <p className="font-bold text-xs text-blue-600 truncate mt-0.5">
                          {c.nextRunAt ? c.nextRunAt.toDate().toLocaleDateString() : '尚未預訂'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-sans">
                  <span>最後更新：{c.updatedAt?.toDate().toLocaleString()}</span>
                  <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    查看詳情及進度
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
