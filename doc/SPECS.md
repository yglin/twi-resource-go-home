# 資源勾引魟 (ResourceGoingHome) - 全域設計決策與 AI 提示規格書 (SPECS.md)

本文件詳實規整「資源勾引魟」專案之全域關鍵技術決策（Global Design Decisions）、安全架構架構、演算法邏輯，以及後端搭載的 **Gemini 2.5/3.5 Flash** 專用結構化 AI 提示規格、對應的 JSON schema 以及完備的保底退路演算法機制。

---

## 壹、 全域技術決策 (Global Technical Decisions)

### 1. 雙重角色多租戶架構 (Dual-Role Multi-Tenant Architecture)
* **設計決策：** 採取單一 Google / Email 帳戶、多重角色列表儲存策略（而非分別獨立資料表）。
* **技術細節：** 
  - 使用者在登入後能自由於 `/setup` 選擇為複數帳號屬性。
  - 在桌機工作區與路由中，使用單一 Reactive Switch Bar 即可動態切換工作視景（`MAKER_FISH` 🐟 ↔ `GOING_HOME` ✈️）。
  - 當任何使用者被系統判定缺少必要地址、Geohash 或收取細項指引，系統配置 Global Router Middleware 強制引導至保護阻斷頁，確保核心媒合引擎的高可用性。

### 2. 彈性最大半徑地理搜尋策略 (Geospatial Matchmaker Heuristics)
* **設計決策：** 在無關聯資料表的前提下，利用 **前端毫米級高密陣列比對** 與 Firestore Geohash 機制併行，實現高可靠、低運維成本的配送查找。
* **技術細節：** 
  - 系統查找在特定直線距離內，是否具有登記 `'GOING_HOME'` 角色的使用者，且其 `recoveryGuides` 陣列包含對應的回收材質物資大類加細項目。
  - **最大範圍過濾：** 距離上限依照勾引魟角色自行在個人資料中配置的「最大收運範圍 (公里)」`maxDistance` 為準（若未設定則預設為 10 公里）。當梅克魚產生的回收物資與候選勾引魟座標之間的直線距離 `distKm` 小於或等於 `maxDistance`（或 10 公里）時，系統方判定為有效候選，並於推薦清單中呈現。
  - **Firestore 索引優勢**：我們排除極度繁瑣的多對多分佈式映射寫入，避免當勾引魟使用者修改自己的收取目標時引發資料不同步的情況。基於 Web 客戶端，本方案保障了強一致性與極淨簡明的文件安全性規則。

### 3. 安全與絕對隱私隔離層 (Security Layer & Boundary Privacies)
* **設計決策：** 為保護梅克魚之居住交付隱私，物資記錄在未由梅克魚委託指派（或點擊確認）特定勾引魟之前，對所有與此無關的魟魚皆保持絕緣、匿名與不可見狀態。
* **技術細節：**
  - **梅克魚端權益**：只能讀寫/刪除自己產出的歷史 `recoveryRecords` 記錄（`makerFishId == auth.uid`）。
  - **候選過濾限制**：物資記錄未被配對成功前，僅在詳情頁中主動查找附近符合的勾引魟之「公開去識別化特徵」(DisplayName, AcceptedCategories, Guides, Coordinates)。
  - **勾引魟端限制**：只能存取被選定為負責人（`selectedGoingHomeId == auth.uid`）之記錄的安全詳情（地圖地址、電話、放置備註），充分防止資料外洩與不當騷擾。

### 4. 資源審核與漸進式擴充架構 (Crowdsourced Sugar-coated Extensibility & Audit Queue)
* **設計決策：** 為了維護核心材質主檔 `masterData_resources` 的高度資料品質與系統完整安全性，防止未經認證的 AI 推薦品類髒化主檔，任何由 AI 影像分析或梅克魚申報判定為「全新、未登錄之資材/品類」時，系統採用隔離審核機制（Isolation & Moderation Heuristics）。
* **技術細節：** 
  - 當系統發現辨識出的品類不存在於主檔中時，會將新資材與其預設分類、回收建議、關鍵字、以及提報者身分與時間戳記，完整包裹為一筆審核條目，自動寫入並存放在 `newMasterData_resources` 集合中。
  - 此 `newMasterData_resources` 集合對所有已登入之一般使用者開放唯讀與新建權限，維持開放回報與流暢度。
  - **系統管理審核機制**：僅擁有系統主控權限的管理員才能進入「管理員工作台（AdminDashboard）的建議資材審核佇列」，在此可進行人工覆核、微調材質品名/預設建議/修訂關鍵字，隨後單鍵執行「核准並匯入」，或「退回/刪除」該建議。此舉徹底保衛了主檔的資安屏障與數據精確度。

