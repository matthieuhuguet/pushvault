import type { CommitInfo } from "../types";

/**
 * Compute graph lanes for a linear list of commits.
 * Each commit gets a lane (column index) and connection info
 * for rendering branch/merge lines.
 */

export interface GraphNode {
  hash: string;
  lane: number;
  isMerge: boolean;
  parentLanes: number[];  // lanes of parents in this row (for drawing lines down)
  connectionsDown: { fromLane: number; toLane: number }[];  // lines going down to next row
  maxLane: number;  // max lane used at this row (for sizing)
}

const LANE_COLORS = [
  "var(--color-accent)",
  "#A78BFA",   // purple
  "#3B82F6",   // blue
  "#F59E0B",   // amber
  "#EC4899",   // pink
  "#14B8A6",   // teal
  "#F97316",   // orange
  "#EF4444",   // red
  "#8B5CF6",   // violet
  "#06B6D4",   // cyan
];

export function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

export function computeGraphLanes(commits: CommitInfo[]): GraphNode[] {
  if (commits.length === 0) return [];

  // Active lanes: each lane tracks which commit hash it's "waiting for"
  // A lane is occupied when we're expecting a parent commit to appear
  const activeLanes: (string | null)[] = [];
  const result: GraphNode[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const parents = commit.parent_hashes ?? [];
    const isMerge = parents.length > 1;

    // Find which lane this commit occupies (if any lane is waiting for it)
    let myLane = activeLanes.indexOf(commit.hash);

    if (myLane === -1) {
      // This commit isn't expected by any lane — assign it to the first free lane
      myLane = activeLanes.indexOf(null);
      if (myLane === -1) {
        myLane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Clear this lane (we found the commit it was waiting for)
    activeLanes[myLane] = null;

    // Assign parents to lanes
    const parentLanes: number[] = [];
    const connectionsDown: { fromLane: number; toLane: number }[] = [];

    for (let p = 0; p < parents.length; p++) {
      const parentHash = parents[p];

      // Check if another lane is already waiting for this parent
      const existingLane = activeLanes.indexOf(parentHash);

      if (existingLane !== -1) {
        // Another lane already expects this parent — draw a merge line
        parentLanes.push(existingLane);
        connectionsDown.push({ fromLane: myLane, toLane: existingLane });
      } else if (p === 0) {
        // First parent goes in our lane (continue straight down)
        activeLanes[myLane] = parentHash;
        parentLanes.push(myLane);
        connectionsDown.push({ fromLane: myLane, toLane: myLane });
      } else {
        // Additional parents get new lanes (branch merge)
        let freeLane = activeLanes.indexOf(null);
        if (freeLane === -1) {
          freeLane = activeLanes.length;
          activeLanes.push(null);
        }
        activeLanes[freeLane] = parentHash;
        parentLanes.push(freeLane);
        connectionsDown.push({ fromLane: myLane, toLane: freeLane });
      }
    }

    // Also draw continuation lines for lanes that pass through this row
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] !== null && l !== myLane && !parentLanes.includes(l)) {
        connectionsDown.push({ fromLane: l, toLane: l });
      }
    }

    // Trim trailing nulls from activeLanes for maxLane calculation
    let maxLane = 0;
    for (let l = activeLanes.length - 1; l >= 0; l--) {
      if (activeLanes[l] !== null || l === myLane) {
        maxLane = l;
        break;
      }
    }

    result.push({
      hash: commit.hash,
      lane: myLane,
      isMerge,
      parentLanes,
      connectionsDown,
      maxLane,
    });
  }

  return result;
}
