/**
 * Content Addressing System
 * IPFS-inspired content addressing for distributed mesh networks
 * Follows best practices for content-addressable storage (CAS)
 */

import { MeshRoutingProtocol } from './meshRouting';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentBlock {
  cid: string; // Content Identifier (hash-based)
  data: any;
  size: number;
  timestamp: number;
  storedBy: string[]; // Nodes storing this content
  references: number; // How many times this content is referenced
  ttl: number;
}

export interface ContentReference {
  cid: string;
  name: string;
  owner: string;
  timestamp: number;
  metadata: any;
}

export interface ContentManifest {
  rootCid: string;
  name: string;
  size: number;
  blocks: string[]; // CIDs of constituent blocks
  metadata: any;
  version: number;
}

// ─── Content Addressing Protocol ───────────────────────────────────────────────

export class ContentAddressingSystem {
  private nodeId: string;
  private routingProtocol: MeshRoutingProtocol;
  private contentStore: Map<string, ContentBlock> = new Map();
  private contentIndex: Map<string, ContentReference> = new Map(); // Name -> CID mapping
  private maxStorageSize: number = 100 * 1024 * 1024; // 100MB total storage
  private currentStorageSize: number = 0;
  private blockCache: Map<string, Set<string>> = new Map(); // CID -> Set of node IDs

  constructor(nodeId: string, routingProtocol: MeshRoutingProtocol) {
    this.nodeId = nodeId;
    this.routingProtocol = routingProtocol;
    this.loadContentStore();
  }

  // ─── Content Storage ────────────────────────────────────────────────────────

  /**
   * Store content and return content identifier (CID)
   * Uses SHA-256 hash for content addressing
   */
  async storeContent(
    data: any,
    name: string = '',
    metadata: any = {},
    ttl: number = 86400000 // 24 hours default
  ): Promise<string> {
    const serialized = JSON.stringify(data);
    const cid = await this.generateCID(serialized);
    const size = serialized.length * 2; // Approximate byte size

    // Check if content already exists
    if (this.contentStore.has(cid)) {
      const existing = this.contentStore.get(cid)!;
      existing.references++;
      existing.storedBy.push(this.nodeId);
      console.log(`Content ${cid} already stored, incremented references`);
      return cid;
    }

    // Check storage limits
    if (this.currentStorageSize + size > this.maxStorageSize) {
      await this.evictLeastUsedContent(size);
    }

    // Create content block
    const block: ContentBlock = {
      cid,
      data,
      size,
      timestamp: Date.now(),
      storedBy: [this.nodeId],
      references: 1,
      ttl
    };

    this.contentStore.set(cid, block);
    this.currentStorageSize += size;

    // Create content reference if name provided
    if (name) {
      const reference: ContentReference = {
        cid,
        name,
        owner: this.nodeId,
        timestamp: Date.now(),
        metadata
      };
      this.contentIndex.set(name, reference);
    }

    // Update block cache
    if (!this.blockCache.has(cid)) {
      this.blockCache.set(cid, new Set());
    }
    this.blockCache.get(cid)!.add(this.nodeId);

    this.persistContentStore();
    console.log(`Stored content ${cid} (${size} bytes)`);
    return cid;
  }

