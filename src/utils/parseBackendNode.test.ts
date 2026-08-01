/**
 * parseBackendNode.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the parseBackendNode schema normalizer.
 */

import { parseBackendNode, parseBackendNodes } from './parseBackendNode';

describe('parseBackendNode', () => {
  it('should parse standard format', () => {
    const data = {
      id: 'node1',
      label: 'Test Node',
      lat: 37.7749,
      lng: -122.4194,
      battery: 85,
      signal: 90,
      device: 'smartphone',
      role: 'peer',
      bluetoothStatus: true,
      wifiStatus: false,
    };

    const node = parseBackendNode(data);

    expect(node).not.toBeNull();
    expect(node?.id).toBe('node1');
    expect(node?.label).toBe('Test Node');
    expect(node?.lat).toBe(37.7749);
    expect(node?.lng).toBe(-122.4194);
    expect(node?.battery).toBe(85);
    expect(node?.signal).toBe(90);
    expect(node?.device).toBe('smartphone');
    expect(node?.role).toBe('peer');
    expect(node?.bluetoothStatus).toBe(true);
    expect(node?.wifiStatus).toBe(false);
  });

  it('should parse legacy format', () => {
    const data = {
      node_id: 'node2',
      name: 'Legacy Node',
      latitude: 40.7128,
      longitude: -74.006,
      batteryPercentage: 75,
      rssi: 70,
    };

    const node = parseBackendNode(data);

    expect(node).not.toBeNull();
    expect(node?.id).toBe('node2');
    expect(node?.label).toBe('Legacy Node');
    expect(node?.lat).toBe(40.7128);
    expect(node?.lng).toBe(-74.006);
    expect(node?.battery).toBe(75);
    expect(node?.signal).toBe(70);
    expect(node?.device).toBe('unknown');
    expect(node?.role).toBe('peer');
  });

  it('should parse nested format', () => {
    const data = {
      data: {
        id: 'node3',
        label: 'Nested Node',
        lat: 51.5074,
        lng: -0.1278,
        battery: 100,
        signal: 95,
        device: 'laptop',
        role: 'relay',
      },
    };

    const node = parseBackendNode(data);

    expect(node).not.toBeNull();
    expect(node?.id).toBe('node3');
    expect(node?.label).toBe('Nested Node');
    expect(node?.lat).toBe(51.5074);
    expect(node?.lng).toBe(-0.1278);
  });

  it('should return null for missing ID', () => {
    const data = {
      label: 'No ID Node',
      lat: 0,
      lng: 0,
    };

    const node = parseBackendNode(data);
    expect(node).toBeNull();
  });

  it('should return null for empty data', () => {
    expect(parseBackendNode({})).toBeNull();
    expect(parseBackendNode(null)).toBeNull();
    expect(parseBackendNode(undefined)).toBeNull();
  });

  it('should return null for invalid data types', () => {
    expect(parseBackendNode('invalid')).toBeNull();
    expect(parseBackendNode(123)).toBeNull();
    expect(parseBackendNode(true)).toBeNull();
    expect(parseBackendNode([])).toBeNull();
  });

  it('should use default coordinates', () => {
    const data = { id: 'node4', label: 'Default Coords' };

    const node = parseBackendNode(data);

    expect(node).not.toBeNull();
    expect(node?.lat).toBe(0);
    expect(node?.lng).toBe(0);
  });

  it('should clamp battery values', () => {
    const data = { id: 'node5', label: 'Clamp Test', battery: 150 };

    let node = parseBackendNode(data);
    expect(node?.battery).toBe(100);

    data.battery = -10;
    node = parseBackendNode(data);
    expect(node?.battery).toBe(0);
  });

  it('should clamp signal values', () => {
    const data = { id: 'node6', label: 'Signal Test', signal: 150 };

    let node = parseBackendNode(data);
    expect(node?.signal).toBe(100);

    data.signal = -10;
    node = parseBackendNode(data);
    expect(node?.signal).toBe(0);
  });

  it('should parse boolean fields from various formats', () => {
    const data = {
      id: 'node7',
      label: 'Bool Test',
      bluetoothStatus: true,
      wifiStatus: 'true',
    };

    let node = parseBackendNode(data);
    expect(node?.bluetoothStatus).toBe(true);
    expect(node?.wifiStatus).toBe(true);

    data.bluetoothStatus = false;
    data.wifiStatus = 'false';
    node = parseBackendNode(data);
    expect(node?.bluetoothStatus).toBe(false);
    expect(node?.wifiStatus).toBe(false);

    data.bluetoothStatus = 1;
    data.wifiStatus = 0;
    node = parseBackendNode(data);
    expect(node?.bluetoothStatus).toBe(true);
    expect(node?.wifiStatus).toBe(false);
  });

  it('should parse timestamp', () => {
    const data = {
      id: 'node8',
      label: 'Timestamp Test',
      lastSeen: 1704067200, // Unix timestamp
    };

    const node = parseBackendNode(data);
    expect(node?.lastSeen).toBeInstanceOf(Date);
  });

  it('should use label fallbacks', () => {
    const data = { id: 'node9' };

    let node = parseBackendNode(data);
    expect(node?.label).toBe('Node node9');

    data.name = 'Name Field';
    node = parseBackendNode(data);
    expect(node?.label).toBe('Name Field');

    delete data.name;
    data.display_name = 'Display Name';
    node = parseBackendNode(data);
    expect(node?.label).toBe('Display Name');
  });

  it('should use device type fallbacks', () => {
    const data = { id: 'node10', label: 'Device Test' };

    let node = parseBackendNode(data);
    expect(node?.device).toBe('unknown');

    data.device_type = 'tablet';
    node = parseBackendNode(data);
    expect(node?.device).toBe('tablet');

    delete data.device_type;
    data.deviceType = 'desktop';
    node = parseBackendNode(data);
    expect(node?.device).toBe('desktop');
  });
});

