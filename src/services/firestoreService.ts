import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp,
  GeoPoint,
  DocumentReference,
  Query,
  addDoc,
  arrayUnion
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Generic CRUD helpers with error handling
export async function getDocument<T>(path: string, id: string): Promise<T | null> {
  try {
    const docRef = doc(db, path, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
    return null;
  }
}

export async function createDocument<T extends object>(path: string, data: T, id?: string): Promise<string> {
  try {
    if (id) {
      await setDoc(doc(db, path, id), data);
      return id;
    } else {
      const docRef = await addDoc(collection(db, path), data);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return '';
  }
}

export async function updateDocument<T extends object>(path: string, id: string, data: Partial<T>): Promise<void> {
  try {
    const docRef = doc(db, path, id);
    await updateDoc(docRef, data as any);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
  }
}

export async function listDocuments<T>(path: string, constraints: any[] = []): Promise<T[]> {
  try {
    const q = query(collection(db, path), ...constraints);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToQuery<T>(
  q: Query, 
  onNext: (data: T[]) => void, 
  onError: (error: any) => void
) {
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    onNext(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, null);
    onError(error);
  });
}

// Client-side helper to trigger the backend AI Enrichment function
export async function enrichResourceWithAI(material: string, product: string): Promise<{
  success: boolean;
  docId: string;
  data: {
    material: string;
    product: string;
    defaultSuggestion: string;
    keywords: string[];
    unit: string;
    carbonReduced: number;
    expireAfterhHours: number;
    estimatedWeight: number;
  };
}> {
  try {
    const response = await fetch('/api/resources/ai-enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ material, product }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || errData.details || '自動分析與補充欄位失敗');
    }

    return await response.json();
  } catch (error: any) {
    console.error('enrichResourceWithAI failed:', error);
    throw error;
  }
}

export async function associateBrandsWithRecord(recordId: string, brands: string[] | undefined): Promise<void> {
  if (!brands || brands.length === 0) return;
  try {
    for (const brand of brands) {
      const trimmedBrand = brand.trim();
      if (!trimmedBrand) continue;
      const brandRef = doc(db, 'brand', trimmedBrand);
      await setDoc(brandRef, {
        recoveryRecords: arrayUnion(recordId)
      }, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `brand/${brands.join(',')}`);
  }
}
