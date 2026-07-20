import React, { useState, useEffect } from 'react';
import { getApiBase, getMeshSecret } from '../utils/env';
import { Wifi, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const MeshNetJoin: React.FC = () => {
  const [isJoining, setIsJoining] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [deviceInfo, setDeviceInfo] = useState({
    name: '',
    type: '',
    location: { lat: 0, lng: 0 }
  });

  useEffect(() => {
    // Get device info automatically
    setDeviceInfo({
      name: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Device',
      type: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      location: { lat: 0, lng: 0 } // Would get actual location
    });
  }, []);

  const handleJoin = async () => {
    setIsJoining(true);
    setJoinError('');

    try {
      // Register device with backend
      const response = await fetch(`${getApiBase()}/api/mesh/device/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': getMeshSecret()
        },
        body: JSON.stringify({
          device_id: generateDeviceId(),
          name: deviceInfo.name,
          type: deviceInfo.type,
          capabilities: ['wifi', 'bluetooth'],
          location: deviceInfo.location
        })
      });

      if (response.ok) {
        setJoinSuccess(true);
        // Redirect to main app after successful join
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        throw new Error('Failed to register device');
      }
    } catch (error) {
      setJoinError('Failed to join MeshNet. Please try again.');
      setIsJoining(false);
    }
  };

  const generateDeviceId = () => {
    return 'device-' + Math.random().toString(36).substr(2, 9);
  };

  const handleDecline = () => {
    // Redirect away or show disconnect message
    window.location.href = 'about:blank';
  };

  if (joinSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Successfully Joined!</h2>
          <p className="text-gray-600 mb-4">You are now part of the MeshNet emergency network.</p>
          <Loader2 className="w-6 h-6 text-blue-500 mx-auto animate-spin" />
          <p className="text-sm text-gray-500 mt-2">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <Wifi className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Join MeshNet</h1>
          <p className="text-gray-600">Emergency Mesh Network</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">Network Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Network Name:</span>
              <span className="font-medium">MeshNet</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Password:</span>
              <span className="font-medium">Auto-generated</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Your Device:</span>
              <span className="font-medium">{deviceInfo.name}</span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Emergency Network:</strong> By joining, you'll be part of a local emergency mesh network that can operate without internet connectivity.
          </p>
        </div>

        {joinError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
            <XCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
            <p className="text-sm text-red-800">{joinError}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              'Join MeshNet'
            )}
          </button>
          
          <button
            onClick={handleDecline}
            className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
          >
            Decline
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          By joining, you agree to participate in the emergency mesh network for communication purposes.
        </p>
      </div>
    </div>
  );
};
