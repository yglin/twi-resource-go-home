import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, doc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { createDocument, updateDocument } from '../services/firestoreService';
import { MasterDataResource, NewMasterDataResource } from '../types';
import { SystemLog, LogLevel, logToSystem } from '../services/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Settings, 
  Plus, 
  Edit2, 
  Trash2, 
  LayoutDashboard, 
  LogOut, 
  Home, 
  Eye, 
  Search, 
  FileText, 
  Filter, 
  Calendar,
  AlertTriangle,
  Info,
  XCircle,
  RefreshCw,
  Sparkles,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Active Tab: 'resources' | 'suggestions' | 'logs'
  const [activeTab, setActiveTab] = useState<'resources' | 'suggestions' | 'logs'>('resources');

  // Resource Management State
  const [resources, setResources] = useState<MasterDataResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<MasterDataResource | null>(null);
  
  const [material, setMaterial] = useState('');
  const [product, setProduct] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [keywords, setKeywords] = useState('');
  const [icon, setIcon] = useState('');
  const [carbonReduced, setCarbonReduced] = useState<number | string>('');
  const [unit, setUnit] = useState('個');

  // Suggested Resources State
  const [suggestions, setSuggestions] = useState<NewMasterDataResource[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  // System Logs Inspector State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [clearingLogs, setClearingLogs] = useState(false);

  // Load Resources
  useEffect(() => {
    const q = query(collection(db, 'masterData_resources'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterDataResource));
      setResources(data);
      setResourcesLoading(false);
    });
    return unsubscribe;
  }, []);

  // Load Suggested Resources
  useEffect(() => {
    const q = query(collection(db, 'newMasterData_resources'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        let timestampStr = new Date().toISOString();
        if (item.createdAt) {
          try {
            timestampStr = item.createdAt.toDate().toISOString();
          } catch {
            timestampStr = String(item.createdAt);
          }
        }
        return { 
          id: doc.id, 
          ...item,
          createdAt: timestampStr
        } as unknown as NewMasterDataResource;
      });
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSuggestions(data);
      setSuggestionsLoading(false);
    }, (error) => {
      console.error("Failed to load suggested resources:", error);
      setSuggestionsLoading(false);
    });
    return unsubscribe;
  }, []);

  // Load System Logs with Client-Side Sort (Anti-Index Limit Defense Pattern)
  useEffect(() => {
    const qLogs = query(collection(db, 'systemLogs'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        return { 
          id: doc.id, 
          level: item.level || 'info',
          message: item.message || '',
          timestamp: item.timestamp || new Date().toISOString(),
          service: item.service || '',
          details: item.details || '',
          userId: item.userId || '',
          userEmail: item.userEmail || ''
        } as SystemLog;
      });
      // Sort client side to guarantee stability without missing-index warnings
      data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(data);
      setLogsLoading(false);
    }, (error) => {
      console.error("Failed to load logs:", error);
      setLogsLoading(false);
    });
    return unsubscribeLogs;
  }, []);

  const handleGoBack = () => {
    const target = profile?.roles?.includes('MAKER_FISH') ? '/maker' : '/going-home';
    navigate(target);
  };

  // Resource CRUD methods
  const openAddResourceDialog = () => {
    setEditingResource(null);
    setMaterial('');
    setProduct('');
    setSuggestion('');
    setKeywords('');
    setIcon('');
    setCarbonReduced('');
    setUnit('個');
    setIsResourceDialogOpen(true);
  };

  const openEditResourceDialog = (res: MasterDataResource) => {
    setEditingResource(res);
    setMaterial(res.material);
    setProduct(res.product);
    setSuggestion(res.defaultSuggestion);
    setKeywords(res.keywords.join(', '));
    setIcon(res.icon || '');
    setCarbonReduced(res.carbonReduced ?? '');
    setUnit(res.unit || '個');
    setIsResourceDialogOpen(true);
  };

  const handleResourceSubmit = async () => {
    const carbonVal = carbonReduced === '' ? 0 : Number(carbonReduced);
    const data = {
      material: material.trim(),
      product: product.trim(),
      defaultSuggestion: suggestion.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      icon,
      carbonReduced: isNaN(carbonVal) ? 0 : carbonVal,
      unit: unit.trim() || '個'
    };

    if (!data.material || !data.product) {
      toast.error('請填寫材質與品名資料');
      return;
    }

    try {
      if (editingResource) {
        await updateDocument('masterData_resources', editingResource.id, data);
        toast.success('更新成功');
      } else {
        await createDocument('masterData_resources', data);
        toast.success('新增成功');
      }
      setIsResourceDialogOpen(false);
    } catch (err) {
      toast.error('操作失敗');
    }
  };

  const handleResourceDelete = async (id: string) => {
    if (window.confirm('確定要刪除此資源定義嗎？')) {
      try {
        await deleteDoc(doc(db, 'masterData_resources', id));
        toast.success('刪除成功');
      } catch (err) {
        toast.error('刪除失敗');
      }
    }
  };

  // Suggestion review and import methods
  const [selectedSuggestion, setSelectedSuggestion] = useState<NewMasterDataResource | null>(null);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);

  const openReviewSuggestionDialog = (sug: NewMasterDataResource) => {
    setSelectedSuggestion(sug);
    setMaterial(sug.material);
    setProduct(sug.product);
    setSuggestion(sug.defaultSuggestion);
    setKeywords(sug.keywords ? sug.keywords.join(', ') : '');
    setIcon(sug.icon || '');
    setCarbonReduced(sug.carbonReduced ?? '');
    setUnit(sug.unit || '個');
    setIsSuggestionDialogOpen(true);
  };

  const handleSuggestionApprove = async () => {
    if (!selectedSuggestion) return;

    const carbonVal = carbonReduced === '' ? 0 : Number(carbonReduced);
    const data = {
      material: material.trim(),
      product: product.trim(),
      defaultSuggestion: suggestion.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      icon,
      carbonReduced: isNaN(carbonVal) ? 0 : carbonVal,
      unit: unit.trim() || '個'
    };

    if (!data.material || !data.product) {
      toast.error('請填寫材質與品名資料');
      return;
    }

    try {
      // 1. Write to master list
      await createDocument('masterData_resources', data);
      
      // 2. Remove from suggestions list queue
      await deleteDoc(doc(db, 'newMasterData_resources', selectedSuggestion.id));
      
      toast.success(`核准修訂成功：已將 [${data.material} / ${data.product}] 匯入資源主檔！`);
      await logToSystem(LogLevel.INFO, `管理員核准並審查匯入了建議資材: ${data.material} / ${data.product}`, 'AdminDashboard', { approvedBy: profile?.email, suggestionId: selectedSuggestion.id });
      
      setIsSuggestionDialogOpen(false);
      setSelectedSuggestion(null);
    } catch (err: any) {
      console.error(err);
      toast.error(`匯入失敗: ${err.message}`);
    }
  };

  const handleSuggestionReject = async (id: string) => {
    if (window.confirm('確定要拒絕並刪除這筆使用者全新資材建議提報嗎？')) {
      try {
        await deleteDoc(doc(db, 'newMasterData_resources', id));
        toast.info('已刪除並婉拒該建議。');
        await logToSystem(LogLevel.WARN, `管理員退回並刪除了使用者資材建議`, 'AdminDashboard', { suggestionId: id });
      } catch (err: any) {
        toast.error(`操作失敗: ${err.message}`);
      }
    }
  };

  // Clear Logs Method
  const handleClearAllLogs = async () => {
    if (window.confirm('警告：確定要清空系統中所有的運作日誌記錄嗎？此步驟將會徹底清除日誌資料庫。')) {
      setClearingLogs(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'systemLogs'));
        const batch = writeBatch(db);
        querySnapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        toast.success('系統日誌已全數清空');
      } catch (error: any) {
        toast.error(`清除日誌失敗: ${error.message}`);
      } finally {
        setClearingLogs(false);
      }
    }
  };

  // Filter and search computation for logs
  const filteredLogs = logs.filter(log => {
    const matchesLevel = logLevelFilter === 'all' || log.level === logLevelFilter;
    const matchesSearch = logSearchQuery.trim() === '' || 
      (log.message || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      (log.service || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      (log.userEmail || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(logSearchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const getLogLevelPill = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            Error
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Warn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
            <Info className="w-3.5 h-3.5 text-cyan-600" />
            Info
          </span>
        );
    }
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return '--';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col p-6 shrink-0">
        <div className="flex items-center gap-2 font-bold text-xl mb-12">
          <Settings className="w-6 h-6 text-cyan-400" />
          <span>管理後台</span>
        </div>
        
        <nav className="flex-1 space-y-2">
          <button 
            type="button"
            id="btn-nav-resources"
            onClick={() => setActiveTab('resources')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer text-left ${activeTab === 'resources' ? 'bg-cyan-600 text-white font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>資源主檔管理</span>
          </button>

          <button 
            type="button"
            id="btn-nav-suggestions"
            onClick={() => setActiveTab('suggestions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer text-left relative ${activeTab === 'suggestions' ? 'bg-cyan-600 text-white font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Sparkles className="w-5 h-5" />
            <span>建議資材審核</span>
            {suggestions.length > 0 && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shrink-0 animate-pulse">
                {suggestions.length}
              </span>
            )}
          </button>

          <button 
            type="button"
            id="btn-nav-logs"
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer text-left ${activeTab === 'logs' ? 'bg-cyan-600 text-white font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <FileText className="w-5 h-5" />
            <span>系統運作日誌</span>
          </button>
          
          <button 
            type="button"
            id="btn-nav-back"
            onClick={handleGoBack}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer text-left"
          >
            <Home className="w-5 h-5" />
            <span>返回使用者介面</span>
          </button>
        </nav>

        <button 
          type="button"
          id="btn-nav-logout"
          onClick={() => auth.signOut()}
          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer text-left mt-auto"
        >
          <LogOut className="w-5 h-5" />
          <span>登出</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto min-w-0">
        <div className="max-w-6xl mx-auto">
          
          {/* TAB 1: Resources CRUD */}
          {activeTab === 'resources' && (
            <div id="tab-resources-container">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">可回收資源主檔維護</h1>
                  <p className="text-slate-500 mt-1">管理系統中的材質、產品類別與回收建議</p>
                </div>
                <Button onClick={openAddResourceDialog} id="btn-add-resource" className="rounded-full gap-2 px-6 h-12 bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="w-5 h-5" />
                  新增資源類別
                </Button>
              </div>

              <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
                <CardHeader className="bg-white border-b border-slate-100">
                  <CardTitle>資源列表</CardTitle>
                  <CardDescription>目前系統中定義的可回收物資類別 ({resources.length} 項)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70">
                        <TableHead>材質</TableHead>
                        <TableHead>產品分類</TableHead>
                        <TableHead>預設減碳效益 (公克/單位)</TableHead>
                        <TableHead className="max-w-xs font-sans font-medium">預設建議</TableHead>
                        <TableHead>關鍵字</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resourcesLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">載入中...</TableCell></TableRow>
                      ) : resources.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">尚無資料</TableCell></TableRow>
                      ) : resources.map((res) => (
                        <TableRow key={res.id}>
                          <TableCell className="font-semibold text-slate-800">{res.material}</TableCell>
                          <TableCell className="text-slate-700">{res.product}</TableCell>
                          <TableCell className="font-mono text-emerald-600 font-semibold">{res.carbonReduced !== undefined ? `${res.carbonReduced} g / ${res.unit || '個'}` : '0 g / 個'}</TableCell>
                          <TableCell className="max-w-xs truncate text-slate-500" title={res.defaultSuggestion}>
                            {res.defaultSuggestion}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {res.keywords.slice(0, 4).map(k => (
                                <span key={k} className="bg-slate-100/80 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-medium">{k}</span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button onClick={() => openEditResourceDialog(res)} variant="ghost" size="icon" className="h-9 w-9 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-full">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button onClick={() => handleResourceDelete(res.id)} variant="ghost" size="icon" className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: Suggested Resources Audit */}
          {activeTab === 'suggestions' && (
            <div id="tab-suggestions-container">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">建議資材審核佇列</h1>
                  <p className="text-slate-500 mt-1">審查由日常 AI 影像辨識、或使用者手動回報提送的未登錄資材，經审查直接匯入系統資源主檔中</p>
                </div>
              </div>

              <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
                <CardHeader className="bg-white border-b border-slate-100">
                  <CardTitle>全新提報佇列</CardTitle>
                  <CardDescription>目前等待管理員审核修訂之資材建議 ({suggestions.length} 項)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70">
                        <TableHead>材質</TableHead>
                        <TableHead>產品名稱</TableHead>
                        <TableHead className="max-w-xs">提議預設分類/建議</TableHead>
                        <TableHead>提報使用者</TableHead>
                        <TableHead>提報時間</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestionsLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">載入中...</TableCell></TableRow>
                      ) : suggestions.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">目前沒有需要審查的全新資材建議</TableCell></TableRow>
                      ) : suggestions.map((sug) => (
                        <TableRow key={sug.id}>
                          <TableCell className="font-semibold text-slate-800">{sug.material}</TableCell>
                          <TableCell className="text-slate-700">{sug.product}</TableCell>
                          <TableCell className="max-w-xs truncate text-slate-500" title={sug.defaultSuggestion}>
                            <span className="inline-block px-1.5 py-0.5 text-[10px] bg-amber-50 rounded border border-amber-100 text-amber-700 mr-2 font-medium">Suggestion</span>
                            {sug.defaultSuggestion}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 max-w-[120px] truncate" title={sug.suggestedByEmail}>
                            {sug.suggestedByEmail || sug.suggestedBy || '系統匿名辨識'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatTimestamp(sug.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                onClick={() => openReviewSuggestionDialog(sug)} 
                                variant="outline" 
                                size="sm" 
                                className="rounded-full gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 pr-3.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                審查與匯入
                              </Button>
                              <Button 
                                onClick={() => handleSuggestionReject(sug.id)} 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: System Logs Inspector */}
          {activeTab === 'logs' && (
            <div id="tab-logs-container">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">系統連線與服務日誌</h1>
                  <p className="text-slate-500 mt-1">追蹤並分析 AI 影像辨識、航線最佳化、錯誤呼叫等後台運作狀態</p>
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setLogsLoading(true);
                      toast.success('日誌已重新同步');
                    }} 
                    className="rounded-full gap-2 border-slate-200 hover:bg-slate-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重整
                  </Button>
                  <Button 
                    variant="destructive" 
                    id="btn-clear-logs"
                    onClick={handleClearAllLogs} 
                    disabled={clearingLogs || logs.length === 0}
                    className="rounded-full gap-2 hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    {clearingLogs ? '清理中...' : '清除日誌'}
                  </Button>
                </div>
              </div>

              {/* Logs Search & Filters bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-2 relative">
                  <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                  <Input 
                    type="text" 
                    placeholder="搜尋錯誤訊息、服務類別 (e.g. analyze-image)、信箱或參數內容..." 
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="pl-10 h-12 rounded-2xl bg-white border-slate-200 focus-visible:ring-cyan-500 shadow-sm"
                  />
                </div>
                <div>
                  <select
                    id="select-log-level"
                    value={logLevelFilter}
                    onChange={(e) => setLogLevelFilter(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm shadow-sm cursor-pointer"
                  >
                    <option value="all">所有日誌等級 (Levels)</option>
                    <option value="error">Error (僅看異常)</option>
                    <option value="warn">Warn (僅看警告)</option>
                    <option value="info">Info (僅看資訊)</option>
                  </select>
                </div>
              </div>

              <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
                <CardHeader className="bg-white border-b border-slate-100 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>日誌串流</CardTitle>
                    <CardDescription>
                      {logSearchQuery || logLevelFilter !== 'all' ? `篩選結果：共找到 ${filteredLogs.length} 條符合條件的記錄` : `最近系統日誌清單 (共 ${logs.length} 條)`}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/70">
                          <TableHead className="w-[180px]">紀錄時間</TableHead>
                          <TableHead className="w-[120px]">等級</TableHead>
                          <TableHead className="w-[160px]">微服務/發起模組</TableHead>
                          <TableHead>事件摘要訊息 (Message)</TableHead>
                          <TableHead className="w-[180px]">發起使用者 (Email)</TableHead>
                          <TableHead className="text-right w-[100px]">詳細</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsLoading ? (
                          <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">載入中...</TableCell></TableRow>
                        ) : filteredLogs.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">沒有符合篩選條件的日誌記錄</TableCell></TableRow>
                        ) : filteredLogs.map((log) => (
                          <TableRow 
                            key={log.id} 
                            className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                            onClick={() => setSelectedLog(log)}
                          >
                            <TableCell className="font-mono text-xs text-slate-500">
                              {formatTimestamp(log.timestamp)}
                            </TableCell>
                            <TableCell>
                              {getLogLevelPill(log.level)}
                            </TableCell>
                            <TableCell>
                              <span className="inline-block bg-slate-100 text-slate-800 border border-slate-200 rounded px-2 py-0.5 text-xs font-mono font-medium">
                                {log.service}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate font-medium text-slate-800" title={log.message}>
                              {log.message}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 truncate max-w-[150px]" title={log.userEmail}>
                              {log.userEmail || 'anonymous'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLog(log);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </main>

      {/* CRUD DIALOG for Resource Master Data */}
      <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingResource ? '編輯資源定義' : '新增資源定義'}</DialogTitle>
            <DialogDescription>
              輸入資源的材質、分類與 AI 辨識關鍵字。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="material">材質材質 (如：塑膠)</Label>
                <Input id="material" value={material} onChange={e => setMaterial(e.target.value)} placeholder="塑膠" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product">產品分類 (如：PET 瓶)</Label>
                <Input id="product" value={product} onChange={e => setProduct(e.target.value)} placeholder="PET 瓶" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suggestion">預設回收建議</Label>
              <Input id="suggestion" value={suggestion} onChange={e => setSuggestion(e.target.value)} placeholder="請洗淨並壓扁..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">關鍵字 (逗號分隔，用於 AI 比對)</Label>
              <Input id="keywords" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="寶特瓶, 飲料罐, PET" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">數量計量單位</Label>
                <Input 
                  id="unit" 
                  value={unit} 
                  onChange={e => setUnit(e.target.value)} 
                  placeholder="如：個, 瓶, 片, 公升" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carbonReduced">每單位減碳效益 (公克/單位)</Label>
                <Input 
                  id="carbonReduced" 
                  type="number" 
                  value={carbonReduced} 
                  onChange={e => setCarbonReduced(e.target.value)} 
                  placeholder="例如: 20" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResourceDialogOpen(false)} className="rounded-full">取消</Button>
            <Button onClick={handleResourceSubmit} className="rounded-full min-w-[100px] bg-cyan-600 hover:bg-cyan-700 text-white">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggestion Review and Import Dialog */}
      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>審查並匯入全新資材建議</DialogTitle>
            <DialogDescription>
              提報者：{selectedSuggestion?.suggestedByEmail || '未知用戶'}<br />
              原創材質分類：{selectedSuggestion?.material} / {selectedSuggestion?.product}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sug-material">材質 (如：塑膠)</Label>
                <Input id="sug-material" value={material} onChange={e => setMaterial(e.target.value)} placeholder="塑膠" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sug-product">產品分類 (如：PET 瓶)</Label>
                <Input id="sug-product" value={product} onChange={e => setProduct(e.target.value)} placeholder="PET 瓶" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sug-suggestion">預設回收建議</Label>
              <Input id="sug-suggestion" value={suggestion} onChange={e => setSuggestion(e.target.value)} placeholder="請洗淨並壓扁..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sug-keywords">關鍵字 (逗號分隔)</Label>
              <Input id="sug-keywords" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="寶特瓶, 飲料罐" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sug-unit">計量單位</Label>
                <Input 
                  id="sug-unit" 
                  value={unit} 
                  onChange={e => setUnit(e.target.value)} 
                  placeholder="如：個, 瓶, 片, 公升" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sug-carbonReduced">每單位減碳效益 (公克/單位)</Label>
                <Input 
                  id="sug-carbonReduced" 
                  type="number" 
                  value={carbonReduced} 
                  onChange={e => setCarbonReduced(e.target.value)} 
                  placeholder="例如: 20" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuggestionDialogOpen(false)} className="rounded-full">取消</Button>
            <Button onClick={handleSuggestionApprove} className="rounded-full min-w-[100px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
              <Check className="w-4 h-4" />
              核准並匯入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SYSTEM LOG INSPECTOR DETAILED MODEL */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <DialogContent className="sm:max-w-[700px] rounded-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              {selectedLog && getLogLevelPill(selectedLog.level)}
              <span className="text-slate-400 text-xs font-mono font-medium">#{selectedLog?.id}</span>
            </div>
            <DialogTitle className="text-xl font-bold text-slate-950 font-sans tracking-tight">
              日誌深度診斷詳情
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-1">
              查看或複製發送請求之變數、微服務回應內容或 Stack Trace
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="flex-1 overflow-y-auto space-y-5 my-4 pr-1 text-slate-800 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">紀錄時間</span>
                  <span className="font-semibold text-slate-700">{formatTimestamp(selectedLog.timestamp)}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">服務/發起模組</span>
                  <span className="font-mono text-cyan-700 font-semibold">{selectedLog.service}</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200/50">
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">呼叫使用者 (User Email)</span>
                  <span className="font-mono text-slate-600 truncate max-w-full block">{selectedLog.userEmail || 'anonymous'}</span>
                </div>
                <div className="col-span-2 pb-1">
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">使用者帳號 UID</span>
                  <span className="font-mono text-slate-500 text-xs select-all block">{selectedLog.userId}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">事件摘要訊息 (Message)</span>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium text-slate-900 break-words leading-relaxed select-all">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.details && (
                <div className="space-y-1 flex flex-col">
                  <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">結構化參數與詳細回應 (Details)</span>
                  <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl font-mono text-xs leading-normal whitespace-pre-wrap overflow-x-auto select-all max-h-[300px]">
                    {selectedLog.details}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 text-right shrink-0">
            <Button 
              type="button" 
              onClick={() => setSelectedLog(null)} 
              className="rounded-full px-6 bg-slate-900 hover:bg-slate-800 text-white"
            >
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
