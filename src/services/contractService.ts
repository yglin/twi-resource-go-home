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
  runTransaction, 
  writeBatch,
  Timestamp,
  GeoPoint,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  RecycleContract, 
  ContractStatus, 
  ContractHistory, 
  ContractMessage, 
  UserProfile, 
  RecoveryRecord, 
  RecordStatus,
  ContractSchedule,
  ContractSignatures,
  NotificationType,
  AppNotification
} from '../types';
import { handleFirestoreError, OperationType } from './firestoreService';

// Helper function to calculate the next run time
export function calculateNextRun(schedule: ContractSchedule, fromDate: Date = new Date()): Date {
  const [hour, minute] = schedule.time.split(':').map(Number);
  
  if (schedule.type === 'daily') {
    const candidate = new Date(fromDate);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= fromDate.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  } else if (schedule.type === 'weekly') {
    const days = schedule.daysOfWeek || [];
    if (days.length === 0) {
      const candidate = new Date(fromDate);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= fromDate.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;
    }
    for (let i = 0; i <= 14; i++) {
      const candidate = new Date(fromDate);
      candidate.setDate(fromDate.getDate() + i);
      candidate.setHours(hour, minute, 0, 0);
      if (days.includes(candidate.getDay())) {
        if (candidate.getTime() > fromDate.getTime()) {
          return candidate;
        }
      }
    }
  } else if (schedule.type === 'monthly') {
    const targetDay = schedule.dayOfMonth || 1;
    let year = fromDate.getFullYear();
    let month = fromDate.getMonth();
    const candidate = new Date(year, month, targetDay, hour, minute, 0, 0);
    if (candidate.getTime() > fromDate.getTime() && candidate.getDate() === targetDay) {
      return candidate;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    return new Date(year, month, targetDay, hour, minute, 0, 0);
  }
  
  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
}

// 2.1 CREATE CONTRACT
export async function createContract(data: {
  makerFishId: string;
  goingHomeId: string;
  recyclerId: string;
  templateRecord: {
    materialCategory: string;
    productCategory: string;
    quantity: number;
    unit: string;
  };
  schedule: ContractSchedule;
  sourceRecordId?: string;
}): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User is not authenticated');

    const contractColRef = collection(db, 'recycleContracts');
    const contractDocRef = doc(contractColRef);

    const now = Timestamp.now();
    const newContract: Omit<RecycleContract, 'id'> = {
      creatorId: user.uid,
      status: 'Pending Signatures',
      templateRecord: data.templateRecord,
      schedule: data.schedule,
      makerFishId: data.makerFishId,
      goingHomeId: data.goingHomeId,
      recyclerId: data.recyclerId,
      signatures: {
        makerFish: 'Pending',
        goingHome: 'Approved', // Pre-approved by creator
        recycler: 'Pending'
      },
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      sourceRecordId: data.sourceRecordId || ''
    };

    // Calculate initial nextRunAt
    newContract.nextRunAt = Timestamp.fromDate(calculateNextRun(data.schedule));

    await setDoc(contractDocRef, newContract);

    // Write history log
    const historyColRef = collection(db, `recycleContracts/${contractDocRef.id}/history`);
    const historyDocRef = doc(historyColRef);
    const historyLog: Omit<ContractHistory, 'id'> = {
      timestamp: serverTimestamp() as any,
      operatorId: user.uid,
      operatorName: user.displayName || '資源勾引魟',
      operatorRole: 'GOING_HOME',
      action: 'CREATE_CONTRACT',
      note: '發起新定期回收契約'
    };
    await setDoc(historyDocRef, historyLog);

    // Send system messages and notifications
    const msgColRef = collection(db, `recycleContracts/${contractDocRef.id}/messages`);
    const msgDocRef = doc(msgColRef);
    const systemMessage: Omit<ContractMessage, 'id'> = {
      senderId: 'SYSTEM',
      senderName: '系統管理員',
      senderRole: 'SYSTEM',
      content: `[系統廣播] 資源勾引魟 ${user.displayName || '魟魚'} 發起了定期回收契約，等待資源梅克魚與資源瑞莎魺簽署同意。`,
      createdAt: serverTimestamp() as any
    };
    await setDoc(msgDocRef, systemMessage);

    // Send notifications to other parties
    await addNotification(data.makerFishId, `新合約待簽署`, `魟魚發起了新的定期回收契約，等待您的審核。`, contractDocRef.id);
    await addNotification(data.recyclerId, `新合約待簽署`, `魟魚發起了新的定期回收契約，將到您的據點進行收運。`, contractDocRef.id);

    return contractDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'recycleContracts');
    return '';
  }
}

