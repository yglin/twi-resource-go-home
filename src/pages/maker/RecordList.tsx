import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus, MasterDataResource } from '../../types';
import { listDocuments } from '../../services/firestoreService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, MapPin, ChevronRight, Inbox, Check, Copy, Leaf } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const STATUS_CONFIG: Record<string, { label: string, color: string, icon: any }> = {
  [RecordStatus.JUST_BORN]: { label: '待處理', color: 'bg-slate-500', icon: <Clock /> },
  [RecordStatus.WAITING_FOR_COLLECTION]: { label: '等待收運', color: 'bg-blue-500', icon: <MapPin /> },
  [RecordStatus.COLLECTION_CONFIRMED]: { label: '已確認收運', color: 'bg-indigo-500', icon: <Check /> },
  [RecordStatus.PICKED_UP]: { label: '運送中', color: 'bg-amber-500', icon: <Package /> },
  [RecordStatus.COMPLETED]: { label: '已完成', color: 'bg-green-500', icon: <ChevronRight /> },
};

export default function RecordList() {
  const { user } = useAuth();
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [masterData, setMasterData] = useState<MasterDataResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'completed' | 'all'>('pending');
  const navigate = useNavigate();

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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecoveryRecord));
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

      {/* Tab Navigator */}
      <div className="flex flex-wrap p-1.5 bg-slate-100 rounded-3xl w-full border border-slate-200/60 shadow-sm gap-1">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 outline-none ${
            activeTab === 'pending'
              ? 'bg-white text-cyan-700 shadow-sm border border-slate-200/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-pending"
        >
          待處理 ({records.filter(r => r.status === RecordStatus.JUST_BORN).length})
        </button>
        <button
          onClick={() => setActiveTab('in_progress')}
          className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 outline-none ${
            activeTab === 'in_progress'
              ? 'bg-white text-cyan-700 shadow-sm border border-slate-200/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-inprogress"
        >
          進行中 ({records.filter(r => [RecordStatus.WAITING_FOR_COLLECTION, RecordStatus.COLLECTION_CONFIRMED, RecordStatus.PICKED_UP].includes(r.status)).length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 outline-none ${
            activeTab === 'completed'
              ? 'bg-white text-cyan-700 shadow-sm border border-slate-200/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-completed"
        >
          已完成 ({records.filter(r => r.status === RecordStatus.COMPLETED).length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 outline-none ${
            activeTab === 'all'
              ? 'bg-white text-cyan-750 shadow-sm border border-slate-200/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-all"
        >
          全部 ({records.length})
        </button>
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
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black text-cyan-600">{record.quantity}</span>
                            <span className="text-xs text-slate-400 ml-1">{record.unit || '個'}</span>
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
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{record.createdAt.toDate().toLocaleDateString()}</span>
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
    </div>
  );
}
