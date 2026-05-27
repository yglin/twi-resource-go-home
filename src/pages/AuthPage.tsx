import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Waves, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleAuthSuccess = async (user: any) => {
    // Check if user profile exists
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (!userDoc.exists()) {
      // Prepare initial user document
      const initialProfile = {
        id: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || '使用者',
        email: user.email || '',
        photoURL: user.photoURL || '',
        roles: [], // No roles initially
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), initialProfile);
      toast.success('歡迎加入！請完成個人資料設定。');
      navigate('/setup');
    } else {
      const profile = userDoc.data();
      
      // Update profile if basic info is missing but available from user object
      if (!profile.displayName || !profile.photoURL) {
        await setDoc(doc(db, 'users', user.uid), {
          displayName: profile.displayName || user.displayName || user.email?.split('@')[0] || '使用者',
          photoURL: profile.photoURL || user.photoURL || '',
        }, { merge: true });
      }

      if (!profile.roles || profile.roles.length === 0) {
        navigate('/setup');
      } else {
        toast.success(`歡迎回來，${profile.displayName || user.displayName || '使用者'}`);
        // Redirect based on role
        if (profile.roles.includes('GOING_HOME')) navigate('/going-home');
        else navigate('/maker');
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('請填寫完整資訊');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await handleAuthSuccess(result.user);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await handleAuthSuccess(result.user);
      }
    } catch (error: any) {
      console.error(error);
      let msg = '認證失敗';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = '帳號或密碼錯誤';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = '此 Email 已被使用';
      } else if (error.code === 'auth/weak-password') {
        msg = '密碼強度不足（至少 6 個字元）';
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleAuthSuccess(result.user);
    } catch (error: any) {
      console.error(error);
      toast.error('Google 登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 gap-6">
      <Card className="w-full max-w-md border-slate-200 shadow-xl rounded-3xl overflow-hidden">
        <div className="bg-slate-950 p-8 flex justify-center">
           <div className="flex items-center gap-2 text-white font-bold text-xl uppercase tracking-widest">
            <Waves className="w-8 h-8 text-cyan-400" />
            <span>資源勾引魟</span>
          </div>
        </div>
        <CardHeader className="text-center pt-8">
          <CardTitle className="text-2xl font-bold">{isRegister ? '註冊帳號' : '歡迎回來'}</CardTitle>
          <CardDescription>
            {isRegister ? '快速建立您的資源回收帳號' : '登入您的帳號以繼續'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-8">
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-xl mb-6">
              <TabsTrigger value="email" className="rounded-lg">Email 登入</TabsTrigger>
              <TabsTrigger value="google" className="rounded-lg">Google 登入</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">電子郵件</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input 
                      id="email"
                      type="email" 
                      placeholder="name@example.com" 
                      className="pl-10 h-11 rounded-xl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密碼</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input 
                      id="password"
                      type="password" 
                      placeholder="••••••••" 
                      className="pl-10 h-11 rounded-xl"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-11 rounded-full bg-slate-900 hover:bg-slate-800 transition-all font-medium"
                >
                  {loading ? '請稍候...' : (isRegister ? '註冊' : '登入')}
                </Button>
              </form>
              
              <div className="text-center">
                <button 
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {isRegister ? '已經有帳號了？點此登入' : '還沒有帳號？立即註冊'}
                </button>
              </div>
            </TabsContent>

            <TabsContent value="google" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Button 
                onClick={handleGoogleSignIn} 
                disabled={loading}
                variant="outline" 
                className="w-full h-12 rounded-full border-slate-200 hover:bg-slate-50 transition-all flex gap-3 text-slate-700 mt-4"
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                {loading ? '登入中...' : '使用 Google 帳號登入'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="bg-slate-50 p-6 text-center">
          <p className="text-xs text-slate-400 w-full">
            登入即代表您同意我們的服務條款與隱私權政策。
          </p>
        </CardFooter>
      </Card>

      <Button 
        variant="ghost" 
        onClick={() => navigate('/')} 
        className="rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 gap-2 px-6 py-2 inline-flex items-center transition-all bg-white shadow-sm border border-slate-200"
      >
        <ArrowLeft className="w-4 h-4 text-slate-400" />
        <span>回到首頁</span>
      </Button>
    </div>
  );
}
