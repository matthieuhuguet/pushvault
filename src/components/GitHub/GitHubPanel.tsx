import React, { useEffect, useState } from "react";
import { useGitHubStore } from "../../store/githubStore";
import type { GitHubRepo } from "../../store/githubStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { ipc } from "../../lib/ipc";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export function GitHubPanel() {
  const {
    token,
    user,
    repos,
    loading,
    error,
    setToken,
    clearToken,
    fetchUser,
    fetchRepos,
  } = useGitHubStore();
  const [tokenInput, setTokenInput] = useState("");
  const [search, setSearch] = useState("");
  const addToast = useToastStore((s) => s.add);
  const addRepo = useRepoStore((s) => s.addRepo);

  useEffect(() => {
    if (token && !user) {
      fetchUser();
      fetchRepos();
    }
  }, [token]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setToken(tokenInput.trim());
    await fetchUser();
    await fetchRepos();
    setTokenInput("");
    addToast("success", "Connected to GitHub");
  };

  const handleClone = async (repo: GitHubRepo) => {
    try {
      const dest = await openDialog({
        directory: true,
        multiple: false,
        title: `Clone ${repo.name}`,
      });
      if (!dest || typeof dest !== "string") return;
      const clonePath = `${dest}/${repo.name}`.replace(/\\/g, "/");
      addToast("info", `Cloning ${repo.name}...`);
      await ipc.cloneRepo(repo.clone_url, clonePath);
      await addRepo({
        name: repo.name,
        path: clonePath,
        remote: repo.clone_url,
        icon: "code",
        color: "#1DB954",
      });
      addToast("success", `Cloned and added ${repo.name}`);
    } catch (e) {
      addToast("error", `Clone failed: ${e}`);
    }
  };

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  if (!token) {
    return (
      <div style={{ padding: "32px", maxWidth: "480px" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}>
          Connect GitHub
        </h3>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: "14px",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
          }}
        >
          Enter a GitHub Personal Access Token (PAT) to import repositories and
          view your GitHub account. Create one at{" "}
          <strong style={{ color: "#1DB954" }}>
            github.com/settings/tokens
          </strong>{" "}
          with <code>repo</code> scope.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="ghp_xxxxxxxxxxxx"
            style={{
              flex: 1,
              background: "var(--color-bg-elevated)",
              border: "1px solid #535353",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "var(--color-text-primary)",
              fontSize: "14px",
              outline: "none",
              fontFamily: "monospace",
            }}
          />
          <button
            onClick={handleConnect}
            disabled={!tokenInput.trim()}
            style={{
              background: "#1DB954",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              color: "#000",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      {/* User info */}
      {user && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            background: "var(--color-bg-elevated)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <img
            src={user.avatar_url}
            alt={user.login}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
              {user.name || user.login}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-text-secondary)" }}>
              @{user.login}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-text-disabled)" }}>
              {user.public_repos} public · {user.private_repos} private repos
            </p>
          </div>
          <button
            onClick={() => {
              clearToken();
              addToast("info", "Disconnected from GitHub");
            }}
            style={{
              background: "transparent",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "6px 12px",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "rgba(232,82,90,0.1)",
            border: "1px solid rgba(232,82,90,0.3)",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            color: "#E8525A",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {/* Repos list */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          style={{
            flex: 1,
            background: "var(--color-bg-elevated)",
            border: "1px solid #535353",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "var(--color-text-primary)",
            fontSize: "13px",
            outline: "none",
            marginRight: "12px",
          }}
        />
        <button
          onClick={() => {
            fetchRepos();
          }}
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid #535353",
            borderRadius: "8px",
            padding: "8px 14px",
            color: "var(--color-text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          maxHeight: "500px",
          overflowY: "auto",
        }}
      >
        {loading ? (
          <p
            style={{
              color: "var(--color-text-disabled)",
              textAlign: "center",
              padding: "32px",
            }}
          >
            Loading repositories...
          </p>
        ) : filtered.length === 0 ? (
          <p
            style={{
              color: "var(--color-text-disabled)",
              textAlign: "center",
              padding: "32px",
            }}
          >
            No repositories found
          </p>
        ) : (
          filtered.map((repo) => (
            <div
              key={repo.id}
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--color-bg-card)",
                borderRadius: "8px",
                padding: "12px 14px",
                gap: "12px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {repo.name}
                  </span>
                  {repo.private && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        background: "rgba(245,166,35,0.2)",
                        color: "#F5A623",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      PRIVATE
                    </span>
                  )}
                  {repo.stargazers_count > 0 && (
                    <span style={{ fontSize: "12px", color: "var(--color-text-disabled)" }}>
                      ⭐ {repo.stargazers_count}
                    </span>
                  )}
                </div>
                {repo.description && (
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {repo.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleClone(repo)}
                style={{
                  background: "#1DB954",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  color: "#000",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Clone
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
