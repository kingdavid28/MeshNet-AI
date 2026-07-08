import { useState } from 'react';
import { BluetoothScanner } from './BluetoothScanner';
import { WebRTCManager } from './WebRTCManager';
import { HotspotManager } from './HotspotManager';
import { NetworkStatus } from './NetworkStatus';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { EmergencyMode } from './EmergencyMode';

export function MeshNetwork() {
  const [activeProtocol, setActiveProtocol] = useState<'ble' | 'webrtc' | 'hotspot' | null>(null);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PWAInstallPrompt />
      
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center">
                <span className="text-3xl mr-2">📡</span>
                MeshNet AI
              </h1>
              <p className="text-gray-400 text-sm">Emergency Mesh Communication</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isEmergencyMode ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-sm text-gray-400">
                {isEmergencyMode ? 'Emergency' : 'Normal'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Emergency Mode Toggle */}
        <EmergencyMode />

        {/* Protocol Selection */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Connection Protocol</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setActiveProtocol('ble')}
              className={`p-4 rounded-lg border-2 transition-all ${
                activeProtocol === 'ble' 
                  ? 'bg-blue-600 border-blue-500' 
                  : 'bg-gray-700 border-gray-600 hover:border-blue-500'
              }`}
            >
              <div className="text-3xl mb-2">📡</div>
              <div className="font-semibold">BLE</div>
              <div className="text-sm text-gray-400">Low Power Discovery</div>
              <div className="text-xs text-gray-500 mt-1">Chrome/Android only</div>
            </button>
            <button
              onClick={() => setActiveProtocol('webrtc')}
              className={`p-4 rounded-lg border-2 transition-all ${
                activeProtocol === 'webrtc' 
                  ? 'bg-blue-600 border-blue-500' 
                  : 'bg-gray-700 border-gray-600 hover:border-blue-500'
              }`}
            >
              <div className="text-3xl mb-2">🔗</div>
              <div className="font-semibold">WebRTC</div>
              <div className="text-sm text-gray-400">P2P Data Channels</div>
              <div className="text-xs text-gray-500 mt-1">Cross-platform</div>
            </button>
            <button
              onClick={() => setActiveProtocol('hotspot')}
              className={`p-4 rounded-lg border-2 transition-all ${
                activeProtocol === 'hotspot' 
                  ? 'bg-blue-600 border-blue-500' 
                  : 'bg-gray-700 border-gray-600 hover:border-blue-500'
              }`}
            >
              <div className="text-3xl mb-2">📶</div>
              <div className="font-semibold">Hotspot</div>
              <div className="text-sm text-gray-400">Universal Access</div>
              <div className="text-xs text-gray-500 mt-1">Manual activation</div>
            </button>
          </div>
        </div>

        {/* Protocol Components */}
        {activeProtocol === 'ble' && (
          <div className="animate-fadeIn">
            <BluetoothScanner />
          </div>
        )}
        {activeProtocol === 'webrtc' && (
          <div className="animate-fadeIn">
            <WebRTCManager />
          </div>
        )}
        {activeProtocol === 'hotspot' && (
          <div className="animate-fadeIn">
            <HotspotManager />
          </div>
        )}

        {/* Network Status */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Network Status</h2>
          <NetworkStatus />
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-center transition-colors">
              <div className="text-2xl mb-1">🗺️</div>
              <div className="text-sm">Network Map</div>
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-center transition-colors">
              <div className="text-2xl mb-1">💬</div>
              <div className="text-sm">Send Message</div>
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-center transition-colors">
              <div className="text-2xl mb-1">📍</div>
              <div className="text-sm">Share Location</div>
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-center transition-colors">
              <div className="text-2xl mb-1">⚙️</div>
              <div className="text-sm">Settings</div>
            </button>
          </div>
        </div>

        {/* Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/50 p-4 rounded-lg border border-blue-700">
            <div className="flex items-center mb-2">
              <span className="text-2xl mr-2">🛡️</span>
              <h3 className="font-semibold">Secure Mesh</h3>
            </div>
            <p className="text-sm text-blue-200">
              End-to-end encryption with DTLS 1.3 and AES-256-GCM for all mesh communications
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-900/50 to-green-800/50 p-4 rounded-lg border border-green-700">
            <div className="flex items-center mb-2">
              <span className="text-2xl mr-2">📱</span>
              <h3 className="font-semibold">Cross-Platform</h3>
            </div>
            <p className="text-sm text-green-200">
              Works on Android, iOS, Windows, macOS, and Linux through modern web browsers
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm py-4">
          <p>MeshNet AI - Emergency Mesh Communication</p>
          <p className="text-xs mt-1">Install as PWA for offline access and better performance</p>
        </footer>
      </main>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
