import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Lead {
  place_id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  totalRatings: number | null;
  lat: number;
  lng: number;
  category: string;
  score: number;
  reason: string;
  isStarLead: boolean;
}

export interface LeadSearch {
  id: string;
  userId: string;
  location: string;
  radiusMiles: number;
  radiusMeters: number;
  categories: string[];
  centerLat: number;
  centerLng: number;
  totalLeads: number;
  starLeads: number;
  createdAt: Timestamp;
  leads: Lead[];
}

export async function saveLeadSearch(
  userId: string,
  data: {
    location: string;
    radiusMiles: number;
    radiusMeters: number;
    categories: string[];
    centerLat: number;
    centerLng: number;
    leads: Lead[];
  }
) {
  return addDoc(collection(db, "leadSearches"), {
    userId,
    location: data.location,
    radiusMiles: data.radiusMiles,
    radiusMeters: data.radiusMeters,
    categories: data.categories,
    centerLat: data.centerLat,
    centerLng: data.centerLng,
    totalLeads: data.leads.length,
    starLeads: data.leads.filter((l) => l.isStarLead).length,
    createdAt: serverTimestamp(),
    leads: data.leads,
  });
}

export async function getPastSearches(userId: string): Promise<LeadSearch[]> {
  const q = query(
    collection(db, "leadSearches"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadSearch));
}
