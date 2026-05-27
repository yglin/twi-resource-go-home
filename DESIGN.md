# 資源勾引魟 (ResourceGoingHome) APP 設計規格

**APP 主標題：** 「資源勾引魟」

## 名詞定義 (Glossary)

* **可回收資源**：從垃圾中辨識出的可回收資源物品。
* **回收記錄**：APP 從垃圾照片中辨識出某類可回收資源時，會在後端資料庫中記錄一筆回收記錄。註：APP 可能從同一張垃圾照片中辨識出多種不同分類的可回收資源，每一種類的可回收資源算一筆回收記錄。
* **資源梅克魚**：擁有資源梅克魚角色的使用者。
* **資源勾引魟**：擁有資源勾引魟角色的使用者。
* **魚的回收記錄**：由目前登入的資源梅克魚所產生的回收記錄清單。
* **魚的新回收記錄**：魚的回收記錄中，滿足篩選條件「資料欄位『狀態』＝剛出生」的回收記錄清單。
* **魟的回收記錄**：滿足篩選條件「資料欄位『資源勾引魟』的值等於目前登入的資源勾引魟的 ID」的回收記錄。
* **魟的等待回收記錄**：魟的回收記錄中，滿足篩選條件「資料欄位『狀態』＝ 等待勾引魟」的回收記錄。
* **資源勾引計畫**：引導資源勾引魟前往多個回收記錄的地點收取可回收資源的計畫，包括出發時間、路線規劃、建議交通工具……等等。
* **資源材質分類**：可回收資源依主要材質分類（例：塑膠、金屬、紙、有機物、玻璃、混合材質……等）。
* **資源產品分類**：可回收資源依生活常見的產品類別分類（例：寶特瓶、飲料杯、利樂包、易開罐、紙餐盒、電子、塑膠袋……等）。
* **資源回收指引**：每一類（材質分類＋產品分類）的可回收資源如何做回收的指引 (Guide)，主要是資源梅克魚應遵循的前置處理方法。

## 使用者角色 (User Roles)

* **資源梅克魚 (Resource Maker Fish)**
  - 使用需求：APP 幫他辨識出垃圾中的可回收資源，給予分類回收建議，以及附近收受該類可回收資源的資源勾引魟的資訊。做好可回收資源的前置處理後，通知資源回收魟前來收取。
* **資源勾引魟 (Resource Going Home)**
  - 使用需求：根據資源梅克魚寄來通知和回收記錄，APP 依照每個回收記錄的資料（數量、地址、開放時段……等等），自動幫資源勾引魟規劃出一個收運計畫。
* **系統管理者 (System Admin)**
  - 使用需求：維護系統主檔資料（如可回收資源類別），並具備管理使用者與回收記錄的權限。
  - **安全性註記**：此角色不開放使用者自選。系統透過獨立的管理者名單 (UID lookup) 進行授權。

## 資料實體 (Data Entities)

### 使用者 (User)
| name | type | label（中文） | description | required | primary key | default value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| id | string | 唯一識別碼 | Firebase Auth UID | Yes | Yes | - |
| displayName | string | 顯示名稱 | 使用者顯示名稱 | Yes | No | - |
| photoURL | string | 頭像 URL | 使用者頭像連結 | No | No | - |
| email | string | 電子郵件 | 使用者登入信箱 | Yes | No | - |
| phoneNumber | string | 聯絡電話 | 收運時緊急聯絡使用 | No | No | - |
| roles | array (string) | 帳號角色 | `MAKER_FISH`, `GOING_HOME` (使用者可擁有多重角色，並隨時增減) | Yes | No | `[]` |
| isAdmin | boolean | (隱含) 管理者 | 系統內部權限，由 `admins` 集合控管，非使用者自選 | No | No | `false` |
| address | string | 預設地址 | 梅克魚的回收物預設交付地址 | No | No | - |
| timeWindow | object | 預設時段 | 梅克魚可配合的交付時段 (JSON) | No | No | `{}` |
| recoveryGuides | array (object) | 回收指引列表 | 勾引魟收取的資源類別與對應之專屬處理建議 | No | No | `[]` |
| acceptedCategories | array (string) | 已選定回收類別 | 使用者目前關注、已勾選或有興趣參與的可回收資源 (Resource) 主檔 ID 陣列。用以初始化與比對 recoveryGuides。 | No | No | `[]` |
| coordinates | geopoint | 地圖座標 | 經緯度座標 (適用梅克魚) | No | No | - |
| recycleNotes | string | 回收備註 | 給勾引魟的額外提醒（如：放置地點、自取說明等） | No | No | - |

