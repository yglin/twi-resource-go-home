import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { updateDocument, listDocuments } from '../services/firestoreService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Fish, 
  Navigation, 
  Check, 
  MapPin, 
  Save, 
  ArrowLeft, 
  Package, 
  Info,
  ChevronRight,
  User,
  AlarmClock,
  Plus,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { GeoPoint } from 'firebase/firestore';
import { MasterDataResource, RecoveryGuide, AvailabilitySlot } from '../types';
import raySpeedIcon from '@/assets/images/ray_speed_icon_v2_1779524761425.png';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';

const VEHICLE_OPTIONS = [
  { id: 'trolley', label: '手推車 (Trolley)', icon: '🛒' },
  { id: 'bicycle', label: '自行車 (Bicycle)', icon: '🚲' },
  { id: 'motorcycle', label: '機車 (Motorcycle)', icon: '🛵' },
  { id: 'minivan', label: '廂型車 (Minivan)', icon: '🚐' },
  { id: 'truck', label: '小貨車 (Truck)', icon: '🛻' },
  { id: 'onfoot', label: '步行手提 (On Foot)', icon: '🚶' }
];

export default function ProfileSetup() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [step, setStep] = useState(profile?.roles?.length ? 2 : 1);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(profile?.roles || []);
  const [loading, setLoading] = useState(false);
  const [masterResources, setMasterResources] = useState<MasterDataResource[]>([]);

  // Form states for step 2
  const [activeTab, setActiveTab] = useState(profile?.roles?.includes('MAKER_FISH') ? 'maker' : 'going-home');
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [lat, setLat] = useState(profile?.coordinates?.latitude.toString() || '');
  const [lng, setLng] = useState(profile?.coordinates?.longitude.toString() || '');
  
  // Specific for Going Home
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>(profile?.acceptedCategories || []);
  const [recoveryGuides, setRecoveryGuides] = useState<RecoveryGuide[]>(profile?.recoveryGuides || []);
  const [vehicles, setVehicles] = useState<string[]>(profile?.vehicles || []);

  const toggleVehicle = (vehicleId: string) => {
    setVehicles(prev => 
      prev.includes(vehicleId) 
        ? prev.filter(v => v !== vehicleId) 
        : [...prev, vehicleId]
    );
  };

  // Specific for Maker Fish
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>(profile?.availabilitySlots || []);

  useEffect(() => {
    const fetchResources = async () => {
      const data = await listDocuments<MasterDataResource>('masterData_resources');
      setMasterResources(data);
      
      // If recoveryGuides are missing but categories exist, initialize them
      if (profile?.acceptedCategories?.length && (!profile?.recoveryGuides || profile.recoveryGuides.length === 0)) {
        const initialGuides = profile.acceptedCategories.map(catId => {
          const res = data.find(r => r.id === catId);
          return {
            resourceId: catId,
            material: res?.material || '',
            product: res?.product || '',
            instructions: res?.defaultSuggestion || ''
          };
        }).filter(g => g.resourceId);
        setRecoveryGuides(initialGuides);
      }
    };
    fetchResources();
  }, [profile]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleCategory = (categoryId: string) => {
    const resource = masterResources.find(r => r.id === categoryId);
    if (!resource) return;

    if (acceptedCategories.includes(categoryId)) {
      setAcceptedCategories(prev => prev.filter(id => id !== categoryId));
      setRecoveryGuides(prev => prev.filter(g => g.resourceId !== categoryId));
    } else {
      setAcceptedCategories(prev => [...prev, categoryId]);
      setRecoveryGuides(prev => [...prev, {
        resourceId: categoryId,
        material: resource.material,
        product: resource.product,
        instructions: resource.defaultSuggestion || ''
      }]);
    }
  };

  const updateGuideInstruction = (resourceId: string, instructions: string) => {
    setRecoveryGuides(prev => prev.map(g => 
      g.resourceId === resourceId ? { ...g, instructions } : g
    ));
  };

  const addSlot = () => {
    setAvailabilitySlots(prev => [...prev, { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }]);
  };

  const removeSlot = (index: number) => {
    setAvailabilitySlots(prev => prev.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof AvailabilitySlot, value: any) => {
    setAvailabilitySlots(prev => prev.map((slot, i) => i === index ? { ...slot, [field]: value } : slot));
  };

  const handleRolesUpdate = async () => {
    if (selectedRoles.length === 0 || !user) {
      toast.error('請至少選擇一種身份');
      return;
    }
    setLoading(true);
    try {
      await updateDocument('users', user.uid, {
        roles: selectedRoles,
      });
      await refreshProfile();
      setStep(2);
      toast.success('角色已更新，內容請繼續補全。');
    } catch (error) {
      console.error(error);
      toast.error('更新失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileComplete = async () => {
    const isGoingHome = selectedRoles.includes('GOING_HOME');
    const isMaker = selectedRoles.includes('MAKER_FISH');
    
    // Detailed validation
    const missingFields: { id: string; label: string; tab?: string }[] = [];
    
    if (!displayName) missingFields.push({ id: 'field-displayName', label: '顯示名稱' });
    if (!phone) missingFields.push({ id: 'field-phone', label: '聯絡電話' });
    if (!address) {
      const tab = isMaker ? 'maker' : 'going-home';
      missingFields.push({ id: `field-${tab}-address`, label: '詳細地址', tab });
    }
    if (!lat || !lng) {
      const tab = isMaker ? 'maker' : 'going-home';
      missingFields.push({ id: `field-${tab}-lat`, label: '座標定位', tab });
    }
    
    if (isGoingHome && acceptedCategories.length === 0) {
      missingFields.push({ id: 'field-categories-header', label: '資源類別', tab: 'going-home' });
    }

    if (missingFields.length > 0) {
      const first = missingFields[0];
      toast.error(`請填寫必要欄位：${first.label}`);
      
      if (first.tab) {
        setActiveTab(first.tab);
      }

      setTimeout(() => {
        const element = document.getElementById(first.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
        }
      }, 150);
      return;
    }

    setLoading(true);
    try {
      const updates: any = {
        roles: selectedRoles,
        displayName,
        address,
        phoneNumber: phone,
        coordinates: new GeoPoint(parseFloat(lat), parseFloat(lng))
      };

      if (isGoingHome) {
        updates.acceptedCategories = acceptedCategories;
        updates.recoveryGuides = recoveryGuides;
        updates.vehicles = vehicles;
        // Keep legacy field for compatibility if needed, but preferred is recoveryGuides
        updates.recycleNotes = recoveryGuides.map(g => `[${g.product}] ${g.instructions}`).join('\n');
      }

      if (selectedRoles.includes('MAKER_FISH')) {
        updates.availabilitySlots = availabilitySlots;
      }

      console.log('Starting profile update...', updates);
      await updateDocument('users', user!.uid, updates);
      
      console.log('Refreshing profile...');
      await refreshProfile();
      
      toast.success('個人資料補全成功！');
      const target = selectedRoles.includes('MAKER_FISH') ? '/maker' : '/going-home';
      console.log('Navigating to:', target);
      navigate(target, { replace: true });
    } catch (error: any) {
      console.error('Profile save error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Check for JSON error info from firestoreService
      try {
        const errJson = JSON.parse(errorMsg);
        toast.error(`儲存失敗: ${errJson.error || '權限不足'}`);
      } catch {
        toast.error('儲存失敗，請檢查網路連線或權限');
      }
    } finally {
      setLoading(false);
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
        setLat(pos.coords.latitude.toFixed(6).toString());
        setLng(pos.coords.longitude.toFixed(6).toString());
        toast.dismiss(toastId);
        toast.success('已取得目前位置座標');
      }, 
      (err) => {
        toast.dismiss(toastId);
        console.error('Geolocation error:', err);
        let msg = '無法取得位置，請手動輸入';
        if (err.code === 1) msg = '請允許瀏覽器定位權限';
        else if (err.code === 2) msg = '位置資訊不可用';
        else if (err.code === 3) msg = '定位請求超時';
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  if (step === 1) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2 text-center">選擇您的身份</h1>
          <p className="text-slate-500 mb-12 text-center text-lg">在開始之前，我們需要知道您將如何參與這個計畫。</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <Card 
              className={`cursor-pointer transition-all border-2 rounded-3xl overflow-hidden hover:shadow-2xl ${selectedRoles.includes('MAKER_FISH') ? 'border-cyan-500 ring-4 ring-cyan-500/10' : 'border-transparent'}`}
              onClick={() => toggleRole('MAKER_FISH')}
            >
              <CardHeader className="text-center p-8">
                <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 transition-colors ${selectedRoles.includes('MAKER_FISH') ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <Fish className="w-10 h-10" />
                </div>
                <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                  資源梅克魚
                  {selectedRoles.includes('MAKER_FISH') && <Check className="w-6 h-6 text-cyan-500" />}
                </CardTitle>
                <CardDescription className="text-base mt-2">我有資源需要回收，希望能找到人來幫我處理。</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-8">
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" /> 使用 AI 辨識回收物資</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" /> 紀錄並追蹤回收進度</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" /> 與附近的勾引魟聯繫</li>
                </ul>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all border-2 rounded-3xl overflow-hidden hover:shadow-2xl ${selectedRoles.includes('GOING_HOME') ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-transparent'}`}
              onClick={() => toggleRole('GOING_HOME')}
            >
              <CardHeader className="text-center p-8">
                <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 transition-colors ${selectedRoles.includes('GOING_HOME') ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <img 
                    src={raySpeedIcon} 
                    alt="資源勾引魟圖示" 
                    className="w-12 h-12 object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                  資源勾引魟
                  {selectedRoles.includes('GOING_HOME') && <Check className="w-6 h-6 text-blue-500" />}
                </CardTitle>
                <CardDescription className="text-base mt-2">我提供回收收運服務，想讓回收流程更有效率。</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-8">
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> 建立收運計畫與路徑規劃</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> 接收收運請求通知</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> 提供專業的回收指引</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center">
            <Button 
              disabled={selectedRoles.length === 0 || loading}
              onClick={handleRolesUpdate}
              className="rounded-full px-12 h-14 text-lg bg-slate-900 hover:bg-slate-800 transition-all shadow-xl disabled:opacity-30"
            >
              {loading ? '儲存中...' : '下一步：完善資料'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">完善個人資料</h1>
          <p className="text-slate-500">為了提供精準的回收服務，我們需要您的位置與聯絡資訊。</p>
        </header>

        <Card className="rounded-3xl border-slate-200 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-900 text-white p-8">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setStep(1)}
                className="text-white hover:bg-white/10 rounded-full"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <CardTitle>
                  {selectedRoles.includes('MAKER_FISH') && selectedRoles.includes('GOING_HOME') 
                    ? '完善雙重身份資料' 
                    : selectedRoles.includes('GOING_HOME') 
                      ? '完善資源勾引魟資料' 
                      : '完善資源梅克魚資料'}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {selectedRoles.includes('MAKER_FISH') && selectedRoles.includes('GOING_HOME')
                    ? '請填寫以下資訊以同時啟用收運與回收功能'
                    : selectedRoles.includes('MAKER_FISH')
                      ? '這些資訊將幫助勾引魟找到您的回收物並與您聯繫'
                      : '這些資訊將幫助梅克魚評估您的收運服務品質'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {/* Common Section: Basic Contact Info */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-slate-900 border-b pb-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <h3 className="font-bold">帳號基本資訊</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="field-displayName">顯示名稱 / 品牌名稱</Label>
                  <Input id="field-displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="例如：快樂回收魚" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="field-phone">聯絡電話</Label>
                  <Input id="field-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912345678" />
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-2xl p-1 bg-slate-100 mb-8">
                <TabsTrigger value="maker" className="rounded-xl py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Fish className="w-4 h-4 mr-2" />
                  資源梅克魚
                </TabsTrigger>
                <TabsTrigger value="going-home" className="rounded-xl py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <img 
                    src={raySpeedIcon} 
                    alt="資源勾引魟" 
                    className="w-5 h-5 mr-2 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  資源勾引魟
                </TabsTrigger>
              </TabsList>

              <TabsContent value="maker" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
                {!selectedRoles.includes('MAKER_FISH') ? (
                  <div className="p-12 text-center bg-cyan-50/30 rounded-3xl border-2 border-dashed border-cyan-200 animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Fish className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">您尚未啟用「資源梅克魚」身份</h4>
                    <p className="text-slate-500 mb-6 max-w-md mx-auto small text-sm">啟用梅克魚身份後，您可以上傳回收資源紀錄，並尋求勾引魟的收運協助。</p>
                    <Button 
                      onClick={() => setSelectedRoles(prev => [...prev, 'MAKER_FISH'])}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-full px-8 h-12 shadow-lg shadow-cyan-600/20"
                    >
                      我要當資源梅克魚
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div className="flex items-center gap-2 text-cyan-600 border-b border-cyan-100 pb-2">
                        <MapPin className="w-4 h-4" />
                        <h3 className="font-bold">回收物放置地點</h3>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="field-maker-address">詳細地址</Label>
                        <Input id="field-maker-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="台北市信義區..." />
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-medium text-slate-600">座標定位</Label>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={getCurrentLocation} 
                            className="text-cyan-600 h-9 rounded-full bg-cyan-50 hover:bg-cyan-100"
                          >
                            <MapPin className="w-4 h-4 mr-2" />
                            定位目前位置
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label htmlFor="field-maker-lat" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Latitude</Label>
                            <Input id="field-maker-lat" value={lat} onChange={e => setLat(e.target.value)} className="bg-white" />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="field-maker-lng" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Longitude</Label>
                            <Input id="field-maker-lng" value={lng} onChange={e => setLng(e.target.value)} className="bg-white" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Availability Slots Section */}
                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div className="flex items-center justify-between border-b border-cyan-100 pb-2">
                        <div className="flex items-center gap-2 text-cyan-600">
                          <AlarmClock className="w-4 h-4" />
                          <h3 className="font-bold">開放上門收運時段</h3>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={addSlot}
                          className="text-cyan-600 hover:bg-cyan-100 h-8 rounded-full px-3 text-xs"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          新增時段
                        </Button>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 font-sans">
                        請設定您方便讓勾引魟上門收取資源的時段。明確的時段能提高收運成功的機率。
                      </p>

                      <div className="space-y-3">
                        {availabilitySlots.length > 0 ? availabilitySlots.map((slot, index) => (
                          <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                              <select 
                                value={slot.dayOfWeek}
                                onChange={(e) => updateSlot(index, 'dayOfWeek', parseInt(e.target.value))}
                                className="w-full sm:w-auto bg-slate-50 border-none rounded-xl text-sm font-medium px-3 py-2.5 focus:ring-2 focus:ring-cyan-500/20"
                              >
                                <option value={1}>週一</option>
                                <option value={2}>週二</option>
                                <option value={3}>週三</option>
                                <option value={4}>週四</option>
                                <option value={5}>週五</option>
                                <option value={6}>週六</option>
                                <option value={0}>週日</option>
                              </select>
                              
                              <div className="flex flex-wrap items-center gap-2 flex-1">
                                <Input 
                                  type="time" 
                                  value={slot.startTime}
                                  onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                                  className="w-32 h-10 rounded-xl border-slate-100 shrink-0"
                                />
                                <span className="text-slate-400 shrink-0 text-sm">至</span>
                                <Input 
                                  type="time" 
                                  value={slot.endTime}
                                  onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                                  className="w-32 h-10 rounded-xl border-slate-100 shrink-0"
                                />
                              </div>
                            </div>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeSlot(index)}
                              className="self-end sm:self-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl h-10 w-10 shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )) : (
                          <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-3xl">
                            <p className="text-sm text-slate-400 mb-3 font-sans">尚未設定任何開放時段</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={addSlot}
                              className="rounded-full border-cyan-200 text-cyan-600 bg-cyan-50 hover:bg-cyan-100"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              立即新增
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="going-home" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
                {!selectedRoles.includes('GOING_HOME') ? (
                  <div className="p-12 text-center bg-blue-50/30 rounded-3xl border-2 border-dashed border-blue-200 animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <img 
                        src={raySpeedIcon} 
                        alt="資源勾引魟" 
                        className="w-10 h-10 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">您尚未啟用「資源勾引魟」身份</h4>
                    <p className="text-slate-500 mb-6 max-w-md mx-auto small text-sm">啟用勾引魟身份後，您可以查看鄰近的回收請求、規劃收運路徑並建立收運計畫。</p>
                    <Button 
                      onClick={() => setSelectedRoles(prev => [...prev, 'GOING_HOME'])}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 h-12 shadow-lg shadow-blue-600/20"
                    >
                      我要當資源勾引魟
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div className="flex items-center gap-2 text-blue-600 border-b border-blue-100 pb-2">
                        <MapPin className="w-4 h-4" />
                        <h3 className="font-bold">收運據點 / 服務地址</h3>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="field-going-home-address">通訊地址</Label>
                        <Input id="field-going-home-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="台北市信義區..." />
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-medium text-slate-600">座標定位</Label>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={getCurrentLocation} 
                            className="text-blue-600 h-9 rounded-full bg-blue-50 hover:bg-blue-100"
                          >
                            <MapPin className="w-4 h-4 mr-2" />
                            定位目前位置
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label htmlFor="field-going-home-lat" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Latitude</Label>
                            <Input id="field-going-home-lat" value={lat} onChange={e => setLat(e.target.value)} className="bg-white" />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="field-going-home-lng" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Longitude</Label>
                            <Input id="field-going-home-lng" value={lng} onChange={e => setLng(e.target.value)} className="bg-white" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div className="flex items-center gap-2 text-blue-600 border-b border-blue-100 pb-2">
                        <span className="text-lg">🚀</span>
                        <h3 className="font-bold">常用收運交通工具 (可複選)</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {VEHICLE_OPTIONS.map((opt) => {
                          const isSelected = vehicles.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleVehicle(opt.id)}
                              className={`flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left transition-all duration-200 outline-none ${
                                isSelected 
                                  ? 'border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm' 
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                              id={`setup-vehicle-opt-${opt.id}`}
                            >
                              <span className="text-xl shrink-0">{opt.icon}</span>
                              <span className="text-xs font-semibold">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div id="field-categories-header" className="space-y-3">
                        <div className="flex items-center gap-2 text-blue-600 border-b border-blue-100 pb-2">
                          <Package className="w-5 h-5" />
                          <Label className="font-bold text-base">收取的資源類別與處理規範</Label>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 font-sans">請選擇您收取的項目，並為每一項填寫專屬的前置處理建議。</p>
                        
                        <div className="space-y-4 mt-6">
                          {masterResources.map((res) => {
                            const isSelected = acceptedCategories.includes(res.id);
                            const guide = recoveryGuides.find(g => g.resourceId === res.id);

                            return (
                              <div 
                                key={res.id}
                                className={`rounded-3xl border-2 transition-all overflow-hidden ${
                                  isSelected 
                                    ? 'bg-white border-blue-500 shadow-lg' 
                                    : 'bg-white border-slate-100 hover:border-blue-200 opacity-60 hover:opacity-100'
                                }`}
                              >
                                <div 
                                  onClick={() => toggleCategory(res.id)}
                                  className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                                    isSelected ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${isSelected ? 'bg-white/20' : 'bg-slate-100'}`}>
                                      <Package className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                                    </div>
                                    <div>
                                      <p className="font-bold">{res.product}</p>
                                      <p className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                        {res.material}
                                      </p>
                                    </div>
                                  </div>
                                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                    isSelected ? 'bg-white border-white' : 'border-slate-200'
                                  }`}>
                                    {isSelected && <Check className="w-4 h-4 text-blue-500" />}
                                  </div>
                                </div>

                                {isSelected && (
                                  <div className="p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-2 text-blue-600 text-[11px] font-bold uppercase tracking-wider">
                                      <Info className="w-3 h-3" />
                                      前置處理建議
                                    </div>
                                    <Textarea 
                                      value={guide?.instructions || ''} 
                                      onChange={e => updateGuideInstruction(res.id, e.target.value)}
                                      placeholder={`請告訴梅克魚如何整理${res.product}...`}
                                      className="min-h-[100px] rounded-2xl border-slate-100 focus:border-blue-500 focus:ring-blue-500/10 text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-4 mt-6">
              <Button 
                variant="outline"
                onClick={() => navigate(profile?.roles?.includes('MAKER_FISH' as any) ? '/maker' : '/going-home')}
                disabled={loading}
                className="flex-1 h-14 rounded-full border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
              >
                取消
              </Button>
              <Button 
                onClick={handleProfileComplete} 
                disabled={loading}
                className="flex-[2] h-14 rounded-full bg-slate-900 hover:bg-slate-800 text-lg font-bold shadow-lg transition-all"
              >
                {loading ? '儲存中...' : (
                  <>
                    <Save className="w-5 h-5 mr-3" />
                    儲存設定
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
