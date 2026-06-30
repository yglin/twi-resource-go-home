import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  getDoc 
} from 'firebase/firestore';
import { 
  signContract, 
  suspendContract, 
  reactivateContract, 
  resubmitContract,
  addContractMessage
} from '../../services/contractService';
import { 
  RecycleContract, 
  ContractHistory, 
  ContractMessage, 
  UserProfile,
  ContractSchedule
} from '../../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Handshake, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Send, 
  History as HistoryIcon, 
  MessageSquare, 
  Play, 
  Pause, 
  Scale, 
  Coins,
  Loader2,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

export default function ContractDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [contract, setContract] = useState<RecycleContract | null>(null);
  const [history, setHistory] = useState<ContractHistory[]>([]);
  const [messages, setMessages] = useState<ContractMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Participant User Profiles
  const [makerProf, setMakerProf] = useState<UserProfile | null>(null);
  const [rayProf, setRayProf] = useState<UserProfile | null>(null);
  const [recyclerProf, setRecyclerProf] = useState<UserProfile | null>(null);

  // Discussion state
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Action states
  const [suspendReason, setSuspendReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Edit / Resubmit form state (for Going Home users under 'Rejected' status)
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editUnit, setEditUnit] = useState('公斤');
  const [editScheduleType, setEditScheduleType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [editDayOfMonth, setEditDayOfMonth] = useState(15);
  const [editScheduleTime, setEditScheduleTime] = useState('09:00');
  const [resubmitting, setResubmitting] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    // Load contract
    const unsubContract = onSnapshot(doc(db, 'recycleContracts', id), async (snap) => {
      if (snap.exists()) {
        const cData = { id: snap.id, ...snap.data() } as RecycleContract;
        setContract(cData);

        // Populate edit state once
        setEditQuantity(cData.templateRecord.quantity);
        setEditUnit(cData.templateRecord.unit);
        setEditScheduleType(cData.schedule.type);
        setEditScheduleTime(cData.schedule.time);
        if (cData.schedule.daysOfWeek) setEditDaysOfWeek(cData.schedule.daysOfWeek);
        if (cData.schedule.dayOfMonth) setEditDayOfMonth(cData.schedule.dayOfMonth);

        // Load profiles in background
        const [mDoc, gDoc, rDoc] = await Promise.all([
          getDoc(doc(db, 'users', cData.makerFishId)),
          getDoc(doc(db, 'users', cData.goingHomeId)),
          getDoc(doc(db, 'users', cData.recyclerId))
        ]);

        if (mDoc.exists()) setMakerProf(mDoc.data() as UserProfile);
        if (gDoc.exists()) setRayProf(gDoc.data() as UserProfile);
        if (rDoc.exists()) setRecyclerProf(rDoc.data() as UserProfile);
      } else {
        toast.error('找不到合約記錄');
        navigate('/recycleContract');
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // Load history subcollection
    const hQuery = query(collection(db, `recycleContracts/${id}/history`), orderBy('timestamp', 'desc'));
    const unsubHistory = onSnapshot(hQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContractHistory));
      setHistory(list);
    });

    // Load messages subcollection
    const mQuery = query(collection(db, `recycleContracts/${id}/messages`), orderBy('createdAt', 'asc'));
    const unsubMessages = onSnapshot(mQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContractMessage));
      setMessages(list);
    });

    return () => {
      unsubContract();
      unsubHistory();
      unsubMessages();
    };
  }, [id, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!contract) return null;

  // Detect current user's role on this contract
  let myRole: 'MAKER_FISH' | 'GOING_HOME' | 'RECYCLER' | null = null;
  if (user?.uid === contract.makerFishId) myRole = 'MAKER_FISH';
  else if (user?.uid === contract.goingHomeId) myRole = 'GOING_HOME';
  else if (user?.uid === contract.recyclerId) myRole = 'RECYCLER';

  // Check if current user has already signed / acted on Pending contract
  let mySignStatus = 'Pending';
  if (myRole === 'MAKER_FISH') mySignStatus = contract.signatures.makerFish;
  else if (myRole === 'GOING_HOME') mySignStatus = contract.signatures.goingHome;
  else if (myRole === 'RECYCLER') mySignStatus = contract.signatures.recycler;

  const handleSign = async (action: 'Approve' | 'Reject') => {
    if (!myRole) {
      toast.error('您不屬於本定期契約的三方協定對象。');
      return;
    }
    if (action === 'Reject' && !showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    if (action === 'Reject' && !rejectReason.trim()) {
      toast.error('請填寫退回審查的具體原因。');
      return;
    }

    try {
      const reasonVal = action === 'Reject' ? rejectReason : '';
      await signContract(contract.id, user!.uid, myRole, action, reasonVal);
      toast.success(action === 'Approve' ? '簽署成功！' : '合約條約已退回駁回！');
      setShowRejectInput(false);
      setRejectReason('');
    } catch (err) {
      console.error(err);
      toast.error('操作處理失敗，請重試。');
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) {
      toast.error('請填寫暫停合約的具體理由。');
      return;
    }
    try {
      const displayRole = myRole === 'MAKER_FISH' ? '梅克魚' : myRole === 'GOING_HOME' ? '魟魚' : '瑞莎魺';
      await suspendContract(contract.id, user!.uid, profile?.displayName || '協議夥伴', displayRole, suspendReason);
      toast.success('長期合約已成功掛起暫停。');
      setSuspendReason('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleReactivate = async () => {
    try {
      const displayRole = myRole === 'MAKER_FISH' ? '梅克魚' : myRole === 'GOING_HOME' ? '魟魚' : '瑞莎魺';
      await reactivateContract(contract.id, user!.uid, profile?.displayName || '協定者', displayRole);
      toast.success('重啟請求已送交！合約已回歸 PENDING 三方待重新簽核狀態。');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMsg) return;

    setSendingMsg(true);
    try {
      const displayRole = myRole === 'MAKER_FISH' ? 'MAKER_FISH' : myRole === 'GOING_HOME' ? 'GOING_HOME' : myRole === 'RECYCLER' ? 'RECYCLER' : 'GUEST';
      await addContractMessage(
        contract.id, 
        user!.uid, 
        profile?.displayName || '成員', 
        displayRole, 
        newMessage.trim()
      );
      setNewMessage('');
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  const toggleDayOfWeek = (day: number) => {
    if (editDaysOfWeek.includes(day)) {
      setEditDaysOfWeek(editDaysOfWeek.filter(d => d !== day));
    } else {
      setEditDaysOfWeek([...editDaysOfWeek, day].sort());
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (myRole !== 'GOING_HOME') return;

    setResubmitting(true);
    try {
      // compile scheduleText
      const getWeekDayName = (day: number) => ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][day];
      let planText = '';
      if (editScheduleType === 'daily') {
        planText = `每日的 ${editScheduleTime} 排定定期收運項目`;
      } else if (editScheduleType === 'weekly') {
        const daysStr = editDaysOfWeek.map(getWeekDayName).join('、');
        planText = `每週 [${daysStr || '未選擇'}] 的 ${editScheduleTime} 排定定期收運項目`;
      } else if (editScheduleType === 'monthly') {
        planText = `每月的對齊 ${editDayOfMonth} 日 ${editScheduleTime} 排定定期收運項目`;
      }

      const schedule: ContractSchedule = {
        type: editScheduleType,
        time: editScheduleTime,
        scheduleText: planText
      };
      if (editScheduleType === 'weekly') schedule.daysOfWeek = editDaysOfWeek;
      else if (editScheduleType === 'monthly') schedule.dayOfMonth = editDayOfMonth;

      await resubmitContract(contract.id, {
        templateRecord: {
          materialCategory: contract.templateRecord.materialCategory,
          productCategory: contract.templateRecord.productCategory,
          quantity: editQuantity,
          unit: editUnit
        },
        schedule
      });

      toast.success('契約條約已重新調整並送交再次協議！');
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 pb-20 font-sans">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/recycleContract')} 
        className="mb-6 rounded-full text-slate-500 hover:text-slate-800 bg-white border border-slate-100 shadow-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        返回定期契約儀表板
      </Button>

      {/* Main Grid: Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column (2-span): Details & Forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Contract Agreement Info */}
          <Card className="rounded-3xl border-slate-200 shadow-lg overflow-hidden bg-white">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 md:p-8 flex flex-row items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-blue-600 font-extrabold uppercase bg-blue-100/60 px-3 py-1 rounded-full">
                  契約約定規格
                </span>
                <CardTitle className="text-2xl font-bold mt-2 text-slate-900">
                  {contract.templateRecord.productCategory} 定期收運協定
                </CardTitle>
                <CardDescription className="text-slate-400 font-sans mt-0.5 text-xs">
                  主分類：{contract.templateRecord.materialCategory} | 單號 id: {contract.id}
                </CardDescription>
              </div>
              <Badge className="bg-slate-900 text-white rounded-lg px-3 py-1 font-bold text-xs select-none">
                {contract.status}
              </Badge>
            </CardHeader>
            <CardContent className="p-6 md:p-8 space-y-6">
              
              {/* Dynamic Warning Banners depending on statuses */}
              {contract.status === 'Rejected' && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex gap-3 text-rose-800">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm leading-tight">此約定遭成員退回駁回</h4>
                    <p className="text-xs text-rose-700 font-sans font-bold mt-1 bg-white/50 p-2.5 rounded-xl border border-rose-100 break-all">
                      「原因：{contract.rejectionReason || '未標註具體事由。'}」
                    </p>
                    {contract.goingHomeId === user?.uid && !isEditing && (
                      <Button 
                        onClick={() => setIsEditing(true)}
                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-full h-8 px-4 mt-3"
                      >
                        開始重新編輯調整此定期約條款
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {contract.status === 'Suspended' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h4 className="font-bold text-sm leading-tight">目前長期協定處於暫停掛起狀態</h4>
                    <p className="text-xs text-amber-700 font-sans mt-1">
                      定期排程與每期派單將不予自動觸發。
                    </p>
                  </div>
                </div>
              )}

              {/* Editing block inside (for resubmitting of rejected) */}
              {isEditing ? (
                <form onSubmit={handleResubmit} className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-200 animate-in fade-in duration-300">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-blue-500" />
                    修改條款重新提交草案
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-qty" className="text-xs font-bold text-slate-700">約定量</Label>
                      <Input 
                        id="edit-qty" 
                        type="number" 
                        min="1" 
                        value={editQuantity} 
                        onChange={e => setEditQuantity(Number(e.target.value))} 
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-unit" className="text-xs font-bold text-slate-700">單位</Label>
                      <Input 
                        id="edit-unit" 
                        value={editUnit} 
                        onChange={e => setEditUnit(e.target.value)} 
                        className="h-10 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 bg-white border p-1 rounded-xl">
                      {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditScheduleType(t)}
                          className={`py-1.5 rounded-lg text-xs font-bold ${editScheduleType === t ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400'}`}
                        >
                          {t === 'daily' ? '每日' : t === 'weekly' ? '每週' : '每月'}
                        </button>
                      ))}
                    </div>

                    {editScheduleType === 'weekly' && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[1, 2, 3, 4, 5, 6, 0].map(day => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDayOfWeek(day)}
                            className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold transition-all ${editDaysOfWeek.includes(day) ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white text-slate-500'}`}
                          >
                            {['日','一','二','三','四','五','六'][day]}
                          </button>
                        ))}
                      </div>
                    )}

                    {editScheduleType === 'monthly' && (
                      <div className="space-y-1">
                        <Label htmlFor="edit-day-month" className="text-xs">對齊日 (1 ~ 31)</Label>
                        <Input 
                          id="edit-day-month" 
                          type="number"
                          min="1"
                          max="31"
                          value={editDayOfMonth}
                          onChange={e => setEditDayOfMonth(Number(e.target.value))}
                          className="h-10 rounded-xl"
                        />
                      </div>
                    )}

                    <div className="space-y-1 mt-2">
                      <Label htmlFor="edit-time" className="text-xs">執行時間</Label>
                      <Input 
                        id="edit-time" 
                        type="time" 
                        value={editScheduleTime} 
                        onChange={e => setEditScheduleTime(e.target.value)} 
                        className="h-10 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2.5 justify-end">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={() => setIsEditing(false)}
                      className="rounded-full text-slate-400"
                    >
                      取消
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={resubmitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold px-5"
                    >
                      {resubmitting ? '重送中...' : '重送新條款並重置 signatures'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1 flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 pl-0.5">合約約定排程</span>
                      <p className="font-extrabold text-sm text-slate-800 leading-tight mt-0.5">
                        {contract.schedule.scheduleText}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                    <Coins className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 pl-0.5">每次約定交貨數量</span>
                      <p className="font-extrabold text-sm text-slate-800 leading-tight mt-0.5">
                        {contract.templateRecord.quantity} {contract.templateRecord.unit}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Timing constraints */}
              <div className="text-xs text-slate-400 border-t border-slate-100 pt-4 flex flex-wrap gap-x-6 gap-y-1">
                <span>下期排定生成日期：{contract.nextRunAt ? contract.nextRunAt.toDate().toLocaleString() : '尚未預訂'}</span>
                <span>上期實體單產出時間：{contract.lastGeneratedAt ? contract.lastGeneratedAt.toDate().toLocaleString() : '首期尚未運作'}</span>
              </div>

              {/* Signature Decision interface (for Pending Signatures status) */}
              {contract.status === 'Pending Signatures' && myRole && mySignStatus === 'Pending' && (
                <div className="border-t border-slate-150 pt-6 space-y-4 animate-in fade-in duration-300">
                  <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-2xl">
                    <h4 className="font-bold text-sm text-blue-900 flex items-center gap-1.5 pl-0.5">
                      <Handshake className="w-5 h-5 text-blue-600 animate-bounce" />
                      待您審核簽署此定期長約
                    </h4>
                    <p className="text-xs text-blue-700 font-medium leading-relaxed font-sans mt-1">
                      請仔細閱讀以上排定數量與自動派單週期。您同意後，合約會往「Active」邁進。若您對週期或數量有異議，請點退回。
                    </p>
                  </div>

                  {showRejectInput && (
                    <div className="space-y-2 py-2">
                      <Label htmlFor="reject-desc" className="text-xs font-bold text-rose-800 pl-0.5">駁回退回原因/對建議想法 (必填)</Label>
                      <Input 
                        id="reject-desc"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="請述明異議規格（例如：週一早上太忙，能否改成週二？）"
                        className="h-11 rounded-xl border-rose-200"
                      />
                    </div>
                  )}

                  <div className="flex gap-2.5 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => handleSign('Reject')}
                      className="rounded-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold px-6 h-10 border border-rose-100"
                    >
                      退回並駁回
                    </Button>
                    <Button
                      onClick={() => handleSign('Approve')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-6 h-10 shadow-md flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4 text-white" />
                      同意簽署契約
                    </Button>
                  </div>
                </div>
              )}

              {/* Active state controls - Suspend or pause contract */}
              {contract.status === 'Active' && myRole && (
                <div className="border-t border-slate-100 pt-6 space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="suspend-input" className="text-xs font-bold text-slate-700">計畫需要變更？安全掛起/暫停此長期契約</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="suspend-input"
                        value={suspendReason}
                        onChange={e => setSuspendReason(e.target.value)}
                        placeholder="請填寫暫停理由（如：出國兩週、資材整理箱更換中）"
                        className="h-11 rounded-xl border-slate-200"
                      />
                      <Button
                        onClick={handleSuspend}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-11 px-5 rounded-xl shrink-0 flex items-center gap-1"
                      >
                        <Pause className="w-4 h-4 fill-white text-white shrink-0" />
                        暫停
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Suspended state controls - Reactivate */}
              {contract.status === 'Suspended' && myRole && (
                <div className="border-t border-slate-100 pt-6 text-right animate-in fade-in duration-300">
                  <Button
                    onClick={handleReactivate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full h-11 px-6 shadow-md flex items-center gap-2 ml-auto"
                  >
                    <Play className="w-4 h-4 fill-white text-white shrink-0" />
                    發動協定重啟/重新多方簽署
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Real-time async messages discussion and Audit tab sub-system */}
          <Tabs defaultValue="discussion" className="w-full">
            <TabsList className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl h-11 border">
              <TabsTrigger value="discussion" className="font-bold text-xs rounded-lg py-1.5 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                三方對話與系統廣播 ({messages.length})
              </TabsTrigger>
              <TabsTrigger value="audit" className="font-bold text-xs rounded-lg py-1.5 flex items-center gap-2">
                <HistoryIcon className="w-4 h-4" />
                契約稽核日誌軌跡 ({history.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="discussion" className="space-y-4 pt-2">
              <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
                <CardContent className="p-0">
                  
                  {/* Messages Area */}
                  <div className="h-[280px] overflow-y-auto p-6 space-y-4 divide-y divide-slate-100/50">
                    {messages.length === 0 ? (
                      <p className="text-center py-20 text-xs text-slate-400 font-sans leading-relaxed">
                        目前尚無對話記錄。任何關於本約的審查意圖、系統廣播或協作流皆將保留在此，提供三方無縫非同步合作。
                      </p>
                    ) : (
                      messages.map((m, idx) => {
                        const isSys = m.senderId === 'SYSTEM';
                        const isMe = m.senderId === user?.uid;
                        
                        return (
                          <div key={m.id || idx} className={`pt-4 first:pt-0 ${isSys ? 'text-center' : ''}`}>
                            {isSys ? (
                              <div className="inline-block bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl text-[11px] leading-relaxed text-slate-500 font-bold max-w-[90%] text-left">
                                {m.content}
                              </div>
                            ) : (
                              <div className={`flex gap-3 items-start ${isMe ? 'justify-end' : ''}`}>
                                {!isMe && (
                                  <Avatar className="h-8 w-8 text-xs font-bold leading-none shrink-0 scale-90">
                                    <AvatarFallback className="bg-slate-200">{m.senderName?.[0]}</AvatarFallback>
                                  </Avatar>
                                )}
                                <div className={`max-w-[75%] space-y-1 ${isMe ? 'text-right' : ''}`}>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 justify-start">
                                    <span className="font-bold text-slate-600">{m.senderName}</span>
                                    <span>•</span>
                                    <span className="scale-90 font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded-md">
                                      {m.senderRole === 'MAKER_FISH' ? '梅克魚' : m.senderRole === 'GOING_HOME' ? '魟魚' : '瑞莎魺'}
                                    </span>
                                  </div>
                                  <div className={`p-3 rounded-2xl text-xs text-left leading-relaxed font-sans ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-50 border border-slate-150 text-slate-800 rounded-tl-none'}`}>
                                    {m.content}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Send panel */}
                  <form onSubmit={handleSendMessage} className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2.5">
                    <Input 
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder={myRole ? "留言、向協定夥伴提點或要求調整規格..." : "您並非本協定期權限內的代表夥伴"}
                      disabled={!myRole}
                      className="h-10 rounded-xl bg-white border-slate-200"
                    />
                    <Button
                      type="submit"
                      disabled={!newMessage.trim() || sendingMsg || !myRole}
                      className="bg-slate-900 hover:bg-slate-800 text-white shrink-0 rounded-xl h-10 w-10 p-0 flex items-center justify-center shadow-sm"
                    >
                      <Send className="w-4 h-4 text-white" />
                    </Button>
                  </form>

                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4 pt-2">
              <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
                <CardContent className="p-6 divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
                  {history.length === 0 ? (
                    <p className="text-center py-10 text-xs text-slate-400">目前尚無排程與協議歷史軌跡日誌</p>
                  ) : (
                    history.map((h, i) => (
                      <div key={h.id || i} className="py-3 first:pt-0 last:pb-0 text-slate-600 text-xs flex justify-between gap-4 items-start">
                        <div className="space-y-0.5">
                          <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                              {h.action}
                            </span>
                            <span>{h.operatorName} ({h.operatorRole === 'GOING_HOME' ? '魟魚' : h.operatorRole === 'MAKER_FISH' ? '梅克魚' : h.operatorRole === 'RECYCLER' ? '瑞莎魺' : '系統'})</span>
                          </p>
                          <p className="text-slate-500 text-[11px] font-sans break-all pl-1 pt-0.5">
                            說明：『{h.note || '無附加留言'}』
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono pt-1">
                          {h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString() : new Date().toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

        </div>

        {/* Right column (1-span): Participants Profile cards */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-slate-200/60 bg-white shadow-md sticky top-10 overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-light p-5">
              <CardTitle className="text-sm font-bold">合約三方簽暑狀態表</CardTitle>
              <CardDescription className="text-xs">
                定期契約生效前提，必須三方（梅克魚、魟魚、瑞莎魺）全體簽署 Approved。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-6 select-none">
              
              {/* Participant: Going Home Ray */}
              <div className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 ring-2 ring-blue-500/20">
                    <AvatarImage src={rayProf?.photoURL || undefined} />
                    <AvatarFallback>{rayProf?.displayName?.[0] || '魟'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">{rayProf?.displayName || '資源勾引魟'}</h4>
                    <p className="text-[10px] text-slate-400 font-sans">契約發起端 (魟魚)</p>
                  </div>
                </div>
                {contract.signatures.goingHome === 'Approved' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[10px] scale-90 px-2.5">同意 (Approved)</Badge>
                ) : contract.signatures.goingHome === 'Rejected' ? (
                  <Badge className="bg-rose-100 text-rose-800 border-none font-bold text-[10px] scale-90 px-2.5">駁回</Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-500 border-none font-bold text-[10px] scale-90 px-2.5">Pending</Badge>
                )}
              </div>

              {/* Participant: Maker Fish */}
              <div className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 ring-2 ring-cyan-400/20">
                    <AvatarImage src={makerProf?.photoURL || undefined} />
                    <AvatarFallback>{makerProf?.displayName?.[0] || '魚'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">{makerProf?.displayName || '資源梅克魚'}</h4>
                    <p className="text-[10px] text-slate-400 font-sans">資材供給端 (梅克魚)</p>
                  </div>
                </div>
                {contract.signatures.makerFish === 'Approved' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[10px] scale-90 px-2.5">同意 (Approved)</Badge>
                ) : contract.signatures.makerFish === 'Rejected' ? (
                  <Badge className="bg-rose-100 text-rose-800 border-none font-bold text-[10px] scale-90 px-2.5">駁回</Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-500 border-none font-bold text-[10px] scale-90 px-2.5">Pending</Badge>
                )}
              </div>

              {/* Participant: Recycler */}
              <div className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 ring-2 ring-amber-500/20">
                    <AvatarImage src={recyclerProf?.photoURL || undefined} />
                    <AvatarFallback>{recyclerProf?.displayName?.[0] || '魺'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">{recyclerProf?.displayName || '資源瑞莎魺'}</h4>
                    <p className="text-[10px] text-slate-400 font-sans">資材收購端 (瑞莎魺)</p>
                  </div>
                </div>
                {contract.signatures.recycler === 'Approved' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[10px] scale-90 px-2.5">同意 (Approved)</Badge>
                ) : contract.signatures.recycler === 'Rejected' ? (
                  <Badge className="bg-rose-100 text-rose-800 border-none font-bold text-[10px] scale-90 px-2.5">駁回</Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-500 border-none font-bold text-[10px] scale-90 px-2.5">Pending</Badge>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