### 回收記錄 (Recovery Record)
| name | type | label（中文） | description | required | primary key | default value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| id | string | 記錄 ID | 回收記錄唯一識別碼 | Yes | Yes | - |
| materialCategory | string | 材質分類 | 資源的主要材質類別 | Yes | No | - |
| productCategory | string | 產品分類 | 資源的產品細類 | Yes | No | - |
| quantity | number | 數量 | 辨識出的資源數量 | Yes | No | 1 |
| aiSuggestion | string | AI 建議 | AI 提供之分類及回收處理建議 | Yes | No | - |
| imageUrl | string | 照片 URL | 上傳的原始照片 URL | Yes | No | - |
| address | string | 交付地址 | 可回收資源所在的地點地址 | Yes | No | - |
| timeWindow | object | 開放時段 | 可收取的時段 | Yes | No | - |
| coordinates | geopoint | 地圖座標 | 資源所在地的經緯度座標 | Yes | No | - |
| recycleNotes | string | 回收備註 | 給勾引魟的額外提醒，產出時預設套用梅克魚備註 | No | No | - |
| makerFishId | string | 梅克魚 ID | 產出者的使用者 ID | Yes | No | - |
| candidateGoingHomeIds | array (string) | 候選魟 IDs | 附近可收取的勾引魟名單 | No | No | `[]` |
| selectedGoingHomeId | string | 選定魟 ID | 最終被選定的勾引魟 ID | No | No | - |
| status | string | 狀態 | `JUST_BORN`, `WAITING_FOR_COLLECTION`, `COLLECTION_CONFIRMED`, `PICKED_UP`, `COMPLETED` | Yes | No | `JUST_BORN` |
| createdAt | timestamp | 建立時間 | 記錄建立的時間戳記 | Yes | No | `serverTimestamp()` |
| statusUpdatedAt | timestamp | 狀態更新時間 | 最後一次變更狀態的時間 | No | No | - |

### 資源勾引計畫 (Going Home Plan)
| name | type | label（中文） | description | required | primary key | default value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| id | string | 計畫 ID | 計畫唯一識別碼 | Yes | Yes | - |
| goingHomeId | string | 勾引魟 ID | 負責執行的資源勾引魟 ID | Yes | No | - |
| departureTime | timestamp | 出發時間 | 魟計畫出發的時間 | Yes | No | - |
| transportationType | string | 建議交通工具 | AI 建議或魟選定的交通方式 | No | No | - |
| stops | array (object) | 收取點清單 | 每一項包含 `arrivalTime`, `recordId`, `status` | Yes | No | `[]` |
| routePolyline | string | 路線軌跡 | Encoded polyline 用於地圖顯示 | No | No | - |
| status | string | 計畫狀態 | `DRAFT`, `APPROVED`, `COMPLETED` | Yes | No | `DRAFT` |
| createdAt | timestamp | 建立時間 | 計畫建立的時間戳記 | Yes | No | `serverTimestamp()` |

### 通知 (Notification)
| name | type | label（中文） | description | required | primary key | default value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| id | string | 通知 ID | 通知唯一識別碼 | Yes | Yes | - |
| receiverId | string | 接收者 ID | 接收通知的使用者 ID | Yes | No | - |
| type | string | 通知類型 | `SYSTEM`, `PLAN_CONFIRMED`, `COLLECTION_COMPLETED`, `NEW_RECORD_REMINDER` | Yes | No | - |
| title | string | 標題 | 通告簡題 | Yes | No | - |
| content | string | 內容 | 通知本文內容 | Yes | No | - |
| recordId | string | 回收記錄 ID | (選擇性) 關連之記錄 | No | No | - |
| planId | string | 計畫 ID | (選擇性) 關連之計畫 | No | No | - |
| isRead | boolean | 是否已讀 | 狀態旗標 | Yes | No | `false` |
| createdAt | timestamp | 建立時間 | 通知建立的時間戳記 | Yes | No | `serverTimestamp()` |

