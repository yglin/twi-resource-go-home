import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, onSnapshot, query, collection, where, getDocs, GeoPoint } from 'firebase/firestore';
import { useAuth } from '../../App';
import { RecoveryRecord, UserProfile, RecordStatus, AppNotification, MasterDataResource } from '../../types';
import { updateDocument, listDocuments } from '../../services/firestoreService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Clock, Star, Navigation, CheckCircle2, Package, Loader2, Bell, X, AlertTriangle, Coins, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';

const isValidCoordinate = (coords: any): coords is { latitude: number; longitude: number } => {
  return !!coords && 
         typeof coords.latitude === 'number' && !isNaN(coords.latitude) &&
         typeof coords.longitude === 'number' && !isNaN(coords.longitude);
};

export default function RecordDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [record, setRecord] = useState<RecoveryRecord | null>(null);
  const [nearbyRays, setNearbyRays] = useState<UserProfile[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingRays, setLoadingRays] = useState(false);
  const [selectedRayId, setSelectedRayId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [confirmingRay, setConfirmingRay] = useState<UserProfile | null>(null);
  const [masterData, setMasterData] = useState<MasterDataResource[]>([]);
  const [showPriceWarning, setShowPriceWarning] = useState(false);

  const calculateEstimate = (rec: RecoveryRecord | null, masterList: MasterDataResource[]) => {
    try {
      if (!rec || !masterList) return 0;
      const match = masterList.find(
        m => m.material.trim().toLowerCase() === rec.materialCategory?.trim().toLowerCase() &&
             m.product.trim().toLowerCase() === rec.productCategory?.trim().toLowerCase()
      );
      if (!match) return 0;
      const avgPrice = match.avgPrice ?? 0;
      const estimatedWeight = match.estimatedWeight ?? 0;
      const price = avgPrice * estimatedWeight * rec.quantity;
      return isNaN(price) ? 0 : Number(price.toFixed(1));
    } catch (error) {
      return 0;
    }
  };

  // Address and coordinates edit states
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    listDocuments<MasterDataResource>('masterData_resources')
      .then(setMasterData)
      .catch(err => console.error('Failed to load master data:', err));
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'recoveryRecords', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as RecoveryRecord;
        if (data.expirationDate && data.status !== RecordStatus.COMPLETED && data.status !== RecordStatus.CANCELLED) {
          if (data.expirationDate?.toDate && data.expirationDate.toDate() < new Date()) {
            data.status = RecordStatus.CANCELLED;
            updateDocument('recoveryRecords', data.id, { status: RecordStatus.CANCELLED });
          }
        }
        setRecord(data);
        if (!hasInitialized) {
          setEditAddress(data.address || '');
          setEditLat(data.coordinates?.latitude?.toString() || '');
          setEditLng(data.coordinates?.longitude?.toString() || '');
          setHasInitialized(true);
        }
        if ((data.status === RecordStatus.JUST_BORN || data.status === RecordStatus.OPEN_FOR_ALL) && !data.selectedGoingHomeId) {
          findNearbyRays(data);
        }
      }
      setLoadingBase(false);
    }, (error) => {
      console.error("Failed to load recovery record: ", error);
      setLoadingBase(false);
    });
    return unsubscribe;
  }, [id, hasInitialized]);

  useEffect(() => {
    if (!id || !user) return;
    const qNotif = query(
      collection(db, 'notifications'), 
      where('recordId', '==', id),
      where('receiverId', '==', user.uid)
    );
    const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as AppNotification));
      // Sort desc
      list.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setNotifications(list);
    }, (error) => {
      console.error("Failed to load notifications: ", error);
    });
    return unsubscribeNotif;
  }, [id, user]);

  const findNearbyRays = async (rec: RecoveryRecord) => {
    setLoadingRays(true);
    try {
      // For demo purposes, we search all users and filter by GOING_HOME or RECYCLER.
      // In a real app with many users, use geohash bounds queries.
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      
      const rays = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.roles && (u.roles.includes('GOING_HOME' as any) || u.roles.includes('RECYCLER' as any)));
      
      // Filter by distance (using Ray's maxDistance, defaulting to 10km) and category compatibility (RecoveryGuides Filter)
      const filtered = rays.filter(ray => {
        // 1. Distance filter (Default to true if coordinates are missing on either side to match old design guarantee)
        let passDistance = true;
        if (isValidCoordinate(ray.coordinates) && isValidCoordinate(rec.coordinates)) {
          const distKm = distanceBetween(
            [rec.coordinates.latitude, rec.coordinates.longitude],
            [ray.coordinates.latitude, ray.coordinates.longitude]
          );
          const allowedMaxDistance = ray.maxDistance !== undefined && ray.maxDistance !== null ? ray.maxDistance : 10;
          passDistance = distKm <= allowedMaxDistance;
        }

        // 2. Category compatibility filter
        // Candidate user MUST have recoveryGuides containing exactly matching (material && product)
        const passCategory = ray.recoveryGuides?.some(guide => 
          guide.material === rec.materialCategory && 
          guide.product === rec.productCategory
        ) ?? false;

        return passDistance && passCategory;
      });

      setNearbyRays(filtered);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingRays(false);
    }
  };

  const handleSelectRay = async (rayId: string) => {
    if (!id) return;
    try {
      await updateDocument('recoveryRecords', id, {
        selectedGoingHomeId: rayId,
        status: RecordStatus.WAITING_FOR_COLLECTION,
        statusUpdatedAt: new Date()
      } as any);
      toast.success('已發送收運需求給此勾引魟！');
    } catch (error) {
      toast.error('操作失敗');
    }
  };

  const handleMakeOpenForAll = async () => {
    if (!id) return;
    try {
      await updateDocument('recoveryRecords', id, {
        status: RecordStatus.OPEN_FOR_ALL,
        statusUpdatedAt: new Date()
      } as any);
      toast.success('已將本筆記錄改為公開徵收狀態！');
    } catch (error) {
      toast.error('操作失敗，請重試');
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('您的瀏覽器不支援地理定位');
      return;
    }

    const toastId = toast.loading('正在定位中...');
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditLat(pos.coords.latitude.toFixed(6).toString());
        setEditLng(pos.coords.longitude.toFixed(6).toString());
        toast.dismiss(toastId);
        toast.success('已取得目前位置座標');
      }, 
      (err) => {
        toast.dismiss(toastId);
        console.error('Geolocation error:', err);
        let msg = '無法取得位置，請手動輸入';
        if (err.code === 1) msg = '請允許瀏覽器定位權限';
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveLocation = async () => {
    if (!id || !record) return;
    if (!editAddress) {
      toast.error('請輸入詳細地址');
      return;
    }
    if (!editLat || !editLng) {
      toast.error('請輸入座標緯度和經度');
      return;
    }

    const latitude = parseFloat(editLat);
    const longitude = parseFloat(editLng);
    if (isNaN(latitude) || isNaN(longitude)) {
      toast.error('請輸入有效的數字座標');
      return;
    }

    setSavingLocation(true);
    try {
      await updateDocument('recoveryRecords', id, {
        address: editAddress,
        coordinates: new GeoPoint(latitude, longitude)
      } as any);
      toast.success('地址與座標更新成功，重新尋找勾引魟中！');
    } catch (error) {
      console.error(error);
      toast.error('儲存失敗，請重試');
    } finally {
      setSavingLocation(false);
    }
  };

  if (loadingBase) return <div className="py-20 text-center">載入中...</div>;
  if (!record) return <div className="py-20 text-center">找不到此記錄</div>;

  return (
    <div className="pb-24 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate('/maker')} className="mb-6 rounded-full">
        <ArrowLeft className="w-5 h-5 mr-2" />
        返回列表
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Record Summary */}
        <div className="md:col-span-2 space-y-6">
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-lg">
            <div className="aspect-video relative">
              {record.imageUrl ? (
                <img src={record.imageUrl} alt={record.productCategory} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <Package className="w-16 h-16 stroke-1" />
                  <span className="text-sm font-medium text-slate-400">未提供物品照片</span>
                </div>
              )}
              <div className="absolute top-4 left-4">
                <Badge className="bg-slate-900/80 backdrop-blur-md border-none text-white px-4 py-1">
                  {record.status}
                </Badge>
              </div>
            </div>
            <CardContent className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{record.productCategory}</h1>
                  <p className="text-slate-500 font-medium text-lg">{record.materialCategory}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-center font-bold">
                    <span className="block text-4xl text-cyan-600 leading-none">{record.quantity}</span>
                    <span className="text-xs text-slate-400">數量 ({record.unit || '個'})</span>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-1 text-amber-600 bg-amber-50/80 border border-amber-100/50 rounded-xl px-2.5 py-1">
                    <span className="text-[10px] font-bold text-amber-700">預估收購價</span>
                    <span className="text-base font-black font-mono">
                      {calculateEstimate(record, masterData)}
                    </span>
                    <span className="text-[10px] text-amber-800 font-bold">元</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPriceWarning(true);
                      }}
                      className="p-0.5 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-100/50 transition-all ml-0.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-cyan-50 border border-cyan-100 p-6 rounded-2xl mb-8">
                <h3 className="text-cyan-800 font-bold mb-2 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  AI 回收指引
                </h3>
                <p className="text-cyan-700 leading-relaxed italic">「{record.aiSuggestion}」</p>
              </div>

              {record.unableToCollectReason && (
                <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl mb-8 animate-in fade-in duration-300">
                  <h3 className="text-rose-800 font-bold mb-2 flex items-center gap-2">
                    <X className="w-5 h-5 text-rose-600 bg-rose-100 rounded-full p-0.5 shrink-0" />
                    收運回報：勾引魟回報先前無法收取此物資
                  </h3>
                  <p className="text-rose-700 leading-relaxed font-semibold text-sm bg-white/60 p-3 rounded-xl border border-rose-100/50 break-all mb-2">
                    「{record.unableToCollectReason}」
                  </p>
                  <p className="text-xs text-rose-500 font-sans">
                    💡 您可以於下方進行地址或座標微調。修改並儲存後，您可以重新發送收運需求給附近的勾引魟。
                  </p>
                </div>
              )}

              <div className="space-y-4 text-slate-600">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                  <span>{record.address}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-slate-400 shrink-0" />
                  <span>建立於 {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleString() : '處理中...'}</span>
                </div>
                {record.expirationDate && (
                  <div className="flex items-center gap-3 text-amber-600 font-semibold">
                    <Clock className="w-5 h-5 shrink-0" />
                    <span>有效期限至 {record.expirationDate?.toDate ? record.expirationDate.toDate().toLocaleString() : '處理中...'}</span>
                  </div>
                )}
              </div>

              {record.status === RecordStatus.COMPLETED && (
                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                  <Button 
                    onClick={() => navigate(`/newRecycleContract?sourceId=${record.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold px-6 py-2.5 shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Coins className="w-5 h-5" />
                    立馬將此單轉為長期定期約
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notifications List for this record */}
          {notifications.length > 0 && (
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-md bg-white animate-in fade-in duration-300">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
                  <Bell className="w-5 h-5 text-cyan-600 animate-bounce" />
                  此記錄相關收運通知與歷程 ({notifications.length})
                </CardTitle>
                <CardDescription className="text-slate-500 font-sans mt-0.5">
                  所有關於本筆回收資材的自動系統通知、取消回報、與最新進度歷程
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 divide-y divide-slate-100">
                {notifications.map((notif) => (
                  <div key={notif.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex justify-between items-start gap-4">
                      <h4 className="font-bold text-slate-800 text-sm leading-snug">{notif.title}</h4>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-100 px-2 py-0.5 rounded-full">
                        {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 text-slate-600">
                      {notif.content}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(record.status === RecordStatus.JUST_BORN || record.status === RecordStatus.OPEN_FOR_ALL) && (
            <Card className="rounded-3xl border-slate-200 shadow-md overflow-hidden bg-white animate-in fade-in slide-in-from-bottom-4 duration-300">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
                  <MapPin className="w-5 h-5 text-cyan-600 animate-pulse" />
                  修改回收物放置地點
                </CardTitle>
                <CardDescription className="text-slate-500 font-sans mt-1">
                  若位置或座標有誤，您可在此進行修正，儲存後系統將自動重新搜尋合適的勾引魟！
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="edit-address" className="font-bold text-slate-700">詳細地址</Label>
                  <Input 
                    id="edit-address" 
                    value={editAddress} 
                    onChange={e => setEditAddress(e.target.value)} 
                    placeholder="例如：台北市信義區市民大道..." 
                    className="rounded-xl h-11 border-slate-200"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="font-bold text-slate-700">座標定位</Label>
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      onClick={getCurrentLocation} 
                      className="text-cyan-600 h-9 rounded-full bg-cyan-50 hover:bg-cyan-100 font-bold px-4"
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      定位目前位置
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="edit-lat" className="text-[10px] uppercase font-bold tracking-widest text-slate-400 pl-1">緯度 (Latitude)</Label>
                      <Input 
                        id="edit-lat" 
                        value={editLat} 
                        onChange={e => setEditLat(e.target.value)} 
                        className="rounded-xl h-11 border-slate-200 bg-white"
                        placeholder="25.033"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-lng" className="text-[10px] uppercase font-bold tracking-widest text-slate-400 pl-1">經度 (Longitude)</Label>
                      <Input 
                        id="edit-lng" 
                        value={editLng} 
                        onChange={e => setEditLng(e.target.value)} 
                        className="rounded-xl h-11 border-slate-200 bg-white"
                        placeholder="121.564"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button 
                    onClick={handleSaveLocation}
                    disabled={savingLocation}
                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-full transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {savingLocation ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        儲存中...
                      </>
                    ) : (
                      <>
                        儲存地點與座標修改
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Action / Status Section */}
        <div className="space-y-6">
          {(record.status === RecordStatus.JUST_BORN || record.status === RecordStatus.OPEN_FOR_ALL) && (
            <Card className="rounded-3xl border-slate-200 shadow-sm sticky top-8">
              <CardHeader>
                <CardTitle className="text-lg">尋找勾引魟</CardTitle>
                <CardDescription>選擇附近的勾引魟來收運此物資</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRays ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : nearbyRays.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    目前附近沒有可回收此類資源的勾引魟
                  </div>
                ) : (
                  <div className="space-y-4">
                    {nearbyRays.map(ray => {
                      const distKm = (isValidCoordinate(ray.coordinates) && isValidCoordinate(record?.coordinates))
                        ? distanceBetween(
                            [record.coordinates.latitude, record.coordinates.longitude],
                            [ray.coordinates.latitude, ray.coordinates.longitude]
                          )
                        : null;

                      const isRecycler = ray.roles?.includes('RECYCLER');
                      const matchedGuide = ray.recoveryGuides?.find(g => 
                        g.material === record?.materialCategory && 
                        g.product === record?.productCategory
                      );
                      const hasPrice = matchedGuide?.price !== undefined && matchedGuide?.price !== null;

                      return (
                        <div key={ray.id} className="p-4 rounded-2xl border border-slate-100 hover:border-cyan-200 hover:bg-cyan-50 transition-all cursor-pointer group" onClick={() => setConfirmingRay(ray)}>
                          <div className="flex items-center gap-3 mb-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={ray.photoURL} />
                              <AvatarFallback>{ray.displayName?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold truncate">{ray.displayName}</span>
                                {isRecycler && (
                                  <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 text-[10px] scale-90 border-none font-bold py-0 h-4.5">
                                    有償收購
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-[10px] text-slate-500 font-bold">4.9 (127+)</span>
                              </div>
                              {distKm !== null && (
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                  <Navigation className="w-3 h-3 text-cyan-600 shrink-0" />
                                  <span>距離：{distKm.toFixed(1)} km</span>
                                  <span className="text-slate-300">|</span>
                                  <span>最大範圍：{ray.maxDistance !== undefined && ray.maxDistance !== null ? `${ray.maxDistance} km` : '10 km'}</span>
                                </p>
                              )}
                              {hasPrice && (
                                <p className="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1 bg-amber-50 rounded-lg px-2 py-0.5 border border-amber-100/50 w-fit">
                                  <Coins className="w-3.5 h-3.5" />
                                  <span>收購價格：{matchedGuide.price} 元 / 公斤</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <Button className={`w-full rounded-full h-8 text-xs ${isRecycler ? 'bg-amber-500 hover:bg-amber-600 group-hover:bg-amber-600' : 'bg-slate-900 group-hover:bg-cyan-600'}`}>
                            {isRecycler ? '選擇收購變現' : '選擇收運'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {record.status === RecordStatus.JUST_BORN && (
                  <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                    <div className="text-xs text-slate-500 font-sans leading-relaxed">
                      💡 找不到合適的勾引魟？您也可以將此單「公開徵收」，讓附近所有符合材質規格的勾引魟皆能主動應徵接單！
                    </div>
                    <Button 
                      onClick={handleMakeOpenForAll}
                      className="w-full rounded-full bg-cyan-600 hover:bg-cyan-700 font-bold h-10 text-xs text-white shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Bell className="w-4 h-4 animate-pulse" />
                      將此回收記錄公開徵收
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm overflow-hidden sticky top-8">
            <div className="p-6">
              <h3 className="font-bold text-slate-900 mb-4">收運進度</h3>
              <div className="relative pl-8 space-y-8 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                <StatusStep 
                  label="記錄已產出" 
                  completed={true} 
                  active={record.status === RecordStatus.JUST_BORN} 
                />
                <StatusStep 
                  label="等待確認" 
                  completed={!!record.selectedGoingHomeId && record.status !== RecordStatus.JUST_BORN} 
                  active={record.status === RecordStatus.WAITING_FOR_COLLECTION} 
                />
                <StatusStep 
                  label="勾引魟已確認" 
                  completed={record.status === RecordStatus.COLLECTION_CONFIRMED || record.status === RecordStatus.PICKED_UP || record.status === RecordStatus.COMPLETED} 
                  active={record.status === RecordStatus.COLLECTION_CONFIRMED} 
                />
                <StatusStep 
                  label="物資已上車" 
                  completed={record.status === RecordStatus.PICKED_UP || record.status === RecordStatus.COMPLETED} 
                  active={record.status === RecordStatus.PICKED_UP} 
                />
                <StatusStep 
                  label="處理完成" 
                  completed={record.status === RecordStatus.COMPLETED} 
                  active={record.status === RecordStatus.COMPLETED} 
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 前置處理確認彈窗 (Prep Advice Confirmation Dialog) */}
      <Dialog open={!!confirmingRay} onOpenChange={(open) => { if (!open) setConfirmingRay(null); }}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-white p-6 border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 pb-1">
              <CheckCircle2 className="w-5 h-5 text-cyan-600 animate-bounce" />
              確認資材前置處理建議
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-sans text-sm">
              在委託「{confirmingRay?.displayName}」進行回收前，請先確認您已閱讀其指定的指引與條款。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
              <div className="flex items-center gap-2.5 mb-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={confirmingRay?.photoURL} />
                  <AvatarFallback>{confirmingRay?.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-bold text-slate-700">{confirmingRay?.displayName} 的專屬回收規劃</p>
                  <p className="text-[10px] text-slate-400 font-sans font-bold">{record?.materialCategory} ➔ {record?.productCategory}</p>
                </div>
              </div>

              {/* Find matched guide */}
              {(() => {
                const guide = confirmingRay?.recoveryGuides?.find(g => 
                  g.material === record?.materialCategory && 
                  g.product === record?.productCategory
                );
                const hasPrice = guide?.price !== undefined && guide?.price !== null;
                return (
                  <div className="space-y-2">
                    {hasPrice && (
                      <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 font-bold text-xs animate-in fade-in duration-300">
                        <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>收購價格：{guide.price} 元 / 公斤</span>
                      </div>
                    )}
                    {guide && guide.instructions ? (
                      <p className="text-sm text-cyan-800 leading-relaxed font-semibold font-sans italic bg-white p-3 rounded-xl border border-slate-100/50 break-all">
                        說明：「{guide.instructions}」
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 leading-relaxed italic bg-white p-3 rounded-xl border border-slate-100/50">
                        此物資之回收未包含特定處理指引。
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2.5 p-3.5 bg-yellow-50 border border-yellow-200/50 rounded-2xl items-start">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-900 leading-none">確認聲明</p>
                <p className="text-[11px] text-amber-700 leading-relaxed font-sans font-bold">
                  請確認您已經完成上述之前置處理建議。若與登載不符、或未依約整理，人員現場可能不予收運/收購。
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingRay(null)}
              className="rounded-full font-bold px-6 h-10 text-slate-400 hover:bg-slate-50"
            >
              再等一下
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (confirmingRay) {
                  const rId = confirmingRay.id;
                  setConfirmingRay(null);
                  await handleSelectRay(rId);
                }
              }}
              className="rounded-full font-bold px-6 h-10 bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              已完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function StatusStep({ label, completed, active }: any) {
  return (
    <div className={`relative flex items-center gap-4 ${active ? 'text-cyan-600 font-bold' : completed ? 'text-slate-600' : 'text-slate-400'}`}>
      <div className={`absolute -left-[27px] w-5 h-5 rounded-full flex items-center justify-center z-10 ${completed ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400 ring-4 ring-white'}`}>
        {completed ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-2 h-2 rounded-full bg-current" />}
      </div>
      <span className="text-sm">{label}</span>
      {active && <span className="ml-auto text-[10px] bg-cyan-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">當前</span>}
    </div>
  );
}