describe('parseBackendNodes', () => {
  it('should parse list of nodes', () => {
    const data = [
      { id: 'node1', label: 'Node 1', lat: 0, lng: 0 },
      { id: 'node2', label: 'Node 2', lat: 1, lng: 1 },
      { id: 'node3', label: 'Node 3', lat: 2, lng: 2 },
    ];

    const nodes = parseBackendNodes(data);

    expect(nodes).toHaveLength(3);
    expect(nodes[0].id).toBe('node1');
    expect(nodes[1].id).toBe('node2');
    expect(nodes[2].id).toBe('node3');
  });

  it('should parse single node', () => {
    const data = { id: 'node1', label: 'Single Node', lat: 0, lng: 0 };

    const nodes = parseBackendNodes(data);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('node1');
  });

  it('should parse nested list wrapper', () => {
    const data = {
      nodes: [
        { id: 'node1', label: 'Node 1', lat: 0, lng: 0 },
        { id: 'node2', label: 'Node 2', lat: 1, lng: 1 },
      ],
    };

    const nodes = parseBackendNodes(data);

    expect(nodes).toHaveLength(2);
  });

  it('should parse data list wrapper', () => {
    const data = {
      data: [{ id: 'node1', label: 'Node 1', lat: 0, lng: 0 }],
    };

    const nodes = parseBackendNodes(data);

    expect(nodes).toHaveLength(1);
  });

  it('should return empty list for empty input', () => {
    expect(parseBackendNodes([])).toEqual([]);
    expect(parseBackendNodes(null)).toEqual([]);
    expect(parseBackendNodes(undefined)).toEqual([]);
  });

  it('should return empty list for invalid input', () => {
    expect(parseBackendNodes('invalid')).toEqual([]);
    expect(parseBackendNodes(123)).toEqual([]);
  });

  it('should filter invalid nodes from list', () => {
    const data = [
      { id: 'node1', label: 'Valid', lat: 0, lng: 0 },
      { label: 'Invalid - no ID' },
      { id: 'node2', label: 'Valid 2', lat: 1, lng: 1 },
      null,
    ];

    const nodes = parseBackendNodes(data);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe('node1');
    expect(nodes[1].id).toBe('node2');
  });
});