  /**
   * Generate content identifier using SHA-256
   */
  private async generateCID(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256-${hashHex}`;
  }

  /**
   * Retrieve content by CID
   */
  async getContent(cid: string): Promise<any | null> {
    // Check local store first
    const block = this.contentStore.get(cid);
    if (block) {
      block.references++;
      return block.data;
    }

    // Try to fetch from network
    const nodes = this.getNodesStoringContent(cid);
    for (const nodeId of nodes) {
      try {
        const data = await this.fetchContentFromNode(nodeId, cid);
        if (data) {
          // Cache locally
          await this.storeContent(data, '', {}, 86400000);
          return data;
        }
      } catch (error) {
        console.error(`Failed to fetch content from ${nodeId}:`, error);
      }
    }

    return null;
  }

  /**
   * Retrieve content by name
   */
  async getContentByName(name: string): Promise<any | null> {
    const reference = this.contentIndex.get(name);
    if (!reference) return null;

    return await this.getContent(reference.cid);
  }

  /**
   * Fetch content from remote node
   */
  private async fetchContentFromNode(nodeId: string, cid: string): Promise<any | null> {
    // In real implementation, this would use the routing protocol to send a request
    console.log(`Fetching content ${cid} from node ${nodeId}`);
    return null; // Simplified
  }

  // ─── Content Management ─────────────────────────────────────────────────────

  /**
   * Get nodes storing specific content
   */
  getNodesStoringContent(cid: string): string[] {
    const nodes = this.blockCache.get(cid);
    return nodes ? Array.from(nodes) : [];
  }

  /**
   * Announce content availability to network
   */
  async announceContent(cid: string): Promise<void> {
    const block = this.contentStore.get(cid);
    if (!block) return;

    // Broadcast content availability to neighbors
    const announcement = {
      type: 'content_announcement',
      cid,
      size: block.size,
      nodeId: this.nodeId,
      timestamp: Date.now()
    };

    // In real implementation, this would use the routing protocol
    console.log(`Announcing content ${cid} to network`);
  }

  /**
   * Discover content in the network
   */
  async discoverContent(contentName: string): Promise<string | null> {
    // Check local index first
    const localRef = this.contentIndex.get(contentName);
    if (localRef) return localRef.cid;

    // Query network for content
    const query = {
      type: 'content_query',
      name: contentName,
      nodeId: this.nodeId,
      timestamp: Date.now()
    };

    // In real implementation, this would flood the network
    console.log(`Discovering content: ${contentName}`);
    return null; // Simplified
  }

  /**
   * Evict least used content when storage is full
   */
  private async evictLeastUsedContent(requiredSpace: number): Promise<void> {
    const sortedBlocks = Array.from(this.contentStore.values())
      .sort((a, b) => a.references - b.references);

    let freedSpace = 0;
    for (const block of sortedBlocks) {
      if (freedSpace >= requiredSpace) break;

      // Don't evict content with high reference count
      if (block.references > 5) continue;

      this.contentStore.delete(block.cid);
      this.currentStorageSize -= block.size;
      freedSpace += block.size;

      // Remove from index if this was the only reference
      for (const [name, ref] of this.contentIndex.entries()) {
        if (ref.cid === block.cid) {
          this.contentIndex.delete(name);
          break;
        }
      }
    }

    console.log(`Evicted ${freedSpace} bytes of least-used content`);
  }

  // ─── Content Manifests ───────────────────────────────────────────────────────

  /**
   * Create a content manifest for large files
   * Splits content into blocks for efficient storage and retrieval
   */
  async createManifest(
    data: any,
    name: string,
    blockSize: number = 1024 * 1024 // 1MB blocks
  ): Promise<ContentManifest> {
    const serialized = JSON.stringify(data);
    const blocks: string[] = [];

    // Split into blocks
    for (let i = 0; i < serialized.length; i += blockSize) {
      const blockData = serialized.slice(i, i + blockSize);
      const cid = await this.storeContent(blockData);
      blocks.push(cid);
    }

    // Create manifest
    const manifest: ContentManifest = {
      rootCid: await this.generateCID(JSON.stringify(blocks)),
      name,
      size: serialized.length * 2,
      blocks,
      metadata: {},
      version: 1
    };

    // Store manifest
    await this.storeContent(manifest, name, { type: 'manifest' });

    return manifest;
  }

  /**
   * Retrieve content from manifest
   */
  async retrieveFromManifest(manifestCid: string): Promise<any | null> {
    const manifest = await this.getContent(manifestCid);
    if (!manifest || manifest.metadata?.type !== 'manifest') return null;

    // Retrieve all blocks
    const blocks: string[] = [];
    for (const blockCid of manifest.blocks) {
      const blockData = await this.getContent(blockCid);
      if (blockData) {
        blocks.push(blockData);
      } else {
        console.error(`Failed to retrieve block ${blockCid}`);
        return null;
      }
    }

    // Reassemble content
    const serialized = blocks.join('');
    return JSON.parse(serialized);
  }

  // ─── Content Verification ────────────────────────────────────────────────────

  /**
   * Verify content integrity using CID
   */
  async verifyContent(cid: string, data: any): Promise<boolean> {
    const serialized = JSON.stringify(data);
    const computedCid = await this.generateCID(serialized);
    return computedCid === cid;
  }

  /**
   * Get content statistics
   */
  getContentStats(): {
    totalBlocks: number;
    totalSize: number;
    totalReferences: number;
    storageUsage: number;
    indexedContent: number;
  } {
    const blocks = Array.from(this.contentStore.values());
    const totalReferences = blocks.reduce((sum, block) => sum + block.references, 0);

    return {
      totalBlocks: blocks.length,
      totalSize: this.currentStorageSize,
      totalReferences,
      storageUsage: (this.currentStorageSize / this.maxStorageSize) * 100,
      indexedContent: this.contentIndex.size
    };
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  /**
   * Persist content store to localStorage
   */
  private persistContentStore(): void {
    try {
      const data = {
        contentStore: Array.from(this.contentStore.entries()),
        contentIndex: Array.from(this.contentIndex.entries()),
        blockCache: Array.from(this.blockCache.entries()).map(([cid, nodes]) => [cid, Array.from(nodes)]),
        storageSize: this.currentStorageSize
      };
      localStorage.setItem('mesh_content_store', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist content store:', error);
    }
  }

  /**
   * Load content store from localStorage
   */
  private loadContentStore(): void {
    try {
      const data = localStorage.getItem('mesh_content_store');
      if (data) {
        const parsed = JSON.parse(data);
        this.contentStore = new Map(parsed.contentStore || []);
        this.contentIndex = new Map(parsed.contentIndex || []);
        this.blockCache = new Map(
          (parsed.blockCache || []).map(([cid, nodes]: [string, string[]]) => [cid, new Set(nodes)])
        );
        this.currentStorageSize = parsed.storageSize || 0;
        console.log('Loaded content store from storage');
      }
    } catch (error) {
      console.error('Failed to load content store:', error);
    }
  }

  /**
   * Clear all content
   */
  clearContentStore(): void {
    this.contentStore.clear();
    this.contentIndex.clear();
    this.blockCache.clear();
    this.currentStorageSize = 0;
    this.persistContentStore();
    console.log('Cleared all content from store');
  }

  /**
   * Clean up expired content
   */
  cleanupExpiredContent(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [cid, block] of this.contentStore.entries()) {
      if (now - block.timestamp > block.ttl && block.references === 0) {
        this.contentStore.delete(cid);
        this.currentStorageSize -= block.size;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.persistContentStore();
      console.log(`Cleaned up ${cleaned} expired content blocks`);
    }

    return cleaned;
  }
}

// ─── Content Utilities ───────────────────────────────────────────────────────

/**
 * Calculate optimal block size based on content type and network conditions
 */
export function calculateOptimalBlockSize(
  contentType: string,
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor'
): number {
  const baseSizes = {
    text: 64 * 1024,      // 64KB for text
    image: 512 * 1024,    // 512KB for images
    video: 2 * 1024 * 1024, // 2MB for video
    data: 256 * 1024      // 256KB for general data
  };

  const qualityMultipliers = {
    excellent: 2,
    good: 1.5,
    fair: 1,
    poor: 0.5
  };

  const baseSize = baseSizes[contentType as keyof typeof baseSizes] || baseSizes.data;
  const multiplier = qualityMultipliers[networkQuality];

  return Math.floor(baseSize * multiplier);
}

/**
 * Estimate content replication factor based on importance
 */
export function calculateReplicationFactor(
  contentType: string,
  priority: 'emergency' | 'high' | 'normal' | 'low'
): number {
  if (priority === 'emergency') return 5; // Store on 5 nodes
  if (priority === 'high') return 3;
  if (contentType === 'critical') return 4;
  return 2; // Default replication
}
