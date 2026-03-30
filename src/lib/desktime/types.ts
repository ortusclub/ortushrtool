export interface DeskTimeEmployee {
  id: number;
  name: string;
  email: string;
  groupId?: number;
  groupName?: string;
  isOnline?: boolean;
  desktimeTime?: number;
  atWorkTime?: number;
  productiveTime?: number;
  idleTime?: number;
  unproductiveTime?: number;
  work_starts?: string; // e.g., "9:05"
  work_ends?: string; // e.g., "18:30"
  arrived?: string; // first seen timestamp
  left?: string; // last seen timestamp
  lateTime?: number;
}

export interface DeskTimeApiResponse {
  employees?: Record<string, DeskTimeEmployee>;
  error?: string;
}