### 5. AI 辨識回傳全新或未知類別時的處理流程 (AI-identified New Categories Processing Pipeline)
* **設計決策：** 當 AI 的智慧影像分析服務回傳一個目前在材質主檔 `masterData_resources` 中完全不存在的（材質, 產品）類別時，系統會將此新類別視為「漸進式擴充資材」，直接套用到使用者當下產生的回收記錄中，並透過自動提報暫存區的方式，由管理端進行覆核。
* **技術細節：** 
  - **新紀錄欄位套用：** 將 AI 判斷之新材質 `material`、產品 `category` 以及前置處理建議 `suggestion` 寫入至當下梅克魚的新 `recoveryRecords` 欄位（對應為 `materialCategory`、`productCategory` 與 `aiSuggestion`），且此時不設強制的相片附加與相片上傳限制。
  - **自動化提報佇列：** 若該次辨識（或手動微調）所得之類別完全不在載入的 `masterData_resources` 快照內，系統於背景將（材質, 產品, 前置處理建議, 提報者帳號與時間戳記）以新欄位封裝，非同步新增至 `newMasterData_resources` 集合，自動向管理員提報；在管理員覆核前，此臨時類別僅對該筆特定記錄生效，不會進入其他大眾用戶之主檔快速下拉篩選模板中，保障正式材質主檔的高確度與純淨。

---

## 貳、 智慧影像擷取 API 與 Prompt 規格 (`/api/analyze-image`)

### 1. API 運行結構
* **作用路徑：** POST `/api/analyze-image`
* **模型：** `gemini-3.5-flash`
* **輸入參數：** 
  - `image`: Base64 格式影像流（自動自相機提取或檔案選取器上傳）
  - `masterData`: 可選，當前系統中存在的 known 資源主檔快照列表

### 2. AI 系統 Prompt 設計 (System Prompt Specification)
```text
你是一個專業的環保回收 AI 指南。請辨識這張圖片中的主要物品，並根據其材質與形狀分類。
請優先比對已知材質主檔，如果圖片中的物品能對應上主檔中的某個(material, product)類別，請務必精確使用該組名稱，並帶入其單位；
如果完全不匹配，再自行生成具代表性的全新 (material, category) 名稱與數量單位 (如「瓶」、「片」、「公升」、「個」等，預設為「個」)。
請務必返回以下格式 of JSON 資料，且不要包含任何額外的 Markdown 包裝符或對話：

參考已知材質主檔：[Dynamic string of MasterDataResource List with units]
```

### 3. Response JSON Schema (具體結構與資料類型)
```json
{
  "type": "OBJECT",
  "properties": {
    "material": { 
      "type": "STRING", 
      "description": "主要材質大類名稱 (例: 塑膠, 紙類, 金屬, 玻璃)" 
    },
    "category": { 
      "type": "STRING", 
      "description": "產品子分類或特定的包裝品名 (例: 寶特瓶, 飲料紙杯, 利樂包, 鋁製易開罐)" 
    },
    "quantity": { 
      "type": "NUMBER", 
      "description": "AI 估算的物理物件數量" 
    },
    "unit": { 
      "type": "STRING", 
      "description": "各類可回收資源的數量計量單位 (如: 瓶, 片, 公升, 個，預設為 個)" 
    },
    "suggestion": { 
      "type": "STRING", 
      "description": "對應的前置處理清洗、折疊壓整等詳細指導" 
    }
  },
  "required": ["material", "category", "quantity", "unit", "suggestion"]
}
```

### 4. 高精準資料修剪實作比對 (Typos Drift Alignment Algorithm)
若 Gemini 輸出與主表有細微偏差，API 在後端會進行兩階段智能比對 realign：
1. **精準比對 (In-case absolute match)**: 大小寫/去空格後，確認是否能與主檔重疊，若是則以主檔之大小寫名稱覆蓋。
2. **模糊子串匹配 (Fuzzy logic match)**: 比對細項產品的包含關係。如 `category` 辨識為 `寶特瓶`，主檔為 `高級PET寶特瓶`，系統後端會自動比對將其收斂鎖定為主檔中定義的標準項與保底 DefaultSuggestion，確保下拉選單能精準鎖定。

