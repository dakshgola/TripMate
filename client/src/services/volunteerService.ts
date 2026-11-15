import { apiClient } from '../api/client';

export interface VolunteerOpportunity {
  id: string;
  title: string;
  hostName: string;
  location: string;
  state: string;
  region: 'Himachal' | 'Uttarakhand' | 'Goa' | 'Kerala' | 'Rajasthan' | 'NorthEast';
  category: 'content' | 'hostel' | 'art' | 'farming' | 'yoga' | 'music' | 'tech';
  duration: string;
  stipend: string;
  perks: string[];
  skills: string[];
  hoursPerDay: string;
  minCommitment: string;
  spotsLeft: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  description: string;
  responsibilities: string[];
  whatYouGet: string[];
  verified: boolean;
}

export interface VolunteerApplicationRequest {
  opportunityId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  portfolioUrl?: string;
  applicantSkills?: string;
  applicantDates?: string;
  applicantMotivation: string;
}

export interface VolunteerApplicationResponse {
  success: boolean;
  applicationId: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  stipendSnapshot?: string;
  message: string;
}

const GUEST_FAV_KEY = 'tripmate_guest_volunteer_favs';

function getGuestFavorites(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setGuestFavorites(favs: string[]): void {
  try {
    localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(favs));
  } catch {
    // ignore local storage error
  }
}

export async function getVolunteerOpportunities(params?: {
  region?: string;
  category?: string;
  query?: string;
}): Promise<VolunteerOpportunity[]> {
  const res = await apiClient.get('/volunteer/opportunities', { params });
  return res.data as VolunteerOpportunity[];
}

export async function getVolunteerOpportunity(id: string): Promise<VolunteerOpportunity> {
  const res = await apiClient.get(`/volunteer/opportunities/${id}`);
  return res.data as VolunteerOpportunity;
}

export async function submitVolunteerApplication(
  data: VolunteerApplicationRequest,
): Promise<VolunteerApplicationResponse> {
  const res = await apiClient.post('/volunteer/applications', data);
  return res.data as VolunteerApplicationResponse;
}

export async function updateApplicationStatus(
  applicationId: number,
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED',
): Promise<{ success: boolean; applicationId: number; status: string }> {
  const res = await apiClient.patch(`/volunteer/applications/${applicationId}/status`, { status });
  return res.data as { success: boolean; applicationId: number; status: string };
}

export async function getMyVolunteerApplications(email?: string): Promise<string[]> {
  try {
    const res = await apiClient.get('/volunteer/applications/mine', { params: { email } });
    return (res.data as string[]) || [];
  } catch {
    return [];
  }
}

export async function getFavoriteOpportunities(): Promise<string[]> {
  const guestFavs = getGuestFavorites();
  try {
    const res = await apiClient.get('/volunteer/favorites');
    const serverFavs = (res.data as string[]) || [];
    return Array.from(new Set([...serverFavs, ...guestFavs]));
  } catch {
    return guestFavs;
  }
}

export async function toggleFavoriteOpportunity(
  opportunityId: string,
): Promise<{ isFavorite: boolean }> {
  try {
    const res = await apiClient.post(`/volunteer/favorites/${opportunityId}`);
    const data = res.data as { isFavorite: boolean; guest?: boolean };

    if (data.guest) {
      const current = getGuestFavorites();
      const exists = current.includes(opportunityId);
      const updated = exists ? current.filter((id) => id !== opportunityId) : [...current, opportunityId];
      setGuestFavorites(updated);
      return { isFavorite: !exists };
    }

    return { isFavorite: data.isFavorite };
  } catch {
    const current = getGuestFavorites();
    const exists = current.includes(opportunityId);
    const updated = exists ? current.filter((id) => id !== opportunityId) : [...current, opportunityId];
    setGuestFavorites(updated);
    return { isFavorite: !exists };
  }
}
