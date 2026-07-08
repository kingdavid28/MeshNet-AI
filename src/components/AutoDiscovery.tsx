import { useEffect, useState } from 'react';
import mdnsService from '../services/mdns';
import type { MeshNetService } from '../services/mdns';

export function AutoDiscovery() {
  const [discoveredService, setDiscoveredService] = useState<MeshNetService | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    // Start automatic discovery on component mount
    // This helps the desktop app discover other MeshNet devices on the network
    mdnsService.startDiscovery();

    // Listen for discovered services
    const handleServicesDiscovered = (services: MeshNetService[]) => {
      console.log('[AutoDiscovery] Services discovered:', services);
      
      if (services.length > 0) {
        // Found MeshNet services - log them for debugging
        const service = services[0];
        setDiscoveredService(service);
        setIsScanning(false);
        console.log('[AutoDiscovery] Found MeshNet service at:', service.host);
      }
    };

    mdnsService.onServicesDiscovered(handleServicesDiscovered);

    // Cleanup
    return () => {
      mdnsService.removeListener(handleServicesDiscovered);
      mdnsService.stopDiscovery();
    };
  }, []);

  // Don't render anything - this is a background service
  return null;
}