// 2.2 SIGN CONTRACT
export async function signContract(
  contractId: string, 
  userId: string, 
  role: 'MAKER_FISH' | 'GOING_HOME' | 'RECYCLER', 
  action: 'Approve' | 'Reject', 
  reason?: string
): Promise<void> {
  const contractRef = doc(db, 'recycleContracts', contractId);

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User is not authenticated');

    await runTransaction(db, async (transaction) => {
      const contractSnap = await transaction.get(contractRef);
      if (!contractSnap.exists()) throw new Error('Contract does not exist');
      
      const contract = contractSnap.data() as RecycleContract;

      // Optimistic concurrency check (ensure updatedAt hasn't changed)
      // Since it's inside transaction, Firestore handles isolation automatically, 
      // but let's make sure the client UI knew the correct state.
      
      const signatures = { ...contract.signatures };
      const now = Timestamp.now();

      if (role === 'MAKER_FISH') {
        signatures.makerFish = action === 'Approve' ? 'Approved' : 'Rejected';
      } else if (role === 'RECYCLER') {
        signatures.recycler = action === 'Approve' ? 'Approved' : 'Rejected';
      } else if (role === 'GOING_HOME') {
        signatures.goingHome = action === 'Approve' ? 'Approved' : 'Rejected';
      }

      let updatedStatus: ContractStatus = contract.status;
      let rejectionReason = contract.rejectionReason || '';

      if (action === 'Reject') {
        updatedStatus = 'Rejected';
        rejectionReason = reason || '成員退回審查';
      } else if (
        signatures.makerFish === 'Approved' && 
        signatures.goingHome === 'Approved' && 
        signatures.recycler === 'Approved'
      ) {
        updatedStatus = 'Active';
        rejectionReason = '';
      }

      const updates: Partial<RecycleContract> = {
        signatures,
        status: updatedStatus,
        rejectionReason,
        updatedAt: serverTimestamp() as any
      };

      // Handle duplicate exclusion initial step
      if (updatedStatus === 'Active') {
        let lastGenTime = now;
        if (contract.sourceRecordId) {
          const sourceSnap = await transaction.get(doc(db, 'recoveryRecords', contract.sourceRecordId));
          if (sourceSnap.exists()) {
            const src = sourceSnap.data() as RecoveryRecord;
            lastGenTime = src.statusUpdatedAt || src.createdAt || now;
          }
        }
        updates.lastGeneratedAt = lastGenTime;
        updates.nextRunAt = Timestamp.fromDate(calculateNextRun(contract.schedule, lastGenTime.toDate()));
      }

      transaction.update(contractRef, updates);

      // Write history log
      const historyColRef = collection(db, `recycleContracts/${contractId}/history`);
      const historyDocRef = doc(historyColRef);
      const actionLog: Omit<ContractHistory, 'id'> = {
        timestamp: serverTimestamp() as any,
        operatorId: userId,
        operatorName: user.displayName || '使用者',
        operatorRole: role,
        action: action === 'Approve' ? 'SIGN_APPROVE' : 'SIGN_REJECT',
        note: action === 'Approve' ? '簽署同意契約契合款' : `退回本約。原因：${reason || '無'}`
      };
      transaction.set(historyDocRef, actionLog);

      // System message broadcast
      const msgColRef = collection(db, `recycleContracts/${contractId}/messages`);
      const msgDocRef = doc(msgColRef);
      const name = user.displayName || '成員';
      
      let broadcastContent = '';
      if (action === 'Reject') {
        broadcastContent = `[系統廣播] ${name} 退回審查！原因：『${reason || '未提供理由'}』。本合約已凍結。`;
      } else if (updatedStatus === 'Active') {
        broadcastContent = `[系統廣播] 三方全員已簽署同意！本定期回收契約正式啟動（Active）。將於 ${updates.nextRunAt?.toDate().toLocaleString()} 發起首期新單。`;
      } else {
        broadcastContent = `[系統廣播] ${name} 簽署同意成功，等待其餘協力端。`;
      }

      const systemMessage: Omit<ContractMessage, 'id'> = {
        senderId: 'SYSTEM',
        senderName: '系統管理員',
        senderRole: 'SYSTEM',
        content: broadcastContent,
        createdAt: serverTimestamp() as any
      };
      transaction.set(msgDocRef, systemMessage);
    });

    // Notify other parties after transaction completes
    if (action === 'Reject') {
      const parentSnap = await getDoc(contractRef);
      if (parentSnap.exists()) {
        const c = parentSnap.data() as RecycleContract;
        const recipients = [c.makerFishId, c.goingHomeId, c.recyclerId].filter(id => id !== userId);
        for (const id of recipients) {
          await addNotification(id, `合約已被駁回`, `參與端已駁回此契約，請前往對話區暸解原因。`, contractId);
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recycleContracts/${contractId}`);
  }
}

// 2.3 SUSPEND CONTRACT
export async function suspendContract(
  contractId: string, 
  userId: string, 
  userName: string, 
  role: string, 
  reason: string
): Promise<void> {
  try {
    const now = Timestamp.now();
    const contractRef = doc(db, 'recycleContracts', contractId);

    // Atomic update using batch or individual transaction
    const batch = writeBatch(db);

    batch.update(contractRef, {
      status: 'Suspended',
      updatedAt: serverTimestamp() as any
    });

    // Add History
    const historyColRef = collection(db, `recycleContracts/${contractId}/history`);
    const historyDocRef = doc(historyColRef);
    const suspendLog: Omit<ContractHistory, 'id'> = {
      timestamp: serverTimestamp() as any,
      operatorId: userId,
      operatorName: userName,
      operatorRole: role,
      action: 'SUSPEND',
      note: reason
    };
    batch.set(historyDocRef, suspendLog);

    // Messages System broadcast
    const msgColRef = collection(db, `recycleContracts/${contractId}/messages`);
    const msgDocRef = doc(msgColRef);
    const systemMessage: Omit<ContractMessage, 'id'> = {
      senderId: 'SYSTEM',
      senderName: '系統管理員',
      senderRole: 'SYSTEM',
      content: `[系統廣播] 因 ${userName} 暫停合約：『${reason}』，本定期計畫已冬眠。`,
      createdAt: serverTimestamp() as any
    };
    batch.set(msgDocRef, systemMessage);

    await batch.commit();

    // Trigger notification
    const contractSnap = await getDoc(contractRef);
    if (contractSnap.exists()) {
      const c = contractSnap.data() as RecycleContract;
      const recipients = [c.makerFishId, c.goingHomeId, c.recyclerId].filter(id => id !== userId);
      for (const id of recipients) {
        await addNotification(id, `合約已暫停`, `${userName} 暫停了您的定期約：『${reason}』`, contractId);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recycleContracts/${contractId}`);
  }
}

// 2.4 REACTIVATE CONTRACT
export async function reactivateContract(
  contractId: string, 
  userId: string, 
  userName: string, 
  role: string
): Promise<void> {
  try {
    const now = Timestamp.now();
    const contractRef = doc(db, 'recycleContracts', contractId);

    const batch = writeBatch(db);

    const signatures: ContractSignatures = {
      makerFish: role === 'MAKER_FISH' ? 'Approved' : 'Pending',
      goingHome: role === 'GOING_HOME' ? 'Approved' : 'Pending',
      recycler: role === 'RECYCLER' ? 'Approved' : 'Pending'
    };

    batch.update(contractRef, {
      status: 'Pending Signatures',
      signatures,
      updatedAt: serverTimestamp() as any
    });

    const historyColRef = collection(db, `recycleContracts/${contractId}/history`);
    const historyDocRef = doc(historyColRef);
    const reactivateLog: Omit<ContractHistory, 'id'> = {
      timestamp: serverTimestamp() as any,
      operatorId: userId,
      operatorName: userName,
      operatorRole: role,
      action: 'REACTIVATE',
      note: '發起重新協議/重啟合約'
    };
    batch.set(historyDocRef, reactivateLog);

    // Messages system broadcast
    const msgColRef = collection(db, `recycleContracts/${contractId}/messages`);
    const msgDocRef = doc(msgColRef);
    const systemMessage: Omit<ContractMessage, 'id'> = {
      senderId: 'SYSTEM',
      senderName: '系統管理員',
      senderRole: 'SYSTEM',
      content: `[系統廣播] ${userName} 發起了重新簽核重啟合約！本合約回歸 Pending 審核中，請各方盡速至控制台重新簽核。`,
      createdAt: serverTimestamp() as any
    };
    batch.set(msgDocRef, systemMessage);

    await batch.commit();

    // Trigger notification
    const contractSnap = await getDoc(contractRef);
    if (contractSnap.exists()) {
      const c = contractSnap.data() as RecycleContract;
      const recipients = [c.makerFishId, c.goingHomeId, c.recyclerId].filter(id => id !== userId);
      for (const id of recipients) {
        await addNotification(id, `合約重新啟動徵求同意`, `${userName} 請求您重新啟動該合約。`, contractId);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recycleContracts/${contractId}`);
  }
}

// 2.5 RESUBMIT CONTRACT (魟魚修改條款重新提交)
export async function resubmitContract(
  contractId: string, 
  updatedData: {
    templateRecord: {
      materialCategory: string;
      productCategory: string;
      quantity: number;
      unit: string;
    };
    schedule: ContractSchedule;
  }
): Promise<void> {
  const contractRef = doc(db, 'recycleContracts', contractId);

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User is not authenticated');

    await runTransaction(db, async (transaction) => {
      const contractSnap = await transaction.get(contractRef);
      if (!contractSnap.exists()) throw new Error('Contract index failed');

      const now = Timestamp.now();
      const nextRunAt = Timestamp.fromDate(calculateNextRun(updatedData.schedule));

      transaction.update(contractRef, {
        templateRecord: updatedData.templateRecord,
        schedule: updatedData.schedule,
        status: 'Pending Signatures',
        signatures: {
          makerFish: 'Pending',
          goingHome: 'Approved', // automatic approval on submitter
          recycler: 'Pending'
        },
        rejectionReason: '',
        nextRunAt,
        updatedAt: serverTimestamp() as any
      });

      // Write Log
      const historyColRef = collection(db, `recycleContracts/${contractId}/history`);
      const historyDocRef = doc(historyColRef);
      const resubmitLog: Omit<ContractHistory, 'id'> = {
        timestamp: serverTimestamp() as any,
        operatorId: user.uid,
        operatorName: user.displayName || '發起人',
        operatorRole: 'GOING_HOME',
        action: 'RESUBMIT',
        note: `調整約定條款，新版排程：${updatedData.schedule.scheduleText}`
      };
      transaction.set(historyDocRef, resubmitLog);

      // Message system broadcast
      const msgColRef = collection(db, `recycleContracts/${contractId}/messages`);
      const msgDocRef = doc(msgColRef);
      const systemMessage: Omit<ContractMessage, 'id'> = {
        senderId: 'SYSTEM',
        senderName: '系統管理員',
        senderRole: 'SYSTEM',
        content: `[系統廣播] 資源勾引魟 ${user.displayName || '魟魚'} 已修改合約條款並重送！新排程為：${updatedData.schedule.scheduleText}，細項項目為: ${updatedData.templateRecord.productCategory} ${updatedData.templateRecord.quantity}${updatedData.templateRecord.unit}。請梅克魚及瑞莎魺至詳情頁進行審閱與再次簽署。`,
        createdAt: serverTimestamp() as any
      };
      transaction.set(msgDocRef, systemMessage);
    });

    const cSnap = await getDoc(contractRef);
    if (cSnap.exists()) {
      const c = cSnap.data() as RecycleContract;
      await addNotification(c.makerFishId, `合約條款已更新`, `魟魚已更新定期合約，請您重新審閱。`, contractId);
      await addNotification(c.recyclerId, `合約條款已更新`, `魟魚已更新定期合約，請您重新審閱。`, contractId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recycleContracts/${contractId}`);
  }
}

// 2.2 SCHEDULER: EVALUATE & GENERATE SCHEDULED RECORDS
export async function evaluateAndGenerateScheduledRecords(): Promise<void> {
  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      return; // Silently return if no user is signed in yet
    }

    const now = Timestamp.now();
    const currentDate = now.toDate();

    // Query active contracts where the current user is a participant to abide by Firestore security rules
    const [snap1, snap2, snap3] = await Promise.all([
      getDocs(query(collection(db, 'recycleContracts'), where('status', '==', 'Active'), where('makerFishId', '==', currentUserId))),
      getDocs(query(collection(db, 'recycleContracts'), where('status', '==', 'Active'), where('goingHomeId', '==', currentUserId))),
      getDocs(query(collection(db, 'recycleContracts'), where('status', '==', 'Active'), where('recyclerId', '==', currentUserId)))
    ]);

    const docsMap = new Map<string, any>();
    snap1.docs.forEach(doc => docsMap.set(doc.id, doc));
    snap2.docs.forEach(doc => docsMap.set(doc.id, doc));

    const contractDocs = Array.from(docsMap.values());

    for (const contractDoc of contractDocs) {
      const contract = { id: contractDoc.id, ...contractDoc.data() } as RecycleContract;
      
      const nextRun = contract.nextRunAt?.toDate();
      const lastGenerated = contract.lastGeneratedAt?.toDate();

      // Check whether it is time to generate a record
      // Condition: Current time >= nextRunAt && (either never run or current time > lastGeneratedAt)
      if (nextRun && currentDate >= nextRun && (!lastGenerated || currentDate > lastGenerated)) {
        
        // Pre-evaluation checks
        const makerFishId = contract.makerFishId;
        const goingHomeId = contract.goingHomeId;
        const recyclerId = contract.recyclerId;

        const [mDoc, gDoc, rDoc] = await Promise.all([
          getDoc(doc(db, 'users', makerFishId)),
          getDoc(doc(db, 'users', goingHomeId)),
          getDoc(doc(db, 'users', recyclerId))
        ]);

        let isValid = true;
        let rejectReason = '';

        if (!mDoc.exists() || !gDoc.exists() || !rDoc.exists()) {
          isValid = false;
          rejectReason = '參與合約的主體對象帳號已不存在於系統。';
        } else {
          const mProfile = mDoc.data() as UserProfile;
          const gProfile = gDoc.data() as UserProfile;
          const rProfile = rDoc.data() as UserProfile;

          // Check role existence
          const mHasRole = mProfile.roles?.includes('MAKER_FISH');
          const gHasRole = gProfile.roles?.includes('GOING_HOME');
          const rHasRole = rProfile.roles?.includes('RECYCLER');

          if (!mHasRole || !gHasRole || !rHasRole) {
            isValid = false;
            rejectReason = `參與者的身分角色已變更。`;
          } else {
            // Check recycler guides compatibility (Recycler must still accept contract materials)
            const guides = rProfile.recoveryGuides || [];
            const isRecyclerCompatible = guides.some(g => 
              g.material.trim().toLowerCase() === contract.templateRecord.materialCategory.trim().toLowerCase() && 
              g.product.trim().toLowerCase() === contract.templateRecord.productCategory.trim().toLowerCase()
            ) || rProfile.acceptedCategories?.some(cat => 
              cat.trim().toLowerCase() === contract.templateRecord.materialCategory.trim().toLowerCase()
            );

            if (!isRecyclerCompatible) {
              isValid = false;
              rejectReason = `資源瑞莎魺目前回收項目中，已不包含資材：『${contract.templateRecord.materialCategory} - ${contract.templateRecord.productCategory}』`;
            }
          }
        }

        if (!isValid) {
          // Graceful Interruption: downgrade to 'Suspended'
          const batch = writeBatch(db);
          batch.update(contractDoc.ref, {
            status: 'Suspended',
            updatedAt: serverTimestamp() as any
          });

          // History log
          const hCol = collection(db, `recycleContracts/${contract.id}/history`);
          const hRef = doc(hCol);
          batch.set(hRef, {
            timestamp: serverTimestamp() as any,
            operatorId: 'SYSTEM',
            operatorName: '排程守護星',
            operatorRole: 'SYSTEM',
            action: 'SUSPEND',
            note: `[系統自動暫停] ${rejectReason}`
          });

          // Dialog bulletin message
          const mCol = collection(db, `recycleContracts/${contract.id}/messages`);
          const mRef = doc(mCol);
          batch.set(mRef, {
            senderId: 'SYSTEM',
            senderName: '系統管理員',
            senderRole: 'SYSTEM',
            content: `[系統警示] 因參與者之角色不符或回收指引相容性變更，本合約已被系統自動暫停執行。異動細節：『${rejectReason}』`,
            createdAt: serverTimestamp() as any
          });

          await batch.commit();

          // Push notifications to three parties
          const parties = [contract.makerFishId, contract.goingHomeId, contract.recyclerId];
          for (const p of parties) {
            await addNotification(p, `【系統警告】合約已自動掛起`, `您參與的定期回收契約因不符環境相容性，目前已自動暫停：『${rejectReason}』`, contract.id);
          }
        } else {
          // Eligibility passed, generate recovery record and advance nextRunAt
          const makerProfile = mDoc.data() as UserProfile;
          const recordColRef = collection(db, 'recoveryRecords');
          const recordDocRef = doc(recordColRef);

          const defaultGeopoint = makerProfile.coordinates || new GeoPoint(25.033, 121.564); // default Taipei
          const defaultGeohash = makerProfile.geohash || '';
          const defaultAddress = makerProfile.address || '無指定交付地址';
          const defaultNotes = makerProfile.recycleNotes || '定期自動排程合約產出';

          // Set Recovery Record
          const newRecord: Omit<RecoveryRecord, 'id'> = {
            materialCategory: contract.templateRecord.materialCategory,
            productCategory: contract.templateRecord.productCategory,
            quantity: contract.templateRecord.quantity,
            unit: contract.templateRecord.unit,
            imageUrl: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=300', // Premium Unsplash recycling aesthetic placeholder
            address: defaultAddress,
            coordinates: defaultGeopoint,
            geohash: defaultGeohash,
            recycleNotes: defaultNotes,
            makerFishId: contract.makerFishId,
            status: RecordStatus.JUST_BORN,
            createdAt: serverTimestamp() as any,
            statusUpdatedAt: serverTimestamp() as any,
            aiSuggestion: `[自動定期約產出] 請依資源勾引魟指引將「${contract.templateRecord.materialCategory}-${contract.templateRecord.productCategory}」整理妥當。已自動指名委託專屬魟魚。`,
            candidateGoingHomeIds: [contract.goingHomeId],
            selectedGoingHomeId: contract.goingHomeId, // Assigned right away to the contractor Ray!
            timeWindow: makerProfile.timeWindow || {}
          };

          const batch = writeBatch(db);
          batch.set(recordDocRef, newRecord);

          // Advanced scheduled timestamps
          const calculatedNext = calculateNextRun(contract.schedule, currentDate);
          batch.update(contractDoc.ref, {
            lastGeneratedAt: serverTimestamp() as any,
            nextRunAt: Timestamp.fromDate(calculatedNext),
            updatedAt: serverTimestamp() as any
          });

          // History log
          const hCol = collection(db, `recycleContracts/${contract.id}/history`);
          const hRef = doc(hCol);
          batch.set(hRef, {
            timestamp: serverTimestamp() as any,
            operatorId: 'SYSTEM',
            operatorName: '排程守護星',
            operatorRole: 'SYSTEM',
            action: 'CREATE_CONTRACT', // record generation behaves like triggering the contract output
            note: `[自動產出實體單] 成功派發新期數回收記錄單：單號 ${recordDocRef.id}。下期排發時間預定 ${calculatedNext.toLocaleString()}`
          });

          // Conversation chat log
          const mCol = collection(db, `recycleContracts/${contract.id}/messages`);
          const mRef = doc(mCol);
          batch.set(mRef, {
            senderId: 'SYSTEM',
            senderName: '系統管理員',
            senderRole: 'SYSTEM',
            content: `[系統廣播] 定期契約今日正常產出實體單！已成功建立單號：${recordDocRef.id} ，系統已直接指派魟魚，請雙方前往工作區或工作計畫完成該單。`,
            createdAt: serverTimestamp() as any
          });

          await batch.commit();

          // Push notifications
          await addNotification(contract.makerFishId, `【排程單建立】`, `您有新的定期回收物資已自動產出並分發給合作魟魚！單號 ${recordDocRef.id}`, recordDocRef.id);
          await addNotification(contract.goingHomeId, `【定期配單通知】`, `您的定期契約有新實體回收單已自動建立，並指派給您！單號 ${recordDocRef.id}`, recordDocRef.id);
        }
      }
    }
  } catch (error) {
    console.error('Scheduler Generator Error:', error);
  }
}

