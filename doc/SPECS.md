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

### 5. 系統使用者管理與資材品類交叉過濾規格 (Admin User Management & Material-Product Cross Filtering)
* **設計決策：** 為了讓管理端能極速精確查找有哪些使用者能收取/回收特定類別的資源，系統在使用者管理控制台中導入「材質 + 產品」雙維度交叉比對過濾器。
* **技術細節：**
  - 管理員工作面板設有「系統使用者管理」專區，整合全體註冊使用者帳號、頭像、角色 Badge、聯繫電話與登記地址等豐富資訊。
  - **資材品類交叉比對**：過濾篩選器自動從材質主檔 `masterData_resources` 載入所有現行品類。當管理員在「所有收受資材品類」下拉選單中選擇某一特定資材項目（例如：塑膠 - 寶特瓶）時，過濾算法會對使用者進行交叉聯集比對：
    1. 檢核使用者文檔的 `acceptedCategories`（收購大類）是否包含該資材 ID。
    2. 檢核使用者文檔的 `recoveryGuides`（回收指南）中是否宣告了該資材 ID，或是其手動設定的 `material` 與 `product` 名稱與選定資材精確吻合。
    - 凡符合上述任一條件之使用者（主要為資源瑞莎魺及勾引魟），將會即時高亮過濾展出，這大幅提升了跨角色資材流向的管理效率。

### 6. 平均收購價 (avgPrice) 雙軌容錯計算策略 (Dual-Track Robust Recalculation of avgPrice)
* **設計決策：** 系統針對每一種材質品類，皆維護一個 `avgPrice`（平均收購價），其值代表該資材品類在所有設有回收價格的「資源瑞莎魺」中的每公斤平均收購價格。由於雲端沙盒環境的安全限制，系統建立了兼顧安全與容錯的雙軌計算策略。
* **技術細節：**
  - **後端 API 執行線**：管理員可向 `/api/resources/recalculate-avg-prices` 發起 POST 請求，觸發後端讀取所有瑞莎魺的 `recoveryGuides`，計算出各品類的平均價格並以 Batch 寫回資料庫。
  - **沙盒環境自動降級與前端同步計算機制 (Client-Side Safe Fallback)**：當後端容器在開發測試等沙盒環境下，若因 Service Account 權限限制在直寫資料庫時拋出 `PERMISSION_DENIED`，後端會自動捕獲此異常，記錄降級日誌且不崩潰。此時，管理員可在「資源主檔管理」控制台一鍵點擊「同步計算平均收購價」按鈕，系統會改由**前端管理員上下文身分**來執行計算管線：
    1. 前端拉取所有具備 `RECYCLER` 身分的使用者文檔。
    2. 針對主檔中的每一項資材，遍歷所有瑞莎魺，加總所有在其 `recoveryGuides` 中設定的該品類每公斤單價並除以總個數。
    3. 計算出最新的 `avgPrice` 後，利用當前管理員的安全寫入權限，透過 Firestore `writeBatch` 一次性安全更新回 `masterData_resources` 集合中。
    4. 計算完成後，透過 `logToSystem` API 向系統日誌中原子化載入一筆操作稽核日誌。
  - 此雙軌容錯工藝設計，確保了計價系統在任何權限隔離或容器沙盒邊界下皆能保持 100% 業務可用性與資料一致性。

### 7. 收購估價值單位一致化與預估價格計算約束 (Standardization of Price Units & Estimation Calculations)
* **設計決策：** 為了維護系統中價值衡量體系的強一致性與計費透明度，避免不同使用者、系統元件與主檔數據之間因「元/公斤」與「元/個」等不同計量單位造成混淆，全系統的收購估價值顯示一律強制規格化。同時在各個回收與收運列表中展示動態計算的「預估收購價格」，引導三方使用者快速評估交易價值。
* **技術細節：**
  - **價格與估值單位強制化**：使用者詳細資料彈窗、個人回收指南列表、以及管理端展示的瑞莎魺收購報價，其計量顯示單位一律強制規格化並渲染為**「元 / 公斤」**（NTD per kilogram）。
  - **預估收購價格計算公式**：系統中的各個申報與查看頁面（如：梅克魚新增/詳情/歷史列表、勾引魟可用收運單、以及公開徵收市場）在載入回收紀錄時，會動態提取對應材質產品之主檔資料。其預估收購價格（NTD）計算公式定義如下：
    $$\text{預估收購價格} = \text{該資材品類之全台平均收購價 (avgPrice)} \times \text{該資材品類之預估單件重量 (estimatedWeight)} \times \text{物資申報數量 (quantity)}$$
    若因資料不齊全、未設定單價或單件重量為 0，則計算將會保底並顯示為 `0` 元，避免系統崩潰或輸出異常 NaN 值。
  - **免責說明 Dialog 組**：所有顯示預估收購價的介面均配置一個醒目的驚嘆號/資訊 icon。點擊時將彈出 Dialog 組，提示並聲明：「請注意，此為粗略估計的收購價格，並非最終收購價格。若資料不足無法計算則顯示0元。」，以在提供便利之餘建立正確的交易期待。
  - 後端與資料庫中的計量數值皆以 `每公斤價格 (Price per kg)` 做為唯一物理基準，確保媒合、交易計價與基因演算法中的適應度函數（Fitness Function）在同一個因次下進行精準計算。

