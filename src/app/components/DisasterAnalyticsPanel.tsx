/**
 * Disaster Analytics Panel
 * Real-time disaster grid analysis visualization
 */

import { useState, useEffect } from 'react';
import { 
  Battery, 
  MapPin, 
  Network, 
  AlertTriangle, 
  Clock, 
  Zap,
  Users,
  Activity,
  TrendingDown,
  Shield
} from 'lucide-react';
import { 
  analyzeDisasterGrid, 
  DisasterNode, 
  DisasterAnalytics,
  formatTimeToFailure,
  getCriticalityColor,
  getActionColor
} from '../../utils/disasterAnalytics';

interface Props {
  nodes: DisasterNode[];
}

export default function DisasterAnalyticsPanel({ nodes }: Props) {
  const [analytics, setAnalytics] = useState<DisasterAnalytics | null>(null);
  const [activeTab, setActiveTab] = useState<'battery' | 'density' | 'network' | 'routing' | 'protocol'>('battery');

  useEffect(() => {
    if (nodes.length > 0) {
      setAnalytics(analyzeDisasterGrid(nodes));
    }
  }, [nodes]);

  if (!analytics) {
    return (
      <div className="p-4 text-center text-[#7B9CC4] text-sm">
        Loading analytics...
      </div>
    );
  }

  const tabs = [
    { id: 'battery' as const, label: 'Battery', icon: Battery },
    { id: 'density' as const, label: 'Density', icon: MapPin },
    { id: 'network' as const, label: 'Network', icon: Network },
    { id: 'routing' as const, label: 'Routing', icon: Activity },
    { id: 'protocol' as const, label: 'Protocol', icon: Shield },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Activity className="text-[#F97316]" size={20} />
          Disaster Analytics
        </h2>
        <div className="text-xs text-[#7B9CC4] font-mono">
          {nodes.length} devices analyzed
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[#F97316] text-white'
                : 'bg-[#0B1D3A] text-[#7B9CC4] hover:bg-[#132B4A]'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'battery' && <BatteryTab analytics={analytics} />}
        {activeTab === 'density' && <DensityTab analytics={analytics} />}
        {activeTab === 'network' && <NetworkTab analytics={analytics} />}
        {activeTab === 'routing' && <RoutingTab analytics={analytics} />}
        {activeTab === 'protocol' && <ProtocolTab analytics={analytics} />}
      </div>
    </div>
  );
}

// ─── Battery Tab ─────────────────────────────────────────────────────────────

