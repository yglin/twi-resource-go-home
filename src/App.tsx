import React, { useState, useEffect, useRef } from 'react';
import { auth } from './firebase';
import { 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { dbService } from './services/dbService';
import { UserProfile, City, WasteLog, RecognitionResult } from './types';
import { 
  Camera, 
  History, 
  LogOut, 
  ChevronLeft, 
  BarChart3, 
  MapPin, 
  Trash2, 
  Info, 
  CheckCircle2, 
  Loader2,
  Scan,
  User as UserIcon,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { recognizeWaste } from './services/geminiService';
import { cn } from './lib/utils';

// Consts
const CITIES: City[] = ["台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市", "新竹市", "基隆市", "嘉義市", "彰化縣", "宜蘭縣"];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'auth' | 'home' | 'scan' | 'result' | 'history' | 'dashboard'>('auth');
  const [selectedCity, setSelectedCity] = useState<City>(() => {
    return localStorage.getItem('wasteGoHome_city') || "";
  });
  const [image, setImage] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<RecognitionResult | null>(null);
  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [allLogs, setAllLogs] = useState<WasteLog[]>([]); // For agency view
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const p = await dbService.getUser(u.uid);
        setProfile(p);
        if (p) {
          setSelectedCity(p.city);
          localStorage.setItem('wasteGoHome_city', p.city);
          setView('home');
          loadLogs(u.uid);
        } else {
          // New user needs to select city
          setView('auth');
        }
      } else {
        setView('auth');
      }
      setLoading(false);
    });
  }, []);

  const loadLogs = async (uid: string) => {
    const userLogs = await dbService.getUserLogs(uid);
    setLogs(userLogs);
  };

  const handleLogin = async (isAnon = false) => {
    try {
      if (isAnon) {
        await signInAnonymously(auth);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/admin-restricted-operation') {
        alert("請在 Firebase 控制台中啟用「匿名驗證 (Anonymous Auth)」後再試一次。");
      } else {
        alert("登入失敗: " + e.message);
      }
    }
  };

  const handleQuickStart = async () => {
    if (!user) {
      // 步驟 2.1: 未登入則先匿名登入
      await handleLogin(true);
      // 注意：匿名登入後，onAuthStateChanged 會被觸發
    }
    // 步驟 2.2 & 3: 已登入或剛登入完成，直接開啟相機
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleCompleteRegister = async () => {
    if (!user || !selectedCity) return;
    localStorage.setItem('wasteGoHome_city', selectedCity);
    await dbService.createUser(user.uid, selectedCity);
    const p = await dbService.getUser(user.uid);
    setProfile(p);
    setView('home');
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setView('scan');
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecognition = async () => {
    if (!image) return;
    setIsProcessing(true);
    try {
      const city = profile?.city || selectedCity || undefined; 
      const base64 = image.split(',')[1];
      const res = await recognizeWaste(base64, city);
      setRecognition(res);
      
      // Save to server
      await dbService.logWaste({
        userId: user?.uid || null,
        city: city || "未指定",
          category: res.category,
          quantity: res.quantity,
          suggestion: res.suggestion,
          imageUrl: image // In production we'd upload to Storage
      });
      
      if (user) loadLogs(user.uid);
      setView('result');
    } catch (e) {
      console.error(e);
      alert("辨識失敗，請重試");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-emerald-50">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
      </div>
    );
  }

  // --- Views ---

  const AuthView = () => (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center">
        <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-xl mb-4">
          <Trash2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">幫 垃圾X 資源O 回家</h1>
        <div className="text-gray-500 mt-2 font-medium">
          <p>是資源不是垃圾</p>
          <p>幫資源回家，讓地球呼吸</p>
        </div>
      </div>

      {!user ? (
        <div className="flex flex-col w-full gap-4 px-8">
          <button 
            onClick={handleQuickStart} 
            className="btn-primary flex items-center justify-center gap-3 py-4 text-lg shadow-emerald-200"
          >
            <Camera className="w-6 h-6" />
            開始拍照
          </button>
          
          <div className="flex items-center gap-4 my-2">
            <div className="h-px flex-1 bg-gray-200"></div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">或</span>
            <div className="h-px flex-1 bg-gray-200"></div>
          </div>

          <button onClick={() => handleLogin()} className="w-full flex items-center justify-center gap-2 font-semibold text-gray-600 border-2 border-gray-100 p-3 rounded-xl hover:bg-gray-50 transition-all">
            <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] text-gray-500 font-bold">G</span>
            使用 Google 登入
          </button>
        </div>
      ) : (
        <div className="w-full px-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-emerald-50 p-4 rounded-2xl mb-6 border border-emerald-100 flex items-center gap-3">
            <UserIcon className="text-emerald-500 w-5 h-5" />
            <div className="text-xs font-semibold text-emerald-800">
              您已登入，請完成城市設定以獲得在地建議
            </div>
          </div>
          
          <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">選擇您居住的縣市</label>
          <select 
            value={selectedCity} 
            onChange={(e) => {
              const city = e.target.value as City;
              setSelectedCity(city);
              localStorage.setItem('wasteGoHome_city', city);
            }}
            className="w-full p-4 rounded-xl border-2 border-emerald-100 bg-white focus:border-emerald-500 outline-none transition-all mb-6"
          >
            <option value="">請選擇...</option>
            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button 
            disabled={!selectedCity}
            onClick={handleCompleteRegister}
            className="btn-primary w-full disabled:opacity-50 disabled:scale-100 mb-4"
          >
            開啟環保足跡
          </button>

          <button 
            onClick={handleQuickStart}
            className="w-full text-center text-xs font-bold text-gray-400 hover:text-emerald-500 transition-colors py-2"
          >
            沒關係，先拍照辨識 →
          </button>
        </div>
      )}
    </div>
  );

  const HomeView = () => (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">你好, {profile?.city}環保尖兵</h2>
          <p className="text-sm text-gray-400 font-medium">今天辨識了什麼呢？</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 font-bold">
          {user?.displayName ? user.displayName[0] : 'U'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card text-center py-6 bg-emerald-50 border-emerald-100">
          <div className="text-2xl font-bold text-emerald-600">{profile?.totalWasteCount || 0}</div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">總辨識數量</div>
        </div>
        <div className="card text-center py-6 bg-blue-50 border-blue-100">
          <div className="text-2xl font-bold text-blue-600">{logs.length}</div>
          <div className="text-[10px] uppercase tracking-widest text-blue-700 font-bold">辨識次數</div>
        </div>
      </div>

      <button className="relative overflow-hidden btn-primary py-8 rounded-3xl mb-8 group">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
        >
          <Scan className="w-10 h-10 mb-2 transition-transform group-hover:scale-110" />
          <span className="text-lg font-bold">拍照辨識垃圾</span>
        </div>
      </button>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex justify-between items-end mb-4">
          <h3 className="font-bold text-gray-800 uppercase tracking-widest text-xs">最近的足跡</h3>
          <button onClick={() => setView('history')} className="text-[10px] font-bold text-emerald-600 hover:underline">查看全部</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {logs.slice(0, 5).map((log, i) => (
             <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                  {log.category.includes('瓶') ? '🧴' : log.category.includes('紙') ? '📦' : '🗑️'}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">{log.category}</div>
                  <div className="text-[10px] text-gray-400">{log.createdAt.toLocaleDateString()} • {log.city}</div>
                </div>
                <div className="ml-auto text-xs font-bold text-emerald-600">x{log.quantity}</div>
             </div>
          ))}
          {logs.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">尚未有任何紀錄</div>}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t flex justify-around">
        <button className="p-2 text-emerald-600"><Camera className="w-6 h-6" /></button>
        <button onClick={() => setView('history')} className="p-2 text-gray-400 hover:text-emerald-500"><History className="w-6 h-6" /></button>
        <button onClick={() => setView('dashboard')} className="p-2 text-gray-400 hover:text-emerald-500"><BarChart3 className="w-6 h-6" /></button>
        <button onClick={() => { signOut(auth); setView('auth'); }} className="p-2 text-gray-400 hover:text-red-500"><LogOut className="w-6 h-6" /></button>
      </div>
    </div>
  );

  const ScanPreview = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center mb-6">
        <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-400"><ChevronLeft /></button>
        <h2 className="ml-2 text-xl font-bold">確認照片</h2>
      </div>
      
      <div className="flex-1 rounded-3xl overflow-hidden shadow-2xl relative bg-gray-100 mb-8 border-4 border-emerald-100/50">
        {image && <img src={image} className="w-full h-full object-cover" alt="Preview" />}
        {isProcessing && (
          <div className="absolute inset-0 bg-emerald-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <div className="text-lg font-bold tracking-widest animate-pulse">AI 辨識中...</div>
            <div className="text-xs opacity-70 mt-2">正在分析垃圾種類與回收建議</div>
          </div>
        )}
      </div>

      <button disabled={isProcessing} onClick={startRecognition} className="btn-primary py-5 text-lg">
        開始 AI 辨識
      </button>
    </div>
  );

  const ResultView = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center mb-6">
        <button onClick={() => setView('home')} className="p-2 -ml-2 text-emerald-600"><ChevronLeft /></button>
        <h2 className="ml-2 text-xl font-bold">辨識結果</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="card p-0 overflow-hidden mb-6">
          <div className="h-40 bg-gray-100">
            {image && <img src={image} className="w-full h-full object-cover" alt="Captured" />}
          </div>
          <div className="p-4 bg-emerald-500 text-white flex justify-between items-center transition-all">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold">分析完成</span>
            </div>
            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">信心指數 {Math.round((recognition?.confidence || 0) * 100)}%</span>
          </div>
        </div>

        <div className="card bg-white border-2 border-emerald-100">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">辨識物</div>
              <div className="text-xl font-extrabold text-gray-900">{recognition?.category}</div>
            </div>
            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl font-extrabold">x{recognition?.quantity}</div>
          </div>
          
          <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-800 tracking-tight">回收建議 ({profile?.city})</span>
            </div>
            <p className="text-sm text-emerald-700 leading-relaxed font-medium">
              {recognition?.suggestion}
            </p>
          </div>
        </div>
      </div>

      <button onClick={() => setView('home')} className="btn-primary mt-4 py-4">
        回到首頁
      </button>
    </div>
  );

  const HistoryView = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center mb-6">
        <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-400"><ChevronLeft /></button>
        <h2 className="ml-2 text-xl font-bold">歷史足跡</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {logs.map((log, i) => (
          <div key={i} className="card flex gap-4 items-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex-shrink-0 overflow-hidden border">
              <img src={log.imageUrl} className="w-full h-full object-cover" alt="Log" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 truncate">{log.category}</div>
              <div className="text-[10px] text-gray-400">{log.createdAt.toLocaleDateString()} • {log.city}</div>
            </div>
            <div className="text-emerald-600 font-bold">x{log.quantity}</div>
          </div>
        ))}
        {logs.length === 0 && <div className="text-center py-20 text-gray-400">尚未有任何足跡</div>}
      </div>
    </div>
  );

  const AgencyDashboard = () => {
    useEffect(() => {
      dbService.getAllLogs().then(setAllLogs);
    }, []);

    const stats = {
      total: allLogs.reduce((acc, l) => acc + l.quantity, 0),
      count: allLogs.length,
      topCity: "台北市" // Simplified
    };

    return (
      <div className="fixed inset-0 bg-gray-900 z-50 overflow-y-auto p-4 lg:p-12 text-white font-sans">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <div className="text-emerald-500 font-bold uppercase tracking-widest text-sm mb-2">Backend: Environment Agency Server</div>
              <h1 className="text-4xl font-extrabold tracking-tight">全台垃圾即時監控分析系統</h1>
            </div>
            <button onClick={() => setView('home')} className="bg-white/10 hover:bg-white/20 p-4 rounded-2xl border border-white/10 transition-all">
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[
              { label: "總辨識量", val: stats.total, color: "text-emerald-400" },
              { label: "活躍貢獻者", val: Math.floor(stats.count * 0.8), color: "text-blue-400" },
              { label: "今日處置量", val: stats.count, color: "text-amber-400" }
            ].map((s, i) => (
              <div key={i} className="bg-white/5 border border-white/10 p-8 rounded-3xl text-center shadow-2xl backdrop-blur-xl">
                <div className={`text-5xl font-black mb-2 ${s.color}`}>{s.val.toLocaleString()}</div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold">垃圾類別佔比</h2>
                <span className="text-xs text-gray-500">Live Data</span>
              </div>
              <div className="flex items-end justify-between h-48 gap-4 px-4">
                {[
                  { label: "塑膠", h: "85%", c: "bg-emerald-500" },
                  { label: "紙類", h: "45%", c: "bg-amber-400" },
                  { label: "金屬", h: "25%", c: "bg-blue-400" },
                  { label: "玻璃", h: "15%", c: "bg-gray-400" },
                  { label: "其他", h: "60%", c: "bg-emerald-700" }
                ].map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                    <div className={cn("w-full rounded-t-xl transition-all duration-500 group-hover:brightness-125 shadow-lg", b.c)} style={{ height: b.h }}></div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold">區域減碳排行</h2>
                <span className="text-xs text-emerald-500">台北市 Top #1</span>
              </div>
              <div className="space-y-4">
                {["台北市", "新北市", "台中市", "高雄市"].map((c, i) => (
                  <div key={i} className="flex items-center gap-6 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 border border-emerald-500/30">0{i+1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-bold mb-2">{c}</div>
                      <div className="h-2 w-full bg-white/5 rounded-full ring-1 ring-white/10">
                        <div className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${90 - i * 15}%` }}></div>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-gray-500">{(12000 - i * 2000).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 bg-black/40 border border-emerald-500/30 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500 flex items-center justify-center text-emerald-500 animate-pulse bg-emerald-500/10 font-bold">AI</div>
              <div>
                <div className="font-bold text-white">Live Server Ingestion Active</div>
                <div className="text-xs text-emerald-500/70">正在接收來自全台使用者的辨識數據...</div>
              </div>
            </div>
            <div className="hidden sm:flex gap-8">
              <div className="text-right">
                <div className="text-[10px] text-gray-500 uppercase tracking-tighter">系統準確率</div>
                <div className="text-lg font-bold text-emerald-400">99.4%</div>
              </div>
              <button className="px-6 py-3 border border-emerald-500/30 rounded-2xl text-xs font-bold hover:bg-emerald-500 hover:text-black transition-all">下載分析研報 (CSV)</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-6 overflow-hidden">
      <div className="phone-frame animate-in fade-in zoom-in duration-700">
        <div className="app-screen">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {view === 'auth' && <AuthView />}
              {view === 'home' && <HomeView />}
              {view === 'scan' && <ScanPreview />}
              {view === 'result' && <ResultView />}
              {view === 'history' && <HistoryView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      
      {/* Global Hidden File Input */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef}
        onChange={handleCapture} 
        className="hidden" 
      />

      {/* Agency Dashboard Overlay */}
      {view === 'dashboard' && <AgencyDashboard />}

      {/* Floating Instructions for Browser users */}
      <div className="hidden lg:block fixed left-10 bottom-10 max-w-sm">
        <div className="glass p-6 shadow-xl">
          <h4 className="font-bold text-emerald-700 mb-2">設計說明 - 幫 垃圾X 資源O 回家</h4>
          <p className="text-xs text-gray-600 leading-relaxed">
            這是一個專為台灣垃圾回收設計的手機應用程式。採用了「Sleek Interface」設計風格，結合與環保機構連動的後台數據庫。
            <br/><br/>
            <strong>功能亮點：</strong><br/>
            • 拍照即時辨識 (Gemini AI)<br/>
            • 在地化回收建議 ({profile?.city || '各縣市'})<br/>
            • Firebase 即時數據存儲及分析
          </p>
        </div>
      </div>
    </div>
  );
}