### 8. AI 辨識回傳全新或未知類別時的處理流程 (AI-identified New Categories Processing Pipeline)
* **設計決策：** 當 AI 的智慧影像分析服務回傳一個目前在材質主檔 `masterData_resources` 中完全不存在的（材質, 產品）類別時，系統會將此新類別視為「漸進式擴充資材」，直接套用到使用者當下產生的回收記錄中，並透過自動提報暫存區的方式，由管理端進行覆核。
* **技術細節：** 
  - **新紀錄欄位套用：** 將 AI 判斷之新材質 `material`、產品 `category` 以及前置處理建議 `suggestion` 寫入至當下梅克魚的新 `recoveryRecords` 欄位（對應為 `materialCategory`、`productCategory` 與 `aiSuggestion`），且此時不設強制的相片附加與相片上傳限制。
  - **自動化提報佇列：** 若該次辨識（或手動微調）所得之類別完全不在載入的 `masterData_resources` 快照內，系統於背景將（材質, 產品, 前置處理建議, 提報者帳號與時間戳記）以新欄位封裝，非同步新增至 `newMasterData_resources` 集合，自動向管理員提報；在管理員覆核前，此臨時類別僅對該筆特定記錄生效，不會進入其他大眾用戶之主檔快速下拉篩選模板中，保障正式材質主檔的高確度與純淨。

### 9. AI 資源富化 (AI Resource Enrichment) 的高可用性與沙盒防護 (High Availability & Sandbox Protection of AI Resource Enrichment)
* **設計決策：** 在「管理員工作台（AdminDashboard）」新增或編輯材質主檔（或建議審核項目）時，管理端可點擊「AI智慧分析並自動填報其餘欄位」發起 `/api/resources/ai-enrich` 的 POST 請求。為因應高負載的 Gemini API 與受限的沙盒資料庫寫入權限，本系統建立了全方位的多重防護與重試重構策略。
* **技術細節：**
  - **Gemini API 暫時性不可用重試機制 (Exponential Backoff & Retry)**：在遇到 Gemini API 負載過高、頻寬超限或回傳 503 (UNAVAILABLE) 等暫時性異常時，系統內建最多 3 次的「指數退避重試演算法 (Exponential Backoff)」。每次重試失敗時，會以 `delayMs *= 2` 的間隔（1秒、2秒、4秒）進行等待與重試，並透過系統日誌系統記錄為 `info` 級別的「transient workload constraint, retrying shortly...」重試狀況，避免噪音警報。
  - **確定性高解析保底資料 (Deterministic Quality Fallback)**：當重試達最大上限仍無法取得 AI 響應時，後端會自動攔截異常，並依據管理員填報的 `material` 與 `product` 大小寫與模糊特徵，快速渲染並返回一組預載的高品質確定性保底富化資料（包括預設處理建議 `defaultSuggestion`、常用關鍵字 `keywords`、預估單件重量 `estimatedWeight`、標準計量單位 `unit`、以及標準減碳係數 `carbonReduced`），保障管理工作不中斷。
  - **沙盒環境資料庫同步防護與優雅降級 (Sandbox Database Sync Safe-Guard)**：富化成功後，後端會嘗試將富化的資料（預設建議、關鍵字、重量等）同步寫入/更新至 Firestore 的主檔。若後端在直寫資料庫時拋出權限或 quota 限制等 `dbError`，系統會自動在後端捕獲異常，打印「Sandbox database sync skipped gracefully」日誌，並照常向前端返回富化資料，同時為此時臨時生成的資料指派一組安全無害的臨時文件 ID（`ai_temp_` 開頭）。
  - 此機制徹底隔離了第三方 API 狀態波動與 sandbox 雲端容器之特定安全性權限壁壘，賦予了專案極致的工藝韌性。

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

### 5. 零斷點多模型容錯保底機制 (Robust Multi-Model Analyzer Fallback)
為了防範暫時性高負載（503 UNAVAILABLE）與免費額度超限（429 RESOURCE_EXHAUSTED）等異常中斷使用者操作體驗，系統後端配置了多模型重試與自動降級保底機制：
1. **多模型退避重試（Multi-Model Retry Loop）**：系統預備了 `gemini-3.5-flash` 與 `gemini-flash-latest` 雙模型。遇到異常時，系統會先以 `gemini-3.5-flash` 重試兩次（每次間隔1秒），若失敗則自動切換至 `gemini-flash-latest` 再進行兩次重試。
2. **高感知智慧保底（Heuristic Fallback Strategy）**：若所有重試與模型皆失敗，系統會攔截異常並依據傳入之 `masterData` 主檔快照自動推演。如果主檔有預載項目，會直接提取首個有效資材的特徵、預設建議與計量單位作為返回值；若主檔為空，則使用高品質通用保底資材數據。
3. **後端標識標記（isFallback 標記）與前端 Dialog 提示對話框**：返回的 JSON 物件中會包含一個 `isFallback: true` 的額外屬性，提示前端目前使用的是模擬辨識結果（或遭遇 API 暫時不可用等錯誤）。當前端偵測到 `isFallback === true` 或發生 API 連線錯誤/辨識異常時，系統會直接跳出對話視窗提示使用者以下訊息：
   * **標題**：AI 辨識提醒
   * **內容**：
     <h3>AI辨識失敗，請手動輸入資料</h3>
     <p>本網站目前由看守台灣協會開發並維護，線上AI資源有限，如果您認同本網站的理念，請<a href="https://www.taiwanwatch.org.tw/donation" target="__blank">支持看守台灣</a></p>
   此機制保證使用者在 AI 資源不足或高負載 503 時仍能流暢手動填寫物資申報，同時傳達看守台灣協會之永續運營與支持訴求。

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