### 可回收資源 (Recyclable Resource Master Data)
| name | type | label（中文） | description | required | primary key | default value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| id | string | 資源類別 ID | 主檔唯一識別碼 | Yes | Yes | - |
| material | string | 材質分類 | 主要材質 (例：塑膠、紙...) | Yes | No | - |
| product | string | 產品名稱 | 產品細類 (例：寶特瓶...) | Yes | No | - |
| defaultSuggestion | string | 通用指引 | 該類別通用的基本處理規則 | Yes | No | - |
| icon | string | 圖示 | UI 顯示用的圖示名稱 | No | No | - |
| keywords | array (string) | 關鍵字 | 輔助 AI 辨識的標籤 | No | No | `[]` |

## AI 提示文 (AI Prompts)

### 1. 垃圾辨識與資源提取 (Garbage Recognition & Extraction)
**用途：** 當資源梅克魚上傳照片時，辨識其中的可回收資源並產出結構化資料。
**提示詞內容範本：**
```text
你是一位專業的環境工程與回收專家。請分析這張照片中的物體。

你的任務：
1. 找出照片中所有「可回收」的資源。
2. 針對每一項資源，提供：
   - 材質分類（例如：塑膠、紙、金屬、玻璃、有機物）。
   - 產品名稱（例如：寶特瓶、易開罐、紙餐盒）。
   - 估計數量。
   - 針對資源梅克魚的前置處理建議（例如：沖洗乾淨、壓扁、撕下貼紙）。
   - 給資源勾引魟的搬運或處理備註。

請嚴格依照以下 JSON 格式回傳，不要有額外的文字描述：
{
  "items": [
    {
      "material": "string",
      "product": "string",
      "quantity": number,
      "aiSuggestion": "string"
    }
  ]
}
```

### 2. 資源勾引計畫規劃 (Going Home Plan Planning)
**用途：** 當資源勾引魟選定多個回收記錄後，規劃最佳的收運順序與時間。
**提示詞內容範本：**
```text
你是一位資深的物流調度員。請根據以下提供的回收記錄列表，規劃一個最有效率的「資源勾引計畫」。

輸入資料：
- 勾引魟的出發地點與預計出發時間。
- 回收記錄列表（包含：地址、地圖座標、建議收取時段、資源描述、數量）。

規劃目標：
1. 縮短總行駛距離。
2. 確保在梅克魚要求的「開放時段」內抵達。
3. 提供每個點的預計到達時間。
4. 建議最適合的交通工具（例如：機車、貨車、三輪車）。

請嚴格依照以下 JSON 格式回傳，不要有額外的文字描述：
{
  "transportationType": "string",
  "plannedDepartureTime": "iso-timestamp",
  "routePolyline": "string",
  "stops": [
    {
      "recordId": "string",
      "arrivalTime": "iso-timestamp",
      "sortingOrder": number
    }
  ]
}
```

## UI (User Interface)

根據上述使用情境，本應用程式將包含以下主要頁面與 UI 元件：

### 1. 通用元件 (Common Components)
- **導覽列 (Navigation)**：桌機版側邊欄或行動版底部導覽列。
- **通知中心 (Notification Center)**：顯示系統、計畫與收取狀態通知。
- **載入與載入中狀態 (Loading States)**：AI 辨識或路徑規劃時的動畫與提示。

### 2. 認證與引導 (Auth & Onboarding)
- **登入頁面 (Login Page)**：Google 登入按鈕。
- **角色選擇頁面 (Role Selection)**：新使用者選擇成為「資源梅克魚」或「資源勾引魟」。
- **個人資料編輯器 (Profile Editor)**：
    - 地址輸入與地圖定位 (Coordinates Picker)。
    - 聯絡電話與回收備註編輯。
    - 交付/收取時段編輯器 (Time Window Selector)。
    - (限魟) 資源回收指引清單編輯。

### 3. 資源梅克魚專屬 (Maker Fish Views)
- **梅克魚主頁 (Fish Dashboard)**：
    - 「剛出生」回收記錄清單：以卡片形式顯示，包含縮圖、分類、數量。
    - 快速拍照按鈕：懸浮按鈕 (FAB) 觸發相機。
