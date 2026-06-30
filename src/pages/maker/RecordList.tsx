import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus, MasterDataResource } from '../../types';
import { listDocuments, updateDocument } from '../../services/firestoreService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, MapPin, ChevronRight, Inbox, Check, Copy, Leaf, X, AlertCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG: Record<string, { label: string, color: string, icon: any }> = {
  [RecordStatus.JUST_BORN]: { label: '待處理', color: 'bg-slate-500', icon: <Clock /> },
  [RecordStatus.OPEN_FOR_ALL]: { label: '公開徵收', color: 'bg-cyan-500', icon: <Clock /> },
  [RecordStatus.WAITING_FOR_COLLECTION]: { label: '等待收運', color: 'bg-blue-500', icon: <MapPin /> },
  [RecordStatus.COLLECTION_CONFIRMED]: { label: '已確認收運', color: 'bg-indigo-500', icon: <Check /> },
  [RecordStatus.PICKED_UP]: { label: '運送中', color: 'bg-amber-500', icon: <Package /> },
  [RecordStatus.COMPLETED]: { label: '已完成', color: 'bg-green-500', icon: <ChevronRight /> },
  [RecordStatus.CANCELLED]: { label: '已過期取消', color: 'bg-rose-500', icon: <X /> },
};

export default function RecordList() {
  const { user } = useAuth();
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [masterData, setMasterData] = useState<MasterDataResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'open_for_all' | 'in_progress' | 'completed' | 'all'>('pending');
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const navigate = useNavigate();

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
    // Fetch master data resources
    listDocuments<MasterDataResource>('masterData_resources').then(setMasterData).catch(err => {
      console.error('Failed to load master data resources:', err);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'recoveryRecords'),
      where('makerFishId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const item = { id: doc.id, ...doc.data() } as RecoveryRecord;
        if (item.expirationDate && item.status !== RecordStatus.COMPLETED && item.status !== RecordStatus.CANCELLED) {
          if (item.expirationDate?.toDate && item.expirationDate.toDate() < new Date()) {
            item.status = RecordStatus.CANCELLED;
            updateDocument('recoveryRecords', item.id, { status: RecordStatus.CANCELLED });
          }
        }
        return item;
      });
      setRecords(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  if (loading) return <div className="flex justify-center py-20">載入中...</div>;

  const getCarbonForRecord = (record: RecoveryRecord) => {
    const match = masterData.find(
      m => m.material.trim().toLowerCase() === record.materialCategory.trim().toLowerCase() &&
           m.product.trim().toLowerCase() === record.productCategory.trim().toLowerCase()
    );
    const rate = match?.carbonReduced ?? 0;
    return record.quantity * rate;
  };

  const completedRecords = records.filter(r => r.status === RecordStatus.COMPLETED);
  const totalCarbonReduced = completedRecords.reduce((sum, r) => sum + getCarbonForRecord(r), 0);

  const filteredRecords = records.filter(record => {
    switch (activeTab) {
      case 'pending':
        return record.status === RecordStatus.JUST_BORN;
      case 'open_for_all':
        return record.status === RecordStatus.OPEN_FOR_ALL;
      case 'in_progress':
        return [
          RecordStatus.WAITING_FOR_COLLECTION,
          RecordStatus.COLLECTION_CONFIRMED,
          RecordStatus.PICKED_UP
        ].includes(record.status);
      case 'completed':
        return record.status === RecordStatus.COMPLETED;
      case 'all':
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">我的回收記錄</h2>
          <p className="text-slate-500">追蹤您的回收資源流向</p>
        </div>
      </header>

      {/* Category Dropdown Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm" id="category-selector-card">
        <span className="text-sm font-semibold text-slate-500 tracking-wide">選擇分類類別：</span>
        <div className="relative w-full sm:w-64" id="category-dropdown-container">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full bg-slate-50 text-slate-800 font-bold px-4 py-2.5 pr-10 rounded-2xl border border-slate-200 shadow-inner appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-sm cursor-pointer"
            id="category-dropdown"
          >
            <option value="pending">
              待處理 ({records.filter(r => r.status === RecordStatus.JUST_BORN).length})
            </option>
            <option value="open_for_all">
              公開徵收 ({records.filter(r => r.status === RecordStatus.OPEN_FOR_ALL).length})
            </option>
            <option value="in_progress">
              進行中 ({records.filter(r => [RecordStatus.WAITING_FOR_COLLECTION, RecordStatus.COLLECTION_CONFIRMED, RecordStatus.PICKED_UP].includes(r.status)).length})
            </option>
            <option value="completed">
              已完成 ({records.filter(r => r.status === RecordStatus.COMPLETED).length})
            </option>
            <option value="all">
              全部 ({records.length})
            </option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
            <ChevronDown className="w-4 h-4 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {activeTab === 'completed' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden shadow-sm"
          id="carbon-offset-summary"
        >
          <div className="absolute right-4 bottom-0 opacity-10 pointer-events-none">
            <Leaf className="w-24 h-24 text-emerald-600 rotate-12" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl shrink-0 mt-0.5">
                <Leaf className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">已完成回收減碳成果 🌿</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-md">
                  感謝您的參與！您已將可回收資源成功導入再生循環，累計為地球減少了碳排放。
                </p>
              </div>
            </div>
            <div className="sm:text-right shrink-0 bg-white/40 backdrop-blur-sm sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-200/10 sm:border-0">
              <span className="block text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">累計減少碳排放量</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono tracking-tight" id="total-carbon-value">
                  {totalCarbonReduced.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-750">公克 (g)</span>
              </div>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                (約相當於 {(totalCarbonReduced / 1000).toFixed(2)} 公斤二氧化碳)
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <Inbox className="w-16 h-16 mb-4 opacity-20" />
          <p>目前尚無紀錄</p>
          <p className="text-xs">點擊右下方按鈕開始記錄您的第一張回收物！</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <Inbox className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">此狀態類別下目前無回收紀錄</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {filteredRecords.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  onClick={() => navigate(`/maker/record/${record.id}`)}
                  className="cursor-pointer hover:shadow-lg transition-all border-slate-200 rounded-3xl overflow-hidden group"
                >
                  <CardContent className="p-0 flex flex-col md:flex-row">
                    <div className="w-full md:w-48 h-48 md:h-auto overflow-hidden relative font-bold text-center">
                       {record.imageUrl ? (
                         <img 
                          src={record.imageUrl} 
                          alt={record.productCategory} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                       ) : (
                         <div className="w-full h-full bg-slate-50 flex items-center justify-center border-r border-slate-100 text-slate-300">
                           <Package className="w-12 h-12 stroke-1" />
                         </div>
                       )}
                      <div className="absolute top-2 left-2">
                        <Badge className={`${STATUS_CONFIG[record.status].color} border-none text-white shadow-lg`}>
                          {STATUS_CONFIG[record.status].label}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2 text-center font-bold">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-900">{record.productCategory}</h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate('/maker/new', { state: { copiedRecord: record } });
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-all border border-slate-100 hover:border-cyan-100"
                                title="複製此紀錄為新紀錄"
                                id={`copy-btn-${record.id}`}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-500 text-left">{record.materialCategory}</p>
                            {record.brands && record.brands.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 justify-start">
                                {record.brands.map((b, idx) => (
                                  <Badge key={idx} variant="secondary" className="bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-full px-2 py-0 h-4 text-[9px] font-semibold border border-slate-200/50">
                                    🏷️ {b}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                           <div className="text-right">
                            <div className="flex items-baseline justify-end">
                              <span className="text-2xl font-black text-cyan-600">{record.quantity}</span>
                              <span className="text-xs text-slate-400 ml-1">{record.unit || '個'}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-1 text-amber-600 font-bold">
                              <span className="text-[10px] font-semibold text-slate-400">估價:</span>
                              <span className="text-sm font-black font-mono">
                                {calculateEstimate(record, masterData)}
                              </span>
                              <span className="text-[10px] text-slate-400">元</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPriceWarning(true);
                                }}
                                className="p-0.5 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-100/50 transition-all"
                              >
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2 italic mb-4">
                          「{record.aiSuggestion}」
                        </p>
                        {record.status === RecordStatus.COMPLETED && (
                          <div className="mb-4 flex items-center gap-1.5 text-emerald-600 bg-emerald-50 rounded-xl px-3 py-1.5 w-fit text-xs font-semibold">
                            <Leaf className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>達成減碳：{getCarbonForRecord(record).toLocaleString()} 公克 (g)</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-400">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{record.address}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-4">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>申報：{record.createdAt?.toDate ? record.createdAt.toDate().toLocaleDateString() : '處理中...'}</span>
                          </div>
                          {record.expirationDate && (
                            <div className="flex items-center gap-1 text-amber-600 font-semibold">
                              <Clock className="w-3 h-3" />
                              <span>期限：{record.expirationDate?.toDate ? record.expirationDate.toDate().toLocaleDateString() : '處理中...'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

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
