# 資源勾引魟 (ResourceGoingHome) - 已實作資料實體文件 (DATA_ENTITIES.md)

本文件完整記錄「資源勾引魟」Web 應用程式目前於前端 TypeScript（`src/types.ts`）以及 Firebase Firestore 後端所定義並實作的資料實體與集合結構。

---

## 集合與實體總覽 (Collections & Entities Overview)

應用程式主要部署於 Firebase 提供持久化儲存，具體資料實體與 Firestore 集合 (Collection) 的映射關係如下：

| 實體名稱 (TypeScript) | Firestore 集合名稱 | 說明 |
| :--- | :--- | :--- |
| **`UserProfile`** | `users` | 儲存登入使用者的個人配置資訊（包含梅克魚與勾引魟雙重角色支援）。 |
| **`RecoveryRecord`** | `recoveryRecords` | 儲存梅克魚上傳、AI 辨識出的回收物資記錄與其被分配收運的歷程狀態。 |
| **`GoingHomePlan`** | `goingHomePlans` | 儲存由勾引魟選定多筆記錄後由 AI/演算法生成、核准並執行的收運據點路線計畫。 |
| **`AppNotification`** | `notifications` | 系統、計畫核准確認與無法收取退載等事件的即時推播通知訊息。 |
| **`MasterDataResource`** | `masterData_resources` | 系統公用或動態新增的可回收資源材質產品分類指引資料。|

---

## 1. 使用者檔案 (User Profile)

* **Firestore 集合：** `users`
* **主鍵：** `id` (同 Firebase Auth UID)
* **TypeScript 定義：** `UserProfile`

### 欄位與結構 (Schema Field Details)

| 欄位名稱 (Field) | 資料類型 (Type) | 必填 | 預設值 | 中文標題與描述 |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `string` | 是 | - | **唯一識別碼** (Firebase Auth UID) |
| `displayName` | `string` | 是 | - | **顯示名稱 / 品牌名稱** (自動從 Google Auth 提取或由使用者自行微調) |
| `photoURL` | `string` | 否 | - | **頭像 URL** (Google 帳戶頭像連結或預設頭像) |
| `email` | `string` | 是 | - | **電子郵件信箱** (Auth 註冊信箱) |
| `phoneNumber` | `string` | 否 | - | **聯絡電話** (收運當日供魟魚臨時緊急聯絡使用) |
| `roles` | `UserRole[]` | 是 | `[]` | **帳號角色陣列**：`'MAKER_FISH'` (梅克魚), `'GOING_HOME'` (勾引魟), `'SYSTEM_ADMIN'` (管理員)。使用者可多選，並在工作區自由切換。 |
| `address` | `string` | 否 | - | **通訊地址** (梅克魚的物資交付地址 / 勾引魟的調配或出發據點) |
| `coordinates` | `GeoPoint` | 否 | - | **地圖座標** (Firestore 原生 `GeoPoint` 物件，供半徑 10 公里地理搜尋) |
| `geohash` | `string` | 否 | - | **Geohash 雜湊值** (用以快速進行資料庫端地理圍欄邊界查詢) |
| `timeWindow` | `Record<string, string>`| 否 | `{}` | **可用/交付時段配備** |
| `recycleNotes` | `string` | 否 | - | **回收通案備註** (梅克魚對放置地點的長期通案聲明，或魟魚指引摘要) |
| `acceptedCategories` | `string[]` | 否 | `[]` | **勾引魟已選定收取類別** (關聯之 `masterData_resources` ID 陣列) |
| `recoveryGuides` | `RecoveryGuide[]` | 否 | `[]` | **勾引魟專屬回收處理指引** (包含各收取產品的特定整理期望，詳解見下方) |
| `availabilitySlots` | `AvailabilitySlot[]` | 否 | `[]` | **梅克魚開放上門收運時段** (多時段彈性排程，詳解見下方) |

---

### 子嵌套結構 (Nested Schemas within UserProfile)

#### 1A. 專屬回收處理指引 (`RecoveryGuide`)
供登入為資源勾引魟之使用者針對特定收取項目設定其個別期待的前置處理規則：
```typescript
interface RecoveryGuide {
  resourceId: string;    // 關聯 MasterDataResource 的唯一識別碼
  material: string;      // 材質分類 (如: 塑膠)
  product: string;       // 產品名稱 (如: 寶特瓶)
  instructions: string;  // 專屬整理指示 (如: 請先將蓋子撕下、清洗後壓扁)
}
```