- **相機與辨識介面 (Camera & Recognition UI)**：
    - 相機預覽畫面。
    - 照片拍攝後的預覽與 AI 辨識進度條。
    - **辨識結果確認頁**：列表顯示 AI 辨識出的項目，允許微調數量或刪除誤判項目。
- **回收記錄詳情頁 (Record Detail)**：
    - 顯示材質、產品、AI 處理建議、地址、時段、備註。
    - **資源勾引魟候選名單**：顯示附近合適的魟，包含頭像、評價(如有)與勾選按鈕。
- **收運進度頁面**：檢視目前「等待勾引」或「已上車」的記錄與預計收取時間。

### 4. 資源勾引魟專屬 (Going Home Views)
- **勾引魟主頁 (Ray Dashboard)**：
    - 「等待勾引」回收記錄列表：顯示地圖或列表，標示各記錄的距離與物資類別。
    - 多選模式：用於選擇多個記錄以啟動 AI 計畫規劃。
- **資源勾引計畫工作區 (Plan Workspace)**：
    - **計畫預覽頁**：地圖顯示收運路徑 (Route Polyline)、各停靠站 (Stops) 的順序與預計到達時間。
    - 計畫核准按鈕：正式確認計畫並自動通知對應的梅克魚。
- **執行計畫模式 (Plan Execution UI)**：
    - 聚焦於目前的收取點。
    - **收取確認按鈕**：掃描或點擊確認「已上車」，自動推進至下一個站點。

### 5. 系統管理專屬 (Admin Views)
- **管理員主頁 (Admin Dashboard)**：
    - 系統數據概覽（用戶數、總回收件數）。
- **可回收資源主檔管理**：
    - 列表顯示所有 master data 項目。
    - **CRUD 編輯介面**：新增/編輯/刪除材質、產品分類、圖示與關鍵字。

## 關鍵設計決策與技術考量 (Key Design Decisions & Technical Considerations)

### 1. 地理空間查詢策略 (Geospatial Strategy)
- **決策結果：** 採用 **Geohash 庫** (如 `geofire-common`) 來實作半徑搜尋與地理查詢。
- **技術細節：** 
    - 透過將經緯度轉換為 Geohash 字串，利用 Firestore 的字串範圍查詢功能達成地理位置過濾。
    - 這對於「資源梅克魚」在產出記錄時搜尋附近的「資源勾引魟」（作為候選者），以及「資源勾引魟」篩選自身服務範圍內的記錄至關重要。

### 2. 地圖服務整合 (Map Service)
- **決策結果：** 使用 **Google Maps Platform**。
- **技術細節：** 
    - **Coordinates Picker**：使用 Google Maps JavaScript API 讓使用者在設定個人資料或回收記錄時進行精確的地圖定位。
    - **Route Display**：在魟的計畫工作區使用 Google Maps Directions API 渲染導航路徑 (Route Polyline)。
    - **Geocoding**：用於地址字串與地理座標之間的轉換。

### 3. 主檔資料初始化 (Master Data Seeding)
- **決策結果：** 建立 **系統管理後台 (Admin Panel)**。
- **技術細節：** 
    - 透過 `SYSTEM_ADMIN` 角色權限控管，讓管理者能直接在 UI 上進行「可回收資源」主檔的 CRUD 操作。
    - 初期會由開發者透過腳本或手動在後台建立首批「資源清單」種子資料 (Seed Data)。

### 4. 角色權限與資料隔離 (Security & Privacy)
- **決策結果：** 採用分層存取控制與資料匿名化策略。
- **技術細節：** 
    - **回收記錄 (Recovery Records)**：
        - **梅克魚**：僅能讀寫自己產出的記錄 (`makerFishId == auth.uid`)。
        - **勾引魟**：僅能讀寫「自己被選定為服務對象」的記錄 (`selectedGoingHomeId == auth.uid`)。記錄在尚未選定魟之前，對所有魟皆為不可見，以保護梅克魚隱私。
    - **使用者資料 (User Profiles)**：
        - **梅克魚**：可搜尋並讀取角色為 `GOING_HOME` 之使用者的「公開資料」（名稱、頭像、座標、回收指引、評分），用於挑選候選魟。不可存取其私密欄位（如 Email）。
        - **勾引魟**：除本人資料外，僅能讀取「已選定自己」的梅克魚之「收運必要資訊」（地址、座標、聯絡電話、回收備註）。
    - **Firestore Rule 實作**：將透過資料夾層級或 `resource.data` 欄位比對來實作嚴格的後端驗證。