## 肆、 本地前端自適應基因演算法規畫 (Local Genetic Algorithm for Multi-Destination Pickup-Delivery Routing)

為了在不調用外部 AI 及避免昂貴 API 單元負載的條件下，實現極速、零費用且離線可用的物流調度，本系統於前端直接套用**自訂解碼器之基因演算法（Genetic Algorithm, GA）**。本架構將「取送貨路徑問題 (PDP)」與「具利潤旅行推銷員問題 (TSPP)」融合，透過自適應適應度權重，在短短數毫秒內在瀏覽器端算出兼顧「收購淨利潤最大化」與「載重耗能最小化」之黃金路線。

### 1. 演算法可行性評估 (Feasibility & Performance Analysis)

* **高度可行性**：
  在典型的個人收運/收購情境下，單次計畫包含的站點總數通常在 $10 \sim 30$ 個之內（例如 $3 \sim 8$ 個梅克魚收貨點，以及 $5 \sim 15$ 個潛在的瑞莎魺收購點）。
* **運行效能估算**：
  在現代瀏覽器（V8 引擎）中，針對 30 個節點進行 100 代進化、每代 100 個個體，純 JavaScript 迴圈計算時間約在 $15 \sim 40 \text{ 毫秒}$。這代表我們可以做到**即時動態重新規劃 (Live Recalculation)**，當使用者在地圖上勾選或排除某個站點時，路由可在瞬間微調完畢，體驗極佳。

---

### 2. 資料結構定義與前置處理 (Data Schema & Pre-processing)

#### A. 節點分類 (Node Representation)
我們將所有參與規画的地理座標點統整建模為統一的節點格式 `GANode`：
```typescript
interface GANode {
  id: string;                    // 唯一識別碼 (UserId 或 RecordId)
  type: 'START' | 'PICKUP' | 'DELIVERY';
  coordinates: { latitude: number; longitude: number };
  
  // PICKUP (收貨點 - 梅克魚歷史記錄)
  materialCategory?: string;     // 如 C01 (塑膠)
  productCategory?: string;      // 如 寶特瓶
  quantity?: number;             // 數量
  estimatedWeight?: number;      // 預估單個重量 (kg，來源自材質主檔)
  
  // DELIVERY (交貨點 - 瑞莎魺店面)
  acceptedCategories?: string[]; // 瑞莎魺有收購的資材類別
  prices?: Record<string, number>; // 瑞莎魺對各資材的每單位收購定價
}
```

#### B. 配合此計畫之核心資料結構變更 (Core Data Schema Updates)
為使基因演算法與實際儲存完美整合，我們對現有的持久化資料庫實體進行如下擴增與升級（皆保持優秀的向前與向後相容性）：

1. **`PlanStop` 停靠站結構重構（支援雙重用途）：**
   原本停靠站僅預置 `recordId` 且預設皆為梅克魚收貨點。現正式重構以支援「瑞莎魺交貨點」，可藉由 `type` 欄位與 `deliveredRecordIds` 來完美追蹤在該交貨點一次性變現卸貨的關聯歷史记录：
   ```typescript
   interface PlanStop {
     id: string;                                // 站點唯一識別碼 (若為收貨則為 recordId，若為交貨則為 recyclerId)
     type: 'PICKUP' | 'DELIVERY';               // 站點類型
     recordId?: string;                         // 僅 type === 'PICKUP' 時存在，關聯歷史回收記錄ID
     recyclerId?: string;                       // 僅 type === 'DELIVERY' 時存在，關聯瑞莎魺的使用者UID
     arrivalTime: Timestamp;                    // 預估抵達時間
     status: 'PENDING' | 'ARRIVED' | 'SKIPPED'; // 站點現場執行狀態：待處理 / 已確認執行 / 異常跳過
     sortingOrder: number;                      // 排程物流排序數字標定 (由 1 開始累增)
     deliveredRecordIds?: string[];             // 僅 type === 'DELIVERY' 時存在，紀錄於此站一次清空變現的回收記錄 ID 陣列
     revenueEarned?: number;                    // 僅 type === 'DELIVERY' 時存在，紀錄於此瑞莎魺站點實收之現金總額
   }
   ```
   * *相容性升級政策*：歷史產生的 `GoingHomePlan` 若不具 `type` 欄位，系統將保底預設其值為 `'PICKUP'`。

