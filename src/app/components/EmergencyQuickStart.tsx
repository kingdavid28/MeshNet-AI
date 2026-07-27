/**
 * Emergency Quick Start Component
 * One-click emergency activation button with visual feedback
 */

import { useState } from 'react';
import { AlertTriangle, Shield, CheckCircle, Loader2, Zap } from 'lucide-react';
import { useEmergencyMode } from '../hooks/useEmergencyMode';

export default function EmergencyQuickStart() {
  const { emergencyState, activateEmergencyMode, deactivateEmergencyMode, getEmergencyStatus, isEmergencyReady } = useEmergencyMode();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleEmergencyClick = () => {
    if (emergencyState.isActive) {
      deactivateEmergencyMode();
    } else if (showConfirm) {
      activateEmergencyMode();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  const getButtonStyle = () => {
    if (emergencyState.isActive) {
      return {
        background: 'linear-gradient(135deg, #16A34A, #15803D)',
        boxShadow: '0 0 24px rgba(22,163,74,0.4)',
        borderColor: 'rgba(22,163,74,0.5)',
      };
    } else if (showConfirm) {
      return {
        background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
        boxShadow: '0 0 28px rgba(239,68,68,0.6), 0 4px 12px rgba(0,0,0,0.3)',
        borderColor: 'rgba(239,68,68,0.5)',
      };
    } else {
      return {
        background: 'linear-gradient(135deg, #F97316, #EA580C)',
        boxShadow: '0 0 24px rgba(249,115,22,0.4)',
        borderColor: 'rgba(249,115,22,0.5)',
      };
    }
  };

  const getButtonContent = () => {
    if (emergencyState.isInitializing) {
      return (
        <>
          <Loader2 size={24} className="animate-spin" />
          <span className="text-lg font-black">INITIALIZING...</span>
        </>
      );
    }

    if (emergencyState.isActive) {
      return (
        <>
          <CheckCircle size={24} />
          <span className="text-lg font-black">EMERGENCY MODE ACTIVE</span>
        </>
      );
    }

    if (showConfirm) {
      return (
        <>
          <AlertTriangle size={24} />
          <span className="text-lg font-black">TAP TO CONFIRM</span>
        </>
      );
    }

    return (
      <>
      <Zap size={24} />
      <span className="text-lg font-black">ACTIVATE EMERGENCY MODE</span>
    </>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Main Emergency Button */}
      <button
        onClick={handleEmergencyClick}
        disabled={emergencyState.isInitializing}
        className="w-full max-w-md rounded-2xl flex flex-col items-center justify-center gap-3 font-black uppercase tracking-widest transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: '1.1rem',
          letterSpacing: '0.15em',
          padding: '2rem 1.5rem',
          color: '#ffffff',
          border: '2px solid',
          ...getButtonStyle(),
        }}
      >
        {getButtonContent()}
      </button>

      {/* Status Display */}
      <div className="text-center">
        <div className="text-sm font-mono text-[#7B9CC4] mb-1">
          {getEmergencyStatus()}
        </div>
        
        {emergencyState.isActive && (
          <div className="flex items-center justify-center gap-4 mt-2">
            {emergencyState.networkStatus === 'connected' && (
              <div className="flex items-center gap-1 text-xs text-[#22C55E]">
                <Shield size={12} />
                <span>Network Connected</span>
              </div>
            )}
            {emergencyState.networkStatus === 'offline' && (
              <div className="flex items-center gap-1 text-xs text-[#F97316]">
                <AlertTriangle size={12} />
                <span>Offline Mode</span>
              </div>
            )}
            {emergencyState.batteryOptimized && (
              <div className="flex items-center gap-1 text-xs text-[#22C55E]">
                <Zap size={12} />
                <span>Battery Optimized</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Warning */}
      {showConfirm && (
        <div className="bg-[#0B1D3A] border border-[#EF4444]/50 rounded-xl p-3 max-w-md">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[#7B9CC4]">
              <div className="font-bold text-white mb-1">Emergency Activation</div>
              <div>This will optimize battery, enable simplified UI, and activate emergency protocols. Tap again to confirm.</div>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Mode Info */}
      {emergencyState.isActive && !emergencyState.isInitializing && (
        <div className="bg-[#0B1D3A] border border-[#22C55E]/30 rounded-xl p-3 max-w-md">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[#7B9CC4]">
              <div className="font-bold text-white mb-1">Emergency Mode Active</div>
              <div className="space-y-1">
                <div>• Battery optimization enabled</div>
                <div>• Simplified emergency UI active</div>
                <div>• Auto-network discovery running</div>
                <div>• Offline-first mode ready</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Start Info */}
      {!emergencyState.isActive && !showConfirm && (
        <div className="text-center">
          <div className="text-[10px] text-[#7B9CC4]/60 font-mono">
            One-click emergency activation • Auto-configuration • Battery optimized
          </div>
        </div>
      )}
    </div>
  );
}
