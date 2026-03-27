"use client";

import { useEffect, useState } from "react";

const DEFAULT_ORGANIZATION_ID =
  process.env.NEXT_PUBLIC_ORGANIZATION_ID || "11111111-0000-0000-0000-000000000001";

const FALLBACK_LEVELS = [
  { experience_level_id: 1, label: "Fresher / Student" },
  { experience_level_id: 2, label: "Junior" },
  { experience_level_id: 3, label: "Mid" },
  { experience_level_id: 4, label: "Senior" },
];

export default function CreateJobModal({ open, setOpen }) {
  const [loading, setLoading] = useState(false);
  const [levels, setLevels] = useState([]);

  const [form, setForm] = useState({
    job_title: "",
    job_description: "",
    experience_level_id: "",
    difficulty_profile: "MID",
    core_skills: "",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    fetch("/api/experience-levels")
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error?.message || "Failed to load levels");
        }

        return Array.isArray(data) ? data : [];
      })
      .then((data) => setLevels(data))
      .catch((err) => {
        console.error("Failed to load levels", err);
        setLevels(FALLBACK_LEVELS);
      });
  }, [open]);

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      const payload = {
        ...form,
        organization_id: DEFAULT_ORGANIZATION_ID,
        experience_level_id: Number(form.experience_level_id),
        core_skills: form.core_skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        skill_baseline: [],
      };

      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(data);
        alert(data?.error?.message || "Failed to create job");
        return;
      }

      console.log("Job Created:", data);

      setForm({
        job_title: "",
        job_description: "",
        experience_level_id: "",
        difficulty_profile: "MID",
        core_skills: "",
      });

      setOpen(false);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-violet-500/20 bg-[#0a1020]/95 text-white shadow-[0_0_60px_rgba(139,92,246,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_28%)]" />
        <div className="relative max-h-[88vh] overflow-y-auto p-5 sm:p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-violet-300/80">
                Role Configuration
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                Create Job
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Define the role, experience band, and evaluation context used to
                generate forensic interview workflows.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-sm text-slate-300 transition hover:border-violet-400/60 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">Job Title</label>
              <input
                value={form.job_title}
                onChange={(e) => handleChange("job_title", e.target.value)}
                placeholder="Principal Data Engineer"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Experience Level</label>
              <select
                value={form.experience_level_id}
                onChange={(e) => handleChange("experience_level_id", e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-violet-400/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
              >
                <option value="">Select Experience Level</option>

                {levels.map((lvl) => (
                  <option
                    key={lvl.experience_level_id}
                    value={lvl.experience_level_id}
                  >
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Difficulty Profile</label>
              <select
                value={form.difficulty_profile}
                onChange={(e) => handleChange("difficulty_profile", e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-violet-400/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
              >
                <option value="JUNIOR">Junior</option>
                <option value="MID">Mid</option>
                <option value="SENIOR">Senior</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">Job Description</label>
              <textarea
                value={form.job_description}
                onChange={(e) => handleChange("job_description", e.target.value)}
                placeholder="Describe responsibilities, ownership, and the technical depth expected from this role."
                rows={6}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">Core Skills</label>
              <input
                value={form.core_skills}
                onChange={(e) => handleChange("core_skills", e.target.value)}
                placeholder="PostgreSQL, Performance Tuning, Backup Strategy"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            - Job config is created under the active organization
            <br />- Skills are normalized from comma-separated input
            <br />- Evaluation defaults can be extended later without changing the UI
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={() => setOpen(false)}
              className="rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 px-6 py-3 text-sm font-medium text-white shadow-[0_18px_30px_rgba(139,92,246,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Job"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
