// Relative URLs: in development the CRA proxy forwards /api to Flask; in production Flask serves both.
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
  } catch (e) {
    throw new Error("Cannot reach the Saathi API. Is the Flask backend running?");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  listEvents: () => request("/api/events"),
  createEvent: (event) => request("/api/events", json("POST", event)),
  updateEvent: (id, event) => request(`/api/events/${id}`, json("PUT", event)),
  deleteEvent: (id) => request(`/api/events/${id}`, { method: "DELETE" }),
  runCommand: (command) => request("/api/process_command", json("POST", { command })),
  getRecommendations: (id) => request(`/api/events/${id}/recommendations`),
  refreshRecommendations: (id) => request(`/api/events/${id}/recommendations`, { method: "POST" }),
  searchCourses: (q) => request(`/api/courses?q=${encodeURIComponent(q)}`),
  similarCourses: (name) => request(`/api/courses?similar_to=${encodeURIComponent(name)}`),
  searchVideos: (q) => request(`/api/videos?q=${encodeURIComponent(q)}`),
  getProfile: () => request("/api/profile"),
  saveProfile: (interests) => request("/api/profile", json("PUT", { interests })),
};
