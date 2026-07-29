/**
 * MeshNet-AI — routing.ts
 * =======================
 * P2P mesh routing engine ported from Python to TypeScript
 * 
 * Algorithm overview:
 * 1. Filter — discard nodes with battery ≤ 15% or inactive flag
 * 2. Score — composite routing weight based on battery, weather HQ, device type
 * 3. Sort — descending by score (best relay nodes first)
 * 4. Path — greedy shortest-path from sorted list
 */

// ── Routing weight constants ──────────────────────────────────────────────────
const W_BATTERY = 0.35;      // battery health weight
const W_WEATHER_HQ = 0.50;   // absolute Weather-HQ signal weight
const W_DEVICE = 0.15;       // device capability tier weight

const BATTERY_THRESHOLD = 15.0; // percent — nodes at or below this are filtered out

// ── Device-type capability tiers ─────────────────────────────────────────────
const DEVICE_TYPE_TIER: Record<string, number> = {
  gateway: 1.0,      // dedicated mesh gateway
  relay: 0.85,       // purpose-built relay node
  smartphone: 0.70,  // common mobile device
  tablet: 0.65,
  iot: 0.40,         // resource-constrained sensor node
  unknown: 0.30,
};

// ── Data model ────────────────────────────────────────────────────────────────

export interface MeshNode {
  node_id: string;
  battery_level: number;
  is_active: boolean;
  device_type?: string;
  has_weather_hq_signal?: boolean;
  lat?: number;
  lon?: number;
  routing_score?: number; // Computed by router
}

export interface RoutingResult {
  stable_nodes: MeshNode[];
  optimal_path: string[];
  hq_anchor: string | null;
  path_quality: number;
  rejected_count: number;
}

// ── Routing engine ────────────────────────────────────────────────────────────

export class RoutingEngine {
  /**
   * Run the full routing pipeline on nodes.
   */
  compute(nodes: MeshNode[]): RoutingResult {
    const originalCount = nodes.length;

    // Step 1 – filter
    const stable = this.filterStable(nodes);
    const rejected = originalCount - stable.length;
    console.log(`[ROUTING] ${stable.length}/${originalCount} nodes passed stability filter.`);

    if (stable.length === 0) {
      console.warn('[ROUTING] No stable nodes — returning empty result.');
      return {
        stable_nodes: [],
        optimal_path: [],
        hq_anchor: null,
        path_quality: 0.0,
        rejected_count: rejected,
      };
    }

    // Step 2 – score
    for (const node of stable) {
      node.routing_score = this.scoreNode(node);
    }

    // Step 3 – sort
    stable.sort((a, b) => (b.routing_score || 0) - (a.routing_score || 0));

    // Step 4 – build path
    const path = this.buildPath(stable);

    // Identify Weather-HQ anchor
    const hqAnchor = stable.find(n => n.has_weather_hq_signal)?.node_id || null;

    // Aggregate path quality
    const pathQuality = this.pathQuality(stable, path);

    const result: RoutingResult = {
      stable_nodes: stable,
      optimal_path: path,
      hq_anchor: hqAnchor,
      path_quality: pathQuality,
      rejected_count: rejected,
    };

    console.log(
      `[ROUTING] Path computed: ${path.length} hops | quality=${pathQuality.toFixed(3)} | HQ_anchor=${hqAnchor}`
    );

    return result;
  }

  /**
   * Return nodes that are:
   * • is_active == true
   * • battery_level > BATTERY_THRESHOLD (strict >)
   */
  private filterStable(nodes: MeshNode[]): MeshNode[] {
    return nodes.filter(
      n => n.is_active && n.battery_level > BATTERY_THRESHOLD
    );
  }

  /**
   * Compute composite routing score in [0, 1].
   * Formula:
   *   score = W_BATTERY * (battery / 100)
   *         + W_WEATHER_HQ * (1 if has_weather_hq_signal else 0)
   *         + W_DEVICE * device_tier
   */
  private scoreNode(node: MeshNode): number {
    const batNorm = Math.max(0, Math.min(node.battery_level / 100.0, 1.0));
    const hqBonus = node.has_weather_hq_signal ? 1.0 : 0.0;
    const deviceType = (node.device_type || 'unknown').toLowerCase();
    const deviceTier = DEVICE_TYPE_TIER[deviceType] || DEVICE_TYPE_TIER.unknown;

    const score =
      W_BATTERY * batNorm +
      W_WEATHER_HQ * hqBonus +
      W_DEVICE * deviceTier;

    return Math.round(score * 10000) / 10000;
  }

