// Parses `git diff` output into a per-file summary the agent (and the baseline) can use as evidence.

export type DiffFile = {
    path: string; // path after the change (the new path for renames)
    oldPath: string | undefined; // only set for renames
    status: "added" | "deleted" | "modified" | "renamed";
    additions: number;
    deletions: number;
    binary: boolean;
    hunks: string[]; // the "@@ -a,b +c,d @@ ..." header lines
  };
  
  export function parseDiff(text: string): DiffFile[] {
    const files: DiffFile[] = [];
    let cur: DiffFile | undefined;
    // Once we are inside a hunk, EVERY line starting with + or - is content. (Header lines "--- a/x" and
    // "+++ b/x" only appear before the first hunk, so a content line like "++i" is never miscounted.)
    let inHunk = false;
  
    for (const line of text.split("\n")) {
      const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (header) {
        cur = { path: header[2]!, oldPath: undefined, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
        files.push(cur);
        inHunk = false;
        continue;
      }
      if (!cur) continue;
  
      if (line.startsWith("@@")) {
        cur.hunks.push(line);
        inHunk = true;
      } else if (inHunk) {
        if (line.startsWith("+")) cur.additions++;
        else if (line.startsWith("-")) cur.deletions++;
        // " " context lines and "\ No newline at end of file" are ignored
      } else if (line.startsWith("new file mode")) cur.status = "added";
      else if (line.startsWith("deleted file mode")) cur.status = "deleted";
      else if (line.startsWith("rename from ")) {
        cur.status = "renamed";
        cur.oldPath = line.slice("rename from ".length);
      } else if (line.startsWith("rename to ")) cur.path = line.slice("rename to ".length);
      else if (line.startsWith("Binary files ")) cur.binary = true;
    }
    return files;
  }
  
  /** Paths touched by the PR, for example to label `rootCauseInDiff` or to build a short summary. */
  export const changedPaths = (files: readonly DiffFile[]): string[] => files.map((f) => f.path);