2. **`GoingHomePlan` 計畫實體拓寬：**
   為詳實記錄基因演算法動態最佳化的物流成效與利潤成效，計畫實體擴展 3 個統計指標，在完成優化時即寫入庫中供報表即時讀取：
   - `totalDistance?: number;` // 整趟路線的基礎行車總距離 (公里 km)
   - `totalLoadWeightedDistance?: number;` // 總體載重與路程的乘積成本指引 (kg * km)
   - `totalRevenue?: number;` // 本趟計畫在瑞莎魺站點累計收購所獲得的總收入 (台幣元)

3. **`MasterDataResource` (材質主檔) 新設耗能預估與生命週期管理：**
   - `expireAfterhHours?: number;` // 過期時數 (小時，0表示無限期，預設為0)
   提供高精度 $\alpha \times C_{\text{load}}$ 適應度運算。
   - `estimatedWeight?: number;` // 預估單個物理單位之重量 (kg/個 或 kg/公升 等，為可選填屬性，未設定則系統內部預設為 0.1 kg 保底)

---

#### C. 距離矩陣預計算 (Distance Matrix Pre-computation)
為避免在 GA 繁衍演化（數萬次距離計算）中呼叫耗時且昂貴的 Google Maps Distance Matrix API，系統在 GA 啟動第一步，使用高效率的 **Haversine 歐幾里德球面公式**，前置算好一個 $N \times N$ 的距離對照表：
$$\text{DistanceMatrix}[i][j] = \text{haversine}(Node_i, Node_j)$$
* **設計決策**：GA 擺脫外部相依，全速在記憶體內執行。當 GA 優化出最優之「節點數組與先後順序」後，才**單次呼叫 Google Maps Directions API** 繪製該最終實體路徑與取得精確導航時間，精省 99% 的 API 成本。

---

### 3. 染色體編碼與自律解碼器 (Chromosome & Strict Decoder Logic)

#### A. 排列編碼 (Permutation Encoding)
* **基因序列**：
  長度為 $M + K$ 的一維陣列。
  - $M$：所有的收貨點（`PICKUP`）。
  - $K$：所有在有效半徑內符合收購品類要求的交貨點（`DELIVERY`）。
  - 起始點（`START`）因固定排在第一位，不計入染色體中。
* **範例染色體**：`[P1, D2, P3, D1, P2]` （其中 P 為梅克魚，D 為瑞莎魺）

#### B. 解碼器運作程序 (Decoder Pipeline)
解碼器由左至右解讀染色體，其最高原則是 **「不合法路徑自動靜態過濾，不走冤枉路」**。

```typescript
function decodeChromosome(chromosome: string[], startNode: GANode): GARoute {
  const actualRoute: GANode[] = [startNode];
  const currentInventory: Map<string, { qty: number; weight: number; material: string }> = new Map();
  let currentLoad = 0;
  let totalRevenue = 0;

  // 1. 優先確保所有的 PICKUP 都會去（這是核心義務）
  for (const nodeId of chromosome) {
    const node = findNodeById(nodeId);
    
    if (node.type === 'PICKUP') {
      // 動作：直接前往收貨，將貨物收入車載清單
      actualRoute.push(node);
      const weight = (node.quantity || 0) * (node.estimatedWeight || 0.1);
      currentInventory.set(node.id, {
        qty: node.quantity || 0,
        weight: weight,
        material: `${node.materialCategory}_${node.productCategory}`
      });
      currentLoad += weight;
    } 
    else if (node.type === 'DELIVERY') {
      // 2. 對於交貨點，進行「有貨才交」的智能過濾
      let hasDealt = false;
      let profitEarned = 0;

      // 檢查目前車上庫存，有沒有這家瑞莎魺 D 收之資材
      for (const [pickupId, item] of currentInventory.entries()) {
        const key = item.material; // 例如 "塑膠_寶特瓶"
        if (node.prices && node.prices[key] !== undefined) {
          // 計算該項變現利潤
          const unitPrice = node.prices[key];
          profitEarned += item.qty * unitPrice;
          
          // 標記已成功交貨，自車載清單卸重
          currentLoad -= item.weight;
          currentInventory.delete(pickupId);
          hasDealt = true;
        }
      }

      if (hasDealt) {
        // 情況 A：真的有資材可以來這裡賣錢 -> 將此瑞莎魺加入實際行經路線，並入帳利潤
        actualRoute.push(node);
        totalRevenue += profitEarned;
      }
      // 情況 B：車上根本沒資源可以交給這家瑞莎魺，或是好貨早就被前面的瑞莎魺買走了 -> 跳過 (Skip)！
      // 如此一來，路徑不會多出多餘、無效益的交貨點
    }
  }

  // 3. 收尾：若到最後車上仍有未清資材，不額外加站，返回預備倉庫 / 終點
  return {
    nodes: actualRoute,
    finalInventory: currentInventory, // 可能有殘餘（代表無瑞莎魺收購，需勾引魟自行回據點處理）
    totalRevenue,
    finalLoad: currentLoad
  };
}
```

