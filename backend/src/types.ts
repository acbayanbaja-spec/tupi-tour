export type Role = "tourist" | "owner" | "admin";
export type SpotStatus = "draft" | "pending" | "under_review" | "approved" | "rejected";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  interests: string[];
  budgetPreference?: string;
  tripStyle?: string;
  onboardingComplete: boolean;
  emailVerified: boolean;
  points: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
}

export interface TouristSpot {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  description: string;
  shortDescription: string;
  lat: number;
  lng: number;
  address: string;
  barangay: string;
  amenities: string[];
  operatingHours?: { days: string; hours: string; reliability: "verified" | "owner" | "estimated" };
  contact?: string;
  featured: boolean;
  status: SpotStatus;
  ownerId?: string;
  dataSource: "curated" | "owner";
  estimatedEntranceFee?: number;
  popularityScore: number;
  viewCount: number;
  visitCount: number;
  images: { url: string; alt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  userId: string;
  spotId: string;
  rating: number;
  body: string;
  photos: string[];
  helpfulCount: number;
  helpfulBy: string[];
  ownerReply?: string;
  status: "published" | "hidden";
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  name: string;
  notes?: string;
  spotIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  stock: number;
  active: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export interface DatabaseShape {
  users: User[];
  categories: Category[];
  spots: TouristSpot[];
  favorites: { userId: string; spotId: string; createdAt: string }[];
  reviews: Review[];
  trips: Trip[];
  rewards: Reward[];
  userRewards: { id: string; userId: string; rewardId: string; createdAt: string }[];
  points: { id: string; userId: string; amount: number; reason: string; createdAt: string }[];
  badges: { id: string; slug: string; name: string; description: string }[];
  userBadges: { userId: string; badgeId: string; earnedAt: string }[];
  notifications: Notification[];
  visits: { id: string; userId: string; spotId: string; createdAt: string }[];
  reports: { id: string; userId?: string; targetType: string; targetId: string; reason: string; status: string; createdAt: string }[];
  ownerVerifications: { id: string; userId: string; businessName: string; notes: string; documentUrl?: string; status: string; createdAt: string; reviewedAt?: string }[];
  auditLogs: { id: string; actorId?: string; action: string; meta: Record<string, unknown>; createdAt: string }[];
  refreshTokens: { id: string; userId: string; tokenHash: string; expiresAt: string; revoked: boolean }[];
  passwordResets: { id: string; userId: string; tokenHash: string; expiresAt: string; used: boolean }[];
  searchEvents: { id: string; query: string; userId?: string; createdAt: string }[];
}
