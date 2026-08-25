#!/usr/bin/env python3
import base64, csv, hashlib, io, os, pathlib, re, subprocess, sys, urllib.request

CSV_URL = "https://docs.google.com/spreadsheets/d/1whhUZpaIw8SiG_OExJiFA6BSM4tOljfiqcntS9omR7E/gviz/tq?tqx=out:csv&sheet=queue"
SAFE_PREFIXES = ("src/", "visual_acceptance/", "scripts/r663_", ".github/workflows/r663-")

def sh(*args, check=True):
    return subprocess.run(args, check=check, text=True, capture_output=True)

def emit(name, value):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")

def fetch_rows():
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "OT-R663-Autopilot/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8-sig")
    if "<html" in raw.lower():
        raise RuntimeError("Queue is not publicly readable. Set Sheet sharing to Anyone with the link / Viewer.")
    return list(csv.DictReader(io.StringIO(raw)))

def patch_paths(patch_text):
    paths = set()
    for line in patch_text.splitlines():
        if line.startswith("+++ b/") or line.startswith("--- a/"):
            p = line[6:].strip()
            if p != "/dev/null":
                paths.add(p)
    return paths

def main():
    emit("pending", "false")
    rows = fetch_rows()
    groups = {}
    for row in rows:
        gid = (row.get("generation_id") or "").strip()
        state = (row.get("state") or "").strip().upper()
        if gid and state == "PENDING":
            groups.setdefault(gid, []).append(row)

    for gid, items in sorted(groups.items(), key=lambda kv: (kv[1][0].get("created_at") or "", kv[0])):
        marker = pathlib.Path(".r663_queue/applied") / gid
        if marker.exists():
            continue

        first = items[0]
        base_sha = (first.get("base_sha") or "").strip()
        current_sha = sh("git", "rev-parse", "HEAD").stdout.strip()
        if not base_sha or base_sha != current_sha:
            print(f"QUEUE_SKIP {gid}: base mismatch queue={base_sha} head={current_sha}")
            continue

        ordered = sorted(items, key=lambda r: int(r.get("chunk_index") or "0"))
        expected_count = int(first.get("chunk_count") or "0")
        if expected_count != len(ordered):
            raise RuntimeError(f"{gid}: chunk count mismatch expected={expected_count} actual={len(ordered)}")

        b64 = "".join(r.get("patch_b64_chunk") or "" for r in ordered)
        patch = base64.b64decode(b64, validate=True)
        got_sha = hashlib.sha256(patch).hexdigest()
        want_sha = (first.get("patch_sha256") or "").strip().lower()
        if got_sha != want_sha:
            raise RuntimeError(f"{gid}: sha256 mismatch")

        text = patch.decode("utf-8")
        paths = patch_paths(text)
        declared = {p for p in (first.get("allowed_paths") or "").split("|") if p}
        if not paths or not paths.issubset(declared):
            raise RuntimeError(f"{gid}: patch paths {sorted(paths)} exceed declared whitelist {sorted(declared)}")
        if any(not p.startswith(SAFE_PREFIXES) or ".." in pathlib.PurePosixPath(p).parts for p in paths):
            raise RuntimeError(f"{gid}: unsafe path")

        patch_file = pathlib.Path("/tmp/r663.patch")
        patch_file.write_bytes(patch)
        sh("git", "apply", "--check", str(patch_file))
        sh("git", "apply", str(patch_file))

        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(got_sha + "\n", encoding="utf-8")

        emit("pending", "true")
        emit("generation_id", gid)
        emit("commit_message", (first.get("commit_message") or f"R6.6.3 autopilot {gid}").replace("\n", " "))
        emit("patch_sha256", got_sha)
        print(f"QUEUE_APPLIED {gid} paths={sorted(paths)}")
        return

    print("QUEUE_EMPTY")

if __name__ == "__main__":
    main()
