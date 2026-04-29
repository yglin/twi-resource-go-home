import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { WasteLog, UserProfile } from '../types';

enum OperationType {
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
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const dbService = {
  async createUser(uid: string, city: string) {
    const path = `users/${uid}`;
    try {
      await setDoc(doc(db, "users", uid), {
        city,
        createdAt: serverTimestamp(),
        totalWasteCount: 0
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async getUser(uid: string): Promise<UserProfile | null> {
    const path = `users/${uid}`;
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        uid,
        city: data.city,
        createdAt: data.createdAt.toDate(),
        totalWasteCount: data.totalWasteCount
      };
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, path);
      return null;
    }
  },

  async logWaste(log: Omit<WasteLog, 'id' | 'createdAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'waste_logs'), {
        ...log,
        createdAt: serverTimestamp()
      });
      
      // If logged in, update user total count
      if (log.userId) {
        const userRef = doc(db, "users", log.userId);
        try {
          // Use setDoc with merge: true to avoid "document not found" errors for new users
          await setDoc(userRef, {
            totalWasteCount: increment(log.quantity),
            // If they haven't picked a city yet, we use a placeholder that they can update later
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (updateError) {
          console.warn("Could not update user stats, but waste was logged:", updateError);
        }
      }
      
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'waste_logs');
    }
  },

  async getUserLogs(uid: string): Promise<WasteLog[]> {
    const path = 'waste_logs';
    try {
      const q = query(
        collection(db, path),
        where("userId", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt.toDate()
        } as WasteLog;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  },

  // Agency global analysis
  async getAllLogs(limitCount = 100): Promise<WasteLog[]> {
    const path = 'waste_logs';
    try {
      const q = query(
        collection(db, path),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt.toDate()
        } as WasteLog;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  }
};
