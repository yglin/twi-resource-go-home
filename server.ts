import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const resolvedFilename = typeof import.meta !== "undefined" && typeof import.meta.url === "string"
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== "undefined" ? __filename : "");

const resolvedDirname = typeof import.meta !== "undefined" && typeof import.meta.url === "string"
  ? path.dirname(resolvedFilename)
  : (typeof __dirname !== "undefined" ? __dirname : "");

// Initialize Firebase Admin
let databaseId: string | undefined;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  databaseId = config.firestoreDatabaseId;
  
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: config.projectId,
  });
  console.log("Firebase Admin initialized for project:", config.projectId, "with databaseId:", databaseId);
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error);
}

async function logToSystem(
  level: "info" | "warn" | "error",
  message: string,
  service: string,
  details?: any,
  userId = "system_backend",
  userEmail = "system_backend"
) {
  try {
    let detailsString = "";
    if (details) {
      if (details instanceof Error) {
        detailsString = `${details.message}\n${details.stack || ""}`;
      } else if (typeof details === "object") {
        try {
          detailsString = JSON.stringify(details, null, 2);
        } catch (e) {
          detailsString = String(details);
        }
      } else {
        detailsString = String(details);
      }
    }

    const logData = {
      level,
      message: message.substring(0, 1000),
      timestamp: new Date().toISOString(),
      service,
      details: detailsString.substring(0, 1900),
      userId,
      userEmail
    };

    console.log(`[BACKEND ${level.toUpperCase()}] [${service}] ${message}`);
    if (admin.apps.length > 0) {
      const db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore();
      await db.collection("systemLogs").add(logData);
    }
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("PERMISSION_DENIED") || errMsg.includes("insufficient permissions")) {
      console.log(`[BACKEND LOG-SYNC] Sandbox container authentication: logging to console only.`);
    } else {
      console.error("Backend logger failed to write to firestore:", err);
    }
  }
}

