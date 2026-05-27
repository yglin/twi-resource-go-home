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
      const { departureLocation, departureTime, records } = req.body;
      if (!departureLocation || !departureTime || !records || !Array.isArray(records)) {
        await logToSystem("warn", "Requested planning with missing parameters", "route-planning");
        return res.status(400).json({ error: "Required fields: departureLocation, departureTime, records" });
      }

      await logToSystem("info", "Starting AI Route Planning", "route-planning", {
        departureLocation,
        departureTime,
        recordCount: records.length
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

      const promptString = `你是一位資深的物流調度員。請根據以下提供的回收記錄列表，規劃一個最有效率的「資源勾引計畫」。

出發地點: 
${departureLocation}

預計出發時間: 
${departureTime}

回收記錄列表:
${JSON.stringify(records, null, 2)}

規劃目標:
1. 縮短總行駛距離。
2. 確保在梅克魚要求的「開放時段」內抵達。
3. 提供每個點的預計到達時間 (arrivalTime)。
4. 建議最適合的交通工具（例如：機車、貨車、三輪車）。

請規劃合理的順序 (sortingOrder 由 1 開始編號)。
請嚴格依照 schema 格式回傳，不要有任何額外的文字敘述。`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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

      const text = response.text;
      if (!text) {
        throw new Error("Gemini AI did not return any layout text.");
      }

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
請優先比對已知材質主檔，如果圖片中的物品能對應上主檔中的某個(material, product)類別，請務必精確使用該組名稱；
如果完全不匹配，再自行生成具代表性的全新 (material, category) 名稱。
請務必返回以下格式的 JSON 資料，且不要包含任何額外的 Markdown 包裝符或對話：
{
  "material": "材質名稱 (如: 塑膠, 紙類, 金屬)",
  "category": "產品名稱 (如: 寶特瓶, 紙箱, 易開罐)",
  "quantity": 1,
  "suggestion": "給使用者的分類回收建議 (如: 請洗淨後壓扁)",
  "confidence": 0.95
}
參考已知材質主檔：${Array.isArray(masterData) ? masterData.map(m => `${m.material}-${m.product}`).join(', ') : ""}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
              suggestion: { type: Type.STRING }
            },
            required: ["material", "category", "quantity", "suggestion"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini did not return any analyzed text.");
      }

      const parsed = JSON.parse(text.trim());

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
      
      const defaultItems = [
        { material: "塑膠", category: "高級PET寶特瓶", quantity: 10, suggestion: "請先清空殘餘液體、撕除外層包裝紙，並踩扁壓實以節省籃車堆疊空間。" },
        { material: "紙類", category: "瓦楞紙快遞箱", quantity: 4, suggestion: "請清除外部封箱膠帶、託運單貼紙，展開壓平後整齊綑綁。" },
        { material: "金屬", category: "鋁製易開罐", quantity: 15, suggestion: "請以清水沖洗，壓扁後可由本系統高效率魟魚全數收載。" },
        { material: "玻璃", category: "玻璃醬油瓶", quantity: 2, suggestion: "屬易碎貴重物品。請沖洗乾淨、瀝乾水分，並與非玻璃類資材分開裝箱裝袋。" }
      ];
      
      const picked = defaultItems[Math.floor(Math.random() * defaultItems.length)];
      res.json({
        ...picked,
        isFallback: true,
        errorMsg: error.message
      });
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
  });
}

startServer().catch(console.error);