---

### 4. 適應度函數設計與多目標權衡 (Fitness & Multi-Objective Balance)

適應度目標在於：**「淨利潤最大化、載重耗能最小化、路線長度最短化」**。

$$\text{Fitness} = \text{TotalRevenue} - \left( \alpha \times \text{TotalLoadWeightedDistance} \right) - \left( \beta \times \text{TotalDistance} \right) - \text{Penalty}$$

#### A. 參數與變數定義：
1. **收購總收益 (TotalRevenue)**：解碼過程中在中途站點成功售予瑞莎魺的台幣元總額。
2. **總載重路程 (TotalLoadWeightedDistance, $C_{\text{load}}$)**：
   車輛在站點 $i$ 到 $j$ 之間行駛時，有乘載貨物的額外負重成本：
   $$C_{\text{load}} = \sum \left( \text{CurrentLoad}_{ij} \times \text{Distance}_{ij} \right)$$
   * $\alpha$ 為**載重處罰係數（預設 0.2）**。當載著 20 公斤重物每跑 1 公里，將扣除 $20 \times 1 \times 0.2 = 4$ 分。促使演算法將「重物收貨點」與其「瑞莎魺交貨點」在排程上極度拉近，體現精確的先收先賣。
3. **基礎空行總距離 (TotalDistance, $D_{\text{base}}$)**：
   不論車載多重，行駛的總路程本身即代表時間與油耗：
   $$D_{\text{base}} = \sum \text{Distance}_{ij}$$
   * $\beta$ 為**公里耗損成本（預設 5.0，表示每公里基本代價為 5 元）**。避免路徑過度繞遠路，即是旅行推銷員問題 (TSP) 的核心約束。
4. **超載懲罰 (Penalty)**：
   根據勾引魟設定之交通工具限制其載重上限（如機車 50kg, 貨車 1000kg），若 `finalLoad` 的歷史高點超出上限，適應度直接扣除極大值。

---

### 5. 演化迭代細節 (GA Operators)

* **選取 (Selection)**：
  採用**競賽選拔法 (Tournament Selection, $k=3$)**。每次隨機抓 3 個個體，挑選最高適應度者進入交配池，可保持極佳局部壓迫收斂力。
* **交配 (Crossover)**：
  採用**順序交配 (Order Crossover, OX)**，百分之百避免產生重複節點，完美繼承好路徑的先後排序片段。
* **突變 (Mutation)**：
  採用 30% 機會的**倒轉突變 (Inversion Mutation)**，隨機反轉染色體中一部分，此舉在路由最佳化能高機率打破局部最佳解 (Local Optima)。
* **精英保留 (Elitism)**：
  每代前 10% 最傑出的路線，不進行交配與突變，完美複製至下一代，防止最優解被意外污染破壞。
* **提前收斂 Heuristic**：
  若連續 25 代最優秀評分無任何增益，或達最高 100 代上限，演化立即安全停止，向前端返還最優解。

---

## 伍、 回收契約系統規格與邊界處理流程 (Recycle Contract Specification & Boundary Handling)

「回收契約」是本系統中連結 **資源梅克魚**、**資源勾引魟**、與 **資源瑞莎魺** 三方，建立定期且具法律/協定約束力的核心業務元件。本章節詳盡規整其核心資料 Schema、自動派單與時序處理、以及在真實複雜環境下的「例外與邊界處理流程」。

### 1. 核心資料模型規格 (Core Database Schema for `recycleContracts`)

為確保 Firestore 中契約實體的高可擴充性、三方身分確權、與生命週期管理，回收契約獨立存儲於 `recycleContracts` 集合：

#### A. `recycleContracts` (主要集合)
* `id` (`String`): 唯一合約識別碼。
* `creatorId` (`String`): 合約建立者 ID，必須為該合約的資源勾引魟。
* `status` (`String`): 合約當前生命週期狀態，列舉值包括：
  - `'Pending Signatures'` (審核中/待三方簽署)
  - `'Active'` (執行中/排程自動派單中)
  - `'Rejected'` (被拒絕)
  - `'Suspended'` (暫停執行)
* `templateRecord` (`Map`): 自動產生回收記錄時的數據樣板（記錄範本）：
  - `materialCategory` (`String`): 回收資源大類
  - `productCategory` (`String`): 回收資源細項產品
  - `quantity` (`Number`): 預估產出數量
  - `unit` (`String`): 回收數量單位 (如 瓶, 個, 公斤)
* `schedule` (`Map`): 排程設定控制參數：
  - `type` (`String`): 排程頻率大類 (每天, 每週, 每月)
  - `daysOfWeek` (`Array<Number>`): 若為每週，指明星期幾 (0-6)
  - `dayOfMonth` (`Number`): 若為每月，指明幾號 (1-31)
  - `time` (`String`): 精確自動產出小時與分鐘 (格式 "HH:MM")
  - `scheduleText` (`String`): 易懂之人類排程描述 (如 "每週一與五 09:00")
