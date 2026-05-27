import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { Waves, ArrowLeft, Star, Heart, Compass } from 'lucide-react';

import scenarioOneImage from '@/assets/images/maker_scenario_chinese_1779439558362.png';
import scenarioTwoImage from '@/assets/images/maker_scenario_two_1779439877606.png';

export default function MakerScenarios() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden relative">
      {/* Ocean ambient glow backgrounds */}
      <div className="absolute inset-0 z-0 opacity-15 pointer-events-none">
        <div className="absolute top-[10%] left-[-20%] w-[140%] h-[30%] bg-cyan-500 blur-[150px] animate-pulse" />
        <div className="absolute top-[60%] right-[-20%] w-[140%] h-[30%] bg-blue-500 blur-[150px] animate-pulse delay-1000" />
      </div>

      <header className="px-6 py-6 border-b border-slate-900 flex justify-between items-center z-10 bg-slate-950/80 backdrop-blur-md sticky top-0">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-cyan-400 font-bold hover:text-cyan-350 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>返回首頁</span>
        </button>

        <div className="flex items-center gap-2 font-bold text-lg uppercase tracking-widest text-white">
          <Waves className="w-6 h-6 text-cyan-405" />
          <span>資源勾引魟</span>
        </div>

        <Button 
          onClick={() => navigate('/auth')} 
          className="rounded-full bg-cyan-500 hover:bg-cyan-600 font-bold px-6 text-slate-950"
        >
          立即體驗
        </Button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 z-10 flex flex-col items-center">
        {/* Page Title */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 text-xs font-bold font-mono mb-4">
            <Star className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400 animate-spin-slow" />
            MAKER FISH USER JOURNEYS
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            資源梅克魚 ── 使用情境導覽
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-2xl leading-relaxed">
            進入美麗的永續海洋世界，看「資源梅克魚」如何一邊唱著奇妙的歌，一邊輕鬆將廢棄物轉化為高質感海洋資材，並一鍵把委託送往心儀的回收魟！
          </p>
        </motion.div>

        {/* Scenarios Timeline / Visual Cards */}
        <div className="space-y-24 w-full">
          
          {/* Scenario 1 */}
          <motion.section 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col lg:flex-row gap-10 items-center justify-between"
          >
            <div className="w-full lg:w-1/2 flex flex-col text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-950 text-cyan-400 font-mono text-sm font-bold border border-cyan-800">
                  1
                </span>
                <span className="text-xs font-mono tracking-wider uppercase text-cyan-400 font-bold">
                  Scenario One
                </span>
              </div>
              
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight">
                AI 影像相機垃圾辨識<br/>與回收記錄自動產出
              </h2>

              <div className="space-y-4 text-slate-300 text-sm md:text-base leading-relaxed">
                <p>
                  當梅克魚使用者點擊拍照上傳，後端高階 
                  <strong className="text-cyan-300"> Gemini AI </strong> 
                  模組將開啟極敏影像識別：
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-450 border-l-2 border-cyan-500/20 pl-4 py-2 bg-cyan-950/20 rounded-r-xl">
                  <li>
                    <strong className="text-cyan-400">一閃即辨：</strong> 快速估算瓶罐等實體數量與材質大類（如塑膠、紙箱、鋁罐）。
                  </li>
                  <li>
                    <strong className="text-cyan-400">前置指引：</strong> 根據物資大類智能匹配最標準之清洗或收卷期待（如「請拆蓋洗淨壓扁！」）。
                  </li>
                  <li>
                    <strong className="text-cyan-400">極簡覆寫：</strong> 自動無縫回注表單，使用者不用逐字敲鍵盤就能秒建一筆乾淨紀錄。
                  </li>
                </ul>
              </div>
            </div>

            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl skew-y-1 hover:skew-y-0 transition-transform duration-500 max-w-[340px] md:max-w-[380px]">
                <div className="absolute inset-x-0 h-10 top-0 bg-gradient-to-b from-slate-950/40 p-2 text-center text-xs text-cyan-400 font-mono">
                  ✦ COMIC STORYBOARD ✦
                </div>
                <img 
                  src={scenarioOneImage} 
                  alt="情境一：AI 影像相機垃圾辨識" 
                  className="w-full h-auto object-cover border-t border-slate-800"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </motion.section>

          {/* Divider with anchor point */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-900"></div>
            </div>
            <div className="relative bg-slate-950 px-4">
              <Compass className="w-6 h-6 text-slate-700 animate-spin-slow" />
            </div>
          </div>

          {/* Scenario 2 */}
          <motion.section 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col lg:flex-row-reverse gap-10 items-center justify-between"
          >
            <div className="w-full lg:w-1/2 flex flex-col text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-950 text-blue-400 font-mono text-sm font-bold border border-blue-800">
                  2
                </span>
                <span className="text-xs font-mono tracking-wider uppercase text-blue-400 font-bold">
                  Scenario Two
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight">
                檢視剛出生記錄<br/>推薦指派勾引魟
              </h2>

              <div className="space-y-4 text-slate-300 text-sm md:text-base leading-relaxed">
                <p>
                  產生的回收紀錄會被貼上「新生 🟢」標籤，進入系統的核心媒合流：
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-450 border-l-2 border-blue-500/20 pl-4 py-2 bg-blue-950/20 rounded-r-xl">
                  <li>
                    <strong className="text-blue-400">精準雷達：</strong> 系統將依據該梅克魚地點半徑 10 公里內，動態搜尋相容對應材質的「勾引魟」。
                  </li>
                  <li>
                    <strong className="text-blue-400">親和清冊：</strong> 呈現包含人名、指引期待、地址等合適的去識別化候選人卡片，拒絕騷擾。
                  </li>
                  <li>
                    <strong className="text-blue-400">一指派件：</strong> 點擊一鍵委託發起，魟魚接單即可將其編排入其專屬多點點智慧運送計畫中。
                  </li>
                </ul>
              </div>
            </div>

            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl -skew-y-1 hover:skew-y-0 transition-transform duration-500 max-w-[340px] md:max-w-[380px]">
                <div className="absolute inset-x-0 h-10 top-0 bg-gradient-to-b from-slate-950/40 p-2 text-center text-xs text-blue-400 font-mono">
                  ✦ COMIC STORYBOARD ✦
                </div>
                <img 
                  src={scenarioTwoImage} 
                  alt="情境二：推薦指派勾引魟" 
                  className="w-full h-auto object-cover border-t border-slate-800"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </motion.section>

        </div>

        {/* Bottom CTA Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mt-24 p-8 md:p-12 rounded-3xl bg-gradient-to-r from-slate-900 via-cyan-950/40 to-blue-950/40 border border-slate-800 text-center w-full max-w-2xl relative overflow-hidden"
        >
          <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-cyan-500/10 blur-xl pointer-events-none rounded-full" />
          <Heart className="w-10 h-10 text-cyan-400 mx-auto mb-4 animate-pulse" />
          <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
            準備好加入我們的海洋永續計畫了嗎？
          </h3>
          <p className="text-slate-455 text-sm md:text-base mb-6 max-w-lg mx-auto">
            不論是把家園雜物變乾淨資源的「梅克魚」，或是踏實穿梭陸地與處理站的「勾引魟」，海洋都需要你的力量！
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              variant="outline"
              onClick={() => navigate('/')} 
              className="rounded-full px-8 text-slate-350 border-slate-850 hover:bg-slate-800 hover:text-white"
            >
              返回大廳
            </Button>
            <Button 
              onClick={() => navigate('/auth')} 
              className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold px-8 shadow-lg shadow-cyan-500/20 border-none"
            >
              登入 / 註冊首航
            </Button>
          </div>
        </motion.div>
      </main>

      <footer className="py-8 text-center text-slate-600 text-xs border-t border-slate-900 mt-20 z-10">
        &copy; 2026 資源勾引魟 - 漁魟共生，守護深海
      </footer>
    </div>
  );
}
