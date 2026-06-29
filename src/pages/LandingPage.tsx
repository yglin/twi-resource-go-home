import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { Waves, Fish, Navigation } from 'lucide-react';
import makerFishImage from '@/assets/images/maker_fish_cartoon_1779438918603.png';
import rayGreetingImage from '@/assets/images/maker_ray_greeting_1779453377891.png';
import raySpeedIcon from '@/assets/images/ray_speed_icon_v2_1779524761425.png';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showMakerDialog, setShowMakerDialog] = useState(false);
  const [showRayDialog, setShowRayDialog] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 overflow-hidden relative">
      {/* Background Waves */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[20%] left-[-10%] w-[120%] h-[20%] bg-blue-500 blur-[120px] animate-pulse" />
        <div className="absolute top-[60%] right-[-10%] w-[120%] h-[20%] bg-cyan-500 blur-[120px] animate-pulse delay-1000" />
      </div>

      <header className="px-6 py-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-2 text-white font-bold text-xl uppercase tracking-widest">
          <Waves className="w-8 h-8 text-cyan-400" />
          <span>資源勾引魟</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button 
            onClick={() => navigate('/openForAll')} 
            variant="ghost" 
            className="text-slate-300 hover:text-white hover:bg-slate-900 rounded-full px-6 text-sm font-semibold"
          >
            公開徵收市場
          </Button>
          <Button onClick={() => navigate('/auth')} variant="secondary" className="rounded-full px-8">
            開始使用
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl"
        >
          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight">
            幫助資源<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              Going Home
            </span>
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto w-full mt-12">
            <div 
              onClick={() => setShowMakerDialog(true)}
              className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-left hover:border-cyan-500/50 transition-colors group cursor-pointer"
            >
              <Fish className="w-12 h-12 text-cyan-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold text-white mb-2">我是梅克魚</h3>
              <p className="text-slate-400 text-sm">家裡有資源需要回收嗎？拍照並透過高階 AI 自動產生明細與指引。</p>
            </div>

            <div 
              onClick={() => setShowRayDialog(true)}
              className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-left hover:border-blue-500/50 transition-colors group cursor-pointer"
            >
              <img 
                src={raySpeedIcon} 
                alt="資源勾引魟圖示" 
                className="w-12 h-12 mb-4 group-hover:scale-110 transition-transform object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
              <h3 className="text-xl font-bold text-white mb-2">我是勾引魟</h3>
              <p className="text-slate-400 text-sm">提供回收服務？建立收運計畫，優化路線，準確到達梅克魚的所在地。</p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="py-8 text-center text-slate-500 text-sm z-10 border-t border-slate-900">
        &copy; 看守台灣協會，<a href="https://www.taiwanwatch.org.tw/donation" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 underline transition-colors">請支持看守台灣</a>
      </footer>

      <AnimatePresence>
        {showMakerDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMakerDialog(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            
            {/* Modal Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden max-w-lg w-full z-10 shadow-2xl flex flex-col p-6"
            >
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 mb-6 border border-slate-800">
                <img 
                  src={makerFishImage} 
                  alt="資源梅克魚" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 right-3 bg-cyan-950/80 border border-cyan-800 rounded-full px-3 py-1 text-xs text-cyan-300 font-medium flex items-center gap-1 backdrop-blur-sm animate-pulse">
                  🎶 正在高歌中...
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <Fish className="w-6 h-6 text-cyan-400 animate-bounce" />
                <span>資源梅克魚在幹嘛？</span>
              </h3>

              <p className="text-slate-300 text-sm leading-relaxed mb-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 font-sans font-medium text-left">
                資源梅克漁會一邊收集垃圾、將垃圾變成資源，一邊唱著很難聽的歌「Making Making Making Making Resour西咿咿咿咿~ 把垃圾變成資源超爽D～」
              </p>

              <div className="flex gap-3 justify-end mt-auto">
                <Button 
                  variant="outline" 
                  onClick={() => setShowMakerDialog(false)}
                  className="rounded-full border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  喔，好
                </Button>
                <Button 
                  onClick={() => {
                    setShowMakerDialog(false);
                    navigate('/maker-scenarios');
                  }}
                  className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white border-none shadow-lg shadow-cyan-500/20 px-6 font-bold"
                >
                  認真啦
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {showRayDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRayDialog(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            
            {/* Modal Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden max-w-lg w-full z-10 shadow-2xl flex flex-col p-6"
            >
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 mb-6 border border-slate-800">
                <img 
                  src={rayGreetingImage} 
                  alt="資源勾引魟" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 right-3 bg-blue-950/80 border border-blue-800 rounded-full px-3 py-1 text-xs text-blue-300 font-medium flex items-center gap-1 backdrop-blur-sm animate-pulse">
                  🎶 正在快樂哼歌中...
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <img 
                  src={raySpeedIcon} 
                  alt="資源勾引魟圖示" 
                  className="w-8 h-8 object-contain animate-bounce"
                  referrerPolicy="no-referrer"
                />
                <span>資源勾引魟在幹嘛？</span>
              </h3>

              <p className="text-slate-300 text-sm leading-relaxed mb-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 font-sans font-medium text-left">
                資源勾引魟會到處收集資源梅克魚產出的資源，一邊唱著很難聽的歌：「資～源～ GOING GOING GOING HOME～，我是資源勾引魟～～」。<br />
                不是我在說那真的很難聽……
              </p>

              <div className="flex gap-3 justify-end mt-auto">
                <Button 
                  variant="outline" 
                  onClick={() => setShowRayDialog(false)}
                  className="rounded-full border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  喔，好
                </Button>
                <Button 
                  onClick={() => {
                    setShowRayDialog(false);
                    navigate('/ray-scenarios');
                  }}
                  className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-blue-700 text-white border-none shadow-lg shadow-blue-500/20 px-6 font-bold"
                >
                  認真啦
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
