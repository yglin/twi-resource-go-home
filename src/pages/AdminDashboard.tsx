import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, doc, deleteDoc, writeBatch, getDocs, where } from 'firebase/firestore';
import { createDocument, updateDocument, enrichResourceWithAI } from '../services/firestoreService';
import { MasterDataResource, NewMasterDataResource, UserProfile } from '../types';
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
  Check,
  Users,
  Tag,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

function formatExpireHours(hours: number): string {
  if (!hours || hours <= 0) return '無限期';
  
  let remaining = hours;
  const years = Math.floor(remaining / 8760);
  remaining = remaining % 8760;
  
  const months = Math.floor(remaining / 720);
  remaining = remaining % 720;
  
  const days = Math.floor(remaining / 24);
  remaining = remaining % 24;
  
  const hoursLeft = remaining;
  
  let result = '';
  if (years > 0) result += `${years}年`;
  if (months > 0) result += `${months}個月`;
  if (days > 0) result += `${days}天`;
  if (hoursLeft > 0) result += `${hoursLeft}小時`;
  
  return result || '無限期';
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Active Tab: 'resources' | 'suggestions' | 'logs' | 'users' | 'brands'
  const [activeTab, setActiveTab] = useState<'resources' | 'suggestions' | 'logs' | 'users' | 'brands'>('resources');

  // Brand Statistics State
  const [brandsList, setBrandsList] = useState<{ id: string; recoveryRecords: string[] }[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<{ id: string; recoveryRecords: string[] } | null>(null);
  const [brandRecords, setBrandRecords] = useState<any[]>([]);
  const [brandRecordsLoading, setBrandRecordsLoading] = useState(false);

  // User Management State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userCategoryFilter, setUserCategoryFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

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
  const [expireAfterhHours, setExpireAfterhHours] = useState<number | string>('');
  const [estimatedWeight, setEstimatedWeight] = useState<number | string>('');
  const [enriching, setEnriching] = useState(false);

  const handleAIEnrich = async () => {
    if (!material.trim() || !product.trim()) {
      toast.error('請先填寫材質與產品品名，才能進行 AI 智慧補充！');
      return;
    }

    setEnriching(true);
    const toastId = toast.loading(`正在由 AI 智慧分析並自動填寫 [${material.trim()} - ${product.trim()}]...`);
    try {
      const res = await enrichResourceWithAI(material.trim(), product.trim());
      if (res.success && res.data) {
        setSuggestion(res.data.defaultSuggestion || '');
        setKeywords(res.data.keywords ? res.data.keywords.join(', ') : '');
        setUnit(res.data.unit || '個');
        setCarbonReduced(res.data.carbonReduced ?? '');
        setExpireAfterhHours(res.data.expireAfterhHours ?? '');
        setEstimatedWeight(res.data.estimatedWeight ?? '');
        toast.success('AI 智慧分析完成，並已同步寫入/更新資源主檔！', { id: toastId });
      } else {
        throw new Error('自動填寫無效');
      }
    } catch (err: any) {
      toast.error(`AI 智慧填寫失敗: ${err.message}`, { id: toastId });
    } finally {
      setEnriching(false);
    }
  };

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

  // Load Users
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      data.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setUsers(data);
      setUsersLoading(false);
    }, (error) => {
      console.error("Failed to load users:", error);
      setUsersLoading(false);
    });
    return unsubscribe;
  }, []);

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

  // Load Brands Statistics dynamically by merging 'brand' collection and 'recoveryRecords'
  useEffect(() => {
    let brandsFromDb: { id: string; recoveryRecords: string[] }[] = [];
    let recordsFromDb: any[] = [];
    let brandsLoaded = false;
    let recordsLoaded = false;

    const checkAndCombine = () => {
      if (!brandsLoaded || !recordsLoaded) return;

      const mergedMap = new Map<string, Set<string>>();

      // 1. Seed with brands collection
      brandsFromDb.forEach(b => {
        if (!mergedMap.has(b.id)) {
          mergedMap.set(b.id, new Set(b.recoveryRecords));
        } else {
          b.recoveryRecords.forEach(id => mergedMap.get(b.id)!.add(id));
        }
      });

      // 2. Scan all recovery records to ensure 100% accurate count
      recordsFromDb.forEach(record => {
        if (Array.isArray(record.brands)) {
          record.brands.forEach((b: string) => {
            const trimmed = b.trim();
            if (trimmed) {
              if (!mergedMap.has(trimmed)) {
                mergedMap.set(trimmed, new Set());
              }
              mergedMap.get(trimmed)!.add(record.id);
            }
          });
        }
      });

      // Convert back to list
      const data = Array.from(mergedMap.entries()).map(([brandName, idSet]) => ({
        id: brandName,
        recoveryRecords: Array.from(idSet)
      }));

      // Sort brands by the number of associated recovery records descending, then alphabetically
      data.sort((a, b) => {
        const diff = (b.recoveryRecords?.length || 0) - (a.recoveryRecords?.length || 0);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      setBrandsList(data);
      setBrandsLoading(false);
    };

    const qBrands = query(collection(db, 'brand'));
    const unsubscribeBrands = onSnapshot(qBrands, (snapshot) => {
      brandsFromDb = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          recoveryRecords: Array.isArray(item.recoveryRecords) ? item.recoveryRecords : []
        };
      });
      brandsLoaded = true;
      checkAndCombine();
    }, (error) => {
      console.error("Failed to load brands:", error);
      brandsLoaded = true;
      checkAndCombine();
    });

    const qRecords = query(collection(db, 'recoveryRecords'));
    const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
      recordsFromDb = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      recordsLoaded = true;
      checkAndCombine();
    }, (error) => {
      console.error("Failed to load recovery records for brands:", error);
      recordsLoaded = true;
      checkAndCombine();
    });

    return () => {
      unsubscribeBrands();
      unsubscribeRecords();
    };
  }, []);

  // Fetch detailed recovery records for the selected brand
  useEffect(() => {
    if (!selectedBrand) {
      setBrandRecords([]);
      return;
    }
    setBrandRecordsLoading(true);
    const fetchBrandRecords = async () => {
      try {
        const q = query(
          collection(db, 'recoveryRecords'),
          where('brands', 'array-contains', selectedBrand.id)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => {
          const item = doc.data();
          return {
            id: doc.id,
            ...item
          };
        });
        // Sort by createdAt descending
        data.sort((a: any, b: any) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        });
        setBrandRecords(data);
      } catch (err) {
        console.error("Failed to fetch brand records:", err);
        toast.error("讀取該品牌的回收記錄失敗");
      } finally {
        setBrandRecordsLoading(false);
      }
    };
    fetchBrandRecords();
  }, [selectedBrand]);

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
    setExpireAfterhHours('');
    setEstimatedWeight('');
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
    setExpireAfterhHours(res.expireAfterhHours !== undefined ? res.expireAfterhHours : '');
    setEstimatedWeight(res.estimatedWeight !== undefined ? res.estimatedWeight : '');
    setIsResourceDialogOpen(true);
  };

  const handleResourceSubmit = async () => {
    const carbonVal = carbonReduced === '' ? 0 : Number(carbonReduced);
    const expireVal = expireAfterhHours === '' ? 0 : Number(expireAfterhHours);
    const weightVal = estimatedWeight === '' ? 0 : Number(estimatedWeight);
    const data = {
      material: material.trim(),
      product: product.trim(),
      defaultSuggestion: suggestion.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      icon,
      carbonReduced: isNaN(carbonVal) ? 0 : carbonVal,
      unit: unit.trim() || '個',
      expireAfterhHours: isNaN(expireVal) ? 0 : expireVal,
      estimatedWeight: isNaN(weightVal) ? 0 : weightVal
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
    triggerConfirm(
      '確定要刪除此資源定義嗎？',
      '此操作將會永久刪除此資源定義，且無法復原。',
      async () => {
        try {
          await deleteDoc(doc(db, 'masterData_resources', id));
          toast.success('刪除成功');
        } catch (err) {
          toast.error('刪除失敗');
        }
      }
    );
  };

  // Suggestion review and import methods
  const [selectedSuggestion, setSelectedSuggestion] = useState<NewMasterDataResource | null>(null);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);

  // Reusable confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const triggerConfirm = (title: string, description: string, onConfirm: () => void | Promise<void>) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      onConfirm: async () => {
        try {
          await onConfirm();
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const openReviewSuggestionDialog = (sug: NewMasterDataResource) => {
    setSelectedSuggestion(sug);
    setMaterial(sug.material);
    setProduct(sug.product);
    setSuggestion(sug.defaultSuggestion);
    setKeywords(sug.keywords ? sug.keywords.join(', ') : '');
    setIcon(sug.icon || '');
    setCarbonReduced(sug.carbonReduced ?? '');
    setUnit(sug.unit || '個');
    setExpireAfterhHours(sug.expireAfterhHours !== undefined ? sug.expireAfterhHours : '');
    setEstimatedWeight(sug.estimatedWeight !== undefined ? sug.estimatedWeight : '');
    setIsSuggestionDialogOpen(true);
  };

  const handleSuggestionApprove = async () => {
    if (!selectedSuggestion) return;

    const carbonVal = carbonReduced === '' ? 0 : Number(carbonReduced);
    const expireVal = expireAfterhHours === '' ? 0 : Number(expireAfterhHours);
    const weightVal = estimatedWeight === '' ? 0 : Number(estimatedWeight);
    const data = {
      material: material.trim(),
      product: product.trim(),
      defaultSuggestion: suggestion.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      icon,
      carbonReduced: isNaN(carbonVal) ? 0 : carbonVal,
      unit: unit.trim() || '個',
      expireAfterhHours: isNaN(expireVal) ? 0 : expireVal,
      estimatedWeight: isNaN(weightVal) ? 0 : weightVal
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
    triggerConfirm(
      '確定要拒絕並刪除這筆使用者全新資材建議提報嗎？',
      '此操作將會退回該提報，並從佇列中刪除，且無法復原。',
      async () => {
        try {
          await deleteDoc(doc(db, 'newMasterData_resources', id));
          toast.info('已刪除並婉拒該建議。');
          await logToSystem(LogLevel.WARN, `管理員退回並刪除了使用者資材建議`, 'AdminDashboard', { suggestionId: id });
        } catch (err: any) {
          toast.error(`操作失敗: ${err.message}`);
        }
      }
    );
  };

  // Clear Logs Method
  const handleClearAllLogs = async () => {
    triggerConfirm(
      '確認清除所有日誌',
      '警告：確定要清空系統中所有的運作日誌記錄嗎？此步驟將會徹底清除日誌資料庫。',
      async () => {
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
    );
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

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'MAKER_FISH':
        return (
          <span key={role} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200 shrink-0">
            🐟 梅克魚
          </span>
        );
      case 'GOING_HOME':
        return (
          <span key={role} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
            ✈️ 勾引魟
          </span>
        );
      case 'RECYCLER':
        return (
          <span key={role} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
            🪸 資源瑞莎魺
          </span>
        );
      case 'SYSTEM_ADMIN':
        return (
          <span key={role} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
            ⚙️ 管理員
          </span>
        );
      default:
        return (
          <span key={role} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
            {role}
          </span>
        );
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesRole = userRoleFilter === 'all' || (u.roles && u.roles.includes(userRoleFilter as any));
    
    let matchesCategory = true;
    if (userCategoryFilter !== 'all') {
      const selectedRes = resources.find(r => r.id === userCategoryFilter);
      if (selectedRes) {
        const hasAcceptedId = u.acceptedCategories?.includes(userCategoryFilter);
        const hasGuideMatch = u.recoveryGuides?.some(g => 
          g.resourceId === userCategoryFilter || 
          (g.material === selectedRes.material && g.product === selectedRes.product)
        );
        matchesCategory = !!(hasAcceptedId || hasGuideMatch);
      } else {
        matchesCategory = false;
      }
    }

    const matchesSearch = userSearchQuery.trim() === '' || 
      (u.displayName || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.phoneNumber || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.address || '').toLowerCase().includes(userSearchQuery.toLowerCase());
    return matchesRole && matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col p-6 shrink-0 overflow-y-auto min-h-0 custom-sidebar">
        <div className="flex items-center gap-2 font-bold text-xl mb-8 shrink-0">
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
            id="btn-nav-users"
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer text-left ${activeTab === 'users' ? 'bg-cyan-600 text-white font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Users className="w-5 h-5" />
            <span>使用者管理</span>
          </button>

          <button 
            type="button"
            id="btn-nav-brands"
            onClick={() => setActiveTab('brands')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer text-left ${activeTab === 'brands' ? 'bg-cyan-600 text-white font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Tag className="w-5 h-5" />
            <span>品牌統計</span>
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
          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer text-left mt-8 shrink-0"
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
                <div className="flex gap-3">
                  <Button 
                    onClick={async () => {
                      const id = toast.loading('正在計算平均收購價 (用戶端)...');
                      try {
                        const recyclers = users.filter(u => u.roles?.includes('RECYCLER'));
                        const batch = writeBatch(db);
                        let updatedCount = 0;
                        
                        for (const resource of resources) {
                          const resourceId = resource.id;
                          let sumPricePerKg = 0;
                          let count = 0;
                          
                          for (const recycler of recyclers) {
                            const guides = recycler.recoveryGuides || [];
                            const matchedGuide = guides.find((g: any) => g.resourceId === resourceId);
                            if (matchedGuide && (typeof matchedGuide.price === 'number' || !isNaN(Number(matchedGuide.price)))) {
                              const price = Number(matchedGuide.price);
                              sumPricePerKg += price;
                              count++;
                            }
                          }
                          
                          const avgPrice = count > 0 ? Number((sumPricePerKg / count).toFixed(2)) : 0;
                          const resourceRef = doc(db, 'masterData_resources', resourceId);
                          batch.update(resourceRef, { avgPrice });
                          updatedCount++;
                        }
                        
                        if (updatedCount > 0) {
                          await batch.commit();
                        }
                        
                        try {
                          await logToSystem(LogLevel.INFO, `Successfully calculated and updated avgPrice for ${updatedCount} resource categories via Admin Console.`, "avg-price-recalculator-client");
                        } catch (logErr) {
                          console.warn("Could not log to system logs:", logErr);
                        }

                        toast.success('平均收購價計算更新成功！', { id });
                      } catch (err: any) {
                        console.error('Client recalculation failed:', err);
                        toast.error(`計算時發生錯誤: ${err.message}`, { id });
                      }
                    }} 
                    variant="outline" 
                    id="btn-recalculate-prices" 
                    className="rounded-full gap-2 border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <RefreshCw className="w-4 h-4 text-cyan-600" />
                    更新平均收購價
                  </Button>
                  <Button onClick={openAddResourceDialog} id="btn-add-resource" className="rounded-full gap-2 px-6 h-12 bg-cyan-600 hover:bg-cyan-700">
                    <Plus className="w-5 h-5" />
                    新增資源類別
                  </Button>
                </div>
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
                        <TableHead>過期時數 (小時)</TableHead>
                        <TableHead>預估單件重量 (kg)</TableHead>
                        <TableHead>預設減碳效益 (公克/公斤)</TableHead>
                        <TableHead>平均收購價 (元/公斤)</TableHead>
                        <TableHead className="max-w-xs font-sans font-medium">預設建議</TableHead>
                        <TableHead>關鍵字</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resourcesLoading ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-12 text-slate-400">載入中...</TableCell></TableRow>
                      ) : resources.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-12 text-slate-400">尚無資料</TableCell></TableRow>
                      ) : resources.map((res) => (
                        <TableRow key={res.id}>
                          <TableCell className="font-semibold text-slate-800">{res.material}</TableCell>
                          <TableCell className="text-slate-700">{res.product}</TableCell>
                          <TableCell className="font-mono text-amber-600 font-semibold">
                            {formatExpireHours(res.expireAfterhHours || 0)}
                          </TableCell>
                          <TableCell className="font-mono text-blue-600 font-semibold">
                            {res.estimatedWeight !== undefined ? `${res.estimatedWeight} kg` : '0 kg'}
                          </TableCell>
                          <TableCell className="font-mono text-emerald-600 font-semibold">{res.carbonReduced !== undefined ? `${res.carbonReduced} g / kg` : '0 g / kg'}</TableCell>
                          <TableCell className="font-mono text-cyan-600 font-semibold">
                            {res.avgPrice !== undefined ? `${res.avgPrice} 元 / kg` : '0 元 / kg'}
                          </TableCell>
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

          {/* TAB: User Management */}
          {activeTab === 'users' && (
            <div id="tab-users-container" className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">系統使用者管理</h1>
                  <p className="text-slate-500 mt-1">管理並審查平台上的所有梅克魚、勾引魟、資源瑞莎魺與管理人員帳號</p>
                </div>
              </div>

              {/* Filters / Search */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                <div className="lg:col-span-2 relative">
                  <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                  <Input 
                    type="text" 
                    placeholder="搜尋姓名、Email、聯絡電話、服務地址..." 
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10 h-12 rounded-2xl bg-white border-slate-200 focus-visible:ring-cyan-500 shadow-sm animate-fade-in"
                  />
                </div>
                <div>
                  <select
                    id="select-user-role"
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm shadow-sm cursor-pointer"
                  >
                    <option value="all">所有身分角色 (All Roles)</option>
                    <option value="MAKER_FISH">🐟 梅克魚 (Maker Fish)</option>
                    <option value="GOING_HOME">✈️ 勾引魟 (Going Home)</option>
                    <option value="RECYCLER">🪸 資源瑞莎魺 (Recycler)</option>
                    <option value="SYSTEM_ADMIN">⚙️ 管理員 (Admin)</option>
                  </select>
                </div>
                <div>
                  <select
                    id="select-user-category"
                    value={userCategoryFilter}
                    onChange={(e) => setUserCategoryFilter(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm shadow-sm cursor-pointer"
                  >
                    <option value="all">所有收受資材品類</option>
                    {resources.map(res => (
                      <option key={res.id} value={res.id}>
                        📦 {res.material} - {res.product}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Users Table Card */}
              <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
                <CardHeader className="bg-white border-b border-slate-100">
                  <CardTitle>使用者帳號清單</CardTitle>
                  <CardDescription>
                    {userSearchQuery || userRoleFilter !== 'all' || userCategoryFilter !== 'all'
                      ? `篩選結果：共找到 ${filteredUsers.length} 位符合條件的使用者` 
                      : `目前系統註冊使用者 (共 ${users.length} 位)`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/70">
                          <TableHead className="w-[180px]">顯示名稱</TableHead>
                          <TableHead className="w-[200px]">Email / 電話</TableHead>
                          <TableHead className="min-w-[150px]">持有身份角色</TableHead>
                          <TableHead className="max-w-[250px]">登記通訊地址</TableHead>
                          <TableHead className="text-right w-[100px]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersLoading ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">載入中...</TableCell></TableRow>
                        ) : filteredUsers.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">沒有符合篩選條件的使用者帳號</TableCell></TableRow>
                        ) : filteredUsers.map((u) => (
                          <TableRow 
                            key={u.id} 
                            className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                            onClick={() => setSelectedUser(u)}
                          >
                            <TableCell className="font-semibold text-slate-800">
                              <div className="flex items-center gap-2">
                                {u.photoURL && u.photoURL !== "" ? (
                                  <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                                    {(u.displayName || u.email || 'U')[0]}
                                  </div>
                                )}
                                <span className="truncate">{u.displayName || '未設定名稱'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5 text-xs">
                                <p className="font-mono text-slate-600 truncate max-w-[180px]">{u.email}</p>
                                <p className="text-slate-400 font-mono">{u.phoneNumber || '未提供電話'}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {u.roles && u.roles.length > 0 ? (
                                  u.roles.map(role => getRoleBadge(role))
                                ) : (
                                  <span className="text-xs text-slate-400">無角色</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate text-xs text-slate-500" title={u.address}>
                              {u.address || '未填寫'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUser(u);
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

          {/* TAB: Brand Statistics */}
          {activeTab === 'brands' && (
            <div id="tab-brands-container" className="space-y-6 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 tracking-tight">回收品類品牌統計</h1>
                  <p className="text-slate-500 mt-1">追蹤並統計不同生產商與產品品牌的相關回收資材紀錄</p>
                </div>
              </div>

              {/* Brands Statistics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
                <Card className="rounded-3xl border border-slate-100/80 shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50/50 hover:shadow-md transition-shadow">
                  <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">已註冊品牌數</p>
                      <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-2xl shrink-0">
                        <Tag className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-baseline gap-1">
                      <h3 className="text-4xl font-black text-slate-900 tracking-tight">{brandsList.length}</h3>
                      <span className="text-sm font-semibold text-slate-500">個</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-slate-100/80 shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50/50 hover:shadow-md transition-shadow">
                  <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">總回收關聯紀錄數</p>
                      <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-baseline gap-1">
                      <h3 className="text-4xl font-black text-slate-900 tracking-tight">
                        {brandsList.reduce((acc, curr) => acc + (curr.recoveryRecords?.length || 0), 0)}
                      </h3>
                      <span className="text-sm font-semibold text-slate-500">次</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-slate-100/80 shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50/50 hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
                  <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">最活躍回收品牌</p>
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-xl font-extrabold text-slate-900 tracking-tight truncate max-w-[220px]" title={brandsList.length > 0 ? brandsList[0].id : '無資料'}>
                        {brandsList.length > 0 ? brandsList[0].id : '無資料'}
                      </h3>
                      {brandsList.length > 0 && (
                        <p className="text-xs text-indigo-600 font-bold mt-1 bg-indigo-50/50 rounded-full px-2 py-0.5 inline-block border border-indigo-100/30">
                          已關聯 {brandsList[0].recoveryRecords?.length || 0} 筆回收記錄
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filter & Table */}
              <Card className="rounded-3xl border-slate-100 shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-950 flex items-center gap-2">
                      🏷️ 品牌資材關聯清單
                    </CardTitle>
                    <CardDescription className="text-slate-500 mt-1">
                      可檢視各品牌的關聯回收紀錄統計，點擊「檢視關聯記錄」可查詢該品牌的歷史回收履歷
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-80 relative">
                    <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <Input 
                      type="text" 
                      placeholder="搜尋品牌名稱..." 
                      value={brandSearchQuery}
                      onChange={(e) => setBrandSearchQuery(e.target.value)}
                      className="pl-9 bg-slate-50 border-slate-200/80 focus-visible:ring-cyan-500 rounded-2xl"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {brandsLoading ? (
                    <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-cyan-600" />
                      <span>正在載入品牌統計資料...</span>
                    </div>
                  ) : brandsList.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                      <Tag className="w-12 h-12 mx-auto mb-3 opacity-25" />
                      <p className="font-semibold">目前暫無品牌統計資料</p>
                      <p className="text-xs mt-1">當回收物資被辨識並儲存對應之品牌標籤後將於此自動統計</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                            <TableHead className="pl-6 py-4 font-bold text-slate-700">品牌名稱</TableHead>
                            <TableHead className="py-4 font-bold text-slate-700">關聯回收次數</TableHead>
                            <TableHead className="py-4 font-bold text-slate-700">自動生成標籤圖示</TableHead>
                            <TableHead className="pr-6 py-4 font-bold text-slate-700 text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {brandsList
                            .filter(b => b.id.toLowerCase().includes(brandSearchQuery.toLowerCase()))
                            .map((brand, idx) => (
                              <TableRow key={brand.id} className="hover:bg-slate-50/40 transition-colors">
                                <TableCell className="pl-6 py-4 font-semibold text-slate-800">
                                  <span className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full px-3 py-1 text-xs font-semibold border border-slate-200/50 transition-colors">
                                    🏷️ {brand.id}
                                  </span>
                                </TableCell>
                                <TableCell className="py-4">
                                  <span className="font-mono font-bold text-slate-700">
                                    {brand.recoveryRecords?.length || 0}
                                  </span>
                                  <span className="text-xs text-slate-400 ml-1">筆記錄</span>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm uppercase select-none">
                                      {brand.id.slice(0, 2)}
                                    </div>
                                    <span className="text-xs text-slate-400 font-medium font-mono hidden sm:inline">
                                      {brand.id.charAt(0).toUpperCase()} Logo Asset
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="pr-6 py-4 text-right">
                                  <Button 
                                    type="button"
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setSelectedBrand(brand)}
                                    className="rounded-full text-xs font-bold border-slate-200 hover:bg-cyan-50 hover:text-cyan-600 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                    檢視關聯記錄
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </main>

      {/* CRUD DIALOG for Resource Master Data */}
      <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingResource ? '編輯資源定義' : '新增資源定義'}</DialogTitle>
            <DialogDescription>
              輸入資源的材質、分類與 AI 辨識關鍵字。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4 overflow-y-auto pr-2 flex-1">
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
            <Button 
              type="button"
              id="btn-ai-enrich"
              onClick={handleAIEnrich}
              disabled={enriching || !material.trim() || !product.trim()}
              className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white rounded-2xl gap-2 font-semibold shadow-sm transition-all animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed h-11 shrink-0"
            >
              <Sparkles className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
              {enriching ? 'AI 正在探索及更新中...' : 'AI 智慧分析並自動填報其餘欄位'}
            </Button>
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
                <Label htmlFor="carbonReduced">每公斤減碳效益 (公克/公斤)</Label>
                <Input 
                  id="carbonReduced" 
                  type="number" 
                  value={carbonReduced} 
                  onChange={e => setCarbonReduced(e.target.value)} 
                  placeholder="例如: 20" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expireAfterhHours">過期時數 (小時，0表示無限期)</Label>
                <Input 
                  id="expireAfterhHours" 
                  type="number" 
                  value={expireAfterhHours} 
                  onChange={e => setExpireAfterhHours(e.target.value)} 
                  placeholder="例如: 24，0表示無限期" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedWeight">單件預估重量 (公斤/個)</Label>
                <Input 
                  id="estimatedWeight" 
                  type="number" 
                  step="0.001"
                  value={estimatedWeight} 
                  onChange={e => setEstimatedWeight(e.target.value)} 
                  placeholder="例如: 0.025" 
                />
              </div>
            </div>
            {editingResource && (
              <div className="space-y-2">
                <Label htmlFor="avgPrice">平均收購價 (元/公斤) [由系統自動更新，管理員不可修改]</Label>
                <Input 
                  id="avgPrice" 
                  type="text" 
                  value={editingResource.avgPrice !== undefined ? `${editingResource.avgPrice} 元 / kg` : '0 元 / kg'} 
                  disabled
                  className="bg-slate-50 border-slate-200 cursor-not-allowed select-none font-semibold text-cyan-600"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResourceDialogOpen(false)} className="rounded-full">取消</Button>
            <Button onClick={handleResourceSubmit} className="rounded-full min-w-[100px] bg-cyan-600 hover:bg-cyan-700 text-white">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggestion Review and Import Dialog */}
      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>審查並匯入全新資材建議</DialogTitle>
            <DialogDescription>
              提報者：{selectedSuggestion?.suggestedByEmail || '未知用戶'}<br />
              原創材質分類：{selectedSuggestion?.material} / {selectedSuggestion?.product}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4 overflow-y-auto pr-2 flex-1">
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
            <Button 
              type="button"
              id="btn-sug-ai-enrich"
              onClick={handleAIEnrich}
              disabled={enriching || !material.trim() || !product.trim()}
              className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white rounded-2xl gap-2 font-semibold shadow-sm transition-all animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed h-11 shrink-0"
            >
              <Sparkles className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
              {enriching ? 'AI 正在探索及更新中...' : 'AI 智慧分析並自動填報其餘欄位'}
            </Button>
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
                <Label htmlFor="sug-carbonReduced">每公斤減碳效益 (公克/公斤)</Label>
                <Input 
                  id="sug-carbonReduced" 
                  type="number" 
                  value={carbonReduced} 
                  onChange={e => setCarbonReduced(e.target.value)} 
                  placeholder="例如: 20" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sug-expireAfterhHours">過期時數 (小時，0表示無限期)</Label>
                <Input 
                  id="sug-expireAfterhHours" 
                  type="number" 
                  value={expireAfterhHours} 
                  onChange={e => setExpireAfterhHours(e.target.value)} 
                  placeholder="例如: 24，0表示無限期" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sug-estimatedWeight">單件預估重量 (公斤/個)</Label>
                <Input 
                  id="sug-estimatedWeight" 
                  type="number" 
                  step="0.001"
                  value={estimatedWeight} 
                  onChange={e => setEstimatedWeight(e.target.value)} 
                  placeholder="例如: 0.025" 
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

      {/* USER DETAILS DIALOG */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-[700px] rounded-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-950 font-sans tracking-tight">
              使用者詳細資料
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-1">
              檢視此使用者的設定檔、角色特徵、時段配置及回收指南
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="flex-1 overflow-y-auto space-y-6 my-4 pr-1 text-slate-800 text-sm">
              {/* Profile Card Header */}
              <div className="flex items-start gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
                {selectedUser.photoURL && selectedUser.photoURL !== "" ? (
                  <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-16 h-16 rounded-full object-cover border border-slate-300" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-2xl uppercase border border-slate-300">
                    {(selectedUser.displayName || selectedUser.email || 'U')[0]}
                  </div>
                )}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 truncate">{selectedUser.displayName || '未設定顯示名稱'}</h3>
                    <span className="font-mono text-xs text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full select-all">
                      UID: {selectedUser.id}
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-600">
                    <p className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-slate-500">Email:</span>
                      <span className="font-mono text-xs">{selectedUser.email}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-500">電話:</span>
                      <span>{selectedUser.phoneNumber || '未提供'}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedUser.roles && selectedUser.roles.map(role => getRoleBadge(role))}
                  </div>
                </div>
              </div>

              {/* Physical Location Details */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">地理位置與通訊設定</h4>
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                  <div>
                    <span className="block text-xs font-semibold text-slate-500 mb-0.5">登記通訊地址</span>
                    <span className="text-slate-800 font-medium">{selectedUser.address || '未填寫'}</span>
                  </div>
                  {selectedUser.coordinates && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 font-mono text-xs">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">經緯度座標 (GeoPoint)</span>
                        <span className="text-slate-700">
                          {selectedUser.coordinates.latitude.toFixed(6)}, {selectedUser.coordinates.longitude.toFixed(6)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">地理雜湊值 (Geohash)</span>
                        <span className="text-slate-700">{selectedUser.geohash || '未生成'}</span>
                      </div>
                    </div>
                  )}
                  {selectedUser.recycleNotes && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="block text-xs font-semibold text-slate-500 mb-1">長期回收通案備註 / 聲明</span>
                      <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100 text-slate-600 italic leading-relaxed text-xs">
                        「 {selectedUser.recycleNotes} 」
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Availability Slots (Maker Fish Specific) */}
              {selectedUser.roles?.includes('MAKER_FISH') && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🐟 梅克魚上門收運時段</span>
                    <span className="text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-full">MAKER_FISH</span>
                  </h4>
                  <div className="bg-white p-4 rounded-xl border border-slate-200/80">
                    {selectedUser.availabilitySlots && selectedUser.availabilitySlots.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {selectedUser.availabilitySlots.map((slot, index) => {
                          const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
                          return (
                            <div key={index} className="flex justify-between items-center bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-xs font-medium text-slate-700">
                              <span>{days[slot.dayOfWeek]}</span>
                              <span className="font-mono text-cyan-700 bg-cyan-50/50 px-2 py-0.5 rounded border border-cyan-100/50">
                                {slot.startTime} ~ {slot.endTime}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs text-center py-4">未配置特定的上門收取開放時段</p>
                    )}
                  </div>
                </div>
              )}

              {/* Going Home Specific Details */}
              {selectedUser.roles?.includes('GOING_HOME') && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>✈️ 勾引魟物流配備</span>
                    <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">GOING_HOME</span>
                  </h4>
                  <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block text-xs font-semibold text-slate-500 mb-1">最遠收運距離</span>
                        <span className="font-mono text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs">
                          {selectedUser.maxDistance !== undefined ? `${selectedUser.maxDistance} 公里 (km)` : '預設 10 公里'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-500 mb-1">擁有交通工具</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedUser.vehicles && selectedUser.vehicles.length > 0 ? (
                            selectedUser.vehicles.map(v => {
                              const vLabels: Record<string, string> = {
                                trolley: '🛒 手推車',
                                bicycle: '🚲 自行車',
                                motorcycle: '🛵 機車',
                                minivan: '🚐 廂型車',
                                truck: '🚚 小貨車',
                                onfoot: '🚶 步行手提'
                              };
                              return (
                                <span key={v} className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-xs font-medium">
                                  {vLabels[v] || v}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-slate-400 text-xs">未設定車載</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Accepted Categories (Going Home or Recycler) */}
              {(selectedUser.roles?.includes('GOING_HOME') || selectedUser.roles?.includes('RECYCLER')) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    收受或收購品類
                  </h4>
                  <div className="bg-white p-4 rounded-xl border border-slate-200/80">
                    {selectedUser.acceptedCategories && selectedUser.acceptedCategories.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUser.acceptedCategories.map(catId => {
                          const matchedResource = resources.find(r => r.id === catId);
                          return (
                            <span key={catId} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium">
                              ✨ {matchedResource ? `${matchedResource.material} - ${matchedResource.product}` : `品類 ID: ${catId}`}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs text-center py-4">未配置特定的收受/收購品類</p>
                    )}
                  </div>
                </div>
              )}

              {/* Recovery Guides (Going Home or Recycler Specific) */}
              {(selectedUser.roles?.includes('GOING_HOME') || selectedUser.roles?.includes('RECYCLER')) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    專屬回收整理指引與估價
                  </h4>
                  <div className="bg-white p-2 rounded-xl border border-slate-200/80 overflow-hidden">
                    {selectedUser.recoveryGuides && selectedUser.recoveryGuides.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/50">
                            <TableHead className="py-2 text-xs">資材品類</TableHead>
                            <TableHead className="py-2 text-xs">整理前置指示</TableHead>
                            {selectedUser.roles?.includes('RECYCLER') && (
                              <TableHead className="py-2 text-xs text-right">瑞莎魺收購估價</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedUser.recoveryGuides.map((guide, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-semibold text-xs text-slate-800 py-2.5">
                                {guide.material} - {guide.product}
                              </TableCell>
                              <TableCell className="text-xs text-slate-500 py-2.5 whitespace-pre-wrap leading-relaxed">
                                {guide.instructions || '無特殊前置整理要求'}
                              </TableCell>
                              {selectedUser.roles?.includes('RECYCLER') && (
                                <TableCell className="text-xs font-mono font-bold text-rose-600 text-right py-2.5">
                                  {guide.price !== undefined ? `${guide.price} 元 / 公斤` : '--'}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-slate-400 text-xs text-center py-6">未配置特定的處理規則指引</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 text-right shrink-0">
            <Button 
              type="button" 
              onClick={() => setSelectedUser(null)} 
              className="rounded-full px-6 bg-slate-900 hover:bg-slate-800 text-white"
            >
              關閉視窗
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BRAND ASSOCIATED RECORDS DIALOG */}
      <Dialog open={!!selectedBrand} onOpenChange={(open) => { if (!open) setSelectedBrand(null); }}>
        <DialogContent className="sm:max-w-[800px] rounded-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-bold text-slate-950 flex items-center gap-2">
              <Tag className="w-5 h-5 text-cyan-600" />
              <span>【{selectedBrand?.id}】品牌 關聯回收紀錄履歷</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-1">
              列出所有包含此品牌的回收資材與其完整回收狀態
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4">
            {brandRecordsLoading ? (
              <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-600" />
                <span>正在查詢關聯回收物資...</span>
              </div>
            ) : brandRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-25" />
                <p className="font-semibold">暫無相關聯的回收紀錄</p>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
                      <TableHead className="py-3 font-semibold text-slate-700 text-xs pl-4">回收資材圖片</TableHead>
                      <TableHead className="py-3 font-semibold text-slate-700 text-xs">品類與材質</TableHead>
                      <TableHead className="py-3 font-semibold text-slate-700 text-xs">數量與單位</TableHead>
                      <TableHead className="py-3 font-semibold text-slate-700 text-xs">目前狀態</TableHead>
                      <TableHead className="py-3 font-semibold text-slate-700 text-xs">建立日期</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brandRecords.map((record) => (
                      <TableRow key={record.id} className="hover:bg-white transition-colors bg-white/60">
                        <TableCell className="py-3 pl-4">
                          {record.imageUrl ? (
                            <img 
                              src={record.imageUrl} 
                              alt={record.productCategory} 
                              className="w-12 h-12 rounded-xl object-cover border border-slate-100"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-[10px] text-slate-400">
                              無圖片
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="font-bold text-slate-800 text-sm">{record.productCategory}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">{record.materialCategory}</p>
                        </TableCell>
                        <TableCell className="py-3 font-mono font-bold text-slate-700 text-sm">
                          {record.quantity} {record.unit}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            record.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            record.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                            record.status === 'GOING_HOME' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {record.status === 'COMPLETED' ? '已完成' :
                             record.status === 'CANCELLED' ? '已取消' :
                             record.status === 'GOING_HOME' ? '進行中' :
                             '待媒合'}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono text-slate-500">
                          {record.createdAt?.toDate 
                            ? record.createdAt.toDate().toLocaleDateString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) 
                            : '未知日期'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 text-right shrink-0 border-t border-slate-100 pt-3">
            <Button 
              type="button" 
              onClick={() => setSelectedBrand(null)} 
              className="rounded-full px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              關閉視窗
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CUSTOM CONFIRMATION DIALOG */}
      <Dialog 
        open={confirmDialog.isOpen} 
        onOpenChange={(open) => { 
          if (!open) setConfirmDialog(prev => ({ ...prev, isOpen: false })); 
        }}
      >
        <DialogContent className="sm:max-w-[425px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              {confirmDialog.title}
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-2 text-sm leading-relaxed">
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))} 
              className="rounded-full"
            >
              取消
            </Button>
            <Button 
              type="button" 
              variant="destructive" 
              onClick={confirmDialog.onConfirm} 
              className="rounded-full bg-red-600 hover:bg-red-700 text-white"
            >
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
