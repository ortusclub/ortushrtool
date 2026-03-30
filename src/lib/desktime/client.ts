import type { DeskTimeApiResponse, DeskTimeEmployee } from "./types";

const BASE_URL = "https://desktime.com/api/v2/json";

export async function fetchAllEmployees(
  date: string
): Promise<DeskTimeEmployee[]> {
  const apiKey = process.env.DESKTIME_API_KEY;
  if (!apiKey) throw new Error("DESKTIME_API_KEY is not set");

  const url = `${BASE_URL}/employees?apiKey=${apiKey}&date=${date}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `DeskTime API error: ${response.status} ${response.statusText}`
    );
  }

  const data: DeskTimeApiResponse = await response.json();

  if (data.error) {
    throw new Error(`DeskTime API error: ${data.error}`);
  }

  if (!data.employees) return [];

  return Object.values(data.employees);
}

export async function fetchEmployee(
  desktimeId: number,
  date: string
): Promise<DeskTimeEmployee | null> {
  const apiKey = process.env.DESKTIME_API_KEY;
  if (!apiKey) throw new Error("DESKTIME_API_KEY is not set");

  const url = `${BASE_URL}/employee?apiKey=${apiKey}&id=${desktimeId}&date=${date}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.employee ?? data ?? null;
}
