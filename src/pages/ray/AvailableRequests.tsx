import React, { useEffect, useState } from 'react';
import { useAuth } from '../../App';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { RecoveryRecord, RecordStatus, NotificationType } from '../../types';
import { updateDocument, createDocument } from '../../services/firestoreService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { MapPin, Clock, Calendar, Check, X, Navigation, PackageOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES: Record<RecordStatus, { label: string; className: string }> = {
  [RecordStatus.JUST_BORN]: { label: '待處理', className: 'border-slate-200 text-slate-600 bg-slate-50' },
  [RecordStatus.WAITING_FOR_COLLECTION]: { label: '等待確認', className: 'border-blue-200 text-blue-600 bg-blue-50' },
  [RecordStatus.COLLECTION_CONFIRMED]: { label: '已確認收運', className: 'border-indigo-200 text-indigo-600 bg-indigo-50' },
  [RecordStatus.PICKED_UP]: { label: '運送中', className: 'border-amber-200 text-amber-600 bg-amber-50' },
  [RecordStatus.COMPLETED]: { label: '已完成', className: 'border-green-200 text-green-600 bg-green-50' },
};

export default function AvailableRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RecoveryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // States for Cancel / Unable to Collect Dialog
  const [selectedRecordForCancel, setSelectedRecordForCancel] = useState<RecoveryRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'recoveryRecords'),
      where('selectedGoingHomeId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecoveryRecord));
      setRequests(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleUpdateStatus = async (record: RecoveryRecord, status: RecordStatus) => {
    try {
      await updateDocument('recoveryRecords', record.id, {
        status,
        statusUpdatedAt: new Date()
      } as any);

      // Create helpful notification for the Maker Fish
      const rayName = user?.displayName || '資源勾引魟';
      let title = '';
      let content = '';

      if (status === RecordStatus.COLLECTION_CONFIRMED) {
        title = '【已確認收運】勾引魟確認將會前往收取您的資材';
        content = `勾引魟「${rayName}」已確認將前往收取您的 [${record.productCategory}]（數量: ${record.quantity} 個）。\n\n收約載點：${record.address}\n兩方已建立收運連結，請耐心等候收取並做好前置處理。`;
      } else if (status === RecordStatus.PICKED_UP) {
        title = '【物資已上車】您的回收資材已成功上車';
        content = `勾引魟「${rayName}」已到場收取您的 [${record.productCategory}]（數量: ${record.quantity} 個），目前正在載運送往目的地中！`;
      } else if (status === RecordStatus.COMPLETED) {
        title = '【收運完成】感謝您為地球做出的綠色貢獻！';
        content = `您的 [${record.productCategory}]（數量: ${record.quantity} 個）已由勾引魟「${rayName}」成功運抵目的地，本筆資材已完成永續回收處理。`;
      }

      if (title && content) {
        await createDocument('notifications', {
          receiverId: record.makerFishId,
          type: NotificationType.SYSTEM,
          title,
          content,
          recordId: record.id,
          isRead: false,
          createdAt: new Date()
        });
      }

      toast.success('狀態已更新，並已通知梅克魚');
    } catch (error) {
      console.error(error);
      toast.error('操作失敗');
    }
  };

  const handleSubmitCancel = async () => {
    if (!selectedRecordForCancel || !cancelReason.trim()) return;

    setIsSubmittingCancel(true);
    try {
      // 1. Revert record status to JUST_BORN and clear selectedGoingHomeId, and save the reason
      await updateDocument('recoveryRecords', selectedRecordForCancel.id, {
        status: RecordStatus.JUST_BORN,
        selectedGoingHomeId: '',
        unableToCollectReason: cancelReason.trim(),
        statusUpdatedAt: new Date() as any
      });

      // 2. Add notification for Maker Fish
      await createDocument('notifications', {
        receiverId: selectedRecordForCancel.makerFishId,
        type: NotificationType.SYSTEM,
        title: '【收運無法收取通知】您的回收資材遭釋放',
        content: `勾引魟提到無法前往收運原本預約的 [${selectedRecordForCancel.productCategory}]（該筆記錄狀態已回復至「剛出生」）。\n\n無法收取的理由如下：\n「${cancelReason.trim()}」\n\n您可以隨時進入回收記錄詳情頁面修改放置地址、或附上新定位，以便其他勾引魟找到您！`,
        recordId: selectedRecordForCancel.id,
        isRead: false,
        createdAt: new Date()
      });

      toast.success('已成功退回，並發送系統通知給梅克魚');
      setSelectedRecordForCancel(null);
      setCancelReason('');
    } catch (error) {
      console.error(error);
      toast.error('操作失敗，請重試');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  if (loading) return <div className="p-20 text-center">載入中...</div>;

  return (
    <div className="p-6 md:p-8 space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900">收運服務請求</h2>
        <p className="text-slate-500">這些梅克魚希望由您前往收運資材</p>
      </header>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <PackageOpen className="w-16 h-16 mb-4 opacity-20" />
          <p>目前尚無收運請求</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {requests.map(request => (
            <Card key={request.id} className="rounded-3xl border-slate-200 overflow-hidden hover:shadow-xl transition-all group animate-in fade-in duration-300 bg-white">
              <CardContent className="p-0 flex flex-col sm:flex-row h-full">
                <div className="w-full sm:w-40 h-40 sm:h-auto overflow-hidden">
                  <img src={request.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                       {(() => {
                         const style = STATUS_STYLES[request.status] || { label: request.status, className: 'border-blue-200 text-blue-600 bg-blue-50' };
                         return (
                           <Badge variant="outline" className={`rounded-full font-bold ${style.className}`}>
                             {style.label}
                           </Badge>
                         );
                       })()}
                      <div className="text-right">
                        <span className="text-xl font-black text-blue-600">{request.quantity}</span>
                        <span className="text-[10px] text-slate-400 ml-1">個</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-lg text-slate-900">{request.productCategory}</h3>
                    <div className="space-y-2 mt-4 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-blue-500" />
                        <span className="truncate max-w-[180px]" title={request.address}>{request.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-blue-500" />
                        <span>建立於 {request.createdAt?.toDate().toLocaleDateString() || new Date().toLocaleDateString()}</span>
                      </div>
                      {request.unableToCollectReason && (
                        <div className="text-red-500 bg-red-50 p-2 rounded-lg mt-2 font-bold break-all">
                          先前歷史無法收取原因: {request.unableToCollectReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-2">
                    {request.status === RecordStatus.WAITING_FOR_COLLECTION && (
                      <>
                        <Button 
                          onClick={() => handleUpdateStatus(request, RecordStatus.COLLECTION_CONFIRMED)}
                          className="flex-1 rounded-full bg-indigo-600 hover:bg-indigo-700 h-10 text-xs shadow-md font-bold text-white flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          確認收運
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedRecordForCancel(request);
                            setCancelReason('');
                          }}
                          className="flex-1 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-red-50/10 h-10 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <X className="w-4 h-4" />
                          無法收取
                        </Button>
                      </>
                    )}
                    {request.status === RecordStatus.COLLECTION_CONFIRMED && (
                      <>
                        <Button 
                          onClick={() => handleUpdateStatus(request, RecordStatus.PICKED_UP)}
                          className="flex-1 rounded-full bg-blue-600 hover:bg-blue-700 h-10 text-xs shadow-md font-bold text-white flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          確認收箱
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedRecordForCancel(request);
                            setCancelReason('');
                          }}
                          className="flex-1 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-red-50/10 h-10 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <X className="w-4 h-4" />
                          無法收取
                        </Button>
                      </>
                    )}
                    {request.status === RecordStatus.PICKED_UP && (
                      <Button 
                         onClick={() => handleUpdateStatus(request, RecordStatus.COMPLETED)}
                         className="flex-1 rounded-full bg-green-600 hover:bg-green-700 h-10 text-xs shadow-md font-bold text-white flex items-center justify-center gap-1.5"
                      >
                        <Navigation className="w-4 h-4" />
                        完成送抵
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unable to Collect Dialog */}
      <Dialog open={!!selectedRecordForCancel} onOpenChange={(open) => { if (!open) setSelectedRecordForCancel(null); }}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-white p-6 border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <X className="w-5 h-5 text-red-600" />
              說明無法收取的理由
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              請填寫無法協助收送的原因，提交後此說明會附加在回收記錄，發送通知給該資源梅克魚，並將本筆記錄狀態退回到「剛出生」。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            <Label htmlFor="cancel-reason" className="font-bold text-slate-700">理由說明（必填）</Label>
            <Textarea
              id="cancel-reason"
              placeholder="請簡述無法收取原因（例如：材料內混有雜物、非此指引規格物品、聯絡不上放置者、地址不正確等）..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="rounded-xl border-slate-200 h-28 resize-none focus-visible:ring-red-100"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-100 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedRecordForCancel(null)}
              disabled={isSubmittingCancel}
              className="rounded-full font-bold px-6 h-10 text-slate-500 hover:bg-slate-100 hover:text-slate-75 *:[a]:underline"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSubmitCancel}
              disabled={isSubmittingCancel || !cancelReason.trim()}
              className="rounded-full font-bold px-6 h-10 bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center gap-2 transition-all"
            >
              {isSubmittingCancel ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  提交中...
                </>
              ) : (
                '確認提交'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
