import React, { useState } from 'react';
import { useAuth } from '../../App';
import { updateDocument } from '../../services/firestoreService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Save, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { GeoPoint } from 'firebase/firestore';

const VEHICLE_OPTIONS = [
  { id: 'trolley', label: '手推車 (Trolley)', icon: '🛒' },
  { id: 'bicycle', label: '自行車 (Bicycle)', icon: '🚲' },
  { id: 'motorcycle', label: '機車 (Motorcycle)', icon: '🛵' },
  { id: 'minivan', label: '廂型車 (Minivan)', icon: '🚐' },
  { id: 'truck', label: '小貨車 (Truck)', icon: '🛻' },
  { id: 'onfoot', label: '步行手提 (On Foot)', icon: '🚶' }
];

export default function RayProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [lat, setLat] = useState(profile?.coordinates?.latitude.toString() || '');
  const [lng, setLng] = useState(profile?.coordinates?.longitude.toString() || '');
  const [vehicles, setVehicles] = useState<string[]>(profile?.vehicles || []);
  const [maxDistance, setMaxDistance] = useState(profile?.maxDistance?.toString() || '');

  const toggleVehicle = (vehicleId: string) => {
    setVehicles(prev => 
      prev.includes(vehicleId) 
        ? prev.filter(v => v !== vehicleId) 
        : [...prev, vehicleId]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    const distanceVal = maxDistance === '' ? null : parseFloat(maxDistance);
    if (distanceVal !== null && (isNaN(distanceVal) || distanceVal < 0)) {
      toast.error('最大收運距離必須為正數');
      return;
    }

    setLoading(true);
    try {
      await updateDocument('users', user.uid, {
        displayName,
        address,
        phoneNumber: phone,
        coordinates: lat && lng ? new GeoPoint(parseFloat(lat), parseFloat(lng)) : undefined,
        vehicles: vehicles,
        maxDistance: distanceVal
      } as any);
      await refreshProfile();
      toast.success('個人資料已更新');
    } catch (error) {
      toast.error('更新失敗');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toString());
      setLng(pos.coords.longitude.toString());
      toast.info('已取得目前位置座標');
    });
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">服務設定</h2>
        <p className="text-slate-500">設定您的收運範圍與聯絡資訊</p>
      </header>

      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-900 text-white p-8">
          <CardTitle>個人經營資訊</CardTitle>
          <CardDescription className="text-slate-400">這些資訊將公開給梅克魚作為挑選參考</CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-2">
            <Label>經營名稱</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>連絡電話</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>服務據點地址</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
             <div className="flex justify-between items-center">
              <Label className="font-bold">收運中心座標 (用於距離計算)</Label>
              <Button variant="ghost" size="sm" onClick={getCurrentLocation} className="text-blue-600 h-8 rounded-full">
                <MapPin className="w-4 h-4 mr-1" />
                定位目前位置
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label className="text-xs text-slate-500">緯度 Latitude</Label>
                <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="25.033" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">經度 Longitude</Label>
                <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="121.564" />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-100">
            <Label className="font-bold">最大收運距離 (公里)</Label>
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                step="0.1" 
                value={maxDistance} 
                onChange={e => setMaxDistance(e.target.value)} 
                placeholder="無限制 / 例如: 10" 
                className="max-w-[240px]"
              />
              <span className="text-sm font-semibold text-slate-500">公里 (km)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              設定您願意前往收運的最大單趟距離。若梅克魚的回收記錄與您的中心座標距離超過此範圍，系統將自動隱藏，保護您的調度效益。
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <Label className="font-bold text-slate-800">常用收運交通工具 (可複選)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                        : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                    id={`vehicle-opt-${opt.id}`}
                  >
                    <span className="text-xl shrink-0">{opt.icon}</span>
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={loading}
            className="w-full h-12 rounded-full bg-blue-600 hover:bg-blue-700 mt-6"
          >
            <Save className="w-5 h-5 mr-2" />
            儲存變更
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