  /**
   * Greedy hop-chain construction.
   * Strategy:
   * • Always start from the highest-scored node
   * • Append the next node whose geographic distance to the current tail is minimised
   * • If no coordinate data is available, fall back to score-rank order
   */
  private buildPath(sortedNodes: MeshNode[]): string[] {
    if (sortedNodes.length === 0) return [];

    const remaining = [...sortedNodes];
    const path: MeshNode[] = [remaining.shift()!]; // best-scored node is the source

    while (remaining.length > 0) {
      const tail = path[path.length - 1];
      
      // Use geo-distance if coordinates are meaningful
      const useGeo = remaining.some(n => (n.lat !== 0 || n.lon !== 0));
      
      let nextNode: MeshNode;
      if (useGeo) {
        nextNode = remaining.reduce((min, n) => {
          const dist = this.haversine(tail.lat || 0, tail.lon || 0, n.lat || 0, n.lon || 0);
          const minDist = this.haversine(tail.lat || 0, tail.lon || 0, min.lat || 0, min.lon || 0);
          return dist < minDist ? n : min;
        });
      } else {
        // No coordinates — pick next in score-rank order
        nextNode = remaining[0];
      }

      path.push(nextNode);
      const idx = remaining.indexOf(nextNode);
      remaining.splice(idx, 1);
    }

    return path.map(n => n.node_id);
  }

  /**
   * Compute mean routing score of path nodes normalised to [0, 1].
   */
  private pathQuality(stable: MeshNode[], path: string[]): number {
    const scoreMap = new Map<string, number>();
    for (const n of stable) {
      if (n.node_id && n.routing_score !== undefined) {
        scoreMap.set(n.node_id, n.routing_score);
      }
    }

    const scores: number[] = [];
    for (const nid of path) {
      const score = scoreMap.get(nid);
      if (score !== undefined) {
        scores.push(score);
      }
    }

    return scores.length > 0 
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000
      : 0.0;
  }

  /**
   * Return the great-circle distance in kilometres between two WGS-84 coordinates
   * using the Haversine formula.
   */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371.0; // Earth's mean radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.asin(Math.sqrt(a));
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// ── Mock topology factory (for testing) ─────────────────────────────────────

export function mockTopology(): MeshNode[] {
  return [
    {
      node_id: 'NODE-A1',
      battery_level: 87.0,
      is_active: true,
      device_type: 'gateway',
      has_weather_hq_signal: true,
      lat: 34.0522,
      lon: -118.2437,
    },
    {
      node_id: 'NODE-B2',
      battery_level: 62.0,
      is_active: true,
      device_type: 'relay',
      has_weather_hq_signal: false,
      lat: 34.0600,
      lon: -118.2500,
    },
    {
      node_id: 'NODE-C3',
      battery_level: 11.0,
      is_active: true, // ← FILTERED
      device_type: 'smartphone',
      has_weather_hq_signal: false,
      lat: 34.0450,
      lon: -118.2300,
    },
    {
      node_id: 'NODE-D4',
      battery_level: 76.0,
      is_active: true,
      device_type: 'smartphone',
      has_weather_hq_signal: true,
      lat: 34.0700,
      lon: -118.2600,
    },
    {
      node_id: 'NODE-E5',
      battery_level: 45.0,
      is_active: false, // ← FILTERED
      device_type: 'tablet',
      has_weather_hq_signal: false,
      lat: 34.0550,
      lon: -118.2350,
    },
    {
      node_id: 'NODE-F6',
      battery_level: 93.0,
      is_active: true,
      device_type: 'gateway',
      has_weather_hq_signal: false,
      lat: 34.0480,
      lon: -118.2550,
    },
    {
      node_id: 'NODE-G7',
      battery_level: 33.0,
      is_active: true,
      device_type: 'iot',
      has_weather_hq_signal: false,
      lat: 34.0620,
      lon: -118.2420,
    },
    {
      node_id: 'NODE-H8',
      battery_level: 8.0,
      is_active: true, // ← FILTERED
      device_type: 'smartphone',
      has_weather_hq_signal: false,
      lat: 34.0510,
      lon: -118.2460,
    },
    {
      node_id: 'NODE-I9',
      battery_level: 55.0,
      is_active: true,
      device_type: 'relay',
      has_weather_hq_signal: false,
      lat: 34.0590,
      lon: -118.2480,
    },
    {
      node_id: 'NODE-J10',
      battery_level: 70.0,
      is_active: true,
      device_type: 'tablet',
      has_weather_hq_signal: false,
      lat: 34.0530,
      lon: -118.2510,
    },
    {
      node_id: 'NODE-K11',
      battery_level: 19.0,
      is_active: true,
      device_type: 'iot',
      has_weather_hq_signal: false,
      lat: 34.0640,
      lon: -118.2390,
    },
    {
      node_id: 'NODE-L12',
      battery_level: 82.0,
      is_active: true,
      device_type: 'smartphone',
      has_weather_hq_signal: false,
      lat: 34.0560,
      lon: -118.2530,
    },
  ];
}
