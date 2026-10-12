"""Commit archive docs and push branch tip to GitHub via API (git HTTPS times out)."""
from __future__ import annotations

import base64
import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

cwd = Path(r"c:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo")
owner = "Winterwhite11"
repo = "fantacy-breakdown-godot-demo"
BRANCH = "feature/2026-10-12-card-economy"


def run(args: list[str]) -> str:
    r = subprocess.run(
        args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if r.returncode != 0:
        raise RuntimeError(f"{args} -> {r.stderr}")
    return (r.stdout or "").strip()


def run_bytes(args: list[str]) -> bytes:
    r = subprocess.run(args, cwd=cwd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"{args} -> {r.stderr!r}")
    return r.stdout


def get_token() -> str:
    r = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        cwd=cwd,
    )
    token = ""
    for line in (r.stdout or "").splitlines():
        if line.startswith("password="):
            token = line.split("=", 1)[1].strip()
    if not token:
        raise RuntimeError("no github token")
    return token


def api(token: str, method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "fantacy-breakdown-wave-upload",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"API {method} {path} -> {e.code}: {err[:800]}") from e


def local_commit_archive() -> str:
    status = run(["git", "status", "--porcelain"])
    if not status:
        print("nothing to commit")
        return run(["git", "rev-parse", "HEAD"])

    run(["git", "add", "-A"])
    msg = (
        "Archive card-economy wave and push handoff snapshot.\n\n"
        "Full --all snapshot under game-design-workflow/archive plus docs archive "
        "and decision-log for the 2026-10-12~13 optimization wave."
    )
    msg_path = cwd / ".git" / "COMMIT_MSG_WAVE.tmp"
    msg_path.write_text(msg, encoding="utf-8")
    try:
        subprocess.run(
            ["git", "commit", "-F", str(msg_path)],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    finally:
        msg_path.unlink(missing_ok=True)
    sha = run(["git", "rev-parse", "HEAD"])
    print("committed", sha[:8])
    return sha


def push_tip(token: str, local_sha: str) -> str:
    remote_main = api(token, "GET", f"/repos/{owner}/{repo}/git/ref/heads/main")
    remote_sha = remote_main["object"]["sha"]
    print("remote main", remote_sha[:8], "local", local_sha[:8])

    parent_commit = api(token, "GET", f"/repos/{owner}/{repo}/git/commits/{remote_sha}")
    base_tree = parent_commit["tree"]["sha"]

    # All paths that differ from main (A/M/D)
    diff = run(["git", "diff", "--name-status", f"{remote_sha}..{local_sha}"])
    tree_items = []
    for line in diff.splitlines():
        if not line.strip():
            continue
        status, path = line.split("\t", 1)
        # renames: R100\told\tnew — treat as delete+add if present
        if status.startswith("R") or status.startswith("C"):
            parts = line.split("\t")
            if len(parts) >= 3:
                tree_items.append({"path": parts[1], "mode": "100644", "type": "blob", "sha": None})
                path = parts[2]
                status = "A"
        if status.startswith("D"):
            tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        ls = run(["git", "ls-tree", local_sha, "--", path])
        if not ls:
            print(" skip missing", path)
            continue
        mode = ls.split()[0]
        raw = run_bytes(["git", "cat-file", "-p", f"{local_sha}:{path}"])
        created = api(
            token,
            "POST",
            f"/repos/{owner}/{repo}/git/blobs",
            {"content": base64.b64encode(raw).decode("ascii"), "encoding": "base64"},
        )
        tree_items.append(
            {"path": path, "mode": mode, "type": "blob", "sha": created["sha"]}
        )
        print(" blob", status, path)

    print("tree items", len(tree_items))
    tree = api(
        token,
        "POST",
        f"/repos/{owner}/{repo}/git/trees",
        {"base_tree": base_tree, "tree": tree_items},
    )
    msg = run(["git", "log", "-1", "--format=%B", local_sha])
    # Prefer a wave summary commit message for the remote tip merge
    wave_msg = (
        "Merge feature/2026-10-12-card-economy: economy, market, summons, art tools.\n\n"
        "Includes card pricing, free-market restock, summon targeting, pixel pieces/"
        "terrain, 151 automated tests, CURSOR-README handoff, and full archive snapshot."
    )
    commit = api(
        token,
        "POST",
        f"/repos/{owner}/{repo}/git/commits",
        {
            "message": wave_msg,
            "tree": tree["sha"],
            "parents": [remote_sha],
        },
    )
    new_sha = commit["sha"]
    print("remote commit", new_sha)

    # Update main (fast-forward content) and feature branch tip
    api(
        token,
        "PATCH",
        f"/repos/{owner}/{repo}/git/refs/heads/main",
        {"sha": new_sha, "force": False},
    )
    print("updated main")

    # Create or update feature branch
    try:
        api(token, "GET", f"/repos/{owner}/{repo}/git/ref/heads/{BRANCH}")
        api(
            token,
            "PATCH",
            f"/repos/{owner}/{repo}/git/refs/heads/{BRANCH}",
            {"sha": new_sha, "force": True},
        )
        print("updated", BRANCH)
    except RuntimeError as e:
        if "404" in str(e):
            api(
                token,
                "POST",
                f"/repos/{owner}/{repo}/git/refs",
                {"ref": f"refs/heads/{BRANCH}", "sha": new_sha},
            )
            print("created", BRANCH)
        else:
            raise

    # Align local remote-tracking refs (fetch may time out)
    subprocess.run(
        ["git", "update-ref", "refs/remotes/origin/main", new_sha], cwd=cwd, check=False
    )
    subprocess.run(
        ["git", "update-ref", f"refs/remotes/origin/{BRANCH}", new_sha],
        cwd=cwd,
        check=False,
    )
    return new_sha


def main() -> None:
    local_sha = local_commit_archive()
    token = get_token()
    remote_sha = push_tip(token, local_sha)
    print("DONE remote=", remote_sha)
    print("main https://github.com/{}/{}/commit/{}".format(owner, repo, remote_sha))
    print(
        "branch https://github.com/{}/{}/tree/{}".format(owner, repo, BRANCH)
    )


if __name__ == "__main__":
    main()
