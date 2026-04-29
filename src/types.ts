export type City = string;

export interface UserProfile {
  uid: string;
  city: City;
  createdAt: Date;
  totalWasteCount: number;
}

export interface WasteLog {
  id?: string;
  userId: string | null;
  city: City;
  category: string;
  quantity: number;
  suggestion: string;
  imageUrl?: string;
  createdAt: Date;
}

export interface RecognitionResult {
  category: string;
  quantity: number;
  suggestion: string;
  confidence: number;
}
