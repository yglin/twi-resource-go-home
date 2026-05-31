import React, { useEffect, useState } from 'react';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, Timestamp, GeoPoint, serverTimestamp } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus, GoingHomePlan, PlanStatus, PlanStop, NotificationType } from '../../types';
import { createDocument, updateDocument, listDocuments, getDocument } from '../../services/firestoreService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { 
  Route as RouteIcon, 
  MapPin, 
  Clock, 
  Calendar, 
  Navigation, 
  Check, 
  X, 
  Sparkles, 
  ChevronRight, 
  Loader2, 
  Car, 
  Phone, 
  HelpCircle,
  Inbox, 
  ArrowRight,
  User,
  Trash2,
  ThumbsUp,
  Map as MapIcon
} from 'lucide-react';
import { toast } from 'sonner';

export default function ActivePlan() {
  const { user, profile } = useAuth();
  
  // States
  const [loading, setLoading] = useState(true);
  const [availableRequests, setAvailableRequests] = useState<RecoveryRecord[]>([]);
  const [activePlan, setActivePlan] = useState<GoingHomePlan | null>(null);
  
  // Planning mode states
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [departureLocation, setDepartureLocation] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  
  // AI Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [planDraft, setPlanDraft] = useState<Partial<GoingHomePlan> | null>(null);
  
  // Execution states
  const [unableReasonRecordId, setUnableReasonRecordId] = useState<string | null>(null);
  const [unableReasonText, setUnableReasonText] = useState('');
  const [isSubmittingUnable, setIsSubmittingUnable] = useState(false);
  
  // Resolved stop records cache (to show maker fish info during draft preview or execution)
  const [recordCache, setRecordCache] = useState<Record<string, RecoveryRecord>>({});

  // Resolved maker user profiles cache
  const [makerProfiles, setMakerProfiles] = useState<Record<string, { displayName: string; phoneNumber?: string }>>({});

  useEffect(() => {
    const fetchMakerProfiles = async () => {
      // Collect all makerFishIds
      const idsToFetch = new Set<string>();
      
      availableRequests.forEach(r => {
        if (r.makerFishId) idsToFetch.add(r.makerFishId);
      });

      if (activePlan?.stops) {
        activePlan.stops.forEach(stop => {
          const rec = getRecordDetails(stop.recordId);
          if (rec?.makerFishId) {
            idsToFetch.add(rec.makerFishId);
          }
        });
      }

      // Filter out already fetched ones
      const missingIds = Array.from(idsToFetch).filter(id => !makerProfiles[id]);
      if (missingIds.length === 0) return;

      const updatedProfiles = { ...makerProfiles };
      let updated = false;

      for (const id of missingIds) {
        try {
          const profileDoc = await getDocument<any>('users', id);
          if (profileDoc) {
            updatedProfiles[id] = {
              displayName: profileDoc.displayName || '梅克魚用戶',
              phoneNumber: profileDoc.phoneNumber || ''
            };
            updated = true;
          }
        } catch (err) {
          console.error(`Failed to fetch user profile for ${id}:`, err);
        }
      }

      if (updated) {
        setMakerProfiles(updatedProfiles);
      }
    };

    fetchMakerProfiles();
  }, [availableRequests, activePlan, recordCache]);

  // 1. Initial data fetching
  useEffect(() => {
    if (!user) return;
    
    // Set default departure address from profile
    if (profile?.address) {
      setDepartureLocation(profile.address);
    } else {
      setDepartureLocation('資源收運調度中心');
    }
    
    // Default departure time is 1 hour from now
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    // Format to datetime-local string (YYYY-MM-DDTHH:mm)
    const formatted = nextHour.toISOString().slice(0, 16);
    setDepartureTime(formatted);

    // Subscribe to assigned recovery records
    const recordsQuery = query(
      collection(db, 'recoveryRecords'),
      where('selectedGoingHomeId', '==', user.uid)
    );

    const unsubscribeRecords = onSnapshot(recordsQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecoveryRecord));
      setAvailableRequests(records);
      
      // Update cache
      const newCache = { ...recordCache };
      records.forEach(r => {
        newCache[r.id] = r;
      });
      setRecordCache(newCache);
    });

    // Subscribe to Ray's plans
    const plansQuery = query(
      collection(db, 'goingHomePlans'),
      where('goingHomeId', '==', user.uid)
    );

    const unsubscribePlans = onSnapshot(plansQuery, (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoingHomePlan));
      
      // Find any non-completed plan
      const currentActive = plans.find(p => p.status === PlanStatus.APPROVED) || null;
      setActivePlan(currentActive);
      setLoading(false);
    });

    return () => {
      unsubscribeRecords();
      unsubscribePlans();
    };
  }, [user, profile]);

  // Request cache lookup helper
  const getRecordDetails = (id: string): RecoveryRecord | undefined => {
    return recordCache[id] || availableRequests.find(r => r.id === id);
  };

  // Toggle selection for route planning
  const handleToggleRequest = (id: string) => {
    if (selectedRequestIds.includes(id)) {
      setSelectedRequestIds(selectedRequestIds.filter(item => item !== id));
    } else {
      setSelectedRequestIds([...selectedRequestIds, id]);
    }
  };

  // 2. Call backend Route Planning AI
  const handlePlanRouteAI = async () => {
    if (selectedRequestIds.length === 0) {
      toast.error('請至少選擇一個收運請求來規劃計畫');
      return;
    }
    if (!departureLocation.trim()) {
      toast.error('請輸入計畫出發地點');
      return;
    }
    if (!departureTime) {
      toast.error('請選擇出發時間');
      return;
    }

    setIsGenerating(true);
    try {
      // Map selected records
      const selectedRecordsData = selectedRequestIds.map(id => {
        const r = getRecordDetails(id);
        return {
          id: r?.id,
          address: r?.address,
          productCategory: r?.productCategory,
          quantity: r?.quantity,
          unit: r?.unit || '個',
          recycleNotes: r?.recycleNotes || '',
          materialCategory: r?.materialCategory,
          timeWindow: r?.timeWindow || {},
          coordinates: r?.coordinates ? { latitude: r.coordinates.latitude, longitude: r.coordinates.longitude } : null
        };
      });

      const response = await fetch('/api/planning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departureLocation,
          departureTime: new Date(departureTime).toISOString(),
          records: selectedRecordsData,
          vehicles: profile?.vehicles || []
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || errData.error || 'Server error');
      }

      const aiResult = await response.json();
      
      // Generate the draft GoingHomePlan object
      const draftStops: PlanStop[] = aiResult.stops.map((stop: any) => ({
        recordId: stop.recordId,
        arrivalTime: Timestamp.fromDate(new Date(stop.arrivalTime)),
        status: 'PENDING',
        sortingOrder: stop.sortingOrder
      }));

      // Sort stops by sortingOrder
      draftStops.sort((a, b) => a.sortingOrder - b.sortingOrder);

      const generatedDraft: Partial<GoingHomePlan> = {
        goingHomeId: user?.uid,
        departureTime: Timestamp.fromDate(new Date(aiResult.plannedDepartureTime || departureTime)),
        transportationType: aiResult.transportationType || '輕型機車',
        stops: draftStops,
        routePolyline: aiResult.routePolyline || '已規劃最優路徑',
        status: PlanStatus.DRAFT,
        createdAt: Timestamp.now()
      };

      setPlanDraft(generatedDraft);
      toast.success('AI 路線調度規劃完成！');
    } catch (error: any) {
      console.error(error);
      toast.error('AI 規劃失敗: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Approve and commit Going Home Plan
  const handleApprovePlan = async () => {
    if (!planDraft || !user) return;

    try {
      const planId = await createDocument('goingHomePlans', {
        ...planDraft,
        status: PlanStatus.APPROVED,
        createdAt: serverTimestamp() as any
      }, undefined);

      // Successfully created plan. Now update each selected recovery records' status to COLLECTION_CONFIRMED
      const rayName = profile?.displayName || user.displayName || '資源勾引魟';
      
      for (const stop of planDraft.stops || []) {
        const record = getRecordDetails(stop.recordId);
        if (record) {
          // Update record status to collection confirmed
          await updateDocument('recoveryRecords', record.id, {
            status: RecordStatus.COLLECTION_CONFIRMED,
            statusUpdatedAt: new Date()
          } as any);

          // Add notification for the maker fish
          const arrivalStr = stop.arrivalTime.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
          await createDocument('notifications', {
            receiverId: record.makerFishId,
            type: NotificationType.PLAN_CONFIRMED,
            title: '【收運計畫已配置】勾引魟預計抵達時間確認！',
            content: `高效率快報！勾引魟「${rayName}」已將您的資源收運納入行程計畫中。\n\n出發時間：${planDraft.departureTime?.toDate().toLocaleString()}\n預計前往收取您的 [${record.productCategory}] 時間大約在 ${arrivalStr}。\n請確認該時段將資材放置於指定地址，感謝您的支持！`,
            recordId: record.id,
            planId: planId,
            isRead: false,
            createdAt: new Date()
          });
        }
      }

      setPlanDraft(null);
      setSelectedRequestIds([]);
      toast.success('計畫核准成功！已啟動收運導航任務，並自動發送行程卡給相關梅克魚。');
    } catch (err: any) {
      console.error(err);
      toast.error('無法核准並建立計畫，請稍後再試');
    }
  };

  // 4. Update the status of a specific stop during Execution
  const handleUpdateStopStatus = async (stopIndex: number, newStatus: 'ARRIVED' | 'SKIPPED') => {
    if (!activePlan) return;

    try {
      const updatedStops = [...activePlan.stops];
      const stop = updatedStops[stopIndex];
      stop.status = newStatus;

      // Update plan document in Firestore
      await updateDocument('goingHomePlans', activePlan.id, {
        stops: updatedStops
      });

      // Also update the recoveryRecord status
      const record = getRecordDetails(stop.recordId);
      if (record) {
        const nextRecordStatus = newStatus === 'ARRIVED' ? RecordStatus.PICKED_UP : RecordStatus.JUST_BORN;
        
        if (newStatus === 'ARRIVED') {
          await updateDocument('recoveryRecords', record.id, {
            status: nextRecordStatus,
            statusUpdatedAt: new Date()
          } as any);

          // Notify Maker Fish
          await createDocument('notifications', {
            receiverId: record.makerFishId,
            type: NotificationType.SYSTEM,
            title: '【物資已上車】您的回收資材已成功收取！',
            content: `勾引魟已安全抵達並完成確認！您的 [${record.productCategory}]（數量: ${record.quantity} ${record.unit || '個'}）目前已成功堆疊載運上車，正運往目的地處理場！`,
            recordId: record.id,
            planId: activePlan.id,
            isRead: false,
            createdAt: new Date()
          });
          toast.success('本站物資確認收取上車！已更新進度');
        } else {
          // If skipped, they chose unable to collect, which is handled in a dialog
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('更新狀態失敗，請重試');
    }
  };

  // Submit "Unable to Collect" and skip stop
  const handleConfirmUnableToCollect = async () => {
    if (!activePlan || !unableReasonRecordId || !unableReasonText.trim()) return;

    setIsSubmittingUnable(true);
    try {
      // 1. Revert record in recoveryRecords
      await updateDocument('recoveryRecords', unableReasonRecordId, {
        status: RecordStatus.JUST_BORN,
        selectedGoingHomeId: '',
        unableToCollectReason: unableReasonText.trim(),
        statusUpdatedAt: new Date() as any
      });

      // 2. Mark stop as SKIPPED in the active plan
      const updatedStops = [...activePlan.stops];
      const stopIndex = updatedStops.findIndex(s => s.recordId === unableReasonRecordId);
      if (stopIndex !== -1) {
        updatedStops[stopIndex].status = 'SKIPPED';
        await updateDocument('goingHomePlans', activePlan.id, {
          stops: updatedStops
        });
      }

      // 3. Notify Maker Fish
      await createDocument('notifications', {
        receiverId: getRecordDetails(unableReasonRecordId)?.makerFishId || '',
        type: NotificationType.SYSTEM,
        title: '【收運調整通知】這筆資源暫時因故無法收取',
        content: `勾引魟在前往收運 [${getRecordDetails(unableReasonRecordId)?.productCategory || '資材'}] 的途中因以下原因跳過收取，本筆記錄狀態已回歸「剛出生」：\n\n「${unableReasonText.trim()}」\n\n您可以檢視問題、修正備註或地圖定位後由其他勾引魟協助收載。`,
        recordId: unableReasonRecordId,
        isRead: false,
        createdAt: new Date()
      });

      toast.success('已跳過該站，物資狀態已安全回復，系統已通知梅克魚。');
      setUnableReasonRecordId(null);
      setUnableReasonText('');
    } catch (error) {
      console.error(error);
      toast.error('操作失敗');
    } finally {
      setIsSubmittingUnable(false);
    }
  };

  // 5. Complete whole plan / drop at destination
  const handleCompleteWholePlan = async () => {
    if (!activePlan) return;

    try {
      // Complete plan in Firestore
      await updateDocument('goingHomePlans', activePlan.id, {
        status: PlanStatus.COMPLETED
      });

      // For all ARRIVED stops, set record status to COMPLETED
      let completedCount = 0;
      for (const stop of activePlan.stops) {
        if (stop.status === 'ARRIVED') {
          const record = getRecordDetails(stop.recordId);
          if (record) {
            await updateDocument('recoveryRecords', record.id, {
              status: RecordStatus.COMPLETED,
              statusUpdatedAt: new Date()
            } as any);

            completedCount++;

            // Create system celebrate notification
            await createDocument('notifications', {
              receiverId: record.makerFishId,
              type: NotificationType.COLLECTION_COMPLETED,
              title: '【綠色任務圓滿圓融】回收物資已運抵環保目的地！',
              content: `感謝您為永續家園做出的努力！由您交付的 [${record.productCategory}]（數量: ${record.quantity} ${record.unit || '個'}）已安全運抵專業處理中心，順利進入循環工藝的奇蹟之旅！`,
              recordId: record.id,
              isRead: false,
              createdAt: new Date()
            });
          }
        }
      }

      toast.success(`恭喜！收運計畫圓滿完成。共處理 ${completedCount} 箱資材，大功告成！`);
      setActivePlan(null);
    } catch (error) {
      console.error(error);
      toast.error('完成計畫時出錯，請重試');
    }
  };

  if (loading) {
    return (
      <div className="p-8 h-full flex flex-col justify-center items-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-bold">載入收運資料中...</p>
      </div>
    );
  }

  // Determine current active stop inside execution
  const currentStopIndex = activePlan?.stops.findIndex(s => s.status === 'PENDING') ?? -1;
  const currentStop = currentStopIndex !== -1 ? activePlan?.stops[currentStopIndex] : null;
  const activeRecord = currentStop ? getRecordDetails(currentStop.recordId) : null;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      
      {/* ----------------- MODE 1: ACTIVE EXECUTION PATTERN ----------------- */}
      {activePlan ? (
        <div className="space-y-6">
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge className="bg-emerald-500 hover:bg-emerald-600 rounded-full text-xs font-bold px-3 py-0.5">收運任務執行中 🚚</Badge>
                <span className="text-xs font-mono text-slate-400">ID: {activePlan.id.slice(0, 8)}</span>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">我的收運計畫行程</h2>
              <p className="text-slate-500 text-sm mt-1">目前正在陸續前往各梅克魚指定地址，收集可回收資源。</p>
            </div>
            
            <Button
              onClick={handleCompleteWholePlan}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 px-6 rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <ThumbsUp className="w-5 h-5" />
              抵達環保站並完成計畫
            </Button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left: Stop Info details and Map preview */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* CURRENT ACTIVE STOP SECTION */}
              {activeRecord ? (
                <Card className="rounded-3xl border-blue-200 border-2 shadow-lg overflow-hidden bg-white animate-in slide-in-from-bottom duration-300">
                  <div className="bg-blue-600 p-6 text-white flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 text-xs opacity-90 font-bold uppercase tracking-widest mb-1">
                        <RouteIcon className="w-4 h-4" />
                        當前收取站點 (第 {currentStopIndex + 1} 站 / 共 {activePlan.stops.length} 站)
                      </div>
                      <h3 className="text-2xl font-black mt-2">{activeRecord.productCategory}</h3>
                      <span className="text-sm text-blue-100 font-medium">前置建議: {activeRecord.aiSuggestion}</span>
                    </div>
                    <div className="bg-blue-700 font-black px-4 py-2 rounded-2xl text-xl shrink-0 text-center">
                      {activeRecord.quantity}
                      <span className="text-xs font-bold block opacity-80">{activeRecord.unit || '個'}</span>
                    </div>
                  </div>

                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-4">
                      
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase">收取地址</p>
                          <p className="text-slate-800 font-extrabold text-base leading-snug mt-0.5">{activeRecord.address}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="flex items-start gap-3">
                          <Clock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-slate-400">預估到達時間</p>
                            <p className="text-slate-800 font-extrabold mt-0.5">
                              {currentStop?.arrivalTime?.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <User className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-slate-400">聯絡資訊 (梅克魚)</p>
                            <div className="text-slate-800 text-sm mt-0.5">
                              {activeRecord ? (
                                <div className="space-y-0.5">
                                  <p className="font-extrabold text-slate-900">
                                    {makerProfiles[activeRecord.makerFishId]?.displayName || '梅克魚客戶'}
                                  </p>
                                  {makerProfiles[activeRecord.makerFishId]?.phoneNumber ? (
                                    <a 
                                      href={`tel:${makerProfiles[activeRecord.makerFishId].phoneNumber}`}
                                      className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 hover:underline text-xs"
                                    >
                                      <Phone className="w-3.5 h-3.5 inline-block" />
                                      {makerProfiles[activeRecord.makerFishId].phoneNumber}
                                    </a>
                                  ) : (
                                    <p className="text-slate-400 text-xs">無提供聯絡電話</p>
                                  )}
                                </div>
                              ) : (
                                <span className="font-bold">梅克魚客戶</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {activeRecord.recycleNotes && (
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs text-slate-600 mt-2">
                          <span className="font-extrabold block text-slate-700 mb-1">梅克魚留言備註：</span>
                          「{activeRecord.recycleNotes}」
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${activeRecord.coordinates.latitude},${activeRecord.coordinates.longitude}`, '_blank')}
                        variant="outline"
                        className="flex-1 rounded-full border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold h-12 text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Navigation className="w-4 h-4 text-blue-600" />
                        Google Map 導航
                      </Button>
                      
                      <Button
                        onClick={() => handleUpdateStopStatus(currentStopIndex, 'ARRIVED')}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold h-12 rounded-full shadow-md flex items-center justify-center gap-2 transition-all"
                      >
                        <Check className="w-5 h-5" />
                        確認物資上車
                      </Button>

                      <Button
                        onClick={() => {
                          setUnableReasonRecordId(activeRecord.id);
                          setUnableReasonText('');
                        }}
                        variant="ghost"
                        className="rounded-full text-red-500 hover:text-red-650 hover:bg-red-50 font-bold h-12 text-xs flex items-center justify-center gap-1 shrink-0 px-4"
                      >
                        <X className="w-4 h-4" />
                        無法收取
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl flex flex-col items-center justify-center text-center">
                  <div className="bg-emerald-100 p-4 rounded-full mb-4">
                    <Check className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-800">所有安排站點均操作完畢</h3>
                  <p className="text-emerald-600/80 text-sm max-w-sm mt-2">
                    太棒了！所有收運點皆已處理（收取完成或選擇跳過）。請點擊右上角「抵達環保站並完成計畫」將資材送運並正式完工！
                  </p>
                </div>
              )}

              {/* DYNAMIC ROUTE MAP DISPLAY (SVG INTERACTIVE) */}
              <Card className="rounded-3xl border-slate-200 overflow-hidden bg-white shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
                      <MapIcon className="w-5 h-5 text-blue-500" />
                      收運航線雷達圖 (模擬)
                    </CardTitle>
                    <CardDescription className="text-xs">各收取站的地理關係坐標</CardDescription>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {activePlan.transportationType}
                  </Badge>
                </CardHeader>
                <CardContent className="p-6 flex justify-center bg-slate-950 h-64 relative overflow-hidden flex-col">
                  {/* SVG background grid lines to match deep ocean slate feeling */}
                  <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#0284c7_1px,transparent_1px),linear-gradient(to_bottom,#0284c7_1px,transparent_1px)] bg-[size:16px_16px]" />
                  
                  {/* Drawing coords simulation in beautiful vector lines */}
                  <svg className="w-full h-full absolute inset-0 z-10 p-8" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Path line rendering */}
                    <path
                      d="M 10 50 Q 30 20 60 40 T 90 80"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.5)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      className="animate-[dash_10s_linear_infinite]"
                      style={{
                        strokeDasharray: '6',
                        animation: 'dash 15s linear infinite'
                      }}
                    />
                    {/* Node points */}
                    <circle cx="10" cy="50" r="4" fill="#60a5fa" />
                    <circle cx="35" cy="25" r="4" fill="#38bdf8" />
                    <circle cx="65" cy="45" r="4" fill="#818cf8" />
                    <circle cx="90" cy="80" r="4" fill="#34d399" />
                  </svg>

                  <div className="z-20 text-center text-xs text-sky-200 space-y-1 select-none">
                    <p className="font-bold tracking-widest text-[#38bdf8]">資源勾引魟專屬・路徑最佳化模型已渲染</p>
                    <p className="text-slate-400 text-[10px]">自動排程交通工具: {activePlan.transportationType}</p>
                  </div>
                  
                  {/* Overlay tags */}
                  <div className="absolute bottom-4 left-4 z-20 flex gap-2">
                    <span className="flex items-center gap-1 text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" /> 基地
                    </span>
                    <span className="flex items-center gap-1 text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" /> 收取點
                    </span>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right: Steps lists progress */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="font-bold text-slate-800 text-sm tracking-wider uppercase pl-2">收運流程節點 ({activePlan.stops.length} 站)</h3>
              
              <div className="space-y-3 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
                {activePlan.stops.map((stop, index) => {
                  const item = getRecordDetails(stop.recordId);
                  const isCurrent = index === currentStopIndex;
                  const isCompleted = stop.status === 'ARRIVED';
                  const isSkipped = stop.status === 'SKIPPED';

                  return (
                    <div key={stop.recordId} className={`flex gap-4 items-start relative z-10 transition-opacity duration-300 ${isCurrent ? 'opacity-100 scale-[1.01]' : 'opacity-70'}`}>
                      {/* Left icon timeline indicators */}
                      <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center border-2 shadow-sm ${
                        isCompleted ? 'bg-emerald-100 border-emerald-500 text-emerald-600' :
                        isSkipped ? 'bg-slate-100 border-slate-300 text-slate-400' :
                        isCurrent ? 'bg-blue-600 border-blue-600 text-white animate-pulse' :
                        'bg-white border-slate-200 text-slate-400'
                      }`}>
                        {isCompleted ? <Check className="w-5 h-5" /> : 
                         isSkipped ? <X className="w-5 h-5" /> : 
                         <span className="font-extrabold text-sm">{index + 1}</span>}
                      </div>

                      {/* Content Card */}
                      <div className={`flex-1 p-4 rounded-2xl border ${
                        isCurrent ? 'bg-blue-50/50 border-blue-100 shadow-md' : 'bg-white border-slate-100'
                      }`}>
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-850 text-sm">
                            {item?.productCategory || '讀取中...'}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-400">
                            {stop.arrivalTime?.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1 truncate max-w-[180px]">{item?.address || '讀取地址中...'}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={`text-[10px] ${
                            isCompleted ? 'border-emerald-100 text-emerald-650 bg-emerald-50/50' :
                            isSkipped ? 'border-slate-100 text-slate-500 bg-slate-50' :
                            isCurrent ? 'border-blue-200 text-blue-600 bg-blue-50' :
                            'border-slate-100 text-slate-400'
                          }`}>
                            {isCompleted ? '已上車' : isSkipped ? '已跳過' : isCurrent ? '即將收取' : '待處理'}
                          </Badge>
                          <span className="text-[10px] font-bold text-slate-500 font-mono">數量: {item?.quantity || 0} {item?.unit || '個'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>

        </div>
      ) : planDraft ? (
        
        /* ----------------- MODE 2: DRAFT PREVIEW STATE ----------------- */
        <div className="space-y-6">
          <header>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge className="bg-amber-500 hover:bg-amber-600 rounded-full text-xs font-bold px-3 py-0.5">計畫草稿審核中 ✏️</Badge>
              <span className="text-xs font-mono text-slate-400">AI 路線演算法模型</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">審查調度收運計畫進度</h2>
            <p className="text-slate-500 text-sm mt-1">請審閱收載順序、時間點配置和車載工具。核准後將正式上線並通知梅克魚。</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Draft Timeline details */}
            <div className="lg:col-span-7 space-y-6 text-slate-800">
              
              <Card className="rounded-3xl border-slate-200 bg-white overflow-hidden shadow-sm">
                <CardHeader className="bg-slate-900 text-white p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sky-300 text-xs font-bold uppercase tracking-widest block">AI 最優指派調配</span>
                      <CardTitle className="text-xl font-bold mt-1">收載作業明細概覽</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                      <Car className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold">{planDraft.transportationType}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold">預估出發時間</span>
                      <span className="text-slate-800 font-extrabold text-sm mt-0.5">
                        {planDraft.departureTime?.toDate().toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">計畫站點總數</span>
                      <span className="text-slate-800 font-extrabold text-sm mt-0.5">
                        {planDraft.stops?.length || 0} 個收取點
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wide block">排程時間序列</span>
                    
                    <div className="space-y-3 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                      {planDraft.stops?.map((stop, idx) => {
                        const item = getRecordDetails(stop.recordId);
                        return (
                          <div key={stop.recordId} className="flex gap-4 items-center relative pl-1">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 flex justify-between items-center bg-slate-50 hover:bg-slate-100/50 p-3 rounded-xl hover:shadow-xs transition-all border border-slate-100 text-xs min-w-0 gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="font-extrabold text-slate-800 block truncate">{item?.productCategory}</span>
                                <span className="text-slate-400 block truncate mt-0.5 max-w-[120px] xs:max-w-[160px] sm:max-w-[220px]" title={item?.address}>{item?.address}</span>
                              </div>
                              <div className="text-right shrink-0 min-w-fit">
                                <span className="font-extrabold text-blue-600 block whitespace-nowrap">
                                  {stop.arrivalTime?.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-slate-400 text-[10px] block whitespace-nowrap">數量: {item?.quantity} {item?.unit || '個'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => setPlanDraft(null)}
                  variant="outline"
                  className="flex-1 rounded-full border-slate-200 h-12 font-bold hover:bg-slate-50 text-slate-600 transition-all"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  捨棄並重新規劃
                </Button>
                <Button 
                  onClick={handleApprovePlan}
                  className="flex-1 rounded-full bg-blue-600 hover:bg-blue-700 font-bold h-12 text-white shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Check className="w-4 h-4 mr-2" />
                  核准並啟動收運計畫
                </Button>
              </div>

            </div>

            {/* Right side helper info */}
            <div className="lg:col-span-5 bg-blue-50 border border-blue-100 p-6 rounded-3xl h-fit space-y-4">
              <div className="flex gap-2 text-blue-700 font-bold text-base items-center">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3>永續 AI 調度提示資訊</h3>
              </div>
              <p className="text-blue-600/90 text-xs leading-relaxed">
                本系統在取得您的出發位置與各梅克魚點位配置後，會考量：
              </p>
              <ul className="text-blue-600/90 text-xs space-y-2 list-disc pl-4 font-medium">
                <li>各點梅克魚交付時段相容性。</li>
                <li>最短的拓撲公路幾何行程。</li>
                <li>建議最環保省力的運具工具 (本趟 AI 為您適配：<strong>{planDraft.transportationType}</strong>)。</li>
              </ul>
              <div className="pt-2 border-t border-blue-100 text-[10px] text-blue-500">
                核准此計畫後，系統將在背景通知所有梅克魚，讓他們做好準備，做好瓶罐沖洗，讓綠色連結更順暢。
              </div>
            </div>
          </div>
        </div>

      ) : (
        
        /* ----------------- MODE 3: PLANNING MODE ----------------- */
        <div className="space-y-6">
          <header>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">規劃資源收運計畫</h2>
            <p className="text-slate-500 text-sm mt-1">選取被分派給您的收運任務，並使用 AI 調度物流工具與收取順序。</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left side inputs and selecting requests list */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Departure config metadata */}
              <Card className="rounded-3xl border-slate-200 overflow-hidden bg-white shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                  <CardTitle className="text-base font-bold text-slate-800">出發參數設定</CardTitle>
                  <CardDescription className="text-xs">輸入本趟計畫之基準起點與預設起跑時間</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dep-loc" className="font-bold text-xs text-slate-500 uppercase tracking-wider">出發站點 / 地址</Label>
                      <Input
                        id="dep-loc"
                        value={departureLocation}
                        onChange={e => setDepartureLocation(e.target.value)}
                        className="rounded-xl border-slate-200"
                        placeholder="例如：台北市松山區收運中心"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dep-time" className="font-bold text-xs text-slate-500 uppercase tracking-wider">出發時間點</Label>
                      <Input
                        id="dep-time"
                        type="datetime-local"
                        value={departureTime}
                        onChange={e => setDepartureTime(e.target.value)}
                        className="rounded-xl border-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Checkbox selectable requests list */}
              <div className="space-y-3">
                <div className="flex justify-between items-center pl-1 font-bold">
                  <span className="text-slate-800 text-sm">選取待收運物資 ({availableRequests.filter(r => r.status === RecordStatus.COLLECTION_CONFIRMED).length} 件待規劃)</span>
                  <button 
                    onClick={() => {
                      const allIds = availableRequests
                        .filter(r => r.status === RecordStatus.COLLECTION_CONFIRMED)
                        .map(r => r.id);
                      setSelectedRequestIds(selectedRequestIds.length === allIds.length ? [] : allIds);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {selectedRequestIds.length === availableRequests.filter(r => r.status === RecordStatus.COLLECTION_CONFIRMED).length ? '清除全選' : '全選可規劃項目'}
                  </button>
                </div>

                {availableRequests.filter(r => r.status === RecordStatus.COLLECTION_CONFIRMED).length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400">
                    <Inbox className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-sm font-bold">目前無指定給您的可用收取任務</p>
                    <p className="text-xs text-slate-450 mt-1 max-w-xs text-center">梅克魚在建立記錄、並選定「候選魟」後勾選指定您，您即可在此規划它。</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableRequests
                      .filter(r => r.status === RecordStatus.COLLECTION_CONFIRMED)
                      .map(req => {
                        const isSelected = selectedRequestIds.includes(req.id);
                        return (
                          <div 
                            key={req.id} 
                            onClick={() => handleToggleRequest(req.id)}
                            className={`flex gap-4 p-4 rounded-3xl border-2 cursor-pointer transition-all ${
                              isSelected 
                                ? 'bg-blue-50/40 border-blue-600 shadow-sm' 
                                : 'bg-white border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            {/* Visual Checkbox */}
                            <div className="pt-1.5 shrink-0">
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                                isSelected ? 'bg-blue-600 text-white' : 'border border-slate-350 bg-slate-50'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5" />}
                              </div>
                            </div>

                            {/* Details of the items */}
                            <div className="flex-1 flex gap-4 min-w-0">
                              <img src={req.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0" referrerPolicy="no-referrer" />
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className="font-extrabold text-sm text-slate-900 truncate" title={req.productCategory}>{req.productCategory}</h4>
                                  <span className="font-extrabold text-blue-600 text-sm">x {req.quantity} {req.unit || '個'}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1 truncate" title={req.address}>{req.address}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  <Badge variant="outline" className="text-[10px] rounded-full border-slate-200 text-slate-500">
                                    {req.materialCategory}
                                  </Badge>
                                  {req.status === RecordStatus.COLLECTION_CONFIRMED && (
                                    <Badge className="text-[10px] bg-indigo-50 border-indigo-200 text-indigo-600">
                                      已確認收運但待調度
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

            </div>

            {/* Right side prompt workspace */}
            <div className="lg:col-span-5 space-y-6">
              
              <Card className="rounded-3xl border-slate-200 overflow-hidden bg-white shadow-sm h-fit">
                <CardHeader className="bg-slate-900 text-white p-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <CardTitle className="text-base font-bold">自動物流路線最優化</CardTitle>
                      <CardDescription className="text-slate-400 text-xs">交由訓練有素的經理人 AI 引擎分配順序與安排時段</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3 text-xs leading-relaxed text-slate-600">
                    <p>
                      勾引魟收載計畫將自動執行以下：
                    </p>
                    <ul className="list-disc pl-4 space-y-1.5 font-medium">
                      <li>依距離計算合理行車軌跡。</li>
                      <li>調校符合每位梅克魚的自選時間，避免撲空。</li>
                      <li>自動推動記錄狀態，讓客戶好追蹤。</li>
                    </ul>
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <Button
                      onClick={handlePlanRouteAI}
                      disabled={isGenerating || selectedRequestIds.length === 0}
                      className="w-full bg-blue-600 hover:bg-blue-700 font-extrabold text-sm h-12 rounded-full shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          AI 加速調度中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-white" />
                          規劃資源勾引計畫 ({selectedRequestIds.length} 箱)
                        </>
                      )}
                    </Button>
                    <span className="block text-[10px] text-center text-slate-400 mt-2">請至少勾選一箱物資後發起 AI 調配</span>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>

      )}

      {/* Unable to Collect explanation Dialog (Execution view) */}
      <Dialog open={!!unableReasonRecordId} onOpenChange={(open) => { if (!open) setUnableReasonRecordId(null); }}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-white p-6 border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 animate-pulse">
              <X className="w-5 h-5 text-red-650" />
              說明因何跳過無法收取
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              請填寫未能在本趟計畫收取該梅克魚資材的理由，系統將把此記錄重設為待處理，並通知對方。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            <Label htmlFor="execution-unable-reason" className="font-bold text-slate-700 text-xs">理由說明（必填）</Label>
            <Textarea
              id="execution-unable-reason"
              placeholder="請簡述原因（例如：找不到資材、聯絡不通、材料被雨淋濕、數量有大落差等）..."
              value={unableReasonText}
              onChange={(e) => setUnableReasonText(e.target.value)}
              className="rounded-xl border-slate-200 h-28 resize-none focus-visible:ring-red-100 placeholder:text-slate-350"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-100 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUnableReasonRecordId(null)}
              disabled={isSubmittingUnable}
              className="rounded-full font-bold px-6 h-10 text-slate-500 hover:bg-slate-100"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleConfirmUnableToCollect}
              disabled={isSubmittingUnable || !unableReasonText.trim()}
              className="rounded-full font-bold px-6 h-10 bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center gap-2 transition-all"
            >
              {isSubmittingUnable ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  發布中...
                </>
              ) : (
                '確認跳過'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
