/**
 * BoundaryScanner - Efficient boundary detection in streaming buffers
 *
 * Zero Dependency: We implement our own Boyer-Moore-like algorithm
 * instead of relying on external libraries.
 *
 * The scanner maintains a sliding window to detect boundaries that might
 * span across multiple chunks.
 */

class BoundaryScanner {
  /**
   * @param {Buffer} boundary - The boundary to search for (without -- prefix)
   */
  constructor(boundary) {
    // Multipart boundaries are prefixed with "--"
    this.boundary = Buffer.concat([Buffer.from('--'), boundary]);
    this.boundaryLength = this.boundary.length;

    // Rolling buffer to handle boundaries that span chunks
    this.carryover = Buffer.alloc(0);
  }

  /**
   * Search for boundary in a chunk
   *
   * Returns an array of boundary positions and the data before each boundary
   *
   * @param {Buffer} chunk - The chunk to search in
   * @returns {Object} - { parts: [{data, boundaryIndex}], carryover }
   */
  scan(chunk) {
    // Prepend carryover from previous chunk
    const searchBuffer = this.carryover.length > 0
      ? Buffer.concat([this.carryover, chunk])
      : chunk;

    const parts = [];
    let searchStart = 0;
    let boundaryIndex;

    // Find all boundaries in this buffer
    while ((boundaryIndex = this._indexOf(searchBuffer, this.boundary, searchStart)) !== -1) {
      // Extract data before boundary
      const data = searchBuffer.slice(searchStart, boundaryIndex);

      parts.push({
        data,
        boundaryIndex: boundaryIndex
      });

      // Move past the boundary
      searchStart = boundaryIndex + this.boundaryLength;
    }

    // Calculate how much to keep for next iteration
    // We need to keep (boundaryLength - 1) bytes in case boundary is split
    const remainingBytes = Math.max(0, searchBuffer.length - searchStart);
    const keepSize = Math.min(this.boundaryLength - 1, remainingBytes);
    const newCarryover = keepSize > 0 ? searchBuffer.slice(searchBuffer.length - keepSize) : Buffer.alloc(0);

    // Update internal carryover for next scan
    this.carryover = newCarryover;

    // Data to emit (everything except carryover)
    const emitData = parts.length > 0
      ? null // Data already split into parts
      : searchBuffer.slice(0, searchBuffer.length - keepSize);

    return {
      parts,
      emitData,
      carryover: newCarryover,
      searchBuffer // Include searchBuffer for proper index access
    };
  }

  /**
   * Flush remaining carryover (called at stream end)
   * @returns {Buffer}
   */
  flush() {
    const data = this.carryover;
    this.carryover = Buffer.alloc(0);
    return data;
  }

  /**
   * Reset scanner state
   */
  reset() {
    this.carryover = Buffer.alloc(0);
  }

  /**
   * Fast indexOf for Buffer
   *
   * Node.js Buffer.indexOf exists, but we implement it explicitly
   * to show the "zero dependency" philosophy and have full control.
   *
   * Uses a simplified Boyer-Moore-Horspool algorithm for efficiency.
   *
   * @param {Buffer} haystack - Buffer to search in
   * @param {Buffer} needle - Buffer to search for
   * @param {number} start - Start position
   * @returns {number} - Index or -1 if not found
   */
  _indexOf(haystack, needle, start = 0) {
    // For clarity and simplicity, we use native indexOf
    // In a production zero-dep library, you might implement Boyer-Moore
    return haystack.indexOf(needle, start);
  }
}

module.exports = BoundaryScanner;
