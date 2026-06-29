import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { createContract } from '../../services/contractService';
import { UserProfile, RecoveryRecord, ContractSchedule, MasterDataResource } from '../../types';
import { listDocuments } from '../../services/firestoreService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, 
  FileText, 
  User, 
  Building, 
  Calendar, 
  Clock, 
  HelpCircle, 
  FileCheck,
  AlertTriangle,
  Loader2,
  ListTodo,
  Sparkles,
  Coins
} from 'lucide-react';
import { toast } from 'sonner';

export default function NewRecycleContract() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get('sourceId') || '';

  // Options loaded from Firestore
  const [makersList, setMakersList] = useState<UserProfile[]>([]);
  const [goingHomesList, setGoingHomesList] = useState<UserProfile[]>([]);
  const [recyclersList, setRecyclersList] = useState<UserProfile[]>([]);
  const [masterResources, setMasterResources] = useState<MasterDataResource[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [selectedMakerId, setSelectedMakerId] = useState('');
  const [selectedGoingHomeId, setSelectedGoingHomeId] = useState('');
  const [selectedRecyclerId, setSelectedRecyclerId] = useState('');
  
  const [material, setMaterial] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('公斤');

  // Schedule Configuration
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]); // Default Mon, Wed, Fri
  const [dayOfMonth, setDayOfMonth] = useState<number>(15);
  const [scheduleTime, setScheduleTime] = useState('09:00');

  // Load makers, recyclers, and potentially the sourceRecord
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingOptions(true);
        // Load all active users to filter roles
        const usersCol = collection(db, 'users');
        const usersSnap = await getDocs(usersCol);
        
        const allUsers = usersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as UserProfile));

        const activeMakers = allUsers.filter(u => u.roles?.includes('MAKER_FISH'));
        const activeGoingHomes = allUsers.filter(u => u.roles?.includes('GOING_HOME'));
        const activeRecyclers = allUsers.filter(u => u.roles?.includes('RECYCLER'));

        setMakersList(activeMakers);
        setGoingHomesList(activeGoingHomes);
        setRecyclersList(activeRecyclers);

        // Pre-fill recycler with the creator (Ray is also a Recycler sometimes)
        if (profile?.roles?.includes('RECYCLER') && user) {
          setSelectedRecyclerId(user.uid);
        } else if (activeRecyclers.length > 0) {
          setSelectedRecyclerId(activeRecyclers[0].id);
        }

        if (profile?.roles?.includes('MAKER_FISH') && user) {
          setSelectedMakerId(user.uid);
        } else if (activeMakers.length > 0) {
          setSelectedMakerId(activeMakers[0].id);
        }

        if (profile?.roles?.includes('GOING_HOME') && user) {
          setSelectedGoingHomeId(user.uid);
        } else if (activeGoingHomes.length > 0) {
          setSelectedGoingHomeId(activeGoingHomes[0].id);
        }

        // Load master data resources
        const masterRes = await listDocuments<MasterDataResource>('masterData_resources');
        setMasterResources(masterRes);
        const uMaterials = Array.from(new Set(masterRes.map(r => r.material))).filter(Boolean);
        
        let initialMaterial = uMaterials[0] || '';
        let initialProduct = '';
        let initialUnit = '個';

        if (uMaterials.length > 0) {
          const firstMatProducts = masterRes.filter(r => r.material === initialMaterial);
          if (firstMatProducts.length > 0) {
            initialProduct = firstMatProducts[0].product;
            initialUnit = firstMatProducts[0].unit || '個';
          }
        }

        // Handle sourceId prefilling if supplied
        if (sourceId) {
          setLoadingSource(true);
          const sourceSnap = await getDoc(doc(db, 'recoveryRecords', sourceId));
          if (sourceSnap.exists()) {
            const src = sourceSnap.data() as RecoveryRecord;
            
            setSelectedMakerId(src.makerFishId || '');
            
            initialMaterial = src.materialCategory || '';
            initialProduct = src.productCategory || '';
            initialUnit = src.unit || '個';
            
            setMaterial(initialMaterial);
            setProduct(initialProduct);
            setQuantity(src.quantity || 1);
            setUnit(initialUnit);

            // Find recycler partner details if any
            if (src.selectedGoingHomeId && activeRecyclers.some(r => r.id === src.selectedGoingHomeId)) {
              setSelectedRecyclerId(src.selectedGoingHomeId);
            }
            if (src.selectedGoingHomeId && activeGoingHomes.some(h => h.id === src.selectedGoingHomeId)) {
              setSelectedGoingHomeId(src.selectedGoingHomeId);
            }
            toast.success('已成功自歷史物資單匯入契約預先資訊！');
          }
          setLoadingSource(false);
        } else {
          // Defaults if no sourceId
          setMaterial(initialMaterial);
          setProduct(initialProduct);
          setUnit(initialUnit);
        }
      } catch (err) {
        console.error('Loading options failed', err);
        toast.error('載入系統參與者清單失敗，請稍後重試。');
      } finally {
        setLoadingOptions(false);
      }
    }

    loadData();
  }, [sourceId, profile]);

  const toggleDayOfWeek = (day: number) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter(d => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const getWeekDayName = (day: number) => {
    const names = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return names[day];
  };

  // Compile Schedule Text dynamically
  const generateScheduleText = (): string => {
    let result = '';
    if (scheduleType === 'daily') {
      result = `每日的 ${scheduleTime} 排定定期收運項目`;
    } else if (scheduleType === 'weekly') {
      const daysStr = daysOfWeek.map(getWeekDayName).join('、');
      result = `每週 [${daysStr || '未選擇'}] 的 ${scheduleTime} 排定定期收運項目`;
    } else if (scheduleType === 'monthly') {
      result = `每月的對齊 ${dayOfMonth} 日 ${scheduleTime} 排定定期收運項目`;
    }
    return result;
  };

  const planText = generateScheduleText();

  const selectedRecycler = recyclersList.find(r => r.id === selectedRecyclerId);
  const matchedGuide = selectedRecycler?.recoveryGuides?.find(g => 
    g.material.trim().toLowerCase() === material.trim().toLowerCase() && 
    g.product.trim().toLowerCase() === product.trim().toLowerCase()
  );
  const unitPrice = matchedGuide?.price ?? 0;
  const matchedResource = masterResources.find(mr => 
    mr.material.trim().toLowerCase() === material.trim().toLowerCase() && 
    mr.product.trim().toLowerCase() === product.trim().toLowerCase()
  );
  const estimatedWeight = matchedResource?.estimatedWeight ?? 0.1;
  const totalPrice = unitPrice * quantity * estimatedWeight;

  const handleMaterialChange = (newMaterial: string) => {
    setMaterial(newMaterial);
    const filterProducts = masterResources.filter(r => r.material === newMaterial);
    if (filterProducts.length > 0) {
      setProduct(filterProducts[0].product);
      setUnit(filterProducts[0].unit || '個');
    } else {
      setProduct('');
    }
  };

  const handleProductChange = (newProduct: string) => {
    setProduct(newProduct);
    const matched = masterResources.find(r => r.material === material && r.product === newProduct);
    if (matched) {
      setUnit(matched.unit || '個');
    }
  };

  const uniqueMaterials = Array.from(new Set(masterResources.map(r => r.material))).filter(Boolean);
  const productsForMaterial = Array.from(new Set(masterResources.filter(r => r.material === material).map(r => r.product))).filter(Boolean);

  const checkRecyclerCompatibility = (recycler: UserProfile, rMaterial: string, rProduct: string): boolean => {
    const guides = recycler.recoveryGuides || [];
    const isCatCompatible = recycler.acceptedCategories?.some(cat => 
      cat.trim().toLowerCase() === rMaterial.trim().toLowerCase()
    );
    const isGuideCompatible = guides.some(g => 
      g.material.trim().toLowerCase() === rMaterial.trim().toLowerCase() && 
      (!rProduct.trim() || g.product.trim().toLowerCase() === rProduct.trim().toLowerCase())
    );
    return !!(isCatCompatible || isGuideCompatible);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMakerId) {
      toast.error('請選擇合作資源梅克魚（資材供給者）');
      return;
    }
    if (!selectedGoingHomeId) {
      toast.error('請選擇合作資源勾引魟（資材運送者）');
      return;
    }
    if (!selectedRecyclerId) {
      toast.error('請選擇合作資源瑞莎魺（資材收購端）');
      return;
    }
    if (selectedRecyclerId === selectedMakerId) {
      toast.error('梅克魚與瑞莎魺不能為同一個帳號。');
      return;
    }
    if (selectedGoingHomeId === selectedMakerId) {
      toast.error('梅克魚與勾引魟不能為同一個帳號。');
      return;
    }
    if (selectedGoingHomeId === selectedRecyclerId) {
      toast.error('瑞莎魺與勾引魟不能為同一個帳號。');
      return;
    }

    const chosenRecycler = recyclersList.find(r => r.id === selectedRecyclerId);
    if (chosenRecycler && !checkRecyclerCompatibility(chosenRecycler, material, product)) {
      toast.error('所選之瑞莎魺目前回收指引拒收此資材分類/品項，無法簽署此合約！');
      return;
    }

    if (!product.trim()) {
      toast.error('請選擇產品分類');
      return;
    }
    if (quantity <= 0) {
      toast.error('約定數量必須大於 0');
      return;
    }
    if (scheduleType === 'weekly' && daysOfWeek.length === 0) {
      toast.error('每週安排至少需選擇一天回收期');
      return;
    }
    if (scheduleType === 'monthly' && (dayOfMonth < 1 || dayOfMonth > 31)) {
      toast.error('每月日期需介於 1 到 31 之間');
      return;
    }

    setSubmitting(true);
    try {
      const schedule: ContractSchedule = {
        type: scheduleType,
        time: scheduleTime,
        scheduleText: planText
      };
      if (scheduleType === 'weekly') {
        schedule.daysOfWeek = daysOfWeek;
      } else if (scheduleType === 'monthly') {
        schedule.dayOfMonth = dayOfMonth;
      }

      const contractId = await createContract({
        makerFishId: selectedMakerId,
        goingHomeId: selectedGoingHomeId,
        recyclerId: selectedRecyclerId,
        templateRecord: {
          materialCategory: material,
          productCategory: product,
          quantity,
          unit
        },
        schedule,
        sourceRecordId: sourceId
      });

      if (contractId) {
        toast.success('契約發起成功！已自動發佈通知給另外兩方簽署。');
        navigate('/recycleContract');
      } else {
        toast.error('發起合約失敗，請檢查輸入資訊。');
      }
    } catch (err) {
      console.error(err);
      toast.error('伺服器出錯，無法發起定期契約。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingOptions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-slate-500 font-sans">載入系統配置與歷史資材中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/recycleContract')} 
        className="mb-6 rounded-full text-slate-500 hover:text-slate-800 bg-white shadow-sm border border-slate-100"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        返回定期契約儀表板
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Form column */}
        <div className="md:col-span-2 space-y-6">
          <Card className="rounded-3xl border-slate-200/60 shadow-lg overflow-hidden bg-white">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 md:p-8">
              <CardTitle className="text-2xl font-bold flex items-center gap-2 text-slate-950">
                <FileText className="w-6 h-6 text-blue-600" />
                規劃新定期回收契約
              </CardTitle>
              <CardDescription className="text-slate-500 font-sans mt-1 text-xs leading-relaxed">
                發起定期回收契約，系統會自動在指定週期，產出符合三方合議之首期及續期交貨單，由約定夥伴專屬收運與收購，省去手動發需求時間。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              <form onSubmit={handleCreateContract} className="space-y-6">
                
                {/* 1. Partner Selection */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 border-l-4 border-blue-500 pl-2 leading-none">
                    1. 契約參署夥伴設定
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maker-select" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-cyan-500" />
                        資材供給者 (資源梅克魚)
                      </Label>
                      <select 
                        id="maker-select"
                        value={selectedMakerId}
                        onChange={e => setSelectedMakerId(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        {makersList.map(m => (
                          <option key={m.id} value={m.id}>{m.displayName} ({m.address || '未設定地址'})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="goinghome-select" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-indigo-500" />
                        資材運送者 (資源勾引魟)
                      </Label>
                      <select 
                        id="goinghome-select"
                        value={selectedGoingHomeId}
                        onChange={e => setSelectedGoingHomeId(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        {goingHomesList.map(h => (
                          <option key={h.id} value={h.id}>{h.displayName} ({h.address || '自營運送'})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="recycler-select" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-amber-500" />
                        資材收購端 (資源瑞莎魺)
                      </Label>
                      <select 
                        id="recycler-select"
                        value={selectedRecyclerId}
                        onChange={e => setSelectedRecyclerId(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        {recyclersList.map(r => {
                          const isCompatible = checkRecyclerCompatibility(r, material, product);
                          return (
                            <option key={r.id} value={r.id} disabled={!isCompatible}>
                              {r.displayName} {isCompatible ? `(${r.address || '自營店鋪'})` : ' (指引不符 - 拒收此資材)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Item description */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 border-l-4 border-blue-500 pl-2 leading-none">
                    2. 約定回收物資設定
                  </h3>

                  {masterResources.length > 0 && (
                    <div className="space-y-2 bg-cyan-50/50 p-4 rounded-2xl border border-cyan-100">
                      <Label className="text-cyan-700 font-semibold flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-4 h-4 text-cyan-600 animate-pulse" /> 快速套用資材與產品類別
                      </Label>
                      <select
                        className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-800"
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          if (selectedId) {
                            const selected = masterResources.find(item => item.id === selectedId);
                            if (selected) {
                              setMaterial(selected.material);
                              setProduct(selected.product);
                              setUnit(selected.unit || '個');
                              toast.info(`已成功載入 [${selected.material} / ${selected.product}] (單位: ${selected.unit || '個'})`);
                            }
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="">-- 從可回收資源主檔中選擇類別 --</option>
                        {masterResources.map((item) => (
                          <option key={item.id} value={item.id}>
                            材質：{item.material} | 產品：{item.product}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="material-category" className="text-xs font-bold text-slate-700">材質分類</Label>
                      <select 
                        id="material-category"
                        value={material}
                        onChange={e => handleMaterialChange(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        <option value="">-- 請選擇材質 --</option>
                        {uniqueMaterials.map((mat) => (
                          <option key={mat} value={mat}>{mat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="product-name" className="text-xs font-bold text-slate-700">產品分類</Label>
                      <select 
                        id="product-name"
                        value={product}
                        onChange={e => handleProductChange(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        <option value="">-- 請選擇產品 --</option>
                        {productsForMaterial.map((prd) => (
                          <option key={prd} value={prd}>{prd}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quantity" className="text-xs font-bold text-slate-700">約定單次交付量</Label>
                      <div className="flex items-center gap-4">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => setQuantity(Math.max(1, quantity - 1))} 
                          type="button" 
                          className="rounded-full h-10 w-10 text-xl"
                        >
                          −
                        </Button>
                        <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => setQuantity(quantity + 1)} 
                          type="button" 
                          className="rounded-full h-10 w-10 text-xl"
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="unit-select" className="text-xs font-bold text-slate-700">交付計量單位</Label>
                      <Input 
                        id="unit-select"
                        value={unit}
                        onChange={e => setUnit(e.target.value)}
                        placeholder="例如：個、公斤、金、瓶"
                        className="h-11 rounded-xl border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  {/* Dynamic Total Acquisition Price Tracker */}
                  <div className="mt-6 p-5 rounded-2xl bg-[#FFFBF0] border border-amber-200/60 font-sans space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-500" />
                        總收購價
                      </span>
                      {selectedRecycler ? (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-100/40 px-2.5 py-0.5 rounded-full border border-amber-200/30">
                          依「{selectedRecycler.displayName}」指引計費
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">
                          未選取瑞莎魺
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-amber-200/30">
                      <div className="text-xs text-slate-600 space-y-1.5">
                        <p className="flex items-center gap-2">
                          <span className="text-slate-400">當前資材品項：</span>
                          <span className="font-semibold text-slate-800">
                            {material ? `${material} ➔ ${product || '(請選擇產品)'}` : '(請選擇材質及產品)'}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="text-slate-400">瑞莎魺收購單價：</span>
                          <span className="font-bold text-amber-600 font-mono text-sm">
                            {selectedRecycler ? (matchedGuide ? `$${unitPrice} 元` : '未載明單價（以 $0 元計）') : 'N/A'}
                          </span>
                          {matchedGuide && <span className="text-[10px] text-slate-400">/ 公斤</span>}
                        </p>
                        {matchedGuide && (
                          <p className="text-[10px] text-slate-400">
                            計算說明：數量 {quantity} {unit || '個'} × 預估單件重量 {estimatedWeight} 公斤 = 總重 {(quantity * estimatedWeight).toFixed(2)} 公斤 × {unitPrice} 元/公斤
                          </p>
                        )}
                      </div>
                      
                      <div className="bg-white/85 backdrop-blur-sm shadow-sm border border-amber-100/70 rounded-xl px-4 py-2 text-center sm:text-right min-w-[150px]">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">預估單次總收購價</p>
                        <p className="text-2xl font-black text-amber-600 font-mono mt-0.5">
                          NT$ {totalPrice.toLocaleString()} <span className="text-xs font-bold font-sans">元</span>
                        </p>
                      </div>
                    </div>
                    
                    {!matchedGuide && selectedRecycler && material && product && (
                      <p className="text-[10px] text-amber-600/90 flex items-center gap-1.5 mt-2 font-medium bg-amber-100/20 p-2 rounded-xl border border-amber-200/10">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>提醒：此瑞莎魺目前回收指引尚未設定此特定材質或產品，如需異動單價，可請瑞莎魺至設定頁增加該規則。</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Schedule config */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 border-l-4 border-blue-500 pl-2 leading-none">
                    3. 長期定期排程循環
                  </h3>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700">循環週期</Label>
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-100 p-1 rounded-xl">
                      {(['daily', 'weekly', 'monthly'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setScheduleType(type)}
                          className={`py-2 rounded-lg text-xs font-bold uppercase transition-all ${scheduleType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {type === 'daily' ? '每日' : type === 'weekly' ? '每週' : '每月'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {scheduleType === 'weekly' && (
                    <div className="space-y-2 py-2 animate-in fade-in duration-300">
                      <Label className="text-xs font-bold text-slate-700">星期幾進行交貨與收運？ (可複選)</Label>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                          const isActive = daysOfWeek.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleDayOfWeek(day)}
                              className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'bg-white border-slate-100/80 text-slate-500'}`}
                            >
                              {getWeekDayName(day)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {scheduleType === 'monthly' && (
                    <div className="space-y-2 py-2 animate-in fade-in duration-300">
                      <Label htmlFor="day-of-month" className="text-xs font-bold text-slate-700">每個月的哪一天交付？ (填寫 1 ~ 31 對齊日)</Label>
                      <Input 
                        id="day-of-month"
                        type="number"
                        min="1"
                        max="31"
                        value={dayOfMonth}
                        onChange={e => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value))))}
                        className="h-11 rounded-xl border-slate-200"
                        placeholder="15"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="schedule-time" className="text-xs font-bold text-slate-700">當日出勤與上架時間</Label>
                    <Input 
                      id="schedule-time"
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="h-11 rounded-xl border-slate-200"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 select-none">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 transition-all text-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-white" />
                        正在發起此契約...
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-5 h-5" />
                        送交並分發草案審核
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Advice column */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm sticky top-6">
            <CardHeader className="bg-slate-50 border-b border-thin p-5">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-blue-600" />
                條約排程預覽
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-slate-600 text-xs">
              <div className="bg-blue-50 border border-blue-100/70 p-4 rounded-xl space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">當前契約排程中文化</span>
                <p className="font-extrabold text-blue-900 font-sans leading-relaxed">
                  「{planText}」
                </p>
              </div>

              <div className="space-y-3 leading-relaxed text-slate-500">
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1.5" />
                  <p>
                    <strong>首期暫停避雷：</strong> 若本約是由歷史單 (sourceId) 直接轉換，首期實體交貨單的起始時間將推遲一個循環期，絕不在同意按下的數秒內重複建立「同天雙重派單」的物資。
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1.5" />
                  <p>
                    <strong>三方全員同意：</strong> 剩餘兩方成員會於各自通知中心看見待對開契約。其中任何一人點退回，即退為 Rejected。修改後能重新提交草案。
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1.5" />
                  <p>
                    <strong>資格失效保護：</strong> 當排程器要觸發定期單前，會自動檢查瑞莎魺是否還支持該資材。若拒收，合約將自動「掛起（Suspended）」暫停派發。
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-yellow-50 border border-yellow-200/50 rounded-xl flex gap-2 items-start text-yellow-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500 animate-pulse" />
                <p className="font-medium text-[10px] leading-tight">
                  請與合作之梅克魚及瑞莎魺線上溝通、確認排程時段符合期望後，再行點選送交，可大幅加快簽署核定之速度。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
