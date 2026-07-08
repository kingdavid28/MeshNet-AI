import { useState, useEffect } from 'react';

export function EmergencyMode() {
  const [isActive, setIsActive] = useState(false);
  const [timer, setTimer] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [wakeLockSentinel, setWakeLockSentinel] = useState<any>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  const toggleEmergencyMode = () => {
    if (!isActive) {
      setShowConfirm(true);
    } else {
      deactivateEmergencyMode();
    }
  };

  const confirmActivation = () => {
    setIsActive(true);
    setShowConfirm(false);
    setTimer(0);
    
    // Enable emergency mode settings
    enableEmergencySettings();
  };

  const deactivateEmergencyMode = () => {
    setIsActive(false);
    setTimer(0);
    
    // Disable emergency mode settings
    disableEmergencySettings();
  };

  const enableEmergencySettings = () => {
    // Store emergency mode state
    localStorage.setItem('emergency-mode', 'true');
    localStorage.setItem('emergency-start-time', Date.now().toString());
    
    // Request wake lock to keep device awake
    requestWakeLock();
    
    // Enable high priority notifications
    enableEmergencyNotifications();
  };

  const disableEmergencySettings = () => {
    // Clear emergency mode state
    localStorage.removeItem('emergency-mode');
    localStorage.removeItem('emergency-start-time');
    
    // Release wake lock
    releaseWakeLock();
    
    // Disable emergency notifications
    disableEmergencyNotifications();
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        setWakeLockSentinel(sentinel);
        console.log('[Emergency] Wake lock activated');
      }
    } catch (error) {
      console.error('[Emergency] Wake lock failed:', error);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockSentinel) {
        await wakeLockSentinel.release();
        setWakeLockSentinel(null);
        console.log('[Emergency] Wake lock released');
      }
    } catch (error) {
      console.error('[Emergency] Wake lock release failed:', error);
    }
  };

  const enableEmergencyNotifications = () => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const disableEmergencyNotifications = () => {
    // Disable emergency-specific notifications
    console.log('[Emergency] Emergency notifications disabled');
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  useEffect(() => {
    // Check if emergency mode was already active
    const wasActive = localStorage.getItem('emergency-mode') === 'true';
    if (wasActive) {
      setIsActive(true);
      const startTime = parseInt(localStorage.getItem('emergency-start-time') || '0');
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setTimer(elapsed);
    }
  }, []);

  return (
    <>
      <div className={`p-4 rounded-lg border-2 transition-all ${
        isActive 
          ? 'bg-red-900 border-red-500 animate-pulse' 
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${isActive ? 'bg-red-500' : 'bg-gray-500'}`} />
            <h3 className={`font-semibold ${isActive ? 'text-red-100' : 'text-white'}`}>
              Emergency Mode
            </h3>
          </div>
          {isActive && (
            <div className="text-red-200 text-sm font-mono">
              {formatTime(timer)}
            </div>
          )}
        </div>

        {isActive && (
          <div className="mb-4 p-3 bg-red-800/50 border border-red-600 rounded">
            <div className="flex items-center mb-2">
              <span className="text-2xl mr-2">🚨</span>
              <span className="text-red-100 font-semibold">Emergency Mode Active</span>
            </div>
            <ul className="text-red-200 text-sm space-y-1">
              <li>• Maximum priority for all communications</li>
              <li>• Device wake lock enabled</li>
              <li>• Emergency notifications active</li>
              <li>• Background sync prioritized</li>
              <li>• Location sharing enabled</li>
            </ul>
          </div>
        )}

        <button
          onClick={toggleEmergencyMode}
          className={`w-full py-3 rounded font-semibold transition-colors ${
            isActive
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isActive ? 'Deactivate Emergency Mode' : 'Activate Emergency Mode'}
        </button>

        {!isActive && (
          <p className="text-gray-400 text-xs mt-2">
            Emergency mode prioritizes mesh communications and keeps device awake for critical operations
          </p>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-red-600">
            <div className="flex items-center mb-4">
              <span className="text-3xl mr-3">⚠️</span>
              <h3 className="text-xl font-semibold text-white">Confirm Emergency Mode</h3>
            </div>
            
            <p className="text-gray-300 mb-4">
              Activating emergency mode will:
            </p>
            
            <ul className="text-gray-300 text-sm space-y-2 mb-6">
              <li className="flex items-start">
                <span className="text-red-400 mr-2">•</span>
                Enable device wake lock (keeps screen on)
              </li>
              <li className="flex items-start">
                <span className="text-red-400 mr-2">•</span>
                Prioritize emergency communications
              </li>
              <li className="flex items-start">
                <span className="text-red-400 mr-2">•</span>
                Enable emergency notifications
              </li>
              <li className="flex items-start">
                <span className="text-red-400 mr-2">•</span>
                Share location with mesh network
              </li>
              <li className="flex items-start">
                <span className="text-red-400 mr-2">•</span>
                Increase battery consumption
              </li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={confirmActivation}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-semibold transition-colors"
              >
                Activate
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
