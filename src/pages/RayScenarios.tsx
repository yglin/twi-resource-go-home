import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { Waves, ArrowLeft, Shield, Route, MapPin, Compass } from 'lucide-react';

import scenarioThreeImage from '@/assets/images/maker_scenario_three_1779454173667.png';
import scenarioFourImage from '@/assets/images/maker_scenario_four_1779503863537.png';

export default function RayScenarios() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden relative">
      {/* Ocean ambient glow backgrounds */}
      <div className="absolute inset-0 z-0 opacity-15 pointer-events-none">
        <div className="absolute top-[10%] left-[-20%] w-[140%] h-[30%] bg-blue-500 blur-[150px] animate-pulse" />
        <div className="absolute top-[60%] right-[-20%] w-[140%] h-[30%] bg-cyan-500 blur-[150px] animate-pulse delay-1000" />
      </div>

      <header className="px-6 py-6 border-b border-slate-900 flex justify-between items-center z-10 bg-slate-950/80 backdrop-blur-md sticky top-0">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-blue-400 font-bold hover:text-blue-350 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>返回首頁</span>
        </button>

        <div className="flex items-center gap-2 font-bold text-lg uppercase tracking-widest text-white">
          <Waves className="w-6 h-6 text-blue-450" />
          <span>資源勾引魟</span>
        </div>

        <Button 
          onClick={() => navigate('/auth')} 
          className="rounded-full bg-blue-500 hover:bg-blue-600 font-bold px-6 text-white"
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/60 border border-blue-800/80 text-blue-300 text-xs font-bold font-mono mb-4">
            <Route className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            GOING HOME RAY USER JOURNEYS
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            資源勾引魟 ── 使用情境導覽
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-2xl leading-relaxed">
            深入了解綠色收運天使——「資源勾引魟」如何運作！透過 AI 智慧初篩、一鍵接退單機制，以及自動規劃最流暢的多點導航航線，大幅提升海上收運效率。
          </p>
        </motion.div>

        {/* Scenarios Timeline / Visual Cards */}
        <div className="space-y-24 w-full">
          
          {/* Scenario 3 */}
          <motion.section 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col lg:flex-row gap-10 items-center justify-between"
          >
            <div className="w-full lg:w-1/2 flex flex-col text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-955 text-blue-400 font-mono text-sm font-bold border border-blue-800">
                  3
                </span>
                <span className="text-xs font-mono tracking-wider uppercase text-blue-400 font-bold">
                  Scenario Three
                </span>
              </div>
              
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight">
                檢視受託請求、<br/>一鍵智能退回/承接機制
              </h2>

              <div className="space-y-4 text-slate-300 text-sm md:text-base leading-relaxed">
                <p>
                  當梅克魚送出委託後，勾引魟能利用強大的主控台快速過濾與審件：
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-450 border-l-2 border-blue-500/20 pl-4 py-2 bg-blue-950/20 rounded-r-xl">
                  <li>
                    <strong className="text-blue-400">步驟一：檢視受託請求：</strong> 在清爽的半透明懸浮視窗中，勾引魟能一目了然看見半徑10公里內梅克魚上傳的資源類別與清潔現狀。
                  </li>
                  <li>
                    <strong className="text-blue-400">步驟二：一鍵智能退回：</strong> 若發現照片中瓶罐有髒污或未拆除雜質，可按下紅色退件按鈕。系統將藉由內置 AI 助手替你送出最具禮貌的通知：「請先幫我們洗乾淨/裝袋喔！」避免白跑一趟。
                  </li>
                  <li>
                    <strong className="text-blue-400">步驟三：一鍵承接任務：</strong> 一切準備就緒的乾淨資源，僅需輕輕點擊綠色「承接」鍵，便會被即時收納進你的當日航點清單！
                  </li>
                </ul>
              </div>
            </div>

            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl skew-y-1 hover:skew-y-0 transition-transform duration-500 max-w-[340px] md:max-w-[380px]">
                <div className="absolute inset-x-0 h-10 top-0 bg-gradient-to-b from-slate-950/40 p-2 text-center text-xs text-blue-400 font-mono">
                  ✦ COMIC STORYBOARD ✦
                </div>
                <img 
                  src={scenarioThreeImage} 
                  alt="情境三：一鍵智能退回/承接機制" 
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

          {/* Scenario 4 */}
          <motion.section 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col lg:flex-row-reverse gap-10 items-center justify-between"
          >
            <div className="w-full lg:w-1/2 flex flex-col text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-950 text-cyan-400 font-mono text-sm font-bold border border-cyan-800">
                  4
                </span>
                <span className="text-xs font-mono tracking-wider uppercase text-cyan-400 font-bold">
                  Scenario Four
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight">
                多點航線計畫規劃<br/>與現場完成收運執行
              </h2>

              <div className="space-y-4 text-slate-300 text-sm md:text-base leading-relaxed">
                <p>
                  出發收運時，勾引魟無須獨自為繁複路線勞神：
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-450 border-l-2 border-cyan-500/20 pl-4 py-2 bg-cyan-950/20 rounded-r-xl">
                  <li>
                    <strong className="text-cyan-400">步驟一：多點航線規劃：</strong> 精確串接你已承接的多個梅克魚據點，智能計算最省時、低碳排放的優化路徑，在電子地圖上一覽無遺。
                  </li>
                  <li>
                    <strong className="text-cyan-400">步驟二：現場收取物資：</strong> 抵達指定點時，梅克魚會帶著整理妥適的亮麗瓶罐與物資，開心地為你裝載，完成雙方親切的互動。
                  </li>
                  <li>
                    <strong className="text-cyan-400">步驟三：填寫完成回收：</strong> 勾引魟在平板上勾選「完成收取」，完美落幕一趟永續海洋的淨化之旅！
                  </li>
                </ul>
              </div>
            </div>

            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl -skew-y-1 hover:skew-y-0 transition-transform duration-500 max-w-[340px] md:max-w-[380px]">
                <div className="absolute inset-x-0 h-10 top-0 bg-gradient-to-b from-slate-950/40 p-2 text-center text-xs text-cyan-400 font-mono">
                  ✦ COMIC STORYBOARD ✦
                </div>
                <img 
                  src={scenarioFourImage} 
                  alt="情境四：多點航線計畫規劃與現場收運" 
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
          className="mt-24 p-8 md:p-12 rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950/40 to-cyan-950/40 border border-slate-800 text-center w-full max-w-2xl relative overflow-hidden"
        >
          <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-blue-500/10 blur-xl pointer-events-none rounded-full" />
          <Shield className="w-10 h-10 text-blue-400 mx-auto mb-4 animate-pulse" />
          <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
            承接綠色計畫，共築蔚藍家園！
          </h3>
          <p className="text-slate-455 text-sm md:text-base mb-6 max-w-lg mx-auto">
            擁有熱心運輸精神的你，是深海及海灘上最閃亮的存在。快加入我們成為「資源勾引魟」！
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
              className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-bold px-8 shadow-lg shadow-blue-500/20 border-none"
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
