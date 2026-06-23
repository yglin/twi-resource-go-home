# 🚀 回收契約 (Recycle Contract) 系統功能實作與整合計畫

本文件依據 `doc/USE_SCENARIOS.md` (使用情境七至九)、`doc/SPECS.md` (規格與邊界流程)、`doc/DATA_ENTITIES.md` (資料結構) 暨 `doc/USER_INTERFACES.md` (UI 元件規格)，制定出高度精密、階段明確且可立即落地的實作與整合計畫。

---

## 🎯 核心實作目標

1. **三方信賴協定**：建立連結「資源梅克魚（產出者）」、「資源勾引魟（清運者）」與「資源瑞莎魺（收購處理端）」的三方定期回收合約機制。
2. **自動化排程派單**：依據合約設定之時間排程自適應派發單次實體回收任務，打通長期履約流程。
3. **高防禦性邊界流程**：完美落地「排除首期重複派單」、「並行衝突控制（樂觀鎖）」、「合約資格吊銷保護」與「高密度軌跡歷史追蹤」。
4. **精美交互介面**：利用 Tailwind CSS 與 Framer Motion，在既有海洋系統視覺風格下增設三個自適應路由頁面。

---

## 🗺️ 實作藍圖與時程階段 (Implementation Roadmap)

```
┌────────────────────────────────────────────────────────────────────────┐
│                              【實作時程】                              │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│   Phase 1    │   Phase 2    │   Phase 3    │   Phase 4    │  Phase 5   │
│ 核心資料基礎  │ 後端與商業邏輯│ 路由與控制層  │ UI元件與面板  │ 聯調暨測試  │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

---

## 🛠️ 第一階段：核心資料基礎建設 (Data Base Setup)
*預估工時：0.5 天*

### 1.1 擴展 `src/types.ts`
新增符合 `doc/DATA_ENTITIES.md` 規範的 TypeScript 類型、介面與列舉：
* 定義 `ContractStatus` (`'Pending Signatures'` | `'Active'` | `'Rejected'` | `'Suspended'`)。
* 定義 `RecycleContract` interface。
* 定義 `ContractTemplateRecord` (資材大類、細項產品、預估數量、計量單位)。
* 定義 `ContractSchedule` (type、DaysOfWeek、DayOfMonth、time、scheduleText)。
* 定義 `ContractHistory` 歷程模型。
* 定義 `ContractMessage` 留言模型。

### 1.2 進階資料庫配置 (`firebase.ts` / 安全規則)
* 於專案 `src/firebase.ts` 或服務層定義新集合的常量參照：`recycleContracts`。
* **安全性規則設計 (`firestore.rules` 更新)**：
  - 確保只有合約綁定的三方（`makerFishId`, `goingHomeId`, `recyclerId`）具有讀取本合約、其 `history` 以及 `messages` 子集合的權限。
  - 只有 `goingHome`（合約發起人）有權限進行 `create` 及對條款進行 `update` 的動作。
  - 三方皆有權限對 `signatures` 節點及 `status` 節點進行更新（需符合狀態機，如：重啟、暫停、簽核）。

---

## 🧪 第二階段：後端服務與商業邏輯層 (Business Logic Services)
*預估工時：1.5 天*

### 2.1 實作 `src/services/contractService.ts`
封裝所有對 Firestore 的原子和事務操作：
1. **`createContract(data)`**：
   - 發起新合約，建立 `history` 首筆資訊：`"CREATE_CONTRACT"`。
   - 三方簽署意願初始化：
     - 梅克魚、瑞莎魺、勾引魟。
     - *注意：因勾引魟為發起人，其簽名預設直接為 `'Approved'`。*
2. **`signContract(contractId, userId, role, action: 'Approve' | 'Reject', reason?: string)`**：
   - 採 Firestore **Transaction (事務)** 進行寫入。
   - 讀取當前 `updatedAt` 比對，防止並行衝突（符合例外 D2 樂觀鎖）。
   - 更新成員的簽名狀態。
   - **狀態推進判定**：
     - 若 action 為 `'Reject'`：合約 status 轉移為 `Rejected`，清查 `rejectionReason`，於 `history` 寫入拒絕日誌，同時在留言板派發系統廣播。
     - 若三方全員皆皆為 `'Approved'`：
       - 合約 status 轉移為 `Active`。
       - **首期重複衝突排除 (Duplicate Exclusion)**：
         - 若合約存有 `sourceRecordId`，將合約的 `lastGeneratedAt` 預設初始化為**「來源歷史單的 completionTime」**。
         - 初始化並計算 `nextRunAt` 為下一個完整排程時間點，以此避開首期即刻重複派單漏洞。
3. **`suspendContract(contractId, userId, userName, role, reason)`**：
   - 將合約一鍵更動為 `Suspended`。
   - 寫入一筆歷程日誌，並非同步派送 `System` 客製系統訊息至留言板：「因 {userName} 暫停合約：『{reason}』，本定期計畫已冬眠」。
4. **`reactivateContract(contractId, userId, userName, role)`**：
   - 將合約 status 重歸為 `'Pending Signatures'`。
   - 重設所有成員簽暑狀態為 `'Pending'`。
   - 寫入歷程日誌，全體通知重簽。
5. **`resubmitContract(contractId, updatedData)`**：
   - 用於發起人針對被拒絕（Rejected）的合約修改內容後重新大改發起。
   - 修改條款 + 重設簽名狀態 + 更新版本並刷新 `updatedAt`。

### 2.2 模擬 Scheduler 派單引擎 (排程器虛擬常設)
由於前端 SPA 限制，在前端常設一組「自動派發模擬管線」：
* 每次使用者登入或切換頁面時，前置執行 `evaluateAndGenerateScheduledRecords()`：
  - 檢索 status 為 `Active` 的所有合約。
  - **前置安全校验 (Pre-Evaluation)**：確認三方使用者均存活、角色身分依舊具備、且瑞莎魺最新回收指引依然包含此資材。
    - *若判定失敗：呼叫 Service 一鍵自動將合規降級為 `Suspended`，終止派發，寫入系統警告。*
  - **派發判定**：若當下時間 $\ge$ `nextRunAt` 且 $>$ `lastGeneratedAt`：
    - 在 Transaction 中，快速產生一筆狀態為 `JUST_BORN` 的實體 `recoveryRecords`。
    - 更新此合約的 `lastGeneratedAt` = 當前時戳。
    - 計算並推進下一個 `nextRunAt`。

---

## 🧭 第三階段：前端路由與控制層 (Routing & Page Controllers)
*預估工時：1.0 天*

### 3.1 既有 Layout 微調與側邊欄擴充
* 於 `App.tsx` 的全域導覽與工作區側邊欄（梅克魚、勾引魟、瑞莎魺空間）追加**「定期契約 (Recycle Contract)」**按鈕，指向路由碼 `/recycleContract`。
* 於「歷史回收實體詳情頁 `/maker/record/:id`」之已完成、已清單結算之底端，針對**資源勾引魟**角色，高亮渲染「立馬將此單轉為長期定期約」按鈕。點擊後一鍵跳轉：`/newRecycleContract?sourceId=:id`。

### 3.2 路由及守衛實體化 (Guards Configuration)
1. `/recycleContract` ── 登入者不限角色，均可進入，自適應分頁展示。
2. `/newRecycleContract` ── 設有守衛，判定限具有 `GOING_HOME` 權限之使用者。若否，自動回歸 `/unauthorized` 或彈窗提示。
3. `/recycleContract/:id` ── 設有守衛，取得合約後判定 `userId` 是否為合約內三方成員。若完全無涉，強制打回首頁保护隱私。

---

## 🎨 第四階段：UI 視窗與核心互動大件 (Screens & View Portals)
*預估工時：2.0 天*

### 4.1 合約核心儀表板 ── `ContractDashboard` (`/recycleContract`)
* **三方平行分頁組**：利用 `Tabs` 切分成「我產出 (梅克魚)」、「我載運 (勾引魟)」、「我收購 (瑞莎魺)」。高度清晰。
* **分區合約狀態卡**：卡片上整合合約範本資材、人類直易讀排程、三方大頭貼、以及符合 `doc/USER_INTERFACES.md` 配色之 `StatusBadge`（ Pending / Active / Rejected / Suspended ）。
* **極緻空白狀態引導**：當未有任何合約時，極致流暢地渲染空白插畫。右側懸浮發布按鈕。

### 4.2 建立與條款修改頁 ── `NewRecycleContract` (`/newRecycleContract`)
* **回收紀錄預載/輸入卡**：結合一鍵調節數量 Slider。利用 `useSearchParams` 偵測到有 `sourceId` 時，利用 React `useEffect` 在初次載入時自適應帶入資材。
* **時間與多維排程卡**：
  - 頻率下拉（每日、每週、每月）。
  - 當點選每週：以炫酷圓形標籤 `[日、一、二、三、四、五、六]` 支持多選 daysOfWeek。
  - 當點選每月：渲染 1~31 的直觀精緻數字符號鍵盤盤面供選。
* **三方綁定與「回收指引相容性」篩選器**：
  - 資源梅克魚：下拉列表列出所有人。
  - 資源瑞莎魺：下拉選單只允許選擇回收項目包含該資材的受體。若不相符，自動標註「指引不相符」字樣並 disable 該瑞莎魺，完美防呆。

### 4.3 合約控制台與審批全功能頁 ── `ContractDetails` (`/recycleContract/:id`)
* **三方簽名狀態聯動卡 (Triple Status Checker)**：展示三位成員頭貼，並附加其各自簽署狀態（待審、同意、拒絕）。
* **成員客製簽署誓約彈窗 (Signature Vow Dialog)**：
  - 梅克魚：「請確定您能在以下排程{排程Text}下午時段準時交付{資材}...」
  - 勾引魟、瑞莎魺也依據規格擁有不同的切身聲明警示語，增加履行儀式感。
* **退回與退件 Dialog**：要求強制填入理由，更新後合約回歸 `Rejected`。
* **生活化管理控制組（暫停/重啟按鈕群）**：
  - 若合約為 `Active`，顯示「暫停 (Suspend)」按鈕。點擊後跳出備註。
  - 若合約為 `Suspended`，顯示「重啟 (Reactivate)」按鈕。點擊後觸發三方重簽提示。
* **高密度歷史歷程線 ── `ContractHistoryLogger`**：
  - 利用垂直窄線佈局。時間格式由 `JetBrains Mono` 精細呈現。
  - 將 sub-collection `history` 以降序排列拉取，完美忠實回溯合約生命中所有發起的變革與留言理由。
* **三方協作對話板 ── `ContractChatConsole`**：
  - 精緻的泡泡氣泡留言板。
  - 每次收到合約內新訊息，結合 Framer Motion 自動向上滑動，提供舒適的對談體驗。

---

## 🏁 第五階段：綜合聯調、例外壓力測試與部署 (QA & Rollout)
*預估工時：0.5 天*

### 5.1 例外邊界模擬沙盒調校
* **並行衝突測試**：開啟兩個虛擬 browser，一邊以魚身份點選同意，另一邊以魟身分點選編輯重新提交，確保樂觀鎖成功拋出「條款已刷新」溫馨提示，且 signatures 正確重歸 Pending。
* **首期重複排除測試**：完成實體單後建合約，設定排程包含當下時間。啟用合約後，確認是否會重複派單。驗證 `lastGeneratedAt` 與 `nextRunAt` 推遲判定是否生效。
* **資格吊銷保護測試**：模擬一瑞莎魺將自身收購項目關閉，前往合約列表或更新介面，驗證排程自適應暫停（Suspended）與系統日誌存取健全。

### 5.2 精密 Linting 與 Compilation
* 執行全域 `lint_applet` 以及 `compile_applet` 保證全專案程式建構一律綠燈。

---

*(End of IMPLEMENTATION_PLAN.md)*