* `makerFishId` (`String`): 與此契約綁定之資源梅克魚使用者 ID。
* `goingHomeId` (`String`): 與此契約綁定之資源勾引魟使用者 ID。
* `recyclerId` (`String`): 與此契約綁定之資源瑞莎魺使用者 ID。
* `signatures` (`Map`): 保存三方目前之個別簽署決策狀態：
  - `makerFish` (`String`): `'Pending'` | `'Approved'` | `'Rejected'`
  - `goingHome` (`String`): `'Pending'` | `'Approved'` | `'Rejected'` (因由其發起，預設必為 `'Approved'`)
  - `recycler` (`String`): `'Pending'` | `'Approved'` | `'Rejected'`
* `rejectionReason` (`String`): 當有任一方拒絕簽字時，所填寫的「退回/拒絕理由」，否則為空。
* `sourceRecordId` (`String`): 可選。若本合約是由某一筆歷史「已完成」之回收記錄跳轉而來預載的，此欄位記錄該回收記錄 ID。
* `lastGeneratedAt` (`Timestamp`): 上一次根據此合約排程，自動產出新的實體回收記錄的時間點。
* `nextRunAt` (`Timestamp`): 計算出的下一次預定自動產出回收記錄之時間點。
* `createdAt` (`Timestamp`): 合約創建時間。
* `updatedAt` (`Timestamp`): 合約最後異動時間。

#### B. `recycleContracts/{contractId}/history` (歷史歷程次集合 - Sub-collection)
用於高密度稽核與合約生命週期溯源，不隨編輯而抹除：
* `id` (`String`): 歷程 ID。
* `timestamp` (`Timestamp`): 紀錄時戳。
* `operatorId` (`String`): 執行動作的使用者 ID。
* `operatorName` (`String`): 執行動作的使用者顯示名稱。
* `operatorRole` (`String`): 執行時的對應角色 (`MAKER_FISH` | `GOING_HOME` | `RECYCLER`)。
* `action` (`String`): 行為描述 (例: `'CREATE_CONTRACT'`, `'SIGN_APPROVE'`, `'SIGN_REJECT'`, `'SUSPEND'`, `'REACTIVATE'`, `'RESUBMIT'`)。
* `note` (`String`): 操作備註、拒絕理由或暫停附言。

#### C. `recycleContracts/{contractId}/messages` (留言板協同對話次集合)
* `id` (`String`): 留言 ID。
* `senderId` (`String`): 留言者 ID。
* `senderName` (`String`): 留言者姓名。
* `senderRole` (`String`): 留言者當下角色。
* `content` (`String`): 對對話內容。
* `createdAt` (`Timestamp`): 留言送出時間。

---

### 2. 關於「例外與邊界處理流程」 (Edge Cases & Exception Handling Processes)

在真實的運行中，實體契約常伴隨時間異動、網絡延遲、以及人為因素。為確保軟體展現出高工藝水準、不當機且資料流無暇，本系統設計並建立以下四個例外與邊界處理流程：

#### A. 避免「首期自動產生」重複衝突 (Duplicate Execution Exclusion)
* **面臨問題：** 
  當資源勾引魟是從一筆「剛剛完成的回收記錄（歷史交貨單）」點選「新增契約」而跳轉過來時，那筆已完結的歷史單事實上已經代表了當前的第一期回收實體。此時若當前時間剛好符合排程設定（例如：合約設定為每週二 10:00，且合約在週二 10:05 三方完成簽核激活），如果直接交由 Scheduler 執行判定，可能會在合約激活之幾秒內立馬又重複自動生成一筆一模一樣的實體派單，造成「同天雙重收取」的嚴重派單衝突。
* **解法機制：**
  1. **記錄關聯化：** 合約保存 `sourceRecordId` 引證。
  2. **推遲策略 (Time-Postponement Heuristics)：** 
     於合約三方簽核全部通過、狀態轉為 `Active` 的當下，系統不將 `lastGeneratedAt` 留空。相反地，系統會將 `lastGeneratedAt` 預設初始化為**「該來源完成記錄的完結時間 (completionTime)」**，或是將 `nextRunAt` 預先向後推遲計算至**「合約生效日之後的下一個完整排程週期 $T_{\text{next}}$」**。
  3. **Scheduler 嚴格不等式：** 定期排程產生器在每次工作時，會嚴格確認每一次執行時間必須滿足條件 $T_{\text{next}} > T_{\text{activation_time}}$ 且 $T_{\text{next}} > T_{\text{source_record_completion_time}}$，以此完美徹底杜絕首期多重生成的派單漏洞。

#### B. 參與者帳號變更或角色/指引資格吊銷降級 (User Downgrade & Revocation Protection)
* **面臨問題：** 
  一份合約處於 `Active` (執行中)。然而，在某天定期產生新單前，該「資源瑞莎魺」因個人店鋪調整，在系統中關閉了自己對「塑膠-寶特瓶」的收購指引（回收指引失效），或其中一方使用者至設定頁將特定角色關閉。
