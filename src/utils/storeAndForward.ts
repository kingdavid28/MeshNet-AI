/**
 * Advanced Store-and-Forward Messaging System
 * Implements reliable message delivery for offline mesh networks
 * Follows best practices for delay-tolerant networking (DTN)
 */

import { MeshRoutingProtocol, MeshPacket, MeshNode } from './meshRouting';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  source: string;
  destination: string;
  payload: any;
  priority: 'emergency' | 'high' | 'normal' | 'low';
  timestamp: number;
  ttl: number;
  size: number; // Message size in bytes
  attempts: number;
  maxAttempts: number;
  deliveryConfirmation: boolean;
  acknowledged: boolean;
  routeHistory: string[][];
}

export interface MessageQueue {
  [destination: string]: StoredMessage[];
}

export interface DeliveryReceipt {
  messageId: string;
  destination: string;
  delivered: boolean;
  timestamp: number;
  route: string[];
  latency: number;
}

// ─── Store-and-Forward Protocol ────────────────────────────────────────────────

export class StoreAndForwardProtocol {
  private routingProtocol: MeshRoutingProtocol;
  private messageQueue: MessageQueue = {};
  private deliveryReceipts: Map<string, DeliveryReceipt> = new Map();
  private maxQueueSize: number = 1000; // Maximum messages per destination
  private maxStorageSize: number = 50 * 1024 * 1024; // 50MB total storage
  private currentStorageSize: number = 0;

  constructor(routingProtocol: MeshRoutingProtocol) {
    this.routingProtocol = routingProtocol;
  }

  // ─── Message Storage ────────────────────────────────────────────────────────

  /**
   * Store message for later delivery
   */
  storeMessage(
    source: string,
    destination: string,
    payload: any,
    priority: 'emergency' | 'high' | 'normal' | 'low' = 'normal',
    ttl: number = 3600000 // 1 hour default TTL
  ): string {
    const messageId = this.generateMessageId();
    const messageSize = this.calculateMessageSize(payload);

    // Check storage limits
    if (this.currentStorageSize + messageSize > this.maxStorageSize) {
      this.evictLowPriorityMessages(messageSize);
    }

    const message: StoredMessage = {
      id: messageId,
      source,
      destination,
      payload,
      priority,
      timestamp: Date.now(),
      ttl,
      size: messageSize,
      attempts: 0,
      maxAttempts: this.getMaxAttempts(priority),
      deliveryConfirmation: priority === 'emergency' || priority === 'high',
      acknowledged: false,
      routeHistory: []
    };

    // Add to queue
    if (!this.messageQueue[destination]) {
      this.messageQueue[destination] = [];
    }

    const queue = this.messageQueue[destination];
    
    // Insert based on priority
    this.insertByPriority(queue, message);
    
    // Enforce queue size limit
    if (queue.length > this.maxQueueSize) {
      const removed = queue.pop();
      if (removed) {
        this.currentStorageSize -= removed.size;
      }
    }

    this.currentStorageSize += messageSize;
    this.persistQueue();

    console.log(`Stored message ${messageId} for ${destination} (priority: ${priority})`);
    return messageId;
  }

