import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function recognizeWaste(base64Image: string, city?: string): Promise<RecognitionResult> {
  const model = "gemini-1.5-flash"; // Using flash for speed and cost effectiveness
  
  const cityContext = city ? `根據使用者所在地 (${city}) 提供具體的回收建議 (包含該城市常見的回收規定)` : `提供台灣通用的回收建議`;
  
  const prompt = `你是一個專業的環保回收 AI 助手。請分析這張圖片中的垃圾。
  1. 辨識垃圾的種類 (例如: 寶特瓶, 鋁罐, 紙箱, 一般垃圾等)。
  2. 辨識垃圾的數量。
  3. ${cityContext}。
  請以 JSON 格式回傳。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: "垃圾種類" },
          quantity: { type: Type.NUMBER, description: "數量" },
          suggestion: { type: Type.STRING, description: "回收建議" },
          confidence: { type: Type.NUMBER, description: "信心指數 (0-1)" }
        },
        required: ["category", "quantity", "suggestion", "confidence"]
      }
    }
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse Gemini response:", response.text);
    throw new Error("無法解析 AI 回傳結果");
  }
}