#### 1B. 開放上門收取時段 (`AvailabilitySlot`)
供資源梅克魚客製化多段開放排程，利於收運航線調配：
```typescript
interface AvailabilitySlot {
  dayOfWeek: number;     // 星期幾 (0 指週日，1-6 指週一至週六)
  startTime: string;     // 開始時段格式縮寫 (例如 "09:00")
  endTime: string;       // 結束時段格式縮寫 (例如 "18:00")
}
```

---

## 2. 回收記錄 (Recovery Record)

* **Firestore 集合：** `recoveryRecords`
* **主鍵：** `id` (自動生成的 Document ID)
* **TypeScript 定義：** `RecoveryRecord`

### 欄位與結構 (Schema Field Details)

| 欄位名稱 (Field) | 資料類型 (Type) | 必填 | 預設值 | 中文標題與描述 |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `string` | 是 | - | **記錄 ID** (自動 generated) |
| `makerFishId` | `string` | 是 | - | **建立者 (梅克魚) ID** (關聯 `users.id`) |
| `materialCategory` | `string` | 是 | - | **主要材質分類** (EX: 塑膠、紙類、金屬、玻璃) |
| `productCategory` | `string` | 是 | - | **細項產品別** (EX: 寶特瓶、瓦楞紙箱、易開罐) |
| `quantity` | `number` | 是 | `1` | **辨識/調整後數量** (AI 估計並允許梅克魚手動增減) |
| `imageUrl` | `string` | 是 | - | **垃圾實物照** (上傳或 Base64 格式快照影像) |
| `aiSuggestion` | `string` | 是 | - | **AI 產出之分類和前置處理建議** (供梅克魚參考) |
| `address` | `string` | 是 | - | **特定交付實體地址** (複寫自 UserProfile、支持單次微調) |
| `coordinates` | `GeoPoint` | 是 | - | **物資放置地 GeoPoint 座標** (供半徑過濾與 AI 自主路徑拓撲演算用) |
| `geohash` | `string` | 否 | - | **地理 Geohash 標記** |
| `recycleNotes` | `string` | 否 | - | **本筆回收備註** (梅克魚填寫之特殊放置地點或配合提醒) |
| `status` | `RecordStatus` | 是 | `JUST_BORN` | **物資生命週期狀態**：詳細狀態機見下文。 |
| `candidateGoingHomeIds` | `string[]` | 否 | `[]` | **10公里與指引相容候選魟 ID 名單** |
| `selectedGoingHomeId` | `string` | 否 | - | **選定委託魟 ID** (指明特定勾引魟前來收取) |
| `timeWindow` | `Record<string, string>`| 否 | `{}` | **配合時段複製檔** |
| `createdAt` | `Timestamp` | 是 | `serverTimestamp()` | **上傳產出時間戳記** |
| `statusUpdatedAt` | `Timestamp` | 否 | - | **最後一次更新狀態之時間** |
| `unableToCollectReason` | `string` | 否 | - | **「無法收取」取消回報之具體理由紀錄** (由勾引魟回填，留存案底提供給梅克魚檢視) |

### 回收物資生命週期狀態 (`RecordStatus` Enum)
```typescript
export enum RecordStatus {
  JUST_BORN = 'JUST_BORN',                       // 剛出生 (待梅克魚前置處理並指定勾引魟)
  WAITING_FOR_COLLECTION = 'WAITING_FOR_COLLECTION', // 等待收取 (已指派委託魟，待進入其出載計畫)
  COLLECTION_CONFIRMED = 'COLLECTION_CONFIRMED',     // 計畫已確認 (魟魚已排入生效的 GoingHomePlan 計畫中)
  PICKED_UP = 'PICKED_UP',                       // 物資已上車載運 (魟魚抵達現場，按下實體上車按鈕)
  COMPLETED = 'COMPLETED'                        // 任務圓滿完成 (魟魚運抵最終處理站，按下完成收載)
}
```

---

## 3. 資源勾引計畫 (Going Home Plan)

* **Firestore 集合：** `goingHomePlans`
* **主鍵：** `id` (自動生成的 Document ID)
* **TypeScript 定義：** `GoingHomePlan`

### 欄位與結構 (Schema Field Details)

