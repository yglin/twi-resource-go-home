import { Timestamp, GeoPoint } from 'firebase/firestore';

export type UserRole = 'MAKER_FISH' | 'GOING_HOME' | 'SYSTEM_ADMIN';

export enum RecordStatus {
  JUST_BORN = 'JUST_BORN',
  WAITING_FOR_COLLECTION = 'WAITING_FOR_COLLECTION',
  COLLECTION_CONFIRMED = 'COLLECTION_CONFIRMED',
  PICKED_UP = 'PICKED_UP',
  COMPLETED = 'COMPLETED'
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
}

export interface RecoveryRecord {
  id: string;
  materialCategory: string;
  productCategory: string;
  quantity: number;
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
}

export interface PlanStop {
  arrivalTime: Timestamp;
  recordId: string;
  status: 'PENDING' | 'ARRIVED' | 'SKIPPED';
  sortingOrder: number;
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
}