* **解法機制：**
  - **前置校驗管線 (Pre-Evaluation Pipeline)**：
    定期排程產生器執行自動派單前，系統會檢核以下三項相容性：
    1. 三位綁定使用者的系統帳號均仍存在，且未停用。
    2. 三名使用者依然擁有當初繫結合約之角色身分（`roles` 依然包含相應角色）。
    3. 資源瑞莎魺的目前收購項目中，依舊包含此合約 `templateRecord` 的資材分類。
  - **異常降級處理 (Graceful Interruption Heuristics)**：
    若上述任一校驗失敗，系統一律**不產出**新的回收記錄。系統將自動將該合約的狀態由 `Active` 被動降級轉移為 `Suspended` (暫停狀態)，並自動於該合約的 `history` 發送警示：`[系統警示] 因參與者之角色不符或回收指引相容性變更，本合約由系統自動暫停執行。` 同步推送通知予三方使用者。

#### C. 多人同時審查/編輯之狀態並行衝突 (Concurrency Race Conditions)
* **面臨問題：** 
  當資源梅克魚在看網頁並點按「同意簽署」之同一秒鐘，發起人（資源勾引魟）剛好在另一端的編輯器頁面點選「修改契約條款並重新提交」。如果處理不當，可能會造成梅克魚的「同意」事件，意外覆蓋或沿用到已經被勾引魟微調過的新版條款中。
* **解法機制：**
  - 使用 Firestore **事務（Transaction）** 或 **樂觀鎖機制（Optimistic Version Lock）** 進行寫入：
    1. 任何使用者執行「簽署（同意或拒絕）」或「修改（重新提交）」操作前，會先比對合約目前文件中的 `updatedAt` 或者是 `version` 欄位。
    2. 勾引魟一旦對合約執行「重新提交(Edit & Resubmit)」，在 Transaction 內，系統除了寫入新修改的規格與排程外，會**強制重置三方所有人的 signatures 状态**（包括原本已簽署同意的人，亦全數重歸為 `'Pending'`），並將 `updatedAt` 刷新。
    3. 如果在送出前偵測到 `updatedAt` 已被變更，系統會流暢打回並彈窗提示：`【提示】此合約內容剛剛已被其他成員變更，請重新整理並閱讀新版內容後再進行簽核。`

#### D. 「暫停」與「重啟」之高密度軌跡回寫 (Atomic Event Record Integration)
* **面臨問題：** 
  任何人皆可因故執行「暫停」，或任何人皆可發起「重啟（需三方重新同意）」。若無高密度的歷史軌跡，三方很容易陷入猜疑是誰隨意暫停或惡意反悔重啟。
* **解法機制：**
  - **原子化包裹更新 (Atomic Batch Updates)**：
    當使用者按下「暫停」或「重啟」並選填理由後，系統利用一個 Firestore 寫入事务或 `writeBatch` 執行以下動作，確保資料一致性：
    1. **合約本體變更**：更新狀態（若為重啟，則 signatures 重設為 `Pending`，原發起重啟者可自動設為 `Approved`）。
    2. **寫入稽核歷史**：在 `history` 子集合寫入一筆詳實的 Audit 記錄，記錄精確時間、姓名、角色、以及當下寫下的附言理由。
    3. **留言版提醒**：在合約的 `messages` 留言集合中，同步非同步新增一則由 **`System` 身份** 產出的置頂系統對話訊息（例：`「[系統廣播] 資源瑞莎魺 瑞莎阿明 已於 14:32 暫停了此合約，原因：『店面歲修兩週』。」`）。

---

## 陸、 公開徵收市場進階多維度篩選器與安全過濾 (Open For All Public Market Advanced Filtering & Security Filters)

為了提昇公開案件媒合效率，並在保障隱私的限制下，供資源勾引魟（以及一般大眾、訪客）快速篩選最相符的案件，`/openForAll` 頁面實作了多重聯集與交集過濾器：

### 1. 核心過濾指標 (Core Filtering Dimensions)
* **資材與產品分類過濾 (Material & Product Category Filter)**：
  - 系統自動解析並匯整當前所有 `OPEN_FOR_ALL` 狀態物資中不重複的材質大類與細項產品名稱。
  - 使用者可利用下拉選單精確交叉篩選特定的材質（如「塑膠」）或細項（如「寶特瓶」），大幅降低瀏覽雜訊。
* **預估價格區間過濾 (Price Range Filter)**：
  - 提供 `minPrice` 與 `maxPrice` 雙向滑動/手動輸入區間，過濾依據公式計算出的各記錄「預估收購價格」。
* **回收期效過濾 (Expiration Datetime Filter)**：
  - 整合 `expirationDate` 欄位。使用者可指定一特定「到期日期時間」，系統自動過濾並高亮顯示「在此時間之後才到期」的未失效案件。
* **特定地址與定位中心半徑搜尋 (Custom Anchor Location Radius Filter)**：
  - 使用者可輸入特定地址或使用當前定位 coordinates 取得地圖中心，並指定一特定的半徑（公里）。系統會利用 Haversine 球面距離公式計算記錄與中心之實體距離，過濾保留指定半徑範圍內之案件。
