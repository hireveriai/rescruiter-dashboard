"use client";

import { useEffect, useMemo, useState } from "react";

import { buildAuthUrl } from "@/lib/client/auth-query";
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPlatformRoleTone(role) {
  if (role === "ADMIN" || role === "ORG_OWNER") {
    return "bg-amber-500/10 text-amber-200 border-amber-400/20";
  }

  return "bg-cyan-500/10 text-cyan-200 border-cyan-400/20";
}

function getOrgRoleTone(code) {
  if (!code) {
    return "bg-slate-900/70 text-slate-300 border-slate-700";
  }

  const normalized = code.toLowerCase();

  if (normalized.includes("founder")) {
    return "bg-violet-500/10 text-violet-200 border-violet-400/20";
  }

  if (normalized.includes("manager")) {
    return "bg-amber-500/10 text-amber-200 border-amber-400/20";
  }

  return "bg-emerald-500/10 text-emerald-200 border-emerald-400/20";
}

export default function ManageTeamPage() {
  const searchParams = useAuthSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch(buildAuthUrl("/api/manage-team", searchParams))
      .then((res) => res.json())
      .then((payload) => {
        if (!active) {
          return;
        }

        if (payload.success) {
          setData(payload.data);
          setError("");
          return;
        }

        setError(payload.error?.message || payload.message || "Failed to load team workspace");
      })
      .catch((fetchError) => {
        console.error("Failed to load manage team data", fetchError);
        if (active) {
          setError("Failed to load team workspace");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [searchParams]);

  const team = useMemo(() => data?.team ?? [], [data]);
  const summary = data?.summary ?? {
    totalMembers: 0,
    activeMembers: 0,
    recruiters: 0,
    admins: 0,
  };

  return (
    <main className="min-h-screen bg-[#081120] px-6 py-12 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),linear-gradient(180deg,#0f172a,#0b1324)] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-blue-300/80">
                Recruiter Administration
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
                Manage Team
              </h1>
              <p className="mt-4 max-w-3xl text-base text-slate-300">
                Review organization roles, recruiter membership, and permission scopes seeded for your workspace.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-5 py-4 text-right">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Organization</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {data?.organization || "Loading workspace"}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
              <p className="text-sm text-slate-400">Total Team Members</p>
              <p className="mt-3 text-4xl font-semibold text-white">{summary.totalMembers}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
              <p className="text-sm text-slate-400">Active Members</p>
              <p className="mt-3 text-4xl font-semibold text-emerald-300">{summary.activeMembers}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
              <p className="text-sm text-slate-400">Recruiters</p>
              <p className="mt-3 text-4xl font-semibold text-cyan-300">{summary.recruiters}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
              <p className="text-sm text-slate-400">Admins / Owners</p>
              <p className="mt-3 text-4xl font-semibold text-amber-300">{summary.admins}</p>
            </div>
          </div>

          {error ? (
            <div className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950/30">
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_1.8fr] gap-4 border-b border-slate-800 px-6 py-4 text-xs uppercase tracking-[0.28em] text-slate-500">
              <div>Team Member</div>
              <div>Organization Role</div>
              <div>Status</div>
              <div>Joined</div>
              <div>Permissions</div>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-slate-400">Loading team workspace...</div>
            ) : team.length === 0 ? (
              <div className="px-6 py-10 text-sm text-slate-400">No recruiter-side team members found for this organization.</div>
            ) : (
              team.map((member) => (
                <div
                  key={member.userId}
                  className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_1.8fr] gap-4 border-b border-slate-900 px-6 py-5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-white">{member.name}</p>
                      {member.isCurrentUser ? (
                        <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-blue-200">
                          You
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-400">{member.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${getPlatformRoleTone(member.platformRole)}`}>
                        Platform: {member.platformRole}
                      </span>
                      {member.recruiterRoleId ? (
                        <span className="inline-flex rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
                          Role ID: {member.recruiterRoleId}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${getOrgRoleTone(member.organizationRoleCode)}`}>
                      {member.organizationRoleCode || "Unassigned"}
                    </span>
                    {member.organizationRoleDescription ? (
                      <p className="mt-2 text-sm text-slate-400">{member.organizationRoleDescription}</p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No organization role profile assigned</p>
                    )}
                  </div>

                  <div>
                    <span className={member.isActive ? "text-emerald-300" : "text-slate-500"}>
                      {member.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="text-slate-300">{formatDate(member.joinedAt)}</div>

                  <div className="flex flex-wrap gap-2">
                    {member.permissions.length === 0 ? (
                      <span className="text-sm text-slate-500">No permissions mapped</span>
                    ) : (
                      member.permissions.map((permission) => (
                        <div
                          key={`${member.userId}-${permission.code}`}
                          className="rounded-2xl border border-slate-700 bg-slate-900/75 px-3 py-2"
                        >
                          <p className="text-xs font-medium text-slate-100">{permission.code}</p>
                          {permission.description ? (
                            <p className="mt-1 text-[11px] text-slate-400">{permission.description}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