### 5. 視覺風格與調性 (Visual Language & Mood)
- **決策結果：** 採用 **「永續海洋風格 (Oceanic Sustainability)」**。
- **UI 視覺細節：** 
    - **色調計畫**：以深海藍 (Deep Sea Blue) 作為基礎面，搭配珊瑚橘 (Coral Accent) 作為強調色（如：重要按鈕、通知），輔以環保綠 (Eco Green) 代表成功與環保意象。
    - **組件設計**：介面元件採用大圓角設計，並搭配軟性投影 (Soft Shadows) 與 `shadcn/ui` 庫，營造出親切、現代且具信任感的產品氛圍。
    - **互動反饋**：使用微動效 (Micro-animations) 模擬海浪起伏的平滑轉場。

## 使用情境 (User Scenarios)

### 1. 資源梅克魚請 AI 幫忙辨識垃圾、產出回收記錄

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1.1 | 資源梅克魚 | 開啟 APP 並登入 | 使用者 (Read) | 登入頁面 (Login Screen) | - | - |
| 1.2 | 資源梅克魚 | 拍攝垃圾照片並上傳 AI 辨識 | - | 相機介面、上傳預覽 | 辨識照片中的垃圾，判斷是否為可回收資源，並進行分類 | - |
| 1.3 | 資源梅克魚 | 等待 AI 回傳辨識出的回收記錄列表 | 回收記錄 (Create) | 辨識中動畫/載入狀態 | - | 可回收資源清單（材質分類、產品分類、數量、處理建議） |
| 1.4 | 資源梅克魚 | 檢視辨識結果列表 | 回收記錄 (Read) | 「魚的新回收記錄」清單頁 | - | - |

### 2. 資源梅克魚檢視自己的新回收記錄，將某一筆已經做好回收前置處理的回收記錄勾選資源回收魟

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2.1 | 資源梅克魚 | 檢視「剛出生」回收記錄 | 回收記錄 (Read) | 「魚的新回收記錄」清單頁 | - | - |
| 2.2 | 資源梅克魚 | 查看回收記錄詳情與候選魟 | 回收記錄 (Read)、使用者 (Read) | 回收記錄詳情頁、資源勾引魟候選者清單 | - | - |
| 2.3 | 資源梅克魚 | 勾選指定資源勾引魟，轉換狀態 | 回收記錄 (Update) | 勾選按鈕、確認彈窗 | - | - |
| 2.4 | 資源梅克魚 | 等待收運計畫通知 | 回收記錄 (Read)、資源勾引計畫 (Read) | 通知中心、行程日曆 | - | - |
| 2.5 | 資源梅克魚 | 依照通知時間交付資源 | 回收記錄 (Update) | 交付確認按鈕 | - | - |

### 3. 資源勾引魟規劃資源勾引計畫並收取

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 3.1 | 資源勾引魟 | 開啟 APP 並登入 | 使用者 (Read) | 登入頁面 | - | - |
| 3.2 | 資源勾引魟 | 檢視並勾選「等待勾引」記錄 | 回收記錄 (Read) | 「魟的等待回收記錄」清單頁 | - | - |
| 3.3 | 資源勾引魟 | 提交選中記錄，請 AI 規劃路徑 | 回收記錄 (Read) | 提交按鈕 | 根據多個地址與開放時段，規劃最佳收運路徑、時間與建議工具 | - |
| 3.4 | 資源勾引魟 | 等待 AI 回傳資源勾引計畫 | 資源勾引計畫 (Create) | 規劃中狀態 | - | 資源勾引計畫內容（出發時間、收取點序列、應到達時間） |
| 3.5 | 資源勾引魟 | 檢視並核准資源勾引計畫 | 資源勾引計畫 (Update) | 計畫預覽頁（路徑地圖、時間表）、核准按鈕 | - | - |
| 3.6 | 資源勾引魟 | 系統核准計畫後自動通知梅克魚 | 回收記錄 (Update) | 自動觸發通知系統 | - | - |
| 3.7 | 資源勾引魟 | 依照計畫前往收取並完成記錄 | 資源勾引計畫 (Read)、回收記錄 (Update) | 導航介面、收取確認按鈕 | - | - |

