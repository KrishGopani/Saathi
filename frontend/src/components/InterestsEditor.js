import React, { useState } from "react";

export default function InterestsEditor({ interests, onChange }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().replace(/,$/, "");
    setDraft("");
    if (value && !interests.some((i) => i.toLowerCase() === value.toLowerCase())) {
      onChange([...interests, value]);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && interests.length) {
      onChange(interests.slice(0, -1));
    }
  };

  return (
    <div className="interests" title="Interests tune which courses are recommended">
      <span className="interests-label">Interests</span>
      {interests.map((i) => (
        <span key={i} className="chip removable">
          {i}
          <button aria-label={`Remove ${i}`} onClick={() => onChange(interests.filter((x) => x !== i))}>×</button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={add}
        placeholder={interests.length ? "Add…" : "Add interests…"} aria-label="Add interest" />
    </div>
  );
}