* **瑞莎魺覆蓋半徑智慧過濾 (Recycler Radius Compatibility Filter)**：
  - **智慧關聯分析**：此過濾器可設定「瑞莎魺最大距離」（如 5 公里、10 公里）。
  - **過濾演算邏輯**：系統會遍歷每一個回收記錄，計算系統中登記之所有「資源瑞莎魺（`RECYCLER`）」之位置與此回收記錄放置地之直線距離。若至少有一家符合收受該記錄品類之瑞莎魺，其與該案件的直線距離小於或等於設定的半徑，該筆回收記錄才會被保留展示。這能極大保障勾引魟收貨後可以就近快速卸貨變現，防止物流死胡同。

### 2. 匿名化與 Firestore 安全性存取限制 (Anonymization & Auth Sandboxing)
* **訪客安全性防護**：本頁面支援訪客免登入唯讀瀏覽（不洩漏任何使用者的敏感電話與精確通訊地址）。
* **Firestore 存取優雅降級**：當大眾使用者或訪客未登入時，前端絕對禁止直接去 `get` 或 `list` 集合 `users` (否則將引發 Firebase `permission-denied` 安全性阻斷)。系統採用優雅降級邏輯，此時會將「瑞莎魺覆蓋半徑過濾」依賴 of `users` 讀取機制降級跳過（或提示使用者需要登入），並將列表以去識別化的方式（僅展示大類、概略地段、預估重量、預估價格）進行高質感渲染。這保證了 100% 的 Firestore Rules 安全相容性與無錯誤高可用性。

---

## 柒、 品牌統計演算法、安全性規則修復與後台整合 (Brand Statistics Heuristics, Security Rules Repair & Admin Integration)

### 1. 產品品牌辨識與資料庫安全權限 (Product Brand Identification & Security Permissions)
* **安全漏洞修補**：在物資回收過程中，系統允許使用者（梅克魚或勾引魟）為 `recoveryRecords` 關聯特定產品品牌標籤（例如 `Coca-Cola`, `Sprite`, `原萃`）。早期因 `firestore.rules` 缺乏對獨立 `brand` 集合的安全寫入權限，導致在提交含品牌標籤的回收單時，引發 `Missing or insufficient permissions` 的安全性阻斷。
* **安全規則強化**：更新了 `firestore.rules` 檔案，為 `/brand/{brandId}` 集合配置了細粒度存取機制：
  - **讀取 (`read`)**：任何已登入的使用者皆可讀取，支援申報與分析時的實時匹配。
  - **寫入 (`create`, `update`)**：任何已登入使用者皆可新增或更新，以便在申報回收記錄時能原子化更新關聯品牌。
  - **刪除 (`delete`)**：限系統管理員 (`SYSTEM_ADMIN`) 權限執行，保障基礎資產的安全性。

### 2. 品牌統計動態融合演算法 (Dynamic Merging Heuristics of Brand Stats)
為了避免因為分散式寫入時差、網路震盪或歷史髒資料導致品牌統計漏記 or 不準確，系統在管理端實作了 **雙向動態融合與去重演算法 (Dynamic Multi-Source Merging Heuristics)**：
* **第一數據源：`brand` 集合 seed 載入**：首先載入並訂閱所有的 `brand` 集合文檔，獲取各品牌自主登記的 `recoveryRecords` 關聯列表作為種子。
* **第二數據源：`recoveryRecords` 實時動態掃描**：併行掃描所有的 `recoveryRecords` 紀錄。若發現紀錄中的 `brands` 陣列包含對應品牌，即使在 `brand` 集合文檔中漏記，系統會自動在前端將該 Record ID 追加入該品牌的去重 `Set` 中。
* **去重與即時計算**：使用 `Map<string, Set<string>>` 對兩組來源的 Record IDs 進行聯集去重與計數，確保計算出的「總回收關聯紀錄數」達到 100% 精準度，並將品牌按「關聯回收次數」降序（由多到少）進行排行。

### 3. 管理端品牌後台交互 (Admin Brand Dashboard Interactions)
* **品牌指標卡 (Brand Metric Cards)**：
  - **已註冊品牌數**：展出所有已在 `brand` 集合或物資中被檢索到的獨立品牌個數。
  - **總回收關聯紀錄數**：加總所有品牌去重後的關聯回收紀錄次數之和。
  - **最活躍回收品牌**：高亮呈現回收次數最高的品牌名稱，並配有 title 屬性完整展示 Brand ID 詳情。
* **品牌關聯歷史履歷對話框 (Brand Associated Record History Modal)**：
  - 點擊「檢視關聯記錄」按鈕，系統會以管理員權限發起 `array-contains` 查詢，將該品牌在 `recoveryRecords` 中的所有履歷（物資照片、材質品類、數量、履約狀態與建立時戳）拉取出來。
  - 履歷列表以 `createdAt` 降序垂直排列，為管理端提供直觀的品牌碳排減碳貢獻與回收追蹤視野。

---

*(End of SPECS.md)*