### 4. 資源梅克魚註冊及輸入個人資料

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 4.1 | 資源梅克魚 | 首次登入並選擇「梅克魚」角色 | 使用者 (Create) | 角色選擇頁面 | - | - |
| 4.2 | 資源梅克魚 | 輸入交付地址與聯絡資訊 | 使用者 (Update) | 個人資料編輯表單、地圖定位元件 | - | - |
| 4.3 | 資源梅克魚 | 設定預設交付時段 | 使用者 (Update) | 時間選擇器、營業週期設定 | - | - |

### 5. 資源勾引魟註冊及輸入個人資料

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 5.1 | 資源勾引魟 | 首次登入並選擇「勾引魟」角色 | 使用者 (Create) | 角色選擇頁面 | - | - |
| 5.2 | 資源勾引魟 | 輸入營運或個人資訊 | 使用者 (Update) | 個人資料編輯表單 | - | - |
| 5.3 | 資源勾引魟 | 設定「資源回收指引列表」 | 使用者 (Update) | 資源類別選單 (材質+產品)、前置處理建議編輯器 | - | - |

### 6. 系統管理者維護可回收資源主檔 (System Admin Maintenance)

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 6.1 | 系統管理者 | 登入管理後台並檢視主檔列表 | 可回收資源 (Read) | 管理員主頁、主檔列表頁 | - | - |
| 6.2 | 系統管理者 | 新增可回收資源類別 (Create) | 可回收資源 (Create) | CRUD 編輯介面 | - | - |
| 6.3 | 系統管理者 | 更新現有的資源定義 (Update) | 可回收資源 (Update) | CRUD 編輯介面 | - | - |
| 6.4 | 系統管理者 | 刪除過時或錯誤的資源定義 (Delete) | 可回收資源 (Delete) | 列表操作按鈕、確認彈框 | - | - |

### 7. 資源梅克魚登入後的補全檢查 (Profile Completion for Maker Fish)

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 7.1 | 資源梅克魚 | 登入 APP | 使用者 (Read) | 登入頁面 | - | - |
| 7.2 | 資源梅克魚 | 系統檢查必要欄位 (如：地址、聯絡電話) 是否缺失 | 使用者 (Read) | - | - | - |
| 7.3 | 資源梅克魚 | 若缺失則導向補全頁面 | 使用者 (Update) | 個人資料補全表單 | - | - |
| 7.4 | 資源梅克魚 | 填寫完成後進入資源梅克魚主頁 | 使用者 (Update) | 梅克魚主頁 | - | - |

### 8. 資源勾引魟登入後的補全檢查 (Profile Completion for Going Home)

| 序列號 | 使用者角色 | 步驟描述 | 資料實體 (CRUD) | 需要哪些 UI 元件 | AI 請求簡述 | AI 回傳資料簡述 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 8.1 | 資源勾引魟 | 登入 APP | 使用者 (Read) | 登入頁面 | - | - |
| 8.2 | 資源勾引魟 | 系統檢查必要欄位 (如：聯絡電話、服務類別指引) 是否缺失 | 使用者 (Read) | - | - | - |
| 8.3 | 資源勾引魟 | 若缺失則導向補全頁面 | 使用者 (Update) | 個人資料補全表單 | - | - |
| 8.4 | 資源勾引魟 | 填寫完成後進入資源勾引魟主頁 | 使用者 (Update) | 勾引魟主頁 | - | - |

## 回收記錄如何尋找勾引魟

當回收記錄處於「剛出生 (`JUST_BORN`)」且尚未選定勾引魟時，系統會在回收記錄的詳細頁面中，尋找並推薦符合以下篩選條件的「資源勾引魟（資源收集者）」列表：

1. **角色相符 (Role Filter)**:
   - 候選使用者的帳號角色列表（`roles`）中必須包含 `'GOING_HOME'`（資源勾引魟）。

