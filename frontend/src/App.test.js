import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import RecommendationsPanel from "./components/Recommendations";

const event = { id: 1, title: "Learn Flask", start: new Date(), end: new Date() };
const rec = {
  event_id: 1, status: "done", error: "", keywords: ["flask"],
  courses: [{ name: "Flask Basics", url: "https://c/x", university: "U", level: "Beginner", rating: "4.5" }],
  videos: [{ title: "Flask Tutorial", url: "https://y/z", thumbnail: "t.jpg", channel: "Ch",
    views: 1200, duration: "0:10:00", chapters: ["1. Intro"] }],
};

test("prompts for a selection when no event is chosen", () => {
  render(<RecommendationsPanel />);
  expect(screen.getByText(/pick a task/i)).toBeInTheDocument();
});

test("shows courses, then videos on the Videos tab", () => {
  render(<RecommendationsPanel event={event} rec={rec} onRefresh={() => {}} onEdit={() => {}} onSimilar={() => {}} />);
  expect(screen.getByRole("link", { name: "Flask Basics" })).toHaveAttribute("href", "https://c/x");
  fireEvent.click(screen.getByRole("tab", { name: /videos/i }));
  expect(screen.getByRole("link", { name: "Flask Tutorial" })).toHaveAttribute("href", "https://y/z");
});

test("shows a loading skeleton while recommendations are being generated", () => {
  render(<RecommendationsPanel event={event} rec={{ ...rec, status: "running", courses: [], videos: [] }}
    onRefresh={() => {}} onEdit={() => {}} onSimilar={() => {}} />);
  expect(screen.getByLabelText("Loading")).toBeInTheDocument();
});

describe("App", () => {
  beforeEach(() => {
    const now = new Date();
    const hour = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).toISOString();
    global.fetch = jest.fn((url) => {
      const body = url === "/api/events" ? [{ id: 1, title: "Learn Flask", desc: "", start: hour(10), end: hour(11) }]
        : url === "/api/profile" ? { interests: ["python"] }
        : url === "/api/events/1/recommendations" ? rec : {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
  });

  test("selects the upcoming task on load and shows its recommendations and interests", async () => {
    const { default: App } = require("./App");
    render(<App />);
    expect(await screen.findByRole("link", { name: "Flask Basics" })).toBeInTheDocument();
    expect(await screen.findByText("python")).toBeInTheDocument();
  });
});
