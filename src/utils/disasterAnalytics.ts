/**
 * Disaster Analytics Engine
 * Real-time analysis of disaster grid data for intelligent emergency response
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisasterNode {
  node_id: string;
  device_type: string;
  latitude: number;
  longitude: number;
  battery_level: number;
  status: 'active' | 'inactive' | 'emergency' | 'offline';
  signal_strength: number;
  last_seen: string;
  registered: string;
}

export interface BatteryCriticality {
  level: 'critical' | 'warning' | 'stable';
  threshold: number;
  estimated_time_to_failure: number; // in hours
  action: string;
}

export interface SectorAnalysis {
  sector_id: string;
  device_count: number;
  density: number; // devices per km²
  primary_device_types: string[];
  emergency_implications: string;
  coordinates: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  };
}

export interface BatteryDrainProjection {
  scenario: 'normal' | 'emergency' | 'optimized';
  drain_rate: number; // % per hour
  network_survival_time: number; // in hours
  critical_failure_time: number; // in hours
}

export interface RoutingRecommendation {
  node_id: string;
  action: 'primary' | 'secondary' | 'exclude' | 'preserve';
  reason: string;
  priority: number;
}

export interface EmergencyResponseProtocol {
  priority: number;
  action: string;
  target_sector?: string;
  timeline: string;
  resource_requirement: string;
}

export interface DisasterAnalytics {
  battery_criticality: {
    critical: DisasterNode[];
    warning: DisasterNode[];
    stable: DisasterNode[];
    statistics: {
      total: number;
      critical_percentage: number;
      warning_percentage: number;
      stable_percentage: number;
    };
  };
  density_mapping: SectorAnalysis[];
  network_sustainability: {
    current_state: {
      average_battery: number;
      total_energy: number;
      active_devices: number;
      critical_devices: number;
    };
    projections: BatteryDrainProjection[];
    core_routing_analysis: {
      top_candidates: DisasterNode[];
      network_failure_timeline: number;
    };
  };
  routing_optimization: RoutingRecommendation[];
  emergency_protocol: EmergencyResponseProtocol[];
}

// ─── Battery Criticality Analysis ──────────────────────────────────────────────

function analyzeBatteryCriticality(nodes: DisasterNode[]): DisasterAnalytics['battery_criticality'] {
  const critical: DisasterNode[] = [];
  const warning: DisasterNode[] = [];
  const stable: DisasterNode[] = [];

  nodes.forEach(node => {
    if (node.battery_level < 20) {
      critical.push(node);
    } else if (node.battery_level < 30) {
      warning.push(node);
    } else {
      stable.push(node);
    }
  });

  const total = nodes.length;
  const statistics = {
    total,
    critical_percentage: (critical.length / total) * 100,
    warning_percentage: (warning.length / total) * 100,
    stable_percentage: (stable.length / total) * 100,
  };

  return { critical, warning, stable, statistics };
}

function getBatteryCriticality(node: DisasterNode): BatteryCriticality {
  if (node.battery_level < 15) {
    return {
      level: 'critical',
      threshold: 15,
      estimated_time_to_failure: 0.5, // 30 minutes
      action: 'Exclude from routing tables. Preserve for SOS transmission only.',
    };
  } else if (node.battery_level < 20) {
    return {
      level: 'critical',
      threshold: 20,
      estimated_time_to_failure: 1.0, // 1 hour
      action: 'Use only as last-resort routing nodes. Limit to 1-2 hops maximum.',
    };
  } else if (node.battery_level < 30) {
    return {
      level: 'warning',
      threshold: 30,
      estimated_time_to_failure: 2.0, // 2 hours
      action: 'Use as secondary routing nodes. Monitor battery drain closely.',
    };
  } else {
    return {
      level: 'stable',
      threshold: 30,
      estimated_time_to_failure: 8.0, // 8+ hours
      action: 'Primary routing candidate. Full participation in mesh network.',
    };
  }
}

// ─── Sector Density Mapping ───────────────────────────────────────────────────

function analyzeSectorDensity(nodes: DisasterNode[]): SectorAnalysis[] {
  if (nodes.length === 0) return [];

  // Calculate grid bounds
  const lats = nodes.map(n => n.latitude);
  const lngs = nodes.map(n => n.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Divide into 4 sectors (2x2 grid)
  const latRange = (maxLat - minLat) / 2;
  const lngRange = (maxLng - minLng) / 2;

  const sectors: SectorAnalysis[] = [];
  const sectorLabels = ['NE', 'NW', 'SE', 'SW'];

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const sectorMinLat = minLat + i * latRange;
      const sectorMaxLat = minLat + (i + 1) * latRange;
      const sectorMinLng = minLng + j * lngRange;
      const sectorMaxLng = minLng + (j + 1) * lngRange;

      const sectorNodes = nodes.filter(n =>
        n.latitude >= sectorMinLat && n.latitude < sectorMaxLat &&
        n.longitude >= sectorMinLng && n.longitude < sectorMaxLng
      );

      const deviceTypes = sectorNodes.map(n => n.device_type);
      const typeCounts = deviceTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const primaryDeviceTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type);

      const sectorArea = latRange * lngRange * 111 * 111; // Approximate km²
      const density = sectorNodes.length / sectorArea;

      let emergencyImplications = 'Medium density area';
      if (density > 50) {
        emergencyImplications = 'HIGH DENSITY - Primary survivor cluster. Deploy rescue teams first.';
      } else if (density > 30) {
        emergencyImplications = 'Medium-high density. Consider for secondary response.';
      } else if (density < 10) {
        emergencyImplications = 'Low density. Isolated survivor groups.';
      }

      sectors.push({
        sector_id: sectorLabels[i * 2 + j],
        device_count: sectorNodes.length,
        density: Math.round(density),
        primary_device_types,
        emergency_implications,
        coordinates: {
          min_lat: sectorMinLat,
          max_lat: sectorMaxLat,
          min_lng: sectorMinLng,
          max_lng: sectorMaxLng,
        },
      });
    }
  }

  return sectors.sort((a, b) => b.device_count - a.device_count);
}

// ─── Network Sustainability Analysis ──────────────────────────────────────────

function calculateBatteryDrainProjections(nodes: DisasterNode[]): BatteryDrainProjection[] {
  const averageBattery = nodes.reduce((sum, n) => sum + n.battery_level, 0) / nodes.length;

  return [
    {
      scenario: 'normal',
      drain_rate: 0.5, // % per hour
      network_survival_time: Math.max(0, (averageBattery - 20) / 0.5),
      critical_failure_time: Math.max(0, (averageBattery - 20) / 0.5 * 0.8),
    },
    {
      scenario: 'emergency',
      drain_rate: 3.0, // % per hour
      network_survival_time: Math.max(0, (averageBattery - 20) / 3.0),
      critical_failure_time: Math.max(0, (averageBattery - 20) / 3.0 * 0.6),
    },
    {
      scenario: 'optimized',
      drain_rate: 1.0, // % per hour (variable based on battery)
      network_survival_time: Math.max(0, (averageBattery - 20) / 1.0),
      critical_failure_time: Math.max(0, (averageBattery - 20) / 1.0 * 0.9),
    },
  ];
}

function analyzeCoreRoutingDevices(nodes: DisasterNode[]): DisasterNode[] {
  // Filter for active devices with good signal and battery
  return nodes
    .filter(n => n.status === 'active' && n.signal_strength > 50)
    .sort((a, b) => {
      // Sort by battery + signal combination
      const scoreA = a.battery_level * 0.6 + a.signal_strength * 0.4;
      const scoreB = b.battery_level * 0.6 + b.signal_strength * 0.4;
      return scoreB - scoreA;
    })
    .slice(0, 10);
}

// ─── AI Routing Optimization ───────────────────────────────────────────────────

function generateRoutingRecommendations(nodes: DisasterNode[]): RoutingRecommendation[] {
  const recommendations: RoutingRecommendation[] = [];

  nodes.forEach(node => {
    const criticality = getBatteryCriticality(node);

    if (criticality.level === 'critical' && node.device_type === 'Emergency Beacon') {
      recommendations.push({
        node_id: node.node_id,
        action: 'preserve',
        reason: 'Emergency beacon with critical battery - preserve for SOS only',
        priority: 1,
      });
    } else if (criticality.level === 'critical') {
      recommendations.push({
        node_id: node.node_id,
        action: 'exclude',
        reason: 'Critical battery level - exclude from routing',
        priority: 2,
      });
    } else if (criticality.level === 'warning') {
      recommendations.push({
        node_id: node.node_id,
        action: 'secondary',
        reason: 'Warning battery level - use as secondary routing node',
        priority: 3,
      });
    } else if (node.battery_level > 60 && node.signal_strength > 70) {
      recommendations.push({
        node_id: node.node_id,
        action: 'primary',
        reason: 'High battery and signal - primary routing candidate',
        priority: 4,
      });
    } else {
      recommendations.push({
        node_id: node.node_id,
        action: 'secondary',
        reason: 'Stable battery - standard routing node',
        priority: 5,
      });
    }
  });

  return recommendations.sort((a, b) => a.priority - b.priority);
}

// ─── Emergency Response Protocol ──────────────────────────────────────────────

function generateEmergencyProtocol(
  batteryAnalysis: DisasterAnalytics['battery_criticality'],
  densityMapping: SectorAnalysis[],
  projections: BatteryDrainProjection[]
): EmergencyResponseProtocol[] {
  const protocols: EmergencyResponseProtocol[] = [];

  // Priority 1: Critical battery devices
  if (batteryAnalysis.critical.length > 0) {
    protocols.push({
      priority: 1,
      action: 'Deploy battery packs to critical nodes',
      timeline: 'Immediate (0-2 hours)',
      resource_requirement: `${batteryAnalysis.critical.length} portable battery packs`,
    });
  }

  // Priority 2: High density sector response
  const highDensitySector = densityMapping.find(s => s.density > 50);
  if (highDensitySector) {
    protocols.push({
      priority: 2,
      action: 'Deploy search & rescue team to high-density sector',
      target_sector: highDensitySector.sector_id,
      timeline: 'Immediate (0-2 hours)',
      resource_requirement: 'Search & rescue team + medical supplies',
    });
  }

  // Priority 3: Network sustainability
  const emergencyProjection = projections.find(p => p.scenario === 'emergency');
  if (emergencyProjection && emergencyProjection.network_survival_time < 8) {
    protocols.push({
      priority: 3,
      action: 'Implement AI-optimized routing to extend network lifetime',
      timeline: 'Short-term (2-8 hours)',
      resource_requirement: 'Software configuration update',
    });
  }

  // Priority 4: Emergency beacon preservation
  const emergencyBeacons = batteryAnalysis.critical.filter(
    n => n.device_type === 'Emergency Beacon'
  );
  if (emergencyBeacons.length > 0) {
    protocols.push({
      priority: 4,
      action: 'Switch emergency beacons to SOS-only mode',
      timeline: 'Immediate (0-2 hours)',
      resource_requirement: 'Remote configuration command',
    });
  }

  // Priority 5: Network rebalancing
  protocols.push({
    priority: 5,
    action: 'Rotate routing nodes based on battery levels',
    timeline: 'Long-term (8-24 hours)',
    resource_requirement: 'Automated routing algorithm',
  });

  return protocols.sort((a, b) => a.priority - b.priority);
}

// ─── Main Analytics Function ──────────────────────────────────────────────────

export function analyzeDisasterGrid(nodes: DisasterNode[]): DisasterAnalytics {
  const batteryCriticality = analyzeBatteryCriticality(nodes);
  const densityMapping = analyzeSectorDensity(nodes);
  const projections = calculateBatteryDrainProjections(nodes);
  const coreRoutingDevices = analyzeCoreRoutingDevices(nodes);
  const routingOptimization = generateRoutingRecommendations(nodes);
  const emergencyProtocol = generateEmergencyProtocol(
    batteryCriticality,
    densityMapping,
    projections
  );

  const current_state = {
    average_battery: nodes.reduce((sum, n) => sum + n.battery_level, 0) / nodes.length,
    total_energy: nodes.reduce((sum, n) => sum + n.battery_level, 0),
    active_devices: nodes.filter(n => n.status === 'active').length,
    critical_devices: batteryCriticality.critical.length,
  };

  return {
    battery_criticality,
    density_mapping: densityMapping,
    network_sustainability: {
      current_state,
      projections,
      core_routing_analysis: {
        top_candidates: coreRoutingDevices,
        network_failure_timeline: projections[0].network_survival_time,
      },
    },
    routing_optimization: routingOptimization,
    emergency_protocol: emergencyProtocol,
  };
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

export function formatTimeToFailure(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  return `${Math.round(hours)} hours`;
}

export function getCriticalityColor(level: string): string {
  switch (level) {
    case 'critical':
      return '#EF4444';
    case 'warning':
      return '#F97316';
    case 'stable':
      return '#22C55E';
    default:
      return '#7B9CC4';
  }
}

export function getActionColor(action: string): string {
  switch (action) {
    case 'primary':
      return '#22C55E';
    case 'secondary':
      return '#3B82F6';
    case 'exclude':
      return '#EF4444';
    case 'preserve':
      return '#F97316';
    default:
      return '#7B9CC4';
  }
}