function BatteryTab({ analytics }: { analytics: DisasterAnalytics }) {
  const { battery_criticality } = analytics;

  return (
    <div className="flex flex-col gap-4">
      {/* Statistics */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Critical"
          value={`${battery_criticality.statistics.critical_percentage.toFixed(1)}%`}
          color="#EF4444"
          icon={AlertTriangle}
        />
        <StatCard
          label="Warning"
          value={`${battery_criticality.statistics.warning_percentage.toFixed(1)}%`}
          color="#F97316"
          icon={Zap}
        />
        <StatCard
          label="Stable"
          value={`${battery_criticality.statistics.stable_percentage.toFixed(1)}%`}
          color="#22C55E"
          icon={Battery}
        />
      </div>

      {/* Critical Devices */}
      {battery_criticality.critical.length > 0 && (
        <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#EF4444]/30">
          <h3 className="text-xs font-bold text-[#EF4444] mb-2 flex items-center gap-2">
            <AlertTriangle size={14} />
            Critical Devices ({battery_criticality.critical.length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {battery_criticality.critical.slice(0, 5).map(node => (
              <DeviceCard key={node.node_id} node={node} />
            ))}
            {battery_criticality.critical.length > 5 && (
              <div className="text-xs text-[#7B9CC4] text-center">
                +{battery_criticality.critical.length - 5} more critical devices
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning Devices */}
      {battery_criticality.warning.length > 0 && (
        <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#F97316]/30">
          <h3 className="text-xs font-bold text-[#F97316] mb-2 flex items-center gap-2">
            <Zap size={14} />
            Warning Devices ({battery_criticality.warning.length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {battery_criticality.warning.slice(0, 5).map(node => (
              <DeviceCard key={node.node_id} node={node} />
            ))}
            {battery_criticality.warning.length > 5 && (
              <div className="text-xs text-[#7B9CC4] text-center">
                +{battery_criticality.warning.length - 5} more warning devices
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Density Tab ─────────────────────────────────────────────────────────────

function DensityTab({ analytics }: { analytics: DisasterAnalytics }) {
  const { density_mapping } = analytics;

  return (
    <div className="flex flex-col gap-4">
      {density_mapping.map(sector => (
        <div
          key={sector.sector_id}
          className="bg-[#0B1D3A] rounded-xl p-3 border border-[#7B9CC4]/20"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <MapPin size={14} />
              Sector {sector.sector_id}
            </h3>
            <div className="text-xs font-mono text-[#7B9CC4]">
              {sector.device_count} devices
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <div className="text-[10px] text-[#7B9CC4]">Density</div>
              <div className="text-sm font-bold text-white">
                {sector.density} devices/km²
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#7B9CC4]">Primary Types</div>
              <div className="text-xs text-white">
                {sector.primary_device_types.slice(0, 2).join(', ')}
              </div>
            </div>
          </div>

          <div className="text-[10px] text-[#7B9CC4] bg-[#132B4A] rounded p-2">
            {sector.emergency_implications}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Network Tab ─────────────────────────────────────────────────────────────

function NetworkTab({ analytics }: { analytics: DisasterAnalytics }) {
  const { network_sustainability } = analytics;

  return (
    <div className="flex flex-col gap-4">
      {/* Current State */}
      <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#7B9CC4]/20">
        <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
          <Network size={14} />
          Current Network State
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-[#7B9CC4]">Average Battery</div>
            <div className="text-sm font-bold text-white">
              {network_sustainability.current_state.average_battery.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#7B9CC4]">Active Devices</div>
            <div className="text-sm font-bold text-white">
              {network_sustainability.current_state.active_devices}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#7B9CC4]">Total Energy</div>
            <div className="text-sm font-bold text-white">
              {network_sustainability.current_state.total_energy.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#7B9CC4]">Critical Devices</div>
            <div className="text-sm font-bold text-[#EF4444]">
              {network_sustainability.current_state.critical_devices}
            </div>
          </div>
        </div>
      </div>

      {/* Projections */}
      <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#7B9CC4]/20">
        <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
          <Clock size={14} />
          Battery Drain Projections
        </h3>
        <div className="space-y-2">
          {network_sustainability.projections.map(projection => (
            <div
              key={projection.scenario}
              className="flex items-center justify-between bg-[#132B4A] rounded p-2"
            >
              <div>
                <div className="text-xs font-medium text-white capitalize">
                  {projection.scenario}
                </div>
                <div className="text-[10px] text-[#7B9CC4]">
                  {projection.drain_rate}%/hour
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white">
                  {formatTimeToFailure(projection.network_survival_time)}
                </div>
                <div className="text-[10px] text-[#7B9CC4]">survival</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Core Routing Candidates */}
      <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#7B9CC4]/20">
        <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
          <Activity size={14} />
          Top Routing Candidates
        </h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {network_sustainability.core_routing_analysis.top_candidates.map(node => (
            <DeviceCard key={node.node_id} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Routing Tab ─────────────────────────────────────────────────────────────

function RoutingTab({ analytics }: { analytics: DisasterAnalytics }) {
  const { routing_optimization } = analytics;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        {routing_optimization.slice(0, 10).map(rec => (
          <div
            key={rec.node_id}
            className="bg-[#0B1D3A] rounded-lg p-3 border-l-4"
            style={{ borderColor: getActionColor(rec.action) }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-bold text-white">
                {rec.node_id}
              </div>
              <div
                className="text-[10px] font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: getActionColor(rec.action) + '20',
                  color: getActionColor(rec.action)
                }}
              >
                {rec.action.toUpperCase()}
              </div>
            </div>
            <div className="text-[10px] text-[#7B9CC4]">
              {rec.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Protocol Tab ─────────────────────────────────────────────────────────────

function ProtocolTab({ analytics }: { analytics: DisasterAnalytics }) {
  const { emergency_protocol } = analytics;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        {emergency_protocol.map((protocol, index) => (
          <div
            key={index}
            className="bg-[#0B1D3A] rounded-lg p-3 border border-[#7B9CC4]/20"
          >
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: index === 0 ? '#EF4444' : index === 1 ? '#F97316' : '#7B9CC4' }}
              >
                {protocol.priority}
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-white mb-1">
                  {protocol.action}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-[#7B9CC4]">Timeline: </span>
                    <span className="text-white">{protocol.timeline}</span>
                  </div>
                  <div>
                    <span className="text-[#7B9CC4]">Resources: </span>
                    <span className="text-white">{protocol.resource_requirement}</span>
                  </div>
                </div>
                {protocol.target_sector && (
                  <div className="text-[10px] mt-1">
                    <span className="text-[#7B9CC4]">Target: </span>
                    <span className="text-white">Sector {protocol.target_sector}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon: any }) {
  return (
    <div className="bg-[#0B1D3A] rounded-xl p-3 border border-[#7B9CC4]/20">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} style={{ color }} />
        <div className="text-[10px] text-[#7B9CC4]">{label}</div>
      </div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function DeviceCard({ node }: { node: DisasterNode }) {
  const criticalityColor = node.battery_level < 20 ? '#EF4444' : node.battery_level < 30 ? '#F97316' : '#22C55E';

  return (
    <div className="flex items-center justify-between bg-[#132B4A] rounded p-2">
      <div>
        <div className="text-xs font-medium text-white">{node.node_id}</div>
        <div className="text-[10px] text-[#7B9CC4]">{node.device_type}</div>
      </div>
      <div className="text-right">
        <div className="text-xs font-bold" style={{ color: criticalityColor }}>
          {node.battery_level}%
        </div>
        <div className="text-[10px] text-[#7B9CC4]">{node.signal_strength}% signal</div>
      </div>
    </div>
  );
}
