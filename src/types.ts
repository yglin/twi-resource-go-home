import { Timestamp, GeoPoint } from 'firebase/firestore';

export type UserRole = 'MAKER_FISH' | 'GOING_HOME' | 'SYSTEM_ADMIN' | 'RECYCLER';

export enum RecordStatus {
  JUST_BORN = 'JUST_BORN',
  OPEN_FOR_ALL = 'OPEN_FOR_ALL',
  WAITING_FOR_COLLECTION = 'WAITING_FOR_COLLECTION',
  COLLECTION_CONFIRMED = 'COLLECTION_CONFIRMED',
  PICKED_UP = 'PICKED_UP',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum PlanStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED'
}

export enum NotificationType {
  SYSTEM = 'SYSTEM',
  PLAN_CONFIRMED = 'PLAN_CONFIRMED',
  COLLECTION_COMPLETED = 'COLLECTION_COMPLETED',
  NEW_RECORD_REMINDER = 'NEW_RECORD_REMINDER'
}

export interface UserProfile {
  id: string;
  displayName: string;
  photoURL?: string;
  email: string;
  phoneNumber?: string;
  roles: UserRole[];
  address?: string;
  timeWindow?: Record<string, string>;
  recoveryGuides?: RecoveryGuide[];
  acceptedCategories?: string[];
  availabilitySlots?: AvailabilitySlot[];
  coordinates?: GeoPoint;
  geohash?: string;
  recycleNotes?: string;
  vehicles?: string[];
  maxDistance?: number;
}

export interface AvailabilitySlot {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface RecoveryGuide {
  resourceId: string;
  material: string;
  product: string;
  instructions: string;
  price?: number;
  unit?: string;
}

export interface RecoveryRecord {
  id: string;
  materialCategory: string;
  productCategory: string;
  quantity: number;
  unit?: string;
  aiSuggestion: string;
  imageUrl: string;
  address: string;
  timeWindow: Record<string, string>;
  coordinates: GeoPoint;
  geohash: string;
  recycleNotes: string;
  makerFishId: string;
  candidateGoingHomeIds: string[];
  selectedGoingHomeId?: string;
  status: RecordStatus;
  createdAt: Timestamp;
  statusUpdatedAt?: Timestamp;
  unableToCollectReason?: string;
  expirationDate?: Timestamp;
  brands?: string[];
}

export interface GoingHomePlan {
  id: string;
  goingHomeId: string;
  departureTime: Timestamp;
  transportationType?: string;
  stops: PlanStop[];
  routePolyline?: string;
  status: PlanStatus;
  createdAt: Timestamp;
  totalDistance?: number;
  totalLoadWeightedDistance?: number;
  totalRevenue?: number;
}

export interface PlanStop {
  id: string; // station unique identifier (recordId if PICKUP, recyclerId if DELIVERY)
  type: 'PICKUP' | 'DELIVERY';
  recordId?: string; // only if PICKUP
  recyclerId?: string; // only if DELIVERY
  arrivalTime: Timestamp;
  status: 'PENDING' | 'ARRIVED' | 'SKIPPED';
  sortingOrder: number;
  deliveredRecordIds?: string[]; // only if DELIVERY
  revenueEarned?: number; // only if DELIVERY
}

export interface AppNotification {
  id: string;
  receiverId: string;
  type: NotificationType;
  title: string;
  content: string;
  recordId?: string;
  planId?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface MasterDataResource {
  id: string;
  material: string;
  product: string;
  defaultSuggestion: string;
  icon?: string;
  keywords: string[];
  carbonReduced?: number;
  unit?: string;
  estimatedWeight?: number;
  expireAfterhHours?: number;
  avgPrice?: number;
}

export interface NewMasterDataResource {
  id: string;
  material: string;
  product: string;
  defaultSuggestion: string;
  icon?: string;
  keywords: string[];
  suggestedBy: string;
  suggestedByEmail: string;
  createdAt: any;
  carbonReduced?: number;
  unit?: string;
  estimatedWeight?: number;
  expireAfterhHours?: number;
  avgPrice?: number;
}

export interface GANode {
  id: string;
  type: 'START' | 'PICKUP' | 'DELIVERY';
  coordinates: { latitude: number; longitude: number };
  displayName: string;
  address: string;
  
  // For PICKUP
  materialCategory?: string;
  productCategory?: string;
  quantity?: number;
  unit?: string;
  estimatedWeight?: number;
  
  // For DELIVERY
  acceptedCategories?: string[];
  prices?: Record<string, number>;
  deliveredRecordIds?: string[];
  revenueEarned?: number;
}

export type ContractStatus = 'Pending Signatures' | 'Active' | 'Rejected' | 'Suspended';

export interface ContractTemplateRecord {
  materialCategory: string;
  productCategory: string;
  quantity: number;
  unit: string;
}

export interface ContractSchedule {
  type: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[];
  dayOfMonth?: number;
  time: string;
  scheduleText: string;
}

export interface ContractSignatures {
  makerFish: 'Pending' | 'Approved' | 'Rejected';
  goingHome: 'Pending' | 'Approved' | 'Rejected';
  recycler: 'Pending' | 'Approved' | 'Rejected';
}

export interface RecycleContract {
  id: string;
  creatorId: string;
  status: ContractStatus;
  templateRecord: ContractTemplateRecord;
  schedule: ContractSchedule;
  makerFishId: string;
  goingHomeId: string;
  recyclerId: string;
  signatures: ContractSignatures;
  rejectionReason?: string;
  sourceRecordId?: string;
  lastGeneratedAt?: Timestamp;
  nextRunAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContractHistory {
  id: string;
  timestamp: Timestamp;
  operatorId: string;
  operatorName: string;
  operatorRole: string; // 'MAKER_FISH' | 'GOING_HOME' | 'RECYCLER' | 'SYSTEM'
  action: 'CREATE_CONTRACT' | 'SIGN_APPROVE' | 'SIGN_REJECT' | 'SUSPEND' | 'REACTIVATE' | 'RESUBMIT';
  note?: string;
}

export interface ContractMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: Timestamp;
}

