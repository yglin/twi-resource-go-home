import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../App';
import { createDocument, listDocuments } from '../../services/firestoreService';
import { MasterDataResource, RecordStatus } from '../../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Image as ImageIcon, Sparkles, Loader2, Check, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Timestamp, GeoPoint, serverTimestamp } from 'firebase/firestore';
import { logToSystem, LogLevel } from '../../services/logger';
import { compressBase64Image } from '../../utils/imageCompressor';

export default function CreateRecord() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const locationState = useLocation();
  const copiedRecord = locationState.state?.copiedRecord;

  const [image, setImage] = useState<string | null>(copiedRecord?.imageUrl || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [masterData, setMasterData] = useState<MasterDataResource[]>([]);
  
  // Form State
  const [material, setMaterial] = useState(copiedRecord?.materialCategory || '');
  const [category, setCategory] = useState(copiedRecord?.productCategory || '');
  const [quantity, setQuantity] = useState(copiedRecord?.quantity || 1);
  const [unit, setUnit] = useState(copiedRecord?.unit || '個');
  const [suggestion, setSuggestion] = useState(copiedRecord?.aiSuggestion || '');
  const [notes, setNotes] = useState(copiedRecord?.recycleNotes || '');
  const [location, setLocation] = useState(copiedRecord?.address || profile?.address || '');
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(copiedRecord?.coordinates || profile?.coordinates || null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load master data for better matching
    listDocuments<MasterDataResource>('masterData_resources').then(setMasterData);
    
    // Attempt to get current location if not in profile and not in copiedRecord
    if (!profile?.coordinates && !copiedRecord?.coordinates) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCoordinates(new GeoPoint(pos.coords.latitude, pos.coords.longitude));
      });
    }

    if (copiedRecord) {
      toast.success('✨ 已成功從被複製的紀錄中，為您預填以下所有申報資訊！');
    }
  }, [profile, copiedRecord]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          // Compress the base64 image client-side before sending and storing
          const compressed = await compressBase64Image(rawBase64, 800, 800, 0.7);
          setImage(compressed);
          analyzeImage(compressed);
        } catch (err) {
          console.error('Image compression failed, using raw base64', err);
          setImage(rawBase64);
          analyzeImage(rawBase64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async (base64Data: string) => {
    setAnalyzing(true);
    try {
      await logToSystem(LogLevel.INFO, '開始呼叫 AI 影像辨識服務', 'CreateRecord', { imageLength: base64Data.length });
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          masterData
        })
      });

      if (!response.ok) {
        throw new Error(`影像識別伺服器回應異常: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      setMaterial(result.material || '');
      setCategory(result.category || '');
      setQuantity(result.quantity || 1);
      setUnit(result.unit || '個');
      setSuggestion(result.suggestion || '');
      
      if (result.isFallback) {
        await logToSystem(LogLevel.WARN, 'AI 影像服務傳回備用預填資料', 'CreateRecord', result);
        toast.info('影像系統以最佳預期規格為您預填。');
      } else {
        await logToSystem(LogLevel.INFO, `AI 影像辨識完成: ${result.material} / ${result.category}`, 'CreateRecord', result);
        toast.success('AI 辨識成功！');
      }
    } catch (error: any) {
      console.error(error);
      await logToSystem(LogLevel.ERROR, `AI 影像辨識發生異常: ${error.message}`, 'CreateRecord', error);
      toast.error('AI 辨識發生錯誤，請手動輸入。');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !material || !category) {
      toast.error('請填寫材質分類與產品名稱');
      return;
    }

    try {
      await logToSystem(LogLevel.INFO, '開始傳送資源回收記錄', 'CreateRecord', { material, category, quantity });
      // Check if this material-product combination exists in standard master lists.
      // If it doesn't, auto-enroll/persist it dynamically to masterData_resources collection
      const trimmedMaterial = material.trim();
      const trimmedCategory = category.trim();

      const existsInMaster = masterData.some(
        (r) =>
          r.material.trim().toLowerCase() === trimmedMaterial.toLowerCase() &&
          r.product.trim().toLowerCase() === trimmedCategory.toLowerCase()
      );

      if (!existsInMaster) {
        const newResourceSuggestion = {
          material: trimmedMaterial,
          product: trimmedCategory,
          defaultSuggestion: suggestion ? suggestion.trim() : '請清潔洗淨、分類整理。',
          keywords: [trimmedCategory.toLowerCase(), trimmedMaterial.toLowerCase()],
          suggestedBy: user.uid,
          suggestedByEmail: user.email || '',
          createdAt: serverTimestamp(),
          unit: unit.trim() || '個'
        };
        await createDocument('newMasterData_resources', newResourceSuggestion);
        await logToSystem(LogLevel.INFO, `送出全新資材品類建議: ${trimmedMaterial} / ${trimmedCategory}`, 'CreateRecord', { suggestedBy: user.email });
        toast.success(`✨ 偵測到全新資材類別 [${trimmedMaterial} / ${trimmedCategory} | 單位：${unit.trim() || '個'}]，已自動向管理員提報建議新增！`);
      }

      const recordData = {
        makerFishId: user.uid,
        materialCategory: trimmedMaterial,
        productCategory: trimmedCategory,
        quantity,
        unit: unit.trim() || '個',
        aiSuggestion: suggestion,
        imageUrl: image || '', // Optional base64 image
        address: location,
        coordinates: coordinates || new GeoPoint(0, 0),
        status: RecordStatus.JUST_BORN,
        recycleNotes: notes,
        createdAt: serverTimestamp(),
        candidateGoingHomeIds: [],
        timeWindow: profile?.timeWindow || {}
      };

      await createDocument('recoveryRecords', recordData);
      await logToSystem(LogLevel.INFO, '資源回收記錄存檔成功', 'CreateRecord', { material: trimmedMaterial, category: trimmedCategory });
      toast.success('記錄已成功送出！');
      navigate('/maker');
    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      await logToSystem(LogLevel.ERROR, `送出回收記錄失敗: ${error.message}`, 'CreateRecord', error);
      toast.error('存檔失敗');
    }
  };

  return (
    <div className="pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/maker')} className="rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <h2 className="text-2xl font-bold">新增回收記錄</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Image Selection & Preview */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-slate-200 overflow-hidden bg-slate-100/50 aspect-square flex items-center justify-center relative border-dashed border-2 group">
            {image ? (
              <img src={image} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-8">
                <Camera className="w-16 h-16 text-slate-300 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-slate-400 font-medium">拍攝或選擇照片 (選擇性/非必要)</p>
                <p className="text-xs text-slate-400 mt-1">讓我們幫您自動辨識與分類，未上傳亦可自行輸入與套用資材</p>
              </div>
            )}
            
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
               <Button onClick={() => fileInputRef.current?.click()} className="rounded-full shadow-2xl bg-white text-slate-900 border-none hover:bg-slate-100">
                <ImageIcon className="w-4 h-4 mr-2" />
                選擇圖片
              </Button>
            </div>

            {analyzing && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20">
                <div className="relative">
                  <Loader2 className="w-12 h-12 animate-spin text-cyan-400" />
                  <Sparkles className="w-5 h-5 absolute -top-1 -right-1 text-yellow-400 animate-bounce" />
                </div>
                <p className="mt-4 font-bold tracking-widest animate-pulse uppercase">AI 辨識中...</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Info Form */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>資源資訊</CardTitle>
              <CardDescription>您可以手動選擇已有資材模版，或手動調整與輸入</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {masterData.length > 0 && (
                <div className="space-y-2 bg-cyan-50/50 p-4 rounded-2xl border border-cyan-100">
                  <Label className="text-cyan-700 font-semibold flex items-center gap-1.5 text-sm">
                    <Sparkles className="w-4 h-4 text-cyan-600 animate-pulse" /> 快速套用資材與產品類別
                  </Label>
                  <select
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-800"
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (selectedId) {
                        const selected = masterData.find(item => item.id === selectedId);
                        if (selected) {
                          setMaterial(selected.material);
                          setCategory(selected.product);
                          setSuggestion(selected.defaultSuggestion);
                          setUnit(selected.unit || '個');
                          toast.info(`已成功載入 [${selected.material} / ${selected.product}] (單位: ${selected.unit || '個'}) 的預設回收建議！`);
                        }
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">-- 從可回收資源主檔中選擇類別 --</option>
                    {masterData.map((item) => (
                      <option key={item.id} value={item.id}>
                        材質：{item.material} | 產品：{item.product}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>材質分類</Label>
                  <Input value={material} onChange={e => setMaterial(e.target.value)} placeholder="如：塑膠" />
                </div>
                <div className="space-y-2">
                  <Label>產品名稱</Label>
                  <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="如：寶特瓶" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>數量</Label>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))} type="button" className="rounded-full h-10 w-10 text-xl">−</Button>
                    <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                    <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)} type="button" className="rounded-full h-10 w-10 text-xl">+</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>計量單位</Label>
                  <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="如：瓶, 片, 個, 公升" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>分類回收建議 (AI / 系統建議)</Label>
                <Textarea value={suggestion} onChange={e => setSuggestion(e.target.value)} className="resize-none" />
              </div>

              <div className="space-y-2">
                <Label>收運地址</Label>
                <div className="relative">
                  <Input value={location} onChange={e => setLocation(e.target.value)} className="pr-10" />
                  <MapPin className="w-5 h-5 absolute right-3 top-2.5 text-slate-400" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>備註 (選擇性)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="是否有漏氣、殘留液體等..." />
              </div>

              <Button onClick={handleSubmit} disabled={analyzing || !material || !category} className="w-full h-14 rounded-full bg-cyan-600 hover:bg-cyan-700 text-lg shadow-lg mt-4">
                <Send className="w-5 h-5 mr-2" />
                確認送出記錄
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MapPin(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
