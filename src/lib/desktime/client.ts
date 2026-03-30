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

  const data = await response.json();

  if (data.error) {
    throw new Error(`DeskTime API error: ${data.error}`);
  }

  if (!data.employees) return [];

  // DeskTime nests employees under the date key: { employees: { "2026-03-27": { "12345": {...} } } }
  const employeesObj = data.employees;
  const dateKey = Object.keys(employeesObj)[0];
  if (!dateKey) return [];

  const employeesByDate = employeesObj[dateKey];
  if (typeof employeesByDate !== "object") return [];

  // If the value is already an employee object (has 'id'), the response is flat
  if (employeesByDate.id) {
    return [employeesByDate as DeskTimeEmployee];
  }

  return Object.values(employeesByDate) as DeskTimeEmployee[];
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
