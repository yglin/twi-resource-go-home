import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { useAuth } from '../../App';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { AppNotification } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, ExternalLink, MailOpen, Trash2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('receiverId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as AppNotification));

      // Sort local by time desc
      list.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });

      setNotifications(list);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        const ref = doc(db, 'notifications', n.id);
        batch.update(ref, { isRead: true });
      });
      await batch.commit();
      toast.success('已將所有通知標記為已讀');
    } catch (e) {
      console.error(e);
      toast.error('操作失敗');
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      const batch = writeBatch(db);
      const ref = doc(db, 'notifications', id);
      batch.update(ref, { isRead: true });
      await batch.commit();
    } catch (e) {
      console.error(e);
    }
  };

  const handleNavigateToRecord = async (recordId: string, notifId: string, isRead: boolean) => {
    if (!isRead) {
      await handleMarkNotificationRead(notifId);
    }
    navigate(`/maker/record/${recordId}`);
  };

  if (loading) return <div className="py-20 text-center text-slate-500">載入中...</div>;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Bell className="w-8 h-8 text-cyan-500" />
            通知中心
          </h1>
          <p className="text-slate-500 font-sans mt-1">
            您有 {unreadCount} 則未讀收運異動或系統通知
          </p>
        </div>

        {unreadCount > 0 && (
          <Button 
            onClick={handleMarkAllRead} 
            variant="outline"
            className="rounded-full font-bold border-cyan-200 text-cyan-600 hover:bg-cyan-50 h-10 px-6 transition-all"
          >
            <Check className="w-4 h-4 mr-2" />
            全部標記為已讀
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="rounded-3xl border-dashed border-2 border-slate-200 p-16 text-center">
          <CardContent className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Bell className="w-8 h-8" />
            </div>
            <p className="text-slate-500 font-bold">目前無任何通知</p>
            <p className="text-xs text-slate-400">當有勾引魟預約、完成收運或無法收取時，您會立刻收到訊息</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map(notif => (
            <Card 
              key={notif.id} 
              className={`rounded-2xl overflow-hidden transition-all duration-300 border border-slate-200 shadow-sm hover:shadow-md ${
                !notif.isRead ? 'border-l-4 border-l-cyan-500 bg-cyan-50/20' : 'bg-white'
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-full shrink-0 ${
                    !notif.isRead ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {notif.isRead ? <MailOpen className="w-5 h-5" /> : <Bell className="w-5 h-5 animate-pulse" />}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate text-sm sm:text-base">{notif.title}</span>
                        {!notif.isRead && (
                          <Badge className="bg-cyan-500 hover:bg-cyan-600 rounded-full text-[10px] px-2 py-0">未讀</Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono shrink-0">
                        {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap font-sans break-all">
                      {notif.content}
                    </p>

                    {notif.recordId && (
                      <div className="pt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleNavigateToRecord(notif.recordId!, notif.id, notif.isRead)}
                          className="h-9 px-4 rounded-full font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1 shadow-sm transition-all hover:translate-x-0.5"
                        >
                          查看相關回收記錄
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