### 5. 零斷點高容錯保底機制 (Robust Image Analyzer Fallback)
若網路異常、超出 Quota、或 API Key 未妥善設定時，後端會自動攔截 exception 並進入 **自適應高感知快取器**，依隨機分配邏輯生成下列高品質標準數據物件返還前端，對用戶維持零中斷、超高流暢體驗：
* *寶特瓶物件* (數量 10 / 請清洗洗淨壓扁)
* *紙箱包裝* (數量 4 / 請撕除封箱膠帶平整綑綁)
* *易開罐等* (數量 15 / 請清水沖乾壓扁以便收運)
* *玻璃罐等* (數量 2 / 請洗淨瀝乾避免破碎)

---

## 參、 智慧多點物流調度規劃 API 與 Prompt 規格 (`/api/planning/generate`)

### 1. API 運行結構
* **作用路徑：** POST `/api/planning/generate`
* **模型：** `gemini-3.5-flash`
* **輸入參數：**
  - `departureLocation`: 該魟設定的最佳出發地址
  - `departureTime`: 計畫預定行車開始時間
  - `records`: 被核准要加入收貨的歷史 `recoveryRecords` 整體陣列 (每一筆蘊含特定座標、梅克魚在 setup 填入的開放可用 slots 及備註、數量)

### 2. AI 系統 Prompt 設計 (System Prompt Specification)
```text
你是一位資深的物流調度員。請根據以下提供的回收記錄列表，規劃一個最有效率的「資源勾引計畫」。

出發地點: 
[Departure Location String]

預計出發時間: 
[Departure Timestamp String]

回收記錄列表:
[Stringified JSON records list containing address, slots, coordinates]

規劃目標:
1. 縮短總行駛距離。
2. 確保在梅克魚要求的「開放時段」內抵達。
3. 提供每個點的預計到達時間 (arrivalTime)。
4. 建議最適合的交通工具（例如：機車、貨車、三輪車）。

請規劃合理的順序 (sortingOrder 由 1 開始編號)。
請嚴格依照 schema 格式回傳，不要有任何額外的文字敘述。
```

### 3. Response JSON Schema (具體結構與資料類型)
```json
{
  "type": "OBJECT",
  "properties": {
    "transportationType": {
      "type": "STRING",
      "description": "AI-suggested vehicle according to total metrics (e.g. 輕型機車, 三輪車, 小型貨車)"
    },
    "plannedDepartureTime": {
      "type": "STRING",
      "description": "ISO departure time"
    },
    "routePolyline": {
      "type": "STRING",
      "description": "Encapsulated routing summary details"
    },
    "stops": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "recordId": { "type": "STRING" },
          "arrivalTime": {
            "type": "STRING",
            "description": "ISO formatted estimated arrival time"
          },
          "sortingOrder": {
            "type": "INTEGER",
            "description": "Incremental integer starting from 1"
          }
        },
        "required": ["recordId", "arrivalTime", "sortingOrder"]
      }
    }
  },
  "required": ["transportationType", "plannedDepartureTime", "stops"]
}
```

### 4. 高精準資料修剪實作比對 (Robust Fallback Routing Heuristic Step-by-Step)
當 API 呼叫 Gemini 中斷時，後端程式碼會自動拉起 **地理網格拓撲與時間段分配啟發式保底調度器 (Geometric Grid Falling-Back Scheduler)**：
1. **幾何座標幾何排序 (Spatial Sorting Heuristic)**:
   - 計算每一筆記錄的 $\text{Latitude} + \text{Longitude}$ 幾何和，依照歐幾里德向量由近至遠依序為停靠點排序。
2. **多站點等距推演 (Temporal Step Algorithm)**:
   - 設定初始出發時間，每個停靠站依序加上 **「15 分鐘」的收貨緩衝時間**（例如出發為 09:00，第 1 站預計在 09:15 抵達，第 2 站 09:30，以此類推），並輸出 ISO 字串。
3. **綠能物資自適應載具判定 (Eco-Vehicle Adaptive Rules)**:
   - 累加該計畫所有點點的資材總件數（`totalQty`）：
     - $Q \le 15$ 件：建議 `'環保電動機車 (輕捷款)'`
     - $15 < Q \le 50$ 件：建議 `'永續綠能三輪重卡'`
     - $Q > 50$ 件：建議 `'巨量載運大貨車 (3.5噸)'`
   - 將幾何成果及預算交通工具完美包裝返回給勾引魟。此舉有效規避了雲端 API 連線的不確定性，向使用者展現出極具工藝質感且極高可用、不當機的完備防護網。

---
*(End of SPECS.md)*
