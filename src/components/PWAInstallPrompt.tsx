import { useState, useEffect } from 'react';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const checkInstalled = () => {
      const isInStandaloneMode = () => {
        return ('displayMode' in (navigator as any).standalone) || 
               (window.matchMedia('(display-mode: standalone)').matches);
      };
      
      setIsInstalled(isInStandaloneMode());
    };

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    checkInstalled();

    // Listen for app install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstall(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstall(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstall(false);
    // Don't show again for this session
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Check if user dismissed
  useEffect(() => {
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (dismissed && !deferredPrompt) {
      setShowInstall(false);
    }
  }, [deferredPrompt]);

  if (isInstalled) {
    return null;
  }

  if (!showInstall || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-lg shadow-2xl border border-blue-500">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mr-3">
              <span className="text-2xl">📡</span>
            </div>
            <div>
              <h3 className="font-semibold">Install MeshNet</h3>
              <p className="text-blue-200 text-xs">Emergency Mesh Communication</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-blue-200 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        
        <p className="text-sm text-blue-100 mb-4">
          Install MeshNet on your device for offline access and better performance during emergencies.
        </p>
        
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-white text-blue-600 px-4 py-2 rounded font-semibold hover:bg-blue-50 transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded font-semibold text-blue-200 hover:text-white transition-colors"
          >
            Later
          </button>
        </div>
        
        <div className="mt-3 pt-3 border-t border-blue-500">
          <p className="text-xs text-blue-200">
            ✓ Works offline<br />
            ✓ Faster performance<br />
            ✓ Full-screen experience
          </p>
        </div>
      </div>
    </div>
  );
}
