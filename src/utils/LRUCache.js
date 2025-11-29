/**
 * LRUCache - Least Recently Used Cache
 *
 * Zero Dependency: Simple LRU cache implementation using Map and doubly-linked list
 *
 * Features:
 * - O(1) get, set, and delete operations
 * - Automatic eviction of least recently used items when capacity is reached
 * - Memory-bounded to prevent unbounded growth
 *
 * Use Cases:
 * - CSRF token storage with size limit
 * - Rate limiter bucket storage
 * - Any in-memory cache needing bounded size
 *
 * @module utils/LRUCache
 */

class LRUCache {
  /**
   * @param {Object} options
   * @param {number} options.maxSize - Maximum number of entries (default: 1000)
   * @param {number} options.ttl - Time to live in milliseconds (optional)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || null;

    // Use Map for O(1) lookup
    this.cache = new Map();

    // Track access order for LRU
    // head = most recently used, tail = least recently used
    this.head = null;
    this.tail = null;

    // Statistics
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get value by key
   *
   * @param {string} key
   * @returns {*} Value or undefined if not found
   */
  get(key) {
    const node = this.cache.get(key);

    if (!node) {
      this.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.ttl && Date.now() - node.timestamp > this.ttl) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to head (most recently used)
    this._moveToHead(node);

    this.hits++;
    return node.value;
  }

  /**
   * Set key-value pair
   *
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    let node = this.cache.get(key);

    if (node) {
      // Update existing node
      node.value = value;
      node.timestamp = Date.now();
      this._moveToHead(node);
    } else {
      // Create new node
      node = {
        key,
        value,
        timestamp: Date.now(),
        prev: null,
        next: null
      };

      this.cache.set(key, node);
      this._addToHead(node);

      // Evict if over capacity
      if (this.cache.size > this.maxSize) {
        this._evictTail();
      }
    }
  }

  /**
   * Check if key exists (without updating access time)
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const node = this.cache.get(key);

    if (!node) {
      return false;
    }

    // Check TTL expiration
    if (this.ttl && Date.now() - node.timestamp > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key
   *
   * @param {string} key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const node = this.cache.get(key);

    if (!node) {
      return false;
    }

    this._removeNode(node);
    this.cache.delete(key);

    return true;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get current size
   *
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Iterate over all entries (most to least recently used)
   *
   * @returns {Iterator}
   */
  *entries() {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  /**
   * Get all keys
   *
   * @returns {Array<string>}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   *
   * @returns {Array<*>}
   */
  values() {
    const values = [];
    for (const [, value] of this.entries()) {
      values.push(value);
    }
    return values;
  }

  /**
   * Clean up expired entries (based on TTL)
   *
   * @returns {number} Number of entries cleaned
   */
  cleanup() {
    if (!this.ttl) {
      return 0;
    }

    const now = Date.now();
    let cleaned = 0;
    let node = this.tail; // Start from least recently used

    while (node) {
      const prev = node.prev;

      if (now - node.timestamp > this.ttl) {
        this.delete(node.key);
        cleaned++;
      }

      node = prev;
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   *
   * @returns {Object}
   */
  getStats() {
    const hitRate = this.hits + this.misses > 0
      ? (this.hits / (this.hits + this.misses) * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      evictions: this.evictions
    };
  }

  /**
   * Move node to head (most recently used)
   *
   * @private
   */
  _moveToHead(node) {
    if (node === this.head) {
      return; // Already at head
    }

    // Remove from current position
    this._removeNode(node);

    // Add to head
    this._addToHead(node);
  }

  /**
   * Add node to head
   *
   * @private
   */
  _addToHead(node) {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove node from linked list
   *
   * @private
   */
  _removeNode(node) {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  /**
   * Evict least recently used item (tail)
   *
   * @private
   */
  _evictTail() {
    if (!this.tail) {
      return;
    }

    const key = this.tail.key;
    this.cache.delete(key);
    this._removeNode(this.tail);
    this.evictions++;
  }
}

module.exports = LRUCache;
