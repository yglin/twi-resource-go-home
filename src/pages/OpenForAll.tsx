import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus, NotificationType, MasterDataResource } from '../types';
import { updateDocument, createDocument, listDocuments } from '../services/firestoreService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Waves, 
  MapPin, 
  Clock, 
  Calendar, 
  Check, 
  PackageOpen, 
  Package, 
  ArrowLeft, 
  Bell, 
  ChevronRight, 
  UserPlus, 
  LogIn,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { distanceBetween } from 'geofire-common';

const isValidCoordinate = (coords: any): coords is { latitude: number; longitude: number } => {
  return !!coords && 
         typeof coords.latitude === 'number' && !isNaN(coords.latitude) &&
         typeof coords.longitude === 'number' && !isNaN(coords.longitude);
};

export default function OpenForAll() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [publicRequests, setPublicRequests] = useState<RecoveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterData, setMasterData] = useState<MasterDataResource[]>([]);
  const [showPriceWarning, setShowPriceWarning] = useState(false);

  const calculateEstimate = (record: RecoveryRecord, masterList: MasterDataResource[]) => {
    try {
      if (!record || !masterList) return 0;
      const match = masterList.find(
        m => m.material.trim().toLowerCase() === record.materialCategory?.trim().toLowerCase() &&
             m.product.trim().toLowerCase() === record.productCategory?.trim().toLowerCase()
      );
      if (!match) return 0;
      const avgPrice = match.avgPrice ?? 0;
      const estimatedWeight = match.estimatedWeight ?? 0;
      const price = avgPrice * estimatedWeight * record.quantity;
      return isNaN(price) ? 0 : Number(price.toFixed(1));
    } catch (error) {
      return 0;
    }
  };

  useEffect(() => {
    listDocuments<MasterDataResource>('masterData_resources')
      .then(setMasterData)
      .catch(err => console.error('Failed to load master data:', err));
  }, []);

  useEffect(() => {
    // Query all records open for all
    const qPublic = query(
      collection(db, 'recoveryRecords'),
      where('status', '==', RecordStatus.OPEN_FOR_ALL)
    );

    const unsubscribe = onSnapshot(qPublic, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecoveryRecord));
      
      // Sort client-side by createdAt descending to avoid composite index requirements
      data.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setPublicRequests(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching public records:', error);
      toast.error('無法載入公開回收記錄，請重新整理');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAcceptPublicRequest = async (record: RecoveryRecord) => {
    if (!user) {
      toast.error('請先登入後再進行接單');
      navigate('/auth');
      return;
    }

    try {
      await updateDocument('recoveryRecords', record.id, {
        selectedGoingHomeId: user.uid,
        status: RecordStatus.COLLECTION_CONFIRMED,
        statusUpdatedAt: new Date()
      } as any);

      // Create notification for the Maker Fish
      const rayName = user.displayName || '資源勾引魟';
      await createDocument('notifications', {
        receiverId: record.makerFishId,
        type: NotificationType.SYSTEM,
        title: '【公開徵收已被接單】您的資材已有勾引魟確認收取！',
        content: `恭喜！您的公開徵收記錄 [${record.productCategory}]（數量: ${record.quantity} ${record.unit || '個'}）已被勾引魟「${rayName}」確認接單收取！\n\n收約載點：${record.address}\n兩方已建立收運連結，請貼心做好前置處理並耐心等候收取。`,
        recordId: record.id,
        isRead: false,
        createdAt: new Date()
      });

      toast.success('接單成功！已為您確認此筆收運，並已通知該資源梅克魚。');
    } catch (error) {
      console.error(error);
      toast.error('接單失敗，請重試');
    }
  };

  // Check if a record is compatible with the logged-in user's recovery guides
  const isCompatibleWithProfile = (record: RecoveryRecord) => {
    if (!profile) return true; // Guests can see everything
    if (!profile.roles.includes('GOING_HOME') && !profile.roles.includes('RECYCLER')) {
      return true; // Non-ray/non-recycler users can see everything
    }
    
    // If the ray profile has guides, check compatibility
    if (!profile.recoveryGuides || profile.recoveryGuides.length === 0) {
      return false; // Rays with no guides cannot match
    }

    return profile.recoveryGuides.some(guide => 
      guide.material === record.materialCategory && 
      guide.product === record.productCategory
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => navigate('/')} 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg tracking-widest">
            <Waves className="w-6 h-6 text-cyan-600 animate-pulse" />
            <span>資源勾引魟</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Button 
              onClick={() => {
                if (profile?.roles.includes('MAKER_FISH')) {
                  navigate('/maker');
                } else if (profile?.roles.includes('GOING_HOME') || profile?.roles.includes('RECYCLER')) {
                  navigate('/going-home');
                } else if (profile?.roles.includes('SYSTEM_ADMIN')) {
                  navigate('/admin');
                } else {
                  navigate('/setup');
                }
              }}
              className="rounded-full bg-slate-900 text-white font-bold text-xs px-5 h-9 hover:bg-slate-800 transition-colors"
            >
              我的控制台
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => navigate('/auth')} 
                variant="ghost" 
                className="rounded-full text-xs font-bold text-slate-600 h-9 px-4 hover:bg-slate-100"
              >
                <LogIn className="w-4 h-4 mr-1.5" />
                登入
              </Button>
              <Button 
                onClick={() => navigate('/auth')} 
                className="rounded-full bg-cyan-600 text-white font-bold text-xs h-9 px-5 hover:bg-cyan-700 shadow-md shadow-cyan-600/10"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                加入行列
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Banner Section */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white py-14 px-6 md:px-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="max-w-4xl mx-auto space-y-4 relative z-10">
          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-bold px-3 py-1 rounded-full animate-pulse">
            <Bell className="w-3.5 h-3.5 mr-1" />
            公開物資市場
          </Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            公開徵收資材專區
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm md:text-base font-medium leading-relaxed">
            此頁面展示所有由「資源梅克魚」申報並設定為「公開徵收」的回收物資。
            附近符合資格、領有回收指引的「資源勾引魟」皆可隨時在此接單、規劃最高效率收運計畫。
          </p>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 space-y-3">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold">正在潛入海底，載入最新公開物資...</p>
          </div>
        ) : publicRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm max-w-2xl mx-auto">
            <PackageOpen className="w-16 h-16 mb-4 text-slate-300 stroke-1" />
            <h3 className="text-lg font-bold text-slate-700">目前尚無公開徵收案件</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-md text-center">
              當前沒有處於「公開徵收」狀態的資源。歡迎梅克魚發布申報並開啟公開募集！
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-600" />
                最新開放物資 ({publicRequests.length})
              </h2>
              {profile && (profile.roles.includes('GOING_HOME') || profile.roles.includes('RECYCLER')) && (
                <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full font-medium">
                  經緯度：{profile.coordinates ? `${profile.coordinates.latitude.toFixed(2)}, ${profile.coordinates.longitude.toFixed(2)}` : '未設定'}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicRequests.map((request) => {
                const distKm = (isValidCoordinate(profile?.coordinates) && isValidCoordinate(request.coordinates))
                  ? distanceBetween(
                      [request.coordinates.latitude, request.coordinates.longitude],
                      [profile.coordinates.latitude, profile.coordinates.longitude]
                    )
                  : null;

                const isCompatible = isCompatibleWithProfile(request);
                const isRay = profile && (profile.roles.includes('GOING_HOME') || profile.roles.includes('RECYCLER'));

                return (
                  <Card 
                    key={request.id} 
                    className="rounded-3xl border-slate-200 overflow-hidden hover:shadow-xl transition-all duration-300 group flex flex-col bg-white"
                  >
                    {/* Record Image banner */}
                    <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden relative">
                      {request.imageUrl ? (
                        <img 
                          src={request.imageUrl} 
                          alt={request.productCategory} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Package className="w-14 h-14 stroke-1 text-slate-300" />
                      )}
                      <Badge className="absolute top-4 left-4 bg-cyan-500/90 text-white font-bold shadow-md">
                        公開徵收
                      </Badge>
                      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-black text-white shadow-sm">
                        {request.quantity} <span className="text-[10px] font-normal text-slate-300">{request.unit || '個'}</span>
                      </div>
                    </div>

                    <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-extrabold tracking-wider text-cyan-600 bg-cyan-50 border border-cyan-100 rounded px-2 py-0.5">
                            {request.materialCategory}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-lg text-slate-900 group-hover:text-cyan-600 transition-colors">
                            {request.productCategory}
                          </h3>
                          <div className="flex items-center gap-1 text-amber-600 font-bold bg-amber-50/60 border border-amber-100/50 rounded-lg px-2 py-0.5 shrink-0">
                            <span className="text-[10px] text-amber-700">估價</span>
                            <span className="text-xs font-black font-mono">
                              {calculateEstimate(request, masterData)}
                            </span>
                            <span className="text-[9px] text-amber-800">元</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPriceWarning(true);
                              }}
                              className="p-0.5 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-100/50 transition-all"
                            >
                              <AlertCircle className="w-3 h-3 shrink-0" />
                            </button>
                          </div>
                        </div>
                        {request.recycleNotes && (
                          <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-2xl line-clamp-2">
                            📝 {request.recycleNotes}
                          </p>
                        )}
                        
                        <div className="space-y-2 pt-2 text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="truncate" title={request.address}>
                              {request.address} {distKm !== null && `(約 ${distKm.toFixed(1)} km)`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>建立於 {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString() : '處理中...'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        {/* Conditional actions based on user auth & role */}
                        {!user ? (
                          <Button 
                            onClick={() => {
                              toast.info('請先登入後方可應徵接單');
                              navigate('/auth');
                            }}
                            className="w-full rounded-full bg-slate-900 hover:bg-slate-800 text-xs font-bold h-10"
                          >
                            <LogIn className="w-3.5 h-3.5 mr-1.5" />
                            登入以進行接單
                          </Button>
                        ) : isRay ? (
                          isCompatible ? (
                            <Button 
                              onClick={() => handleAcceptPublicRequest(request)}
                              className="w-full rounded-full bg-cyan-600 hover:bg-cyan-700 font-bold h-10 text-xs text-white shadow-md flex items-center justify-center gap-1.5"
                            >
                              <Check className="w-4 h-4" />
                              主動應徵接單
                            </Button>
                          ) : (
                            <div className="space-y-1.5">
                              <Button 
                                disabled
                                className="w-full rounded-full bg-slate-100 text-slate-400 cursor-not-allowed font-bold h-10 text-xs flex items-center justify-center gap-1.5 border border-slate-200"
                              >
                                材質規格不符
                              </Button>
                              <p className="text-[10px] text-center text-rose-500 font-medium">
                                ⚠️ 您的回收指引未包含「{request.materialCategory} - {request.productCategory}」
                              </p>
                            </div>
                          )
                        ) : (
                          <Button 
                            disabled
                            className="w-full rounded-full bg-slate-100 text-slate-400 cursor-not-allowed font-medium h-10 text-xs"
                          >
                            僅限勾引魟接單
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer support credits */}
      <footer className="bg-white border-t border-slate-200 py-8 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            &copy; 2026 資源勾引魟．幫助資源 Going Home
          </div>
          <div>
            看守台灣協會，<a href="https://www.taiwanwatch.org.tw/donation" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-600 underline transition-colors">請支持看守台灣</a>
          </div>
        </div>
      </footer>

      <Dialog open={showPriceWarning} onOpenChange={setShowPriceWarning}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-white p-6 border-slate-200 shadow-xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              收購價格估算說明
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-slate-600 font-medium text-sm leading-relaxed border-t border-slate-100">
            <p>請注意，此為粗略估計的收購價格，並非最終收購價格。<br/>若資料不足無法計算則顯示0元。</p>
          </div>
          <DialogFooter className="border-t border-slate-100 pt-4">
            <Button 
              onClick={() => setShowPriceWarning(false)} 
              className="rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold px-6"
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
