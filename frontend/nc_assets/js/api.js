// api.js
import { API_BASE } from './config.js';

const BASE_URL = API_BASE;

export async function request(path, options = {}) {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${BASE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers || {})
      },
      body: options.body || undefined
    });

    // Handle non-JSON safely
    const contentType = res.headers.get("content-type");
    const data = contentType?.includes("application/json")
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      console.error("API ERROR:", data);
      throw new Error(data?.message || "Something went wrong");
    }

    return data;

  } catch (err) {
    console.error("REQUEST FAILED:", err.message);
    throw err;
  }
}