| 欄位名稱 (Field) | 資料類型 (Type) | 必填 | 預設值 | 中文標題與描述 |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `string` | 是 | - | **計畫 ID** |
| `goingHomeId` | `string` | 是 | - | **負責執行計畫之勾引魟 ID** (關聯 `users.id`) |
| `departureTime` | `Timestamp` | 是 | - | **計畫預定出發時間** |
| `transportationType` | `string` | 否 | - | **載運交通工具** (由 AI 模型依物資載量自適應推薦建議，EX: 環保電動機車、永續三輪重卡) |
| `stops` | `PlanStop[]` | 是 | `[]` | **排程順序停靠站清單** (包含到達順序及各站單一操作狀態，詳解見下) |
| `routePolyline` | `string` | 否 | - | **收運航線拓撲描述標註** (用作模擬地圖渲染描述) |
| `status` | `PlanStatus` | 是 | `DRAFT` | **收運計畫狀態**：`'DRAFT'` (審閱中草稿), `'APPROVED'` (核准啟動並運行中), `'COMPLETED'` (整趟計畫完成) |
| `createdAt` | `Timestamp` | 是 | `serverTimestamp()` | **計畫草稿生成時間** |

### 子結構 ── 停靠站節點 (`PlanStop`)
```typescript
interface PlanStop {
  recordId: string;                     // 關聯 recoveryRecords 的資源唯一識別碼
  arrivalTime: Timestamp;               // AI 調配規劃之預估到達時間
  status: 'PENDING' | 'ARRIVED' | 'SKIPPED'; // 站點現場執行狀態：待處理 / 已確認上車 / 異常跳過
  sortingOrder: number;                 // 物流排序順位編號 (由 1 開始遞增)
}
```

---

## 4. 系統通知 (App Notification)

* **Firestore 集合：** `notifications`
* **主鍵：** `id` | (自動生成的 Document ID)
* **TypeScript 定義：** `AppNotification`

### 欄位與結構 (Schema Field Details)

| 欄位名稱 (Field) | 資料類型 (Type) | 必填 | 預設值 | 中文標題與描述 |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `string` | 是 | - | **通知唯一 ID** |
| `receiverId` | `string` | 是 | - | **接收者 User ID** (關聯 `users.id`) |
| `type` | `NotificationType` | 是 | - | **通知類型**：`SYSTEM` (一般、物資上車與送達), `PLAN_CONFIRMED` (排入計畫), `COLLECTION_COMPLETED` (綠色任務慶祝), `NEW_RECORD_REMINDER` (新物資提醒) |
| `title` | `string` | 是 | - | **通知簡介標題** (EX: 【已確認收運】、【物資已上車】等) |
| `content` | `string` | 是 | - | **通知詳細本文內容** (包含具體地址、時間、前置處理叮嚀等說明) |
| `recordId` | `string` | 否 | - | (選填) **關聯之回收記錄 ID** |
| `planId` | `string` | 否 | - | (選填) **關聯之收運計畫 ID** |
| `isRead` | `boolean` | 是 | `false`| **是否已讀標記** |
| `createdAt` | `Timestamp` | 是 | - | **發送時間戳記** |

---

## 5. 可回收資源主檔 (Master Recyclable Resource)

* **Firestore 集合：** `masterData_resources`
* **主鍵：** `id` (自動生成的 Document ID)
* **TypeScript 定義：** `MasterDataResource`

### 欄位與結構 (Schema Field Details)

| 欄位名稱 (Field) | 資料類型 (Type) | 必填 | 預設值 | 中文標題與描述 |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `string` | 是 | - | **資源類別 ID** |
| `material` | `string` | 是 | - | **大類材質名稱** (EX: 塑膠, 紙類, 金屬, 玻璃) |
| `product` | `string` | 是 | - | **細項產品名稱** (EX: 寶特瓶, 飲料杯, 瓦楞紙快遞箱, 鋁製易開罐) |
| `defaultSuggestion` | `string` | 是 | - | **通用基礎前置處理指引** (AI 辨識無法辨認特定魟魚指引時之保底預填建議規則) |
| `icon` | `string` | 否 | - | **UI 圖標字串** (與 Lucide 圖標動態映射) |
| `keywords` | `string[]` | 否 | `[]` | **比對關鍵字陣列** (用以協助 Gemini 影像辨識快速分類比對相似近義詞) |

*註：當資源梅克魚利用 AI 相機辨識出新分類，而該分類在目前主檔中不存在時，應用系統將自動學習並在 `masterData_resources` 中建立新的一筆防呆通用主檔。*

---
*(End of DATA_ENTITIES.md)*
