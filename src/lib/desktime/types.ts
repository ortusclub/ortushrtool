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
  arrived?: string | false; // first seen timestamp or false
  left?: string | false; // last seen timestamp or false
  lateTime?: number;
  timezone?: string;
}

export interface DeskTimeApiResponse {
  employees?: Record<string, DeskTimeEmployee>;
  error?: string;
}
