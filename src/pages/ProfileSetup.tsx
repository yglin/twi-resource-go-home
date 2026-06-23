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
  Trash2,
  Coins,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { GeoPoint } from 'firebase/firestore';
import { MasterDataResource, RecoveryGuide, AvailabilitySlot } from '../types';
import raySpeedIcon from '@/assets/images/ray_speed_icon_v2_1779524761425.png';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';

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
  
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    const roles = profile?.roles || [];
    if (!roles.includes('MAKER_FISH')) {
      return [...roles, 'MAKER_FISH'];
    }
    return roles;
  });
  const [step, setStep] = useState(() => {
    if (profile?.displayName && profile?.address && profile?.phoneNumber) {
      return 2;
    }
    return 1;
  });
  const [loading, setLoading] = useState(false);
  const [masterResources, setMasterResources] = useState<MasterDataResource[]>([]);

  // Form states for step 2
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [lat, setLat] = useState(profile?.coordinates?.latitude.toString() || '');
  const [lng, setLng] = useState(profile?.coordinates?.longitude.toString() || '');
  
  // Specific for Going Home
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>(profile?.acceptedCategories || []);
  const [recoveryGuides, setRecoveryGuides] = useState<RecoveryGuide[]>(profile?.recoveryGuides || []);
  const [vehicles, setVehicles] = useState<string[]>(profile?.vehicles || []);
  const [maxDistance, setMaxDistance] = useState(profile?.maxDistance?.toString() || '');

  // Dialog state logic
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [tempInstructions, setTempInstructions] = useState('');
  const [tempUnit, setTempUnit] = useState('個');
  const [tempPrice, setTempPrice] = useState('');

  const uniqueMaterials = Array.from(new Set(masterResources.map(r => r.material))).filter(Boolean);
  const productsForMaterial = masterResources.filter(r => r.material === selectedMaterial);

  const openAddCategoryDialog = () => {
    const initialMaterial = uniqueMaterials[0] || '';
    setSelectedMaterial(initialMaterial);
    setSelectedProductId('');
    setTempInstructions('');
    setTempUnit('個');
    setTempPrice('');
    setIsAddDialogOpen(true);
  };

  const handleMaterialChange = (material: string) => {
    setSelectedMaterial(material);
    setSelectedProductId('');
    setTempInstructions('');
    setTempUnit('個');
    setTempPrice('');
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    const found = masterResources.find(r => r.id === productId);
    if (found) {
      setTempInstructions(found.defaultSuggestion || '');
      setTempUnit(found.unit || '個');
      setTempPrice('');
    } else {
      setTempInstructions('');
      setTempUnit('個');
      setTempPrice('');
    }
  };

  const handleAddCategoryConfirm = () => {
    if (!selectedProductId) {
      toast.error('請選擇產品分類');
      return;
    }

    const resLookup = masterResources.find(r => r.id === selectedProductId);
    if (!resLookup) return;

    const finalUnit = tempUnit.trim() || resLookup.unit || '個';
    const finalPrice = tempPrice === '' ? 0 : parseFloat(tempPrice);
    if (selectedRoles.includes('RECYCLER') && isNaN(finalPrice)) {
      toast.error('收購價格必須為數字');
      return;
    }

    const newGuide: RecoveryGuide = {
      resourceId: selectedProductId,
      material: resLookup.material,
      product: resLookup.product,
      instructions: tempInstructions,
      unit: finalUnit,
      ...(selectedRoles.includes('RECYCLER') ? { price: finalPrice } : {})
    };

    if (!acceptedCategories.includes(selectedProductId)) {
      setAcceptedCategories(prev => [...prev, selectedProductId]);
      setRecoveryGuides(prev => [...prev, newGuide]);
    } else {
      setRecoveryGuides(prev => prev.map(g => g.resourceId === selectedProductId ? newGuide : g));
    }

    setIsAddDialogOpen(false);
    toast.success(`已將「${resLookup.product}」加入收取項目`);
  };

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
    if (role === 'MAKER_FISH') return; // Maker fish is default and cannot be disabled
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

  const copySlot = (index: number) => {
    const sourceSlot = availabilitySlots[index];
    if (!sourceSlot) return;

    let newDayOfWeek = sourceSlot.dayOfWeek;
    if (newDayOfWeek === 6) {
      newDayOfWeek = 0; // 週六 -> 週日
    } else if (newDayOfWeek === 0) {
      newDayOfWeek = 1; // 週日 -> 週一
    } else {
      newDayOfWeek += 1; // 其它：天數 + 1
    }

    const newSlot: AvailabilitySlot = {
      ...sourceSlot,
      dayOfWeek: newDayOfWeek
    };

    setAvailabilitySlots(prev => {
      const list = [...prev];
      list.splice(index + 1, 0, newSlot);
      return list;
    });
    toast.success('時段已複製並自動順延至隔天');
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
    const isRecycler = selectedRoles.includes('RECYCLER');
    const isMaker = selectedRoles.includes('MAKER_FISH');
    const hasCollectionRole = isGoingHome || isRecycler;
    
    // Detailed validation
    const missingFields: { id: string; label: string }[] = [];
    
    if (!displayName) missingFields.push({ id: 'field-displayName', label: '顯示名稱' });
    if (!phone) missingFields.push({ id: 'field-phone', label: '聯絡電話' });
    if (!address) {
      missingFields.push({ id: 'field-address', label: '詳細地址' });
    }
    if (!lat || !lng) {
      missingFields.push({ id: 'field-lat', label: '座標定位' });
    }
    
    if (hasCollectionRole && acceptedCategories.length === 0) {
      missingFields.push({ id: 'field-categories-header', label: '資源類別' });
    }

    if (missingFields.length > 0) {
      const first = missingFields[0];
      toast.error(`請填寫必要欄位：${first.label}`);

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

      if (hasCollectionRole) {
        updates.acceptedCategories = acceptedCategories;
        updates.recoveryGuides = recoveryGuides.map(guide => {
          // If the role is NOT recycler, clean up price field if any
          if (!isRecycler) {
            const { price, ...rest } = guide;
            return rest;
          }
          return guide;
        });
        updates.vehicles = vehicles;
        const distanceVal = maxDistance === '' ? null : parseFloat(maxDistance);
        if (distanceVal !== null && (isNaN(distanceVal) || distanceVal < 0)) {
          toast.error('最大範圍距離必須為正數');
          setLoading(false);
          return;
        }
        updates.maxDistance = distanceVal;
        // Keep legacy field for compatibility if needed, but preferred is recoveryGuides
        updates.recycleNotes = recoveryGuides.map(g => `[${g.product}] ${g.instructions}${g.price !== undefined ? ` (收購價: ${g.price}元)` : ''}`).join('\n');
      }

      updates.availabilitySlots = availabilitySlots;

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card 
              className="transition-all border-2 rounded-3xl overflow-hidden shadow-md border-cyan-500 ring-4 ring-cyan-500/10 bg-white"
            >
              <CardHeader className="text-center p-6 pb-2">
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 bg-cyan-500 text-white shadow-sm shadow-cyan-500/10">
                  <Fish className="w-8 h-8" />
                </div>
                <CardTitle className="text-xl font-bold flex flex-col items-center justify-center gap-1.5">
                  <span>資源梅克魚</span>
                  <span className="text-[11px] font-semibold bg-cyan-100 text-cyan-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">預設啟用</span>
                </CardTitle>
                <CardDescription className="text-sm mt-2 leading-relaxed">我有資源需要回收，希望能找到人來收取與幫我處理。</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <ul className="space-y-2 text-xs text-slate-500">
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-500 mt-0.5 shrink-0" /> 使用 AI 影像辨識回收物資</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-500 mt-0.5 shrink-0" /> 紀錄並隨時追蹤回收進度</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-cyan-500 mt-0.5 shrink-0" /> 與附近的勾引魟/瑞莎魺聯繫</li>
                </ul>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all border-2 rounded-3xl overflow-hidden hover:shadow-2xl ${selectedRoles.includes('GOING_HOME') ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-transparent'}`}
              onClick={() => toggleRole('GOING_HOME')}
            >
              <CardHeader className="text-center p-6 pb-2">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 transition-colors ${selectedRoles.includes('GOING_HOME') ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <img 
                    src={raySpeedIcon} 
                    alt="資源勾引魟圖示" 
                    className="w-10 h-10 object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
                  資源勾引魟
                  {selectedRoles.includes('GOING_HOME') && <Check className="w-5 h-5 text-blue-500 font-bold shrink-0" />}
                </CardTitle>
                <CardDescription className="text-sm mt-2 leading-relaxed">我提供回收物流收運，在回家途中順便載運資源。</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <ul className="space-y-2 text-xs text-slate-500">
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /> 自訂收運據點與收取指引</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /> AI 精準多航點收運路徑規劃</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /> 免費收運提升永續減碳貢獻</li>
                </ul>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all border-2 rounded-3xl overflow-hidden hover:shadow-2xl ${selectedRoles.includes('RECYCLER') ? 'border-amber-500 ring-4 ring-amber-500/10' : 'border-transparent'}`}
              onClick={() => toggleRole('RECYCLER')}
            >
              <CardHeader className="text-center p-6 pb-2">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 transition-colors ${selectedRoles.includes('RECYCLER') ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <Coins className="w-8 h-8" />
                </div>
                <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
                  資源瑞莎魺
                  {selectedRoles.includes('RECYCLER') && <Check className="w-5 h-5 text-amber-500 font-bold shrink-0" />}
                </CardTitle>
                <CardDescription className="text-sm mt-2 leading-relaxed">我是實體回收業者，會向梅克魚收購可回收資源。</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <ul className="space-y-2 text-xs text-slate-500">
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> 自訂各項品類的收購價格</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> 建立收購計劃與高效收取路徑</li>
                  <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> 提供保證價格協助梅克魚變現</li>
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
                  {selectedRoles.includes('RECYCLER') 
                    ? (selectedRoles.includes('MAKER_FISH') ? '完善多重身份資料' : '完善資源瑞莎魺資料')
                    : (selectedRoles.includes('MAKER_FISH') && selectedRoles.includes('GOING_HOME') 
                      ? '完善雙重身份資料' 
                      : selectedRoles.includes('GOING_HOME') 
                        ? '完善資源勾引魟資料' 
                        : '完善資源梅克魚資料')}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {selectedRoles.includes('RECYCLER')
                    ? '請填寫以下資訊以完善您的資源收購及通訊據點服務'
                    : (selectedRoles.includes('MAKER_FISH') && selectedRoles.includes('GOING_HOME')
                      ? '請填寫以下資訊以同時啟用收運與回收功能'
                      : selectedRoles.includes('MAKER_FISH')
                        ? '這些資訊將幫助勾引魟或瑞莎魺找到您的回收物並與您聯繫'
                        : '這些資訊將幫助梅克魚評估您的收運服務品質')}
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

              {/* Moved address and coordinates inputs here */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                <div className="flex items-center gap-2 text-violet-600 border-b border-violet-100 pb-2">
                  <MapPin className="w-4 h-4" />
                  <h3 className="font-bold">資源所在地 / 收運據點 / 服務地址</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="field-address">詳細地址</Label>
                  <Input id="field-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="台北市信義區..." />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium text-slate-600">座標定位</Label>
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      onClick={getCurrentLocation} 
                      className="text-violet-600 h-9 rounded-full bg-violet-50 hover:bg-violet-100"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      定位目前位置
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="field-lat" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Latitude</Label>
                      <Input id="field-lat" value={lat} onChange={e => setLat(e.target.value)} className="bg-white" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="field-lng" className="text-[10px] uppercase font-bold tracking-widest pl-1 text-slate-400">Longitude</Label>
                      <Input id="field-lng" value={lng} onChange={e => setLng(e.target.value)} className="bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Moved availability slots here */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                <div className="flex items-center justify-between border-b border-violet-100 pb-2">
                  <div className="flex items-center gap-2 text-violet-600">
                    <AlarmClock className="w-4 h-4" />
                    <h3 className="font-bold">開放上門 / 收運 / 服務時段</h3>
                  </div>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="sm" 
                    onClick={addSlot}
                    className="text-violet-600 hover:bg-violet-100 h-8 rounded-full px-3 text-xs font-semibold"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    新增時段
                  </Button>
                </div>
                
                <p className="text-[11px] text-slate-500 font-sans">
                  請設定您方便讓配合夥伴上門、收運、或服務的時段。明確的時段能提高收取/收運與服務成功的機率。
                </p>

                <div className="space-y-3">
                  {availabilitySlots.length > 0 ? availabilitySlots.map((slot, index) => (
                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                        <select 
                          value={slot.dayOfWeek}
                          onChange={(e) => updateSlot(index, 'dayOfWeek', parseInt(e.target.value))}
                          className="w-full sm:w-auto bg-slate-50 border-none rounded-xl text-sm font-medium px-3 py-2.5 focus:ring-2 focus:ring-violet-500/20"
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
                      
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          onClick={() => copySlot(index)}
                          title="複製此時段以自動順延天數"
                          className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl h-10 w-10"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeSlot(index)}
                          title="刪除"
                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl h-10 w-10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-3xl">
                      <p className="text-sm text-slate-400 mb-3 font-sans">尚未設定任何開放時段</p>
                      <Button 
                        type="button"
                        variant="outline" 
                        size="sm" 
                        onClick={addSlot}
                        className="rounded-full border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        立即新增
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Role selection checkboxes */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-4">
                <div className="flex items-center gap-2 text-slate-700 border-b border-slate-200 pb-2">
                  <span className="text-base">👤</span>
                  <h3 className="font-bold">欲啟用的功能與角色身分</h3>
                </div>
                <div className="flex flex-col sm:flex-row gap-6 pt-1">
                  {/* Maker Fish (Default Status) */}
                  <div className="flex items-center gap-3 select-none py-1">
                    <div className="relative">
                      <div className="w-6 h-6 rounded-md bg-cyan-500 border-2 border-cyan-500 flex items-center justify-center text-white shadow-sm">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Fish className="w-5 h-5 text-cyan-500" />
                      <span className="text-sm font-bold text-cyan-600">資源梅克魚 (預設啟用)</span>
                    </div>
                  </div>

                  {/* Going Home Checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer select-none group">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={selectedRoles.includes('GOING_HOME')} 
                        onChange={() => toggleRole('GOING_HOME')}
                        className="sr-only"
                      />
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                        selectedRoles.includes('GOING_HOME') 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}>
                        {selectedRoles.includes('GOING_HOME') && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <img 
                        src={raySpeedIcon} 
                        alt="資源勾引魟" 
                        className="w-5 h-5 object-contain"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">資源勾引魟</span>
                    </div>
                  </label>

                  {/* Recycler Checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer select-none group">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={selectedRoles.includes('RECYCLER')} 
                        onChange={() => toggleRole('RECYCLER')}
                        className="sr-only"
                      />
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                        selectedRoles.includes('RECYCLER') 
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm' 
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}>
                        {selectedRoles.includes('RECYCLER') && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-amber-500" />
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">資源瑞莎魺</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Max Collection Range Input - Only display when GOING_HOME is checked */}
              {selectedRoles.includes('GOING_HOME') && (
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-violet-600 border-b border-violet-100 pb-2">
                    <span className="text-lg">🗺️</span>
                    <h3 className="font-bold">最大收運範圍 (公里)</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input 
                        id="field-going-home-max-distance"
                        type="number" 
                        step="0.1" 
                        value={maxDistance} 
                        onChange={e => setMaxDistance(e.target.value)} 
                        placeholder="無限制 / 例如: 10" 
                        className="max-w-[200px] bg-white"
                      />
                      <span className="text-sm font-semibold text-slate-500">公里 (km)</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      設定您願意前往收裝、載運回收物資的最遠單程距離。超出此半徑的梅克魚便不會在推薦列表中向您提報。
                    </p>
                  </div>
                </div>
              )}

              {/* Commonly used collection vehicles/tools */}
              {selectedRoles.includes('GOING_HOME') && (
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-violet-600 border-b border-violet-100 pb-2">
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
                              ? 'border-violet-600 bg-violet-50/50 text-violet-900 shadow-sm' 
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
              )}

              {/* 收取的資源類別與處理規範 - Display when GOING_HOME or RECYCLER is checked */}
              {(selectedRoles.includes('GOING_HOME') || selectedRoles.includes('RECYCLER')) && (
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6 animate-in fade-in duration-300">
                  <div id="field-categories-header" className="space-y-3">
                    <div className={`flex items-center justify-between border-b ${selectedRoles.includes('RECYCLER') ? 'text-amber-600 border-amber-100' : 'text-blue-600 border-blue-100'} pb-2`}>
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        <h3 className="font-bold text-base text-slate-900">收取的資源類別與處理規範</h3>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={openAddCategoryDialog}
                        className={`${selectedRoles.includes('RECYCLER') ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-full h-8 px-3 text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors shadow-sm`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新增品類
                      </Button>
                    </div>
                    <p className="text-xs text-slate-505 mb-4 font-sans">請在此新增、管理欲收取的資源項目，並設定其整理指引、單位與價格。</p>
                    
                    {acceptedCategories.length === 0 ? (
                      <div className="text-center py-10 px-4 bg-white rounded-3xl border border-dashed border-slate-200">
                        <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-500">目前尚未選擇任何資源類別</p>
                        <p className="text-xs text-slate-400 mt-1">請點擊右上方「新增品類」按鈕來加入收取項目。</p>
                      </div>
                    ) : (
                      <div className="space-y-4 mt-6">
                        {masterResources
                          .filter((res) => acceptedCategories.includes(res.id))
                          .map((res) => {
                            const guide = recoveryGuides.find(g => g.resourceId === res.id);
                            const isRecyclerRole = selectedRoles.includes('RECYCLER');
                            const borderClass = isRecyclerRole ? 'border-amber-200' : 'border-blue-200';
                            
                            return (
                              <div 
                                key={res.id}
                                className={`rounded-3xl border ${borderClass} bg-white shadow-sm overflow-hidden animate-in fade-in duration-300`}
                              >
                                <div className="flex items-center justify-between p-4 bg-slate-50/50 border-b border-slate-100">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-white border border-slate-100">
                                      <Package className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-900">{res.product}</p>
                                      <span className="inline-block text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full mt-0.5 uppercase tracking-wider">
                                        {res.material}
                                      </span>
                                    </div>
                                  </div>
                                  <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => toggleCategory(res.id)}
                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full h-8 w-8 shrink-0 transition-colors"
                                    title="刪除此品類"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>

                                <div className="p-4 space-y-4">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                                      <Info className="w-3 h-3" />
                                      前置處理建議
                                    </div>
                                    <Textarea 
                                      value={guide?.instructions || ''} 
                                      onChange={e => updateGuideInstruction(res.id, e.target.value)}
                                      placeholder={`請告訴梅克魚如何整理${res.product}...`}
                                      className="min-h-[80px] rounded-2xl border-slate-200 focus:border-slate-400 text-sm bg-white"
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                                    <div className="space-y-1.5">
                                      <div className="text-slate-550 text-[11px] font-bold uppercase tracking-wider">
                                        單位名稱
                                      </div>
                                      <Input 
                                        type="text"
                                        value={guide?.unit || res.unit || '個'}
                                        readOnly
                                        disabled
                                        className="rounded-xl border-slate-100 text-sm bg-slate-50 text-slate-500 cursor-not-allowed select-none font-medium h-10"
                                      />
                                    </div>
                                    
                                    {isRecyclerRole && (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-amber-600 text-[11px] font-bold uppercase tracking-wider">
                                          <Coins className="w-3 h-3" />
                                          收購每單位之金額 (台幣元)
                                        </div>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={guide?.price !== undefined ? guide.price : ''}
                                          onChange={e => {
                                            const priceVal = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                            setRecoveryGuides(prev => prev.map(g => 
                                              g.resourceId === res.id ? { ...g, price: priceVal } : g
                                            ));
                                          }}
                                          placeholder="請輸入收購價格"
                                          className="rounded-xl border-slate-200 focus:border-amber-500 focus:ring-amber-500/10 text-sm bg-white"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogContent className="max-w-md w-full max-h-[90vh] flex flex-col rounded-3xl p-6 bg-white shadow-2xl border border-slate-100 outline-none">
                <DialogHeader className="pb-4 border-b border-slate-100 shrink-0">
                  <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-violet-600" />
                    新增收取的資源類別
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1 pr-1">
                  {/* Row 1: Material and Product dropdowns, side-by-side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dialog-material-select" className="text-xs font-semibold text-slate-500">材質分類</Label>
                      <select
                        id="dialog-material-select"
                        value={selectedMaterial}
                        onChange={(e) => handleMaterialChange(e.target.value)}
                        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-600/20 focus:border-violet-600"
                      >
                        <option value="" disabled>請選擇材質...</option>
                        {uniqueMaterials.map((mat) => (
                          <option key={mat} value={mat}>
                            {mat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="dialog-product-select" className="text-xs font-semibold text-slate-500">產品分類</Label>
                      <select
                        id="dialog-product-select"
                        value={selectedProductId}
                        onChange={(e) => handleProductChange(e.target.value)}
                        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-600/20 focus:border-violet-600 disabled:opacity-50"
                        disabled={!selectedMaterial}
                      >
                        <option value="">請選擇產品...</option>
                        {productsForMaterial.map((resOption) => (
                          <option key={resOption.id} value={resOption.id}>
                            {resOption.product}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Guidelines (textarea) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dialog-instructions" className="text-xs font-semibold text-slate-500">前置處理建議</Label>
                    <Textarea
                      id="dialog-instructions"
                      value={tempInstructions}
                      onChange={(e) => setTempInstructions(e.target.value)}
                      placeholder={selectedProductId ? "請輸入前置處理建議..." : "請先選擇產品分類來載入建議"}
                      className="min-h-[100px] rounded-2xl border-slate-200 focus:border-violet-500 text-sm bg-white"
                      disabled={!selectedProductId}
                    />
                  </div>

                  {/* Row 3: Unit and optional price */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dialog-unit" className="text-xs font-semibold text-slate-500">單位名稱</Label>
                      <Input
                        id="dialog-unit"
                        type="text"
                        value={tempUnit}
                        readOnly
                        disabled
                        className="rounded-xl border-slate-100 text-sm bg-slate-50 text-slate-500 cursor-not-allowed select-none font-medium h-10"
                      />
                    </div>

                    {selectedRoles.includes('RECYCLER') && (
                      <div className="space-y-1.5">
                        <Label htmlFor="dialog-price" className="text-xs font-semibold text-slate-500">收購價格 (台幣元)</Label>
                        <Input
                          id="dialog-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={tempPrice}
                          onChange={(e) => setTempPrice(e.target.value)}
                          placeholder="例如: 10"
                          className="rounded-xl border-slate-200 text-sm bg-white"
                          disabled={!selectedProductId}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="pt-4 border-t border-slate-100 flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                    className="flex-1 rounded-full border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddCategoryConfirm}
                    className={`${selectedRoles.includes('RECYCLER') ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} flex-1 rounded-full text-white font-bold transition-colors`}
                    disabled={!selectedProductId}
                  >
                    確定
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