2. **地理距離過濾 (Geographic Filter)**:
   - 若回收記錄本身具有座標（`rec.coordinates`），且候選勾引魟在個人資料中也設定了座標（`ray.coordinates`），系統會使用半徑篩選演算法計算兩者的直線距離。
   - 篩選標準：兩者之間的直線距離必須**小於或等於 10 公里**（使用 `geofire-common` 的 `distanceBetween` 計算距離，判斷 `distKm <= 10`）。
   - 保底機制：若回收記錄或候選勾引魟兩者之中有任一方未提供座標資訊，則默認包含在列表中，不因缺少座標而被過濾掉。

3. **回收分類相容過濾（RecoveryGuides Filter）**:
   - 回收記錄本身的分類（材質分類materialCategory＋產品分類productCategory）必須存在（in array）候選勾引魟的回收指引表recoveryGuides中。表示該名候選勾引魟願意收取此分類的可回收資源。
   - 以下面的資料為例：
     - 回收記錄：
       - 材質分類materialCategory = "有機物"
       - 產品分類productCategory = "廚餘"
     - 候選勾引魟A：
       - 回收指引表recoveryGuides（array）
         - 回收指引01
          - 材質分類materialCategory = "塑膠"
          - 產品分類productCategory = "寶特瓶"
         - 回收指引02
          - 材質分類materialCategory = "有機物"
          - 產品分類productCategory = "廚餘"
     - 候選勾引魟B：
       - 回收指引表recoveryGuides（array）
         - 回收指引01
          - 材質分類materialCategory = "塑膠"
          - 產品分類productCategory = "塑膠袋"
         - 回收指引02
          - 材質分類materialCategory = "金屬"
          - 產品分類productCategory = "鐵鋁罐"
     - 候選勾引魟C：
       - 回收指引表recoveryGuides（array）
         - 回收指引01
          - 材質分類materialCategory = "塑膠"
          - 產品分類productCategory = "牛奶瓶"
         - 回收指引02
          - 材質分類materialCategory = "有機物"
          - 產品分類productCategory = "樹枝"
      
     這個資料案例中，只有候選勾引魟A符合篩選條件，因為候選勾引魟A有收取「有機物」＋「廚餘」，候選勾引魟C雖然有收取「有機物」但是產品分類是「樹枝」所以候選勾引魟C不符合篩選條件。
    - **實作建議與系統架構評估（決定併行共存方案）**：
      - **架構決策**：最終採用**前端陣列過濾（Solution A）**進行實作，並保留 Firestore 的簡單結構，不特別建立反向關聯表 `goingHomeUsers`。
      - **運作模式**：
        1. 🔍 **第一步（高效資料庫過濾）**：查詢在 Firestore 中狀態為啟用且含有 `'GOING_HOME'` 角色的使用者集合。
        2. 💻 **第二步（前端毫秒級高精準比對）**：將取得之勾引魟資訊，在前端透過 JavaScript / TypeScript 的原生高效率陣列函數（如 `some`, `filter`）進行 `recoveryGuides` 熱資料與地理距離比對。
      - **為何不採用多對多反向關聯表（`goingHomeUsers`）原因**：
        1. **極佳的前端效能**：在實際回收情境下，周圍預估 10 公里與具備 `'GOING_HOME'` 角色的使用者數量（可能在數十到數百人內），在此數量級下，前端本地過濾通常不超過 1 毫秒（`O(1)` 至 `O(N)` 微秒級計算），完全不需要耗費額外網絡 RTT 來查詢多個 collection 同時 join。
        2. **避免分散式寫入同步困難**：當勾引魟使用者修改自選的 recoveryGuides 回收指引時，若採用反向關聯，系統就必須去逐一更新 `Recyclable Resource` 集合中對應分類的 `goingHomeUsers` ID 陣列。這會引起龐大的二次寫入，且在沒有 Cloud Functions 等後端 trigger 協調下，單純由 Web 用戶端操作容易因權限或遺漏而造成資料不自動同步，產生資料同步地獄（Sync Hell）。
        3. **維護與架構最簡（KISS 原則）**：保持 Single-Source of Truth（只存於使用者自身的專屬文件裡），能獲得極佳的強一致性、更乾淨的 Firestore 安全規則 (rules)，且便於進行欄位維護。
      


      