  /**
   * Insert message into queue based on priority
   */
  private insertByPriority(queue: StoredMessage[], message: StoredMessage): void {
    const priorityOrder = { emergency: 0, high: 1, normal: 2, low: 3 };
    const messagePriority = priorityOrder[message.priority];

    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (priorityOrder[queue[i].priority] > messagePriority) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, message);
  }

  /**
   * Get maximum delivery attempts based on priority
   */
  private getMaxAttempts(priority: string): number {
    switch (priority) {
      case 'emergency': return 50;
      case 'high': return 20;
      case 'normal': return 10;
      case 'low': return 5;
      default: return 10;
    }
  }

  /**
   * Calculate message size in bytes
   */
  private calculateMessageSize(payload: any): number {
    return JSON.stringify(payload).length * 2; // Approximate UTF-16 byte size
  }

  /**
   * Evict low priority messages when storage is full
   */
  private evictLowPriorityMessages(requiredSpace: number): void {
    const priorityOrder = ['low', 'normal', 'high', 'emergency'];
    let freedSpace = 0;

    for (const priority of priorityOrder) {
      if (freedSpace >= requiredSpace) break;

      for (const [destination, queue] of Object.entries(this.messageQueue)) {
        const index = queue.findIndex(msg => msg.priority === priority);
        if (index !== -1) {
          const removed = queue.splice(index, 1)[0];
          freedSpace += removed.size;
          this.currentStorageSize -= removed.size;

          if (freedSpace >= requiredSpace) break;
        }
      }
    }

    console.log(`Evicted ${freedSpace} bytes of low-priority messages`);
  }

  // ─── Message Delivery ───────────────────────────────────────────────────────

  /**
   * Attempt to deliver queued messages
   */
  async deliverQueuedMessages(): Promise<DeliveryReceipt[]> {
    const receipts: DeliveryReceipt[] = [];

    for (const [destination, queue] of Object.entries(this.messageQueue)) {
      if (queue.length === 0) continue;

      // Try to deliver messages in priority order
      for (let i = queue.length - 1; i >= 0; i--) {
        const message = queue[i];
        
        // Skip acknowledged messages
        if (message.acknowledged) {
          queue.splice(i, 1);
          this.currentStorageSize -= message.size;
          continue;
        }

        // Check TTL
        if (Date.now() - message.timestamp > message.ttl) {
          console.log(`Message ${message.id} TTL expired, removing`);
          queue.splice(i, 1);
          this.currentStorageSize -= message.size;
          continue;
        }

        // Check max attempts
        if (message.attempts >= message.maxAttempts) {
          console.log(`Message ${message.id} max attempts reached, removing`);
          queue.splice(i, 1);
          this.currentStorageSize -= message.size;
          continue;
        }

        // Attempt delivery
        const receipt = await this.attemptDelivery(message);
        if (receipt) {
          receipts.push(receipt);
          
          if (receipt.delivered) {
            // Remove from queue if delivered
            queue.splice(i, 1);
            this.currentStorageSize -= message.size;
          } else {
            message.attempts++;
            message.routeHistory.push(receipt.route);
          }
        }
      }
    }

    this.persistQueue();
    return receipts;
  }

  /**
   * Attempt to deliver a single message
   */
  private async attemptDelivery(message: StoredMessage): Promise<DeliveryReceipt | null> {
    const startTime = Date.now();

    try {
      // Create mesh packet
      const packet: MeshPacket = {
        id: message.id,
        source: message.source,
        destination: message.destination,
        hopCount: 0,
        maxHops: 10,
        ttl: message.ttl,
        payload: message.payload,
        timestamp: message.timestamp,
        route: [],
        priority: message.priority
      };

      // Send via routing protocol
      const delivered = await this.routingProtocol.sendPacket(message.destination, packet);
      const latency = Date.now() - startTime;

      const receipt: DeliveryReceipt = {
        messageId: message.id,
        destination: message.destination,
        delivered,
        timestamp: Date.now(),
        route: packet.route,
        latency
      };

      if (delivered && !message.deliveryConfirmation) {
        // Auto-acknowledge if confirmation not required
        message.acknowledged = true;
      }

      return receipt;
    } catch (error) {
      console.error(`Delivery attempt failed for message ${message.id}:`, error);
      return null;
    }
  }

  /**
   * Process delivery confirmation
   */
  processDeliveryConfirmation(messageId: string, confirmed: boolean): void {
    for (const [destination, queue] of Object.entries(this.messageQueue)) {
      const message = queue.find(msg => msg.id === messageId);
      if (message) {
        if (confirmed) {
          message.acknowledged = true;
          const receipt: DeliveryReceipt = {
            messageId,
            destination,
            delivered: true,
            timestamp: Date.now(),
            route: [],
            latency: 0
          };
          this.deliveryReceipts.set(messageId, receipt);
        }
        break;
      }
    }
  }

  // ─── Message Retrieval ───────────────────────────────────────────────────────

  /**
   * Get messages for a specific destination
   */
  getMessagesForDestination(destination: string): StoredMessage[] {
    return this.messageQueue[destination] || [];
  }

  /**
   * Get all queued messages
   */
  getAllQueuedMessages(): StoredMessage[] {
    const allMessages: StoredMessage[] = [];
    for (const queue of Object.values(this.messageQueue)) {
      allMessages.push(...queue);
    }
    return allMessages;
  }

  /**
   * Get delivery receipts
   */
  getDeliveryReceipts(): DeliveryReceipt[] {
    return Array.from(this.deliveryReceipts.values());
  }

  /**
   * Get message by ID
   */
  getMessage(messageId: string): StoredMessage | null {
    for (const queue of Object.values(this.messageQueue)) {
      const message = queue.find(msg => msg.id === messageId);
      if (message) return message;
    }
    return null;
  }

  // ─── Queue Management ────────────────────────────────────────────────────────

  /**
   * Clear expired messages
   */
  clearExpiredMessages(): number {
    let cleared = 0;
    const now = Date.now();

    for (const [destination, queue] of Object.entries(this.messageQueue)) {
      for (let i = queue.length - 1; i >= 0; i--) {
        const message = queue[i];
        if (now - message.timestamp > message.ttl) {
          queue.splice(i, 1);
          this.currentStorageSize -= message.size;
          cleared++;
        }
      }
    }

    if (cleared > 0) {
      this.persistQueue();
      console.log(`Cleared ${cleared} expired messages`);
    }

    return cleared;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    totalMessages: number;
    totalSize: number;
    byPriority: { [key: string]: number };
    byDestination: { [key: string]: number };
    deliveryRate: number;
  } {
    const allMessages = this.getAllQueuedMessages();
    const byPriority: { [key: string]: number } = {};
    const byDestination: { [key: string]: number } = {};

    for (const message of allMessages) {
      byPriority[message.priority] = (byPriority[message.priority] || 0) + 1;
      byDestination[message.destination] = (byDestination[message.destination] || 0) + 1;
    }

    const totalDelivered = this.deliveryReceipts.size;
    const deliveryRate = allMessages.length > 0 
      ? (totalDelivered / (totalDelivered + allMessages.length)) * 100 
      : 0;

    return {
      totalMessages: allMessages.length,
      totalSize: this.currentStorageSize,
      byPriority,
      byDestination,
      deliveryRate
    };
  }

  /**
   * Persist queue to localStorage
   */
  private persistQueue(): void {
    try {
      const data = {
        queue: this.messageQueue,
        receipts: Array.from(this.deliveryReceipts.entries()),
        storageSize: this.currentStorageSize
      };
      localStorage.setItem('mesh_message_queue', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist message queue:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  loadQueue(): void {
    try {
      const data = localStorage.getItem('mesh_message_queue');
      if (data) {
        const parsed = JSON.parse(data);
        this.messageQueue = parsed.queue || {};
        this.deliveryReceipts = new Map(parsed.receipts || []);
        this.currentStorageSize = parsed.storageSize || 0;
        console.log('Loaded message queue from storage');
      }
    } catch (error) {
      console.error('Failed to load message queue:', error);
    }
  }

  /**
   * Clear all messages
   */
  clearQueue(): void {
    this.messageQueue = {};
    this.deliveryReceipts.clear();
    this.currentStorageSize = 0;
    this.persistQueue();
    console.log('Cleared all messages from queue');
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get storage usage percentage
   */
  getStorageUsage(): number {
    return (this.currentStorageSize / this.maxStorageSize) * 100;
  }
}

// ─── Message Prioritization ───────────────────────────────────────────────────

/**
 * Calculate message priority based on content and context
 */
export function calculateMessagePriority(
  payload: any,
  emergencyMode: boolean = false
): 'emergency' | 'high' | 'normal' | 'low' {
  // Emergency messages
  if (payload.type === 'sos' || payload.type === 'emergency_alert') {
    return 'emergency';
  }

  // High priority in emergency mode
  if (emergencyMode && (payload.type === 'location' || payload.type === 'status')) {
    return 'high';
  }

  // High priority for critical communications
  if (payload.type === 'medical' || payload.type === 'security') {
    return 'high';
  }

  // Normal priority for regular messages
  if (payload.type === 'chat' || payload.type === 'data') {
    return 'normal';
  }

  // Low priority for bulk data
  if (payload.type === 'sync' || payload.type === 'backup') {
    return 'low';
  }

  return 'normal';
}

/**
 * Calculate message TTL based on priority and content
 */
export function calculateMessageTTL(
  priority: 'emergency' | 'high' | 'normal' | 'low',
  payload: any
): number {
  const baseTTL = {
    emergency: 7200000,    // 2 hours
    high: 3600000,       // 1 hour
    normal: 1800000,      // 30 minutes
    low: 600000          // 10 minutes
  };

  // Extend TTL for critical content
  if (payload.type === 'sos' || payload.type === 'emergency_alert') {
    return baseTTL.emergency * 2; // 4 hours for SOS
  }

  return baseTTL[priority];
}