// Sub helper to push notification
export async function addNotification(
  receiverId: string, 
  title: string, 
  content: string, 
  referenceId?: string
): Promise<void> {
  try {
    const notifyCol = collection(db, 'notifications');
    const now = Timestamp.now();
    const notif: Omit<AppNotification, 'id'> = {
      receiverId,
      type: NotificationType.SYSTEM,
      title,
      content,
      isRead: false,
      createdAt: now,
      recordId: referenceId
    };
    await addDoc(notifyCol, notif);
  } catch (err) {
    console.error('Notification dispatch failed', err);
  }
}

export async function addContractMessage(
  contractId: string, 
  senderId: string, 
  senderName: string, 
  senderRole: string, 
  content: string
): Promise<void> {
  try {
    const msgCol = collection(db, `recycleContracts/${contractId}/messages`);
    const docRef = doc(msgCol);
    const msg: Omit<ContractMessage, 'id'> = {
      senderId,
      senderName,
      senderRole,
      content,
      createdAt: serverTimestamp() as any
    };
    await setDoc(docRef, msg);
    
    // Also touch contract updatedAt
    await updateDoc(doc(db, 'recycleContracts', contractId), {
      updatedAt: serverTimestamp() as any
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `recycleContracts/${contractId}/messages`);
  }
}