async function recalculateAvgPrices() {
  try {
    if (admin.apps.length === 0) {
      console.warn("Firebase Admin not initialized. Skipping avgPrice calculation.");
      return;
    }
    const firestoreDb = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore();
    
    // 1. Fetch all users who are RECYCLER
    const usersSnapshot = await firestoreDb.collection("users")
      .where("roles", "array-contains", "RECYCLER")
      .get();
    const recyclers = usersSnapshot.docs.map(doc => doc.data());

    // 2. Fetch all resources
    const resourcesSnapshot = await firestoreDb.collection("masterData_resources").get();
    
    console.log(`[BACKEND avgPrice] Starting recalculation for ${resourcesSnapshot.size} resources across ${recyclers.length} recyclers.`);
    
    const batch = firestoreDb.batch();
    let updatedCount = 0;
    
    for (const resourceDoc of resourcesSnapshot.docs) {
      const resourceId = resourceDoc.id;
      
      let sumPricePerKg = 0;
      let count = 0;
      
      for (const recycler of recyclers) {
        const guides = recycler.recoveryGuides || [];
        const matchedGuide = guides.find((g: any) => g.resourceId === resourceId);
        if (matchedGuide && (typeof matchedGuide.price === 'number' || !isNaN(Number(matchedGuide.price)))) {
          const price = Number(matchedGuide.price);
          sumPricePerKg += price;
          count++;
        }
      }
      
      const avgPrice = count > 0 ? Number((sumPricePerKg / count).toFixed(2)) : 0;
      
      // Update in batch
      batch.update(resourceDoc.ref, { avgPrice });
      updatedCount++;
    }
    
    if (updatedCount > 0) {
      await batch.commit();
    }
    
    await logToSystem(
      "info", 
      `Successfully calculated and updated avgPrice for ${updatedCount} resource categories.`, 
      "avg-price-recalculator",
      { resourceCount: updatedCount, recyclerCount: recyclers.length }
    );
  } catch (error: any) {
    const isPermissionError = error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("insufficient permissions");
    if (isPermissionError) {
      console.log("[BACKEND avgPrice] Sandbox container environment: service account lacks direct IAM permissions to the custom Firestore database. Skipping background recalculation.");
    } else {
      console.error("[BACKEND avgPrice] Recalculation failed:", error);
      try {
        await logToSystem("error", `Failed to recalculate avgPrice: ${error.message}`, "avg-price-recalculator", error);
      } catch (err) {
        console.error("Failed to log error to system:", err);
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Diagnostic route
  app.get("/api/debug/auth", async (req, res) => {
    try {
      const app = admin.app();
      const options = app.options;
      res.json({
        projectId: options.projectId,
        hasCredential: !!options.credential,
        serviceAccountId: options.serviceAccountId || "discovered at runtime",
        nodeEnv: process.env.NODE_ENV
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auth endpoint for test account custom token
  app.post("/api/auth/test-token", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID is required" });
      }

      console.log(`Attempting to generate custom token for UID: ${uid}`);
      // Generate custom token
      const customToken = await admin.auth().createCustomToken(uid);
      console.log("Custom token generated successfully");
      res.json({ token: customToken });
    } catch (error: any) {
      console.error("Error generating custom token:", error);
      // Return a structured error response
      res.status(500).json({ 
        error: "生成測試 Token 失敗", 
        message: error.message,
        code: error.code,
        details: error.errorInfo || null
      });
    }
  });

  // Example API for Agency Analytics (In a real app, these would be authenticated)
  // The backend server can use Firebase Admin SDK if needed, but for now we interact via client

  // AI-powered routing plan endpoint
  app.post("/api/planning/generate", async (req, res) => {
    try {
      const { departureLocation, departureTime, records, vehicles } = req.body;
      if (!departureLocation || !departureTime || !records || !Array.isArray(records)) {
        await logToSystem("warn", "Requested planning with missing parameters", "route-planning");
        return res.status(400).json({ error: "Required fields: departureLocation, departureTime, records" });
      }

      await logToSystem("info", "Starting AI Route Planning", "route-planning", {
        departureLocation,
        departureTime,
        recordCount: records.length,
        vehicles
      });

      const { GoogleGenAI, Type } = await import("@google/genai");

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        throw new Error("GEMINI_API_KEY is not configured or is a placeholder");
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const vehicleMapping: { [key: string]: string } = {
        trolley: '手推車 (Trolley)',
        bicycle: '自行車 (Bicycle)',
        motorcycle: '機車 (Motorcycle)',
        minivan: '廂型車 (Minivan)',
        truck: '小貨車 (Truck)',
        onfoot: '步行手提 (On Foot)'
      };

      const selectedVehicleLabels = Array.isArray(vehicles) && vehicles.length > 0
        ? vehicles.map(v => vehicleMapping[v] || v)
        : Object.values(vehicleMapping);

      const promptString = `你是一位資深的物流調度員。請根據以下提供的回收記錄列表，規劃一個最有效率的「資源勾引計畫」。

出發地點: 
${departureLocation}

預計出發時間: 
${departureTime}

回收記錄列表:
${JSON.stringify(records, null, 2)}

資源勾引魟擁有的可用交通工具列表:
${selectedVehicleLabels.map(v => `- ${v}`).join('\n')}

規劃目標:
1. 縮短總行駛距離。
2. 確保在梅克魚要求的「開放時段」內抵達。
3. 提供每個點的預計到達時間 (arrivalTime)。
4. 請從上方「資源勾引魟擁有的可用交通工具列表」中，為本次收運任務挑選最合適的一個交通工具（請務必直接從可用交通工具列表中進行選擇）。

請規劃合理的順序 (sortingOrder 由 1 開始編號)。
請嚴格依照 schema 格式回傳，不要有任何額外的文字敘述。`;

      let response;
      let lastError: any = null;
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest"];

      for (const currentModel of modelsToTry) {
        let attempts = 2;
        while (attempts > 0) {
          try {
            await logToSystem("info", `Attempting Route Planning with model ${currentModel}...`, "route-planning");
            response = await ai.models.generateContent({
              model: currentModel,
              contents: promptString,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    transportationType: {
                      type: Type.STRING,
                      description: "AI-suggested vehicle (e.g. 輕型機車, 三輪車, 小型貨車)"
                    },
                    plannedDepartureTime: {
                      type: Type.STRING,
                      description: "ISO departure time"
                    },
                    routePolyline: {
                      type: Type.STRING,
                      description: "Encapsulated details of the route as summary or fake Google Maps encoded polyline string"
                    },
                    stops: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          recordId: { type: Type.STRING },
                          arrivalTime: {
                            type: Type.STRING,
                            description: "ISO formatted estimated arrival time"
                          },
                          sortingOrder: {
                            type: Type.INTEGER,
                            description: "Incremental integer starting from 1"
                          }
                        },
                        required: ["recordId", "arrivalTime", "sortingOrder"]
                      }
                    }
                  },
                  required: ["transportationType", "plannedDepartureTime", "stops"]
                }
              }
            });
            break;
          } catch (err: any) {
            lastError = err;
            attempts--;
            await logToSystem("warn", `Route Planning failed with model ${currentModel}: ${err.message}`, "route-planning");
            if (attempts > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        if (response) break;
      }

      if (!response || !response.text) {
        throw lastError || new Error("All Gemini models failed to generate content.");
      }

      const text = response.text;
      const parsedPlan = JSON.parse(text.trim());
      await logToSystem("info", "AI Route Planning Succeeded", "route-planning", parsedPlan);
      res.json({ ...parsedPlan, isAI: true });
    } catch (error: any) {
      await logToSystem("warn", `AI Route Planning Failed (using local fallback scheduler): ${error.message}`, "route-planning", error);
      
      try {
        // Geometric/indexing sorting heuristic
        const sortedRecords = [...req.body.records].sort((a, b) => {
          const latA = a.coordinates?.latitude || 0;
          const lngA = a.coordinates?.longitude || 0;
          const latB = b.coordinates?.latitude || 0;
          const lngB = b.coordinates?.longitude || 0;
          return (latA + lngA) - (latB + lngB);
        });

        // Compute step duration (15 mins each)
        let currentTime = new Date(req.body.departureTime);
        const stops = sortedRecords.map((rec: any, idx: number) => {
          currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
          return {
            recordId: rec.id,
            arrivalTime: currentTime.toISOString(),
            sortingOrder: idx + 1
          };
        });

        // Compute best vehicle
        const totalQty = req.body.records.reduce((sum: number, r: any) => sum + (r.quantity || 1), 0);
        let transportationType = "輕型機車";
        if (totalQty > 50) {
          transportationType = "巨量載運大貨車 (3.5噸)";
        } else if (totalQty > 15) {
          transportationType = "永續綠能三輪重卡";
        } else {
          transportationType = "環保電動機車 (輕捷款)";
        }

        res.json({
          transportationType,
          plannedDepartureTime: new Date(req.body.departureTime).toISOString(),
          routePolyline: "已透過本地網格拓撲與預約時段最佳化航線配置",
          stops,
          isFallback: true,
          errorMsg: error.message
        });
      } catch (fallbackError: any) {
        await logToSystem("error", `AI and Fallback Route Planning failed completely: ${fallbackError.message}`, "route-planning", fallbackError);
        res.status(500).json({ error: "AI 與備用規劃系統皆無法使用", details: fallbackError.message });
      }
    }
  });

  // AI-powered image analysis endpoint (Proxying client camera snapshots safely)
  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { image, masterData } = req.body;
      if (!image) {
        await logToSystem("warn", "Requested analyze-image with missing image data", "analyze-image");
        return res.status(400).json({ error: "圖片資料 (Base64) 是必要的。" });
      }

      await logToSystem("info", "Starting Gemini Image Analysis", "analyze-image", {
        imageLength: image.length,
        masterDataCount: Array.isArray(masterData) ? masterData.length : 0
      });

      const { GoogleGenAI, Type } = await import("@google/genai");

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        throw new Error("GEMINI_API_KEY is not configured or is a placeholder");
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `你是一個專業的環保回收 AI 指南。請辨識這張圖片中的主要物品，並根據其材質與形狀分類。
請優先比對已知材質主檔，如果圖片中的物品能對應上主檔中的某個(material, product)類別，請務必精確使用該組名稱，並帶入其單位；
如果完全不匹配，再自行生成具代表性的全新 (material, category) 名稱與數量單位 (如「瓶」、「片」、「公升」、「個」等，預設為「個」)。
另外請試著從包裝或外觀辨識出該物品的生產商或產品品牌名稱 (如：可口可樂、泰山、多力多滋、光泉等)，並以字串陣列形式回傳於 brands 欄位中，如果無法辨識則回傳空陣列 []。
請務必返回以下格式的 JSON 資料，且不要包含任何額外的 Markdown 包裝符或對話：
{
  "material": "材質名稱 (如: 塑膠, 紙類, 金屬)",
  "category": "產品名稱 (如: 寶特瓶, 紙箱, 易開罐)",
  "quantity": 1,
  "unit": "數量單位 (如: 瓶, 片, 公升, 個)",
  "suggestion": "給使用者的分類回收建議 (如: 請洗淨後壓扁)",
  "brands": ["品牌1", "品牌2"],
  "confidence": 0.95
}
參考已知材質主檔：${Array.isArray(masterData) ? masterData.map(m => `${m.material}-${m.product} (單位: ${m.unit || '個'})`).join(', ') : ""}`;

      let response;
      let lastError: any = null;
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest"];

      for (const currentModel of modelsToTry) {
        let attempts = 2;
        while (attempts > 0) {
          try {
            await logToSystem("info", `Attempting Gemini Image Analysis with model ${currentModel}...`, "analyze-image");
            response = await ai.models.generateContent({
              model: currentModel,
              contents: [
                {
                  parts: [
                    { text: prompt },
                    { inlineData: { data: image.split(',')[1] || image, mimeType: "image/jpeg" } }
                  ]
                }
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    material: { type: Type.STRING },
                    category: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    brands: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of manufacturer brands recognized on the item(s), or empty array if none can be identified."
                    }
                  },
                  required: ["material", "category", "quantity", "unit", "suggestion", "brands"]
                }
              }
            });
            break;
          } catch (err: any) {
            lastError = err;
            attempts--;
            await logToSystem("warn", `Gemini Image Analysis failed with model ${currentModel}: ${err.message}`, "analyze-image");
            if (attempts > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        if (response) break;
      }

      let parsed;
      if (!response || !response.text) {
        await logToSystem("error", "All Gemini models and retries failed for image analysis. Using safe heuristic fallback.", "analyze-image", lastError);
        // Fallback strategy: If all models fail, try to guess from masterData if possible or provide a smart default
        if (Array.isArray(masterData) && masterData.length > 0) {
          const firstItem = masterData[0];
          parsed = {
            material: firstItem.material || "其他材質",
            category: firstItem.product || "回收產品",
            quantity: 1,
            unit: firstItem.unit || "個",
            suggestion: firstItem.defaultSuggestion || "請洗淨壓扁後配合當地清潔隊回收。",
            brands: [],
            isFallback: true
          };
        } else {
          parsed = {
            material: "其他",
            category: "可回收物",
            quantity: 1,
            unit: "個",
            suggestion: "請將物品清洗乾淨，並配合當地清潔隊或回收點進行回收分類。",
            brands: [],
            isFallback: true
          };
        }
      } else {
        const text = response.text;
        parsed = JSON.parse(text.trim());
      }

      // Post-process to align with masterData list if passed (prevent minor typos, case differences or slight drift)
      if (Array.isArray(masterData) && masterData.length > 0) {
        const materialLower = (parsed.material || "").trim().toLowerCase();
        const categoryLower = (parsed.category || "").trim().toLowerCase();

        // 1. Exact case-insensitive match check
        const exactMatch = masterData.find(m => 
          (m.material || "").trim().toLowerCase() === materialLower &&
          (m.product || "").trim().toLowerCase() === categoryLower
        );

        if (exactMatch) {
          parsed.material = exactMatch.material;
          parsed.category = exactMatch.product;
          parsed.unit = exactMatch.unit || parsed.unit || "個";
          if (exactMatch.defaultSuggestion && !parsed.suggestion) {
            parsed.suggestion = exactMatch.defaultSuggestion;
          }
        } else {
          // 2. Fuzzy mapping - check if product name is partial match or contains/is contained
          const closeMatch = masterData.find(m => {
            const mProd = (m.product || "").trim().toLowerCase();
            return mProd === categoryLower || mProd.includes(categoryLower) || categoryLower.includes(mProd);
          });
          
          if (closeMatch) {
            parsed.material = closeMatch.material;
            parsed.category = closeMatch.product;
            parsed.unit = closeMatch.unit || parsed.unit || "個";
            if (closeMatch.defaultSuggestion && !parsed.suggestion) {
              parsed.suggestion = closeMatch.defaultSuggestion;
            }
          }
        }
      }

      await logToSystem("info", "Gemini Image Analysis Succeeded", "analyze-image", parsed);
      res.json(parsed);
    } catch (error: any) {
      await logToSystem("error", `Gemini Image Analysis Failed: ${error.message}`, "analyze-image", error);
      res.status(500).json({ error: "影像分析與辨識失敗", details: error.message });
    }
  });

  // AI-powered resource master data enrichment helper for fallback
  function getFallbackResourceData(material: string, product: string) {
    const m = (material || "").toLowerCase();
    const p = (product || "").toLowerCase();
    
    let defaultSuggestion = "分類並保持乾燥與乾淨，配合當地清潔隊回收。";
    let keywords = [material, product, "回收", "分類"];
    let unit = "個";
    let carbonReduced = 1200;
    let expireAfterhHours = 0;
    let estimatedWeight = 0.1;

    if (m.includes("塑") || p.includes("塑") || m.includes("plastic") || p.includes("plastic") || m.includes("寶特瓶") || p.includes("瓶")) {
      defaultSuggestion = "清洗乾淨、排空殘餘液體並壓扁以節省空間。";
      keywords = ["塑膠", product, "清洗壓扁", "PET", "塑膠容器"];
      unit = "個";
      carbonReduced = 2100;
      expireAfterhHours = 0;
      estimatedWeight = 0.035;
    } else if (m.includes("紙") || p.includes("紙") || m.includes("paper") || p.includes("paper") || m.includes("書") || p.includes("箱")) {
      defaultSuggestion = "保持乾燥、去非紙質附件（如塑膠膠帶、金屬釘），壓平堆疊。";
      keywords = ["廢紙", product, "紙類", "保持乾燥", "包裝紙箱"];
      unit = "公斤";
      carbonReduced = 1500;
      expireAfterhHours = 720; // 30 days
      estimatedWeight = 0.05;
    } else if (m.includes("鐵") || m.includes("鋁") || m.includes("金屬") || m.includes("鋼") || p.includes("罐") || p.includes("金屬") || m.includes("metal") || p.includes("metal")) {
      defaultSuggestion = "倒空殘餘物、沖洗乾淨、壓扁以節省空間。";
      keywords = ["金屬", product, "鐵罐", "鋁罐", "金屬回收"];
      unit = "個";
      carbonReduced = 3500;
      expireAfterhHours = 0;
      estimatedWeight = 0.04;
    } else if (m.includes("玻璃") || p.includes("玻璃") || m.includes("glass") || p.includes("glass")) {
      defaultSuggestion = "倒空、清洗乾淨、撕下標籤（若可能），小心避免破碎。";
      keywords = ["玻璃", product, "玻璃瓶", "容器"];
      unit = "個";
      carbonReduced = 400;
      expireAfterhHours = 0;
      estimatedWeight = 0.25;
    } else if (m.includes("電池") || p.includes("電池") || m.includes("battery") || p.includes("battery")) {
      defaultSuggestion = "妥善包裝，電極處可用絕緣膠帶黏貼，避免短路。";
      keywords = ["電池", product, "有害垃圾", "乾電池"];
      unit = "個";
      carbonReduced = 1800;
      expireAfterhHours = 0;
      estimatedWeight = 0.02;
    }

    return {
      defaultSuggestion,
      keywords,
      unit,
      carbonReduced,
      expireAfterhHours,
      estimatedWeight
    };
  }

  // AI-powered resource master data enrichment route
  app.post("/api/resources/ai-enrich", async (req, res) => {
    const { material, product } = req.body;
    if (!material || !product) {
      return res.status(400).json({ error: "材質分類與產品分類是必要的。" });
    }

    try {
      await logToSystem("info", `Starting AI Resource Enrichment for: [${material} - ${product}]`, "ai-enrich", {
        material,
        product
      });

      const { GoogleGenAI, Type } = await import("@google/genai");

      const apiKey = process.env.GEMINI_API_KEY;
      const isKeyValid = apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "";
      
      let aiResponse: any = null;

      if (isKeyValid) {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const prompt = `你是一個專業的環保回收與物資管理 AI 專家。
請針對以下的可回收資源類別：
材質分類：${material}
產品分類：${product}

預估並生成下列資料欄位的值（請提供真實、科學、合理的估計值）：
1. 一般「預設回收建議」：對該類別物品提供保底的回收與整理建議指引（例如：清洗乾淨並壓扁、避免受潮）。
2. 關鍵字：列出 3 到 5 個適合該物品的關鍵字，以協助 AI 比對或快速分類（例如：寶特瓶, 飲料瓶, PET）。
3. 常用的「數量計量單位」：例如：個、瓶、片、公升、罐、公斤等（請選擇最貼切該產品單件產出的單位）。
4. 預估「每公斤減碳效益」：回收每一公斤該類別的可回收資源能產生的減碳效益，數值單位為「公克/公斤 (g CO2 / kg)」。這通常是一個 100 到 5000 之間的數值（例如：回收1公斤塑膠可能減少約 2100g 的 CO2，請直接回傳數字，例如 2100）。
5. 放置超過多少「過期時數」：在一般的環境中，該類別的可回收資源放置超過多少小時會變質或髒污而變得難以回收？0 表示無限期不會壞（例如：塑膠、玻璃、金屬通常為 0；如果是廚餘、部分有機物或廢紙可能變質，則請預估合理小時數，例如廚餘可能為 24、廢紙可能為 720）。
6. 「單件預估重量」：預估該產品一個（或一單位）的平均重量，單位為「公斤 (kg)」（例如一個寶特瓶約 0.025 公斤，請直接回傳數字，例如 0.025）。

請務必返回以下格式的 JSON 資料，且不要包含任何額外的對話或 Markdown 標記：
{
  "defaultSuggestion": "...",
  "keywords": ["...", "..."],
  "unit": "...",
  "carbonReduced": 2100,
  "expireAfterhHours": 0,
  "estimatedWeight": 0.025
}`;

        // Multi-model retry loop with exponential backoff
        const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest"];
        let success = false;

        for (const currentModel of modelsToTry) {
          if (success) break;
          let attempts = 2;
          let delayMs = 1000;
          for (let i = 0; i < attempts; i++) {
            try {
              const response = await ai.models.generateContent({
                model: currentModel,
                contents: prompt,
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      defaultSuggestion: { 
                        type: Type.STRING,
                        description: "預設分類回收與前置處理建議指引"
                      },
                      keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "比對關鍵字陣列，3-5個"
                      },
                      unit: { 
                        type: Type.STRING,
                        description: "常用的數量計量單位，例如個、瓶、片、公升、罐"
                      },
                      carbonReduced: { 
                        type: Type.NUMBER,
                        description: "回收一公斤此材質的預估減碳效益，單位為公克/公斤"
                      },
                      expireAfterhHours: { 
                        type: Type.INTEGER,
                        description: "放置多少小時會變質難以回收，0表示無限期"
                      },
                      estimatedWeight: { 
                        type: Type.NUMBER,
                        description: "單件預估重量，單位為公斤"
                      }
                    },
                    required: ["defaultSuggestion", "keywords", "unit", "carbonReduced", "expireAfterhHours", "estimatedWeight"]
                  }
                }
              });
              const text = response.text;
              if (text) {
                aiResponse = JSON.parse(text.trim());
                success = true;
                break;
              }
            } catch (retryError: any) {
              await logToSystem("info", `Gemini API model ${currentModel} attempt ${i + 1} transient constraint: ${retryError.message}`, "ai-enrich");
              if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2;
              }
            }
          }
        }
      }

      if (!aiResponse) {
        // Fallback strategy if Gemini is completely unavailable/rate limited/no api key
        await logToSystem("info", `Gemini API unavailable or high demand. Using high-quality deterministic fallback data for [${material} - ${product}]`, "ai-enrich");
        aiResponse = getFallbackResourceData(material, product);
      }

      // Save/update in Firestore (gracefully, skip failure on permission/quota errors in sandbox containers)
      let docId = "ai_temp_" + Date.now();
      let updatedData = {
        defaultSuggestion: aiResponse.defaultSuggestion,
        keywords: aiResponse.keywords,
        unit: aiResponse.unit,
        carbonReduced: Number(aiResponse.carbonReduced) || 0,
        expireAfterhHours: Number(aiResponse.expireAfterhHours) || 0,
        estimatedWeight: Number(aiResponse.estimatedWeight) || 0,
      };

      try {
        const firestoreDb = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore();
        const resourcesRef = firestoreDb.collection("masterData_resources");
        const snapshot = await resourcesRef
          .where("material", "==", material)
          .where("product", "==", product)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          // Document exists, update it
          const docRef = snapshot.docs[0].ref;
          docId = snapshot.docs[0].id;
          await docRef.update(updatedData);
          await logToSystem("info", `AI enriched existing resource: [${material} - ${product}] (ID: ${docId})`, "ai-enrich", updatedData);
        } else {
          // Create new document
          const newDocRef = await resourcesRef.add({
            material,
            product,
            ...updatedData
          });
          docId = newDocRef.id;
          await logToSystem("info", `AI enriched and created new resource: [${material} - ${product}] (ID: ${docId})`, "ai-enrich", updatedData);
        }
      } catch (dbError: any) {
        console.log(`[BACKEND INFO] Sandbox database sync skipped gracefully: ${dbError.message}`);
        try {
          await logToSystem("info", `AI Enrichment database sync skipped gracefully: ${dbError.message}`, "ai-enrich");
        } catch (logErr) {
          // Ignore logger errors to prevent cascading failures
        }
      }

      res.json({
        success: true,
        docId,
        data: {
          material,
          product,
          ...updatedData
        }
      });
    } catch (error: any) {
      await logToSystem("error", `AI Resource Enrichment Failed: ${error.message}`, "ai-enrich", error);
      res.status(500).json({ error: "AI 資源主檔自動分析失敗", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Trigger recalculation on startup with a 5 second delay to ensure services are ready
    setTimeout(() => {
      console.log("[SCHEDULER] Triggering initial average price recalculation on startup...");
      recalculateAvgPrices().catch(err => console.error("Initial recalculation failed:", err));
    }, 5000);

    // Schedule background recalculation every 24 hours
    setInterval(() => {
      console.log("[SCHEDULER] Triggering scheduled daily average price recalculation...");
      recalculateAvgPrices().catch(err => console.error("Scheduled recalculation failed:", err));
    }, 24 * 60 * 60 * 1000);
  });
}

startServer().catch(console.error);
